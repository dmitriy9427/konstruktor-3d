/** Типы для glow.js (сам файл — обычный JS: его текст вставляется в экспорт). */
export type GlowInstance = { set(values: Record<string, unknown>): void; destroy(): void }
export function createGlow(el: HTMLElement, values?: Record<string, unknown>): GlowInstance
