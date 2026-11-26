// Life Analytics : statistiques de fréquence et de répartition calculées à partir du journal.
// Rien n'est chronométré : on compte des JOURNÉES et des ACTIVITÉS, jamais du temps passé.
import type { Contact, DayLog, Expense, ISODate, Tracker, TrackerGroup } from '../db/types';
import { addDays, addMonths, diffDays, fmt, fmtMonth, monthEnd, monthOf, monthStart, range, weekStart } from './dates';
import { FEELINGS, formOf } from './lifeforms';

export type PeriodKind = 'week' | 'month' | 'year';
export interface Period {
  kind: PeriodKind;
  from: ISODate;
  to: ISODate;
  label: string;
}

export function periodOf(kind: PeriodKind, anchor: ISODate): Period {
  if (kind === 'week') {
    const from = weekStart(anchor);
    const to = addDays(from, 6);
    return { kind, from, to, label: `Semaine du ${fmt(from, 'd MMM')}` };
  }
  if (kind === 'month') {
    const m = monthOf(anchor);
    return { kind, from: monthStart(m), to: monthEnd(m), label: fmtMonth(m) };
  }
  const y = anchor.slice(0, 4);
  return { kind, from: `${y}-01-01`, to: `${y}-12-31`, label: `Année ${y}` };
}

export function shiftPeriod(p: Period, n: number): Period {
  if (p.kind === 'week') return periodOf('week', addDays(p.from, 7 * n));
  if (p.kind === 'month') return periodOf('month', monthStart(addMonths(monthOf(p.from), n)));
  return periodOf('year', `${Number(p.from.slice(0, 4)) + n}-06-01`);
}

export interface Count {
  days: number;
  /** Nombre de jours / nombre de jours écoulés de la période. */
  freq: number;
}
export interface TrackerStat extends Count {
  tracker: Tracker;
  /** Nombre d'activités enregistrées (une par jour au maximum pour une même activité). */
  count: number;
  /** Part parmi toutes les activités enregistrées sur la période. */
  share: number;
  spent: number;
}

export interface Analytics {
  period: Period;
  /** Jours de la période déjà passés (aujourd'hui inclus). Les jours futurs ne comptent jamais. */
  elapsed: number;
  logged: number;
  /** Taux de complétion du journal : jours renseignés / jours écoulés. */
  completion: number;
  totalActivities: number;
  perTracker: TrackerStat[];
  perGroup: Record<TrackerGroup, Count>;
  key: {
    work: Count;
    remote: Count;
    office: Count;
    outings: Count;
    resto: Count;
    cafe: Count;
    party: Count;
    rest: Count;
    sport: Count;
    hendaye: Count;
    period: Count;
    pms: Count;
    alcohol: Count;
    social: Count;
  };
  moods: { value: number; days: number }[];
  moodAvg?: number;
  dominantMood?: number;
  feelings: { id: string; label: string; color: string; days: number; avgLevel: number }[];
  symptoms: { pms: [string, number][]; period: [string, number][] };
  people: { contact: Contact; days: number }[];
  places: { contact: Contact; days: number }[];
  spent: { total: number; byTracker: { tracker: Tracker; amount: number }[] };
  byDate: Map<ISODate, DayLog>;
}

const pct = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Un jour compte comme « renseigné » dès qu'il contient une note, un état, une activité ou un texte. */
export function isLogged(l: DayLog) {
  return !l.deleted && (l.items.length > 0 || (typeof l.mood === 'number' && l.mood >= 1) || (l.feelings?.length || 0) > 0 || !!l.text?.trim());
}

export function analyze(
  period: Period,
  logs: DayLog[],
  trackers: Tracker[],
  contacts: Contact[],
  expenses: Expense[],
  today: ISODate,
  groupFilter?: TrackerGroup | null,
): Analytics {
  const end = period.to < today ? period.to : today;
  const elapsed = end >= period.from ? diffDays(end, period.from) + 1 : 0;
  const live = trackers.filter((t) => !t.deleted && (!groupFilter || t.group === groupFilter));
  const byId = new Map(live.map((t) => [t.id, t]));
  const liveContacts = new Map(contacts.filter((c) => !c.deleted).map((c) => [c.id, c]));
  const inP = logs.filter((l) => !l.deleted && l.date >= period.from && l.date <= end);
  const byDate = new Map(inP.map((l) => [l.date, l]));
  const logged = inP.filter(isLogged).length;

  const tDays = new Map<string, Set<ISODate>>();
  const gDays = new Map<TrackerGroup, Set<ISODate>>();
  const formDays = new Map<string, Set<ISODate>>();
  const add = (m: Map<any, Set<ISODate>>, k: any, d: ISODate) => {
    const s = m.get(k) || new Set<ISODate>();
    s.add(d);
    m.set(k, s);
  };
  const peopleDays = new Map<string, Set<ISODate>>();
  const placeDays = new Map<string, Set<ISODate>>();
  const socialDays = new Set<ISODate>();
  const pms = new Map<string, number>();
  const per = new Map<string, number>();
  let total = 0;
  for (const l of inP) {
    const seen = new Set<string>();
    for (const it of l.items) {
      const t = byId.get(it.trackerId);
      if (!t || seen.has(t.id)) continue;
      seen.add(t.id);
      total++;
      add(tDays, t.id, l.date);
      add(gDays, t.group, l.date);
      const f = formOf(t);
      add(formDays, f, l.date);
      for (const id of it.people || []) if (liveContacts.has(id)) (add(peopleDays, id, l.date), socialDays.add(l.date));
      for (const id of it.places || []) if (liveContacts.has(id)) add(placeDays, id, l.date);
      if (f === 'pms') for (const s of it.tags || []) pms.set(s, (pms.get(s) || 0) + 1);
      if (f === 'period') for (const s of it.tags || []) per.set(s, (per.get(s) || 0) + 1);
    }
  }
  const c = (s?: Set<ISODate> | number): Count => {
    const days = typeof s === 'number' ? s : s?.size || 0;
    return { days, freq: pct(days, elapsed) };
  };
  const union = (...ids: string[]) => {
    const u = new Set<ISODate>();
    for (const id of ids) tDays.get(id)?.forEach((d) => u.add(d));
    return u;
  };
  const formUnion = (...forms: string[]) => {
    const u = new Set<ISODate>();
    for (const f of forms) formDays.get(f)?.forEach((d) => u.add(d));
    return u;
  };

  // Dépenses saisies depuis le journal (liées au budget, donc comptées une seule fois).
  const spentBy = new Map<string, number>();
  for (const e of expenses) {
    if (e.deleted || !e.journal || e.date < period.from || e.date > end) continue;
    if (!byId.has(e.journal.trackerId)) continue;
    spentBy.set(e.journal.trackerId, (spentBy.get(e.journal.trackerId) || 0) + e.amount);
  }
  const spentTotal = Math.round([...spentBy.values()].reduce((a, b) => a + b, 0) * 100) / 100;

  const perTracker: TrackerStat[] = live
    .map((t) => {
      const days = tDays.get(t.id)?.size || 0;
      return { tracker: t, days, count: days, freq: pct(days, elapsed), share: pct(days, total), spent: spentBy.get(t.id) || 0 };
    })
    .sort((a, b) => b.days - a.days || a.tracker.order - b.tracker.order);

  const groups: TrackerGroup[] = ['sorties', 'moi', 'cycle', 'soin', 'maison', 'travail', 'etudes', 'autres'];
  const perGroup = Object.fromEntries(groups.map((g) => [g, c(gDays.get(g))])) as Record<TrackerGroup, Count>;

  const moodVals = inP.map((l) => l.mood).filter((m): m is number => typeof m === 'number' && m >= 1 && m <= 5);
  const moods = [1, 2, 3, 4, 5].map((v) => ({ value: v, days: moodVals.filter((m) => m === v).length }));
  const dominant = moodVals.length ? [...moods].sort((a, b) => b.days - a.days || b.value - a.value)[0].value : undefined;

  const feelings = FEELINGS.map((f) => {
    const hits = inP.flatMap((l) => (l.feelings || []).filter((x) => x.id === f.id));
    return { ...f, days: hits.length, avgLevel: hits.length ? Math.round((hits.reduce((a, b) => a + (b.level || 1), 0) / hits.length) * 10) / 10 : 0 };
  })
    .filter((f) => f.days > 0)
    .sort((a, b) => b.days - a.days);
  const hendayeDays = inP.filter((l) => l.feelings?.some((f) => f.id === 'hendaye')).length;

  const rank = (m: Map<string, Set<ISODate>>) =>
    [...m.entries()]
      .map(([id, s]) => ({ contact: liveContacts.get(id)!, days: s.size }))
      .filter((x) => x.contact)
      .sort((a, b) => b.days - a.days || a.contact.order - b.contact.order);
  const sortMap = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

  return {
    period,
    elapsed,
    logged,
    completion: pct(logged, elapsed),
    totalActivities: total,
    perTracker,
    perGroup,
    key: {
      work: c(formUnion('work')),
      remote: c(union('tr-teletravail')),
      office: c(union('tr-bureau')),
      outings: perGroup.sorties,
      resto: c(union('tr-diner')),
      cafe: c(union('tr-cafe')),
      party: c(union('tr-soiree')),
      rest: c(formUnion('rest')),
      sport: c(formUnion('sport')),
      hendaye: c(hendayeDays),
      period: c(formUnion('period')),
      pms: c(formUnion('pms')),
      alcohol: c(union('tr-alcool')),
      social: c(socialDays),
    },
    moods,
    moodAvg: moodVals.length ? Math.round((moodVals.reduce((a, b) => a + b, 0) / moodVals.length) * 10) / 10 : undefined,
    dominantMood: dominant,
    feelings,
    symptoms: { pms: sortMap(pms), period: sortMap(per) },
    people: rank(peopleDays).filter((x) => x.contact.kind === 'person'),
    places: rank(placeDays).filter((x) => x.contact.kind === 'place'),
    spent: {
      total: spentTotal,
      byTracker: [...spentBy.entries()].map(([id, amount]) => ({ tracker: byId.get(id)!, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount),
    },
    byDate,
  };
}

/** Série pour les tendances : les N dernières périodes (la plus ancienne d'abord). */
export function trend(kind: PeriodKind, anchor: ISODate, n: number, fn: (p: Period) => number): { label: string; value: number; period: Period }[] {
  const cur = periodOf(kind, anchor);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = shiftPeriod(cur, -i);
    const label = kind === 'month' ? fmt(p.from, 'MMM') : kind === 'week' ? fmt(p.from, 'd/MM') : p.from.slice(0, 4);
    out.push({ label, value: fn(p), period: p });
  }
  return out;
}

export const daysOf = (p: Period) => range(p.from, p.to);
export const fmtPct = (x: number) => `${Math.round(x * 100)} %`;
