import { defineConfig } from 'vite';

// Plain (non-lib) build: lib mode skips whitespace minification for ES output.
export default defineConfig({
  build: {
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      input: 'src/adslot.ts',
      output: { entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js' },
    },
  },
});
