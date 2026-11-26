// Déplacer un rendez-vous ou une tâche : des dates en un geste, ou une date précise, et l'heure pour un rendez-vous.
import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { reschedule, undoReschedule } from '../lib/agenda';
import { addDays, capitalize, fmt, relativeDay, weekStart } from '../lib/dates';
import type { TaskView } from '../lib/tasks';
import { Sheet, toast } from './ui';

export function quickDates(today: string) {
  const monday = addDays(weekStart(today), 7);
  const saturday = addDays(weekStart(today), 5);
  const out: { label: string; date: string }[] = [
    { label: 'Aujourd’hui', date: today },
    { label: 'Demain', date: addDays(today, 1) },
  ];
  if (saturday > addDays(today, 1)) out.push({ label: 'Ce week-end', date: saturday });
  out.push({ label: 'Lundi prochain', date: monday }, { label: 'Dans une semaine', date: addDays(today, 7) });
  return out;
}

export function MoveSheet({ t, today, onClose }: { t: TaskView; today: string; onClose: () => void }) {
  const isEvent = t.kind === 'event';
  const [date, setDate] = useState<string>(t.date && t.date >= today ? t.date : addDays(today, 1));
  const [time, setTime] = useState<string>(t.time || '');
  const changed = date !== t.date || (isEvent && (time || undefined) !== t.time);
  const save = async (d: string | undefined = date) => {
    const before = { ...t };
    await reschedule(t, d, isEvent ? time || undefined : t.time, today);
    onClose();
    toast(d ? `Déplacé au ${fmt(d, 'EEEE d MMMM')}${isEvent && time ? ` à ${time}` : ''}` : 'Rangée dans « Plus tard »', {
      label: 'Annuler',
      run: () => undoReschedule(before),
    });
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={t.date ? (isEvent ? 'Déplacer le rendez-vous' : 'Déplacer la tâche') : 'Choisir une date'}
      footer={
        <button className="btn-primary w-full" disabled={!date || !changed} onClick={() => save()} data-testid="move-save">
          <CalendarDays size={16} />
          {date ? `${t.date ? 'Déplacer' : 'Prévoir'} au ${fmt(date, 'EEEE d MMMM')}${isEvent && time ? ` à ${time}` : ''}` : 'Choisis une date'}
        </button>
      }
    >
      <div className="space-y-4" data-testid="move-sheet">
        <div className="truncate text-sm text-soft">
          {t.title}
          {t.date ? ` · prévu ${relativeDay(t.date, today).toLowerCase()}${t.time ? ` à ${t.time}` : ''}` : ''}
        </div>
        <div className="flex flex-wrap gap-2">
          {quickDates(today).map((q) => (
            <button key={q.label} type="button" className={`chip ${date === q.date ? 'chip-on' : ''}`} onClick={() => setDate(q.date)} data-testid={`move-quick-${q.label}`}>
              {q.label}
            </button>
          ))}
        </div>
        <div className={`grid gap-3 ${isEvent ? 'grid-cols-[1fr_8.75rem]' : 'grid-cols-1'}`}>
          <label className="block space-y-1.5">
            <span className="label">Date</span>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} data-testid="move-date" />
          </label>
          {isEvent && (
            <label className="block space-y-1.5">
              <span className="label">Heure</span>
              <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} data-testid="move-time" />
            </label>
          )}
        </div>
        {date && <p className="text-xs text-soft">{capitalize(relativeDay(date, today))} · {fmt(date, 'EEEE d MMMM yyyy')}</p>}
        {t.date && !isEvent && (
          <button type="button" className="text-xs text-rasp" onClick={() => save(undefined)} data-testid="move-later">
            Pas de date pour l’instant : ranger dans « Plus tard »
          </button>
        )}
      </div>
    </Sheet>
  );
}
