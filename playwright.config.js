import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node server/index.js",
    url: "http://localhost:4173/api/config",
    reuseExistingServer: false,
    env: {
      PORT: "4173",
      ADMIN_PASSWORD: "browser-test-password",
      DATABASE_PATH: "./test-results/browser.sqlite",
      SMTP_HOST: "",
      SMTP_FROM: "",
    },
  },
});
