import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Settings as Cog, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Progress, Section } from '../components/ui';
import { db, upsert } from '../db/db';
import type { DayLog, ISODate, Tracker } from '../db/types';
import { WEEKDAYS_SHORT, addDays, addMonths, capitalize, fmt, fmtMonth, monthOf, monthStart, range, relativeDay, weekStart } from '../lib/dates';
import { useToday } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { GROUP_LABEL, MOODS, monthJournal, topDetails } from '../lib/journal';
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

export async function saveLog(date: ISODate, patch: Partial<DayLog>) {
  const cur = await db.daylogs.get(date);
  await upsert<DayLog>('daylogs', { id: date, date, items: cur && !cur.deleted ? cur.items : [], ...(cur && !cur.deleted ? { mood: cur.mood, text: cur.text } : {}), ...patch });
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
            <span className={size === 'sm' ? 'text-2xl' : 'text-3xl'}>{m.emoji}</span>
            <span className={`text-[10.5px] font-medium ${on ? 'text-plum' : 'text-soft'}`}>{m.label}</span>
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
        <DayEditor date={date} setDate={setDate} today={today} log={log} trackers={trackers} />
        <MonthReview
          month={month}
          setMonth={setMonth}
          logs={logs}
          trackers={trackers}
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

function DayEditor({ date, setDate, today, log, trackers }: { date: ISODate; setDate: (d: ISODate) => void; today: ISODate; log?: DayLog; trackers: Tracker[] }) {
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
  const setDetail = (id: string, detail: string) => saveLog(date, { items: items.map((i) => (i.trackerId === id ? { ...i, detail: detail || undefined } : i)) });
  const removeItem = (id: string) => {
    saveLog(date, { items: items.filter((i) => i.trackerId !== id) });
    setEditing(null);
  };
  const groups = (['sorties', 'moi', 'travail', 'autres'] as Tracker['group'][]).map((g) => ({ g, list: trackers.filter((t) => (t.group || 'autres') === g) })).filter((x) => x.list.length);

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
        <div className="label">Ma note du jour</div>
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
                  {it?.detail && <span className="opacity-85">· {it.detail}</span>}
                </button>
              );
            })}
          </div>
          {editing && list.some((t) => t.id === editing) && items.some((i) => i.trackerId === editing) && (
            <div className="anim-rise flex items-center gap-2 rounded-2xl bg-blush/50 p-2">
              <input
                autoFocus
                className="input py-2"
                placeholder="Avec qui ? Où ? (facultatif)"
                defaultValue={items.find((i) => i.trackerId === editing)?.detail || ''}
                onBlur={(e) => setDetail(editing, e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setDetail(editing, (e.target as HTMLInputElement).value.trim());
                    setEditing(null);
                  }
                }}
                data-testid="tracker-detail"
              />
              <button className="btn-soft shrink-0 px-3 py-2 text-xs" onClick={() => removeItem(editing)}>
                <X size={14} /> Retirer
              </button>
            </div>
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

function MonthReview({
  month,
  setMonth,
  logs,
  trackers,
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
  focus: string | null;
  setFocus: (id: string | null) => void;
  selected: ISODate;
  onPick: (d: ISODate) => void;
  today: ISODate;
}) {
  const s = useMemo(() => monthJournal(logs, trackers, month), [logs, trackers, month]);
  const byDate = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs]);
  const gridStart = weekStart(monthStart(month));
  const days = range(gridStart, addDays(gridStart, 41));
  const mood = s.moodAvg ? MOODS[Math.round(s.moodAvg) - 1] : undefined;
  const pick = (id: string) => s.perTracker.find((p) => p.tracker.id === id);
  const highlight = [
    { label: 'Jours de sortie', value: s.perGroup.sorties },
    { label: 'Alcool', value: pick('tr-alcool')?.days },
    { label: 'Dérive', value: pick('tr-derive')?.days },
  ].filter((h) => h.value !== undefined);
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
                <span>{mood.emoji}</span> {String(s.moodAvg).replace('.', ',')}
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
            const hit = focus && l?.items.some((i) => i.trackerId === focus);
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
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-soft">
          {s.daysLogged} jour{s.daysLogged > 1 ? 's' : ''} renseigné{s.daysLogged > 1 ? 's' : ''}. Touche une activité pour la voir dans le calendrier.
        </p>
        {s.perTracker.map(({ tracker: t, days: n, details }) => {
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
