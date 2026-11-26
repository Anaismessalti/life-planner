export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'pinterest' | 'web';

export function normalizeUrl(s: string): string | undefined {
  const t = s.trim();
  const m = t.match(/https?:\/\/[^\s]+/i);
  if (m) return m[0];
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return `https://${t}`;
  return undefined;
}

export function platformOf(url?: string): Platform {
  if (!url) return 'web';
  const h = safeHost(url);
  if (/tiktok\.com$/.test(h)) return 'tiktok';
  if (/instagram\.com$/.test(h)) return 'instagram';
  if (/youtube\.com$|youtu\.be$/.test(h)) return 'youtube';
  if (/pinterest\.|pin\.it$/.test(h)) return 'pinterest';
  return 'web';
}

export function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\.|^m\.|^vm\./, '');
  } catch {
    return '';
  }
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  web: 'Lien',
};
export const PLATFORM_BG: Record<Platform, string> = {
  tiktok: 'linear-gradient(135deg,#2b1a27,#81265D 55%,#25c2c9)',
  instagram: 'linear-gradient(135deg,#f9ce34,#ee2a7b 50%,#6228d7)',
  youtube: 'linear-gradient(135deg,#ff6b6b,#c4302b)',
  pinterest: 'linear-gradient(135deg,#f6a6b2,#bd081c)',
  web: 'linear-gradient(135deg,#F5DFEC,#C7A0C9)',
};

/** Titre proposé automatiquement à partir du lien (sans aucune requête réseau). */
export function guessTitle(url: string): string {
  const p = platformOf(url);
  const user = url.match(/\/@([\w.]+)/)?.[1];
  if (p === 'tiktok') return user ? `TikTok de @${user}` : 'Vidéo TikTok';
  if (p === 'instagram') return /\/reel\//.test(url) ? 'Reel Instagram' : 'Publication Instagram';
  if (p === 'youtube') return 'Vidéo YouTube';
  if (p === 'pinterest') return 'Épingle Pinterest';
  const h = safeHost(url);
  const path = (() => {
    try {
      return decodeURIComponent(new URL(url).pathname)
        .split('/')
        .filter(Boolean)
        .pop()
        ?.replace(/[-_]+/g, ' ')
        .replace(/\.\w+$/, '');
    } catch {
      return '';
    }
  })();
  return path && path.length > 3 && !/^\d+$/.test(path) ? path.charAt(0).toUpperCase() + path.slice(1) : h;
}

/** Compresse une photo (iPhone : souvent plusieurs Mo) en JPEG léger, pour le stockage et la synchronisation. */
export function compressImage(file: File, max = 1000, quality = 0.75): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}
