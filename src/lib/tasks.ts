import { create, db, getMeta, now, setMeta, update } from '../db/db';
import type { ISODate, Priority, Task } from '../db/types';
import { addDays, todayISO } from './dates';
import { nextOccurrence, occurrences } from './recurrence';

/** Une tâche telle qu'affichée un jour donné (réelle ou occurrence virtuelle d'une série). */
export type TaskView = Task & { virtual?: boolean };

export const PRIORITY_LABEL: Record<Priority, string> = {
  must: 'À faire absolument',
  should: 'À faire rapidement',
  could: 'Sans urgence',
};
export const PRIORITY_SHORT: Record<Priority, string> = { must: 'Absolument', should: 'Rapidement', could: 'Sans urgence' };

/** Terminée, ou close autrement (annulée, plus nécessaire…) : ne se reporte plus et ne compte plus comme « à faire ». */
export const isClosed = (t: Task) => t.status === 'done' || !!t.outcome;
export const isOpen = (t: Task) => !t.deleted && !isClosed(t);
/** Un rendez-vous passé dont on ne sait pas encore s'il a eu lieu. */
export function needsOutcome(t: Task, today: ISODate, nowMin?: number) {
  if (t.kind !== 'event' || t.deleted || t.outcome || !t.date) return false;
  if (t.date < today) return true;
  if (t.date > today || nowMin === undefined || !t.time) return false;
  const [h, m] = t.time.split(':').map(Number);
  return h * 60 + m + (t.duration || 60) <= nowMin;
}
/** Nombre de reports, même quand l'historique détaillé a été raccourci. */
export const postponeCount = (t: Task) => Math.max(t.postponeCount || 0, t.postponeHistory?.length || 0);
/** Au-delà, une tâche « absolument » mérite d'être triée (garder, déplacer, abandonner). */
export const STUCK_AFTER = 3;
/** Une tâche « rapidement » reportée autant de fois passe en « sans urgence » (liste Plus tard). */
export const DEMOTE_AFTER = 5;
const HISTORY_KEEP = 10;

export const occurrenceId = (seriesId: string, date: ISODate) => `${seriesId}_${date}`;

export const isSeries = (t: Task) => !!t.recurrence && !t.seriesId;
export const isPostponed = (t: Task) => postponeCount(t) > 0;

/**
 * Développe la source de données unique en tâches visibles sur [from, to].
 * Les vues jour, semaine, mois et Aujourd'hui passent toutes par ici :
 * elles restent donc parfaitement synchronisées.
 */
export function expandTasks(all: Task[], from: ISODate, to: ISODate): TaskView[] {
  const live = all.filter((t) => !t.deleted);
  const byId = new Map(all.map((t) => [t.id, t]));
  const out: TaskView[] = [];
  for (const t of live) {
    if (isSeries(t)) {
      if (!t.date) continue;
      for (const occ of occurrences(t.date, t.recurrence!, from, to)) {
        const inst = byId.get(occurrenceId(t.id, occ));
        if (inst) continue; // l'occurrence matérialisée (ou supprimée) remplace la virtuelle
        out.push({
          ...t,
          id: occurrenceId(t.id, occ),
          seriesId: t.id,
          occurrenceDate: occ,
          date: occ,
          recurrence: undefined,
          status: 'todo',
          doneAt: undefined,
          subtasks: t.subtasks.map((s) => ({ ...s, done: false })),
          postponeHistory: [],
          originalDate: undefined,
          virtual: true,
        });
      }
    } else if (t.date && t.date >= from && t.date <= to) {
      out.push(t);
    }
  }
  return out.sort(sortTasks);
}

export function sortTasks(a: Task, b: Task) {
  if ((a.date || '') !== (b.date || '')) return (a.date || '').localeCompare(b.date || '');
  if (!!a.time !== !!b.time) return a.time ? -1 : 1;
  if (a.time && b.time && a.time !== b.time) return a.time.localeCompare(b.time);
  const p = { must: 0, should: 1, could: 2 };
  if (p[a.priority] !== p[b.priority]) return p[a.priority] - p[b.priority];
  return a.createdAt - b.createdAt;
}

/** Transforme une occurrence virtuelle en tâche réelle (id déterministe : aucun doublon possible). */
export async function materialize(v: TaskView, patch: Partial<Task> = {}): Promise<Task> {
  const existing = await db.tasks.get(v.id);
  if (existing) {
    await update<Task>('tasks', v.id, { ...patch, deleted: undefined });
    return (await db.tasks.get(v.id))!;
  }
  const { virtual: _v, createdAt: _c, updatedAt: _u, _ts, ...rest } = v;
  // Les champs copiés de la série gardent l'ancienneté de la série : si un autre appareil a déjà
  // coché cette occurrence, sa version (plus récente) l'emporte à la synchronisation.
  const series = v.seriesId ? await db.tasks.get(v.seriesId) : undefined;
  return create<Task>('tasks', { ...rest, recurrence: undefined, ...patch }, { fresh: Object.keys(patch), baseTs: series?.updatedAt || 1 });
}

export async function setDone(t: TaskView, done: boolean) {
  const patch: Partial<Task> = { status: done ? 'done' : 'todo', doneAt: done ? now() : undefined };
  if (t.virtual) return materialize(t, patch);
  return update<Task>('tasks', t.id, patch);
}

export async function moveTask(t: TaskView, date: ISODate | undefined) {
  if (t.virtual) return materialize(t, { date });
  return update<Task>('tasks', t.id, { date });
}

export async function deleteTask(t: TaskView) {
  // Pour une occurrence : on garde une trace « supprimée » afin que la série ne la recrée pas.
  if (t.virtual) return materialize(t, { deleted: true });
  return update<Task>('tasks', t.id, { deleted: true });
}

export interface RolloverResult {
  moved: number;
}

/**
 * Report automatique, pensé pour alléger la charge mentale :
 * - « absolument » et « rapidement » passent au lendemain en gardant leur priorité (sans leur ancienne heure) ;
 * - « sans urgence » ne s'accumule pas : elle rejoint la liste « Plus tard » (sans date, date prévue conservée) ;
 * - une tâche « rapidement » reportée 5 fois passe en « sans urgence » ;
 * - une échéance à demain ou dépassée fait passer la tâche en « absolument » ;
 * - une occurrence récurrente non faite n'est jamais reportée au-delà de l'occurrence suivante (pas de doublon) ;
 * - jamais les rendez-vous, les tâches closes, celles de projets en pause ou abandonnés, ni autoPostpone === false.
 * Idempotent : relancer le même jour ne change rien.
 */
export async function runRollover(today: ISODate = todayISO()): Promise<RolloverResult> {
  let moved = 0;
  const all = await db.tasks.toArray();
  const projects = new Map((await db.projects.toArray()).map((p) => [p.id, p]));
  const at = now();
  const lastRun = await getMeta<ISODate | null>('lastRollover', null);
  const byId = new Map(all.map((t) => [t.id, t]));
  const frozen = (t: Task) => {
    const p = t.projectId ? projects.get(t.projectId) : undefined;
    return !!p && !p.deleted && (p.status === 'paused' || p.status === 'abandoned');
  };
  const tomorrow = addDays(today, 1);
  const skipped = new Set<string>();

  for (const t of all) {
    if (t.deleted || t.kind !== 'task' || isClosed(t) || isSeries(t) || frozen(t)) continue;
    // Échéance imminente : la priorité monte (jamais l'inverse).
    const urgent = !!t.dueDate && t.dueDate <= tomorrow && t.priority !== 'must';
    if (urgent) await update<Task>('tasks', t.id, { priority: 'must' });
    const priority = urgent ? 'must' : t.priority;
    if (t.autoPostpone === false || !t.date || t.date >= today) continue;

    // Occurrence d'une série : jamais au-delà de l'occurrence suivante.
    if (t.seriesId) {
      const s = byId.get(t.seriesId);
      const from = t.originalDate || t.occurrenceDate || t.date;
      const next = s && !s.deleted && s.recurrence && s.date ? nextOccurrence(s.date, s.recurrence, from) : undefined;
      if (!s || s.deleted || !next || next <= today) {
        await update<Task>('tasks', t.id, { outcome: 'skipped', outcomeAt: at });
        skipped.add(t.id);
        continue;
      }
    }

    const count = postponeCount(t) + 1;
    const history = [...(t.postponeHistory || []), { from: t.date, to: today, at }].slice(-HISTORY_KEEP);
    if (priority === 'could' || (priority === 'should' && count >= DEMOTE_AFTER)) {
      await update<Task>('tasks', t.id, {
        date: undefined,
        time: undefined,
        priority: 'could',
        originalDate: t.originalDate || t.date,
        postponeHistory: history,
        postponeCount: count,
      });
    } else {
      await update<Task>('tasks', t.id, {
        date: today,
        time: undefined,
        originalDate: t.originalDate || t.date,
        postponeHistory: history,
        postponeCount: count,
      });
    }
    moved++;
  }

  // Séries récurrentes non quotidiennes : seule la dernière occurrence manquée est reportée,
  // et uniquement si la prochaine occurrence n'est pas déjà aujourd'hui ou avant.
  const windowStart = lastRun ? addDays(lastRun, -1) : addDays(today, -31);
  const yesterday = addDays(today, -1);
  const carriedSeries = new Set(all.filter((t) => t.seriesId && isOpen(t) && isPostponed(t) && !skipped.has(t.id)).map((t) => t.seriesId!));
  for (const s of all) {
    if (s.deleted || !isSeries(s) || s.kind !== 'task' || s.autoPostpone === false || !s.date || s.priority === 'could' || frozen(s)) continue;
    if (carriedSeries.has(s.id)) continue;
    const missed = occurrences(s.date, s.recurrence!, windowStart, yesterday).filter((d) => !byId.has(occurrenceId(s.id, d)));
    const last = missed[missed.length - 1];
    if (!last) continue;
    const next = nextOccurrence(s.date, s.recurrence!, last);
    if (next && next <= today) continue;
    const v = expandTasks([s], last, last)[0];
    if (!v) continue;
    await materialize(v, {
      date: today,
      time: undefined,
      originalDate: last,
      postponeHistory: [{ from: last, to: today, at }],
      postponeCount: 1,
    });
    moved++;
  }

  await setMeta('lastRollover', today);
  return { moved };
}

export function dayProgress(tasks: TaskView[]) {
  const list = tasks.filter((t) => t.kind === 'task' && !t.outcome);
  const done = list.filter((t) => t.status === 'done').length;
  return { done, total: list.length, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
}

export function newTaskDefaults(): Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'title'> {
  return { kind: 'task', priority: 'should', subtasks: [], status: 'todo' };
}
