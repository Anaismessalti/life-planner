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
  /** Éléments supprimés, gardés pour nommer correctement l'historique. */
  archive?: { incomes: Income[]; fixed: FixedExpense[]; budgetCategories: BudgetCategory[]; savings: SavingsGoal[] };
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
  /** Paiement confirmé d'un élément supprimé ou dont la date a changé (gardé pour l'historique). */
  orphan?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function financeOccurrencesIn(data: Pick<FinanceData, 'incomes' | 'fixed' | 'payments' | 'archive'>, from: ISODate, to: ISODate): Occurrence[] {
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
    // Désactivé = arrêté à sa date de fin : les mois passés restent intacts.
    if (f.deleted || (!f.active && !f.endDate)) continue;
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
  // Paiements confirmés dont le revenu / prélèvement a été supprimé ou modifié : on les garde dans l'historique.
  const seen = new Set(out.map((o) => paymentId(o.refId, o.date)));
  const refs = new Map<string, { label: string; cat?: string }>([
    ...[...(data.archive?.incomes || []), ...data.incomes].map((i) => [i.id, { label: i.label }] as const),
    ...[...(data.archive?.fixed || []), ...data.fixed].map((f) => [f.id, { label: f.label, cat: f.budgetCategoryId }] as const),
  ]);
  const orphanMonths = new Set<string>();
  for (const p of data.payments) {
    if (p.deleted || p.status !== 'paid' || p.actualAmount === undefined || p.date < from || p.date > to || seen.has(p.id)) continue;
    const ref = refs.get(p.refId);
    out.push({ refId: p.refId, refType: p.refType, label: ref?.label || (p.refType === 'income' ? 'Revenu' : 'Prélèvement'), date: p.date, planned: p.actualAmount, confirmed: p.actualAmount, budgetCategoryId: ref?.cat, orphan: true });
    orphanMonths.add(`${p.refId}|${p.date.slice(0, 7)}`);
  }
  // Date d'un loyer changée (du 5 au 10) : le paiement déjà confirmé du mois suffit, on ne compte pas une 2e fois l'échéance non confirmée.
  return out
    .filter((o) => o.orphan || o.confirmed !== undefined || !orphanMonths.has(`${o.refId}|${o.date.slice(0, 7)}`))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Plafond d'une catégorie pour un mois : le dernier fixé à partir de ce mois ou avant. Les mois passés ne bougent jamais. */
export function limitFor(c: BudgetCategory, month: ISOMonth): number | undefined {
  const keys = Object.keys(c.limits || {}).filter((k) => k <= month).sort();
  if (keys.length) {
    const v = c.limits![keys[keys.length - 1]];
    return typeof v === 'number' && v > 0 ? v : undefined;
  }
  return c.limits && Object.keys(c.limits).length ? undefined : c.monthlyLimit || undefined;
}

/** Change le plafond à partir d'un mois, sans toucher aux mois précédents. */
export function limitsPatch(c: BudgetCategory, month: ISOMonth, amount: number | undefined): Partial<BudgetCategory> {
  const limits = { ...(c.limits || {}) };
  // Première fois : l'ancien plafond unique devient l'historique de tous les mois précédents.
  if (!Object.keys(limits).length && c.monthlyLimit) limits['0000-01'] = c.monthlyLimit;
  limits[month] = amount && amount > 0 ? amount : null;
  return { limits, monthlyLimit: undefined };
}

export interface CategoryStatus {
  id: string;
  name: string;
  color: string;
  /** Réellement dépensé (dépenses saisies + prélèvements confirmés). */
  amount: number;
  /** Prélèvements prévus mais pas encore confirmés. */
  pending: number;
  limit?: number;
  /** Part du plafond utilisée (réel seulement), ex. 1,175 pour 117,5 %. */
  used?: number;
  over?: number;
  left?: number;
  /** Projection de fin de mois (mois en cours uniquement, à partir du rythme des dépenses variables). */
  projected?: number;
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
  byCategory: CategoryStatus[];
  occurrences: Occurrence[];
}

export function monthSummary(data: FinanceData, month: ISOMonth, opts?: { today?: ISODate }): MonthSummary {
  const from = monthStart(month);
  const to = monthEnd(month);
  const occ = financeOccurrencesIn(data, from, to);
  const inc = occ.filter((o) => o.refType === 'income');
  const fix = occ.filter((o) => o.refType === 'fixed');
  const exp = data.expenses.filter((e) => !e.deleted && e.date >= from && e.date <= to);
  // Un objectif supprimé garde ses versements passés : l'argent a bien été mis de côté ces mois-là.
  const savings = [...(data.archive?.savings || []), ...data.savings]
    .flatMap((s) => s.contributions)
    .filter((c) => c.date >= from && c.date <= to)
    .reduce((a, c) => a + c.amount, 0);

  const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
  const incomePlanned = sum(inc.map((o) => o.confirmed ?? o.planned));
  const incomeReceived = sum(inc.map((o) => o.confirmed ?? 0));
  const fixedPlanned = sum(fix.map((o) => o.confirmed ?? o.planned));
  const fixedPaid = sum(fix.map((o) => o.confirmed ?? 0));
  const variable = sum(exp.map((e) => e.amount));

  const cats = new Map([...(data.archive?.budgetCategories || []), ...data.budgetCategories].map((c) => [c.id, c]));
  const real = new Map<string, number>();
  const pend = new Map<string, number>();
  const vari = new Map<string, number>();
  const key = (id?: string) => (id && cats.has(id) ? id : '_none');
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);
  for (const o of fix) {
    if (o.confirmed !== undefined) add(real, key(o.budgetCategoryId), o.confirmed);
    else add(pend, key(o.budgetCategoryId), o.planned);
  }
  for (const e of exp) {
    add(real, key(e.budgetCategoryId), e.amount);
    add(vari, key(e.budgetCategoryId), e.amount);
  }
  // Projection : seulement pour le mois en cours, après au moins 7 jours, au rythme des dépenses variables.
  const today = opts?.today;
  const elapsed = today && today >= from && today <= to ? Number(today.slice(8, 10)) : 0;
  const daysInM = Number(to.slice(8, 10));
  const byCategory = [...new Set([...real.keys(), ...pend.keys()])]
    .map((id): CategoryStatus => {
      const c = cats.get(id);
      const amount = r2(real.get(id) || 0);
      const pending = r2(pend.get(id) || 0);
      const limit = c && !c.deleted ? limitFor(c, month) : undefined;
      const v = vari.get(id) || 0;
      const projected = elapsed >= 7 && v > 0 && elapsed < daysInM ? r2(amount + pending + (v / elapsed) * (daysInM - elapsed)) : undefined;
      return {
        id,
        name: c ? c.name + (c.deleted ? ' (supprimée)' : '') : 'Sans catégorie',
        color: c?.color || '#C7A0C9',
        amount,
        pending,
        limit,
        used: limit ? amount / limit : undefined,
        over: limit && amount > limit ? r2(amount - limit) : undefined,
        left: limit && amount <= limit ? r2(limit - amount) : undefined,
        projected,
      };
    })
    .filter((c) => c.amount !== 0 || c.pending !== 0)
    .sort((a, b) => b.amount + b.pending - (a.amount + a.pending));

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

export function history(data: FinanceData, month: ISOMonth, count = 6, opts?: { today?: ISODate }) {
  const out: MonthSummary[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(monthSummary(data, addMonths(month, -i), opts));
  return out;
}

const fmtEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const eur = (n: number) => fmtEUR.format(n);

/**
 * Lit un montant écrit à la française : « 12,50 », « 12.5 », « 1 234,56 € », « 1.234,50 ».
 * Renvoie undefined si ce n'est pas un montant (jamais de « 1e3 » ou « 0x10 »).
 */
export function parseAmount(input: string): number | undefined {
  let s = input.replace(/[\s\u00a0\u202f€]/g, '');
  if (!s || !/^[-+]?[\d.,]+$/.test(s)) return undefined;
  if (s.includes(',')) {
    if ((s.match(/,/g) || []).length > 1) return undefined;
    s = s.replace(/\.(?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
  } else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return undefined;
  const n = Number(s);
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
  // Le montant est figé à la confirmation : modifier plus tard le montant prévu ne réécrit pas le passé.
  await _upsert<PaymentStatus>('payments', {
    id,
    refId: o.refId,
    refType: o.refType,
    date: o.date,
    status: paid ? 'paid' : 'pending',
    actualAmount: paid ? (cur && !cur.deleted && cur.actualAmount !== undefined ? cur.actualAmount : o.planned) : undefined,
  });
}

/** Indique le montant réellement payé / reçu (s'il diffère du prévu) et confirme l'opération. */
export async function setPaymentAmount(o: Occurrence, amount: number) {
  await _upsert<PaymentStatus>('payments', { id: paymentId(o.refId, o.date), refId: o.refId, refType: o.refType, date: o.date, status: 'paid', actualAmount: r2(amount) });
}
