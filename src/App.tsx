import { BookHeart, CalendarDays, FolderHeart, Plus, Settings as Cog, StickyNote, Sun, Wallet, type LucideIcon } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { QuickAdd } from './components/QuickAdd';
import { TaskEditor } from './components/TaskEditor';
import { Toasts } from './components/ui';
import { syncStore } from './lib/sync/engine';
import { navigate, openEditor, useEditor, useRoute, type Route } from './lib/ui-store';
import { BudgetPage, ExpenseEditor, FixedEditor, IncomeEditor } from './pages/Budget';
import { CalendarPage } from './pages/Calendar';
import { NotesPage, NoteEditor } from './pages/Notes';
import { ProjectEditor, ProjectsPage } from './pages/Projects';
import { SettingsPage } from './pages/Settings';
import { TodayPage } from './pages/Today';
import { JournalPage } from './pages/Journal';

const NAV: { route: Route; label: string; icon: LucideIcon }[] = [
  { route: 'today', label: "Aujourd'hui", icon: Sun },
  { route: 'calendar', label: 'Calendrier', icon: CalendarDays },
  { route: 'projects', label: 'Projets', icon: FolderHeart },
  { route: 'budget', label: 'Budget', icon: Wallet },
  { route: 'notes', label: 'Notes', icon: StickyNote },
  { route: 'journal', label: 'Journal', icon: BookHeart },
  { route: 'settings', label: 'Paramètres', icon: Cog },
];

function Editors() {
  const e = useEditor();
  if (!e) return null;
  switch (e.type) {
    case 'quick':
      return <QuickAdd />;
    case 'task':
      return <TaskEditor key={e.task?.id || 'new'} task={e.task} defaults={e.defaults} />;
    case 'project':
      return <ProjectEditor key={e.id || 'new'} id={e.id} defaults={e.defaults} />;
    case 'expense':
      return <ExpenseEditor key={e.id || 'new'} id={e.id} defaults={e.defaults} />;
    case 'income':
      return <IncomeEditor key={e.id || 'new'} id={e.id} />;
    case 'fixed':
      return <FixedEditor key={e.id || 'new'} id={e.id} />;
    case 'note':
      return <NoteEditor key={e.id || 'new'} id={e.id} link={e.link} />;
  }
}

function SyncDot() {
  const s = useSyncExternalStore(syncStore.subscribe, syncStore.get);
  if (s.status === 'off') return null;
  const c = s.status === 'idle' ? 'bg-emerald-500' : s.status === 'error' ? 'bg-red-500' : 'bg-amber-400';
  return <span className={`h-2 w-2 rounded-full ${c}`} title={`Synchronisation : ${s.status}`} />;
}

export function App() {
  const { route, param } = useRoute();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route, param]);
  // Raccourci clavier sur Mac : « N » pour ajouter
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openEditor({ type: 'quick' });
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const Page = { today: TodayPage, calendar: CalendarPage, projects: ProjectsPage, budget: BudgetPage, notes: NotesPage, journal: JournalPage, settings: SettingsPage }[route];

  return (
    <div className="bg-app min-h-full">
      {/* Barre latérale : iPad et Mac */}
      <aside className="pt-safe fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line/70 bg-cream/70 px-4 pb-6 backdrop-blur-xl md:flex lg:w-64">
        <div className="flex items-center gap-2.5 px-2 pb-6 pt-6">
          <img src="icons/icon-192.png" alt="" className="h-9 w-9 rounded-xl shadow-soft" />
          <div className="font-serif text-2xl font-semibold text-plum">Life Planner</div>
          <span className="ml-auto">
            <SyncDot />
          </span>
        </div>
        <button className="btn-primary mb-5 w-full" onClick={() => openEditor({ type: 'quick' })} data-testid="fab-desktop">
          <Plus size={18} /> Ajouter
        </button>
        <nav className="space-y-1">
          {NAV.map(({ route: r, label, icon: I }) => (
            <button
              key={r}
              onClick={() => navigate(r)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${route === r ? 'bg-card text-rasp shadow-soft' : 'text-plum/80 hover:bg-blush/60'}`}
              aria-current={route === r ? 'page' : undefined}
            >
              <I size={18} strokeWidth={1.75} /> {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-soft">Astuce : touche « N » pour ajouter</div>
      </aside>

      <main className="pt-safe mx-auto max-w-6xl px-4 pb-32 pt-6 md:pb-12 md:pl-[17rem] md:pr-8 lg:pl-[18.5rem]">
        <div className="pt-2 md:pt-6">
          <Page />
        </div>
      </main>

      {/* Barre inférieure : iPhone (3 rubriques, le bouton +, 3 rubriques : parfaitement centré) */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-cream/85 backdrop-blur-xl md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-7 items-stretch">
          {NAV.slice(0, 3).map((n) => (
            <TabButton key={n.route} {...n} active={route === n.route} />
          ))}
          <div className="flex justify-center">
            <button
              onClick={() => openEditor({ type: 'quick' })}
              className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lift transition active:scale-90"
              style={{ background: 'linear-gradient(135deg, rgb(var(--c-rasp)), rgb(var(--c-plum)))' }}
              aria-label="Ajouter"
              data-testid="fab"
            >
              <Plus size={28} />
            </button>
          </div>
          {NAV.slice(3, 6).map((n) => (
            <TabButton key={n.route} {...n} active={route === n.route} />
          ))}
        </div>
      </nav>

      <Editors />
      <Toasts />
    </div>
  );
}

function TabButton({ route, label, icon: I, active }: { route: Route; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <button
      onClick={() => navigate(route)}
      className={`flex min-w-0 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[9.5px] font-medium tracking-tight ${active ? 'text-rasp' : 'text-plum/60'}`}
      aria-current={active ? 'page' : undefined}
    >
      <I size={21} strokeWidth={active ? 2 : 1.6} />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
