// playwright.config.js - Authoritative E2E Test Runner Configuration
// Reference: skills/testing-e2e/SKILL.md

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'node scratch/test-server.cjs',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 10000
  }
});
