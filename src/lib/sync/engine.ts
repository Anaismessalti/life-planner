import { db, getMeta, onLocalChange, setMeta } from '../../db/db';
import type { BaseRecord, TableName } from '../../db/types';
import { SYNC_TABLES } from '../../db/types';
import { mergeRecords, sameContent } from './merge';

export interface RemoteRecord {
  table: TableName;
  record: BaseRecord;
}

/** Interface d'un serveur de synchronisation (Firebase en production, simulé dans les tests). */
export interface RemoteAdapter {
  push(records: RemoteRecord[]): Promise<void>;
  /** Renvoie les enregistrements modifiés depuis le curseur, et le nouveau curseur. */
  pull(cursor: number): Promise<{ records: RemoteRecord[]; cursor: number }>;
}

export type SyncState = { status: 'off' | 'idle' | 'syncing' | 'error' | 'offline'; lastSync?: number; error?: string };

let state: SyncState = { status: 'off' };
const subs = new Set<() => void>();
export const syncStore = {
  get: () => state,
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};
function setState(s: Partial<SyncState>) {
  state = { ...state, ...s };
  subs.forEach((f) => f());
}

/** Un cycle complet : envoi des modifications locales, puis réception et fusion des modifications distantes. */
export async function syncOnce(remote: RemoteAdapter): Promise<{ pushed: number; pulled: number }> {
  // 1. Réception d'abord : les modifications des autres appareils sont fusionnées
  //    avant tout envoi, pour ne jamais écraser une version plus récente du serveur.
  const cursor = await getMeta<number>('syncCursor', 0);
  const { records, cursor: next } = await remote.pull(cursor);
  let pulled = 0;
  for (const { table, record } of records) {
    if (!SYNC_TABLES.includes(table)) continue;
    await db.transaction('rw', db.table_(table), db.outbox, async () => {
      const local = await db.table_(table).get(record.id);
      const merged = mergeRecords(local, record);
      if (local && sameContent(local, merged)) return;
      await db.table_(table).put(merged);
      pulled++;
      // Si la version locale contenait des champs plus récents, on renvoie la fusion.
      if (!sameContent(merged, record)) {
        await db.outbox.put({ key: `${table}/${record.id}`, table, id: record.id, updatedAt: merged.updatedAt });
      }
    });
  }
  await setMeta('syncCursor', next);
  // 2. Envoi (inclut les fusions produites ci-dessus)
  const pending = await db.outbox.toArray();
  const toPush: RemoteRecord[] = [];
  for (const e of pending) {
    const rec = await db.table_(e.table).get(e.id);
    if (rec) toPush.push({ table: e.table, record: rec });
  }
  if (toPush.length) await remote.push(toPush);
  // On ne retire de la file que les entrées qui n'ont pas changé pendant l'envoi.
  await db.transaction('rw', db.outbox, async () => {
    for (const e of pending) {
      const cur = await db.outbox.get(e.key);
      if (cur && cur.updatedAt === e.updatedAt) await db.outbox.delete(e.key);
    }
  });

  return { pushed: toPush.length, pulled };
}

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;
let active: RemoteAdapter | null = null;
let cleanup: (() => void) | null = null;

let firstSyncResolve: (() => void) | null = null;
const firstSync = new Promise<void>((r) => (firstSyncResolve = r));
/** Attend la première synchro réussie (au plus `ms` millisecondes). */
export function waitFirstSync(ms: number) {
  return Promise.race([firstSync, new Promise<void>((r) => setTimeout(r, ms))]);
}

async function run() {
  if (!active) return;
  if (running) {
    again = true;
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setState({ status: 'offline' });
    return;
  }
  running = true;
  setState({ status: 'syncing' });
  try {
    await syncOnce(active);
    setState({ status: 'idle', lastSync: Date.now(), error: undefined });
    firstSyncResolve?.();
  } catch (e: any) {
    setState({ status: 'error', error: e?.message || String(e) });
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(500);
    }
  }
}
function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(run, ms);
}

export function startSync(remote: RemoteAdapter) {
  stopSync();
  active = remote;
  const offChange = onLocalChange(() => schedule(2000));
  const onOnline = () => schedule(300);
  const onVis = () => document.visibilityState === 'visible' && schedule(300);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVis);
  const iv = setInterval(() => schedule(0), 60000);
  cleanup = () => {
    offChange();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVis);
    clearInterval(iv);
  };
  schedule(0);
}
export function stopSync() {
  cleanup?.();
  cleanup = null;
  active = null;
  clearTimeout(timer);
  setState({ status: 'off' });
}
export const syncNow = () => schedule(0);

/** Lors de la première connexion : toutes les données locales existantes doivent être envoyées. */
export async function queueEverything() {
  for (const t of SYNC_TABLES) {
    const all = await db.table_(t).toArray();
    await db.outbox.bulkPut(all.map((r) => ({ key: `${t}/${r.id}`, table: t, id: r.id, updatedAt: r.updatedAt })));
  }
  await setMeta('syncCursor', 0);
}
