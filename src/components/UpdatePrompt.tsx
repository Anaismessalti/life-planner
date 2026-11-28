import { useRegisterSW } from 'virtual:pwa-register/react';

const bootAt = Date.now();

/** Recharge pour passer à la nouvelle version, sans jamais couper ce que tu es en train de faire. */
function reloadGently() {
  // Juste après l'ouverture, rien n'est encore saisi : on recharge tout de suite.
  if (Date.now() - bootAt < 4000 || document.visibilityState === 'hidden') return location.reload();
  // Sinon, au prochain départ de l'app (les champs de texte s'enregistrent eux-mêmes à ce moment-là).
  const onHide = () => {
    if (document.visibilityState !== 'hidden') return;
    document.removeEventListener('visibilitychange', onHide);
    setTimeout(() => location.reload(), 300);
  };
  document.addEventListener('visibilitychange', onHide);
}

/**
 * Mises à jour automatiques : à chaque ouverture (et toutes les heures), l'app vérifie s'il existe une nouvelle
 * version et l'installe ; elle s'affiche à l'ouverture ou quand tu reviens sur l'app. Les données ne sont jamais touchées.
 */
export function UpdatePrompt() {
  useRegisterSW({
    immediate: true,
    onNeedReload: reloadGently,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => reg.update().catch(() => {});
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    },
  });
  return null;
}
