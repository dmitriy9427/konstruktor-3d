import type { EffectDef } from './types'

/**
 * «Наклон 3D» — карточка поворачивается за курсором. Без WebGL: только CSS
 * transform, поэтому эффект можно повесить хоть на сто карточек.
 * Код — src/runtime/tilt.js.
 */
export const tilt: EffectDef = {
  id: 'tilt',
  name: 'Наклон 3D',
  category: 'Без WebGL',
  kind: 'css',
  description: 'Карточка наклоняется за курсором, по ней бежит блик',
  usesMouse: true,
  params: {
    max: { type: 'number', label: 'Угол, °', min: 2, max: 30, step: 1, default: 12, hint: 'Максимальный угол наклона карточки в градусах' },
    perspective: { type: 'number', label: 'Перспектива, px', min: 300, max: 2000, step: 10, default: 900, hint: 'Сила перспективы: меньше значение — сильнее «глубина»' },
    scale: { type: 'number', label: 'Увеличение', min: 1, max: 1.15, step: 0.005, default: 1.04, hint: 'Во сколько раз карточка увеличивается при наведении' },
    inertia: { type: 'number', label: 'Инерция', min: 0, max: 0.9, step: 0.01, default: 0.15, hint: 'Плавность: больше — карточка догоняет курсор медленнее' },
    glare: { type: 'number', label: 'Блик', min: 0, max: 1, step: 0.01, default: 0.35, hint: 'Яркость блика, бегущего за курсором' },
    reverse: { type: 'boolean', label: 'Наклон от курсора', default: false, hint: 'Включено — карточка наклоняется в сторону курсора, выключено — от него' },
    axis: {
      type: 'select',
      label: 'Оси',
      hint: 'По каким осям карточка наклоняется',
      options: [
        { value: 'both', label: 'Обе' },
        { value: 'x', label: 'Только X' },
        { value: 'y', label: 'Только Y' },
      ],
      default: 'both',
    },
  },
  presets: [
    { name: 'Мягкий', values: { max: 8, inertia: 0.3, glare: 0.2 } },
    { name: 'Витрина', values: { max: 14, scale: 1.08, glare: 0.5, inertia: 0.12 } },
    { name: 'Резкий', values: { max: 22, inertia: 0, perspective: 600 } },
  ],
}
