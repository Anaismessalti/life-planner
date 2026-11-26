# Life Planner

Application personnelle (PWA) installable sur iPhone, iPad et Mac : journée, calendrier, projets, budget, notes et inspirations. Entièrement en français, gratuite, utilisable hors ligne.

**Adresse :** https://anaismessalti.github.io/life-planner/

## Technique
- React + TypeScript + Vite + Tailwind CSS, `vite-plugin-pwa` (manifeste, service worker, mises à jour).
- Stockage local IndexedDB (Dexie). Suppressions « douces » et horodatage par champ pour une fusion sans perte.
- Synchronisation facultative : Firebase Firestore + Authentification (offre gratuite Spark), configurée depuis les Paramètres. Règles de sécurité : chaque compte n'accède qu'à `users/{uid}`.
- Hébergement : GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`) : tests unitaires puis publication à chaque push sur `main`.

## Développement
```
npm install
npm run dev        # serveur local
npm test           # tests unitaires (récurrences, report, budget, synchro)
npm run build      # version de production dans dist/
node e2e/run.mjs   # tests navigateur (nécessite `npx vite preview` et Playwright)
node e2e/sync.mjs  # synchro réelle entre deux appareils (émulateurs Firebase sur 127.0.0.1)
```
