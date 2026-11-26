// Génère les icônes PNG (iPhone, iPad, Mac, Android) à partir de public/favicon.svg.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const out = (n) => new URL(`../public/icons/${n}`, import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(name, size, { maskable = false, square = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  let s = svg;
  if (square || maskable) s = s.replace('rx="112"', 'rx="0"');
  const inner = maskable ? `<div style="width:100%;height:100%;background:linear-gradient(135deg,#D9A8CF,#A83278 50%,#81265D);display:flex;align-items:center;justify-content:center"><div style="width:80%;height:80%">${s.replace('rx="0" fill="url(#bg)"', 'rx="0" fill="none"')}</div></div>` : s;
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${inner.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: out(name), omitBackground: !square && !maskable, clip: { x: 0, y: 0, width: size, height: size } });
}
await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { maskable: true });
await render('apple-touch-icon.png', 180, { square: true }); // iOS arrondit lui-même les coins
await browser.close();
console.log('icônes générées');
