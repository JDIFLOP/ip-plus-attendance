/**
 * Centralized Excel (.xlsx) export helpers for the Pool Villa payroll/attendance
 * system, built on ExcelJS + file-saver. Runs client-side (imported by the
 * `ExportExcelButton` client component).
 *
 * Conventions:
 *  - All timestamps/dates are rendered in Asia/Bangkok (UTC+7).
 *  - Currency columns use the Thai Baht accounting format `฿#,##0.00`.
 *  - Header rows: dark-navy fill, bold white text, frozen at the top.
 *  - Every data cell gets a thin light-gray border; columns auto-fit content.
 *  - Totals / Net Pay use NATIVE Excel formulas, never pre-computed numbers.
 */

import { Workbook } from 'exceljs';
import type { Borders, CellValue, Worksheet, WorksheetViewFrozen } from 'exceljs';
import { saveAs } from 'file-saver';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Thai Baht currency format (symbol quoted so Excel treats it literally). */
const CURRENCY_FMT = '"฿"#,##0.00';
const HOURS_FMT = '0.00';

const HEADER_FILL_ARGB = 'FF1F2A44'; // dark navy
const HEADER_FONT_ARGB = 'FFFFFFFF'; // white
const BORDER_ARGB = 'FFD9D9D9'; // light gray
const TOTAL_FILL_ARGB = 'FFEFF1F5'; // subtle gray

const BANGKOK_TZ = 'Asia/Bangkok';

const thinBorder: Partial<Borders> = {
  top: { style: 'thin', color: { argb: BORDER_ARGB } },
  left: { style: 'thin', color: { argb: BORDER_ARGB } },
  bottom: { style: 'thin', color: { argb: BORDER_ARGB } },
  right: { style: 'thin', color: { argb: BORDER_ARGB } },
};

// ---------------------------------------------------------------------------
// Timezone-safe formatting (UTC+7)
// ---------------------------------------------------------------------------

function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `YYYY-MM-DD` in Asia/Bangkok. Already date-only strings pass through. */
function formatDate(value: string | Date | null | undefined): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-CA', { timeZone: BANGKOK_TZ }) : '';
}

/** `HH:mm` (24h) in Asia/Bangkok. */
function formatTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d
    ? d.toLocaleTimeString('en-GB', {
        timeZone: BANGKOK_TZ,
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';
}

// ---------------------------------------------------------------------------
// Shared styling helpers
// ---------------------------------------------------------------------------

function cellTextLength(value: CellValue): number {
  if (value == null) return 0;
  if (value instanceof Date) return 10;
  if (typeof value === 'object') {
    const v = value as { result?: unknown; text?: string; formula?: string };
    return String(v.result ?? v.text ?? v.formula ?? '').length;
  }
  return String(value).length;
}

function autoFitColumns(ws: Worksheet, min = 10, max = 48, padding = 2): void {
  ws.columns.forEach((column) => {
    let width = min;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const len = cellTextLength(cell.value) + padding;
      if (len > width) width = len;
    });
    column.width = Math.min(width, max);
  });
}

function styleHeaderRow(ws: Worksheet, rowNumber = 1): void {
  const row = ws.getRow(rowNumber);
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_ARGB }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL_ARGB } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });
}

function applyBorders(ws: Worksheet): void {
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder;
    });
  });
}

interface FinalizeOptions {
  /** Number of leading columns to freeze (in addition to the header row). */
  freezeCols?: number;
  /** Row number of a totals row to emphasize (bold + subtle fill). */
  totalRowNumber?: number;
}

function finalizeSheet(ws: Worksheet, opts: FinalizeOptions = {}): void {
  const { freezeCols = 0, totalRowNumber } = opts;

  // Freeze the header row (and optionally leading columns). Gridlines are shown
  // by default, satisfying the "gridlines visible" requirement.
  const view: WorksheetViewFrozen = { state: 'frozen', xSplit: freezeCols, ySplit: 1 };
  ws.views = [view];

  applyBorders(ws);
  styleHeaderRow(ws, 1);

  if (totalRowNumber) {
    const totalRow = ws.getRow(totalRowNumber);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL_ARGB } };
    });
  }

  autoFitColumns(ws);
}

function createWorkbook(): Workbook {
  const wb = new Workbook();
  wb.creator = 'Pool Villa Staff Management';
  wb.created = new Date();
  return wb;
}

async function downloadWorkbook(wb: Workbook, baseName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], { type: XLSX_MIME });
  saveAs(blob, `${baseName}_${formatDate(new Date())}.xlsx`);
}

// ---------------------------------------------------------------------------
// 1) Attendance report
// ---------------------------------------------------------------------------

export interface AttendanceExportRow {
  staffName: string;
  date: string | Date;
  clockIn: string | Date | null;
  clockOut: string | Date | null;
  totalHours: number;
}

export async function exportAttendanceReport(rows: AttendanceExportRow[]): Promise<void> {
  const wb = createWorkbook();
  const ws = wb.addWorksheet('Attendance');

  ws.columns = [
    { header: 'Staff Name', key: 'staffName', width: 24 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Clock-In', key: 'clockIn', width: 12 },
    { header: 'Clock-Out', key: 'clockOut', width: 12 },
    { header: 'Total Hours', key: 'totalHours', width: 14 },
  ];

  rows.forEach((r) => {
    ws.addRow({
      staffName: r.staffName,
      date: formatDate(r.date),
      clockIn: formatTime(r.clockIn),
      clockOut: formatTime(r.clockOut),
      totalHours: Number(r.totalHours) || 0,
    });
  });

  let totalRowNumber: number | undefined;
  if (rows.length > 0) {
    const lastDataRow = rows.length + 1;
    totalRowNumber = lastDataRow + 1;
    const totalRow = ws.getRow(totalRowNumber);
    totalRow.getCell(1).value = 'TOTAL';
    totalRow.getCell(5).value = { formula: `SUM(E2:E${lastDataRow})` };
  }

  ws.getColumn(5).numFmt = HOURS_FMT;

  finalizeSheet(ws, { totalRowNumber });
  await downloadWorkbook(wb, 'attendance-report');
}

// ---------------------------------------------------------------------------
// 2) Work schedule (calendar / shift view by Department and Day)
// ---------------------------------------------------------------------------

export interface ScheduleShiftRow {
  department: string;
  staffName: string;
  /** date string (matching one of `days`) -> shift label, e.g. "09:00-17:00" / "OFF". */
  shifts: Record<string, string>;
}

export interface WorkScheduleData {
  /** Ordered date strings rendered as day columns. */
  days: string[];
  rows: ScheduleShiftRow[];
}

export async function exportWorkSchedule(data: WorkScheduleData): Promise<void> {
  const wb = createWorkbook();
  const ws = wb.addWorksheet('Work Schedule');

  ws.columns = [
    { header: 'Department', key: 'department', width: 18 },
    { header: 'Staff Name', key: 'staffName', width: 24 },
    ...data.days.map((d, i) => ({ header: formatDate(d), key: `day_${i}`, width: 12 })),
  ];

  // Organize by Department, then Staff Name.
  const sorted = [...data.rows].sort(
    (a, b) =>
      a.department.localeCompare(b.department) || a.staffName.localeCompare(b.staffName),
  );

  sorted.forEach((row) => {
    const record: Record<string, string> = {
      department: row.department,
      staffName: row.staffName,
    };
    data.days.forEach((d, i) => {
      record[`day_${i}`] = row.shifts[d] ?? 'OFF';
    });
    ws.addRow(record);
  });

  // Center the shift cells (columns after Department + Staff Name).
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell((cell, colNumber) => {
      if (colNumber > 2) cell.alignment = { horizontal: 'center' };
    });
  });

  // Freeze the Department + Staff Name columns and the header row.
  finalizeSheet(ws, { freezeCols: 2 });
  await downloadWorkbook(wb, 'work-schedule');
}

// ---------------------------------------------------------------------------
// 3) Payroll summary (native formulas for Net Pay + column totals)
// ---------------------------------------------------------------------------

export interface PayrollExportRow {
  staffName: string;
  baseSalary: number;
  otPay: number;
  allowances: number;
  ssoDeduction: number;
  guaranteeDeduction: number;
}

export async function exportPayrollSummary(rows: PayrollExportRow[]): Promise<void> {
  const wb = createWorkbook();
  const ws = wb.addWorksheet('Payroll Summary');

  ws.columns = [
    { header: 'Staff Name', key: 'staffName', width: 24 },
    { header: 'Base Salary', key: 'baseSalary', width: 16 },
    { header: 'OT Pay', key: 'otPay', width: 14 },
    { header: 'Allowances', key: 'allowances', width: 14 },
    { header: 'SSO Deduction', key: 'ssoDeduction', width: 16 },
    { header: 'Guarantee Deduction', key: 'guaranteeDeduction', width: 20 },
    { header: 'Net Pay', key: 'netPay', width: 18 },
  ];

  rows.forEach((r) => {
    ws.addRow({
      staffName: r.staffName,
      baseSalary: Number(r.baseSalary) || 0,
      otPay: Number(r.otPay) || 0,
      allowances: Number(r.allowances) || 0,
      ssoDeduction: Number(r.ssoDeduction) || 0,
      guaranteeDeduction: Number(r.guaranteeDeduction) || 0,
    });
  });

  const firstDataRow = 2;
  const lastDataRow = rows.length + 1;

  // Net Pay = (Base + OT + Allowances) - (SSO + Guarantee), as a native formula.
  for (let n = firstDataRow; n <= lastDataRow; n += 1) {
    ws.getCell(`G${n}`).value = { formula: `(B${n}+C${n}+D${n})-(E${n}+F${n})` };
  }

  // Column totals via native SUM (no hardcoded numbers).
  let totalRowNumber: number | undefined;
  if (rows.length > 0) {
    totalRowNumber = lastDataRow + 1;
    const totalRow = ws.getRow(totalRowNumber);
    totalRow.getCell(1).value = 'TOTAL';
    (['B', 'C', 'D', 'E', 'F', 'G'] as const).forEach((col) => {
      totalRow.getCell(col).value = {
        formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`,
      };
    });
  }

  // Thai Baht currency format for every money column (B..G).
  [2, 3, 4, 5, 6, 7].forEach((c) => {
    ws.getColumn(c).numFmt = CURRENCY_FMT;
  });

  finalizeSheet(ws, { totalRowNumber });
  await downloadWorkbook(wb, 'payroll-summary');
}
