import { describe, expect, it } from 'vitest'

import { EFFECTS, effectById } from '../effects'
import type { SelectParam } from '../runtime/runtime'
import { DEFAULT_COMMON, changedValues, fromSearch, hslToHex, randomValues, resolveValues, sanitize, toSearch } from './params'

const lava = effectById('cells')!
const paramsOf = (id: string) => effectById(id)?.params

describe('sanitize', () => {
  it('зажимает число в диапазон и отбрасывает мусор', () => {
    const p = { type: 'number', label: '', min: 0, max: 1, default: 0.5 } as const
    expect(sanitize(p, 5)).toBe(1)
    expect(sanitize(p, -1)).toBe(0)
    expect(sanitize(p, 'abc')).toBe(0.5)
  })
  it('приводит цвет к #rrggbb', () => {
    const p = { type: 'color', label: '', default: '#000000' } as const
    expect(sanitize(p, 'FFF')).toBe('#ffffff')
    expect(sanitize(p, 'ff8800')).toBe('#ff8800')
    expect(sanitize(p, 'красный')).toBe('#000000')
  })
  it('принимает только варианты из списка', () => {
    const p: SelectParam = { type: 'select', label: '', default: 'a', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }
    expect(sanitize(p, 'b')).toBe('b')
    expect(sanitize(p, 'zzz')).toBe('a')
  })
})

describe('адрес Студии', () => {
  it('туда и обратно — без потерь', () => {
    const values = resolveValues(lava.params, { speed: 1.2, colorA: '#123456' })
    const common = { ...DEFAULT_COMMON, mouse: false, offscreen: false, sleep: 10, fps: 30, post: { ...DEFAULT_COMMON.post, grain: 0.3 } }
    const search = toSearch('cells', lava.params, values, common)
    expect(search).toBe('?e=cells&speed=1.2&colorA=123456&_mouse=0&_offscreen=0&_sleep=10&_fps=30&_grain=0.3')
    const back = fromSearch(search, paramsOf, 'noise')
    expect(back.effectId).toBe('cells')
    expect(back.values).toEqual(values)
    expect(back.common).toEqual(common)
  })
  it('неизвестный эффект и кривые значения — к умолчаниям', () => {
    const back = fromSearch('?e=nope&speed=999', paramsOf, 'cells')
    expect(back.effectId).toBe('cells')
    expect(back.values.speed).toBe(lava.params.speed.type === 'number' ? lava.params.speed.max : 0)
  })
  it('в адрес попадают только отличия от умолчаний', () => {
    expect(changedValues(lava.params, resolveValues(lava.params))).toEqual({})
    expect(toSearch('cells', lava.params, resolveValues(lava.params), DEFAULT_COMMON)).toBe('?e=cells')
  })
})

describe('randomValues', () => {
  it('числа внутри диапазона, цвета валидные — для каждого эффекта', () => {
    let seed = 1
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (const effect of EFFECTS) {
      const values = randomValues(effect.params, resolveValues(effect.params), random)
      expect(resolveValues(effect.params, values)).toEqual(values)
    }
  })
  it('hslToHex', () => {
    expect(hslToHex(0, 100, 50)).toBe('#ff0000')
    expect(hslToHex(120, 100, 50)).toBe('#00ff00')
  })
})

describe('каталог', () => {
  it('у эффектов уникальные id, у пресетов — только известные параметры', () => {
    expect(new Set(EFFECTS.map((e) => e.id)).size).toBe(EFFECTS.length)
    for (const effect of EFFECTS) {
      for (const preset of effect.presets ?? []) {
        for (const key of Object.keys(preset.values)) expect(effect.params, `${effect.id}/${preset.name}`).toHaveProperty(key)
        expect(resolveValues(effect.params, preset.values), `${effect.id}/${preset.name}`).toMatchObject(preset.values)
      }
    }
  })
})
