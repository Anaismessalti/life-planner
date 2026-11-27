import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, MapPin, Share, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Progress, Section, Segmented, toast } from '../components/ui';
import { db } from '../db/db';
import type { Contact, DayLog, ISODate, Tracker, TrackerGroup } from '../db/types';
import { WEEKDAYS_SHORT, addDays, capitalize, diffDays, fmt, monthOf, range, weekStart } from '../lib/dates';
import { analyze, fmtPct, periodOf, shiftPeriod, trend, type Analytics, type Count, type PeriodKind } from '../lib/analytics';
import { eur, monthSummary } from '../lib/finance';
import { DEFAULT_HABITS, normalizeHabits, type HabitSetting } from '../lib/bridge';
import { useFinance, useSetting } from '../lib/hooks';
import { balance, buildReview, crossings, habitsOver, CROSS, REVIEW, type PoleStat, type Review } from '../lib/review';
import { Icon } from '../lib/icons';
import { GROUP_LABEL, GROUP_ORDER, MOODS } from '../lib/journal';
import { SLEEP_QUALITY, fmtDuration } from '../lib/wellbeing';
import { shareWrapped, wrappedCards } from '../lib/wrapped';
import { periodMoments } from '../lib/memories';
import { navigate } from '../lib/ui-store';

const EMPTY: never[] = [];

/** Anneau SVG : chaque part = une valeur. */
function Donut({ parts, size = 132, center }: { parts: { value: number; color: string; label: string }[]; size?: number; center?: ReactNode }) {
  const total = parts.reduce((a, b) => a + b.value, 0);
  const r = size / 2 - 12;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-blush))" strokeWidth={16} />
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => {
              const len = (p.value / total) * C;
              const el = (
                <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={16} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} />
              );
              acc += len;
              return el;
            })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{center}</div>
    </div>
  );
}

function Bars({ data, color = 'rgb(var(--c-rasp))', format = (v: number) => String(v), testid, partialLast }: { data: { label: string; value: number | null }[]; color?: string; format?: (v: number) => string; testid?: string; partialLast?: boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  return (
    <div className="flex h-36 items-end gap-1.5" data-testid={testid}>
      {data.map((d, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="text-[10px] font-semibold text-plum">{d.value === null ? '–' : d.value ? format(d.value) : '0'}</div>
          {d.value === null ? (
            <div className="h-[3px] w-full rounded-t-lg border-t border-dashed border-mauve" title="pas de données" />
          ) : (
            <div
              className={`w-full rounded-t-lg transition-all duration-700 ${partialLast && i === data.length - 1 ? 'border-2 border-dashed border-white/70' : ''}`}
              style={{ height: `${Math.max(3, (d.value / max) * 96)}px`, background: color, opacity: i === data.length - 1 ? 1 : 0.55 }}
            />
          )}
          <div className="max-w-full truncate text-[10px] text-soft">
            {d.label}
            {partialLast && i === data.length - 1 ? '*' : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Écart avec la période précédente, ramené au même nombre de jours renseignés (sinon un mois en cours paraît toujours « en baisse »). */
function Delta({ cur, prev, unit = 'j' }: { cur: number; prev: number | null; unit?: string }) {
  if (prev === null) return <span className="text-[10px] text-soft">pas de point de comparaison</span>;
  const d = Math.round(cur - prev);
  if (!d) return <span className="text-[10px] text-soft">comme d’habitude</span>;
  const up = d > 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-soft">
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}
      {String(d).replace('.', ',')}
      {unit} vs période préc.
    </span>
  );
}

const EXTRA_TILES: [string, string][] = [
  ['tr-date', 'Rencards'],
  ['tr-couple', 'En amoureux'],
  ['tr-famille', 'Famille'],
  ['tr-brunch', 'Brunchs'],
  ['tr-shopping', 'Shopping'],
  ['tr-malade', 'Malade'],
  ['tr-craquage', 'Craquages'],
  ['tr-nospend', 'No spend days'],
];
const trackerCount = (x: Analytics, id: string): Count => {
  const p = x.perTracker.find((r) => r.tracker.id === id);
  return { days: p?.days || 0, freq: p?.freq || 0 };
};

type Metric = { id: string; label: string; fn: (a: Analytics) => number | null; format?: (v: number) => string; color: string; days?: boolean };
const orNull = (v?: number) => (v === undefined ? null : v);

export function AnalyticsView({ logs, trackers, contacts, today }: { logs: DayLog[]; trackers: Tracker[]; contacts: Contact[]; today: ISODate }) {
  const [kind, setKind] = useState<PeriodKind>('month');
  const [anchor, setAnchor] = useState<ISODate>(today);
  const [group, setGroup] = useState<TrackerGroup | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [metricId, setMetricId] = useState('outings');
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], EMPTY);
  const finance = useFinance();
  const habitsRaw = useSetting<HabitSetting[]>('habits', DEFAULT_HABITS);
  const tasks = useLiveQuery(() => db.tasks.toArray(), [], EMPTY);
  const categories = useLiveQuery(() => db.categories.toArray(), [], EMPTY);
  const period = useMemo(() => periodOf(kind, anchor), [kind, anchor]);
  const agendaIn = useMemo(() => ({ tasks, categories }), [tasks, categories]);
  const a = useMemo(() => analyze(period, logs, trackers, contacts, expenses, today, group, agendaIn), [period, logs, trackers, contacts, expenses, today, group, agendaIn]);
  const prev = useMemo(() => analyze(shiftPeriod(period, -1), logs, trackers, contacts, expenses, today, group, agendaIn), [period, logs, trackers, contacts, expenses, today, group, agendaIn]);
  const history = useMemo(
    () => [1, 2, 3].map((i) => analyze(shiftPeriod(period, -i), logs, trackers, contacts, expenses, today, null, agendaIn)).filter((h) => h.elapsed > 0),
    [period, logs, trackers, contacts, expenses, today, agendaIn],
  );
  const review = useMemo(() => {
    const full = group ? analyze(period, logs, trackers, contacts, expenses, today, null, agendaIn) : a;
    const budget = period.kind === 'month' ? monthSummary(finance, monthOf(period.from), { today }).byCategory : undefined;
    return buildReview(full, history, { habits: habitsOver(full, normalizeHabits(habitsRaw)), budget });
  }, [a, group, period, logs, trackers, contacts, expenses, today, agendaIn, finance, history, habitsRaw]);
  const crossEnd = period.to < today ? period.to : today;
  const cross = useMemo(() => crossings(logs, trackers, crossEnd), [logs, trackers, crossEnd]);
  const poles = useMemo(() => balance(a, trackers, history), [a, trackers, history]);
  const isFuture = period.from > today;
  const inProgress = period.from <= today && period.to >= today;
  /** Rythme de la période précédente ramené aux jours renseignés de celle-ci. */
  const prorata = (prevDays: number) => (prev.logged >= 5 && a.logged > 0 ? (prevDays / prev.logged) * a.logged : null);
  const usedGroups = GROUP_ORDER.filter((g) => trackers.some((t) => t.group === g));

  const metrics: Metric[] = [
    { id: 'outings', label: 'Jours de sortie', fn: (x) => x.key.outings.days, color: '#A83278', days: true },
    { id: 'hendaye', label: 'HENDAYE', fn: (x) => x.key.hendaye.days, color: '#81265D', days: true },
    { id: 'mood', label: 'Humeur moyenne', fn: (x) => orNull(x.moodAvg), format: (v) => String(v).replace('.', ','), color: '#D46A8C' },
    { id: 'spent', label: 'Dépenses du journal', fn: (x) => x.spent.total, format: (v) => `${Math.round(v)}€`, color: '#C98A4B' },
    { id: 'work', label: 'Travail', fn: (x) => x.key.work.days, color: '#81265D', days: true },
    { id: 'sport', label: 'Sport', fn: (x) => x.key.sport.days, color: '#4E9A6A', days: true },
    { id: 'social', label: 'Avec mes proches', fn: (x) => x.key.social.days, color: '#8E6BB0', days: true },
    { id: 'score', label: 'Note des journées', fn: (x) => orNull(x.score.avg), format: (v) => `${String(v).replace('.', ',')}`, color: '#A83278' },
    { id: 'rated', label: 'Note des sorties', fn: (x) => orNull(x.rated.avg), format: (v) => `${String(v).replace('.', ',')}`, color: '#D46A8C' },
    { id: 'sleep', label: 'Sommeil moyen', fn: (x) => (x.sleep.avgMin === undefined ? null : Math.round((x.sleep.avgMin / 60) * 10) / 10), format: (v) => `${String(v).replace('.', ',')}h`, color: '#5B6FB5' },
    { id: 'fmj', label: 'Five Minute Journal', fn: (x) => x.fmj.days, color: '#E0789E', days: true },
    { id: 'completion', label: 'Journal rempli', fn: (x) => Math.round(x.completion * 100), format: (v) => `${v}%`, color: '#C7A0C9' },
  ];
  const focusTracker = trackers.find((t) => t.id === focus);
  const metric: Metric = focusTracker
    ? { id: focusTracker.id, label: focusTracker.name, fn: (x) => x.perTracker.find((p) => p.tracker.id === focusTracker.id)?.days || 0, color: focusTracker.color, days: true }
    : metrics.find((m) => m.id === metricId) || metrics[0];
  const series = useMemo(
    () =>
      trend(kind, anchor, kind === 'year' ? 4 : 6, (p) => {
        const x = analyze(p, logs, trackers, contacts, expenses, today, group);
        // Une période sans aucun jour renseigné n'est pas un zéro : c'est une absence de données.
        return x.logged === 0 && metric.id !== 'spent' ? null : metric.fn(x);
      }),
    [kind, anchor, metric.id, logs, trackers, contacts, expenses, today, group],
  );

  const tiles: { id: string; label: string; c: Count; p: Count; always?: boolean; dark?: boolean }[] = [
    { id: 'work', label: 'Jours travaillés', c: a.key.work, p: prev.key.work, always: true },
    { id: 'remote', label: 'Télétravail', c: a.key.remote, p: prev.key.remote },
    { id: 'outings', label: 'Jours de sortie', c: a.key.outings, p: prev.key.outings, always: true },
    { id: 'resto', label: 'Restos', c: a.key.resto, p: prev.key.resto },
    { id: 'cafe', label: 'Cafés', c: a.key.cafe, p: prev.key.cafe },
    { id: 'party', label: 'Soirées', c: a.key.party, p: prev.key.party },
    { id: 'rest', label: 'Repos', c: a.key.rest, p: prev.key.rest },
    { id: 'sport', label: 'Sport', c: a.key.sport, p: prev.key.sport },
    { id: 'hendaye', label: 'HENDAYE', c: a.key.hendaye, p: prev.key.hendaye, always: true, dark: true },
    { id: 'alcohol', label: 'Alcool', c: a.key.alcohol, p: prev.key.alcohol },
    { id: 'period', label: 'Règles', c: a.key.period, p: prev.key.period },
    { id: 'pms', label: 'SPM', c: a.key.pms, p: prev.key.pms },
    { id: 'social', label: 'Jours avec mes proches', c: a.key.social, p: prev.key.social },
    ...EXTRA_TILES.map(([id, label]) => ({ id, label, c: trackerCount(a, id), p: trackerCount(prev, id) })),
  ].filter((t) => t.always || t.c.days || t.p.days);

  const moodTop = a.dominantMood ? MOODS[a.dominantMood - 1] : undefined;

  return (
    <div className="space-y-6" data-testid="analytics">
      <div className="card space-y-3 p-3">
        <Segmented
          value={kind}
          onChange={(k) => setKind(k)}
          options={[
            { value: 'week', label: 'Semaine' },
            { value: 'month', label: 'Mois' },
            { value: 'year', label: 'Année' },
          ]}
          className="w-full"
        />
        <div className="flex items-center justify-between">
          <button className="icon-btn h-10 w-10" onClick={() => setAnchor(shiftPeriod(period, -1).from)} aria-label="Période précédente">
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <div className="font-serif text-xl font-semibold text-plum" data-testid="period-label">
              {period.label}
            </div>
            {period.to >= today && period.from <= today && <div className="text-[11px] text-soft">en cours · jusqu'à aujourd'hui</div>}
          </div>
          <button className="icon-btn h-10 w-10" onClick={() => setAnchor(shiftPeriod(period, 1).from)} disabled={shiftPeriod(period, 1).from > today} aria-label="Période suivante">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button className={`chip shrink-0 ${!group ? 'chip-on' : ''}`} onClick={() => setGroup(null)}>
            Tout
          </button>
          {usedGroups.map((g) => (
            <button key={g} className={`chip shrink-0 ${group === g ? 'chip-on' : ''}`} onClick={() => setGroup(group === g ? null : g)} data-testid={`filter-${g}`}>
              {GROUP_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      {isFuture ? (
        <p className="text-center text-sm text-soft">Cette période n'a pas encore commencé.</p>
      ) : (
        <>
          <PeriodMemories logs={logs} from={period.from} to={period.to < today ? period.to : today} />

          <ReviewCard r={review} />

          <Wrapped a={a} prev={prev} />

          <div className="card space-y-2 p-4" data-testid="completion">
            {a.elapsed < REVIEW.young ? (
              <>
                <div className="flex items-baseline justify-between">
                  <div className="label">Début de ton journal</div>
                  <div className="font-serif text-xl font-semibold text-plum">
                    Jour {a.elapsed} sur {REVIEW.young}
                  </div>
                </div>
                <Progress value={(a.elapsed / REVIEW.young) * 100} />
                <p className="text-[11px] leading-snug text-soft">
                  {a.logged} jour{a.logged > 1 ? 's' : ''} noté{a.logged > 1 ? 's' : ''}. Les pourcentages apparaîtront au {REVIEW.young}e jour : avant, « 1 jour sur 1 » ferait
                  toujours 100 % et ne dirait rien de ta vie.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <div className="label">Journal rempli</div>
                  <div className="font-serif text-xl font-semibold text-plum">
                    {a.logged}/{a.elapsed} jours · {fmtPct(a.completion)}
                  </div>
                </div>
                <Progress value={a.completion * 100} />
                <p className="text-[11px] leading-snug text-soft">
                  Un jour non renseigné n'est pas un jour « sans activité ». Les pourcentages se calculent sur les {a.elapsed} jours écoulés
                  {a.elapsed < diffDays(period.to < today ? period.to : today, period.from) + 1 ? ' depuis que tu utilises ton journal' : ''}.
                </p>
              </>
            )}
          </div>

          <Section title="L'essentiel">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.id} className={`card p-3 ${t.dark ? 'bg-plum text-white' : ''}`} data-testid={`tile-${t.id}`}>
                  <div className={`text-[11px] font-medium uppercase tracking-wider ${t.dark ? 'text-white/80' : 'text-soft'}`}>{t.label}</div>
                  <div className="mt-0.5 font-serif text-[28px] font-semibold leading-none" data-testid={`tile-${t.id}-days`}>
                    {t.c.days}
                    <span className={`ml-1 font-sans text-xs font-normal ${t.dark ? 'text-white/80' : 'text-soft'}`}>
                      jour{t.c.days > 1 ? 's' : ''}{a.elapsed >= REVIEW.young ? ` · ${fmtPct(t.c.freq)}` : ''}
                    </span>
                  </div>
                  <div className={t.dark ? '[&_*]:!text-white/80' : ''}>
                    <Delta cur={t.c.days} prev={prorata(t.p.days)} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-soft">
              « % » = part des jours écoulés où c'est arrivé (plusieurs activités par jour : le total ne fait pas 100 %). La comparaison se fait au même nombre de jours renseignés que la période précédente.
            </p>
          </Section>

          <Section title="Humeurs et états">
            <div className="card flex flex-wrap items-center gap-5 p-4">
              <Donut
                parts={a.moods.map((m) => ({ value: m.days, color: MOODS[m.value - 1].color, label: MOODS[m.value - 1].label }))}
                center={
                  moodTop ? (
                    <>
                      <span className="font-serif text-lg italic text-plum" data-testid="mood-dominant">
                        {moodTop.label}
                      </span>
                      <span className="text-[10px] text-soft">humeur dominante</span>
                    </>
                  ) : (
                    <span className="text-xs text-soft">pas encore de note</span>
                  )
                }
              />
              <div className="min-w-[9rem] flex-1 space-y-1">
                {a.moods
                  .slice()
                  .reverse()
                  .map((m) => (
                    <div key={m.value} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: MOODS[m.value - 1].color }} />
                      <span className="flex-1 font-serif italic">{MOODS[m.value - 1].label}</span>
                      <span className="text-soft">{m.days} j</span>
                    </div>
                  ))}
                {a.moodAvg && (
                  <div className="pt-1 text-xs text-soft" data-testid="mood-avg">
                    Moyenne {String(a.moodAvg).replace('.', ',')}/5 {prev.moodAvg ? `(préc. ${String(prev.moodAvg).replace('.', ',')})` : ''}
                  </div>
                )}
              </div>
            </div>
            {a.feelings.length > 0 && (
              <div className="card space-y-1.5 p-3">
                <div className="label">États les plus fréquents</div>
                {a.feelings.slice(0, 8).map((f) => (
                  <div key={f.id} className="flex items-center gap-2 text-sm" data-testid={`feeling-stat-${f.id}`}>
                    <span className={`w-28 shrink-0 truncate ${f.id === 'hendaye' ? 'text-xs font-semibold tracking-widest' : 'font-serif italic'}`}>{f.label}</span>
                    <div className="flex-1">
                      <Progress value={(f.days / Math.max(1, a.elapsed)) * 100} color={f.color} className="h-1.5" />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs text-soft">
                      {f.days} j · int. {String(f.avgLevel).replace('.', ',')}/3
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {(a.score.days > 0 || a.rated.count > 0) && <RatingsSection a={a} prev={prev} />}

          <WellbeingSections a={a} prev={prev} />

          <Section title="Calendrier">
            <Heatmap a={a} today={today} focus={focus} trackers={trackers} />
            {focusTracker && (
              <button className="text-xs text-rasp" onClick={() => setFocus(null)}>
                Afficher les humeurs (au lieu de « {focusTracker.name} »)
              </button>
            )}
          </Section>

          <Section title="Tendances">
            <div className="card space-y-3 p-3">
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {metrics.map((m) => (
                  <button
                    key={m.id}
                    className={`chip shrink-0 ${!focusTracker && metric.id === m.id ? 'chip-on' : ''}`}
                    onClick={() => {
                      setFocus(null);
                      setMetricId(m.id);
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <Bars data={series} color={metric.color} format={metric.format} testid="trend" partialLast={inProgress} />
              <p className="text-[11px] text-soft">
                {metric.label} sur les {series.length} dernières périodes{metric.days ? ' (en jours)' : ''}. « – » : aucune donnée sur la période.
                {inProgress ? ' * période en cours, pas encore complète.' : ''}
              </p>
            </div>
          </Section>

          {a.logged > 0 && <BalanceSection poles={poles} logged={a.logged} />}

          {cross.length > 0 && (
            <Section title="Ce que je remarque">
              <div className="card space-y-2 p-3" data-testid="crossings">
                {cross.map((c) => (
                  <p key={c.id} className="rounded-xl bg-blush/50 px-3 py-2 text-sm text-plum">
                    {c.text}
                  </p>
                ))}
                <p className="text-[11px] text-soft">
                  Sur tes {CROSS.days} derniers jours, seulement quand l'écart est net et qu'il y a au moins 8 jours de chaque côté. Ce sont des observations, pas des causes : un jour de sport est peut-être aussi un jour où tu avais plus de temps.
                </p>
              </div>
            </Section>
          )}

          <Section title="Activité par activité">
            <div className="card divide-y divide-line/70 px-3 py-1">
              <div className="flex items-center gap-2 py-1.5 text-[10px] uppercase tracking-wider text-soft">
                <span className="flex-1">Activité</span>
                <span className="w-12 text-right">jours</span>
                <span className="w-14 text-right">% jours</span>
              </div>
              {a.perTracker
                .filter((p) => p.days > 0)
                .map((p) => (
                  <button
                    key={p.tracker.id}
                    onClick={() => setFocus(focus === p.tracker.id ? null : p.tracker.id)}
                    className={`flex w-full items-center gap-2 py-2 text-left text-sm ${focus === p.tracker.id ? 'font-semibold text-rasp' : ''}`}
                    data-testid={`row-${p.tracker.id}`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: p.tracker.color }}>
                      <Icon name={p.tracker.icon} size={12} />
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.tracker.name}
                      {p.spent > 0 && <span className="ml-1 text-xs font-normal text-soft">· {eur(p.spent)}</span>}
                    </span>
                    <span className="w-12 text-right">{p.days}</span>
                    <span className="w-14 text-right text-soft">{a.elapsed >= REVIEW.young ? fmtPct(p.freq) : ''}</span>
                  </button>
                ))}
              {a.totalActivities === 0 && <p className="py-3 text-center text-sm text-soft">Aucune activité sur cette période.</p>}
            </div>
            <p className="text-[11px] text-soft">Touche une activité pour la voir dans le calendrier et dans les tendances.</p>
          </Section>

          {(a.people.length > 0 || a.places.length > 0) && (
            <Section title="Mon monde">
              <div className="grid gap-3 sm:grid-cols-2">
                {a.people.length > 0 && (
                  <div className="card space-y-1.5 p-3">
                    <div className="label">Les personnes que j'ai le plus vues</div>
                    {a.people.slice(0, 8).map(({ contact: c, days }) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm" data-testid={`people-count-${c.id}`}>
                        <span className="w-20 shrink-0 truncate">{c.name}</span>
                        <div className="flex-1">
                          <Progress value={(days / a.people[0].days) * 100} color={c.color} className="h-1.5" />
                        </div>
                        <span className="w-10 text-right font-semibold text-plum">{days} j</span>
                      </div>
                    ))}
                    <p className="pt-1 text-[11px] text-soft">
                      Vie sociale : {a.key.social.days} jour{a.key.social.days > 1 ? 's' : ''} avec au moins une personne{a.elapsed >= REVIEW.young ? ` (${fmtPct(a.key.social.freq)} des jours)` : ''}.
                    </p>
                  </div>
                )}
                {a.places.length > 0 && (
                  <div className="card space-y-1.5 p-3">
                    <div className="label">Mes lieux</div>
                    {a.places.slice(0, 8).map(({ contact: c, days }) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm" data-testid={`place-count-${c.id}`}>
                        <MapPin size={12} className="shrink-0 text-soft" />
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        <span className="font-semibold text-plum">{days} j</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}

          {(a.symptoms.pms.length > 0 || a.symptoms.period.length > 0 || a.key.period.days > 0) && (
            <Section title="Mon cycle">
              <div className="card space-y-2 p-3 text-sm">
                <div>
                  Règles : <b>{a.key.period.days}</b> jour{a.key.period.days > 1 ? 's' : ''} · SPM : <b>{a.key.pms.days}</b> jour{a.key.pms.days > 1 ? 's' : ''}
                </div>
                {a.symptoms.pms.length > 0 && (
                  <div>
                    <div className="label">Symptômes prémenstruels</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {a.symptoms.pms.map(([s, n]) => (
                        <span key={s} className="rounded-full bg-blush/70 px-2.5 py-1 text-xs text-plum">
                          {s} · {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {a.symptoms.period.length > 0 && (
                  <div>
                    <div className="label">Pendant les règles</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {a.symptoms.period.map(([s, n]) => (
                        <span key={s} className="rounded-full bg-blush/70 px-2.5 py-1 text-xs text-plum">
                          {s} · {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {a.agenda && a.agenda.events + a.agenda.tasks + a.agenda.upcoming > 0 && <AgendaSection a={a} />}

          {a.spent.total > 0 && (
            <Section title="Dépenses de mes journées">
              <div className="card space-y-1.5 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-soft">Total saisi depuis le journal</span>
                  <span className="font-serif text-2xl font-semibold text-plum" data-testid="spent-total">
                    {eur(a.spent.total)}
                  </span>
                </div>
                {a.spent.byTracker.map((s) => (
                  <div key={s.tracker.id} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.tracker.color }} />
                    <span className="flex-1">{s.tracker.name}</span>
                    <span>{eur(s.amount)}</span>
                  </div>
                ))}
                <p className="pt-1 text-[11px] text-soft">Ces montants sont déjà comptés dans ton Budget (une seule fois). Précédente période : {eur(prev.spent.total)}.</p>
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

/** Calendrier de chaleur : couleur = humeur, ou présence de l'activité choisie. */
function Heatmap({ a, today, focus, trackers }: { a: Analytics; today: ISODate; focus: string | null; trackers: Tracker[] }) {
  const t = trackers.find((x) => x.id === focus);
  const color = (d: ISODate) => {
    if (d > today) return 'transparent';
    const l = a.byDate.get(d);
    if (t) return l?.items.some((i) => i.trackerId === t.id) ? t.color : 'rgb(var(--c-blush) / 0.6)';
    return l?.mood ? MOODS[l.mood - 1].color : 'rgb(var(--c-blush) / 0.6)';
  };
  const legend = (
    <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-soft">
      {t ? (
        <span className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} /> {t.name}
        </span>
      ) : (
        MOODS.map((m) => (
          <span key={m.value} className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
            <span className="font-serif italic">{m.label}</span>
          </span>
        ))
      )}
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-blush" /> non renseigné
      </span>
    </div>
  );
  if (a.period.kind === 'year') {
    const y = a.period.from.slice(0, 4);
    return (
      <div className="card overflow-x-auto p-3" data-testid="heatmap">
        <div className="min-w-[300px] space-y-[3px]">
          {Array.from({ length: 12 }, (_, m) => {
            const mm = String(m + 1).padStart(2, '0');
            return (
              <div key={m} className="flex items-center gap-[3px]">
                <span className="w-7 shrink-0 text-[9px] text-soft">{fmt(`${y}-${mm}-01`, 'MMM')}</span>
                {Array.from({ length: 31 }, (_, d) => {
                  const iso = `${y}-${mm}-${String(d + 1).padStart(2, '0')}`;
                  const valid = monthOf(iso) === `${y}-${mm}` && d + 1 <= new Date(Number(y), m + 1, 0).getDate();
                  return <span key={d} className="aspect-square flex-1 rounded-[3px]" style={{ background: valid ? color(iso) : 'transparent' }} title={valid ? iso : undefined} />;
                })}
              </div>
            );
          })}
        </div>
        {legend}
      </div>
    );
  }
  const start = weekStart(a.period.from);
  const end = a.period.kind === 'week' ? addDays(start, 6) : addDays(weekStart(a.period.to), 6);
  const days = range(start, end);
  return (
    <div className="card p-3" data-testid="heatmap">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center">
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="label text-[10px]">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const inside = d >= a.period.from && d <= a.period.to;
          const hend = a.byDate.get(d)?.feelings?.some((f) => f.id === 'hendaye');
          return (
            <div
              key={d}
              className={`relative flex aspect-square items-center justify-center rounded-lg text-[11px] ${inside ? '' : 'opacity-20'}`}
              style={{ background: color(d), color: '#fff' }}
              title={d}
            >
              <span className="font-semibold mix-blend-luminosity">{Number(d.slice(8))}</span>
              {hend && !t && <span className="absolute right-0.5 top-0 text-[7px] font-bold">H</span>}
            </div>
          );
        })}
      </div>
      {legend}
    </div>
  );
}

/** « Wrapped » de la période : quelques cartes à faire défiler, façon story, et une image à partager. */
function Wrapped({ a, prev }: { a: Analytics; prev: Analytics }) {
  const cards = wrappedCards(a, prev);
  const [busy, setBusy] = useState(false);
  if (!cards.length) return null;
  const share = async () => {
    setBusy(true);
    try {
      const r = await shareWrapped(cards, a.period.label);
      if (r === 'downloaded') toast('Image enregistrée dans tes téléchargements');
    } catch {
      toast("L'image n'a pas pu être créée sur cet appareil");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0" data-testid="wrapped">
        {cards.map((c) => (
          <div key={c.k} className="flex h-44 w-[72%] shrink-0 snap-center flex-col justify-end rounded-3xl p-5 text-white shadow-lift sm:w-64" style={{ background: `linear-gradient(140deg,${c.from},${c.to})` }}>
            <div className={`line-clamp-3 font-serif font-semibold leading-tight ${c.big.length > 28 ? 'text-[21px]' : 'text-[30px]'} ${c.italic ? 'italic' : ''}`}>{c.big}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.14em] text-white/80">{c.small}</div>
          </div>
        ))}
      </div>
      <button className="btn-soft mx-auto flex items-center gap-2" onClick={share} disabled={busy} data-testid="wrapped-share">
        <Share size={15} /> {busy ? 'Création de l’image…' : 'Partager mon Wrapped'}
      </button>
    </div>
  );
}

/** Les bilans commencent par les souvenirs : moments forts et photos de la période. */
function PeriodMemories({ logs, from, to }: { logs: DayLog[]; from: ISODate; to: ISODate }) {
  const moments = useMemo(() => periodMoments(logs, from, to), [logs, from, to]);
  const photos = useLiveQuery(async () => (await db.photos.where('date').between(from, to, true, true).toArray()).filter((p) => !p.deleted).sort((a, b) => a.date.localeCompare(b.date)), [from, to]);
  if (!moments.length && !photos?.length) return null;
  return (
    <Section title="Mes plus beaux moments">
      <div className="space-y-3" data-testid="period-memories">
        {photos && photos.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {photos.map((p) => (
              <button key={p.id} className="shrink-0" onClick={() => navigate('journal', p.date)}>
                <img src={p.data} alt={`Photo du ${p.date}`} className="h-28 w-28 rounded-2xl object-cover" />
              </button>
            ))}
          </div>
        )}
        {moments.slice(0, 6).map((m) => (
          <button key={m.date} className="flex w-full gap-3 text-left" onClick={() => navigate('journal', m.date)}>
            <span className="w-14 shrink-0 pt-0.5 text-xs text-soft">{fmt(m.date, 'EEE d')}</span>
            <span className="min-w-0">
              <span className="block font-serif text-[17px] italic leading-snug text-plum">{m.title || m.highlight}</span>
              {m.title && m.highlight && <span className="block text-sm text-soft">{m.highlight}</span>}
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}

const n1 = (v?: number) => (v === undefined ? '–' : String(v).replace('.', ','));

/** Sommeil et Five Minute Journal. */
function WellbeingSections({ a, prev }: { a: Analytics; prev: Analytics }) {
  const s = a.sleep;
  const f = a.fmj;
  return (
    <>
      {s.nights > 0 && (
        <Section title="Mon sommeil">
          <div className="card space-y-3 p-4" data-testid="sleep-stats">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-serif text-2xl font-semibold text-plum" data-testid="sleep-avg">
                  {fmtDuration(s.avgMin)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-soft">par nuit</div>
              </div>
              <div>
                <div className="font-serif text-2xl font-semibold text-plum">{s.bedtime || '–'}</div>
                <div className="text-[10px] uppercase tracking-wider text-soft">coucher moyen</div>
              </div>
              <div>
                <div className="font-serif text-2xl font-semibold text-plum" data-testid="sleep-short">
                  {s.short}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-soft">nuits &lt; 7 h</div>
              </div>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-blush">
              {s.quality.map((q) =>
                q.nights ? <div key={q.value} style={{ width: `${(q.nights / Math.max(1, s.quality.reduce((n, x) => n + x.nights, 0))) * 100}%`, background: SLEEP_QUALITY[q.value - 1].color }} /> : null,
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-soft">
              {s.quality.map((q) => (
                <span key={q.value} className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: SLEEP_QUALITY[q.value - 1].color }} />
                  <span className="font-serif italic">{SLEEP_QUALITY[q.value - 1].label}</span> {q.nights}
                </span>
              ))}
            </div>
            {s.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {s.tags.map(([t, n]) => (
                  <span key={t} className="rounded-full bg-blush/70 px-2.5 py-1 text-xs text-plum">
                    {t} · {n}
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-soft">
              {s.nights} nuit{s.nights > 1 ? 's' : ''} notée{s.nights > 1 ? 's' : ''}
              {s.avgQuality ? ` · qualité ${n1(s.avgQuality)}/4` : ''}
              {prev.sleep.avgMin ? ` · période préc. ${fmtDuration(prev.sleep.avgMin)}` : ''}. La nuit compte pour le jour où tu te réveilles.
            </p>
          </div>
        </Section>
      )}
      {f.days > 0 && (
        <Section title="Five Minute Journal">
          <div className="card space-y-3 p-4" data-testid="fmj-stats">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-serif text-2xl font-semibold text-plum" data-testid="fmj-days">
                  {f.days}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-soft">jours{a.elapsed >= REVIEW.young ? ` · ${fmtPct(f.days / Math.max(1, a.elapsed))}` : ''}</div>
              </div>
              <div>
                <div className="font-serif text-2xl font-semibold text-plum">{f.gratitudes}</div>
                <div className="text-[10px] uppercase tracking-wider text-soft">gratitudes</div>
              </div>
              <div>
                <div className="font-serif text-2xl font-semibold text-plum">{f.breathe}</div>
                <div className="text-[10px] uppercase tracking-wider text-soft">min à respirer</div>
              </div>
            </div>
            <p className="text-[11px] text-soft">
              Morning {f.mornings} fois · Evening {f.evenings} fois
            </p>
            {f.recent.length > 0 && (
              <div className="space-y-1.5 border-t border-line/60 pt-2">
                <div className="label">Petits bonheurs</div>
                {f.recent.map((r, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="w-12 shrink-0 text-[11px] text-soft">{fmt(r.date, 'd MMM')}</span>
                    <span className="font-serif italic text-plum">{r.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}
    </>
  );
}

/** Ce que j'ai vécu de mon agenda : seuls les rendez-vous qui ont eu lieu comptent. */
function AgendaSection({ a }: { a: Analytics }) {
  const g = a.agenda!;
  const lost = g.cancelled + g.noshow;
  return (
    <Section title="Mon agenda">
      <div className="card space-y-3 p-4" data-testid="agenda-stats">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="font-serif text-2xl font-semibold text-plum" data-testid="agenda-events">
              {g.events}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-soft">rendez-vous vécus</div>
          </div>
          <div>
            <div className="font-serif text-2xl font-semibold text-plum" data-testid="agenda-done">
              {g.done}/{g.tasks}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-soft">tâches faites</div>
          </div>
          <div>
            <div className="font-serif text-2xl font-semibold text-plum">{g.upcoming}</div>
            <div className="text-[10px] uppercase tracking-wider text-soft">à venir</div>
          </div>
        </div>
        {g.tasks > 0 && <Progress value={g.doneRate * 100} />}
        <p className="text-[11px] leading-snug text-soft" data-testid="agenda-detail">
          {g.planned} rendez-vous prévus : {g.events} ont eu lieu
          {lost ? `, ${g.cancelled} annulé${g.cancelled > 1 ? 's' : ''}, ${g.noshow} pas honoré${g.noshow > 1 ? 's' : ''}` : ''}
          {g.unconfirmed ? `, ${g.unconfirmed} à confirmer (pas encore comptés)` : ''}.
          {g.tasks > 0 ? ` ${fmtPct(g.doneRate)} des tâches prévues jusqu'à aujourd'hui sont faites${g.doneLate ? `, dont ${g.doneLate} après un report` : ''}.` : ''}
          {g.dropped ? ` ${g.dropped} retirée${g.dropped > 1 ? 's' : ''} car plus nécessaire${g.dropped > 1 ? 's' : ''} (non comptée${g.dropped > 1 ? 's' : ''}).` : ''} Une tâche reportée compte pour le jour où elle était prévue au départ.
        </p>
        {g.byCategory.length > 0 && (
          <div className="space-y-1.5 border-t border-line/60 pt-2">
            {g.byCategory.slice(0, 8).map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-xs text-soft">
                  {c.events ? `${c.events} rdv` : ''}
                  {c.events && c.tasks ? ' · ' : ''}
                  {c.tasks ? `${c.tasks} tâche${c.tasks > 1 ? 's' : ''}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        {g.moodWithEvents !== undefined && g.moodWithout !== undefined && (
          <p className="rounded-xl bg-blush/50 px-3 py-2 text-xs text-plum" data-testid="agenda-mood">
            Humeur moyenne les jours avec un rendez-vous vécu : <b>{n1(g.moodWithEvents)}/5</b> ({g.moodWithN} j) · sans : <b>{n1(g.moodWithout)}/5</b> ({g.moodWithoutN} j). Une observation, pas une cause.
          </p>
        )}
      </div>
    </Section>
  );
}

/** Mon mois en bref : quatre blocs courts, des phrases plutôt que des chiffres. */
function ReviewCard({ r }: { r: Review }) {
  const blocks: [string, string[], string][] = [
    ['Comment je l’ai vécu', r.lived, 'review-lived'],
    ['Ce que j’ai accompli', r.done, 'review-done'],
    ['Ce que j’ai laissé de côté', r.aside, 'review-aside'],
    ['Mon argent', r.money, 'review-money'],
    ['Des pistes', r.ideas, 'review-ideas'],
  ];
  const any = blocks.some(([, l]) => l.length);
  return (
    <div className="card space-y-3 p-4" data-testid="review">
      <div>
        <div className="font-serif text-2xl font-semibold text-plum">{r.title}</div>
        {r.coverage.text && (
          <p className={`mt-0.5 text-xs ${r.coverage.partial ? 'text-rasp' : 'text-soft'}`} data-testid="review-coverage">
            {r.coverage.text}
          </p>
        )}
      </div>
      {!any && <p className="text-sm text-soft">Pas encore assez de jours notés pour un bilan. Reviens dans quelques jours.</p>}
      {blocks.map(([title, lines, id]) =>
        lines.length ? (
          <div key={id} className="space-y-1" data-testid={id}>
            <div className="label">{title}</div>
            {lines.map((l, i) => (
              <p key={i} className="text-sm leading-snug">
                {l}
              </p>
            ))}
          </div>
        ) : null,
      )}
    </div>
  );
}

/** Équilibre : quatre pôles en part des jours renseignés, avec le repère habituel. */
function BalanceSection({ poles, logged }: { poles: PoleStat[]; logged: number }) {
  return (
    <Section title="Mon équilibre">
      <div className="card space-y-2.5 p-3" data-testid="balance">
        {poles.map((p) => (
          <div key={p.id} className="space-y-1" data-testid={`pole-${p.id}`}>
            <div className="flex items-baseline justify-between text-sm">
              <span>{p.label}</span>
              <span className="text-xs text-soft">
                {p.days} j · {fmtPct(p.share)}
                {p.usual !== undefined ? ` · d'habitude ${fmtPct(p.usual)}` : ''}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-blush">
              <div className="h-2 rounded-full" style={{ width: `${Math.min(100, p.share * 100)}%`, background: p.color }} />
              {p.usual !== undefined && <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-plum" style={{ left: `${Math.min(100, p.usual * 100)}%` }} title="d'habitude" />}
            </div>
          </div>
        ))}
        <p className="text-[11px] text-soft">
          Part de tes {logged} jours renseignés où chaque pôle apparaît au moins une fois. Le trait indique ton habitude (médiane des 3 périodes précédentes). Pas de note globale : c'est à toi de voir ce qui te convient.
        </p>
      </div>
    </Section>
  );
}

/** Mes notes : la journée sur 10 et chaque sortie notée. */
function RatingsSection({ a, prev }: { a: Analytics; prev: Analytics }) {
  return (
    <Section title="Mes notes">
      <div className="card space-y-3 p-4" data-testid="ratings">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div>
            <div className="font-serif text-3xl font-semibold text-plum" data-testid="score-avg">
              {a.score.avg !== undefined ? `${n1(a.score.avg)}/10` : '–'}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-soft">
              mes journées · {a.score.days} notée{a.score.days > 1 ? 's' : ''}
            </div>
            {prev.score.avg !== undefined && <div className="text-[10px] text-soft">préc. {n1(prev.score.avg)}/10</div>}
          </div>
          <div>
            <div className="font-serif text-3xl font-semibold text-plum" data-testid="rated-avg">
              {a.rated.avg !== undefined ? `${n1(a.rated.avg)}/10` : '–'}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-soft">
              mes sorties · {a.rated.count} notée{a.rated.count > 1 ? 's' : ''}
            </div>
            {prev.rated.avg !== undefined && <div className="text-[10px] text-soft">préc. {n1(prev.rated.avg)}/10</div>}
          </div>
        </div>
        {a.score.best.length > 0 && (
          <div className="space-y-1 border-t border-line/60 pt-2">
            <div className="label">Mes plus belles journées</div>
            {a.score.best.map((b) => (
              <div key={b.date} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{capitalize(fmt(b.date, 'EEEE d MMMM'))}</span>
                <span className="font-serif font-semibold text-plum">{b.score}/10</span>
              </div>
            ))}
          </div>
        )}
        {a.rated.top.length > 0 && (
          <div className="space-y-1 border-t border-line/60 pt-2" data-testid="rated-top">
            <div className="label">Mes meilleures sorties</div>
            {a.rated.top.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: r.tracker.color }}>
                  <Icon name={r.tracker.icon} size={12} />
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {r.tracker.name}
                  {r.with.length ? ` · ${r.with.join(', ')}` : ''}
                  <span className="text-xs text-soft"> · {fmt(r.date, 'd MMM')}</span>
                </span>
                <span className="font-serif font-semibold text-plum">{r.rating}/10</span>
              </div>
            ))}
          </div>
        )}
        {a.rated.byTracker.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-t border-line/60 pt-2">
            {a.rated.byTracker.map((t) => (
              <span key={t.tracker.id} className="rounded-full bg-blush/70 px-2.5 py-1 text-xs text-plum">
                {t.tracker.name} · {n1(t.avg)}/10 ({t.count})
              </span>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
