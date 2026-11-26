import { ArrowLeft, Check, FolderHeart, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TaskList, type DayCtx } from '../components/DayViews';
import { ConfirmButton, Empty, Field, Progress, Section, Segmented, Sheet, toast } from '../components/ui';
import { create, uid, update } from '../db/db';
import type { Milestone, Project, ProjectStatus, Task } from '../db/types';
import { fmt, fmtMonth } from '../lib/dates';
import { useAllTasks, useCategories, useCategoryMap, useProjects, useToday } from '../lib/hooks';
import { Icon } from '../lib/icons';
import { sortTasks } from '../lib/tasks';
import { closeEditor, navigate, openEditor, useRoute } from '../lib/ui-store';

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  idea: 'Idée',
  planned: 'À venir',
  active: 'En cours',
  paused: 'En pause',
  done: 'Terminé',
};

export function progressOf(p: Project, tasks: Task[]) {
  const pt = tasks.filter((t) => !t.deleted && t.projectId === p.id && !t.recurrence);
  const total = p.milestones.length + pt.length;
  const done = p.milestones.filter((m) => m.done).length + pt.filter((t) => t.status === 'done').length;
  return { pct: total ? Math.round((done / total) * 100) : p.status === 'done' ? 100 : 0, done, total, tasks: pt };
}

export function ProjectsPage() {
  const { param } = useRoute();
  const projects = useProjects();
  const tasks = useAllTasks();
  const cats = useCategoryMap();
  const [tab, setTab] = useState<'current' | 'upcoming' | 'done'>('current');
  const p = param ? projects.find((x) => x.id === param) : undefined;
  if (param && p) return <ProjectDetail p={p} tasks={tasks} />;

  const groups = {
    current: projects.filter((p) => p.status === 'active' || p.status === 'paused'),
    upcoming: projects.filter((p) => p.status === 'planned' || p.status === 'idea'),
    done: projects.filter((p) => p.status === 'done'),
  };
  const list = groups[tab].sort((a, b) => (a.dueDate || a.targetMonth || '9').localeCompare(b.dueDate || b.targetMonth || '9'));

  return (
    <div className="space-y-5">
      <header className="anim-rise flex items-end justify-between gap-3">
        <div>
          <p className="label">Court, moyen et long terme</p>
          <h1 className="h-title text-4xl">Mes projets</h1>
        </div>
        <button className="btn-primary" onClick={() => openEditor({ type: 'project' })}>
          <Plus size={16} /> Projet
        </button>
      </header>
      <Segmented
        value={tab}
        onChange={setTab}
        className="max-w-md"
        options={[
          { value: 'current', label: `En cours · ${groups.current.length}` },
          { value: 'upcoming', label: `À venir · ${groups.upcoming.length}` },
          { value: 'done', label: `Terminés · ${groups.done.length}` },
        ]}
      />
      {!list.length && (
        <Empty icon={<FolderHeart size={22} />}>
          {tab === 'current' ? 'Aucun projet en cours. Déménagement, certification, voyage… lance-toi !' : 'Rien ici pour le moment.'}
        </Empty>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((p) => {
          const pr = progressOf(p, tasks);
          const cat = p.categoryId ? cats.get(p.categoryId) : undefined;
          return (
            <button key={p.id} onClick={() => navigate('projects', p.id)} className="anim-rise card space-y-3 p-4 text-left transition hover:shadow-lift" data-testid="project-card">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: cat?.color || '#A83278' }}>
                  <Icon name={cat?.icon || 'target'} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-xl font-semibold text-plum">{p.title}</div>
                  <div className="text-xs text-soft">
                    {STATUS_LABEL[p.status]}
                    {p.dueDate ? ` · échéance ${fmt(p.dueDate, 'd MMM yyyy')}` : p.targetMonth ? ` · ${fmtMonth(p.targetMonth)}` : ''}
                  </div>
                </div>
              </div>
              <Progress value={pr.pct} />
              <div className="flex justify-between text-xs text-soft">
                <span>
                  {pr.done}/{pr.total} étapes et tâches
                </span>
                <span className="font-semibold text-plum">{pr.pct}%</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectDetail({ p, tasks }: { p: Project; tasks: Task[] }) {
  const today = useToday();
  const cats = useCategoryMap();
  const projects = useProjects();
  const pr = progressOf(p, tasks);
  const [newMs, setNewMs] = useState('');
  const [notes, setNotes] = useState(p.notes || '');
  useEffect(() => setNotes(p.notes || ''), [p.id]);
  useEffect(() => {
    if (notes === (p.notes || '')) return;
    const t = setTimeout(() => update<Project>('projects', p.id, { notes }), 600);
    return () => clearTimeout(t);
  }, [notes]);
  const ctx: DayCtx = { today, cats, projects: useMemo(() => new Map(projects.map((x) => [x.id, x])), [projects]) };
  const setMs = (ms: Milestone[]) => update<Project>('projects', p.id, { milestones: ms });
  const ptasks = [...pr.tasks].sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || sortTasks(a, b));

  return (
    <div className="space-y-6">
      <button className="btn-ghost -ml-3" onClick={() => navigate('projects')}>
        <ArrowLeft size={16} /> Projets
      </button>
      <header className="anim-rise card relative space-y-3 overflow-hidden p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-blush to-mauve/30" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="label">{STATUS_LABEL[p.status]}</p>
            <h1 className="h-title text-4xl">{p.title}</h1>
            {p.description && <p className="mt-1 text-sm text-soft">{p.description}</p>}
          </div>
          <button className="icon-btn" onClick={() => openEditor({ type: 'project', id: p.id })} aria-label="Modifier">
            <Pencil size={18} />
          </button>
        </div>
        <div className="relative flex flex-wrap gap-x-4 gap-y-1 text-xs text-soft">
          {p.startDate && <span>Début : {fmt(p.startDate, 'd MMM yyyy')}</span>}
          {p.dueDate && <span>Échéance : {fmt(p.dueDate, 'd MMM yyyy')}</span>}
          {p.targetMonth && <span>Mois visé : {fmtMonth(p.targetMonth)}</span>}
        </div>
        <div className="relative flex items-center gap-3">
          <Progress value={pr.pct} className="h-2.5 flex-1" />
          <span className="font-semibold text-plum">{pr.pct}%</span>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Étapes">
          <div className="space-y-2">
            {p.milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-line/70 bg-card px-3 py-2.5 shadow-soft">
                <button
                  onClick={() => setMs(p.milestones.map((x) => (x.id === m.id ? { ...x, done: !x.done } : x)))}
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${m.done ? 'border-rasp bg-rasp text-white' : 'border-mauve'}`}
                  aria-label="Cocher l'étape"
                >
                  {m.done && <Check size={14} strokeWidth={3} />}
                </button>
                <span className={`flex-1 text-sm ${m.done ? 'text-soft line-through' : ''}`}>{m.title}</span>
                <input
                  type="date"
                  className="w-[8.5rem] rounded-lg bg-transparent text-xs text-soft"
                  value={m.dueDate || ''}
                  onChange={(e) => setMs(p.milestones.map((x) => (x.id === m.id ? { ...x, dueDate: e.target.value || undefined } : x)))}
                  aria-label="Date de l'étape"
                />
                <button className="icon-btn h-8 w-8" onClick={() => setMs(p.milestones.filter((x) => x.id !== m.id))} aria-label="Supprimer l'étape">
                  <X size={15} />
                </button>
              </div>
            ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newMs.trim()) return;
                setMs([...p.milestones, { id: uid(), title: newMs.trim(), done: false }]);
                setNewMs('');
              }}
            >
              <input className="input" placeholder="Nouvelle étape" value={newMs} onChange={(e) => setNewMs(e.target.value)} />
              <button className="icon-btn" aria-label="Ajouter l'étape">
                <Plus size={18} />
              </button>
            </form>
          </div>
        </Section>

        <Section
          title="Tâches du projet"
          action={
            <button className="btn-soft py-1.5 text-xs" onClick={() => openEditor({ type: 'task', defaults: { projectId: p.id, categoryId: p.categoryId, date: undefined } })}>
              + Tâche
            </button>
          }
        >
          <p className="text-xs text-soft">Les tâches datées apparaissent automatiquement dans ton calendrier.</p>
          <TaskList tasks={ptasks} ctx={ctx} showDate empty="Aucune tâche pour l'instant" />
        </Section>
      </div>

      <Section title="Notes">
        <textarea className="input min-h-[140px]" placeholder="Idées, contacts, liens utiles…" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Section>
    </div>
  );
}

export function ProjectEditor({ id, defaults }: { id?: string; defaults?: { targetMonth?: string } }) {
  const projects = useProjects();
  const cats = useCategories();
  const existing = id ? projects.find((p) => p.id === id) : undefined;
  const [f, setF] = useState<Partial<Project>>(existing || { status: 'active', milestones: [], ...defaults });
  useEffect(() => {
    if (existing) setF(existing);
  }, [existing?.id]);
  const set = (x: Partial<Project>) => setF((o) => ({ ...o, ...x }));
  const save = async () => {
    if (!f.title?.trim()) return;
    if (existing) {
      const { id: _i, createdAt: _c, updatedAt: _u, _ts, ...rest } = f as any;
      await update<Project>('projects', existing.id, rest);
    } else {
      const p = await create<Project>('projects', { milestones: [], ...(f as any), title: f.title.trim() });
      navigate('projects', p.id);
      toast('Projet créé');
    }
    closeEditor();
  };
  return (
    <Sheet
      open
      onClose={closeEditor}
      title={existing ? 'Modifier le projet' : 'Nouveau projet'}
      footer={
        <div className="flex gap-2">
          {existing && (
            <ConfirmButton
              onConfirm={async () => {
                await update<Project>('projects', existing.id, { deleted: true });
                closeEditor();
                navigate('projects');
                toast('Projet supprimé (ses tâches sont conservées)');
              }}
            >
              <Trash2 size={16} />
            </ConfirmButton>
          )}
          <button className="btn-primary ml-auto px-6" onClick={save}>
            {existing ? 'Enregistrer' : 'Créer'}
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
        <input className="input text-lg" autoFocus placeholder="Ex : Déménagement" value={f.title || ''} onChange={(e) => set({ title: e.target.value })} aria-label="Titre du projet" />
        <Field label="Description">
          <textarea className="input min-h-[70px]" value={f.description || ''} onChange={(e) => set({ description: e.target.value || undefined })} />
        </Field>
        <Field label="Statut">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((s) => (
              <button type="button" key={s} className={`chip ${f.status === s ? 'chip-on' : ''}`} onClick={() => set({ status: s })}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Catégorie">
          <select className="input" value={f.categoryId || ''} onChange={(e) => set({ categoryId: e.target.value || undefined })}>
            <option value="">Aucune</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Début">
            <input type="date" className="input" value={f.startDate || ''} onChange={(e) => set({ startDate: e.target.value || undefined })} />
          </Field>
          <Field label="Échéance">
            <input type="date" className="input" value={f.dueDate || ''} onChange={(e) => set({ dueDate: e.target.value || undefined })} />
          </Field>
        </div>
        <Field label="Ou mois visé" hint="Apparaît dans « Mes objectifs du mois » du calendrier">
          <input type="month" className="input" value={f.targetMonth || ''} onChange={(e) => set({ targetMonth: e.target.value || undefined })} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Sheet>
  );
}
