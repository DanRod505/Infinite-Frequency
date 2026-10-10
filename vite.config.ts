import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    // Three.js alone is ~700 kB minified; it is a single, cacheable dependency.
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
