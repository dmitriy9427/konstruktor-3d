import type { EffectDef } from './types'

/**
 * «Сияние» — ленты северного сияния.
 *
 * Три ленты-занавеса. У каждой — волнистый нижний край (его форма — шум,
 * плывущий во времени): снизу край резкий, вверх свет затухает плавно.
 * Вертикальные «лучи» внутри ленты — шум, зависящий только от x.
 * Цвет меняется по высоте: у края — цвет 1, выше — цвет 2, верхняя
 * лента — цвет 3. Центр (X, Y) — где сияние ярче всего: туда ставят заголовок.
 */
export const aurora: EffectDef = {
  id: 'aurora',
  name: 'Сияние',
  category: 'Фоны',
  kind: 'quad',
  description: 'Перетекающие ленты света под заголовок',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 2, step: 0.01, default: 0.5 },
    stretch: { type: 'number', label: 'Ширина волн', min: 0.3, max: 4, step: 0.05, default: 1.4 },
    intensity: { type: 'number', label: 'Яркость', min: 0.2, max: 2, step: 0.01, default: 1 },
    focusX: { type: 'number', label: 'Центр по X', min: 0, max: 1, step: 0.01, default: 0.65 },
    focusY: { type: 'number', label: 'Центр по Y', min: 0, max: 1, step: 0.01, default: 0.6 },
    background: { type: 'color', label: 'Фон', default: '#05040c' },
    colorA: { type: 'color', label: 'Цвет 1', default: '#5b3df5' },
    colorB: { type: 'color', label: 'Цвет 2', default: '#22d3ee' },
    colorC: { type: 'color', label: 'Цвет 3', default: '#f0479a' },
  },
  presets: [
    { name: 'Полярное', values: { background: '#02060c', colorA: '#1fe08a', colorB: '#22d3ee', colorC: '#7b5cff' } },
    { name: 'Фирменное', values: { colorA: '#5b3df5', colorB: '#22d3ee', colorC: '#f0479a' } },
    { name: 'Рассвет', values: { background: '#120708', colorA: '#ff7a59', colorB: '#ffd166', colorC: '#f0479a' } },
  ],
  fragment: /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float t = uTime * 0.12 * uSpeed;
  vec3 col = vec3(0.0);

  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = uv.x * aspect / uStretch * (1.0 + fi * 0.35) + fi * 3.1;
    // Нижний край ленты: волна из шума.
    float edge = uFocusY - 0.28 + fi * 0.1 + (fbm(vec2(x * 1.3 + t * (1.0 + fi * 0.3), fi * 7.0 + t * 0.4)) - 0.5) * 0.55;
    float dy = uv.y - edge;
    float band = smoothstep(-0.07, 0.02, dy) * exp(-max(dy, 0.0) * (5.0 + fi * 2.5));
    // Лучи: полосы вдоль ленты.
    float rays = 0.45 + 0.55 * noise(vec2(x * 26.0, t * 3.0 + fi * 5.0));
    band *= rays;
    vec3 c = mix(uColorA, uColorB, smoothstep(0.0, 0.3, dy));
    if (i == 2) c = mix(c, uColorC, 0.75);
    col += c * band * (1.0 - fi * 0.2);
  }

  // Ярче всего — вокруг центра по X; курсор подсвечивает ленты под собой.
  float focus = 0.3 + 0.7 * smoothstep(0.9, 0.0, abs(uv.x - uFocusX) * aspect / max(aspect, 1.0));
  float glow = uMouseActive * exp(-length((uv - uMouse) * vec2(aspect, 1.0)) * 3.0);
  col *= focus * (1.0 + glow * 0.8) * uIntensity;

  vec3 bg = uBackground + uColorA * 0.06 * smoothstep(1.0, 0.0, uv.y);
  fragColor = vec4(bg + (1.0 - exp(-col * 1.6)), 1.0);
}`,
}
