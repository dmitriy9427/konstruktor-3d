/**
 * Сквозная проверка Студии: каждый эффект открывается, шейдер компилируется,
 * на холсте не пусто, в консоли нет ошибок. Плюс «Забрать код» и ссылка.
 */
import { expect, test, type Page } from '@playwright/test'

import { EFFECTS } from '../src/effects'

/**
 * Средняя яркость и разброс пикселей холста — «нарисовано ли что-то».
 * WebGL-холст напрямую не прочитать (буфер кадра очищается после показа),
 * поэтому снимаем скриншот элемента и считаем по нему в браузере.
 */
async function canvasStats(page: Page, selector: string) {
  const png = (await page.locator(selector).screenshot()).toString('base64')
  return page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    const canvas = new OffscreenCanvas(64, 64)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, 64, 64)
    const pixels = ctx.getImageData(0, 0, 64, 64).data
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < pixels.length; i += 4) {
      const v = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
      sum += v
      sumSq += v * v
    }
    const n = pixels.length / 4
    const mean = sum / n
    return { mean, spread: Math.sqrt(sumSq / n - mean * mean) }
  }, png)
}

for (const effect of EFFECTS) {
  test(`эффект «${effect.name}» рисуется без ошибок`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`studio.html?e=${effect.id}`)
    await expect(page.getByRole('heading', { level: 1, name: effect.name }).or(page.locator('.preview--image, .preview--tilt, .preview--transition'))).toBeVisible()
    await expect(page.locator('.preview__error')).toHaveCount(0)
    if (effect.kind === 'transition') {
      // Прокручиваем мини-страницу превью: на середине стека секция горит, в конце — скрыта.
      const demo = page.locator('.demo')
      const cover = page.locator('.demo__a')
      const h = await demo.evaluate((d) => d.clientHeight)
      await demo.evaluate((d, y) => d.scrollTo(0, y), 0.7 * h + h)
      await expect(cover).toHaveCSS('filter', /url/)
      await demo.evaluate((d, y) => d.scrollTo(0, y), 0.7 * h + 2.2 * h)
      await expect(cover).toHaveCSS('visibility', 'hidden')
      await demo.evaluate((d) => d.scrollTo(0, 0))
      await expect(cover).toHaveCSS('visibility', 'visible')
    } else if (effect.kind !== 'css') {
      const selector = effect.kind === 'image' ? '.photo__canvas' : effect.kind === 'slides' ? '.slider__canvas' : '.preview__canvas'
      await page.waitForTimeout(600)
      const stats = await canvasStats(page, selector)
      expect(stats.mean, 'холст не чёрный').toBeGreaterThan(2)
      if (effect.kind === 'quad') expect(stats.spread, 'на холсте есть рисунок, а не заливка').toBeGreaterThan(1)
    }
    expect(errors).toEqual([])
  })
}

test('пресет и ползунок попадают в адрес, код открывается', async ({ page }) => {
  await page.goto('studio.html?e=lava')
  await page.locator('.presets .chip').nth(1).click()
  await expect(page).toHaveURL(/e=lava&/)
  await page.getByRole('button', { name: 'Забрать код' }).click()
  const drawer = page.getByRole('dialog', { name: 'Забрать код' })
  await expect(drawer.locator('code')).toContainText('export function mount')
  await drawer.getByText('React').click()
  await expect(drawer.getByRole('tab', { name: 'Effect.tsx' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(drawer).toHaveCount(0)
})

test('экспортированный модуль работает на чистой странице', async ({ page }) => {
  await page.goto('studio.html?e=aurora')
  await page.getByRole('button', { name: 'Забрать код' }).click()
  const code = await page.getByRole('dialog').locator('code').textContent()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Пустая страница: только блок и код эффекта (через blob — как отдельный файл).
  await page.setContent('<div id="hero-bg" style="width:400px;height:300px"></div>')
  await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source!], { type: 'text/javascript' }))
    const { mount } = await import(/* @vite-ignore */ url)
    mount(document.querySelector('#hero-bg'))
  }, code)
  await page.waitForTimeout(800)
  const stats = await canvasStats(page, '#hero-bg canvas')
  expect(stats.spread).toBeGreaterThan(1)
  expect(errors).toEqual([])
})

test('экспортированный переход прогорает по кнопке на чистой странице', async ({ page }) => {
  await page.goto('studio.html?e=burn&trigger=manual')
  await page.getByRole('button', { name: 'Забрать код' }).click()
  const code = await page.getByRole('dialog').locator('code').textContent()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.setContent('<div style="position:relative;height:400px"><div>под обложкой</div><div id="leaving" style="position:absolute;inset:0;background:#eee">обложка</div></div>')
  await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source!], { type: 'text/javascript' }))
    const { mount } = await import(/* @vite-ignore */ url)
    const t = mount('#leaving')
    t.progress(0.5)
  }, code)
  await expect(page.locator('#leaving')).toHaveCSS('filter', /url/)
  expect(errors).toEqual([])
})

test('слайдер: «вперёд» переключает слайд, переход доигрывает до конца', async ({ page }) => {
  await page.goto('studio.html?e=slides&duration=0.4')
  await page.getByRole('button', { name: 'Следующий слайд' }).click()
  await expect(page.getByRole('button', { name: 'Слайд 2' })).toHaveAttribute('aria-current', 'true')
  await page.getByRole('button', { name: 'Слайд 1' }).click()
  await expect(page.getByRole('button', { name: 'Слайд 1' })).toHaveAttribute('aria-current', 'true')
})

test('экспортированный слайдер листается на чистой странице', async ({ page }) => {
  await page.goto('studio.html?e=slides&duration=0.3')
  await page.getByRole('button', { name: 'Забрать код' }).click()
  const code = await page.getByRole('dialog').locator('code').textContent()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'warning' && errors.push(m.text()))
  const svg = (color: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="${color}"/><circle cx="150" cy="100" r="60" fill="#fff"/></svg>`)}`
  await page.setContent(`<div id="slider" style="width:300px"><img src="${svg('#c33')}" width="300" height="200"><img src="${svg('#36c')}" width="300" height="200"></div>`)
  const index = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(new Blob([source!], { type: 'text/javascript' }))
    const { mount } = await import(/* @vite-ignore */ url)
    const slider = mount(document.querySelector('#slider'))
    slider.next()
    await new Promise((r) => setTimeout(r, 600))
    return slider.index
  }, code)
  expect(index).toBe(1)
  // Второй слайд синий: синий канал в центре-слева больше красного.
  const png = (await page.locator('#slider canvas').screenshot()).toString('base64')
  const [r, , b] = await page.evaluate(async (data) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob())
    const c = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = c.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    return [...ctx.getImageData(10, 10, 1, 1).data]
  }, png)
  expect(b).toBeGreaterThan(r)
  expect(errors).toEqual([])
})
