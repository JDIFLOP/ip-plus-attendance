"use client";

import { useState, useEffect, type ReactNode } from 'react';
import { getMonthlySummary, getOverviewStats } from '@/app/actions/admin';
import { Users, Activity, Loader2, Calendar, Gift, UserCheck, UserX, Clock, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import type { Department, StaffPayrollSummary } from '@/types/db';

interface OverviewStats {
  stats: { total: number; present: number; late: number; absent: number; onLeave: number };
  nextHoliday: { name: string; date: string } | null;
  upcomingBirthdays: { id: string; full_name: string; birthday: string; role: string }[];
  departmentsConfig: Department[];
}

interface DeptStat {
  name: string;
  totalStaff: number;
  checkedIn: number;
  onLeave: number;
  currentBudget: number;
  maxHeadcount: number;
  budgetLimit: number;
}

export default function OverviewDashboard() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [departmentStats, setDepartmentStats] = useState<DeptStat[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const statsRes = await getOverviewStats();
    if (statsRes && !('error' in statsRes)) {
      setOverview(statsRes);
      await fetchDepartmentStats(statsRes);
    }
    setLoading(false);
  };

  const fetchDepartmentStats = async (overviewData: OverviewStats) => {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const res = await getMonthlySummary(firstDay, lastDay);
    if (res.data) {
      const depts: Record<string, DeptStat> = {};
      
      // Initialize with config defaults
      if (overviewData?.departmentsConfig) {
        overviewData.departmentsConfig.forEach((c: Department) => {
           depts[c.name] = { 
             name: c.name, 
             totalStaff: 0, 
             checkedIn: 0, 
             onLeave: 0,
             currentBudget: 0,
             maxHeadcount: c.max_headcount || 0,
             budgetLimit: c.budget_limit || 0
           };
        });
      }

      res.data.forEach((staff: StaffPayrollSummary) => {
        if (staff.role !== 'Staff') return; // Only count Staff role in department capacity
        
        const d = staff.department || 'General';
        if (!depts[d]) {
           depts[d] = { 
             name: d, 
             totalStaff: 0, 
             checkedIn: 0, 
             onLeave: 0, 
             currentBudget: 0,
             maxHeadcount: 0,
             budgetLimit: 0
           };
        }
        
        depts[d].totalStaff += 1;
        const todayLog = staff.logs.find((l) => l.date === today);
        if (todayLog && todayLog.is_leave) depts[d].onLeave += 1;
        if (todayLog && todayLog.check_in && !todayLog.is_leave) {
          depts[d].checkedIn += 1;
        }
        
        depts[d].currentBudget += (staff.calculatedPay || 0);
      });
      setDepartmentStats(Object.values(depts));
    }
  };

  return (
    <>
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-black/5 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">{t.overviewTitle}</h2>
          <p className="text-primary/60 text-sm font-medium mt-1">{t.overviewSub}</p>
        </div>
      </div>

      {loading ? (
         <div className="flex flex-col items-center justify-center p-20 text-primary bg-white rounded-2xl shadow-xl">
           <Loader2 className="w-8 h-8 animate-spin opacity-50 mb-3" />
           <span className="font-bold opacity-50">{t.syncCapacity}</span>
         </div>
      ) : (
        <div className="space-y-8">
          {/* Stats Widgets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <StatWidget label={t.totalStaff} value={overview?.stats?.total} icon={<Users />} color="bg-primary" />
            <StatWidget label={t.presentToday} value={overview?.stats?.present} icon={<UserCheck />} color="bg-green-500" />
            <StatWidget label={t.lateToday} value={overview?.stats?.late} icon={<Clock />} color="bg-gold" />
            <StatWidget label={t.absentToday} value={overview?.stats?.absent} icon={<UserX />} color="bg-red-500" />
            <StatWidget label={t.onLeaveToday} value={overview?.stats?.onLeave} icon={<Calendar />} color="bg-blue-500" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Capacity Cards */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-primary uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  {t.deptCapacity}
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-6">
                {departmentStats.map((dept, idx) => {
                  const hcMax = dept.maxHeadcount || dept.totalStaff;
                  const hcProgress = hcMax > 0 ? Math.round((dept.totalStaff / hcMax) * 100) : 0;
                  const bdProgress = dept.budgetLimit > 0 ? Math.round((dept.currentBudget / dept.budgetLimit) * 100) : 0;
                  
                  let bdColor = "bg-green-500";
                  let bdText = "text-green-600";
                  if (bdProgress >= 90) { bdColor = "bg-red-500"; bdText = "text-red-600"; }
                  else if (bdProgress >= 75) { bdColor = "bg-gold"; bdText = "text-gold"; }

                  let hcColor = "bg-blue-500";
                  if (hcProgress >= 100) hcColor = "bg-red-500";
                  else if (hcProgress >= 80) hcColor = "bg-gold";

                  return (
                    <div key={idx} className="bg-white border border-black/5 rounded-2xl shadow-sm p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
                      <div className="flex-shrink-0 w-full md:w-1/4">
                        <h3 className="font-extrabold text-xl text-primary">{dept.name}</h3>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary/40 mt-1">
                          {dept.checkedIn} Present Today
                        </p>
                      </div>

                      <div className="flex-1 w-full space-y-4">
                        {/* Headcount Bar */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-primary/60 uppercase tracking-wider">{t.headcount}</span>
                            <span className="text-xs font-black text-primary font-mono">{dept.totalStaff} / {hcMax}</span>
                          </div>
                          <div className="w-full bg-black/5 rounded-full h-2 overflow-hidden">
                            <div className={`h-2 rounded-full ${hcColor} transition-all duration-1000`} style={{ width: `${Math.min(hcProgress, 100)}%` }}></div>
                          </div>
                        </div>

                        {/* Budget Bar */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-primary/60 uppercase tracking-wider">{t.salaryBudget}</span>
                            <span className={`text-xs font-black font-mono ${bdText}`}>
                              {dept.currentBudget.toLocaleString()} / {dept.budgetLimit > 0 ? dept.budgetLimit.toLocaleString() : '∞'} THB
                            </span>
                          </div>
                          <div className="w-full bg-black/5 rounded-full h-2 overflow-hidden">
                            <div className={`h-2 rounded-full ${bdColor} transition-all duration-1000`} style={{ width: `${Math.min(bdProgress, 100)}%` }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Events Sidebar */}
            <div className="space-y-6">
              <h3 className="text-xl font-black text-primary uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                {t.upcomingEvents}
              </h3>
              
              {/* Next Holiday Card */}
              <div className="bg-red-50 border border-red-100 rounded-2xl p-6 relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-110 transition-transform duration-700">
                  <ShieldAlert className="w-32 h-32 text-red-900" />
                </div>
                <div className="relative z-10">
                  <div className="text-[10px] font-black uppercase text-red-400 mb-1">{t.nextHoliday}</div>
                  <div className="text-xl font-black text-red-900 mb-4">{overview?.nextHoliday?.name || t.noUpcomingHolidays}</div>
                  {overview?.nextHoliday && (
                    <div className="bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-red-200 inline-block">
                      <div className="text-sm font-black text-red-900 font-mono">
                        {new Date(overview.nextHoliday.date).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Birthdays Card */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-[10px] font-black uppercase text-blue-400">{t.staffBirthdays}</div>
                  <Gift className="w-4 h-4 text-blue-400" />
                </div>
                <div className="space-y-3">
                  {overview && overview.upcomingBirthdays.length > 0 ? (
                    overview.upcomingBirthdays.map((s, i) => (
                      <div key={i} className="flex items-center justify-between bg-white/50 p-2 rounded-lg border border-blue-100">
                        <span className="font-bold text-sm text-blue-900">{s.full_name}</span>
                        <span className="text-[10px] font-black text-blue-400 font-mono">{new Date(s.birthday).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-blue-400 font-bold italic">No birthdays this month</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatWidget({ label, value, icon, color }: { label: string, value?: number, icon: ReactNode, color: string }) {
  return (
    <div className="bg-white border border-black/5 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 group">
      <div className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center text-white shadow-lg shadow-${color.split('-')[1]}/20 group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <div>
        <div className="text-[10px] font-black uppercase text-primary/40 leading-none mb-1">{label}</div>
        <div className="text-3xl font-black text-primary leading-none">{value || 0}</div>
      </div>
    </div>
  );
}
