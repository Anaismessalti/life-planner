import { BookHeart, CalendarClock, Settings as Cog, Sparkles } from 'lucide-react';
import { MoodPicker, useDayLogs } from './Journal';
import { MOODS } from '../lib/journal';
import { useMemo, useState } from 'react';
import { PaymentsList, Planning, PriorityBoard, TaskList, type DayCtx } from '../components/DayViews';
import { Ring, Section, Segmented } from '../components/ui';
import { addDays, capitalize, fmt } from '../lib/dates';
import { financeOccurrencesIn, togglePayment } from '../lib/finance';
import { useAllTasks, useCategoryMap, useFinance, useProjects, useSetting, useToday } from '../lib/hooks';
import { dayProgress, expandTasks, isPostponed } from '../lib/tasks';
import { navigate, openEditor } from '../lib/ui-store';

type Mode = 'all' | 'planning' | 'priorities';

function greeting(name: string) {
  const h = new Date().getHours();
  const base = h < 5 ? 'Belle nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bel après-midi' : 'Bonsoir';
  return name ? `${base}, ${name}` : base;
}

const QUOTES = [
  'Un pas après l’autre, tout devient possible.',
  'Aujourd’hui est une page blanche : écris-la avec douceur.',
  'Fais de ton mieux, et sois fière de chaque petite victoire.',
  'La constance vaut mieux que la perfection.',
  'Prends soin de toi, le reste suivra.',
  'Petit à petit, l’oiseau fait son nid.',
  'Tu as déjà accompli tellement de choses.',
];

export function TodayPage() {
  const today = useToday();
  const all = useAllTasks();
  const cats = useCategoryMap();
  const projectsArr = useProjects();
  const finance = useFinance();
  const name = useSetting<string>('userName', '');
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('todayMode') as Mode) || 'all');
  const changeMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem('todayMode', m);
    } catch {}
  };

  const projects = useMemo(() => new Map(projectsArr.map((p) => [p.id, p])), [projectsArr]);
  const ctx: DayCtx = { today, cats, projects };
  const day = useMemo(() => expandTasks(all, today, today), [all, today]);
  const events = day.filter((t) => t.kind === 'event');
  const tasks = day.filter((t) => t.kind === 'task');
  const must = tasks.filter((t) => t.priority === 'must' && t.status !== 'done');
  const postponed = tasks.filter((t) => isPostponed(t) && t.status !== 'done');
  const progress = dayProgress(day);
  const inboxCount = all.filter((t) => !t.deleted && !t.date && !t.targetMonth && t.kind === 'task' && t.status !== 'done' && !t.recurrence).length;

  // Échéances des 7 prochains jours (tâches + projets)
  const in7 = addDays(today, 7);
  const deadlines = all
    .filter((t) => !t.deleted && t.dueDate && t.status !== 'done' && t.dueDate <= in7 && !t.recurrence && t.date !== today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const projectDeadlines = projectsArr.filter((p) => p.dueDate && p.status !== 'done' && p.dueDate >= today && p.dueDate <= in7);
  const payments = financeOccurrencesIn(finance, today, today);

  const logs = useDayLogs();
  const todayLog = logs.find((l) => l.id === today);
  const dateLabel = capitalize(fmt(today, 'EEEE d MMMM'));
  const quote = QUOTES[Number(today.slice(8)) % QUOTES.length];

  return (
    <div className="space-y-6">
      <header className="anim-rise flex items-start justify-between gap-4">
        <div>
          <p className="label">{dateLabel}</p>
          <h1 className="h-title mt-1 text-4xl md:text-5xl">{greeting(name)}</h1>
          <p className="mt-1.5 font-serif text-lg italic text-soft">{quote}</p>
        </div>
        <button className="icon-btn md:hidden" onClick={() => navigate('settings')} aria-label="Paramètres">
          <Cog size={20} />
        </button>
      </header>

      <div className="anim-rise card relative flex items-center gap-4 overflow-hidden p-4">
        <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-gradient-to-br from-blush to-mauve/30" />
        <Ring value={progress.pct} />
        <div className="relative">
          <div className="font-serif text-2xl font-semibold text-plum">
            {progress.total === 0 ? 'Journée libre' : progress.pct === 100 ? 'Tout est fait !' : `${progress.done} sur ${progress.total} tâches`}
          </div>
          <div className="text-sm text-soft">
            {events.length} rendez-vous · {must.length} essentiel{must.length > 1 ? 's' : ''} restant{must.length > 1 ? 's' : ''}
            {inboxCount > 0 && (
              <>
                {' · '}
                <button className="text-rasp underline-offset-2 hover:underline" onClick={() => navigate('calendar', 'inbox')}>
                  {inboxCount} sans date
                </button>
              </>
            )}
          </div>
        </div>
        {progress.pct === 100 && progress.total > 0 && <Sparkles className="relative ml-auto text-rasp" />}
      </div>

      {events.length > 0 && (
        <Section title="Mes rendez-vous">
          <TaskList tasks={events} ctx={ctx} />
        </Section>
      )}

      {payments.length > 0 && (
        <Section title="Prélèvements et revenus du jour">
          <PaymentsList items={payments} onToggle={togglePayment} />
        </Section>
      )}

      {(deadlines.length > 0 || projectDeadlines.length > 0) && (
        <Section title="Échéances proches">
          <TaskList tasks={deadlines} ctx={ctx} showDate />
          {projectDeadlines.map((p) => (
            <button key={p.id} onClick={() => navigate('projects', p.id)} className="flex w-full items-center gap-3 rounded-2xl bg-blush/50 px-3.5 py-2.5 text-left text-sm">
              <CalendarClock size={16} className="text-rasp" />
              <span className="flex-1 font-medium">Projet : {p.title}</span>
              <span className="text-soft">{fmt(p.dueDate!, 'd MMM')}</span>
            </button>
          ))}
        </Section>
      )}

      {postponed.length > 0 && mode !== 'priorities' && (
        <Section title="Reportées">
          <TaskList tasks={postponed} ctx={ctx} />
        </Section>
      )}

      <Section
        title="Ma journée"
        action={
          <button className="btn-soft py-1.5 text-xs" onClick={() => openEditor({ type: 'task', defaults: { date: today } })}>
            + Tâche
          </button>
        }
      >
        <Segmented
          value={mode}
          onChange={changeMode}
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'planning', label: 'Planning' },
            { value: 'priorities', label: 'Priorités' },
          ]}
        />
        {mode === 'all' && (
          <TaskList
            tasks={tasks.filter((t) => !isPostponed(t) || t.status === 'done')}
            ctx={ctx}
            empty="Aucune tâche aujourd’hui. Appuie sur + pour en ajouter une."
          />
        )}
        {mode === 'planning' && <Planning tasks={day} ctx={ctx} date={today} />}
        {mode === 'priorities' && <PriorityBoard tasks={tasks} ctx={ctx} />}
      </Section>

      <Section
        title={
          <span className="inline-flex items-center gap-2">
            <BookHeart size={18} className="text-rasp" /> Comment s'est passée ta journée ?
          </span>
        }
        action={
          <button className="btn-soft py-1.5 text-xs" onClick={() => navigate('journal', today)}>
            {todayLog?.items.length ? `${todayLog.items.length} activité${todayLog.items.length > 1 ? 's' : ''}` : 'Mon journal'}
          </button>
        }
      >
        <div className="card p-3">
          <MoodPicker date={today} value={todayLog?.mood} size="sm" />
          {todayLog?.mood && (
            <button className="mt-2 w-full text-center text-xs text-rasp" onClick={() => navigate('journal', today)}>
              {MOODS[todayLog.mood - 1].label} journée · ajouter mes sorties et activités →
            </button>
          )}
        </div>
      </Section>
    </div>
  );
}
