/**
 * Экспорт: сгенерированный модуль — это настоящий JS. Проверяем, что он
 * разбирается и импортируется (в Node, без браузера) и что в нём наши значения.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

import { EFFECTS, effectById } from '../effects'
import { generate, type ExportFormat } from './codegen'
import { DEFAULT_COMMON, resolveValues } from './params'

// Файлы — внутри проекта: так import 'three' в 3D-эффектах найдёт node_modules.
mkdirSync(join(process.cwd(), 'node_modules/.k3d-test'), { recursive: true })
const dir = mkdtempSync(join(process.cwd(), 'node_modules/.k3d-test/run-'))

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

  it('переход: модуль, сниппет для каждого запуска, React и веб-компонент', async () => {
    const burn = effectById('burn')!
    for (const trigger of ['scroll', 'appear', 'manual']) {
      const values = resolveValues(burn.params, { trigger })
      const [js, html] = generate(burn, values, DEFAULT_COMMON, { format: 'module', lazy: false })
      expect(js.code).toContain('export function createTransition')
      expect(html.code).toContain('#leaving')
      if (trigger === 'scroll') expect(html.code).toContain('position: sticky')
    }
    const [component] = generate(burn, resolveValues(burn.params), DEFAULT_COMMON, { format: 'react', lazy: true })
    expect(component.name).toBe('Transition.tsx')
    const [element] = generate(burn, resolveValues(burn.params), DEFAULT_COMMON, { format: 'element', lazy: false })
    expect(element.code).toContain("customElements.define('k3d-burn', Transition)")
  })

  it('слайды: все <img> блока становятся слайдами, есть Slider.tsx', () => {
    const slides = effectById('slides')!
    const [js, html] = generate(slides, resolveValues(slides.params), DEFAULT_COMMON, { format: 'module', lazy: true })
    expect(js.code).toContain("target.querySelectorAll('img')")
    expect(html.code).toContain('slider.next()')
    const [component] = generate(slides, resolveValues(slides.params), DEFAULT_COMMON, { format: 'react', lazy: false })
    expect(component.name).toBe('Slider.tsx')
  })

  it('3D: импорт three, import map в сниппете, имя функции эффекта в mount', () => {
    const glass = effectById('glass')!
    const [js, html] = generate(glass, resolveValues(glass.params), DEFAULT_COMMON, { format: 'module', lazy: false })
    expect(js.code).toContain("import * as THREE from 'three'")
    expect(js.code).toContain("import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'")
    expect(js.code).toContain('createScene(THREE, canvas, glass,')
    expect(html.code).toContain('"three": "https://cdn.jsdelivr.net/npm/three@')
  })

  it('симуляция («Волны») уходит в экспорт', () => {
    const waves = effectById('waves')!
    const [js] = generate(waves, resolveValues(waves.params), DEFAULT_COMMON, { format: 'module', lazy: false })
    expect(js.code).toContain('simulation: {')
    expect(js.code).toContain('export function buildSimulation')
  })

  it('веб-компонент регистрирует тег k3d-<id>', () => {
    const [file] = generate(EFFECTS[0], resolveValues(EFFECTS[0].params), DEFAULT_COMMON, { format: 'element', lazy: true })
    expect(file.code).toContain(`customElements.define('k3d-${EFFECTS[0].id}'`)
  })
})
