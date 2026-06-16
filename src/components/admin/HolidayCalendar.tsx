"use client";

import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

const STANDARD_HOLIDAYS: Record<string, string> = {
  '01-01': "New Year's Day",
  '04-13': "Songkran Festival",
  '04-14': "Songkran Festival",
  '04-15': "Songkran Festival",
  '05-01': "National Labor Day",
  '07-28': "King's Birthday",
  '08-12': "Queen Mother's Birthday",
  '10-13': "King Bhumibol Memorial Day",
  '10-23': "Chulalongkorn Day",
  '12-05': "Father's Day",
  '12-10': "Constitution Day",
  '12-31': "New Year's Eve"
};

const MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

export interface Holiday {
  id: string;
  date: string;
  name: string;
}

interface HolidayCalendarProps {
  holidays: Holiday[];
  onAddHoliday: (holiday: { date: string, name: string }) => Promise<void>;
  onDeleteHoliday: (id: string) => Promise<void>;
}

export default function HolidayCalendar({ holidays, onAddHoliday, onDeleteHoliday }: HolidayCalendarProps) {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [isStandard, setIsStandard] = useState(false);
  const [standardName, setStandardName] = useState('');
  const [processing, setProcessing] = useState(false);

  // Helper to format date as YYYY-MM-DD
  const formatDate = (year: number, month: number, day: number) => {
    const m = (month + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${year}-${m}-${d}`;
  };

  // Helper to get MM-DD
  const getMMDD = (month: number, day: number) => {
    const m = (month + 1).toString().padStart(2, '0');
    const d = day.toString().padStart(2, '0');
    return `${m}-${d}`;
  };

  const handleDayClick = (year: number, month: number, day: number) => {
    const dateStr = formatDate(year, month, day);
    const existing = holidays.find(h => h.date === dateStr);

    if (existing) {
      if (confirm(`คุณต้องการลบวันหยุด "${existing.name}" ออกจากระบบหรือไม่?`)) {
        onDeleteHoliday(existing.id);
      }
      return;
    }

    const mmdd = getMMDD(month, day);
    const stdHoliday = STANDARD_HOLIDAYS[mmdd];
    
    setSelectedDate(dateStr);
    if (stdHoliday) {
      setIsStandard(true);
      setStandardName(stdHoliday);
      setNote(stdHoliday);
    } else {
      setIsStandard(false);
      setStandardName('');
      setNote('');
    }
  };

  const handleSaveNote = async () => {
    if (!selectedDate) return;
    if (!isStandard && !note.trim()) {
      alert("กรุณาระบุเหตุผลหรือชื่อวันหยุดที่กำหนดเอง");
      return;
    }
    setProcessing(true);
    await onAddHoliday({ date: selectedDate, name: note.trim() || standardName });
    setProcessing(false);
    setSelectedDate(null);
    setNote('');
  };

  const renderMonth = (monthIndex: number) => {
    const firstDay = new Date(currentYear, monthIndex, 1).getDay();
    const daysInMonth = new Date(currentYear, monthIndex + 1, 0).getDate();
    
    const blanks = Array(firstDay).fill(null);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <div key={monthIndex} className="bg-white border border-black/5 rounded-xl p-3 shadow-sm flex flex-col">
        <h4 className="font-bold text-primary text-center mb-2 uppercase tracking-widest text-xs">{MONTH_NAMES[monthIndex]}</h4>
        <div className="grid grid-cols-7 gap-1 text-[10px] font-black text-primary/40 text-center mb-1">
          <div>อา.</div><div>จ.</div><div>อ.</div><div>พ.</div><div>พฤ.</div><div>ศ.</div><div>ส.</div>
        </div>
        <div className="grid grid-cols-7 gap-1 flex-1">
          {blanks.map((_, i) => <div key={`blank-${i}`} />)}
          {days.map(day => {
            const dateStr = formatDate(currentYear, monthIndex, day);
            const mmdd = getMMDD(monthIndex, day);
            const stdHoliday = STANDARD_HOLIDAYS[mmdd];
            const isCompanyHoliday = holidays.find(h => h.date === dateStr);
            
            let bgClass = "bg-black/5 hover:bg-primary/10 text-primary";
            let tooltip = stdHoliday ? `วันหยุดมาตรฐาน: ${stdHoliday}` : '';
            
            if (isCompanyHoliday) {
              tooltip = `วันหยุดบริษัท: ${isCompanyHoliday.name}`;
              if (stdHoliday) {
                // Standard holiday marked as company holiday
                bgClass = "bg-green-500 hover:bg-green-600 text-white shadow-sm";
              } else {
                // Custom company holiday
                bgClass = "bg-blue-500 hover:bg-blue-600 text-white shadow-sm";
              }
            } else if (stdHoliday) {
              // Standard holiday NOT marked
              bgClass = "bg-gold/20 hover:bg-gold/40 text-gold-dark border border-gold/30";
            }

            return (
              <div 
                key={day} 
                className="relative group aspect-square flex items-center justify-center cursor-pointer"
                onClick={() => handleDayClick(currentYear, monthIndex, day)}
              >
                <div className={`w-full h-full rounded-md flex items-center justify-center text-xs font-bold transition-all ${bgClass}`}>
                  {day}
                </div>
                {tooltip && (
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                    {tooltip}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between bg-black/5 p-4 rounded-xl">
        <div className="flex items-center gap-4">
          <button onClick={() => setCurrentYear(y => y - 1)} className="p-2 bg-white rounded-lg shadow-sm hover:scale-105 transition-transform">
            <ChevronLeft className="w-5 h-5 text-primary" />
          </button>
          <h3 className="text-2xl font-black text-primary font-mono">{currentYear}</h3>
          <button onClick={() => setCurrentYear(y => y + 1)} className="p-2 bg-white rounded-lg shadow-sm hover:scale-105 transition-transform">
            <ChevronRight className="w-5 h-5 text-primary" />
          </button>
        </div>
        
        <div className="flex items-center gap-4 text-xs font-bold">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-green-500"></div> <span className="text-primary/60">มาตรฐาน (เปิดใช้งาน)</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-500"></div> <span className="text-primary/60">กำหนดเอง (เปิดใช้งาน)</span></div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-gold/20 border border-gold/30"></div> <span className="text-primary/60">มาตรฐาน (ไม่ได้เลือก)</span></div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 12 }, (_, i) => renderMonth(i))}
      </div>

      {/* Modal for adding a holiday */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <CalendarIcon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h4 className="font-extrabold text-lg text-primary leading-tight">กำหนดวันหยุด</h4>
                <p className="text-xs font-bold text-primary/40 font-mono">{selectedDate}</p>
              </div>
            </div>
            
            <div className="space-y-4">
              {isStandard && (
                <div className="bg-gold/10 text-gold-dark p-3 rounded-xl text-xs font-bold">
                  วันหยุดราชการ: {standardName}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-black text-primary mb-1 uppercase tracking-widest">
                  เหตุผล / ชื่อวันหยุด {!isStandard && <span className="text-red-500">*</span>}
                </label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder={isStandard ? "เหตุผลเพิ่มเติม (ไม่บังคับ)..." : "เหตุผล (บังคับระบุ)"}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-black/10 focus:ring-2 focus:ring-primary outline-none font-bold text-primary bg-black/5"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button 
                  onClick={() => setSelectedDate(null)}
                  className="flex-1 py-3 rounded-xl font-bold text-primary hover:bg-black/5 transition-colors border border-black/10"
                >
                  ยกเลิก
                </button>
                <button 
                  disabled={processing || (!isStandard && !note.trim())}
                  onClick={handleSaveNote}
                  className="flex-1 py-3 rounded-xl font-bold text-white bg-primary hover:bg-primary-light transition-colors disabled:opacity-50"
                >
                  {processing ? 'กำลังบันทึก...' : 'ยืนยัน'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
