import ExcelJS from 'exceljs';
import { computeRow, maxima } from './grades.js';

const THIN = { style: 'thin', color: { argb: 'FF9AA5B1' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const HEAD_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA6192E' } };
const SUB_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7EEFF' } };
const col = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/** Generic table export (students, fees, staff, transactions, …). Sheet is right-to-left. */
export async function buildTableWorkbook({ title, columns, rows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IHSS Management System';
  const ws = wb.addWorksheet(title.slice(0, 30), { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 18, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
  const head = ws.getRow(1);
  head.height = 24;
  head.eachCell((cell) => { cell.fill = HEAD_FILL; cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; cell.border = BORDER; });
  rows.forEach((r) => ws.addRow(r).eachCell((cell) => { cell.border = BORDER; }));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return wb;
}

/** Ministry-format "شيت درجات أعمال السنة" with live formulas. */
export async function buildAssessmentWorkbook(sheet) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IHSS Management System';
  const ws = wb.addWorksheet(sheet.periodLabel || 'Sheet', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 5, xSplit: 3 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const crit = sheet.criteria;
  const weeks = sheet.weekDates?.length || 5;
  const perWeek = crit.length + 1;
  const firstDataCol = 4;
  const totalCol = firstDataCol + weeks * perWeek;
  const separateExam = sheet.exam.weight !== 1;
  const lastCol = totalCol + (separateExam ? 4 : 3);
  const mx = maxima(sheet);

  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `وزارة التربية والتعليم والتعليم الفنى\nإدارة القاهرة الجديدة التعليمية\nالمدرسة الثانوية الإيطالية للعلوم والتكنولوجيا التطبيقية\nالمادة : ${sheet.subjectName} ${sheet.component === 'theory' ? 'نظرى' : 'عملى'}\nشيت درجات أعمال السنة للصف ${{ '1Sec': 'الأول', '2Sec': 'الثانى', '3Sec': 'الثالث', Institute: 'المعهد' }[sheet.gradeLevel]}${sheet.gradeLevel === 'Institute' ? '' : ' الثانوى الفنى'}`;
  title.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  title.font = { bold: true, size: 13 };
  ws.getRow(1).height = 95;

  ws.getCell(2, 1).value = 'الشهر';
  ws.mergeCells(2, firstDataCol, 2, totalCol - 1);
  ws.getCell(2, firstDataCol).value = `${sheet.periodLabel}   ${sheet.monthLabel || ''}`;
  ws.getCell(3, 1).value = 'الاسبوع';
  ws.getCell(4, 1).value = 'اليوم';
  const heads = ['المجموع', 'المتوسط', sheet.exam.label];
  if (separateExam) heads.push('درجة الامتحان');
  heads.push('المجموع');
  heads.forEach((h, i) => { ws.mergeCells(2, totalCol + i, 5, totalCol + i); ws.getCell(2, totalCol + i).value = h; });

  const weekNames = ['الاول', 'الثانى', 'الثالث', 'الرابع', 'الخامس', 'السادس'];
  for (let w = 0; w < weeks; w++) {
    const c0 = firstDataCol + w * perWeek;
    ws.mergeCells(3, c0, 3, c0 + perWeek - 1); ws.getCell(3, c0).value = `الاسبوع ${weekNames[w]}`;
    ws.mergeCells(4, c0, 4, c0 + perWeek - 1);
    const d = sheet.weekDates?.[w]; if (d) { ws.getCell(4, c0).value = new Date(d); ws.getCell(4, c0).numFmt = 'dd/mm/yyyy'; }
    crit.forEach((c, i) => { ws.getCell(5, c0 + i).value = c.label; });
    ws.getCell(5, c0 + crit.length).value = 'المجموع';
  }
  ws.getCell(5, 1).value = 'م'; ws.getCell(5, 2).value = 'اسم الطالـــب'; ws.getCell(5, 3).value = 'الفصل';

  // maxima row (6)
  for (let w = 0; w < weeks; w++) {
    const c0 = firstDataCol + w * perWeek;
    crit.forEach((c, i) => { ws.getCell(6, c0 + i).value = c.max; });
    ws.getCell(6, c0 + crit.length).value = { formula: `SUM(${col(c0)}6:${col(c0 + crit.length - 1)}6)`, result: mx.weekMax };
  }
  const weekTotalCols = Array.from({ length: weeks }, (_, w) => col(firstDataCol + w * perWeek + crit.length));
  const put = (r, ci, f, result) => { ws.getCell(r, ci).value = { formula: f, result }; };
  put(6, totalCol, `SUM(${weekTotalCols.map((c) => `${c}6`).join(',')})`, mx.totalMax);
  put(6, totalCol + 1, `${col(totalCol)}6*${sheet.avgWeight * 100}%`, mx.avgMax);
  ws.getCell(6, totalCol + 2).value = sheet.exam.paperMax;
  if (separateExam) put(6, totalCol + 3, `${col(totalCol + 2)}6*${sheet.exam.weight * 100}%`, mx.examMax);
  put(6, lastCol, `${col(totalCol + 1)}6+${col(separateExam ? totalCol + 3 : totalCol + 2)}6`, mx.finalMax);

  sheet.rows.forEach((row, idx) => {
    const r = 7 + idx;
    const comp = computeRow(sheet, row);
    ws.getCell(r, 1).value = idx + 1; ws.getCell(r, 2).value = row.name; ws.getCell(r, 3).value = row.classroom || '';
    for (let w = 0; w < weeks; w++) {
      const c0 = firstDataCol + w * perWeek;
      crit.forEach((c, i) => { const v = row.weeks?.[w]?.[c.key]; if (v !== null && v !== undefined) ws.getCell(r, c0 + i).value = v; });
      put(r, c0 + crit.length, `SUM(${col(c0)}${r}:${col(c0 + crit.length - 1)}${r})`, comp.weekTotals[w]);
    }
    put(r, totalCol, `SUM(${weekTotalCols.map((c) => `${c}${r}`).join(',')})`, comp.total);
    put(r, totalCol + 1, `${col(totalCol)}${r}*${sheet.avgWeight * 100}%`, comp.average);
    if (row.paper !== null && row.paper !== undefined) ws.getCell(r, totalCol + 2).value = row.paper;
    if (separateExam) put(r, totalCol + 3, `${col(totalCol + 2)}${r}*${sheet.exam.weight * 100}%`, comp.examScore ?? 0);
    put(r, lastCol, `${col(totalCol + 1)}${r}+${col(separateExam ? totalCol + 3 : totalCol + 2)}${r}`, comp.final);
  });

  const lastRow = 6 + sheet.rows.length;
  for (let r = 2; r <= lastRow; r++) for (let c = 1; c <= lastCol; c++) {
    const cell = ws.getCell(r, c);
    cell.border = BORDER; cell.alignment = { horizontal: c === 2 ? 'right' : 'center', vertical: 'middle', wrapText: true };
    if (r <= 5) { cell.fill = SUB_FILL; cell.font = { bold: true }; }
    if (r === 6) cell.font = { bold: true, color: { argb: 'FFA6192E' } };
  }
  ws.getColumn(2).width = 34; ws.getColumn(3).width = 9;
  for (let c = 4; c <= lastCol; c++) ws.getColumn(c).width = 9.5;
  ws.getRow(5).height = 32;

  const sig = lastRow + 3;
  ws.mergeCells(sig, 2, sig, 6); ws.getCell(sig, 2).value = `مدرس المادة: ${sheet.teacherName || ''}`;
  ws.mergeCells(sig, 9, sig, 15); ws.getCell(sig, 9).value = `مسئول التقييم: ${sheet.evaluationOfficer || ''}`;
  ws.mergeCells(sig, 18, sig, 24); ws.getCell(sig, 18).value = `المدير الاكاديمى: ${sheet.academicManager || ''}`;
  return wb;
}
