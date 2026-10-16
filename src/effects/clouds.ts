import type { EffectDef } from './types'

/**
 * «Облака и дым» — мягкий объём, который клубится и течёт.
 *
 * Плотность — «шум от шума» (fbm, координаты которого искривлены другим fbm):
 * формы закручиваются клубами. Режим «Дым» искривляет координаты дважды и
 * сильнее — клубы вытягиваются в завитки; дым не освещается солнцем, а
 * сам светится по плотности и полупрозрачен, слои складываются.
 *
 * Свет — как в настоящем облаке: от точки делаем несколько шагов в сторону
 * солнца и складываем плотность по пути. Чем её больше, тем меньше света
 * дошло (закон Бера: свет = exp(−плотность × поглощение)). Поэтому края,
 * обращённые к солнцу, светлые, толща — тёмная, а тонкие края против солнца
 * светятся («серебряная кромка»).
 *
 * Два слоя: дальний — крупнее, медленнее, бледнее — даёт глубину.
 * Мышь: раздвигает, притягивает или закручивает облака.
 */
export const clouds: EffectDef = {
  id: 'clouds',
  name: 'Облака и дым',
  category: 'Фоны',
  kind: 'quad',
  description: 'Объёмные облака или дым: клубятся, текут, свет просачивается сквозь толщу',
  usesMouse: true,
  params: {
    mode: {
      type: 'select',
      label: 'Вид',
      hint: 'Облака — пухлые клубы. Дым — тонкие закрученные пряди',
      options: [
        { value: 'clouds', label: 'Облака' },
        { value: 'smoke', label: 'Дым' },
      ],
      default: 'clouds',
    },
    speed: { type: 'number', label: 'Ветер', min: 0, max: 2, step: 0.01, default: 0.35, hint: 'Скорость, с которой облака несёт ветер' },
    windAngle: { type: 'number', label: 'Направление ветра, °', min: 0, max: 360, step: 1, default: 20, hint: '0 — вправо, 90 — вверх, 180 — влево, 270 — вниз' },
    churn: { type: 'number', label: 'Клубление', min: 0, max: 2, step: 0.01, default: 0.7, hint: 'Как сильно облака меняют форму на месте, даже без ветра' },
    coverage: { type: 'number', label: 'Покрытие', min: 0, max: 1, step: 0.01, default: 0.55, hint: 'Сколько неба закрыто: 0 — чистое, 1 — сплошь' },
    scale: { type: 'number', label: 'Масштаб', min: 0.5, max: 6, step: 0.05, default: 2.2, hint: 'Больше — облака мельче и многочисленнее' },
    warp: { type: 'number', label: 'Закрученность', min: 0, max: 3, step: 0.01, default: 1.2, hint: 'Меньше — ровные формы, больше — вихри и завитки' },
    softness: { type: 'number', label: 'Мягкость краёв', min: 0.02, max: 0.6, step: 0.01, default: 0.18, hint: 'Меньше — чёткий край, больше — тает в небе' },
    detail: { type: 'number', label: 'Детали', min: 0, max: 1, step: 0.01, default: 0.6, hint: 'Мелкие клочья и завитки по краям' },
    density: { type: 'number', label: 'Плотность', min: 0.1, max: 1, step: 0.01, default: 0.9, hint: '1 — плотные облака, 0.3 — прозрачная дымка' },
    absorption: { type: 'number', label: 'Объём (поглощение света)', min: 0, max: 4, step: 0.01, default: 1.6, hint: 'Насколько толща облака темнее освещённых краёв' },
    silver: { type: 'number', label: 'Серебряная кромка', min: 0, max: 2, step: 0.01, default: 0.8, hint: 'Свечение тонких краёв, когда солнце за облаком' },
    sunX: { type: 'number', label: 'Солнце по X', min: 0, max: 1, step: 0.01, default: 0.75, hint: 'Где солнце по горизонтали — с этой стороны облака освещены' },
    sunY: { type: 'number', label: 'Солнце по Y', min: 0, max: 1, step: 0.01, default: 0.85, hint: 'Где солнце по вертикали' },
    sunGlow: { type: 'number', label: 'Сияние солнца', min: 0, max: 2, step: 0.01, default: 0.6, hint: 'Ореол солнца на небе' },
    depth: { type: 'number', label: 'Дальний слой', min: 0, max: 1, step: 0.01, default: 0.6, hint: 'Второй, дальний слой облаков — даёт глубину' },
    mouseMode: {
      type: 'select',
      label: 'Мышь',
      hint: 'Что курсор делает с облаками',
      options: [
        { value: 'part', label: 'Раздвигает' },
        { value: 'pull', label: 'Притягивает' },
        { value: 'swirl', label: 'Закручивает' },
      ],
      default: 'part',
    },
    mouseForce: { type: 'number', label: 'Сила мыши', min: 0, max: 2, step: 0.01, default: 1, hint: '0 — облака курсор не чувствуют' },
    mouseRadius: { type: 'number', label: 'Радиус мыши', min: 0.1, max: 1, step: 0.01, default: 0.35, hint: 'Насколько далеко от курсора облака его чувствуют' },
    skyTop: { type: 'color', label: 'Небо вверху', default: '#3a78d6', hint: 'Цвет неба у верхнего края (для дыма — фон)' },
    skyBottom: { type: 'color', label: 'Небо внизу', default: '#a9d3fb', hint: 'Цвет неба у нижнего края' },
    light: { type: 'color', label: 'Свет', default: '#ffffff', hint: 'Цвет освещённой стороны' },
    shadow: { type: 'color', label: 'Тень', default: '#6f7f99', hint: 'Цвет толщи и теневой стороны' },
    sun: { type: 'color', label: 'Солнце', default: '#fff1d6', hint: 'Цвет солнца и кромки' },
  },
  presets: [
    { name: 'День', values: { mode: 'clouds' } },
    { name: 'Закат', values: { skyTop: '#2b1b4f', skyBottom: '#ff8a5c', light: '#ffd2a8', shadow: '#4a2f5c', sun: '#ffb36b', sunY: 0.35, sunX: 0.6, silver: 1.4, coverage: 0.45 } },
    { name: 'Гроза', values: { skyTop: '#151a22', skyBottom: '#3c4554', light: '#a7b0bf', shadow: '#1a1f27', sun: '#c9d2e0', coverage: 0.85, speed: 0.9, absorption: 3, sunGlow: 0.1, warp: 1.6 } },
    { name: 'Дым', values: { mode: 'smoke', skyTop: '#07070b', skyBottom: '#14141c', light: '#e9e6f2', shadow: '#2a2833', sun: '#ffffff', coverage: 0.5, warp: 1.6, scale: 1.6, softness: 0.3, density: 0.8, absorption: 0.8, silver: 0.3, sunGlow: 0, depth: 0.35, windAngle: 90, speed: 0.5, mouseMode: 'swirl' } },
    { name: 'Цветной дым', values: { mode: 'smoke', skyTop: '#05030c', skyBottom: '#0d0618', light: '#ff7ac6', shadow: '#3b1d8f', sun: '#22d3ee', coverage: 0.55, warp: 1.8, scale: 1.5, softness: 0.3, density: 0.85, absorption: 1, silver: 1.2, sunGlow: 0.2, depth: 0.5, windAngle: 70, mouseMode: 'swirl' } },
    { name: 'Туман', values: { coverage: 0.8, softness: 0.5, density: 0.45, detail: 0.3, absorption: 0.4, skyTop: '#9fb3c8', skyBottom: '#dde6ee', light: '#ffffff', shadow: '#b6c2cf', speed: 0.15 } },
  ],
  fragment: /* glsl */ `
vec2 gWind;   // смещение ветром (растёт со временем)
float gT;     // время клубления

// Плотность облака в точке q (0…1). far — дальний слой: крупнее и медленнее.
// detail = false — дешёвая версия без мелких клочьев (для расчёта света).
float density(vec2 q, float far, bool fine) {
  vec2 w = gWind * mix(1.0, 0.5, far);
  vec2 p = q * mix(1.0, 0.6, far) + w;
  // Шум от шума: координаты искривлены — облако клубится.
  vec2 k = vec2(fbm(p * 0.7 + gT), fbm(p * 0.7 + vec2(5.2, 1.3) - gT));
  vec2 warp = uWarp * (k - 0.5) * 2.0;
  if (uMode > 0.5) {
    // Дым: второй виток искривления — клубы вытягиваются в завитки.
    vec2 k2 = vec2(fbm(p + warp + vec2(1.7, 9.2) + gT * 0.7), fbm(p + warp + vec2(8.3, 2.8) - gT * 0.6));
    warp += uWarp * (k2 - 0.5) * 2.5;
  }
  float n = fbm(p + warp);
  // Мелкие клочья по краям.
  if (fine) n += uDetail * 0.18 * (fbm(p * 3.5 - gT * 1.5) - 0.5);
  float threshold = 0.78 - uCoverage * 0.55;
  return smoothstep(threshold - uSoftness, threshold + uSoftness, n);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * uScale;

  float t = uTime * uSpeed * 0.12;
  float a = radians(uWindAngle);
  gWind = -vec2(cos(a), sin(a)) * t;
  gT = uTime * uChurn * 0.03;

  // Мышь: раздвигает, притягивает или закручивает.
  vec2 m = (uMouse - 0.5) * vec2(aspect, 1.0) * uScale;
  vec2 dm = p - m;
  float r = uMouseRadius * uScale;
  float near = exp(-dot(dm, dm) / (r * r)) * uMouseActive * uMouseForce;
  if (uMouseMode < 0.5) p += normalize(dm + 1e-4) * near * r * 0.8;
  else if (uMouseMode < 1.5) p -= normalize(dm + 1e-4) * near * r * 0.6;
  else p = m + rot(near * 2.5) * dm;

  // Небо и солнце.
  vec2 sunPos = (vec2(uSunX, uSunY) - 0.5) * vec2(aspect, 1.0) * uScale;
  vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, uv.y));
  float sunDist = length((uv - vec2(uSunX, uSunY)) * vec2(aspect, 1.0));
  sky += uSun * (exp(-sunDist * 7.0) * 0.6 + exp(-sunDist * 2.0) * 0.25) * uSunGlow;

  vec3 col = sky;
  // Два слоя: дальний (бледнее, позади) и ближний.
  for (int layer = 0; layer < 2; layer++) {
    float far = layer == 0 ? 1.0 : 0.0;
    if (far > 0.5 && uDepth <= 0.0) continue;
    vec2 q = p + far * vec2(3.7, 1.9);
    float d = density(q, far, true);
    if (d <= 0.001) continue;
    if (uMode > 0.5) {
      // Дым светится сам: плотнее — светлее; полупрозрачный, слои складываются.
      vec3 smoke = mix(uShadow, uLight, smoothstep(0.0, 0.9, d)) + uSun * pow(d, 4.0) * uSilver * 0.5;
      col = mix(col, smoke, d * uDensity * (far > 0.5 ? 0.5 * uDepth : 0.85));
      continue;
    }
    // Свет: шагаем к солнцу и копим плотность — чем больше, тем темнее (Бер).
    vec2 toSun = normalize(sunPos - q + 1e-4) * 0.12;
    float acc = 0.0;
    for (int s = 1; s <= 3; s++) acc += density(q + toSun * float(s), far, false);
    float lightAmt = exp(-acc * uAbsorption * 0.8);
    vec3 cloud = mix(uShadow, uLight, lightAmt);
    // Серебряная кромка: тонкие края светятся, если смотрим против солнца.
    float edge = d * (1.0 - d) * 4.0;
    cloud += uSun * edge * uSilver * 0.5 * exp(-length(q - sunPos) * 0.6);
    float alpha = d * uDensity * (far > 0.5 ? 0.6 * uDepth : 1.0);
    if (far > 0.5) cloud = mix(cloud, sky, 0.35);   // дальний слой в дымке
    col = mix(col, cloud, alpha);
  }
  fragColor = vec4(col, 1.0);
}`,
}
