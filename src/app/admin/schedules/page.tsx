"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getStaffList, fetchMonthSchedules, batchUpsertSchedules } from '@/app/actions/admin';
import { CheckCircle, Copy, ClipboardPaste, Save, Loader2, ChevronDown } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import type { ScheduleInput } from '@/types/db';

type Staff = { id: string; full_name: string; role: string; department: string; };
type ScheduleData = { shift_start: string; shift_end: string; is_off_day: boolean; no_break: boolean; };

const SCROLL_ZONE = 60; // pixels from edge to trigger auto-scroll
const SCROLL_SPEED = 12; // pixels per frame

export default function SchedulesManagement() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [yearMonth, setYearMonth] = useState('');
  
  const [schedules, setSchedules] = useState<Record<string, ScheduleData>>({});
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  
  const [isDragging, setIsDragging] = useState(false);
  const [copiedStaffId, setCopiedStaffId] = useState<string | null>(null);

  const [tplStart, setTplStart] = useState('09:00');
  const [tplEnd, setTplEnd] = useState('17:00');
  const [tplNoBreak, setTplNoBreak] = useState(false);

  const [toast, setToast] = useState({ message: '', visible: false });
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());

  // Auto-scroll refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoScrollRAF = useRef<number | null>(null);

  const locale = 'th-TH'; // Force Thai locale as requested

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast({ message: '', visible: false }), 3000);
  };

  const loadData = useCallback(async (startD: string, endD: string) => {
    setLoading(true);
    const [staffRes, schedRes] = await Promise.all([
      getStaffList(),
      fetchMonthSchedules(startD, endD)
    ]);
    if (staffRes.data) {
      // Filter out management roles - only show Staff in schedule
      setStaff(staffRes.data.filter((s: Staff) => s.role === 'Staff'));
    }
    const schedMap: Record<string, ScheduleData> = {};
    if (schedRes.data) {
      schedRes.data.forEach((s: ScheduleInput) => {
        schedMap[`${s.staff_id}_${s.date}`] = {
          shift_start: s.shift_start ? s.shift_start.slice(0, 5) : '09:00',
          shift_end: s.shift_end ? s.shift_end.slice(0, 5) : '17:00',
          is_off_day: s.is_off_day || false,
          no_break: s.no_break || false
        };
      });
    }
    setSchedules(schedMap);
    setSelectedCells(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYearMonth(`${y}-${m}`);
    generateDays(`${y}-${m}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generateDays = (ym: string) => {
    const [y, m] = ym.split('-');
    const lastDay = new Date(parseInt(y), parseInt(m), 0);
    const dArray = [];
    for (let d = 1; d <= lastDay.getDate(); d++) {
      dArray.push(`${y}-${m}-${String(d).padStart(2, '0')}`);
    }
    setDays(dArray);
    loadData(dArray[0], dArray[dArray.length - 1]);
  };

  // --- Drag + Ctrl+Click Logic ---
  const handleMouseDown = (cellKey: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Click: toggle individual cell
      setSelectedCells(prev => {
        const next = new Set(prev);
        if (next.has(cellKey)) next.delete(cellKey);
        else next.add(cellKey);
        return next;
      });
    } else {
      // Normal click: start drag
      setIsDragging(true);
      setSelectedCells(new Set([cellKey]));
    }
  };

  const handleMouseEnter = (cellKey: string) => {
    if (isDragging) setSelectedCells(prev => new Set(prev).add(cellKey));
  };

  // --- Auto-scroll during drag ---
  const handleGridMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const xFromRight = rect.right - e.clientX;
    const xFromLeft = e.clientX - rect.left;
    const yFromBottom = rect.bottom - e.clientY;
    const yFromTop = e.clientY - rect.top;

    // Cancel any existing frame
    if (autoScrollRAF.current) cancelAnimationFrame(autoScrollRAF.current);

    let dx = 0, dy = 0;
    if (xFromRight < SCROLL_ZONE) dx = SCROLL_SPEED;
    else if (xFromLeft < SCROLL_ZONE) dx = -SCROLL_SPEED;
    if (yFromBottom < SCROLL_ZONE) dy = SCROLL_SPEED;
    else if (yFromTop < SCROLL_ZONE) dy = -SCROLL_SPEED;

    if (dx !== 0 || dy !== 0) {
      const tick = () => {
        if (!scrollContainerRef.current || !isDragging) return;
        scrollContainerRef.current.scrollLeft += dx;
        scrollContainerRef.current.scrollTop += dy;
        
        // Find element under cursor during auto-scroll
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const td = el?.closest('td');
        if (td) {
          const cellKey = td.getAttribute('data-cell-key');
          if (cellKey) {
            setSelectedCells(prev => new Set(prev).add(cellKey));
          }
        }

        autoScrollRAF.current = requestAnimationFrame(tick);
      };
      autoScrollRAF.current = requestAnimationFrame(tick);
    }
  }, [isDragging]);

  useEffect(() => {
    const stopDrag = () => {
      setIsDragging(false);
      if (autoScrollRAF.current) {
        cancelAnimationFrame(autoScrollRAF.current);
        autoScrollRAF.current = null;
      }
    };
    window.addEventListener('mouseup', stopDrag);
    return () => window.removeEventListener('mouseup', stopDrag);
  }, []);

  const handleApplyTemplate = (isOffDay: boolean) => {
    if (selectedCells.size === 0) return alert(t.selectCellsFirst);
    const nextSchedules = { ...schedules };
    selectedCells.forEach(key => {
      nextSchedules[key] = {
        shift_start: tplStart,
        shift_end: tplEnd,
        is_off_day: isOffDay,
        no_break: isOffDay ? false : tplNoBreak
      };
    });
    setSchedules(nextSchedules);
    setSelectedCells(new Set());
  };

  const handleSaveMonth = async () => {
    setSaving(true);
    const payload = [];
    for (const [key, val] of Object.entries(schedules)) {
      const lastUnderscore = key.lastIndexOf('_');
      const staffId = key.substring(0, lastUnderscore);
      const date = key.substring(lastUnderscore + 1);
      payload.push({
        staff_id: staffId,
        date: date,
        shift_start: val.shift_start + ":00",
        shift_end: val.shift_end + ":00",
        is_off_day: val.is_off_day,
        no_break: val.no_break
      });
    }
    const res = await batchUpsertSchedules(payload);
    setSaving(false);
    if (res.error) alert(res.error);
    else showToast(t.allSaved);
  };

  const toggleDept = (dept: string) => {
    const next = new Set(collapsedDepts);
    if (next.has(dept)) next.delete(dept);
    else next.add(dept);
    setCollapsedDepts(next);
  };

  const staffByDept = useMemo(() => {
    const groups: Record<string, Staff[]> = {};
    staff.forEach(s => {
      const dept = s.department || 'General';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(s);
    });
    return groups;
  }, [staff]);

  return (
    <>
      <div className={`fixed top-4 right-4 z-[100] bg-green-50 text-green-800 border border-green-200 px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 transition-all duration-300 ${toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <CheckCircle className="w-5 h-5 text-green-600" />
        <span className="font-bold">{toast.message}</span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-black/5 mb-6 gap-4 sticky top-0 z-40">
        <div>
          <h2 className="text-3xl font-extrabold text-primary tracking-tight">{t.gridTitle}</h2>
          <p className="text-primary/60 text-sm font-medium mt-1">{t.gridSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-[#f0f4f0] p-2 rounded-xl border border-primary/10">
          <input 
            type="month" value={yearMonth} onChange={(e) => {
              setYearMonth(e.target.value);
              if (e.target.value) generateDays(e.target.value);
            }}
            className="px-3 py-2 rounded-lg font-bold outline-none text-primary bg-white shadow-sm"
          />
          <div className="h-6 w-px bg-primary/20 hidden md:block"></div>
          
          <div className="flex items-center gap-2">
            <input type="time" value={tplStart} onChange={e => setTplStart(e.target.value)} className="px-2 py-1.5 rounded-md font-mono text-xs bg-white border border-primary/10 outline-none" />
            <span className="text-xs font-bold text-primary/50">→</span>
            <input type="time" value={tplEnd} onChange={e => setTplEnd(e.target.value)} className="px-2 py-1.5 rounded-md font-mono text-xs bg-white border border-primary/10 outline-none" />
            
            <label className="flex items-center gap-1.5 ml-2 mr-2 cursor-pointer">
               <input type="checkbox" checked={tplNoBreak} onChange={e => setTplNoBreak(e.target.checked)} className="accent-primary" />
               <span className="text-[10px] font-bold uppercase tracking-wide text-primary">{t.noBreak}</span>
            </label>
          </div>

          <button onClick={() => handleApplyTemplate(false)} className="bg-primary text-white text-xs font-bold px-4 py-2 rounded-lg shadow hover:bg-primary-light transition-all active:scale-95 uppercase">
            {t.paintShift}
          </button>
          <button onClick={() => handleApplyTemplate(true)} className="bg-red-50 text-red-700 text-xs font-bold px-4 py-2 rounded-lg shadow-sm border border-red-200 hover:bg-red-100 transition-all active:scale-95 uppercase">
            {t.setOff}
          </button>
        </div>

        <button 
          onClick={handleSaveMonth}
          disabled={saving}
          className="flex items-center gap-2 bg-gold text-primary hover:bg-gold/80 transition-all px-6 py-3 rounded-xl font-black uppercase tracking-wider shadow-lg active:scale-95 disabled:opacity-50 z-50"
        >
          {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} {t.saveGrid}
        </button>
      </div>

      {/* Grid */}
      <div className="bg-white border border-black/5 rounded-2xl shadow-xl flex-1 flex flex-col relative overflow-hidden h-[65vh] min-h-[500px]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary z-50"></div>
        
        {loading ? (
          <div className="flex items-center justify-center h-full text-primary font-bold opacity-50 animate-pulse">
            {t.loadingGrid}
          </div>
        ) : (
          <div 
            ref={scrollContainerRef}
            className="overflow-auto bg-[#f8f9f8] select-none flex-1 border-r border-black/5" 
            onMouseLeave={() => setIsDragging(false)}
            onMouseMove={handleGridMouseMove}
          >
              <table className="w-max border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 bg-white z-30 shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
                  <tr>
                    <th className="p-3 border-b border-r border-[#e0e4e0] min-w-[220px] text-left font-extrabold text-primary sticky left-0 z-50 bg-white shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
                      {t.staffDept}
                    </th>
                    {days.map(d => {
                      const dObj = new Date(d + 'T00:00:00');
                      const isWeekend = dObj.getDay() === 0 || dObj.getDay() === 6;
                      return (
                        <th key={d} className={`p-2 border-b border-r border-[#e0e4e0] min-w-[70px] text-center font-bold ${isWeekend ? 'bg-red-50 text-red-600' : 'bg-white text-primary'}`}>
                          <div className="text-[10px] uppercase opacity-70 mb-0.5">{dObj.toLocaleDateString(locale, {weekday: 'short'})}</div>
                          <div className="text-base leading-none">{dObj.getDate()}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(staffByDept).map(([dept, members]) => {
                    const isCollapsed = collapsedDepts.has(dept);
                    return (
                      <React.Fragment key={dept}>
                        {/* Department header row */}
                        <tr>
                          <td 
                            colSpan={days.length + 1} 
                            className="p-0 border-b border-[#e0e4e0] bg-primary/5 sticky left-0 z-40 cursor-pointer hover:bg-primary/10 transition-colors"
                            onClick={() => toggleDept(dept)}
                          >
                             <div className="flex items-center px-4 py-2 sticky left-0 w-max text-primary font-black uppercase tracking-widest text-xs">
                               <ChevronDown className={`w-4 h-4 mr-2 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                               {dept} ({members.length})
                             </div>
                          </td>
                        </tr>
                        
                        {/* Staff rows */}
                        {!isCollapsed && members.map((s) => (
                          <tr key={s.id} className="hover:bg-primary/5 transition-colors bg-white">
                            <td className="p-2 border-b border-r border-[#e0e4e0] sticky left-0 z-30 bg-white group hover:bg-[#f0f4f0] shadow-[2px_0_4px_rgba(0,0,0,0.04)] transition-colors">
                              <div className="flex items-center justify-between">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-primary truncate pr-2 leading-tight">{s.full_name}</span>
                                    <span className="text-[9px] uppercase tracking-widest font-bold text-primary/40 leading-none mt-1">{s.role}</span>
                                  </div>
                                  <div className="flex gap-1 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setCopiedStaffId(s.id); showToast(t.rowCopied); }} title="Copy" className="p-1 hover:bg-black/5 rounded text-primary"><Copy className="w-3.5 h-3.5"/></button>
                                    {copiedStaffId && (
                                      <button onClick={() => {
                                        const nextSchedules = { ...schedules };
                                        days.forEach(d => {
                                          if (schedules[`${copiedStaffId}_${d}`]) nextSchedules[`${s.id}_${d}`] = { ...schedules[`${copiedStaffId}_${d}`] };
                                        });
                                        setSchedules(nextSchedules);
                                        showToast(t.pastedSchedule);
                                      }} title="Paste" className="p-1 hover:bg-gold/20 rounded text-gold"><ClipboardPaste className="w-3.5 h-3.5"/></button>
                                    )}
                                  </div>
                              </div>
                            </td>
                            {days.map(d => {
                              const cellKey = `${s.id}_${d}`;
                              const isSelected = selectedCells.has(cellKey);
                              const cellData = schedules[cellKey];
                              
                              let cellContent = <div className="text-black/10 text-xs font-bold leading-none">-</div>;
                              let cellClass = "";
                              
                              if (cellData) {
                                if (cellData.is_off_day) {
                                  cellContent = <div className="text-red-500 font-extrabold text-[10px] tracking-widest py-1">{t.offShift}</div>;
                                  cellClass = "bg-red-50";
                                } else {
                                  cellContent = (
                                    <div className="flex flex-col items-center gap-0.5 relative">
                                      {cellData.no_break && <span className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-gold" title={t.noBreak}></span>}
                                      <span className="text-[10px] font-mono font-bold text-primary leading-none">{cellData.shift_start}</span>
                                      <span className="text-[10px] font-mono font-bold text-primary/50 leading-none">{cellData.shift_end}</span>
                                    </div>
                                  );
                                  cellClass = "bg-green-50/40";
                                }
                              }

                              return (
                                <td 
                                  key={d} 
                                  data-cell-key={cellKey}
                                  className={`border-b border-r border-[#e0e4e0] text-center cursor-crosshair transition-colors select-none p-1 ${isSelected ? 'bg-primary/20 ring-1 ring-inset ring-primary' : cellClass} hover:ring-2 hover:ring-primary/40`}
                                  onMouseDown={(e) => handleMouseDown(cellKey, e)}
                                  onMouseOver={() => handleMouseEnter(cellKey)}
                                >
                                  <div className="h-9 flex items-center justify-center">
                                    {cellContent}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })}
                </tbody>
             </table>
          </div>
        )}
      </div>
    </>
  );
}
