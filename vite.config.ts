/**
 * Две страницы: витрина (index.html) и Студия (studio.html).
 * На GitHub Pages сайт живёт в подпапке — base задаётся переменной окружения.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url))
// Версия three для import map в экспорте 3D-эффектов — та, с которой проверена Студия.
const threeVersion = JSON.parse(readFileSync(new URL('node_modules/three/package.json', import.meta.url), 'utf8')).version

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  define: { __THREE_VERSION__: JSON.stringify(threeVersion) },
  build: {
    target: 'es2022',
    // three.js — отдельный ленивый кусок ≈ 740 КБ (≈ 187 КБ gzip), грузится только для 3D-эффектов.
    chunkSizeWarningLimit: 800,
    rolldownOptions: { input: { index: page('index.html'), studio: page('studio.html') } },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
