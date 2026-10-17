/**
 * Значения параметров: проверка, случайный набор, запись в адрес и обратно.
 * Чистые функции — проверяются тестами (params.test.ts).
 */
import type { Param, Params, PostOptions, Values } from '../runtime/runtime'
import { defaultsOf, parseList, parsePoints } from '../runtime/runtime'

/** Общие настройки любого эффекта (не зависят от его параметров). */
export type Common = {
  /** Следовать за мышью. */
  mouse: boolean
  /** Инерция мыши: 0 — мгновенно, 0.5 — очень плавно. */
  inertia: number
  /** Потолок плотности пикселей. */
  quality: number
  /** Пауза, пока эффект за экраном. */
  offscreen: boolean
  /** Засыпать через столько секунд без действий пользователя (0 — никогда). */
  sleep: number
  /** Потолок кадров в секунду (0 — без лимита). */
  fps: number
  /** Траектория «точки влияния»: нет, круг, восьмёрка, волна или своя. */
  path: 'none' | 'circle' | 'eight' | 'wave' | 'custom'
  /** Своя траектория: «x,y;x,y…» (доли холста, y вверх). */
  pathPoints: string
  /** Кругов за 10 секунд. */
  pathSpeed: number
  /** idle — по пути, только пока мыши нет над эффектом; always — всегда. */
  pathMode: 'idle' | 'always'
  /** Замкнуть свою траекторию (иначе — туда и обратно). */
  pathClosed: boolean
  post: PostOptions
}

const PATH_KINDS = ['none', 'circle', 'eight', 'wave', 'custom'] as const

/** Точки готовых траекторий (доли холста). */
export function pathPoints(c: Pick<Common, 'path' | 'pathPoints'>): [number, number][] {
  const ring = (f: (a: number) => [number, number]) => Array.from({ length: 24 }, (_, i) => f((i / 24) * Math.PI * 2))
  switch (c.path) {
    case 'circle':
      return ring((a) => [0.5 + Math.cos(a) * 0.3, 0.5 + Math.sin(a) * 0.3])
    case 'eight':
      return ring((a) => [0.5 + Math.sin(a) * 0.32, 0.5 + Math.sin(a * 2) * 0.2])
    case 'wave':
      return Array.from({ length: 12 }, (_, i) => [0.1 + (i / 11) * 0.8, 0.5 + Math.sin(i * 1.1) * 0.2])
    case 'custom':
      return parsePoints(c.pathPoints, 64).map(([x, y]) => [x, y])
    default:
      return []
  }
}

/** Общие настройки → опции рантайма (createEffect / createScene). */
export const runtimeOptions = (c: Common) => ({
  mouse: c.mouse,
  inertia: c.inertia,
  quality: c.quality,
  pauseOffscreen: c.offscreen,
  sleepAfter: c.sleep,
  maxFps: c.fps,
  path:
    c.path === 'none' || !pathPoints(c).length
      ? null
      : { points: pathPoints(c), closed: c.path === 'wave' ? false : c.path === 'custom' ? c.pathClosed : true, speed: c.pathSpeed, mode: c.pathMode },
})

export const DEFAULT_COMMON: Common = {
  mouse: true,
  inertia: 0.12,
  quality: 1.5,
  offscreen: true,
  sleep: 0,
  fps: 0,
  path: 'none',
  pathPoints: '',
  pathSpeed: 1,
  pathMode: 'idle',
  pathClosed: true,
  post: { grain: 0, chroma: 0, vignette: 0, bloom: 0 },
}

const HEX = /^#[\da-f]{6}$/i

/** Привести значение к параметру: число в диапазон, цвет — к #rrggbb, выбор — из списка. */
export function sanitize(param: Param, value: unknown): Values[string] {
  switch (param.type) {
    case 'number': {
      const n = Number(value)
      if (!Number.isFinite(n)) return param.default
      return Math.min(param.max, Math.max(param.min, n))
    }
    case 'color': {
      const s = String(value ?? '').trim()
      const full = /^#?[\da-f]{3}$/i.test(s) ? `#${s.replace('#', '').replace(/./g, '$&$&')}` : s.startsWith('#') ? s : `#${s}`
      return HEX.test(full) ? full.toLowerCase() : param.default
    }
    case 'boolean':
      return value === true || value === 'true' || value === '1' || value === 1
    case 'select':
      return param.options.some((o) => o.value === value) ? String(value) : param.default
    case 'list':
      return JSON.stringify(
        parseList(value, param).map((item) => resolveValues(param.fields, item as Partial<Values>)),
      )
    case 'points':
      return parsePoints(value, param.max)
        .map((p) => p.map((n) => +n.toFixed(3)).join(','))
        .join(';')
    case 'text': {
      const s = String(value ?? '').slice(0, param.maxLength ?? 40)
      return s.trim() ? s : param.default
    }
  }
}

/** Полный набор значений: умолчания + переданное, каждое проверено. */
export function resolveValues(params: Params, values: Partial<Values> = {}): Values {
  const result = defaultsOf(params)
  for (const [key, param] of Object.entries(params)) {
    if (key in values) result[key] = sanitize(param, values[key])
  }
  return result
}

/** Отличаются ли значения от умолчаний (для «Сбросить» и короткой ссылки). */
export function changedValues(params: Params, values: Values): Values {
  return Object.fromEntries(Object.entries(values).filter(([key, v]) => params[key] && params[key].default !== v))
}

/** Случайный оттенок: соседние цвета набора — в гармонии (сдвиг по кругу). */
function randomPalette(count: number, random: () => number) {
  const base = random() * 360
  const spread = 30 + random() * 120
  return Array.from({ length: count }, (_, i) => {
    const hue = (base + i * spread) % 360
    const light = i === 0 ? 8 + random() * 10 : 45 + random() * 25
    return hslToHex(hue, 55 + random() * 40, light)
  })
}

export function hslToHex(h: number, s: number, l: number) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** «Случайно»: числа — в середине диапазона (крайности обычно некрасивы), цвета — гармоничный набор. */
export function randomValues(params: Params, current: Values, random = Math.random): Values {
  const colorKeys = Object.keys(params).filter((k) => params[k].type === 'color')
  const palette = randomPalette(colorKeys.length, random)
  const next: Values = { ...current }
  for (const [key, param] of Object.entries(params)) {
    if (param.type === 'number') {
      const span = param.max - param.min
      const raw = param.min + span * (0.15 + random() * 0.7)
      const step = param.step ?? 0.01
      next[key] = Number((Math.round(raw / step) * step).toFixed(4))
    } else if (param.type === 'color') next[key] = palette[colorKeys.indexOf(key)]
  }
  return next
}

// ─── Адрес ───────────────────────────────────────────────────────────────────
// ?e=lava&speed=0.6&colorA=ffd166&_mouse=0&_grain=0.2
// В адрес пишем только отличия от умолчаний — ссылка короткая.
// Общие настройки — с префиксом «_», чтобы не пересечься с параметрами эффекта.

export function toSearch(effectId: string, params: Params, values: Values, common: Common) {
  const p = new URLSearchParams({ e: effectId })
  for (const [key, value] of Object.entries(changedValues(params, values))) {
    const color = params[key].type === 'color'
    p.set(key, color ? String(value).replace('#', '') : typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  }
  if (common.mouse !== DEFAULT_COMMON.mouse) p.set('_mouse', common.mouse ? '1' : '0')
  if (common.inertia !== DEFAULT_COMMON.inertia) p.set('_inertia', String(common.inertia))
  if (common.quality !== DEFAULT_COMMON.quality) p.set('_quality', String(common.quality))
  if (common.offscreen !== DEFAULT_COMMON.offscreen) p.set('_offscreen', common.offscreen ? '1' : '0')
  if (common.sleep !== DEFAULT_COMMON.sleep) p.set('_sleep', String(common.sleep))
  if (common.fps !== DEFAULT_COMMON.fps) p.set('_fps', String(common.fps))
  if (common.path !== DEFAULT_COMMON.path) p.set('_path', common.path)
  if (common.path === 'custom' && common.pathPoints) p.set('_pathPoints', common.pathPoints)
  if (common.pathSpeed !== DEFAULT_COMMON.pathSpeed) p.set('_pathSpeed', String(common.pathSpeed))
  if (common.pathMode !== DEFAULT_COMMON.pathMode) p.set('_pathMode', common.pathMode)
  if (common.pathClosed !== DEFAULT_COMMON.pathClosed) p.set('_pathClosed', common.pathClosed ? '1' : '0')
  for (const key of Object.keys(DEFAULT_COMMON.post) as (keyof PostOptions)[]) {
    if (common.post[key]) p.set(`_${key}`, String(common.post[key]))
  }
  return `?${p}`
}

export function fromSearch(search: string, paramsOf: (id: string) => Params | undefined, fallbackId: string) {
  const p = new URLSearchParams(search)
  const wanted = p.get('e') ?? fallbackId
  const effectId = paramsOf(wanted) ? wanted : fallbackId
  const params = paramsOf(effectId)!
  const raw: Partial<Values> = {}
  for (const key of Object.keys(params)) if (p.has(key)) raw[key] = p.get(key)!
  const num = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(p.get(key))
    return p.has(key) && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
  }
  const common: Common = {
    mouse: p.has('_mouse') ? p.get('_mouse') === '1' : DEFAULT_COMMON.mouse,
    inertia: num('_inertia', DEFAULT_COMMON.inertia, 0, 0.6),
    quality: num('_quality', DEFAULT_COMMON.quality, 0.5, 2),
    offscreen: p.has('_offscreen') ? p.get('_offscreen') === '1' : DEFAULT_COMMON.offscreen,
    sleep: num('_sleep', DEFAULT_COMMON.sleep, 0, 60),
    fps: [0, 30, 60].includes(num('_fps', 0, 0, 60)) ? num('_fps', 0, 0, 60) : 0,
    path: (PATH_KINDS as readonly string[]).includes(p.get('_path') ?? '') ? (p.get('_path') as Common['path']) : DEFAULT_COMMON.path,
    pathPoints: parsePoints(p.get('_pathPoints') ?? '', 64)
      .map((pt) => pt.slice(0, 2).map((n) => +n.toFixed(3)).join(','))
      .join(';'),
    pathSpeed: num('_pathSpeed', DEFAULT_COMMON.pathSpeed, 0.1, 5),
    pathMode: p.get('_pathMode') === 'always' ? 'always' : 'idle',
    pathClosed: p.has('_pathClosed') ? p.get('_pathClosed') === '1' : DEFAULT_COMMON.pathClosed,
    post: {
      grain: num('_grain', 0, 0, 1),
      chroma: num('_chroma', 0, 0, 1),
      vignette: num('_vignette', 0, 0, 1),
      bloom: num('_bloom', 0, 0, 1),
    },
  }
  return { effectId, values: resolveValues(params, raw), common }
}
