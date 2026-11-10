import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/flipper-status.ui.spec.mjs', workers: 1, reporter: 'line',
  use: { baseURL: 'http://127.0.0.1:4175', browserName: 'chromium', headless: true,
    launchOptions: process.env.APEX_CHROMIUM_PATH ? { executablePath: process.env.APEX_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {} },
  webServer: { command: 'python3 -m http.server 4175 --bind 127.0.0.1 --directory dist-flipper', url: 'http://127.0.0.1:4175', timeout: 15000 },
});
