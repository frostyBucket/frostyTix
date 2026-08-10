import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  // ...your existing config...
  define: {
    global: 'globalThis',
  },
});
