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
