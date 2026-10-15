export type TiltInstance = { set(values: Record<string, unknown>): void; destroy(): void }
export function createTilt(el: HTMLElement, values?: Record<string, unknown>): TiltInstance
