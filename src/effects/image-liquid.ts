import type { EffectDef } from './types'

/**
 * «Жидкая смена при наведении» — навели на фото, и оно перетекает во второе.
 *
 * Рантайм (слайды + hoverSwap) держит две текстуры и прогресс p: пока курсор
 * над картинкой, p плавно едет к 1, ушёл — обратно к 0. Шейдер сдвигает
 * координаты первой картинки полем смещения на p, второй — на (1 − p) в
 * обратную сторону, и смешивает: на середине обе «растекаются», к концу
 * вторая собирается чёткой. Поле смещения:
 *   жидкость — шум (fbm), как разводы;
 *   капля    — круги от курсора;
 *   полосы   — сдвиг полосами (как помехи).
 */
export const imageLiquid: EffectDef = {
  id: 'image-liquid',
  name: 'Жидкая смена при наведении',
  category: 'Изображения',
  kind: 'slides',
  hoverSwap: true,
  description: 'Наведите на фото — оно перетекает во второе',
  usesMouse: true,
  params: {
    mode: {
      type: 'select',
      label: 'Как перетекает',
      options: [
        { value: 'liquid', label: 'Жидкость' },
        { value: 'drop', label: 'Капля' },
        { value: 'bands', label: 'Полосы' },
      ],
      default: 'liquid',
    },
    duration: { type: 'number', label: 'Длительность, с', min: 0.1, max: 3, step: 0.05, default: 0.8 },
    intensity: { type: 'number', label: 'Сила', min: 0, max: 2, step: 0.01, default: 0.8, hint: 'Насколько сильно картинки растекаются на середине' },
    scale: { type: 'number', label: 'Масштаб узора', min: 0.5, max: 10, step: 0.1, default: 3 },
    angle: { type: 'number', label: 'Направление, °', min: 0, max: 360, step: 1, default: 30, hint: 'Куда растекается (для «Жидкость» и «Полосы»)', when: { mode: ['liquid', 'bands'] } },
    zoom: { type: 'number', label: 'Приближение второй', min: 1, max: 1.3, step: 0.005, default: 1.06, hint: 'Вторая картинка проявляется чуть увеличенной и «садится» на место' },
  },
  presets: [
    { name: 'Жидкость', values: { mode: 'liquid' } },
    { name: 'Капля', values: { mode: 'drop', intensity: 1, duration: 1 } },
    { name: 'Помехи', values: { mode: 'bands', intensity: 1.2, scale: 8, duration: 0.5 } },
  ],
  fragment: /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float p = smoothstep(0.0, 1.0, uProgress);
  vec2 dir = vec2(cos(radians(uAngle)), sin(radians(uAngle)));
  vec2 disp;
  if (uMode < 0.5) {
    disp = (vec2(fbm(uv * uScale), fbm(uv * uScale + 5.3)) - 0.5) * 2.0 + dir * 0.6;
  } else if (uMode < 1.5) {
    vec2 d = (uv - uMouse) * vec2(aspect, 1.0);
    float r = length(d);
    disp = normalize(d + 1e-5) * sin(r * uScale * 6.0 - uTime * 4.0) * 0.8;
  } else {
    float band = floor(dot(uv, vec2(-dir.y, dir.x)) * uScale * 4.0);
    disp = dir * (hash(vec2(band, 1.0)) - 0.5) * 2.0;
  }
  float s = uIntensity * 0.3;
  vec2 a = uv + disp * s * p;
  vec2 b = (uv - 0.5) / mix(uZoom, 1.0, p) + 0.5 - disp * s * (1.0 - p);
  vec3 col = mix(fromAt(a), toAt(b), p);
  fragColor = vec4(col, 1.0);
}`,
}
