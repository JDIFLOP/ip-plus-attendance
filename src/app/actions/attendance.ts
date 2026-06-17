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
 */
export async function processAttendance(deviceId: string, lat: number, lng: number) {
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
      return { error: 'Profile not found for this account.' };
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
      return { error: 'Failed to load location settings' };
    }

    const { lat: villaLat, lng: villaLng, radius_m: radius } = settingsData.value;
    const distance = haversineDistance(lat, lng, villaLat, villaLng);
    if (distance > radius) {
      return { error: `distanceError: You are ${Math.round(distance)}m away (max ${radius}m).` };
    }

    // Identify the staff member strictly by their bound device.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('device_id', deviceId)
      .single();

    if (profileError || !profile) {
      return { error: 'Device not registered. Please contact HR.' };
    }
    staffId = profile.id;
    fullName = profile.full_name;
  }

  const thDateString = getBangkokToday();

  const { data: todayRecord } = await supabase
    .from('attendance')
    .select('id, check_in, check_out')
    .eq('staff_id', staffId)
    .eq('date', thDateString)
    .maybeSingle();

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

    if (updateError) return { error: 'Error processing check-out.' };
    return { success: true, type: 'check_out', name: fullName };
  }

  // First action of the day -> check-in. Flag public holidays for review.
  const { data: holiday } = await supabase
    .from('public_holidays')
    .select('name')
    .eq('date', thDateString)
    .maybeSingle();

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

  if (insertError) return { error: 'Error processing check-in.' };
  return { success: true, type: 'check_in', name: fullName, isHoliday: !!holiday };
}

export async function checkDeviceStatus(deviceId: string) {
  const supabase = await createClient();

  const session = await getSession();
  const isManagement = !!session?.role && (MANAGEMENT_ROLES as readonly string[]).includes(session.role);

  let staffId: string;

  if (isManagement) {
    // Management isn't device-bound — resolve identity from the session.
    staffId = session!.id;
  } else {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('device_id', deviceId)
      .maybeSingle();

    if (!profile) return { status: 'unregistered' };
    staffId = profile.id;
  }

  const thDateString = getBangkokToday();

  const { data: record } = await supabase
    .from('attendance')
    .select('check_in, check_out')
    .eq('staff_id', staffId)
    .eq('date', thDateString)
    .maybeSingle();

  if (!record) return { status: 'pending_in' };
  if (!record.check_out) return { status: 'pending_out' };
  return { status: 'completed' };
}
