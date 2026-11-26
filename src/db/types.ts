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
  /**
   * Ce qui s'est réellement passé.
   * Rendez-vous : happened (a eu lieu), cancelled (annulé), noshow (pas honoré).
   * Tâche : dropped (plus nécessaire), skipped (occurrence récurrente passée sans être faite).
   */
  outcome?: TaskOutcome;
  outcomeAt?: number;
  /** Nombre total de reports (l'historique détaillé est limité aux derniers). */
  postponeCount?: number;
}

export type TaskOutcome = 'happened' | 'cancelled' | 'noshow' | 'dropped' | 'skipped';

export interface Category extends BaseRecord {
  name: string;
  color: string;
  icon: string;
  order: number;
}

export type ProjectStatus = 'idea' | 'planned' | 'active' | 'paused' | 'done' | 'abandoned';
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
  /** Progression chiffrée (montant, quantité) ou reliée à un objectif d'épargne, au lieu des étapes et tâches. */
  measure?: { target: number; current: number; unit?: string; savingsId?: string };
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
  /** Dépense saisie depuis le journal (id = jx-date-trackerId : jamais de doublon). */
  journal?: { date: ISODate; trackerId: string };
}

export interface BudgetCategory extends BaseRecord {
  name: string;
  color: string;
  icon: string;
  kind: 'fixed' | 'variable';
  /** Budget mensuel prévu (facultatif). */
  monthlyLimit?: number;
  /** Plafonds datés : le plafond d'un mois est le dernier fixé à partir de ce mois ou avant. Les mois passés ne changent jamais. */
  limits?: Record<string, number | null>;
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

export type TrackerForm = 'outing' | 'cafe' | 'work' | 'sport' | 'period' | 'pms' | 'rest' | 'travel' | 'spend' | 'simple' | 'social' | 'sleep' | 'health' | 'sick';
export type TrackerGroup = 'sorties' | 'amour' | 'social' | 'moi' | 'cycle' | 'sante' | 'soin' | 'maison' | 'travail' | 'etudes' | 'autres';

/** Une activité ou un état à suivre au quotidien (sortie, verre, bureau, congé…). */
export interface Tracker extends BaseRecord {
  name: string;
  icon: string;
  color: string;
  order: number;
  /** Famille de statistiques : sorties, moi, travail, autres. */
  group: TrackerGroup;
  /** Formulaire contextuel (avec qui, lieu, dépense, symptômes…). Par défaut : déduit de l'activité. */
  form?: TrackerForm;
}

/** Une personne (amie, famille, animal) ou un lieu (bar, boîte, resto) à sélectionner dans le journal. */
export interface Contact extends BaseRecord {
  name: string;
  kind: 'person' | 'place';
  icon: string;
  color: string;
  order: number;
}

/** Une activité de la journée. Les champs dépendent du formulaire de l'activité. Le montant vit dans le budget (Expense lié). */
export interface DayItem {
  trackerId: string;
  /** Commentaire libre. */
  detail?: string;
  people?: string[];
  places?: string[];
  /** Café, sortie… en solo. */
  alone?: boolean;
  /** Flux des règles ou intensité (1 léger … 3 fort). */
  level?: number;
  /** Douleur des règles (0 aucune … 3 forte). */
  pain?: number;
  /** Symptômes, type de sport, ressenti… */
  tags?: string[];
  /** Ma note de la sortie, de 1 à 10. */
  rating?: number;
  /** Ajouté automatiquement depuis ce rendez-vous de l'agenda (retiré s'il est annulé). */
  fromEvent?: string;
}

/** Journal d'une journée. id = date (YYYY-MM-DD) : jamais de doublon, même entre appareils. */
export interface DayLog extends BaseRecord {
  date: ISODate;
  /** Humeur de la journée, de 1 à 5. */
  mood?: number;
  /** Note globale de la journée, de 1 à 10. */
  score?: number;
  /** Activités cochées, avec un détail facultatif (« avec Léa », « chez Sarah »). */
  items: DayItem[];
  text?: string;
  /** États du jour, plusieurs possibles (HENDAYE, tired, in love…), avec une intensité de 1 à 3. */
  feelings?: { id: string; level: number }[];
  /** Nuit précédant ce jour : coucher (la veille au soir), réveil (ce matin), qualité 1 à 4. */
  sleep?: DaySleep;
  /** Five Minute Journal : gratitude, intentions, affirmation (matin) ; 3 belles choses, à améliorer (soir). */
  fmj?: FiveMinute;
  /** Journée douce : les habitudes ne comptent pas ce jour-là. */
  soft?: boolean;
}

export interface DaySleep {
  bed?: HHmm;
  wake?: HHmm;
  /** 1 = nuit difficile … 4 = très bien dormi. */
  quality?: number;
  /** Réveils nocturnes, sieste, rêves… */
  tags?: string[];
}

export interface FiveMinute {
  grateful?: string[];
  great?: string[];
  affirmation?: string;
  amazing?: string[];
  better?: string;
  /** Minutes de respiration / méditation guidée faites ce jour-là. */
  breathe?: number;
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
  | 'settings'
  | 'trackers'
  | 'daylogs'
  | 'contacts';

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
  'trackers',
  'daylogs',
  'contacts',
];
