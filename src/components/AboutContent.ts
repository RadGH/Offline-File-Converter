/**
 * About page / modal content — shared between the modal and the standalone about.html page.
 * Returns inner HTML string; the caller is responsible for wrapping it.
 */
export function getAboutHTML(): string {
  return `
    <h1>About this converter</h1>

    <h2>What this is</h2>
    <p>
      A fast, privacy-first image converter that runs entirely in your browser. Your files never
      leave your device — no uploads, no accounts, no servers. Everything happens locally using
      the same APIs your browser already ships with.
    </p>

    <h2>How to use it</h2>
    <ul>
      <li><strong>Add images</strong> — drop files onto the drop zone, click it to open a file picker, or paste an image from your clipboard anywhere on the page.</li>
      <li><strong>Convert</strong> — each image appears as a card in the queue and starts converting automatically as soon as it's added.</li>
      <li><strong>Re-convert</strong> — finished items show a Re-convert button. Change settings and run again without re-uploading.</li>
      <li><strong>Compare panel</strong> — click Compare on a finished item to open a side-by-side slider showing before vs. after.</li>
      <li><strong>Download</strong> — download files individually, or use the ZIP button to grab everything at once.</li>
    </ul>

    <h2>Settings explained</h2>
    <ul>
      <li><strong>Format</strong> — the output file type. See the Format guide below.</li>
      <li><strong>Quality</strong> — for lossy formats (JPEG, WebP, AVIF): 1 = smallest file, 100 = closest to original. 80–90 is a good starting point for most images. Not applicable to lossless formats.</li>
      <li><strong>Size (W × H)</strong> — target output dimensions in pixels. Leave blank to keep the original size. Toggle the <strong>%</strong> button to type a percentage of the source instead (e.g. 50 = half size).</li>
      <li><strong>Maintain aspect ratio</strong> — when on, typing just one dimension locks the other proportionally.</li>
      <li><strong>Preserve orientation</strong> — when on, the dimension you type applies to the longer side of the source image, so portrait and landscape photos come out the right way.</li>
      <li><strong>Resample</strong> — the algorithm used when scaling: <em>High</em> gives the sharpest result, <em>Bilinear</em> is fast and smooth, <em>Nearest</em> preserves hard pixel edges (good for pixel art).</li>
      <li><strong>Strip metadata</strong> — removes EXIF data (camera model, GPS, date) from the output. On by default for privacy.</li>
    </ul>

    <h2>Format guide</h2>
    <dl class="about-format-guide">
      <dt>JPEG</dt>
      <dd>Universally supported, lossy compression. Best for photographs and images with lots of colour gradients. Quality 85–95 is typical. Not suitable for images that need transparency.</dd>

      <dt>PNG</dt>
      <dd>Lossless — pixel-perfect reproduction. Supports transparency (alpha channel). Best for screenshots, UI graphics, logos, and pixel art. We automatically run every PNG through our UPNG optimizer, which picks the most compact colour mode (palette, greyscale, or truecolor) and can shrink files dramatically compared to a raw canvas export.</dd>

      <dt>WebP</dt>
      <dd>Modern format supported by all current browsers. Often 25–35% smaller than JPEG at the same perceived quality. Supports both lossy and lossless modes, and full transparency. A good general-purpose choice when you're targeting the web.</dd>

      <dt>AVIF</dt>
      <dd>The newest and most efficient format — typically 40–50% smaller than JPEG at the same quality. Supports transparency and HDR. The trade-off is slower encoding (a few seconds per image in the browser). Best when bandwidth matters most: web delivery, archival, or large batches where you can wait.</dd>

      <dt>GIF</dt>
      <dd>A legacy format limited to 256 colours. Only useful when you specifically need a .gif file (e.g. a platform that won't accept anything else). We encode static GIFs — no animation. For anything else, PNG or WebP will produce a smaller, higher-quality result.</dd>

      <dt>HEIC (input only)</dt>
      <dd>Apple's photo format used by iPhones. We decode it automatically — just drop the file in and choose your preferred output format. HEIC output is not supported.</dd>
    </dl>

    <h2>Privacy</h2>
    <p>
      Your images are never uploaded. Conversion happens entirely in your browser.
      See the <a href="#privacy" class="about-privacy-link">Privacy Notice</a> for full details on analytics and cookies.
    </p>

    <p class="about-github">
      <a href="https://github.com/RadGH/Offline-File-Converter" target="_blank" rel="noopener noreferrer">View source on GitHub</a>
      &nbsp;·&nbsp; Built by <a href="https://radleysustaire.com/" target="_blank" rel="noopener noreferrer">Radley Sustaire</a>
      with <a href="https://claude.com/" target="_blank" rel="noopener noreferrer">Claude</a> AI
    </p>
  `;
}
