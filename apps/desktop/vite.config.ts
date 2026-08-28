import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // IMPORTANT: point straight at the TypeScript source, not the package
      // name resolution Vite would otherwise use (which reads
      // packages/shared/package.json's "main": "dist/index.js" — a
      // CommonJS build). Vite's renderer runs in an ESM context and cannot
      // import a CJS module's named exports directly, which is exactly
      // what produces "does not provide an export named 'PERMISSIONS'".
      // Aliasing to src/ lets Vite's own esbuild pipeline transpile the
      // shared package the same way it transpiles the rest of the app, so
      // no separate build step of packages/shared is required for the
      // desktop dev server to work.
      '@shoes/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
