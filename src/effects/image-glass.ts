import type { EffectDef } from './types'

/**
 * «Рифлёное стекло» — раздел «Изображения», вид image (шейдер поверх <img>).
 *
 * Образец эффекта для картинки. Рантайм сам загружает <img> в текстуру uImage
 * (её размер — uImageRes) и кладёт холст поверх; coverUv() даёт координаты «как
 * object-fit: cover». Нам остаётся решить, ОТКУДА брать цвет каждого пикселя.
 *
 * Идея: стекло из вертикальных рёбер-цилиндров. Каждое ребро — маленькая линза:
 * чем дальше от середины ребра, тем сильнее луч уходит вбок. Значит, сдвиг
 * координаты картинки = положение внутри ребра (−0.5…0.5) × сила.
 * Вокруг курсора стекло «протирается»: сдвиг плавно падает до нуля.
 */
export const imageGlass: EffectDef = {
  // ── Паспорт ──
  id: 'image-glass',
  name: 'Рифлёное стекло',
  category: 'Изображения',
  kind: 'image',
  description: 'Фото за ребристым стеклом; курсор протирает в нём чистое окно',
  usesMouse: true,
  defaultCommon: { inertia: 0.2 },

  // ── Ползунки ──
  params: {
    ribs: { type: 'number', label: 'Рёбер', min: 4, max: 80, step: 1, default: 22, hint: 'Сколько рёбер помещается по ширине картинки' },
    refraction: { type: 'number', label: 'Преломление', min: 0, max: 1, step: 0.01, default: 0.55, hint: 'Насколько сильно ребро сдвигает картинку' },
    angle: { type: 'number', label: 'Угол, °', min: -90, max: 90, step: 1, default: 0, hint: '0 — рёбра вертикальные, 90 — горизонтальные' },
    dispersion: { type: 'number', label: 'Радужные края', min: 0, max: 1, step: 0.01, default: 0.35, hint: 'Красный и синий преломляются по-разному — как в настоящем стекле' },
    frost: { type: 'number', label: 'Матовость', min: 0, max: 1, step: 0.01, default: 0.2, hint: 'Размытие внутри ребра' },
    gloss: { type: 'number', label: 'Блики', min: 0, max: 1, step: 0.01, default: 0.45, hint: 'Светлая полоска на каждом ребре' },
    drift: { type: 'number', label: 'Движение', min: -1, max: 1, step: 0.01, default: 0.12, hint: 'Стекло медленно едет вбок; 0 — стоит' },
    radius: { type: 'number', label: 'Чистое окно', min: 0, max: 0.8, step: 0.01, default: 0.28, hint: 'Радиус окна вокруг курсора, где стекло прозрачное; 0 — без окна' },
    invert: { type: 'boolean', label: 'Наоборот: стекло только у курсора', default: false, hint: 'Картинка чистая, а рёбра появляются под курсором' },
  },

  // ── Пресеты ──
  presets: [
    { name: 'Витрина', values: {} },
    { name: 'Тонкое', values: { ribs: 60, refraction: 0.35, frost: 0.05, gloss: 0.25, dispersion: 0.15 } },
    { name: 'Жалюзи', values: { ribs: 9, refraction: 0.9, angle: 90, dispersion: 0.6, gloss: 0.7, drift: 0 } },
    { name: 'Призма', values: { ribs: 14, refraction: 0.8, angle: 28, dispersion: 1, frost: 0, drift: 0.3 } },
    { name: 'Линза под курсором', values: { invert: true, radius: 0.4, ribs: 30, refraction: 0.8, drift: 0 } },
  ],

  // ── Шейдер ──
  fragment: /* glsl */ `
// Цвет картинки в точке uv холста (0…1), с учётом «cover».
vec3 photo(vec2 uv) { return texture(uImage, coverUv(uv, uResolution, uImageRes)).rgb; }

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 c = (uv - 0.5) * vec2(aspect, 1.0);          // координаты без искажения пропорций

  // Направление «поперёк рёбер» и положение пикселя внутри своего ребра: f = −0.5…0.5.
  float a = radians(uAngle);
  vec2 dir = vec2(cos(a), sin(a));
  float x = dot(c, dir) * uRibs / aspect + uTime * uDrift;
  float f = fract(x) - 0.5;

  // Окно у курсора: 1 — стекло чистое. uMouseActive плавно гасит окно, когда мыши нет.
  float d = length(c - (uMouse - 0.5) * vec2(aspect, 1.0));
  float clearZone = (1.0 - smoothstep(uRadius * 0.35, uRadius, d)) * uMouseActive * step(0.001, uRadius);
  float glass = uInvert > 0.5 ? clearZone : 1.0 - clearZone;   // сколько «стекла» в этом пикселе

  // Линза: сдвиг вдоль dir, пропорционален положению в ребре (в долях холста).
  vec2 shift = dir / vec2(aspect, 1.0) * f * uRefraction * 0.16 * glass;

  // Матовость — несколько выборок вдоль ребра; радужность — свой сдвиг каждому каналу.
  vec3 col = vec3(0.0);
  for (int i = 0; i < 5; i++) {
    float j = (float(i) - 2.0) * 0.5;                // −1…1
    vec2 blur = dir / vec2(aspect, 1.0) * j * uFrost * 0.012 * glass;
    float k = uDispersion * 0.35;
    col.r += photo(uv + shift * (1.0 + k) + blur).r;
    col.g += photo(uv + shift + blur).g;
    col.b += photo(uv + shift * (1.0 - k) + blur).b;
  }
  col /= 5.0;

  // Свет на ребре: блик на одном склоне, тень в стыке между рёбрами.
  float highlight = pow(max(0.0, 1.0 - abs(f + 0.22) * 5.0), 3.0);
  float seam = smoothstep(0.38, 0.5, abs(f));
  col += highlight * uGloss * 0.35 * glass;
  col *= 1.0 - seam * 0.28 * glass * (0.4 + uGloss);
  fragColor = vec4(col, 1.0);
}`,
}
