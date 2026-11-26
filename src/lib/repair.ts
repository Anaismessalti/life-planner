// Réparation douce des données au démarrage : corrige les valeurs invalides sans rien supprimer.
import { db, update } from '../db/db';
import type { Project, Task } from '../db/types';
import { isISODate, isISOMonth } from './dates';

/** Retire les dates ou mois illisibles (ex. un mois tapé à la main dans Safari sur Mac) qui faisaient planter l'affichage. */
export async function repairData() {
  for (const t of await db.tasks.toArray()) {
    const fix: Partial<Task> = {};
    if (t.targetMonth && !isISOMonth(t.targetMonth)) fix.targetMonth = undefined;
    if (t.date && !isISODate(t.date)) fix.date = undefined;
    if (t.dueDate && !isISODate(t.dueDate)) fix.dueDate = undefined;
    if (typeof t.duration === 'number' && (t.duration < 0 || !isFinite(t.duration))) fix.duration = undefined;
    if (Object.keys(fix).length) await update<Task>('tasks', t.id, fix);
  }
  for (const p of await db.projects.toArray()) {
    const fix: Partial<Project> = {};
    if (p.targetMonth && !isISOMonth(p.targetMonth)) fix.targetMonth = undefined;
    if (p.startDate && !isISODate(p.startDate)) fix.startDate = undefined;
    if (p.dueDate && !isISODate(p.dueDate)) fix.dueDate = undefined;
    if (!Array.isArray(p.milestones)) fix.milestones = [];
    if (Object.keys(fix).length) await update<Project>('projects', p.id, fix);
  }
}
