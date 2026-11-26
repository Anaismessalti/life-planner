// Life Analytics : statistiques de fréquence et de répartition calculées à partir du journal.
// Rien n'est chronométré : on compte des JOURNÉES et des ACTIVITÉS, jamais du temps passé.
import type { Category, Contact, DayLog, Expense, ISODate, Task, Tracker, TrackerGroup } from '../db/types';
import { addDays, addMonths, diffDays, fmt, fmtMonth, monthEnd, monthOf, monthStart, range, weekStart } from './dates';
import { FEELINGS, formOf } from './lifeforms';
import { expandTasks, isSeries, postponeCount } from './tasks';
import { avgBedtime, eveningDone, morningDone, sleepMinutes } from './wellbeing';

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
  sleep: { nights: number; avgMin?: number; avgQuality?: number; short: number; bedtime?: string; quality: { value: number; nights: number }[]; tags: [string, number][] };
  /** Note globale des journées (sur 10). */
  score: { days: number; avg?: number; best: { date: ISODate; score: number }[] };
  /** Sorties, soirées, voyages notés (sur 10). */
  rated: { count: number; avg?: number; top: { date: ISODate; tracker: Tracker; rating: number; with: string[] }[]; byTracker: { tracker: Tracker; avg: number; count: number }[] };
  fmj: { mornings: number; evenings: number; days: number; gratitudes: number; breathe: number; recent: { date: ISODate; text: string }[] };
  /** Ce qui était prévu dans l'agenda (tâches et rendez-vous) sur la période. */
  agenda?: AgendaStats;
}

export interface AgendaStats {
  /** Rendez-vous qui ont réellement eu lieu (confirmés). */
  events: number;
  planned: number;
  cancelled: number;
  noshow: number;
  /** Passés mais pas encore confirmés : listés, jamais comptés comme faits. */
  unconfirmed: number;
  eventDays: number;
  upcoming: number;
  /** Tâches prévues sur la période, au jour où elles étaient prévues au départ (hors « plus nécessaire »). */
  tasks: number;
  done: number;
  doneLate: number;
  dropped: number;
  doneRate: number;
  postponed: number;
  byCategory: { id: string; name: string; color: string; events: number; tasks: number }[];
  moodWithEvents?: number;
  moodWithout?: number;
  moodWithN: number;
  moodWithoutN: number;
}

export interface AgendaInput {
  tasks: Task[];
  categories: Category[];
}

const avg1 = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : undefined);

/** Il faut au moins ce nombre de jours dans chaque groupe pour comparer deux moyennes d'humeur. */
export const MIN_GROUP = 8;

export function agendaStats(period: Period, end: ISODate, input: AgendaInput, byDate: Map<ISODate, DayLog>): AgendaStats {
  const cats = new Map(input.categories.filter((c) => !c.deleted).map((c) => [c.id, c]));
  const all = expandTasks(input.tasks, period.from, period.to);
  const events = all.filter((t) => t.kind === 'event' && t.date! <= end);
  const happened = events.filter((e) => e.outcome === 'happened');
  // Une tâche compte pour le jour où elle était prévue au départ : un report ne la compte jamais deux fois.
  const anchor = (t: Task) => t.originalDate || t.date;
  const real = input.tasks.filter((t) => !t.deleted && !isSeries(t) && t.kind === 'task' && anchor(t) && anchor(t)! >= period.from && anchor(t)! <= end);
  const virt = all.filter((t) => t.kind === 'task' && t.virtual && t.date! <= end);
  const planned = [...real, ...virt];
  const counted = planned.filter((t) => t.outcome !== 'dropped' && t.outcome !== 'skipped');
  const done = counted.filter((t) => t.status === 'done');
  const eventDays = new Set(happened.map((e) => e.date!));
  const byCat = new Map<string, { id: string; name: string; color: string; events: number; tasks: number }>();
  for (const t of [...happened, ...counted]) {
    const c = t.categoryId ? cats.get(t.categoryId) : undefined;
    const id = c?.id || '_none';
    const row = byCat.get(id) || { id, name: c?.name || 'Sans catégorie', color: c?.color || '#C7A0C9', events: 0, tasks: 0 };
    if (t.kind === 'event') row.events++;
    else row.tasks++;
    byCat.set(id, row);
  }
  const moodsWith: number[] = [];
  const moodsWithout: number[] = [];
  for (const [d, l] of byDate) {
    if (typeof l.mood !== 'number' || l.mood < 1) continue;
    (eventDays.has(d) ? moodsWith : moodsWithout).push(l.mood);
  }
  const enough = moodsWith.length >= MIN_GROUP && moodsWithout.length >= MIN_GROUP;
  return {
    events: happened.length,
    planned: events.length,
    cancelled: events.filter((e) => e.outcome === 'cancelled').length,
    noshow: events.filter((e) => e.outcome === 'noshow').length,
    unconfirmed: events.filter((e) => !e.outcome && e.date! < end).length,
    eventDays: eventDays.size,
    upcoming: all.filter((t) => t.kind === 'event' && t.date! > end && !t.outcome).length,
    tasks: counted.length,
    done: done.length,
    doneLate: done.filter((t) => postponeCount(t) > 0).length,
    dropped: planned.length - counted.length,
    doneRate: pct(done.length, counted.length),
    postponed: counted.filter((t) => postponeCount(t) > 0).length,
    byCategory: [...byCat.values()].sort((a, b) => b.events + b.tasks - (a.events + a.tasks)),
    moodWithEvents: enough ? avg1(moodsWith) : undefined,
    moodWithout: enough ? avg1(moodsWithout) : undefined,
    moodWithN: moodsWith.length,
    moodWithoutN: moodsWithout.length,
  };
}

const pct = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Un jour compte comme « renseigné » dès qu'il contient une note, un état, une activité, un texte, sa nuit ou son Five Minute Journal. */
export function firstUse(logs: DayLog[]): ISODate | undefined {
  let f: ISODate | undefined;
  for (const l of logs) if (isLogged(l) && (!f || l.date < f)) f = l.date;
  return f;
}

export function isLogged(l: DayLog) {
  return (
    !l.deleted &&
    (l.items.length > 0 ||
      (typeof l.mood === 'number' && l.mood >= 1) ||
      (l.feelings?.length || 0) > 0 ||
      !!l.text?.trim() ||
      (typeof l.score === 'number' && l.score >= 1) ||
      sleepMinutes(l.sleep) !== undefined ||
      !!l.sleep?.quality ||
      morningDone(l.fmj) ||
      eveningDone(l.fmj))
  );
}

export function analyze(
  period: Period,
  logs: DayLog[],
  trackers: Tracker[],
  contacts: Contact[],
  expenses: Expense[],
  today: ISODate,
  groupFilter?: TrackerGroup | null,
  agenda?: AgendaInput,
): Analytics {
  const end = period.to < today ? period.to : today;
  // Les jours d'avant ta première utilisation du journal ne comptent pas comme « non renseignés ».
  const first = firstUse(logs);
  const start = first && first > period.from ? first : period.from;
  const elapsed = end >= start ? diffDays(end, start) + 1 : 0;
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

  const groups: TrackerGroup[] = ['sorties', 'amour', 'social', 'moi', 'cycle', 'sante', 'soin', 'maison', 'travail', 'etudes', 'autres'];
  const perGroup = Object.fromEntries(groups.map((g) => [g, c(gDays.get(g))])) as Record<TrackerGroup, Count>;

  const moodVals = inP.map((l) => l.mood).filter((m): m is number => typeof m === 'number' && m >= 1 && m <= 5);
  const moods = [1, 2, 3, 4, 5].map((v) => ({ value: v, days: moodVals.filter((m) => m === v).length }));
  const mAvg = moodVals.length ? moodVals.reduce((a, b) => a + b, 0) / moodVals.length : 0;
  // À égalité, l'humeur la plus proche de la moyenne (et non la plus haute) : pas de biais vers le positif.
  const dominant = moodVals.length ? [...moods].sort((a, b) => b.days - a.days || Math.abs(a.value - mAvg) - Math.abs(b.value - mAvg) || a.value - b.value)[0].value : undefined;

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

  // Sommeil : une nuit compte si la durée ou la qualité est renseignée.
  const nights = inP.filter((l) => l.sleep && (sleepMinutes(l.sleep) !== undefined || l.sleep.quality));
  const mins = nights.map((l) => sleepMinutes(l.sleep)).filter((m): m is number => m !== undefined);
  const qual = nights.map((l) => l.sleep!.quality).filter((q): q is number => typeof q === 'number' && q >= 1 && q <= 4);
  const sleepTags = new Map<string, number>();
  for (const l of nights) for (const t of l.sleep!.tags || []) sleepTags.set(t, (sleepTags.get(t) || 0) + 1);
  const fmjDays = inP.filter((l) => morningDone(l.fmj) || eveningDone(l.fmj));
  const recent = [...fmjDays]
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((l) => [...(l.fmj?.grateful || []), ...(l.fmj?.amazing || [])].filter((x) => x?.trim()).map((text) => ({ date: l.date, text: text.trim() })))
    .slice(0, 6);

  const scored = inP.filter((l) => typeof l.score === 'number' && l.score >= 1 && l.score <= 10);
  const ratedItems: { date: ISODate; tracker: Tracker; rating: number; with: string[] }[] = [];
  for (const l of inP)
    for (const it of l.items) {
      const t = byId.get(it.trackerId);
      if (!t || typeof it.rating !== 'number' || it.rating < 1 || it.rating > 10) continue;
      const names = [...(it.people || []), ...(it.places || [])].map((id) => liveContacts.get(id)?.name).filter((x): x is string => !!x);
      ratedItems.push({ date: l.date, tracker: t, rating: it.rating, with: names });
    }
  const rByT = new Map<string, number[]>();
  for (const r of ratedItems) rByT.set(r.tracker.id, [...(rByT.get(r.tracker.id) || []), r.rating]);

  return {
    period,
    elapsed,
    score: {
      days: scored.length,
      avg: avg1(scored.map((l) => l.score!)),
      best: [...scored].sort((a, b) => b.score! - a.score! || b.date.localeCompare(a.date)).slice(0, 3).map((l) => ({ date: l.date, score: l.score! })),
    },
    rated: {
      count: ratedItems.length,
      avg: avg1(ratedItems.map((r) => r.rating)),
      top: [...ratedItems].sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date)).slice(0, 5),
      byTracker: [...rByT.entries()].filter(([, v]) => v.length >= 3).map(([id, v]) => ({ tracker: byId.get(id)!, avg: avg1(v)!, count: v.length })).sort((a, b) => b.avg - a.avg || b.count - a.count),
    },
    sleep: {
      nights: nights.length,
      avgMin: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : undefined,
      avgQuality: avg1(qual),
      short: mins.filter((m) => m < 7 * 60).length,
      bedtime: avgBedtime(nights.map((l) => l.sleep!.bed || '')),
      quality: [1, 2, 3, 4].map((v) => ({ value: v, nights: qual.filter((q) => q === v).length })),
      tags: sortMap(sleepTags),
    },
    fmj: {
      mornings: fmjDays.filter((l) => morningDone(l.fmj)).length,
      evenings: fmjDays.filter((l) => eveningDone(l.fmj)).length,
      days: fmjDays.length,
      gratitudes: fmjDays.reduce((n, l) => n + (l.fmj?.grateful || []).filter((x) => x?.trim()).length, 0),
      breathe: inP.reduce((n, l) => n + (l.fmj?.breathe || 0), 0),
      recent,
    },
    agenda: agenda ? agendaStats(period, end, agenda, byDate) : undefined,
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
export function trend(kind: PeriodKind, anchor: ISODate, n: number, fn: (p: Period) => number | null): { label: string; value: number | null; period: Period }[] {
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
