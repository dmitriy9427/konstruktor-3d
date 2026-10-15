import type { EffectDef } from './types'

/**
 * «Волны» — водная гладь до горизонта.
 *
 * Камера висит над плоскостью и смотрит чуть вниз: для каждого пикселя
 * находим, в какую точку воды он «смотрит» (луч пересекает плоскость).
 * Высота воды в точке — сумма волн разного направления; форма волны
 * exp(sin − 1): острый гребень, пологая впадина — как у настоящей.
 * По наклону воды (нормали) считаем отражение неба (Френель: под острым
 * углом вода — зеркало, под прямым — прозрачная) и блик солнца.
 * Вдали — дымка, чтобы мелкая рябь не рябила пикселями.
 */
export const waves: EffectDef = {
  id: 'waves',
  name: 'Волны',
  category: 'Фоны',
  kind: 'quad',
  description: 'Освещённая поверхность воды, рябь от курсора',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 3, step: 0.01, default: 0.8 },
    frequency: { type: 'number', label: 'Частота', min: 1, max: 20, step: 0.1, default: 5 },
    amplitude: { type: 'number', label: 'Высота', min: 0, max: 2, step: 0.01, default: 0.7 },
    choppy: { type: 'number', label: 'Неровность', min: 0, max: 1, step: 0.01, default: 0.45 },
    light: { type: 'number', label: 'Солнце (угол)', min: 0, max: 3.14, step: 0.01, default: 1.75 },
    shine: { type: 'number', label: 'Блики', min: 0, max: 2, step: 0.01, default: 1 },
    deep: { type: 'color', label: 'Глубина', default: '#04121f' },
    shallow: { type: 'color', label: 'Мель', default: '#1f8fb8' },
    highlight: { type: 'color', label: 'Блик', default: '#e8fbff' },
  },
  presets: [
    { name: 'Море', values: { deep: '#04121f', shallow: '#1f8fb8', highlight: '#e8fbff', frequency: 5, choppy: 0.45 } },
    { name: 'Закат', values: { deep: '#12061f', shallow: '#7a2f6b', highlight: '#ffc27a', frequency: 4, choppy: 0.25, speed: 0.5 } },
    { name: 'Ночь', values: { deep: '#01040b', shallow: '#0d2340', highlight: '#cfe3ff', frequency: 6, choppy: 0.6, shine: 1.4, light: 1.57 } },
  ],
  fragment: /* glsl */ `
float height(vec2 x, float t, vec2 mouseWorld) {
  float h = 0.0, sum = 0.0, amp = 1.0;
  float f = uFrequency * 0.22;
  vec2 dir = vec2(1.0, 0.25);
  for (int i = 0; i < 6; i++) {
    float phase = dot(x, normalize(dir)) * f + t * sqrt(f) * 1.6;
    // Неровность: больше — острее гребни.
    h += amp * exp((sin(phase) - 1.0) * (1.0 + uChoppy * 2.5));
    sum += amp;
    amp *= 0.62;
    f *= 1.55;
    dir = rot(1.27) * dir;
  }
  h /= sum;
  // Круги от курсора.
  float d = length(x - mouseWorld);
  h += uMouseActive * sin(d * 9.0 - t * 5.0) * exp(-d * 1.6) * 0.18;
  return h;
}

// Луч камеры для точки экрана: камера на высоте 1.2, смотрит вниз-вперёд.
vec3 rayDir(vec2 p) { return normalize(vec3(p.x, p.y - 0.58, 1.0)); }

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;
  vec3 ro = vec3(0.0, 1.2, 0.0);
  vec3 rd = rayDir(p);
  float dist = ro.y / -rd.y;
  vec2 x = ro.xz + rd.xz * dist;

  vec3 rdm = rayDir((uMouse - 0.5) * vec2(uResolution.x / uResolution.y, 1.0));
  vec2 mouseWorld = ro.xz + rdm.xz * (ro.y / -rdm.y);

  // Нормаль по разнице высот; шаг растёт с расстоянием — вдали без шума.
  float e = 0.01 + dist * 0.004;
  float hs = uAmplitude * 0.55;
  float h = height(x, t, mouseWorld);
  vec3 n = normalize(vec3(
    (height(x - vec2(e, 0.0), t, mouseWorld) - height(x + vec2(e, 0.0), t, mouseWorld)) * hs,
    2.0 * e,
    (height(x - vec2(0.0, e), t, mouseWorld) - height(x + vec2(0.0, e), t, mouseWorld)) * hs));

  vec3 L = normalize(vec3(cos(uLight), 0.32, abs(sin(uLight)) + 0.2));
  float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  vec3 sky = mix(uShallow, uHighlight, 0.45);
  vec3 water = mix(uDeep, uShallow, 0.15 + 0.55 * h + 0.3 * max(dot(n, L), 0.0));
  vec3 col = mix(water, sky, fresnel);
  float spec = pow(max(dot(reflect(rd, n), L), 0.0), 140.0);
  col += uHighlight * spec * uShine * 1.8;

  float fog = smoothstep(3.0, 26.0, dist);
  vec3 haze = mix(uShallow, uHighlight, 0.3) * 0.75;
  col = mix(col, haze, fog);
  fragColor = vec4(col, 1.0);
}`,
}
