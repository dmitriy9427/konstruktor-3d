import { describe, expect, it } from 'vitest'

import { buildField } from './transition.js'

const base = { pattern: 'points', points: 4, scale: 3, roughness: 0.35, seed: 7 }

describe('поле времени прогорания', () => {
  it('ранги равномерны: прогресс 0.3 = прогорело 30 % площади', () => {
    const f = buildField(64, 40, base)
    const below = f.rank.filter((r) => r <= 0.3).length / f.rank.length
    expect(below).toBeCloseTo(0.3, 2)
    expect(Math.min(...f.rank)).toBe(0)
    expect(Math.max(...f.rank)).toBe(1)
  })

  it('order — клетки по очереди прогорания', () => {
    const f = buildField(32, 32, base)
    for (let i = 1; i < f.order.length; i++) expect(f.rank[f.order[i]]).toBeGreaterThan(f.rank[f.order[i - 1]])
  })

  it('«Снизу»: нижняя строка горит раньше верхней', () => {
    const f = buildField(48, 48, { ...base, pattern: 'up', roughness: 0.1 })
    const row = (y: number) => f.rank.slice(y * 48, y * 48 + 48).reduce((a, b) => a + b, 0) / 48
    expect(row(47)).toBeLessThan(row(0))
  })

  it('одинаковое зерно — одинаковый узор, другое — другой', () => {
    const a = buildField(24, 24, base)
    expect(buildField(24, 24, base).rank).toEqual(a.rank)
    expect(buildField(24, 24, { ...base, seed: 8 }).rank).not.toEqual(a.rank)
  })
})
