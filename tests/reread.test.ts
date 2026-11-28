import { describe, expect, it } from 'vitest';
import type { DayLog } from '../src/db/types';
import { fold, hasWords, readDay, rereadDays, splitMatches } from '../src/lib/reread';

const L = (date: string, extra: Partial<DayLog> = {}): DayLog => ({ id: date, date, items: [], createdAt: 1, updatedAt: 1, ...extra });
const tr = (id: string) => ({ cafe: { name: 'Café', color: '#E0A3C4' }, bar: { name: 'Bar', color: '#A83278' } })[id as 'cafe' | 'bar'];
const ct = (id: string) => ({ lea: 'Léa' })[id as 'lea'];
const days = [
  L('2026-11-20', { title: 'Le jour du Perchoir', items: [{ trackerId: 'bar', detail: 'Fou rire\nsur la terrasse', people: ['lea'] }] }),
  L('2026-11-21', { items: [{ trackerId: 'cafe' }] }), // case cochée seule : rien à relire
  L('2026-11-22', { text: 'Brunch à Pigalle, été indien', fmj: { grateful: ['Ma mère', ''], better: 'Dormir plus tôt' } }),
].map((l) => readDay(l, tr, ct));

describe('Relire ses journées', () => {
  it('garde les commentaires en entier, avec l’activité et les personnes', () => {
    expect(days[0].comments).toEqual([{ trackerId: 'bar', name: 'Bar', color: '#A83278', detail: 'Fou rire\nsur la terrasse', with: ['Léa'] }]);
    expect(days[2].grateful).toEqual(['Ma mère']);
  });

  it('ne montre que les journées écrites, de la plus récente à la plus ancienne', () => {
    expect(hasWords(days[1])).toBe(false);
    expect(rereadDays(days).map((d) => d.date)).toEqual(['2026-11-22', '2026-11-20']);
  });

  it('cherche sans tenir compte des accents ni des majuscules, dans tous les champs', () => {
    expect(rereadDays(days, 'ETE').map((d) => d.date)).toEqual(['2026-11-22']);
    expect(rereadDays(days, 'lea terrasse').map((d) => d.date)).toEqual(['2026-11-20']);
    expect(rereadDays(days, 'dormir').map((d) => d.date)).toEqual(['2026-11-22']);
    expect(rereadDays(days, 'perchoir pigalle')).toEqual([]);
  });

  it('surligne les mots trouvés au bon endroit', () => {
    expect(fold('Été')).toBe('ete');
    expect(splitMatches('Brunch à Pigalle, été', 'ete')).toEqual([
      { s: 'Brunch à Pigalle, ', hit: false },
      { s: 'été', hit: true },
    ]);
  });
});
