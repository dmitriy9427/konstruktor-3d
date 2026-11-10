/** Типы для scramble.js (сам файл — обычный JS: его текст вставляется в экспорт). */
export type ScrambleInstance = { play(): void; set(values: Record<string, unknown>): void; destroy(): void }
export function createScramble(el: HTMLElement, values?: Record<string, unknown>): ScrambleInstance
