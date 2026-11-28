// Ce qui s'est réellement passé : rendez-vous confirmés, annulés, pas honorés ; tâches devenues inutiles.
// Un rendez-vous confirmé rejoint le journal (et ses statistiques) ; annulé, il en ressort.
import type { Task, TaskOutcome } from '../db/types';
import { mergeItem, suggestFromEvent } from './bridge';
import { isMultiDay, materialize, type TaskView } from './tasks';
import { addDays } from './dates';
import { db, now, update } from '../db/db';
import { saveLog } from '../pages/Journal';

export const OUTCOME_LABEL: Record<TaskOutcome, string> = {
  happened: 'A eu lieu',
  cancelled: 'Annulé',
  noshow: 'Pas pu y aller',
  dropped: 'Plus nécessaire',
  skipped: 'Passée',
};

/** Donne (ou retire, avec undefined) une issue à une tâche ou un rendez-vous, et met le journal à jour. */
export async function setOutcome(t: TaskView, outcome: TaskOutcome | undefined): Promise<Task> {
  const patch: Partial<Task> = { outcome, outcomeAt: outcome ? now() : undefined };
  const saved = t.virtual ? await materialize(t, patch) : (await update<Task>('tasks', t.id, patch), (await db.tasks.get(t.id))!);
  if (saved.kind === 'event' && saved.date) await syncJournal(saved);
  return saved;
}

/** Les jours couverts par un rendez-vous (tous les jours d'un séjour), à partir d'une date de début donnée. */
function spanDays(t: Task, start = t.date!): string[] {
  if (!isMultiDay(t)) return [start];
  const n = Math.round((Date.parse(t.endDate!) - Date.parse(t.date!)) / 864e5);
  return Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
}

async function dropFromJournal(t: Task, days: string[]) {
  for (const d of days) {
    const log = await db.daylogs.get(d);
    if (log?.items.some((i) => i.fromEvent === t.id)) await saveLog(d, (cur) => ({ items: cur.items.filter((i) => i.fromEvent !== t.id) }));
  }
}

/** Le journal suit l'issue : « a eu lieu » ajoute l'activité reconnue (chaque jour d'un séjour), sinon on retire ce qui venait de ce rendez-vous. */
async function syncJournal(t: Task) {
  if (t.outcome === 'happened') {
    const [trackers, contacts] = await Promise.all([db.trackers.toArray(), db.contacts.toArray()]);
    const s = suggestFromEvent(t, trackers, contacts);
    if (!s) return;
    for (const d of spanDays(t))
      await saveLog(d, (cur) => (cur.items.some((i) => i.trackerId === s.tracker.id && i.fromEvent === t.id) ? {} : { items: mergeItem(cur.items, { ...s.item, fromEvent: t.id }) }));
  } else await dropFromJournal(t, spanDays(t));
}

/** Quand un rendez-vous confirmé change de date, son activité du journal le suit. */
export async function moveJournalWithEvent(t: Task, fromDate: string | undefined) {
  if (t.kind !== 'event' || t.outcome !== 'happened' || !fromDate || fromDate === t.date) return;
  await dropFromJournal(t, spanDays(t, fromDate));
  await syncJournal(t);
}

/**
 * Déplacer un rendez-vous ou une tâche à une autre date (et heure).
 * La date prévue au départ est gardée : les statistiques ne le comptent jamais deux fois.
 * Un rendez-vous déplacé dans le futur n'a pas encore eu lieu : son issue est effacée.
 */
export async function reschedule(t: TaskView, date: string | undefined, time: string | undefined, today: string): Promise<Task> {
  const fromDate = t.date;
  const patch: Partial<Task> = { date, time: date ? time : undefined };
  // Un séjour se déplace en entier : même nombre de jours.
  if (t.endDate && t.date && date) patch.endDate = addDays(t.endDate, Math.round((Date.parse(date) - Date.parse(t.date)) / 864e5));
  if (fromDate && date && date !== fromDate) {
    patch.originalDate = t.originalDate || fromDate;
    patch.postponeHistory = [...(t.postponeHistory || []), { from: fromDate, to: date, at: now() }].slice(-10);
    // Avancer une tâche n'est pas la reporter : seul un déplacement plus tard compte comme report.
    const prev = t.postponeCount ?? (t.postponeHistory?.length || 0);
    patch.postponeCount = date > fromDate ? prev + 1 : prev;
  }
  if (t.kind === 'event' && t.outcome && date && date > today) {
    patch.outcome = undefined;
    patch.outcomeAt = undefined;
  }
  const saved = t.virtual ? await materialize(t, patch) : (await update<Task>('tasks', t.id, patch), (await db.tasks.get(t.id))!);
  if (saved.kind === 'event') {
    if (t.outcome === 'happened' && !saved.outcome && fromDate) {
      // Il n'a finalement pas encore eu lieu : on retire l'activité ajoutée au journal.
      await dropFromJournal(t, spanDays(t, fromDate));
    } else await moveJournalWithEvent(saved, fromDate);
  }
  return saved;
}

/** Annuler un déplacement : tout revient exactement comme avant (date, heure, historique, issue). */
export async function undoReschedule(before: TaskView) {
  const after = await db.tasks.get(before.id);
  if (!after) return;
  await update<Task>('tasks', before.id, {
    date: before.date,
    time: before.time,
    endDate: before.endDate,
    originalDate: before.originalDate,
    postponeHistory: before.postponeHistory,
    postponeCount: before.postponeCount,
    outcome: before.outcome,
    outcomeAt: before.outcomeAt,
  });
  const restored = (await db.tasks.get(before.id))!;
  if (restored.kind === 'event') {
    if (after.date && after.date !== restored.date) {
      const log = await db.daylogs.get(after.date);
      if (log?.items.some((i) => i.fromEvent === before.id)) await saveLog(after.date, (cur) => ({ items: cur.items.filter((i) => i.fromEvent !== before.id) }));
    }
    if (restored.outcome === 'happened') await setOutcome(restored, 'happened');
  }
}
