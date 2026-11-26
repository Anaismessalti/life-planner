// Remplace le module PWA dans la version d'aperçu en un seul fichier (sans service worker).
export function useRegisterSW(_o?: unknown) {
  return { needRefresh: [false, () => {}] as [boolean, (v: boolean) => void], offlineReady: [false, () => {}], updateServiceWorker: (_r?: boolean) => {} };
}
