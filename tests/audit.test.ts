// Tests ajoutés lors de l'audit : chaque bug trouvé a son test pour ne jamais revenir.
import { beforeEach, describe, expect, it } from 'vitest';
import { create, db } from '../src/db/db';
import type { Contact, DayLog, Expense, FixedExpense, Income, PaymentStatus, Project, SavingsGoal, Task, Tracker } from '../src/db/types';
import { analyze, periodOf, shiftPeriod } from '../src/lib/analytics';
import { fmtMonth, isISODate, isISOMonth } from '../src/lib/dates';
import { financeOccurrencesIn, history, monthSummary, parseAmount, paymentId, setPaymentAmount, togglePayment } from '../src/lib/finance';
import { formOf, journalExpenseId, migrateJournal, setJournalExpense } from '../src/lib/lifeforms';
import { parseQuick } from '../src/lib/parse';
import { QUOTES, quoteOfDay } from '../src/lib/quotes';
import { repairData } from '../src/lib/repair';
import { materialize, expandTasks, occurrenceId } from '../src/lib/tasks';
import { mergeRecords } from '../src/lib/sync/merge';
import { progressOf } from '../src/pages/Projects';
import { saveLog } from '../src/pages/Journal';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const T = (id: string, group: Tracker['group'], extra: Partial<Tracker> = {}): Tracker =>
  ({ id, name: id, icon: 'star', color: '#000', order: 0, group, createdAt: 1, updatedAt: 1, ...extra }) as Tracker;
const L = (date: string, p: Partial<DayLog>): DayLog => ({ id: date, date, items: [], createdAt: 1, updatedAt: 1, ...p }) as DayLog;
const P = (id: string, name: string, kind: Contact['kind'] = 'person'): Contact => ({ id, name, kind, icon: 'users', color: '#000', order: 0, createdAt: 1, updatedAt: 1 }) as Contact;

describe('projets : mois visé', () => {
  it('le mois saisi à la main (Safari Mac) ne fait plus planter, et il est réparé au démarrage', async () => {
    expect(() => fmtMonth('mars 2027')).not.toThrow();
    expect(fmtMonth('mars 2027')).toBe('');
    expect(fmtMonth('2027-03')).toBe('Mars 2027');
    expect(isISOMonth('2027-3')).toBe(false);
    expect(isISODate('2027-02-31')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    const p = await create<Project>('projects', { title: 'Japon', milestones: [], status: 'planned', targetMonth: '03/2027' } as any);
    await repairData();
    expect((await db.projects.get(p.id))!.targetMonth).toBeUndefined();
    expect((await db.projects.get(p.id))!.title).toBe('Japon');
  });
});

describe('projets : progression réelle', () => {
  const proj = (p: Partial<Project> = {}) => ({ id: 'p1', title: 'P', milestones: [], status: 'active', createdAt: 1, updatedAt: 1, ...p }) as Project;
  const t = (p: Partial<Task>) => ({ id: Math.random().toString(), title: 't', kind: 'task', priority: 'should', subtasks: [], status: 'todo', projectId: 'p1', createdAt: 1, updatedAt: 1, ...p }) as Task;
  it('les occurrences récurrentes et les rendez-vous ne gonflent pas le %', () => {
    const tasks = [t({}), t({ seriesId: 's', status: 'done' }), t({ seriesId: 's', status: 'done' }), t({ kind: 'event', status: 'done' })];
    expect(progressOf(proj({ milestones: [{ id: 'm', title: 'm', done: false }] }), tasks).pct).toBe(0);
  });
  it('une tâche rouverte fait redescendre la progression, une étape se valide avec ses tâches', () => {
    const ms = [{ id: 'm1', title: 'Étape', done: false }];
    const done = [t({ milestoneId: 'm1', status: 'done' }), t({ milestoneId: 'm1', status: 'done' })];
    expect(progressOf(proj({ milestones: ms }), done).pct).toBe(100);
    const reopened = [done[0], { ...done[1], status: 'todo' as const }];
    expect(progressOf(proj({ milestones: ms }), reopened).pct).toBe(33);
  });
  it('objectif chiffré, objectif d’épargne, projet terminé', () => {
    expect(progressOf(proj({ measure: { target: 12, current: 3, unit: 'livres' } }), []).pct).toBe(25);
    const g = { id: 'g', name: 'Japon', target: 3000, contributions: [{ id: 'c', date: '2026-11-01', amount: 750 }], createdAt: 1, updatedAt: 1 } as SavingsGoal;
    expect(progressOf(proj({ measure: { target: 1, current: 0, savingsId: 'g' } }), [], [g]).pct).toBe(25);
    expect(progressOf(proj({ status: 'done' }), [t({})]).pct).toBe(100);
  });
});

describe('journal : enregistrement fiable', () => {
  it('des touchers rapides ne s’écrasent pas (humeur, états, activités)', async () => {
    saveLog('2026-11-20', { mood: 4 });
    saveLog('2026-11-20', (c) => ({ items: [...c.items, { trackerId: 'tr-apero' }] }));
    saveLog('2026-11-20', (c) => ({ feelings: [...(c.feelings || []), { id: 'hendaye', level: 1 }] }));
    await saveLog('2026-11-20', (c) => ({ items: [...c.items, { trackerId: 'tr-cafe' }] }));
    const l = (await db.daylogs.get('2026-11-20'))!;
    expect(l.mood).toBe(4);
    expect(l.items.map((i) => i.trackerId)).toEqual(['tr-apero', 'tr-cafe']);
    expect(l.feelings).toEqual([{ id: 'hendaye', level: 1 }]);
  });
  it('formulaires adaptés : SPM et règles ne demandent pas « avec qui »', () => {
    expect(formOf(T('tr-spm', 'cycle'))).toBe('pms');
    expect(formOf(T('tr-regles', 'cycle'))).toBe('period');
    expect(formOf(T('tr-apero', 'sorties'))).toBe('outing');
    expect(formOf(T('custom', 'sorties'))).toBe('outing');
    expect(formOf(T('custom2', 'maison'))).toBe('simple');
    expect(formOf(T('tr-spm', 'cycle', { form: 'simple' }))).toBe('simple');
  });
  it('« Hendaye » devient un état du jour sans perte', async () => {
    await create<Tracker>('trackers', { id: 'tr-hendaye', name: 'Hendaye', icon: 'rain', color: '#000', group: 'moi', order: 1 } as any);
    await create<DayLog>('daylogs', { id: '2026-11-21', date: '2026-11-21', items: [{ trackerId: 'tr-hendaye' }, { trackerId: 'tr-apero' }], mood: 2 } as any);
    await migrateJournal();
    const l = (await db.daylogs.get('2026-11-21'))!;
    expect(l.items.map((i) => i.trackerId)).toEqual(['tr-apero']);
    expect(l.feelings?.[0].id).toBe('hendaye');
    expect(l.mood).toBe(2);
    expect((await db.trackers.get('tr-hendaye'))!.deleted).toBe(true);
  });
});

describe('journal → budget', () => {
  it('une dépense saisie dans le journal va dans le budget une seule fois, se modifie et se retire', async () => {
    const apero = T('tr-apero', 'sorties', { name: 'Apéro' });
    const item = { trackerId: 'tr-apero', people: ['pe-lea'] };
    const contacts = [P('pe-lea', 'Léa')];
    await setJournalExpense('2026-11-10', apero, 18.5, item, contacts);
    await setJournalExpense('2026-11-10', apero, 18.5, item, contacts);
    await setJournalExpense('2026-11-10', apero, 22, item, contacts);
    const all = (await db.expenses.toArray()).filter((e) => !e.deleted);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: journalExpenseId('2026-11-10', 'tr-apero'), amount: 22, budgetCategoryId: 'bc-sorties', note: 'Apéro · Léa' });
    const data = { incomes: [], fixed: [], payments: [], expenses: all, savings: [], budgetCategories: [] };
    expect(monthSummary(data, '2026-11').variable).toBe(22);
    await setJournalExpense('2026-11-10', apero, undefined, item, contacts);
    expect((await db.expenses.toArray()).filter((e) => !e.deleted)).toHaveLength(0);
  });
});

describe('Life Analytics', () => {
  const trackers = [T('tr-diner', 'sorties'), T('tr-cafe', 'sorties'), T('tr-bureau', 'travail'), T('tr-teletravail', 'travail'), T('tr-sport', 'moi'), T('tr-spm', 'cycle')];
  const contacts = [P('lea', 'Léa'), P('yas', 'Yasmine'), P('bar', 'Le Perchoir', 'place')];
  it('fréquence sur la période ≠ répartition des activités, jours futurs exclus', () => {
    const logs = [
      L('2026-09-01', { items: [{ trackerId: 'tr-diner', people: ['lea'] }, { trackerId: 'tr-bureau' }], mood: 4 }),
      L('2026-09-02', { items: [{ trackerId: 'tr-diner', people: ['lea', 'yas'], places: ['bar'] }, { trackerId: 'tr-teletravail' }], mood: 5 }),
      L('2026-09-03', { items: [{ trackerId: 'tr-diner' }, { trackerId: 'tr-sport' }], feelings: [{ id: 'hendaye', level: 3 }], mood: 2 }),
      L('2026-09-04', { text: 'rien de spécial' }),
    ];
    const a = analyze(periodOf('month', '2026-09-15'), logs, trackers, contacts, [], '2026-12-01');
    expect(a.elapsed).toBe(30);
    expect(a.logged).toBe(4);
    expect(a.completion).toBeCloseTo(4 / 30);
    const resto = a.perTracker.find((p) => p.tracker.id === 'tr-diner')!;
    expect(resto.days).toBe(3);
    expect(resto.freq).toBeCloseTo(0.1); // 3 jours sur 30 = 10 %
    expect(resto.share).toBeCloseTo(3 / 6); // 3 activités sur 6
    expect(a.key.work.days).toBe(2);
    expect(a.key.remote.days).toBe(1);
    expect(a.key.hendaye.days).toBe(1);
    expect(a.key.social.days).toBe(2);
    expect(a.people.map((p) => [p.contact.name, p.days])).toEqual([['Léa', 2], ['Yasmine', 1]]);
    expect(a.places[0].contact.name).toBe('Le Perchoir');
    expect(a.moodAvg).toBe(3.7);
    // Mois en cours : seuls les jours écoulés comptent
    const cur = analyze(periodOf('month', '2026-11-26'), logs, trackers, contacts, [], '2026-11-26');
    expect(cur.elapsed).toBe(26);
  });
  it('semaines et années : bornes justes, changement d’année', () => {
    const w = periodOf('week', '2026-12-31');
    expect([w.from, w.to]).toEqual(['2026-12-28', '2027-01-03']);
    expect(shiftPeriod(periodOf('month', '2026-12-10'), 1).from).toBe('2027-01-01');
    expect(shiftPeriod(periodOf('year', '2026-06-01'), -1).from).toBe('2025-01-01');
    expect(periodOf('year', '2028-02-29').to).toBe('2028-12-31');
  });
  it('les dépenses du journal sont comptées par activité, sans les dépenses supprimées', () => {
    const ex = [
      { id: 'jx-2026-09-01-tr-diner', amount: 30, date: '2026-09-01', journal: { date: '2026-09-01', trackerId: 'tr-diner' } },
      { id: 'jx-2026-09-02-tr-diner', amount: 20, date: '2026-09-02', journal: { date: '2026-09-02', trackerId: 'tr-diner' }, deleted: true },
      { id: 'x', amount: 99, date: '2026-09-02' },
    ] as Expense[];
    const a = analyze(periodOf('month', '2026-09-01'), [], trackers, contacts, ex, '2026-12-01');
    expect(a.spent.total).toBe(30);
  });
});

describe('budget : calculs fiabilisés', () => {
  const inc = { id: 'sal', label: 'Salaire', type: 'salaire', amount: 2000, date: '2026-01-28', frequency: 'monthly', createdAt: 1, updatedAt: 1 } as Income;
  const fix = { id: 'net', label: 'Netflix', amount: 50, date: '2026-01-05', frequency: 'monthly', active: true, createdAt: 1, updatedAt: 1 } as FixedExpense;
  it('montants à la française', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('1 234,56 €')).toBe(1234.56);
    expect(parseAmount('1.234,50')).toBe(1234.5);
    expect(parseAmount('12.345')).toBe(12345);
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('1e3')).toBeUndefined();
    expect(parseAmount('0x10')).toBeUndefined();
    expect(parseAmount('abc')).toBeUndefined();
  });
  it('arrêter un prélèvement ne réécrit pas les mois passés', () => {
    const stopped = { ...fix, active: false, endDate: '2026-03-10' };
    const data = { incomes: [inc], fixed: [stopped], payments: [], expenses: [], savings: [], budgetCategories: [] };
    expect(monthSummary(data, '2026-02').fixedPlanned).toBe(50);
    expect(monthSummary(data, '2026-04').fixedPlanned).toBe(0);
  });
  it('montant réel d’un salaire, confirmation figée, suppression gardée en historique', async () => {
    await create<Income>('incomes', { ...inc } as any);
    const o = financeOccurrencesIn({ incomes: [inc], fixed: [], payments: [] }, '2026-02-01', '2026-02-28')[0];
    await setPaymentAmount(o, 1950);
    let payments = await db.payments.toArray();
    let data = { incomes: [inc], fixed: [], payments, expenses: [], savings: [], budgetCategories: [] };
    expect(monthSummary(data, '2026-02').incomeReceived).toBe(1950);
    // Le salaire passe à 2 100 € : février confirmé reste à 1 950 €
    data = { ...data, incomes: [{ ...inc, amount: 2100 }] };
    expect(monthSummary(data, '2026-02').incomeReceived).toBe(1950);
    expect(monthSummary(data, '2026-03').incomePlanned).toBe(2100);
    // Supprimé : février garde son revenu confirmé
    data = { ...data, incomes: [] };
    expect(monthSummary(data, '2026-02').incomeReceived).toBe(1950);
    // Confirmer fige le montant prévu
    const o2 = financeOccurrencesIn({ incomes: [inc], fixed: [], payments: [] }, '2026-03-01', '2026-03-31')[0];
    await togglePayment(o2);
    payments = await db.payments.toArray();
    expect(payments.find((p) => p.id === paymentId('sal', o2.date))?.actualAmount).toBe(2000);
  });
  it('historique cohérent : revenus − dépenses − épargne = reste ; catégories inconnues regroupées', () => {
    const data = {
      incomes: [inc],
      fixed: [{ ...fix, budgetCategoryId: 'gone' }],
      payments: [] as PaymentStatus[],
      expenses: [{ id: 'e', amount: 100, date: '2026-02-03', budgetCategoryId: 'ghost', createdAt: 1, updatedAt: 1 } as Expense, { id: 'r', amount: -20, date: '2026-02-04', createdAt: 1, updatedAt: 1 } as Expense],
      savings: [{ id: 's', name: 's', target: 1000, contributions: [{ id: 'c', date: '2026-02-10', amount: 200 }], createdAt: 1, updatedAt: 1 } as SavingsGoal],
      budgetCategories: [],
    };
    const h = history(data, '2026-02', 2)[1];
    expect(h.incomePlanned - (h.fixedPlanned + h.variable) - h.savings).toBeCloseTo(h.remainingForecast);
    expect(h.variable).toBe(80); // remboursement de 20 € déduit
    expect(h.byCategory.filter((c) => c.id === '_none')).toHaveLength(1);
  });
});

describe('automatisations', () => {
  it('« Kiné 14h » est un rendez-vous fixe (accents compris), « parcours 14h » non', () => {
    expect(parseQuick('kiné 14h', '2026-11-26').kind).toBe('event');
    expect(parseQuick('Réunion demain 9h', '2026-11-26').kind).toBe('event');
    expect(parseQuick('relire parcours 14h', '2026-11-26').kind).toBeUndefined();
  });
  it('une occurrence cochée sur un autre appareil reste cochée après un report sur ce téléphone', async () => {
    const s = await create<Task>('tasks', { kind: 'task', title: 'Sport', priority: 'should', subtasks: [], status: 'todo', date: '2026-11-01', recurrence: { freq: 'daily', interval: 1 } } as any);
    const v = expandTasks([s], '2026-11-20', '2026-11-20')[0];
    // L'autre appareil a coché l'occurrence (horodatage récent)
    const remote = { ...v, virtual: undefined, recurrence: undefined, status: 'done', doneAt: 5, createdAt: Date.now(), updatedAt: Date.now() } as any;
    const tB = s.updatedAt + 1; // coché sur l'autre appareil AVANT le report fait ici
    remote._ts = Object.fromEntries(Object.keys(remote).map((k) => [k, tB]));
    // Ce téléphone, hors ligne, reporte la même occurrence un peu plus tard
    await new Promise((r) => setTimeout(r, 5));
    const local = await materialize(v, { date: '2026-11-26', originalDate: '2026-11-20' });
    expect(local.id).toBe(occurrenceId(s.id, '2026-11-20'));
    const merged = mergeRecords(local, remote);
    expect(merged.status).toBe('done');
  });
});

describe('citations', () => {
  it('une bibliothèque riche, sans doublon, une citation différente chaque jour pendant toute la liste', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(120);
    expect(new Set(QUOTES).size).toBe(QUOTES.length);
    const seen = new Set<string>();
    for (let d = 0; d < QUOTES.length; d++) {
      const iso = new Date(Date.UTC(2027, 0, 1 + d)).toISOString().slice(0, 10);
      seen.add(quoteOfDay(iso));
    }
    expect(seen.size).toBe(QUOTES.length);
  });
});
