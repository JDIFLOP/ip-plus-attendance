/**
 * Centralized payroll helpers.
 *
 * Daily wages and unpaid-leave deductions must NEVER use a hard-coded `/ 30`
 * divisor — a 28-day February and a 31-day December would both be wrong. We
 * always divide the monthly base by the ACTUAL number of days in the relevant
 * month. See AGENTS.md §3 (Payroll & Calculations Logic).
 */

/**
 * Number of days in a month.
 * @param year full year, e.g. 2026
 * @param month 1–12 (January = 1). Passing the 1-based month as JS's 0-based
 *   monthIndex with day `0` resolves to the last day of `month`, whose date is
 *   exactly the month's day count.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Number of days in the month of a `YYYY-MM-DD` date string.
 *
 * The string is parsed by splitting, never via `new Date(str)` — that would be
 * interpreted as UTC midnight and could roll back a day on a UTC+7
 * (Asia/Bangkok) server, landing us in the wrong month at month boundaries.
 */
export function getDaysInMonthFromDateStr(dateStr: string): number {
  const [year, month] = dateStr.split('-').map(Number);
  return getDaysInMonth(year, month);
}

/**
 * Convert a monthly base rate to a daily rate using the actual number of days
 * in the month that `dateStr` falls in.
 */
export function getDailyRate(monthlyRate: number, dateStr: string): number {
  const days = getDaysInMonthFromDateStr(dateStr);
  return days > 0 ? monthlyRate / days : 0;
}

const BANGKOK_TZ = 'Asia/Bangkok';
/** Fixed UTC+7 offset for Asia/Bangkok (no DST), used to anchor wall-clock times. */
const BANGKOK_OFFSET = '+07:00';

/**
 * Today's date in Asia/Bangkok as `YYYY-MM-DD`, independent of the host server's
 * timezone (Vercel runs in UTC). Use this instead of `new Date().toISOString()`
 * or manual `+ 7h` offset math.
 */
export function getBangkokToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BANGKOK_TZ });
}

/**
 * Build an absolute `Date` from a Bangkok wall-clock `YYYY-MM-DD` + `HH:mm[:ss]`
 * pair. The `+07:00` offset is explicit, so the result is correct regardless of
 * the host server's timezone (prevents off-by-7h payroll/attendance bugs on
 * UTC cloud hosts). Returns an invalid Date for malformed input.
 */
export function bangkokDateTime(dateStr: string, timeStr: string): Date {
  const time = /^\d{2}:\d{2}$/.test(timeStr) ? `${timeStr}:00` : timeStr;
  return new Date(`${dateStr}T${time}${BANGKOK_OFFSET}`);
}

/**
 * Infer a dynamic "target start" by rounding a check-in to the NEAREST hour.
 *
 * Pool-villa shifts are highly variable (6/7 AM, 2 PM, …) and frequently have no
 * pre-scheduled target, so we snap the actual check-in to the closest logical
 * hour: 07:45 → 08:00, 08:10 → 08:00, 06:50 → 07:00, 14:35 → 15:00.
 *
 * The hour/minute are read in Asia/Bangkok (not the host TZ) so a cloud server
 * running in UTC infers the same target a Thailand user expects. The result is
 * anchored to Bangkok midnight + whole hours, so a 23:30+ check-in that rounds
 * to 24:00 rolls correctly into the next day. Returns an absolute Date.
 */
export function inferTargetStart(checkIn: Date, dateStr: string): Date {
  const hhmm = checkIn.toLocaleTimeString('en-GB', {
    timeZone: BANGKOK_TZ,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }); // e.g. "07:45"
  const [h, m] = hhmm.split(':').map(Number);
  const targetHour = m >= 30 ? h + 1 : h; // nearest hour (may be 24 → next midnight)
  const midnight = bangkokDateTime(dateStr, '00:00');
  return new Date(midnight.getTime() + targetHour * 3600 * 1000);
}

export interface Lateness {
  /** Absolute target start used for the comparison. */
  targetStart: Date;
  /** Whole minutes after target (0 when early or on-time — early snaps to target). */
  lateMins: number;
  /** True only when the minutes late strictly exceed the grace period. */
  isLate: boolean;
}

/**
 * Determine lateness for a check-in against a dynamic shift target.
 *
 * Target precedence: an explicit scheduled start (`HH:mm[:ss]`) wins; otherwise
 * the nearest-hour target is inferred from the check-in. Early check-ins snap to
 * the target (`lateMins` = 0). `isLate` is true only when the minutes late
 * exceed `graceMins` (defaults to 0).
 */
export function computeLateness(
  checkIn: Date,
  dateStr: string,
  opts: { scheduledStart?: string | null; graceMins?: number },
): Lateness {
  const targetStart =
    opts.scheduledStart && opts.scheduledStart.trim()
      ? bangkokDateTime(dateStr, opts.scheduledStart)
      : inferTargetStart(checkIn, dateStr);

  const rawMins = (checkIn.getTime() - targetStart.getTime()) / 60000;
  const lateMins = rawMins > 0 ? Math.floor(rawMins) : 0; // early check-ins snap to 0
  const grace = Math.max(0, opts.graceMins ?? 0);
  return { targetStart, lateMins, isLate: lateMins > grace };
}
