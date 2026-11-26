// Ce qui s'est réellement passé : rendez-vous confirmés, annulés, pas honorés ; tâches devenues inutiles.
// Un rendez-vous confirmé rejoint le journal (et ses statistiques) ; annulé, il en ressort.
import type { Task, TaskOutcome } from '../db/types';
import { mergeItem, suggestFromEvent } from './bridge';
import { materialize, type TaskView } from './tasks';
import { db, now, update } from '../db/db';
import { saveLog } from '../pages/Journal';

export const OUTCOME_LABEL: Record<TaskOutcome, string> = {
  happened: 'A eu lieu',
  cancelled: 'Annulé',
  noshow: 'Pas honoré',
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

/** Le journal suit l'issue : « a eu lieu » ajoute l'activité reconnue, sinon on retire ce qui venait de ce rendez-vous. */
async function syncJournal(t: Task) {
  const date = t.date!;
  if (t.outcome === 'happened') {
    const [trackers, contacts] = await Promise.all([db.trackers.toArray(), db.contacts.toArray()]);
    const s = suggestFromEvent(t, trackers, contacts);
    if (!s) return;
    await saveLog(date, (cur) => (cur.items.some((i) => i.trackerId === s.tracker.id && i.fromEvent === t.id) ? {} : { items: mergeItem(cur.items, { ...s.item, fromEvent: t.id }) }));
  } else {
    const log = await db.daylogs.get(date);
    if (!log?.items.some((i) => i.fromEvent === t.id)) return;
    await saveLog(date, (cur) => ({ items: cur.items.filter((i) => i.fromEvent !== t.id) }));
  }
}

/** Quand un rendez-vous confirmé change de date, son activité du journal le suit. */
export async function moveJournalWithEvent(t: Task, fromDate: string | undefined) {
  if (t.kind !== 'event' || t.outcome !== 'happened' || !fromDate || fromDate === t.date) return;
  const log = await db.daylogs.get(fromDate);
  if (log?.items.some((i) => i.fromEvent === t.id)) await saveLog(fromDate, (cur) => ({ items: cur.items.filter((i) => i.fromEvent !== t.id) }));
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
  if (fromDate && date && date !== fromDate) {
    patch.originalDate = t.originalDate || fromDate;
    patch.postponeHistory = [...(t.postponeHistory || []), { from: fromDate, to: date, at: now() }].slice(-10);
    patch.postponeCount = Math.max(t.postponeCount || 0, t.postponeHistory?.length || 0) + 1;
  }
  if (t.kind === 'event' && t.outcome && date && date > today) {
    patch.outcome = undefined;
    patch.outcomeAt = undefined;
  }
  const saved = t.virtual ? await materialize(t, patch) : (await update<Task>('tasks', t.id, patch), (await db.tasks.get(t.id))!);
  if (saved.kind === 'event') {
    if (t.outcome === 'happened' && !saved.outcome && fromDate) {
      // Il n'a finalement pas encore eu lieu : on retire l'activité ajoutée au journal.
      const log = await db.daylogs.get(fromDate);
      if (log?.items.some((i) => i.fromEvent === t.id)) await saveLog(fromDate, (cur) => ({ items: cur.items.filter((i) => i.fromEvent !== t.id) }));
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
