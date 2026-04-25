import { getCurrentTheme, setTheme, onThemeChange } from '@/lib/theme';

/**
 * Small icon button that toggles between light and dark themes.
 * The icon shown is the OPPOSITE of the current theme (sun when dark, moon
 * when light) since the click switches to that target.
 */
export function createThemeToggle(): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rd-theme-toggle';
  btn.setAttribute('aria-label', 'Toggle dark mode');

  function render(): void {
    const t = getCurrentTheme();
    btn.dataset.current = t;
    btn.title = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    btn.innerHTML = t === 'dark'
      // Sun icon (shown when dark — clicking switches to light)
      ? `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
           <circle cx="12" cy="12" r="4" fill="currentColor"/>
           <g stroke="currentColor" stroke-width="2" stroke-linecap="round">
             <line x1="12" y1="2" x2="12" y2="5"/>
             <line x1="12" y1="19" x2="12" y2="22"/>
             <line x1="2" y1="12" x2="5" y2="12"/>
             <line x1="19" y1="12" x2="22" y2="12"/>
             <line x1="4.5" y1="4.5" x2="6.6" y2="6.6"/>
             <line x1="17.4" y1="17.4" x2="19.5" y2="19.5"/>
             <line x1="4.5" y1="19.5" x2="6.6" y2="17.4"/>
             <line x1="17.4" y1="6.6" x2="19.5" y2="4.5"/>
           </g>
         </svg>`
      // Moon icon (shown when light — clicking switches to dark)
      : `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
           <path d="M20 14.5A8 8 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" fill="currentColor"/>
         </svg>`;
  }

  btn.addEventListener('click', () => {
    const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });

  onThemeChange(render);
  render();

  return btn;
}
