/** Типы для transition.js (сам файл — обычный JS: его текст вставляется в экспорт). */
export type TransitionTrigger = 'scroll' | 'appear' | 'manual'

export type TransitionOptions = {
  trigger?: TransitionTrigger
  /** Длительность play()/reverse(), секунды. */
  duration?: number
  /** Контейнер прокрутки (по умолчанию — окно). */
  scroller?: HTMLElement | null
  /** «Липкий» стек для trigger: 'scroll' (по умолчанию — родитель секции). */
  stack?: HTMLElement | null
  /** appear: сгореть один раз и больше не возвращаться. */
  once?: boolean
  onComplete?: (() => void) | null
}

export type TransitionInstance = {
  stats: import('./runtime').EffectStats
  progress(p: number): void
  readonly value: number
  play(): void
  reverse(): void
  destroy(): void
}

export type Field = { width: number; height: number; rank: Float32Array; order: Uint32Array }

export const DEFAULTS: Record<string, string | number | boolean>
export function buildField(width: number, height: number, values: Record<string, unknown>): Field
export function createTransition(el: HTMLElement, values?: Record<string, unknown>, options?: TransitionOptions): TransitionInstance
