"use client";

import { useState, useEffect } from 'react';
import { getAuditLogs } from '@/app/actions/admin';
import { Loader2, Database } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

type AuditLog = {
  id: string;
  user_id: string | null;
  performed_by: string | null;
  action: string;
  record_id: string | null;
  table_name: string | null;
  old_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: string;
};

export default function AuditLogs() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    const { data } = await getAuditLogs();
    if (data) setLogs(data);
    setLoading(false);
  };

  return (
    <>
      <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-black/5 mb-8 gap-4 sticky top-0 z-10">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">{t.navAudit}</h2>
          <p className="text-primary/60 text-sm font-medium mt-1">บันทึกการดำเนินการทุกอย่างในระบบ — ไม่สามารถแก้ไขย้อนหลังได้</p>
        </div>
      </div>

      <div className="bg-white border border-black/5 rounded-2xl shadow-xl overflow-hidden flex-1 relative min-h-[400px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-primary min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin opacity-50 mb-3" />
            <span className="font-bold opacity-50">{t.syncingData}</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-primary font-medium opacity-50 min-h-[400px]">
            {t.noLogs}
          </div>
        ) : (
          <div className="overflow-auto p-2 max-h-[750px]">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-[#f0f4f0] text-primary sticky top-0 z-10 text-xs font-bold uppercase tracking-widest border-b border-primary/10">
                <tr>
                  <th className="px-6 py-5">{t.timestamp}</th>
                  <th className="px-6 py-5">ผู้ดำเนินการ</th>
                  <th className="px-6 py-5">{t.actionType}</th>
                  <th className="px-6 py-5 text-center">{t.tableAffected}</th>
                  <th className="px-6 py-5">{t.auditReason}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-primary/5 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm font-bold text-primary">
                      {new Date(log.created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-primary/80">
                      {log.performed_by || 'ระบบ'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-extrabold uppercase tracking-widest">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center justify-center gap-1.5 px-2 py-1 bg-black/5 rounded text-xs font-bold text-primary/60 uppercase">
                        <Database className="w-3 h-3" />
                        {log.table_name || 'ระบบ'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-primary/80">
                         {log.reason || `แก้ไขรายการ ID: ${log.record_id || 'ทั่วโลก'}`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
