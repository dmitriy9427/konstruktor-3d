/** Типы для scene.js (сам файл — обычный JS: его текст вставляется в экспорт). */
import type { EffectStats } from './runtime'

export type SceneOptions = {
  mouse?: boolean
  inertia?: number
  quality?: number
  adaptive?: boolean
  reducedMotion?: boolean
  pauseOffscreen?: boolean
  /** Дополнения three.js, которые нужны эффекту: { RoomEnvironment } */
  addons?: Record<string, unknown>
}

export type SceneInstance = {
  stats: EffectStats
  set(values: Record<string, unknown>): void
  setOptions(options: SceneOptions): void
  /** Ручной прогресс 0…1 (null — снова сам). */
  progress(p: number | null): void
  play(): void
  pause(): void
  destroy(): void
}

export function createScene(
  THREE: typeof import('three'),
  canvas: HTMLCanvasElement,
  setup: (ctx: never) => unknown,
  spec?: { name?: string; values?: Record<string, unknown> },
  options?: SceneOptions,
): SceneInstance
