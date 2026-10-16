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
// oxlint-disable-next-line import/default
import sceneSource from '../runtime/scene.js?raw'
// oxlint-disable-next-line import/default
import galaxySource from '../runtime/three/galaxy.js?raw'
// oxlint-disable-next-line import/default
import glassSource from '../runtime/three/glass.js?raw'
// oxlint-disable-next-line import/default
import morphSource from '../runtime/three/morph.js?raw'
// oxlint-disable-next-line import/default
import swarmSource from '../runtime/three/swarm.js?raw'
// oxlint-disable-next-line import/default
import textParticlesSource from '../runtime/three/text-particles.js?raw'
// oxlint-disable-next-line import/default
import transitionSource from '../runtime/transition.js?raw'
import type { Values } from '../runtime/runtime'
import type { EffectDef } from '../effects/types'
import { runtimeOptions, type Common } from './params'

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
  const isSlides = effect.kind === 'slides'
  return `${header(effect, link)}
${runtimeSource.trim()}

const SPEC = {
  name: ${JSON.stringify(effect.name)},
  fragment: ${JSON.stringify(effect.fragment)},
  params: ${json(runtimeParams(effect))},
  values: ${json(values)},${effect.simulation ? `
  simulation: ${json(effect.simulation)},` : ''}
}

const OPTIONS = ${json({ ...runtimeOptions(common), post: common.post })}

/**
 * Запустить эффект в элементе.
${
  isSlides
    ? ` * Элемент — обёртка со слайдами <img> внутри. Управление: effect.next(),
 * effect.prev(), effect.goTo(2), effect.index — номер текущего слайда.`
    : isImage
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
    : isSlides
      ? `  // Слайды — все <img> внутри блока. Видна только первая (запасной вариант без WebGL).
  const images = [...target.querySelectorAll('img')]
  images.slice(1).forEach((img) => (img.hidden = true))
  const spec = { ...SPEC, images }
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
    return { destroy() {}, set() {}, setOptions() {}, next() {}, prev() {}, goTo() {}, index: 0 }
  }
  // Холст появляется плавно — без вспышки на первом кадре.
  canvas.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: 'ease-out' })
  // Возвращаем сам объект эффекта (не копию через «...»: копия потеряла бы
  // геттеры вроде index), только destroy() заодно убирает наш холст.
  const destroyEffect = effect.destroy
  effect.destroy = () => {
    destroyEffect()
    if (canvas !== target) canvas.remove()
  }
  return effect
}
`
}

/** Текст файлов 3D-эффектов по имени функции (EffectDef.setupName). */
const SCENE_SOURCES: Record<string, string> = {
  galaxy: galaxySource,
  glass: glassSource,
  morph: morphSource,
  swarm: swarmSource,
  textParticles: textParticlesSource,
}

/** Версия three.js, с которой проверена Студия (для import map и npm i). */
export const THREE_VERSION = __THREE_VERSION__

/** Import map: для страниц без сборщика three берётся с CDN. */
export const importMap = () => `<!-- three.js с CDN (для страниц без сборщика; с Vite/webpack — npm i three@${THREE_VERSION}) -->
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}/examples/jsm/"
    }
  }
</script>`

function sceneModule(effect: EffectDef, values: Values, common: Common, link?: string) {
  const room = effect.addons?.includes('RoomEnvironment')
  return `${header(effect, link)}
// Нужен three.js ${THREE_VERSION}: npm i three@${THREE_VERSION} — или import map из index.html.
import * as THREE from 'three'
${room ? "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'\n" : ''}
${sceneSource.trim()}

${SCENE_SOURCES[effect.setupName!].trim()}

const VALUES = ${json(values)}

const OPTIONS = ${json(runtimeOptions(common))}

/**
 * Запустить 3D-эффект в элементе: холст растянется на него целиком.
 * @param {HTMLElement} target
 * @param {object} [options] — { mouse: false, quality: 1 }
 * @returns {{ set(values): void, progress(p: number | null): void, play(): void, pause(): void, destroy(): void }}
 */
export function mount(target, options = {}) {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' })
  if (getComputedStyle(target).position === 'static') target.style.position = 'relative'
  target.append(canvas)
  let effect
  try {
    effect = createScene(THREE, canvas, ${effect.setupName}, { name: ${JSON.stringify(effect.name)}, values: VALUES }, {
      ...OPTIONS,
      ...options,
      addons: { ${room ? 'RoomEnvironment' : ''} },
    })
  } catch (error) {
    console.warn('[3D-конструктор]', error)
    canvas.remove()
    return { destroy() {}, set() {}, setOptions() {}, progress() {}, play() {}, pause() {} }
  }
  canvas.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 800, easing: 'ease-out' })
  const destroyEffect = effect.destroy
  effect.destroy = () => {
    destroyEffect()
    canvas.remove()
  }
  return effect
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

function transitionModule(effect: EffectDef, values: Values, link?: string) {
  return `${header(effect, link)}
${transitionSource.trim()}

const VALUES = ${json({ ...values, name: effect.name })}

/**
 * Запустить переход на секции.
 * @param {HTMLElement | string} target — секция (или селектор), которая прогорит
 * @param {object} [options] — { trigger: 'scroll' | 'appear' | 'manual', duration, once, onComplete, scroller, stack }
 * @returns {{ play(): void, reverse(): void, progress(p: number): void, destroy(): void }}
 */
export function mount(target, options = {}) {
  const el = typeof target === 'string' ? document.querySelector(target) : target
  return createTransition(el, VALUES, options)
}
`
}

function elementWrapper(effect: EffectDef) {
  const tag = elementTag(effect)
  if (effect.kind === 'transition') {
    return `

/**
 * Веб-компонент: <${tag}>…</${tag}> — сам элемент и есть секция, которая прогорит.
 * Атрибуты: trigger="scroll | appear | manual", duration="2", once.
 * Из кода: document.querySelector('${tag}').play() / .reverse() / .progress(0.5)
 */
class Transition extends HTMLElement {
  connectedCallback() {
    if (getComputedStyle(this).display === 'inline') this.style.display = 'block'
    const options = { once: this.hasAttribute('once') }
    if (this.hasAttribute('trigger')) options.trigger = this.getAttribute('trigger')
    if (this.hasAttribute('duration')) options.duration = Number(this.getAttribute('duration'))
    this.instance = mount(this, options)
  }
  disconnectedCallback() {
    this.instance?.destroy()
    this.instance = null
  }
  play() { this.instance?.play() }
  reverse() { this.instance?.reverse() }
  progress(p) { this.instance?.progress(p) }
}
if (!customElements.get('${tag}')) customElements.define('${tag}', Transition)
`
  }
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

/** Разметка и CSS для перехода — своя для каждого способа запуска. */
function transitionUsage(effect: EffectDef, options: ExportOptions, values: Values) {
  const trigger = String(values.trigger)
  const tag = elementTag(effect)
  const load = options.lazy
    ? (call: string) => `<script type="module">
  // Ленивая загрузка: код перехода скачивается, когда секция подъезжает к экрану.
  const target = document.querySelector('#leaving')
  const observer = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return
    observer.disconnect()
    const { mount } = await import('./effect.js')
    ${call}
  }, { rootMargin: '50% 0px' })
  observer.observe(target)
</script>`
    : (call: string) => `<script type="module">
  import { mount } from './effect.js'
  const target = document.querySelector('#leaving')
  ${call}
</script>`

  if (trigger === 'scroll') {
    const sections = options.format === 'element'
      ? `  <${tag} id="leaving" class="stack__top">…первая секция…</${tag}>`
      : `  <section id="leaving" class="stack__top">…первая секция…</section>`
    return `<!--
  «Липкий» стек: обе секции прилипают к верху экрана, первая лежит поверх.
  Пока стек прокручивают (200vh), первая прогорает и открывает вторую.
  Прокрутили назад — секция «зарастает» обратно.
-->
<div class="stack">
${sections}
  <section class="stack__under">…вторая секция…</section>
</div>

<style>
  .stack { position: relative; height: 300vh; }        /* 100vh экрана + 200vh на переход */
  .stack > * { position: sticky; top: 0; display: block; height: 100vh; }
  .stack__top { z-index: 2; background: #f6f1e7; }    /* у секции должен быть свой фон */
  .stack__under { z-index: 1; margin-top: -100vh; }
</style>

${options.format === 'element' ? `<script type="module" src="./effect.js"></script>` : load('mount(target)')}
`
  }

  const cover = options.format === 'element'
    ? `  <${tag} id="leaving" class="reveal__cover"${trigger === 'manual' ? ' trigger="manual"' : ''}>…обложка…</${tag}>`
    : `  <div id="leaving" class="reveal__cover">…обложка…</div>`
  const markup = `<!-- Обложка лежит поверх блока и сгорает, открывая его. -->
<div class="reveal">
  <div class="reveal__content">…то, что откроется…</div>
${cover}
</div>
${trigger === 'manual' ? '<button id="burn-button">Сжечь</button>\n' : ''}
<style>
  .reveal { position: relative; min-height: 60vh; }
  .reveal__cover { position: absolute; inset: 0; z-index: 1; display: block; background: #f6f1e7; }
</style>
`
  if (options.format === 'element') return `${markup}\n<script type="module" src="./effect.js"></script>\n`
  if (trigger === 'manual') {
    return `${markup}
${load(`const transition = mount(target)
  document.querySelector('#burn-button').addEventListener('click', () => transition.play())
  // transition.reverse() — вернуть, transition.progress(0.5) — остановить на середине`)}

<!-- Связка с GSAP ScrollTrigger (вместо встроенной прокрутки):
<script type="module">
  import { mount } from './effect.js'
  const transition = mount('#leaving', { trigger: 'manual' })
  ScrollTrigger.create({ trigger: '.reveal', start: 'top top', end: '+=150%', pin: true, scrub: true,
    onUpdate: (self) => transition.progress(self.progress) })
</script>
-->
`
  }
  return `${markup}
${load(`mount(target, { once: false })   // once: true — сгореть один раз`)}
`
}

function slidesUsage(effect: EffectDef, options: ExportOptions) {
  const tag = elementTag(effect)
  const imgs = `    <img src="slide-1.jpg" alt="Первый слайд" width="1200" height="800">
    <img src="slide-2.jpg" alt="Второй слайд" width="1200" height="800">
    <img src="slide-3.jpg" alt="Третий слайд" width="1200" height="800">`
  const css = `<style>
  .slider { position: relative; overflow: hidden; border-radius: 16px; }
  .slider img { display: block; width: 100%; height: auto; aspect-ratio: 3 / 2; object-fit: cover; }
</style>`
  if (options.format === 'element') {
    return `<script type="module" src="./effect.js"></script>

<${tag} id="slider" class="slider">
${imgs}
</${tag}>
<button data-prev>←</button>
<button data-next>→</button>

${css}

<script>
  const slider = document.querySelector('#slider')
  document.querySelector('[data-prev]').addEventListener('click', () => slider.instance?.prev())
  document.querySelector('[data-next]').addEventListener('click', () => slider.instance?.next())
</script>
`
  }
  const start = `const slider = mount(target)
  document.querySelector('[data-prev]').addEventListener('click', () => slider.prev())
  document.querySelector('[data-next]').addEventListener('click', () => slider.next())`
  const script = options.lazy
    ? `<script type="module">
  // Ленивая загрузка: код и текстуры — когда слайдер подъезжает к экрану.
  const target = document.querySelector('#slider')
  const observer = new IntersectionObserver(async ([entry]) => {
    if (!entry.isIntersecting) return
    observer.disconnect()
    const { mount } = await import('./effect.js')
    ${start.replace(/\n {2}/g, '\n    ')}
  }, { rootMargin: '50% 0px' })
  observer.observe(target)
</script>`
    : `<script type="module">
  import { mount } from './effect.js'
  const target = document.querySelector('#slider')
  ${start}
</script>`
  return `<!-- Слайды — обычные <img>: без WebGL виден первый, поисковики видят все. -->
<div id="slider" class="slider">
${imgs}
</div>
<button data-prev>←</button>
<button data-next>→</button>

${css}

${script}
`
}

function usageHtml(effect: EffectDef, options: ExportOptions, values: Values) {
  if (effect.kind === 'transition') return transitionUsage(effect, options, values)
  if (effect.kind === 'slides') return slidesUsage(effect, options)
  // Заглушка — цвет фона эффекта (если он есть), иначе первый цвет.
  const firstColor = 'background' in effect.params ? 'background' : Object.keys(effect.params).find((key) => effect.params[key].type === 'color')
  const placeholder = firstColor ? String(values[firstColor]) : '#000'
  const map = effect.kind === 'three' ? `${importMap()}\n\n` : ''
  const isImage = effect.kind === 'image'
  const isCss = effect.kind === 'css'
  const tag = elementTag(effect)
  if (options.format === 'element') {
    const inner = isImage ? '\n  <img src="photo.jpg" alt="Описание фото" width="1200" height="800">\n' : ''
    return `${map}<!-- Подключить один раз -->
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
  return `${map}${target}
${css}
${script}
`
}

function reactTransition(effect: EffectDef, options: ExportOptions) {
  const mountLine = options.lazy
    ? `    // Ленивая загрузка: код перехода скачивается, когда секция подъезжает к экрану.
    let cancelled = false
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        const { mount } = await import('./effect.js')
        if (cancelled) return
        instance.current = mount(el, { trigger })
      },
      { rootMargin: '50% 0px' },
    )
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
      instance.current?.destroy()
      instance.current = null
    }`
    : `    instance.current = mount(el, { trigger })
    return () => {
      instance.current?.destroy()
      instance.current = null
    }`
  return `/**
 * ${effect.name} — React-компонент перехода из 3D-конструктора.
 * Сам компонент — это секция, которая прогорит. Пример со скроллом:
 *
 *   <div className="stack">
 *     <Transition className="stack__top">…первая секция…</Transition>
 *     <section className="stack__under">…вторая…</section>
 *   </div>
 *
 *   .stack { position: relative; height: 300vh; }
 *   .stack > * { position: sticky; top: 0; height: 100vh; }
 *   .stack__top { z-index: 2; background: #f6f1e7; }
 *   .stack__under { z-index: 1; margin-top: -100vh; }
 *
 * Управление из кода: const ref = useRef<TransitionHandle>(null)
 *   <Transition ref={ref} trigger="manual">…</Transition>;  ref.current?.play()
 */
import { useEffect, useImperativeHandle, useRef, type CSSProperties, type ReactNode, type Ref } from 'react'
${options.lazy ? '' : "import { mount } from './effect.js'\n"}
export type TransitionHandle = { play(): void; reverse(): void; progress(p: number): void }

type Props = {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  trigger?: 'scroll' | 'appear' | 'manual'
  ref?: Ref<TransitionHandle>
}

export function Transition({ children, className, style, trigger, ref }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const instance = useRef<(TransitionHandle & { destroy(): void }) | null>(null)
  useImperativeHandle(ref, () => ({
    play: () => instance.current?.play(),
    reverse: () => instance.current?.reverse(),
    progress: (p) => instance.current?.progress(p),
  }))
  useEffect(() => {
    const el = box.current
    if (!el) return
${mountLine}
  }, [trigger])
  return (
    <div ref={box} className={className} style={style}>
      {children}
    </div>
  )
}
`
}

function reactSlides(effect: EffectDef, options: ExportOptions) {
  const create = options.lazy
    ? `    let cancelled = false
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        const { mount } = await import('./effect.js')
        if (!cancelled) instance.current = mount(el)
      },
      { rootMargin: '50% 0px' },
    )
    observer.observe(el)
    return () => {
      cancelled = true
      observer.disconnect()
      instance.current?.destroy()
      instance.current = null
    }`
    : `    instance.current = mount(el)
    return () => {
      instance.current?.destroy()
      instance.current = null
    }`
  return `/**
 * ${effect.name} — React-слайдер из 3D-конструктора.
 *   const ref = useRef<SliderHandle>(null)
 *   <Slider ref={ref} slides={[{ src: '/1.jpg', alt: '…' }, { src: '/2.jpg', alt: '…' }]} />
 *   <button onClick={() => ref.current?.next()}>→</button>
 * Список слайдов меняется — слайдер пересоздаётся.
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
${options.lazy ? '' : "import { mount } from './effect.js'\n"}
export type SliderHandle = { next(): void; prev(): void; goTo(index: number): void }
type Slide = { src: string; alt: string }
type Instance = SliderHandle & { destroy(): void }

export function Slider({ slides, className, ref }: { slides: Slide[]; className?: string; ref?: Ref<SliderHandle> }) {
  const box = useRef<HTMLDivElement>(null)
  const instance = useRef<Instance | null>(null)
  useImperativeHandle(ref, () => ({
    next: () => instance.current?.next(),
    prev: () => instance.current?.prev(),
    goTo: (i) => instance.current?.goTo(i),
  }))
  const key = slides.map((s) => s.src).join('|')
  useEffect(() => {
    const el = box.current
    if (!el) return
${create}
  }, [key])
  return (
    <div ref={box} key={key} className={className} style={{ position: 'relative', overflow: 'hidden' }}>
      {slides.map((s) => (
        <img key={s.src} src={s.src} alt={s.alt} style={{ display: 'block', width: '100%', height: 'auto' }} />
      ))}
    </div>
  )
}
`
}

function reactComponent(effect: EffectDef, options: ExportOptions) {
  if (effect.kind === 'transition') return reactTransition(effect, options)
  if (effect.kind === 'slides') return reactSlides(effect, options)
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
 * StrictMode безопасен: эффект корректно уничтожается и создаётся заново.${effect.kind === 'three' ? `\n * Нужен three.js: npm i three@${THREE_VERSION}` : ''}
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
  const base =
    effect.kind === 'css'
      ? tiltModule(effect, values, options.link)
      : effect.kind === 'three'
        ? sceneModule(effect, values, common, options.link)
      : effect.kind === 'transition'
        ? transitionModule(effect, values, options.link)
        : shaderModule(effect, values, common, options.link)
  const files: ExportFile[] = []
  if (options.format === 'element') {
    files.push({ name: 'effect.js', language: 'js', code: base + elementWrapper(effect) })
    files.push({ name: 'index.html', language: 'html', code: usageHtml(effect, options, values) })
  } else if (options.format === 'react') {
    const component = effect.kind === 'transition' ? 'Transition.tsx' : effect.kind === 'slides' ? 'Slider.tsx' : 'Effect.tsx'
    files.push({ name: component, language: 'tsx', code: reactComponent(effect, options) })
    files.push({ name: 'effect.js', language: 'js', code: base })
  } else {
    files.push({ name: 'effect.js', language: 'js', code: base })
    files.push({ name: 'index.html', language: 'html', code: usageHtml(effect, options, values) })
  }
  return files
}
