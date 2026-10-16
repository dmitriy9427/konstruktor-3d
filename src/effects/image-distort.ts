import type { EffectDef } from './types'

/**
 * «Плывущая картинка» — фото искажается при наведении.
 *
 * Три режима в одном шейдере:
 *   - волна (displacement): картинку сдвигает поле шума;
 *   - RGB-сдвиг: красный и синий каналы расходятся от курсора;
 *   - рябь: круги расходятся от курсора, как по воде.
 * Сила эффекта умножается на uHover — плавно 0 → 1 при наведении и обратно,
 * поэтому без курсора фото выглядит обычным.
 */
export const imageDistort: EffectDef = {
  id: 'image-distort',
  name: 'Плывущая картинка',
  category: 'Изображения',
  kind: 'image',
  description: 'Фото «плывёт», расслаивается или идёт рябью при наведении',
  usesMouse: true,
  params: {
    mode: {
      type: 'select',
      label: 'Режим',
      hint: 'Вид искажения: волна, RGB-сдвиг или рябь',
      options: [
        { value: 'wave', label: 'Волна' },
        { value: 'rgb', label: 'RGB-сдвиг' },
        { value: 'ripple', label: 'Рябь' },
      ],
      default: 'wave',
    },
    strength: { type: 'number', label: 'Сила', min: 0, max: 1, step: 0.01, default: 0.45, hint: 'Сила искажения' },
    radius: { type: 'number', label: 'Радиус', min: 0.05, max: 1, step: 0.01, default: 0.35, hint: 'Радиус действия вокруг курсора' },
    speed: { type: 'number', label: 'Скорость', min: 0, max: 3, step: 0.01, default: 1, hint: 'Скорость анимации искажения' },
    zoom: { type: 'number', label: 'Приближение', min: 1, max: 1.3, step: 0.005, default: 1.06, hint: 'Приближение картинки; нужно, чтобы по краям не было пустоты при искажении' },
    always: { type: 'boolean', label: 'Всегда, без наведения', default: false, hint: 'Включено — картинка плывёт сама, выключено — только при наведении курсора' },
  },
  presets: [
    { name: 'Жидкость', values: { mode: 'wave', strength: 0.5 } },
    { name: 'Глитч', values: { mode: 'rgb', strength: 0.8, radius: 0.6 } },
    { name: 'Капля', values: { mode: 'ripple', strength: 0.6, radius: 0.5, speed: 1.4 } },
  ],
  fragment: /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 base = coverUv(uv, uResolution, uImageRes);
  float power = uStrength * max(uHover, uAlways);
  float aspect = uResolution.x / uResolution.y;
  vec2 d = (uv - uMouse) * vec2(aspect, 1.0);
  float near = smoothstep(uRadius, 0.0, length(d)) * mix(1.0, 0.6, uAlways);
  if (uAlways > 0.5) near = max(near, 0.35);
  float t = uTime * uSpeed;
  // Приближение при наведении — картинка «оживает».
  vec2 st = (base - 0.5) / mix(1.0, uZoom, max(uHover, uAlways)) + 0.5;

  vec3 col;
  if (uMode < 0.5) {
    vec2 w = vec2(fbm(st * 3.0 + t * 0.4), fbm(st * 3.0 - t * 0.4 + 5.0)) - 0.5;
    col = texture(uImage, st + w * 0.12 * power * near).rgb;
  } else if (uMode < 1.5) {
    vec2 dir = normalize(d + 1e-5) * 0.03 * power * near;
    col = vec3(texture(uImage, st + dir).r, texture(uImage, st).g, texture(uImage, st - dir).b);
  } else {
    float dist = length(d);
    float wave = sin(dist * 60.0 - t * 6.0) * exp(-dist * 5.0);
    col = texture(uImage, st + normalize(d + 1e-5) * wave * 0.02 * power * near / aspect).rgb;
  }
  fragColor = vec4(col, 1.0);
}`,
}
