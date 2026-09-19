import { defineConfig } from 'vite';

export default defineConfig({
  // Shared Drops are served at /u/<id>. Root-relative assets keep the app bundle
  // reachable from that nested public URL instead of resolving to /u/assets/...
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
