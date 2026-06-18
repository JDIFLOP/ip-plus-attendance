"use server";

import { createClient } from '@/utils/supabase/server';
import { getBangkokToday } from '@/utils/payroll';
import { getSession } from './auth';
import { MANAGEMENT_ROLES } from '@/utils/auth/requireRole';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Shape of a Supabase/PostgREST error. We log every field because the cause of a
 * rejected check-in is usually only visible in `code`/`details`/`hint` (e.g.
 * `42501` = RLS rejection, `42703`/`PGRST204` = column missing on the live DB).
 */
interface SupabaseLikeError {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
}

/**
 * Log a database error with full context to the server console (Vercel logs),
 * instead of swallowing it into a generic client string. Returns a short,
 * non-production-only suffix so the operator can also see the code while
 * manually testing — production responses stay clean/translatable.
 */
function logDbError(stage: string, error: SupabaseLikeError | null): string {
  if (!error) return '';
  console.error(
    `[attendance] ${stage} failed → ` +
      JSON.stringify({
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      }),
  );
  return process.env.NODE_ENV === 'production' ? '' : ` [${error.code || 'db'}: ${error.message || 'unknown'}]`;
}

interface Geofence {
  lat: number;
  lng: number;
  radius: number;
}

/**
 * Parse the `villa_location` settings JSONB into a numeric geofence.
 *
 * Coerces with `Number(...)` so values stored as strings (a common admin-form
 * round-trip) still work, and returns `null` for empty / missing / malformed
 * configs. Crucially this prevents the previous silent-bypass bug: bad coords
 * used to make the haversine distance `NaN`, and `NaN > radius` is `false`, so
 * the geofence was skipped entirely instead of failing safe.
 */
function parseVillaLocation(value: unknown): Geofence | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const lat = Number(v.lat);
  const lng = Number(v.lng);
  const radius = Number(v.radius_m);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) {
    return null;
  }
  return { lat, lng, radius };
}

/**
 * Clock-in / clock-out.
 *
 * Identity & checks depend on the actor (AGENTS.md: Admin = Manager, HR is a
 * management role here for attendance purposes):
 *  - Management (Admin / Manager / HR): identified by their authenticated,
 *    HMAC-verified session. They may clock in/out from ANY device and ANY
 *    location — the GPS geofence and device-binding checks are intentionally
 *    bypassed. (Trade-off: management attendance carries no location/device
 *    proof. This is a deliberate, owner-approved relaxation.)
 *  - Staff: no login. Identified strictly by their bound `device_id`, and the
 *    GPS geofence is enforced.
 *
 * All DB access uses the service-role server client (BYPASSRLS). Each query's
 * error is logged explicitly so a rejected mutation is never reduced to an
 * opaque "Error processing check-in" with no server-side trace.
 */
export async function processAttendance(deviceId: string, lat: number, lng: number) {
  try {
    const supabase = await createClient();

    const session = await getSession();
    const isManagement = !!session?.role && (MANAGEMENT_ROLES as readonly string[]).includes(session.role);

    let staffId: string;
    let fullName: string;

    if (isManagement) {
      // Bypass GPS + device checks entirely; identify by the verified session.
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', session!.id)
        .single();

      if (error || !profile) {
        const detail = logDbError('management profile lookup', error);
        return { error: `Profile not found for this account.${detail}` };
      }
      staffId = profile.id;
      fullName = profile.full_name;
    } else {
      // Staff path: enforce the GPS geofence first.
      const { data: settingsData, error: settingsError } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'villa_location')
        .single();

      if (settingsError || !settingsData) {
        const detail = logDbError('villa_location load', settingsError);
        return { error: `Failed to load location settings${detail}` };
      }

      const geo = parseVillaLocation(settingsData.value);
      if (!geo) {
        // Misconfigured geofence: fail SAFE (block) with a clear message rather
        // than silently allowing check-ins from anywhere.
        console.error(
          '[attendance] villa_location is empty or malformed:',
          JSON.stringify(settingsData.value),
        );
        return { error: 'Location settings are not configured. Please contact admin.' };
      }

      const distance = haversineDistance(lat, lng, geo.lat, geo.lng);
      if (!Number.isFinite(distance)) {
        console.error('[attendance] invalid device coordinates:', JSON.stringify({ lat, lng, geo }));
        return { error: 'Invalid location coordinates. Please retry.' };
      }
      if (distance > geo.radius) {
        return { error: `distanceError: You are ${Math.round(distance)}m away (max ${geo.radius}m).` };
      }

      // Identify the staff member strictly by their bound device.
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (profileError || !profile) {
        const detail = logDbError('device profile lookup', profileError);
        return { error: `Device not registered. Please contact HR.${detail}` };
      }
      staffId = profile.id;
      fullName = profile.full_name;
    }

    const thDateString = getBangkokToday();

    const { data: todayRecord, error: todayError } = await supabase
      .from('attendance')
      .select('id, check_in, check_out')
      .eq('staff_id', staffId)
      .eq('date', thDateString)
      .maybeSingle();

    if (todayError) {
      const detail = logDbError('today attendance lookup', todayError);
      return { error: `Error processing check-in.${detail}` };
    }

    if (todayRecord) {
      if (todayRecord.check_out) {
        return { error: 'You are already checked out for today.' };
      }

      const checkInTime = new Date(todayRecord.check_in).getTime();
      if (Date.now() - checkInTime < 10 * 60 * 1000) {
        return { error: 'cooldownError: Please wait 10 minutes before checking out.' };
      }

      const { error: updateError } = await supabase
        .from('attendance')
        .update({ check_out: new Date().toISOString() })
        .eq('id', todayRecord.id);

      if (updateError) {
        const detail = logDbError('check-out update', updateError);
        return { error: `Error processing check-out.${detail}` };
      }
      return { success: true, type: 'check_out', name: fullName };
    }

    // First action of the day -> check-in. Flag public holidays for review.
    const { data: holiday, error: holidayError } = await supabase
      .from('public_holidays')
      .select('name')
      .eq('date', thDateString)
      .maybeSingle();

    // A holiday-lookup failure shouldn't block the check-in; just log and treat
    // today as a normal day.
    if (holidayError) logDbError('public_holiday lookup', holidayError);

    const { error: insertError } = await supabase
      .from('attendance')
      .insert({
        staff_id: staffId,
        date: thDateString,
        check_in: new Date().toISOString(),
        lat,
        lng,
        holiday_status: holiday ? 'Pending' : 'None',
      });

    if (insertError) {
      const detail = logDbError('check-in insert', insertError);
      return { error: `Error processing check-in.${detail}` };
    }
    return { success: true, type: 'check_in', name: fullName, isHoliday: !!holiday };
  } catch (e) {
    // Catch anything unexpected (e.g. a thrown env/config error from createClient)
    // so the client always receives a clean { error } instead of a hung request.
    console.error(
      '[attendance] processAttendance threw:',
      e instanceof Error ? `${e.message}\n${e.stack}` : JSON.stringify(e),
    );
    const detail =
      process.env.NODE_ENV === 'production' || !(e instanceof Error) ? '' : ` [${e.message}]`;
    return { error: `Error processing check-in.${detail}` };
  }
}

export async function checkDeviceStatus(deviceId: string) {
  try {
    const supabase = await createClient();

    const session = await getSession();
    const isManagement = !!session?.role && (MANAGEMENT_ROLES as readonly string[]).includes(session.role);

    let staffId: string;

    if (isManagement) {
      // Management isn't device-bound — resolve identity from the session.
      staffId = session!.id;
    } else {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('device_id', deviceId)
        .maybeSingle();

      if (profileError) logDbError('device status lookup', profileError);
      if (!profile) return { status: 'unregistered' };
      staffId = profile.id;
    }

    const thDateString = getBangkokToday();

    const { data: record, error: recordError } = await supabase
      .from('attendance')
      .select('check_in, check_out')
      .eq('staff_id', staffId)
      .eq('date', thDateString)
      .maybeSingle();

    if (recordError) logDbError('device status attendance lookup', recordError);

    if (!record) return { status: 'pending_in' };
    if (!record.check_out) return { status: 'pending_out' };
    return { status: 'completed' };
  } catch (e) {
    console.error(
      '[attendance] checkDeviceStatus threw:',
      e instanceof Error ? `${e.message}\n${e.stack}` : JSON.stringify(e),
    );
    // Fail to a safe default so the UI can still render a check-in button.
    return { status: 'pending_in' };
  }
}
