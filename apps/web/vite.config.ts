import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Online play: the game server (apps/server) listens on 8787; the dev and preview servers
  // forward /ws to it so the app always talks to its own origin.
  server: { port: 5173, proxy: { '/ws': { target: `ws://localhost:${process.env.HEXFALL_SERVER_PORT ?? 8787}`, ws: true } } },
  preview: { port: 4173, proxy: { '/ws': { target: `ws://localhost:${process.env.HEXFALL_SERVER_PORT ?? 8787}`, ws: true } } },
  build: {
    target: 'es2020',
    // The lazy 3D-walk chunk (three.js) is ~610 kB; it only loads when the 3D view opens.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
