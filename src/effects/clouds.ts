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
    speed: { type: 'number', label: 'Ветер', min: 0, max: 2, step: 0.01, default: 0.3 },
    coverage: { type: 'number', label: 'Покрытие', min: 0, max: 1, step: 0.01, default: 0.6 },
    softness: { type: 'number', label: 'Мягкость', min: 0.02, max: 0.5, step: 0.01, default: 0.09 },
    scale: { type: 'number', label: 'Масштаб', min: 0.5, max: 5, step: 0.05, default: 1.8 },
    skyTop: { type: 'color', label: 'Небо вверху', default: '#2f6fd6' },
    skyBottom: { type: 'color', label: 'Небо внизу', default: '#9fd0ff' },
    light: { type: 'color', label: 'Свет облака', default: '#ffffff' },
    shadow: { type: 'color', label: 'Тень облака', default: '#8a9bb8' },
  },
  presets: [
    { name: 'День', values: { skyTop: '#2f6fd6', skyBottom: '#9fd0ff', light: '#ffffff', shadow: '#8a9bb8' } },
    { name: 'Закат', values: { skyTop: '#2b1b4f', skyBottom: '#ff8a5c', light: '#ffd2a8', shadow: '#5a3d6b', coverage: 0.45 } },
    { name: 'Гроза', values: { skyTop: '#1b2028', skyBottom: '#4a5363', light: '#9aa4b5', shadow: '#20252e', coverage: 0.85, speed: 0.8 } },
  ],
  fragment: /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * uScale;
  float t = uTime * uSpeed * 0.15;

  vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.0, 1.0, uv.y));

  vec2 drift = vec2(t, t * 0.2);
  float d = fbm(p + drift + 0.5 * fbm(p * 0.6 - drift));
  // Курсор разгоняет облака: снижаем плотность рядом с ним.
  vec2 m = (uMouse - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
  d -= uMouseActive * 0.35 * exp(-length(p - m) * 1.6);

  float threshold = 0.75 - uCoverage * 0.5;
  float a = smoothstep(threshold - uSoftness, threshold + uSoftness, d);
  // Объём: если выше по экрану облако тоньше — мы у его верхушки, её освещает солнце.
  float above = fbm(p + drift + vec2(0.0, 0.1) + 0.5 * fbm(p * 0.6 - drift));
  float lit = clamp(0.55 + (d - above) * 6.0, 0.0, 1.0);
  vec3 cloud = mix(uShadow, uLight, lit);
  // Толща облака темнее, края светятся («серебряная кромка»).
  cloud = mix(cloud, uShadow, smoothstep(threshold + 0.05, threshold + 0.35, d) * 0.45);
  cloud += uLight * 0.25 * (1.0 - smoothstep(0.0, 0.6, a)) * a;
  fragColor = vec4(mix(sky, cloud, a), 1.0);
}`,
}
