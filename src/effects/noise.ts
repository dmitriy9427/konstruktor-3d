import type { EffectDef } from './types'

/**
 * «Шум» — цветной туман, который течёт сам в себя.
 *
 * Приём «искажение координат шумом» (domain warping): сначала считаем шум q,
 * потом шум от координат, сдвинутых на q, — и ещё раз. Формы не просто
 * дрейфуют, а закручиваются, как дым или мраморные разводы.
 * Мышь притягивает разводы к себе.
 */
export const noise: EffectDef = {
  id: 'noise',
  name: 'Шум',
  category: 'Фоны',
  kind: 'quad',
  description: 'Цветной туман, который закручивается сам в себя',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 2, step: 0.01, default: 0.35, hint: 'Как быстро движется узор. 0 — картинка замирает' },
    scale: { type: 'number', label: 'Масштаб', min: 0.5, max: 6, step: 0.05, default: 2.2, hint: 'Размер пятен: больше значение — мельче узор' },
    warp: { type: 'number', label: 'Закрутка', min: 0, max: 4, step: 0.05, default: 1.6, hint: 'Насколько узор «закручивается» сам в себя; 0 — ровные облака' },
    contrast: { type: 'number', label: 'Контраст', min: 0.5, max: 3, step: 0.05, default: 1.3, hint: 'Разница между светлыми и тёмными областями' },
    colorA: { type: 'color', label: 'Цвет 1', default: '#0b0820', hint: 'Цвет самых тёмных областей' },
    colorB: { type: 'color', label: 'Цвет 2', default: '#6d3cff', hint: 'Цвет средних областей' },
    colorC: { type: 'color', label: 'Цвет 3', default: '#ff6ab0', hint: 'Цвет самых светлых областей' },
  },
  presets: [
    { name: 'Неон', values: { colorA: '#0b0820', colorB: '#6d3cff', colorC: '#ff6ab0' } },
    { name: 'Мрамор', values: { colorA: '#e9e4dc', colorB: '#8f8a84', colorC: '#2a2826', warp: 3.2, contrast: 2.2, speed: 0.12 } },
    { name: 'Океан', values: { colorA: '#021520', colorB: '#0e6e8c', colorC: '#7ff3e1', scale: 1.4 } },
  ],
  fragment: /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * uScale;
  float t = uTime * uSpeed * 0.3;

  // Мышь тянет разводы к себе.
  vec2 m = (uMouse - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
  p += (m - p) * 0.12 * uMouseActive * exp(-length(m - p) * 0.8);

  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + uWarp * q + vec2(1.7, 9.2) + 0.15 * t), fbm(p + uWarp * q + vec2(8.3, 2.8) - 0.12 * t));
  float n = fbm(p + uWarp * r);
  n = clamp((n - 0.5) * uContrast + 0.5, 0.0, 1.0);

  vec3 col = mix(uColorA, uColorB, smoothstep(0.1, 0.65, n));
  col = mix(col, uColorC, smoothstep(0.55, 0.95, n * length(q)));
  fragColor = vec4(col, 1.0);
}`,
}
