import { repairData } from './repair';
import { db, getMeta, now, setMeta } from '../db/db';
import { SYNC_TABLES, type BaseRecord, type TableName, type Task } from '../db/types';
import { addMonths, monthEnd, monthOf, todayISO } from './dates';
import { financeOccurrencesIn, INCOME_TYPE_LABEL } from './finance';
import { PRIORITY_LABEL } from './tasks';

export interface Backup {
  app: 'life-planner';
  version: 1;
  exportedAt: string;
  tables: Record<string, BaseRecord[]>;
}

export async function exportAll(): Promise<Backup> {
  const tables: Record<string, BaseRecord[]> = {};
  for (const t of SYNC_TABLES) tables[t] = await db.table_(t).toArray();
  return { app: 'life-planner', version: 1, exportedAt: new Date().toISOString(), tables };
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadBackup() {
  const b = await exportAll();
  download(`life-planner-sauvegarde-${todayISO()}.json`, JSON.stringify(b), 'application/json');
  await setMeta('lastBackup', Date.now());
}

export function lastBackup() {
  return getMeta<number | null>('lastBackup', null);
}

/**
 * Restaure une sauvegarde : remplace les données actuelles.
 * Les enregistrements sont ré-horodatés pour que la restauration l'emporte aussi sur les autres appareils synchronisés.
 */
export async function importBackup(text: string): Promise<number> {
  let data: Backup;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ce fichier n'est pas une sauvegarde valide.");
  }
  if (data?.app !== 'life-planner' || !data.tables) throw new Error("Ce fichier n'est pas une sauvegarde du Life Planner.");
  // Filet de sécurité : l'état actuel est gardé sur l'appareil avant d'être remplacé.
  try {
    await db.meta.put({ key: 'preImportBackup', value: { at: Date.now(), data: await exportAll() } });
  } catch {}
  const t = now();
  let count = 0;
  await db.transaction('rw', [...SYNC_TABLES.map((n) => db.table_(n)), db.outbox], async () => {
    for (const name of SYNC_TABLES) {
      // Une table absente du fichier est laissée telle quelle (jamais effacée)
      if (!Array.isArray(data.tables[name])) continue;
      // On ignore les lignes abîmées (sans identifiant) au lieu de faire échouer toute la restauration.
      const incoming = (data.tables[name] as BaseRecord[]).filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id);
      const ids = new Set(incoming.map((r) => r.id));
      const table = db.table_(name as TableName);
      for (const cur of await table.toArray()) {
        if (!ids.has(cur.id) && !cur.deleted) {
          const ts = { ...(cur._ts || {}), deleted: t };
          const rec = { ...cur, deleted: true, updatedAt: t, _ts: ts };
          await table.put(rec);
          await db.outbox.put({ key: `${name}/${rec.id}`, table: name, id: rec.id, updatedAt: t });
        }
      }
      for (const r of incoming) {
        const ts: Record<string, number> = {};
        for (const k of Object.keys(r)) if (!['id', 'createdAt', 'updatedAt', '_ts'].includes(k)) ts[k] = t;
        if (!r.deleted) ts.deleted = t;
        const rec = { ...r, updatedAt: t, _ts: ts };
        await table.put(rec);
        await db.outbox.put({ key: `${name}/${rec.id}`, table: name, id: rec.id, updatedAt: t });
        if (!r.deleted) count++;
      }
    }
  });
  await repairData();
  return count;
}

export async function deleteEverything() {
  await db.delete();
  try {
    localStorage.clear();
  } catch {}
}

// ---------- CSV (séparateur « ; » et BOM : s'ouvre directement dans Excel / Numbers en français) ----------
function csv(rows: (string | number | undefined)[][]) {
  const esc = (v: string | number | undefined) => {
    if (v === undefined || v === null) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\ufeff' + rows.map((r) => r.map(esc).join(';')).join('\n');
}

export async function exportTasksCSV() {
  const tasks = (await db.tasks.toArray()).filter((t) => !t.deleted);
  const cats = new Map((await db.categories.toArray()).map((c) => [c.id, c.name]));
  const projects = new Map((await db.projects.toArray()).map((p) => [p.id, p.title]));
  const rows = [
    ['Titre', 'Type', 'Date', 'Heure', 'Durée (min)', 'Échéance', 'Mois visé', 'Priorité', 'Statut', 'Catégorie', 'Projet', 'Récurrente', 'Date initiale', 'Nombre de reports', 'Description'],
    ...tasks.map((t: Task) => [
      t.title,
      t.kind === 'event' ? 'Rendez-vous' : 'Tâche',
      t.date,
      t.time,
      t.duration,
      t.dueDate,
      t.targetMonth,
      PRIORITY_LABEL[t.priority],
      t.status === 'done' ? 'Terminée' : 'À faire',
      t.categoryId ? cats.get(t.categoryId) : '',
      t.projectId ? projects.get(t.projectId) : '',
      t.recurrence ? 'Oui' : '',
      t.originalDate,
      t.postponeHistory?.length || '',
      t.description,
    ]),
  ];
  download(`life-planner-taches-${todayISO()}.csv`, csv(rows), 'text/csv;charset=utf-8');
}

export async function exportFinanceCSV() {
  const data = {
    incomes: (await db.incomes.toArray()).filter((x) => !x.deleted),
    fixed: (await db.fixedExpenses.toArray()).filter((x) => !x.deleted),
    payments: await db.payments.toArray(),
  };
  const expenses = (await db.expenses.toArray()).filter((x) => !x.deleted);
  const cats = new Map((await db.budgetCategories.toArray()).map((c) => [c.id, c.name]));
  const m = monthOf(todayISO());
  const occ = financeOccurrencesIn(data, `${addMonths(m, -24)}-01`, monthEnd(addMonths(m, 2)));
  const incomeType = new Map(data.incomes.map((i) => [i.id, INCOME_TYPE_LABEL[i.type]]));
  const rows: (string | number | undefined)[][] = [
    ['Date', 'Type', 'Libellé', 'Catégorie', 'Montant prévu (€)', 'Montant confirmé (€)', 'Statut'],
    ...occ.map((o) => [
      o.date,
      o.refType === 'income' ? `Revenu (${incomeType.get(o.refId)})` : 'Dépense fixe',
      o.label,
      o.budgetCategoryId ? cats.get(o.budgetCategoryId) : '',
      o.refType === 'income' ? o.planned : -o.planned,
      o.confirmed === undefined ? undefined : o.refType === 'income' ? o.confirmed : -o.confirmed,
      o.confirmed === undefined ? 'Non confirmé' : o.refType === 'income' ? 'Reçu' : 'Payé',
    ]),
    ...expenses.map((e) => [e.date, 'Dépense variable', e.note || '', e.budgetCategoryId ? cats.get(e.budgetCategoryId) : '', -e.amount, -e.amount, 'Payé']),
  ];
  rows.splice(1, rows.length - 1, ...rows.slice(1).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  download(`life-planner-finances-${todayISO()}.csv`, csv(rows), 'text/csv;charset=utf-8');
}
