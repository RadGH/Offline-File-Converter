const app = document.getElementById('app');
if (app) {
  app.innerHTML = `
    <header class="site-header">
      <h1>Offline Image Converter</h1>
      <p class="tagline">Convert &amp; compress images in your browser. Files never leave your device.</p>
    </header>
    <main id="main"></main>
    <footer class="site-footer">
      <p>100% private. No uploads. No accounts.</p>
    </footer>
  `;
}
