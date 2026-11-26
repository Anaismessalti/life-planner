// Sur « Aujourd'hui » : rendez-vous à verser dans le journal, habitudes à cocher, rappel du Five Minute Journal.
import { Check, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { setSetting } from '../db/db';
import type { Contact, DayLog, ISODate, Task, Tracker } from '../db/types';
import { DEFAULT_HABITS, mergeItem, suggestFromEvent } from '../lib/bridge';
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

/** Habitudes du jour : des activités du journal cochées d'un geste. */
export function HabitsRow({ date, log, trackers }: { date: ISODate; log?: DayLog; trackers: Tracker[] }) {
  const ids = useSetting<string[]>('habits', DEFAULT_HABITS);
  const [edit, setEdit] = useState(false);
  const live = trackers.filter((t) => !t.deleted);
  const habits = ids.map((id) => live.find((t) => t.id === id)).filter((t): t is Tracker => !!t);
  const has = (id: string) => !!log?.items.some((i) => i.trackerId === id);
  const toggle = (t: Tracker) =>
    saveLog(date, (cur) => (cur.items.some((i) => i.trackerId === t.id) ? { items: cur.items.filter((i) => i.trackerId !== t.id) } : { items: [...cur.items, { trackerId: t.id }] }));
  const pick = (id: string) => setSetting('habits', ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const done = habits.filter((h) => has(h.id)).length;
  return (
    <div className="card space-y-2.5 p-3" data-testid="habits">
      <div className="flex items-center justify-between">
        <div className="label">
          Mes habitudes · {done}/{habits.length}
        </div>
        <button className="icon-btn h-8 w-8" onClick={() => setEdit(!edit)} aria-label="Choisir mes habitudes" data-testid="habits-edit">
          {edit ? <Check size={15} /> : <Pencil size={14} />}
        </button>
      </div>
      {!edit ? (
        <div className="flex flex-wrap gap-2">
          {habits.map((t) => {
            const on = has(t.id);
            return (
              <button
                key={t.id}
                className={`chip min-h-[38px] ${on ? 'border-transparent text-white shadow-soft' : ''}`}
                style={on ? { background: t.color } : undefined}
                onClick={() => toggle(t)}
                aria-pressed={on}
                data-testid={`habit-${t.id}`}
              >
                {on ? <Check size={14} /> : <Icon name={t.icon} size={14} />}
                {t.name}
              </button>
            );
          })}
          {!habits.length && <p className="text-sm text-soft">Touche le crayon pour choisir tes habitudes.</p>}
        </div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {GROUP_ORDER.map((g) => {
            const list = live.filter((t) => t.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="space-y-1">
                <div className="text-[11px] text-soft">{GROUP_LABEL[g]}</div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map((t) => (
                    <button key={t.id} className={`chip min-h-[32px] py-1 text-xs ${ids.includes(t.id) ? 'chip-on' : ''}`} onClick={() => pick(t.id)} data-testid={`habit-pick-${t.id}`}>
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
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
    <button className="card flex w-full items-center gap-3 p-3 text-left" onClick={() => navigate('journal', date)} data-testid="fmj-nudge">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blush to-mauve/60 font-serif text-sm italic text-plum">5′</span>
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-[17px] italic text-plum">{evening ? 'Evening reflection' : 'Morning pages'}</span>
        <span className="block text-xs text-soft">{doneNow ? `Fait · ${fmjFilled(f)}/${FMJ_TOTAL}` : evening ? '3 belles choses de ta journée' : '3 gratitudes, une intention, une affirmation'}</span>
      </span>
      {doneNow && <Check size={18} className="text-rasp" />}
    </button>
  );
}
