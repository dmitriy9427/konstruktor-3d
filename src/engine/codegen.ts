/**
 * «Забрать код»: из эффекта и выбранных значений собираем файлы для проекта.
 *
 * Главное: в файл вставляется ТЕКСТ того же рантайма, что рисует превью в
 * Студии (runtime.js / tilt.js). Поэтому экспорт выглядит ровно как превью —
 * второго, «упрощённого» движка нет.
 *
 * Форматы:
 *   module  — effect.js: рантайм + настройки + mount(); подключение — HTML-сниппет;
 *   react   — effect.js + компонент Effect.tsx;
 *   element — effect.js с веб-компонентом <k3d-…>: вставляется в любую CMS.
 * Ленивая загрузка — в сниппете подключения: файл эффекта скачивается
 * динамическим import(), когда блок подъезжает к экрану.
 */
// ?raw — Vite отдаёт текст файла строкой (default-экспорт создаёт сам Vite).
// oxlint-disable-next-line import/default
import runtimeSource from '../runtime/runtime.js?raw'
// oxlint-disable-next-line import/default
import tiltSource from '../runtime/tilt.js?raw'
import type { Values } from '../runtime/runtime'
import type { EffectDef } from '../effects/types'
import type { Common } from './params'

export type ExportFormat = 'module' | 'react' | 'element'

export type ExportOptions = {
  format: ExportFormat
  /** Скачивать код эффекта, только когда блок подъезжает к экрану. */
  lazy: boolean
  /** Ссылка на эти настройки в Студии — уходит в комментарий файла. */
  link?: string
}

export type ExportFile = { name: string; language: 'js' | 'tsx' | 'html'; code: string }

const json = (value: unknown) => JSON.stringify(value, null, 2)

/** Описание параметров для рантайма: только то, что нужно шейдеру (без подписей). */
function runtimeParams(effect: EffectDef) {
  return Object.fromEntries(
    Object.entries(effect.params).map(([key, p]) => [
      key,
      p.type === 'select' ? { type: p.type, options: p.options.map((o) => ({ value: o.value })), default: p.default } : { type: p.type, default: p.default },
    ]),
  )
}

const header = (effect: EffectDef, link?: string) =>
  `/**
 * ${effect.name} — сгенерировано в 3D-конструкторе.
 * ${effect.description}.${link ? `\n * Открыть с этими настройками: ${link}` : ''}
 *
 * Использование:
 *   import { mount } from './effect.js'
 *   const effect = mount(document.querySelector('#hero-bg'))
 *   effect.destroy()   // при уходе со страницы
 */
`

/** Тег веб-компонента: k3d-noise, k3d-image-distort. */
export const elementTag = (effect: EffectDef) => `k3d-${effect.id}`

function shaderModule(effect: EffectDef, values: Values, common: Common, link?: string) {
  const isImage = effect.kind === 'image'
  return `${header(effect, link)}
${runtimeSource.trim()}

const SPEC = {
  name: ${JSON.stringify(effect.name)},
  fragment: ${JSON.stringify(effect.fragment)},
  params: ${json(runtimeParams(effect))},
  values: ${json(values)},
}

const OPTIONS = ${json({ mouse: common.mouse, inertia: common.inertia, quality: common.quality, post: common.post })}

/**
 * Запустить эффект в элементе.
${
  isImage
    ? ` * Элемент — обёртка с <img> внутри: картинка остаётся в разметке (её видят
 * поисковики и браузер без WebGL), а холст ложится поверх неё.`
    : ` * Элемент — любой блок: холст растянется на него целиком (position: absolute).
 * Можно передать и сам <canvas>.`
}
 * @param {HTMLElement} target
 * @param {object} [options] переопределить настройки: { mouse: false, quality: 1 }
 */
export function mount(target, options = {}) {
  let canvas = target
  if (!(target instanceof HTMLCanvasElement)) {
    canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' })
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative'
    target.append(canvas)
  }
${
  isImage
    ? `  const img = target.querySelector('img')
  const spec = { ...SPEC, image: img }
`
    : `  const spec = SPEC
`
}  let effect
  try {
    effect = createEffect(canvas, spec, { ...OPTIONS, ...options, post: { ...OPTIONS.post, ...options.post } })
  } catch (error) {
    // Нет WebGL2 — убираем холст, остаётся то, что под ним (картинка или фон блока).
    console.warn('[3D-конструктор]', error)
    if (canvas !== target) canvas.remove()
    return { destroy() {}, set() {}, setOptions() {} }
  }
  // Холст появляется плавно — без вспышки на первом кадре.
  canvas.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'ease-out' })
  return {
    ...effect,
    destroy() {
      effect.destroy()
      if (canvas !== target) canvas.remove()
    },
  }
}
`
}

function tiltModule(effect: EffectDef, values: Values, link?: string) {
  return `${header(effect, link)}
${tiltSource.trim()}

const VALUES = ${json(values)}

/**
 * Включить наклон на элементе или на всех элементах по селектору.
 * @param {HTMLElement | string} target
 * @param {object} [overrides]
 */
export function mount(target, overrides = {}) {
  const elements = typeof target === 'string' ? [...document.querySelectorAll(target)] : [target]
  const items = elements.map((el) => createTilt(el, { ...VALUES, ...overrides }))
  return { destroy: () => items.forEach((item) => item.destroy()), set: (next) => items.forEach((item) => item.set(next)) }
}
`
}

function elementWrapper(effect: EffectDef) {
  const tag = elementTag(effect)
  return `

/**
 * Веб-компонент: <${tag}></${tag}> в любом месте страницы (CMS, обычный HTML).
 * Атрибут lazy — запуск, когда элемент подъезжает к экрану.
 */
class Effect extends HTMLElement {
  connectedCallback() {
    if (getComputedStyle(this).display === 'inline') this.style.display = 'block'
    const start = () => (this.instance = mount(this))
    if (!this.hasAttribute('lazy')) return start()
    this.observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      this.observer.disconnect()
      start()
    }, { rootMargin: '50% 0px' })
    this.observer.observe(this)
  }
  disconnectedCallback() {
    this.observer?.disconnect()
    this.instance?.destroy()
    this.instance = null
  }
}
if (!customElements.get('${tag}')) customElements.define('${tag}', Effect)
`
}

function usageHtml(effect: EffectDef, options: ExportOptions, values: Values) {
  const firstColor = Object.keys(effect.params).find((key) => effect.params[key].type === 'color')
  const placeholder = firstColor ? String(values[firstColor]) : '#000'
  const isImage = effect.kind === 'image'
  const isCss = effect.kind === 'css'
  const tag = elementTag(effect)
  if (options.format === 'element') {
    const inner = isImage ? '\n  <img src="photo.jpg" alt="Описание фото" width="1200" height="800">\n' : ''
    return `<!-- Подключить один раз -->
<script type="module" src="./effect.js"></script>

<!-- Вставить, где нужен эффект. Размер задаёт CSS. -->
<${tag}${options.lazy ? ' lazy' : ''} style="height: 100vh">${inner}</${tag}>
`
  }
  const target = isCss
    ? `<article class="card">…</article>`
    : isImage
      ? `<div id="photo" class="photo">\n  <img src="photo.jpg" alt="Описание фото" width="1200" height="800">\n</div>`
      : `<section id="hero">\n  <div id="hero-bg" class="hero__bg"></div>\n  <h1>Заголовок поверх эффекта</h1>\n</section>`
  const selector = isCss ? `'.card'` : isImage ? `document.querySelector('#photo')` : `document.querySelector('#hero-bg')`
  const css = isCss
    ? ''
    : isImage
      ? `\n<style>\n  .photo { position: relative; overflow: hidden; }\n  .photo img { display: block; width: 100%; height: auto; }\n</style>\n`
      : `\n<style>\n  #hero { position: relative; min-height: 100vh; isolation: isolate; }\n  /* Заглушка, пока эффект не загрузился, — фон того же цвета. */\n  .hero__bg { position: absolute; inset: 0; z-index: -1; background: ${placeholder}; }\n</style>\n`
  const script = options.lazy
    ? `<script type="module">
  // Ленивая загрузка: код эффекта скачивается, когда блок подъезжает к экрану
  // (за полэкрана до появления). До этого видна заглушка.
  const target = ${selector}
  const observer = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return
    observer.disconnect()
    const { mount } = await import('./effect.js')
    mount(target)
  }, { rootMargin: '50% 0px' })
  observer.observe(${isCss ? `document.querySelector(${selector})` : 'target'})
</script>`
    : `<script type="module">
  import { mount } from './effect.js'
  mount(${selector})
</script>`
  return `${target}
${css}
${script}
`
}

function reactComponent(effect: EffectDef, options: ExportOptions) {
  const isImage = effect.kind === 'image'
  const isCss = effect.kind === 'css'
  const loader = options.lazy
    ? `    // Ленивая загрузка: файл эффекта скачивается, когда блок подъезжает к экрану.
    let instance: { destroy(): void } | null = null
    let cancelled = false
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        const { mount } = await import('./effect.js')
        if (!cancelled) instance = mount(el)
      },
      { rootMargin: '50% 0px' },
    )
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
      instance?.destroy()
    }`
    : `    const instance = mount(el)
    return () => instance.destroy()`
  return `/**
 * ${effect.name} — React-компонент из 3D-конструктора.
 *   <Effect className="hero-bg" />${isImage ? '\n *   <Effect src="/photo.jpg" alt="…" />' : ''}${isCss ? '\n *   <Effect><h3>Карточка</h3></Effect>' : ''}
 * StrictMode безопасен: эффект корректно уничтожается и создаётся заново.
 */
import { useEffect, useRef${isCss ? ', type ReactNode' : ''} } from 'react'
${options.lazy ? '' : "import { mount } from './effect.js'\n"}
type Props = { className?: string; style?: React.CSSProperties${isImage ? '; src: string; alt: string' : ''}${isCss ? '; children?: ReactNode' : ''} }

export function Effect({ className, style${isImage ? ', src, alt' : ''}${isCss ? ', children' : ''} }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
${loader}
  }, [${isImage ? 'src' : ''}])
  return (
    <div ref={ref} className={className} style={{ position: 'relative', ${isImage ? "overflow: 'hidden', " : ''}...style }}${isCss ? '' : ''}>
      ${isImage ? '<img src={src} alt={alt} style={{ display: \'block\', width: \'100%\', height: \'auto\' }} />' : isCss ? '{children}' : ''}
    </div>
  )
}
`
}

/** Собрать файлы экспорта и сниппет подключения. */
export function generate(effect: EffectDef, values: Values, common: Common, options: ExportOptions): ExportFile[] {
  const base = effect.kind === 'css' ? tiltModule(effect, values, options.link) : shaderModule(effect, values, common, options.link)
  const files: ExportFile[] = []
  if (options.format === 'element') {
    files.push({ name: 'effect.js', language: 'js', code: base + elementWrapper(effect) })
    files.push({ name: 'index.html', language: 'html', code: usageHtml(effect, options, values) })
  } else if (options.format === 'react') {
    files.push({ name: 'Effect.tsx', language: 'tsx', code: reactComponent(effect, options) })
    files.push({ name: 'effect.js', language: 'js', code: base })
  } else {
    files.push({ name: 'effect.js', language: 'js', code: base })
    files.push({ name: 'index.html', language: 'html', code: usageHtml(effect, options, values) })
  }
  return files
}
