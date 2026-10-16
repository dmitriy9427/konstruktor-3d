import type { EffectDef } from './types'

/**
 * «Облака» — небо с плывущими облаками.
 *
 * Плотность облака — fbm (несколько слоёв шума). «Покрытие» сдвигает порог:
 * больше покрытие — больше облаков. Облако светлее сверху (там солнце) и
 * темнее снизу — объём без настоящего освещения. Курсор «раздвигает» облака.
 */
export const clouds: EffectDef = {
  id: 'clouds',
  name: 'Облака',
  category: 'Фоны',
  kind: 'quad',
  description: 'Небо с облаками, которые расходятся под курсором',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Ветер', min: 0, max: 2, step: 0.01, default: 0.3, hint: 'Скорость ветра, который несёт облака' },
    coverage: { type: 'number', label: 'Покрытие', min: 0, max: 1, step: 0.01, default: 0.6, hint: 'Сколько неба закрыто облаками: 0 — чистое небо, 1 — сплошная облачность' },
    softness: { type: 'number', label: 'Мягкость', min: 0.02, max: 0.8, step: 0.01, default: 0.16, hint: 'Ширина перехода от неба к облаку: меньше — плотнее и чётче, больше — как лёгкий туман' },
    detail: { type: 'number', label: 'Детали', min: 0, max: 1, step: 0.01, default: 0.55, hint: 'Мелкие завитки и неоднородность внутри облаков' },
    warp: { type: 'number', label: 'Закрученность', min: 0, max: 1.5, step: 0.01, default: 0.5, hint: 'Меньше — ровные облака, больше — клубящиеся' },
    haze: { type: 'number', label: 'Плотность', min: 0.2, max: 1, step: 0.01, default: 0.92, hint: 'Непрозрачность облаков: 1 — почти плотные, 0.3 — полупрозрачная дымка' },
    contrast: { type: 'number', label: 'Контраст объёма', min: 0, max: 2, step: 0.01, default: 1.2, hint: 'Разница между освещённой верхушкой и тенью' },
    scale: { type: 'number', label: 'Масштаб', min: 0.5, max: 6, step: 0.05, default: 2.6, hint: 'Размер облаков: больше значение — мельче и многочисленнее' },
    skyTop: { type: 'color', label: 'Небо вверху', default: '#2f6fd6', hint: 'Цвет неба у верхнего края' },
    skyBottom: { type: 'color', label: 'Небо внизу', default: '#9fd0ff', hint: 'Цвет неба у горизонта' },
    light: { type: 'color', label: 'Свет облака', default: '#ffffff', hint: 'Цвет освещённой солнцем стороны облака' },
    shadow: { type: 'color', label: 'Тень облака', default: '#8a9bb8', hint: 'Цвет теневой стороны облака' },
  },
  presets: [
    { name: 'День', values: { skyTop: '#2f6fd6', skyBottom: '#9fd0ff', light: '#ffffff', shadow: '#8a9bb8' } },
    { name: 'Закат', values: { skyTop: '#2b1b4f', skyBottom: '#ff8a5c', light: '#ffd2a8', shadow: '#5a3d6b', coverage: 0.45 } },
    { name: 'Гроза', values: { skyTop: '#1b2028', skyBottom: '#4a5363', light: '#9aa4b5', shadow: '#20252e', coverage: 0.85, speed: 0.8 } },
  ],
  fragment: /* glsl */ `
// Плотность: крупная форма (fbm с закруткой) + мелкие завитки поверх.
float dens(vec2 q, vec2 drift) {
  float d = fbm(q + drift + uWarp * fbm(q * 0.6 - drift));
  return d + uDetail * 0.25 * (fbm(q * 3.0 + drift * 2.0) - 0.5);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * uScale;
  float t = uTime * uSpeed * 0.15;
  vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, uv.y));

  vec2 drift = vec2(t, t * 0.2);
  float d = dens(p, drift);
  // Курсор разгоняет облака: снижаем плотность рядом с ним.
  vec2 m = (uMouse - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
  float push = uMouseActive * 0.35 * exp(-length(p - m) * 1.6);
  d -= push;

  float threshold = 0.75 - uCoverage * 0.5;
  float w = uSoftness * 0.5;

  // Дальний слой: крупнее и медленнее, полупрозрачный — создаёт глубину, как второй слой туманности.
  float d2 = fbm(p * 0.65 + drift * 0.55 + vec2(5.0, 3.0)) - push;
  float a2 = smoothstep(threshold - 0.05 - w, threshold + 0.2 + w, d2) * 0.55 * uHaze;
  vec3 far = mix(uShadow, uLight, 0.55);
  vec3 col = mix(sky, far, a2);

  // Основной слой: плотность нарастает плавно (как у туманности), а не обрывается по линии.
  float a = smoothstep(threshold - w, threshold + w * 1.6, d) * uHaze;
  // Свет и тень: солнце вверху слева. Если в сторону солнца плотность ниже — мы на освещённой стороне.
  vec2 sun = normalize(vec2(-0.45, 0.9));
  float toward = (dens(p + sun * 0.04, drift) + dens(p + sun * 0.1, drift)) * 0.5;
  float lit = clamp(0.6 + (d - toward) * 4.5 * uContrast, 0.0, 1.0);
  vec3 cloud = mix(uShadow, uLight, lit);
  // Толща темнее у основания, края светлее — воздушно, без «серой каши».
  float core = smoothstep(threshold, threshold + 0.3, d);
  cloud = mix(cloud, uShadow, core * 0.22 * uContrast);
  cloud += uLight * 0.12 * (1.0 - core);
  col = mix(col, cloud, a);
  fragColor = vec4(col, 1.0);
}`,
}
