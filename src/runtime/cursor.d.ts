/** Типы для cursor.js (сам файл — обычный JS: его текст вставляется в экспорт). */
import type { EffectStats } from './runtime'

export type CursorInstance = { stats: EffectStats; set(values: Record<string, unknown>): void; destroy(): void }
export const CURSOR_DEFAULTS: Record<string, string | number | boolean>
export function createCursor(root: HTMLElement, values?: Record<string, unknown>): CursorInstance
