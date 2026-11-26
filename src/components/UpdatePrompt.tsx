import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Mises à jour automatiques : à chaque ouverture (et toutes les heures), l'app vérifie s'il existe
 * une nouvelle version et l'installe. Seul le code change : les données ne sont jamais touchées.
 */
export function UpdatePrompt() {
  const { updateServiceWorker } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => reg.update().catch(() => {});
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });
  useEffect(() => void updateServiceWorker, [updateServiceWorker]);
  return null;
}
