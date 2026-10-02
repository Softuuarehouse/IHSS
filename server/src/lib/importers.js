// Parsers for the school's own Excel layouts (نظرى / عملى grade sheets, مرتبات attendance sheet).
// Pure functions: (workbook) → plain JS data. No DB access here, so they're easy to unit-test.
import ExcelJS from 'exceljs';
import { TEMPLATES } from './grades.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// exceljs exposes a formula cell's value as { formula, result, ... } rather than a plain number —
// the school's sheets compute several totals with SUM(), so every numeric read must unwrap this.
const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && typeof v.result === 'number' && Number.isFinite(v.result)) return v.result;
  return null;
};
const isNum = (v) => num(v) !== null;
const asDate = (v) => (v instanceof Date ? v : null);

export async function loadWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

/**
 * Grade sheet (شيت درجات أعمال السنة), theory or practical — same layout the school already uses:
 * row2: month/period label · row3: week labels · row4: week start dates · row5: column headers ·
 * row6: maxima · row7+: one row per student, ending at the first empty name.
 */
export function parseAssessmentSheet(wb, component) {
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('The file has no worksheet');
  const tpl = TEMPLATES[component];
  if (!tpl) throw new Error('Unknown component');
  const perWeek = tpl.criteria.length + 1; // + the week's own total column
  const firstCol = 4; // column D

  const periodRaw = clean(ws.getCell(2, firstCol).value);
  let periodLabel = periodRaw;
  let monthLabel = '';
  const monthIdx = periodRaw.indexOf('شهر');
  if (monthIdx > -1) { periodLabel = clean(periodRaw.slice(0, monthIdx)); monthLabel = clean(periodRaw.slice(monthIdx)); }

  const weekDates = [];
  for (let w = 0; ; w++) {
    const d = asDate(ws.getCell(4, firstCol + w * perWeek).value);
    if (!d) break;
    weekDates.push(d);
    if (w > 8) break; // sanity stop
  }
  const weeks = weekDates.length || 5;
  const paperCol = firstCol + weeks * perWeek + 2; // …weeks…, total, average, paper/exam

  const rows = [];
  for (let r = 7; r < 7 + 400; r++) {
    const name = clean(ws.getCell(r, 2).value);
    if (!name) break;
    const classroom = clean(ws.getCell(r, 3).value);
    const weeksData = [];
    for (let w = 0; w < weeks; w++) {
      const c0 = firstCol + w * perWeek;
      const wk = {};
      tpl.criteria.forEach((c, i) => { const v = num(ws.getCell(r, c0 + i).value); if (v !== null) wk[c.key] = v; });
      weeksData.push(wk);
    }
    const paper = num(ws.getCell(r, paperCol).value);
    rows.push({ name, classroom, weeks: weeksData, paper });
  }
  if (rows.length === 0) throw new Error('No student rows found — is this the right sheet?');
  // The file has no year printed anywhere, but the week dates do — derive the academic year from
  // the first week (Sep–Aug school year), so the admin doesn't have to type it.
  let academicYear = null;
  if (weekDates[0]) { const d = weekDates[0]; const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; academicYear = `${y}/${y + 1}`; }
  return { periodLabel, monthLabel, weekDates: weekDates.map((d) => d.toISOString()), rows, academicYear };
}

const MONTHS = { 'سبتمبر': 9, 'اكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12, 'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'مايو': 5, 'يونيو': 6, 'يوليو': 7, 'اغسطس': 8 };
const LEADING_COLS = new Set(['م', 'الاسم', 'الوظيفة']); // row/name/job-title columns, never a "summary" field
// Real dates in this sheet appear as text like "1/10/2025", "8 / 11 2026", or as actual Date cells —
// those belong to a separate daily sign-in log tacked onto the same sheet and are out of scope here.
const isDateLike = (v) => v instanceof Date || /^\d{1,2}\s*\/\s*\d{1,2}\s*[\/\s]\s*\d{2,5}$/.test(clean(v));

/**
 * Staff attendance sheet (مرتبات): one row per employee, a per-employee "اجمالي الغياب" (and similar
 * yearly totals) before the month columns, then a repeating block per month ("ايام الشهر" / "اجازة" /
 * "غياب" / "حضور" — a month may be missing "اجازة" some months and still parses correctly), followed by
 * a few more yearly totals ("اجمالي ايام الحضور" / "الحضور الفعلي" / "أذن" / "تاخير"), and finally an
 * unrelated daily sign-in log (one column per calendar date) that this parser deliberately ignores.
 * Section headers "أولاً/ثانياً" in column B split ministry vs contract staff.
 * `startYear` is the academic year's starting calendar year (2025 → Sep 2025 … Aug 2026).
 */
export function parseAttendanceSheet(wb, startYear) {
  const ws = wb.worksheets.find((s) => /\d{4}\s*-\s*\d{4}/.test(s.name)) || wb.worksheets[0];
  let headerRow = 0;
  ws.eachRow((row, r) => { if (!headerRow && row.values.some((v) => clean(v) === 'الاسم')) headerRow = r; });
  if (!headerRow) throw new Error('Could not find the "الاسم" header row — is this the attendance sheet?');

  // exceljs repeats a merged cell's value across every column it spans, so the same header text can
  // show up several times in a row — collapse consecutive repeats into one block starting at its first column.
  const head = ws.getRow(headerRow);
  const rawHits = [];
  head.eachCell({ includeEmpty: false }, (cell, col) => { const v = clean(cell.value); if (v) rawHits.push({ col, value: v }); });
  const blocks = [];
  for (const h of rawHits) {
    const prev = blocks.at(-1);
    if (prev && prev.value === h.value && h.col === prev.lastCol + 1) prev.lastCol = h.col;
    else blocks.push({ col: h.col, value: h.value, lastCol: h.col });
  }
  for (let i = 0; i < blocks.length; i++) blocks[i].end = blocks[i + 1]?.col ?? ws.actualColumnCount + 1;

  const sub = ws.getRow(headerRow + 1);
  const monthBlocks = []; const summaryBlocks = [];
  let consecutiveDates = 0;
  for (const b of blocks) {
    if (LEADING_COLS.has(b.value)) continue;
    if (isDateLike(b.value)) { consecutiveDates++; if (consecutiveDates >= 2) break; continue; } // entered the daily log — stop
    consecutiveDates = 0;
    const month = MONTHS[b.value];
    if (month) {
      const year = startYear + (month < 9 ? 1 : 0);
      const fields = {};
      for (let c = b.col; c < b.end; c++) { const label = clean(sub.getCell(c).value); if (label) fields[label] = c; }
      monthBlocks.push({ month: `${year}-${String(month).padStart(2, '0')}`, fields });
    } else {
      summaryBlocks.push({ label: b.value, col: b.col }); // single-column yearly stat, e.g. "اجمالي الغياب"
    }
  }
  if (!monthBlocks.length) throw new Error('No month columns found in the header row');

  const staff = []; const ledgers = [];
  let category = 'contract';
  for (let r = headerRow + 2; r <= ws.rowCount; r++) {
    const a = clean(ws.getCell(r, 1).value);
    const b = clean(ws.getCell(r, 2).value);
    const name = clean(ws.getCell(r, 3).value);
    const jobTitle = clean(ws.getCell(r, 4).value);
    if (a.startsWith('الاجمالي') || a.startsWith('إجمالي')) break;
    if (b.startsWith('اولا') || b.startsWith('أولا')) category = 'education';
    else if (b.startsWith('ثانيا')) category = 'contract';
    if (!name) continue;

    const summary = {};
    for (const s of summaryBlocks) { const v = num(ws.getCell(r, s.col).value); if (v !== null) summary[s.label] = v; }
    staff.push({ fullName: name, jobTitle, category, summary });

    for (const mb of monthBlocks) {
      const g = (k) => (mb.fields[k] ? num(ws.getCell(r, mb.fields[k]).value) : null);
      const days = g('ايام الشهر'); if (days === null || days === 0) continue;
      let leave = g('اجازة') ?? 0; let absence = g('غياب') ?? 0;
      let notes = '';
      if (leave + absence > days) { notes = `Imported values inconsistent: days=${days}, leave=${leave}, absence=${absence}`; absence = Math.max(0, days - leave); }
      ledgers.push({ staffName: name, month: mb.month, workingDays: days, leave, absence, notes });
    }
  }
  if (!staff.length) throw new Error('No employee rows found');
  return { staff, ledgers, months: monthBlocks.map((b) => b.month), summaryFields: summaryBlocks.map((s) => s.label) };
}
