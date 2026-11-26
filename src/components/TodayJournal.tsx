// Sur « Aujourd'hui » : rendez-vous à verser dans le journal, habitudes à cocher, rappel du Five Minute Journal.
import { Check, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { setSetting } from '../db/db';
import type { Contact, DayLog, ISODate, Task, Tracker } from '../db/types';
import { DEFAULT_HABITS, MAX_HABITS, NOT_HABITS, mergeItem, normalizeHabits, suggestFromEvent, weekStatus, type HabitSetting } from '../lib/bridge';
import { useSetting } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { GROUP_LABEL, GROUP_ORDER } from '../lib/journal';
import { navigate } from '../lib/ui-store';
import { FMJ_TOTAL, eveningDone, fmjFilled, morningDone } from '../lib/wellbeing';
import { saveLog } from '../pages/Journal';
import { toast } from './ui';

/** Rendez-vous du jour reconnus (« Dîner avec Léa », « Pilates »…) : un geste pour les ajouter au journal. */
export function EventSuggestions({ date, events, log, trackers, contacts }: { date: ISODate; events: Task[]; log?: DayLog; trackers: Tracker[]; contacts: Contact[] }) {
  const sugg = useMemo(() => events.map((e) => suggestFromEvent(e, trackers, contacts)).filter((s): s is NonNullable<typeof s> => !!s), [events, trackers, contacts]);
  const names = useMemo(() => new Map(contacts.map((c) => [c.id, c.name])), [contacts]);
  const items = log?.items || [];
  const pending = sugg.filter((s) => {
    const cur = items.find((i) => i.trackerId === s.tracker.id);
    if (!cur) return true;
    return (s.item.people || []).some((p) => !cur.people?.includes(p)) || (s.item.places || []).some((p) => !cur.places?.includes(p));
  });
  if (!pending.length) return null;
  const add = async (s: (typeof sugg)[number]) => {
    await saveLog(date, (cur) => ({ items: mergeItem(cur.items, s.item) }));
    toast(`« ${s.tracker.name} » ajouté à ton journal`, { label: 'Voir', run: () => navigate('journal', date) });
  };
  return (
    <div className="card space-y-2 p-3" data-testid="event-suggestions">
      <div className="label">À verser dans mon journal</div>
      {pending.map((s) => {
        const who = [...(s.item.people || []), ...(s.item.places || [])].map((id) => names.get(id)).filter(Boolean);
        return (
          <button key={s.task.id} className="flex w-full items-center gap-3 rounded-2xl bg-blush/50 px-3 py-2.5 text-left" onClick={() => add(s)} data-testid={`suggest-${s.tracker.id}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: s.tracker.color }}>
              <Icon name={s.tracker.icon} size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{s.task.title}</span>
              <span className="block truncate text-xs text-soft">
                {s.tracker.name}
                {who.length ? ` · ${who.join(', ')}` : ''}
              </span>
            </span>
            <Plus size={18} className="shrink-0 text-rasp" />
          </button>
        );
      })}
    </div>
  );
}

/** Habitudes de la semaine : un objectif réaliste (X fois par semaine), jamais de série à perdre. */
export function HabitsWeek({ today, logs, trackers }: { today: ISODate; logs: DayLog[]; trackers: Tracker[] }) {
  const raw = useSetting<HabitSetting[]>('habits', DEFAULT_HABITS);
  const habits = useMemo(() => normalizeHabits(raw), [raw]);
  const [edit, setEdit] = useState(false);
  const live = trackers.filter((t) => !t.deleted);
  const byDate = useMemo(() => new Map(logs.filter((l) => !l.deleted).map((l) => [l.date, l])), [logs]);
  const week = weekStatus(habits, byDate, today, live);
  const todayLog = byDate.get(today);
  const soft = !!todayLog?.soft;
  const toggle = async (t: Tracker) => {
    const before = week.find((w) => w.tracker.id === t.id);
    const adding = !todayLog?.items.some((i) => i.trackerId === t.id);
    await saveLog(today, (cur) => (cur.items.some((i) => i.trackerId === t.id) ? { items: cur.items.filter((i) => i.trackerId !== t.id) } : { items: [...cur.items, { trackerId: t.id }] }));
    if (adding && before) {
      const n = before.done + 1;
      if (n === before.target) toast(`${t.name} : ${n} sur ${before.target}, ta semaine est faite.`);
      else if (n > before.target) toast('Une de plus, en bonus.');
    }
  };
  const save = (list: HabitSetting[]) => setSetting('habits', list);
  const setTarget = (id: string, perWeek: number) => save(habits.map((h) => (h.id === id ? { ...h, perWeek: Math.max(1, Math.min(7, perWeek)) } : h)));
  const pick = (id: string) => {
    if (habits.some((h) => h.id === id)) return save(habits.filter((h) => h.id !== id));
    if (habits.length >= MAX_HABITS) return toast(`${MAX_HABITS} habitudes, c'est déjà beaucoup. Retires-en une pour en ajouter une autre.`);
    save([...habits, { id, perWeek: 3 }]);
  };
  const tired = !!todayLog && ((todayLog.mood && todayLog.mood <= 2) || todayLog.feelings?.some((f) => ['tired', 'drained', 'sick', 'hendaye'].includes(f.id)));
  return (
    <div className="card space-y-3 p-3" data-testid="habits">
      <div className="flex items-center justify-between gap-2">
        <div className="label">Cette semaine</div>
        <div className="flex items-center gap-1">
          {!edit && (
            <button
              className={`rounded-full px-2.5 py-1 text-[11px] ${soft ? 'bg-plum text-white' : tired ? 'bg-blush text-plum' : 'text-soft'}`}
              onClick={() => saveLog(today, { soft: soft ? undefined : true })}
              data-testid="soft-day"
            >
              Journée douce
            </button>
          )}
          <button className="icon-btn h-8 w-8" onClick={() => setEdit(!edit)} aria-label="Choisir mes habitudes" data-testid="habits-edit">
            {edit ? <Check size={15} /> : <Pencil size={14} />}
          </button>
        </div>
      </div>
      {soft && !edit && <p className="text-xs text-soft">Aujourd'hui, on fait simple. Rien ne compte contre toi.</p>}
      {!edit ? (
        <div className="space-y-2">
          {week.map((w) => {
            const on = !!todayLog?.items.some((i) => i.trackerId === w.tracker.id);
            return (
              <div key={w.tracker.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <button
                    className={`chip min-h-[38px] flex-1 justify-start ${on ? 'border-transparent text-white shadow-soft' : ''}`}
                    style={on ? { background: w.tracker.color } : undefined}
                    onClick={() => toggle(w.tracker)}
                    aria-pressed={on}
                    data-testid={`habit-${w.tracker.id}`}
                  >
                    {on ? <Check size={14} /> : <Icon name={w.tracker.icon} size={14} />}
                    <span className="truncate">{w.tracker.name}</span>
                    <span className={`ml-auto text-xs ${on ? 'text-white/85' : 'text-soft'}`} data-testid={`habit-count-${w.tracker.id}`}>
                      {w.done >= w.target ? (w.done > w.target ? `${w.done}/${w.target} · bonus` : 'fait pour la semaine') : `${w.done}/${w.target}`}
                    </span>
                  </button>
                  <div className="flex shrink-0 gap-[3px]" aria-hidden>
                    {w.days.map((d) => (
                      <span
                        key={d.date}
                        title={d.date}
                        className={`h-2.5 w-2.5 rounded-full ${d.state === 'done' ? '' : d.state === 'logged' ? 'bg-blush' : d.state === 'empty' ? 'border border-dashed border-mauve' : d.state === 'soft' ? 'bg-mauve/40' : 'bg-blush/30'}`}
                        style={d.state === 'done' ? { background: w.tracker.color } : undefined}
                      />
                    ))}
                  </div>
                </div>
                {w.comeback && <p className="pl-1 text-[11px] text-soft">{w.tracker.name} t'attend. Une fois cette semaine, ce serait déjà bien.</p>}
              </div>
            );
          })}
          {!week.length && (
            <button className="btn-soft w-full text-xs" onClick={() => setEdit(true)}>
              Choisir mes habitudes
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {habits.length > 0 && (
            <div className="space-y-1.5">
              {habits.map((h) => {
                const t = live.find((x) => x.id === h.id);
                if (!t) return null;
                return (
                  <div key={h.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{t.name}</span>
                    <button className="icon-btn h-8 w-8" onClick={() => setTarget(h.id, h.perWeek - 1)} aria-label="Moins souvent">
                      −
                    </button>
                    <span className="w-24 text-center text-xs" data-testid={`habit-target-${h.id}`}>
                      {h.perWeek === 7 ? 'tous les jours' : `${h.perWeek} fois / sem.`}
                    </span>
                    <button className="icon-btn h-8 w-8" onClick={() => setTarget(h.id, h.perWeek + 1)} aria-label="Plus souvent" data-testid={`habit-plus-${h.id}`}>
                      +
                    </button>
                  </div>
                );
              })}
              <p className="text-[11px] text-soft">Vise ce que tu fais déjà les semaines normales. Tu pourras monter ensuite.</p>
            </div>
          )}
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {GROUP_ORDER.map((g) => {
              const list = live.filter((t) => t.group === g && !NOT_HABITS.has(t.id) && t.group !== 'cycle');
              if (!list.length) return null;
              return (
                <div key={g} className="space-y-1">
                  <div className="text-[11px] text-soft">{GROUP_LABEL[g]}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((t) => (
                      <button key={t.id} className={`chip min-h-[32px] py-1 text-xs ${habits.some((h) => h.id === t.id) ? 'chip-on' : ''}`} onClick={() => pick(t.id)} data-testid={`habit-pick-${t.id}`}>
                        {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Petit rappel du Five Minute Journal : le matin ou le soir selon l'heure. */
export function FmjNudge({ date, log }: { date: ISODate; log?: DayLog }) {
  const evening = new Date().getHours() >= 17;
  const f = log?.fmj;
  const doneNow = evening ? eveningDone(f) : morningDone(f);
  return (
    <button className="card flex w-full items-center gap-3 p-3 text-left" onClick={() => navigate('journal', 'fmj')} data-testid="fmj-nudge">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blush to-mauve/60 font-serif text-sm italic text-plum">5′</span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-[17px] italic text-plum">{evening ? 'Evening reflection' : 'Morning pages'}</span>
        <span className="block text-xs text-soft">{doneNow ? `Fait · ${fmjFilled(f)}/${FMJ_TOTAL}` : evening ? '3 belles choses de ta journée' : '3 gratitudes, une intention, une affirmation'}</span>
      </span>
      {doneNow && <Check size={18} className="text-rasp" />}
    </button>
  );
}
