"use client";

import { useState, useEffect } from 'react';
import { getSystemSettings, updateSystemSettings, getPublicHolidays, upsertPublicHoliday, deletePublicHoliday, reassignDepartment } from '@/app/actions/admin';
import { Save, MapPin, Clock, Loader2, CheckCircle, Calculator, Wifi, BadgeDollarSign, Calendar, Plus, Trash2, Pencil } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import HolidayCalendar, { type Holiday } from '@/components/admin/HolidayCalendar';
import { IP_LOOKUP_URL } from '@/config/app';

interface VillaLocation { lat: number; lng: number; radius_m: number; }
interface OtConfig { threshold_mins: number; }
interface PayrollConfig { start_day: number; end_day: number; break_duration_mins: number; }
interface WifiConfig { allowed_ip: string; ssid_hint: string; }
interface PayrollRules {
  late_grace_mins: number;
  late_deduct_per_min: number;
  ot_rate_per_hour: number;
  sso_rate: number;
  sso_cap: number;
}
interface Department { name: string; max_headcount: number; budget_limit: number; }

interface SystemSettings {
  villa_location: VillaLocation;
  ot_config: OtConfig;
  payroll_config: PayrollConfig;
  wifi_config: WifiConfig;
  payroll_rules: PayrollRules;
  departments_config: Department[];
}

export default function SettingsManagement() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SystemSettings>({
    villa_location: { lat: 12.9235, lng: 100.8824, radius_m: 100 },
    ot_config: { threshold_mins: 15 },
    payroll_config: { start_day: 25, end_day: 24, break_duration_mins: 60 },
    wifi_config: { allowed_ip: '', ssid_hint: 'IP PLUS WiFi' },
    payroll_rules: { late_grace_mins: 5, late_deduct_per_min: 2, ot_rate_per_hour: 50, sso_rate: 5, sso_cap: 750 },
    departments_config: [
      { name: 'General', max_headcount: 5, budget_limit: 100000 }
    ]
  });
  const [toast, setToast] = useState<{ message: string, visible: boolean }>({ message: '', visible: false });
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newDepartment, setNewDepartment] = useState({ name: '', max_headcount: 5, budget_limit: 100000 });

  const loadHolidays = async () => {
    const { data } = await getPublicHolidays();
    if (data) setHolidays(data);
  };

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await getSystemSettings();
    if (data) {
      setSettings((prev) => ({
        villa_location: data.villa_location || prev.villa_location,
        ot_config: data.ot_config || prev.ot_config,
        payroll_config: data.payroll_config || prev.payroll_config,
        wifi_config: data.wifi_config || prev.wifi_config,
        payroll_rules: data.payroll_rules || prev.payroll_rules,
        departments_config: data.departments_config || prev.departments_config
      }));
    }
    setLoading(false);
  };

  useEffect(() => {
    // Fetch initial settings + holidays once on mount. loadSettings flips the
    // `loading` flag synchronously, which the lint rule flags; this is the
    // intended one-time fetch-on-mount pattern, so the warning is suppressed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSettings();
    loadHolidays();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await updateSystemSettings(settings);
    setSaving(false);
    if (res && res.success) {
      setToast({ message: t.settingsSaved, visible: true });
      setTimeout(() => setToast({ message: '', visible: false }), 3000);
    }
  };

  // Auto-compute end day from start day if not explicitly set, but we allow manual now
  const startDay = 1;
  const endDay = 31;

  const getCycleRange = (sDay: number, eDay: number) => {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();

    const startDate = new Date(currentYear, currentMonth, sDay);
    let endDate;
    
    if (eDay === 31 || (sDay === 1 && eDay >= 28)) {
      // Treat 31 as Last day of current month
      endDate = new Date(currentYear, currentMonth + 1, 0);
    } else {
      // Next month if end_day is smaller than start_day
      const monthOffset = eDay < sDay ? 1 : 0;
      endDate = new Date(currentYear, currentMonth + monthOffset, eDay);
    }

    return {
      start: startDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }),
      end: endDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
    };
  };

  const cycleDates = getCycleRange(startDay, endDay);

  return (
    <>
      <div className={`fixed top-4 right-4 z-[100] bg-green-50 text-green-800 border border-green-200 px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 transition-all duration-300 ${toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <CheckCircle className="w-5 h-5 text-green-600" />
        <span className="font-bold">{toast.message}</span>
      </div>

      <div className="flex flex-wrap justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-black/5 mb-8 gap-4 sticky top-0 z-10">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">{t.settingsTitle}</h2>
          <p className="text-primary/60 text-sm font-medium mt-1">{t.settingsSub}</p>
        </div>
      </div>

      <div className="bg-white border border-black/5 rounded-2xl shadow-xl overflow-hidden flex-1 relative max-w-4xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 text-primary">
            <Loader2 className="w-8 h-8 animate-spin opacity-50 mb-3" />
            <span className="font-bold opacity-50">กำลังโหลดข้อมูล...</span>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-8 space-y-12">

            {/* Geofencing Section */}
            <section>
              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-primary/10">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <MapPin className="w-4 h-4" />
                </div>
                <h3 className="text-xl font-bold text-primary">{t.geofencing}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.latitude}</label>
                  <input
                    type="number" step="any" required
                    value={settings.villa_location.lat}
                    onChange={(e) => setSettings({ ...settings, villa_location: { ...settings.villa_location, lat: parseFloat(e.target.value) } })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.longitude}</label>
                  <input
                    type="number" step="any" required
                    value={settings.villa_location.lng}
                    onChange={(e) => setSettings({ ...settings, villa_location: { ...settings.villa_location, lng: parseFloat(e.target.value) } })}
                    className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.radius}</label>
                  <div className="flex items-center gap-4">
                    <input
                      type="range" min="1" max="100" step="1"
                      value={settings.villa_location.radius_m}
                      onChange={(e) => setSettings({ ...settings, villa_location: { ...settings.villa_location, radius_m: parseInt(e.target.value) } })}
                      className="flex-1 accent-primary"
                    />
                    <div className="bg-primary/10 text-primary font-bold px-4 py-2 rounded-xl text-lg min-w-[5rem] text-center border-2 border-primary/20">
                      {settings.villa_location.radius_m}m
                    </div>
                  </div>
                  <p className="text-xs text-primary/50 mt-2 font-medium">{t.radiusHelp}</p>
                </div>
              </div>
            </section>

            {/* Timings Section */}
            <section>
              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-primary/10">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-xl font-bold text-primary">{t.shiftOt}</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.otThreshold}</label>
                  <div className="relative">
                    <input
                      type="number" min="0" required
                      value={settings.ot_config.threshold_mins}
                      onChange={(e) => setSettings({ ...settings, ot_config: { ...settings.ot_config, threshold_mins: parseInt(e.target.value) } })}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono text-lg"
                    />
                  </div>
                  <p className="text-xs text-primary/50 mt-2 font-medium">{t.otHelp}</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.breakDeduct}</label>
                  <div className="relative">
                    <input
                      type="number" min="0" required
                      value={settings.payroll_config?.break_duration_mins || 60}
                      onChange={(e) => setSettings({ ...settings, payroll_config: { ...settings.payroll_config, break_duration_mins: parseInt(e.target.value) } })}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono text-lg"
                    />
                  </div>
                  <p className="text-xs text-primary/50 mt-2 font-medium">{t.breakHelp}</p>
                </div>
              </div>
            </section>

            {/* Payroll Section */}
            <section>
              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-primary/10">
                <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold">
                  <Calculator className="w-4 h-4" />
                </div>
                <h3 className="text-xl font-bold text-primary">{t.payrollCycle}</h3>
              </div>

              <div className="grid grid-cols-1 gap-6 text-center text-primary/60 font-medium text-sm">
                <p>รอบการจ่ายเงินเดือนจะเริ่มคำนวณตั้งแต่วันที่ 1 ไปจนถึงวันสุดท้ายของเดือนโดยอัตโนมัติ</p>
              </div>

              {/* Visual Cycle Diagram */}
              <div className="mt-6 bg-[#f8f9f8] border border-black/5 rounded-xl p-6">
                <h4 className="text-xs font-bold text-primary/50 mb-4 uppercase tracking-widest text-center">{t.estimatedCycle}</h4>
                <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                  <div className="bg-white border border-black/10 text-primary px-6 py-3 rounded-xl shadow-sm text-center min-w-[200px]">
                    <div className="text-[10px] font-bold uppercase opacity-50 mb-1">{t.startDate}</div>
                    <div className="font-bold">{cycleDates.start}</div>
                  </div>
                  <div className="h-8 w-px md:w-8 md:h-px bg-primary/20 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                    </div>
                  </div>
                  <div className="bg-white border border-black/10 text-primary px-6 py-3 rounded-xl shadow-sm text-center min-w-[200px]">
                    <div className="text-[10px] font-bold uppercase opacity-50 mb-1">{t.endDate}</div>
                    <div className="font-bold">{cycleDates.end}</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Payroll Rules Section */}
            <section>
              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-primary/10">
                <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center text-gold">
                  <BadgeDollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary">{t.payrollRules}</h3>
                  <p className="text-xs text-primary/50 mt-0.5">เวลาผ่อนผัน อัตราหัก OT และประกันสังคม</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.lateGrace}</label>
                  <div className="relative">
                    <input
                      type="number" min="0" max="60" required
                      value={settings.payroll_rules?.late_grace_mins ?? 5}
                      onChange={(e) => setSettings({ ...settings, payroll_rules: { ...settings.payroll_rules, late_grace_mins: parseInt(e.target.value) } })}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono text-lg"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-primary/40 uppercase">min</span>
                  </div>
                  <p className="text-xs text-primary/50 mt-2 font-medium">พนักงานที่มาภายในช่วงเวลานี้จะไม่ถูกหักค่าแรงงานสาย</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.lateDeductRate}</label>
                  <div className="relative">
                    <input
                      type="number" min="0" step="0.5" required
                      value={settings.payroll_rules?.late_deduct_per_min ?? 2}
                      onChange={(e) => setSettings({ ...settings, payroll_rules: { ...settings.payroll_rules, late_deduct_per_min: parseFloat(e.target.value) } })}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono text-lg"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-primary/40 uppercase">฿/min</span>
                  </div>
                  <p className="text-xs text-primary/50 mt-2 font-medium">หักต่อนาทีที่สายเกินช่วงผ่อนผัน</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.otRatePerHour}</label>
                  <div className="relative">
                    <input
                      type="number" min="0" step="1" required
                      value={settings.payroll_rules?.ot_rate_per_hour ?? 50}
                      onChange={(e) => setSettings({ ...settings, payroll_rules: { ...settings.payroll_rules, ot_rate_per_hour: parseFloat(e.target.value) } })}
                      className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono text-lg"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-primary/40 uppercase">฿/hr</span>
                  </div>
                  <p className="text-xs text-primary/50 mt-2 font-medium">บวกเพิ่มในค่าจ้างสำหรับทุกชั่วโมง OT ที่ได้รับอนุมัติ</p>
                </div>

                {/* SSO Config */}
                <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 mt-2 pt-6 border-t border-black/5">
                  <div>
                    <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">อัตราประกันสังคม (%)</label>
                    <div className="relative">
                      <input
                        type="number" min="0" max="100" step="0.1" required
                        value={settings.payroll_rules?.sso_rate ?? 5}
                        onChange={(e) => setSettings({ ...settings, payroll_rules: { ...settings.payroll_rules, sso_rate: parseFloat(e.target.value) } })}
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono text-lg"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-primary/40 uppercase">%</span>
                    </div>
                    <p className="text-xs text-primary/50 mt-2 font-medium">อัตราหักประกันสังคม (ค่าเริ่มต้น 5%)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">อัตราสูงสุดประกันสังคม</label>
                    <div className="relative">
                      <input
                        type="number" min="0" step="1" required
                        value={settings.payroll_rules?.sso_cap ?? 750}
                        onChange={(e) => setSettings({ ...settings, payroll_rules: { ...settings.payroll_rules, sso_cap: parseFloat(e.target.value) } })}
                        className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono text-lg"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-primary/40 uppercase">THB</span>
                    </div>
                    <p className="text-xs text-primary/50 mt-2 font-medium">ยอดหักประกันสังคมสูงสุดต่อเดือน (ค่าเริ่มต้น 750 ฿)</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Public Holidays Section */}
            <section>
              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-primary/10">
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary">{t.publicHolidays}</h3>
                  <p className="text-xs text-primary/50 mt-0.5">จัดการวันหยุดนักขัตฤกษ์สำหรับคำนวณเงินเดือนแบบพิเศษ</p>
                </div>
              </div>

              <HolidayCalendar 
                holidays={holidays}
                onAddHoliday={async (holiday) => {
                  const res = await upsertPublicHoliday(holiday);
                  if (res.error) alert(`Error saving holiday: ${res.error}`);
                  await loadHolidays();
                }}
                onDeleteHoliday={async (id) => {
                  const res = await deletePublicHoliday(id);
                  if (res.error) alert(`Error deleting holiday: ${res.error}`);
                  await loadHolidays();
                }}
              />
            </section>

            {/* Department Configuration Section */}
            <section>
              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-primary/10">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary">ตั้งค่าแผนก</h3>
                  <p className="text-xs text-primary/50 mt-0.5">กำหนดจำนวนพนักงานสูงสุดและงบประมาณแต่ละแผนก</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-black/5 rounded-xl">
                <div>
                  <label className="block text-[10px] font-black uppercase text-primary/40 mb-1">ชื่อแผนก</label>
                  <input
                    type="text"
                    placeholder="เช่น แผนกแม่บ้าน"
                    value={newDepartment.name}
                    onChange={(e) => setNewDepartment({ ...newDepartment, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-white font-bold text-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-primary/40 mb-1">จำนวนคนสูงสุด</label>
                  <input
                    type="number"
                    min="1"
                    value={newDepartment.max_headcount}
                    onChange={(e) => setNewDepartment({ ...newDepartment, max_headcount: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-white font-bold text-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-primary/40 mb-1">งบประมาณ (บาท)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={newDepartment.budget_limit}
                      onChange={(e) => setNewDepartment({ ...newDepartment, budget_limit: parseInt(e.target.value) || 0 })}
                      className="flex-1 px-3 py-2 rounded-lg border border-black/10 focus:ring-2 focus:ring-primary outline-none bg-white font-bold text-primary"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newDepartment.name) return;
                        
                        const existingIdx = (settings.departments_config || []).findIndex((d) => d.name.toLowerCase() === newDepartment.name.toLowerCase());

                        const newConfig = [...(settings.departments_config || [])];
                        if (existingIdx >= 0) {
                          // Update existing
                          newConfig[existingIdx] = { ...newDepartment };
                        } else {
                          // Add new
                          newConfig.push({ ...newDepartment });
                        }

                        setSettings({
                          ...settings,
                          departments_config: newConfig
                        });
                        setNewDepartment({ name: '', max_headcount: 5, budget_limit: 100000 });
                      }}
                      className="bg-primary text-white p-2 rounded-lg hover:bg-primary-light transition-all shadow-lg shadow-primary/20"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {(settings.departments_config || []).map((dept, idx) => (
                  <div key={`${dept.name}-${idx}`} className="flex items-center justify-between p-3 bg-white border border-black/5 rounded-xl hover:border-primary/20 transition-all group">
                    <div className="grid grid-cols-3 w-full items-center gap-4">
                      <span className="font-bold text-primary">{dept.name}</span>
                      <div className="text-xs font-bold text-primary/60">
                        สูงสุด: <span className="text-primary">{dept.max_headcount}</span>
                      </div>
                      <div className="text-xs font-bold text-primary/60">
                        งบประมาณ: <span className="text-primary">{dept.budget_limit.toLocaleString()} บาท</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setNewDepartment({ ...dept });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="text-primary hover:text-primary-light opacity-0 group-hover:opacity-100 transition-opacity p-2"
                        title="แก้ไข"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (confirm(`คุณแน่ใจหรือไม่ที่จะลบแผนก "${dept.name}"? พนักงานทั้งหมดในแผนกนี้จะถูกเปลี่ยนเป็น "General" (ไม่มีแผนก) อัตโนมัติ`)) {
                            
                            // Reassign all staff in DB immediately
                            await reassignDepartment(dept.name, 'General');

                            const newConfig = [...settings.departments_config];
                            newConfig.splice(idx, 1);
                            setSettings({ ...settings, departments_config: newConfig });
                          }
                        }}
                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                        title="ลบ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Network Security Section */}
            <section>
              <div className="flex items-center gap-3 mb-6 pb-2 border-b border-primary/10">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary">{t.networkSecurity}</h3>
                  <p className="text-xs text-primary/50 mt-0.5">{t.networkSecuritySub}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.allowedIp}</label>
                  <input
                    type="text"
                    value={settings.wifi_config?.allowed_ip || ''}
                    onChange={(e) => setSettings({ ...settings, wifi_config: { ...settings.wifi_config, allowed_ip: e.target.value.trim() } })}
                    placeholder="e.g. 203.144.182.10"
                    className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary font-mono"
                  />
                  <p className="text-xs text-primary/50 mt-2 font-medium">{t.allowedIpHelp}</p>
                </div>
                <div>
                  <label className="block text-sm font-bold text-primary mb-2 uppercase tracking-wide">{t.ssidHint}</label>
                  <input
                    type="text"
                    value={settings.wifi_config?.ssid_hint || ''}
                    onChange={(e) => setSettings({ ...settings, wifi_config: { ...settings.wifi_config, ssid_hint: e.target.value } })}
                    placeholder="e.g. VillaPool-5G"
                    className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none transition-all bg-black/5 font-bold text-primary"
                  />
                  <p className="text-xs text-primary/50 mt-2 font-medium">{t.ssidHintHelp}</p>
                </div>
              </div>

              {/* Live IP display for Admin convenience */}
              <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center gap-3">
                <Wifi className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="text-xs text-blue-700">
                  <span className="font-bold">IP ผู้ดูแลขณะนี้: </span>
                  <span id="admin-ip-display" className="font-mono">กำลังโหลด...</span>
                  <button
                    type="button"
                    className="ml-3 text-blue-600 underline font-bold"
                    onClick={async () => {
                      const r = await fetch(IP_LOOKUP_URL);
                      const d = await r.json();
                      const el = document.getElementById('admin-ip-display');
                      if (el) el.textContent = d.ip;
                    }}
                  >
                    {t.fetchIp}
                  </button>
                </div>
              </div>
            </section>

            <div className="pt-8 border-t border-black/10 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-primary hover:bg-primary-light transition-all text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:shadow-primary/40 active:scale-95 disabled:opacity-50"
              >
                <Save className="w-5 h-5 mb-0.5" />
                {saving ? '...' : t.saveSettings}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
