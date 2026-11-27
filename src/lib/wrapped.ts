// « Wrapped » : les temps forts d'une période, en cartes à l'écran et en image format story (1080 × 1920) à partager.
import type { Analytics } from './analytics';
import { eur } from './finance';
import { MOODS } from './journal';
import { fmtDuration } from './wellbeing';
import { periodMoments } from './memories';

export interface WrappedCard {
  k: string;
  big: string;
  small: string;
  italic?: boolean;
  /** Carte affichée dans l'app seulement, jamais sur l'image partagée (texte du journal). */
  private?: boolean;
  from: string;
  to: string;
}

export function wrappedCards(a: Analytics, prev: Analytics): WrappedCard[] {
  if (a.logged === 0) return [];
  const mood = a.dominantMood ? MOODS[a.dominantMood - 1] : undefined;
  const topAct = a.perTracker.find((p) => p.days > 0);
  const who = a.people[0];
  const where = a.places[0];
  const feel = a.feelings.find((f) => f.id !== 'hendaye');
  const out: WrappedCard[] = [];
  out.push({ k: 'intro', big: a.period.label, small: `${a.logged} jour${a.logged > 1 ? 's' : ''} racontés · your life, wrapped`, from: '#81265D', to: '#E0789E' });
  if (mood) out.push({ k: 'mood', big: mood.label, italic: true, small: 'ton humeur dominante', from: '#382332', to: mood.color });
  // HENDAYE, toujours là et en bonne place (même à zéro).
  out.push({ k: 'hendaye', big: `HENDAYE × ${a.key.hendaye.days}`, small: a.key.hendaye.days ? 'lendemains qui piquent' : 'zéro lendemain difficile. Iconic.', from: '#382332', to: '#81265D' });
  const best = periodMoments([...a.byDate.values()], a.period.from, a.period.to)[0];
  if (best) out.push({ k: 'moment', big: best.title || best.highlight || '', italic: true, small: `ton plus beau moment · ${best.date.slice(8, 10)}/${best.date.slice(5, 7)}`, private: true, from: '#E0789E', to: '#81265D' });
  if (feel) out.push({ k: 'feel', big: feel.label, italic: true, small: `ton état le plus fréquent · ${feel.days} j`, from: '#8E6BB0', to: feel.color });
  if (a.key.outings.days)
    out.push({
      k: 'out',
      big: `${a.key.outings.days} jour${a.key.outings.days > 1 ? 's' : ''} de sortie`,
      small: 'social era',
      from: '#A83278',
      to: '#8E6BB0',
    });
  if (who) out.push({ k: 'who', big: who.contact.name, small: `ta personne n°1 · ${who.days} jour${who.days > 1 ? 's' : ''} ensemble`, from: '#D46A8C', to: '#81265D' });
  if (where) out.push({ k: 'where', big: where.contact.name, small: `ton QG · ${where.days} jour${where.days > 1 ? 's' : ''}`, from: '#8E6BB0', to: '#382332' });
  const bestOut = a.rated.top[0];
  if (bestOut) out.push({ k: 'best-out', big: `${bestOut.rating}/10`, small: `ta meilleure sortie · ${bestOut.tracker.name}${bestOut.with.length ? ` avec ${bestOut.with.slice(0, 2).join(', ')}` : ''}`, from: '#E0457B', to: '#81265D' });
  if (a.score.avg !== undefined) out.push({ k: 'score', big: `${String(a.score.avg).replace('.', ',')}/10`, small: `la note moyenne de tes journées`, from: '#A83278', to: '#C7A0C9' });
  if (topAct) out.push({ k: 'act', big: topAct.tracker.name, small: `ton activité n°1 · ${topAct.days} jour${topAct.days > 1 ? 's' : ''}`, from: topAct.tracker.color, to: '#382332' });
  if (a.sleep.avgMin) out.push({ k: 'sleep', big: fmtDuration(a.sleep.avgMin), small: `de sommeil par nuit · ${a.sleep.nights} nuit${a.sleep.nights > 1 ? 's' : ''}`, from: '#5B6FB5', to: '#382332' });
  if (a.fmj.gratitudes) out.push({ k: 'fmj', big: `${a.fmj.gratitudes} gratitudes`, small: `écrites en ${a.fmj.days} jour${a.fmj.days > 1 ? 's' : ''}`, from: '#E0789E', to: '#A83278' });
  if (a.agenda?.events) out.push({ k: 'agenda', big: `${a.agenda.events} rendez-vous`, small: `qui ont eu lieu · ${a.agenda.done} tâches cochées`, from: '#81265D', to: '#C7A0C9' });
  if (a.spent.total) out.push({ k: 'spent', big: eur(a.spent.total), small: 'notés dans ton journal (sorties, plaisirs)', from: '#C98A4B', to: '#A83278' });
  return out;
}

const SERIF = '"Cormorant Garamond", Georgia, serif';
const SANS = '"DM Sans", system-ui, -apple-system, sans-serif';

function fitText(ctx: CanvasRenderingContext2D, text: string, font: (px: number) => string, max: number, start: number) {
  let px = start;
  ctx.font = font(px);
  while (px > 30 && ctx.measureText(text).width > max) {
    px -= 4;
    ctx.font = font(px);
  }
  return px;
}

/** Dessine l'image story. Aucune donnée ne quitte le téléphone : l'image est créée sur place. */
export async function drawWrapped(cards: WrappedCard[]): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  try {
    await Promise.all([document.fonts.load(`600 80px ${SERIF}`), document.fonts.load(`italic 500 80px ${SERIF}`), document.fonts.load(`500 30px ${SANS}`)]);
  } catch {
    /* polices système en secours */
  }
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#382332');
  bg.addColorStop(0.45, '#81265D');
  bg.addColorStop(1, '#E0789E');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // halos nacrés
  for (const [x, y, r, a] of [
    [880, 260, 380, 0.18],
    [160, 1500, 460, 0.12],
    [960, 1750, 260, 0.14],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,248,252,${a})`);
    g.addColorStop(1, 'rgba(255,248,252,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // Le texte du journal reste privé : les cartes « souvenir » ne vont jamais sur l'image.
  const [intro, ...rest] = cards.filter((c) => !c.private);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = `500 30px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('YOUR LIFE, WRAPPED', 96, 190);
  ctx.fillStyle = '#fff';
  const px = fitText(ctx, intro?.big || '', (p) => `600 ${p}px ${SERIF}`, W - 192, 112);
  ctx.fillText(intro?.big || '', 96, 190 + px + 20);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = `400 32px ${SANS}`;
  ctx.fillText(intro?.small.split(' · ')[0] || '', 96, 190 + px + 80);

  // HENDAYE figure toujours sur l'image, même quand il y a beaucoup de cartes.
  const hendaye = rest.find((c) => c.k === 'hendaye');
  const list = [...rest.filter((c) => c.k !== 'hendaye').slice(0, hendaye ? 6 : 7)];
  if (hendaye) list.splice(Math.min(2, list.length), 0, hendaye);
  const top = 520;
  const rowH = Math.min(185, (H - top - 180) / Math.max(1, list.length));
  list.forEach((card, i) => {
    const y = top + i * rowH;
    ctx.fillStyle = 'rgba(255,248,252,0.10)';
    roundRect(ctx, 72, y, W - 144, rowH - 22, 40);
    ctx.fill();
    ctx.fillStyle = card.to;
    ctx.beginPath();
    ctx.arc(140, y + (rowH - 22) / 2, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    const bp = fitText(ctx, card.big, (p) => `${card.italic ? 'italic 500' : '600'} ${p}px ${SERIF}`, W - 340, 72);
    ctx.fillText(card.big, 196, y + 30 + bp * 0.8);
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = `500 26px ${SANS}`;
    ctx.fillText(card.small.toUpperCase(), 198, y + 30 + bp * 0.8 + 46);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `italic 500 40px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.fillText('Life Planner', W / 2, H - 90);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/png'));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Partage (iPhone : feuille de partage → Instagram, Messages, Photos) ou téléchargement si le partage n'existe pas. */
export async function shareWrapped(cards: WrappedCard[], label: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await drawWrapped(cards);
  const name = `wrapped-${label.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'My life, wrapped' });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
