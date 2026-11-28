// Sommeil, Five Minute Journal, agenda dans les stats, passerelle rendez-vous → journal, Wrapped, performances.
import { describe, expect, it } from 'vitest';
import type { Category, Contact, DayLog, Task, Tracker } from '../src/db/types';
import { analyze, isLogged, periodOf } from '../src/lib/analytics';
import { mergeItem, suggestFromEvent } from '../src/lib/bridge';
import { addDays, diffDays, weekStart, weekday } from '../src/lib/dates';
import { nextOccurrence, occurrences } from '../src/lib/recurrence';
import { expandTasks } from '../src/lib/tasks';
import { avgBedtime, fmjStreak, fmtDuration, sleepMinutes } from '../src/lib/wellbeing';
import { wrappedCards } from '../src/lib/wrapped';

const T = (id: string, group: Tracker['group'], name = id): Tracker => ({ id, name, icon: 'star', color: '#000', order: 0, group, createdAt: 1, updatedAt: 1 }) as Tracker;
const L = (date: string, p: Partial<DayLog>): DayLog => ({ id: date, date, items: [], createdAt: 1, updatedAt: 1, ...p }) as DayLog;
const P = (id: string, name: string, kind: Contact['kind'] = 'person'): Contact => ({ id, name, kind, icon: 'users', color: '#000', order: 0, createdAt: 1, updatedAt: 1 }) as Contact;
const K = (id: string, p: Partial<Task>): Task => ({ id, title: id, kind: 'task', priority: 'should', subtasks: [], status: 'todo', createdAt: 1, updatedAt: 1, ...p }) as Task;

describe('sommeil', () => {
  it('calcule la nuit à cheval sur minuit et refuse les heures invalides', () => {
    expect(sleepMinutes({ bed: '23:30', wake: '07:15' })).toBe(465);
    expect(sleepMinutes({ bed: '01:00', wake: '09:00' })).toBe(480);
    expect(sleepMinutes({ bed: '25:00', wake: '09:00' })).toBeUndefined();
    expect(sleepMinutes({ bed: '23:00' })).toBeUndefined();
    expect(fmtDuration(465)).toBe('7 h 45');
    expect(fmtDuration(480)).toBe('8 h');
  });
  it("l'heure de coucher moyenne de 23:30 et 00:30 est minuit (pas midi)", () => {
    expect(avgBedtime(['23:30', '00:30'])).toBe('00:00');
    expect(avgBedtime(['22:00', '23:00'])).toBe('22:30');
  });
  it('les stats comptent les nuits, la moyenne et les nuits courtes', () => {
    const logs = [L('2026-10-01', { sleep: { bed: '23:00', wake: '07:00', quality: 4 } }), L('2026-10-02', { sleep: { bed: '02:00', wake: '07:30', quality: 1 } }), L('2026-10-03', { sleep: { quality: 3 } })];
    const a = analyze(periodOf('month', '2026-10-01'), logs, [], [], [], '2026-12-01');
    expect(a.sleep.nights).toBe(3);
    expect(a.sleep.avgMin).toBe(Math.round((480 + 330) / 2));
    expect(a.sleep.short).toBe(1);
    expect(a.sleep.avgQuality).toBe(2.7);
    expect(a.logged).toBe(3); // une nuit seule suffit à rendre le jour « renseigné »
  });
});

describe('Five Minute Journal', () => {
  it('compte les jours, les gratitudes et la série', () => {
    const logs = [
      L('2026-11-24', { fmj: { grateful: ['café', '', 'Léa'] } }),
      L('2026-11-25', { fmj: { amazing: ['soleil'] } }),
      L('2026-11-26', { fmj: { affirmation: 'I am enough' } }),
      L('2026-11-20', { fmj: { grateful: ['  '] } }), // vide : ne compte pas
    ];
    const a = analyze(periodOf('month', '2026-11-26'), logs, [], [], [], '2026-11-26');
    expect(a.fmj.days).toBe(3);
    expect(a.fmj.gratitudes).toBe(2);
    expect(a.fmj.mornings).toBe(2);
    expect(a.fmj.evenings).toBe(1);
    expect(a.fmj.recent.map((r) => r.text)).toEqual(['soleil', 'café', 'Léa']);
    expect(isLogged(logs[3])).toBe(false);
    expect(fmjStreak(logs, '2026-11-26', addDays)).toBe(3);
  });
});

describe('agenda dans les stats du journal', () => {
  it('ne compte que les rendez-vous qui ont eu lieu, et chaque tâche au jour prévu au départ', () => {
    const cats: Category[] = [{ id: 'c1', name: 'Pro', color: '#111', icon: 'x', order: 0, createdAt: 1, updatedAt: 1 }];
    const tasks = [
      K('e1', { kind: 'event', date: '2026-11-03', categoryId: 'c1', outcome: 'happened' }),
      K('e2', { kind: 'event', date: '2026-11-28' }), // à venir
      K('e3', { kind: 'event', date: '2026-11-07', outcome: 'cancelled' }),
      K('e4', { kind: 'event', date: '2026-11-08', outcome: 'noshow' }),
      K('e5', { kind: 'event', date: '2026-11-09' }), // pas encore confirmé : listé, pas compté
      K('t1', { date: '2026-11-04', status: 'done' }),
      // reportée d'octobre à novembre : elle compte pour octobre, pas pour novembre
      K('t2', { date: '2026-11-05', originalDate: '2026-10-30', postponeCount: 2, status: 'done' }),
      K('t3', { date: '2026-11-06', originalDate: '2026-11-05', postponeCount: 1, status: 'done' }),
      K('t4', { date: '2026-11-06', outcome: 'dropped' }),
      K('s1', { date: '2026-11-02', recurrence: { freq: 'weekly', interval: 1 } }), // lundis : 2, 9, 16, 23
      K('x', { kind: 'event', date: '2026-11-06', deleted: true }),
    ];
    const logs = [L('2026-11-03', { mood: 5 }), L('2026-11-04', { mood: 2 })];
    const a = analyze(periodOf('month', '2026-11-10'), logs, [], [], [], '2026-11-26', null, { tasks, categories: cats });
    const g = a.agenda!;
    expect(g.events).toBe(1);
    expect(g.planned).toBe(4);
    expect(g.cancelled).toBe(1);
    expect(g.noshow).toBe(1);
    expect(g.unconfirmed).toBe(1);
    expect(g.upcoming).toBe(1);
    expect(g.tasks).toBe(2); // t1, t3 ; t2 compte en octobre, t4 n'est plus nécessaire
    expect(g.routine).toEqual({ done: 0, total: 4 }); // les 4 lundis, comptés à part
    expect(g.done).toBe(2);
    expect(g.doneLate).toBe(1);
    expect(g.dropped).toBe(1);
    expect(g.postponed).toBe(1);
    // trop peu de jours pour comparer des humeurs : on n'affiche rien
    expect(g.moodWithEvents).toBeUndefined();
    expect(g.byCategory.find((c) => c.id === 'c1')!.events).toBe(1);
    const oct = analyze(periodOf('month', '2026-10-10'), logs, [], [], [], '2026-11-26', null, { tasks, categories: cats });
    expect(oct.agenda!.tasks).toBe(1 + 0);
    expect(oct.agenda!.done).toBe(1);
  });
});

describe('rendez-vous → journal', () => {
  const trackers = [T('tr-diner', 'sorties', 'Dîner'), T('tr-sport', 'moi', 'Sport'), T('tr-medecin', 'sante'), T('tr-date', 'amour'), T('tr-cafe', 'sorties')];
  const contacts = [P('p-lea', 'Léa'), P('p-yas', 'Yasmine'), P('pl-perchoir', 'Le Perchoir', 'place')];
  it('reconnaît l’activité, les amies et le lieu, sans tenir compte des accents', () => {
    const s = suggestFromEvent(K('e', { kind: 'event', title: 'Dîner avec Lea et yasmine', location: 'le perchoir' }), trackers, contacts)!;
    expect(s.tracker.id).toBe('tr-diner');
    expect(s.item.people).toEqual(['p-lea', 'p-yas']);
    expect(s.item.places).toEqual(['pl-perchoir']);
    expect(suggestFromEvent(K('e', { kind: 'event', title: 'Pilates' }), trackers, contacts)!.tracker.id).toBe('tr-sport');
    expect(suggestFromEvent(K('e', { kind: 'event', title: 'Gynéco 14h' }), trackers, contacts)!.tracker.id).toBe('tr-medecin');
    expect(suggestFromEvent(K('e', { kind: 'event', title: 'Appeler la banque' }), trackers, contacts)).toBeUndefined();
    // « Léa » ne doit pas être trouvée dans « Léandre »
    expect(suggestFromEvent(K('e', { kind: 'event', title: 'Café avec Léandre' }), trackers, contacts)!.item.people).toBeUndefined();
  });
  it('complète une activité existante sans rien effacer', () => {
    const items = mergeItem([{ trackerId: 'tr-diner', people: ['p-lea'], detail: 'trop bon' }], { trackerId: 'tr-diner', people: ['p-lea', 'p-yas'] });
    expect(items).toEqual([{ trackerId: 'tr-diner', people: ['p-lea', 'p-yas'], places: undefined, detail: 'trop bon' }]);
  });
});

describe('notes sur 10', () => {
  it('moyenne des journées, meilleures journées et meilleures sorties', () => {
    const trackers = [T('tr-soiree', 'sorties', 'Soirée'), T('tr-diner', 'sorties', 'Dîner')];
    const contacts = [P('p-lea', 'Léa')];
    const logs = [
      L('2026-10-01', { score: 8, items: [{ trackerId: 'tr-soiree', rating: 9, people: ['p-lea'] }] }),
      L('2026-10-02', { score: 5, items: [{ trackerId: 'tr-diner', rating: 6 }, { trackerId: 'tr-soiree', rating: 7 }] }),
      L('2026-10-03', { score: 11 as number }), // invalide : ignorée
    ];
    const a = analyze(periodOf('month', '2026-10-01'), logs, trackers, contacts, [], '2026-12-01');
    expect(a.score.days).toBe(2);
    expect(a.score.avg).toBe(6.5);
    expect(a.score.best[0]).toEqual({ date: '2026-10-01', score: 8 });
    expect(a.rated.count).toBe(3);
    expect(a.rated.avg).toBe(7.3);
    expect(a.rated.top[0].rating).toBe(9);
    expect(a.rated.top[0].with).toEqual(['Léa']);
    // moins de 3 sorties notées pour une activité : pas de moyenne par activité
    expect(a.rated.byTracker).toEqual([]);
    expect(isLogged(L('2026-10-05', { score: 7 }))).toBe(true);
  });
});

describe('Wrapped', () => {
  it('produit des cartes, dont sommeil et gratitudes', () => {
    const logs = [L('2026-10-01', { mood: 5, sleep: { bed: '23:00', wake: '07:00' }, fmj: { grateful: ['a', 'b'] } })];
    const a = analyze(periodOf('month', '2026-10-01'), logs, [], [], [], '2026-12-01');
    const prev = analyze(periodOf('month', '2026-09-01'), [], [], [], [], '2026-12-01');
    const ks = wrappedCards(a, prev).map((c) => c.k);
    expect(ks).toContain('sleep');
    expect(ks).toContain('fmj');
    expect(wrappedCards(prev, prev)).toEqual([]);
  });
});

describe('récurrences hebdomadaires (version rapide)', () => {
  // Ancienne méthode, jour par jour : la référence.
  const slow = (start: string, interval: number, by: number[] | undefined, from: string, to: string) => {
    const out: string[] = [];
    const days = by && by.length ? by : [weekday(start)];
    const ws0 = weekStart(start);
    const lo = from > start ? from : start;
    for (let d = lo; d <= to; d = addDays(d, 1)) {
      const w = Math.round(diffDays(weekStart(d), ws0) / 7);
      if (w % interval === 0 && days.includes(weekday(d))) out.push(d);
    }
    return out;
  };
  it('donne exactement les mêmes dates que la méthode jour par jour', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 16807) % 2147483647), seed % n);
    for (let i = 0; i < 300; i++) {
      const start = addDays('2025-01-01', rnd(500));
      const interval = 1 + rnd(3);
      const by = rnd(3) ? [...new Set([rnd(7), rnd(7), rnd(7)])].slice(0, 1 + rnd(3)) : undefined;
      const from = addDays('2024-12-01', rnd(700));
      const to = addDays(from, rnd(120));
      expect(occurrences(start, { freq: 'weekly', interval, byWeekday: by }, from, to)).toEqual(slow(start, interval, by, from, to));
    }
  });
  it('trouve la prochaine occurrence lointaine', () => {
    expect(nextOccurrence('2020-03-10', { freq: 'yearly', interval: 1 }, '2026-03-11')).toBe('2027-03-10');
    expect(nextOccurrence('2026-01-05', { freq: 'weekly', interval: 2, byWeekday: [1] }, '2026-01-05')).toBe('2026-01-19');
  });
});

describe('performances : plusieurs années de données', () => {
  it('stats d’une année et agenda restent rapides avec 4 ans de journal et 6 000 tâches', () => {
    const trackers = Array.from({ length: 60 }, (_, i) => T(`tr-${i}`, (['sorties', 'moi', 'travail', 'soin'] as const)[i % 4]));
    const contacts = Array.from({ length: 30 }, (_, i) => P(`p-${i}`, `Amie${i}`));
    const logs: DayLog[] = [];
    for (let d = '2023-01-01'; d <= '2026-11-26'; d = addDays(d, 1)) {
      const n = Number(d.slice(8));
      logs.push(
        L(d, {
          mood: 1 + (n % 5),
          items: [0, 1, 2, 3, 4].map((k) => ({ trackerId: `tr-${(n * 7 + k * 11) % 60}`, people: [`p-${(n + k) % 30}`] })),
          feelings: [{ id: 'tired', level: 1 }],
          sleep: { bed: '23:30', wake: '07:30', quality: 3 },
          fmj: { grateful: ['un', 'deux', 'trois'] },
        }),
      );
    }
    const tasks: Task[] = [];
    for (let i = 0; i < 6000; i++) tasks.push(K(`t${i}`, { kind: i % 3 ? 'task' : 'event', date: addDays('2023-01-01', i % 1426), status: i % 2 ? 'done' : 'todo' }));
    for (let i = 0; i < 40; i++) tasks.push(K(`s${i}`, { date: '2023-01-02', recurrence: i % 2 ? { freq: 'weekly', interval: 1, byWeekday: [1, 3, 5] } : { freq: 'daily', interval: 1 } }));
    const t0 = performance.now();
    const a = analyze(periodOf('year', '2026-06-01'), logs, trackers, contacts, [], '2026-11-26', null, { tasks, categories: [] });
    const t1 = performance.now();
    for (let m = 0; m < 6; m++) analyze(periodOf('month', `2026-0${m + 1}-01`), logs, trackers, contacts, [], '2026-11-26');
    const t2 = performance.now();
    const ex = expandTasks(tasks, '2026-01-01', '2026-12-31');
    const t3 = performance.now();
    console.log(`analyse annuelle ${Math.round(t1 - t0)} ms · 6 mois (tendances) ${Math.round(t2 - t1)} ms · agenda annuel ${Math.round(t3 - t2)} ms (${ex.length} éléments)`);
    expect(a.logged).toBe(330);
    expect(t1 - t0).toBeLessThan(1500);
    expect(t2 - t1).toBeLessThan(1500);
    expect(t3 - t2).toBeLessThan(800);
  });
});
