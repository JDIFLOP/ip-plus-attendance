"use client";

import { useEffect, useState } from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';

export function InAppBrowserBlocker() {
  const [isInApp, setIsInApp] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as Window & { opera?: string }).opera || '';
    // Detect Line, Facebook, Instagram, etc.
    const rules = [
      /Line/i,
      /FBAN/i,
      /FBAV/i,
      /Instagram/i,
      /Snapchat/i,
      /Twitter/i,
    ];

    if (rules.some(regex => regex.test(userAgent))) {
      // Client-only in-app-browser detection on mount; suppress the
      // setState-in-effect rule for this one-time check.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsInApp(true);
    }
  }, []);

  if (!isInApp) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
        <AlertTriangle className="w-10 h-10 text-red-500" />
      </div>
      <h1 className="text-2xl font-black text-primary tracking-tight mb-4">
        เบราว์เซอร์ไม่รองรับ
      </h1>
      <p className="text-primary/70 mb-8 max-w-sm font-medium leading-relaxed">
        เพื่อความเสถียรและแม่นยำในการระบุตำแหน่ง กรุณาเปิดระบบนี้ผ่าน <strong className="text-primary">Google Chrome</strong> หรือ <strong className="text-primary">Safari</strong> เท่านั้น
      </p>

      <div className="bg-[#f0f4f0] p-6 rounded-2xl border border-black/5 max-w-sm w-full shadow-inner mb-6">
        <h3 className="text-sm font-bold uppercase tracking-widest text-primary/50 mb-4">วิธีแก้ไข</h3>
        <ol className="text-left text-sm font-bold text-primary/80 space-y-3">
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
            แตะที่เมนู <span className="font-black text-primary">จุดสามจุด ( ⋮ )</span> มุมบนขวาของหน้าจอ
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
            เลือก <span className="font-black text-primary">&quot;เปิดในเบราว์เซอร์อื่น&quot;</span> หรือ <span className="font-black text-primary">&quot;Open in Browser&quot;</span>
          </li>
        </ol>
      </div>

      <button 
        onClick={() => {
          navigator.clipboard.writeText(window.location.href);
          alert('คัดลอกลิงก์แล้ว! กรุณานำไปวางใน Google Chrome หรือ Safari');
        }}
        className="flex items-center justify-center gap-2 w-full max-w-sm bg-primary text-white py-4 rounded-xl font-bold tracking-wide shadow-xl active:scale-95 transition-all"
      >
        <ExternalLink className="w-5 h-5" />
        คัดลอกลิงก์
      </button>
    </div>
  );
}
