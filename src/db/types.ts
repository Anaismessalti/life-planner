// Modèle de données du Life Planner.
// Toutes les entités synchronisables partagent BaseRecord.

export interface BaseRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Suppression « douce » : indispensable pour propager une suppression à la synchronisation. */
  deleted?: boolean;
  /** Horodatage par champ pour fusionner sans perte (dernier écrit gagne, champ par champ). */
  _ts?: Record<string, number>;
}

export type ISODate = string; // 'YYYY-MM-DD'
export type ISOMonth = string; // 'YYYY-MM'
export type HHmm = string; // '14:30'

export type Priority = 'must' | 'should' | 'could';
export type TaskStatus = 'todo' | 'doing' | 'done';

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface Recurrence {
  freq: Freq;
  /** Tous les N jours / semaines / mois / ans. */
  interval: number;
  /** Jours de la semaine (0 = dimanche … 6 = samedi) pour une récurrence hebdomadaire. */
  byWeekday?: number[];
  /** Date de fin facultative (incluse). */
  until?: ISODate;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface PostponeEntry {
  from: ISODate;
  to: ISODate;
  at: number;
}

export interface Task extends BaseRecord {
  kind: 'task' | 'event';
  title: string;
  description?: string;
  categoryId?: string;
  priority: Priority;
  date?: ISODate;
  time?: HHmm;
  /** Durée en minutes. */
  duration?: number;
  /** Échéance réelle : jamais modifiée automatiquement. */
  dueDate?: ISODate;
  /** Mois visé sans jour précis (objectifs du mois). */
  targetMonth?: ISOMonth;
  location?: string;
  subtasks: Subtask[];
  status: TaskStatus;
  doneAt?: number;
  recurrence?: Recurrence;
  projectId?: string;
  milestoneId?: string;
  /** Date prévue à l'origine, conservée lors des reports. */
  originalDate?: ISODate;
  postponeHistory?: PostponeEntry[];
  /** false = ne jamais reporter automatiquement cette tâche. */
  autoPostpone?: boolean;
  /** Pour une occurrence matérialisée d'une série récurrente. */
  seriesId?: string;
  occurrenceDate?: ISODate;
  /** Rappel en minutes avant l'heure (rendez-vous / tâches). */
  remindBefore?: number;
}

export interface Category extends BaseRecord {
  name: string;
  color: string;
  icon: string;
  order: number;
}

export type ProjectStatus = 'idea' | 'planned' | 'active' | 'paused' | 'done';
export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  dueDate?: ISODate;
}
export interface Project extends BaseRecord {
  title: string;
  description?: string;
  categoryId?: string;
  startDate?: ISODate;
  dueDate?: ISODate;
  targetMonth?: ISOMonth;
  milestones: Milestone[];
  notes?: string;
  status: ProjectStatus;
}

export type Frequency = 'once' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export type IncomeType = 'salaire' | 'prime' | 'remboursement' | 'complementaire' | 'autre';
export interface Income extends BaseRecord {
  label: string;
  type: IncomeType;
  amount: number;
  /** Date de (première) réception. */
  date: ISODate;
  frequency: Frequency;
  endDate?: ISODate;
}

export interface FixedExpense extends BaseRecord {
  label: string;
  amount: number;
  budgetCategoryId?: string;
  /** Date du premier prélèvement ; le jour du mois en est déduit. */
  date: ISODate;
  frequency: Frequency;
  endDate?: ISODate;
  active: boolean;
}

/** Statut d'une occurrence précise d'un revenu ou d'un prélèvement. id = `${refId}_${date}` */
export interface PaymentStatus extends BaseRecord {
  refId: string;
  refType: 'income' | 'fixed';
  date: ISODate;
  status: 'paid' | 'pending';
  /** Montant réellement payé / reçu s'il diffère du prévisionnel. */
  actualAmount?: number;
}

export interface Expense extends BaseRecord {
  amount: number;
  budgetCategoryId?: string;
  date: ISODate;
  note?: string;
}

export interface BudgetCategory extends BaseRecord {
  name: string;
  color: string;
  icon: string;
  kind: 'fixed' | 'variable';
  /** Budget mensuel prévu (facultatif). */
  monthlyLimit?: number;
  order: number;
}

export interface SavingsGoal extends BaseRecord {
  name: string;
  target: number;
  deadline?: ISODate;
  contributions: { id: string; date: ISODate; amount: number }[];
}

export interface Collection extends BaseRecord {
  name: string;
  icon: string;
  color: string;
  order: number;
}

export interface Note extends BaseRecord {
  title: string;
  text?: string;
  url?: string;
  /** Image compressée (data URL JPEG). */
  image?: string;
  collectionId?: string;
  tags: string[];
  favorite: boolean;
}

export interface SettingRecord extends BaseRecord {
  value: unknown;
}

export type TableName =
  | 'tasks'
  | 'categories'
  | 'projects'
  | 'incomes'
  | 'fixedExpenses'
  | 'payments'
  | 'expenses'
  | 'budgetCategories'
  | 'savings'
  | 'collections'
  | 'notes'
  | 'settings';

export const SYNC_TABLES: TableName[] = [
  'tasks',
  'categories',
  'projects',
  'incomes',
  'fixedExpenses',
  'payments',
  'expenses',
  'budgetCategories',
  'savings',
  'collections',
  'notes',
  'settings',
];
