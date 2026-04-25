/**
 * Light/dark theme manager.
 *
 *  - Default: follow `prefers-color-scheme` (system).
 *  - Once the user clicks the toggle, the choice is saved to localStorage and
 *    overrides the system preference until cleared.
 *  - System preference changes are honoured live ONLY when no explicit user
 *    preference is stored (i.e. while still in "auto" mode).
 *
 * Theme is applied via a `data-theme` attribute on <html>: "light" | "dark".
 * CSS in main.css uses `:root[data-theme="dark"]` to override the warm-cream
 * variables with their dark-warm counterparts.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'converter.theme.v1';

function readSaved(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

function systemPrefers(): Theme {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

function apply(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  // Update <meta name="theme-color"> so mobile chrome address bar matches.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = theme === 'dark' ? '#231f1c' : '#fdf9f3';
  }
}

const listeners = new Set<(t: Theme) => void>();

export function getCurrentTheme(): Theme {
  return readSaved() ?? systemPrefers();
}

export function isUsingSystemPreference(): boolean {
  return readSaved() === null;
}

export function setTheme(theme: Theme): void {
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  apply(theme);
  listeners.forEach(fn => fn(theme));
}

/** Reset to "follow system" mode. Currently not exposed in the UI; available for future. */
export function clearThemePreference(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  const t = systemPrefers();
  apply(t);
  listeners.forEach(fn => fn(t));
}

export function onThemeChange(fn: (t: Theme) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Call once at boot. Applies the current theme and starts watching system pref. */
export function initTheme(): void {
  apply(getCurrentTheme());

  if (typeof matchMedia !== 'function') return;
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onChange = (): void => {
    if (isUsingSystemPreference()) {
      const next: Theme = mq.matches ? 'dark' : 'light';
      apply(next);
      listeners.forEach(fn => fn(next));
    }
  };
  // Both listeners for compatibility with old Safari.
  if ('addEventListener' in mq) mq.addEventListener('change', onChange);
}
