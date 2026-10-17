import type { EffectDef } from './types'

/**
 * «Жидкий металл» — переливающаяся поверхность, как ртуть или перламутр.
 *
 * Высота поверхности — шум от шума (как в «Шуме»), но вместо прямой
 * раскраски считаем НОРМАЛЬ этой поверхности и отражаем в ней «студию»:
 * градиент из трёх цветов + яркие полосы света (как софтбоксы над хромом).
 * Перламутр — оттенок сдвигается по углу нормали (иризация).
 * Курсор — живая вода из симуляции: круги расходятся и гаснут.
 */
export const liquidMetal: EffectDef = {
  id: 'liquid-metal',
  name: 'Жидкий металл',
  category: 'Фоны',
  kind: 'quad',
  description: 'Ртуть или перламутр: поверхность переливается, курсор пускает круги',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 2, step: 0.01, default: 0.35 },
    scale: { type: 'number', label: 'Масштаб', min: 0.3, max: 6, step: 0.05, default: 0.9 },
    warp: { type: 'number', label: 'Закрутка', min: 0, max: 3, step: 0.01, default: 1.1 },
    relief: { type: 'number', label: 'Рельеф', min: 0, max: 3, step: 0.01, default: 1, hint: 'Насколько поверхность выпуклая — сильнее блики' },
    shine: { type: 'number', label: 'Блики', min: 0, max: 2, step: 0.01, default: 1, hint: 'Яркие полосы света, как софтбоксы над хромом' },
    iridescence: { type: 'number', label: 'Перламутр', min: 0, max: 1, step: 0.01, default: 0.08, hint: 'Радужные переливы по углу поверхности' },
    ripple: { type: 'number', label: 'Круги от курсора', min: 0, max: 3, step: 0.01, default: 1 },
    colorA: { type: 'color', label: 'Тень', default: '#0b0b14' },
    colorB: { type: 'color', label: 'Середина', default: '#6b6f80' },
    colorC: { type: 'color', label: 'Свет', default: '#f2f4f8' },
  },
  presets: [
    { name: 'Ртуть', values: {} },
    { name: 'Перламутр', values: { colorA: '#2a1f3d', colorB: '#c4b5fd', colorC: '#fdf4ff', iridescence: 0.9, relief: 0.8 } },
    { name: 'Золото', values: { colorA: '#2a1505', colorB: '#b8860b', colorC: '#fff3c4', iridescence: 0.1 } },
    { name: 'Нефть', values: { colorA: '#020203', colorB: '#14141c', colorC: '#9aa0b4', iridescence: 1, shine: 0.6 } },
  ],
  simulation: {
    size: 256,
    fragment: /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uSimRes;
  vec2 e = 1.0 / uSimRes;
  vec4 s = texture(uState, uv);
  float sum = texture(uState, uv + vec2(e.x, 0.0)).r + texture(uState, uv - vec2(e.x, 0.0)).r
            + texture(uState, uv + vec2(0.0, e.y)).r + texture(uState, uv - vec2(0.0, e.y)).r;
  float h = (sum * 0.5 - s.g) * 0.985;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float d = length((uv - uMouse) * vec2(aspect, 1.0));
  h -= uMouseActive * min(length(uMouseVel), 3.0) * 0.08 * smoothstep(0.03, 0.0, d);
  for (int i = 0; i < 4; i++) if (uClicks[i].z > 0.0) h -= 0.8 * smoothstep(0.05, 0.0, length((uv - uClicks[i].xy) * vec2(aspect, 1.0)));
  fragColor = vec4(h, s.r, 0.0, 1.0);
}`,
  },
  fragment: /* glsl */ `
float surface(vec2 p) {
  float t = uTime * uSpeed * 0.08;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  // Плавнее обычного fbm: крупный слой сильнее — поверхность «жидкая», без ряби.
  vec2 w = p + uWarp * q + vec2(t * 0.6, -t * 0.4);
  return noise(w) * 0.7 + noise(w * 2.1) * 0.25 + noise(w * 4.3) * 0.05;
}

vec3 studio(vec3 n) {
  // Отражение «студии»: градиент по вертикали + две полосы света.
  float y = n.y * 0.5 + 0.5;
  vec3 c = mix(uColorA, uColorB, smoothstep(0.1, 0.6, y));
  c = mix(c, uColorC, smoothstep(0.6, 0.95, y));
  float strip = smoothstep(0.08, 0.0, abs(n.x - 0.35)) + smoothstep(0.05, 0.0, abs(n.x + 0.45)) * 0.6;
  return c + uColorC * strip * uShine * smoothstep(0.3, 0.8, y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(aspect, 1.0) * uScale;
  float e = 0.01;
  float h = surface(p);
  float live = texture(uSim, uv).r * uRipple;
  float hx = surface(p + vec2(e, 0.0)) + texture(uSim, uv + vec2(e / uScale / aspect, 0.0)).r * uRipple;
  float hy = surface(p + vec2(0.0, e)) + texture(uSim, uv + vec2(0.0, e / uScale)).r * uRipple;
  vec3 n = normalize(vec3((h + live - hx) * uRelief / e * 0.45, (h + live - hy) * uRelief / e * 0.45, 1.0));
  vec3 col = studio(n);
  // Перламутр: оттенок по углу нормали.
  vec3 irid = 0.5 + 0.5 * cos(6.2832 * (atan(n.y, n.x) / 6.2832 + h * 2.0 + vec3(0.0, 0.33, 0.67)));
  col = mix(col, col * (0.6 + irid * 0.8), uIridescence);
  fragColor = vec4(col, 1.0);
}`,
}

/**
 * «Огонь» — пламя снизу вверх.
 *
 * Шум, который бежит вверх и «сжимается» по горизонтали к верху; высота
 * пламени — порог, который падает с высотой. Температура → цвет: тёмно-
 * красный → оранжевый → жёлтый → белое ядро. Искры — точки в ячейках,
 * летящих вверх. Курсор раздувает пламя (как будто в него дуют).
 */
export const fire: EffectDef = {
  id: 'fire',
  name: 'Огонь',
  category: 'Фоны',
  kind: 'quad',
  description: 'Пламя снизу вверх с искрами; курсор раздувает огонь',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 3, step: 0.01, default: 1 },
    height: { type: 'number', label: 'Высота пламени', min: 0.1, max: 1.2, step: 0.01, default: 0.55 },
    turbulence: { type: 'number', label: 'Турбулентность', min: 0, max: 2, step: 0.01, default: 1, hint: 'Насколько языки рваные' },
    tongues: { type: 'number', label: 'Языки', min: 1, max: 12, step: 0.1, default: 4, hint: 'Сколько крупных языков по ширине' },
    sparks: { type: 'number', label: 'Искры', min: 0, max: 1, step: 0.01, default: 0.5 },
    wind: { type: 'number', label: 'Ветер', min: -1, max: 1, step: 0.01, default: 0, hint: 'Наклон пламени влево-вправо' },
    blow: { type: 'number', label: 'Курсор раздувает', min: 0, max: 2, step: 0.01, default: 1 },
    background: { type: 'color', label: 'Фон', default: '#050203' },
    hot: { type: 'color', label: 'Ядро', default: '#fff4c2' },
    mid: { type: 'color', label: 'Пламя', default: '#ff8a1f' },
    cool: { type: 'color', label: 'Край', default: '#b3160b' },
  },
  presets: [
    { name: 'Костёр', values: {} },
    { name: 'Синее пламя', values: { hot: '#e8fbff', mid: '#38bdf8', cool: '#1e3a8a', sparks: 0.2 } },
    { name: 'Адское', values: { height: 1, turbulence: 1.6, tongues: 7, sparks: 1, cool: '#7f1d1d' } },
    { name: 'Свеча', values: { height: 0.35, tongues: 1.5, turbulence: 0.4, sparks: 0, speed: 0.7 } },
  ],
  fragment: /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float t = uTime * uSpeed;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  // Курсор раздувает: рядом с ним пламя выше.
  float near = uMouseActive * exp(-pow((uv.x - uMouse.x) * aspect, 2.0) * 8.0) * uBlow;
  p.x -= uWind * uv.y * uv.y * 0.6;
  // Шум бежит вверх, по горизонтали сжимается к верху — языки сходятся.
  vec2 q = vec2(p.x * uTongues * (1.0 + uv.y), p.y * 3.0 - t * 1.8);
  float n = fbm(q + fbm(q * 1.7 - t * 0.6) * uTurbulence);
  float h = uHeight * (1.0 + near * 0.8);
  float flame = n * 1.4 - uv.y / max(h, 0.05) + 0.25;
  float temp = clamp(flame, 0.0, 1.0);
  vec3 col = mix(uBackground, uCool, smoothstep(0.0, 0.25, temp));
  col = mix(col, uMid, smoothstep(0.2, 0.55, temp));
  col = mix(col, uHot, smoothstep(0.55, 0.95, temp));
  // Отсвет у основания.
  col += uMid * exp(-uv.y * 6.0) * 0.25;
  // Искры: ячейки летят вверх, в части — яркая точка, гаснет с высотой.
  if (uSparks > 0.0) {
    vec2 g = vec2(p.x * 18.0, uv.y * 10.0 - t * 2.5);
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5 + (hash2(id) - 0.5) * 0.6;
    float on = step(1.0 - uSparks * 0.25, hash(id + 3.0));
    float spark = smoothstep(0.06, 0.0, length(f)) * on * smoothstep(1.0, 0.2, uv.y);
    col += mix(uMid, uHot, 0.5) * spark * 1.5;
  }
  fragColor = vec4(col, 1.0);
}`,
}
