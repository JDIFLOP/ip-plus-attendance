/**
 * Centralized domain types for the Pool Villa payroll/attendance database.
 *
 * These mirror the Supabase/PostgreSQL schema in `supabase/schema.sql` and
 * replace the loose `any` / `Record<string, any>` usages in the Server Actions.
 * The Supabase client is untyped (no generated Database type), so query results
 * still arrive as `any` at the boundary — we narrow them to these types inside
 * the actions to get safety in the business logic.
 */

/** JSON-serializable value (used for JSONB columns such as audit old/new values). */
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type UserRole = 'Admin' | 'Manager' | 'HR' | 'Staff';
export type WageType = 'Monthly' | 'Hourly' | 'Daily';
export type Nationality = 'Thai' | 'Myanmar' | 'Other';
export type OtStatus = 'None' | 'Pending OT' | 'Approved' | 'Denied';

/** A row of the `profiles` table. */
export interface Profile {
  id: string;
  full_name: string;
  department: string | null;
  wage_type: WageType;
  rate: number;
  nationality: Nationality;
  role: UserRole;
  username: string | null;
  password: string | null;
  device_id: string | null;
  birthday: string | null;
  substitute_leave_quota: number;
  social_security_enabled: boolean;
  sso_type: string;
  sso_value: number;
  guarantee_target: number;
  guarantee_monthly: number;
  guarantee_accumulated: number;
  guarantee_status: string;
  created_at: string;
}

/**
 * Shape accepted by `upsertStaff` (and used for the write payload). All fields
 * are optional because the form sends partial updates; enum-like columns are
 * kept as `string` to match the loosely-typed client form state.
 */
export interface StaffInput {
  id?: string;
  full_name?: string;
  nationality?: string;
  role?: string;
  department?: string;
  wage_type?: string;
  rate?: number;
  username?: string | null;
  password?: string | null;
  device_id?: string | null;
  birthday?: string | null;
  substitute_leave_quota?: number;
  social_security_enabled?: boolean;
  sso_type?: string;
  sso_value?: number;
  guarantee_target?: number;
  guarantee_monthly?: number;
  guarantee_accumulated?: number;
  guarantee_status?: string;
}

// ---- System settings (each is one JSONB row in the `settings` table) --------

export interface VillaLocation { lat: number; lng: number; radius_m: number; }
export interface OtConfig { threshold_mins: number; }
export interface PayrollConfig { start_day: number; end_day: number; break_duration_mins: number; }
export interface WifiConfig { allowed_ip: string; ssid_hint: string; }
export interface PayrollRules {
  late_grace_mins: number;
  late_deduct_per_min: number;
  ot_rate_per_hour: number;
  sso_rate: number;
  sso_cap: number;
}
export interface Department { name: string; max_headcount: number; budget_limit: number; }

export interface SystemSettings {
  villa_location: VillaLocation;
  ot_config: OtConfig;
  payroll_config: PayrollConfig;
  wifi_config: WifiConfig;
  payroll_rules: PayrollRules;
  departments_config: Department[];
}

/** Row inserted into `audit_logs`. */
export interface AuditLogPayload {
  user_id: string | null;
  performed_by: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
}

/** Cell sent by the schedule grid to `batchUpsertSchedules`. */
export interface ScheduleInput {
  staff_id: string;
  date: string;
  shift_start: string;
  shift_end: string;
  is_off_day: boolean;
  no_break: boolean;
}

/** Input to `upsertPublicHoliday`. */
export interface HolidayInput {
  id?: string;
  date: string;
  name: string;
}

/** Input to `issueWarningLetter`. */
export interface WarningLetterInput {
  staff_id?: string;
  reason: string;
  severity_level?: string;
  date?: string;
}

/** A row of the `payroll_adjustments` table. */
export interface PayrollAdjustment {
  id: string;
  staff_id: string;
  cycle_start_date: string;
  type: string;
  amount: number;
  reason: string | null;
  created_at: string;
}

/** A row of the `attendance` table. */
export interface AttendanceRecord {
  id: string;
  staff_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  lat: number | null;
  lng: number | null;
  ot_status: OtStatus;
  approved_ot_mins: number;
  is_leave: boolean;
  leave_type?: string | null;
  leave_reason: string | null;
  is_paid_leave?: boolean | null;
  holiday_status: string;
  holiday_multiplier: number;
  holiday_amount: number;
  /** Manager override: when true, dynamic-shift lateness penalty is waived. */
  is_excused?: boolean;
}

/** Per-staff aggregate built by `getMonthlySummary`. */
export interface StaffPayrollSummary {
  id: string;
  name: string;
  role: UserRole;
  department: string;
  wageType: WageType;
  rate: number;
  lateMins: number;
  earlyMins: number;
  otApproved: number;
  leaveDays: number;
  workedDays: number;
  totalHoursWorked: number;
  calculatedPay: number;
  grossPay: number;
  ssoDeduction: number;
  guaranteeDeduction: number;
  otherDeductions: number;
  netPay: number;
  social_security_enabled: boolean;
  sso_type: string;
  sso_value: number;
  guarantee_target: number;
  guarantee_monthly: number;
  guarantee_accumulated: number;
  guarantee_status: string;
  adjustments: PayrollAdjustment[];
  logs: AttendanceRecord[];
  unpaidLeaveDays: number;
}
