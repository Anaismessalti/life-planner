// Sommeil, Five Minute Journal et respiration guidée, affichés dans « Ma journée ».
import { Moon, Sun, Wind } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DaySleep, FiveMinute, ISODate } from '../db/types';
import { FMJ_TOTAL, SLEEP_QUALITY, SLEEP_TAGS, fmjFilled, fmtDuration, hints, isHHmm, sleepMinutes } from '../lib/wellbeing';
import { saveLog } from './Journal';
import { GrowText } from '../components/ui';

/** La nuit qui précède ce jour : coucher, réveil, qualité. Tout se règle en un ou deux gestes. */
export function SleepCard({ date, value }: { date: ISODate; value?: DaySleep }) {
  const s = value || {};
  const mins = sleepMinutes(s);
  const patch = (p: Partial<DaySleep>) => saveLog(date, (cur) => ({ sleep: { ...(cur.sleep || {}), ...p } }));
  const setTime = (k: 'bed' | 'wake', v: string) => {
    if (!v) return patch({ [k]: undefined });
    if (isHHmm(v)) patch({ [k]: v });
  };
  const toggleTag = (t: string) => {
    const tags = s.tags || [];
    patch({ tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] });
  };
  return (
    <div className="space-y-3 rounded-2xl bg-blush/40 p-3" data-testid="sleep-card">
      <div className="flex items-baseline justify-between gap-2">
        <div className="label flex items-center gap-1.5">
          <Moon size={13} /> Sleep
        </div>
        <div className="font-serif text-lg font-semibold text-plum" data-testid="sleep-duration">
          {mins !== undefined ? fmtDuration(mins) : <span className="text-xs font-normal text-soft">ta nuit d'avant</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[11px] text-soft">Couchée à</span>
          <input type="time" step={300} className="input py-2" value={s.bed || ''} onChange={(e) => setTime('bed', e.target.value)} data-testid="sleep-bed" />
        </label>
        <label className="space-y-1">
          <span className="text-[11px] text-soft">Réveillée à</span>
          <input type="time" step={300} className="input py-2" value={s.wake || ''} onChange={(e) => setTime('wake', e.target.value)} data-testid="sleep-wake" />
        </label>
      </div>
      <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Qualité de la nuit">
        {SLEEP_QUALITY.map((q) => {
          const on = s.quality === q.value;
          return (
            <button
              key={q.value}
              role="radio"
              aria-checked={on}
              className={`min-h-[40px] rounded-xl px-1 font-serif text-[13px] italic leading-tight transition active:scale-95 ${on ? 'text-white shadow-soft' : 'bg-card text-plum'}`}
              style={on ? { background: q.color } : undefined}
              onClick={() => patch({ quality: on ? undefined : q.value })}
              data-testid={`sleep-q-${q.value}`}
            >
              {q.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SLEEP_TAGS.map((t) => {
          const on = s.tags?.includes(t);
          return (
            <button key={t} className={`chip min-h-[32px] py-1 text-xs ${on ? 'chip-on' : ''}`} onClick={() => toggleTag(t)} aria-pressed={!!on}>
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type FmjKey = 'grateful' | 'great' | 'amazing';

/** Five Minute Journal : le matin (gratitude, intentions, affirmation), le soir (3 belles choses, à améliorer). */
export function FiveMinuteCard({ date, value, today }: { date: ISODate; value?: FiveMinute; today: ISODate }) {
  const [f, setF] = useState<FiveMinute>(value || {});
  const [tab, setTab] = useState<'morning' | 'evening'>(() => (date < today || new Date().getHours() >= 17 ? 'evening' : 'morning'));
  const pending = useRef<FiveMinute | null>(null);
  const timer = useRef<number>();
  const h = hints(date);

  // Valeur venue d'un autre appareil : on la reprend seulement si rien n'est en cours de frappe.
  useEffect(() => {
    if (!pending.current) setF(value || {});
  }, [value]);

  const flush = () => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    saveLog(date, (cur) => ({ fmj: { ...(cur.fmj || {}), ...p } }));
  };
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, []);

  const set = (p: FiveMinute) => {
    setF((cur) => ({ ...cur, ...p }));
    pending.current = { ...(pending.current || {}), ...p };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 700);
  };
  const setLine = (k: FmjKey, i: number, v: string) => {
    const arr = [...(f[k] || ['', '', ''])];
    while (arr.length < 3) arr.push('');
    arr[i] = v;
    set({ [k]: arr });
  };
  const lines = (k: FmjKey, title: string, ph: string[]) => (
    <div className="space-y-1.5">
      <div className="font-serif text-[15px] italic text-plum">{title}</div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-4 shrink-0 text-right font-serif text-sm text-soft">{i + 1}.</span>
          <GrowText
            rows={1}
            className="py-2"
            value={f[k]?.[i] || ''}
            placeholder={ph[i]}
            onChange={(e) => setLine(k, i, e.target.value)}
            onBlur={flush}
            data-testid={`fmj-${k}-${i}`}
          />
        </div>
      ))}
    </div>
  );
  const n = fmjFilled(f);

  return (
    <div className="space-y-3 rounded-2xl border border-line/70 bg-card p-3" data-testid="fmj">
      <div className="flex items-center justify-between gap-2">
        <div className="label">Five Minute Journal</div>
        <div className="text-[11px] text-soft" data-testid="fmj-count">
          {n}/{FMJ_TOTAL}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-blush/60 p-1">
        {(
          [
            ['morning', 'Morning', Sun],
            ['evening', 'Evening', Moon],
          ] as const
        ).map(([k, label, I]) => (
          <button
            key={k}
            className={`flex min-h-[36px] items-center justify-center gap-1.5 rounded-full text-sm transition ${tab === k ? 'bg-card font-semibold text-plum shadow-soft' : 'text-soft'}`}
            onClick={() => {
              flush();
              setTab(k);
            }}
            data-testid={`fmj-tab-${k}`}
          >
            <I size={14} /> {label}
          </button>
        ))}
      </div>
      {tab === 'morning' ? (
        <div className="space-y-3">
          {lines('grateful', 'I am grateful for…', h.grateful)}
          {lines('great', 'What would make today great?', h.great)}
          <div className="space-y-1.5">
            <div className="font-serif text-[15px] italic text-plum">Daily affirmation · I am…</div>
            <GrowText rows={1} className="py-2" value={f.affirmation || ''} placeholder={h.affirmation} onChange={(e) => set({ affirmation: e.target.value })} onBlur={flush} data-testid="fmj-affirmation" />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {lines('amazing', 'Three amazing things that happened today', ['', '', ''])}
          <div className="space-y-1.5">
            <div className="font-serif text-[15px] italic text-plum">How could I have made today even better?</div>
            <GrowText rows={2} className="py-2" value={f.better || ''} onChange={(e) => set({ better: e.target.value })} onBlur={flush} data-testid="fmj-better" />
          </div>
        </div>
      )}
      <Breathe onDone={(min) => saveLog(date, (cur) => ({ fmj: { ...(cur.fmj || {}), ...(pending.current || {}), breathe: (cur.fmj?.breathe || 0) + min } }))} total={f.breathe || value?.breathe || 0} />
    </div>
  );
}

const PHASES = [
  { label: 'Inspire', s: 4, scale: 1 },
  { label: 'Retiens', s: 4, scale: 1 },
  { label: 'Expire', s: 6, scale: 0.55 },
];

/** Respiration guidée (4 s · 4 s · 6 s), 1 ou 3 minutes. Rien ne s'enregistre si on arrête avant la fin. */
export function Breathe({ onDone, total }: { onDone: (min: number) => void; total: number }) {
  const [run, setRun] = useState<{ min: number; end: number } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!run) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [run]);
  const left = run ? Math.max(0, run.end - Date.now()) : 0;
  useEffect(() => {
    if (run && left <= 0) {
      onDone(run.min);
      setRun(null);
    }
  }, [tick]);
  const elapsed = run ? run.min * 60000 - left : 0;
  const cycle = PHASES.reduce((a, p) => a + p.s, 0) * 1000;
  let t = elapsed % cycle;
  let phase = PHASES[0];
  for (const p of PHASES) {
    if (t < p.s * 1000) {
      phase = p;
      break;
    }
    t -= p.s * 1000;
  }
  if (!run)
    return (
      <div className="flex flex-wrap items-center gap-2 border-t border-line/60 pt-3">
        <Wind size={15} className="text-rasp" />
        <span className="flex-1 font-serif text-[15px] italic text-plum">Breathe</span>
        {[1, 3].map((m) => (
          <button key={m} className="chip min-h-[34px] py-1 text-xs" onClick={() => setRun({ min: m, end: Date.now() + m * 60000 })} data-testid={`breathe-${m}`}>
            {m} min
          </button>
        ))}
        {total > 0 && <span className="w-full text-[11px] text-soft">{total} min de respiration ce jour-là</span>}
      </div>
    );
  return (
    <div className="flex flex-col items-center gap-3 border-t border-line/60 py-4" data-testid="breathe-run">
      <div className="relative flex h-36 w-36 items-center justify-center">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #fff, #F5DFEC 40%, #C7A0C9 75%, #A83278)',
            transform: `scale(${elapsed < 300 ? 0.55 : phase.scale})`,
            transition: `transform ${phase.s}s ease-in-out`,
            opacity: 0.9,
          }}
        />
        <span className="relative font-serif text-lg italic text-plum">{phase.label}</span>
      </div>
      <div className="text-xs text-soft">
        {Math.ceil(left / 1000)} s ·{' '}
        <button className="text-rasp underline" onClick={() => setRun(null)}>
          arrêter
        </button>
      </div>
    </div>
  );
}

