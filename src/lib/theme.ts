export type Theme = 'light' | 'dark' | 'auto';
export function getTheme(): Theme {
  try {
    return (localStorage.getItem('theme') as Theme) || 'light';
  } catch {
    return 'light';
  }
}
export function applyTheme(t: Theme = getTheme()) {
  try {
    localStorage.setItem('theme', t);
  } catch {}
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1C121A' : '#FFF8FC');
}
