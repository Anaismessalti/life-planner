// Aujourd'hui : ce qui compte maintenant, sans salutation ni décor inutile.
// Ordre : ce qui demande une réponse, la journée (rendez-vous puis tâches), les habitudes, ce qui arrive, le journal.
// Le soir, le journal remonte en premier.
import { AlertCircle, CalendarClock, ChevronRight, Settings as Cog } from 'lucide-react';
import { useMemo } from 'react';
import { DayAgenda, PaymentsList, TaskList, type DayCtx } from '../components/DayViews';
import { FmjNudge, HabitsWeek } from '../components/TodayJournal';
import { TaskItem } from '../components/TaskItem';
import { Ring, Section, toast } from '../components/ui';
import type { DayLog, Task } from '../db/types';
import { setOutcome } from '../lib/agenda';
import { addDays, capitalize, fmt, monthOf, relativeDay } from '../lib/dates';
import { eur, financeOccurrencesIn, monthSummary, togglePayment } from '../lib/finance';
import { useAllTasks, useCategoryMap, useFinance, useProjects, useToday } from '../lib/hooks';
import { MOODS } from '../lib/journal';
import { quoteOfDay } from '../lib/quotes';
import { dayProgress, expandTasks, isOpen, needsOutcome, type TaskView } from '../lib/tasks';
import { navigate, openEditor } from '../lib/ui-store';
import { MoodPicker, ScoreRow, saveLog, useDayLogs, useTrackers } from './Journal';

/** Au-delà, la journée est irréaliste : on le dit, sans dramatiser. */
const MUST_MAX = 3;

export function TodayPage() {
  const today = useToday();
  const all = useAllTasks();
  const cats = useCategoryMap();
  const projectsArr = useProjects();
  const finance = useFinance();
  const logs = useDayLogs();
  const trackers = useTrackers();

  const projects = useMemo(() => new Map(projectsArr.map((p) => [p.id, p])), [projectsArr]);
  const ctx: DayCtx = { today, cats, projects };
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const evening = now.getHours() >= 18;

  const day = useMemo(() => expandTasks(all, today, today), [all, today]);
  const tasks = day.filter((t) => t.kind === 'task');
  const openTasks = tasks.filter(isOpen);
  const must = openTasks.filter((t) => t.priority === 'must');
  const progress = dayProgress(day);
  const nextEvent = day.filter((t) => t.kind === 'event' && t.time && !t.outcome && !needsOutcome(t, today, nowMin)).sort((a, b) => a.time!.localeCompare(b.time!))[0];

  // Rendez-vous passés sans réponse (14 derniers jours) : « ça s'est passé ? »
  const toConfirm = useMemo(
    () => expandTasks(all, addDays(today, -14), today).filter((t) => needsOutcome(t, today, nowMin)),
    [all, today, nowMin],
  );
  const tomorrow = useMemo(() => expandTasks(all, addDays(today, 1), addDays(today, 1)).filter((t) => t.kind === 'event' && !t.outcome), [all, today]);

  // À surveiller : échéances, argent du jour, budgets, projets.
  const in7 = addDays(today, 7);
  const deadlines = all.filter((t) => isOpen(t) && t.dueDate && t.dueDate <= in7 && !t.recurrence && t.date !== today).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
  const projectDeadlines = projectsArr.filter((p) => p.dueDate && p.status !== 'done' && p.status !== 'abandoned' && p.dueDate >= today && p.dueDate <= in7);
  const payments = financeOccurrencesIn(finance, today, today).filter((o) => o.confirmed === undefined);
  const budget = useMemo(() => monthSummary(finance, monthOf(today), { today }), [finance, today]);
  const budgetAlerts = budget.byCategory.filter((c) => c.over || (c.used !== undefined && c.used >= 0.9));
  const later = all.filter((t) => isOpen(t) && !t.date && !t.targetMonth && !t.recurrence && t.kind === 'task').length;
  const watchCount = deadlines.length + projectDeadlines.length + payments.length + budgetAlerts.length;

  const todayLog = logs.find((l) => l.id === today);
  const quote = quoteOfDay(today);

  const summary =
    progress.total === 0 && !day.some((t) => t.kind === 'event')
      ? 'Rien de prévu aujourd’hui'
      : openTasks.length === 0 && progress.total > 0
        ? 'Tout est coché pour aujourd’hui'
        : `${openTasks.length} tâche${openTasks.length > 1 ? 's' : ''} à faire${must.length ? `, dont ${must.length} absolument` : ''}`;

  const confirmAll = async () => {
    const list = [...toConfirm];
    for (const t of list) await setOutcome(t, 'happened');
    toast(`${list.length} rendez-vous notés comme ayant eu lieu`, {
      label: 'Annuler',
      run: async () => {
        for (const t of list) await setOutcome({ ...t, virtual: false }, undefined);
      },
    });
  };

  const journal = (
    <JournalBlock key="journal" today={today} log={todayLog} evening={evening} />
  );

  return (
    <div className="space-y-6">
      <header className="anim-rise flex items-start justify-between gap-4">
        <div>
          <h1 className="h-title text-4xl md:text-5xl" data-testid="today-title">
            {capitalize(fmt(today, 'EEEE d MMMM'))}
          </h1>
          <p className="mt-1 font-serif text-[17px] italic text-soft">{quote}</p>
        </div>
        <button className="icon-btn md:hidden" onClick={() => navigate('settings')} aria-label="Paramètres">
          <Cog size={20} />
        </button>
      </header>

      <div className="anim-rise card flex items-center gap-4 p-4" data-testid="today-summary">
        <Ring value={progress.pct} />
        <div className="min-w-0">
          <div className="font-serif text-2xl font-semibold leading-tight text-plum">{summary}</div>
          <div className="mt-0.5 text-sm text-soft">
            {nextEvent ? (
              <>
                Prochain rendez-vous à {nextEvent.time} · <span className="text-ink">{nextEvent.title}</span>
              </>
            ) : day.some((t) => t.kind === 'event') ? (
              'Plus de rendez-vous aujourd’hui'
            ) : (
              'Aucun rendez-vous aujourd’hui'
            )}
          </div>
        </div>
      </div>

      {evening && journal}

      {toConfirm.length > 0 && (
        <Section
          title="Ça s’est passé ?"
          action={
            toConfirm.length > 1 ? (
              <button className="btn-soft py-1.5 text-xs" onClick={confirmAll} data-testid="confirm-all">
                Tout a eu lieu
              </button>
            ) : undefined
          }
        >
          <p className="-mt-1 text-xs text-soft">Seuls les rendez-vous qui ont eu lieu comptent dans ton bilan. Ceux que tu confirmes rejoignent ton journal.</p>
          <div className="space-y-2" data-testid="to-confirm">
            {toConfirm.map((t) => (
              <TaskItem key={t.id} t={t} today={today} cat={t.categoryId ? cats.get(t.categoryId) : undefined} showDate />
            ))}
          </div>
        </Section>
      )}

      {must.length > MUST_MAX && (
        <div className="card flex gap-3 p-3 text-sm" data-testid="overload">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-rasp" />
          <p>
            {must.length} tâches « absolument » aujourd’hui, c’est beaucoup pour une seule journée. Garde les {MUST_MAX} qui comptent vraiment et passe les autres en « rapidement » (touche une tâche pour changer sa priorité).
          </p>
        </div>
      )}

      <Section
        title="Ma journée"
        action={
          <button className="btn-soft py-1.5 text-xs" onClick={() => openEditor({ type: 'task', defaults: { date: today } })}>
            + Ajouter
          </button>
        }
      >
        <DayAgenda tasks={day.filter((t) => !needsOutcome(t, today, nowMin))} ctx={ctx} empty="Rien de prévu aujourd’hui. Profite, ou ajoute ce qui te trotte dans la tête." />
      </Section>

      <HabitsWeek today={today} logs={logs as DayLog[]} trackers={trackers} />

      {tomorrow.length > 0 && (
        <Section title="Demain">
          <TaskList tasks={tomorrow} ctx={ctx} />
        </Section>
      )}

      {watchCount > 0 && (
        <Section title="À garder en tête">
          <div className="space-y-2" data-testid="watch">
            {budgetAlerts.map((c) => (
              <button key={c.id} onClick={() => navigate('budget')} className="flex w-full items-center gap-3 rounded-2xl bg-blush/50 px-3.5 py-2.5 text-left text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                <span className="flex-1">
                  {c.over ? `Budget ${c.name.toLowerCase()} dépassé de ${eur(c.over)}` : `Budget ${c.name.toLowerCase()} : il reste ${eur(c.left || 0)}`}
                </span>
                <ChevronRight size={15} className="text-soft" />
              </button>
            ))}
            {payments.length > 0 && <PaymentsList items={payments} onToggle={togglePayment} />}
            {deadlines.length > 0 && <TaskList tasks={deadlines} ctx={ctx} showDate />}
            {projectDeadlines.map((p) => (
              <button key={p.id} onClick={() => navigate('projects', p.id)} className="flex w-full items-center gap-3 rounded-2xl bg-blush/50 px-3.5 py-2.5 text-left text-sm">
                <CalendarClock size={16} className="text-rasp" />
                <span className="flex-1 font-medium">Projet « {p.title} » : échéance {relativeDay(p.dueDate!, today).toLowerCase()}</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {later > 0 && (
        <button className="flex w-full items-center justify-between rounded-2xl px-1 text-sm text-soft" onClick={() => navigate('calendar', 'inbox')} data-testid="later-link">
          <span>
            {later} chose{later > 1 ? 's' : ''} en attente dans « Plus tard »
          </span>
          <ChevronRight size={15} />
        </button>
      )}

      {!evening && journal}
    </div>
  );
}

/** Le journal du jour : humeur, note, rituel du matin ou du soir. */
function JournalBlock({ today, log, evening }: { today: string; log?: DayLog; evening: boolean }) {
  return (
    <Section
      title={evening ? 'Ma soirée' : 'Mon journal'}
      action={
        <button className="btn-soft py-1.5 text-xs" onClick={() => navigate('journal', today)}>
          {log?.items.length ? `${log.items.length} activité${log.items.length > 1 ? 's' : ''} notée${log.items.length > 1 ? 's' : ''}` : 'Ouvrir'}
        </button>
      }
    >
      <div className="card space-y-3 p-3" data-testid="today-journal">
        <MoodPicker date={today} value={log?.mood} size="sm" />
        {evening && (
          <div className="space-y-1.5">
            <div className="text-[11px] text-soft">Ma journée sur 10</div>
            <ScoreRow value={log?.score} onChange={(v) => saveLog(today, { score: v })} testid="today-score" />
          </div>
        )}
        {log?.mood ? (
          <button className="w-full text-center text-xs text-rasp" onClick={() => navigate('journal', today)}>
            <span className="font-serif text-sm italic">a {MOODS[log.mood - 1].label} day</span> · ajouter ce que j’ai fait
          </button>
        ) : null}
      </div>
      <FmjNudge date={today} log={log} />
    </Section>
  );
}

export type { Task, TaskView };
