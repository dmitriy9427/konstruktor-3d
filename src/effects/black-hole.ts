import type { EffectDef } from './types'

/**
 * «Чёрная дыра» — раздел «Фоны», вид quad (полноэкранный шейдер).
 *
 * Образец эффекта-фона: один файл, в нём всё — описание, ползунки, пресеты, шейдер.
 * Как устроен кадр:
 *   1. Из камеры в каждый пиксель летит луч света. Обычно он прямой, но рядом с
 *      чёрной дырой гравитация его гнёт: на каждом шаге поворачиваем скорость к
 *      центру (сила −1.5·h²·r/|r|⁵ — так выглядит изгиб света у невращающейся дыры
 *      с радиусом горизонта 1).
 *   2. Луч зашёл под горизонт (|r| < 1) — пиксель чёрный.
 *   3. Луч пересёк плоскость диска (y сменил знак) — добавляем свет диска. Из-за
 *      изгиба луч может пересечь диск ЗА дырой: так получается знаменитая «арка»
 *      над тенью — это дальняя половина диска, поднятая гравитацией.
 *   4. Луч улетел — рисуем звёзды в том направлении, куда он смотрит ТЕПЕРЬ
 *      (поэтому звёзды у края тени растянуты в кольцо).
 */
export const blackHole: EffectDef = {
  // ── Паспорт: id — в адресе (?e=black-hole) и в теге <k3d-black-hole> ──
  id: 'black-hole',
  name: 'Чёрная дыра',
  category: 'Фоны',
  kind: 'quad',
  description: 'Свет огибает горизонт: диск встаёт аркой над тенью, звёзды тянутся в кольцо',
  // Шейдер читает uMouse → в сайдбаре появятся «Следовать за мышью», инерция и траектория.
  usesMouse: true,
  // Свои общие настройки по умолчанию: диску к лицу лёгкое свечение.
  defaultCommon: { quality: 1.25, post: { grain: 0.08, chroma: 0, vignette: 0.25, bloom: 0.45 } },

  // ── Ползунки: ключ speed → uniform uSpeed, colorHot → uColorHot ──
  params: {
    speed: { type: 'number', label: 'Скорость диска', min: 0, max: 3, step: 0.01, default: 1, hint: 'Как быстро вращается вещество диска' },
    distance: { type: 'number', label: 'Расстояние', min: 7, max: 24, step: 0.1, default: 12, hint: 'Как далеко камера от дыры (в радиусах горизонта)' },
    tilt: { type: 'number', label: 'Наклон камеры, °', min: 0, max: 40, step: 0.5, default: 7, hint: '0 — смотрим точно с ребра диска, больше — сверху' },
    size: { type: 'number', label: 'Размер диска', min: 4, max: 12, step: 0.1, default: 8, hint: 'Внешний радиус диска' },
    brightness: { type: 'number', label: 'Яркость диска', min: 0.2, max: 3, step: 0.01, default: 1.3 },
    streaks: { type: 'number', label: 'Полосы', min: 0, max: 1, step: 0.01, default: 0.7, hint: 'Насколько диск полосатый: 0 — гладкий' },
    doppler: { type: 'number', label: 'Доплер', min: 0, max: 1, step: 0.01, default: 0.6, hint: 'Сторона диска, летящая на нас, ярче — как у настоящих дыр' },
    stars: { type: 'number', label: 'Звёзды', min: 0, max: 2, step: 0.01, default: 1, hint: 'Яркость звёздного неба' },
    orbit: { type: 'number', label: 'Облёт камеры', min: 0, max: 1, step: 0.01, default: 0.25, hint: 'Камера сама медленно летит вокруг дыры' },
    colorHot: { type: 'color', label: 'Центр диска', default: '#fff1cf' },
    colorCool: { type: 'color', label: 'Край диска', default: '#ff5a14' },
    background: { type: 'color', label: 'Космос', default: '#020308' },
  },

  // ── Пресеты: только то, что отличается от умолчаний ──
  presets: [
    { name: 'Гаргантюа', values: {} },
    { name: 'Квазар', values: { colorHot: '#eaf6ff', colorCool: '#2f6bff', background: '#01020a', tilt: 16, streaks: 0.9, brightness: 1.6 } },
    { name: 'Рубин', values: { colorHot: '#ffd9e2', colorCool: '#d1003f', background: '#060108', tilt: 3, doppler: 0.9, size: 10 } },
    { name: 'Сверху', values: { tilt: 34, distance: 16, colorHot: '#f4fff2', colorCool: '#14b88a', streaks: 1, orbit: 0.5 } },
  ],

  // ── Шейдер: общие uniform и noise/fbm/rot объявлены рантаймом (runtime.js → COMMON) ──
  fragment: /* glsl */ `
const float PI = 3.14159265;

// Звёзды по направлению взгляда: небо режем на клетки, в редких клетках — звезда.
vec3 sky(vec3 d) {
  vec2 s = vec2(atan(d.z, d.x), asin(clamp(d.y, -1.0, 1.0)));
  vec3 col = uBackground;
  // Туманность: два слоя шума, слегка подкрашены цветом края диска.
  // (шум берём от самого направления, а не от углов — иначе на «затылке» неба был бы шов)
  float neb = fbm(d.xy * 2.2 + d.z * 1.3 + 4.0) * fbm(d.zy * 3.1 - d.x - 2.0);
  col += mix(uColorCool, vec3(0.25, 0.4, 1.0), 0.6) * neb * 0.22 * uStars;
  for (int layer = 0; layer < 2; layer++) {
    vec2 g = s * (layer == 0 ? 26.0 : 55.0);
    vec2 id = floor(g);
    vec2 h = hash2(id + float(layer) * 31.0);
    float star = smoothstep(0.93, 1.0, h.x);
    vec2 p = fract(g) - 0.5 - (hash2(id + 7.0) - 0.5) * 0.7;
    float glow = exp(-dot(p, p) * (layer == 0 ? 90.0 : 160.0));
    float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + h.y * 3.0) + h.y * 40.0);
    col += mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), h.y) * star * glow * twinkle * uStars * 1.6;
  }
  return col;
}

// Цвет и плотность диска в точке его плоскости.
vec4 disk(vec3 hit, vec3 view) {
  float r = length(hit.xz);
  float inner = 2.6;
  if (r < inner || r > uSize) return vec4(0.0);
  float k = (r - inner) / (uSize - inner);            // 0 у внутреннего края, 1 у внешнего
  // Вещество ближе к дыре вращается быстрее (как планеты): угол бежит со скоростью ~ r^-1.5.
  float a = atan(hit.z, hit.x) + uTime * uSpeed * 2.2 * pow(r, -1.5);
  // Шум по окружности без шва: вместо угла берём точку на круге.
  vec2 ring = vec2(cos(a), sin(a));
  float n = fbm(ring * 2.5 + r * 1.9) * 0.6 + fbm(ring * 6.0 - r * 3.3 + 9.0) * 0.4;
  float bands = mix(1.0, smoothstep(0.25, 0.75, n) * 1.5 + 0.12, uStreaks);
  // Доплер: сторона, летящая к камере, ярче.
  vec3 tangent = normalize(vec3(-hit.z, 0.0, hit.x));
  float beam = pow(max(0.05, 1.0 + dot(tangent, view) * 0.75), 3.0);
  beam = mix(1.0, beam, uDoppler);
  float fade = smoothstep(0.0, 0.08, k) * pow(1.0 - k, 1.6);
  vec3 col = mix(uColorHot, uColorCool, smoothstep(0.0, 0.7, k)) * (1.0 + 2.5 * pow(1.0 - k, 4.0));
  float density = fade * bands;
  return vec4(col * density * beam * uBrightness, clamp(density * 0.9, 0.0, 1.0));
}

void main() {
  // Координаты: центр экрана — ноль, короткая сторона экрана — единица: круги не
  // вытягиваются, а диск целиком помещается и на широком экране, и на телефоне.
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  // Камера: облёт сам по себе + мышь наклоняет и поворачивает.
  vec2 m = (uMouse - 0.5) * uMouseActive;
  float pitch = radians(uTilt) + m.y * 0.5;
  float yaw = uTime * 0.05 * uOrbit + m.x * 1.4;
  vec3 ro = vec3(0.0, 0.0, -uDistance);
  vec3 rd = normalize(vec3(p, 1.5));
  ro.yz *= rot(pitch); rd.yz *= rot(pitch);
  ro.xz *= rot(yaw);   rd.xz *= rot(yaw);

  // Луч: положение и скорость. h2 — квадрат момента импульса, он не меняется в полёте.
  vec3 pos = ro, vel = rd;
  vec3 h = cross(pos, vel);
  float h2 = dot(h, h);

  vec3 col = vec3(0.0);
  float through = 1.0;                                 // сколько света ещё проходит сквозь диск
  for (int i = 0; i < 110; i++) {
    float r2 = dot(pos, pos);
    if (r2 < 1.0) { through = 0.0; break; }            // под горизонтом — темнота
    if (r2 > 900.0) break;                             // улетел далеко — дальше прямая
    // Шаг короче у дыры (там луч гнётся сильнее), длиннее вдали.
    float dt = clamp(0.11 * sqrt(r2), 0.04, 1.2);
    vec3 next = pos + vel * dt;
    vel += -1.5 * h2 * pos / pow(r2, 2.5) * dt;       // изгиб света
    // Пересекли плоскость диска между pos и next?
    if (pos.y * next.y < 0.0) {
      vec3 hit = mix(pos, next, pos.y / (pos.y - next.y));
      vec4 d = disk(hit, normalize(vel));
      col += through * d.rgb;
      through *= 1.0 - d.a;
    }
    pos = next;
  }
  col += through * sky(normalize(vel));
  // Мягкое сжатие ярких мест: диск не «выгорает» в белое пятно.
  col = 1.0 - exp(-col * 1.25);
  fragColor = vec4(col, 1.0);
}`,
}
