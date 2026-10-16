import { describe, expect, it } from 'vitest'

import { EFFECTS } from '../effects'
import { codeFromEffect, decodeCode, encodeCode, parseParams, TEMPLATES } from './custom'

describe('«Свой эффект»', () => {
  it('строки // @param → параметры всех типов', () => {
    const { params, errors } = parseParams(`
// @param speed number 0 2 0.5 Скорость полёта
// @param tint color #FF6B9D Оттенок
// @param glow boolean true
// @param mode select wave|rings|dots rings Узор
void main() {}`)
    expect(errors).toEqual([])
    expect(params.speed).toMatchObject({ type: 'number', min: 0, max: 2, default: 0.5, label: 'Скорость полёта' })
    expect(params.tint).toMatchObject({ type: 'color', default: '#ff6b9d' })
    expect(params.glow).toMatchObject({ type: 'boolean', default: true, label: 'glow' })
    expect(params.mode).toMatchObject({ type: 'select', default: 'rings' })
  })

  it('понятные ошибки с номером строки', () => {
    const { errors } = parseParams('// @param Speed number 0 1 0.5\n// @param a number 2 1 0\n// @param b weird')
    expect(errors).toHaveLength(3)
    expect(errors[0]).toMatch(/^строка 1:/)
  })

  it('все шаблоны без ошибок, код в адресе туда и обратно (и кириллица)', () => {
    for (const t of TEMPLATES) expect(parseParams(t.code).errors, t.name).toEqual([])
    const code = TEMPLATES[0].code + '\n// привет, мир ✓'
    expect(decodeCode(encodeCode(code))).toBe(code)
    expect(encodeCode(code)).toMatch(/^[\w-]+$/)
  })

  it('«копия эффекта» сохраняет параметры каждого эффекта', () => {
    for (const effect of EFFECTS.filter((e) => e.kind === 'quad' && !e.simulation && e.id !== 'custom')) {
      const { params, errors } = parseParams(codeFromEffect(effect))
      expect(errors, effect.id).toEqual([])
      const expected = Object.keys(effect.params).filter((k) => ['number', 'color', 'boolean', 'select'].includes(effect.params[k].type))
      expect(Object.keys(params), effect.id).toEqual(expected)
    }
  })
})
