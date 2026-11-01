import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    // Start the full E2E stack: PhpEditor (which spawns devsense-php-ls and writes
    // its bound WebSocket port to public/php-editor-port) plus Vite serving the
    // sampleweb app on port 5173. Playwright waits for `url` to respond before
    // running tests and stops both processes when the test run ends.
    command: 'npx concurrently "node ../devsense-php-editor/dist/index.js public/php-editor-port" "npx vite --port 5173"',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
