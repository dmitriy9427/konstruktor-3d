/** Типы для runtime.js (сам рантайм — обычный JS: его текст вставляется в экспорт). */

export type NumberParam = { type: 'number'; label: string; min: number; max: number; step?: number; default: number; hint?: string }
export type ColorParam = { type: 'color'; label: string; default: string; hint?: string }
export type BooleanParam = { type: 'boolean'; label: string; default: boolean; hint?: string }
export type SelectParam = {
  type: 'select'
  label: string
  options: { value: string; label: string }[]
  default: string
  hint?: string
}
export type TextParam = { type: 'text'; label: string; default: string; maxLength?: number; hint?: string }
export type Param = NumberParam | ColorParam | BooleanParam | SelectParam | TextParam
export type Params = Record<string, Param>
export type Values = Record<string, number | string | boolean>

export type EffectSpec = {
  name?: string
  /** Тело фрагментного шейдера: функция main(), пишет в fragColor. */
  fragment: string
  params: Params
  values?: Values
  /** Картинка для эффектов изображения: адрес или <img>. */
  image?: string | HTMLImageElement
  /** Слайды: картинки для перехода между ними (адреса или <img>). */
  images?: (string | HTMLImageElement)[]
  /**
   * Симуляция: шейдер шага (читает uState, пишет новое состояние), размер текстуры.
   * Результат доступен основному шейдеру как uSim.
   */
  simulation?: { fragment: string; size?: number }
  /** С какого времени начинать анимацию (секунды) — первый кадр сразу «красивый». */
  startTime?: number
}

export type PostOptions = { grain: number; chroma: number; vignette: number; bloom: number }

export type EffectOptions = {
  /** Следовать за мышью. */
  mouse?: boolean
  /** Инерция мыши, 0 — мгновенно. */
  inertia?: number
  /** Потолок плотности пикселей. */
  quality?: number
  /** Снижать плотность при просадке FPS. */
  adaptive?: boolean
  /** Один неподвижный кадр вместо анимации. По умолчанию — из настройки системы. */
  reducedMotion?: boolean
  /** Не рисовать, пока эффект за экраном. */
  pauseOffscreen?: boolean
  /** «Липкий» стек: uScroll — насколько он прокручен (блок с эффектом прилип внутри). */
  scrollStack?: HTMLElement | null
  /** Контейнер прокрутки (по умолчанию — окно). */
  scroller?: HTMLElement | null
  /** Засыпать через столько секунд без действий пользователя (0 — никогда). */
  sleepAfter?: number
  /** Не больше стольких кадров в секунду (0 — сколько даёт экран). */
  maxFps?: number
  post?: Partial<PostOptions>
}

export type EffectStats = {
  name: string
  fps: number
  cpuMs: number
  gpuMs: number | null
  dpr: number
  drawCalls: number
  width: number
  height: number
}

export type EffectInstance = {
  stats: EffectStats
  set(values: Values): void
  setOptions(options: EffectOptions): void
  setImage(source: string | HTMLImageElement): void
  next(): void
  prev(): void
  goTo(index: number): void
  readonly index: number
  play(): void
  pause(): void
  /** Освобождает WebGL-контекст: для нового эффекта нужен новый canvas. */
  destroy(): void
}

export const COMMON: string
export function uniformName(key: string): string
export function hexToRgb(hex: string): [number, number, number]
export function uniformValue(param: Param, value: unknown): number | number[]
export function buildSimulation(spec: Pick<EffectSpec, 'params' | 'simulation'>): string
export function buildFragment(spec: Pick<EffectSpec, 'fragment' | 'params' | 'image'>): string
export function defaultsOf(params: Params): Values
export function createEffect(canvas: HTMLCanvasElement, spec: EffectSpec, options?: EffectOptions): EffectInstance
