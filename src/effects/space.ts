import type { EffectDef } from './types'

/**
 * «Космос» — звёзды с параллаксом, живая туманность, метеоры и созвездия.
 *
 * Звёзды — сетка ячеек: в каждой одна звезда в случайной точке (hash2), часть
 * ячеек пустая. Три слоя разного масштаба едут с разной скоростью — глубина.
 *
 * Туманность — шум от шума, который течёт («Дрейф туманности»); форма —
 * облако, волокна (хребты шума) или кольцо (шум, собранный вокруг центра).
 *
 * Метеоры — по слотам времени: в каждом слоте свой метеор со случайной
 * точкой старта и своим моментом. Голова — яркая точка, хвост — отрезок за
 * ней, гаснет к концу; «Огненный шар» — крупная голова с ореолом,
 * «Искры» — хвост рассыпается на точки.
 *
 * Созвездия — точки и линии между ними. Готовые зашиты в шейдер; своё —
 * параметр «Своё созвездие» (точки рисуются кликом прямо в превью Студии).
 * Вид: линии сразу, линии прорисовываются по очереди или пульсируют.
 */

/** Готовые созвездия: точки в долях кадра (x, y вверх) и «соединить с предыдущей». */
const CONSTELLATIONS = /* glsl */ `
// Большая Медведица (ковш), Кассиопея, Орион, Лебедь, Лев — упрощённые очертания.
const vec3 C_URSA[7] = vec3[7](vec3(0.08,0.80,0.0), vec3(0.14,0.83,1.0), vec3(0.20,0.82,1.0), vec3(0.25,0.78,1.0), vec3(0.26,0.70,1.0), vec3(0.34,0.68,1.0), vec3(0.35,0.77,1.0));
const vec3 C_CASS[5] = vec3[5](vec3(0.62,0.88,0.0), vec3(0.67,0.80,1.0), vec3(0.72,0.86,1.0), vec3(0.77,0.79,1.0), vec3(0.83,0.86,1.0));
const vec3 C_ORION[9] = vec3[9](vec3(0.44,0.48,0.0), vec3(0.50,0.38,1.0), vec3(0.47,0.32,1.0), vec3(0.50,0.30,1.0), vec3(0.53,0.28,1.0), vec3(0.50,0.38,0.0), vec3(0.57,0.47,1.0), vec3(0.53,0.28,0.0), vec3(0.56,0.18,1.0));
const vec3 C_CYGNUS[6] = vec3[6](vec3(0.80,0.58,0.0), vec3(0.83,0.48,1.0), vec3(0.86,0.38,1.0), vec3(0.76,0.47,0.0), vec3(0.83,0.48,1.0), vec3(0.90,0.50,1.0));
const vec3 C_LEO[7] = vec3[7](vec3(0.13,0.40,0.0), vec3(0.16,0.46,1.0), vec3(0.21,0.47,1.0), vec3(0.23,0.41,1.0), vec3(0.19,0.36,1.0), vec3(0.29,0.31,1.0), vec3(0.19,0.36,1.0));
`

export const space: EffectDef = {
  id: 'space',
  name: 'Космос',
  category: 'Фоны',
  kind: 'quad',
  description: 'Звёзды, живая туманность, метеоры с хвостом и созвездия — свои тоже',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Полёт', min: 0, max: 3, step: 0.01, default: 0.4, hint: 'Скорость «полёта» сквозь звёзды' },
    flightAngle: { type: 'number', label: 'Направление полёта, °', min: 0, max: 360, step: 1, default: 0, hint: 'Куда плывут звёзды' },
    density: { type: 'number', label: 'Плотность звёзд', min: 0.05, max: 1, step: 0.01, default: 0.45, hint: 'Сколько звёзд' },
    starSize: { type: 'number', label: 'Размер звёзд', min: 0.3, max: 3, step: 0.01, default: 1, hint: 'Размер всех звёзд' },
    twinkle: { type: 'number', label: 'Мерцание', min: 0, max: 1, step: 0.01, default: 0.6, hint: 'Сила мерцания звёзд' },
    parallax: { type: 'number', label: 'Параллакс мыши', min: 0, max: 1, step: 0.01, default: 0.4, hint: 'Насколько слои звёзд смещаются за курсором — ближние сильнее' },

    nebula: { type: 'number', label: 'Туманность', min: 0, max: 1.5, step: 0.01, default: 0.7, hint: 'Яркость туманности' },
    nebulaShape: {
      type: 'select',
      label: 'Форма туманности',
      hint: 'Облако — мягкие клубы, Волокна — тонкие светящиеся нити, Кольцо — туманность вокруг центра',
      options: [
        { value: 'cloud', label: 'Облако' },
        { value: 'filaments', label: 'Волокна' },
        { value: 'ring', label: 'Кольцо' },
      ],
      default: 'cloud',
    },
    nebulaDrift: { type: 'number', label: 'Дрейф туманности', min: 0, max: 2, step: 0.01, default: 0.4, hint: 'Как быстро туманность течёт и меняет форму' },
    nebulaScale: { type: 'number', label: 'Масштаб туманности', min: 0.3, max: 4, step: 0.01, default: 1.2, hint: 'Больше — мельче узор' },
    nebulaX: { type: 'number', label: 'Центр туманности X', min: 0, max: 1, step: 0.01, default: 0.6, hint: 'Где туманность ярче всего' },
    nebulaY: { type: 'number', label: 'Центр туманности Y', min: 0, max: 1, step: 0.01, default: 0.55, hint: 'Где туманность ярче всего' },

    meteors: { type: 'number', label: 'Метеоры', min: 0, max: 1, step: 0.01, default: 0.4, hint: 'Как часто пролетают метеоры. 0 — нет' },
    meteorShape: {
      type: 'select',
      label: 'Вид метеора',
      hint: 'Росчерк — тонкий хвост, Огненный шар — крупная голова с ореолом, Искры — хвост рассыпается на точки',
      options: [
        { value: 'streak', label: 'Росчерк' },
        { value: 'fireball', label: 'Огненный шар' },
        { value: 'sparks', label: 'Искры' },
      ],
      default: 'streak',
    },
    meteorAngle: { type: 'number', label: 'Направление метеоров, °', min: 0, max: 360, step: 1, default: 215, hint: 'Куда летят метеоры (разброс ±15°)' },
    meteorLength: { type: 'number', label: 'Длина хвоста', min: 0.05, max: 0.8, step: 0.01, default: 0.3, hint: 'Хвост тем длиннее, чем больше значение; гаснет к концу' },
    meteorSpeed: { type: 'number', label: 'Скорость метеоров', min: 0.3, max: 3, step: 0.01, default: 1, hint: 'Как быстро пролетают' },

    constellations: {
      type: 'select',
      label: 'Созвездия',
      hint: 'Какие показать: ни одного, несколько готовых, все или только своё',
      options: [
        { value: 'none', label: 'Нет' },
        { value: 'some', label: 'Ковш и Орион' },
        { value: 'all', label: 'Все' },
        { value: 'custom', label: 'Своё' },
      ],
      default: 'some',
    },
    custom: {
      type: 'points',
      label: 'Своё созвездие',
      default: '0.3,0.3,0;0.42,0.42,1;0.55,0.38,1;0.66,0.5,1;0.55,0.38,0;0.58,0.24,1',
      max: 32,
      // Пока рисуют — показываем своё созвездие (и не прячем его анимацией «по кругу»).
      enable: { constellations: 'custom' },
      hint: 'Нажмите «Рисовать», потом кликайте по превью — каждая звезда соединится с предыдущей. «Новая линия» — следующая звезда начнёт отдельную линию',
    },
    constStyle: {
      type: 'select',
      label: 'Появление созвездий',
      hint: 'Сразу — видно целиком. Прорисовка — звёзды и линии появляются по очереди и остаются. По кругу — рисуется, гаснет и снова. Пульс — линии мягко «дышат»',
      options: [
        { value: 'static', label: 'Сразу' },
        { value: 'draw', label: 'Прорисовка' },
        { value: 'loop', label: 'По кругу' },
        { value: 'pulse', label: 'Пульс' },
      ],
      default: 'draw',
    },
    drawSpeed: { type: 'number', label: 'Скорость прорисовки', min: 0.1, max: 3, step: 0.01, default: 1, hint: 'Сколько линий в секунду дорисовывается (для «Прорисовка» и «По кругу»)' },
    constBrightness: { type: 'number', label: 'Яркость созвездий', min: 0, max: 2, step: 0.01, default: 1, hint: 'Яркость звёзд и линий созвездий' },

    background: { type: 'color', label: 'Фон', default: '#03030a', hint: 'Цвет космоса' },
    nebulaA: { type: 'color', label: 'Туманность 1', default: '#4b1d8f', hint: 'Первый цвет туманности' },
    nebulaB: { type: 'color', label: 'Туманность 2', default: '#0f6c8a', hint: 'Второй цвет туманности' },
    starColor: { type: 'color', label: 'Звёзды', default: '#fff6e8', hint: 'Цвет звёзд' },
    meteorColor: { type: 'color', label: 'Метеоры', default: '#ffe2b0', hint: 'Цвет головы и хвоста метеора' },
    lineColor: { type: 'color', label: 'Линии созвездий', default: '#8fb4ff', hint: 'Цвет линий созвездий' },
  },
  presets: [
    { name: 'Глубокий космос', values: { nebulaA: '#4b1d8f', nebulaB: '#0f6c8a' } },
    { name: 'Звездопад', values: { meteors: 1, meteorLength: 0.45, nebula: 0.4, constellations: 'none', meteorSpeed: 1.4 } },
    { name: 'Огненные шары', values: { meteors: 0.6, meteorShape: 'fireball', meteorColor: '#ffb36b', nebula: 0.5 } },
    { name: 'Атлас созвездий', values: { constellations: 'all', constStyle: 'draw', drawSpeed: 2, nebula: 0.35, meteors: 0.15, density: 0.6 } },
    { name: 'Красное кольцо', values: { nebulaShape: 'ring', nebulaA: '#8f1d3b', nebulaB: '#c46a1b', nebula: 1.1, nebulaX: 0.5, nebulaY: 0.5, constellations: 'none' } },
    { name: 'Волокна', values: { nebulaShape: 'filaments', nebulaA: '#1fe08a', nebulaB: '#7b5cff', nebula: 1.2, nebulaDrift: 0.8 } },
  ],
  fragment:
    CONSTELLATIONS +
    /* glsl */ `
float aspect() { return uResolution.x / uResolution.y; }

float stars(vec2 p, float scale, float density, float seed) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  vec2 h = hash2(id + seed);
  if (h.x > density) return 0.0;
  vec2 pos = (h - 0.5) * 0.7;
  float d = length(f - pos);
  float size = (0.015 + h.y * 0.03) * uStarSize;
  float tw = 1.0 - uTwinkle * 0.5 * (1.0 + sin(uTime * (1.5 + h.y * 4.0) + h.x * 30.0));
  return smoothstep(size, 0.0, d) * (0.4 + h.y) * tw;
}

// ─── Туманность ─────────────────────────────────────────────────────────
vec3 nebula(vec2 p, vec2 m) {
  if (uNebula <= 0.0) return vec3(0.0);
  float t = uTime * uNebulaDrift * 0.04;
  vec2 c = (vec2(uNebulaX, uNebulaY) - 0.5) * vec2(aspect(), 1.0);
  vec2 q = (p - c) * uNebulaScale - m * 0.2;
  vec2 k = vec2(fbm(q * 1.2 + t), fbm(q * 1.2 + vec2(5.2, 1.3) - t));
  float n = fbm(q * 1.5 + (k - 0.5) * 2.2 + t * 0.5);
  float n2 = fbm(q * 2.3 + (k - 0.5) * 1.5 - t * 0.4 + 7.0);
  float shape;
  if (uNebulaShape < 0.5) {
    shape = smoothstep(0.4, 0.95, n) * smoothstep(1.6, 0.2, length(p - c));
  } else if (uNebulaShape < 1.5) {
    float ridge = 1.0 - abs(2.0 * n - 1.0);
    shape = pow(ridge, 5.0) * smoothstep(1.8, 0.1, length(p - c)) * 1.4;
  } else {
    float r = length((p - c) * vec2(1.0, 1.2));
    shape = exp(-pow((r - 0.32 - (n - 0.5) * 0.25) * 6.0, 2.0)) * (0.5 + n);
  }
  vec3 col = uNebulaA * shape + uNebulaB * smoothstep(0.5, 1.0, n2) * shape * 1.2;
  return col * uNebula;
}

// ─── Метеоры ────────────────────────────────────────────────────────────
// Отрезок: расстояние от точки до него и где на нём (0 — голова, 1 — конец хвоста).
vec2 segment(vec2 p, vec2 head, vec2 dir, float len) {
  vec2 d = p - head;
  float along = clamp(-dot(d, dir) / len, 0.0, 1.0);
  return vec2(length(d + dir * along * len), along);
}

vec3 meteors(vec2 p) {
  if (uMeteors <= 0.0) return vec3(0.0);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float rate = 0.35 * uMeteorSpeed;
    float tt = uTime * rate + fi * 0.37;
    float slot = floor(tt);
    float ph = fract(tt);
    vec2 h = hash2(vec2(slot, fi * 7.1));
    if (h.x > uMeteors) continue;
    // Полёт занимает первую треть слота, дальше — пауза.
    float life = ph * 3.0;
    if (life > 1.0) continue;
    float a = radians(uMeteorAngle + (h.y - 0.5) * 30.0);
    vec2 dir = vec2(cos(a), sin(a));
    vec2 start = (hash2(vec2(slot, fi * 3.3 + 1.0)) - 0.5) * vec2(aspect(), 1.0) * 1.1 - dir * 0.4;
    vec2 head = start + dir * life * 1.4;
    float len = uMeteorLength * smoothstep(0.0, 0.25, life);   // хвост вырастает
    vec2 s = segment(p, head, dir, len);
    float fade = smoothstep(1.0, 0.75, life) * smoothstep(0.0, 0.05, life);
    float tail = pow(1.0 - s.y, 2.0);
    float glow;
    if (uMeteorShape < 0.5) {
      glow = smoothstep(0.004 * (1.0 - s.y * 0.7), 0.0, s.x) * tail + exp(-s.x * 260.0) * tail * 0.4;
      glow += exp(-length(p - head) * 220.0) * 1.2;
    } else if (uMeteorShape < 1.5) {
      glow = smoothstep(0.012 * (1.0 - s.y * 0.8), 0.0, s.x) * tail * 0.9 + exp(-s.x * 90.0) * tail * 0.5;
      glow += exp(-length(p - head) * 45.0) * 1.6 + smoothstep(0.012, 0.0, length(p - head)) * 2.0;
    } else {
      // Искры: хвост — цепочка точек со случайным разбросом.
      float k = s.y * 26.0;
      vec2 jitter = (hash2(vec2(floor(k), slot)) - 0.5) * 0.02 * s.y;
      vec2 spark = head - dir * (floor(k) + 0.5) / 26.0 * len + jitter;
      glow = smoothstep(0.004, 0.0, length(p - spark)) * tail * step(s.y, 0.999) * step(fract(k), 0.9);
      glow += exp(-length(p - head) * 200.0) * 1.3;
    }
    col += uMeteorColor * glow * fade;
  }
  return col;
}

// ─── Созвездия ──────────────────────────────────────────────────────────
float gIndex;   // порядковый номер линии — для «прорисовки» по очереди

// Одна звезда созвездия и линия к ней от предыдущей.
vec3 constPoint(vec2 p, vec3 a, vec3 prev, bool hasPrev, float idx, float total) {
  vec2 A = (a.xy - 0.5) * vec2(aspect(), 1.0);
  vec2 B = (prev.xy - 0.5) * vec2(aspect(), 1.0);
  vec3 col = vec3(0.0);
  float bright = uConstBrightness;
  // Анимация: прорисовка — линии появляются по очереди, потом всё гаснет и снова.
  // Прорисовка: «сколько линий уже нарисовано» растёт со временем от запуска эффекта
  // (рантайм начинает время с 4 с). Новая точка своего созвездия появляется сразу,
  // потому что к этому моменту прогресс давно её обогнал.
  float show = 1.0;
  float part = 1.0;
  float drawn = (uTime - 4.0) * uDrawSpeed;
  if (uConstStyle > 0.5 && uConstStyle < 1.5) {
    part = clamp(drawn - idx, 0.0, 1.0);
  } else if (uConstStyle > 1.5 && uConstStyle < 2.5) {
    float cycle = mod(drawn, total + 3.0);
    part = clamp(cycle - idx, 0.0, 1.0);
    show = smoothstep(total + 3.0, total + 2.0, cycle);
  } else if (uConstStyle > 2.5) {
    show = 0.55 + 0.45 * sin(uTime * 1.6 - idx * 0.7);
  }
  if (hasPrev && a.z > 0.5) {
    vec2 ba = A - B;
    float h = clamp(dot(p - B, ba) / dot(ba, ba), 0.0, part);
    float d = length(p - B - ba * h);
    float line = smoothstep(0.0025, 0.0, d) * 0.55 + exp(-d * 300.0) * 0.25;
    col += uLineColor * line * show * step(0.001, part) * bright;
  }
  float ds = length(p - A);
  // Звезда загорается, когда до неё дошла прорисовка.
  float starOn = 1.0;
  if (uConstStyle > 0.5 && uConstStyle < 1.5) starOn = smoothstep(idx - 0.3, idx, drawn);
  else if (uConstStyle > 1.5 && uConstStyle < 2.5) starOn = step(idx, mod(drawn, total + 3.0)) * show;
  col += uStarColor * (smoothstep(0.007, 0.0, ds) * 1.4 + exp(-ds * 90.0) * 0.5) * starOn * bright;
  return col;
}

vec3 constellations(vec2 p) {
  if (uConstellations < 0.5) return vec3(0.0);
  vec3 col = vec3(0.0);
  float idx = 0.0;
  if (uConstellations > 2.5) {
    int n = int(uCustomCount);
    for (int i = 0; i < 32; i++) {
      if (i >= n) break;
      col += constPoint(p, uCustom[i], i > 0 ? uCustom[i - 1] : uCustom[0], i > 0, float(i), uCustomCount);
    }
    return col;
  }
  float total = 16.0;
  for (int i = 0; i < 7; i++) col += constPoint(p, C_URSA[i], C_URSA[max(i - 1, 0)], i > 0, float(i), total);
  for (int i = 0; i < 9; i++) col += constPoint(p, C_ORION[i], C_ORION[max(i - 1, 0)], i > 0, float(i) + 7.0, total);
  if (uConstellations > 1.5) {
    for (int i = 0; i < 5; i++) col += constPoint(p, C_CASS[i], C_CASS[max(i - 1, 0)], i > 0, float(i) + 2.0, total);
    for (int i = 0; i < 6; i++) col += constPoint(p, C_CYGNUS[i], C_CYGNUS[max(i - 1, 0)], i > 0, float(i) + 9.0, total);
    for (int i = 0; i < 7; i++) col += constPoint(p, C_LEO[i], C_LEO[max(i - 1, 0)], i > 0, float(i) + 4.0, total);
  }
  return col;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec2 m = (uMouse - 0.5) * uParallax * uMouseActive;
  float t = uTime * uSpeed * 0.05;
  float fa = radians(uFlightAngle);
  vec2 fly = vec2(cos(fa), sin(fa)) * t;

  vec3 col = uBackground + nebula(p, m);

  // Три слоя звёзд: дальние мелкие и медленные, ближние крупнее и быстрее.
  float s = 0.0;
  s += stars(p + fly * 0.5 - m * 0.1, 22.0, uDensity, 1.0) * 0.6;
  s += stars(p + fly - m * 0.3, 12.0, uDensity * 0.7, 7.0) * 0.85;
  s += stars(p + fly * 2.0 - m * 0.6, 6.0, uDensity * 0.45, 13.0);
  col += uStarColor * s;

  col += constellations(p - m * 0.15);
  col += meteors(p);
  fragColor = vec4(col, 1.0);
}`,
}
