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
  optimizeDeps: {
    exclude: ['@jsquash/avif'],
  },
  // Ensure .wasm files are served with the correct MIME type
  assetsInclude: ['**/*.wasm'],
});
