/**
 * Consent manager for analytics cookies (GDPR / ePrivacy).
 *
 * Contract:
 *  - On first visit there is NO consent decision. Analytics MUST NOT load.
 *  - User explicitly clicks Accept or Reject in the banner.
 *  - Decision is persisted in localStorage.
 *  - Accept → we inject Google Analytics (gtag.js).
 *  - Reject → we do nothing. Also attempt to clear any GA cookies already set.
 *  - The decision can be changed later via "Manage cookies" in the footer.
 */

export type Consent = 'accept' | 'reject';

const STORAGE_KEY = 'converter.analyticsConsent.v1';
const GA_MEASUREMENT_ID = 'G-QDQRJQ2WD4';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __gaLoaded?: boolean;
  }
}

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'accept' || v === 'reject' ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(v: Consent): void {
  try {
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    // Ignore storage errors (private mode, quota, etc.) — user can re-decide next visit.
  }
}

export function clearConsent(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

export function hasDecision(): boolean {
  return getConsent() !== null;
}

/** Inject the gtag.js script and initialise. Idempotent. */
export function loadAnalytics(): void {
  if (window.__gaLoaded) return;
  window.__gaLoaded = true;

  window.dataLayer = window.dataLayer || [];
  const gtag: (...args: unknown[]) => void = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID, {
    anonymize_ip: true,
  });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(s);
}

/** Best-effort cookie clearing on reject. GA writes `_ga*` cookies scoped to the current domain. */
export function clearAnalyticsCookies(): void {
  const cookies = document.cookie.split(';');
  for (const c of cookies) {
    const name = c.split('=')[0].trim();
    if (name.startsWith('_ga') || name.startsWith('_gid') || name.startsWith('_gat')) {
      const host = location.hostname;
      const domains = [host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
      for (const d of domains) {
        document.cookie = `${name}=; path=/; domain=${d}; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
      document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  }
}

/** Call once on boot. Loads analytics only if the user already accepted previously. */
export function initConsent(): void {
  if (getConsent() === 'accept') {
    loadAnalytics();
  }
}
