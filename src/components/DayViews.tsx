import { Inbox, Receipt } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Category, Priority, Project, Task } from '../db/types';
import { timeToMin } from '../lib/dates';
import { eur, parseAmount, setPaymentAmount, type Occurrence } from '../lib/finance';
import { PRIORITY_LABEL, isClosed, materialize, moveTask, type TaskView } from '../lib/tasks';
import { update } from '../db/db';
import { openEditor } from '../lib/ui-store';
import { TaskItem } from './TaskItem';
import { Empty, toast } from './ui';

export interface DayCtx {
  today: string;
  cats: Map<string, Category>;
  projects: Map<string, Project>;
}

export function TaskList({ tasks, ctx, showDate, empty }: { tasks: TaskView[]; ctx: DayCtx; showDate?: boolean; empty?: string }) {
  if (!tasks.length) return empty ? <Empty icon={<Inbox size={20} />}>{empty}</Empty> : null;
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <TaskItem
          key={t.id}
          t={t}
          today={ctx.today}
          cat={t.categoryId ? ctx.cats.get(t.categoryId) : undefined}
          projectName={t.projectId ? ctx.projects.get(t.projectId)?.title : undefined}
          showDate={showDate}
        />
      ))}
    </div>
  );
}

const HOUR = 56;

/** Planning vertical heure par heure. */
export function Planning({ tasks, ctx, date }: { tasks: TaskView[]; ctx: DayCtx; date: string }) {
  const timed = tasks.filter((t) => t.time && !(t.outcome && t.outcome !== 'happened'));
  const allDay = tasks.filter((t) => !t.time && t.kind === 'event');
  const untimed = tasks.filter((t) => !t.time && t.kind === 'task');
  const startH = Math.min(7, ...timed.map((t) => Math.floor(timeToMin(t.time!) / 60)));
  const endH = Math.max(22, ...timed.map((t) => Math.ceil((timeToMin(t.time!) + (t.duration || 30)) / 60)));
  const hours = Array.from({ length: endH - startH + 1 }, (_, i) => startH + i);

  // Répartition en colonnes quand des éléments se chevauchent
  const laid = useMemo(() => {
    const items = timed
      .map((t) => ({ t, s: timeToMin(t.time!), e: timeToMin(t.time!) + Math.max(t.duration || 30, 25) }))
      .sort((a, b) => a.s - b.s);
    const lanes: number[] = [];
    const out = items.map((it) => {
      let lane = lanes.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(it.e);
      } else lanes[lane] = it.e;
      return { ...it, lane };
    });
    return { out, n: Math.max(1, lanes.length) };
  }, [timed]);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const showNow = date === ctx.today && nowMin >= startH * 60 && nowMin <= endH * 60;

  return (
    <div className="space-y-3">
      {allDay.length > 0 && (
        <div className="space-y-2">
          <div className="label">Toute la journée</div>
          <TaskList tasks={allDay} ctx={ctx} />
        </div>
      )}
      {untimed.length > 0 && (
        <div className="space-y-2">
          <div className="label">À caser dans la journée</div>
          <TaskList tasks={untimed} ctx={ctx} />
        </div>
      )}
      <div className="card relative overflow-hidden p-0">
        <div className="relative" style={{ height: hours.length * HOUR }}>
          {hours.map((h, i) => (
            <button
              key={h}
              className="absolute inset-x-0 flex border-t border-line/70 text-left hover:bg-blush/30"
              style={{ top: i * HOUR, height: HOUR }}
              onClick={() => openEditor({ type: 'task', defaults: { date, time: `${String(h).padStart(2, '0')}:00` } })}
              aria-label={`Ajouter à ${h} h`}
            >
              <span className="w-14 shrink-0 pr-2 pt-1 text-right text-[11px] text-soft">{h}:00</span>
            </button>
          ))}
          {showNow && (
            <div className="pointer-events-none absolute left-12 right-0 z-10 flex items-center" style={{ top: ((nowMin - startH * 60) / 60) * HOUR }}>
              <span className="h-2.5 w-2.5 rounded-full bg-rasp" />
              <span className="h-[2px] flex-1 bg-rasp/70" />
            </div>
          )}
          {laid.out.map(({ t, s, e, lane }) => {
            const cat = t.categoryId ? ctx.cats.get(t.categoryId) : undefined;
            const color = cat?.color || '#A83278';
            const w = `calc((100% - 3.75rem) / ${laid.n})`;
            return (
              <button
                key={t.id}
                onClick={() => openEditor({ type: 'task', task: t })}
                className={`absolute overflow-hidden rounded-xl px-2.5 py-1.5 text-left text-xs shadow-soft transition hover:brightness-95 ${
                  t.status === 'done' ? 'opacity-50 line-through' : ''
                }`}
                style={{
                  top: ((s - startH * 60) / 60) * HOUR + 1,
                  height: Math.max(((e - s) / 60) * HOUR - 2, 24),
                  left: `calc(3.5rem + ${lane} * ${w})`,
                  width: `calc(${w} - 4px)`,
                  background: `${color}1f`,
                  borderLeft: `3px solid ${color}`,
                }}
                data-testid="planning-item"
              >
                <div className="truncate font-semibold text-ink">{t.title}</div>
                <div className="truncate text-soft">
                  {t.time}
                  {t.kind === 'event' ? ' · rendez-vous' : ''}
                  {t.location ? ` · ${t.location}` : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * La journée en un coup d'œil : les rendez-vous et ce qui a une heure, dans l'ordre ;
 * puis les tâches sans horaire, rangées par priorité. Les éléments faits ou clos se replient en bas.
 */
export function DayAgenda({ tasks, ctx, empty, hideEvents }: { tasks: TaskView[]; ctx: DayCtx; empty?: string; hideEvents?: boolean }) {
  const [showDone, setShowDone] = useState(false);
  const closed = tasks.filter((t) => (t.kind === 'task' && isClosed(t)) || (t.kind === 'event' && t.outcome && t.outcome !== 'happened'));
  const open = tasks.filter((t) => !closed.includes(t));
  const allDay = open.filter((t) => t.kind === 'event' && !t.time);
  const timed = open.filter((t) => t.time && (!hideEvents || t.kind === 'task')).sort((a, b) => a.time!.localeCompare(b.time!));
  const todo = open.filter((t) => t.kind === 'task' && !t.time);
  const levels: Priority[] = ['must', 'should', 'could'];
  if (!tasks.length) return <Empty icon={<Inbox size={20} />}>{empty || 'Rien de prévu.'}</Empty>;
  return (
    <div className="space-y-4" data-testid="day-agenda">
      {!hideEvents && allDay.length > 0 && (
        <div className="space-y-2">
          <div className="label">Toute la journée</div>
          <TaskList tasks={allDay} ctx={ctx} />
        </div>
      )}
      {timed.length > 0 && (
        <div className="space-y-2" data-testid="agenda-timed">
          <div className="label">{hideEvents ? 'Avec une heure' : 'Rendez-vous et horaires'}</div>
          <TaskList tasks={timed} ctx={ctx} />
        </div>
      )}
      {todo.length > 0 && (
        <div className="space-y-3" data-testid="agenda-todo">
          {levels.map((p) => {
            const list = todo.filter((t) => t.priority === p);
            if (!list.length) return null;
            return (
              <div key={p} className={`prio-${p} space-y-2`} data-testid={`agenda-prio-${p}`}>
                <PrioHead p={p} count={list.length} />
                <TaskList tasks={list} ctx={ctx} />
              </div>
            );
          })}
        </div>
      )}
      {!open.length && <p className="text-sm text-soft">Tout est fait pour aujourd'hui.</p>}
      {closed.length > 0 && (
        <div className="space-y-2">
          <button className="text-xs text-soft underline-offset-2 hover:underline" onClick={() => setShowDone(!showDone)} data-testid="show-done">
            {showDone ? 'Masquer' : 'Voir'} ce qui est fait ou annulé ({closed.length})
          </button>
          {showDone && <TaskList tasks={closed} ctx={ctx} />}
        </div>
      )}
    </div>
  );
}

/** En-tête d'un groupe de priorité : un bandeau rayé (cerise, soleil, sakura) et l'étiquette posée dessus. */
export function PrioHead({ p, count, done }: { p: Priority; count: number; done?: number }) {
  return (
    <div className={`prio-${p} prio-head prio-stripes h-8 px-1.5`}>
      <span className="prio-tag">{PRIORITY_LABEL[p]}</span>
      <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold shadow-soft" style={{ color: 'var(--pt)' }}>
        {done !== undefined ? `${done}/${count}` : count}
      </span>
    </div>
  );
}

export function PriorityBoard({ tasks, ctx }: { tasks: TaskView[]; ctx: DayCtx }) {
  const list = tasks.filter((t) => t.kind === 'task');
  const levels: Priority[] = ['must', 'should', 'could'];
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {levels.map((p) => {
        const items = list.filter((t) => t.priority === p && !t.outcome);
        if (!items.length) return null;
        return (
          <div
            key={p}
            className={`prio-${p} rounded-2xl p-3`}
            style={{ background: 'linear-gradient(to bottom, var(--p2), transparent 70%)' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              const raw = e.dataTransfer.getData('text/task');
              if (!raw) return;
              const t = JSON.parse(raw) as TaskView;
              if (t.virtual) await materialize(t, { priority: p });
              else await update<Task>('tasks', t.id, { priority: p });
            }}
          >
            <div className="mb-2">
              <PrioHead p={p} count={items.length} done={items.filter((t) => t.status === 'done').length} />
            </div>
            <TaskList tasks={items} ctx={ctx} />
          </div>
        );
      })}
    </div>
  );
}

export function PaymentsList({ items, onToggle }: { items: Occurrence[]; onToggle: (o: Occurrence) => void }) {
  if (!items.length) return null;
  return (
    <div className="space-y-2">
      {items.map((o) => (
        <PaymentRow key={o.refId + o.date} o={o} onToggle={onToggle} />
      ))}
    </div>
  );
}

/** Une échéance : touche le montant pour indiquer le montant réel (ex. salaire de 1 950 € au lieu de 2 000 €). */
function PaymentRow({ o, onToggle }: { o: Occurrence; onToggle: (o: Occurrence) => void }) {
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState('');
  const income = o.refType === 'income';
  const diff = o.confirmed !== undefined && o.confirmed !== o.planned;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line/70 bg-card px-3.5 py-2.5 shadow-soft" data-testid="payment-row">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${income ? 'bg-[#EFE8F8] text-[#6B4FA0] dark:bg-[#2E2240] dark:text-[#C9B3F0]' : 'bg-blush text-plum'}`}>
        <Receipt size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{o.label}</div>
        <div className="text-xs text-soft">
          {o.orphan ? 'historique conservé' : `${income ? 'Revenu' : 'Prélèvement'} · ${o.confirmed !== undefined ? (income ? 'reçu' : 'payé') : 'non confirmé'}`}
          {diff && !o.orphan && ` · prévu ${eur(o.planned)}`}
        </div>
      </div>
      {edit ? (
        <form
          className="flex items-center gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = parseAmount(txt);
            if (v === undefined || v < 0) return toast('Montant non reconnu (ex : 1 950,50)');
            await setPaymentAmount(o, v);
            setEdit(false);
            toast(`Montant réel enregistré : ${eur(v)}`);
          }}
        >
          <input autoFocus className="input w-24 py-1.5" inputMode="decimal" value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="Montant réel" data-testid="payment-actual" />
          <button className="chip chip-on text-xs">OK</button>
        </form>
      ) : (
        <button
          className={`text-sm font-semibold underline decoration-dotted underline-offset-4 ${income ? 'text-[#6B4FA0] dark:text-[#C9B3F0]' : 'text-plum'}`}
          onClick={() => {
            if (o.orphan) return;
            setTxt(String(o.confirmed ?? o.planned).replace('.', ','));
            setEdit(true);
          }}
          aria-label="Modifier le montant réel"
        >
          {income ? '+' : '−'}
          {eur(o.confirmed ?? o.planned)}
        </button>
      )}
      {!o.orphan && !edit && (
        <button className={`chip min-h-[36px] text-xs ${o.confirmed !== undefined ? 'chip-on' : ''}`} onClick={() => onToggle(o)}>
          {o.confirmed !== undefined ? '✓' : 'Confirmer'}
        </button>
      )}
    </div>
  );
}

/** Raccourcis de report rapide (utile sur iPhone où le glisser-déposer n'est pas disponible). */
export async function quickMove(t: TaskView, date: string | undefined, label: string) {
  await moveTask(t, date);
  toast(label, { label: 'Annuler', run: () => moveTask({ ...t, virtual: false }, t.date) });
}

