import { defineConfig, devices } from "@playwright/test";

const FRONTEND_URL = "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests",
  testMatch: /pwa\.spec\.js/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "pwa",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm start",
      cwd: "../backend",
      url: "http://localhost:5050/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
      env: { FRONTEND_ORIGIN: FRONTEND_URL },
    },
    {
      command: "npm run build && npm start -- -H 127.0.0.1 -p 3100",
      cwd: ".",
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
