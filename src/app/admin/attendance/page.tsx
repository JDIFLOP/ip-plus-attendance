"use client";

import { useState, useEffect } from 'react';
import { getStaffList, insertManualAttendance, insertLeave, getPendingDailyOT, approveOT, rejectOT, getStaffShift } from '@/app/actions/admin';
import { getDailyAttendanceReview, setAttendanceExcused, type DailyAttendanceReviewRow } from '@/app/actions/payroll';
import { CheckCircle, Clock, Check, X, RefreshCw, Lock, ShieldCheck, AlarmClock, Loader2 } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { getAuthRole } from '@/app/actions/auth';

type Staff = { id: string; full_name: string; role: string; };

interface PendingOTRecord {
  id: string;
  date: string;
  // getPendingDailyOT only returns rows where check_out is not null.
  check_out: string;
  shift_end: string;
  calculated_ot_mins: number;
  profiles?: { full_name?: string; department?: string } | null;
}

export default function AttendanceManager() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [activeTab, setActiveTab] = useState<'editor' | 'ot' | 'late'>('editor');
  const [pendingOT, setPendingOT] = useState<PendingOTRecord[]>([]);
  const [loadingOT, setLoadingOT] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Late Review (dynamic shift)
  const [reviewDate, setReviewDate] = useState('');
  const [reviewRows, setReviewRows] = useState<DailyAttendanceReviewRow[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [mode, setMode] = useState<'attendance' | 'leave'>('attendance');
  const [targetDate, setTargetDate] = useState('');

  // Attendance State
  const [checkIn, setCheckIn] = useState('09:00');
  const [checkOut, setCheckOut] = useState('17:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [isOT, setIsOT] = useState(false);

  // Leave State
  const [leaveType, setLeaveType] = useState('Sick Leave');
  const [isPaid, setIsPaid] = useState(true);

  // Shared
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ message: '', visible: false });

  useEffect(() => {
    loadData();
    getAuthRole().then(r => setUserRole(r));
    const today = new Date().toISOString().split('T')[0];
    /* eslint-disable react-hooks/set-state-in-effect */
    setTargetDate(today);
    setReviewDate(today);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const loadData = async () => {
    const { data } = await getStaffList();
    if (data) {
      // เฉพาะพนักงาน (Staff) เท่านั้น — Admin/Manager/HR ไม่ต้องลงเวลา
      const staffOnly = data.filter((s: Staff) => s.role === 'Staff');
      setStaff(staffOnly);
      if (staffOnly.length > 0) setSelectedStaffId(staffOnly[0].id);
    }
    setLoading(false);
  };

  const loadPendingOT = async () => {
    setLoadingOT(true);
    const { data } = await getPendingDailyOT();
    if (data) setPendingOT(data);
    setLoadingOT(false);
  };

  useEffect(() => {
    const fetchShift = async () => {
      if (selectedStaffId && targetDate) {
        const { shift_end } = await getStaffShift(selectedStaffId, targetDate);
        setShiftEnd(shift_end);
      }
    };
    fetchShift();
  }, [selectedStaffId, targetDate]);

  useEffect(() => {
    // Derives the OT flag from the entered check-out vs shift end; this mirror
    // state is intentionally synced in an effect.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (mode === 'attendance' && checkOut) {
      const outDate = new Date(`2026-01-01T${checkOut}`);
      const shiftEndDate = new Date(`2026-01-01T${shiftEnd}`);
      const diffMins = (outDate.getTime() - shiftEndDate.getTime()) / 60000;
      setIsOT(diffMins >= 15); // Assuming standard 15 min threshold
    } else {
      setIsOT(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [checkOut, shiftEnd, mode]);

  useEffect(() => {
    if (activeTab === 'ot') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadPendingOT();
    }
  }, [activeTab]);

  const loadReview = async (date: string) => {
    setLoadingReview(true);
    const res = await getDailyAttendanceReview(date);
    setReviewRows(res.data || []);
    setLoadingReview(false);
  };

  useEffect(() => {
    if (activeTab === 'late' && reviewDate) loadReview(reviewDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reviewDate]);

  const handleToggleExcused = async (row: DailyAttendanceReviewRow) => {
    setTogglingId(row.id);
    const res = await setAttendanceExcused(row.id, !row.isExcused);
    if (res.error) {
      alert(res.error);
    } else {
      setReviewRows(prev => prev.map(r => (r.id === row.id ? { ...r, isExcused: !r.isExcused } : r)));
      showToast(row.isExcused ? t.undoExcuse : t.excusedBadge);
    }
    setTogglingId(null);
  };

  const fmtBkkTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '--:--';

  const showToast = (msg: string) => {
    setToast({ message: msg, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 3000);
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId) return alert("Select staff");
    if (!reason.trim()) return alert("Audit Reason is specifically REQUIRED.");

    setSubmitting(true);
    let res;

    if (mode === 'attendance') {
      res = await insertManualAttendance(selectedStaffId, targetDate, checkIn, checkOut, `MANUAL OVERRIDE: ${reason}`);
    } else {
      res = await insertLeave(selectedStaffId, targetDate, leaveType, reason, isPaid);
    }

    setSubmitting(false);

    if (res.error) {
      alert("Error saving record: " + res.error);
    } else {
      showToast("System record successfully updated and Logged!");
      setReason(''); // Reset reason
    }
  };

  const handleApproveOT = async (recordId: string, mins: number) => {
    setProcessingId(recordId);
    const res = await approveOT(recordId, mins);
    if (res.success) {
      showToast(`Approved ${mins} minutes of OT.`);
      setPendingOT(prev => prev.filter(r => r.id !== recordId));
    }
    setProcessingId(null);
  };

  const handleRejectOT = async (recordId: string) => {
    setProcessingId(recordId);
    const res = await rejectOT(recordId);
    if (res.success) {
      showToast('Rejected OT request.');
      setPendingOT(prev => prev.filter(r => r.id !== recordId));
    }
    setProcessingId(null);
  };

  if (loading) return <div className="p-10 font-bold opacity-50">{t.loadingGrid}</div>;

  return (
    <>
      <div className={`fixed top-4 right-4 z-[100] bg-green-50 text-green-800 border border-green-200 px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 transition-all duration-300 ${toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <CheckCircle className="w-5 h-5 text-green-600" />
        <span className="font-bold">{toast.message}</span>
      </div>

      <div className="flex justify-between items-end bg-white p-6 rounded-2xl shadow-sm border border-black/5 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">{t.attendTitle}</h2>
          <p className="text-primary/60 text-sm font-medium mt-1">{t.attendSubtitle}</p>
        </div>
        <div className="flex bg-black/5 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('editor')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-widest transition-all ${activeTab === 'editor' ? 'bg-white text-primary shadow-sm' : 'text-primary/50 hover:text-primary'}`}
          >
            Logs Editor
          </button>
          <button
            onClick={() => setActiveTab('ot')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-widest transition-all ${activeTab === 'ot' ? 'bg-white text-primary shadow-sm' : 'text-primary/50 hover:text-primary'}`}
          >
            {t.dailyOt}
            {pendingOT.length > 0 && activeTab !== 'ot' && (
              <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pendingOT.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('late')}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold uppercase tracking-widest transition-all ${activeTab === 'late' ? 'bg-white text-primary shadow-sm' : 'text-primary/50 hover:text-primary'}`}
          >
            {t.lateReviewTab}
          </button>
        </div>
      </div>

      {activeTab === 'editor' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column: Staff Selector */}
          <div className="bg-white border border-black/5 rounded-2xl shadow-xl p-6 flex flex-col h-[600px]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-primary mb-4 p-2 bg-black/5 rounded-lg flex items-center gap-2">
              <Clock className="w-4 h-4" /> {t.selectStaff}
            </h3>
            <div className="overflow-auto flex-1 pr-2 space-y-1">
              {staff.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStaffId(s.id)}
                  className={`w-full text-left p-3 rounded-xl font-bold transition-all border ${selectedStaffId === s.id ? 'bg-primary text-white shadow-lg border-primary border-transparent' : 'bg-white text-primary border-black/10 hover:border-primary/40 hover:bg-black/5'}`}
                >
                  <div className="truncate">{s.full_name}</div>
                  <div className={`text-[10px] uppercase font-black tracking-widest mt-0.5 ${selectedStaffId === s.id ? 'text-gold' : 'text-primary/40'}`}>
                    {s.role}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Column: Form Editor */}
          <div className="md:col-span-2 bg-white border border-black/5 rounded-2xl shadow-xl flex flex-col h-[600px]">
            <div className="h-1 bg-primary w-full rounded-t-2xl"></div>

            <form onSubmit={handleOverrideSubmit} className="p-8 flex flex-col flex-1 h-full max-w-2xl mx-auto w-full">
              <div className="flex bg-[#f0f4f0] p-1.5 rounded-xl mb-8">
                <button type="button" onClick={() => setMode('attendance')} className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest rounded-lg transition-all ${mode === 'attendance' ? 'bg-white text-primary shadow-sm' : 'text-primary/50 hover:text-primary'}`}>
                  {t.manualTimes}
                </button>
                <button type="button" onClick={() => setMode('leave')} className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest rounded-lg transition-all ${mode === 'leave' ? 'bg-primary text-white shadow-sm' : 'text-primary/50 hover:text-primary'}`}>
                  {t.markLeave}
                </button>
              </div>

              <div className="space-y-6 flex-1">
                <div>
                  <label className="block text-xs font-black text-primary mb-2 uppercase tracking-widest">{t.targetDate}</label>
                  <input
                    type="date" required value={targetDate} onChange={e => setTargetDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border-2 border-primary/10 focus:border-primary focus:ring-0 outline-none transition-all bg-[#f8f9f8] font-mono text-primary font-bold shadow-inner"
                  />
                </div>

                {mode === 'attendance' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-primary mb-2 uppercase tracking-widest">{t.checkInTime}</label>
                      <input
                        type="time" required value={checkIn} onChange={e => setCheckIn(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border-2 border-primary/10 focus:border-primary outline-none transition-all bg-[#f8f9f8] font-mono text-primary font-bold shadow-inner"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-primary mb-2 uppercase tracking-widest">{t.checkOutTime}</label>
                      <input
                        type="time" required value={checkOut} onChange={e => setCheckOut(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border-2 border-primary/10 focus:border-primary outline-none transition-all bg-[#f8f9f8] font-mono text-primary font-bold shadow-inner"
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-black text-primary mb-2 uppercase tracking-widest">{t.leaveType}</label>
                    <select
                      value={leaveType} onChange={e => setLeaveType(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border-2 border-primary/10 focus:border-primary outline-none transition-all bg-[#f8f9f8] text-primary font-bold shadow-inner"
                    >
                      <option value="Sick Leave">{t.sickLeave}</option>
                      <option value="Personal Leave">{t.personalLeave}</option>
                      <option value="Annual Leave">{t.annualLeave}</option>
                      <option value="Maternity Leave">{t.maternityLeave}</option>
                      <option value="Military Leave">{t.militaryLeave}</option>
                      <option value="Absent">{t.absent}</option>
                    </select>

                    <div className="flex items-center justify-between p-4 bg-[#f8f9f8] rounded-xl border-2 border-primary/10 mt-4">
                      <div>
                        <label className="block text-xs font-black text-primary uppercase tracking-widest">หักเงินเดือน (Deduct Pay)</label>
                        <p className="text-[10px] text-primary/40 font-bold">หากไม่หักเงิน พนักงานจะได้รับค่าจ้างปกติในวันนี้</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" className="sr-only peer"
                          checked={!isPaid}
                          onChange={(e) => setIsPaid(!e.target.checked)}
                        />
                        <div className="w-11 h-6 bg-black/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                      </label>
                    </div>
                  </div>
                )}

                <div>
                  <label className="flex items-center justify-between text-xs font-black text-primary mb-2 uppercase tracking-widest">
                    <span>{t.auditReason} <span className="text-red-500">*</span></span>
                    <span className="text-primary/40 font-medium text-[10px] tracking-normal capitalize">{t.auditRequired}</span>
                  </label>
                  <textarea
                    required value={reason} onChange={e => setReason(e.target.value)} placeholder="Provide mandatory context for this manual override..."
                    className="w-full px-4 py-3 rounded-xl border-2 border-primary/10 focus:border-primary outline-none transition-all bg-[#f8f9f8] font-medium text-primary shadow-inner min-h-[120px]"
                  />
                </div>

                {isOT && mode === 'attendance' && (
                  <div className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex items-start gap-3 mt-4">
                    <Clock className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-orange-800 uppercase tracking-wide">OT Notice</p>
                      <p className="text-xs text-orange-700 font-medium mt-1">
                        หมายเหตุ: เวลาที่บันทึกเกินกว่าตารางงานปกติ ระบบจะส่งรายการนี้ไปยังหน้าอนุมัติ OT 
                        <br/><span className="opacity-75">(Notice: This entry exceeds scheduled hours and will be sent to the Daily OT Approval list)</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <button type="submit" disabled={submitting} className="mt-8 mb-2 w-full bg-primary hover:bg-primary-light transition-all text-white py-4 rounded-xl font-black uppercase tracking-[0.2em] shadow-xl disabled:opacity-50 flex justify-center items-center gap-2 group active:scale-95">
                {submitting ? t.saving : t.confirmOverride}
              </button>
            </form>
          </div>
        </div>
      ) : activeTab === 'ot' ? (
        <div className="bg-white border border-black/5 rounded-2xl shadow-xl overflow-hidden min-h-[400px] flex flex-col">
          <div className="h-1 bg-primary w-full"></div>
          <div className="p-6 flex justify-between items-center border-b border-black/5">
            <h3 className="text-xl font-extrabold text-primary flex items-center gap-2">
              <Clock className="w-5 h-5 text-gold" /> {t.dailyOt}
            </h3>
            <button onClick={loadPendingOT} className="p-2 bg-black/5 rounded-lg hover:bg-black/10 transition-colors">
              <RefreshCw className={`w-4 h-4 text-primary/60 ${loadingOT ? 'animate-spin' : ''}`} />
            </button>
          </div>
          
          {loadingOT ? (
            <div className="flex-1 flex flex-col items-center justify-center text-primary/50 py-20">
              <RefreshCw className="w-8 h-8 animate-spin mb-4" />
              <p className="font-bold uppercase tracking-widest text-xs">กำลังโหลดข้อมูล...</p>
            </div>
          ) : userRole === 'HR' ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
              <Lock className="w-12 h-12 text-amber-400 opacity-60" />
              <p className="font-bold text-primary/50">ไม่มีสิทธิ์อนุมัติ OT — กรุณาติดต่อ Admin หรือ Manager</p>
            </div>
          ) : pendingOT.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-primary/30 py-20">
              <CheckCircle className="w-12 h-12 mb-4" />
              <p className="font-bold text-lg">ไม่มีรายการ OT ที่รออนุมัติ</p>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {pendingOT.map(record => (
                <div key={record.id} className="p-6 flex flex-col md:flex-row items-center justify-between gap-6 hover:bg-black/5 transition-colors">
                  <div className="flex items-center gap-6 flex-1 w-full">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary/40 mb-1">{record.profiles?.department}</p>
                      <h4 className="text-xl font-bold text-primary leading-none">{record.profiles?.full_name}</h4>
                    </div>
                    
                    <div className="h-10 w-px bg-black/10 hidden md:block"></div>
                    
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-primary/40">วันที่</p>
                        <p className="font-mono text-sm font-bold text-primary">{new Date(record.date).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-primary/40">สิ้นสุดกะ</p>
                        <p className="font-mono text-sm font-bold text-primary">{record.shift_end}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-primary/40">ออกจริง</p>
                        <p className="font-mono text-sm font-bold text-red-500">{new Date(record.check_out).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-primary/40">OT ที่คำนวณ</p>
                        <p className="font-mono text-sm font-bold text-gold">{record.calculated_ot_mins} mins</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex-1 md:flex-none">
                      <label className="block text-[10px] font-bold uppercase text-primary/40 mb-1">ปรับนาที</label>
                      <input 
                        type="number"
                        min="0"
                        defaultValue={record.calculated_ot_mins}
                        id={`ot-mins-${record.id}`}
                        className="w-full md:w-24 px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-gold outline-none text-center font-bold font-mono text-primary bg-white"
                      />
                    </div>
                    <div className="flex gap-2 self-end">
                      <button
                        disabled={processingId === record.id || userRole === 'HR'}
                        onClick={() => handleRejectOT(record.id)}
                        className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition-colors border border-red-200 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        title="ปฏิเสธ OT"
                      >
                        <X className="w-5 h-5" />
                      </button>
                      <button
                        disabled={processingId === record.id || userRole === 'HR'}
                        onClick={() => {
                          const val = (document.getElementById(`ot-mins-${record.id}`) as HTMLInputElement)?.value;
                          handleApproveOT(record.id, parseInt(val || '0'));
                        }}
                        className="px-4 py-2 bg-green-500 text-white hover:bg-green-600 rounded-lg transition-colors shadow-sm font-bold text-sm uppercase tracking-wider flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check className="w-4 h-4" /> อนุมัติ
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-black/5 rounded-2xl shadow-xl overflow-hidden min-h-[400px] flex flex-col">
          <div className="h-1 bg-primary w-full"></div>
          <div className="p-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4 border-b border-black/5">
            <div>
              <h3 className="text-xl font-extrabold text-primary flex items-center gap-2">
                <AlarmClock className="w-5 h-5 text-gold" /> {t.lateReviewTitle}
              </h3>
              <p className="text-primary/50 text-xs font-medium mt-1 max-w-xl">{t.lateReviewSub}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={reviewDate}
                onChange={e => setReviewDate(e.target.value)}
                className="px-3 py-2 rounded-lg border-2 border-primary/10 focus:border-primary outline-none bg-[#f8f9f8] font-mono text-primary font-bold text-sm"
              />
              <button onClick={() => loadReview(reviewDate)} className="p-2.5 bg-black/5 rounded-lg hover:bg-black/10 transition-colors" title="Refresh">
                <RefreshCw className={`w-4 h-4 text-primary/60 ${loadingReview ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {loadingReview ? (
            <div className="flex-1 flex flex-col items-center justify-center text-primary/50 py-20">
              <RefreshCw className="w-8 h-8 animate-spin mb-4" />
              <p className="font-bold uppercase tracking-widest text-xs">กำลังโหลดข้อมูล...</p>
            </div>
          ) : reviewRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-primary/30 py-20">
              <CheckCircle className="w-12 h-12 mb-4" />
              <p className="font-bold text-lg">{t.noLateRecords}</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-left border-collapse min-w-max">
                <thead className="bg-[#f0f4f0] text-primary text-xs uppercase tracking-widest border-b-2 border-primary/10">
                  <tr>
                    <th className="px-6 py-4 font-bold">{t.staffName}</th>
                    <th className="px-4 py-4 font-bold text-center">{t.colActualIn}</th>
                    <th className="px-4 py-4 font-bold text-center">{t.colTarget}</th>
                    <th className="px-4 py-4 font-bold text-center">{t.colLate}</th>
                    <th className="px-4 py-4 font-bold text-center">{t.colStatus}</th>
                    <th className="px-4 py-4 font-bold text-right">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {reviewRows.map(row => {
                    const noCheckIn = !row.checkIn && !row.isLeave;
                    return (
                      <tr key={row.id} className="even:bg-black/[0.015] hover:bg-primary/5 transition-colors">
                        <td className="px-6 py-4">
                          <span className="font-bold text-primary block">{row.staffName}</span>
                          <span className="text-[10px] uppercase tracking-widest font-bold text-primary/40">{row.department}</span>
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-sm font-bold text-primary">
                          {row.isLeave ? '—' : fmtBkkTime(row.checkIn)}
                        </td>
                        <td className="px-4 py-4 text-center font-mono text-sm text-primary/60">
                          {row.isLeave || noCheckIn ? '—' : row.targetStart}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {row.isLate ? (
                            <span className="font-mono font-extrabold text-sm text-red-600">{row.lateMins}</span>
                          ) : (
                            <span className="text-primary/30">—</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {row.isLeave ? (
                            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ring-1 ring-inset ring-blue-200">{t.statusLeave}</span>
                          ) : noCheckIn ? (
                            <span className="bg-black/5 text-primary/40 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">{t.statusNoCheckIn}</span>
                          ) : row.isExcused ? (
                            <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ring-1 ring-inset ring-green-200"><ShieldCheck className="w-3 h-3" /> {t.excusedBadge}</span>
                          ) : row.isLate ? (
                            <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ring-1 ring-inset ring-red-200">{t.statusLate}</span>
                          ) : (
                            <span className="bg-green-50 text-green-600 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider ring-1 ring-inset ring-green-100">{t.statusOnTime}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {(row.isLate || row.isExcused) && !row.isLeave ? (
                            userRole === 'HR' ? (
                              <span className="inline-flex items-center gap-1 text-primary/30 text-xs font-bold" title="ไม่มีสิทธิ์"><Lock className="w-3.5 h-3.5" /></span>
                            ) : (
                              <button
                                onClick={() => handleToggleExcused(row)}
                                disabled={togglingId === row.id}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors border disabled:opacity-40 ${row.isExcused
                                  ? 'bg-white text-primary/60 border-black/10 hover:bg-black/5'
                                  : 'bg-green-500 text-white border-green-500 hover:bg-green-600'}`}
                              >
                                {togglingId === row.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : row.isExcused ? (
                                  <>{t.undoExcuse}</>
                                ) : (
                                  <><ShieldCheck className="w-3.5 h-3.5" /> {t.markExcused}</>
                                )}
                              </button>
                            )
                          ) : (
                            <span className="text-primary/20">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
