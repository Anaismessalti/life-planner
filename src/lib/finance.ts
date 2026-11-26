import type {
  BudgetCategory,
  Expense,
  FixedExpense,
  Income,
  ISODate,
  ISOMonth,
  PaymentStatus,
  SavingsGoal,
} from '../db/types';
import { addMonths, monthEnd, monthStart } from './dates';
import { financeOccurrences } from './recurrence';

export const paymentId = (refId: string, date: ISODate) => `${refId}_${date}`;

export interface FinanceData {
  incomes: Income[];
  fixed: FixedExpense[];
  payments: PaymentStatus[];
  expenses: Expense[];
  savings: SavingsGoal[];
  budgetCategories: BudgetCategory[];
}

export interface Occurrence {
  refId: string;
  refType: 'income' | 'fixed';
  label: string;
  date: ISODate;
  planned: number;
  /** Montant confirmé (payé / reçu), ou undefined si non confirmé. */
  confirmed?: number;
  budgetCategoryId?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function financeOccurrencesIn(data: Pick<FinanceData, 'incomes' | 'fixed' | 'payments'>, from: ISODate, to: ISODate): Occurrence[] {
  const pay = new Map(data.payments.filter((p) => !p.deleted).map((p) => [p.id, p]));
  const out: Occurrence[] = [];
  for (const i of data.incomes) {
    if (i.deleted) continue;
    for (const d of financeOccurrences(i, from, to)) {
      const p = pay.get(paymentId(i.id, d));
      out.push({
        refId: i.id,
        refType: 'income',
        label: i.label,
        date: d,
        planned: i.amount,
        confirmed: p?.status === 'paid' ? (p.actualAmount ?? i.amount) : undefined,
      });
    }
  }
  for (const f of data.fixed) {
    if (f.deleted || !f.active) continue;
    for (const d of financeOccurrences(f, from, to)) {
      const p = pay.get(paymentId(f.id, d));
      out.push({
        refId: f.id,
        refType: 'fixed',
        label: f.label,
        date: d,
        planned: f.amount,
        confirmed: p?.status === 'paid' ? (p.actualAmount ?? f.amount) : undefined,
        budgetCategoryId: f.budgetCategoryId,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface MonthSummary {
  month: ISOMonth;
  incomePlanned: number;
  incomeReceived: number;
  fixedPlanned: number;
  fixedPaid: number;
  fixedPending: number;
  variable: number;
  savings: number;
  /** Reste à vivre prévisionnel = revenus prévus − dépenses fixes prévues − épargne − dépenses variables. */
  remainingForecast: number;
  /** Reste réel = revenus reçus − prélèvements confirmés − dépenses variables − épargne. */
  remainingActual: number;
  byCategory: { id: string; name: string; color: string; amount: number; limit?: number }[];
  occurrences: Occurrence[];
}

export function monthSummary(data: FinanceData, month: ISOMonth): MonthSummary {
  const from = monthStart(month);
  const to = monthEnd(month);
  const occ = financeOccurrencesIn(data, from, to);
  const inc = occ.filter((o) => o.refType === 'income');
  const fix = occ.filter((o) => o.refType === 'fixed');
  const exp = data.expenses.filter((e) => !e.deleted && e.date >= from && e.date <= to);
  const savings = data.savings
    .filter((s) => !s.deleted)
    .flatMap((s) => s.contributions)
    .filter((c) => c.date >= from && c.date <= to)
    .reduce((a, c) => a + c.amount, 0);

  const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
  const incomePlanned = sum(inc.map((o) => o.planned));
  const incomeReceived = sum(inc.map((o) => o.confirmed ?? 0));
  const fixedPlanned = sum(fix.map((o) => o.confirmed ?? o.planned));
  const fixedPaid = sum(fix.map((o) => o.confirmed ?? 0));
  const variable = sum(exp.map((e) => e.amount));

  const cats = new Map(data.budgetCategories.filter((c) => !c.deleted).map((c) => [c.id, c]));
  const agg = new Map<string, number>();
  for (const o of fix) agg.set(o.budgetCategoryId || '_none', (agg.get(o.budgetCategoryId || '_none') || 0) + (o.confirmed ?? o.planned));
  for (const e of exp) agg.set(e.budgetCategoryId || '_none', (agg.get(e.budgetCategoryId || '_none') || 0) + e.amount);
  const byCategory = [...agg.entries()]
    .map(([id, amount]) => {
      const c = cats.get(id);
      return { id, name: c?.name || 'Sans catégorie', color: c?.color || '#C7A0C9', amount: r2(amount), limit: c?.monthlyLimit };
    })
    .sort((a, b) => b.amount - a.amount);

  return {
    month,
    incomePlanned,
    incomeReceived,
    fixedPlanned,
    fixedPaid,
    fixedPending: r2(fixedPlanned - fixedPaid),
    variable,
    savings: r2(savings),
    remainingForecast: r2(incomePlanned - fixedPlanned - variable - savings),
    remainingActual: r2(incomeReceived - fixedPaid - variable - savings),
    byCategory,
    occurrences: occ,
  };
}

export function history(data: FinanceData, month: ISOMonth, count = 6) {
  const out: MonthSummary[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(monthSummary(data, addMonths(month, -i)));
  return out;
}

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const eur = (n: number) => fmtEUR.format(n);

/** Accepte « 12,50 », « 12.5 », « 1 200 € ». */
export function parseAmount(s: string): number | undefined {
  const clean = s.replace(/\s|€/g, '').replace(',', '.');
  if (!clean) return undefined;
  const n = Number(clean);
  return Number.isFinite(n) ? r2(n) : undefined;
}

export const INCOME_TYPE_LABEL: Record<Income['type'], string> = {
  salaire: 'Salaire',
  prime: 'Prime',
  remboursement: 'Remboursement',
  complementaire: 'Revenu complémentaire',
  autre: 'Autre',
};

import { db as _db, upsert as _upsert } from '../db/db';
/** Confirme (ou annule la confirmation) d'un prélèvement / revenu précis. */
export async function togglePayment(o: Occurrence) {
  const id = paymentId(o.refId, o.date);
  const cur = await _db.payments.get(id);
  const paid = !(cur && !cur.deleted && cur.status === 'paid');
  await _upsert<PaymentStatus>('payments', { id, refId: o.refId, refType: o.refType, date: o.date, status: paid ? 'paid' : 'pending' });
}
