import { defineConfig } from 'playwright/test';
import path from 'node:path';

const API_PORT = Number(process.env.E2E_API_PORT ?? 8100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5180);
const API_URL = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: './tests',
  // Backend state (the stubbed leaderboard) is shared, so run serially.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `.venv/bin/uvicorn main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: '../backend',
      url: `${API_URL}/`,
      env: {
        // In-memory fake of the supabase client so tests never touch the real DB.
        PYTHONPATH: path.join(import.meta.dirname, 'stubs'),
        SUPABASE_URL: 'http://stub.invalid',
        SUPABASE_KEY: 'stub',
      },
      reuseExistingServer: false,
    },
    {
      // Test the production bundle: dev mode's StrictMode double-effects can hide bugs.
      command: `npx vite build --outDir ${path.join(import.meta.dirname, '.dist')} --emptyOutDir && npx vite preview --outDir ${path.join(import.meta.dirname, '.dist')} --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: '../frontend',
      url: `http://127.0.0.1:${WEB_PORT}/`,
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: false,
    },
  ],
});
