import { ChevronLeft, ChevronRight, PiggyBank, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PaymentsList } from '../components/DayViews';
import { ConfirmButton, Empty, Field, Progress, Section, Segmented, Sheet, Toggle, toast } from '../components/ui';
import { create, db, uid, update } from '../db/db';
import type { BudgetCategory, Expense, FixedExpense, Frequency, Income, IncomeType, SavingsGoal } from '../db/types';
import { addMonths, fmt, fmtMonth, isISODate, monthOf, todayISO } from '../lib/dates';
import { INCOME_TYPE_LABEL, eur, history, monthSummary, parseAmount, togglePayment, type MonthSummary } from '../lib/finance';
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
  const s = useMemo(() => monthSummary(data, month), [data, month]);

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
      <div className={`mt-1 font-serif text-2xl font-semibold ${tone === 'plus' ? 'text-emerald-700 dark:text-emerald-300' : 'text-plum'}`}>{eur(value)}</div>
      {sub && <div className="text-xs text-soft">{sub}</div>}
    </div>
  );
}

function Overview({ s, month, today }: { s: MonthSummary; month: string; today: string }) {
  const spent = s.fixedPlanned + s.variable + s.savings;
  const pct = s.incomePlanned ? (spent / s.incomePlanned) * 100 : 0;
  const isCurrent = monthOf(today) === month;
  const upcoming = s.occurrences.filter((o) => o.refType === 'fixed' && o.confirmed === undefined && (!isCurrent || o.date >= today));
  const overdue = isCurrent ? s.occurrences.filter((o) => o.confirmed === undefined && o.date < today) : [];
  const empty = !s.occurrences.length && !s.variable;

  return (
    <div className="space-y-6">
      <div className="anim-rise relative overflow-hidden rounded-3xl p-5 text-white shadow-lift" style={{ background: 'linear-gradient(135deg, #A83278, #81265D 60%, #6a1f4d)' }}>
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-12 right-16 h-28 w-28 rounded-full bg-white/5" />
        <div className="relative text-xs font-medium uppercase tracking-wider text-white/75">Reste à vivre prévisionnel</div>
        <div className="relative mt-1 font-serif text-5xl font-semibold" data-testid="remaining">{eur(s.remainingForecast)}</div>
        <div className="relative mt-1 text-sm text-white/80">Réel à ce jour : {eur(s.remainingActual)}</div>
        <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white/90 transition-all duration-700" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="relative mt-1.5 text-xs text-white/75" data-testid="engaged">
          {Math.round(pct)} % des revenus prévus engagés
          {pct > 100 && <b className="text-white"> · dépassement de {eur(spent - s.incomePlanned)}</b>}
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

      {overdue.length > 0 && (
        <Section title="À confirmer">
          <p className="text-xs text-soft">Ces montants ne sont pas comptés comme payés ou reçus tant que tu ne les confirmes pas.</p>
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
        <Section title="Répartition des dépenses">
          <div className="card flex flex-col items-center gap-5 p-4 sm:flex-row">
            <Donut items={s.byCategory} />
            <div className="w-full flex-1 space-y-2">
              {s.byCategory.map((c) => (
                <div key={c.id} className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="flex-1">{c.name}</span>
                    <span className="font-medium">{eur(c.amount)}</span>
                  </div>
                  {c.limit ? (
                    <div className="flex items-center gap-2">
                      <Progress value={(c.amount / c.limit) * 100} className="h-1.5 flex-1" color={c.amount > c.limit ? '#dc2626' : c.color} />
                      <span className={`text-[11px] ${c.amount > c.limit ? 'text-red-600' : 'text-soft'}`}>/ {eur(c.limit)}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}
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
            <div className="font-semibold text-emerald-700 dark:text-emerald-300">{eur(i.amount)}</div>
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
                  <div className="w-1/3 rounded-t-md bg-emerald-400/70" style={{ height: `${(h.incomePlanned / max) * 100}%` }} title={`Revenus ${eur(h.incomePlanned)}`} />
                  <div className="w-1/3 rounded-t-md bg-rasp/80" style={{ height: `${((h.fixedPlanned + h.variable) / max) * 100}%` }} title={`Dépenses ${eur(h.fixedPlanned + h.variable)}`} />
                </div>
                <span className={`text-[11px] ${h.month === month ? 'font-semibold text-rasp' : 'text-soft'}`}>{fmt(`${h.month}-01`, 'MMM')}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-soft">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Revenus
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

      <Section title="Budgets par catégorie">
        <p className="text-xs text-soft">Fixe un plafond mensuel (facultatif) : une barre te montre où tu en es.</p>
        <div className="space-y-2">
          {cats.map((c) => {
            const spent = s.byCategory.find((x) => x.id === c.id)?.amount || 0;
            return (
              <div key={c.id} className="card flex items-center gap-3 p-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: c.color }}>
                  <Icon name={c.icon} size={15} />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate">{c.name}</span>
                    <span className="text-soft">{eur(spent)}</span>
                  </div>
                  {c.monthlyLimit ? <Progress value={(spent / c.monthlyLimit) * 100} className="h-1.5" color={spent > c.monthlyLimit ? '#dc2626' : c.color} /> : null}
                </div>
                <input
                  className="input w-24 py-1.5 text-right text-sm"
                  inputMode="decimal"
                  placeholder="Plafond"
                  defaultValue={c.monthlyLimit ?? ''}
                  onBlur={(e) => update<BudgetCategory>('budgetCategories', c.id, { monthlyLimit: parseAmount(e.target.value) })}
                  aria-label={`Plafond ${c.name}`}
                />
              </div>
            );
          })}
        </div>
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
        <span>{saved >= g.target ? 'Objectif atteint ✨' : `${Math.round((saved / g.target) * 100)} %`}</span>
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
          toast(a > 0 ? `${eur(a)} mis de côté ✨` : `${eur(-a)} retirés`);
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
              }}
            >
              <Trash2 size={16} />
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
    if (existing) await update<Income>('incomes', existing.id, rec);
    else await create<Income>('incomes', rec as any);
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
              }}
            >
              <Trash2 size={16} />
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
    if (existing) await update<FixedExpense>('fixedExpenses', existing.id, rec);
    else await create<FixedExpense>('fixedExpenses', rec as any);
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
              }}
            >
              <Trash2 size={16} />
            </ConfirmButton>
          )}
          {existing && (
            <button
              className="btn-ghost text-xs"
              onClick={() => (f.active !== false ? setF({ active: false, endDate: f.endDate && f.endDate < todayISO() ? f.endDate : todayISO() }) : setF({ active: true, endDate: undefined }))}
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
