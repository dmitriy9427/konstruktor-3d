/**
 * Экспорт: сгенерированный модуль — это настоящий JS. Проверяем, что он
 * разбирается и импортируется (в Node, без браузера) и что в нём наши значения.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { EFFECTS, effectById } from '../effects'
import { generate, type ExportFormat } from './codegen'
import { DEFAULT_COMMON, resolveValues } from './params'

const dir = mkdtempSync(join(tmpdir(), 'k3d-'))

async function importModule(name: string, code: string) {
  const file = join(dir, name)
  writeFileSync(file, code)
  return import(/* @vite-ignore */ pathToFileURL(file).href)
}

describe('generate', () => {
  for (const effect of EFFECTS) {
    it(`«${effect.name}»: effect.js импортируется и отдаёт mount()`, async () => {
      const [file] = generate(effect, resolveValues(effect.params), DEFAULT_COMMON, { format: 'module', lazy: false })
      const mod = await importModule(`${effect.id}.mjs`, file.code)
      expect(typeof mod.mount).toBe('function')
    })
  }

  it('в файл попадают текущие значения и ссылка', () => {
    const lava = effectById('lava')!
    const values = resolveValues(lava.params, { colorA: '#abcdef' })
    const [file] = generate(lava, values, DEFAULT_COMMON, { format: 'module', lazy: false, link: 'https://x.test/?e=lava' })
    expect(file.code).toContain('"colorA": "#abcdef"')
    expect(file.code).toContain('https://x.test/?e=lava')
  })

  it.each<[ExportFormat, string[]]>([
    ['module', ['effect.js', 'index.html']],
    ['react', ['Effect.tsx', 'effect.js']],
    ['element', ['effect.js', 'index.html']],
  ])('формат %s → файлы %j', (format, names) => {
    const files = generate(EFFECTS[0], resolveValues(EFFECTS[0].params), DEFAULT_COMMON, { format, lazy: true })
    expect(files.map((f) => f.name)).toEqual(names)
  })

  it('ленивая загрузка — через динамический import', () => {
    const files = generate(EFFECTS[0], resolveValues(EFFECTS[0].params), DEFAULT_COMMON, { format: 'module', lazy: true })
    expect(files[1].code).toContain("await import('./effect.js')")
    expect(files[1].code).toContain('IntersectionObserver')
  })

  it('веб-компонент регистрирует тег k3d-<id>', () => {
    const [file] = generate(EFFECTS[0], resolveValues(EFFECTS[0].params), DEFAULT_COMMON, { format: 'element', lazy: true })
    expect(file.code).toContain(`customElements.define('k3d-${EFFECTS[0].id}'`)
  })
})
