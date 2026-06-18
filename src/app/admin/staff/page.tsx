"use client";

import { useState, useEffect } from 'react';
import { getStaffOnlyList, upsertStaff, deleteStaff, resetDeviceBinding, getWarningLetters, issueWarningLetter, getSystemSettings, getLeaveHistory } from '@/app/actions/admin';
import { UserPlus, Pencil, Trash2, Smartphone, Loader2, Info, AlertTriangle, Plane } from 'lucide-react';
import type { AttendanceRecord } from '@/types/db';
import { useI18n } from '@/context/I18nContext';
import { ExportExcelButton } from '@/components/admin/ExportExcelButton';

type Staff = {
  id: string;
  full_name: string;
  nationality: string;
  role: string;
  department: string;
  wage_type: string;
  rate: number;
  device_id: string | null;
  birthday: string | null;
  substitute_leave_quota: number;
  warning_count?: number;
  created_at: string;
  social_security_enabled?: boolean;
  sso_type?: string;
  sso_value?: number;
  guarantee_target?: number;
  guarantee_monthly?: number;
  guarantee_accumulated?: number;
  guarantee_status?: string;
};

interface WarningRow {
  id: string;
  reason: string;
  severity_level: string;
  date: string;
}

export default function StaffManagement() {
  const { t } = useI18n();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Partial<Staff>>({});
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'payroll' | 'disciplinary' | 'leave'>('info');
  const [warnings, setWarnings] = useState<WarningRow[]>([]);
  const [leaveHistory, setLeaveHistory] = useState<AttendanceRecord[]>([]);
  const [newWarning, setNewWarning] = useState({ reason: '', severity_level: 'Low' });
  const [loadingWarnings, setLoadingWarnings] = useState(false);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [departments, setDepartments] = useState<string[]>(['General']);

  useEffect(() => {
    loadStaff();
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    const { data } = await getSystemSettings();
    if (data && data.departments_config && Array.isArray(data.departments_config)) {
      const names = data.departments_config.map((d) => d.name);
      setDepartments(Array.from(new Set(['General', ...names])));
    } else {
      setDepartments(['General']);
    }
  };

  const loadStaff = async () => {
    setLoading(true);
    const { data } = await getStaffOnlyList();
    if (data) {
      // In a real app, we'd join with warning_letters count. For now, let's just use data.
      setStaff(data as Staff[]);
    }
    setLoading(false);
  };

  const loadWarnings = async (staffId: string) => {
    setLoadingWarnings(true);
    const { data } = await getWarningLetters(staffId);
    if (data) setWarnings(data);
    setLoadingWarnings(false);
  };

  const loadLeaves = async (staffId: string) => {
    setLoadingLeaves(true);
    const { data } = await getLeaveHistory(staffId);
    if (data) setLeaveHistory(data);
    setLoadingLeaves(false);
  };

  const openNewStaffModal = () => {
    setEditingStaff({ 
      full_name: '', nationality: 'Thai', role: 'Staff', department: 'General', wage_type: 'Monthly', rate: 0, birthday: null, substitute_leave_quota: 0,
      social_security_enabled: false, sso_type: 'Percentage', sso_value: 5, guarantee_target: 0, guarantee_monthly: 0, guarantee_accumulated: 0, guarantee_status: 'Deduct Monthly'
    });
    setActiveTab('info');
    setIsModalOpen(true);
  };

  const openEditModal = (s: Staff) => {
    setEditingStaff(s);
    setActiveTab('info');
    setWarnings([]);
    setLeaveHistory([]);
    if (s.id) {
      loadWarnings(s.id);
      loadLeaves(s.id);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Ensure role is always Staff when saved from this page
      const res = await upsertStaff({ ...editingStaff, role: 'Staff' });
      
      if (res.error) {
        alert(res.error);
      } else {
        setIsModalOpen(false);
        loadStaff();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this staff member? This will cascade delete their schedule and attendance records.')) return;
    const res = await deleteStaff(id);
    if (res.error) {
      alert(`Error deleting staff: ${res.error}`);
    } else {
      loadStaff();
    }
  };

  const handleResetBinding = async (id: string, name: string) => {
    if (!confirm(`Reset device binding for ${name}? They will need to re-verify location on their next check-in.`)) return;
    const res = await resetDeviceBinding(id);
    if (!res.error) loadStaff();
  };

  const handleExportStaff = async () => {
    const { exportStaffDirectory } = await import('@/utils/excelExport');
    await exportStaffDirectory({
      rows: staff.map((s) => ({
        full_name: s.full_name,
        department: s.department,
        role: s.role,
        nationality: s.nationality,
        wage_type: s.wage_type,
        rate: s.rate,
        device_id: s.device_id,
        substitute_leave_quota: s.substitute_leave_quota,
      })),
    });
  };

  return (
    <>
      <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-black/5 mb-8 gap-4 sticky top-0 z-10">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">{t.manageStaff}</h2>
          <p className="text-primary/60 text-sm font-medium mt-1">{t.manageStaffSub}</p>
        </div>

        <div className="flex items-center gap-3">
          <ExportExcelButton
            variant="outline"
            label={t.exportStaffList}
            loadingLabel={t.exporting}
            disabled={loading || staff.length === 0}
            onExport={handleExportStaff}
          />
          <button
            onClick={openNewStaffModal}
            className="flex items-center gap-2 bg-primary hover:bg-primary-light focus:ring-4 focus:ring-primary/20 transition-all text-white px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-wider shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-[0.98]"
          >
            <UserPlus className="w-5 h-5" /> {t.addStaff}
          </button>
        </div>
      </div>

      <div className="bg-white border border-black/5 rounded-2xl shadow-xl overflow-hidden flex-1 relative min-h-[400px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-primary min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin opacity-50 mb-3" />
            <span className="font-bold opacity-50">กำลังโหลดรายชื่อพนักงาน...</span>
          </div>
        ) : staff.length === 0 ? (
          <div className="flex items-center justify-center h-full text-primary font-medium opacity-50 min-h-[400px]">
            ไม่พบข้อมูลพนักงาน กดปุ่ม &quot;เพิ่มพนักงาน&quot; เพื่อเริ่มต้น
          </div>
        ) : (
          <div className="overflow-auto p-2">
            <table className="w-full text-left border-collapse min-w-max">
              <thead className="bg-white text-primary sticky top-0 z-10 text-xs font-bold uppercase tracking-widest border-b-2 border-primary/10">
                <tr>
                  <th className="px-6 py-5">{t.fullName}</th>
                  <th className="px-6 py-5">{t.department}</th>
                  <th className="px-6 py-5">{t.wageType}</th>
                  <th className="px-6 py-5 text-center">{t.deviceBinding}</th>
                  <th className="px-6 py-5 text-right">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/5">
                {staff.map((s) => (
                  <tr key={s.id} className="even:bg-black/[0.015] hover:bg-primary/5 transition-colors group">
                    <td className="px-6 py-4 font-bold text-primary flex items-center gap-2">
                      {s.full_name}
                      {s.warning_count && s.warning_count > 0 ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 bg-red-100 text-red-600 rounded-full" title={`${s.warning_count} Warning Letters`}>
                          <AlertTriangle className="w-3 h-3" />
                        </span>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-primary/50">{s.department}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="text-primary font-bold text-sm">{s.wage_type}</span>
                        <span className="text-gold font-bold text-xs uppercase bg-gold/10 px-2 py-0.5 rounded">฿{s.rate} {s.wage_type === 'Monthly' ? '/ Mo' : s.wage_type === 'Daily' ? '/ Day' : '/ Hr'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {s.device_id ? (
                         <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-800 text-xs font-bold px-2.5 py-1 rounded-full">
                           {t.deviceBound}
                         </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 bg-yellow-100 text-yellow-800 text-xs font-bold px-2.5 py-1 rounded-full">
                           {t.deviceUnbound}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {s.device_id && (
                        <button 
                          onClick={() => handleResetBinding(s.id, s.full_name)}
                          className="p-2 text-primary/50 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-colors border border-transparent hover:border-orange-200 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide"
                          title="Reset Device Binding"
                        >
                          <Smartphone className="w-4 h-4" /> {t.resetDevice}
                        </button>
                      )}
                      <button 
                        onClick={() => openEditModal(s)}
                        className="p-2 text-primary/50 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors border border-transparent hover:border-primary/20"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(s.id)}
                        className="p-2 text-red-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Staff Editor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 border border-primary/20">
            <div className="bg-primary px-6 pt-6 text-white">
              <h3 className="text-2xl font-bold tracking-tight mb-4">{editingStaff.id ? t.editStaff : t.addNewStaff}</h3>
              <div className="flex gap-4">
                <button 
                  onClick={() => setActiveTab('info')}
                  className={`pb-2 px-1 text-sm font-bold uppercase tracking-widest transition-all border-b-4 ${activeTab === 'info' ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-100'}`}
                >
                  {t.info}
                </button>
                {editingStaff.id && (
                  <>
                    {editingStaff.role === 'Staff' && (
                      <button 
                        onClick={() => setActiveTab('payroll')}
                        className={`pb-2 px-1 text-sm font-bold uppercase tracking-widest transition-all border-b-4 ${activeTab === 'payroll' ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-100'}`}
                      >
                        เงินเดือน
                      </button>
                    )}
                    <button 
                      onClick={() => setActiveTab('disciplinary')}
                      className={`pb-2 px-1 text-sm font-bold uppercase tracking-widest transition-all border-b-4 ${activeTab === 'disciplinary' ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-100'}`}
                    >
                      {t.disciplinary}
                    </button>
                    <button 
                      onClick={() => setActiveTab('leave')}
                      className={`pb-2 px-1 text-sm font-bold uppercase tracking-widest transition-all border-b-4 ${activeTab === 'leave' ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-100'}`}
                    >
                      ประวัติการลา
                    </button>
                  </>
                )}
              </div>
            </div>
            
            {activeTab === 'info' ? (
              <form onSubmit={handleSave} className="p-6 space-y-5">
                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700 font-medium leading-relaxed">{t.deviceCaptureHint}</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.fullName}</label>
                  <input 
                    type="text" 
                    required
                    value={editingStaff.full_name || ''}
                    onChange={(e) => setEditingStaff({...editingStaff, full_name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-medium text-primary" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.birthday}</label>
                    <input 
                      type="date" 
                      value={editingStaff.birthday || ''}
                      onChange={(e) => setEditingStaff({...editingStaff, birthday: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-medium text-primary" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.substituteLeave}</label>
                    <input 
                      type="number" 
                      value={editingStaff.substitute_leave_quota || 0}
                      onChange={(e) => setEditingStaff({...editingStaff, substitute_leave_quota: parseInt(e.target.value)})}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-medium text-primary" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-2 border-t border-black/5">
                  <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">รหัสอุปกรณ์</label>
                  <input 
                    type="text" 
                    value={editingStaff.device_id || ''}
                    onChange={(e) => setEditingStaff({...editingStaff, device_id: e.target.value})}
                    placeholder="ผูกอัตโนมัติเมื่อล็อกอินครั้งแรก"
                    className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-mono text-primary text-sm" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.department}</label>
                    <select 
                      value={editingStaff.department || 'General'}
                      onChange={(e) => setEditingStaff({...editingStaff, department: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-[#f8f9f8] font-bold text-primary appearance-none cursor-pointer"
                    >
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.nationality}</label>
                    <select 
                      value={editingStaff.nationality || 'Thai'}
                      onChange={(e) => setEditingStaff({...editingStaff, nationality: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-medium text-primary appearance-none cursor-pointer"
                    >
                      <option value="Thai">{t.thai}</option>
                      <option value="Myanmar">{t.myanmar}</option>
                      <option value="Other">{t.other}</option>
                    </select>
                  </div>
                </div>

                {editingStaff.role === 'Staff' && (
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-black/5">
                    <div>
                      <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.wageType}</label>
                      <select 
                        value={editingStaff.wage_type || 'Monthly'}
                        onChange={(e) => setEditingStaff({...editingStaff, wage_type: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-[#f8f9f8] font-bold text-primary appearance-none cursor-pointer"
                      >
                        <option value="Monthly">{t.monthly}</option>
                        <option value="Daily">{t.daily}</option>
                        <option value="Hourly">{t.hourly}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-primary mb-1.5 uppercase tracking-wide">{t.rate}</label>
                      <input 
                        type="number" min="0" step="1"
                        value={editingStaff.rate || 0}
                        onChange={(e) => setEditingStaff({...editingStaff, rate: parseFloat(e.target.value)})}
                        className="w-full px-4 py-3 rounded-xl border border-gold/40 focus:ring-2 focus:ring-gold outline-none transition-all bg-gold/5 font-mono font-bold text-primary" 
                      />
                    </div>
                  </div>
                )}
                
                <div className="pt-4 flex gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-3 rounded-xl text-primary font-bold border border-primary/20 hover:bg-primary/5 transition-colors uppercase tracking-wide"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-light transition-colors uppercase tracking-wide disabled:opacity-50"
                  >
                    {saving ? '...' : t.saveStaff}
                  </button>
                </div>
              </form>
            ) : activeTab === 'payroll' ? (
              <form onSubmit={handleSave} className="p-6 space-y-5">
                {/* Social Security */}
                <div className="bg-white border border-black/10 p-4 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-primary">ประกันสังคม (SSO)</h4>
                      <p className="text-xs text-primary/50 font-medium">เปิดใช้งานการหักประกันสังคมอัตโนมัติ</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" className="sr-only peer"
                        checked={editingStaff.social_security_enabled || false}
                        onChange={(e) => setEditingStaff({...editingStaff, social_security_enabled: e.target.checked})}
                      />
                      <div className="w-11 h-6 bg-black/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                  </div>

                  {editingStaff.social_security_enabled && (
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-black/5">
                      <div>
                        <label className="block text-xs font-bold text-primary/60 mb-1 uppercase tracking-wide">ประเภทการหัก</label>
                        <select
                          value={editingStaff.sso_type || 'Percentage'}
                          onChange={(e) => setEditingStaff({...editingStaff, sso_type: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-white font-bold text-primary text-sm appearance-none cursor-pointer"
                        >
                          <option value="Percentage">เปอร์เซ็นต์ (%)</option>
                          <option value="Fixed">จำนวนคงที่ (฿)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-primary/60 mb-1 uppercase tracking-wide">
                          {editingStaff.sso_type === 'Fixed' ? 'จำนวนเงิน (฿)' : 'อัตรา (%)'}
                        </label>
                        <input
                          type="number" min="0" step={editingStaff.sso_type === 'Fixed' ? '50' : '0.5'}
                          value={editingStaff.sso_value ?? (editingStaff.sso_type === 'Fixed' ? 750 : 5)}
                          onChange={(e) => setEditingStaff({...editingStaff, sso_value: parseFloat(e.target.value) || 0})}
                          className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-black/5 font-mono font-bold text-primary text-sm"
                        />
                        {editingStaff.sso_type === 'Percentage' && (
                          <p className="text-[10px] text-primary/40 mt-1">สูงสุดไม่เกิน 750 ฿</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Guarantee Deposit */}
                <div className="bg-white border border-black/10 p-4 rounded-xl space-y-4">
                  <h4 className="text-sm font-bold text-primary">เงินประกันทำงาน</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-primary/60 mb-1 uppercase tracking-wide">ยอดเป้าหมาย (บาท)</label>
                      <input 
                        type="number" min="0" step="100"
                        value={editingStaff.guarantee_target || 0}
                        onChange={(e) => setEditingStaff({...editingStaff, guarantee_target: parseInt(e.target.value) || 0})}
                        className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-black/5 font-mono font-bold text-primary text-sm" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary/60 mb-1 uppercase tracking-wide">หักต่อเดือน (บาท)</label>
                      <input 
                        type="number" min="0" step="100"
                        value={editingStaff.guarantee_monthly || 0}
                        onChange={(e) => setEditingStaff({...editingStaff, guarantee_monthly: parseInt(e.target.value) || 0})}
                        className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-black/5 font-mono font-bold text-primary text-sm" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-black/5 pt-4">
                    <div>
                      <label className="block text-xs font-bold text-primary/60 mb-1 uppercase tracking-wide">สะสมแล้ว (บาท)</label>
                      <div className="px-3 py-2 rounded-lg border border-gold/40 bg-gold/5 font-mono font-bold text-gold text-sm">
                        {(editingStaff.guarantee_accumulated || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-primary/60 mb-1 uppercase tracking-wide">สถานะ</label>
                      <select 
                        value={editingStaff.guarantee_status || 'Deduct Monthly'}
                        onChange={(e) => setEditingStaff({...editingStaff, guarantee_status: e.target.value})}
                        className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-white font-bold text-primary text-sm appearance-none cursor-pointer"
                      >
                        <option value="Deduct Monthly">Deduct Monthly</option>
                        <option value="Paid in Full">Paid in Full</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button 
                    type="button" onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-3 rounded-xl text-primary font-bold border border-primary/20 hover:bg-primary/5 transition-colors uppercase tracking-wide"
                  >
                    {t.cancel}
                  </button>
                  <button 
                    type="submit" disabled={saving}
                    className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary-light transition-colors uppercase tracking-wide disabled:opacity-50"
                  >
                    {saving ? '...' : t.saveStaff}
                  </button>
                </div>
              </form>
            ) : activeTab === 'disciplinary' ? (
              <div className="p-6 space-y-6">
                {/* Warning List */}
                <div className="space-y-3">
                   <h4 className="text-xs font-black uppercase text-primary/40 tracking-widest">{t.warningLetters} ({warnings.length})</h4>
                   {loadingWarnings ? (
                     <div className="p-4 text-center opacity-30"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
                   ) : warnings.length === 0 ? (
                     <p className="text-sm italic text-primary/30">ไม่มีประวัติการเตือน</p>
                   ) : (
                     <div className="max-h-[200px] overflow-auto space-y-2 pr-2">
                       {warnings.map((w, idx) => (
                         <div key={idx} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${w.severity_level === 'High' ? 'bg-red-500 text-white' : w.severity_level === 'Medium' ? 'bg-orange-400 text-white' : 'bg-gold text-white'}`}>
                                {w.severity_level}
                              </span>
                              <span className="text-[10px] font-bold text-primary/40 font-mono">{new Date(w.date).toLocaleDateString()}</span>
                            </div>
                            <p className="text-xs font-bold text-primary/80">{w.reason}</p>
                         </div>
                       ))}
                     </div>
                   )}
                </div>

                {/* Issue New Warning Form */}
                <div className="pt-6 border-t border-black/5 space-y-4">
                  <h4 className="text-xs font-black uppercase text-primary/40 tracking-widest">{t.issueWarning}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <textarea
                        value={newWarning.reason}
                        onChange={(e) => setNewWarning({...newWarning, reason: e.target.value})}
                        placeholder="Reason for warning..."
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-red-500 outline-none transition-all bg-black/5 text-sm font-medium"
                        rows={3}
                      />
                    </div>
                    <select
                      value={newWarning.severity_level}
                      onChange={(e) => setNewWarning({...newWarning, severity_level: e.target.value})}
                      className="px-4 py-2 rounded-xl border border-black/10 focus:ring-2 focus:ring-red-500 outline-none bg-black/5 text-xs font-bold uppercase"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                    <button
                      onClick={async () => {
                        if (!newWarning.reason) return;
                        await issueWarningLetter({ ...newWarning, staff_id: editingStaff.id });
                        setNewWarning({ reason: '', severity_level: 'Low' });
                        loadWarnings(editingStaff.id!);
                        loadStaff(); // Refresh counts
                      }}
                      className="bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase hover:bg-red-600 transition-colors"
                    >
                      {t.issueWarning}
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    type="button"
                    onClick={() => setActiveTab('info')}
                    className="w-full py-3 bg-primary text-white font-bold rounded-xl"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            ) : activeTab === 'leave' ? (
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                     <Plane className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-primary">ประวัติการลาทั้งหมด</h3>
                    <p className="text-[10px] font-black uppercase text-primary/40 tracking-widest">สะสม: {leaveHistory.length} วัน</p>
                  </div>
                </div>

                <div className="bg-white border border-black/10 rounded-xl overflow-hidden shadow-sm">
                  {loadingLeaves ? (
                    <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary/40" /></div>
                  ) : leaveHistory.length === 0 ? (
                    <div className="p-12 text-center text-sm italic text-primary/30">ไม่เคยมีประวัติการลา</div>
                  ) : (
                    <div className="max-h-[350px] overflow-auto divide-y divide-black/5">
                      {leaveHistory.map((leave, idx) => (
                        <div key={idx} className="p-4 hover:bg-black/5 transition-colors">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-mono text-xs font-black text-primary">{new Date(leave.date).toLocaleDateString()}</span>
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${leave.is_paid_leave ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {leave.is_paid_leave ? 'ได้รับค่าจ้าง' : 'หักเงินเดือน'}
                            </span>
                          </div>
                          <div className="text-sm font-bold text-primary mb-1">{leave.leave_type || 'ไม่ระบุประเภท'}</div>
                          {leave.leave_reason && (
                            <p className="text-xs text-primary/60 italic">{leave.leave_reason}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button 
                    type="button"
                    onClick={() => setActiveTab('info')}
                    className="w-full py-3 bg-primary text-white font-bold rounded-xl"
                  >
                    กลับไปหน้าหลัก
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
