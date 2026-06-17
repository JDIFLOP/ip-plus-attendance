"use client";

import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';

/**
 * Reusable "Export to Excel" button.
 *
 * Generic over the dataset shape: pass the `data` plus the matching export
 * function from `@/utils/excelExport` (e.g. `exportPayrollSummary`). The button
 * owns the loading/spinner state while the .xlsx file is generated client-side.
 *
 * Note: the project doesn't ship shadcn/ui's Button primitive, so this is styled
 * with Tailwind to match the app's existing primary buttons; swap in a shadcn
 * <Button> here if/when that component is added.
 */
interface ExportExcelButtonProps<T> {
  /** The dataset handed to `exportFn`. */
  data: T;
  /** An export helper, e.g. `exportPayrollSummary`. */
  exportFn: (data: T) => Promise<void>;
  /** Button label (keep it Thai to match the UI). */
  label?: string;
  /** Disable the button regardless of loading state (e.g. empty dataset). */
  disabled?: boolean;
  className?: string;
}

export function ExportExcelButton<T>({
  data,
  exportFn,
  label = 'ส่งออก Excel',
  disabled = false,
  className = '',
}: ExportExcelButtonProps<T>) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await exportFn(data);
    } catch (err) {
      console.error('Excel export failed:', err);
      alert('ไม่สามารถสร้างไฟล์ Excel ได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-light active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileSpreadsheet className="h-4 w-4" />
      )}
      <span>{loading ? 'กำลังสร้างไฟล์...' : label}</span>
    </button>
  );
}

export default ExportExcelButton;
