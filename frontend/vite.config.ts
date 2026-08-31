import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pinned so the dev origin matches the backend's WEB_APP_URL / CORS origin
    // and the Spotify OAuth redirect target. strictPort fails loudly rather
    // than silently switching ports (which would break the callback + CORS).
    // 5199 (not Vite's default 5173) to avoid colliding with other local dev
    // servers on this machine.
    port: 5199,
    strictPort: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
