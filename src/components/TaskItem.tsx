import { Check, Clock, Flag, FolderHeart, History, MapPin, Repeat } from 'lucide-react';
import type { Category } from '../db/types';
import { diffDays, relativeDay } from '../lib/dates';
import { isPostponed, setDone, type TaskView } from '../lib/tasks';
import { openEditor } from '../lib/ui-store';
import { toast } from './ui';

export function TaskItem({
  t,
  cat,
  projectName,
  today,
  compact,
  showDate,
}: {
  t: TaskView;
  cat?: Category;
  projectName?: string;
  today: string;
  compact?: boolean;
  showDate?: boolean;
}) {
  const done = t.status === 'done';
  const isEvent = t.kind === 'event';
  const sub = t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : null;
  const dueSoon = t.dueDate && !done ? diffDays(t.dueDate, today) : null;
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await setDone(t, !done);
    if (!done) toast('Bravo, tâche terminée ✨', { label: 'Annuler', run: () => setDone({ ...t, virtual: false }, false) });
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openEditor({ type: 'task', task: t })}
      onKeyDown={(e) => e.key === 'Enter' && openEditor({ type: 'task', task: t })}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/task', JSON.stringify(t))}
      className={`group flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-line/70 bg-card text-left shadow-soft transition hover:border-mauve/60 ${
        compact ? 'px-2.5 py-2' : 'px-3.5 py-3'
      } ${done ? 'opacity-60' : ''}`}
      style={{ borderLeft: `3px solid ${cat?.color || 'rgb(var(--c-mauve))'}` }}
      data-testid="task-item"
    >
      {isEvent ? (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blush text-plum">
          <Clock size={13} />
        </span>
      ) : (
        <button
          onClick={toggle}
          aria-label={done ? 'Marquer comme non faite' : 'Marquer comme faite'}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
            done ? 'anim-pop border-rasp bg-rasp text-white' : 'border-mauve hover:border-rasp'
          }`}
        >
          {done && <Check size={14} strokeWidth={3} />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className={`truncate ${compact ? 'text-sm' : 'text-[15px]'} font-medium ${done ? 'line-through' : ''}`}>{t.title}</div>
        {!compact && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-soft">
            {showDate && t.date && <span>{relativeDay(t.date, today)}</span>}
            {t.time && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />
                {t.time}
                {t.duration ? ` · ${t.duration} min` : ''}
              </span>
            )}
            {t.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} />
                {t.location}
              </span>
            )}
            {cat && <span style={{ color: cat.color }}>{cat.name}</span>}
            {t.priority === 'must' && !isEvent && (
              <span className="inline-flex items-center gap-1 text-rasp">
                <Flag size={11} /> Essentiel
              </span>
            )}
            {isPostponed(t) && !done && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <History size={11} /> Reportée {t.postponeHistory!.length > 1 ? `×${t.postponeHistory!.length}` : ''}
              </span>
            )}
            {dueSoon !== null && (
              <span className={dueSoon < 0 ? 'font-medium text-red-600' : dueSoon <= 2 ? 'text-rasp' : ''}>
                Échéance {relativeDay(t.dueDate!, today).toLowerCase()}
              </span>
            )}
            {(t.seriesId || t.recurrence) && <Repeat size={11} aria-label="Récurrente" />}
            {projectName && (
              <span className="inline-flex items-center gap-1">
                <FolderHeart size={11} />
                {projectName}
              </span>
            )}
            {sub && <span>{sub} sous-tâches</span>}
          </div>
        )}
      </div>
    </div>
  );
}
