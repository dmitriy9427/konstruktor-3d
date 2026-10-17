/** Типы для ui.js (сам файл — обычный JS: его текст вставляется в экспорт). */
import type { EffectStats } from './runtime'

export type LiquidButtonInstance = { stats: EffectStats; set(values: Record<string, unknown>): void; destroy(): void }
export type PreloaderInstance = {
  stats: EffectStats
  finished: Promise<void>
  progress(p: number): void
  done(): void
  replay(): void
  set(values: Record<string, unknown>): void
  destroy(): void
}
export const LIQUID_DEFAULTS: Record<string, string | number | boolean>
export const PRELOADER_DEFAULTS: Record<string, string | number | boolean>
export function createLiquidButton(button: HTMLElement, values?: Record<string, unknown>): LiquidButtonInstance
export function createPreloader(root: HTMLElement, values?: Record<string, unknown>): PreloaderInstance
