import Dexie, { type Table } from 'dexie';
import type {
  BaseRecord,
  BudgetCategory,
  Category,
  Collection,
  Contact,
  DayLog,
  Expense,
  FixedExpense,
  Income,
  Note,
  PaymentStatus,
  Project,
  SavingsGoal,
  SettingRecord,
  TableName,
  Task,
  Tracker,
} from './types';

export interface OutboxEntry {
  key: string; // `${table}/${id}`
  table: TableName;
  id: string;
  updatedAt: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

export class PlannerDB extends Dexie {
  tasks!: Table<Task, string>;
  categories!: Table<Category, string>;
  projects!: Table<Project, string>;
  incomes!: Table<Income, string>;
  fixedExpenses!: Table<FixedExpense, string>;
  payments!: Table<PaymentStatus, string>;
  expenses!: Table<Expense, string>;
  budgetCategories!: Table<BudgetCategory, string>;
  savings!: Table<SavingsGoal, string>;
  collections!: Table<Collection, string>;
  notes!: Table<Note, string>;
  settings!: Table<SettingRecord, string>;
  trackers!: Table<Tracker, string>;
  daylogs!: Table<DayLog, string>;
  contacts!: Table<Contact, string>;
  /** Données propres à l'appareil, jamais synchronisées. */
  meta!: Table<MetaRecord, string>;
  /** File d'attente des enregistrements modifiés localement, à envoyer au serveur. */
  outbox!: Table<OutboxEntry, string>;

  constructor(name = 'life-planner') {
    super(name);
    this.version(1).stores({
      tasks: 'id, date, dueDate, targetMonth, projectId, seriesId, status, updatedAt',
      categories: 'id, order, updatedAt',
      projects: 'id, status, targetMonth, updatedAt',
      incomes: 'id, date, updatedAt',
      fixedExpenses: 'id, date, updatedAt',
      payments: 'id, refId, date, updatedAt',
      expenses: 'id, date, updatedAt',
      budgetCategories: 'id, order, updatedAt',
      savings: 'id, updatedAt',
      collections: 'id, order, updatedAt',
      notes: 'id, collectionId, favorite, createdAt, updatedAt',
      settings: 'id, updatedAt',
      meta: 'key',
      outbox: 'key',
    });
    // Version 2 : journal des journées (les données existantes sont conservées)
    this.version(2).stores({
      trackers: 'id, order, updatedAt',
      daylogs: 'id, date, updatedAt',
    });
    // Version 3 : proches et lieux du journal
    this.version(3).stores({ contacts: 'id, kind, order, updatedAt' });
  }

  table_(name: TableName): Table<BaseRecord, string> {
    return this.table(name) as unknown as Table<BaseRecord, string>;
  }
}

export const db = new PlannerDB();

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---- Notification des changements (pour la synchronisation) ----
type Listener = () => void;
const listeners = new Set<Listener>();
export function onLocalChange(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((l) => l());
}

let clock = 0;
/** Horloge monotone : deux écritures successives ont toujours des horodatages croissants. */
export function now(): number {
  const t = Date.now();
  clock = t > clock ? t : clock + 1;
  return clock;
}

const META_FIELDS = new Set(['id', 'createdAt', 'updatedAt', '_ts']);

function stamp<T extends BaseRecord>(rec: T, fields: string[], t: number): T {
  const ts = { ...(rec._ts || {}) };
  for (const f of fields) if (!META_FIELDS.has(f)) ts[f] = t;
  return { ...rec, updatedAt: t, _ts: ts };
}

function queue(table: TableName, rec: BaseRecord) {
  return db.outbox.put({ key: `${table}/${rec.id}`, table, id: rec.id, updatedAt: rec.updatedAt });
}

function same(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Crée un enregistrement (id facultatif : un id déterministe évite les doublons). */
export async function create<T extends BaseRecord>(
  table: TableName,
  data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  /** Pour une copie (occurrence d'une série) : seuls ces champs sont « récents », les autres gardent baseTs. */
  opts?: { fresh: string[]; baseTs: number },
): Promise<T> {
  const t = now();
  const base = { ...data, id: data.id || uid(), createdAt: t, updatedAt: t } as unknown as T;
  let rec = stamp(base, Object.keys(base), t);
  if (opts) {
    const ts = { ...(rec._ts || {}) };
    for (const k of Object.keys(ts)) if (!opts.fresh.includes(k)) ts[k] = Math.min(opts.baseTs, t);
    rec = { ...rec, _ts: ts };
  }
  await db.transaction('rw', db.table_(table), db.outbox, async () => {
    await db.table_(table).put(rec);
    await queue(table, rec);
  });
  emit();
  return rec;
}

/** Met à jour uniquement les champs modifiés et horodate chacun d'eux. */
export async function update<T extends BaseRecord>(table: TableName, id: string, patch: Partial<T>): Promise<T | undefined> {
  let result: T | undefined;
  await db.transaction('rw', db.table_(table), db.outbox, async () => {
    const cur = (await db.table_(table).get(id)) as T | undefined;
    if (!cur) return;
    const changed = Object.keys(patch).filter((k) => !same((cur as any)[k], (patch as any)[k]));
    if (!changed.length) {
      result = cur;
      return;
    }
    const merged = { ...cur, ...patch } as T;
    for (const k of Object.keys(patch)) if ((patch as any)[k] === undefined) delete (merged as any)[k];
    result = stamp(merged, changed, now());
    await db.table_(table).put(result);
    await queue(table, result);
  });
  emit();
  return result;
}

/** Crée ou met à jour (utile pour les ids déterministes). */
export async function upsert<T extends BaseRecord>(table: TableName, rec: Omit<T, 'createdAt' | 'updatedAt'> & { id: string }) {
  const cur = await db.table_(table).get(rec.id);
  if (cur) return update<T>(table, rec.id, { ...(rec as any), deleted: undefined });
  return create<T>(table, rec as any);
}

export async function remove(table: TableName, id: string) {
  await update(table, id, { deleted: true } as Partial<BaseRecord>);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = await db.settings.get(key);
  return r && !r.deleted ? (r.value as T) : fallback;
}
export async function setSetting(key: string, value: unknown) {
  return upsert<SettingRecord>('settings', { id: key, value });
}

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const r = await db.meta.get(key);
  return r ? (r.value as T) : fallback;
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

export const alive = <T extends BaseRecord>(r: T) => !r.deleted;
