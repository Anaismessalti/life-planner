import type { BaseRecord } from '../../db/types';

const META = new Set(['id', 'createdAt', 'updatedAt', '_ts']);

/** Sérialisation stable (clés triées à tous les niveaux) pour comparer deux valeurs. */
function stable(v: unknown): string {
  if (v === undefined || v === null) return 'null';
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * Fusion « champ par champ » de deux versions d'un même enregistrement.
 * Chaque champ garde la valeur la plus récemment modifiée (horodatage _ts du champ).
 * Ainsi, si l'iPhone modifie le titre et le Mac la date pendant qu'ils sont hors ligne,
 * les deux modifications sont conservées. En cas d'égalité parfaite, un arbitrage
 * déterministe garantit que tous les appareils convergent vers le même résultat.
 */
export function mergeRecords<T extends BaseRecord>(local: T | undefined, remote: T): T {
  if (!local) return remote;
  const lts = local._ts || {};
  const rts = remote._ts || {};
  const out: Record<string, unknown> = { id: local.id };
  const ts: Record<string, number> = {};
  const fields = new Set([...Object.keys(local), ...Object.keys(remote), ...Object.keys(lts), ...Object.keys(rts)]);
  for (const f of fields) {
    if (META.has(f)) continue;
    const lv = (local as any)[f];
    const rv = (remote as any)[f];
    // Un champ absent et jamais horodaté n'a jamais été écrit : il ne doit pas l'emporter sur une vraie
    // saisie faite ailleurs (ex. la même journée créée séparément sur l'iPhone et sur le Mac).
    const lt = lts[f] ?? (local._ts && lv === undefined ? 0 : local.createdAt ?? 0);
    const rt = rts[f] ?? (remote._ts && rv === undefined ? 0 : remote.createdAt ?? 0);
    let pickRemote: boolean;
    if (rt !== lt) pickRemote = rt > lt;
    else pickRemote = stable(rv) > stable(lv);
    const v = pickRemote ? rv : lv;
    if (v !== undefined) out[f] = v;
    ts[f] = Math.max(lt, rt);
  }
  out.createdAt = Math.min(local.createdAt ?? Infinity, remote.createdAt ?? Infinity);
  out.updatedAt = Math.max(local.updatedAt || 0, remote.updatedAt || 0);
  out._ts = ts;
  return out as T;
}

export function sameContent(a: BaseRecord, b: BaseRecord) {
  const strip = (r: BaseRecord) => {
    const { updatedAt: _u, ...rest } = r;
    return stable(rest);
  };
  return strip(a) === strip(b);
}
