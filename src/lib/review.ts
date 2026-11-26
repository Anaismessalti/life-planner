// Le bilan en bref, les croisements et l'équilibre : des phrases simples, avec des garde-fous sur la taille des échantillons.
// Règles : on compare des taux (jours / jours renseignés), jamais des totaux bruts entre périodes de longueurs différentes ;
// une absence de données n'est jamais un zéro ; un croisement est une observation, pas une cause.
import type { DayLog, ISODate, Tracker, TrackerGroup } from '../db/types';
import { isLogged, MIN_GROUP, type Analytics } from './analytics';
import { addDays, fmt } from './dates';
import type { CategoryStatus } from './finance';
import { eur } from './finance';
import { formOf } from './lifeforms';
import { sleepMinutes } from './wellbeing';

const n1 = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
export const median = (v: number[]) => {
  if (!v.length) return undefined;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Seuils du bilan. */
export const REVIEW = {
  /** En dessous de cette part de jours renseignés, le bilan est signalé comme partiel. */
  partial: 0.5,
  /** Avant ce nombre de jours de journal, aucun pourcentage : « 1 jour sur 1 = 100 % » ne veut rien dire. */
  young: 7,
  /** Jours d'humeur nécessaires pour qualifier la période. */
  moodDays: 10,
  /** Tâches nécessaires pour parler d'un taux de réalisation. */
  tasks: 3,
  /** Jours renseignés nécessaires pour qu'une période passée serve de point de comparaison. */
  refLogged: 10,
};

interface Compared {
  id: string;
  /** « de sport », « de sorties »… */
  what: string;
  days: number;
  /** Ce qu'on attendrait au rythme habituel, sur le même nombre de jours renseignés. */
  usual: number;
}

const COMPARED: { id: string; what: string; pick: (a: Analytics) => number; neglect: boolean }[] = [
  { id: 'outings', what: 'de sorties', pick: (a) => a.key.outings.days, neglect: true },
  { id: 'social', what: 'de moments avec tes proches', pick: (a) => a.key.social.days, neglect: true },
  { id: 'sport', what: 'de sport', pick: (a) => a.key.sport.days, neglect: true },
  { id: 'rest', what: 'de repos', pick: (a) => a.key.rest.days, neglect: true },
  { id: 'fmj', what: 'de Five Minute Journal', pick: (a) => a.fmj.days, neglect: true },
  { id: 'work', what: 'de jours travaillés', pick: (a) => a.key.work.days, neglect: false },
  { id: 'hendaye', what: 'de lendemains HENDAYE', pick: (a) => a.key.hendaye.days, neglect: false },
];

/** Hausses et baisses nettes par rapport à la médiane des périodes précédentes (au prorata des jours renseignés). */
export function compareToUsual(a: Analytics, history: Analytics[]) {
  const refs = history.filter((h) => h.logged >= REVIEW.refLogged);
  const up: Compared[] = [];
  const down: (Compared & { neglect: boolean })[] = [];
  if (refs.length < 2 || a.logged < REVIEW.refLogged) return { up, down, refs: refs.length };
  for (const m of COMPARED) {
    const med = median(refs.map((h) => m.pick(h) / h.logged))!;
    const days = m.pick(a);
    const usual = med * a.logged;
    const diff = days - usual;
    if (Math.abs(diff) < 2) continue;
    if (days >= usual * 1.3 && diff > 0) up.push({ id: m.id, what: m.what, days, usual: Math.round(usual) });
    else if (days <= usual * 0.7 && diff < 0) down.push({ id: m.id, what: m.what, days, usual: Math.round(usual), neglect: m.neglect });
  }
  return { up, down, refs: refs.length };
}

const IDEA: Record<string, string> = {
  outings: 'Si les sorties te manquent, propose un verre ou un dîner à quelqu’un cette semaine.',
  social: 'Si tes proches te manquent, un appel ou un café suffit pour renouer.',
  sport: 'Si le sport te manque, réserve un créneau dans ton agenda, même court.',
  rest: 'Garde-toi une soirée sans rien de prévu la semaine prochaine.',
  fmj: 'Le Five Minute Journal prend cinq minutes : au réveil, c’est souvent le plus simple.',
};

export interface HabitMonth {
  name: string;
  done: number;
  /** Objectif ramené à la période : X fois par semaine × jours écoulés / 7. */
  target: number;
}

export interface Review {
  title: string;
  coverage: { logged: number; elapsed: number; partial: boolean; text: string };
  lived: string[];
  done: string[];
  aside: string[];
  money: string[];
  ideas: string[];
}

/** « Mon mois en bref » : comment j'ai vécu la période, ce que j'ai fait, ce que j'ai laissé de côté, des pistes. */
export function buildReview(a: Analytics, history: Analytics[], opts: { habits?: HabitMonth[]; budget?: CategoryStatus[] } = {}): Review {
  const word = a.period.kind === 'week' ? 'semaine' : a.period.kind === 'year' ? 'année' : 'mois';
  const ce = a.period.kind === 'month' ? 'ce' : 'cette';
  const title = `${a.period.kind === 'month' ? 'Mon' : 'Ma'} ${word} en bref`;
  const young = a.elapsed > 0 && a.elapsed < REVIEW.young;
  const partial = !young && a.elapsed > 0 && a.logged / a.elapsed < REVIEW.partial;
  const coverage = {
    logged: a.logged,
    elapsed: a.elapsed,
    partial,
    text:
      a.elapsed === 0
        ? ''
        : young
          ? `Jour ${a.elapsed} de ton journal (${a.logged} jour${a.logged > 1 ? 's' : ''} noté${a.logged > 1 ? 's' : ''}) : ton premier vrai bilan arrive au ${REVIEW.young}e jour.`
          : `Journal rempli ${a.logged} jour${a.logged > 1 ? 's' : ''} sur ${a.elapsed}.${partial ? ' Bilan partiel : il décrit seulement les jours que tu as notés.' : ''}`,
  };
  const lived: string[] = [];
  const done: string[] = [];
  const aside: string[] = [];
  const money: string[] = [];
  const ideas: string[] = [];

  // Humeur : seulement s'il y a assez de jours notés.
  const nMood = a.moods.reduce((s, m) => s + m.days, 0);
  const usualMood = median(history.filter((h) => h.moods.reduce((s, m) => s + m.days, 0) >= REVIEW.moodDays && h.moodAvg !== undefined).map((h) => h.moodAvg!));
  if (nMood >= REVIEW.moodDays && a.moodAvg !== undefined) {
    const tone = a.moodAvg >= 3.8 ? `Un${word === 'mois' ? '' : 'e'} ${word} plutôt lumineu${word === 'mois' ? 'x' : 'se'}` : a.moodAvg <= 2.6 ? `Un${word === 'mois' ? '' : 'e'} ${word} plus difficile` : `Un${word === 'mois' ? '' : 'e'} ${word} en demi-teinte`;
    lived.push(`${tone} : humeur moyenne ${n1(a.moodAvg)}/5 sur ${nMood} jours notés${usualMood !== undefined ? ` (d'habitude ${n1(usualMood)})` : ''}.`);
  } else if (nMood > 0) {
    lived.push(`Humeur notée ${plural(nMood, 'jour')} seulement : trop peu pour dire comment s'est passé${word === 'mois' ? '' : 'e'} ${ce} ${word}.`);
  }
  const cmp = compareToUsual(a, history);
  for (const u of cmp.up.slice(0, 3)) lived.push(`Plus ${u.what} que d'habitude : ${u.days} jours, contre environ ${u.usual} à ce rythme.`);
  if (a.score.days >= 5 && a.score.best[0]) lived.push(`Ta plus belle journée : ${fmt(a.score.best[0].date, 'EEEE d MMMM')} (${a.score.best[0].score}/10).`);
  if (a.people[0] && a.people[0].days >= 2) lived.push(`La personne que tu as le plus vue : ${a.people[0].contact.name} (${plural(a.people[0].days, 'jour')}).`);

  // Ce que j'ai accompli.
  const g = a.agenda;
  if (g && g.tasks >= REVIEW.tasks) {
    done.push(`Tu as fait ${g.done} des ${g.tasks} tâches prévues (${Math.round(g.doneRate * 100)} %)${g.doneLate ? `, dont ${g.doneLate} après un report` : ''}.`);
  }
  if (g && g.events) {
    const lost = g.cancelled + g.noshow;
    done.push(`${plural(g.events, 'rendez-vous')} ${g.events > 1 ? 'ont' : 'a'} eu lieu${lost ? ` (${lost} annulé${lost > 1 ? 's' : ''} ou pas honoré${lost > 1 ? 's' : ''}, non comptés)` : ''}.`);
  }
  for (const h of opts.habits || []) {
    if (h.target >= 1 && h.done >= h.target) done.push(`${h.name} : ${h.done} fois, objectif tenu (environ ${h.target}).`);
    else if (h.target >= 2 && h.done < h.target * 0.6) aside.push(`${h.name} : ${h.done} fois, pour un objectif d'environ ${h.target}.`);
  }
  if (a.rated.top[0]) {
    const r = a.rated.top[0];
    done.push(`Ta meilleure sortie : ${r.tracker.name}${r.with.length ? ` avec ${r.with.slice(0, 2).join(', ')}` : ''}, ${r.rating}/10.`);
  }
  if (a.fmj.gratitudes) done.push(`${plural(a.fmj.gratitudes, 'gratitude')} écrite${a.fmj.gratitudes > 1 ? 's' : ''} dans ton Five Minute Journal.`);

  // Ce que j'ai laissé de côté (sans reproche).
  for (const d of cmp.down.filter((x) => x.neglect).slice(0, 3)) aside.push(`Moins ${d.what} que d'habitude : ${d.days} jours, contre environ ${d.usual}.`);
  for (const d of cmp.down.filter((x) => !x.neglect).slice(0, 2)) lived.push(`Moins ${d.what} que d'habitude : ${d.days} jours, contre environ ${d.usual}.`);
  if (g && g.unconfirmed) aside.push(`${plural(g.unconfirmed, 'rendez-vous')} passé${g.unconfirmed > 1 ? 's' : ''} attend${g.unconfirmed > 1 ? 'ent' : ''} ta confirmation : ${g.unconfirmed > 1 ? 'ils ne sont' : "il n'est"} pas encore compté${g.unconfirmed > 1 ? 's' : ''}.`);

  // Argent : jamais de plafond modifié, seulement des constats.
  for (const c of (opts.budget || []).filter((c) => c.over).slice(0, 3)) money.push(`Tu as dépassé ton budget ${c.name.toLowerCase()} de ${eur(c.over!)} ${ce} ${word}.`);
  for (const c of (opts.budget || []).filter((c) => !c.over && c.projected !== undefined && c.limit && c.projected > c.limit).slice(0, 2))
    money.push(`À ce rythme, ton budget ${c.name.toLowerCase()} serait dépassé d'environ ${eur(c.projected! - c.limit!)} en fin de mois.`);

  // Pistes : deux au plus, concrètes, jamais culpabilisantes.
  const lack = cmp.down.find((x) => x.neglect);
  if (lack && IDEA[lack.id]) ideas.push(IDEA[lack.id]);
  const weakHabit = (opts.habits || []).find((h) => h.target >= 2 && h.done < h.target * 0.6);
  if (weakHabit && ideas.length < 2) ideas.push(`Pour ${weakHabit.name.toLowerCase()}, un objectif un peu plus bas mais tenu vaut mieux qu'un objectif haut qui pèse.`);
  const over = (opts.budget || []).find((c) => c.over);
  if (over && ideas.length < 2) ideas.push(`Regarde si ton plafond ${over.name.toLowerCase()} est réaliste, ou ce qui l'a fait dépasser. C'est toi qui décides de le changer.`);
  if (partial && ideas.length < 2) ideas.push('Noter même une seule chose par jour rendra ce bilan plus juste.');

  return { title, coverage, lived, done, aside, money, ideas };
}

/** Objectifs d'habitudes ramenés à une période (pour le bilan). */
export function habitsOver(a: Analytics, habits: { id: string; perWeek: number }[]): HabitMonth[] {
  return habits
    .map((h) => {
      const p = a.perTracker.find((x) => x.tracker.id === h.id);
      if (!p) return undefined;
      return { name: p.tracker.name, done: p.days, target: Math.round((h.perWeek * a.elapsed) / 7) };
    })
    .filter((x): x is HabitMonth => !!x);
}

// ---------- Croisements ----------

export interface Crossing {
  id: string;
  text: string;
  /** Écart observé (humeur sur 5, ou points de pourcentage). */
  delta: number;
  n: [number, number];
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const variance = (v: number[]) => {
  const m = mean(v);
  return v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, v.length - 1);
};
/** t de Welch : l'écart est-il grand par rapport au bruit ? */
export function welch(a: number[], b: number[]) {
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  return se === 0 ? (mean(a) === mean(b) ? 0 : Infinity) : (mean(a) - mean(b)) / se;
}

export const CROSS = { days: 90, minDelta: 0.5, minT: 2, parties: 6, nextDay: 0.25 };

/**
 * Ce que je remarque sur les 90 derniers jours : seulement des écarts nets, sur assez de jours dans chaque groupe.
 * Formulé comme une observation, jamais comme une cause.
 */
export function crossings(logs: DayLog[], trackers: Tracker[], end: ISODate): Crossing[] {
  const from = addDays(end, -(CROSS.days - 1));
  const inW = logs.filter((l) => !l.deleted && l.date >= from && l.date <= end);
  const byDate = new Map(inW.map((l) => [l.date, l]));
  const withMood = inW.filter((l) => typeof l.mood === 'number' && l.mood >= 1 && l.mood <= 5);
  const out: Crossing[] = [];
  const compare = (id: string, label: string, test: (l: DayLog) => boolean) => {
    const yes = withMood.filter(test).map((l) => l.mood!);
    const no = withMood.filter((l) => !test(l)).map((l) => l.mood!);
    if (yes.length < MIN_GROUP || no.length < MIN_GROUP) return;
    const d = mean(yes) - mean(no);
    if (Math.abs(d) < CROSS.minDelta || Math.abs(welch(yes, no)) < CROSS.minT) return;
    out.push({
      id,
      delta: d,
      n: [yes.length, no.length],
      text: `${label}, ton humeur moyenne est de ${n1(mean(yes))}/5, contre ${n1(mean(no))} les autres jours (${yes.length} et ${no.length} jours).`,
    });
  };
  for (const t of trackers.filter((t) => !t.deleted && t.group !== 'cycle')) compare(t.id, `Les jours avec « ${t.name} »`, (l) => l.items.some((i) => i.trackerId === t.id));
  // Cycle : on regroupe règles et SPM.
  const cycleIds = new Set(trackers.filter((t) => ['period', 'pms'].includes(formOf(t))).map((t) => t.id));
  if (cycleIds.size) compare('cycle', 'Les jours de règles ou de SPM', (l) => l.items.some((i) => cycleIds.has(i.trackerId)));
  // Sommeil court (la nuit compte pour le jour du réveil).
  const slept = withMood.filter((l) => sleepMinutes(l.sleep) !== undefined);
  if (slept.length >= MIN_GROUP * 2) {
    const short = slept.filter((l) => sleepMinutes(l.sleep)! < 7 * 60).map((l) => l.mood!);
    const ok = slept.filter((l) => sleepMinutes(l.sleep)! >= 7 * 60).map((l) => l.mood!);
    if (short.length >= MIN_GROUP && ok.length >= MIN_GROUP) {
      const d = mean(short) - mean(ok);
      if (Math.abs(d) >= CROSS.minDelta && Math.abs(welch(short, ok)) >= CROSS.minT)
        out.push({ id: 'sleep', delta: d, n: [short.length, ok.length], text: `Après une nuit de moins de 7 h, ton humeur moyenne est de ${n1(mean(short))}/5, contre ${n1(mean(ok))} après une nuit plus longue (${short.length} et ${ok.length} jours).` });
    }
  }
  // Soirée → lendemain HENDAYE.
  const partyIds = new Set(trackers.filter((t) => t.id === 'tr-soiree' || t.id === 'tr-boite').map((t) => t.id));
  const isH = (l?: DayLog) => !!l?.feelings?.some((f) => f.id === 'hendaye');
  const pairs = inW.filter((l) => byDate.has(addDays(l.date, 1)) && isLogged(byDate.get(addDays(l.date, 1))!));
  const after = pairs.filter((l) => l.items.some((i) => partyIds.has(i.trackerId)));
  const others = pairs.filter((l) => !l.items.some((i) => partyIds.has(i.trackerId)));
  if (after.length >= CROSS.parties && others.length >= MIN_GROUP) {
    const p1 = after.filter((l) => isH(byDate.get(addDays(l.date, 1)))).length / after.length;
    const p0 = others.filter((l) => isH(byDate.get(addDays(l.date, 1)))).length / others.length;
    if (p1 - p0 >= CROSS.nextDay)
      out.push({ id: 'hendaye', delta: p1 - p0, n: [after.length, others.length], text: `Après une soirée, le lendemain est HENDAYE ${Math.round(p1 * 100)} % du temps, contre ${Math.round(p0 * 100)} % après les autres jours (${after.length} soirées).` });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4);
}

// ---------- Équilibre ----------

export type Pole = 'travail' | 'social' | 'soin' | 'perso';
export const POLES: { id: Pole; label: string; color: string; groups: TrackerGroup[] }[] = [
  { id: 'travail', label: 'Travail et études', color: '#81265D', groups: ['travail', 'etudes'] },
  { id: 'social', label: 'Sorties et proches', color: '#A83278', groups: ['sorties', 'amour', 'social'] },
  { id: 'soin', label: 'Repos et soin de moi', color: '#E0789E', groups: ['soin', 'sante'] },
  { id: 'perso', label: 'Moi et ma maison', color: '#8E6BB0', groups: ['moi', 'maison'] },
];

export interface PoleStat {
  id: Pole;
  label: string;
  color: string;
  days: number;
  /** Part des jours renseignés. */
  share: number;
  /** Médiane des 3 périodes précédentes, si elles ont assez de jours renseignés. */
  usual?: number;
}

/** Quatre pôles, en part des jours renseignés. Pas de score global : un équilibre ne se résume pas à une note. */
export function balance(a: Analytics, trackers: Tracker[], history: Analytics[] = []): PoleStat[] {
  const byId = new Map(trackers.map((t) => [t.id, t]));
  const poleOf = (t: Tracker): Pole | undefined => (formOf(t) === 'rest' ? 'soin' : POLES.find((p) => p.groups.includes(t.group))?.id);
  const count = (x: Analytics) => {
    const m = new Map<Pole, number>();
    for (const l of x.byDate.values()) {
      if (!isLogged(l)) continue;
      const hit = new Set<Pole>();
      for (const i of l.items) {
        const t = byId.get(i.trackerId);
        const p = t && poleOf(t);
        if (p) hit.add(p);
      }
      for (const p of hit) m.set(p, (m.get(p) || 0) + 1);
    }
    return m;
  };
  const cur = count(a);
  const refs = history.filter((h) => h.logged >= REVIEW.refLogged).map((h) => ({ h, m: count(h) }));
  return POLES.map((p) => {
    const days = cur.get(p.id) || 0;
    return {
      id: p.id,
      label: p.label,
      color: p.color,
      days,
      share: a.logged ? days / a.logged : 0,
      usual: refs.length >= 2 ? median(refs.map((r) => (r.m.get(p.id) || 0) / r.h.logged)) : undefined,
    };
  });
}

