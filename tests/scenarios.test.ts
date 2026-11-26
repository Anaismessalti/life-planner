// Audit de novembre 2026 : priorités et report, rendez-vous vécus, budget dépassé, habitudes à la semaine, bilan et croisements.
import { beforeEach, describe, expect, it } from 'vitest';
import { create, db } from '../src/db/db';
import type { BudgetCategory, DayLog, Expense, Project, Task, Tracker } from '../src/db/types';
import { setOutcome } from '../src/lib/agenda';
import { analyze, periodOf } from '../src/lib/analytics';
import { normalizeHabits, weekStatus } from '../src/lib/bridge';
import { addDays, range } from '../src/lib/dates';
import { limitFor, limitsPatch, monthSummary } from '../src/lib/finance';
import { parseQuick } from '../src/lib/parse';
import { balance, buildReview, crossings, habitsOver } from '../src/lib/review';
import { DEMOTE_AFTER, expandTasks, needsOutcome, runRollover } from '../src/lib/tasks';

const task = (p: Partial<Task>) => create<Task>('tasks', { kind: 'task', title: 'T', priority: 'should', subtasks: [], status: 'todo', ...p } as any);
const T = (id: string, group: Tracker['group'], name = id): Tracker => ({ id, name, icon: 'star', color: '#000', order: 0, group, createdAt: 1, updatedAt: 1 }) as Tracker;
const L = (date: string, p: Partial<DayLog>): DayLog => ({ id: date, date, items: [], createdAt: 1, updatedAt: 1, ...p }) as DayLog;
const cat = (p: Partial<BudgetCategory>): BudgetCategory => ({ id: 'resto', name: 'Restaurants', color: '#000', icon: 'x', kind: 'variable', order: 0, createdAt: 1, updatedAt: 1, ...p }) as BudgetCategory;
const exp = (id: string, amount: number, date: string, budgetCategoryId = 'resto'): Expense => ({ id, amount, date, budgetCategoryId, createdAt: 1, updatedAt: 1 }) as Expense;
const fin = (budgetCategories: BudgetCategory[], expenses: Expense[]) => ({ incomes: [], fixed: [], payments: [], expenses, savings: [], budgetCategories });

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('priorités et report automatique', () => {
  it('« absolument » et « rapidement » passent au lendemain en gardant leur priorité ; « sans urgence » va dans « Plus tard »', async () => {
    const must = await task({ title: 'Payer le loyer', priority: 'must', date: '2026-11-24', time: '09:00' });
    const should = await task({ title: 'Appeler la banque', priority: 'should', date: '2026-11-24' });
    const could = await task({ title: 'Trier les photos', priority: 'could', date: '2026-11-24' });
    await runRollover('2026-11-25');
    const M = (await db.tasks.get(must.id))!;
    expect(M.date).toBe('2026-11-25');
    expect(M.priority).toBe('must');
    expect(M.time).toBeUndefined(); // l'heure d'origine n'a plus de sens le lendemain
    expect((await db.tasks.get(should.id))!).toMatchObject({ date: '2026-11-25', priority: 'should' });
    const C = (await db.tasks.get(could.id))!;
    expect(C.date).toBeUndefined();
    expect(C.originalDate).toBe('2026-11-24');
    expect(await db.tasks.count()).toBe(3);
  });

  it('« rapidement » reportée trop souvent rejoint « Plus tard » ; une échéance proche passe en « absolument »', async () => {
    const tired = await task({ title: 'Commander les lunettes', priority: 'should', date: '2026-11-24', postponeCount: DEMOTE_AFTER });
    const due = await task({ title: 'Déclaration', priority: 'could', date: '2026-11-24', dueDate: '2026-11-26' });
    await runRollover('2026-11-25');
    const tiredNow = (await db.tasks.get(tired.id))!;
    expect(tiredNow.date).toBeUndefined();
    expect(tiredNow.priority).toBe('could');
    expect((await db.tasks.get(due.id))!).toMatchObject({ date: '2026-11-25', priority: 'must' });
  });

  it('les tâches d’un projet en pause ne se reportent pas', async () => {
    const p = await create<Project>('projects', { title: 'Thèse', status: 'paused', milestones: [] } as any);
    const t = await task({ title: 'Relire chap. 2', projectId: p.id, date: '2026-11-24' });
    await runRollover('2026-11-25');
    expect((await db.tasks.get(t.id))!.date).toBe('2026-11-24');
  });

  it('saisie rapide : « ~ » et « sans urgence », et « appeler » n’est jamais un rendez-vous', () => {
    expect(parseQuick('Trier photos ~').priority).toBe('could');
    expect(parseQuick('Ranger le placard sans urgence').priority).toBe('could');
    expect(parseQuick('Appeler le dentiste demain 14h').kind).not.toBe('event');
  });
});

describe('rendez-vous vécus', () => {
  it('5 restos prévus, 2 annulés : 3 comptent, et le journal suit', async () => {
    await db.trackers.put(T('tr-diner', 'sorties', 'Dîner'));
    const ids: string[] = [];
    for (const d of ['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12', '2026-11-16']) ids.push((await task({ title: 'Dîner resto', kind: 'event', date: d, time: '20:00' })).id);
    const all = await db.tasks.toArray();
    expect(all.filter((t) => needsOutcome(t, '2026-11-20'))).toHaveLength(5);
    for (const [i, id] of ids.entries()) await setOutcome((await db.tasks.get(id))!, i < 3 ? 'happened' : 'cancelled');
    const logs = await db.daylogs.toArray();
    expect(logs.filter((l) => l.items.some((i) => i.trackerId === 'tr-diner'))).toHaveLength(3);
    const a = analyze(periodOf('month', '2026-11-10'), logs, await db.trackers.toArray(), [], [], '2026-11-20', null, { tasks: await db.tasks.toArray(), categories: [] });
    expect(a.agenda!.events).toBe(3);
    expect(a.agenda!.cancelled).toBe(2);
    expect(a.key.resto.days).toBe(3);
    // Un dîner confirmé puis finalement annulé disparaît du journal
    await setOutcome((await db.tasks.get(ids[0]))!, 'cancelled');
    expect((await db.daylogs.get('2026-11-02'))!.items).toHaveLength(0);
  });

  it('un rendez-vous déplacé n’est compté qu’une fois', async () => {
    const e = await task({ title: 'Brunch', kind: 'event', date: '2026-11-07', originalDate: '2026-11-06', outcome: 'happened' });
    const a = analyze(periodOf('month', '2026-11-10'), [], [], [], [], '2026-11-20', null, { tasks: [e], categories: [] });
    expect(a.agenda!.events).toBe(1);
    expect(expandTasks([e], '2026-11-01', '2026-11-30')).toHaveLength(1);
  });

  it('un rendez-vous d’aujourd’hui ne demande confirmation qu’une fois terminé', () => {
    const t = { id: 'e', kind: 'event', date: '2026-11-26', time: '12:00', duration: 90 } as Task;
    expect(needsOutcome(t, '2026-11-26', 13 * 60)).toBe(false);
    expect(needsOutcome(t, '2026-11-26', 13 * 60 + 30)).toBe(true);
  });
});

describe('budget dépassé', () => {
  it('200 € prévus, 235 € dépensés : 117,5 %, dépassé de 35 €, la barre ne s’arrête pas à 100 %', () => {
    const s = monthSummary(fin([cat({ monthlyLimit: 200 })], [exp('a', 150, '2026-11-03'), exp('b', 85, '2026-11-12')]), '2026-11', { today: '2026-11-20' });
    const c = s.byCategory.find((x) => x.id === 'resto')!;
    expect(c.amount).toBe(235);
    expect(c.limit).toBe(200);
    expect(c.used).toBeCloseTo(1.175);
    expect(c.over).toBe(35);
    expect(c.left).toBeUndefined(); // rien « à dépenser » : on affiche le dépassement, pas un reste négatif
  });

  it('changer un plafond en cours de mois ne réécrit pas les mois passés', () => {
    const c0 = cat({ monthlyLimit: 200 });
    const c1 = { ...c0, ...limitsPatch(c0, '2026-11', 300) };
    expect(limitFor(c1, '2026-10')).toBe(200);
    expect(limitFor(c1, '2026-11')).toBe(300);
    expect(limitFor(c1, '2027-01')).toBe(300);
    // le dépassement d'octobre reste visible
    const oct = monthSummary(fin([c1], [exp('a', 250, '2026-10-10')]), '2026-10').byCategory.find((x) => x.id === 'resto')!;
    expect(oct.over).toBe(50);
  });

  it('projection de fin de mois et remboursement', () => {
    const s = monthSummary(fin([cat({ monthlyLimit: 300 })], [exp('a', 200, '2026-11-05'), exp('r', -20, '2026-11-08')]), '2026-11', { today: '2026-11-15' });
    const c = s.byCategory.find((x) => x.id === 'resto')!;
    expect(c.amount).toBe(180);
    expect(c.projected).toBeGreaterThan(300); // 180 € en 15 jours → environ 360 € sur 30 jours
  });
});

describe('habitudes à la semaine', () => {
  const trackers = [T('tr-sport', 'moi', 'Sport'), T('tr-lecture', 'moi', 'Lecture')];
  it('fait, renseigné sans, non renseigné : trois états distincts ; une journée douce allège l’objectif', () => {
    const logs = [
      L('2026-11-23', { items: [{ trackerId: 'tr-sport' }] }),
      L('2026-11-24', { mood: 3 }),
      L('2026-11-25', { soft: true }),
    ];
    const by = new Map(logs.map((l) => [l.date, l]));
    const [w] = weekStatus(normalizeHabits([{ id: 'tr-sport', perWeek: 3 }]), by, '2026-11-26', trackers);
    expect(w.days.map((d) => d.state)).toEqual(['done', 'logged', 'soft', 'future', 'future', 'future', 'future']);
    expect(w.done).toBe(1);
    expect(w.target).toBe(3); // ceil(3 × 6/7)
    const many = new Map(['2026-11-23', '2026-11-24', '2026-11-25'].map((d) => [d, L(d, { soft: true })]));
    expect(weekStatus(normalizeHabits([{ id: 'tr-sport', perWeek: 3 }]), many, '2026-11-26', trackers)[0].target).toBe(2);
  });

  it('reprise en douceur après une interruption, jamais de série perdue', () => {
    const by = new Map([['2026-11-10', L('2026-11-10', { items: [{ trackerId: 'tr-lecture' }] })]]);
    const [w] = weekStatus(normalizeHabits(['tr-lecture']), by, '2026-11-26', trackers);
    expect(w.comeback).toBe(true);
    expect(w.days.filter((d) => d.state === 'empty')).toHaveLength(3); // lundi, mardi, mercredi non renseignés
  });

  it('anciens réglages (liste d’identifiants) relus sans perte', () => {
    expect(normalizeHabits(['tr-sport', 'tr-sport', { id: 'tr-lecture', perWeek: 12 }])).toEqual([
      { id: 'tr-sport', perWeek: 3 },
      { id: 'tr-lecture', perWeek: 7 },
    ]);
  });
});

describe('bilan du mois', () => {
  const trackers = [T('tr-sport', 'moi', 'Sport'), T('tr-soiree', 'sorties', 'Soirée'), T('tr-bureau', 'travail', 'Bureau')];
  /** Trois mois « normaux » (sport 1 jour sur 3), puis un mois avec deux fois plus de sport. */
  const month = (m: string, sportEvery: number, days = 30) =>
    range(`${m}-01`, addDays(`${m}-01`, days - 1)).map((d, i) => L(d, { mood: 3, items: [{ trackerId: 'tr-bureau' }, ...(i % sportEvery === 0 ? [{ trackerId: 'tr-sport' }] : [])] }));
  const logs = [...month('2026-08', 3), ...month('2026-09', 3), ...month('2026-10', 3), ...month('2026-11', 1, 20)];
  const run = (p: ReturnType<typeof periodOf>) => analyze(p, logs, trackers, [], [], '2026-11-20');

  it('compare au rythme habituel, au même nombre de jours renseignés', () => {
    const a = run(periodOf('month', '2026-11-10'));
    const history = ['2026-10-10', '2026-09-10', '2026-08-10'].map((d) => run(periodOf('month', d)));
    const r = buildReview(a, history, { habits: habitsOver(a, [{ id: 'tr-sport', perWeek: 3 }]) });
    expect(r.title).toBe('Mon mois en bref');
    expect(r.coverage).toMatchObject({ logged: 20, elapsed: 20, partial: false });
    expect(r.lived.join(' ')).toContain('Plus de sport que d\'habitude : 20 jours, contre environ 7');
    expect(r.done.join(' ')).toContain('Sport : 20 fois, objectif tenu');
    // l'humeur 3 sur 20 jours : un mois en demi-teinte
    expect(r.lived[0]).toMatch(/^Un mois en demi-teinte : humeur moyenne 3\/5 sur 20 jours notés \(d'habitude 3\)/);
  });

  it('un mois peu renseigné est signalé comme partiel et ne compare rien', () => {
    const sparse = analyze(periodOf('month', '2026-11-10'), [...month('2026-10', 3), L('2026-11-03', { mood: 4 })], trackers, [], [], '2026-11-20');
    const r = buildReview(sparse, []);
    expect(r.coverage.partial).toBe(true);
    expect(r.lived.join(' ')).toContain('trop peu');
    expect(r.ideas.join(' ')).toContain('Noter même une seule chose');
  });

  it('les jours d’avant la première utilisation ne comptent pas comme non renseignés', () => {
    const a = analyze(periodOf('month', '2026-11-10'), [L('2026-11-15', { mood: 4 }), L('2026-11-16', { mood: 4 })], trackers, [], [], '2026-11-20');
    expect(a.elapsed).toBe(6);
    expect(a.completion).toBeCloseTo(2 / 6);
  });

  it('un journal tout neuf (1 jour sur 1) ne parle pas de 100 % : « Jour 1 de ton journal »', () => {
    const a = analyze(periodOf('month', '2026-11-20'), [L('2026-11-20', { mood: 4 })], trackers, [], [], '2026-11-20');
    expect(a.elapsed).toBe(1);
    const r = buildReview(a, []);
    expect(r.coverage.partial).toBe(false);
    expect(r.coverage.text).toContain('Jour 1 de ton journal');
    expect(r.coverage.text).not.toContain('%');
  });

  it('équilibre en part des jours renseignés, avec le repère habituel', () => {
    const a = run(periodOf('month', '2026-11-10'));
    const history = ['2026-10-10', '2026-09-10', '2026-08-10'].map((d) => run(periodOf('month', d)));
    const b = balance(a, trackers, history);
    expect(b.find((p) => p.id === 'travail')!.share).toBe(1);
    expect(b.find((p) => p.id === 'perso')!.share).toBe(1);
    expect(b.find((p) => p.id === 'perso')!.usual).toBeCloseTo(10 / 30);
  });

  it('le budget du mois apparaît en phrases, sans jamais toucher au plafond', () => {
    const a = run(periodOf('month', '2026-11-10'));
    const budget = monthSummary(fin([cat({ monthlyLimit: 200 })], [exp('a', 235, '2026-11-03')]), '2026-11', { today: '2026-11-20' }).byCategory;
    const r = buildReview(a, [], { budget });
    expect(r.money[0]).toMatch(/^Tu as dépassé ton budget restaurants de 35/);
  });
});

describe('croisements', () => {
  const trackers = [T('tr-sport', 'moi', 'Sport'), T('tr-soiree', 'sorties', 'Soirée')];
  const days = range('2026-09-01', '2026-11-20');
  it('signale un écart net sur assez de jours, et rien quand l’échantillon est trop petit', () => {
    const logs = days.map((d, i) => (i % 3 === 0 ? L(d, { mood: i % 2 ? 4 : 5, items: [{ trackerId: 'tr-sport' }] }) : L(d, { mood: i % 2 ? 3 : 4 })));
    const c = crossings(logs, trackers, '2026-11-20');
    expect(c[0].id).toBe('tr-sport');
    expect(c[0].text).toContain('Les jours avec « Sport », ton humeur moyenne est de 4,5/5, contre 3,5');
    const few = logs.map((l, i) => (i % 3 === 0 && i > 15 ? { ...l, items: [] } : l));
    expect(crossings(few, trackers, '2026-11-20').find((x) => x.id === 'tr-sport')).toBeUndefined();
  });

  it('pas de croisement quand les humeurs ne diffèrent pas vraiment', () => {
    const logs = days.map((d, i) => L(d, { mood: (i % 5) + 1, items: i % 3 === 0 ? [{ trackerId: 'tr-sport' }] : [] }));
    expect(crossings(logs, trackers, '2026-11-20')).toEqual([]);
  });

  it('soirée puis lendemain HENDAYE', () => {
    const logs = days.map((d, i) =>
      L(d, { mood: 3, items: i % 7 === 0 ? [{ trackerId: 'tr-soiree' }] : [], feelings: i % 7 === 1 ? [{ id: 'hendaye', level: 2 }] : [] } as any),
    );
    const h = crossings(logs, trackers, '2026-11-20').find((x) => x.id === 'hendaye')!;
    expect(h.text).toMatch(/^Après une soirée, le lendemain est HENDAYE 100 % du temps, contre 0 %/);
  });
});

describe('déplacer', () => {
  it('un rendez-vous déplacé garde sa date de départ, change d’heure et n’est compté qu’une fois', async () => {
    const { reschedule, undoReschedule } = await import('../src/lib/agenda');
    const e = await task({ title: 'Kiné', kind: 'event', date: '2026-11-19', time: '14:00' });
    const moved = await reschedule(e, '2026-11-28', '15:30', '2026-11-26');
    expect(moved).toMatchObject({ date: '2026-11-28', time: '15:30', originalDate: '2026-11-19', postponeCount: 1 });
    expect(needsOutcome(moved, '2026-11-26')).toBe(false);
    const a = analyze(periodOf('month', '2026-11-10'), [], [], [], [], '2026-11-26', null, { tasks: await db.tasks.toArray(), categories: [] });
    expect(a.agenda!.planned).toBe(0);
    expect(a.agenda!.upcoming).toBe(1);
    await undoReschedule(e);
    const back = (await db.tasks.get(e.id))!;
    expect(back.date).toBe('2026-11-19');
    expect(back.time).toBe('14:00');
    expect(back.originalDate).toBeUndefined();
    expect(await db.tasks.count()).toBe(1);
  });

  it('un rendez-vous confirmé puis déplacé dans le futur redevient « à venir » et quitte le journal', async () => {
    const { reschedule } = await import('../src/lib/agenda');
    await db.trackers.put(T('tr-diner', 'sorties', 'Dîner'));
    const e = await task({ title: 'Dîner resto', kind: 'event', date: '2026-11-20' });
    const done = await setOutcome(e, 'happened');
    expect((await db.daylogs.get('2026-11-20'))!.items).toHaveLength(1);
    const moved = await reschedule(done, '2026-11-30', undefined, '2026-11-26');
    expect(moved.outcome).toBeUndefined();
    expect((await db.daylogs.get('2026-11-20'))!.items).toHaveLength(0);
  });

  it('une tâche de « Plus tard » reçoit une date', async () => {
    const { reschedule } = await import('../src/lib/agenda');
    const t = await task({ title: 'Trier photos', priority: 'could' });
    const m = await reschedule(t, '2026-12-02', undefined, '2026-11-26');
    expect(m.date).toBe('2026-12-02');
    expect(m.originalDate).toBeUndefined();
  });
});

describe('configuration Firebase collée', () => {
  it('accepte le bloc complet de Firebase, et les guillemets typographiques', async () => {
    const { parseConfig } = await import('../src/lib/sync/firebase');
    const full = `import { initializeApp } from "firebase/app";\nconst firebaseConfig = {\n  apiKey: "AIzaSyTestTestTestTestTestTestTest-1234",\n  authDomain: "p.firebaseapp.com",\n  projectId: "p",\n  appId: "1:2:web:3"\n};\nconst app = initializeApp(firebaseConfig);`;
    expect(parseConfig(full)).toMatchObject({ apiKey: 'AIzaSyTestTestTestTestTestTestTest-1234', projectId: 'p', appId: '1:2:web:3' });
    expect(parseConfig(full.replace(/"/g, '“'))).toMatchObject({ projectId: 'p' });
    expect(parseConfig('const firebaseConfig = { … }')).toBeNull();
  });
});

describe('configuration Firebase : copier-coller abîmé', () => {
  it('répare les tirets typographiques et les espaces invisibles, refuse une clé tronquée', async () => {
    const { parseConfig } = await import('../src/lib/sync/firebase');
    const c = parseConfig('{ apiKey: "AIzaSyCwBtwUdBlqeLCxd–KnsjugM4aykF1m_XE​", projectId: "p", appId: "1:2:web:3" }');
    expect(c!.apiKey).toBe('AIzaSyCwBtwUdBlqeLCxd-KnsjugM4aykF1m_XE');
    expect(parseConfig('{ apiKey: "AIza…", projectId: "p", appId: "1:2:web:3" }')).toBeNull();
  });
});
