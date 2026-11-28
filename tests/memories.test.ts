import { describe, expect, it } from 'vitest';
import type { DayLog } from '../src/db/types';
import { memoryLine, monthsAgo, onThisDay } from '../src/lib/memories';

const L = (date: string, extra: Partial<DayLog> = {}): DayLog => ({ id: date, date, items: [], createdAt: 1, updatedAt: 1, ...extra });

describe('Ce jour-là', () => {
  it('même jour le mois d’avant, fin de mois comprise', () => {
    expect(monthsAgo('2026-11-27', 1)).toBe('2026-10-27');
    expect(monthsAgo('2026-03-31', 1)).toBe('2026-02-28');
    expect(monthsAgo('2027-01-15', 1)).toBe('2026-12-15');
    expect(monthsAgo('2028-02-29', 12)).toBe('2027-02-28');
  });

  it('remonte la semaine, le mois et l’année quand ces jours ont été notés', () => {
    const logs = [L('2026-11-20', { highlight: 'Fou rire au Perchoir' }), L('2026-10-27', { text: 'Brunch chez Inès' }), L('2025-11-27', { title: 'Le jour de la neige' })];
    const m = onThisDay(logs, '2026-11-27');
    expect(m.map((x) => x.key)).toEqual(['week', 'month', 'year']);
    // une humeur seule ou des cases cochées ne font pas un souvenir
    expect(onThisDay([L('2026-11-20', { mood: 1, items: [{ trackerId: 'tr-spm' }] })], '2026-11-27')).toEqual([]);
    expect(memoryLine(m[2].log, () => undefined)).toBe('Le jour de la neige');
  });

  it('un jour vide n’est pas un souvenir ; sinon un jour marquant plus ancien, toujours le même pour une date', () => {
    const logs = [L('2026-11-20'), L('2026-09-03', { highlight: 'Premier jour du nouveau job' }), L('2026-08-14', { title: 'Hendaye' })];
    const a = onThisDay(logs, '2026-11-27');
    expect(a).toHaveLength(1);
    expect(a[0].key).toBe('random');
    expect(onThisDay(logs, '2026-11-27')[0].date).toBe(a[0].date);
  });

  it('rien à montrer sans journal', () => {
    expect(onThisDay([], '2026-11-27')).toEqual([]);
  });
});
