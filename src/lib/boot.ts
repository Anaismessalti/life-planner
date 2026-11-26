import { getMeta, setMeta } from '../db/db';
import { seedDefaults } from '../db/seed';
import { todayISO } from './dates';
import { checkReminders } from './notify';
import { runRollover } from './tasks';
import { startSync, stopSync, queueEverything } from './sync/engine';

export async function boot() {
  await seedDefaults();
  await runRollover();
  // Demande au navigateur de ne jamais effacer les données (important sur iOS / Safari)
  try {
    await navigator.storage?.persist?.();
  } catch {}
  // Report automatique : à minuit si l'app est ouverte, et à chaque retour sur l'app
  let last = todayISO();
  const tick = () => {
    const t = todayISO();
    if (t !== last) {
      last = t;
      runRollover(t);
    }
    checkReminders();
  };
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
  setTimeout(() => checkReminders(), 3000);
  initSync().catch(() => {});
}

/** Démarre la synchronisation si Firebase est configuré et l'utilisatrice connectée. */
let unwatch: (() => void) | null = null;
export async function initSync(): Promise<void> {
  unwatch?.();
  unwatch = null;
  const cfg = await getMeta<Record<string, string> | null>('firebaseConfig', null);
  if (!cfg) return;
  const fb = await import('./sync/firebase');
  await fb.initFirebase(cfg as any);
  unwatch = fb.watchUser(async (u) => {
    if (u) {
      const known = await getMeta<string | null>('syncUid', null);
      if (known !== u.uid) {
        await queueEverything();
        await setMeta('syncUid', u.uid);
      }
      startSync(fb.firestoreAdapter(u));
    } else stopSync();
  });
}
