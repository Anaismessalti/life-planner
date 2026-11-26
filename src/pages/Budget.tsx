import { ChevronLeft, ChevronRight, PiggyBank, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PaymentsList } from '../components/DayViews';
import { ConfirmButton, Empty, Field, Progress, Section, Segmented, Sheet, Toggle, toast } from '../components/ui';
import { create, db, uid, update } from '../db/db';
import type { BudgetCategory, Expense, FixedExpense, Frequency, Income, IncomeType, SavingsGoal } from '../db/types';
import { addDays, addMonths, fmt, fmtMonth, isISODate, monthOf, todayISO } from '../lib/dates';
import { INCOME_TYPE_LABEL, eur, history, limitFor, limitsPatch, monthSummary, parseAmount, togglePayment, type CategoryStatus, type MonthSummary } from '../lib/finance';
import { useBudgetCategories, useFinance, useToday } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { FREQ_LABEL, financeOccurrences } from '../lib/recurrence';
import { closeEditor, openEditor } from '../lib/ui-store';

type Tab = 'overview' | 'incomes' | 'fixed' | 'variable' | 'more';

export function BudgetPage() {
  const today = useToday();
  const [month, setMonth] = useState(monthOf(today));
  const [tab, setTab] = useState<Tab>('overview');
  const data = useFinance();
  const s = useMemo(() => monthSummary(data, month, { today }), [data, month, today]);

  return (
    <div className="space-y-5">
      <header className="anim-rise space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="label">Budget</p>
            <h1 className="h-title text-4xl">{fmtMonth(month)}</h1>
          </div>
          <div className="flex items-center">
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mois précédent">
              <ChevronLeft size={20} />
            </button>
            <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mois suivant">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Aperçu' },
            { value: 'incomes', label: 'Revenus' },
            { value: 'fixed', label: 'Fixes' },
            { value: 'variable', label: 'Variables' },
            { value: 'more', label: 'Plus' },
          ]}
        />
      </header>
      {tab === 'overview' && <Overview s={s} month={month} today={today} />}
      {tab === 'incomes' && <IncomesTab month={month} />}
      {tab === 'fixed' && <FixedTab month={month} />}
      {tab === 'variable' && <VariableTab month={month} />}
      {tab === 'more' && <MoreTab month={month} />}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'plus' | 'minus' }) {
  return (
    <div className="card p-3.5">
      <div className="label">{label}</div>
      <div className={`mt-1 font-serif text-2xl font-semibold ${tone === 'plus' ? 'text-[#6B4FA0] dark:text-[#C9B3F0]' : 'text-plum'}`}>{eur(value)}</div>
      {sub && <div className="text-xs text-soft">{sub}</div>}
    </div>
  );
}

function Overview({ s, month, today }: { s: MonthSummary; month: string; today: string }) {
  const spent = s.fixedPlanned + s.variable + s.savings;
  const pct = s.incomePlanned ? (spent / s.incomePlanned) * 100 : spent > 0 ? 101 : 0;
  const isCurrent = monthOf(today) === month;
  const upcoming = s.occurrences.filter((o) => o.refType === 'fixed' && o.confirmed === undefined && (!isCurrent || o.date >= today));
  const data = useFinance();
  // À confirmer : aussi le mois précédent (un prélèvement du 30 ne doit pas disparaître le 1er).
  const overdue = isCurrent
    ? [...monthSummary(data, addMonths(month, -1)).occurrences, ...s.occurrences].filter((o) => o.confirmed === undefined && !o.orphan && o.date < today)
    : [];
  const alerts = isCurrent ? s.byCategory.filter((c) => c.over || (c.used !== undefined && c.used >= 0.8) || (c.limit && c.projected && c.projected > c.limit)) : [];
  const empty = !s.occurrences.length && !s.variable;

  return (
    <div className="space-y-6">
      <div className="anim-rise relative overflow-hidden rounded-3xl p-5 text-white shadow-lift" style={{ background: 'linear-gradient(135deg, #A83278, #81265D 60%, #6a1f4d)' }}>
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-12 right-16 h-28 w-28 rounded-full bg-white/5" />
        <div className="relative text-xs font-medium uppercase tracking-wider text-white/75">Reste à vivre du mois</div>
        <div className="relative mt-1 font-serif text-5xl font-semibold" data-testid="remaining">{eur(s.remainingForecast)}</div>
        <div className="relative mt-1 text-sm text-white/80">Sur ton compte à ce jour (selon ce que tu as confirmé) : {eur(s.remainingActual)}</div>
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white/90 transition-all duration-700" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="relative mt-1.5 text-xs text-white/75" data-testid="engaged">
          {s.incomePlanned ? `${Math.round(pct)} % de tes revenus du mois déjà engagés (fixes, dépenses, épargne)` : spent > 0 ? 'Aucun revenu prévu ce mois-ci' : 'Rien d’engagé pour l’instant'}
          {pct > 100 && <b className="text-white"> · {eur(spent - s.incomePlanned)} de plus que tes revenus</b>}
        </div>
      </div>

      {empty && (
        <Empty icon={<Wallet size={22} />}>
          Commence par ajouter ton salaire et tes dépenses fixes (loyer, téléphone…). Ils reviendront automatiquement chaque mois.
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <button className="btn-soft py-1.5 text-xs" onClick={() => openEditor({ type: 'income' })}>
              + Revenu
            </button>
            <button className="btn-soft py-1.5 text-xs" onClick={() => openEditor({ type: 'fixed' })}>
              + Dépense fixe
            </button>
          </div>
        </Empty>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenus" value={s.incomePlanned} sub={`Reçus : ${eur(s.incomeReceived)}`} tone="plus" />
        <Stat label="Dépenses fixes" value={s.fixedPlanned} sub={`Payées : ${eur(s.fixedPaid)}`} />
        <Stat label="Dépenses variables" value={s.variable} sub="Renseignées" />
        <Stat label="Épargne" value={s.savings} sub="Ce mois-ci" />
      </div>

      {alerts.length > 0 && (
        <Section title="À surveiller">
          <div className="card space-y-1.5 p-3" data-testid="budget-alerts">
            {alerts.map((c) => (
              <p key={c.id} className="text-sm">
                {c.over
                  ? `Tu as dépassé ton budget ${c.name.toLowerCase()} de ${eur(c.over)} ce mois-ci.`
                  : c.used! >= 0.8
                    ? `Budget ${c.name.toLowerCase()} : ${Math.round(c.used! * 100)} % utilisés, il reste ${eur(c.left || 0)}.`
                    : `Budget ${c.name.toLowerCase()} : à ce rythme, environ ${eur(c.projected!)} d'ici la fin du mois (plafond ${eur(c.limit!)}).`}
              </p>
            ))}
          </div>
        </Section>
      )}

      {overdue.length > 0 && (
        <Section title="À confirmer">
          <p className="text-xs text-soft">Ils ne comptent pas comme payés ou reçus tant que tu ne les as pas confirmés.</p>
          <PaymentsList items={overdue} onToggle={togglePayment} />
        </Section>
      )}
      <Section title="Prochains prélèvements">
        {upcoming.length ? (
          <div className="space-y-2">
            {upcoming.map((o) => (
              <div key={o.refId + o.date} className="flex items-center gap-3 rounded-2xl border border-line/70 bg-card px-3.5 py-2.5 shadow-soft">
                <div className="w-12 text-center">
                  <div className="font-serif text-xl font-semibold leading-none text-plum">{fmt(o.date, 'd')}</div>
                  <div className="text-[10px] uppercase text-soft">{fmt(o.date, 'MMM')}</div>
                </div>
                <div className="flex-1 truncate text-sm font-medium">{o.label}</div>
                <div className="text-sm font-semibold text-plum">{eur(o.planned)}</div>
                <button className="chip text-xs" onClick={() => togglePayment(o)}>
                  Payé
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-soft">Aucun prélèvement à venir ce mois-ci.</p>
        )}
      </Section>

      {s.byCategory.length > 0 && (
        <Section title="Par catégorie">
          <div className="card space-y-4 p-4">
            <div className="flex justify-center">
              <Donut items={s.byCategory.filter((c) => c.amount > 0)} />
            </div>
            <div className="space-y-3.5">
              {s.byCategory.map((c) => (
                <CategoryRow key={c.id} c={c} />
              ))}
            </div>
          </div>
          <p className="text-[11px] text-soft">Montants réellement dépensés. Les prélèvements pas encore confirmés sont indiqués à part (« prévus »).</p>
        </Section>
      )}
    </div>
  );
}

/** Une catégorie : dépensé, plafond, reste ou dépassement chiffré, et projection de fin de mois. */
export function CategoryRow({ c }: { c: CategoryStatus }) {
  const pct = c.used !== undefined ? Math.round(c.used * 1000) / 10 : undefined;
  const near = c.used !== undefined && c.used >= 0.8 && !c.over;
  const projOver = c.limit && c.projected && c.projected > c.limit && !c.over;
  return (
    <div className="space-y-1" data-testid={`cat-${c.id}`}>
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
        <span className="flex-1">{c.name}</span>
        <span className="font-medium">{eur(c.amount)}</span>
      </div>
      {c.limit ? (
        <>
          <div className="relative h-2 overflow-hidden rounded-full bg-blush">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (c.amount / Math.max(c.limit, c.amount)) * 100)}%`, background: c.over ? '#C0395A' : c.color }} />
            {c.over ? <div className="absolute inset-y-0 border-l-2 border-white" style={{ left: `${(c.limit / c.amount) * 100}%` }} title="plafond" /> : null}
          </div>
          <div className={`text-[11px] ${c.over ? 'font-medium text-[#C0395A]' : near ? 'text-rasp' : 'text-soft'}`} data-testid={`cat-${c.id}-text`}>
            {c.over
              ? `Budget ${eur(c.limit)} · dépensé ${eur(c.amount)} · ${String(pct).replace('.', ',')} % · dépassé de ${eur(c.over)}`
              : `${eur(c.amount)} sur ${eur(c.limit)} · ${String(pct).replace('.', ',')} % · reste ${eur(c.left || 0)}`}
          </div>
        </>
      ) : (
        <div className="text-[11px] text-soft">Pas de plafond pour cette catégorie.</div>
      )}
      {c.pending > 0 && <div className="text-[11px] text-soft">+ {eur(c.pending)} de prélèvements prévus, pas encore confirmés</div>}
      {projOver ? (
        <div className="text-[11px] text-rasp">À ce rythme, tu finirais le mois vers {eur(c.projected!)}, soit {eur(c.projected! - c.limit!)} au-dessus.</div>
      ) : null}
    </div>
  );
}

function Donut({ items }: { items: { color: string; amount: number; name: string }[] }) {
  const total = items.reduce((a, b) => a + b.amount, 0) || 1;
  const r = 52;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={150} height={150} viewBox="0 0 150 150" className="-rotate-90" role="img" aria-label="Répartition des dépenses">
      <circle cx={75} cy={75} r={r} fill="none" stroke="rgb(var(--c-blush))" strokeWidth={20} />
      {items.map((it) => {
        const len = (it.amount / total) * c;
        const el = (
          <circle key={it.name} cx={75} cy={75} r={r} fill="none" stroke={it.color} strokeWidth={20} strokeDasharray={`${Math.max(len - 2, 0.1)} ${c}`} strokeDashoffset={-acc}>
            <title>{it.name}</title>
          </circle>
        );
        acc += len;
        return el;
      })}
    </svg>
  );
}

function IncomesTab({ month }: { month: string }) {
  const data = useFinance();
  const s = monthSummary(data, month);
  const occ = s.occurrences.filter((o) => o.refType === 'income');
  return (
    <div className="space-y-6">
      <Section
        title="Ce mois-ci"
        action={
          <button className="btn-primary py-1.5 text-xs" onClick={() => openEditor({ type: 'income' })}>
            <Plus size={14} /> Revenu
          </button>
        }
      >
        {occ.length ? <PaymentsList items={occ} onToggle={togglePayment} /> : <p className="text-sm text-soft">Aucun revenu prévu ce mois-ci.</p>}
      </Section>
      <Section title="Tous mes revenus">
        {data.incomes.map((i) => (
          <button key={i.id} className="flex w-full items-center gap-3 rounded-2xl border border-line/70 bg-card px-3.5 py-3 text-left shadow-soft" onClick={() => openEditor({ type: 'income', id: i.id })}>
            <div className="flex-1">
              <div className="text-sm font-medium">{i.label}</div>
              <div className="text-xs text-soft">
                {INCOME_TYPE_LABEL[i.type]} · {FREQ_LABEL[i.frequency]} · le {fmt(i.date, 'd')}
              </div>
            </div>
            <div className="font-semibold text-[#6B4FA0] dark:text-[#C9B3F0]">{eur(i.amount)}</div>
          </button>
        ))}
      </Section>
    </div>
  );
}

function FixedTab({ month }: { month: string }) {
  const data = useFinance();
  const cats = useBudgetCategories();
  const s = monthSummary(data, month);
  const occ = s.occurrences.filter((o) => o.refType === 'fixed');
  return (
    <div className="space-y-6">
      <Section
        title="Prélèvements du mois"
        action={
          <button className="btn-primary py-1.5 text-xs" onClick={() => openEditor({ type: 'fixed' })}>
            <Plus size={14} /> Dépense fixe
          </button>
        }
      >
        {occ.length ? <PaymentsList items={occ} onToggle={togglePayment} /> : <p className="text-sm text-soft">Aucun prélèvement ce mois-ci.</p>}
      </Section>
      <Section title="Toutes mes dépenses fixes">
        {data.fixed.map((f) => {
          const c = cats.find((x) => x.id === f.budgetCategoryId);
          return (
            <button key={f.id} className={`flex w-full items-center gap-3 rounded-2xl border border-line/70 bg-card px-3.5 py-3 text-left shadow-soft ${f.active ? '' : 'opacity-50'}`} onClick={() => openEditor({ type: 'fixed', id: f.id })}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: c?.color || '#9C8A96' }}>
                <Icon name={c?.icon || 'receipt'} size={15} />
              </span>
              <div className="flex-1">
                <div className="text-sm font-medium">{f.label}</div>
                <div className="text-xs text-soft">
                  {FREQ_LABEL[f.frequency]} · le {fmt(f.date, 'd')}
                  {!f.active && ' · en pause'}
                </div>
              </div>
              <div className="font-semibold text-plum">{eur(f.amount)}</div>
            </button>
          );
        })}
      </Section>
    </div>
  );
}

function VariableTab({ month }: { month: string }) {
  const data = useFinance();
  const cats = useBudgetCategories();
  const list = data.expenses.filter((e) => monthOf(e.date) === month).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((a, e) => a + e.amount, 0);
  return (
    <Section
      title={`Dépenses variables · ${eur(total)}`}
      action={
        <button className="btn-primary py-1.5 text-xs" onClick={() => openEditor({ type: 'expense' })}>
          <Plus size={14} /> Dépense
        </button>
      }
    >
      {!list.length && <Empty icon={<Receipt size={20} />}>Saisie facultative : restaurants, shopping, sorties…</Empty>}
      {list.map((e) => {
        const c = cats.find((x) => x.id === e.budgetCategoryId);
        return (
          <button key={e.id} className="flex w-full items-center gap-3 rounded-2xl border border-line/70 bg-card px-3.5 py-2.5 text-left shadow-soft" onClick={() => openEditor({ type: 'expense', id: e.id })}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: c?.color || '#9C8A96' }}>
              <Icon name={c?.icon || 'receipt'} size={15} />
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium">{e.note || c?.name || 'Dépense'}</div>
              <div className="text-xs text-soft">{fmt(e.date, 'EEE d MMM')}</div>
            </div>
            <div className="font-semibold text-plum">{eur(e.amount)}</div>
          </button>
        );
      })}
    </Section>
  );
}

/** Ce mois-ci comparé au mois précédent et à la moyenne des 3 mois d'avant, catégorie par catégorie. */
function CategoryCompare({ data, month }: { data: ReturnType<typeof useFinance>; month: string }) {
  const cur = monthSummary(data, month);
  const prev = monthSummary(data, addMonths(month, -1));
  const ref = [2, 3, 4].map((i) => monthSummary(data, addMonths(month, -i)));
  const ids = [...new Set([...cur.byCategory, ...prev.byCategory].map((c) => c.id))];
  if (!ids.length) return <p className="text-sm text-soft">Pas encore de dépenses à comparer.</p>;
  const amt = (m: MonthSummary, id: string) => m.byCategory.find((c) => c.id === id)?.amount || 0;
  const rows = ids
    .map((id) => {
      const c = cur.byCategory.find((x) => x.id === id) || prev.byCategory.find((x) => x.id === id)!;
      const known = ref.filter((m) => m.byCategory.length > 0);
      return { id, name: c.name, color: c.color, now: amt(cur, id), before: amt(prev, id), avg: known.length ? known.reduce((a, m) => a + amt(m, id), 0) / known.length : undefined };
    })
    .sort((a, b) => b.now - a.now);
  return (
    <div className="card overflow-x-auto p-3">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-soft">
            <th className="py-1 font-medium">Catégorie</th>
            <th className="py-1 text-right font-medium">{fmt(`${month}-01`, 'MMM')}</th>
            <th className="py-1 text-right font-medium">{fmt(`${addMonths(month, -1)}-01`, 'MMM')}</th>
            <th className="py-1 text-right font-medium">Écart</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.now - r.before;
            return (
              <tr key={r.id} className="border-t border-line/70">
                <td className="py-1.5">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
                  {r.name}
                </td>
                <td className="py-1.5 text-right font-medium">{eur(r.now)}</td>
                <td className="py-1.5 text-right text-soft">{eur(r.before)}</td>
                <td className={`py-1.5 text-right ${d > 0 ? 'text-rasp' : 'text-soft'}`}>{d === 0 ? '=' : `${d > 0 ? '+' : '−'}${eur(Math.abs(d))}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-soft">Montants réellement dépensés. Le mois en cours n'est peut-être pas terminé.</p>
    </div>
  );
}

function MoreTab({ month }: { month: string }) {
  const data = useFinance();
  const cats = useBudgetCategories();
  const s = monthSummary(data, month);
  const hist = history(data, month, 6);
  const max = Math.max(1, ...hist.flatMap((h) => [h.incomePlanned, h.fixedPlanned + h.variable]));
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDeadline, setGoalDeadline] = useState('');
  return (
    <div className="space-y-7">
      <Section title="Historique et comparaison">
        <div className="card p-4">
          <div className="flex h-40 items-end gap-3">
            {hist.map((h) => (
              <div key={h.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t-md bg-[#8E6BB0]/70" style={{ height: `${(h.incomePlanned / max) * 100}%` }} title={`Revenus ${eur(h.incomePlanned)}`} />
                  <div className="w-1/3 rounded-t-md bg-rasp/80" style={{ height: `${((h.fixedPlanned + h.variable) / max) * 100}%` }} title={`Dépenses ${eur(h.fixedPlanned + h.variable)}`} />
                </div>
                <span className={`text-[11px] ${h.month === month ? 'font-semibold text-rasp' : 'text-soft'}`}>{fmt(`${h.month}-01`, 'MMM')}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-soft">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#8E6BB0]" /> Revenus
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rasp" /> Dépenses
            </span>
          </div>
          <table className="mt-4 w-full text-[13px] sm:text-sm">
            <thead>
              <tr className="text-left text-xs text-soft">
                <th className="py-1 font-medium">Mois</th>
                <th className="py-1 text-right font-medium">Revenus</th>
                <th className="py-1 text-right font-medium">Dépenses</th>
                <th className="py-1 text-right font-medium">Épargne</th>
                <th className="py-1 text-right font-medium">Reste</th>
              </tr>
            </thead>
            <tbody>
              {hist.map((h) => (
                <tr key={h.month} className="border-t border-line/70">
                  <td className="py-1.5">{fmtMonth(h.month)}</td>
                  <td className="py-1.5 text-right">{eur(h.incomePlanned)}</td>
                  <td className="py-1.5 text-right">{eur(h.fixedPlanned + h.variable)}</td>
                  <td className="py-1.5 text-right">{eur(h.savings)}</td>
                  <td className={`py-1.5 text-right font-medium ${h.remainingForecast < 0 ? 'text-rasp' : ''}`}>{eur(h.remainingForecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Plafonds par catégorie">
        <p className="text-xs text-soft">Un plafond fixé ici vaut pour {fmtMonth(month).toLowerCase()} et les mois suivants. Les mois passés gardent le leur.</p>
        <div className="space-y-2">
          {cats.map((c) => {
            const st = s.byCategory.find((x) => x.id === c.id);
            const lim = limitFor(c, month);
            return (
              <div key={c.id} className="card space-y-2 p-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: c.color }}>
                    <Icon name={c.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  <input
                    key={`${c.id}-${month}-${lim ?? ''}`}
                    className="input w-28 py-1.5 text-right text-sm"
                    inputMode="decimal"
                    placeholder="Pas de plafond"
                    defaultValue={lim ? String(lim).replace('.', ',') : ''}
                    onBlur={(e) => {
                      const txt = e.target.value.trim();
                      const v = txt ? parseAmount(txt) : undefined;
                      if (txt && (v === undefined || v <= 0)) {
                        e.target.value = lim ? String(lim).replace('.', ',') : '';
                        return toast('Je n’ai pas compris ce montant (ex : 200 ou 150,50)');
                      }
                      if ((v || undefined) === lim) return;
                      update<BudgetCategory>('budgetCategories', c.id, limitsPatch(c, month, v));
                      toast(v ? `Plafond ${c.name.toLowerCase()} : ${eur(v)} à partir de ${fmtMonth(month).toLowerCase()}` : `Plus de plafond pour ${c.name.toLowerCase()}`);
                    }}
                    aria-label={`Plafond ${c.name}`}
                    data-testid={`limit-${c.id}`}
                  />
                </div>
                {st && lim ? <CategoryRow c={st} /> : null}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Mois par mois, par catégorie">
        <CategoryCompare data={data} month={month} />
      </Section>

      <Section title="Objectifs d'épargne">
        {data.savings.map((g) => (
          <SavingsCard key={g.id} g={g} />
        ))}
        <form
          className="card flex flex-wrap gap-2 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const t = parseAmount(goalTarget);
            if (!goalName.trim()) return toast('Donne un nom à ton objectif');
            if (!t || t <= 0) return toast('Indique le montant visé');
            await create<SavingsGoal>('savings', { name: goalName.trim(), target: t, contributions: [], ...(goalDeadline ? { deadline: goalDeadline } : {}) } as any);
            setGoalName('');
            setGoalTarget('');
            setGoalDeadline('');
          }}
        >
          <input className="input min-w-[10rem] flex-1" placeholder="Ex : Voyage au Japon" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
          <input className="input w-28" inputMode="decimal" placeholder="Objectif €" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} />
          <label className="flex w-full items-center gap-2 text-xs text-soft">
            Pour le (facultatif)
            <input type="date" className="input flex-1 py-1.5" value={goalDeadline} onChange={(e) => setGoalDeadline(e.target.value)} aria-label="Date visée" />
          </label>
          <button className="btn-soft">
            <PiggyBank size={16} /> Créer
          </button>
        </form>
      </Section>
    </div>
  );
}

function SavingsCard({ g }: { g: SavingsGoal }) {
  const [amt, setAmt] = useState('');
  const saved = g.contributions.reduce((a, c) => a + c.amount, 0);
  return (
    <div className="card space-y-2 p-4">
      <div className="flex items-center gap-2">
        <PiggyBank size={18} className="text-rasp" />
        <span className="flex-1 font-serif text-lg font-semibold text-plum">{g.name}</span>
        <ConfirmButton className="icon-btn h-8 w-8" onConfirm={() => update('savings', g.id, { deleted: true })} confirmLabel="✓ ?">
          <Trash2 size={14} />
        </ConfirmButton>
      </div>
      <Progress value={(saved / g.target) * 100} />
      <div className="flex justify-between text-xs text-soft">
        <span>
          {eur(saved)} sur {eur(g.target)}
        </span>
        <span>{saved >= g.target ? 'Objectif atteint' : `${Math.round((saved / g.target) * 100)} %`}</span>
      </div>
      {saved < g.target && g.deadline && (
        <div className="text-xs text-plum" data-testid="savings-per-month">
          {(() => {
            const today = todayISO();
            const months = Math.max(1, (Number(g.deadline.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(g.deadline.slice(5, 7)) - Number(today.slice(5, 7)) + (g.deadline.slice(8) >= today.slice(8) ? 1 : 0));
            return g.deadline < today
              ? `Échéance dépassée (${fmt(g.deadline, 'd MMM yyyy')}) · il manque ${eur(g.target - saved)}`
              : `À mettre de côté : ${eur(Math.ceil(((g.target - saved) / months) * 100) / 100)} par mois jusqu'au ${fmt(g.deadline, 'd MMM yyyy')}`;
          })()}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const a = parseAmount(amt);
          if (!a) return toast('Montant non reconnu');
          if (saved + a < 0) return toast(`Tu ne peux pas retirer plus que ${eur(saved)}`);
          await update<SavingsGoal>('savings', g.id, { contributions: [...g.contributions, { id: uid(), date: todayISO(), amount: a }] });
          setAmt('');
          toast(a > 0 ? `${eur(a)} mis de côté` : `${eur(-a)} retirés`);
        }}
      >
        <input className="input py-1.5" inputMode="decimal" placeholder="Montant (négatif pour un retrait)" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <button className="btn-soft py-1.5">Ajouter</button>
      </form>
    </div>
  );
}

// ---------- Éditeurs ----------

export function ExpenseEditor({ id, defaults }: { id?: string; defaults?: { date?: string } }) {
  const cats = useBudgetCategories().filter((c) => c.kind === 'variable');
  const [f, setF] = useState<Partial<Expense> & { amountText?: string; refund?: boolean }>({ date: defaults?.date || todayISO() });
  useEffect(() => {
    if (id) db.expenses.get(id).then((e) => e && setF({ ...e, refund: e.amount < 0, amountText: String(Math.abs(e.amount)).replace('.', ',') }));
  }, [id]);
  const save = async () => {
    const raw = parseAmount(f.amountText || '');
    if (raw === undefined || raw === 0) return toast('Indique un montant (ex : 12,50)');
    if (raw < 0) return toast('Montant positif uniquement. Pour un remboursement, coche « Remboursement ».');
    if (!isISODate(f.date)) return toast('Choisis une date');
    // Un remboursement est enregistré en négatif dans sa catégorie : il réduit la dépense du mois.
    const amount = f.refund ? -raw : raw;
    const rec = { amount, budgetCategoryId: f.budgetCategoryId, date: f.date, note: f.note || undefined };
    if (id) await update<Expense>('expenses', id, rec);
    else await create<Expense>('expenses', rec as any);
    toast(f.refund ? `Remboursement de ${eur(raw)} enregistré` : `Dépense de ${eur(raw)} enregistrée`);
    closeEditor();
  };
  return (
    <Sheet
      open
      onClose={closeEditor}
      title={id ? 'Dépense' : 'Nouvelle dépense'}
      footer={
        <div className="flex gap-2">
          {id && (
            <ConfirmButton
              onConfirm={async () => {
                await update('expenses', id, { deleted: true });
                closeEditor();
                toast('Dépense supprimée', { label: 'Annuler', run: () => update('expenses', id, { deleted: false }) });
              }}
            >
              <Trash2 size={16} /> Supprimer
            </ConfirmButton>
          )}
          <button className="btn-primary ml-auto px-6" onClick={save}>
            Enregistrer
          </button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="relative">
          <input
            autoFocus
            className="input py-4 pr-10 text-center font-serif text-4xl font-semibold text-plum"
            inputMode="decimal"
            placeholder="0,00"
            value={f.amountText || ''}
            onChange={(e) => setF({ ...f, amountText: e.target.value })}
            aria-label="Montant"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-serif text-2xl text-soft">€</span>
        </div>
        <Toggle checked={!!f.refund} onChange={(v) => setF({ ...f, refund: v })} label="Remboursement (vient réduire les dépenses de la catégorie)" />
        {f.journal && <p className="rounded-xl bg-blush/60 px-3 py-2 text-xs text-plum">Ajoutée depuis ton journal ({fmt(f.journal.date, 'd MMMM')}). Tu peux la modifier ici ou dans le journal : c'est la même dépense, comptée une seule fois.</p>}
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip ${f.budgetCategoryId === c.id ? 'chip-on' : ''}`}
              style={f.budgetCategoryId === c.id ? { background: c.color } : undefined}
              onClick={() => setF({ ...f, budgetCategoryId: c.id })}
            >
              <Icon name={c.icon} size={14} /> {c.name}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className="input" value={f.date || ''} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          <Field label="Note">
            <input className="input" placeholder="Facultatif" value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} />
          </Field>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}

function RecurringFields({ f, setF }: { f: { date?: string; frequency?: Frequency; endDate?: string }; setF: (x: any) => void }) {
  const next = f.date && f.frequency ? financeOccurrences({ date: f.date, frequency: f.frequency, endDate: f.endDate }, todayISO(), addMonths(monthOf(todayISO()), 14) + '-28').slice(0, 3) : [];
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date (1re fois)">
          <input type="date" className="input" value={f.date || ''} onChange={(e) => setF({ date: e.target.value })} />
        </Field>
        <Field label="Fréquence">
          <select className="input" value={f.frequency} onChange={(e) => setF({ frequency: e.target.value as Frequency })}>
            {(Object.keys(FREQ_LABEL) as Frequency[]).map((k) => (
              <option key={k} value={k}>
                {FREQ_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {f.frequency !== 'once' && (
        <Field label="Jusqu'au (facultatif)">
          <input type="date" className="input" value={f.endDate || ''} onChange={(e) => setF({ endDate: e.target.value || undefined })} />
        </Field>
      )}
      {next.length > 0 && <p className="text-xs text-soft">Prochaines dates : {next.map((d) => fmt(d, 'd MMM yyyy')).join(' · ')}</p>}
    </>
  );
}

export function IncomeEditor({ id }: { id?: string }) {
  const data = useFinance();
  const existing = id ? data.incomes.find((i) => i.id === id) : undefined;
  const [f, setFs] = useState<Partial<Income> & { amountText?: string }>(
    existing ? { ...existing, amountText: String(existing.amount).replace('.', ',') } : { type: 'salaire', frequency: 'monthly', date: todayISO() },
  );
  const setF = (x: Partial<typeof f>) => setFs((o) => ({ ...o, ...x }));
  const save = async () => {
    const amount = parseAmount(f.amountText || '');
    if (!amount || amount < 0) return toast('Indique un montant positif (ex : 2 000)');
    if (!isISODate(f.date)) return toast('Choisis une date');
    if (f.endDate && f.endDate < f.date) return toast('La date de fin est avant la date de début');
    const rec = { label: f.label?.trim() || INCOME_TYPE_LABEL[f.type!], type: f.type!, amount, date: f.date, frequency: f.frequency!, endDate: f.endDate };
    if (existing) {
      const scheduleChanged = existing.date !== rec.date || existing.amount !== rec.amount || existing.frequency !== rec.frequency;
      const split = await splitPlan('incomes', existing, rec, false, scheduleChanged);
      if (split) {
        await update<Income>('incomes', existing.id, { endDate: split.end });
        await create<Income>('incomes', { ...rec, date: split.start, endDate: rec.endDate && rec.endDate >= split.start ? rec.endDate : undefined } as any);
      } else await update<Income>('incomes', existing.id, rec);
    } else await create<Income>('incomes', rec as any);
    closeEditor();
    toast('Revenu enregistré');
  };
  return (
    <Sheet
      open
      onClose={closeEditor}
      title={existing ? 'Revenu' : 'Nouveau revenu'}
      footer={
        <div className="flex gap-2">
          {existing && (
            <ConfirmButton
              onConfirm={async () => {
                await update('incomes', existing.id, { deleted: true });
                closeEditor();
                toast('Revenu supprimé', { label: 'Annuler', run: () => update('incomes', existing.id, { deleted: false }) });
              }}
            >
              <Trash2 size={16} /> Supprimer
            </ConfirmButton>
          )}
          <button className="btn-primary ml-auto px-6" onClick={save}>
            Enregistrer
          </button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save())}>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(INCOME_TYPE_LABEL) as IncomeType[]).map((t) => (
            <button type="button" key={t} className={`chip ${f.type === t ? 'chip-on' : ''}`} onClick={() => setF({ type: t, frequency: t === 'salaire' ? 'monthly' : f.frequency === 'monthly' ? 'once' : f.frequency })}>
              {INCOME_TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Libellé">
            <input className="input" placeholder={INCOME_TYPE_LABEL[f.type!]} value={f.label || ''} onChange={(e) => setF({ label: e.target.value })} />
          </Field>
          <Field label="Montant (€)">
            <input className="input" inputMode="decimal" value={f.amountText || ''} onChange={(e) => setF({ amountText: e.target.value })} autoFocus={!existing} />
          </Field>
        </div>
        <RecurringFields f={f} setF={setF} />
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}

/**
 * Changer la date, le montant ou la fréquence d'un revenu / prélèvement qui a déjà un passé :
 * l'ancien s'arrête la veille, un nouveau commence. Les mois passés restent exactement comme ils étaient
 * (pas de loyer compté deux fois, pas de montant réécrit). Même chose pour une réactivation après une pause.
 */
async function splitPlan(
  _table: 'fixedExpenses' | 'incomes',
  old: { date: string; frequency: Frequency; endDate?: string },
  rec: { date: string; frequency: Frequency },
  reactivated: boolean,
  scheduleChanged: boolean,
): Promise<{ end: string; start: string } | undefined> {
  const today = todayISO();
  if (!reactivated && !scheduleChanged) return undefined;
  if (old.date >= today) return undefined; // rien de passé : on modifie simplement
  if (reactivated) {
    // Reprise : la pause reste une pause. Le nouveau commence à la prochaine échéance à partir d'aujourd'hui.
    const next = financeOccurrences({ ...rec, date: rec.date }, today, addDays(today, 400))[0] || today;
    return { end: old.endDate && old.endDate < today ? old.endDate : addDays(today, -1), start: next };
  }
  const start = rec.date >= today ? rec.date : financeOccurrences(rec, today, addDays(today, 400))[0] || today;
  return { end: addDays(start, -1), start };
}

export function FixedEditor({ id }: { id?: string }) {
  const data = useFinance();
  const cats = useBudgetCategories().filter((c) => c.kind === 'fixed');
  const existing = id ? data.fixed.find((i) => i.id === id) : undefined;
  const [f, setFs] = useState<Partial<FixedExpense> & { amountText?: string }>(
    existing ? { ...existing, amountText: String(existing.amount).replace('.', ',') } : { frequency: 'monthly', date: todayISO(), active: true },
  );
  const setF = (x: Partial<typeof f>) => setFs((o) => ({ ...o, ...x }));
  const save = async () => {
    const amount = parseAmount(f.amountText || '');
    if (!f.label?.trim()) return toast('Donne un nom (ex : Loyer)');
    if (!amount || amount < 0) return toast('Indique un montant positif');
    if (!isISODate(f.date)) return toast('Choisis la date du premier prélèvement');
    if (f.endDate && f.endDate < f.date) return toast('La date de fin est avant la date de début');
    const rec = { label: f.label.trim(), amount, budgetCategoryId: f.budgetCategoryId, date: f.date, frequency: f.frequency!, endDate: f.endDate, active: f.active !== false };
    if (existing) {
      const reactivated = existing.active === false && rec.active;
      const scheduleChanged = existing.date !== rec.date || existing.amount !== rec.amount || existing.frequency !== rec.frequency;
      const split = await splitPlan('fixedExpenses', existing, rec, reactivated, scheduleChanged);
      if (split) {
        await update<FixedExpense>('fixedExpenses', existing.id, { endDate: split.end, active: true });
        await create<FixedExpense>('fixedExpenses', { ...rec, date: split.start, endDate: !reactivated && rec.endDate && rec.endDate >= split.start ? rec.endDate : undefined, active: true } as any);
      } else await update<FixedExpense>('fixedExpenses', existing.id, rec);
    } else await create<FixedExpense>('fixedExpenses', rec as any);
    closeEditor();
    toast('Dépense fixe enregistrée : elle apparaîtra dans ton calendrier');
  };
  return (
    <Sheet
      open
      onClose={closeEditor}
      title={existing ? 'Dépense fixe' : 'Nouvelle dépense fixe'}
      footer={
        <div className="flex gap-2">
          {existing && (
            <ConfirmButton
              onConfirm={async () => {
                await update('fixedExpenses', existing.id, { deleted: true });
                closeEditor();
                toast('Dépense fixe supprimée', { label: 'Annuler', run: () => update('fixedExpenses', existing.id, { deleted: false }) });
              }}
            >
              <Trash2 size={16} /> Supprimer
            </ConfirmButton>
          )}
          {existing && (
            <button
              className="btn-ghost text-xs"
              onClick={() => (f.active !== false ? setF({ active: false, endDate: f.endDate && f.endDate < todayISO() ? f.endDate : todayISO() }) : setF({ active: true }))}
            >
              {f.active !== false ? 'Arrêter (garde l’historique)' : 'Réactiver'}
            </button>
          )}
          <button className="btn-primary ml-auto px-6" onClick={save}>
            Enregistrer
          </button>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), save())}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom">
            <input className="input" placeholder="Ex : Loyer" value={f.label || ''} onChange={(e) => setF({ label: e.target.value })} autoFocus={!existing} />
          </Field>
          <Field label="Montant (€)">
            <input className="input" inputMode="decimal" value={f.amountText || ''} onChange={(e) => setF({ amountText: e.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          {cats.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip ${f.budgetCategoryId === c.id ? 'chip-on' : ''}`}
              style={f.budgetCategoryId === c.id ? { background: c.color } : undefined}
              onClick={() => setF({ budgetCategoryId: c.id })}
            >
              <Icon name={c.icon} size={14} /> {c.name}
            </button>
          ))}
        </div>
        <RecurringFields f={f} setF={setF} />
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}
