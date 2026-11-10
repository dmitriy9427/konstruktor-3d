import type { EffectDef } from './types'

/**
 * «Осколки» — раздел «Переходы», вид slides (шейдерный переход между фото слайдера).
 *
 * Образец перехода. Рантайм даёт две картинки и прогресс:
 *   fromAt(uv) — цвет уходящего слайда, toAt(uv) — приходящего,
 *   uProgress — 0 → 1 (уже сглажен), uDirection — 1 вперёд / −1 назад.
 * Параметры duration и autoplay рантайм читает сам (длительность и автопрокрутка) —
 * в шейдере их нет, но в описании они обязательны.
 *
 * Идея: слайд — мозаика из осколков (ячейки Вороного). Каждый осколок
 * переворачивается вокруг своей оси, как карта: с лица — старое фото, с изнанки —
 * новое. Переворот идёт волной от курсора (или от центра).
 *
 * Главный приём — «обратный ход»: шейдер не двигает осколки, он для каждого
 * пикселя спрашивает: «какая точка осколка сейчас видна здесь?». Для этого
 * координату пикселя «разворачиваем обратно» (делим на cos угла поперёк оси) и
 * проверяем, принадлежит ли полученная точка этому осколку.
 */
export const shatter: EffectDef = {
  // ── Паспорт ──
  id: 'shatter',
  name: 'Осколки',
  category: 'Переходы',
  kind: 'slides',
  description: 'Слайд рассыпается на осколки: они переворачиваются волной и собирают новое фото',
  usesMouse: true,

  // ── Ползунки ──
  params: {
    duration: { type: 'number', label: 'Длительность, с', min: 0.4, max: 4, step: 0.05, default: 1.6, hint: 'Сколько секунд длится смена слайда' },
    cells: { type: 'number', label: 'Осколков в ряд', min: 3, max: 30, step: 1, default: 9, hint: 'Сколько осколков помещается по высоте' },
    wave: { type: 'number', label: 'Волна', min: 0, max: 4, step: 0.01, default: 1.8, hint: '0 — все осколки переворачиваются разом, больше — волной от курсора' },
    chaos: { type: 'number', label: 'Хаос', min: 0, max: 1, step: 0.01, default: 0.35, hint: 'Осколки переворачиваются вразнобой, а не строго по волне' },
    lift: { type: 'number', label: 'Подлёт', min: 0, max: 1, step: 0.01, default: 0.45, hint: 'Осколок в перевороте подлетает к зрителю' },
    gap: { type: 'number', label: 'Свечение кромок', min: 0, max: 1, step: 0.01, default: 0.3, hint: 'Ширина и яркость светящейся кромки осколков во время перехода' },
    edge: { type: 'color', label: 'Свет кромки', default: '#9ad8ff', hint: 'Цвет бликов на гранях и свечения в щелях' },
    background: { type: 'color', label: 'За осколками', default: '#05060c', hint: 'Что видно в просветах, пока осколки стоят ребром' },
    autoplay: { type: 'number', label: 'Автопрокрутка, с', min: 0, max: 10, step: 0.5, default: 0, hint: '0 — только по кнопкам' },
  },

  // ── Пресеты ──
  presets: [
    { name: 'Стекло', values: {} },
    { name: 'Мозаика', values: { cells: 22, wave: 3, chaos: 0.15, lift: 0.2, gap: 0.15, edge: '#ffffff', duration: 1.9 } },
    { name: 'Взрыв', values: { cells: 6, wave: 0.6, chaos: 1, lift: 1, gap: 0.6, edge: '#ffb347', duration: 1.2 } },
    { name: 'Неон', values: { cells: 12, wave: 2.4, chaos: 0.5, gap: 0.8, edge: '#ff3df2', background: '#0a0014' } },
  ],

  // ── Шейдер ──
  fragment: /* glsl */ `
const float PI = 3.14159265;

// Центр осколка в клетке id: клетка сетки + случайный сдвиг.
vec2 site(vec2 id) { return id + 0.5 + (hash2(id) - 0.5) * 0.8; }

// Какому осколку принадлежит точка g: xy — клетка ближайшего центра,
// z — расстояние до границы с соседом (0 на самой кромке).
vec3 owner(vec2 g) {
  vec2 base = floor(g), best = base;
  float d1 = 1e9, d2 = 1e9;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = base + vec2(i, j);
    vec2 v = site(id) - g;
    float d = dot(v, v);
    if (d < d1) { d2 = d1; d1 = d; best = id; } else if (d < d2) d2 = d;
  }
  return vec3(best, sqrt(d2) - sqrt(d1));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 scale = vec2(aspect, 1.0) * uCells;            // uv → координаты сетки осколков
  vec2 g = uv * scale;
  // Откуда идёт волна: курсор над слайдером, иначе центр.
  vec2 origin = mix(vec2(0.5), uMouse, uMouseActive) * scale;
  float far = length(scale);                          // самая дальняя точка — для нормировки

  vec3 col = uBackground;
  float top = -1.0;                                   // «высота» уже нарисованного осколка

  // Пиксель может накрыть свой осколок или подлетевший соседний — смотрим 3×3 клетки.
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = floor(g) + vec2(i, j);
    vec2 ctr = site(id);

    // Когда переворачивается этот осколок: задержка 0…1 = расстояние от начала волны + хаос.
    float delay = mix(length(ctr - origin) / far, hash(id + 7.3), uChaos);
    float t = clamp(uProgress * (1.0 + uWave) - delay * uWave, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);                      // плавный старт и финиш
    float ang = t * PI * uDirection;                  // 0 — лицом, π — изнанкой
    float c = cos(ang);
    if (abs(c) < 0.03) continue;                      // стоит ребром — его не видно

    // Ось переворота — случайная прямая в плоскости осколка.
    float axisAngle = hash(id + 3.1) * PI;
    vec2 ax = vec2(cos(axisAngle), sin(axisAngle));
    vec2 nx = vec2(-ax.y, ax.x);
    float up = 1.0 + sin(abs(ang)) * uLift * 0.45;    // подлёт: осколок чуть крупнее

    // Обратный ход: вдоль оси точка не меняется, поперёк — сжата в cos раз.
    vec2 rel = (g - ctr) / up;
    float along = dot(rel, ax), across = dot(rel, nx) / c;
    vec3 own = owner(ctr + ax * along + nx * across);
    if (own.xy != id) continue;                       // эта точка — не от нашего осколка

    float height = sin(abs(ang));
    if (height < top) continue;                       // сверху уже лежит другой осколок
    top = height;

    // Лицо несёт старое фото, изнанка — новое (зеркально: после переворота встанет ровно).
    vec2 face = (ctr + ax * along + nx * across) / scale;
    vec2 back = (ctr + ax * along - nx * across) / scale;
    vec3 photo = c > 0.0 ? fromAt(face) : toAt(back);

    // Свет: к ребру темнее, в один момент переворота — блик, по кромке — свечение.
    float shade = mix(1.0, 0.45 + 0.55 * abs(c), height);
    float flash = pow(1.0 - abs(abs(c) - 0.55), 12.0) * height;
    float rim = (1.0 - smoothstep(0.0, 0.02 + uGap * 0.1, own.z)) * height;
    col = photo * shade + uEdge * (flash * 0.35 + rim * (0.25 + uGap));
  }
  fragColor = vec4(col, 1.0);
}`,
}
