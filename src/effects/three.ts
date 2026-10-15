/**
 * 3D-эффекты на three.js. Код каждого — обычный JS в src/runtime/three/
 * (его текст уходит в экспорт — см. SCENE_SOURCES в engine/codegen.ts).
 * Здесь — только описание: параметры, пресеты, имя функции. Подробно — docs/12-three.md.
 */
import { galaxy as galaxySetup } from '../runtime/three/galaxy.js'
import { glass as glassSetup } from '../runtime/three/glass.js'
import { morph as morphSetup } from '../runtime/three/morph.js'
import { swarm as swarmSetup } from '../runtime/three/swarm.js'
import { textParticles as textSetup } from '../runtime/three/text-particles.js'
import type { SelectParam } from '../runtime/runtime'
import type { EffectDef } from './types'

const trigger = (value: string, hint: string): SelectParam => ({
  type: 'select',
  label: 'Запуск',
  options: [
    { value: 'auto', label: 'Само' },
    { value: 'hover', label: 'Наведение' },
    { value: 'scroll', label: 'Прокрутка' },
  ],
  default: value,
  hint,
})

export const galaxy: EffectDef = {
  id: 'galaxy',
  name: 'Галактика',
  category: '3D',
  kind: 'three',
  description: 'Спиральная галактика из частиц, мышь наклоняет',
  usesMouse: true,
  setup: galaxySetup,
  setupName: 'galaxy',
  params: {
    count: { type: 'number', label: 'Звёзд', min: 2000, max: 120000, step: 1000, default: 50000 },
    arms: { type: 'number', label: 'Рукавов', min: 1, max: 8, step: 1, default: 4 },
    radius: { type: 'number', label: 'Радиус', min: 1, max: 6, step: 0.1, default: 4 },
    curl: { type: 'number', label: 'Закрутка рукавов', min: -2, max: 2, step: 0.01, default: 0.9 },
    randomness: { type: 'number', label: 'Разброс', min: 0, max: 1, step: 0.01, default: 0.35 },
    spin: { type: 'number', label: 'Вращение', min: -2, max: 2, step: 0.01, default: 0.5 },
    speed: { type: 'number', label: 'Скорость', min: 0, max: 3, step: 0.01, default: 1 },
    size: { type: 'number', label: 'Размер звёзд', min: 0.2, max: 3, step: 0.01, default: 1 },
    inside: { type: 'color', label: 'Центр', default: '#ffb36b' },
    outside: { type: 'color', label: 'Край', default: '#3b5bff' },
    background: { type: 'color', label: 'Фон', default: '#02020a' },
  },
  presets: [
    { name: 'Млечный путь', values: { inside: '#ffb36b', outside: '#3b5bff', arms: 4 } },
    { name: 'Розовая', values: { inside: '#fff1f8', outside: '#ff3d9a', arms: 3, curl: 1.4 } },
    { name: 'Вихрь', values: { inside: '#e8fbff', outside: '#22d3ee', arms: 6, curl: -1.6, randomness: 0.2, spin: 1.2 } },
  ],
}

export const swarm: EffectDef = {
  id: 'swarm',
  name: 'Рой',
  category: '3D',
  kind: 'three',
  description: 'Тысячи частиц летят по потоку и тянутся к курсору',
  usesMouse: true,
  setup: swarmSetup,
  setupName: 'swarm',
  params: {
    count: { type: 'number', label: 'Частиц', min: 2000, max: 80000, step: 1000, default: 30000 },
    speed: { type: 'number', label: 'Скорость', min: 0, max: 3, step: 0.01, default: 0.8 },
    spread: { type: 'number', label: 'Размах', min: 0.4, max: 2, step: 0.01, default: 1 },
    attract: { type: 'number', label: 'Притяжение к курсору', min: -2, max: 2, step: 0.01, default: 1, hint: 'Меньше нуля — частицы разлетаются от курсора' },
    size: { type: 'number', label: 'Размер', min: 0.2, max: 3, step: 0.01, default: 1 },
    colorA: { type: 'color', label: 'Цвет 1', default: '#7c4dff' },
    colorB: { type: 'color', label: 'Цвет 2', default: '#22d3ee' },
    background: { type: 'color', label: 'Фон', default: '#04030c' },
  },
  presets: [
    { name: 'Светлячки', values: { colorA: '#ffd166', colorB: '#ff7a3d', count: 8000, size: 1.8, speed: 0.4 } },
    { name: 'Плазма', values: { colorA: '#7c4dff', colorB: '#22d3ee' } },
    { name: 'Разлёт', values: { attract: -1.6, colorA: '#ff4fa3', colorB: '#ffffff', speed: 1.4 } },
  ],
}

export const morph: EffectDef = {
  id: 'morph',
  name: 'Морфинг',
  category: '3D',
  kind: 'three',
  description: 'Логотип из частиц перетекает в сферу, тор или куб',
  usesMouse: true,
  setup: morphSetup,
  setupName: 'morph',
  params: {
    text: { type: 'text', label: 'Логотип (текст)', default: 'K3D', maxLength: 12 },
    shape: {
      type: 'select',
      label: 'Во что превращается',
      options: [
        { value: 'sphere', label: 'Сфера' },
        { value: 'torus', label: 'Тор' },
        { value: 'cube', label: 'Куб' },
        { value: 'wave', label: 'Волна' },
      ],
      default: 'sphere',
    },
    trigger: trigger('auto', 'Из кода: effect.progress(0.5)'),
    period: { type: 'number', label: 'Период «само», с', min: 1, max: 12, step: 0.5, default: 4 },
    count: { type: 'number', label: 'Частиц', min: 3000, max: 60000, step: 1000, default: 20000 },
    chaos: { type: 'number', label: 'Вихрь в пути', min: 0, max: 2, step: 0.01, default: 0.8 },
    size: { type: 'number', label: 'Размер', min: 0.2, max: 3, step: 0.01, default: 1 },
    colorA: { type: 'color', label: 'Цвет логотипа', default: '#ffffff' },
    colorB: { type: 'color', label: 'Цвет фигуры', default: '#a78bfa' },
    background: { type: 'color', label: 'Фон', default: '#05040c' },
  },
  presets: [
    { name: 'Сфера', values: { shape: 'sphere', colorB: '#a78bfa' } },
    { name: 'Тор', values: { shape: 'torus', colorB: '#22d3ee', chaos: 1.2 } },
    { name: 'Куб', values: { shape: 'cube', colorB: '#ff6b9d', chaos: 0.4 } },
  ],
}

export const textParticles: EffectDef = {
  id: 'text-particles',
  name: 'Текст из частиц',
  category: '3D',
  kind: 'three',
  description: 'Заголовок из точек рассыпается и собирается, курсор расталкивает',
  usesMouse: true,
  setup: textSetup,
  setupName: 'textParticles',
  params: {
    text: { type: 'text', label: 'Текст', default: 'Привет', maxLength: 16 },
    trigger: trigger('auto', 'Курсор расталкивает точки всегда; из кода: effect.progress(1)'),
    period: { type: 'number', label: 'Период «само», с', min: 1, max: 12, step: 0.5, default: 5 },
    scatter: { type: 'number', label: 'Сила рассыпания', min: 0, max: 1.5, step: 0.01, default: 1 },
    repel: { type: 'number', label: 'Курсор расталкивает', min: 0, max: 2, step: 0.01, default: 0.8 },
    count: { type: 'number', label: 'Частиц', min: 3000, max: 60000, step: 1000, default: 28000 },
    size: { type: 'number', label: 'Размер', min: 0.2, max: 3, step: 0.01, default: 1 },
    colorA: { type: 'color', label: 'Цвет', default: '#f2efff' },
    colorB: { type: 'color', label: 'Цвет вдали', default: '#ff6b9d' },
    background: { type: 'color', label: 'Фон', default: '#06050f' },
  },
  presets: [
    { name: 'Неон', values: { colorA: '#e8fbff', colorB: '#22d3ee' } },
    { name: 'Огонь', values: { colorA: '#fff1a8', colorB: '#ff5a1f', scatter: 1.3 } },
    { name: 'Тихий', values: { colorA: '#ffffff', colorB: '#a78bfa', scatter: 0.5, repel: 0.4 } },
  ],
}

export const glass: EffectDef = {
  id: 'glass',
  name: 'Стекло',
  category: '3D',
  kind: 'three',
  description: 'Прозрачная фигура преломляет фон, радужные края',
  usesMouse: true,
  setup: glassSetup,
  setupName: 'glass',
  addons: ['RoomEnvironment'],
  params: {
    shape: {
      type: 'select',
      label: 'Фигура',
      options: [
        { value: 'knot', label: 'Узел' },
        { value: 'sphere', label: 'Шар' },
        { value: 'ico', label: 'Кристалл' },
        { value: 'torus', label: 'Бублик' },
      ],
      default: 'knot',
    },
    ior: { type: 'number', label: 'Преломление (ior)', min: 1, max: 2.33, step: 0.01, default: 1.5, hint: 'Вода 1.33, стекло 1.5, алмаз 2.42' },
    thickness: { type: 'number', label: 'Толщина', min: 0, max: 4, step: 0.01, default: 1.2 },
    roughness: { type: 'number', label: 'Матовость', min: 0, max: 1, step: 0.01, default: 0.05 },
    dispersion: { type: 'number', label: 'Радуга (дисперсия)', min: 0, max: 10, step: 0.1, default: 3 },
    speed: { type: 'number', label: 'Вращение', min: 0, max: 3, step: 0.01, default: 1 },
    tint: { type: 'color', label: 'Оттенок стекла', default: '#ffffff' },
    text: { type: 'text', label: 'Текст за стеклом', default: 'GLASS', maxLength: 10 },
    background: { type: 'color', label: 'Фон', default: '#0b0a1a' },
    stripeA: { type: 'color', label: 'Полосы 1', default: '#7c4dff' },
    stripeB: { type: 'color', label: 'Полосы 2', default: '#ff6b9d' },
    textColor: { type: 'color', label: 'Цвет текста', default: '#f6f1e7' },
  },
  presets: [
    { name: 'Стекло', values: { ior: 1.5, roughness: 0.05, dispersion: 3 } },
    { name: 'Лёд', values: { shape: 'ico', ior: 1.31, roughness: 0.35, tint: '#d9f3ff', dispersion: 1 } },
    { name: 'Алмаз', values: { shape: 'ico', ior: 2.33, thickness: 2.5, dispersion: 8, roughness: 0 } },
  ],
}

export const THREE_EFFECTS = [galaxy, swarm, morph, textParticles, glass]
