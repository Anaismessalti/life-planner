import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../db/db';
import type { BudgetCategory, Category, Collection, Note, Project, Task } from '../db/types';
import type { FinanceData } from './finance';
import { todayISO } from './dates';

const EMPTY: never[] = [];

export function useAllTasks(): Task[] {
  return useLiveQuery(() => db.tasks.toArray(), [], EMPTY);
}
export function useCategories(): Category[] {
  const all = useLiveQuery(() => db.categories.orderBy('order').toArray(), [], EMPTY);
  return useMemo(() => all.filter((c) => !c.deleted), [all]);
}
export function useCategoryMap() {
  const cats = useCategories();
  return useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
}
export function useProjects(): Project[] {
  const all = useLiveQuery(() => db.projects.toArray(), [], EMPTY);
  return useMemo(() => all.filter((p) => !p.deleted), [all]);
}
export function useBudgetCategories(): BudgetCategory[] {
  const all = useLiveQuery(() => db.budgetCategories.orderBy('order').toArray(), [], EMPTY);
  return useMemo(() => all.filter((c) => !c.deleted), [all]);
}
export function useCollections(): Collection[] {
  const all = useLiveQuery(() => db.collections.orderBy('order').toArray(), [], EMPTY);
  return useMemo(() => all.filter((c) => !c.deleted), [all]);
}
export function useNotes(): Note[] {
  const all = useLiveQuery(() => db.notes.toArray(), [], EMPTY);
  return useMemo(() => all.filter((n) => !n.deleted).sort((a, b) => b.createdAt - a.createdAt), [all]);
}
export function useFinance(): FinanceData {
  const incomes = useLiveQuery(() => db.incomes.toArray(), [], EMPTY);
  const fixed = useLiveQuery(() => db.fixedExpenses.toArray(), [], EMPTY);
  const payments = useLiveQuery(() => db.payments.toArray(), [], EMPTY);
  const expenses = useLiveQuery(() => db.expenses.toArray(), [], EMPTY);
  const savings = useLiveQuery(() => db.savings.toArray(), [], EMPTY);
  const budgetCategories = useBudgetCategories();
  const allCats = useLiveQuery(() => db.budgetCategories.toArray(), [], EMPTY);
  return useMemo(
    () => ({
      incomes: incomes.filter((x) => !x.deleted),
      fixed: fixed.filter((x) => !x.deleted),
      payments,
      expenses: expenses.filter((x) => !x.deleted),
      savings: savings.filter((x) => !x.deleted),
      budgetCategories,
      archive: {
        incomes: incomes.filter((x) => x.deleted),
        fixed: fixed.filter((x) => x.deleted),
        savings: savings.filter((x) => x.deleted),
        budgetCategories: allCats.filter((x) => x.deleted),
      },
    }),
    [incomes, fixed, payments, expenses, savings, budgetCategories, allCats],
  );
}
export function useSetting<T>(key: string, fallback: T): T {
  const r = useLiveQuery(() => db.settings.get(key), [key]);
  return r && !r.deleted ? (r.value as T) : fallback;
}

/** Date du jour, mise à jour automatiquement à minuit. */
export function useToday() {
  const [t, setT] = useState(todayISO());
  useEffect(() => {
    const iv = setInterval(() => setT(todayISO()), 30000);
    const v = () => setT(todayISO());
    document.addEventListener('visibilitychange', v);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', v);
    };
  }, []);
  return t;
}

export function useMedia(q: string) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}
