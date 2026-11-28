// Garder et retrouver ses journées : titre, moment fort, photo du jour, « Ce jour-là » et le rituel du soir.
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Camera, Check, ChevronLeft, ImageOff, Moon, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, remove, upsert, create, update } from '../db/db';
import type { DayLog, DayPhoto, ISODate, Task } from '../db/types';
import { setOutcome } from '../lib/agenda';
import { addDays, capitalize, fmt } from '../lib/dates';
import { MOODS } from '../lib/journal';
import { compressPhoto, memoryLine, onThisDay } from '../lib/memories';
import { expandTasks, isOpen, moveTask, newTaskDefaults, setDone, type TaskView } from '../lib/tasks';
import { navigate } from '../lib/ui-store';
import { MoodPicker, saveLog } from '../pages/Journal';
import { GrowText, Sheet, toast } from './ui';
import { addEssential } from './Essentials';

export function useDayPhoto(date: ISODate) {
  return useLiveQuery(async () => {
    const p = await db.photos.get(date);
    return p && !p.deleted ? p : undefined;
  }, [date]);
}

/** Champ texte enregistré au fil de la frappe (sans perdre une lettre si on change d'écran). */
function useDraft(date: ISODate, key: 'title' | 'highlight', value?: string) {
  const [v, setV] = useState(value || '');
  const pending = useRef<string | null>(null);
  const timer = useRef<number>();
  const flush = () => {
    window.clearTimeout(timer.current);
    if (pending.current === null) return;
    const val = pending.current;
    pending.current = null;
    saveLog(date, { [key]: val.trim() ? val : undefined });
  };
  useEffect(() => {
    if (pending.current === null) setV(value || '');
  }, [value]);
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  const set = (s: string) => {
    setV(s);
    pending.current = s;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 500);
  };
  return [v, set, flush] as const;
}

/** Le moment fort, le titre et la photo d'une journée. */
export function DayMemoryFields({ date, log, compact }: { date: ISODate; log?: DayLog; compact?: boolean }) {
  const [highlight, setHighlight, flushH] = useDraft(date, 'highlight', log?.highlight);
  const [title, setTitle, flushT] = useDraft(date, 'title', log?.title);
  const photo = useDayPhoto(date);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const data = await compressPhoto(f);
      await upsert<DayPhoto>('photos', { id: date, date, data });
    } catch {
      toast("Cette photo n'a pas pu être ajoutée");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };
  return (
    <div className="space-y-3" data-testid="memory-fields">
      <label className="block space-y-1.5">
        <span className="label">Le moment fort</span>
        <GrowText
          rows={2}
          className="font-serif text-[17px] italic"
          placeholder="Ce que tu veux garder de ta journée, en une phrase"
          value={highlight}
          onChange={(e) => setHighlight(e.target.value)}
          onBlur={flushH}
          data-testid="day-highlight"
        />
      </label>
      <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-[1fr_auto]'} items-end`}>
        <label className="block space-y-1.5">
          <span className="label">Le titre de ta journée</span>
          <input className="input" placeholder="Ex : Le jour du Perchoir" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={flushT} data-testid="day-title-input" />
        </label>
        {!photo && (
          <button type="button" className="btn-soft h-[46px]" onClick={() => file.current?.click()} disabled={busy} data-testid="photo-add">
            <Camera size={16} /> {busy ? 'Photo…' : 'Photo du jour'}
          </button>
        )}
      </div>
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-testid="photo-input" />
      {photo && (
        <div className="relative overflow-hidden rounded-2xl" data-testid="photo-preview">
          <img src={photo.data} alt="La photo du jour" className="max-h-72 w-full object-cover" />
          <div className="absolute bottom-2 right-2 flex gap-1.5">
            <button type="button" className="btn-soft bg-card/90 py-1.5 text-xs" onClick={() => file.current?.click()}>
              <Camera size={14} /> Changer
            </button>
            <button
              type="button"
              className="btn-soft bg-card/90 py-1.5 text-xs"
              onClick={async () => {
                const before = photo;
                await remove('photos', date);
                toast('Photo retirée', { label: 'Annuler', run: () => upsert<DayPhoto>('photos', { id: before.id, date: before.date, data: before.data }) });
              }}
              data-testid="photo-remove"
            >
              <ImageOff size={14} /> Retirer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** « Ce jour-là » : la journée d'il y a une semaine, un mois, un an. */
export function OnThisDay({ logs, today, trackerName }: { logs: DayLog[]; today: ISODate; trackerName: (id: string) => string | undefined }) {
  const memories = useMemo(() => onThisDay(logs, today), [logs, today]);
  const photos = useLiveQuery(async () => {
    const list = await db.photos.bulkGet(memories.map((m) => m.date));
    return new Map(list.filter((p): p is DayPhoto => !!p && !p.deleted).map((p) => [p.date, p.data]));
  }, [memories.map((m) => m.date).join()]);
  if (!memories.length) return null;
  return (
    <section className="space-y-2.5" data-testid="on-this-day">
      <h2 className="h-title text-2xl">Ce jour-là</h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
        {memories.map((m) => {
          const mood = m.log.mood ? MOODS[m.log.mood - 1] : undefined;
          const img = photos?.get(m.date);
          const line = memoryLine(m.log, trackerName);
          return (
            <button
              key={m.key}
              className="card flex w-[78%] shrink-0 snap-start flex-col overflow-hidden text-left sm:w-72"
              onClick={() => navigate('journal', m.date)}
              data-testid={`memory-${m.key}`}
            >
              {img ? (
                <img src={img} alt="" className="h-36 w-full object-cover" />
              ) : (
                <div className="h-2 w-full" style={{ background: mood ? `linear-gradient(90deg, ${mood.color}, ${mood.color}55)` : 'rgb(var(--c-blush))' }} />
              )}
              <div className="space-y-1 p-3.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-soft">
                  {m.label} · {fmt(m.date, 'EEEE d MMMM')}
                </div>
                {line && <div className="line-clamp-3 font-serif text-[18px] italic leading-snug text-plum">{line}</div>}
                {m.log.title && m.log.highlight && <div className="line-clamp-2 text-sm text-soft">{m.log.highlight}</div>}
                {mood && <div className="font-serif text-sm italic text-soft">a {mood.label} day</div>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type Step = 0 | 1 | 2 | 3;
const STEPS = ['Ta journée', 'Le moment fort', 'Tes tâches', 'Demain'];

/** Le rituel du soir : 4 écrans courts pour garder la journée et la fermer. */
export function EveningRitual({ today, log, allTasks, onClose }: { today: ISODate; log?: DayLog; allTasks: Task[]; onClose: () => void }) {
  const [step, setStep] = useState<Step>(0);
  const tomorrow = addDays(today, 1);
  const left = expandTasks(allTasks, today, today).filter((t) => t.kind === 'task' && isOpen(t));
  const tomorrowList = expandTasks(allTasks, tomorrow, tomorrow).filter((t) => !t.deleted && !t.outcome && t.status !== 'done');
  const [first, setFirst] = useState('');
  const finish = async () => {
    if (first.trim()) {
      const t = await create<Task>('tasks', { ...newTaskDefaults(), title: first.trim(), date: tomorrow, priority: 'must' } as any);
      await addEssential(tomorrow, t.id);
    }
    await saveLog(today, { closedAt: Date.now() });
    onClose();
    toast('Journée fermée. Belle soirée');
  };
  const act = async (t: TaskView, what: 'done' | 'tomorrow' | 'later' | 'drop') => {
    if (what === 'done') await setDone(t, true);
    else if (what === 'tomorrow') await moveTask(t, tomorrow);
    else if (what === 'later') await moveTask(t, undefined);
    else await setOutcome(t, 'dropped');
  };
  const next = () => (step < 3 ? setStep((step + 1) as Step) : finish());
  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Moon size={20} /> Fermer ma journée
        </span>
      }
      footer={
        <div className="flex items-center gap-2">
          {step > 0 && (
            <button className="btn-ghost" onClick={() => setStep((step - 1) as Step)} data-testid="ritual-back">
              <ChevronLeft size={16} /> Retour
            </button>
          )}
          <button className="btn-primary ml-auto px-6" onClick={next} data-testid="ritual-next">
            {step < 3 ? (
              <>
                Suivant <ArrowRight size={16} />
              </>
            ) : (
              <>
                <Check size={16} /> Fermer la journée
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="evening-ritual">
        <div className="flex items-center gap-1.5" aria-label={`Étape ${step + 1} sur 4`}>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-rasp' : 'bg-blush'}`} />
          ))}
        </div>
        <p className="font-serif text-xl italic text-plum" data-testid="ritual-step">
          {STEPS[step]}
        </p>
        {step === 0 && <MoodPicker date={today} value={log?.mood} />}
        {step === 1 && <DayMemoryFields date={today} log={log} compact />}
        {step === 2 &&
          (left.length ? (
            <div className="space-y-2.5">
              <p className="text-sm text-soft">Un geste par tâche, et ta liste est propre pour demain.</p>
              {left.map((t) => (
                <div key={t.id} className="card space-y-2 p-3" data-testid="ritual-task">
                  <div className="font-medium">{t.title}</div>
                  <div className="flex flex-wrap gap-1.5">
                    <button className="chip chip-on text-xs" onClick={() => act(t, 'done')}>
                      <Check size={13} /> Faite
                    </button>
                    <button className="chip text-xs" onClick={() => act(t, 'tomorrow')} data-testid="ritual-tomorrow">
                      Demain
                    </button>
                    <button className="chip text-xs" onClick={() => act(t, 'later')}>
                      Plus tard
                    </button>
                    <button className="chip text-xs" onClick={() => act(t, 'drop')}>
                      Plus nécessaire
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-soft" data-testid="ritual-clear">
              <Sparkles size={14} className="mr-1 inline text-rasp" />
              Rien ne traîne : toutes tes tâches du jour sont réglées.
            </p>
          ))}
        {step === 3 && (
          <div className="space-y-3">
            {tomorrowList.length > 0 && (
              <div className="space-y-1">
                <div className="label">Déjà prévu {fmt(tomorrow, 'EEEE')}</div>
                {tomorrowList.slice(0, 6).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 rounded-full ${t.kind === 'event' ? 'bg-mauve' : t.priority === 'must' ? 'bg-[#A8153F]' : 'bg-line'}`} />
                    {t.time && <span className="text-soft">{t.time}</span>}
                    <span className="truncate">{t.title}</span>
                    {t.kind === 'task' && t.priority !== 'must' && (
                      <button className="ml-auto shrink-0 text-xs text-rasp" onClick={async () => {
                          await update<Task>('tasks', t.id, { priority: 'must' });
                          await addEssential(tomorrow, t.id);
                          toast('Ajoutée à tes essentiels de demain');
                        }}>
                        en faire l’essentiel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <label className="block space-y-1.5">
              <span className="label">Ton premier essentiel de demain</span>
              <input className="input" placeholder="Une seule chose qui compte" value={first} onChange={(e) => setFirst(e.target.value)} data-testid="ritual-first" />
            </label>
            <p className="text-xs text-soft">Il sera en haut de ta journée demain, en « absolument ». Tu peux laisser vide.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Carte du soir sur l'accueil : ouvrir le rituel, ou voir la journée fermée. */
export function EveningCard({ today, log, onOpen }: { today: ISODate; log?: DayLog; onOpen: () => void }) {
  const photo = useDayPhoto(today);
  if (log?.closedAt) {
    return (
      <button className="card flex w-full items-center gap-3 overflow-hidden p-0 text-left" onClick={onOpen} data-testid="evening-closed">
        {photo ? <img src={photo.data} alt="" className="h-20 w-20 shrink-0 object-cover" /> : <span className="ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-plum"><Check size={18} /></span>}
        <span className="min-w-0 flex-1 py-3 pr-3">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-soft">Journée fermée</span>
          <span className="block truncate font-serif text-[18px] italic text-plum">{log.title || log.highlight || capitalize(fmt(today, 'EEEE d MMMM'))}</span>
        </span>
      </button>
    );
  }
  return (
    <button className="flex w-full items-center gap-3 rounded-2xl p-4 text-left text-white shadow-lift" style={{ background: 'linear-gradient(120deg, #382332, #81265D 60%, #A83278)' }} onClick={onOpen} data-testid="evening-ritual-open">
      <Moon size={22} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-xl italic">Fermer ma journée</span>
        <span className="block text-xs text-white/80">3 minutes : humeur, moment fort, tâches, demain</span>
      </span>
      <ArrowRight size={18} />
    </button>
  );
}
