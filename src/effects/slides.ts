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
        { value: 'zoom', label: 'Зум' },
        { value: 'glitch', label: 'Глитч' },
        { value: 'ripple', label: 'Волна' },
        { value: 'displace', label: 'Жидкое смещение' },
        { value: 'blob', label: 'Капля' },
      ],
      default: 'liquid',
    },
    duration: { type: 'number', label: 'Длительность, с', min: 0.3, max: 3, step: 0.05, default: 1.2, hint: 'Сколько секунд длится смена слайда' },
    intensity: { type: 'number', label: 'Сила искажения', min: 0, max: 1, step: 0.01, default: 0.5, hint: 'Сила искажения во время перехода' },
    softness: { type: 'number', label: 'Мягкость края', min: 0.01, max: 0.5, step: 0.01, default: 0.15, hint: 'Мягкость границы между старым и новым слайдом' },
    scale: { type: 'number', label: 'Масштаб шума', min: 0.5, max: 8, step: 0.1, default: 3, hint: 'Размер узора шума в переходе' },
    angle: { type: 'number', when: { mode: ['wipe', 'displace'] }, label: 'Угол шторки, °', min: 0, max: 360, step: 1, default: 20, hint: 'Направление, с которого идёт шторка' },
    edge: { type: 'color', when: { mode: ['wipe', 'circle', 'ripple', 'blob'] }, label: 'Цвет кромки', default: '#ffd27a', hint: 'Цвет светящейся кромки перехода' },
    autoplay: { type: 'number', label: 'Автопрокрутка, с', min: 0, max: 10, step: 0.5, default: 0, hint: '0 — только по кнопкам' },
  },
  presets: [
    { name: 'Жидкость', values: { mode: 'liquid', intensity: 0.5, softness: 0.15 } },
    { name: 'Огненная шторка', values: { mode: 'wipe', edge: '#ff7a3d', softness: 0.06, intensity: 0.6, angle: 20 } },
    { name: 'Портал', values: { mode: 'circle', edge: '#22d3ee', softness: 0.05, intensity: 0.8 } },
    { name: 'Ретро', values: { mode: 'pixels', duration: 0.9 } },
    { name: 'Зум', values: { mode: 'zoom', duration: 1, intensity: 0.8 } },
    { name: 'Глитч', values: { mode: 'glitch', duration: 0.7, intensity: 1 } },
    { name: 'Жидкое смещение', values: { mode: 'displace', duration: 1.4, intensity: 0.8, scale: 2.5 } },
    { name: 'Капля', values: { mode: 'blob', duration: 1.3, intensity: 1, softness: 0.08, edge: '#ffffff' } },
    { name: 'Волна', values: { mode: 'ripple', duration: 1.6, intensity: 0.8, softness: 0.1 } },
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
  } else if (uMode < 3.5) {
    // Пиксели: размер клетки растёт к середине перехода и снова падает.
    float cells = mix(200.0, 12.0, sin(p * 3.14159));
    vec2 grid = vec2(cells * aspect, cells);
    // Вне перехода — без клеток, картинка чёткая.
    vec2 q = mix(uv, (floor(uv * grid) + 0.5) / grid, step(0.001, p) * step(p, 0.999));
    float m = smoothstep(0.35, 0.65, p + (hash(floor(uv * grid)) - 0.5) * 0.3);
    col = mix(fromAt(q), toAt(q), m);
  } else if (uMode < 4.5) {
    // Зум: старый слайд улетает на нас с размытием, новый выезжает из глубины.
    vec2 c = uv - 0.5;
    vec3 a = vec3(0.0), b = vec3(0.0);
    float blur = sin(p * 3.14159) * uIntensity * 0.08;
    for (int i = 0; i < 8; i++) {
      float k = float(i) / 7.0;
      a += fromAt(0.5 + c / (1.0 + p * 0.6 + blur * k));
      b += toAt(0.5 + c * (1.0 + (1.0 - p) * 0.5) / (1.0 + blur * k));
    }
    col = mix(a / 8.0, b / 8.0, smoothstep(0.3, 0.7, p));
  } else if (uMode < 5.5) {
    // Глитч: полосы сдвигаются рывками, каналы расходятся, кадр переключается неровно.
    float power = sin(p * 3.14159) * uIntensity;
    float row = floor(uv.y * mix(8.0, 40.0, hash(vec2(floor(p * 12.0), 3.0))));
    float shift = (hash(vec2(row, floor(p * 18.0))) - 0.5) * 0.25 * power * step(0.5, hash(vec2(row, 7.0 + floor(p * 9.0))));
    vec2 q = uv + vec2(shift, 0.0);
    float pick = step(hash(vec2(row, floor(p * 10.0))) * 0.6 + 0.2, p);
    vec2 split = vec2(0.012 * power, 0.0);
    col = pick > 0.5
      ? vec3(toAt(q + split).r, toAt(q).g, toAt(q - split).b)
      : vec3(fromAt(q + split).r, fromAt(q).g, fromAt(q - split).b);
  } else if (uMode < 6.5) {
    // Волна: концентрические волны из центра (или курсора) несут новый слайд.
    vec2 c = mix(vec2(0.5), uMouse, uMouseActive);
    vec2 d = (uv - c) * vec2(aspect, 1.0);
    float r = length(d);
    float front = p * 1.6;
    float wave = sin((r - front) * 45.0) * exp(-abs(r - front) * 6.0) * uIntensity * 0.07;
    vec2 off = normalize(d + 1e-5) * wave / vec2(aspect, 1.0);
    float m = smoothstep(front + uSoftness * 0.3, front - uSoftness * 0.3, r);
    col = mix(fromAt(uv + off), toAt(uv + off), m);
    col += uEdge * exp(-abs(r - front) * 60.0) * 0.4 * step(0.001, p) * step(p, 0.999);
  } else if (uMode < 7.5) {
    // Жидкое смещение: карта смещения из шума; старый слайд «стекает» по ней в
    // одну сторону, новый «натекает» с другой — как в классических liquid-слайдерах.
    float n = fbm(uv * uScale + vec2(uTime * 0.05, 0.0));
    vec2 dir = vec2(cos(radians(uAngle)), sin(radians(uAngle))) * uDirection;
    float k = uIntensity * 0.6;
    vec2 a = uv + dir * n * p * k;
    vec2 b = uv - dir * n * (1.0 - p) * k;
    col = mix(fromAt(a), toAt(b), smoothstep(0.0, 1.0, p));
  } else {
    // Капля: новый слайд растёт каплей с колышущимся краем от курсора (или центра).
    vec2 c = mix(vec2(0.5), uMouse, uMouseActive);
    vec2 d = (uv - c) * vec2(aspect, 1.0);
    float a = atan(d.y, d.x);
    float wob = (sin(a * 5.0 + uTime * 2.0) * 0.5 + sin(a * 3.0 - uTime * 1.3) * 0.5) * 0.06 * uIntensity * sin(p * 3.14159);
    float r = p * (length(vec2(aspect, 1.0)) + 0.2) + wob;
    float m = smoothstep(r + uSoftness * 0.2, r - uSoftness * 0.2, length(d));
    // Внутри у края — линза: картинка выпячивается.
    vec2 lens = d * smoothstep(r, r - 0.15, length(d)) * 0.08 * uIntensity * sin(p * 3.14159);
    col = mix(fromAt(uv), toAt(uv - lens / vec2(aspect, 1.0)), m);
    col += uEdge * exp(-abs(length(d) - r) * 70.0) * 0.5 * step(0.001, p) * step(p, 0.999);
  }
  fragColor = vec4(col, 1.0);
}`,
}
