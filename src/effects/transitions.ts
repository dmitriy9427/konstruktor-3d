import type { Params, SelectParam } from '../runtime/runtime'
import type { EffectDef } from './types'

/**
 * Переходы между секциями. Все три — один движок (src/runtime/transition.js)
 * с разными умолчаниями: секция «сгорает» по полю времени, за ней видна
 * следующая. Подробно — docs/11-transitions.md.
 */

const trigger = (): SelectParam => ({
  type: 'select',
  label: 'Запуск',
  options: [
    { value: 'scroll', label: 'Прокрутка' },
    { value: 'appear', label: 'Появление' },
    { value: 'manual', label: 'Из кода' },
  ],
  default: 'scroll',
  hint: 'Прокрутка — переход идёт вместе со скроллом и откатывается назад',
})

const pattern = (value: string): SelectParam => ({
  type: 'select',
  label: 'Откуда горит',
  hint: 'Откуда начинает гореть секция: очаги, по всей площади, снизу, сверху или от центра',
  options: [
    { value: 'points', label: 'Очаги' },
    { value: 'noise', label: 'Везде' },
    { value: 'up', label: 'Снизу' },
    { value: 'down', label: 'Сверху' },
    { value: 'center', label: 'Центр' },
  ],
  default: value,
})

function params(d: { pattern: string; points: number; scale: number; roughness: number; edge: number; glow: number; char: number; ash: number; hot: string; ember: string; soot: string }): Params {
  return {
    trigger: trigger(),
    pattern: pattern(d.pattern),
    points: { type: 'number', when: { pattern: ['points'] }, label: 'Очагов', min: 1, max: 12, step: 1, default: d.points, hint: 'Сколько очагов, из которых растёт прогорание' },
    scale: { type: 'number', label: 'Масштаб шума', min: 0.5, max: 10, step: 0.1, default: d.scale, hint: 'Размер узора прогорания: больше значение — мельче' },
    roughness: { type: 'number', label: 'Рваность края', min: 0, max: 1, step: 0.01, default: d.roughness, hint: 'Рваность края: 0 — ровный, 1 — сильно изъеден' },
    edge: { type: 'number', label: 'Ширина края', min: 0, max: 0.12, step: 0.002, default: d.edge, hint: 'Ширина светящейся кромки на границе прогорания' },
    glow: { type: 'number', label: 'Свечение', min: 0, max: 2, step: 0.01, default: d.glow, hint: 'Сила свечения кромки' },
    char: { type: 'number', label: 'Копоть', min: 0, max: 1, step: 0.01, default: d.char, hint: 'Насколько край темнеет от копоти' },
    ash: { type: 'number', label: 'Пепел', min: 0, max: 1.5, step: 0.01, default: d.ash, hint: 'Сколько пепла летит над краем' },
    duration: { type: 'number', when: { trigger: ['appear', 'manual'] }, label: 'Длительность, с', min: 0.3, max: 6, step: 0.1, default: 1.8, hint: 'Для «Появления» и «Из кода»' },
    seed: { type: 'number', label: 'Вариант узора', min: 1, max: 99, step: 1, default: 7, hint: 'Номер варианта узора: разные числа дают разные рисунки прогорания' },
    hot: { type: 'color', label: 'Жар', default: d.hot, hint: 'Цвет самой горячей части кромки' },
    ember: { type: 'color', label: 'Пламя', default: d.ember, hint: 'Цвет пламени' },
    soot: { type: 'color', label: 'Копоть', default: d.soot, hint: 'Цвет копоти' },
  }
}

export const burn: EffectDef = {
  id: 'burn',
  name: 'Прожигание',
  category: 'Переходы',
  kind: 'transition',
  description: 'Секция прогорает из нескольких очагов, летит пепел',
  params: params({ pattern: 'points', points: 5, scale: 3, roughness: 0.35, edge: 0.035, glow: 0.8, char: 0.75, ash: 0.6, hot: '#fff1a8', ember: '#ff5a1f', soot: '#1a0c05' }),
  presets: [
    { name: 'Бумага', values: { pattern: 'points', points: 5, hot: '#fff1a8', ember: '#ff5a1f', soot: '#1a0c05' } },
    { name: 'Синее пламя', values: { hot: '#e8fbff', ember: '#2f7bff', soot: '#05081a', glow: 1.2, ash: 0.4 } },
    { name: 'Пожар', values: { pattern: 'up', roughness: 0.6, edge: 0.06, glow: 1.4, ash: 1.2, scale: 4 } },
  ],
}

export const dissolve: EffectDef = {
  id: 'dissolve',
  name: 'Растворение',
  category: 'Переходы',
  kind: 'transition',
  description: 'Секция тает по шуму — без огня, тихо и дорого',
  params: params({ pattern: 'noise', points: 3, scale: 2.5, roughness: 0.3, edge: 0.012, glow: 0.4, char: 0, ash: 0, hot: '#ffffff', ember: '#a78bfa', soot: '#000000' }),
  presets: [
    { name: 'Тихое', values: { pattern: 'noise', edge: 0, glow: 0, ash: 0 } },
    { name: 'Неон', values: { pattern: 'noise', edge: 0.02, hot: '#ffffff', ember: '#22d3ee', glow: 1 } },
    { name: 'Песок', values: { pattern: 'down', scale: 9, roughness: 0.8, edge: 0.01, ember: '#d9b37c', hot: '#fff3d6', ash: 0.6 } },
  ],
}

export const curtain: EffectDef = {
  id: 'curtain',
  name: 'Шторка',
  category: 'Переходы',
  kind: 'transition',
  description: 'Рваный фронт с цветным краем проходит по секции',
  params: params({ pattern: 'up', points: 3, scale: 2, roughness: 0.25, edge: 0.02, glow: 1, char: 0.2, ash: 0, hot: '#ffffff', ember: '#ff6b9d', soot: '#120818' }),
  presets: [
    { name: 'Снизу', values: { pattern: 'up' } },
    { name: 'Из центра', values: { pattern: 'center', ember: '#22d3ee' } },
    { name: 'Сверху', values: { pattern: 'down', ember: '#a78bfa' } },
  ],
}
