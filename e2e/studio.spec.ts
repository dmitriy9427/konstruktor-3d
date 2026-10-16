/**
 * Сквозная проверка Студии: каждый эффект открывается, шейдер компилируется,
 * на холсте не пусто, в консоли нет ошибок. Плюс «Забрать код» и ссылка.
 */
import { expect, test, type Page } from '@playwright/test'

import { readFileSync } from 'node:fs'

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
    // 3D в CI рисует программный рендер (SwiftShader): меньше пикселей и больше времени.
    if (effect.kind === 'three') test.slow()
    await page.goto(`studio.html?e=${effect.id}${effect.kind === 'three' ? '&_quality=0.5' : ''}`)
    await expect(page.getByRole('heading', { level: 1, name: effect.name }).or(page.locator('.preview--image, .preview--tilt, .preview--transition'))).toBeVisible()
    await expect(page.locator('.preview__error')).toHaveCount(0)
    if (effect.kind === 'transition') {
      // Прокручиваем мини-страницу превью: на середине стека секция горит, в конце — скрыта.
      const demo = page.locator('.demo')
      const cover = page.locator('.demo__a')
      const h = await demo.evaluate((d) => d.clientHeight)
      await demo.evaluate((d, y) => d.scrollTo(0, y), 0.7 * h + h)
      await expect(cover).toHaveCSS('filter', /url/)
      // Холст огня лежит ровно на секции (+80 px запаса с каждой стороны): его не сжал
      // сброс стилей «canvas { max-width: 100% }» Студии.
      if (await cover.evaluate((el) => el.nextElementSibling?.tagName === 'CANVAS')) {
        const [a, c] = await cover.evaluate((el) => [el.getBoundingClientRect().width, el.nextElementSibling!.getBoundingClientRect().width])
        expect(Math.round(c - a)).toBe(160)
      }
      await demo.evaluate((d, y) => d.scrollTo(0, y), 0.7 * h + 2.2 * h)
      await expect(cover).toHaveCSS('visibility', 'hidden')
      await demo.evaluate((d) => d.scrollTo(0, 0))
      await expect(cover).toHaveCSS('visibility', 'visible')
    } else if (effect.kind !== 'css') {
      const selector = effect.kind === 'image' ? '.photo__canvas' : effect.kind === 'slides' ? '.slider__canvas' : '.preview__canvas'
      // 3D: three.js грузится лениво — ждём холст.
      await page.locator(selector).waitFor()
      await page.waitForTimeout(600)
      const stats = await canvasStats(page, selector)
      expect(stats.mean, 'холст не чёрный').toBeGreaterThan(2)
      if (effect.kind === 'quad') expect(stats.spread, 'на холсте есть рисунок, а не заливка').toBeGreaterThan(1)
    }
    expect(errors).toEqual([])
  })
}

test('пресет и ползунок попадают в адрес, код открывается', async ({ page }) => {
  await page.goto('studio.html?e=cells')
  await page.locator('.presets .chip').nth(1).click()
  await expect(page).toHaveURL(/e=cells&/)
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
  await page.goto('about:blank') // выгрузить Студию: её React не должен рисовать в «чистую» страницу
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
  await page.goto('about:blank') // выгрузить Студию: её React не должен рисовать в «чистую» страницу
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
  await page.goto('about:blank') // выгрузить Студию: её React не должен рисовать в «чистую» страницу
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

test('экспортированный 3D-эффект работает на чистой странице через import map', async ({ page }) => {
  test.slow()
  // CDN подменяем файлами из node_modules: тест не зависит от сети.
  await page.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.+)$/, (route) => {
    const path = /three@[^/]+\/(.+)$/.exec(route.request().url())![1]
    route.fulfill({ contentType: 'text/javascript', body: readFileSync(`node_modules/three/${path}`) })
  })
  await page.goto('studio.html?e=galaxy&count=8000')
  await page.getByRole('button', { name: 'Забрать код' }).click()
  const dialog = page.getByRole('dialog')
  const code = await dialog.locator('code').textContent()
  await dialog.getByRole('tab', { name: 'index.html' }).click()
  const html = (await dialog.locator('code').textContent())!
  const map = /<script type="importmap">[\s\S]*?<\/script>/.exec(html)![0]
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('about:blank') // выгрузить Студию: её React не должен рисовать в «чистую» страницу
  await page.setContent(`${map}<div id="hero-bg" style="position:relative;width:400px;height:300px"></div>`)
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

test('«Засыпать без действий»: без мыши кадр замирает, движение будит', async ({ page }) => {
  await page.goto('studio.html?e=noise&speed=2&_sleep=1&_mouse=0')
  // Панель FPS лежит поверх превью и обновляет цифры — уберём её из кадра.
  await page.getByRole('switch', { name: 'FPS' }).uncheck()
  await page.mouse.move(5, 5)
  const shot = async () => (await page.locator('.preview__canvas').screenshot()).toString('base64')
  await page.waitForTimeout(1600) // секунда без действий + запас
  const a = await shot()
  await page.waitForTimeout(400)
  expect(await shot(), 'спит — кадр не меняется').toBe(a)
  // Движение мыши будит — «Шум» снова течёт.
  await page.mouse.move(400, 300)
  await page.mouse.move(420, 320)
  await page.waitForTimeout(300)
  expect(await shot(), 'проснулся — кадр меняется').not.toBe(a)
})

test('«Волны»: клик по воде — круги (кадр меняется даже без мыши)', async ({ page }) => {
  await page.goto('studio.html?e=waves&speed=0&rain=0')
  await page.getByRole('switch', { name: 'FPS' }).uncheck()
  const canvas = page.locator('.preview__canvas')
  await page.waitForTimeout(500)
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + 5, box.y + 5) // уйти с воды
  await page.waitForTimeout(800)
  const before = (await canvas.screenshot()).toString('base64')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85)
  await page.mouse.move(box.x + 5, box.y + 5)
  await page.waitForTimeout(300)
  expect((await canvas.screenshot()).toString('base64'), 'после клика по воде пошли круги').not.toBe(before)
})

test('«Сутки по прокрутке»: море прилипло, при прокрутке меняется только время суток', async ({ page }) => {
  await page.goto('studio.html?e=waves&cycle=scroll')
  const demo = page.locator('.demo')
  const sticky = page.locator('.scroll-stage__sticky')
  const h = await demo.evaluate((d) => d.clientHeight)
  await demo.evaluate((d, y) => d.scrollTo(0, y), h * 2.5)
  await page.waitForTimeout(200)
  const offset = await sticky.evaluate((e) => e.getBoundingClientRect().top - e.closest('.demo')!.getBoundingClientRect().top)
  expect(Math.round(offset), 'холст остался вверху видимой области').toBe(0)
  // В экспорте — тот же липкий стек и scrollStack.
  await page.getByRole('button', { name: 'Забрать код' }).click()
  await page.getByRole('dialog').getByRole('tab', { name: 'index.html' }).click()
  await expect(page.getByRole('dialog').locator('code')).toContainText("scrollStack: document.querySelector('.day-cycle')")
})

test('страница Студии не прокручивается, подсказка встаёт рядом со строкой', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const id of ['waves', 'galaxy', 'noise']) {
    await page.goto(`studio.html?e=${id}`)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), id).toBeLessThanOrEqual(0)
  }
  // Подсказка у строки в глубине панели — рядом с ней, а не где-то внизу страницы.
  await page.locator('.panel').evaluate((el) => (el.scrollTop = 600))
  const row = page.locator('.hinted').nth(8)
  await row.hover()
  const tip = page.locator('.tooltip[data-open="true"]')
  await expect(tip).toBeVisible()
  const [r, t] = await Promise.all([row.boundingBox(), tip.boundingBox()])
  expect(Math.abs(t!.y + t!.height / 2 - (r!.y + r!.height / 2))).toBeLessThan(120)
})

test('«Космос»: своё созвездие рисуется кликами по превью и попадает в адрес', async ({ page }) => {
  await page.goto('studio.html?e=space')
  const ctl = page.locator('.control', { hasText: 'Своё созвездие' })
  // Без «Очистить»: рисование само начинается с чистого листа.
  await ctl.getByRole('button', { name: 'Рисовать' }).click()
  await expect(ctl.locator('output')).toHaveText('0 / 32')
  const box = (await page.locator('.preview').boundingBox())!
  for (const [x, y] of [[0.3, 0.3], [0.5, 0.6], [0.7, 0.3]]) await page.mouse.click(box.x + box.width * x, box.y + box.height * y)
  await expect(ctl.locator('output')).toHaveText('3 / 32')
  await expect(page).toHaveURL(/constellations=custom/)
  await expect(page).toHaveURL(/custom=0\.\d+%2C/)
  await ctl.getByRole('button', { name: 'Готово' }).click()
  await expect(page.locator('.draw-layer')).toHaveCount(0)
})

test('траектория: своя рисуется кликами по превью, попадает в адрес и в экспорт', async ({ page }) => {
  await page.goto('studio.html?e=cells')
  const panel = page.locator('.panel')
  await panel.getByText('Своя', { exact: true }).click()
  await panel.getByRole('button', { name: 'Рисовать' }).click()
  const box = (await page.locator('.preview').boundingBox())!
  for (const [x, y] of [[0.2, 0.2], [0.8, 0.3], [0.5, 0.8]]) await page.mouse.click(box.x + box.width * x, box.y + box.height * y)
  await expect(page.locator('.draw-layer__path circle')).toHaveCount(3)
  await panel.getByRole('button', { name: 'Готово' }).click()
  await expect(page).toHaveURL(/_path=custom&_pathPoints=/)
  await page.getByRole('button', { name: 'Забрать код' }).click()
  await expect(page.getByRole('dialog').locator('code')).toContainText('"path": {')
})

test('«Свой эффект»: правка кода пересобирает превью, ошибка — с номером строки, экспорт работает', async ({ page }) => {
  await page.goto('studio.html?e=custom')
  await page.evaluate(() => localStorage.clear())
  const area = page.getByRole('textbox', { name: 'Код шейдера' })
  // Свой код с параметром.
  await area.fill('// @param tint color #ff0000 Оттенок\nvoid main() {\n  fragColor = vec4(uTint, 1.0);\n}\n')
  await expect(page.getByText('Оттенок', { exact: true })).toBeVisible()
  await expect(page).toHaveURL(/code=/)
  // Ошибка — понятная, в строке поля.
  await area.fill('void main() {\n  fragColor = vec4(oops, 1.0);\n}\n')
  await expect(page.locator('.editor__errors')).toContainText('Строка 2')
  // Исправили — ошибки нет.
  await area.fill('// @param tint color #00ff00 Оттенок\nvoid main() {\n  fragColor = vec4(uTint, 1.0);\n}\n')
  await expect(page.locator('.editor__errors')).toHaveCount(0)
  await page.getByRole('button', { name: 'Забрать код' }).click()
  await expect(page.getByRole('dialog').locator('code')).toContainText('fragColor = vec4(uTint, 1.0);')
})
