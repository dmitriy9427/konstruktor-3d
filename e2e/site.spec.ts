/**
 * Витрина: страница открывается, прелоадер уходит, при прокрутке до конца
 * все секции поднимают свои эффекты без ошибок в консоли, нет горизонтальной прокрутки.
 */
import { expect, test } from '@playwright/test'

test('витрина пролистывается без ошибок', async ({ page }) => {
  test.slow()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // Прелоадер закрылся — ссылка в шапке кликабельна.
  await expect(page.locator('.nav').getByRole('link', { name: 'Студия' })).toBeVisible()

  for (const id of ['day', 'burn', 'morph', 'gallery', 'glass', 'finale']) {
    await page.locator(`#${id}`).scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
  }
  // Секции с эффектами получили холсты.
  await expect(page.locator('.fx-canvas')).not.toHaveCount(0)
  await expect(page.locator('#finale .fx-canvas')).toHaveCount(1, { timeout: 10_000 })

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
})
