import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronLeft, ChevronRight, MapPin, Plus, Settings as Cog, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Progress, Section } from '../components/ui';
import { create, db, upsert } from '../db/db';
import type { Contact, DayLog, ISODate, Tracker } from '../db/types';
import { WEEKDAYS_SHORT, addDays, addMonths, capitalize, fmt, fmtMonth, monthOf, monthStart, range, relativeDay, weekStart } from '../lib/dates';
import { useToday } from '../lib/hooks';
import { COLORS, Icon } from '../lib/icons';
import { GROUP_LABEL, GROUP_ORDER, MOODS, monthJournal, topDetails } from '../lib/journal';
import { navigate, useRoute } from '../lib/ui-store';

const EMPTY: never[] = [];

export function useTrackers(): Tracker[] {
  const all = useLiveQuery(() => db.trackers.orderBy('order').toArray(), [], EMPTY);
  return useMemo(() => all.filter((t) => !t.deleted), [all]);
}
export function useDayLogs(): DayLog[] {
  const all = useLiveQuery(() => db.daylogs.toArray(), [], EMPTY);
  return useMemo(() => all.filter((l) => !l.deleted), [all]);
}

export function useContacts(): Contact[] {
  const all = useLiveQuery(() => db.contacts.orderBy('order').toArray(), [], EMPTY);
  return useMemo(() => all.filter((c) => !c.deleted), [all]);
}

export async function addContact(name: string, kind: Contact['kind'], existing: Contact[]): Promise<Contact> {
  const clean = name.trim().replace(/^./, (c) => c.toUpperCase());
  const dup = existing.find((c) => c.kind === kind && c.name.toLowerCase() === clean.toLowerCase());
  if (dup) return dup;
  const order = Math.max(0, ...existing.map((c) => c.order)) + 1;
  return create<Contact>('contacts', { name: clean, kind, icon: kind === 'place' ? 'martini' : 'users', color: COLORS[order % COLORS.length], order } as any);
}

export async function saveLog(date: ISODate, patch: Partial<DayLog>) {
  const cur = await db.daylogs.get(date);
  await upsert<DayLog>('daylogs', { id: date, date, items: cur && !cur.deleted ? cur.items : [], ...(cur && !cur.deleted ? { mood: cur.mood, text: cur.text } : {}), ...patch });
}

/** Petite bulle de couleur, de plus en plus lumineuse avec l'humeur. */
export function MoodOrb({ color, level, size = 30 }: { color: string; level: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="block rounded-full"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 32% 30%, #fff ${4 + level * 3}%, ${color}${level >= 3 ? '' : 'cc'} 72%)`,
        boxShadow: `0 0 ${level * 3}px ${color}${level >= 4 ? '99' : '44'}`,
      }}
    />
  );
}

export function MoodPicker({ date, value, size = 'md' }: { date: ISODate; value?: number; size?: 'sm' | 'md' }) {
  return (
    <div className="flex justify-between gap-1.5" role="radiogroup" aria-label="Note de la journée">
      {MOODS.map((m) => {
        const on = value === m.value;
        return (
          <button
            key={m.value}
            role="radio"
            aria-checked={on}
            onClick={() => saveLog(date, { mood: on ? undefined : m.value })}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-2 transition active:scale-95 ${on ? 'bg-card shadow-soft ring-2' : 'opacity-70 hover:opacity-100'}`}
            style={on ? ({ '--tw-ring-color': m.color } as React.CSSProperties) : undefined}
            data-testid={`mood-${m.value}`}
          >
            <MoodOrb color={m.color} level={m.value} size={size === 'sm' ? 28 : 34} />
            <span className={`font-serif text-[15px] italic leading-tight ${on ? 'font-semibold text-plum' : 'text-soft'}`}>{m.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function JournalPage() {
  const today = useToday();
  const { param } = useRoute();
  const [date, setDate] = useState<ISODate>(param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : today);
  const [month, setMonth] = useState(monthOf(date));
  const [focus, setFocus] = useState<string | null>(null);
  const trackers = useTrackers();
  const contacts = useContacts();
  const logs = useDayLogs();
  const log = logs.find((l) => l.id === date);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => setMonth(monthOf(date)), [date]);

  return (
    <div className="space-y-7" ref={topRef}>
      <header className="anim-rise flex items-start justify-between gap-3">
        <div>
          <p className="label">Mon journal</p>
          <h1 className="h-title text-4xl">Mes journées</h1>
        </div>
        <button className="icon-btn md:hidden" onClick={() => navigate('settings')} aria-label="Paramètres">
          <Cog size={20} />
        </button>
      </header>

      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <DayEditor date={date} setDate={setDate} today={today} log={log} trackers={trackers} contacts={contacts} />
        <MonthReview
          month={month}
          setMonth={setMonth}
          logs={logs}
          trackers={trackers}
          contacts={contacts}
          focus={focus}
          setFocus={setFocus}
          selected={date}
          onPick={(d) => {
            setDate(d);
            topRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
          today={today}
        />
      </div>
    </div>
  );
}

function DayEditor({ date, setDate, today, log, trackers, contacts }: { date: ISODate; setDate: (d: ISODate) => void; today: ISODate; log?: DayLog; trackers: Tracker[]; contacts: Contact[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState(log?.text || '');
  const items = log?.items || [];
  useEffect(() => setText(log?.text || ''), [date, log?.id]);
  useEffect(() => {
    if (text === (log?.text || '')) return;
    const t = setTimeout(() => saveLog(date, { text: text || undefined }), 500);
    return () => clearTimeout(t);
  }, [text]);

  const toggle = (t: Tracker) => {
    const has = items.find((i) => i.trackerId === t.id);
    if (!has) {
      saveLog(date, { items: [...items, { trackerId: t.id }] });
      setEditing(t.id);
    } else setEditing(editing === t.id ? null : t.id);
  };
  const patchItem = (id: string, p: Partial<DayLog['items'][number]>) => saveLog(date, { items: items.map((i) => (i.trackerId === id ? { ...i, ...p } : i)) });
  const names = useMemo(() => new Map(contacts.map((c) => [c.id, c.name])), [contacts]);
  const removeItem = (id: string) => {
    saveLog(date, { items: items.filter((i) => i.trackerId !== id) });
    setEditing(null);
  };
  const groups = GROUP_ORDER.map((g) => ({ g, list: trackers.filter((t) => (t.group || 'autres') === g) })).filter((x) => x.list.length);

  return (
    <div className="card anim-rise space-y-5 p-4">
      <div className="flex items-center justify-between">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <div className="font-serif text-2xl font-semibold text-plum">{relativeDay(date, today)}</div>
          <div className="text-xs text-soft">{capitalize(fmt(date, 'EEEE d MMMM'))}</div>
        </div>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Jour suivant">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="space-y-2">
        <div className="label">Mood of the day</div>
        <MoodPicker date={date} value={log?.mood} />
      </div>

      {groups.map(({ g, list }) => (
        <div key={g} className="space-y-2">
          <div className="label">{GROUP_LABEL[g]}</div>
          <div className="flex flex-wrap gap-2">
            {list.map((t) => {
              const it = items.find((i) => i.trackerId === t.id);
              return (
                <button
                  key={t.id}
                  className={`chip ${it ? 'border-transparent text-white shadow-soft' : ''}`}
                  style={it ? { background: t.color } : undefined}
                  onClick={() => toggle(t)}
                  aria-pressed={!!it}
                  data-testid={`tracker-${t.id}`}
                >
                  <Icon name={t.icon} size={14} />
                  {t.name}
                  {it && (it.people?.length || it.places?.length || it.detail) ? (
                    <span className="max-w-[12rem] truncate opacity-90">
                      · {[...(it.people || []), ...(it.places || [])].map((id) => names.get(id)).filter(Boolean).concat(it.detail ? [it.detail] : []).join(', ')}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {editing && list.some((t) => t.id === editing) && items.some((i) => i.trackerId === editing) && (
            <WithWhom
              item={items.find((i) => i.trackerId === editing)!}
              contacts={contacts}
              onChange={(p) => patchItem(editing, p)}
              onRemove={() => removeItem(editing)}
              onDone={() => setEditing(null)}
            />
          )}
        </div>
      ))}

      <div className="space-y-2">
        <div className="label">En quelques mots</div>
        <textarea className="input min-h-[90px]" placeholder="Un souvenir, une pensée, ce qui t'a fait sourire…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Texte du jour" />
      </div>
      <p className="text-center text-xs text-soft">Enregistré automatiquement · tu peux ajouter ou renommer tes suivis dans Paramètres</p>
    </div>
  );
}

/** Sélection des personnes et des lieux par pastilles, avec ajout immédiat d'un nouveau nom. */
function WithWhom({
  item,
  contacts,
  onChange,
  onRemove,
  onDone,
}: {
  item: DayLog['items'][number];
  contacts: Contact[];
  onChange: (p: Partial<DayLog['items'][number]>) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const [adding, setAdding] = useState<Contact['kind'] | null>(null);
  const [name, setName] = useState('');
  const busy = useRef(false);
  const people = contacts.filter((c) => c.kind === 'person');
  const places = contacts.filter((c) => c.kind === 'place');
  const key = (k: Contact['kind']) => (k === 'person' ? 'people' : 'places') as 'people' | 'places';
  const toggle = (c: Contact) => {
    const cur = item[key(c.kind)] || [];
    onChange({ [key(c.kind)]: cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id] });
  };
  const submit = async () => {
    if (busy.current) return;
    if (!name.trim() || !adding) return setAdding(null);
    busy.current = true;
    try {
      const c = await addContact(name, adding, contacts);
      const cur = item[key(adding)] || [];
      if (!cur.includes(c.id)) onChange({ [key(adding)]: [...cur, c.id] });
      setName('');
      setAdding(null);
    } finally {
      busy.current = false;
    }
  };
  const row = (kind: Contact['kind'], list: Contact[], label: string) => (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-soft">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {list.map((c) => {
          const on = (item[key(kind)] || []).includes(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c)}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition active:scale-95 ${on ? 'bg-plum text-white shadow-soft' : 'bg-card text-ink/80'}`}
              aria-pressed={on}
              data-testid={`contact-${c.id}`}
            >
              {on && <Check size={13} strokeWidth={3} />}
              {kind === 'place' && !on && <MapPin size={12} />}
              {c.name}
            </button>
          );
        })}
        {adding === kind ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex items-center gap-1"
          >
            <input
              autoFocus
              className="input w-36 py-1.5 text-sm"
              placeholder={kind === 'person' ? 'Prénom' : 'Nom du bar, de la boîte…'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={submit}
              data-testid={`new-${kind}`}
            />
          </form>
        ) : (
          <button
            onClick={() => setAdding(kind)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-mauve px-3 py-1.5 text-sm text-plum"
            data-testid={`add-${kind}`}
          >
            <Plus size={13} /> {kind === 'person' ? 'Quelqu’un' : 'Un lieu'}
          </button>
        )}
      </div>
    </div>
  );
  return (
    <div className="anim-rise space-y-3 rounded-2xl bg-blush/50 p-3">
      {row('person', people, 'Avec qui ?')}
      {row('place', places, 'Où ?')}
      <input
        className="input py-2 text-sm"
        placeholder="Autre précision (facultatif)"
        defaultValue={item.detail || ''}
        onBlur={(e) => onChange({ detail: e.target.value.trim() || undefined })}
        aria-label="Précision"
      />
      <div className="flex gap-2">
        <button className="btn-soft px-3 py-1.5 text-xs" onClick={onRemove}>
          <X size={14} /> Retirer l'activité
        </button>
        <button className="btn-primary ml-auto px-4 py-1.5 text-xs" onClick={onDone} data-testid="with-done">
          OK
        </button>
      </div>
    </div>
  );
}

function MonthReview({
  month,
  setMonth,
  logs,
  trackers,
  contacts,
  focus,
  setFocus,
  selected,
  onPick,
  today,
}: {
  month: string;
  setMonth: (m: string) => void;
  logs: DayLog[];
  trackers: Tracker[];
  contacts: Contact[];
  focus: string | null;
  setFocus: (id: string | null) => void;
  selected: ISODate;
  onPick: (d: ISODate) => void;
  today: ISODate;
}) {
  const s = useMemo(() => monthJournal(logs, trackers, month, contacts), [logs, trackers, month, contacts]);
  const byDate = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs]);
  const gridStart = weekStart(monthStart(month));
  const days = range(gridStart, addDays(gridStart, 41));
  const mood = s.moodAvg ? MOODS[Math.round(s.moodAvg) - 1] : undefined;
  const pick = (id: string) => s.perTracker.find((p) => p.tracker.id === id);
  const highlight = [
    { label: 'Jours de sortie', value: s.perGroup.sorties },
    { label: 'Alcool', value: pick('tr-alcool')?.days },
    { label: 'Dérive', value: pick('tr-derive')?.days },
    { label: 'Hendaye', value: pick('tr-hendaye')?.days },
    { label: 'Règles', value: pick('tr-regles')?.days },
    { label: 'Ménage', value: pick('tr-menage')?.days },
    { label: 'Skincare', value: pick('tr-skincare')?.days },
  ].filter((h, i) => h.value !== undefined && (i < 3 || (h.value || 0) > 0));
  const maxDays = Math.max(1, ...s.perTracker.map((p) => p.days));

  return (
    <Section
      title={`Bilan de ${fmtMonth(month).split(' ')[0].toLowerCase()}`}
      action={
        <div className="flex">
          <button className="icon-btn h-9 w-9" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mois précédent">
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn h-9 w-9" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mois suivant">
            <ChevronRight size={18} />
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3">
          <div className="label">Humeur moyenne</div>
          <div className="mt-1 flex items-center gap-1.5 font-serif text-2xl font-semibold text-plum" data-testid="mood-avg">
            {mood ? (
              <>
                <MoodOrb color={mood.color} level={mood.value} size={22} /> <span className="italic">{mood.label}</span> <span className="font-sans text-xs font-normal text-soft">{String(s.moodAvg).replace('.', ',')}/5</span>
              </>
            ) : (
              '—'
            )}
          </div>
        </div>
        {highlight.map((h) => (
          <div key={h.label} className="card p-3">
            <div className="label">{h.label}</div>
            <div className="mt-1 font-serif text-2xl font-semibold text-plum" data-testid={`stat-${h.label}`}>
              {h.value} <span className="font-sans text-xs font-normal text-soft">jour{(h.value || 0) > 1 ? 's' : ''}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-3">
        <div className="grid grid-cols-7 pb-1 text-center">
          {WEEKDAYS_SHORT.map((w) => (
            <div key={w} className="label py-1 text-[10px]">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => {
            const l = byDate.get(d);
            const m = l?.mood ? MOODS[l.mood - 1] : undefined;
            const out = monthOf(d) !== month;
            const hit = focus && l?.items.some((i) => i.trackerId === focus || i.people?.includes(focus) || i.places?.includes(focus));
            const future = d > today;
            return (
              <button
                key={d}
                disabled={future}
                onClick={() => onPick(d)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs transition ${out ? 'opacity-30' : ''} ${
                  d === selected ? 'ring-2 ring-plum' : ''
                } ${focus && !hit ? 'opacity-25' : ''} ${future ? 'opacity-40' : ''}`}
                style={{ background: m ? `${m.color}${hit || !focus ? '' : '55'}` : 'rgb(var(--c-blush) / 0.5)', color: m && m.value >= 4 ? '#fff' : undefined }}
                aria-label={`${fmt(d, 'd MMMM')}${m ? ' · ' + m.label : ''}`}
              >
                <span className="font-semibold">{Number(d.slice(8))}</span>
                {l && l.items.length > 0 && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {l.items.slice(0, 3).map((i) => (
                      <span key={i.trackerId} className="h-1 w-1 rounded-full bg-current opacity-80" />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-soft">
          {MOODS.map((m) => (
            <span key={m.value} className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
              <span className="font-serif text-[13px] italic">{m.label}</span>
            </span>
          ))}
        </div>
      </div>

      {s.perContact.length > 0 && (
        <div className="card space-y-2 p-3">
          <div className="label">Avec qui et où</div>
          <div className="flex flex-wrap gap-1.5">
            {s.perContact.map(({ contact: c, days: n }) => (
              <button
                key={c.id}
                onClick={() => setFocus(focus === c.id ? null : c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${focus === c.id ? 'bg-plum text-white' : 'bg-blush/70 text-plum'}`}
                data-testid={`people-count-${c.id}`}
              >
                {c.kind === 'place' && <MapPin size={12} />}
                {c.name}
                <span className="font-semibold">{n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs text-soft">
          {s.daysLogged} jour{s.daysLogged > 1 ? 's' : ''} renseigné{s.daysLogged > 1 ? 's' : ''}. Touche une activité pour la voir dans le calendrier.
        </p>
        {s.perTracker.filter((p) => p.days > 0).map(({ tracker: t, days: n, details }) => {
          const top = topDetails(details);
          return (
            <button
              key={t.id}
              onClick={() => setFocus(focus === t.id ? null : t.id)}
              className={`w-full space-y-1 rounded-2xl px-3 py-2 text-left transition ${focus === t.id ? 'bg-card shadow-soft' : 'hover:bg-blush/40'} ${n ? '' : 'opacity-50'}`}
              data-testid={`count-${t.id}`}
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: t.color }}>
                  <Icon name={t.icon} size={14} />
                </span>
                <span className="flex-1">{t.name}</span>
                <span className="font-semibold text-plum">
                  {n} jour{n > 1 ? 's' : ''}
                </span>
              </div>
              {n > 0 && <Progress value={(n / maxDays) * 100} className="h-1.5" color={t.color} />}
              {top.length > 0 && <div className="text-[11px] text-soft">Le plus souvent : {top.map(([k, c]) => `${k} (${c})`).join(', ')}</div>}
            </button>
          );
        })}
      </div>
    </Section>
  );
}
