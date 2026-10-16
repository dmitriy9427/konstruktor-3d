import type { EffectDef } from './types'

/**
 * «Плазма» — классика демосцены: сумма синусов, раскрашенная палитрой.
 *
 * Значение v в точке — сумма четырёх волн: по x, по y, по диагонали и
 * кругами от движущегося центра. Потом v превращается в «волну» f от 0 до 1
 * и раскрашивается градиентом из трёх цветов: тень → основной → блик.
 * Пример для главы «Свой эффект» учебника.
 */
export const plasma: EffectDef = {
  id: 'plasma',
  name: 'Плазма',
  category: 'Фоны',
  kind: 'quad',
  description: 'Переливы из суммы синусов — классика демосцены',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 3, step: 0.01, default: 0.6, hint: 'Скорость переливов' },
    scale: { type: 'number', label: 'Масштаб', min: 1, max: 20, step: 0.1, default: 6, hint: 'Размер узора: больше значение — мельче волны' },
    bands: { type: 'number', label: 'Полосы', min: 0.2, max: 3, step: 0.01, default: 1, hint: 'Сколько цветовых полос укладывается в узор' },
    glow: { type: 'number', label: 'Блики', min: 0, max: 1, step: 0.01, default: 0.6, hint: 'Яркость бликов' },
    colorA: { type: 'color', label: 'Тень', default: '#0d0626', hint: 'Цвет теней' },
    colorB: { type: 'color', label: 'Основной', default: '#7c4dff', hint: 'Основной цвет' },
    colorC: { type: 'color', label: 'Блик', default: '#ff7ac6', hint: 'Цвет бликов' },
  },
  presets: [
    { name: 'Фиолетовая', values: { colorA: '#0d0626', colorB: '#7c4dff', colorC: '#ff7ac6' } },
    { name: 'Кислотная', values: { colorA: '#021a0e', colorB: '#14b866', colorC: '#e6ff4f', bands: 1.8 } },
    { name: 'Спокойная', values: { colorA: '#04111f', colorB: '#1e6fd9', colorC: '#9be7ff', bands: 0.5, speed: 0.25, glow: 0.3 } },
  ],
  fragment: /* glsl */ `
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * uScale;
  float t = uTime * uSpeed;

  // Центр кругов ходит по кругу или следует за мышью.
  vec2 orbit = vec2(sin(t * 0.7), cos(t * 0.5)) * uScale * 0.3;
  vec2 mouse = (uMouse - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
  vec2 c = mix(orbit, mouse, uMouseActive);

  float v = sin(p.x + t)
          + sin(p.y * 0.8 - t * 1.3)
          + sin((p.x + p.y) * 0.6 + t * 0.7)
          + sin(length(p - c) * 1.4 - t * 2.0);
  v *= 0.25 * uBands;

  // Волна 0…1 → градиент тень → основной → блик.
  float f = 0.5 + 0.5 * sin(v * 6.2832);
  vec3 col = mix(uColorA, uColorB, smoothstep(0.0, 0.65, f));
  col = mix(col, uColorC, smoothstep(0.7, 1.0, f) * uGlow);
  fragColor = vec4(col, 1.0);
}`,
}
