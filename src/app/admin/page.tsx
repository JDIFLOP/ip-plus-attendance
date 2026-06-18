"use client";

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Download, X, Plus, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { getMonthlySummary, approveOT, addPayrollAdjustment, finalizeGuaranteeDeduction } from '@/app/actions/admin';
import { useI18n } from '@/context/I18nContext';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';
import type { PayrollAdjustment, AttendanceRecord } from '@/types/db';

type AdjType = 'Cash Advance' | 'Damage/Fine' | 'Bonus' | 'Add-on' | 'Deduction';

type StaffSummary = {
  id: string;
  name: string;
  role: string;
  department?: string;
  wageType?: string;
  lateMins: number;
  earlyMins: number;
  otApproved: number;
  leaveDays: number;
  workedDays: number;
  calculatedPay: number;
  grossPay: number;
  ssoDeduction: number;
  guaranteeDeduction: number;
  otherDeductions: number;
  netPay: number;
  social_security_enabled: boolean;
  guarantee_target: number;
  guarantee_monthly: number;
  guarantee_accumulated: number;
  guarantee_status: string;
  adjustments?: PayrollAdjustment[];
  logs: AttendanceRecord[];
};

type AdjModal = { staffId: string; staffName: string; presetType?: AdjType } | null;

export default function AdminDashboard() {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [staffData, setStaffData] = useState<StaffSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<StaffSummary | null>(null);
  const [adjModal, setAdjModal] = useState<AdjModal>(null);
  const [adjType, setAdjType] = useState<AdjType>('Deduction');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjError, setAdjError] = useState('');

  const fetchData = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    const res = await getMonthlySummary(startDate, endDate);
    if (res.data) {
      const staffOnly = res.data.filter((s: StaffSummary) => s.role === 'Staff');
      setStaffData(staffOnly);
      setSelectedStaff(prev => {
        if (!prev) return null;
        return staffOnly.find((s: StaffSummary) => s.id === prev.id) || null;
      });
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
    /* eslint-disable react-hooks/set-state-in-effect */
    setStartDate(firstDay);
    setEndDate(lastDay);
    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mounted) fetchData();
  }, [fetchData, mounted]);

  const openAdjModal = (staffId: string, staffName: string, presetType?: AdjType) => {
    setAdjType(presetType || 'Deduction');
    setAdjAmount('');
    setAdjReason('');
    setAdjError('');
    setAdjModal({ staffId, staffName, presetType });
  };

  const handleAdjSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount <= 0) { setAdjError('Please enter a valid amount > 0'); return; }
    if (!adjReason.trim()) { setAdjError('Reason is required'); return; }
    setAdjSaving(true);
    setAdjError('');
    const res = await addPayrollAdjustment(adjModal!.staffId, startDate, adjType, amount, adjReason.trim());
    setAdjSaving(false);
    if (res.error) { setAdjError(res.error); return; }
    setAdjModal(null);
    fetchData();
  };

  const handleExportCSV = () => {
    if (!staffData.length) return alert('No data to export');
    const headers = 'Staff Name,Department,Late (Mins),OT Approved (Hrs),Leave Days,Gross Pay,SSO Deduction,Guarantee Deduction,Other Deductions,Net Pay (THB)\n';
    const csvContent = staffData.map(staff => {
      return `"${staff.name}","${staff.department || 'General'}",${staff.lateMins},${staff.otApproved.toFixed(2)},${staff.leaveDays},${staff.grossPay.toFixed(2)},${staff.ssoDeduction.toFixed(2)},${staff.guaranteeDeduction.toFixed(2)},${staff.otherDeductions.toFixed(2)},${staff.netPay.toFixed(2)}`;
    }).join('\n');
    const blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Payroll_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPayroll = async () => {
    const { exportPayrollSummary } = await import('@/utils/excelExport');
    await exportPayrollSummary({
      rows: staffData.map((s) => ({
        name: s.name,
        department: s.department,
        wageType: s.wageType,
        lateMins: s.lateMins,
        otApproved: s.otApproved,
        leaveDays: s.leaveDays,
        workedDays: s.workedDays,
        grossPay: s.grossPay,
        ssoDeduction: s.ssoDeduction,
        guaranteeDeduction: s.guaranteeDeduction,
        otherDeductions: s.otherDeductions,
        netPay: s.netPay,
      })),
      startDate,
      endDate,
    });
  };

  const handleExportDailyAttendance = async (staff: StaffSummary) => {
    const fmtTime = (iso: string | null) =>
      iso ? new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '--:--';
    const rows = [...staff.logs]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .map((log) => ({
        date: log.date,
        type: log.is_leave ? log.leave_type || 'ลา' : 'กะงาน',
        checkIn: log.is_leave ? '-' : fmtTime(log.check_in),
        checkOut: log.is_leave ? '-' : fmtTime(log.check_out),
        ot:
          log.ot_status === 'Approved'
            ? `${log.approved_ot_mins} นาที`
            : log.ot_status === 'Pending OT'
              ? 'รออนุมัติ'
              : '-',
        note: log.is_leave ? log.leave_reason || '' : '',
      }));
    const { exportDailyAttendance } = await import('@/utils/excelExport');
    await exportDailyAttendance({
      rows,
      title: `รายงานการลงเวลา — ${staff.name}`,
      subtitle: `รอบ ${startDate} ถึง ${endDate}`,
      filename: `การลงเวลา_${staff.name}`,
    });
  };

  const handleOTApprove = async (recordId: string, currentMins: number) => {
    const minStr = prompt(`Approve OT minutes (current raw: ~${currentMins} mins):`, String(currentMins));
    if (!minStr) return;
    const mins = parseInt(minStr);
    if (isNaN(mins)) return alert('Invalid number');
    const res = await approveOT(recordId, mins);
    if (res.error) alert(res.error);
    else fetchData();
  };

  const handleFinalizeGuarantee = async (staffId: string, amount: number) => {
    if (!confirm(`Finalize Guarantee Deduction of ${amount.toFixed(2)} THB for this month? This will be added to the accumulated deposit.`)) return;
    const res = await finalizeGuaranteeDeduction(staffId, amount, startDate);
    if (res.error) alert(res.error);
    else {
      alert("Successfully finalized and added to the accumulated deposit.");
      fetchData();
    }
  };

  if (!mounted) return null;

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-black/5 mb-8 gap-4 sticky top-0 z-10">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">{t.summaryTitle}</h2>
          <p className="text-primary/60 text-sm font-medium mt-1">{t.summarySubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4 bg-[#f4f6f4] p-1.5 rounded-xl border border-primary/10">
          <div className="flex items-center gap-2 pl-3 bg-white rounded-lg px-2 py-2 shadow-sm border border-black/5">
            <Calendar className="w-4 h-4 text-primary" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-sm outline-none text-primary font-bold bg-transparent" />
          </div>
          <span className="text-primary/40 font-bold text-sm uppercase">to</span>
          <div className="flex items-center gap-2 pr-3 bg-white rounded-lg px-2 py-2 shadow-sm border border-black/5">
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-sm outline-none text-primary font-bold bg-transparent" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExportCSV} className="flex items-center gap-2 bg-white text-primary border border-primary/20 hover:bg-primary/5 transition-all px-4 py-3 rounded-xl text-sm font-bold uppercase tracking-wider shadow-sm active:scale-[0.98]">
            <Download className="w-4 h-4" /> {t.exportCsv}
          </button>
          <ExportExcelButton
            variant="gold"
            label={t.exportPayroll}
            loadingLabel={t.exporting}
            disabled={staffData.length === 0}
            onExport={handleExportPayroll}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-black/5 rounded-2xl shadow-xl overflow-hidden flex-1 flex flex-col relative min-h-[500px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />
        <div className="overflow-auto flex-1 p-2">
          {loading && staffData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-primary font-bold opacity-50 animate-pulse">{t.syncingData}</div>
          ) : staffData.length === 0 ? (
            <div className="flex items-center justify-center h-full text-primary font-medium opacity-50">{t.noRecords}</div>
          ) : (
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-white text-primary sticky top-0 z-10 text-xs font-bold uppercase tracking-widest border-b-2 border-primary/10">
                <tr>
                  <th className="px-6 py-5">{t.staffName}</th>
                  <th className="px-4 py-5 text-center">{t.totalLate}</th>
                  <th className="px-4 py-5 text-center">{t.approvedOt}</th>
                  <th className="px-4 py-5 text-center">{t.leaveDays}</th>
                  <th className="px-4 py-5 text-right text-primary">{t.grossPay}</th>
                  <th className="px-4 py-5 text-right text-blue-600">SSO</th>
                  <th className="px-4 py-5 text-right text-orange-600">{t.guarantee}</th>
                  <th className="px-4 py-5 text-right text-red-600">{t.others} (-/+)</th>
                  <th className="px-4 py-5 text-center text-green-600">{t.netPay}</th>
                  <th className="px-4 py-5 text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {staffData.map((staff) => (
                  <tr key={staff.id} className="even:bg-black/[0.015] hover:bg-[#eef3ee] transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary text-white font-bold flex items-center justify-center shrink-0 border-2 border-gold/50 shadow-sm uppercase group-hover:scale-105 transition-transform">
                          {staff.name.charAt(0)}
                        </div>
                        <div>
                          <span className="font-bold text-primary block">{staff.name}</span>
                          <span className="text-xs text-primary/40">{staff.department || 'General'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-3 py-1.5 rounded-lg text-sm font-extrabold ${staff.lateMins > 0 ? 'bg-red-100 text-red-700 ring-1 ring-inset ring-red-200' : 'text-primary/30'}`}>
                        {staff.lateMins}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-3 py-1.5 rounded-lg text-sm font-extrabold ${staff.otApproved > 0 ? 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-200' : 'text-primary/30'}`}>
                        {staff.otApproved.toFixed(2)}h
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-3 py-1.5 rounded-lg text-sm font-extrabold ${staff.leaveDays > 0 ? 'bg-blue-100 text-blue-700 ring-1 ring-inset ring-blue-200' : 'text-primary/30'}`}>
                        {staff.leaveDays}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-mono font-bold text-sm text-primary/80">
                        {staff.grossPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {staff.social_security_enabled ? (
                        <span className="font-mono font-bold text-xs text-blue-600">
                          -{staff.ssoDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      ) : <span className="text-primary/30">-</span>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      {staff.guaranteeDeduction > 0 ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono font-bold text-xs text-orange-600">
                            -{staff.guaranteeDeduction.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          {!staff.adjustments?.some(a => a.type === 'Guarantee Deposit') && (
                            <button 
                              onClick={() => handleFinalizeGuarantee(staff.id, staff.guaranteeDeduction)}
                              className="text-[10px] bg-orange-100 hover:bg-orange-500 hover:text-white transition-colors text-orange-700 px-2 py-0.5 rounded font-bold uppercase"
                            >
                              Finalize
                            </button>
                          )}
                        </div>
                      ) : <span className="text-primary/30">-</span>}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {staff.otherDeductions !== 0 && (
                          <span className="font-mono font-bold text-xs text-red-600">
                            -{staff.otherDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        )}
                        <button
                          onClick={() => openAdjModal(staff.id, staff.name, 'Deduction')}
                          className="w-5 h-5 rounded-full bg-primary/10 hover:bg-primary hover:text-white text-primary flex items-center justify-center transition-all"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="font-mono font-black text-green-700 bg-green-100 px-3 py-1.5 rounded-xl border border-green-200">
                        ฿ {staff.netPay.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => setSelectedStaff(staff)}
                        className="text-sm font-bold text-primary bg-primary/5 hover:bg-primary hover:text-white transition-all px-4 py-2 rounded-lg border border-primary/10 hover:shadow-lg active:scale-95"
                      >
                        {t.viewLogs}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* View Logs Modal */}
      {selectedStaff && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-primary/20">
            <div className="bg-primary p-6 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="text-2xl font-bold tracking-tight">{selectedStaff.name}</h3>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-sm opacity-80 font-medium tracking-wide uppercase">{t.dailyDetailReport}</p>
                  <button
                    onClick={() => openAdjModal(selectedStaff.id, selectedStaff.name)}
                    className="bg-white/20 hover:bg-white/40 text-white text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full transition-colors border border-white/30 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> {t.addAdjustment}
                  </button>
                  <button
                    onClick={() => handleExportDailyAttendance(selectedStaff)}
                    disabled={selectedStaff.logs.length === 0}
                    className="bg-gold/90 hover:bg-gold text-primary text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-full transition-colors border border-gold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <FileSpreadsheet className="w-3 h-3" /> {t.exportAttendance}
                  </button>
                </div>
              </div>
              <button onClick={() => setSelectedStaff(null)} className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/30 flex items-center justify-center transition-colors font-bold text-xl">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-auto flex-1 bg-white space-y-8">
              {/* Daily Logs */}
              {selectedStaff.logs.length === 0 ? (
                <div className="text-center text-primary/50 font-bold py-10">{t.noLogs}</div>
              ) : (
                <table className="w-full text-left border-collapse min-w-max">
                  <thead className="bg-[#f0f4f0] text-primary text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-bold border-b border-black/5">{t.date}</th>
                      <th className="px-4 py-3 font-bold border-b border-black/5">{t.type}</th>
                      <th className="px-4 py-3 font-bold border-b border-black/5">{t.entry}</th>
                      <th className="px-4 py-3 font-bold border-b border-black/5">{t.exit}</th>
                      <th className="px-4 py-3 font-bold border-b border-black/5">{t.otAuth}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {selectedStaff.logs
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((log) => (
                        <tr key={log.id} className="hover:bg-primary/5 transition-colors">
                          <td className="px-4 py-4 font-bold text-primary">{log.date}</td>
                          <td className="px-4 py-4">
                            {log.is_leave
                              ? <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ring-1 ring-inset ring-blue-200">{t.leaveStatus}</span>
                              : <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">{t.shiftStatus}</span>
                            }
                          </td>
                          <td className="px-4 py-4 text-primary/80 font-mono text-sm">
                            {log.is_leave ? '--' : (log.check_in ? new Date(log.check_in).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '--:--')}
                          </td>
                          <td className="px-4 py-4 text-primary/80 font-mono text-sm">
                            {log.is_leave ? '--' : (log.check_out ? new Date(log.check_out).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '--:--')}
                          </td>
                          <td className="px-4 py-4">
                            {log.ot_status === 'Approved' ? (
                              <span className="text-green-700 bg-green-50 px-2.5 py-1 rounded-md text-sm font-bold ring-1 ring-inset ring-green-200">{log.approved_ot_mins}m ✓</span>
                            ) : log.ot_status === 'Pending OT' ? (
                              <button
                                onClick={() => handleOTApprove(log.id, log.approved_ot_mins || 0)}
                                className="bg-orange-100 text-orange-700 hover:bg-orange-500 hover:text-white transition-colors text-xs font-bold px-3 py-1.5 rounded-lg border border-orange-200 uppercase"
                              >
                                {t.approveOt}
                              </button>
                            ) : <span className="text-primary/30">-</span>}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}

              {/* Adjustments */}
              {selectedStaff.adjustments && selectedStaff.adjustments.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-primary/50 mb-3">{t.manualAdjust}</h4>
                  <table className="w-full text-left border-collapse min-w-max">
                    <tbody className="divide-y divide-black/5 border-y border-black/5">
                      {selectedStaff.adjustments.map((adj) => (
                        <tr key={adj.id} className="hover:bg-primary/5">
                          <td className="px-4 py-3 text-sm text-primary w-32">{new Date(adj.created_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                              adj.type === 'Bonus' || adj.type === 'Add-on' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>{adj.type}</span>
                          </td>
                          <td className="px-4 py-3 text-primary/80 text-sm">{adj.reason}</td>
                          <td className="px-4 py-3 font-mono font-bold text-right w-32">
                            <span className={adj.type === 'Bonus' || adj.type === 'Add-on' ? 'text-green-600' : 'text-red-600'}>
                              {adj.type === 'Bonus' || adj.type === 'Add-on' ? '+' : '-'}฿{Number(adj.amount).toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {adjModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-primary p-6 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white">{t.addAdjustment}</h3>
                <p className="text-white/60 text-sm mt-0.5">{adjModal.staffName}</p>
              </div>
              <button onClick={() => setAdjModal(null)} className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/30 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <form onSubmit={handleAdjSubmit} className="p-6 space-y-5">
              {/* Type */}
              <div>
                <label className="block text-xs font-black text-primary/50 uppercase tracking-widest mb-2">{t.adjustmentType}</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Cash Advance', 'Damage/Fine', 'Bonus', 'Deduction', 'Add-on'] as AdjType[]).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAdjType(type)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                        adjType === type
                          ? (type === 'Bonus' || type === 'Add-on' ? 'bg-green-500 text-white border-green-500' : 'bg-red-500 text-white border-red-500')
                          : 'bg-black/5 text-primary/60 border-black/10 hover:border-primary/30'
                      }`}
                    >
                      {type === 'Cash Advance' ? t.cashAdvance
                        : type === 'Damage/Fine' ? t.damageFine
                        : type === 'Bonus' ? t.bonus
                        : type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-black text-primary/50 uppercase tracking-widest mb-2">{t.adjustmentAmount}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-primary/40">฿</span>
                  <input
                    type="number" min="0.01" step="0.01" required
                    value={adjAmount}
                    onChange={e => setAdjAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-9 pr-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-black/5 font-bold text-primary font-mono text-lg"
                  />
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-black text-primary/50 uppercase tracking-widest mb-2">{t.auditReason}</label>
                <textarea
                  required
                  value={adjReason}
                  onChange={e => setAdjReason(e.target.value)}
                  placeholder={t.reasonPlaceholder}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-black/5 font-medium text-primary resize-none"
                />
              </div>

              {adjError && (
                <p className="text-red-600 text-sm font-bold bg-red-50 px-4 py-2 rounded-lg border border-red-100">{adjError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAdjModal(null)} className="flex-1 py-3 rounded-xl border border-black/10 font-bold text-primary/60 hover:bg-black/5 transition-all">
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={adjSaving}
                  className={`flex-1 py-3 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2 ${
                    adjType === 'Bonus' || adjType === 'Add-on' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                  } disabled:opacity-50`}
                >
                  {adjSaving ? '...' : <><CheckCircle2 className="w-4 h-4" /> {t.saving}</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
