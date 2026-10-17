import type { Params } from '../runtime/runtime'
import type { EffectDef } from './types'

/**
 * Курсоры. Два вида:
 *   шейдерные (overlay) — прозрачный холст поверх страницы, след живёт в
 *     симуляции: краску уносит вихревой поток, она тает («Жидкость», «Дым»);
 *   лёгкие (cursor) — без WebGL, src/runtime/cursor.js («След», «Кольцо», «Фонарик»).
 * Подробно — docs/14-cursors.md.
 */

const hide = {
  hideCursor: { type: 'boolean', label: 'Скрыть обычный курсор', default: false, hint: 'Стрелка мыши прячется — остаётся только эффект' },
} as const satisfies Params

// ─── Шейдерные: жидкость и дым ──────────────────────────────────────────────

/**
 * Симуляция краски (текстура: rgb — краска, a — плотность).
 *   1. Скорость в точке — вихревой поток (curl шума: вращение без «стоков»,
 *      краска закручивается, а не собирается в кучи) + подъём вверх (дым) +
 *      мазок мыши: рядом с курсором краску тащит туда, куда он движется.
 *   2. Адвекция: новое значение = старое значение «оттуда, откуда принесло».
 *   3. Таяние: умножаем на затухание.
 *   4. Мазок: у курсора добавляем краску, тем больше, чем быстрее движение.
 */
const INK_SIM = /* glsl */ `
// Вихревой поток: ротор (curl) от шума — скорость вдоль линий уровня шума.
vec2 curl(vec2 p, float t) {
  float e = 0.01;
  float n1 = noise(p + vec2(0.0, e) + t), n2 = noise(p - vec2(0.0, e) + t);
  float n3 = noise(p + vec2(e, 0.0) + t), n4 = noise(p - vec2(e, 0.0) + t);
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}

vec3 hue(float h) { return 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67))); }

void main() {
  vec2 uv = gl_FragCoord.xy / uSimRes;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 q = uv * vec2(aspect, 1.0);
  float dt = 1.0 / 60.0;

  vec2 vel = curl(q * uScale, uTime * 0.05) * uSwirl * 0.05;
  vel.y += uRise * 0.35;
  // Мазок мыши тащит краску за собой.
  vec2 m = uMouse * vec2(aspect, 1.0);
  float d = length(q - m);
  float near = exp(-d * d / (uRadius * uRadius * 0.0012)) * uMouseActive;   // мазок ~3% высоты
  float wide = exp(-d * d / (uRadius * uRadius * 0.01)) * uMouseActive;   // тащит шире, чем красит
  vel += uMouseVel * vec2(aspect, 1.0) * wide * 0.5;

  vec4 prev = texture(uState, uv - vel * dt / vec2(aspect, 1.0));
  prev *= pow(uFade, dt * 60.0);

  float speed = min(length(uMouseVel), 4.0);
  float amount = near * speed * uAmount * 0.3;
  vec3 color = uColorMode < 0.5 ? hue(uTime * 0.08 + d * 2.0) : uColorMode < 1.5 ? mix(uColorA, uColorB, 0.5 + 0.5 * sin(uTime * 0.7)) : uColorA;
  prev.rgb += color * amount;
  prev.a += amount;
  fragColor = min(prev, vec4(4.0));
}`

/** Картинка: краска с мягким краем; цвет уже умножен на прозрачность (premultiplied). */
const INK_IMAGE = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 s = texture(uSim, uv);
  float a = clamp(s.a * uOpacity, 0.0, 1.0);
  vec3 col = s.rgb / max(s.a, 1e-4);   // средний цвет краски в точке
  col = mix(col, vec3(1.0), smoothstep(1.5, 4.0, s.a) * uCore);   // густое — светлее
  fragColor = vec4(col * a, a);
}`

const inkParams = (d: { radius: number; amount: number; fade: number; swirl: number; scale: number; rise: number; colorMode: string; colorA: string; colorB: string; opacity?: number; core?: number }): Params => ({
  radius: { type: 'number', label: 'Ширина мазка', min: 0.2, max: 3, step: 0.01, default: d.radius, hint: 'Толщина следа у курсора' },
  amount: { type: 'number', label: 'Количество краски', min: 0.1, max: 3, step: 0.01, default: d.amount, hint: 'Сколько краски оставляет движение' },
  fade: { type: 'number', label: 'Длина следа', min: 0.9, max: 0.995, step: 0.001, default: d.fade, hint: 'Ближе к 1 — след тает дольше' },
  swirl: { type: 'number', label: 'Завихрения', min: 0, max: 3, step: 0.01, default: d.swirl, hint: 'Как сильно след закручивается' },
  scale: { type: 'number', label: 'Размер вихрей', min: 0.5, max: 8, step: 0.05, default: d.scale, hint: 'Больше — мельче вихри' },
  rise: { type: 'number', label: 'Подъём', min: -1, max: 2, step: 0.01, default: d.rise, hint: 'След поднимается вверх, как дым; меньше нуля — стекает вниз' },
  opacity: { type: 'number', label: 'Непрозрачность', min: 0.1, max: 2, step: 0.01, default: d.opacity ?? 1 },
  core: { type: 'number', label: 'Светлое ядро', min: 0, max: 1, step: 0.01, default: d.core ?? 0.4, hint: 'Густая краска светлеет — как будто светится' },
  colorMode: {
    type: 'select',
    label: 'Цвет',
    options: [
      { value: 'rainbow', label: 'Радуга' },
      { value: 'two', label: 'Два цвета' },
      { value: 'one', label: 'Один' },
    ],
    default: d.colorMode,
  },
  colorA: { type: 'color', label: 'Цвет 1', default: d.colorA, when: { colorMode: ['two', 'one'] } },
  colorB: { type: 'color', label: 'Цвет 2', default: d.colorB, when: { colorMode: ['two'] } },
  ...hide,
})

export const fluidCursor: EffectDef = {
  id: 'cursor-fluid',
  name: 'Жидкость',
  category: 'Курсоры',
  kind: 'quad',
  overlay: true,
  description: 'За курсором тянется цветная жидкость, закручивается и тает',
  usesMouse: true,
  params: inkParams({ radius: 1, amount: 1, fade: 0.988, swirl: 1, scale: 2.5, rise: 0, colorMode: 'rainbow', colorA: '#22d3ee', colorB: '#ff6b9d' }),
  presets: [
    { name: 'Радуга', values: { colorMode: 'rainbow' } },
    { name: 'Неон', values: { colorMode: 'two', colorA: '#22d3ee', colorB: '#a78bfa', swirl: 1.6, core: 0.7 } },
    { name: 'Чернила', values: { colorMode: 'one', colorA: '#1d4ed8', fade: 0.985, swirl: 0.6, core: 0 } },
  ],
  simulation: { size: 256, fragment: INK_SIM },
  fragment: INK_IMAGE,
}

export const smokeCursor: EffectDef = {
  id: 'cursor-smoke',
  name: 'Дым',
  category: 'Курсоры',
  kind: 'quad',
  overlay: true,
  description: 'Дымный след поднимается за курсором и рассеивается',
  usesMouse: true,
  params: inkParams({ radius: 1.6, amount: 0.6, fade: 0.985, swirl: 2.4, scale: 4, rise: 0.8, colorMode: 'one', colorA: '#d4d4dc', colorB: '#a78bfa', opacity: 0.45, core: 0 }),
  presets: [
    { name: 'Дым', values: { colorMode: 'one', colorA: '#e5e7eb' } },
    { name: 'Благовония', values: { colorMode: 'two', colorA: '#c4b5fd', colorB: '#f0abfc', radius: 0.7, swirl: 2.4, rise: 1.2 } },
    { name: 'Пламя', values: { colorMode: 'two', colorA: '#ff5a1f', colorB: '#ffd166', rise: 1.6, fade: 0.96, core: 0.8 } },
  ],
  simulation: { size: 256, fragment: INK_SIM },
  fragment: INK_IMAGE,
}

// ─── Лёгкие: след, кольцо, фонарик ──────────────────────────────────────────

export const trailCursor: EffectDef = {
  id: 'cursor-trail',
  name: 'След из частиц',
  category: 'Курсоры',
  kind: 'cursor',
  description: 'Искры, звёзды или сердечки сыплются за курсором, клик — салют',
  params: {
    shape: {
      type: 'select',
      label: 'Форма',
      options: [
        { value: 'star', label: 'Звёзды' },
        { value: 'circle', label: 'Точки' },
        { value: 'square', label: 'Конфетти' },
        { value: 'heart', label: 'Сердечки' },
      ],
      default: 'star',
    },
    density: { type: 'number', label: 'Густота', min: 0.1, max: 4, step: 0.01, default: 1, hint: 'Сколько частиц на каждый сантиметр пути' },
    size: { type: 'number', label: 'Размер', min: 1, max: 20, step: 0.5, default: 5 },
    life: { type: 'number', label: 'Время жизни, с', min: 0.2, max: 3, step: 0.05, default: 0.9 },
    spread: { type: 'number', label: 'Разлёт', min: 0, max: 4, step: 0.01, default: 1, hint: 'Как сильно частицы разлетаются в стороны' },
    gravity: { type: 'number', label: 'Гравитация', min: -2, max: 3, step: 0.01, default: 0.4, hint: 'Больше нуля — падают, меньше — всплывают' },
    burst: { type: 'number', label: 'Салют по клику', min: 0, max: 4, step: 0.01, default: 1, hint: '0 — без салюта' },
    glow: { type: 'boolean', label: 'Свечение', default: true, hint: 'Частицы складываются светом — там, где их много, ярче' },
    rainbow: { type: 'boolean', label: 'Радуга', default: false },
    colorA: { type: 'color', label: 'Цвет 1', default: '#ffd166', when: { rainbow: [false] } },
    colorB: { type: 'color', label: 'Цвет 2', default: '#ff6b9d', when: { rainbow: [false] } },
    colorC: { type: 'color', label: 'Цвет 3', default: '#a78bfa', when: { rainbow: [false] } },
    ...hide,
  },
  presets: [
    { name: 'Звёздная пыль', values: { shape: 'star' } },
    { name: 'Конфетти', values: { shape: 'square', glow: false, rainbow: true, gravity: 1.2, spread: 1.6, life: 1.6, burst: 2 } },
    { name: 'Сердечки', values: { shape: 'heart', size: 8, colorA: '#ff4d8d', colorB: '#ff9ec4', colorC: '#ffffff', gravity: -0.4, density: 0.4 } },
    { name: 'Пыльца', values: { shape: 'circle', size: 2, density: 3, gravity: -0.15, spread: 0.6, colorA: '#e0f2fe', colorB: '#a5f3fc', colorC: '#ffffff' } },
  ],
}

export const ringCursor: EffectDef = {
  id: 'cursor-ring',
  name: 'Кольцо',
  category: 'Курсоры',
  kind: 'cursor',
  description: 'Точка и догоняющее кольцо; над кнопками растёт, цвет — наоборот контенту',
  params: {
    dotSize: { type: 'number', label: 'Точка', min: 0, max: 24, step: 1, default: 8 },
    ringSize: { type: 'number', label: 'Кольцо', min: 10, max: 120, step: 1, default: 38 },
    ringWidth: { type: 'number', label: 'Толщина кольца', min: 1, max: 8, step: 0.5, default: 2 },
    lag: { type: 'number', label: 'Запаздывание', min: 0.01, max: 0.6, step: 0.01, default: 0.12, hint: 'Насколько кольцо отстаёт от точки' },
    hoverScale: { type: 'number', label: 'Рост над кнопками', min: 1, max: 4, step: 0.05, default: 1.8, hint: 'Во сколько раз кольцо растёт над ссылками и кнопками' },
    fillOnHover: { type: 'boolean', label: 'Заливка над кнопками', default: false, hint: 'Над кнопкой кольцо заливается — как лупа, с инверсией цвета' },
    invert: { type: 'boolean', label: 'Цвет наоборот контенту', default: true, hint: 'mix-blend-mode: difference — на светлом курсор тёмный, на тёмном светлый' },
    color: { type: 'color', label: 'Цвет', default: '#ffffff', hint: 'С «наоборот контенту» лучше белый' },
    ...hide,
  },
  presets: [
    { name: 'Классика', values: { invert: true, fillOnHover: false } },
    { name: 'Лупа', values: { fillOnHover: true, hoverScale: 2.6, ringSize: 30, dotSize: 0, hideCursor: true } },
    { name: 'Акцент', values: { invert: false, color: '#a78bfa', lag: 0.25, ringSize: 50, ringWidth: 1.5 } },
  ],
}

export const flashlightCursor: EffectDef = {
  id: 'cursor-flashlight',
  name: 'Фонарик',
  category: 'Курсоры',
  kind: 'cursor',
  description: 'Страница в темноте, светится только круг у курсора',
  params: {
    radius: { type: 'number', label: 'Радиус света', min: 40, max: 500, step: 1, default: 180 },
    softness: { type: 'number', label: 'Мягкость края', min: 0, max: 1, step: 0.01, default: 0.35 },
    darkness: { type: 'number', label: 'Темнота вокруг', min: 0.2, max: 1, step: 0.01, default: 0.88 },
    lag: { type: 'number', label: 'Запаздывание', min: 0.01, max: 0.6, step: 0.01, default: 0.08 },
    glowAmt: { type: 'number', label: 'Тёплый свет', min: 0, max: 2, step: 0.01, default: 0.4, hint: 'Подкрашивает освещённый круг' },
    tint: { type: 'color', label: 'Цвет света', default: '#ffd9a8' },
    shade: { type: 'color', label: 'Цвет темноты', default: '#05040c' },
    ...hide,
  },
  presets: [
    { name: 'Фонарик', values: {} },
    { name: 'Прожектор', values: { radius: 120, softness: 0.15, darkness: 0.96, glowAmt: 0 } },
    { name: 'Сумерки', values: { radius: 320, softness: 0.9, darkness: 0.6, tint: '#a78bfa', glowAmt: 1 } },
  ],
}

export const cometCursor: EffectDef = {
  id: 'cursor-comet',
  name: 'Падающая звезда',
  category: 'Курсоры',
  kind: 'cursor',
  description: 'Яркая голова и сужающийся светящийся хвост',
  params: {
    size: { type: 'number', label: 'Толщина', min: 2, max: 30, step: 0.5, default: 8 },
    tailLength: { type: 'number', label: 'Длина хвоста', min: 5, max: 120, step: 1, default: 40, hint: 'Сколько кадров помнит хвост' },
    lag: { type: 'number', label: 'Запаздывание', min: 0.01, max: 0.5, step: 0.01, default: 0.05 },
    rainbow: { type: 'boolean', label: 'Радуга', default: false },
    colorA: { type: 'color', label: 'Голова', default: '#fff1a8', when: { rainbow: [false] } },
    colorB: { type: 'color', label: 'Хвост', default: '#7c4dff', when: { rainbow: [false] } },
    ...hide,
  },
  presets: [
    { name: 'Звезда', values: {} },
    { name: 'Радуга', values: { rainbow: true, tailLength: 70, size: 10 } },
    { name: 'Метеор', values: { colorA: '#ffd166', colorB: '#ff3d1f', size: 14, tailLength: 25 } },
  ],
}

export const neonCursor: EffectDef = {
  id: 'cursor-neon',
  name: 'Неон',
  category: 'Курсоры',
  kind: 'cursor',
  description: 'Светящаяся неоновая трубка тянется за курсором',
  params: {
    size: { type: 'number', label: 'Толщина', min: 1, max: 20, step: 0.5, default: 6 },
    lag: { type: 'number', label: 'Тягучесть', min: 0, max: 0.9, step: 0.01, default: 0.6, hint: 'Больше — трубка длиннее и плавнее отстаёт' },
    glowAmt: { type: 'number', label: 'Свечение', min: 0, max: 3, step: 0.01, default: 1 },
    rainbow: { type: 'boolean', label: 'Переливается', default: true },
    colorA: { type: 'color', label: 'Цвет', default: '#22d3ee', when: { rainbow: [false] } },
    ...hide,
  },
  presets: [
    { name: 'Радуга', values: { rainbow: true } },
    { name: 'Розовый неон', values: { rainbow: false, colorA: '#ff4fa3', glowAmt: 1.6 } },
    { name: 'Тонкий', values: { rainbow: false, colorA: '#a78bfa', size: 2, lag: 0.8 } },
  ],
}

export const flowCursor: EffectDef = {
  id: 'cursor-flow',
  name: 'Поток линий',
  category: 'Курсоры',
  kind: 'cursor',
  description: 'Поле штрихов течёт и закручивается вокруг курсора, как опилки у магнита',
  params: {
    spacing: { type: 'number', label: 'Шаг сетки, px', min: 12, max: 80, step: 1, default: 28 },
    thickness: { type: 'number', label: 'Толщина', min: 0.5, max: 6, step: 0.5, default: 2 },
    radius: { type: 'number', label: 'Радиус курсора, px', min: 40, max: 400, step: 5, default: 160 },
    grow: { type: 'number', label: 'Удлинение у курсора', min: 0, max: 3, step: 0.01, default: 1 },
    colorA: { type: 'color', label: 'Штрихи', default: '#4b4b63' },
    colorB: { type: 'color', label: 'У курсора', default: '#22d3ee' },
  },
  presets: [
    { name: 'Опилки', values: {} },
    { name: 'Трава', values: { colorA: '#1f5133', colorB: '#a3e635', spacing: 18, thickness: 1.5 } },
    { name: 'Крупно', values: { spacing: 48, thickness: 4, colorB: '#ff6b9d' } },
  ],
}

export const swarmCursor: EffectDef = {
  id: 'cursor-swarm',
  name: 'Рой частиц',
  category: 'Курсоры',
  kind: 'cursor',
  description: 'Облако частиц кружит вокруг курсора и тянется за ним',
  params: {
    count: { type: 'number', label: 'Частиц', min: 10, max: 400, step: 1, default: 80 },
    radius: { type: 'number', label: 'Радиус облака, px', min: 10, max: 200, step: 1, default: 50 },
    orbit: { type: 'number', label: 'Кружение', min: 0, max: 4, step: 0.01, default: 1 },
    pull: { type: 'number', label: 'Притяжение', min: 0.1, max: 3, step: 0.01, default: 1, hint: 'Меньше — частицы отстают и растягиваются шлейфом' },
    size: { type: 'number', label: 'Размер', min: 1, max: 10, step: 0.5, default: 3 },
    rainbow: { type: 'boolean', label: 'Радуга', default: false },
    colorA: { type: 'color', label: 'Цвет 1', default: '#22d3ee', when: { rainbow: [false] } },
    colorB: { type: 'color', label: 'Цвет 2', default: '#a78bfa', when: { rainbow: [false] } },
    colorC: { type: 'color', label: 'Цвет 3', default: '#ff6b9d', when: { rainbow: [false] } },
    ...hide,
  },
  presets: [
    { name: 'Светлячки', values: { colorA: '#fde047', colorB: '#facc15', colorC: '#fef9c3', pull: 0.5, count: 40 } },
    { name: 'Галактика', values: { rainbow: true, count: 250, size: 2, orbit: 2 } },
    { name: 'Шлейф', values: { pull: 0.25, count: 150, radius: 20 } },
  ],
}

export const adaptiveCursor: EffectDef = {
  id: 'cursor-adaptive',
  name: 'Под контент',
  category: 'Курсоры',
  kind: 'cursor',
  description: 'Кольцо берёт цвет того, над чем находится; над текстом — каретка, над кнопкой — заливка',
  params: {
    ringSize: { type: 'number', label: 'Размер', min: 10, max: 80, step: 1, default: 28 },
    hoverScale: { type: 'number', label: 'Рост над кнопками', min: 1, max: 4, step: 0.05, default: 2.2 },
    lag: { type: 'number', label: 'Запаздывание', min: 0.01, max: 0.5, step: 0.01, default: 0.1 },
    matchColor: { type: 'boolean', label: 'Цвет из контента', default: true, hint: 'Цвет текста или фона кнопки под курсором' },
    invert: { type: 'boolean', label: 'Инверсия над кнопками', default: false },
    color: { type: 'color', label: 'Свой цвет', default: '#ffffff', when: { matchColor: [false] } },
    ...hide,
  },
  presets: [
    { name: 'Хамелеон', values: { matchColor: true } },
    { name: 'Без курсора', values: { matchColor: true, hideCursor: true } },
    { name: 'Белый', values: { matchColor: false, invert: true } },
  ],
}

export const CURSORS = [fluidCursor, smokeCursor, trailCursor, cometCursor, neonCursor, swarmCursor, flowCursor, ringCursor, adaptiveCursor, flashlightCursor]
