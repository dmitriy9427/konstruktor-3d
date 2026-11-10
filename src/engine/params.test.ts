import { describe, expect, it } from 'vitest'

import { EFFECTS, effectById } from '../effects'
import { uniformName, type SelectParam } from '../runtime/runtime'
import { DEFAULT_COMMON, changedValues, commonSections, fromSearch, hslToHex, pathPoints, randomValues, resolveValues, runtimeOptions, sanitize, toSearch } from './params'

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

describe('точки (своё созвездие)', () => {
  it('разбирает «x,y,c;…», зажимает в 0…1 и отбрасывает мусор', () => {
    const p = { type: 'points', label: '', default: '', max: 3 } as const
    expect(sanitize(p, '0.5,0.5,0;2,-1;abc;0.1,0.2,1;0.3,0.3,1')).toBe('0.5,0.5,0;1,0,1;0.1,0.2,1')
  })
})

describe('траектория', () => {
  it('готовые пути — точки внутри кадра; своя — из адреса туда и обратно', () => {
    for (const path of ['circle', 'eight', 'wave'] as const) {
      const pts = pathPoints({ path, pathPoints: '' })
      expect(pts.length).toBeGreaterThan(5)
      for (const [x, y] of pts) expect(x >= 0 && x <= 1 && y >= 0 && y <= 1).toBe(true)
    }
    const common = { ...DEFAULT_COMMON, path: 'custom' as const, pathPoints: '0.1,0.2;0.5,0.9', pathSpeed: 2, pathMode: 'always' as const, pathClosed: false }
    const back = fromSearch(toSearch('cells', effectById('cells')!.params, resolveValues(effectById('cells')!.params), common), paramsOf, 'cells')
    expect(back.common).toEqual(common)
    expect(runtimeOptions(common).path).toEqual({ points: [[0.1, 0.2], [0.5, 0.9]], closed: false, speed: 2, mode: 'always' })
  })
})

describe('список объектов (свои галактики)', () => {
  it('JSON-массив: недостающие поля — по умолчанию, лишнее — отброшено, кривое — пусто', () => {
    const p = effectById('space')!.params.myGalaxies
    const v = JSON.parse(sanitize(p, '[{"x":0.2,"size":99,"type":"ring"},{"type":"nope"}]') as string)
    expect(v).toHaveLength(2)
    expect(v[0]).toMatchObject({ x: 0.2, y: 0.5, size: 5, type: 'ring' })
    expect(v[1].type).toBe('spiral')
    expect(sanitize(p, 'не json')).toBe('[]')
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

describe('общие настройки в сайдбаре (commonSections)', () => {
  const sections = (id: string, values = {}, common = DEFAULT_COMMON) => {
    const effect = EFFECTS.find((e) => e.id === id)!
    return commonSections(effect, { ...resolveValues(effect.params), ...values }, common)
  }
  const none = { mouse: false, inertia: false, path: false, quality: false, offscreen: false, sleep: false, fps: false, post: false }

  it('фон: всё доступно', () => {
    expect(sections('noise')).toEqual({ mouse: true, inertia: true, path: true, quality: true, offscreen: true, sleep: true, fps: true, post: true })
  })
  it('3D: без постобработки', () => {
    expect(sections('galaxy')).toMatchObject({ mouse: true, path: true, quality: true, post: false })
  })
  it('шейдерный курсор: без выключателя мыши, траектории и постобработки', () => {
    expect(sections('cursor-fluid')).toMatchObject({ mouse: false, path: false, inertia: true, quality: true, post: false })
  })
  it('слайдер: без траектории и паузы; засыпание — только с автопрокруткой', () => {
    expect(sections('slides')).toMatchObject({ mouse: true, path: false, offscreen: false, sleep: false, fps: true, post: true })
    expect(sections('slides', { autoplay: 3 }).sleep).toBe(true)
  })
  it('эффекты со своим рантаймом: общих настроек нет', () => {
    for (const id of ['tilt', 'glow', 'scramble', 'cursor-trail', 'liquid-button', 'burn']) expect(sections(id), id).toEqual(none)
  })
  it('инерция: мышь выключена — видна, только если задана траектория', () => {
    expect(sections('noise', {}, { ...DEFAULT_COMMON, mouse: false }).inertia).toBe(false)
    expect(sections('noise', {}, { ...DEFAULT_COMMON, mouse: false, path: 'circle' }).inertia).toBe(true)
  })
})

describe('каталог: в панели нет «мёртвых» настроек', () => {
  // Параметры, которые читает не шейдер, а рантайм или Студия.
  const BY_RUNTIME = new Set(['duration', 'autoplay', 'hideCursor'])
  it('каждый параметр шейдерного эффекта используется в шейдере, when ссылается на существующий параметр', () => {
    for (const effect of EFFECTS) {
      const shader = (effect.fragment ?? '') + (effect.simulation?.fragment ?? '')
      for (const [key, param] of Object.entries(effect.params)) {
        for (const other of Object.keys(param.when ?? {})) expect(effect.params, `${effect.id}.${key}: when`).toHaveProperty(other)
        if (!effect.fragment || param.type === 'text' || BY_RUNTIME.has(key)) continue
        expect(shader, `${effect.id}.${key} не используется в шейдере`).toMatch(new RegExp(`\\b${uniformName(key)}`))
      }
    }
  })
  it('3D: каждый параметр читается в функции эффекта', () => {
    for (const effect of EFFECTS.filter((e) => e.kind === 'three')) {
      for (const key of Object.keys(effect.params)) expect(String(effect.setup), `${effect.id}.${key}`).toMatch(new RegExp(`\\.${key}\\b`))
    }
  })
  it('usesMouse стоит только там, где шейдер читает мышь', () => {
    for (const effect of EFFECTS.filter((e) => e.fragment)) {
      const shader = effect.fragment! + (effect.simulation?.fragment ?? '')
      expect(Boolean(effect.usesMouse), effect.id).toBe(/uMouse|uHover/.test(shader))
    }
  })
})
