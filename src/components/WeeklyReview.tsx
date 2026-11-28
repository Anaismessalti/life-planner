// Revue du dimanche : 10 minutes pour garder la semaine, trier ce qui traîne et donner un cap à la suivante.
import { ArrowRight, CalendarHeart, Check, ChevronLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DayLog, ISODate, Task, Tracker } from '../db/types';
import { setOutcome } from '../lib/agenda';
import { DEFAULT_HABITS, normalizeHabits, weekStatus, type HabitSetting } from '../lib/bridge';
import { addDays, fmt, monthOf } from '../lib/dates';
import { eur, monthSummary } from '../lib/finance';
import { useFinance, useSetting } from '../lib/hooks';
import { MOODS } from '../lib/journal';
import { lingering, reviewWeek, upcoming, weekRecap } from '../lib/weekly';
import { moveTask, postponeCount } from '../lib/tasks';
import { saveLog } from '../pages/Journal';
import { GrowText, Sheet, toast } from './ui';

const STEPS = ['Ta semaine', 'Ce qui traîne', 'Tes habitudes', 'La semaine qui vient'];

export function WeeklyReview({ today, logs, all, trackers, onClose }: { today: ISODate; logs: DayLog[]; all: Task[]; trackers: Tracker[]; onClose: () => void }) {
  const { from, to } = reviewWeek(today);
  const saved = logs.find((l) => l.date === to)?.review;
  const [step, setStep] = useState(0);
  const [win, setWin] = useState(saved?.win || '');
  const [focus, setFocus] = useState(saved?.focus || '');
  const recap = useMemo(() => weekRecap(logs, all, from, to), [logs, all, from, to]);
  const stuck = lingering(all, today);
  const next = upcoming(all, today);
  const finance = useFinance();
  const budget = monthSummary(finance, monthOf(today), { today });
  const rawHabits = useSetting<HabitSetting[]>('habits', DEFAULT_HABITS);
  const byDate = useMemo(() => new Map(logs.filter((l) => !l.deleted).map((l) => [l.date, l])), [logs]);
  const habits = weekStatus(normalizeHabits(rawHabits), byDate, to, trackers.filter((t) => !t.deleted));
  const mood = recap.moodAvg ? MOODS[Math.round(recap.moodAvg) - 1] : undefined;
  const finish = async () => {
    await saveLog(to, { review: { win: win.trim() || undefined, focus: focus.trim() || undefined, doneAt: Date.now() } });
    onClose();
    toast('Revue faite. Bonne semaine');
  };
  const nextDay = addDays(today, 1);
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <CalendarHeart size={20} /> Ma semaine en revue
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button className="btn-ghost" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={16} /> Retour
            </button>
          )}
          <button className="btn-primary ml-auto px-6" onClick={() => (step < 3 ? setStep(step + 1) : finish())} data-testid="review-next">
            {step < 3 ? (
              <>
                Suivant <ArrowRight size={16} />
              </>
            ) : (
              <>
                <Check size={16} /> Terminer la revue
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="weekly-review">
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-rasp' : 'bg-blush'}`} />
          ))}
        </div>
        <div>
          <p className="font-serif text-xl italic text-plum" data-testid="review-step">
            {STEPS[step]}
          </p>
          <p className="text-xs text-soft">
            Du {fmt(from, 'd MMMM')} au {fmt(to, 'd MMMM')}
          </p>
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="card p-2.5">
                <div className="font-serif text-2xl font-semibold text-plum">{recap.daysLogged}/7</div>
                <div className="text-[11px] text-soft">jours notés</div>
              </div>
              <div className="card p-2.5">
                <div className="font-serif text-2xl font-semibold text-plum" data-testid="review-done">{recap.tasksDone}</div>
                <div className="text-[11px] text-soft">tâches faites</div>
              </div>
              <div className="card p-2.5">
                <div className="font-serif text-2xl font-semibold text-plum">{recap.essentials.chosen ? `${recap.essentials.done}/${recap.essentials.chosen}` : recap.events}</div>
                <div className="text-[11px] text-soft">{recap.essentials.chosen ? 'essentiels faits' : 'rendez-vous vécus'}</div>
              </div>
            </div>
            {mood && <p className="text-center font-serif text-lg italic text-plum">a {mood.label} week</p>}
            {recap.moments.length > 0 ? (
              <div className="space-y-1.5" data-testid="review-moments">
                <div className="label">Tes moments forts</div>
                {recap.moments.map((m) => (
                  <div key={m.date} className="flex gap-3 text-sm">
                    <span className="w-16 shrink-0 text-soft">{fmt(m.date, 'EEE d')}</span>
                    <span className="font-serif text-[16px] italic text-plum">{m.line}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-soft">Pas de moment fort noté cette semaine. Le rituel du soir t’aidera à les garder.</p>
            )}
            <label className="block space-y-1.5">
              <span className="label">Ma réussite de la semaine</span>
              <GrowText rows={1} placeholder="Même petite : elle compte" value={win} onChange={(e) => setWin(e.target.value)} data-testid="review-win" />
            </label>
          </div>
        )}

        {step === 1 &&
          (stuck.length ? (
            <div className="space-y-2.5">
              <p className="text-sm text-soft">Ces tâches reviennent sans avancer. Un geste chacune, sans culpabilité.</p>
              {stuck.slice(0, 8).map((t) => (
                <div key={t.id} className="card space-y-2 p-3" data-testid="review-stuck">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{t.title}</span>
                    <span className="shrink-0 text-[11px] text-soft">{postponeCount(t) >= 2 ? `reportée ${postponeCount(t)} fois` : 'échéance passée'}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button className="chip chip-on text-xs" onClick={() => moveTask(t, nextDay)} data-testid="review-stuck-next">
                      {fmt(nextDay, 'EEEE')}
                    </button>
                    <button className="chip text-xs" onClick={() => moveTask(t, undefined)}>
                      Plus tard
                    </button>
                    <button className="chip text-xs" onClick={() => setOutcome(t, 'dropped')}>
                      Plus nécessaire
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-soft" data-testid="review-nothing-stuck">
              Rien ne traîne. Ta liste est à jour.
            </p>
          ))}

        {step === 2 &&
          (habits.length ? (
            <div className="space-y-2" data-testid="review-habits">
              {habits.map((h) => (
                <div key={h.tracker.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{h.tracker.name}</span>
                  <span className={`font-semibold ${h.done >= h.target ? 'text-plum' : 'text-soft'}`}>
                    {h.done}/{h.target}
                  </span>
                  <span className="w-24 text-right text-xs text-soft">{h.done >= h.target ? 'objectif tenu' : h.done ? 'en chemin' : 'pas cette fois'}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-soft">Une semaine ratée n’efface rien : on repart lundi. Tu peux changer tes objectifs avec le crayon sur l’accueil.</p>
            </div>
          ) : (
            <p className="text-sm text-soft">Aucune habitude suivie pour l’instant.</p>
          ))}

        {step === 3 && (
          <div className="space-y-4">
            {next.length > 0 ? (
              <div className="space-y-1.5" data-testid="review-upcoming">
                <div className="label">À venir</div>
                {next.slice(0, 10).map((t) => (
                  <div key={t.id + (t.date || '')} className="flex gap-3 text-sm">
                    <span className="w-20 shrink-0 text-soft">{fmt((t.kind === 'event' ? t.date : t.dueDate)!, 'EEE d')}</span>
                    <span className="truncate">
                      {t.kind === 'event' ? `${t.time ? t.time + ' · ' : ''}${t.title}` : `Échéance : ${t.title}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-soft">Rien de fixé pour les 7 prochains jours.</p>
            )}
            <div className="card flex items-center justify-between p-3 text-sm">
              <span>Budget du mois, reste prévu</span>
              <span className={`font-semibold ${budget.remainingForecast < 0 ? 'text-red-600' : 'text-plum'}`}>{eur(budget.remainingForecast)}</span>
            </div>
            <label className="block space-y-1.5">
              <span className="label">Mon cap de la semaine</span>
              <GrowText rows={1} placeholder="Ex : finir le dossier, voir Léa, dormir avant minuit" value={focus} onChange={(e) => setFocus(e.target.value)} data-testid="review-focus" />
            </label>
            <p className="text-xs text-soft">Il s’affichera en haut de ton accueil toute la semaine.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Carte du dimanche sur l'accueil. */
export function ReviewCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button className="card flex w-full items-center gap-3 border-mauve/60 p-4 text-left" onClick={onOpen} data-testid="weekly-review-open">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-plum">
        <CalendarHeart size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-xl italic text-plum">Ma semaine en revue</span>
        <span className="block text-xs text-soft">10 minutes : souvenirs, ce qui traîne, habitudes, la semaine qui vient</span>
      </span>
      <ArrowRight size={18} className="text-plum" />
    </button>
  );
}

/** Le cap de la semaine, choisi à la dernière revue (7 jours au plus). */
export function weekFocus(logs: DayLog[], today: ISODate): string | undefined {
  const recent = logs
    .filter((l) => l.review?.focus && l.review.doneAt && l.date <= today && l.date >= addDays(today, -7))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return recent?.review?.focus;
}
