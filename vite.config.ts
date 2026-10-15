/**
 * Две страницы: витрина (index.html) и Студия (studio.html).
 * На GitHub Pages сайт живёт в подпапке — base задаётся переменной окружения.
 */
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url))

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: {
    target: 'es2022',
    rolldownOptions: { input: { index: page('index.html'), studio: page('studio.html') } },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
