import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/ui.smoke.spec.mjs',
  timeout: 30000, reporter: 'line', workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', headless: true,
    launchOptions: process.env.APEX_CHROMIUM_PATH ? {
      executablePath: process.env.APEX_CHROMIUM_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote', '--single-process'],
    } : {},
  },
  webServer: { command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory dist', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 15000 },
});
