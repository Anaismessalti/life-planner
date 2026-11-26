import { ChevronLeft, ChevronRight, FolderHeart, Inbox, Plus, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PaymentsList, Planning, PriorityBoard, TaskList, quickMove, type DayCtx } from '../components/DayViews';
import { TaskItem } from '../components/TaskItem';
import { Empty, Progress, Section, Segmented } from '../components/ui';
import type { ISODate, Task } from '../db/types';
import {
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  capitalize,
  fmt,
  fmtMonth,
  monthOf,
  monthStart,
  range,
  weekStart,
  todayISO,
} from '../lib/dates';
import { eur, financeOccurrencesIn, togglePayment } from '../lib/finance';
import { useAllTasks, useCategoryMap, useFinance, useMedia, useProjects, useToday } from '../lib/hooks';
import { expandTasks, type TaskView } from '../lib/tasks';
import { navigate, openEditor, useRoute } from '../lib/ui-store';

type Mode = 'day' | 'week' | 'month' | 'inbox';

function projectProgress(p: { milestones: { done: boolean }[] }, tasks: Task[]) {
  const total = p.milestones.length + tasks.length;
  const done = p.milestones.filter((m) => m.done).length + tasks.filter((t) => t.status === 'done').length;
  return total ? Math.round((done / total) * 100) : 0;
}

export function CalendarPage() {
  const today = useToday();
  const { param } = useRoute();
  const [mode, setModeState] = useState<Mode>(param === 'inbox' ? 'inbox' : 'month');
  const [sel, setSel] = useState<ISODate>(today);
  const all = useAllTasks();
  const cats = useCategoryMap();
  const projectsArr = useProjects();
  const finance = useFinance();
  const projects = useMemo(() => new Map(projectsArr.map((p) => [p.id, p])), [projectsArr]);
  const ctx: DayCtx = { today, cats, projects };
  const wide = useMedia('(min-width: 1024px)');
  const setMode = (m: Mode) => {
    setModeState(m);
    if (m !== 'inbox' && param === 'inbox') navigate('calendar');
  };

  const step = (n: number) => {
    if (mode === 'day') setSel(addDays(sel, n));
    if (mode === 'week') setSel(addDays(sel, 7 * n));
    if (mode === 'month') setSel(monthStart(addMonths(monthOf(sel), n)));
  };

  const title =
    mode === 'day'
      ? capitalize(fmt(sel, 'EEEE d MMMM'))
      : mode === 'week'
        ? `Semaine du ${fmt(weekStart(sel), 'd MMM')}`
        : mode === 'month'
          ? fmtMonth(monthOf(sel))
          : 'Boîte de réception';

  return (
    <div className="space-y-5">
      <header className="anim-rise space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="h-title text-4xl">{title}</h1>
          {mode !== 'inbox' && (
            <div className="flex items-center">
              <button className="icon-btn" onClick={() => step(-1)} aria-label="Précédent">
                <ChevronLeft size={20} />
              </button>
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setSel(today)}>
                Aujourd'hui
              </button>
              <button className="icon-btn" onClick={() => step(1)} aria-label="Suivant">
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'day', label: 'Jour' },
            { value: 'week', label: 'Semaine' },
            { value: 'month', label: 'Mois' },
            { value: 'inbox', label: <span className="inline-flex items-center justify-center gap-1" aria-label="Sans date"><Inbox size={15} /><span className="hidden sm:inline">Sans date</span></span> },
          ]}
        />
      </header>

      {mode === 'day' && <DayView date={sel} all={all} ctx={ctx} finance={finance} />}
      {mode === 'week' && <WeekView sel={sel} all={all} ctx={ctx} finance={finance} wide={wide} onPick={(d) => (setSel(d), setMode('day'))} />}
      {mode === 'month' && (
        <MonthView
          sel={sel}
          setSel={setSel}
          all={all}
          ctx={ctx}
          finance={finance}
          wide={wide}
          projectsArr={projectsArr}
        />
      )}
      {mode === 'inbox' && <InboxView all={all} ctx={ctx} />}
    </div>
  );
}

function DayView({ date, all, ctx, finance }: { date: ISODate; all: Task[]; ctx: DayCtx; finance: ReturnType<typeof useFinance> }) {
  const [sub, setSub] = useState<'planning' | 'list' | 'priorities'>('planning');
  const day = useMemo(() => expandTasks(all, date, date), [all, date]);
  const due = all.filter((t) => !t.deleted && t.dueDate === date && t.status !== 'done');
  const pay = financeOccurrencesIn(finance, date, date);
  return (
    <div className="space-y-5">
      <Segmented
        value={sub}
        onChange={setSub}
        className="max-w-md"
        options={[
          { value: 'planning', label: 'Planning' },
          { value: 'list', label: 'Liste' },
          { value: 'priorities', label: 'Priorités' },
        ]}
      />
      {due.length > 0 && (
        <Section title="Échéances ce jour">
          <TaskList tasks={due} ctx={ctx} showDate />
        </Section>
      )}
      {pay.length > 0 && (
        <Section title="Prélèvements et revenus">
          <PaymentsList items={pay} onToggle={togglePayment} />
        </Section>
      )}
      {sub === 'planning' && <Planning tasks={day} ctx={ctx} date={date} />}
      {sub === 'list' && <TaskList tasks={day} ctx={ctx} empty="Rien de prévu ce jour-là" />}
      {sub === 'priorities' && <PriorityBoard tasks={day} ctx={ctx} />}
      <button className="btn-soft" onClick={() => openEditor({ type: 'task', defaults: { date } })}>
        <Plus size={16} /> Ajouter ce jour-là
      </button>
    </div>
  );
}

function loadOf(items: TaskView[]) {
  const minutes = items.reduce((a, t) => a + (t.duration || (t.kind === 'event' ? 60 : 30)), 0);
  const level = items.length >= 7 || minutes >= 420 ? 3 : items.length >= 4 || minutes >= 240 ? 2 : items.length ? 1 : 0;
  return { minutes, level };
}
const LOAD_LABEL = ['Libre', 'Légère', 'Remplie', 'Chargée'];
const LOAD_COLOR = ['transparent', 'rgb(var(--c-mauve))', '#D46A8C', 'rgb(var(--c-rasp))'];

function WeekView({
  sel,
  all,
  ctx,
  finance,
  wide,
  onPick,
}: {
  sel: ISODate;
  all: Task[];
  ctx: DayCtx;
  finance: ReturnType<typeof useFinance>;
  wide: boolean;
  onPick: (d: ISODate) => void;
}) {
  const start = weekStart(sel);
  const days = range(start, addDays(start, 6));
  const tasks = useMemo(() => expandTasks(all, start, addDays(start, 6)), [all, start]);
  const pay = financeOccurrencesIn(finance, start, addDays(start, 6));
  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <div className={wide ? 'grid grid-cols-7 gap-2' : 'space-y-3'}>
      {days.map((d, i) => {
        const items = tasks.filter((t) => t.date === d);
        const dpay = pay.filter((p) => p.date === d);
        const load = loadOf(items);
        const isToday = d === ctx.today;
        return (
          <div
            key={d}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(d);
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              setDragOver(null);
              const raw = e.dataTransfer.getData('text/task');
              if (raw) {
                const t = JSON.parse(raw) as TaskView;
                if (t.date !== d) quickMove(t, d, `Déplacée au ${fmt(d, 'EEEE d')}`);
              }
            }}
            className={`card flex flex-col gap-2 p-2.5 transition ${isToday ? 'ring-2 ring-rasp/40' : ''} ${dragOver === d ? 'bg-blush/60' : ''} ${
              wide ? 'min-h-[420px]' : ''
            }`}
            data-testid="week-day"
          >
            <button className="flex items-center justify-between text-left" onClick={() => onPick(d)}>
              <span>
                <span className="label">{WEEKDAYS_SHORT[i]}</span>
                <span className={`ml-1.5 font-serif text-xl font-semibold ${isToday ? 'text-rasp' : 'text-plum'}`}>{fmt(d, 'd')}</span>
              </span>
              {load.level > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-soft" title={`${Math.round(load.minutes / 60)} h estimées`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: LOAD_COLOR[load.level] }} />
                  {LOAD_LABEL[load.level]}
                </span>
              )}
            </button>
            {load.level > 0 && <div className="h-1 rounded-full" style={{ background: LOAD_COLOR[load.level], opacity: 0.6 }} />}
            {items.map((t) => (
              <div key={t.id} className="group relative">
                <TaskItem t={t} today={ctx.today} cat={t.categoryId ? ctx.cats.get(t.categoryId) : undefined} compact />
                {t.kind === 'task' && t.status !== 'done' && (
                  <div className={`absolute right-1 top-1/2 flex -translate-y-1/2 gap-0.5 ${wide ? 'opacity-0 group-hover:opacity-100' : ''}`}>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-blush text-plum"
                      onClick={() => quickMove(t, addDays(d, -1), 'Déplacée la veille')}
                      aria-label="Déplacer au jour précédent"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-blush text-plum"
                      onClick={() => quickMove(t, addDays(d, 1), 'Déplacée au lendemain')}
                      aria-label="Déplacer au jour suivant"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {dpay.map((p) => (
              <div key={p.refId} className="rounded-lg bg-blush/50 px-2 py-1 text-[11px] text-plum">
                {p.refType === 'income' ? '+' : '−'}
                {eur(p.planned)} · {p.label}
                {p.confirmed === undefined && p.refType === 'fixed' ? ' (à confirmer)' : ''}
              </div>
            ))}
            <button className="mt-auto rounded-lg py-1 text-xs text-soft hover:bg-blush/50" onClick={() => openEditor({ type: 'task', defaults: { date: d } })}>
              + Ajouter
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  sel,
  setSel,
  all,
  ctx,
  finance,
  wide,
  projectsArr,
}: {
  sel: ISODate;
  setSel: (d: ISODate) => void;
  all: Task[];
  ctx: DayCtx;
  finance: ReturnType<typeof useFinance>;
  wide: boolean;
  projectsArr: ReturnType<typeof useProjects>;
}) {
  const month = monthOf(sel);
  const gridStart = weekStart(monthStart(month));
  const days = range(gridStart, addDays(gridStart, 41));
  const tasks = useMemo(() => expandTasks(all, days[0], days[41]), [all, days[0]]);
  const pay = financeOccurrencesIn(finance, days[0], days[41]);
  const selItems = tasks.filter((t) => t.date === sel);
  const selPay = pay.filter((p) => p.date === sel);

  // Objectifs du mois ; ceux des mois passés non terminés remontent dans le mois en cours (rien n'est oublié).
  const curMonth = monthOf(todayISO());
  const goals = all.filter(
    (t) => !t.deleted && !t.date && !t.recurrence && (t.targetMonth === month || (month === curMonth && !!t.targetMonth && t.targetMonth < month && t.status !== 'done')),
  );
  const goalProjects = projectsArr.filter(
    (p) => p.status !== 'abandoned' && (p.targetMonth === month || (!p.targetMonth && p.dueDate && monthOf(p.dueDate) === month)),
  );

  const grid = (
    <div className="card p-2 sm:p-3">
      <div className="grid grid-cols-7 pb-1 text-center">
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="label py-1 text-[10px]">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {days.map((d) => {
          const items = tasks.filter((t) => t.date === d);
          const dpay = pay.filter((p) => p.date === d);
          const out = monthOf(d) !== month;
          const isSel = d === sel;
          const isToday = d === ctx.today;
          const dots = items.slice(0, 4).map((t) => (t.categoryId && ctx.cats.get(t.categoryId)?.color) || '#A83278');
          return (
            <button
              key={d}
              onClick={() => setSel(d)}
              className={`flex aspect-square flex-col items-center justify-start rounded-xl p-1 transition sm:aspect-[1.15] ${
                isSel ? 'bg-rasp text-white shadow-lift' : isToday ? 'bg-blush text-rasp' : 'hover:bg-blush/50'
              } ${out ? 'opacity-35' : ''}`}
              data-testid={`month-day-${d}`}
            >
              <span className={`text-sm font-semibold ${isSel ? '' : ''}`}>{Number(d.slice(8))}</span>
              <span className="mt-auto flex flex-wrap justify-center gap-0.5 pb-0.5">
                {dots.map((c, i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: isSel ? '#fff' : c }} />
                ))}
                {dpay.length > 0 && <span className={`text-[9px] font-bold leading-none ${isSel ? 'text-white' : 'text-plum'}`}>€</span>}
              </span>
              {wide && items.length > 0 && (
                <span className={`hidden w-full truncate text-[10px] leading-tight lg:block ${isSel ? 'text-white/90' : 'text-soft'}`}>{items[0].title}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const goalsPanel = (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <Target size={18} className="text-rasp" /> Mes objectifs de {fmtMonth(month).split(' ')[0].toLowerCase()}
        </span>
      }
      action={
        <button className="btn-soft py-1.5 text-xs" onClick={() => openEditor({ type: 'task', defaults: { targetMonth: month, date: undefined } })}>
          + Objectif
        </button>
      }
    >
      {goalProjects.map((p) => {
        const pt = all.filter((t) => !t.deleted && t.projectId === p.id && !t.recurrence);
        const pct = projectProgress(p, pt);
        return (
          <button key={p.id} onClick={() => navigate('projects', p.id)} className="card w-full space-y-2 p-3 text-left">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FolderHeart size={16} className="text-rasp" />
              <span className="flex-1 truncate">{p.title}</span>
              <span className="text-xs text-soft">{pct}%</span>
            </div>
            <Progress value={pct} />
          </button>
        );
      })}
      <TaskList tasks={goals} ctx={ctx} empty="Ajoute ici ce que tu veux accomplir ce mois-ci, sans choisir de jour." />
    </Section>
  );

  const dayPanel = (
    <Section
      title={capitalize(fmt(sel, 'EEEE d MMMM'))}
      action={
        <button className="btn-soft py-1.5 text-xs" onClick={() => openEditor({ type: 'task', defaults: { date: sel } })}>
          + Ajouter
        </button>
      }
    >
      <PaymentsList items={selPay} onToggle={togglePayment} />
      <TaskList tasks={selItems} ctx={ctx} empty="Rien de prévu ce jour-là" />
    </Section>
  );

  if (wide)
    return (
      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6">
        <div className="space-y-6">
          {grid}
          {dayPanel}
        </div>
        <div className="space-y-6">{goalsPanel}</div>
      </div>
    );
  return (
    <div className="space-y-6">
      {grid}
      {dayPanel}
      {goalsPanel}
    </div>
  );
}

function InboxView({ all, ctx }: { all: Task[]; ctx: DayCtx }) {
  const items = all
    .filter((t) => !t.deleted && !t.date && !t.targetMonth && t.status !== 'done' && !t.recurrence)
    .sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div className="space-y-3">
      <p className="text-sm text-soft">Les tâches sans date attendent ici. Planifie-les en un geste.</p>
      {!items.length && <Empty icon={<Inbox size={20} />}>Ta boîte de réception est vide.</Empty>}
      {items.map((t) => (
        <div key={t.id} className="space-y-1.5">
          <TaskItem t={t} today={ctx.today} cat={t.categoryId ? ctx.cats.get(t.categoryId) : undefined} />
          <div className="flex gap-2 pl-3">
            <button className="chip text-xs" onClick={() => quickMove(t, ctx.today, "Planifiée aujourd'hui")}>
              Aujourd'hui
            </button>
            <button className="chip text-xs" onClick={() => quickMove(t, addDays(ctx.today, 1), 'Planifiée demain')}>
              Demain
            </button>
            <button className="chip text-xs" onClick={() => quickMove(t, addDays(weekStart(ctx.today), 7), 'Planifiée lundi prochain')}>
              Semaine prochaine
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

