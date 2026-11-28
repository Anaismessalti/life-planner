import { describe, expect, it } from 'vitest';
import { parseQuick } from '../src/lib/parse';

const T = '2026-11-28'; // samedi
const q = (s: string) => parseQuick(s, T);

describe('Saisie rapide', () => {
  it('comprend une date écrite en toutes lettres ou en chiffres', () => {
    expect(q('Rdv coiffeur le 15 décembre 10h')).toMatchObject({ title: 'Rdv coiffeur', date: '2026-12-15', time: '10:00', kind: 'event' });
    expect(q('rdv 2 décembre')).toMatchObject({ date: '2026-12-02', kind: 'event' });
    expect(q('vol le 2 janvier 7h')).toMatchObject({ date: '2027-01-02', time: '07:00' }); // l'an prochain
    expect(q('rdv 15/01 9h')).toMatchObject({ date: '2027-01-15', time: '09:00' });
    expect(q('loyer le 5')).toMatchObject({ title: 'Loyer', date: '2026-12-05' });
  });
  it('distingue une durée d’une heure', () => {
    expect(q('Yoga 1h')).toMatchObject({ title: 'Yoga', duration: 60 });
    expect(q('Yoga 1h').time).toBeUndefined();
    expect(q('sieste 2h30')).toMatchObject({ duration: 150 });
    expect(q('Footing 45 min demain')).toMatchObject({ date: '2026-11-29', duration: 45 });
    expect(q('dîner 20h')).toMatchObject({ time: '20:00', kind: 'event' });
    expect(q('Kiné 9h')).toMatchObject({ time: '09:00' });
  });
  it('comprend une plage horaire', () => {
    expect(q('Cours de 18h à 19h')).toMatchObject({ title: 'Cours', time: '18:00', duration: 60 });
    expect(q('réunion 14h-15h30')).toMatchObject({ time: '14:00', duration: 90 });
  });
  it('garde ce qui marchait déjà', () => {
    expect(q('dentiste mardi 14h30')).toMatchObject({ date: '2026-12-01', time: '14:30', kind: 'event' });
    expect(q('appeler maman demain')).toMatchObject({ title: 'Appeler maman', date: '2026-11-29' });
    expect(q('prendre rdv dentiste demain 10h').kind).toBeUndefined();
    expect(q('Payer loyer!')).toMatchObject({ title: 'Payer loyer', priority: 'must' });
  });
});
