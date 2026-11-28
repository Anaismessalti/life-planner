// « Mes 3 essentiels » : le matin, on garde trois tâches au plus. Tout le reste de la journée est du bonus.
import { Check, Star } from 'lucide-react';
import { useState } from 'react';
import type { DayLog, ISODate } from '../db/types';
import { PRIORITY_SHORT, isOpen, type TaskView } from '../lib/tasks';
import { saveLog } from '../pages/Journal';
import type { DayCtx } from './DayViews';
import { TaskItem } from './TaskItem';
import { Sheet } from './ui';

export const MAX_ESSENTIALS = 3;

/** Les essentiels encore valables (tâche du jour, pas supprimée). */
export function essentialsOf(log: DayLog | undefined, day: TaskView[]) {
  const ids = log?.essentials || [];
  return ids.map((id) => day.find((t) => t.id === id)).filter((t): t is TaskView => !!t && !t.deleted);
}

/** Ajoute une tâche aux essentiels d'un jour (sans dépasser 3). */
export function addEssential(date: ISODate, id: string) {
  return saveLog(date, (log) => {
    const cur = log.essentials || [];
    if (cur.includes(id) || cur.length >= MAX_ESSENTIALS) return {};
    return { essentials: [...cur, id] };
  });
}

/** Ordre proposé : « absolument », puis échéance proche, puis « rapidement », puis le reste. */
function suggestOrder(a: TaskView, b: TaskView) {
  const rank = (t: TaskView) => (t.priority === 'must' ? 0 : t.dueDate ? 1 : t.priority === 'should' ? 2 : 3);
  return rank(a) - rank(b) || (a.dueDate || '9').localeCompare(b.dueDate || '9');
}

export function EssentialsCard({ today, log, day, ctx, morning, late }: { today: ISODate; log?: DayLog; day: TaskView[]; ctx: DayCtx; morning: boolean; late?: boolean }) {
  const [picking, setPicking] = useState(false);
  const chosen = essentialsOf(log, day);
  const candidates = day.filter((t) => t.kind === 'task' && isOpen(t));
  const done = chosen.filter((t) => !isOpen(t)).length;
  if (!chosen.length && !candidates.length) return null;
  // L'après-midi, on ne demande plus de choisir ses essentiels : ce serait une case de plus, pas une aide.
  if (!chosen.length && late) return null;
  return (
    <section className="space-y-2.5" data-testid="essentials">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="h-title text-2xl">Mes 3 essentiels</h2>
        {chosen.length > 0 ? (
          <button className="text-xs text-rasp" onClick={() => setPicking(true)} data-testid="essentials-edit">
            {done}/{chosen.length} · changer
          </button>
        ) : null}
      </div>
      {chosen.length ? (
        <div className="space-y-2">
          {chosen.map((t) => (
            <TaskItem key={t.id} t={t} today={today} cat={t.categoryId ? ctx.cats.get(t.categoryId) : undefined} projectName={t.projectId ? ctx.projects.get(t.projectId)?.title : undefined} />
          ))}
          {done === chosen.length && <p className="text-center font-serif text-[15px] italic text-plum" data-testid="essentials-done">Tes essentiels sont faits. Le reste est du bonus.</p>}
        </div>
      ) : (
        <button className="card flex w-full items-center gap-3 border-dashed p-4 text-left" onClick={() => setPicking(true)} data-testid="essentials-pick">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-plum">
            <Star size={18} />
          </span>
          <span>
            <span className="block font-serif text-lg italic text-plum">{morning ? 'Choisis tes essentiels du jour' : 'Qu’est-ce qui compte vraiment aujourd’hui ?'}</span>
            <span className="block text-xs text-soft">1 minute · trois tâches au plus, le reste est du bonus</span>
          </span>
        </button>
      )}
      {picking && <EssentialsPicker today={today} log={log} candidates={[...candidates].sort(suggestOrder)} onClose={() => setPicking(false)} />}
    </section>
  );
}

function EssentialsPicker({ today, log, candidates, onClose }: { today: ISODate; log?: DayLog; candidates: TaskView[]; onClose: () => void }) {
  const [sel, setSel] = useState<string[]>(log?.essentials || []);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_ESSENTIALS ? s : [...s, id]));
  const save = async () => {
    await saveLog(today, { essentials: sel.length ? sel : undefined });
    onClose();
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="Mes 3 essentiels"
      footer={
        <button className="btn-primary w-full" onClick={save} data-testid="essentials-save">
          <Check size={16} /> {sel.length ? `Garder ${sel.length === 1 ? 'cet essentiel' : `ces ${sel.length} essentiels`}` : 'Aucun essentiel aujourd’hui'}
        </button>
      }
    >
      <div className="space-y-3" data-testid="essentials-picker">
        <p className="text-sm text-soft">Si tu ne faisais que ça aujourd’hui, ta journée serait réussie. {sel.length}/{MAX_ESSENTIALS}</p>
        <div className="space-y-1.5">
          {candidates.map((t) => {
            const on = sel.includes(t.id);
            const full = !on && sel.length >= MAX_ESSENTIALS;
            return (
              <button
                key={t.id}
                className={`prio-${t.priority} flex min-h-[48px] w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${on ? 'border-transparent bg-blush' : 'border-line bg-card'} ${full ? 'opacity-40' : ''}`}
                onClick={() => toggle(t.id)}
                disabled={full}
                aria-pressed={on}
                data-testid="essential-option"
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-plum bg-plum text-white' : 'border-mauve'}`}>{on && <Star size={12} fill="currentColor" />}</span>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="prio-pill shrink-0 text-[11px]">
                  <span className="prio-dot" />
                  {PRIORITY_SHORT[t.priority]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
