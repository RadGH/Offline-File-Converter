import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: process.env.VITE_BASE || './',
  server: {
    port: 5280,
    host: true,
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        about: resolve(__dirname, 'about.html'),
        upscale: resolve(__dirname, 'upscale.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  worker: {
    format: 'es',
  },
  // Exclude WASM-based packages from Vite's pre-bundling so their own
  // WASM asset URLs resolve correctly at runtime via the module's internal
  // fetch() paths rather than through Vite's optimized bundle.
  // onnxruntime-web must not be pre-bundled: its mjs/wasm side-files are
  // resolved via import.meta.url relative to the dist/ directory; if Vite
  // inlines them the relative URLs break. Excluding it causes Vite to serve
  // the raw ESM from node_modules/onnxruntime-web/dist/ directly.
  optimizeDeps: {
    exclude: ['@jsquash/avif', '@jsquash/webp', '@jsquash/jpeg', 'onnxruntime-web'],
  },
  // Ensure .wasm files are served with the correct MIME type
  assetsInclude: ['**/*.wasm'],
});
