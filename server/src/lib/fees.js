// Pure fee maths. The two columns the school asked to add to the fee sheet:
//   totalDiscount          (اجمالي الخصم)
//   remainingAfterDiscount (المتبقي بعد الخصم)  = gross − totalDiscount
// `paid` and `balance` are tracked on top so Accounts can see receivables.
import { round2 } from './http.js';

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function computeFees(rec) {
  const tuition = n(rec.tuition);
  const gross = round2(tuition + n(rec.bus) + n(rec.uniform) + n(rec.accommodation));
  let totalDiscount = 0;
  const discounts = (rec.discounts || []).map((d) => {
    const base = d.base === 'tuition' ? tuition : gross;
    const amount = d.type === 'percent' ? round2((base * n(d.value)) / 100) : round2(n(d.value));
    totalDiscount += amount;
    return { ...d, amount };
  });
  totalDiscount = round2(Math.min(totalDiscount, gross)); // a discount can never exceed what is owed
  const remainingAfterDiscount = round2(gross - totalDiscount);
  const paid = round2((rec.payments || []).reduce((s, p) => s + n(p.amount), 0));
  return { gross, discounts, totalDiscount, remainingAfterDiscount, paid, balance: round2(remainingAfterDiscount - paid) };
}
