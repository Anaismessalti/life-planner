import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const single = mode === 'singlefile';
  return {
    base: process.env.BASE_PATH || './',
    define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0') },
    resolve: single ? { alias: { 'virtual:pwa-register/react': '/src/stubs/pwa-register.ts' } } : undefined,
    build: single ? { outDir: 'dist-preview', assetsInlineLimit: 100000000 } : { outDir: 'dist' },
    plugins: [
      react(),
      single
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icons/*.png', 'favicon.svg'],
            manifest: {
              name: 'Life Planner',
              short_name: 'Planner',
              description: 'Mon organisation, mes projets, mon budget et mes inspirations.',
              lang: 'fr',
              start_url: './',
              scope: './',
              display: 'standalone',
              orientation: 'any',
              background_color: '#FFF8FC',
              theme_color: '#FFF8FC',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
              globIgnores: ['**/*cyrillic*', '**/*vietnamese*', '**/*greek*'],
              navigateFallback: 'index.html',
              cleanupOutdatedCaches: true,
              skipWaiting: true,
              clientsClaim: true,
              maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
          }),
    ],
    test: { environment: 'jsdom', setupFiles: ['tests/setup.ts'], include: ['tests/**/*.test.ts'] },
  };
});
