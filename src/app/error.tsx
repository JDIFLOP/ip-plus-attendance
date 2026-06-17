"use client";

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Route-level error boundary (Thai). Catches unhandled render/data-fetch errors
 * anywhere in the app segment and shows a graceful fallback + retry instead of a
 * white screen.
 *
 * Intentionally self-contained — it does NOT depend on I18nContext or other app
 * state, because an error boundary must keep working even when that context is
 * the thing that failed. (This is a deliberate exception to the i18n rule.)
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-[#f8f9f8]">
      <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-5">
        <AlertTriangle className="w-8 h-8 text-red-500" />
      </div>
      <h1 className="text-2xl font-black text-primary mb-2">เกิดข้อผิดพลาด</h1>
      <p className="text-primary/60 font-medium max-w-sm mb-6 leading-relaxed">
        ระบบพบปัญหาที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง หากยังพบปัญหา กรุณาติดต่อผู้ดูแลระบบ
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="bg-primary hover:bg-primary-light text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
      >
        ลองใหม่อีกครั้ง
      </button>
    </div>
  );
}
