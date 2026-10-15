import type { EffectDef } from './types'

/**
 * «Космос» — звёзды в несколько слоёв и туманность.
 *
 * Звёзды — сетка ячеек: в каждой ячейке одна звезда в случайной точке
 * (hash2), со случайной яркостью; часть ячеек пустая (плотность). Несколько
 * слоёв разного масштаба едут с разной скоростью — параллакс, ощущение
 * глубины. Мышь сдвигает слои по-разному: ближние сильнее.
 */
export const space: EffectDef = {
  id: 'space',
  name: 'Космос',
  category: 'Фоны',
  kind: 'quad',
  description: 'Звёзды с параллаксом и туманность',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Полёт', min: 0, max: 3, step: 0.01, default: 0.4 },
    density: { type: 'number', label: 'Плотность звёзд', min: 0.05, max: 1, step: 0.01, default: 0.45 },
    twinkle: { type: 'number', label: 'Мерцание', min: 0, max: 1, step: 0.01, default: 0.6 },
    nebula: { type: 'number', label: 'Туманность', min: 0, max: 1.5, step: 0.01, default: 0.7 },
    parallax: { type: 'number', label: 'Параллакс мыши', min: 0, max: 1, step: 0.01, default: 0.4 },
    background: { type: 'color', label: 'Фон', default: '#03030a' },
    nebulaA: { type: 'color', label: 'Туманность 1', default: '#4b1d8f' },
    nebulaB: { type: 'color', label: 'Туманность 2', default: '#0f6c8a' },
    starColor: { type: 'color', label: 'Звёзды', default: '#fff6e8' },
  },
  presets: [
    { name: 'Глубокий космос', values: { nebulaA: '#4b1d8f', nebulaB: '#0f6c8a' } },
    { name: 'Красная туманность', values: { nebulaA: '#8f1d3b', nebulaB: '#c46a1b', nebula: 1.1 } },
    { name: 'Только звёзды', values: { nebula: 0, density: 0.8, speed: 1.2 } },
  ],
  fragment: /* glsl */ `
float stars(vec2 p, float scale, float density, float seed) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 h = hash2(id + seed);
  if (h.x > density) return 0.0;
  vec2 pos = (h - 0.5) * 0.7;
  float d = length(f - pos);
  float size = 0.015 + h.y * 0.03;
  float tw = 1.0 - uTwinkle * 0.5 * (1.0 + sin(uTime * (1.5 + h.y * 4.0) + h.x * 30.0));
  return smoothstep(size, 0.0, d) * (0.4 + h.y) * tw;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec2 m = (uMouse - 0.5) * uParallax * uMouseActive;
  float t = uTime * uSpeed * 0.05;

  vec3 col = uBackground;
  // Туманность — два слоя fbm разного цвета.
  float n1 = fbm(p * 1.6 + vec2(t * 0.5, 0.0) - m * 0.2);
  float n2 = fbm(p * 2.4 - vec2(0.0, t * 0.4) + 7.0 - m * 0.3);
  col += uNebulaA * smoothstep(0.45, 0.95, n1) * uNebula;
  col += uNebulaB * smoothstep(0.5, 1.0, n2) * uNebula * 0.8;

  // Три слоя звёзд: дальние мелкие и медленные, ближние крупнее и быстрее.
  float s = 0.0;
  s += stars(p + vec2(t * 0.5, 0.0) - m * 0.1, 22.0, uDensity, 1.0) * 0.6;
  s += stars(p + vec2(t * 1.0, 0.0) - m * 0.3, 12.0, uDensity * 0.7, 7.0) * 0.85;
  s += stars(p + vec2(t * 2.0, 0.0) - m * 0.6, 6.0, uDensity * 0.45, 13.0);
  col += uStarColor * s;
  fragColor = vec4(col, 1.0);
}`,
}
