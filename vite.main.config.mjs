import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    // Some deps work in both browser and Node - this tells Vite to build
    // them in Node mode, since this is the main process.
    browserField: false,
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});
