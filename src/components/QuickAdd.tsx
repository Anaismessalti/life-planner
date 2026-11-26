import { CalendarClock, CheckSquare, FolderHeart, HandCoins, Link2, Receipt, StickyNote } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { create } from '../db/db';
import type { Task } from '../db/types';
import { relativeDay, todayISO } from '../lib/dates';
import { parseQuick } from '../lib/parse';
import { closeEditor, openEditor } from '../lib/ui-store';
import { Sheet, toast } from './ui';

const ITEMS = [
  { label: 'Tâche', icon: CheckSquare, run: () => openEditor({ type: 'task' }) },
  { label: 'Rendez-vous', icon: CalendarClock, run: () => openEditor({ type: 'task', defaults: { kind: 'event' } }) },
  { label: 'Projet', icon: FolderHeart, run: () => openEditor({ type: 'project' }) },
  { label: 'Dépense', icon: Receipt, run: () => openEditor({ type: 'expense' }) },
  { label: 'Revenu', icon: HandCoins, run: () => openEditor({ type: 'income' }) },
  { label: 'Note', icon: StickyNote, run: () => openEditor({ type: 'note' }) },
  { label: 'Lien', icon: Link2, run: () => openEditor({ type: 'note', link: true }) },
];

export function QuickAdd() {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Sur iPhone le clavier ne s'ouvre qu'après un geste : on tente quand même le focus.
    setTimeout(() => ref.current?.focus(), 60);
  }, []);
  const today = todayISO();
  const p = text ? parseQuick(text, today) : null;
  const submit = async () => {
    if (!p?.title) return;
    await create<Task>('tasks', {
      kind: 'task',
      title: p.title,
      date: p.date || today,
      time: p.time,
      priority: p.priority || 'should',
      subtasks: [],
      status: 'todo',
    } as any);
    toast(`Ajoutée · ${relativeDay(p.date || today, today)}${p.time ? ' à ' + p.time : ''}`);
    closeEditor();
  };
  return (
    <Sheet open onClose={closeEditor} title="Ajouter">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mb-5"
      >
        <input
          ref={ref}
          className="input py-3 text-lg"
          placeholder="Tâche rapide : « Appeler maman demain 18h »"
          value={text}
          onChange={(e) => setText(e.target.value)}
          enterKeyHint="done"
          data-testid="quick-input"
          aria-label="Tâche rapide"
        />
        <p className="mt-1.5 text-xs text-soft">
          {p && (p.date || p.time || p.priority)
            ? `Compris : ${p.date ? relativeDay(p.date, today) : "aujourd'hui"}${p.time ? ' à ' + p.time : ''}${p.priority ? ' · essentiel' : ''} — Entrée pour valider`
            : 'Astuce : utilise le micro du clavier pour dicter. « ! » = essentiel.'}
        </p>
      </form>
      <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
        {ITEMS.map(({ label, icon: I, run }) => (
          <button key={label} onClick={run} className="flex flex-col items-center gap-1.5 rounded-2xl bg-card p-3 text-xs font-medium text-plum shadow-soft transition active:scale-95" data-testid={`quick-${label}`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blush to-mauve/40">
              <I size={20} strokeWidth={1.75} />
            </span>
            {label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
