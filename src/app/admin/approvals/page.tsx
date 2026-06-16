"use client";

import { useState, useEffect } from 'react';
import { getPendingHolidayRecords, resolveHolidayReview } from '@/app/actions/admin';
import { CheckCircle, Clock, Loader2, DollarSign, RefreshCw, Lock } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { getAuthRole } from '@/app/actions/auth';

interface PendingHolidayRow {
  id: string;
  staff_id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  profiles?: { full_name?: string; rate?: number } | null;
}

export default function HolidayApprovals() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<PendingHolidayRow[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    loadRecords();
    getAuthRole().then(r => setUserRole(r));
  }, []);

  const loadRecords = async () => {
    setLoading(true);
    const { data } = await getPendingHolidayRecords();
    if (data) setRecords(data);
    setLoading(false);
  };

  const handleResolve = async (attendanceId: string, staffId: string, resolution: 'Paid' | 'Substitute', multiplier: number = 1.0) => {
    setProcessingId(attendanceId);
    const res = await resolveHolidayReview(attendanceId, staffId, resolution, multiplier);
    if (res.success) {
      setRecords(records.filter(r => r.id !== attendanceId));
    }
    setProcessingId(null);
  };

  return (
    <>
      <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-black/5 mb-8 gap-4 sticky top-0 z-10">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">{t.navApprovals}</h2>
          <p className="text-primary/60 text-sm font-medium mt-1">ตรวจสอบและอนุมัติการทำงานในวันหยุด</p>
        </div>
        <button 
          onClick={loadRecords}
          className="p-2 hover:bg-black/5 rounded-full transition-colors text-primary/40 hover:text-primary"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {userRole === 'HR' && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-5 py-4 rounded-2xl mb-2">
          <Lock className="w-5 h-5 shrink-0" />
          <p className="text-sm font-bold">ไม่มีสิทธิ์อนุมัติ — บัญชี HR ไม่สามารถอนุมัติวันหยุดได้ กรุณาติดต่อ Admin หรือ Manager</p>
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 text-primary">
            <Loader2 className="w-8 h-8 animate-spin opacity-50 mb-3" />
            <span className="font-bold opacity-50">Loading Pending Records...</span>
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white border border-black/5 rounded-2xl p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4 opacity-20" />
            <p className="text-primary/40 font-bold">No pending holiday records to review.</p>
          </div>
        ) : (
          records.map((record) => (
            <div key={record.id} className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden hover:border-primary/20 transition-all flex flex-col md:flex-row items-stretch">
              <div className="p-6 flex-1 border-b md:border-b-0 md:border-r border-black/5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-[10px] font-black uppercase text-primary/40 mb-1">{t.staffName}</div>
                    <div className="text-xl font-black text-primary">{record.profiles?.full_name}</div>
                  </div>
                  <div className="bg-orange-50 text-orange-600 px-3 py-1 rounded-lg text-xs font-bold border border-orange-100 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {t.pendingHolidays}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] font-black uppercase text-primary/40 mb-1">{t.date}</div>
                    <div className="font-bold text-primary">{new Date(record.date).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase text-primary/40 mb-1">Check-in / Out</div>
                    <div className="font-bold text-primary">
                      {record.check_in ? new Date(record.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'} - 
                      {record.check_out ? new Date(record.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 bg-black/5 md:w-[350px] flex flex-col justify-center gap-4">
                <div className="grid grid-cols-1 gap-2">
                  <div className="text-[10px] font-black uppercase text-primary/40 mb-1 text-center">{t.resolve} Options</div>
                  
                  {/* Paid Options */}
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[1.5, 2.0, 3.0].map((m) => (
                      <button
                        key={m}
                        disabled={processingId === record.id || userRole === 'HR'}
                        onClick={() => handleResolve(record.id, record.staff_id, 'Paid', m)}
                        className="flex-1 bg-primary text-white px-3 py-2 rounded-xl text-xs font-black uppercase tracking-tight hover:bg-primary-light transition-all flex flex-col items-center gap-0.5 min-w-[70px] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <DollarSign className="w-3 h-3" />
                        x{m.toFixed(1)}
                      </button>
                    ))}
                  </div>

                  {/* Substitute Option */}
                  <button
                    disabled={processingId === record.id || userRole === 'HR'}
                    onClick={() => handleResolve(record.id, record.staff_id, 'Substitute')}
                    className="w-full bg-white text-primary border border-primary/20 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/5 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className="w-4 h-4" />
                    {t.substituteDay}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
