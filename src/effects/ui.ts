import type { EffectDef } from './types'

/**
 * Элементы интерфейса без WebGL (src/runtime/ui.js): жидкая кнопка и прелоадер.
 * Подробно — docs/15-ui.md.
 */

export const liquidButton: EffectDef = {
  id: 'liquid-button',
  name: 'Жидкая кнопка',
  category: 'Интерфейс',
  kind: 'ui',
  description: 'Кнопка из «ртути»: капли тянутся к курсору, по клику — брызги',
  params: {
    color: { type: 'color', label: 'Цвет кнопки', default: '#a78bfa' },
    textColor: { type: 'color', label: 'Цвет текста', default: '#0b0b12' },
    blobs: { type: 'number', label: 'Капель', min: 2, max: 16, step: 1, default: 8, hint: 'Сколько капель живёт по краю кнопки' },
    goo: { type: 'number', label: 'Липкость', min: 2, max: 16, step: 0.5, default: 8, hint: 'Насколько капли сливаются друг с другом и с кнопкой' },
    stretch: { type: 'number', label: 'Тянется к курсору', min: 0, max: 1.5, step: 0.01, default: 0.7 },
    wobble: { type: 'number', label: 'Дрожание в покое', min: 0, max: 2, step: 0.01, default: 0.6 },
    splash: { type: 'number', label: 'Брызги по клику', min: 0, max: 3, step: 0.01, default: 1 },
    room: { type: 'number', label: 'Место для капель, px', min: 10, max: 60, step: 1, default: 30, hint: 'Насколько далеко от кнопки могут улетать брызги' },
    label: { type: 'text', label: 'Надпись (для примера)', default: 'Нажми меня', maxLength: 24 },
  },
  presets: [
    { name: 'Сирень', values: {} },
    { name: 'Ртуть', values: { color: '#cbd5e1', textColor: '#0f172a', goo: 10, wobble: 0.3 } },
    { name: 'Лава', values: { color: '#ff5a1f', textColor: '#fff7ed', blobs: 12, wobble: 1.2, splash: 2 } },
    { name: 'Слизь', values: { color: '#84cc16', textColor: '#052e16', goo: 12, stretch: 1.2, wobble: 1.4 } },
  ],
}

export const preloader: EffectDef = {
  id: 'preloader',
  name: 'Прелоадер',
  category: 'Интерфейс',
  kind: 'ui',
  description: 'Название наполняется жидкостью или собирается из точек — и открывает сайт',
  params: {
    text: { type: 'text', label: 'Текст', default: 'Studio', maxLength: 16 },
    style: {
      type: 'select',
      label: 'Вид',
      options: [
        { value: 'fill', label: 'Наполняется жидкостью' },
        { value: 'scatter', label: 'Из точек, рассыпается' },
      ],
      default: 'fill',
    },
    reveal: {
      type: 'select',
      label: 'Как открывает сайт',
      options: [
        { value: 'circle', label: 'Кругом' },
        { value: 'up', label: 'Шторка вверх' },
        { value: 'fade', label: 'Растворяется' },
      ],
      default: 'circle',
    },
    mode: {
      type: 'select',
      label: 'Прогресс',
      hint: 'Сам — за «Длительность». До загрузки — пока страница не загрузится (событие load). Из кода — preloader.progress(0.4), preloader.done()',
      options: [
        { value: 'auto', label: 'Сам' },
        { value: 'load', label: 'До загрузки' },
        { value: 'manual', label: 'Из кода' },
      ],
      default: 'auto',
    },
    duration: { type: 'number', label: 'Длительность, с', min: 0.5, max: 8, step: 0.1, default: 2.5, when: { mode: ['auto'] } },
    revealTime: { type: 'number', label: 'Открытие, с', min: 0.2, max: 3, step: 0.05, default: 0.9 },
    size: { type: 'number', label: 'Размер текста', min: 0.4, max: 2, step: 0.01, default: 1 },
    weight: { type: 'number', label: 'Жирность', min: 300, max: 900, step: 100, default: 800 },
    wave: { type: 'number', label: 'Волна', min: 0, max: 3, step: 0.01, default: 1, when: { style: ['fill'] } },
    waveSpeed: { type: 'number', label: 'Скорость волны', min: 0, max: 3, step: 0.01, default: 1, when: { style: ['fill'] } },
    percent: { type: 'boolean', label: 'Показывать проценты', default: true },
    color: { type: 'color', label: 'Цвет', default: '#a78bfa' },
    background: { type: 'color', label: 'Фон', default: '#07060f' },
  },
  presets: [
    { name: 'Жидкость', values: { style: 'fill' } },
    { name: 'Россыпь', values: { style: 'scatter', reveal: 'fade', color: '#f2efff' } },
    { name: 'Светлый', values: { color: '#0b0b12', background: '#f6f1e7', reveal: 'up' } },
  ],
}

export const UI_EFFECTS = [liquidButton, preloader]
