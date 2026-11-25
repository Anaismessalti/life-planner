import { beforeEach, describe, expect, it } from 'vitest';
import { create, db, update } from '../src/db/db';
import type { Task, FixedExpense, Income, Expense, PaymentStatus } from '../src/db/types';
import { occurrences } from '../src/lib/recurrence';
import { expandTasks, runRollover, setDone, occurrenceId } from '../src/lib/tasks';
import { monthSummary, financeOccurrencesIn, paymentId } from '../src/lib/finance';
import { mergeRecords } from '../src/lib/sync/merge';
import { syncOnce, type RemoteAdapter, type RemoteRecord } from '../src/lib/sync/engine';

const task = (p: Partial<Task>) =>
  create<Task>('tasks', { kind: 'task', title: 'T', priority: 'should', subtasks: [], status: 'todo', ...p } as any);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('récurrences', () => {
  it('quotidienne, hebdo, mensuelle, annuelle', () => {
    expect(occurrences('2026-11-01', { freq: 'daily', interval: 2 }, '2026-11-05', '2026-11-10')).toEqual(['2026-11-05', '2026-11-07', '2026-11-09']);
    // lundi et jeudi, une semaine sur deux, à partir du lundi 2 nov 2026
    expect(occurrences('2026-11-02', { freq: 'weekly', interval: 2, byWeekday: [1, 4] }, '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-02', '2026-11-05', '2026-11-16', '2026-11-19', '2026-11-30',
    ]);
    // le 31 → dernier jour des mois courts
    expect(occurrences('2026-01-31', { freq: 'monthly', interval: 1 }, '2026-02-01', '2026-04-30')).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
    expect(occurrences('2024-02-29', { freq: 'yearly', interval: 1 }, '2025-01-01', '2028-12-31')).toEqual(['2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
    expect(occurrences('2026-11-01', { freq: 'daily', interval: 1, until: '2026-11-03' }, '2026-11-01', '2026-11-30')).toHaveLength(3);
  });
});

describe('tâches et calendrier', () => {
  it('une tâche datée apparaît dans les vues jour, semaine et mois (même source)', async () => {
    await task({ title: 'Dentiste', date: '2026-12-10' });
    const all = await db.tasks.toArray();
    expect(expandTasks(all, '2026-12-10', '2026-12-10').map((t) => t.title)).toEqual(['Dentiste']);
    expect(expandTasks(all, '2026-12-07', '2026-12-13')).toHaveLength(1);
    expect(expandTasks(all, '2026-12-01', '2026-12-31')).toHaveLength(1);
  });

  it('cocher une occurrence récurrente ne crée pas de doublon', async () => {
    await task({ title: 'Ménage', date: '2026-11-02', recurrence: { freq: 'weekly', interval: 1 } });
    let all = await db.tasks.toArray();
    const occ = expandTasks(all, '2026-11-09', '2026-11-09')[0];
    expect(occ.virtual).toBe(true);
    await setDone(occ, true);
    await setDone(occ, true);
    all = await db.tasks.toArray();
    const day = expandTasks(all, '2026-11-09', '2026-11-09');
    expect(day).toHaveLength(1);
    expect(day[0].status).toBe('done');
    expect(all).toHaveLength(2); // la série + une seule occurrence matérialisée
    expect(expandTasks(all, '2026-11-01', '2026-11-30')).toHaveLength(5);
  });

  it('report automatique : date initiale, historique, échéance intacte, rendez-vous fixes, désactivation', async () => {
    const a = await task({ title: 'Impôts', date: '2026-11-20', dueDate: '2026-11-22' });
    const done = await task({ title: 'Fait', date: '2026-11-20', status: 'done' });
    const rdv = await task({ title: 'Médecin', kind: 'event', date: '2026-11-20', time: '10:00' });
    const noAuto = await task({ title: 'Pas de report', date: '2026-11-20', autoPostpone: false });

    const r1 = await runRollover('2026-11-25');
    expect(r1.moved).toBe(1);
    const A = (await db.tasks.get(a.id))!;
    expect(A.date).toBe('2026-11-25');
    expect(A.originalDate).toBe('2026-11-20');
    expect(A.dueDate).toBe('2026-11-22');
    expect(A.postponeHistory).toHaveLength(1);
    expect((await db.tasks.get(done.id))!.date).toBe('2026-11-20');
    expect((await db.tasks.get(rdv.id))!.date).toBe('2026-11-20');
    expect((await db.tasks.get(noAuto.id))!.date).toBe('2026-11-20');

    // relancer le même jour : rien ne bouge (idempotent)
    expect((await runRollover('2026-11-25')).moved).toBe(0);
    // le lendemain : nouvel historique, date initiale conservée
    await runRollover('2026-11-26');
    const A2 = (await db.tasks.get(a.id))!;
    expect(A2.originalDate).toBe('2026-11-20');
    expect(A2.postponeHistory!.map((h) => h.from)).toEqual(['2026-11-20', '2026-11-25']);
    expect(await db.tasks.count()).toBe(4);
  });

  it('report des séries : une seule occurrence, sans doublon, et pas pour les séries quotidiennes', async () => {
    const weekly = await task({ title: 'Courses', date: '2026-11-02', recurrence: { freq: 'weekly', interval: 1 } });
    await task({ title: 'Vitamines', date: '2026-11-01', recurrence: { freq: 'daily', interval: 1 } });
    // lundi 23 manqué, on ouvre l'app le mercredi 25
    await runRollover('2026-11-22');
    await runRollover('2026-11-25');
    await runRollover('2026-11-25');
    const all = await db.tasks.toArray();
    const inst = all.filter((t) => t.seriesId === weekly.id);
    expect(inst).toHaveLength(1);
    // la première occurrence manquée (16 nov.) est reportée une seule fois, sans accumulation
    expect(inst[0].id).toBe(occurrenceId(weekly.id, '2026-11-16'));
    expect(inst[0].date).toBe('2026-11-25');
    expect(inst[0].originalDate).toBe('2026-11-16');
    const today = expandTasks(all, '2026-11-25', '2026-11-25');
    expect(today.map((t) => t.title).sort()).toEqual(['Courses', 'Vitamines']);
  });
});

describe('budget', () => {
  it('prélèvements récurrents aux bonnes dates et calculs exacts', async () => {
    await create<Income>('incomes', { label: 'Salaire', type: 'salaire', amount: 2500, date: '2026-01-28', frequency: 'monthly' } as any);
    const loyer = await create<FixedExpense>('fixedExpenses', { label: 'Loyer', amount: 850.5, date: '2026-01-05', frequency: 'monthly', active: true, budgetCategoryId: 'bc-logement' } as any);
    await create<FixedExpense>('fixedExpenses', { label: 'Assurance', amount: 120, date: '2026-03-15', frequency: 'quarterly', active: true } as any);
    await create<Expense>('expenses', { amount: 42.3, date: '2026-12-03', budgetCategoryId: 'bc-restaurants' } as any);
    await create<Expense>('expenses', { amount: 7.7, date: '2026-12-31' } as any);
    await create<PaymentStatus>('payments', { id: paymentId(loyer.id, '2026-12-05'), refId: loyer.id, refType: 'fixed', date: '2026-12-05', status: 'paid' } as any);

    const data = {
      incomes: await db.incomes.toArray(), fixed: await db.fixedExpenses.toArray(), payments: await db.payments.toArray(),
      expenses: await db.expenses.toArray(), savings: [], budgetCategories: [],
    };
    const occ = financeOccurrencesIn(data, '2026-12-01', '2026-12-31');
    expect(occ.map((o) => `${o.label}@${o.date}`)).toEqual(['Loyer@2026-12-05', 'Assurance@2026-12-15', 'Salaire@2026-12-28']);
    const s = monthSummary(data as any, '2026-12');
    expect(s.incomePlanned).toBe(2500);
    expect(s.incomeReceived).toBe(0); // non confirmé = pas considéré comme reçu
    expect(s.fixedPlanned).toBe(970.5);
    expect(s.fixedPaid).toBe(850.5);
    expect(s.fixedPending).toBe(120);
    expect(s.variable).toBe(50);
    expect(s.remainingForecast).toBe(1479.5);
    expect(s.remainingActual).toBe(-900.5);
    // novembre : pas d'assurance (trimestrielle : mars, juin, sept, déc)
    expect(monthSummary(data as any, '2026-11').fixedPlanned).toBe(850.5);
  });
});

describe('synchronisation', () => {
  it('fusion champ par champ : deux modifications hors ligne sont conservées', () => {
    const base = { id: 'x', createdAt: 1, updatedAt: 1, title: 'A', date: '2026-01-01', _ts: { title: 1, date: 1 } };
    const iphone = { ...base, title: 'B', updatedAt: 5, _ts: { title: 5, date: 1 } };
    const mac = { ...base, date: '2026-02-02', updatedAt: 6, _ts: { title: 1, date: 6 } };
    const m1 = mergeRecords(iphone as any, mac as any) as any;
    const m2 = mergeRecords(mac as any, iphone as any) as any;
    expect(m1.title).toBe('B');
    expect(m1.date).toBe('2026-02-02');
    expect(m2).toEqual(m1);
  });

  it('aller-retour complet avec un serveur simulé, sans perte', async () => {
    const server = new Map<string, RemoteRecord & { srv: number }>();
    let clock = 1000;
    const remote: RemoteAdapter = {
      async push(rs) { for (const r of rs) server.set(`${r.table}__${r.record.id}`, { ...structuredClone(r), srv: ++clock }); },
      async pull(cursor) {
        const rs = [...server.values()].filter((r) => r.srv > cursor);
        return { records: rs.map(({ table, record }) => ({ table, record: structuredClone(record) })), cursor: Math.max(cursor, ...rs.map((r) => r.srv)) };
      },
    };
    const t = await task({ title: 'Courses', date: '2026-12-01' });
    await create('notes', { title: 'Recette', url: 'https://www.tiktok.com/@x/video/1', tags: [], favorite: true } as any);
    expect(await syncOnce(remote)).toMatchObject({ pushed: 2 });
    expect(await db.outbox.count()).toBe(0);

    // Simule un autre appareil qui modifie la date sur le serveur
    const k = `tasks__${t.id}`;
    const srvRec = server.get(k)!;
    srvRec.record = { ...srvRec.record, date: '2026-12-02', updatedAt: Date.now() + 10, _ts: { ...srvRec.record._ts, date: Date.now() + 10 } } as any;
    srvRec.srv = ++clock;
    // …pendant que cet appareil modifie le titre hors ligne
    await update<Task>('tasks', t.id, { title: 'Courses bio' });
    await syncOnce(remote);
    const local = (await db.tasks.get(t.id))!;
    expect(local.title).toBe('Courses bio');
    expect(local.date).toBe('2026-12-02');
    expect((server.get(k)!.record as any).title).toBe('Courses bio');

    // Nouvel appareil vide : récupère tout
    await Promise.all(db.tables.map((tb) => tb.clear()));
    await syncOnce(remote);
    expect(await db.tasks.count()).toBe(1);
    expect((await db.notes.toArray())[0].title).toBe('Recette');
  });
});
