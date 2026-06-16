"use server";

import { createClient } from '@/utils/supabase/server';
import { getSession } from './auth';
import { requireRole } from '@/utils/auth/requireRole';
import { getDaysInMonthFromDateStr, getDailyRate } from '@/utils/payroll';
import type {
  AuditLogPayload,
  Profile,
  StaffInput,
  SystemSettings,
  ScheduleInput,
  HolidayInput,
  WarningLetterInput,
  StaffPayrollSummary,
} from '@/types/db';

export async function logAudit(action: string, adminId: string | null = null, tableName: string | null = null, recordId: string | null = null, oldValue: unknown = null, newValue: unknown = null, reason: string | null = null) {
  const supabase = await createClient();
  const session = await getSession();
  const performedBy = session ? session.name : (adminId || 'System');

  const entry: AuditLogPayload = {
    user_id: adminId,
    performed_by: performedBy,
    action,
    table_name: tableName,
    record_id: recordId,
    old_value: oldValue,
    new_value: newValue,
    reason,
  };

  await supabase.from('audit_logs').insert(entry);
}

export async function getStaffList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { data };
}

export async function getStaffOnlyList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'Staff')
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { data };
}

export async function getAdminUsers() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('role', ['Admin', 'Manager', 'HR'])
    .order('created_at', { ascending: false });

  if (error) return { error: error.message };
  return { data };
}

export async function upsertStaff(staff: StaffInput) {
  const auth = await requireRole(['Admin', 'Manager']);
  if (!auth.authorized) return { error: auth.error };

  const supabase = await createClient();
  const payload: StaffInput = {
    id: staff.id, 
    full_name: staff.full_name, 
    nationality: staff.nationality || 'Thai', 
    role: staff.role || 'Staff',
    department: staff.department || 'General',
    wage_type: staff.wage_type || 'Monthly',
    rate: staff.rate || 0,
    username: staff.username || null,
    password: staff.password || null,
    device_id: staff.device_id || null,
    birthday: staff.birthday || null,
    substitute_leave_quota: staff.substitute_leave_quota || 0,
    social_security_enabled: staff.social_security_enabled || false,
    guarantee_target: staff.guarantee_target || 0,
    guarantee_monthly: staff.guarantee_monthly || 0,
    guarantee_accumulated: staff.guarantee_accumulated || 0,
    guarantee_status: staff.guarantee_status || 'Deduct Monthly'
  };

  if (!staff.id) delete payload.id;
  if (!payload.device_id) delete payload.device_id;
  if (!payload.password) delete payload.password;
  if (!payload.username) delete payload.username; // prevent empty strings from hitting UNIQUE constraint

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload)
    .select()
    .single();

  if (error) return { error: error.message };
  await logAudit(staff.id ? 'UPDATE_STAFF' : 'ADD_STAFF', null, 'profiles', data.id, null, data);
  return { data };
}

export async function deleteStaff(id: string) {
  const auth = await requireRole(['Admin', 'Manager']);
  if (!auth.authorized) return { error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase.from('profiles').delete().eq('id', id);

  if (error) return { error: error.message };
  await logAudit('DELETE_STAFF', null, 'profiles', id);
  return { success: true };
}

export async function resetDeviceBinding(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ device_id: null }).eq('id', id);

  if (error) return { error: error.message };
  await logAudit('RESET_BINDING', null, 'profiles', id, {device_id: 'bound'}, {device_id: null});
  return { success: true };
}

export async function getSystemSettings() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('settings').select('*');

  if (error) return { error: error.message };
  
  const settingsObj: Partial<SystemSettings> = {};
  data.forEach((s) => {
    // Each row stores its typed value as JSONB under a known settings key.
    (settingsObj as Record<string, unknown>)[s.key] = s.value;
  });
  return { data: settingsObj };
}

export async function updateSystemSettings(settings: Partial<SystemSettings>) {
  const auth = await requireRole(['Admin', 'Manager']);
  if (!auth.authorized) return { error: auth.error };

  const supabase = await createClient();

  if (settings.villa_location) {
    await supabase.from('settings').upsert({ key: 'villa_location', value: settings.villa_location });
    await logAudit('UPDATE_SETTINGS_LOCATION', null, 'settings', 'villa_location', null, settings.villa_location);
  }
  if (settings.ot_config) {
    await supabase.from('settings').upsert({ key: 'ot_config', value: settings.ot_config });
    await logAudit('UPDATE_SETTINGS_OT', null, 'settings', 'ot_config', null, settings.ot_config);
  }
  if (settings.payroll_config) {
    await supabase.from('settings').upsert({ key: 'payroll_config', value: settings.payroll_config });
    await logAudit('UPDATE_SETTINGS_PAYROLL', null, 'settings', 'payroll_config', null, settings.payroll_config);
  }

  if (settings.wifi_config !== undefined) {
    await supabase.from('settings').upsert({ key: 'wifi_config', value: settings.wifi_config });
    await logAudit('UPDATE_SETTINGS_WIFI', null, 'settings', 'wifi_config', null, settings.wifi_config);
  }

  if (settings.payroll_rules !== undefined) {
    await supabase.from('settings').upsert({ key: 'payroll_rules', value: settings.payroll_rules });
    await logAudit('UPDATE_SETTINGS_PAYROLL_RULES', null, 'settings', 'payroll_rules', null, settings.payroll_rules);
  }

  if (settings.departments_config !== undefined) {
    await supabase.from('settings').upsert({ key: 'departments_config', value: settings.departments_config });
    await logAudit('UPDATE_SETTINGS_DEPARTMENTS', null, 'settings', 'departments_config', null, settings.departments_config);
  }

  return { success: true };
}

export async function reassignDepartment(oldDept: string, newDept: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ department: newDept })
    .eq('department', oldDept);

  if (error) return { error: error.message };
  await logAudit('REASSIGN_DEPARTMENT', null, 'profiles', null, { oldDept }, { newDept });
  return { success: true };
}

export async function getNetworkConfig() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'wifi_config')
    .single();
  if (error || !data) return { allowed_ip: '', ssid_hint: 'IP PLUS WiFi' };
  return data.value as { allowed_ip: string; ssid_hint: string };
}

export async function batchUpsertSchedules(schedulesArray: ScheduleInput[]) {

  const supabase = await createClient();
  if (schedulesArray.length === 0) return { success: true };
  
  const { error } = await supabase.from('schedules').upsert(schedulesArray, { onConflict: 'staff_id, date' });
  if (error) return { error: error.message };
  
  await logAudit('BATCH_UPSERT_SCHEDULES', null, 'schedules', null, null, null, `Painted ${schedulesArray.length} schedule cells`);
  return { success: true };
}

export async function fetchMonthSchedules(startDateStr: string, endDateStr: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('schedules')
    .select('*')
    .gte('date', startDateStr)
    .lte('date', endDateStr)
    .limit(5000);
  
  if (error) return { error: error.message };
  return { data };
}

export async function getAuditLogs() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) return { error: error.message };
  return { data };
}

export async function getStaffShift(staffId: string, date: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('schedules').select('shift_end').eq('staff_id', staffId).eq('date', date).single();
  return { shift_end: data?.shift_end || '17:00' };
}

export async function insertManualAttendance(staffId: string, date: string, checkIn: string | null, checkOut: string | null, reason: string) {
  const supabase = await createClient();
  const isoIn = checkIn ? new Date(`${date}T${checkIn}`).toISOString() : null;
  const isoOut = checkOut ? new Date(`${date}T${checkOut}`).toISOString() : null;

  let otStatus = 'None';
  
  if (checkOut) {
    const { data: schedule } = await supabase.from('schedules').select('shift_end').eq('staff_id', staffId).eq('date', date).single();
    const shiftEndStr = schedule?.shift_end || '17:00';
    
    // Convert to Date objects on the same day for safe comparison
    const outDate = new Date(`${date}T${checkOut}`);
    const shiftEndDate = new Date(`${date}T${shiftEndStr}`);
    
    const diffMins = (outDate.getTime() - shiftEndDate.getTime()) / 60000;
    
    const { data: settingsData } = await supabase.from('settings').select('value').eq('key', 'ot_config').single();
    const threshold = settingsData?.value?.threshold_mins || 15;

    if (diffMins >= threshold) {
      otStatus = 'Pending OT';
    }
  }

  const { data, error } = await supabase.from('attendance').upsert({
    staff_id: staffId, date: date, check_in: isoIn, check_out: isoOut, is_leave: false, ot_status: otStatus
  }, {onConflict: 'staff_id, date'}).select().single();

  if (error) return { error: error.message };
  await logAudit('MANUAL_ATTENDANCE', null, 'attendance', data.id, null, data, reason);
  return { success: true };
}

export async function insertLeave(staffId: string, date: string, type: string, reason: string, isPaid: boolean) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('attendance').upsert({
    staff_id: staffId, 
    date: date, 
    is_leave: true, 
    leave_type: type,
    leave_reason: reason,
    is_paid_leave: isPaid
  }, {onConflict: 'staff_id, date'}).select().single();

  if (error) return { error: error.message };
  await logAudit('BOOK_LEAVE', null, 'attendance', data.id, null, data, `${type}: ${reason} (Paid: ${isPaid})`);
  return { success: true };
}

export async function approveOT(recordId: string, mins: number) {
  const auth = await requireRole(['Admin', 'Manager']);
  if (!auth.authorized) return { error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase.from('attendance').update({
    ot_status: 'Approved', approved_ot_mins: mins
  }).eq('id', recordId).select().single();

  if (error) return { error: error.message };
  await logAudit('APPROVE_OT', null, 'attendance', data.id, null, data, `Approved ${mins} mins`);
  return { success: true };
}

export async function rejectOT(recordId: string) {
  const auth = await requireRole(['Admin', 'Manager']);
  if (!auth.authorized) return { error: auth.error };

  const supabase = await createClient();
  const { data, error } = await supabase.from('attendance').update({
    ot_status: 'Denied', approved_ot_mins: 0
  }).eq('id', recordId).select().single();

  if (error) return { error: error.message };
  await logAudit('REJECT_OT', null, 'attendance', data.id, null, data, `Denied OT`);
  return { success: true };
}

export async function getPendingDailyOT() {
  const supabase = await createClient();
  
  const { data: settingsData } = await supabase.from('settings').select('value').eq('key', 'ot_config').single();
  const threshold = settingsData?.value?.threshold_mins || 15;

  const { data: attendanceData } = await supabase
    .from('attendance')
    .select('*, profiles(full_name, role, rate, department)')
    .in('ot_status', ['None', 'Pending OT'])
    .not('check_out', 'is', null)
    .order('date', { ascending: false })
    .limit(1000);

  if (!attendanceData) return { data: [] };

  const { data: scheduleData } = await supabase.from('schedules').select('*').limit(5000);

  const pendingOTs = attendanceData.map(att => {
    let shiftEndStr = '17:00:00'; // Default
    if (scheduleData) {
      const sched = scheduleData.find(s => s.staff_id === att.staff_id && s.date === att.date);
      if (sched && sched.shift_end) {
        shiftEndStr = sched.shift_end;
      }
    }

    const checkOutDate = new Date(att.check_out);
    const shiftEndDate = new Date(`${att.date}T${shiftEndStr}`);
    
    const diffMins = (checkOutDate.getTime() - shiftEndDate.getTime()) / 60000;
    
    if (diffMins >= threshold) {
      return {
        ...att,
        shift_end: shiftEndStr,
        calculated_ot_mins: Math.floor(diffMins)
      };
    }
    return null;
  }).filter(Boolean);

  return { data: pendingOTs };
}

export async function addPayrollAdjustment(staffId: string, cycleStartDate: string, type: string, amount: number, reason: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('payroll_adjustments').insert({
    staff_id: staffId, cycle_start_date: cycleStartDate, type, amount, reason
  }).select().single();

  if (error) return { error: error.message };
  await logAudit('PAYROLL_ADJUSTMENT', null, 'payroll_adjustments', data.id, null, data, reason);
  return { success: true };
}

export async function getPublicHolidays() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('public_holidays').select('*').order('date', { ascending: true });
  return { data, error };
}

export async function upsertPublicHoliday(holiday: HolidayInput) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('public_holidays').upsert(holiday, { onConflict: 'date' }).select().single();
  if (!error) await logAudit('UPSERT_HOLIDAY', null, 'public_holidays', data.id, null, data);
  return { data, error };
}

export async function deletePublicHoliday(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('public_holidays').delete().eq('id', id);
  if (!error) await logAudit('DELETE_HOLIDAY', null, 'public_holidays', id);
  return { error };
}

export async function getPendingHolidayRecords() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('attendance')
    .select('*, profiles(full_name, rate)')
    .eq('holiday_status', 'Pending')
    .order('date', { ascending: false });
  return { data, error };
}

export async function resolveHolidayReview(attendanceId: string, staffId: string, resolution: 'Paid' | 'Substitute', multiplier: number = 1.0) {
  const auth = await requireRole(['Admin', 'Manager']);
  if (!auth.authorized) return { error: auth.error };

  const supabase = await createClient();

  if (resolution === 'Paid') {
    const [{ data: staff }, { data: record }] = await Promise.all([
      supabase.from('profiles').select('rate').eq('id', staffId).single(),
      supabase.from('attendance').select('date').eq('id', attendanceId).single()
    ]);
    // Daily wage uses the actual number of days in the holiday's month, not a flat /30.
    const dailyWage = record?.date ? getDailyRate(staff?.rate || 0, record.date) : 0;
    const amount = dailyWage * multiplier;

    await supabase.from('attendance').update({
      holiday_status: 'Paid',
      holiday_multiplier: multiplier,
      holiday_amount: amount
    }).eq('id', attendanceId);
  } else {
    const { data: staff } = await supabase.from('profiles').select('substitute_leave_quota').eq('id', staffId).single();
    await supabase.from('profiles').update({
      substitute_leave_quota: (staff?.substitute_leave_quota || 0) + 1
    }).eq('id', staffId);
    
    await supabase.from('attendance').update({
      holiday_status: 'Substitute'
    }).eq('id', attendanceId);
  }
  
  await logAudit('RESOLVE_HOLIDAY', null, 'attendance', attendanceId, null, { resolution, multiplier });
  return { success: true };
}

export async function getWarningLetters(staffId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('warning_letters').select('*').eq('staff_id', staffId).order('date', { ascending: false });
  return { data, error };
}

export async function getLeaveHistory(staffId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('attendance').select('*').eq('staff_id', staffId).eq('is_leave', true).order('date', { ascending: false });
  return { data, error };
}

export async function issueWarningLetter(warning: WarningLetterInput) {
  const supabase = await createClient();
  const session = await getSession();
  const payload = { ...warning, issued_by: session?.id };
  const { data, error } = await supabase.from('warning_letters').insert(payload).select().single();
  if (!error) await logAudit('ISSUE_WARNING', null, 'warning_letters', data.id, null, data);
  return { data, error };
}

export async function getOverviewStats() {
  const supabase = await createClient();
  const now = new Date();
  const today = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [
    { data: staffList },
    { data: attendanceToday },
    { data: nextHoliday },
    { data: settingsData }
  ] = await Promise.all([
    supabase.from('profiles').select('id, full_name, birthday, role').eq('role', 'Staff'),
    supabase.from('attendance').select('*').eq('date', today),
    supabase.from('public_holidays').select('*').gte('date', today).order('date', { ascending: true }).limit(1),
    supabase.from('settings').select('value').eq('key', 'departments_config').single()
  ]);

  const staffIds = new Set(staffList?.map(s => s.id) || []);
  const staffAttendance = attendanceToday?.filter(a => staffIds.has(a.user_id)) || [];

  const totalStaff = staffList?.length || 0;
  const present = staffAttendance.filter(a => a.check_in && !a.is_leave).length || 0;
  const onLeave = staffAttendance.filter(a => a.is_leave).length || 0;
  const late = 0; // Simplified
  const absent = totalStaff - present - onLeave;

  // Filter birthdays for this month/coming days
  const upcomingBirthdays = staffList?.filter(s => {
    if (!s.birthday) return false;
    const b = new Date(s.birthday);
    return b.getMonth() === now.getMonth();
  }).slice(0, 5) || [];

  return {
    stats: { total: totalStaff || 0, present, late, absent, onLeave },
    nextHoliday: nextHoliday?.[0] || null,
    upcomingBirthdays,
    departmentsConfig: settingsData?.value || []
  };
}

export async function getMonthlySummary(startDate: string, endDate: string) {
  const supabase = await createClient();

  // Daily-wage and unpaid-leave math divides the monthly base by the actual
  // number of days in the cycle month (derived from startDate), never a flat 30.
  const daysInCycleMonth = getDaysInMonthFromDateStr(startDate);

  const [{ data: staffData }, { data: settingsData }] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('settings').select('*')
  ]);

  if (!staffData) return { error: 'Failed to fetch staff' };

  let breakDurationMins = 60; // Default
  let lateGraceMins = 0;
  let lateDeductPerMin = 0; // THB per minute
  let otRatePerHour = 50;   // THB per hour
  let ssoRate = 5;
  let ssoCap = 750;

  if (settingsData) {
    const payrollConfig = settingsData.find(s => s.key === 'payroll_config');
    if (payrollConfig?.value?.break_duration_mins) {
      breakDurationMins = Number(payrollConfig.value.break_duration_mins);
    }
    const payrollRules = settingsData.find(s => s.key === 'payroll_rules');
    if (payrollRules?.value) {
      lateGraceMins   = Number(payrollRules.value.late_grace_mins ?? 0);
      lateDeductPerMin = Number(payrollRules.value.late_deduct_per_min ?? 0);
      otRatePerHour   = Number(payrollRules.value.ot_rate_per_hour ?? 50);
      ssoRate         = Number(payrollRules.value.sso_rate ?? 5);
      ssoCap          = Number(payrollRules.value.sso_cap ?? 750);
    }
  }

  const { data: attendanceData, error: attError } = await supabase
    .from('attendance').select('*').gte('date', startDate).lte('date', endDate).limit(5000); 

  if (attError) return { error: attError.message };

  const summaryMap: Record<string, StaffPayrollSummary> = {};

  (staffData as Profile[]).forEach((staff) => {
    summaryMap[staff.id] = {
      id: staff.id,
      name: staff.full_name,
      role: staff.role,
      department: staff.department || 'General',
      wageType: staff.wage_type || 'Monthly',
      rate: staff.rate || 0,
      lateMins: 0,
      earlyMins: 0,
      otApproved: 0,
      leaveDays: 0,
      workedDays: 0,
      totalHoursWorked: 0,
      calculatedPay: 0,
      grossPay: 0,
      ssoDeduction: 0,
      guaranteeDeduction: 0,
      otherDeductions: 0,
      netPay: 0,
      social_security_enabled: staff.social_security_enabled,
      sso_type: staff.sso_type || 'Percentage',
      sso_value: staff.sso_value ?? 5,
      guarantee_target: staff.guarantee_target || 0,
      guarantee_monthly: staff.guarantee_monthly || 0,
      guarantee_accumulated: staff.guarantee_accumulated || 0,
      guarantee_status: staff.guarantee_status || 'Deduct Monthly',
      adjustments: [],
      logs: [],
      unpaidLeaveDays: 0,
    };
  });

  const [{ data: scheduleData }, { data: adjustmentsData }] = await Promise.all([
    supabase.from('schedules').select('*').gte('date', startDate).lte('date', endDate).limit(5000),
    supabase.from('payroll_adjustments').select('*').gte('cycle_start_date', startDate).lte('cycle_start_date', endDate).limit(1000)
  ]);
  
  if (adjustmentsData) {
    adjustmentsData.forEach(adj => {
      if (summaryMap[adj.staff_id]) {
        summaryMap[adj.staff_id].adjustments.push(adj);
      }
    });
  }

  attendanceData.forEach((log) => {
    if (!summaryMap[log.staff_id]) return;
    
    summaryMap[log.staff_id].logs.push(log);
    
    if (log.is_leave) {
      summaryMap[log.staff_id].leaveDays += 1;
      if (log.is_paid_leave === false) {
        summaryMap[log.staff_id].unpaidLeaveDays += 1;
      }
      return; 
    }

    summaryMap[log.staff_id].otApproved += (log.approved_ot_mins || 0) / 60; 
    
    let shiftStartStr = '09:00:00';
    let noBreak = false;
    
    if (scheduleData) {
      const s = scheduleData.find(x => x.staff_id === log.staff_id && x.date === log.date);
      if (s) {
         if (s.shift_start) shiftStartStr = s.shift_start;
         if (s.no_break) noBreak = s.no_break;
      }
    }

    if (log.check_in) {
      const checkInTime = new Date(log.check_in);
      const shiftStart = new Date(`${log.date}T${shiftStartStr}`);
      const rawLateMins = (checkInTime.getTime() - shiftStart.getTime()) / 60000;
      
      // Apply grace period: only count as late if beyond grace threshold
      const effectiveLateMins = rawLateMins > lateGraceMins ? Math.floor(rawLateMins) : 0;
      const earlyMins = rawLateMins < 0 ? Math.abs(Math.floor(rawLateMins)) : 0;

      summaryMap[log.staff_id].lateMins += effectiveLateMins;
      summaryMap[log.staff_id].earlyMins += earlyMins;
      
      if (log.check_out) {
        summaryMap[log.staff_id].workedDays += 1;
        const checkOutTime = new Date(log.check_out);
        let shiftMins = (checkOutTime.getTime() - checkInTime.getTime()) / 60000;
        
        // Deduct standard break if worked over 4 hours and noBreak isn't toggled
        if (!noBreak && shiftMins > 240) {
            shiftMins -= breakDurationMins;
        }
        
        summaryMap[log.staff_id].totalHoursWorked += Math.max(0, shiftMins / 60);
      }
    }
  });

  // Calculate Pay 
  Object.values(summaryMap).forEach(staff => {
    let baseCalculatedPay = 0;
    const basePayRate = Number(staff.rate) || 0;

    if (staff.wageType === 'Monthly') {
      baseCalculatedPay = basePayRate;
    } else if (staff.wageType === 'Daily') {
      const dailyRate = basePayRate / daysInCycleMonth;
      baseCalculatedPay = dailyRate * staff.workedDays;
    } else if (staff.wageType === 'Hourly') {
      baseCalculatedPay = basePayRate * staff.totalHoursWorked;
    }

    let otPay = 0;
    if (staff.otApproved > 0 && otRatePerHour > 0) {
      otPay = staff.otApproved * otRatePerHour;
    }

    let holidayPay = 0;
    staff.logs.forEach((log) => {
      if (log.holiday_status === 'Paid') {
        holidayPay += Number(log.holiday_amount || 0);
      }
    });

    let additions = 0;
    let manualDeductions = 0;
    staff.adjustments.forEach((adj) => {
      if (adj.type === 'Add-on' || adj.type === 'Bonus') additions += Number(adj.amount);
      else manualDeductions += Number(adj.amount);
    });

    const latePenalty = staff.lateMins > 0 && lateDeductPerMin > 0 ? (staff.lateMins * lateDeductPerMin) : 0;
    
    // Unpaid Leave Deduction (for Monthly staff)
    let unpaidLeaveDeduction = 0;
    if (staff.wageType === 'Monthly' && staff.unpaidLeaveDays > 0) {
      const dailyRate = basePayRate / daysInCycleMonth;
      unpaidLeaveDeduction = dailyRate * staff.unpaidLeaveDays;
    }

    const grossPay = baseCalculatedPay + otPay + holidayPay + additions;
    staff.grossPay = grossPay;

    // SSO Deduction - use per-staff sso_type and sso_value
    if (staff.social_security_enabled) {
      if (staff.sso_type === 'Fixed') {
        staff.ssoDeduction = staff.sso_value || 0;
      } else {
        // Percentage mode - always capped at 750 THB
        const ssoVal = staff.sso_value ?? ssoRate;
        const calculatedSso = (baseCalculatedPay * ssoVal) / 100;
        staff.ssoDeduction = Math.min(calculatedSso, ssoCap);
      }
    }

    // Guarantee Deduction
    if (staff.guarantee_status === 'Deduct Monthly' && staff.guarantee_accumulated < staff.guarantee_target) {
      const maxNeeded = staff.guarantee_target - staff.guarantee_accumulated;
      staff.guaranteeDeduction = Math.min(staff.guarantee_monthly, maxNeeded);
    }

    staff.otherDeductions = manualDeductions + latePenalty + unpaidLeaveDeduction;
    staff.netPay = Math.max(0, grossPay - staff.ssoDeduction - staff.guaranteeDeduction - staff.otherDeductions);
    staff.calculatedPay = staff.netPay; // Maintain backwards compatibility for existing UI
  });

  return { data: Object.values(summaryMap) };
}

export async function finalizeGuaranteeDeduction(staffId: string, amount: number, cycleStartDate: string) {
  const auth = await requireRole(['Admin', 'Manager']);
  if (!auth.authorized) return { error: auth.error };

  const supabase = await createClient();

  // Atomic at the database level: the RPC increments `guarantee_accumulated`
  // AND records the matching 'Guarantee Deposit' adjustment inside a single
  // transaction. This eliminates the read-modify-write race condition the old
  // application-level implementation had (two concurrent finalizations could
  // both read the same starting balance and lose one increment).
  // The 'Guarantee Deposit' type keeps it out of `otherDeductions` so the
  // monthly summary's dynamic guarantee calculation is not double-counted.
  const { error } = await supabase.rpc('finalize_guarantee_deduction', {
    p_staff_id: staffId,
    p_amount: amount,
    p_cycle_start_date: cycleStartDate,
  });

  if (error) return { error: error.message };
  return { success: true };
}
