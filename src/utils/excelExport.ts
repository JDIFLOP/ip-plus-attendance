/**
 * Print-ready Excel export helpers (IP PLUS Pool Villa).
 *
 * These build fully-styled `.xlsx` workbooks with ExcelJS — thick borders,
 * colour fills, frozen panes, currency formats — so the exported files can be
 * printed and pinned to the wall as a physical roster / payroll sheet. Plain CSV
 * cannot carry the colours and borders, which is why ExcelJS is used here.
 *
 * CLIENT-ONLY module: ExcelJS resolves to its browser bundle and `file-saver`
 * triggers the download. Import it lazily from a click handler
 * (`const m = await import('@/utils/excelExport')`) so the heavy ExcelJS payload
 * is code-split out of the initial admin bundle and only fetched on demand.
 *
 * Document text is intentionally hard-coded in Thai: these are fixed print
 * templates for a Thai workplace, not interactive UI. (The AGENTS.md I18n rule
 * targets page components / live UI; button labels still go through I18n.)
 */

import { Workbook } from 'exceljs';
import type { Border, Cell, FillPattern, Worksheet } from 'exceljs';
import { saveAs } from 'file-saver';

// ---- Brand palette (ARGB — note the leading FF alpha byte) ------------------
const C = {
  primary: 'FF123512',
  primaryLight: 'FF1B4D1B',
  gold: 'FFD4AF37',
  white: 'FFFFFFFF',
  // Shift colour-coding
  morning: 'FFD6E9F8', // light blue  — เช้า
  afternoon: 'FFE2F0D9', // light green — บ่าย / กลางวัน
  night: 'FF4A3F8F', // dark blue/purple — ดึก (white text)
  off: 'FFD9D9D9', // gray — วันหยุด
  // Calendar tints
  weekendHeader: 'FFB23A48', // muted red header for Sat/Sun
  holidayHeader: 'FF8C1D2C', // deeper red header for public holidays
  weekendCell: 'FFFBEEF0', // very light red wash on empty weekend body cells
  // Tables
  deptBand: 'FFEDEFED',
  zebra: 'FFF4F6F4',
  totalBand: 'FFFFF7E0',
  netCell: 'FFE8F5E9',
  netText: 'FF1B5E20',
  gridLine: 'FFBFBFBF',
} as const;

const FONT = 'Tahoma'; // renders Thai glyphs reliably across Excel installs
const CURRENCY_FMT = '#,##0.00';

// ---- Small styling helpers --------------------------------------------------

const solid = (argb: string): FillPattern => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
});

const thin: Partial<Border> = { style: 'thin', color: { argb: C.gridLine } };
const thick: Partial<Border> = { style: 'medium', color: { argb: C.primary } };

/**
 * Draw a framed table: a thick brand-coloured outer perimeter with thin inner
 * gridlines. Merged cells inside the region (titles / department bands) only
 * ever render their own perimeter in Excel, so running this across them is safe.
 */
function frameTable(ws: Worksheet, top: number, left: number, bottom: number, right: number) {
  for (let r = top; r <= bottom; r++) {
    for (let c = left; c <= right; c++) {
      ws.getCell(r, c).border = {
        top: r === top ? thick : thin,
        bottom: r === bottom ? thick : thin,
        left: c === left ? thick : thin,
        right: c === right ? thick : thin,
      };
    }
  }
}

/** Merge `row` across the table and render it as a dark brand title banner. */
function titleBanner(ws: Worksheet, row: number, totalCols: number, text: string, sub?: string) {
  ws.mergeCells(row, 1, row, totalCols);
  const cell = ws.getCell(row, 1);
  cell.value = sub ? `${text}\n${sub}` : text;
  cell.font = { name: FONT, size: 15, bold: true, color: { argb: C.white } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  cell.fill = solid(C.primary);
  ws.getRow(row).height = sub ? 38 : 28;
}

type Align = 'left' | 'center' | 'right';

/** Style a header cell on the dark brand band. */
function headerCell(cell: Cell, text: string, opts?: { fill?: string; color?: string; align?: Align }) {
  cell.value = text;
  cell.fill = solid(opts?.fill ?? C.primaryLight);
  cell.font = { name: FONT, size: 10, bold: true, color: { argb: opts?.color ?? C.white } };
  cell.alignment = { vertical: 'middle', horizontal: opts?.align ?? 'center', wrapText: true };
}

async function downloadWorkbook(wb: Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, filename);
}

function newWorkbook(): Workbook {
  const wb = new Workbook();
  wb.creator = 'IP PLUS Pool Villa';
  wb.created = new Date();
  return wb;
}

/** "2026-06" -> "มิถุนายน 2569" (Thai/Buddhist locale, as expected on a Thai wall sheet). */
function thaiMonthYear(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

/** "2026-06-18" -> "18 มิ.ย. 2569". */
function thaiDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

const isWeekendDate = (dateStr: string): boolean => {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return day === 0 || day === 6;
};

// =============================================================================
// 1. STAFF SCHEDULE (ROSTER) — the wall sheet
// =============================================================================

export interface RosterStaffRow {
  id: string;
  full_name: string;
  role?: string;
  department?: string;
}

export interface RosterShift {
  shift_start: string;
  shift_end: string;
  is_off_day: boolean;
  no_break: boolean;
}

type ShiftKind = 'off' | 'morning' | 'afternoon' | 'night';

function classifyShift(sh: RosterShift): ShiftKind {
  if (sh.is_off_day) return 'off';
  const startH = parseInt(sh.shift_start.slice(0, 2), 10) || 0;
  const endH = parseInt(sh.shift_end.slice(0, 2), 10) || 0;
  const overnight = endH <= startH; // e.g. 22:00 -> 06:00
  if (overnight || startH >= 18) return 'night';
  if (startH < 12) return 'morning';
  return 'afternoon';
}

const SHIFT_FILL: Record<ShiftKind, string> = {
  off: C.off,
  morning: C.morning,
  afternoon: C.afternoon,
  night: C.night,
};

const SHIFT_TEXT: Record<ShiftKind, string> = {
  off: 'FFB23A48',
  morning: 'FF1F3A5F',
  afternoon: 'FF2F5121',
  night: C.white,
};

export interface ExportRosterParams {
  staff: RosterStaffRow[];
  days: string[]; // YYYY-MM-DD, in order
  schedules: Record<string, RosterShift>; // key `${staffId}_${date}`
  yearMonth: string; // "YYYY-MM"
  holidays?: string[]; // YYYY-MM-DD public holidays to highlight
}

export async function exportScheduleRoster(params: ExportRosterParams): Promise<void> {
  const { staff, days, schedules, yearMonth } = params;
  const holidaySet = new Set(params.holidays ?? []);
  const totalCols = days.length + 1;

  const wb = newWorkbook();
  const ws = wb.addWorksheet('ตารางเวร', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  // Row 1: title banner
  titleBanner(ws, 1, totalCols, `ตารางเวรการทำงาน — ${thaiMonthYear(yearMonth)}`);

  // Row 2: day headers
  ws.getRow(2).height = 34;
  headerCell(ws.getCell(2, 1), 'พนักงาน / แผนก', { fill: C.primary, align: 'left' });
  days.forEach((d, i) => {
    const dObj = new Date(d + 'T00:00:00');
    const weekday = dObj.toLocaleDateString('th-TH', { weekday: 'short' });
    const weekend = isWeekendDate(d);
    const holiday = holidaySet.has(d);
    headerCell(ws.getCell(2, i + 2), `${weekday}\n${dObj.getDate()}`, {
      fill: holiday ? C.holidayHeader : weekend ? C.weekendHeader : C.primaryLight,
    });
  });

  // Body — grouped by department
  const byDept = new Map<string, RosterStaffRow[]>();
  staff.forEach((s) => {
    const dept = s.department || 'General';
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept)!.push(s);
  });

  let row = 3;
  let longestName = 14;
  for (const [dept, members] of byDept) {
    // Department band
    ws.mergeCells(row, 1, row, totalCols);
    const band = ws.getCell(row, 1);
    band.value = `${dept}  (${members.length})`;
    band.fill = solid(C.deptBand);
    band.font = { name: FONT, size: 11, bold: true, color: { argb: C.primary } };
    band.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    ws.getRow(row).height = 20;
    row++;

    for (const s of members) {
      ws.getRow(row).height = 30;
      longestName = Math.max(longestName, s.full_name.length);

      const nameCell = ws.getCell(row, 1);
      nameCell.value = s.full_name;
      nameCell.fill = solid(C.white);
      nameCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.primary } };
      nameCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

      days.forEach((d, i) => {
        const cell = ws.getCell(row, i + 2);
        const sh = schedules[`${s.id}_${d}`];

        if (!sh) {
          cell.value = '';
          if (isWeekendDate(d) || holidaySet.has(d)) cell.fill = solid(C.weekendCell);
        } else {
          const kind = classifyShift(sh);
          cell.value =
            kind === 'off'
              ? 'หยุด'
              : `${sh.shift_start.slice(0, 5)}\n${sh.shift_end.slice(0, 5)}${sh.no_break ? '  •' : ''}`;
          cell.fill = solid(SHIFT_FILL[kind]);
          cell.font = {
            name: FONT,
            size: kind === 'off' ? 10 : 9,
            bold: true,
            color: { argb: SHIFT_TEXT[kind] },
          };
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      row++;
    }
  }

  const lastRow = row - 1;

  // Column widths (auto-adjusted to fit names; uniform day columns)
  ws.getColumn(1).width = Math.min(36, Math.max(20, longestName + 4));
  for (let c = 2; c <= totalCols; c++) ws.getColumn(c).width = 9;

  // Framed border across the whole sheet (title + grid)
  if (lastRow >= 2) frameTable(ws, 1, 1, lastRow, totalCols);

  // Legend beneath the table
  const legendRow = lastRow + 2;
  const legend: Array<[string, string, string]> = [
    ['เช้า', C.morning, 'FF1F3A5F'],
    ['บ่าย', C.afternoon, 'FF2F5121'],
    ['ดึก', C.night, C.white],
    ['หยุด', C.off, 'FFB23A48'],
    ['• = ไม่พักเบรก', C.white, C.primary],
  ];
  legend.forEach(([label, fill, color], i) => {
    const cell = ws.getCell(legendRow, i + 1);
    cell.value = label;
    cell.fill = solid(fill);
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: color } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { top: thin, bottom: thin, left: thin, right: thin };
  });

  await downloadWorkbook(wb, `ตารางเวร_${yearMonth}.xlsx`);
}

// =============================================================================
// 2. MONTHLY PAYROLL SUMMARY
// =============================================================================

export interface PayrollExportRow {
  name: string;
  department?: string;
  wageType?: string;
  lateMins: number;
  otApproved: number;
  leaveDays: number;
  workedDays: number;
  grossPay: number;
  ssoDeduction: number;
  guaranteeDeduction: number;
  otherDeductions: number;
  netPay: number;
}

interface PayrollColumn {
  header: string;
  width: number;
  currency?: boolean;
  align?: Align;
}

export async function exportPayrollSummary(params: {
  rows: PayrollExportRow[];
  startDate: string;
  endDate: string;
}): Promise<void> {
  const { rows, startDate, endDate } = params;
  const wb = newWorkbook();
  const ws = wb.addWorksheet('สรุปเงินเดือน', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const columns: PayrollColumn[] = [
    { header: '#', width: 5, align: 'center' },
    { header: 'ชื่อพนักงาน', width: 26, align: 'left' },
    { header: 'แผนก', width: 16, align: 'left' },
    { header: 'ประเภทค่าจ้าง', width: 13, align: 'center' },
    { header: 'สาย (นาที)', width: 11, align: 'center' },
    { header: 'OT (ชม.)', width: 10, align: 'center' },
    { header: 'ลา (วัน)', width: 10, align: 'center' },
    { header: 'วันทำงาน', width: 11, align: 'center' },
    { header: 'รายได้รวม (฿)', width: 15, currency: true, align: 'right' },
    { header: 'ประกันสังคม (฿)', width: 15, currency: true, align: 'right' },
    { header: 'เงินประกัน (฿)', width: 14, currency: true, align: 'right' },
    { header: 'หักอื่นๆ (฿)', width: 13, currency: true, align: 'right' },
    { header: 'รายรับสุทธิ (฿)', width: 16, currency: true, align: 'right' },
  ];
  const totalCols = columns.length;
  const netCol = totalCols; // last column index (1-based)

  titleBanner(ws, 1, totalCols, 'สรุปเงินเดือนรายเดือน', `รอบ ${thaiDate(startDate)} ถึง ${thaiDate(endDate)}`);

  ws.getRow(2).height = 30;
  columns.forEach((col, i) => headerCell(ws.getCell(2, i + 1), col.header, { align: col.align }));

  rows.forEach((staff, idx) => {
    const r = 3 + idx;
    ws.getRow(r).height = 22;
    const zebra = idx % 2 === 1;

    const values: Array<string | number> = [
      idx + 1,
      staff.name,
      staff.department || 'General',
      staff.wageType || '-',
      Math.round(staff.lateMins),
      Number(staff.otApproved.toFixed(2)),
      staff.leaveDays,
      staff.workedDays,
      staff.grossPay,
      staff.ssoDeduction,
      staff.guaranteeDeduction,
      staff.otherDeductions,
      staff.netPay,
    ];

    columns.forEach((col, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = values[i];
      cell.alignment = { vertical: 'middle', horizontal: col.align ?? 'left' };
      cell.font = { name: FONT, size: 10, color: { argb: C.primary } };
      if (col.currency) cell.numFmt = CURRENCY_FMT;
      if (zebra) cell.fill = solid(C.zebra);
      if (i + 1 === netCol) {
        cell.fill = solid(C.netCell);
        cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.netText } };
      }
    });
  });

  // Totals row
  const totalRowIdx = 3 + rows.length;
  const totals = rows.reduce(
    (acc, s) => {
      acc.gross += s.grossPay;
      acc.sso += s.ssoDeduction;
      acc.guarantee += s.guaranteeDeduction;
      acc.other += s.otherDeductions;
      acc.net += s.netPay;
      return acc;
    },
    { gross: 0, sso: 0, guarantee: 0, other: 0, net: 0 },
  );
  ws.getRow(totalRowIdx).height = 24;
  ws.mergeCells(totalRowIdx, 1, totalRowIdx, 8);
  const totalLabel = ws.getCell(totalRowIdx, 1);
  totalLabel.value = 'รวมทั้งสิ้น';
  totalLabel.font = { name: FONT, size: 11, bold: true, color: { argb: C.primary } };
  totalLabel.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
  totalLabel.fill = solid(C.totalBand);

  const totalValues = [totals.gross, totals.sso, totals.guarantee, totals.other, totals.net];
  totalValues.forEach((v, i) => {
    const cell = ws.getCell(totalRowIdx, 9 + i);
    cell.value = v;
    cell.numFmt = CURRENCY_FMT;
    cell.fill = solid(C.totalBand);
    cell.font = {
      name: FONT,
      size: 10,
      bold: true,
      color: { argb: i === totalValues.length - 1 ? C.netText : C.primary },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
  });

  frameTable(ws, 1, 1, totalRowIdx, totalCols);
  await downloadWorkbook(wb, `สรุปเงินเดือน_${startDate}_ถึง_${endDate}.xlsx`);
}

// =============================================================================
// 3. DAILY ATTENDANCE
// =============================================================================

export interface DailyAttendanceRow {
  date: string; // YYYY-MM-DD
  staffName?: string;
  type: string; // กะงาน / ลา
  checkIn: string; // already formatted, e.g. "09:02" or "--"
  checkOut: string;
  ot: string; // e.g. "30 นาที" or "-"
  note?: string;
}

interface AttendanceColumn {
  header: string;
  width: number;
  key: keyof DailyAttendanceRow;
  align?: Align;
}

export async function exportDailyAttendance(params: {
  rows: DailyAttendanceRow[];
  title: string;
  subtitle?: string;
  filename?: string;
}): Promise<void> {
  const { rows, title, subtitle } = params;
  const wb = newWorkbook();
  const ws = wb.addWorksheet('การลงเวลา', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const showName = rows.some((r) => r.staffName);
  const columns: AttendanceColumn[] = [
    { header: 'วันที่', width: 16, key: 'date', align: 'center' },
    ...(showName ? [{ header: 'พนักงาน', width: 24, key: 'staffName' as const, align: 'left' as const }] : []),
    { header: 'ประเภท', width: 12, key: 'type', align: 'center' },
    { header: 'เวลาเข้า', width: 11, key: 'checkIn', align: 'center' },
    { header: 'เวลาออก', width: 11, key: 'checkOut', align: 'center' },
    { header: 'OT', width: 12, key: 'ot', align: 'center' },
    { header: 'หมายเหตุ', width: 28, key: 'note', align: 'left' },
  ];
  const totalCols = columns.length;

  titleBanner(ws, 1, totalCols, title, subtitle);

  ws.getRow(2).height = 26;
  columns.forEach((col, i) => headerCell(ws.getCell(2, i + 1), col.header, { align: col.align }));

  rows.forEach((rowData, idx) => {
    const r = 3 + idx;
    ws.getRow(r).height = 20;
    const isLeave = rowData.type !== 'กะงาน';
    columns.forEach((col, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = col.key === 'date' ? thaiDate(rowData.date) : (rowData[col.key] as string) ?? '';
      cell.alignment = { vertical: 'middle', horizontal: col.align ?? 'left' };
      cell.font = { name: FONT, size: 10, color: { argb: C.primary } };
      if (idx % 2 === 1) cell.fill = solid(C.zebra);
      if (col.key === 'type') {
        cell.fill = solid(isLeave ? 'FFE3F2FD' : 'FFF1F8E9');
        cell.font = { name: FONT, size: 9, bold: true, color: { argb: isLeave ? 'FF1565C0' : 'FF558B2F' } };
      }
    });
  });

  const lastRow = 2 + rows.length;
  frameTable(ws, 1, 1, Math.max(lastRow, 2), totalCols);
  await downloadWorkbook(wb, `${params.filename ?? 'การลงเวลา'}.xlsx`);
}

// =============================================================================
// 4. STAFF DIRECTORY
// =============================================================================

export interface StaffDirectoryRow {
  full_name: string;
  department?: string;
  role?: string;
  nationality?: string;
  wage_type?: string;
  rate?: number;
  device_id?: string | null;
  substitute_leave_quota?: number;
}

interface DirectoryColumn {
  header: string;
  width: number;
  currency?: boolean;
  align?: Align;
}

export async function exportStaffDirectory(params: { rows: StaffDirectoryRow[] }): Promise<void> {
  const { rows } = params;
  const wb = newWorkbook();
  const ws = wb.addWorksheet('รายชื่อพนักงาน', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const columns: DirectoryColumn[] = [
    { header: '#', width: 5, align: 'center' },
    { header: 'ชื่อ-นามสกุล', width: 28, align: 'left' },
    { header: 'แผนก', width: 18, align: 'left' },
    { header: 'สัญชาติ', width: 12, align: 'center' },
    { header: 'ประเภทค่าจ้าง', width: 14, align: 'center' },
    { header: 'อัตรา (฿)', width: 14, currency: true, align: 'right' },
    { header: 'สถานะอุปกรณ์', width: 14, align: 'center' },
    { header: 'โควตาลาชดเชย', width: 14, align: 'center' },
  ];
  const totalCols = columns.length;
  const today = new Date().toLocaleDateString('en-CA');

  titleBanner(ws, 1, totalCols, 'ทำเนียบพนักงาน', `จำนวน ${rows.length} คน · ออกเมื่อ ${thaiDate(today)}`);

  ws.getRow(2).height = 28;
  columns.forEach((col, i) => headerCell(ws.getCell(2, i + 1), col.header, { align: col.align }));

  rows.forEach((s, idx) => {
    const r = 3 + idx;
    ws.getRow(r).height = 22;
    const bound = !!s.device_id;
    const values: Array<string | number> = [
      idx + 1,
      s.full_name,
      s.department || 'General',
      s.nationality || '-',
      s.wage_type || '-',
      s.rate ?? 0,
      bound ? 'ผูกแล้ว' : 'ยังไม่ผูก',
      s.substitute_leave_quota ?? 0,
    ];
    columns.forEach((col, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = values[i];
      cell.alignment = { vertical: 'middle', horizontal: col.align ?? 'left' };
      cell.font = { name: FONT, size: 10, color: { argb: C.primary } };
      if (col.currency) cell.numFmt = CURRENCY_FMT;
      if (idx % 2 === 1) cell.fill = solid(C.zebra);
      if (i === 6) {
        cell.fill = solid(bound ? 'FFE8F5E9' : 'FFFFF3E0');
        cell.font = { name: FONT, size: 9, bold: true, color: { argb: bound ? 'FF2E7D32' : 'FFE65100' } };
      }
    });
  });

  const lastRow = 2 + rows.length;
  frameTable(ws, 1, 1, Math.max(lastRow, 2), totalCols);
  await downloadWorkbook(wb, `ทำเนียบพนักงาน_${today}.xlsx`);
}
