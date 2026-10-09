import { defineConfig } from 'vite';

// base './' makes the build work on any GitHub Pages path (user.github.io/<repo>/).
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 },
});
