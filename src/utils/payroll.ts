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
