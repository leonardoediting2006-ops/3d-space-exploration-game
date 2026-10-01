import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true },
  // One editor page: React, the renderer and the 333-template library ship together (about 180 KB gzipped).
  build: { chunkSizeWarningLimit: 700 },
});
