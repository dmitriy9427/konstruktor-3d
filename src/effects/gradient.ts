import type { EffectDef } from './types'

/**
 * «Плавающий градиент» — mesh-градиент: несколько цветных точек медленно
 * плавают, а цвет в каждом пикселе — их смесь с весами по расстоянию
 * (1 / d^резкость — ближняя точка главнее). Лёгкое искажение шумом делает
 * границы мягкими «облаками», зерно прячет полосы на плавных переходах.
 *
 * Самый лёгкий фон каталога: картинка размытая по природе, поэтому её можно
 * рисовать в низком разрешении (по умолчанию «Качество» 0.5 — в 4–9 раз
 * меньше пикселей) и 30 кадров в секунду — разницы не видно, батарея цела.
 */
export const gradient: EffectDef = {
  id: 'gradient',
  name: 'Плавающий градиент',
  category: 'Фоны',
  kind: 'quad',
  description: 'Мягкие цветные пятна плавают и перетекают — почти без нагрузки',
  usesMouse: true,
  defaultCommon: { quality: 0.5, fps: 30, post: { grain: 0.15, chroma: 0, vignette: 0, bloom: 0 } },
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 2, step: 0.01, default: 0.4, hint: 'Как быстро плавают пятна' },
    points: { type: 'number', label: 'Пятен', min: 2, max: 6, step: 1, default: 4 },
    sharpness: { type: 'number', label: 'Резкость', min: 0.5, max: 6, step: 0.05, default: 2, hint: 'Меньше — всё смешано в пастель, больше — чёткие пятна' },
    warp: { type: 'number', label: 'Волнистость', min: 0, max: 1, step: 0.01, default: 0.35, hint: 'Границы пятен — мягкие облака' },
    drift: { type: 'number', label: 'Размах', min: 0.1, max: 1, step: 0.01, default: 0.5, hint: 'Как далеко пятна уплывают от своих мест' },
    grip: { type: 'number', label: 'Мышь притягивает', min: 0, max: 1, step: 0.01, default: 0.3, hint: 'Ближнее пятно тянется к курсору' },
    colorA: { type: 'color', label: 'Цвет 1', default: '#ff6b9d' },
    colorB: { type: 'color', label: 'Цвет 2', default: '#a78bfa' },
    colorC: { type: 'color', label: 'Цвет 3', default: '#22d3ee' },
    colorD: { type: 'color', label: 'Цвет 4', default: '#ffd166' },
    colorE: { type: 'color', label: 'Цвет 5', default: '#34d399', when: { points: [5, 6] } },
    colorF: { type: 'color', label: 'Цвет 6', default: '#0b0820', when: { points: [6] } },
  },
  presets: [
    { name: 'Леденец', values: {} },
    { name: 'Рассвет', values: { colorA: '#ff8a5c', colorB: '#ffd166', colorC: '#f0479a', colorD: '#fff1e0', sharpness: 1.4 } },
    { name: 'Океан', values: { colorA: '#0ea5e9', colorB: '#1e3a8a', colorC: '#22d3ee', colorD: '#0b1020', sharpness: 2.6 } },
    { name: 'Тёмный', values: { colorA: '#3b1d8f', colorB: '#05030f', colorC: '#7c2d6b', colorD: '#0b0820', points: 4, sharpness: 2.2 } },
    { name: 'Пастель', values: { colorA: '#fbcfe8', colorB: '#c7d2fe', colorC: '#bbf7d0', colorD: '#fef3c7', sharpness: 1, warp: 0.2 } },
  ],
  fragment: /* glsl */ `
vec3 pick(int i) {
  if (i == 0) return uColorA;
  if (i == 1) return uColorB;
  if (i == 2) return uColorC;
  if (i == 3) return uColorD;
  if (i == 4) return uColorE;
  return uColorF;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(aspect, 1.0);
  // Мягкие «облачные» границы — сдвигаем точку шумом.
  float t = uTime * uSpeed * 0.15;
  p += (vec2(noise(p * 2.0 + t), noise(p * 2.0 - t + 7.0)) - 0.5) * uWarp * 0.6;

  vec2 m = uMouse * vec2(aspect, 1.0);
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uPoints) break;
    float fi = float(i);
    // Своё место по кругу + плавание по фигуре Лиссажу.
    float a = fi / uPoints * 6.2832;
    vec2 home = vec2(0.5 * aspect, 0.5) + vec2(cos(a) * aspect, sin(a)) * 0.28;
    vec2 c = home + vec2(sin(t * (1.0 + fi * 0.3) + fi * 2.1) * aspect, cos(t * (0.8 + fi * 0.25) + fi * 1.3)) * uDrift * 0.3;
    c = mix(c, m, uMouseActive * uGrip * exp(-length(c - m) * 2.0));   // ближнее пятно тянется к мыши
    float w = 1.0 / pow(max(length(p - c), 1e-3), uSharpness);
    sum += pick(i) * w;
    wsum += w;
  }
  fragColor = vec4(sum / wsum, 1.0);
}`,
}
