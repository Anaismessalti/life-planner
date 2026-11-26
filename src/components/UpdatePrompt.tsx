import { useRegisterSW } from 'virtual:pwa-register/react';

/** Propose la nouvelle version quand une mise à jour est publiée. Les données ne sont jamais touchées. */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => reg.update(), 60 * 60 * 1000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="anim-rise fixed inset-x-4 bottom-24 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-cream shadow-lift md:bottom-6">
      <span className="flex-1">Une nouvelle version est disponible ✨</span>
      <button className="font-semibold text-mauve" onClick={() => setNeedRefresh(false)}>
        Plus tard
      </button>
      <button className="rounded-full bg-cream px-3 py-1.5 font-semibold text-plum" onClick={() => updateServiceWorker(true)}>
        Mettre à jour
      </button>
    </div>
  );
}
