import type { EffectDef } from './types'

/**
 * «Стереть мышью» — фото закрыто инеем, туманом, краской или скретч-слоем;
 * курсор стирает покрытие, и оно медленно нарастает обратно.
 *
 * Сколько стёрто в каждой точке — в текстуре симуляции (как вода в «Волнах»):
 *   шаг: «стёртость» = максимум из прошлой (чуть уменьшенной — покрытие
 *   нарастает) и кисти. Кисть — расстояние до ОТРЕЗКА от прошлого положения
 *   мыши до нынешнего: быстрый взмах оставляет сплошную полосу, а не пунктир.
 * Картинка: смесь покрытия и фото по стёртости, с мягким краем.
 */
export const imageReveal: EffectDef = {
  id: 'image-reveal',
  name: 'Стереть мышью',
  category: 'Изображения',
  kind: 'image',
  description: 'Фото под инеем, туманом или скретч-слоем — курсор стирает',
  usesMouse: true,
  // Кисть идёт точно за курсором — без инерции (иначе стирается «с опозданием»).
  defaultCommon: { inertia: 0.01 },
  params: {
    cover: {
      type: 'select',
      label: 'Покрытие',
      options: [
        { value: 'frost', label: 'Иней' },
        { value: 'fog', label: 'Туман' },
        { value: 'paint', label: 'Краска' },
        { value: 'scratch', label: 'Скретч' },
      ],
      default: 'frost',
    },
    brush: { type: 'number', label: 'Размер кисти', min: 0.02, max: 0.4, step: 0.005, default: 0.09 },
    softness: { type: 'number', label: 'Мягкость края', min: 0, max: 1, step: 0.01, default: 0.5 },
    regrow: { type: 'number', label: 'Нарастает обратно', min: 0, max: 2, step: 0.01, default: 0.25, hint: 'Как быстро покрытие возвращается. 0 — стёртое остаётся навсегда' },
    coverColor: { type: 'color', label: 'Цвет покрытия', default: '#e8eef6', hint: 'Иней, туман, краска — их оттенок' },
    texture: { type: 'number', label: 'Фактура', min: 0, max: 1, step: 0.01, default: 0.5, hint: 'Узор покрытия: кристаллы инея, клубы тумана, мазки краски' },
  },
  presets: [
    { name: 'Запотевшее стекло', values: { cover: 'frost', coverColor: '#e8eef6', regrow: 0.25 } },
    { name: 'Туман', values: { cover: 'fog', coverColor: '#cfd6df', brush: 0.14, regrow: 0.4 } },
    { name: 'Скретч-карта', values: { cover: 'scratch', coverColor: '#b8bcc6', brush: 0.05, softness: 0.1, regrow: 0 } },
    { name: 'Краска', values: { cover: 'paint', coverColor: '#0b0b12', brush: 0.07, softness: 0.2, regrow: 0 } },
  ],
  simulation: {
    size: 256,
    fragment: /* glsl */ `
// Расстояние от точки до отрезка ab.
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * h);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSimRes;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  float prev = texture(uState, uv).r;
  prev = max(0.0, prev - uRegrow * 0.004);   // покрытие нарастает
  vec2 q = uv * vec2(aspect, 1.0);
  vec2 now = uMouse * vec2(aspect, 1.0);
  vec2 before = (uMouse - uMouseVel / 60.0) * vec2(aspect, 1.0);
  float d = segment(q, before, now);
  float brush = (1.0 - smoothstep(uBrush * (1.0 - uSoftness * 0.8), uBrush, d)) * uMouseActive;
  fragColor = vec4(max(prev, brush), 0.0, 0.0, 1.0);
}`,
  },
  fragment: /* glsl */ `
vec3 photo(vec2 uv) { return texture(uImage, coverUv(uv, uResolution, uImageRes)).rgb; }

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = uv * vec2(aspect, 1.0);
  float erased = texture(uSim, uv).r;
  vec3 img = photo(uv);
  vec3 cover;
  if (uCover < 0.5) {
    // Иней: размытое фото (несколько выборок по кругу) + белёсость + кристаллы.
    vec3 blur = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785;
      blur += photo(uv + vec2(cos(a), sin(a)) * 0.012);
    }
    blur /= 8.0;
    // Иней: мягкие разводы + морозные «веточки» (хребты шума).
    float crystals = fbm(p * 9.0) * 0.6 + pow(1.0 - abs(2.0 * fbm(p * 14.0) - 1.0), 6.0) * 0.8;
    cover = mix(blur, uCoverColor, 0.45 + crystals * 0.25 * uTexture);
    // Капли конденсата.
    vec2 g = p * 22.0;
    vec2 c = fract(g) - 0.5 + (hash2(floor(g)) - 0.5) * 0.6;
    cover += smoothstep(0.12, 0.0, length(c)) * 0.15 * step(0.6, hash(floor(g)));
  } else if (uCover < 1.5) {
    // Туман: клубы fbm, медленно плывут.
    float f = fbm(p * 3.0 + uTime * 0.03 + fbm(p * 2.0 - uTime * 0.02));
    cover = mix(img, uCoverColor, 0.7 + (f - 0.5) * 0.5 * uTexture);
  } else if (uCover < 2.5) {
    // Краска: плотный слой с мазками.
    float strokes = fbm(vec2(p.x * 2.0, p.y * 30.0));
    cover = uCoverColor * (0.9 + (strokes - 0.5) * 0.25 * uTexture);
  } else {
    // Скретч: металлик — блик по диагонали и зерно.
    float sheen = 0.5 + 0.5 * sin((p.x + p.y) * 4.0 + 1.0);
    cover = uCoverColor * (0.75 + sheen * 0.35) + (hash(floor(gl_FragCoord.xy)) - 0.5) * 0.08 * uTexture;
  }
  fragColor = vec4(mix(cover, img, smoothstep(0.0, 1.0, erased)), 1.0);
}`,
}
