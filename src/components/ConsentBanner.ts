import {
  getConsent,
  setConsent,
  loadAnalytics,
  clearAnalyticsCookies,
  type Consent,
} from '@/lib/consent';

/**
 * GDPR-style consent banner. Shown when no decision has been made,
 * or can be re-opened via `openConsentBanner()` from the footer.
 */

let current: HTMLElement | null = null;

function buildBanner(onDecide: (c: Consent) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'consent-banner';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Cookie consent');
  el.innerHTML = `
    <div class="consent-banner__inner">
      <div class="consent-banner__body">
        <strong class="consent-banner__title">We'd like to use analytics cookies</strong>
        <p class="consent-banner__text">
          Your files are processed entirely in your browser and never uploaded.
          We'd like to use Google Analytics cookies to understand which features
          people use. You can reject without affecting the converter.
          See our <a href="/privacy.html" class="consent-banner__link">privacy notice</a>.
        </p>
      </div>
      <div class="consent-banner__actions">
        <button type="button" class="consent-banner__btn consent-banner__btn--reject" data-action="reject">Reject</button>
        <button type="button" class="consent-banner__btn consent-banner__btn--accept" data-action="accept">Accept</button>
      </div>
    </div>
  `;

  el.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLButtonElement | null;
    if (!btn) return;
    const action = btn.dataset.action as Consent;
    onDecide(action);
  });

  return el;
}

function closeBanner(): void {
  if (current && current.parentElement) current.parentElement.removeChild(current);
  current = null;
}

export function openConsentBanner(): void {
  if (current) return;
  current = buildBanner((decision) => {
    setConsent(decision);
    if (decision === 'accept') {
      loadAnalytics();
    } else {
      clearAnalyticsCookies();
    }
    closeBanner();
  });
  document.body.appendChild(current);
  // Focus the Accept button for keyboard users
  requestAnimationFrame(() => {
    current?.querySelector<HTMLButtonElement>('[data-action="accept"]')?.focus();
  });
}

/** Show the banner iff the user has not yet made a decision. */
export function maybeShowConsentBanner(): void {
  if (getConsent() === null) openConsentBanner();
}
