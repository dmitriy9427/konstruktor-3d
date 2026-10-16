import type { EffectDef } from './types'

/**
 * «Лава» — расплавленный поток: закрученные кольца, вытянутые прожилки,
 * раскалённые до белого ядра и остывающая тёмная корка.
 *
 * Основа — «шум от шума» (domain warping, как в «Шуме»), но раскрашенный как
 * температура и с тремя добавками:
 *   кольца   — синус от искажённого поля: слои потока ложатся друг на друга
 *              кольцами вокруг водоворотов, как на застывающей лаве;
 *   прожилки — мелкий шум, растянутый в 6 раз по одной оси и закрученный тем
 *              же искажением: тонкие волокна текут вдоль потока;
 *   жар      — температура → цвет: корка → тёмно-красный → оранжевый →
 *              жёлтый → белый, плюс свечение (самое горячее светится ярче).
 * «Перспектива» наклоняет плоскость: дальние слои сжимаются — как 3D-сцена.
 * Мышь размешивает лаву: точки вокруг курсора поворачиваются, и чем ближе —
 * тем сильнее, получается водоворот.
 */
export const lava: EffectDef = {
  id: 'lava',
  name: 'Лава',
  category: 'Фоны',
  kind: 'quad',
  description: 'Расплавленный поток с кольцами и прожилками, мышь размешивает',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость течения', min: 0, max: 3, step: 0.01, default: 0.6, hint: 'Как быстро течёт лава' },
    scale: { type: 'number', label: 'Масштаб', min: 0.5, max: 6, step: 0.05, default: 1.3, hint: 'Размер водоворотов: больше — мельче и многочисленнее' },
    swirl: { type: 'number', label: 'Закрученность', min: 0, max: 6, step: 0.05, default: 2.4, hint: 'Насколько поток закручивается в водовороты' },
    bands: { type: 'number', label: 'Кольца', min: 0, max: 1.5, step: 0.01, default: 0.6, hint: 'Слоистые кольца вокруг водоворотов' },
    bandCount: { type: 'number', label: 'Частота колец', min: 2, max: 30, step: 0.5, default: 6, hint: 'Сколько колец в одном водовороте' },
    streaks: { type: 'number', label: 'Прожилки', min: 0, max: 1.5, step: 0.01, default: 0.9, hint: 'Тонкие волокна вдоль потока' },
    heat: { type: 'number', label: 'Жар', min: -0.5, max: 0.5, step: 0.01, default: 0.08, hint: 'Больше — больше раскалённой лавы, меньше — больше остывшей корки' },
    contrast: { type: 'number', label: 'Контраст', min: 0.5, max: 3, step: 0.01, default: 1.4, hint: 'Резкость перехода от корки к жару' },
    glow: { type: 'number', label: 'Свечение', min: 0, max: 2, step: 0.01, default: 0.8, hint: 'Раскалённые места светятся ярче' },
    tilt: { type: 'number', label: 'Перспектива', min: 0, max: 1, step: 0.01, default: 0.55, hint: '0 — смотрим сверху, 1 — плоскость уходит вдаль' },
    angle: { type: 'number', label: 'Направление течения, °', min: 0, max: 360, step: 1, default: 200, hint: 'Куда в целом течёт поток' },
    stir: { type: 'number', label: 'Мышь размешивает', min: -3, max: 3, step: 0.01, default: 1.2, hint: 'Водоворот вокруг курсора; меньше нуля — крутит в другую сторону' },
    crust: { type: 'color', label: 'Корка', default: '#1a0602', hint: 'Цвет остывшей лавы' },
    glowColor: { type: 'color', label: 'Тёплая лава', default: '#c2410c', hint: 'Цвет остывающей, но ещё светящейся лавы' },
    hot: { type: 'color', label: 'Жар', default: '#ffb02e', hint: 'Цвет раскалённой лавы' },
    white: { type: 'color', label: 'Ядро', default: '#fff4d6', hint: 'Самые горячие места — почти белые' },
  },
  presets: [
    { name: 'Вулкан', values: { crust: '#1a0602', glowColor: '#c2410c', hot: '#ffb02e', white: '#fff4d6' } },
    { name: 'Застывающая', values: { heat: -0.1, bands: 1, streaks: 1.2, glow: 0.5, speed: 0.25, contrast: 1.8 } },
    { name: 'Солнце', values: { heat: 0.3, swirl: 4.5, tilt: 0, glow: 1.4, crust: '#3b0a02', glowColor: '#ff5a1f', hot: '#ffd166' } },
    { name: 'Голубое пламя', values: { crust: '#020617', glowColor: '#1d4ed8', hot: '#38bdf8', white: '#ecfeff' } },
    { name: 'Мрамор', values: { crust: '#e7e2d9', glowColor: '#a8a29e', hot: '#57534e', white: '#1c1917', glow: 0, speed: 0.2 } },
  ],
  fragment: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  // Перспектива: верх кадра «дальше» — сжимаем его, низ растягиваем.
  float depth = 1.0 / (1.0 - (p.y + 0.5) * uTilt * 0.75);
  p *= depth;
  p.y *= 1.0 + uTilt * 0.6;

  // Мышь размешивает: поворот вокруг курсора, сильнее вблизи.
  vec2 m = (uMouse - 0.5) * vec2(aspect, 1.0);
  m *= 1.0 / (1.0 - (m.y + 0.5) * uTilt * 0.75);
  vec2 dm = p - m;
  float stir = uStir * uMouseActive * exp(-dot(dm, dm) * 6.0) * 2.5;
  p = m + rot(stir) * dm;

  p *= uScale;
  float t = uTime * uSpeed * 0.06;
  vec2 flow = vec2(cos(radians(uAngle)), sin(radians(uAngle))) * t * 2.0;

  // Шум от шума — водовороты.
  vec2 q = vec2(fbm(p + flow + t), fbm(p + flow + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + 2.5 * q + vec2(1.7, 9.2) + t * 0.7), fbm(p + 2.5 * q + vec2(8.3, 2.8) - t * 0.5));
  vec2 w = p + flow + uSwirl * r;
  float f = fbm(w);

  // Кольца: синус от поля — слои ложатся кольцами вокруг водоворотов.
  float rings = 0.5 + 0.5 * sin((f + r.x * 0.6) * uBandCount * 6.2832);
  // Прожилки: мелкий шум, растянутый вдоль потока.
  vec2 a = normalize(r - 0.5 + 1e-4);
  vec2 along = vec2(dot(w, a), dot(w, vec2(-a.y, a.x)));
  float fibers = fbm(along * vec2(1.2, 16.0) + t);

  float temp = f + uHeat + (rings - 0.5) * 0.22 * uBands + (fibers - 0.5) * 0.35 * uStreaks;
  temp = clamp((temp - 0.5) * uContrast + 0.5, 0.0, 1.0);

  // Температура → цвет.
  vec3 col = mix(uCrust, uGlowColor, smoothstep(0.18, 0.5, temp));
  col = mix(col, uHot, smoothstep(0.45, 0.78, temp));
  col = mix(col, uWhite, smoothstep(0.78, 1.0, temp));
  // Свечение: горячее — ярче (поверх цвета).
  col += uHot * pow(temp, 3.0) * uGlow * 0.35;
  // Дальняя часть чуть темнее и теряет детали (воздух, жар).
  col *= mix(1.0, 0.8, clamp((depth - 1.0) * 0.6, 0.0, 1.0));
  fragColor = vec4(col, 1.0);
}`,
}
