/**
 * Скриншоты для README: node scripts/screenshots.mjs [адрес dev-сервера]
 * Снимает Студию с разными эффектами, ящик с кодом и главную. Сохраняет в WebP
 * (сжимает сам браузер — без сторонних утилит).
 */
import { writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:5190'
const browser = await chromium.launch({ channel: 'chrome' })

async function shot(name, { path, width = 1440, height = 900, mobile = false, steps, settle = true } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile })
  await page.goto(base + path)
  await page.waitForTimeout(1200)
  await page.evaluate(() => document.fonts.ready)
  await steps?.(page)
  // settle: false — снимаем сразу после шагов (например, посреди анимации).
  if (settle) await page.waitForTimeout(500)
  // Панель FPS в Студии включена при разработке — на картинках она не нужна.
  await page.evaluate(() => document.querySelectorAll('.k3d-perf').forEach((el) => el.remove()))
  const png = await page.screenshot()
  await writeFile(`docs/screenshots/${name}.webp`, await toWebp(page, png, mobile ? 780 : 1600))
  await page.close()
}

const hover = async (page, selector) => {
  const box = await page.locator(selector).boundingBox()
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4)
  await page.waitForTimeout(200)
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 8 })
  await page.waitForTimeout(500)
}

await shot('home', { path: '/' })
await shot('studio-waves', { path: '/studio.html?e=waves' })
await shot('studio-aurora', { path: '/studio.html?e=aurora&background=02060c&colorA=1fe08a&colorB=22d3ee&colorC=7b5cff' })
await shot('studio-lava', { path: '/studio.html?e=lava' })
await shot('studio-space', { path: '/studio.html?e=space' })
await shot('studio-image', { path: '/studio.html?e=image-distort&mode=rgb', steps: (p) => hover(p, '.photo') })
await shot('studio-burn', {
  path: '/studio.html?e=burn',
  steps: async (p) => {
    const demo = p.locator('.demo')
    const h = await demo.evaluate((d) => d.clientHeight)
    await demo.evaluate((d, y) => d.scrollTo(0, y), 0.7 * h + 0.5 * h)
    await p.waitForTimeout(400)
    await demo.evaluate((d, y) => d.scrollTo(0, y), 0.7 * h + 0.62 * h)
    await p.waitForTimeout(300)
  },
})
await shot('studio-slides', {
  path: '/studio.html?e=slides&mode=circle&edge=22d3ee&softness=0.05&intensity=0.8&duration=3',
  steps: async (p) => {
    await p.getByRole('button', { name: 'Следующий слайд' }).click()
    await p.waitForTimeout(900)
  },
  settle: false,
})
await shot('studio-tilt', { path: '/studio.html?e=tilt', steps: (p) => hover(p, '.tilt-card') })
await shot('code', { path: '/studio.html?e=noise', steps: (p) => p.getByRole('button', { name: 'Забрать код' }).click() })
await shot('mobile', { path: '/studio.html?e=aurora', width: 390, height: 844, mobile: true })

await browser.close()

async function toWebp(page, png, width) {
  const base64 = await page.evaluate(
    async ({ data, width }) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = new OffscreenCanvas(width, Math.round((bitmap.height * width) / bitmap.width))
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const buffer = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/webp', quality: 0.85 })).arrayBuffer())
      let binary = ''
      for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000))
      return btoa(binary)
    },
    { data: png.toString('base64'), width },
  )
  return Buffer.from(base64, 'base64')
}
