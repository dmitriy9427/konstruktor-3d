import type { EffectDef } from './types'

/**
 * «Смена слайдов» — переход между фото слайдера шейдером.
 *
 * Рантайм держит две текстуры: uFrom (что было) и uTo (что будет) и прогресс
 * uProgress 0 → 1 (уже со сглаживанием). Шейдер решает, КАК смешать:
 *   жидкость — разные места переключаются в разное время (порог по шуму),
 *              картинки при этом «текут» в стороны;
 *   шторка   — фронт под углом с рваным краем и светящейся кромкой;
 *   круг     — новая картинка раскрывается кругом от курсора (или центра);
 *   пиксели  — картинка распадается на крупные пиксели и собирается снова.
 * duration и autoplay рантайм читает сам: длительность перехода и автопрокрутка.
 */
export const slides: EffectDef = {
  id: 'slides',
  name: 'Смена слайдов',
  category: 'Переходы',
  kind: 'slides',
  description: 'Фото слайдера сменяются жидкостью, шторкой, кругом или пикселями',
  usesMouse: true,
  params: {
    mode: {
      type: 'select',
      label: 'Переход',
      hint: 'Вид перехода между слайдами',
      options: [
        { value: 'liquid', label: 'Жидкость' },
        { value: 'wipe', label: 'Шторка' },
        { value: 'circle', label: 'Круг' },
        { value: 'pixels', label: 'Пиксели' },
      ],
      default: 'liquid',
    },
    duration: { type: 'number', label: 'Длительность, с', min: 0.3, max: 3, step: 0.05, default: 1.2, hint: 'Сколько секунд длится смена слайда' },
    intensity: { type: 'number', label: 'Сила искажения', min: 0, max: 1, step: 0.01, default: 0.5, hint: 'Сила искажения во время перехода' },
    softness: { type: 'number', label: 'Мягкость края', min: 0.01, max: 0.5, step: 0.01, default: 0.15, hint: 'Мягкость границы между старым и новым слайдом' },
    scale: { type: 'number', label: 'Масштаб шума', min: 0.5, max: 8, step: 0.1, default: 3, hint: 'Размер узора шума в переходе' },
    angle: { type: 'number', when: { mode: ['wipe'] }, label: 'Угол шторки, °', min: 0, max: 360, step: 1, default: 20, hint: 'Направление, с которого идёт шторка' },
    edge: { type: 'color', when: { mode: ['wipe', 'circle'] }, label: 'Цвет кромки', default: '#ffd27a', hint: 'Цвет светящейся кромки перехода' },
    autoplay: { type: 'number', label: 'Автопрокрутка, с', min: 0, max: 10, step: 0.5, default: 0, hint: '0 — только по кнопкам' },
  },
  presets: [
    { name: 'Жидкость', values: { mode: 'liquid', intensity: 0.5, softness: 0.15 } },
    { name: 'Огненная шторка', values: { mode: 'wipe', edge: '#ff7a3d', softness: 0.06, intensity: 0.6, angle: 20 } },
    { name: 'Портал', values: { mode: 'circle', edge: '#22d3ee', softness: 0.05, intensity: 0.8 } },
    { name: 'Ретро', values: { mode: 'pixels', duration: 0.9 } },
  ],
  fragment: /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float p = uProgress;
  float n = fbm(uv * vec2(aspect, 1.0) * uScale);
  vec3 col;

  if (uMode < 0.5) {
    // Жидкость: место переключается, когда прогресс перешёл его «порог» n.
    float m = smoothstep(n - uSoftness, n + uSoftness, p * (1.0 + 2.0 * uSoftness) - uSoftness);
    vec2 flow = (vec2(fbm(uv * uScale + 3.1), fbm(uv * uScale + 7.7)) - 0.5) * uIntensity * 0.35 * uDirection;
    float wave = sin(p * 3.14159);
    col = mix(fromAt(uv + flow * wave * m), toAt(uv - flow * wave * (1.0 - m)), m);
  } else if (uMode < 1.5) {
    // Шторка: координата вдоль направления + рваность.
    float a = radians(uAngle);
    vec2 dir = vec2(cos(a), sin(a)) * uDirection;
    float x = dot((uv - 0.5) * vec2(aspect, 1.0), dir) / (abs(dir.x) * aspect + abs(dir.y)) + 0.5;
    x += (n - 0.5) * uIntensity * 0.4;
    float front = p * (1.0 + 2.0 * uSoftness + uIntensity * 0.4) - uSoftness - uIntensity * 0.2;
    float m = smoothstep(x - uSoftness, x + uSoftness, front);
    col = mix(fromAt(uv), toAt(uv), m);
    // Кромка — узкая светящаяся полоса прямо по фронту.
    float glow = exp(-abs(front - x) / max(uSoftness * 0.35, 0.004));
    col += uEdge * glow * step(0.001, p) * step(p, 0.999);
  } else if (uMode < 2.5) {
    // Круг: от курсора, если он над слайдером, иначе от центра.
    vec2 c = mix(vec2(0.5), uMouse, uMouseActive);
    float d = length((uv - c) * vec2(aspect, 1.0)) + (n - 0.5) * uIntensity * 0.15;
    float r = p * (length(vec2(aspect, 1.0)) + uSoftness * 2.0 + uIntensity * 0.1);
    float m = 1.0 - smoothstep(r - uSoftness, r, d);
    // Рябь возле края круга сдвигает старую картинку.
    vec2 push = normalize(uv - c + 1e-5) * exp(-abs(d - r) * 12.0) * uIntensity * 0.05;
    col = mix(fromAt(uv + push), toAt(uv), m);
    col += uEdge * exp(-abs(d - r) * 60.0) * step(0.001, p) * step(p, 0.999);
  } else {
    // Пиксели: размер клетки растёт к середине перехода и снова падает.
    float cells = mix(200.0, 12.0, sin(p * 3.14159));
    vec2 grid = vec2(cells * aspect, cells);
    // Вне перехода — без клеток, картинка чёткая.
    vec2 q = mix(uv, (floor(uv * grid) + 0.5) / grid, step(0.001, p) * step(p, 0.999));
    float m = smoothstep(0.35, 0.65, p + (hash(floor(uv * grid)) - 0.5) * 0.3);
    col = mix(fromAt(q), toAt(q), m);
  }
  fragColor = vec4(col, 1.0);
}`,
}
