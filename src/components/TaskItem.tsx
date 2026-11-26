import { CalendarClock, CalendarPlus, Check, Clock, FolderHeart, History, MapPin, Repeat, X } from 'lucide-react';
import { useState } from 'react';
import type { Category } from '../db/types';
import { diffDays, relativeDay } from '../lib/dates';
import { OUTCOME_LABEL, setOutcome } from '../lib/agenda';
import { PRIORITY_SHORT, STUCK_AFTER, isPostponed, moveTask, needsOutcome, postponeCount, setDone, type TaskView } from '../lib/tasks';
import { MoveSheet } from './MoveSheet';
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
  const isEvent = t.kind === 'event';
  const [moving, setMoving] = useState(false);
  const openMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMoving(true);
  };
  const closedOther = !!t.outcome && t.outcome !== 'happened';
  const done = t.status === 'done' || (isEvent && t.outcome === 'happened');
  const now = new Date();
  const ask = needsOutcome(t, today, now.getHours() * 60 + now.getMinutes());
  const stuck = !isEvent && !done && !t.outcome && t.priority === 'must' && postponeCount(t) >= STUCK_AFTER;
  const outcome = async (e: React.MouseEvent, o: 'happened' | 'cancelled' | 'noshow' | 'dropped' | undefined, msg: string) => {
    e.stopPropagation();
    await setOutcome(t, o);
    toast(msg, { label: 'Annuler', run: () => setOutcome({ ...t, virtual: false }, t.outcome) });
  };
  const sub = t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : null;
  const dueSoon = t.dueDate && !done ? diffDays(t.dueDate, today) : null;
  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await setDone(t, !done);
    if (!done) toast('Cochée', { label: 'Annuler', run: () => setDone({ ...t, virtual: false }, false) });
  };
  const canMove = !done && !closedOther && !t.outcome;
  return (
    <>
    <div
      role="button"
      tabIndex={0}
      onClick={() => openEditor({ type: 'task', task: t })}
      onKeyDown={(e) => e.key === 'Enter' && openEditor({ type: 'task', task: t })}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/task', JSON.stringify(t))}
      className={`${isEvent ? '' : `prio-${t.priority}`} group flex w-full cursor-pointer items-start gap-3 rounded-2xl border border-line/70 bg-card text-left shadow-soft transition hover:border-mauve/60 ${
        compact ? 'px-2.5 py-2' : 'px-3.5 py-3'
      } ${done || closedOther ? 'opacity-60' : ''}`}
      style={{ borderLeft: `4px solid ${isEvent ? cat?.color || 'rgb(var(--c-mauve))' : 'var(--p)'}` }}
      data-testid="task-item"
    >
      {isEvent ? (
        <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? 'bg-rasp text-white' : 'bg-blush text-plum'}`}>
          {done ? <Check size={13} strokeWidth={3} /> : closedOther ? <X size={13} /> : <Clock size={13} />}
        </span>
      ) : closedOther ? (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blush text-soft">
          <X size={13} />
        </span>
      ) : (
        <button
          onClick={toggle}
          aria-label={done ? 'Marquer comme non faite' : 'Marquer comme faite'}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center relative rounded-full border-2 after:absolute after:-inset-2.5 after:content-[''] transition ${
            done ? 'anim-pop border-rasp bg-rasp text-white' : 'hover:bg-[var(--p2)]'
          }`}
          style={done ? undefined : { borderColor: 'var(--p)' }}
        >
          {done && <Check size={14} strokeWidth={3} />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <div className={`truncate ${compact ? 'text-sm' : 'text-[15px]'} font-medium ${(done && !isEvent) || closedOther ? 'line-through' : ''}`}>{t.title}</div>
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
            {t.outcome && <span className="font-medium text-plum" data-testid="outcome">{OUTCOME_LABEL[t.outcome]}</span>}
            {!isEvent && !closedOther && !done && (
              <span className="prio-pill" data-testid="prio-pill">
                <span className="prio-dot" />
                {PRIORITY_SHORT[t.priority]}
              </span>
            )}
            {isPostponed(t) && !done && !t.outcome && t.originalDate && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blush px-1.5 text-plum">
                <History size={11} /> prévue {relativeDay(t.originalDate, today).toLowerCase()}
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
        {ask && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="ask-outcome">
            <button className="chip chip-on min-h-[34px] py-1 text-xs" onClick={(e) => outcome(e, 'happened', 'Noté, ça a eu lieu')} data-testid="outcome-happened">
              <Check size={13} strokeWidth={3} /> A eu lieu
            </button>
            <button className="chip min-h-[34px] py-1 text-xs" onClick={(e) => outcome(e, 'cancelled', 'Noté comme annulé')} data-testid="outcome-cancelled">
              Annulé
            </button>
            <button className="chip min-h-[34px] py-1 text-xs" onClick={(e) => outcome(e, 'noshow', 'Noté comme pas honoré')} data-testid="outcome-noshow">
              Pas honoré
            </button>
            <button className="chip min-h-[34px] py-1 text-xs" onClick={openMove} data-testid="outcome-moved">
              <CalendarClock size={13} /> Déplacé
            </button>
          </div>
        )}
        {stuck && (
          <div className="mt-2 space-y-1.5" data-testid="stuck">
            <p className="text-xs text-soft">Elle traîne depuis {postponeCount(t)} jours. On en fait quoi ?</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                className="chip min-h-[34px] py-1 text-xs"
                onClick={openMove}
              >
                Choisir une date
              </button>
              <button
                className="chip min-h-[34px] py-1 text-xs"
                onClick={async (e) => {
                  e.stopPropagation();
                  await moveTask(t, undefined);
                  toast('Rangée dans « Plus tard »', { label: 'Annuler', run: () => moveTask({ ...t, virtual: false }, t.date) });
                }}
              >
                Plus tard
              </button>
              <button className="chip min-h-[34px] py-1 text-xs" onClick={(e) => outcome(e, 'dropped', 'Retirée de ta liste')} data-testid="outcome-dropped">
                Plus nécessaire
              </button>
            </div>
          </div>
        )}
      </div>
      {canMove && !ask && !compact && (
        <button
          className="-mr-1.5 -mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-soft transition hover:bg-blush hover:text-plum"
          onClick={openMove}
          aria-label={t.date ? 'Déplacer' : 'Ajouter une date'}
          title={t.date ? 'Déplacer' : 'Ajouter une date'}
          data-testid="move-btn"
        >
          {t.date ? <CalendarClock size={17} /> : <CalendarPlus size={17} />}
        </button>
      )}
    </div>
    {moving && <MoveSheet t={t} today={today} onClose={() => setMoving(false)} />}
    </>
  );
}
