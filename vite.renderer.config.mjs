import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    global: 'globalThis',
  },
  build: {
    rollupOptions: {
      // This is a single-window app that navigates between pages via
      // window.location.href (index.html -> tickets.html), not separate
      // BrowserWindows - Vite needs both listed explicitly as entry points
      // or only index.html makes it into the packaged build.
      input: {
        index: fileURLToPath(new URL('./index.html', import.meta.url)),
        tickets: fileURLToPath(new URL('./tickets.html', import.meta.url)),
      },
    },
  },
});
