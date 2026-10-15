import { defineConfig } from '@playwright/test'

const port = 5191

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://localhost:${port}/`,
    // Локально — установленный Chrome (настоящий GPU), в CI — Chromium из Playwright.
    channel: process.env.CI ? undefined : 'chrome',
    // В CI нет видеокарты: WebGL рисует программный рендер SwiftShader.
    launchOptions: process.env.CI ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {},
  },
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
  },
})
