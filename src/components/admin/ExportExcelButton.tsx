"use client";

import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';

/**
 * Reusable, premium "Export to Excel" button.
 *
 * Takes an `onExport` thunk (not the data + fn directly) so the caller can
 * lazily `import('@/utils/excelExport')` inside it — that keeps the heavy
 * ExcelJS bundle code-split out of the page chunk until the user actually
 * exports. The button owns the loading/spinner state and error reporting.
 */
type Variant = 'primary' | 'gold' | 'outline';

interface ExportExcelButtonProps {
  /** Runs the export. Should resolve once the .xlsx download has been triggered. */
  onExport: () => Promise<void>;
  label: string;
  loadingLabel: string;
  /** Message shown via alert() if the export throws. */
  errorLabel?: string;
  disabled?: boolean;
  variant?: Variant;
  className?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-light shadow-primary/20',
  gold: 'bg-gold text-primary hover:bg-gold/85 shadow-gold/30',
  outline: 'bg-white text-primary border border-primary/20 hover:bg-primary/5 shadow-black/5',
};

export function ExportExcelButton({
  onExport,
  label,
  loadingLabel,
  errorLabel = 'ไม่สามารถสร้างไฟล์ Excel ได้ กรุณาลองใหม่อีกครั้ง',
  disabled = false,
  variant = 'gold',
  className = '',
}: ExportExcelButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onExport();
    } catch (err) {
      console.error('Excel export failed:', err);
      alert(errorLabel);
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
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wider shadow-lg transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
      <span>{loading ? loadingLabel : label}</span>
    </button>
  );
}

export default ExportExcelButton;
