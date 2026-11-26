import { useSyncExternalStore } from 'react';
import type { ISODate } from '../db/types';
import type { TaskView } from './tasks';

export type EditorReq =
  | { type: 'task'; task?: TaskView; defaults?: Partial<TaskView> }
  | { type: 'project'; id?: string; defaults?: { targetMonth?: string } }
  | { type: 'expense'; id?: string; defaults?: { date?: ISODate } }
  | { type: 'income'; id?: string }
  | { type: 'fixed'; id?: string }
  | { type: 'note'; id?: string; link?: boolean }
  | { type: 'quick' };

let current: EditorReq | null = null;
const subs = new Set<() => void>();
export function openEditor(r: EditorReq) {
  current = r;
  subs.forEach((f) => f());
}
export function closeEditor() {
  current = null;
  subs.forEach((f) => f());
}
export function useEditor() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );
}

// ---- Navigation par ancre (#/today) : fonctionne sur GitHub Pages sans configuration ----
export type Route = 'today' | 'calendar' | 'projects' | 'budget' | 'notes' | 'settings';
export const ROUTES: Route[] = ['today', 'calendar', 'projects', 'budget', 'notes', 'settings'];
function readRoute(): { route: Route; param?: string } {
  const [r, p] = location.hash.replace(/^#\/?/, '').split('/');
  return { route: (ROUTES.includes(r as Route) ? r : 'today') as Route, param: p };
}
let route = readRoute();
const rsubs = new Set<() => void>();
window.addEventListener('hashchange', () => {
  route = readRoute();
  rsubs.forEach((f) => f());
});
export function navigate(r: Route, param?: string) {
  location.hash = `/${r}${param ? '/' + param : ''}`;
}
export function useRoute() {
  return useSyncExternalStore(
    (f) => {
      rsubs.add(f);
      return () => rsubs.delete(f);
    },
    () => route,
  );
}
