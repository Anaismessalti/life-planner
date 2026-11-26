import { ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { create, db, uid, update } from '../db/db';
import type { Freq, Priority, Recurrence, Subtask, Task } from '../db/types';
import { addDays, fmt, relativeDay, todayISO } from '../lib/dates';
import { useCategories, useProjects } from '../lib/hooks';
import { parseQuick } from '../lib/parse';
import { describeRecurrence } from '../lib/recurrence';
import { OUTCOME_LABEL, moveJournalWithEvent, setOutcome } from '../lib/agenda';
import { PRIORITY_LABEL, deleteTask, materialize, type TaskView } from '../lib/tasks';
import { closeEditor } from '../lib/ui-store';
import { Icon } from '../lib/icons';
import { ConfirmButton, Field, MonthPicker, Segmented, Sheet, Toggle, toast } from './ui';

type RecMode = 'none' | Freq | 'custom';

const WD_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WD_VALUES = [1, 2, 3, 4, 5, 6, 0];

const EDITABLE: (keyof Task)[] = ['title', 'description', 'categoryId', 'priority', 'date', 'time', 'duration', 'dueDate', 'targetMonth', 'location', 'subtasks', 'recurrence', 'projectId', 'milestoneId', 'autoPostpone', 'remindBefore', 'kind', 'status', 'outcome'];
/** Les champs modifiés dans le formulaire (undefined = effacé). */
function diff(before: Partial<Task>, after: Partial<Task>): Partial<Task> {
  const out: Partial<Task> = {};
  for (const k of EDITABLE) if (JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)) (out as any)[k] = after[k];
  return out;
}
/** Ce qui peut s'appliquer à toute une série : jamais la date, l'état ou l'issue d'une occurrence, ni la suppression de la règle. */
function seriesPatch(changed: Partial<Task>): Partial<Task> {
  const keep: (keyof Task)[] = ['title', 'description', 'categoryId', 'priority', 'time', 'duration', 'location', 'projectId', 'milestoneId', 'autoPostpone', 'remindBefore'];
  const out: Partial<Task> = {};
  for (const k of keep) if (k in changed) (out as any)[k] = changed[k];
  if ('subtasks' in changed) out.subtasks = (changed.subtasks || []).map((x) => ({ ...x, done: false }));
  if (changed.recurrence) out.recurrence = changed.recurrence;
  return out;
}

export function TaskEditor({ task, defaults }: { task?: TaskView; defaults?: Partial<TaskView> }) {
  const isNew = !task;
  const cats = useCategories();
  const projects = useProjects();
  const today = todayISO();
  const init: Partial<Task> = task || { kind: 'task', priority: 'should', subtasks: [], status: 'todo', date: today, ...defaults };
  const [f, setF] = useState<Partial<Task>>(init);
  const [more, setMore] = useState(!isNew || !!defaults?.kind || !!defaults?.projectId || !!defaults?.targetMonth);
  const [applySeries, setApplySeries] = useState(false);
  const [newSub, setNewSub] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<Task>) => setF((x) => ({ ...x, ...p }));
  const isEvent = f.kind === 'event';
  const series = task?.virtual || task?.seriesId ? task.seriesId : undefined;

  useEffect(() => {
    if (isNew) setTimeout(() => titleRef.current?.focus(), 50);
  }, [isNew]);

  const rec = f.recurrence;
  // Le mode « Personnalisée » est mémorisé à part : une règle personnalisée commence comme une règle simple
  // (tous les 1, aucun jour choisi) et ne doit pas rebasculer sur « Chaque semaine ».
  const [customPicked, setCustomPicked] = useState(false);
  const recMode: RecMode = !rec
    ? 'none'
    : customPicked || rec.interval > 1 || (rec.byWeekday && rec.byWeekday.length > 1) || !!rec.until
      ? 'custom'
      : rec.freq;
  const setRecMode = (m: RecMode) => {
    setCustomPicked(m === 'custom');
    if (m === 'none') return set({ recurrence: undefined });
    const base: Recurrence = m === 'custom' ? { freq: 'weekly', interval: 1, byWeekday: [] } : { freq: m, interval: 1 };
    set({ recurrence: base, date: f.date || today });
  };

  const save = async () => {
    let data = { ...f };
    if (isNew) {
      const p = parseQuick(f.title || '', today);
      data = {
        ...data,
        title: p.title,
        date: data.date ?? p.date,
        time: data.time || p.time,
        priority: p.priority || data.priority,
        kind: p.kind || data.kind,
      };
      // Les mots « demain », « 14h »… l'emportent sur la date par défaut
      if (p.date) data.date = p.date;
    }
    if (!data.title?.trim()) {
      titleRef.current?.focus();
      return;
    }
    if (data.recurrence && !data.date) data.date = today;
    if (data.kind === 'event' && !data.date) data.date = today;
    if (data.date) data.targetMonth = data.targetMonth && !data.date ? data.targetMonth : undefined;

    // Un rendez-vous ajouté après coup (date passée) a forcément eu lieu.
    if (isNew && data.kind === 'event' && data.date && data.date < today && !data.outcome) data.outcome = 'happened';

    if (isNew) {
      const saved = await create<Task>('tasks', data as any);
      if (saved.outcome === 'happened') await setOutcome(saved, 'happened');
      toast(isEvent ? (data.date && data.date < today ? 'Rendez-vous ajouté à ton historique' : 'Rendez-vous ajouté') : data.date ? `Tâche ajoutée · ${relativeDay(data.date, today)}` : 'Tâche ajoutée à « Plus tard »');
    } else {
      // Seuls les champs réellement modifiés sont envoyés : un « fait » coché sur un autre appareil n'est jamais écrasé.
      const changed = diff(task!, data);
      if (task!.virtual) {
        if (applySeries && series) {
          await update<Task>('tasks', series, seriesPatch(changed));
          if (data.date !== task!.occurrenceDate) await materialize(task!, { date: data.date });
        } else await materialize(task!, changed);
      } else {
        if (Object.keys(changed).length) await update<Task>('tasks', task!.id, changed);
        if (applySeries && series) await update<Task>('tasks', series, seriesPatch(changed));
      }
      const after = await db.tasks.get(task!.id);
      if (after && 'date' in changed) await moveJournalWithEvent(after, task!.date);
      if (after && 'outcome' in changed && after.kind === 'event') await setOutcome(after, after.outcome);
    }
    closeEditor();
  };

  const addSub = () => {
    if (!newSub.trim()) return;
    set({ subtasks: [...(f.subtasks || []), { id: uid(), title: newSub.trim(), done: false }] });
    setNewSub('');
  };
  const setSub = (id: string, p: Partial<Subtask>) => set({ subtasks: (f.subtasks || []).map((s) => (s.id === id ? { ...s, ...p } : s)) });

  const preview = useMemo(() => (isNew && f.title ? parseQuick(f.title, today) : null), [isNew, f.title, today]);
  const projectMilestones = projects.find((p) => p.id === f.projectId)?.milestones || [];

  const dateChips: { label: string; value?: string }[] = [
    { label: "Aujourd'hui", value: today },
    { label: 'Demain', value: addDays(today, 1) },
    { label: 'Plus tard', value: undefined },
  ];

  return (
    <Sheet
      open
      onClose={closeEditor}
      title={isNew ? (isEvent ? 'Nouveau rendez-vous' : 'Nouvelle tâche') : isEvent ? 'Rendez-vous' : 'Tâche'}
      footer={
        <div className="flex items-center gap-2">
          {!isNew && (
            <ConfirmButton
              onConfirm={async () => {
                await deleteTask(task!);
                closeEditor();
                toast(series ? 'Occurrence supprimée' : 'Supprimé');
              }}
              confirmLabel="Supprimer ?"
            >
              <Trash2 size={16} />
            </ConfirmButton>
          )}
          {!isNew && series && (
            <ConfirmButton
              className="btn-ghost text-xs"
              confirmLabel="Toute la série ?"
              onConfirm={async () => {
                await update<Task>('tasks', series, { deleted: true });
                const insts = await db.tasks.where('seriesId').equals(series).toArray();
                for (const i of insts) if (i.status !== 'done') await update<Task>('tasks', i.id, { deleted: true });
                closeEditor();
                toast('Série supprimée');
              }}
            >
              Supprimer la série
            </ConfirmButton>
          )}
          {!isNew && !isEvent && !task!.outcome && task!.status !== 'done' && (
            <button
              className="btn-ghost text-xs"
              onClick={async () => {
                await setOutcome(task!, 'dropped');
                closeEditor();
                toast('Retirée de ta liste. Elle reste dans ton historique.', { label: 'Annuler', run: () => setOutcome({ ...task!, virtual: false }, undefined) });
              }}
              data-testid="drop-task"
            >
              Plus nécessaire
            </button>
          )}
          <button className="btn-primary ml-auto px-6" onClick={save} data-testid="save-task">
            {isNew ? 'Ajouter' : 'Enregistrer'}
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
        {isNew && (
          <Segmented
            value={f.kind || 'task'}
            onChange={(k) => set({ kind: k, date: f.date || today })}
            options={[
              { value: 'task', label: 'Tâche' },
              { value: 'event', label: 'Rendez-vous' },
            ]}
          />
        )}
        <div>
          <input
            ref={titleRef}
            className="input text-lg"
            placeholder={isEvent ? 'Ex : Dîner avec Léa vendredi 20h' : 'Ex : Faire le virement du loyer demain !'}
            value={f.title || ''}
            onChange={(e) => set({ title: e.target.value })}
            enterKeyHint="done"
            data-testid="task-title"
            aria-label="Titre"
          />
          {preview && (preview.date || preview.time || preview.priority) && (
            <p className="mt-1.5 text-xs text-rasp">
              Compris : {preview.date ? relativeDay(preview.date, today) : ''} {preview.time ? `à ${preview.time}` : ''}{' '}
              {preview.priority ? `· ${PRIORITY_LABEL[preview.priority].toLowerCase()}` : ''}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {dateChips.map((c) => (
            <button
              type="button"
              key={c.label}
              className={`chip ${f.date === c.value ? 'chip-on' : ''}`}
              onClick={() => set({ date: c.value })}
            >
              {c.label}
            </button>
          ))}
          <input
            type="date"
            className="chip"
            value={f.date || ''}
            onChange={(e) => set({ date: e.target.value || undefined })}
            aria-label="Date"
          />
        </div>

        {!isEvent && (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
              <button type="button" key={p} className={`chip ${f.priority === p ? 'chip-on' : ''}`} onClick={() => set({ priority: p })}>
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        )}

        {isEvent && f.date && f.date <= today && (
          <Field label="Ça s'est passé ?" group>
            <div className="flex flex-wrap gap-2">
              {(['happened', 'cancelled', 'noshow'] as const).map((o) => (
                <button type="button" key={o} className={`chip ${f.outcome === o ? 'chip-on' : ''}`} onClick={() => set({ outcome: f.outcome === o ? undefined : o })} data-testid={`editor-outcome-${o}`}>
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
          </Field>
        )}

        {(isEvent || more) && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Heure">
              <input type="time" className="input" value={f.time || ''} onChange={(e) => set({ time: e.target.value || undefined })} />
            </Field>
            <Field label="Durée (min)">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={5}
                className="input"
                value={f.duration ?? ''}
                onChange={(e) => set({ duration: e.target.value && Number(e.target.value) > 0 ? Math.round(Number(e.target.value)) : undefined })}
              />
            </Field>
          </div>
        )}

        {!more ? (
          <button type="button" className="btn-ghost -ml-2" onClick={() => setMore(true)}>
            <ChevronDown size={16} /> Plus d'options
          </button>
        ) : (
          <div className="space-y-4">
            <Field label="Catégorie" group>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`chip ${f.categoryId === c.id ? 'chip-on' : ''}`}
                    style={f.categoryId === c.id ? { background: c.color } : undefined}
                    onClick={() => set({ categoryId: f.categoryId === c.id ? undefined : c.id })}
                  >
                    <Icon name={c.icon} size={14} /> {c.name}
                  </button>
                ))}
              </div>
            </Field>
            {isEvent && (
              <Field label="Lieu">
                <input className="input" value={f.location || ''} onChange={(e) => set({ location: e.target.value || undefined })} />
              </Field>
            )}
            <Field label="Description">
              <textarea className="input min-h-[70px]" value={f.description || ''} onChange={(e) => set({ description: e.target.value || undefined })} />
            </Field>
            <div>
              <Field label="Échéance" hint="Jamais modifiée automatiquement">
                <input type="date" className="input" value={f.dueDate || ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} />
              </Field>
            </div>
            <Field label="Objectif du mois" hint="Si pas de jour précis : apparaît dans « Mes objectifs du mois »" group>
              <MonthPicker value={f.targetMonth} onChange={(v) => set({ targetMonth: v, date: v ? undefined : f.date })} testid="task-month" />
            </Field>

            <Field label="Répétition">
              <select className="input" value={recMode} onChange={(e) => setRecMode(e.target.value as RecMode)}>
                <option value="none">Ne se répète pas</option>
                <option value="daily">Tous les jours</option>
                <option value="weekly">Chaque semaine</option>
                <option value="monthly">Chaque mois</option>
                <option value="yearly">Chaque année</option>
                <option value="custom">Personnalisée…</option>
              </select>
            </Field>
            {rec && recMode === 'custom' && (
              <div className="space-y-3 rounded-2xl bg-blush/50 p-3">
                <div className="flex items-center gap-2 text-sm">
                  Tous les
                  <input
                    type="number"
                    min={1}
                    className="input w-20 py-1.5"
                    value={rec.interval}
                    onChange={(e) => set({ recurrence: { ...rec, interval: Math.max(1, Number(e.target.value) || 1) } })}
                  />
                  <select className="input w-auto py-1.5" value={rec.freq} onChange={(e) => set({ recurrence: { ...rec, freq: e.target.value as Freq } })}>
                    <option value="daily">jours</option>
                    <option value="weekly">semaines</option>
                    <option value="monthly">mois</option>
                    <option value="yearly">ans</option>
                  </select>
                </div>
                {rec.freq === 'weekly' && (
                  <div className="flex gap-1.5">
                    {WD_VALUES.map((d, i) => {
                      const on = rec.byWeekday?.includes(d);
                      return (
                        <button
                          type="button"
                          key={d}
                          className={`h-9 w-9 rounded-full text-sm font-medium ${on ? 'bg-rasp text-white' : 'bg-card text-plum'}`}
                          onClick={() =>
                            set({
                              recurrence: { ...rec, byWeekday: on ? rec.byWeekday!.filter((x) => x !== d) : [...(rec.byWeekday || []), d] },
                            })
                          }
                        >
                          {WD_LABELS[i]}
                        </button>
                      );
                    })}
                  </div>
                )}
                <Field label="Jusqu'au (facultatif)">
                  <input type="date" className="input" value={rec.until || ''} onChange={(e) => set({ recurrence: { ...rec, until: e.target.value || undefined } })} />
                </Field>
              </div>
            )}
            {rec && <p className="text-xs text-soft">{describeRecurrence(rec)} à partir du {f.date ? fmt(f.date, 'd MMMM yyyy') : '…'}</p>}

            <Field label="Projet">
              <select className="input" value={f.projectId || ''} onChange={(e) => set({ projectId: e.target.value || undefined, milestoneId: undefined })}>
                <option value="">Aucun</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            {projectMilestones.length > 0 && (
              <Field label="Étape du projet">
                <select className="input" value={f.milestoneId || ''} onChange={(e) => set({ milestoneId: e.target.value || undefined })}>
                  <option value="">Aucune</option>
                  {projectMilestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Sous-tâches" group>
              <div className="space-y-1.5">
                {(f.subtasks || []).map((s) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <input type="checkbox" className="h-5 w-5 accent-[rgb(var(--c-rasp))]" checked={s.done} onChange={(e) => setSub(s.id, { done: e.target.checked })} />
                    <input className="input py-1.5" value={s.title} onChange={(e) => setSub(s.id, { title: e.target.value })} />
                    <button type="button" className="icon-btn h-8 w-8" onClick={() => set({ subtasks: f.subtasks!.filter((x) => x.id !== s.id) })} aria-label="Retirer">
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    className="input py-1.5"
                    placeholder="Ajouter une sous-tâche"
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSub();
                      }
                    }}
                  />
                  <button type="button" className="icon-btn" onClick={addSub} aria-label="Ajouter la sous-tâche">
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </Field>

            <div className="rounded-2xl bg-blush/40 px-3">
              {!isEvent && (
                <Toggle
                  checked={f.autoPostpone !== false}
                  onChange={(v) => set({ autoPostpone: v ? undefined : false })}
                  label="Reporter au lendemain si non terminée"
                />
              )}
              <Field label="Rappel">
                <select
                  className="input mb-2"
                  value={f.remindBefore ?? ''}
                  onChange={(e) => set({ remindBefore: e.target.value === '' ? undefined : Number(e.target.value) })}
                >
                  <option value="">Par défaut (réglages)</option>
                  <option value="0">À l'heure</option>
                  <option value="10">10 min avant</option>
                  <option value="30">30 min avant</option>
                  <option value="60">1 h avant</option>
                  <option value="1440">La veille</option>
                  <option value="-1">Aucun rappel</option>
                </select>
              </Field>
            </div>

            {series && (
              <div className="rounded-2xl border border-line p-3">
                <Toggle checked={applySeries} onChange={setApplySeries} label="Appliquer les changements à toute la série" />
              </div>
            )}
            {task?.originalDate && (
              <p className="text-xs text-soft">
                Prévue au départ le {fmt(task.originalDate, 'd MMMM')} · reportée {Math.max(task.postponeCount || 0, task.postponeHistory?.length || 0)} fois
              </p>
            )}
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}
