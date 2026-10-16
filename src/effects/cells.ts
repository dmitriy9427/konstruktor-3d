import type { EffectDef } from './types'

/**
 * «Клетки» — капли, которые сливаются и расходятся, как клетки под
 * микроскопом или лава-лампа. (Раньше назывались «Лава» — настоящая лава
 * теперь в lava.ts.)
 *
 * Метаболы: у каждой капли есть «поле», убывающее с расстоянием (r² / d²).
 * Поля всех капель складываются; где сумма больше порога — там «лава».
 * Поэтому две капли рядом сливаются плавной перемычкой, а не пересекаются
 * кругами. Одна капля следует за мышью.
 */
export const cells: EffectDef = {
  id: 'cells',
  name: 'Клетки',
  category: 'Фоны',
  kind: 'quad',
  description: 'Капли сливаются и делятся, как клетки под микроскопом',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 2, step: 0.01, default: 0.45, hint: 'Как быстро капли плывут и сливаются' },
    count: { type: 'number', label: 'Капель', min: 2, max: 12, step: 1, default: 7, hint: 'Сколько капель в кадре' },
    size: { type: 'number', label: 'Размер', min: 0.05, max: 0.35, step: 0.005, default: 0.16, hint: 'Размер одной капли' },
    softness: { type: 'number', label: 'Мягкость края', min: 0.01, max: 0.6, step: 0.01, default: 0.12, hint: 'Мягкость границы: меньше — чёткий контур, больше — размытый' },
    glow: { type: 'number', label: 'Свечение', min: 0, max: 2, step: 0.01, default: 0.8, hint: 'Сила свечения вокруг капель' },
    background: { type: 'color', label: 'Фон', default: '#120612', hint: 'Цвет фона за каплями' },
    colorA: { type: 'color', label: 'Ядро', default: '#ffd166', hint: 'Цвет середины капли' },
    colorB: { type: 'color', label: 'Край', default: '#ff3d6e', hint: 'Цвет края капли' },
  },
  presets: [
    { name: 'Лава-лампа', values: { background: '#120612', colorA: '#ffd166', colorB: '#ff3d6e' } },
    { name: 'Ртуть', values: { background: '#0c0f14', colorA: '#ffffff', colorB: '#6b7a90', softness: 0.03, glow: 0.3 } },
    { name: 'Кислота', values: { background: '#05140b', colorA: '#d9ff4d', colorB: '#18c964', count: 10 } },
  ],
  fragment: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = gl_FragCoord.xy / uResolution.y;
  float t = uTime * uSpeed;
  float field = 0.0;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= uCount) break;
    float fi = float(i);
    vec2 seed = hash2(vec2(fi, fi * 1.7));
    // Каждая капля ходит по своей фигуре Лиссажу.
    vec2 c = vec2(
      aspect * (0.5 + 0.38 * sin(t * (0.3 + seed.x * 0.5) + fi * 1.3)),
      0.5 + 0.38 * sin(t * (0.25 + seed.y * 0.45) + fi * 2.1)
    );
    float r = uSize * (0.6 + seed.y * 0.8);
    vec2 d = p - c;
    field += r * r / max(dot(d, d), 1e-5);
  }
  // Капля у мыши.
  vec2 m = uMouse * vec2(aspect, 1.0);
  vec2 dm = p - m;
  field += uMouseActive * uSize * uSize * 1.2 / max(dot(dm, dm), 1e-5);

  float inside = smoothstep(1.0 - uSoftness, 1.0 + uSoftness, field);
  vec3 lavaCol = mix(uColorB, uColorA, smoothstep(1.0, 3.0, field));
  vec3 col = mix(uBackground, lavaCol, inside);
  // Свечение вокруг капель.
  col += uColorB * smoothstep(0.25, 1.0, field) * (1.0 - inside) * 0.35 * uGlow;
  fragColor = vec4(col, 1.0);
}`,
}
