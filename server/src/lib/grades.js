// Pure grade maths. Replicates the ministry "شيت درجات أعمال السنة" formulas exactly:
//   weekly total  = sum of criteria for that week
//   total         = sum of the weekly totals
//   average       = total × avgWeight        (theory 10 %, practical 20 %  → out of 8)
//   exam score    = paper × exam.weight       (theory: paper/90 × 20 % → 18 ; practical: entered directly out of 18)
//   final         = average + exam score      (out of 26)
import { round2 } from './http.js';

export const TEMPLATES = {
  theory: {
    criteria: [
      { key: 'attendance', label: 'حضور', labelEn: 'Attendance', max: 4 },
      { key: 'conduct', label: 'التزام وسلوك', labelEn: 'Conduct', max: 4 },
      { key: 'participation', label: 'مشاركة وتفاعل', labelEn: 'Participation', max: 4 },
      { key: 'homework', label: 'واجب', labelEn: 'Homework', max: 4 },
    ],
    avgWeight: 0.1,
    exam: { paperMax: 90, weight: 0.2, label: 'درجة الورقة', labelEn: 'Paper mark' },
  },
  practical: {
    criteria: [
      { key: 'attendance', label: 'حضور', labelEn: 'Attendance', max: 2 },
      { key: 'conduct', label: 'التزام وسلوك', labelEn: 'Conduct', max: 3 },
      { key: 'participation', label: 'مشاركة وتفاعل', labelEn: 'Participation', max: 3 },
    ],
    avgWeight: 0.2,
    exam: { paperMax: 18, weight: 1, label: 'درجة الامتحان', labelEn: 'Exam mark' },
  },
};

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? 0 : Number(v));

export function maxima(sheet) {
  const weekMax = sheet.criteria.reduce((s, c) => s + c.max, 0);
  const weeks = sheet.weekDates?.length || 5;
  const totalMax = weekMax * weeks;
  const avgMax = round2(totalMax * sheet.avgWeight);
  const examMax = round2(sheet.exam.paperMax * sheet.exam.weight);
  return { weekMax, weeks, totalMax, avgMax, examMax, finalMax: round2(avgMax + examMax) };
}

export function computeRow(sheet, row) {
  const weeks = sheet.weekDates?.length || 5;
  const weekTotals = [];
  for (let w = 0; w < weeks; w++) {
    const wk = row.weeks?.[w] || {};
    weekTotals.push(sheet.criteria.reduce((s, c) => s + num(wk[c.key]), 0));
  }
  const total = weekTotals.reduce((a, b) => a + b, 0);
  const average = round2(total * sheet.avgWeight);
  const paper = row.paper === null || row.paper === undefined ? null : Number(row.paper);
  const examScore = paper === null ? null : round2(paper * sheet.exam.weight);
  const final = round2(average + (examScore ?? 0));
  return { weekTotals, total, average, examScore, final };
}

export function emptyWeeks(n = 5) { return Array.from({ length: n }, () => ({})); }

// Validate a single cell edit. Returns the cleaned number or throws a string message.
export function validateCell(sheet, { week, key, value }) {
  const v = value === '' || value === null ? null : Number(value);
  if (v !== null && (!Number.isFinite(v) || v < 0)) throw 'Value must be a non-negative number';
  if (key === 'paper') {
    if (v !== null && v > sheet.exam.paperMax) throw `Max is ${sheet.exam.paperMax}`;
    return v;
  }
  const crit = sheet.criteria.find((c) => c.key === key);
  if (!crit) throw 'Unknown criterion';
  const weeks = sheet.weekDates?.length || 5;
  if (!Number.isInteger(week) || week < 0 || week >= weeks) throw 'Invalid week';
  if (v !== null && v > crit.max) throw `Max is ${crit.max}`;
  return v;
}
