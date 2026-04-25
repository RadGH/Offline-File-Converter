/**
 * Bootstrapper for standalone documentation pages (privacy.html, about.html).
 * Reads data-page attribute from <html> to determine which content to render.
 *
 * Usage in HTML:
 *   <html data-doc-page="privacy"> or <html data-doc-page="about">
 */

import './styles/main.css';
import { initTheme } from '@/lib/theme';
import { createThemeToggle } from '@/components/ThemeToggle';
import { getPrivacyHTML } from '@/components/PrivacyContent';
import { getAboutHTML } from '@/components/AboutContent';

initTheme();

const page = document.documentElement.dataset.docPage ?? '';

// Build top bar
const topbar = document.createElement('header');
topbar.className = 'rd-header';
topbar.innerHTML = `
  <div class="rd-header__brand">
    <a href="/" class="rd-header__logo rd-header__logo--link">Image Converter</a>
  </div>
  <div class="rd-header__right"></div>
`;
topbar.querySelector('.rd-header__right')?.appendChild(createThemeToggle());

// Build main content
const main = document.createElement('main');
main.className = 'privacy-doc';
main.id = 'main';

if (page === 'privacy') {
  main.innerHTML = getPrivacyHTML();
} else if (page === 'about') {
  main.innerHTML = getAboutHTML();
  main.classList.add('about-doc');
} else {
  main.innerHTML = '<p>Page not found.</p>';
}

// Add back link
const backLink = document.createElement('a');
backLink.href = '/';
backLink.className = 'back-link';
backLink.textContent = '← Back to the converter';
main.appendChild(backLink);

const app = document.getElementById('app');
if (app) {
  app.appendChild(topbar);
  app.appendChild(main);
} else {
  document.body.appendChild(topbar);
  document.body.appendChild(main);
}
