"use server";

/**
 * Payroll / attendance-review server actions for the dynamic pool-villa shift
 * model. The heavy monthly aggregation lives in `getMonthlySummary`
 * (actions/admin.ts); this file hosts the daily late-review and the manager
 * "excused lateness" override that feeds into it.
 *
 * Lateness is computed deterministically from the check-in via
 * `computeLateness` (utils/payroll.ts) — there is no persisted late flag to go
 * stale when the grace-period setting changes. Only the manager override
 * (`is_excused`) is stored.
 */

import { createClient } from '@/utils/supabase/server';
import { requireRole } from '@/utils/auth/requireRole';
import { computeLateness } from '@/utils/payroll';
import { logAudit } from './admin';

const BANGKOK_TZ = 'Asia/Bangkok';

export interface DailyAttendanceReviewRow {
  id: string;
  staffId: string;
  staffName: string;
  department: string;
  checkIn: string | null;
  checkOut: string | null;
  isLeave: boolean;
  isExcused: boolean;
  /** "HH:mm" Bangkok wall-clock target, or "--:--" when there's no check-in. */
  targetStart: string;
  lateMins: number;
  isLate: boolean;
}

type JoinedProfile = { full_name?: string; role?: string; department?: string } | null;

function normalizeProfile(p: unknown): JoinedProfile {
  if (Array.isArray(p)) return (p[0] as JoinedProfile) ?? null;
  return (p as JoinedProfile) ?? null;
}

/**
 * Daily attendance for one date, annotated with dynamic-shift lateness, for the
 * Admin "Late Review" screen. Viewing is allowed for all management roles
 * (Admin / Manager / HR); only the override mutation is restricted.
 */
export async function getDailyAttendanceReview(dateStr: string) {
  const auth = await requireRole(['Admin', 'Manager', 'HR']);
  if (!auth.authorized) return { error: auth.error };

  const supabase = await createClient();

  const [{ data: rulesRow }, { data: records, error }, { data: schedules }] = await Promise.all([
    supabase.from('settings').select('value').eq('key', 'payroll_rules').maybeSingle(),
    supabase
      .from('attendance')
      .select('id, staff_id, date, check_in, check_out, is_leave, is_excused, profiles(full_name, role, department)')
      .eq('date', dateStr)
      .order('check_in', { ascending: true }),
    supabase.from('schedules').select('staff_id, shift_start').eq('date', dateStr),
  ]);

  if (error) return { error: error.message };

  const graceMins = Number(rulesRow?.value?.late_grace_mins ?? 0);

  const schedMap = new Map<string, string>();
  (schedules || []).forEach((s: { staff_id: string; shift_start: string | null }) => {
    if (s.shift_start) schedMap.set(s.staff_id, s.shift_start);
  });

  const rows: DailyAttendanceReviewRow[] = (records || [])
    .map((r) => ({ r, prof: normalizeProfile(r.profiles) }))
    // Only standard staff appear on the work-schedule / late-review views.
    .filter(({ prof }) => prof?.role === 'Staff')
    .map(({ r, prof }) => {
      let targetStart = '--:--';
      let lateMins = 0;
      let isLate = false;

      if (r.check_in && !r.is_leave) {
        const res = computeLateness(new Date(r.check_in), r.date, {
          scheduledStart: schedMap.get(r.staff_id),
          graceMins,
        });
        targetStart = res.targetStart.toLocaleTimeString('en-GB', {
          timeZone: BANGKOK_TZ,
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        });
        lateMins = res.lateMins;
        isLate = res.isLate;
      }

      return {
        id: r.id,
        staffId: r.staff_id,
        staffName: prof?.full_name || '—',
        department: prof?.department || 'General',
        checkIn: r.check_in,
        checkOut: r.check_out,
        isLeave: !!r.is_leave,
        isExcused: !!r.is_excused,
        targetStart,
        lateMins,
        isLate,
      };
    });

  return { data: rows };
}

/**
 * Manager override: mark (or un-mark) a late check-in as excused. Excused
 * lateness has its penalty waived in `getMonthlySummary`. Restricted to
 * Admin / Manager — HR is blocked from this approval-style action (AGENTS.md §3).
 */
export async function setAttendanceExcused(attendanceId: string, isExcused: boolean) {
  const auth = await requireRole(['Admin', 'Manager']);
  if (!auth.authorized) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from('attendance')
    .update({ is_excused: isExcused })
    .eq('id', attendanceId);

  if (error) return { error: error.message };

  await logAudit(
    isExcused ? 'EXCUSE_LATE' : 'UNEXCUSE_LATE',
    null,
    'attendance',
    attendanceId,
    null,
    { is_excused: isExcused },
  );
  return { success: true };
}
