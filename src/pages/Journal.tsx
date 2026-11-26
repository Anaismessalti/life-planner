import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, ChevronLeft, ChevronRight, MapPin, Plus, Settings as Cog, Trash2, User } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Section, Segmented, toast } from '../components/ui';
import { create, db, upsert } from '../db/db';
import type { Contact, DayItem, DayLog, ISODate, Tracker } from '../db/types';
import { WEEKDAYS_SHORT, addDays, addMonths, capitalize, fmt, fmtMonth, isISODate, monthOf, monthStart, range, relativeDay, weekStart } from '../lib/dates';
import { eur, parseAmount } from '../lib/finance';
import { useToday } from '../lib/hooks';
import { COLORS, Icon } from '../lib/icons';
import { GROUP_LABEL, GROUP_ORDER, MOODS } from '../lib/journal';
import { FEELINGS, FEELING_BY_ID, FEELING_GROUPS, FORMS, formOf, setJournalExpense } from '../lib/lifeforms';
import { FiveMinuteCard, SleepCard } from './JournalWell';
import { navigate, useRoute } from '../lib/ui-store';
import { AnalyticsView } from './Analytics';

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

/**
 * Modifie la journée à partir de son état ENREGISTRÉ (et pas de l'écran) : les modifications rapides
 * s'enchaînent dans l'ordre, sans qu'un toucher n'efface le précédent.
 */
let chain: Promise<unknown> = Promise.resolve();
export function saveLog(date: ISODate, patch: Partial<DayLog> | ((cur: DayLog) => Partial<DayLog>)) {
  chain = chain
    .then(async () => {
      const found = await db.daylogs.get(date);
      const cur: DayLog = found && !found.deleted ? found : ({ id: date, date, items: [], createdAt: 0, updatedAt: 0 } as DayLog);
      const p = typeof patch === 'function' ? patch(cur) : patch;
      if (!Object.keys(p).length) return;
      const { createdAt: _c, updatedAt: _u, _ts, deleted: _d, ...rest } = cur;
      await upsert<DayLog>('daylogs', { ...rest, id: date, date, items: cur.items || [], ...p });
    })
    .catch((e) => console.error('Journal', e));
  return chain;
}

/** Petite perle de couleur, de plus en plus lumineuse avec l'humeur. */
export function MoodOrb({ color, level, size = 30 }: { color: string; level: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-full"
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
            className={`flex min-h-[64px] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-2 transition active:scale-95 ${on ? 'bg-card shadow-soft ring-2' : 'opacity-70 hover:opacity-100'}`}
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

/** États du jour : plusieurs à la fois, rangés par familles. Toucher une fois = léger, deux = moyen, trois = fort, quatre = retiré. */
export function FeelingsPicker({ date, value }: { date: ISODate; value?: DayLog['feelings'] }) {
  const cur = value || [];
  const [tab, setTab] = useState(FEELING_GROUPS[0].id);
  const tap = (id: string) =>
    saveLog(date, (log) => {
      const list = log.feelings || [];
      const f = list.find((x) => x.id === id);
      if (!f) return { feelings: [...list, { id, level: 1 }] };
      if (f.level >= 3) return { feelings: list.filter((x) => x.id !== id) };
      return { feelings: list.map((x) => (x.id === id ? { ...x, level: x.level + 1 } : x)) };
    });
  const chip = (f: (typeof FEELINGS)[number], testid: string) => {
    const on = cur.find((x) => x.id === f.id);
    return (
      <button
        key={f.id}
        onClick={() => tap(f.id)}
        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 transition active:scale-95 ${on ? 'text-white shadow-soft' : 'bg-blush/60 text-plum'} ${
          f.id === 'hendaye' ? 'text-[12px] font-semibold tracking-[0.12em]' : 'font-serif text-[15px] italic'
        }`}
        style={on ? { background: f.color } : undefined}
        aria-pressed={!!on}
        aria-label={`${f.label}${on ? `, intensité ${on.level} sur 3` : ''}`}
        data-testid={testid}
      >
        {f.label}
        {on && (
          <span className="flex gap-0.5" aria-hidden>
            {[1, 2, 3].map((i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full bg-white ${i <= on.level ? '' : 'opacity-30'}`} />
            ))}
          </span>
        )}
      </button>
    );
  };
  const selected = cur.map((c) => FEELING_BY_ID.get(c.id)).filter((f): f is (typeof FEELINGS)[number] => !!f && f.group !== tab);
  return (
    <div className="space-y-2" data-testid="feelings">
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
        {FEELING_GROUPS.map((g) => {
          const n = cur.filter((c) => FEELING_BY_ID.get(c.id)?.group === g.id).length;
          return (
            <button
              key={g.id}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${tab === g.id ? 'bg-plum text-white' : 'text-soft hover:text-plum'}`}
              onClick={() => setTab(g.id)}
              data-testid={`feelings-tab-${g.id}`}
            >
              {g.label}
              {n > 0 && <span className={`ml-1 ${tab === g.id ? 'text-white/80' : 'text-rasp'}`}>· {n}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">{FEELINGS.filter((f) => f.group === tab).map((f) => chip(f, `feeling-${f.id}`))}</div>
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2">
          <span className="text-[11px] text-soft">Aussi aujourd'hui :</span>
          {selected.map((f) => chip(f, `feeling-on-${f.id}`))}
        </div>
      )}
    </div>
  );
}

export function JournalPage() {
  const today = useToday();
  const { param } = useRoute();
  const [tab, setTab] = useState<'day' | 'stats'>(param === 'stats' ? 'stats' : 'day');
  const [date, setDate] = useState<ISODate>(isISODate(param) && param! <= today ? param! : today);
  const trackers = useTrackers();
  const contacts = useContacts();
  const logs = useDayLogs();
  const log = logs.find((l) => l.id === date);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (param === 'stats') setTab('stats');
    else if (isISODate(param) && param <= today) {
      setTab('day');
      setDate(param);
    }
  }, [param]);

  return (
    <div className="space-y-6" ref={topRef}>
      <header className="anim-rise flex items-start justify-between gap-3">
        <div>
          <p className="label">Mon journal</p>
          <h1 className="h-title text-4xl">{tab === 'day' ? 'Mes journées' : 'Life Analytics'}</h1>
        </div>
        <button className="icon-btn md:hidden" onClick={() => navigate('settings')} aria-label="Paramètres">
          <Cog size={20} />
        </button>
      </header>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'day', label: 'Ma journée' },
          { value: 'stats', label: 'Mes stats' },
        ]}
        className="w-full"
      />

      {tab === 'day' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
          <DayEditor date={date} setDate={setDate} today={today} log={log} trackers={trackers} contacts={contacts} />
          <MonthCalendar
            logs={logs}
            selected={date}
            today={today}
            onPick={(d) => {
              setDate(d);
              topRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </div>
      ) : (
        <AnalyticsView logs={logs} trackers={trackers} contacts={contacts} today={today} />
      )}
    </div>
  );
}

function itemSummary(it: DayItem, t: Tracker, names: Map<string, string>, amount?: number) {
  const spec = FORMS[formOf(t)];
  const bits: string[] = [];
  if (it.alone) bits.push('seule');
  bits.push(...[...(it.people || []), ...(it.places || [])].map((id) => names.get(id) || '').filter(Boolean));
  if (spec.level && it.level) bits.push(spec.level.options[it.level - 1]?.toLowerCase() || '');
  if (spec.pain && it.pain) bits.push(`douleurs ${spec.pain.options[it.pain]?.toLowerCase() || ''}`);
  if (it.tags?.length) bits.push(...it.tags.map((x) => x.toLowerCase()));
  if (amount) bits.push(eur(amount));
  if (it.detail) bits.push(it.detail);
  return bits.filter(Boolean).join(', ');
}

const OPEN_KEY = 'lp-journal-open-groups';
const DEFAULT_OPEN = ['sorties', 'moi', 'cycle', 'travail', 'maison', 'soin'];

function DayEditor({ date, setDate, today, log, trackers, contacts }: { date: ISODate; setDate: (d: ISODate) => void; today: ISODate; log?: DayLog; trackers: Tracker[]; contacts: Contact[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState(log?.text || '');
  const items = log?.items || [];
  const dayExpenses = useLiveQuery(() => db.expenses.where('date').equals(date).toArray(), [date], EMPTY);
  const amounts = useMemo(() => new Map(dayExpenses.filter((e) => !e.deleted && e.journal).map((e) => [e.journal!.trackerId, e.amount])), [dayExpenses]);
  // Texte du jour : enregistré après une courte pause, et TOUJOURS avant de changer de jour ou de page.
  const pending = useRef<{ date: ISODate; text: string } | null>(null);
  const flush = () => {
    const p = pending.current;
    pending.current = null;
    if (p) saveLog(p.date, { text: p.text.trim() ? p.text : undefined });
  };
  useEffect(() => {
    flush();
    setText(log?.text || '');
    setEditing(null);
  }, [date]);
  useEffect(() => {
    if (!pending.current) setText(log?.text || '');
  }, [log?.text]);
  useEffect(() => {
    if (!pending.current) return;
    const t = setTimeout(flush, 500);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    const v = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', v);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', v);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const toggle = (t: Tracker) => {
    const has = items.find((i) => i.trackerId === t.id);
    if (!has) {
      saveLog(date, (cur) => (cur.items.some((i) => i.trackerId === t.id) ? {} : { items: [...cur.items, { trackerId: t.id }] }));
      setEditing(t.id);
    } else setEditing(editing === t.id ? null : t.id);
  };
  const patchItem = (id: string, p: Partial<DayItem>) => saveLog(date, (cur) => ({ items: cur.items.map((i) => (i.trackerId === id ? { ...i, ...p } : i)) }));
  const names = useMemo(() => new Map(contacts.map((c) => [c.id, c.name])), [contacts]);
  const removeItem = async (t: Tracker) => {
    await saveLog(date, (cur) => ({ items: cur.items.filter((i) => i.trackerId !== t.id) }));
    await setJournalExpense(date, t, undefined, undefined, contacts);
    setEditing(null);
  };
  const [open, setOpen] = useState<string[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(OPEN_KEY) || 'null');
      if (Array.isArray(v)) return v;
    } catch {
      /* stockage indisponible : valeurs par défaut */
    }
    return DEFAULT_OPEN;
  });
  const isOpen = (g: string) => open.includes(g);
  const toggleGroup = (g: string) => {
    const next = isOpen(g) ? open.filter((x) => x !== g) : [...open, g];
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* rien */
    }
  };
  const countIn = (list: Tracker[]) => list.filter((t) => items.some((i) => i.trackerId === t.id)).length;
  const groups = GROUP_ORDER.map((g) => ({ g, list: trackers.filter((t) => (t.group || 'autres') === g) })).filter((x) => x.list.length);
  const filled = items.filter((i) => trackers.some((t) => t.id === i.trackerId)).length;

  return (
    <div className="card anim-rise space-y-5 p-4" data-testid="day-editor">
      <div className="flex items-center justify-between">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Jour précédent">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <div className="font-serif text-2xl font-semibold text-plum" data-testid="day-title">
            {relativeDay(date, today)}
          </div>
          <div className="text-xs text-soft">
            {capitalize(fmt(date, 'EEEE d MMMM yyyy'))}
            {filled > 0 && ` · ${filled} activité${filled > 1 ? 's' : ''}`}
          </div>
        </div>
        <button className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Jour suivant">
          <ChevronRight size={20} />
        </button>
      </div>
      {date < today && (
        <button className="mx-auto -mt-3 block text-xs text-rasp" onClick={() => setDate(today)}>
          Revenir à aujourd'hui
        </button>
      )}

      <div className="space-y-2">
        <div className="label">Mood of the day</div>
        <MoodPicker date={date} value={log?.mood} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <div className="label">Mes états du jour</div>
          <div className="text-[11px] text-soft">plusieurs possibles · retoucher = plus intense</div>
        </div>
        <FeelingsPicker date={date} value={log?.feelings} />
      </div>

      <SleepCard date={date} value={log?.sleep} />

      <FiveMinuteCard key={date} date={date} value={log?.fmj} today={today} />

      {groups.map(({ g, list }) => (
        <div key={g} className="space-y-2">
          <button className="flex w-full items-center justify-between gap-2 text-left" onClick={() => toggleGroup(g)} aria-expanded={isOpen(g)} data-testid={`group-${g}`}>
            <span className="label">
              {GROUP_LABEL[g]}
              {!isOpen(g) && countIn(list) > 0 && <span className="ml-1 normal-case tracking-normal text-rasp">· {countIn(list)}</span>}
            </span>
            <ChevronDown size={15} className={`text-soft transition ${isOpen(g) ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex flex-wrap gap-2">
            {list.filter((t) => isOpen(g) || items.some((i) => i.trackerId === t.id)).map((t) => {
              const it = items.find((i) => i.trackerId === t.id);
              const sum = it ? itemSummary(it, t, names, amounts.get(t.id)) : '';
              return (
                <button
                  key={t.id}
                  className={`chip min-h-[38px] ${it ? 'border-transparent text-white shadow-soft' : ''} ${editing === t.id ? 'ring-2 ring-plum ring-offset-1' : ''}`}
                  style={it ? { background: t.color } : undefined}
                  onClick={() => toggle(t)}
                  aria-pressed={!!it}
                  data-testid={`tracker-${t.id}`}
                >
                  <Icon name={t.icon} size={14} />
                  {t.name}
                  {sum && <span className="max-w-[13rem] truncate opacity-90">· {sum}</span>}
                </button>
              );
            })}
          </div>
          {editing && list.some((t) => t.id === editing) && items.some((i) => i.trackerId === editing) && (
            <ItemPanel
              key={`${date}-${editing}`}
              date={date}
              tracker={list.find((t) => t.id === editing)!}
              item={items.find((i) => i.trackerId === editing)!}
              amount={amounts.get(editing)}
              contacts={contacts}
              onChange={(p) => patchItem(editing, p)}
              onRemove={() => removeItem(list.find((t) => t.id === editing)!)}
              onDone={() => setEditing(null)}
            />
          )}
        </div>
      ))}

      <div className="space-y-2">
        <div className="label">En quelques mots</div>
        <textarea className="input min-h-[90px]" placeholder="Un souvenir, une pensée, ce qui t'a fait sourire…" value={text}
          onChange={(e) => {
            setText(e.target.value);
            pending.current = { date, text: e.target.value };
          }}
          onBlur={flush}
          aria-label="Texte du jour"
          data-testid="day-text"
        />
      </div>
      <p className="text-center text-xs text-soft">Enregistré automatiquement · tu peux compléter n'importe quel jour passé · activités modifiables dans Paramètres</p>
    </div>
  );
}

/** Les champs de l'activité : seulement ceux qui ont du sens pour elle (avec qui, lieu, dépense, symptômes…). */
function ItemPanel({
  date,
  tracker,
  item,
  amount,
  contacts,
  onChange,
  onRemove,
  onDone,
}: {
  date: ISODate;
  tracker: Tracker;
  item: DayItem;
  amount?: number;
  contacts: Contact[];
  onChange: (p: Partial<DayItem>) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  const spec = FORMS[formOf(tracker)];
  const [adding, setAdding] = useState<Contact['kind'] | null>(null);
  const [name, setName] = useState('');
  const fmtA = (a?: number) => (a ? String(a).replace('.', ',') : '');
  const [amountText, setAmountText] = useState(fmtA(amount));
  const busy = useRef(false);
  useEffect(() => setAmountText(fmtA(amount)), [amount]);
  const people = contacts.filter((c) => c.kind === 'person');
  const places = contacts.filter((c) => c.kind === 'place');
  const key = (k: Contact['kind']) => (k === 'person' ? 'people' : 'places') as 'people' | 'places';
  const toggle = (c: Contact) => {
    const cur = item[key(c.kind)] || [];
    onChange({ [key(c.kind)]: cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id], ...(c.kind === 'person' ? { alone: undefined } : {}) });
  };
  const submit = async () => {
    if (busy.current) return;
    if (!name.trim() || !adding) return setAdding(null);
    busy.current = true;
    try {
      const c = await addContact(name, adding, contacts);
      const cur = item[key(adding)] || [];
      if (!cur.includes(c.id)) onChange({ [key(adding)]: [...cur, c.id], ...(adding === 'person' ? { alone: undefined } : {}) });
      setName('');
      setAdding(null);
    } finally {
      busy.current = false;
    }
  };
  const saveAmount = async () => {
    const txt = amountText.trim();
    const v = txt ? parseAmount(txt) : undefined;
    if (txt && (v === undefined || v < 0)) {
      toast('Montant non reconnu (ex : 12,50)');
      return;
    }
    if ((v || undefined) === (amount || undefined)) return;
    await setJournalExpense(date, tracker, v, item, contacts);
    if (v) toast(`${eur(v)} ajoutés au budget (${tracker.name})`);
  };

  const pill = (on: boolean) => `inline-flex min-h-[34px] items-center gap-1 rounded-full px-3 py-1.5 text-sm transition active:scale-95 ${on ? 'bg-plum text-white shadow-soft' : 'bg-card text-ink/80'}`;
  const sub = 'text-[11px] font-medium uppercase tracking-wider text-soft';

  const row = (kind: Contact['kind'], list: Contact[], label: string) => (
    <div className="space-y-1.5">
      <div className={sub}>{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {kind === 'person' && spec.alone && (
          <button onClick={() => onChange({ alone: item.alone ? undefined : true, people: item.alone ? item.people : [] })} className={pill(!!item.alone)} aria-pressed={!!item.alone} data-testid="alone">
            <User size={13} /> Seule
          </button>
        )}
        {list.map((c) => {
          const on = (item[key(kind)] || []).includes(c.id);
          return (
            <button key={c.id} onClick={() => toggle(c)} className={pill(on)} aria-pressed={on} data-testid={`contact-${c.id}`}>
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
              className="input w-40 py-1.5"
              placeholder={kind === 'person' ? 'Prénom' : 'Nom du lieu'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={submit}
              data-testid={`new-${kind}`}
            />
          </form>
        ) : (
          <button onClick={() => setAdding(kind)} className="inline-flex min-h-[34px] items-center gap-1 rounded-full border border-dashed border-mauve px-3 py-1.5 text-sm text-plum" data-testid={`add-${kind}`}>
            <Plus size={13} /> {kind === 'person' ? 'Quelqu’un' : 'Un lieu'}
          </button>
        )}
      </div>
    </div>
  );
  const choice = (field: 'level' | 'pain', conf: { label: string; options: string[] }, offset: number) => (
    <div className="space-y-1.5">
      <div className={sub}>{conf.label}</div>
      <div className="flex flex-wrap gap-1.5">
        {conf.options.map((o, i) => {
          const v = i + offset;
          const on = item[field] === v;
          return (
            <button key={o} onClick={() => onChange({ [field]: on ? undefined : v })} className={pill(on)} aria-pressed={on} data-testid={`${field}-${v}`}>
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="anim-rise space-y-3 rounded-2xl bg-blush/50 p-3" data-testid="item-panel">
      {spec.people && row('person', people, 'Avec qui ?')}
      {spec.places && row('place', places, spec.placesLabel || 'Où ?')}
      {spec.level && choice('level', spec.level, 1)}
      {spec.pain && choice('pain', spec.pain, 0)}
      {spec.tags && (
        <div className="space-y-1.5">
          <div className={sub}>{spec.tags.label}</div>
          <div className="flex flex-wrap gap-1.5">
            {spec.tags.options.map((o) => {
              const on = (item.tags || []).includes(o);
              return (
                <button
                  key={o}
                  onClick={() => onChange({ tags: on ? (item.tags || []).filter((x) => x !== o) : [...(item.tags || []), o] })}
                  className={pill(on)}
                  aria-pressed={on}
                  data-testid={`tag-${o}`}
                >
                  {on && <Check size={12} strokeWidth={3} />}
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {spec.amount && (
        <div className="space-y-1.5">
          <div className={sub}>Dépense (ajoutée au budget)</div>
          <div className="flex items-center gap-2">
            <input
              className="input w-32"
              inputMode="decimal"
              placeholder="0,00 €"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              onBlur={saveAmount}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label="Dépense"
              data-testid="item-amount"
            />
            <span className="text-xs text-soft">{amount ? 'visible dans Budget → Variables' : 'facultatif'}</span>
          </div>
        </div>
      )}
      <input
        className="input py-2"
        placeholder={spec.comment}
        defaultValue={item.detail || ''}
        onBlur={(e) => onChange({ detail: e.target.value.trim() || undefined })}
        aria-label="Commentaire"
        data-testid="item-comment"
      />
      <div className="flex gap-2">
        <button className="btn-soft px-3 py-2 text-xs" onClick={onRemove} data-testid="item-remove">
          <Trash2 size={14} /> Retirer
        </button>
        <button className="btn-primary ml-auto px-5 py-2 text-xs" onClick={onDone} data-testid="with-done">
          OK
        </button>
      </div>
    </div>
  );
}

/** Calendrier du mois coloré par humeur : sert à choisir un jour à compléter ou à modifier. */
function MonthCalendar({ logs, selected, today, onPick }: { logs: DayLog[]; selected: ISODate; today: ISODate; onPick: (d: ISODate) => void }) {
  const [month, setMonth] = useState(monthOf(selected));
  useEffect(() => setMonth(monthOf(selected)), [selected]);
  const byDate = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs]);
  const gridStart = weekStart(monthStart(month));
  const days = range(gridStart, addDays(gridStart, 41));
  return (
    <Section
      title={fmtMonth(month)}
      action={
        <div className="flex">
          <button className="icon-btn h-10 w-10" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mois précédent">
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn h-10 w-10" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mois suivant">
            <ChevronRight size={18} />
          </button>
        </div>
      }
    >
      <div className="card p-3" data-testid="month-calendar">
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
            const future = d > today;
            const hend = l?.feelings?.some((f) => f.id === 'hendaye');
            return (
              <button
                key={d}
                disabled={future}
                onClick={() => onPick(d)}
                className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs transition ${out ? 'opacity-30' : ''} ${d === selected ? 'ring-2 ring-plum' : ''} ${future ? 'opacity-40' : ''}`}
                style={{ background: m ? m.color : 'rgb(var(--c-blush) / 0.5)', color: m && m.value >= 4 ? '#fff' : undefined }}
                aria-label={`${fmt(d, 'd MMMM')}${m ? ' · ' + m.label : ''}`}
                data-testid={`cal-${d}`}
              >
                <span className="font-semibold">{Number(d.slice(8))}</span>
                {hend && <span className="absolute right-1 top-0.5 text-[8px] font-bold">H</span>}
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
          <span className="inline-flex items-center gap-1">
            <span className="text-[9px] font-bold">H</span> HENDAYE
          </span>
        </div>
        <p className="mt-2 text-center text-[11px] text-soft">Touche un jour pour le compléter ou le modifier.</p>
      </div>
    </Section>
  );
}
