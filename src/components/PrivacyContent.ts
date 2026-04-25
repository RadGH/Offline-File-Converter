/**
 * Privacy notice content — shared between the modal and the standalone privacy.html page.
 * Returns inner HTML string; the caller is responsible for wrapping it.
 */
export function getPrivacyHTML(): string {
  return `
    <h1>Privacy Notice</h1>
    <p class="privacy-doc__updated">Last updated: 2026-04-23</p>

    <h2>Short version</h2>
    <p>
      When you use the converter, your images stay on your device. Conversion runs entirely in
      your browser — no file is ever transmitted to us or to any third party. This site may use
      Google Analytics cookies to count page visits, <strong>only if you accept them</strong>.
      The converter is 100% local: no cloud, no uploads, no server processing.
    </p>

    <h2>What data leaves your device</h2>
    <ul>
      <li><strong>Your images:</strong> never. All decoding, resizing, and re-encoding happens client-side.</li>
      <li>
        <strong>With your consent</strong>, anonymised pageview and event data sent to Google Analytics
        (measurement ID G-QDQRJQ2WD4). This includes: page path, browser, approximate region, and timing.
        IP addresses are anonymised on transmission.
      </li>
      <li>Without your consent, no analytics or tracking cookies are set.</li>
    </ul>

    <h2>Cookies</h2>
    <ul>
      <li><code>converter.analyticsConsent.v1</code> — first-party localStorage entry recording your consent choice. Set whether you accept or reject. Required to remember your preference.</li>
      <li><code>_ga</code>, <code>_ga_*</code>, <code>_gid</code> — Google Analytics cookies, only set if you accept.</li>
    </ul>

    <h2>Managing your choice</h2>
    <p>
      You can change your mind at any time using the <strong>"Manage cookies"</strong> link in the
      footer. Rejecting will remove any GA cookies that were previously set and prevent the
      analytics script from loading again.
    </p>

    <h2>Your rights (GDPR / UK-GDPR)</h2>
    <p>
      If you're in the EU/EEA or UK: you have the right to access, rectify, or erase personal data
      we hold about you, and to object to processing. Since we only collect what Google Analytics
      receives, most requests are most easily fulfilled via Google directly. To contact us about
      this site, open an issue at
      <a href="https://github.com/RadGH/Offline-File-Converter/issues" target="_blank" rel="noopener noreferrer">the project's GitHub repository</a>.
    </p>

    <h2>Third parties</h2>
    <ul>
      <li><strong>Google Analytics</strong> (analytics) — only if you consent.</li>
      <li><strong>GitHub Pages</strong> (hosting) — serves this site's static files. GitHub may log standard request metadata (IP, user-agent) server-side; this is outside our control. See <a href="https://docs.github.com/en/site-policy/privacy-policies/github-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub's Privacy Statement</a>.</li>
      <li>
        <strong>Hugging Face Hub</strong> (optional, upscale variant only) — the AI upscaler model is hosted by Hugging Face. It is only fetched when you explicitly click <em>Download model</em>. Once downloaded, the ~18 MB file is cached in your browser's IndexedDB and never re-fetched. Hugging Face sees a one-time static-asset request (IP, user-agent); no image data is sent.
      </li>
      <li>
        <strong>Lazy-loaded code chunks</strong> (WebAssembly codecs for AVIF, HEIC, PNG optimisation, GIF, ZIP packing) are served from this domain only — no third-party CDN is used.
      </li>
    </ul>

    <h2>No account, no profiling</h2>
    <p>
      There is no sign-in, no account, no user profile. We do not run ads. We do not fingerprint
      your device. We do not sell data.
    </p>
  `;
}
