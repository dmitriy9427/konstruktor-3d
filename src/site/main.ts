/**
 * Витрина. Каждая секция — эффект конструктора, подключённый тем же
 * рантаймом, что уходит в экспорт. Всё тяжёлое — лениво: эффект создаётся,
 * когда его блок подъезжает к экрану (за экран до появления), и не рисует,
 * пока его не видно. three.js скачивается только к 3D-секциям.
 *
 * GSAP:
 *   ScrollTrigger — появление текста, прогресс морфинга, параллакс;
 *   SplitText     — заголовки разбиты на буквы и строки, буквы «выезжают».
 */
import '@fontsource-variable/onest'
import '../styles/base.css'
import '../styles/site.css'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

import { aurora } from '../effects/aurora'
import { space } from '../effects/space'
import { waves } from '../effects/waves'
import { fire } from '../effects/liquid-fire'
import { imageLiquid } from '../effects/image-liquid'
import { glassShapes, morph } from '../effects/three'
import type { EffectDef } from '../effects/types'
import { resolveValues } from '../engine/params'
import type { EffectOptions, Values } from '../runtime/runtime'

gsap.registerPlugin(ScrollTrigger, SplitText)

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const base = import.meta.env.BASE_URL

/** Запустить эффект, когда блок подъедет к экрану. */
function lazy(el: Element, start: () => void | Promise<void>) {
  const io = new IntersectionObserver(
    ([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      void start()
    },
    { rootMargin: '100% 0px' },
  )
  io.observe(el)
}

/** Шейдерный эффект в блоке: холст на всю его площадь. */
function shader(el: HTMLElement, effect: EffectDef, values: Partial<Values>, options: EffectOptions & { images?: string[]; hoverSwap?: boolean } = {}) {
  lazy(el, async () => {
    const { createEffect } = await import('../runtime/runtime.js')
    const canvas = document.createElement('canvas')
    canvas.className = 'fx-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    el.prepend(canvas)
    const { images, hoverSwap, ...opts } = options
    try {
      createEffect(
        canvas,
        { name: effect.name, fragment: effect.fragment!, params: effect.params, values: resolveValues(effect.params, values), simulation: effect.simulation, images, hoverSwap },
        { quality: 1.25, ...opts },
      )
      canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'ease-out' })
    } catch {
      canvas.remove()
    }
  })
}

/** 3D-эффект (three.js грузится только сейчас). */
function scene(el: HTMLElement, effect: EffectDef, values: Partial<Values>, onReady?: (fx: { progress(p: number | null): void }) => void) {
  lazy(el, async () => {
    const [THREE, { createScene }, room] = await Promise.all([
      import('three'),
      import('../runtime/scene.js'),
      effect.addons?.includes('RoomEnvironment') ? import('three/addons/environments/RoomEnvironment.js') : null,
    ])
    const canvas = document.createElement('canvas')
    canvas.className = 'fx-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    el.prepend(canvas)
    try {
      const fx = createScene(THREE, canvas, effect.setup!, { name: effect.name, values: resolveValues(effect.params, values) }, {
        quality: 1.25,
        addons: room ? { RoomEnvironment: room.RoomEnvironment } : {},
      })
      canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900 })
      onReady?.(fx)
    } catch {
      canvas.remove()
    }
  })
}

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!

// ─── Прелоадер ───────────────────────────────────────────────────────────────
const { createPreloader, createLiquidButton } = await import('../runtime/ui.js')
const loader = reduced
  ? null
  : createPreloader(document.body, { text: '3D-конструктор', mode: 'load', style: 'fill', reveal: 'circle', revealTime: 1, color: '#a78bfa', background: '#07060f', size: 0.8 })

// ─── Фоны и эффекты секций ───────────────────────────────────────────────────
shader($('[data-effect="aurora"]'), aurora, {}, { post: { grain: 0.2, vignette: 0.35, chroma: 0, bloom: 0 } })
shader($('[data-effect="waves"]'), waves, { cycle: 'scroll', horizon: 0.55 }, { scrollStack: $('#day'), mouse: true })
shader($('[data-effect="fire"]'), fire, { height: 0.5, sparks: 0.6 })
shader($('[data-effect="space"]'), space, { constellations: 'some', constStyle: 'draw', galaxies: 0.5, meteors: 0.5, nebula: 0.8 })

// Прожигание: верхняя секция прогорает, пока «липкий» стек прокручивается.
lazy($('#burn'), async () => {
  const { createTransition } = await import('../runtime/transition.js')
  createTransition($('.burn__top'), { pattern: 'points', points: 5, flames: 1.2, ash: 0.8, edge: 0.04, glow: 1.1, name: 'Прожигание' }, { trigger: 'scroll', stack: $('#burn') })
})

// Морфинг: прогресс от прокрутки секции. Pin создаём сразу (а не когда
// загрузится three.js) — иначе ScrollTrigger пересчитает разметку посреди прокрутки.
let morphProgress = 0
let morphFx: { progress(p: number | null): void } | null = null
ScrollTrigger.create({
  trigger: '#morph',
  start: 'top top',
  end: '+=150%',
  pin: true,
  scrub: true,
  onUpdate: (self) => {
    morphProgress = self.progress
    morphFx?.progress(morphProgress)
  },
})
scene($('[data-effect="morph"]'), morph, { text: 'K3D', shape: 'sphere', trigger: 'auto', count: 24000, colorB: '#a78bfa', chaos: 1 }, (fx) => {
  morphFx = fx
  fx.progress(morphProgress)
})

scene($('[data-effect="glass-shapes"]'), glassShapes, { behavior: 'mouse', count: 14, text: '3D', background: '#0b0a1a' })

// Галерея: на каждой карточке — жидкая смена второй картинкой при наведении.
document.querySelectorAll<HTMLElement>('[data-hover]').forEach((card) => {
  shader(card, imageLiquid, { mode: card.dataset.hover!, duration: 0.8, intensity: 1 }, { images: [base + card.dataset.a, base + card.dataset.b], hoverSwap: true })
})

// Жидкая кнопка в финале.
const cta = $('.liquid-cta')
createLiquidButton(cta, { color: '#a78bfa', textColor: '#0b0b12', stretch: 1.6, goo: 11 })

// ─── Курсор на всю страницу (выключается кнопкой в шапке) ───────────────────
const { createCursor } = await import('../runtime/cursor.js')
let cursor: { destroy(): void } | null = matchMedia('(pointer: fine)').matches
  ? createCursor(document.body, { type: 'comet', size: 7, tailLength: 36, colorA: '#fff1a8', colorB: '#7c4dff', lag: 0.04 })
  : null
const toggle = $('#cursor-toggle')
if (!cursor) toggle.hidden = true
toggle.addEventListener('click', () => {
  if (cursor) {
    cursor.destroy()
    cursor = null
  } else cursor = createCursor(document.body, { type: 'comet', size: 7, tailLength: 36, colorA: '#fff1a8', colorB: '#7c4dff', lag: 0.04 })
  toggle.setAttribute('aria-pressed', String(Boolean(cursor)))
  toggle.textContent = cursor ? 'Курсор: звезда' : 'Курсор: обычный'
})

// ─── Текст: заголовки по буквам, остальное — снизу ──────────────────────────
function animateText() {
  if (reduced) return
  // Первый экран анимируется сразу (по порядку), остальное — когда доедет до экрана.
  const onScroll = (el: Element, start: string) => (el.closest('#hero') ? {} : { scrollTrigger: { trigger: el, start } })
  document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    const split = SplitText.create(el, { type: 'lines,words,chars', mask: 'lines' })
    gsap.from(split.chars, { yPercent: 110, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.018, ...onScroll(el, 'top 85%') })
  })
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el, i) => {
    const hero = el.closest('#hero')
    gsap.from(el, { y: 30, opacity: 0, duration: 0.9, ease: 'power3.out', delay: hero ? 0.3 + i * 0.12 : 0, ...onScroll(el, 'top 90%') })
  })
  // Герой уезжает и тает при прокрутке.
  gsap.to('.hero__content', { yPercent: -25, opacity: 0, ease: 'none', scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true } })
  // Карточки галереи — веером.
  gsap.from('.card', { y: 80, rotate: (i) => (i - 1) * 4, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: '.gallery__grid', start: 'top 80%' } })
}

// Текст анимируем, когда шрифт загрузился (иначе строки разобьются по запасному шрифту),
// а прелоадер открыл страницу.
await document.fonts.ready
if (loader) await loader.finished
animateText()

// Панель производительности — только при разработке: в сборку не попадает.
if (import.meta.env.DEV) void import('../engine/perf').then((m) => m.mountPerf())
