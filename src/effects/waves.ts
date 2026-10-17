import type { EffectDef } from './types'

/**
 * «Волны» — море до горизонта: небо, солнце, дождь, молнии, время суток.
 *
 * Два шейдера:
 *   1. Симуляция (каждый кадр): высота «живой» воды в текстуре 256×256 —
 *      участок моря перед камерой. Волновое уравнение: новая высота =
 *      (сумма 4 соседей / 2 − прошлая высота) × затухание. Мышь толкает воду,
 *      клик бросает каплю, дождь роняет капли.
 *   2. Картинка: луч камеры для каждого пикселя. Выше горизонта — небо
 *      (градиент, солнце, вспышки молний). Ниже — вода:
 *        валы — синусоида с острым гребнем, аргумент которой искривлён шумом,
 *               и сжатая вдоль горизонта: гребни неровные и короткие, без
 *               прямых полос через кадр;
 *        живая вода — из симуляции; круги от дождя — формулой по всему морю;
 *        свет — в основном отражённое небо (Френель), блики солнца, дымка.
 *
 * Время суток: свои цвета, ползунок «Сцена», прокрутка страницы
 * (рассвет → день → закат → шторм → ночь) или само по кругу.
 */

/** Общее для обоих шейдеров: камера, участок симуляции, сцена (цвета и погода). */
const SHARED = /* glsl */ `
const float CAM_H0 = 1.2;
float gSway;   // сила качки: «Качка» + шторм
float gStorm;  // 0…1 — насколько сейчас шторм
// Качка — как с палубы: камера поднимается и опускается, кивает и заваливается.
// В шторм камера выше: над ней не должны смыкаться валы.
float camH() { return CAM_H0 * (1.0 + 0.28 * gSway * sin(uTime * 0.55)) + gStorm * 0.9; }
// Участок моря под «живой» водой: x от −4 до 4, z (вдаль) от 0.3 до 8.3.
const vec2 PATCH_MIN = vec2(-4.0, 0.3);
const float PATCH = 8.0;

// Луч камеры для точки экрана: «Линия горизонта» поднимает и опускает взгляд.
float pitch() { return mix(0.6, 0.0, uHorizon) + 0.07 * gSway * sin(uTime * 0.43 + 1.3); }
vec3 rayDir(vec2 p) {
  p = rot(0.09 * gSway * sin(uTime * 0.37)) * p;   // крен
  return normalize(vec3(p.x, p.y - pitch(), 1.0));
}
// Точка на воде (y = 0) под лучом: доли холста → координаты моря.
vec2 waterAt(vec2 screen01) {
  vec2 p = (screen01 - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  vec3 rd = rayDir(p);
  return rd.xz * (camH() / max(-rd.y, 0.02));
}

// ─── Сцена ───────────────────────────────────────────────────────────────
// Таблица времени суток: рассвет, день, закат, шторм, ночь.
const vec3 T_TOP[5] = vec3[5](vec3(0.42, 0.44, 0.66), vec3(0.25, 0.53, 0.85), vec3(0.17, 0.11, 0.31), vec3(0.16, 0.19, 0.25), vec3(0.008, 0.016, 0.047));
const vec3 T_HOR[5] = vec3[5](vec3(1.0, 0.78, 0.6), vec3(0.81, 0.89, 0.95), vec3(1.0, 0.54, 0.36), vec3(0.36, 0.4, 0.46), vec3(0.07, 0.1, 0.2));
const vec3 T_SUN[5] = vec3[5](vec3(1.0, 0.82, 0.48), vec3(1.0, 0.97, 0.9), vec3(1.0, 0.7, 0.42), vec3(0.67, 0.7, 0.76), vec3(0.87, 0.91, 1.0));
const vec3 T_DEEP[5] = vec3[5](vec3(0.1, 0.09, 0.15), vec3(0.016, 0.07, 0.12), vec3(0.07, 0.04, 0.11), vec3(0.012, 0.018, 0.03), vec3(0.004, 0.012, 0.035));
const vec3 T_LIT[5] = vec3[5](vec3(0.44, 0.35, 0.43), vec3(0.12, 0.43, 0.56), vec3(0.36, 0.16, 0.29), vec3(0.42, 0.48, 0.54), vec3(0.05, 0.11, 0.2));
// Высота солнца — в долях видимого неба: 0 — горизонт, 1 — верх кадра.
const float T_SUNH[5] = float[5](0.15, 0.85, 0.08, 0.8, 0.55);
const float T_HAZE[5] = float[5](1.2, 0.5, 0.9, 1.6, 0.7);
const float T_STORM[5] = float[5](0.0, 0.0, 0.0, 1.0, 0.0);

vec3 gTop, gHor, gSun, gDeep, gLit;
float gSunH, gHaze, gRain, gLightning;

// Где мы в таблице: 0…4 (дробное — между сценами). Отрицательное — свои цвета.
float sceneIndex() {
  if (uCycle < 0.5) return -1.0;
  if (uCycle < 1.5) return uTimeOfDay;
  if (uCycle < 2.5) return uScroll * 4.0;
  return mod(uTime * uCycleSpeed * 0.05, 5.0);
}

void setupScene() {
  float s = sceneIndex();
  if (s < 0.0) {
    gTop = uSkyTop; gHor = uSkyHorizon; gSun = uSun; gDeep = uDeep; gLit = uShallow;
    gSunH = uSunHeight; gHaze = uHaze; gStorm = 0.0;
  } else {
    int i = int(floor(s)) % 5;
    int j = min(i + 1, 4);
    if (uCycle > 2.5) j = (i + 1) % 5;   // «Само» — по кругу: после ночи снова рассвет
    float k = smoothstep(0.0, 1.0, fract(s));
    gTop = mix(T_TOP[i], T_TOP[j], k); gHor = mix(T_HOR[i], T_HOR[j], k); gSun = mix(T_SUN[i], T_SUN[j], k);
    gDeep = mix(T_DEEP[i], T_DEEP[j], k); gLit = mix(T_LIT[i], T_LIT[j], k);
    gSunH = mix(T_SUNH[i], T_SUNH[j], k); gHaze = mix(T_HAZE[i], T_HAZE[j], k); gStorm = mix(T_STORM[i], T_STORM[j], k);
  }
  gRain = max(uRain, gStorm * 0.8);
  gLightning = max(uLightning, gStorm * 0.7);
  gSway = uSway + gStorm * 1.3;
}
`

export const waves: EffectDef = {
  id: 'waves',
  name: 'Волны',
  category: 'Фоны',
  kind: 'quad',
  description: 'Море: небо и солнце, дождь и молнии, время суток по прокрутке; мышь толкает воду',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 3, step: 0.01, default: 0.8, hint: 'Как быстро идут волны' },
    frequency: { type: 'number', label: 'Частота', min: 1, max: 20, step: 0.1, default: 6, hint: 'Размер валов: больше — мельче и чаще' },
    amplitude: { type: 'number', label: 'Высота', min: 0, max: 2, step: 0.01, default: 0.6, hint: 'Насколько круты склоны волн' },
    choppy: { type: 'number', label: 'Острота гребней', min: 0, max: 1, step: 0.01, default: 0.45, hint: '0 — мягкая зыбь, 1 — острые штормовые гребни' },
    stretch: { type: 'number', label: 'Вытянутость вдоль горизонта', min: 1, max: 4, step: 0.01, default: 2.2, hint: 'Насколько валы вытянуты поперёк взгляда, как в открытом море' },
    detail: { type: 'number', label: 'Мелкая рябь', min: 0, max: 1, step: 0.01, default: 0.5, hint: 'Мелкие волны поверх крупных' },
    sway: { type: 'number', label: 'Качка', min: 0, max: 2, step: 0.01, default: 0, hint: 'Камера качается, как на палубе: поднимается, кивает и заваливается. В шторм качает сильно само' },
    horizon: { type: 'number', label: 'Линия горизонта', min: 0, max: 1, step: 0.01, default: 0.6, hint: '0 — смотрим на воду сверху, неба не видно; 1 — горизонт посередине кадра' },
    cycle: {
      type: 'select',
      label: 'Время суток',
      hint: 'Свои — цвета ниже. Ползунок — сцена из таблицы. Прокрутка — рассвет → день → закат → шторм → ночь, пока блок проезжает по экрану. Само — по кругу',
      options: [
        { value: 'custom', label: 'Свои' },
        { value: 'slider', label: 'Ползунок' },
        { value: 'scroll', label: 'Прокрутка' },
        { value: 'time', label: 'Само' },
      ],
      default: 'custom',
    },
    timeOfDay: { type: 'number', label: 'Сцена', min: 0, max: 4, step: 0.01, default: 1, hint: '0 — рассвет, 1 — день, 2 — закат, 3 — шторм, 4 — ночь (для «Ползунок»). Так и будет при прокрутке', when: { cycle: ['slider'] } },
    cycleSpeed: { type: 'number', label: 'Скорость смены суток', min: 0.1, max: 5, step: 0.05, default: 1, hint: 'Для «Само»: 1 — полный круг примерно за 100 секунд', when: { cycle: ['time'] } },
    haze: { type: 'number', label: 'Дымка', min: 0, max: 2, step: 0.01, default: 0.6, hint: 'Туман: вода вдали растворяется в небе', when: { cycle: ['custom'] } },
    sunHeight: { type: 'number', label: 'Высота солнца', min: -0.3, max: 1, step: 0.01, default: 0.55, hint: '0 — солнце на горизонте, 1 — у верхнего края кадра, меньше нуля — за горизонтом. Ниже — длиннее солнечная дорожка', when: { cycle: ['custom'] } },
    sunSide: { type: 'number', label: 'Солнце слева–справа, °', min: -60, max: 60, step: 1, default: -15, hint: 'Где солнце по горизонтали' },
    sunSize: { type: 'number', label: 'Размер солнца', min: 0.3, max: 4, step: 0.01, default: 1, hint: 'Диск и ореол вокруг него' },
    glitter: { type: 'number', label: 'Блики', min: 0, max: 3, step: 0.01, default: 1, hint: 'Искры солнца на гребнях' },
    rain: { type: 'number', label: 'Дождь', min: 0, max: 1, step: 0.01, default: 0, hint: 'Капли в кадре и круги по всему морю. В сцене «шторм» дождь идёт сам' },
    rainAngle: { type: 'number', label: 'Наклон дождя, °', min: -40, max: 40, step: 1, default: 8, hint: 'Ветер сносит капли вбок' },
    lightning: { type: 'number', label: 'Молнии', min: 0, max: 1, step: 0.01, default: 0, hint: 'Как часто бьют молнии. В сцене «шторм» — сами' },
    push: { type: 'number', label: 'Мышь толкает воду', min: 0, max: 3, step: 0.01, default: 1, hint: 'Волна за курсором при движении. 0 — вода курсор не чувствует' },
    drop: { type: 'number', label: 'Сила капли (клик)', min: 0, max: 3, step: 0.01, default: 1, hint: 'Насколько сильные круги от клика' },
    dropSize: { type: 'number', label: 'Размер капли', min: 0.05, max: 1.2, step: 0.01, default: 0.3, hint: 'Радиус удара от клика и курсора' },
    damping: { type: 'number', label: 'Затухание кругов', min: 0.9, max: 0.999, step: 0.001, default: 0.985, hint: 'Ближе к 1 — круги бегут дольше и дальше' },
    deep: { type: 'color', label: 'Глубина', default: '#0a1a28', hint: 'Цвет воды в тени (для «Свои»)', when: { cycle: ['custom'] } },
    shallow: { type: 'color', label: 'Вода на свету', default: '#2a6f8a', hint: 'Цвет освещённых склонов (для «Свои»)', when: { cycle: ['custom'] } },
    skyTop: { type: 'color', label: 'Небо вверху', default: '#4a86c9', hint: 'Цвет неба в зените (для «Свои»)', when: { cycle: ['custom'] } },
    skyHorizon: { type: 'color', label: 'Небо у горизонта', default: '#d6e6f0', hint: 'Цвет неба и дымки у горизонта (для «Свои»)', when: { cycle: ['custom'] } },
    sun: { type: 'color', label: 'Солнце', default: '#fff3d6', hint: 'Цвет солнца и бликов (для «Свои»)', when: { cycle: ['custom'] } },
  },
  presets: [
    { name: 'День', values: { cycle: 'custom' } },
    { name: 'Рассвет', values: { cycle: 'slider', timeOfDay: 0, amplitude: 0.45, choppy: 0.3 } },
    { name: 'Закат', values: { cycle: 'slider', timeOfDay: 2, glitter: 1.4 } },
    { name: 'Шторм', values: { cycle: 'slider', timeOfDay: 3, amplitude: 1.3, choppy: 0.85, speed: 1.5, frequency: 5 } },
    { name: 'Ночь', values: { cycle: 'slider', timeOfDay: 4, sunSize: 0.6, glitter: 1.4 } },
    { name: 'Сутки по прокрутке', values: { cycle: 'scroll' } },
    { name: 'Бассейн сверху', values: { horizon: 0, deep: '#0a4a6e', shallow: '#3fc2d9', amplitude: 0.25, choppy: 0, frequency: 12, speed: 0.4, glitter: 0.6, rain: 0.3, damping: 0.99, stretch: 1 } },
  ],
  simulation: {
    size: 256,
    fragment:
      SHARED +
      /* glsl */ `
// Удар по воде: опускаем её «колоколом» радиуса r.
float hit(vec2 x, vec2 at, float r) { return smoothstep(r, 0.0, length(x - at)); }

void main() {
  setupScene();
  vec2 uv = gl_FragCoord.xy / uSimRes;
  vec2 e = 1.0 / uSimRes;
  vec4 s = texture(uState, uv);   // r — высота сейчас, g — высота шагом раньше
  float sum = texture(uState, uv + vec2(e.x, 0.0)).r + texture(uState, uv - vec2(e.x, 0.0)).r
            + texture(uState, uv + vec2(0.0, e.y)).r + texture(uState, uv - vec2(0.0, e.y)).r;
  float h = (sum * 0.5 - s.g) * uDamping;

  vec2 x = PATCH_MIN + uv * PATCH;
  // Курсор толкает воду — сильнее при быстром движении.
  float speed = min(length(uMouseVel), 3.0);
  h -= uMouseActive * uPush * speed * 0.06 * hit(x, waterAt(uMouse), uDropSize * 0.6);
  // Клики — капли.
  for (int i = 0; i < 4; i++) {
    vec4 c = uClicks[i];
    if (c.z > 0.0) h -= c.z * uDrop * 0.6 * hit(x, waterAt(c.xy), uDropSize);
  }
  // Дождь рядом с камерой — настоящие капли в симуляции (дальше — формулой, см. картинку).
  for (int i = 0; i < 6; i++) {
    vec2 r = hash2(vec2(uSimStep * 0.137 + float(i) * 17.31, float(i) * 3.7 + uSimStep * 0.071));
    if (hash(r * 91.7 + uSimStep) < gRain * gRain * 0.3) h -= 0.5 * (0.6 + uAmplitude) * hit(x, PATCH_MIN + r * PATCH, 0.05);
  }
  // У края участка вода гасится — круги не отражаются от «стенки».
  float edge = smoothstep(0.0, 0.06, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
  fragColor = vec4(h * edge, s.r, 0.0, 1.0);
}`,
  },
  fragment:
    SHARED +
    /* glsl */ `
float gFlash;     // яркость вспышки молнии в этом кадре
float gBoltX;     // где бьёт молния (по горизонтали экрана)
float gBoltSeed;
float gBoltEnd;   // где разряд касается воды (по вертикали экрана): ниже — ближе к нам
float gBoltNear;  // 0 — у горизонта, 1 — совсем близко

vec3 sunDir() {
  // Высота в долях видимого неба → угол: верх кадра виден под углом atan(0.5 − наклон взгляда).
  // (если неба не видно — вид сверху — считаем от угла 17°, чтобы блики остались).
  float el = gSunH * max(atan(0.5 - pitch()), 0.3) * 0.92;
  float az = radians(uSunSide);
  return normalize(vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el)));
}

// Небо: градиент + солнце (disc — яркость диска; в отражении диск приглушён:
// дорожку рисуют блики, иначе вышла бы ровная полоса) + вспышка молнии.
vec3 sky(vec3 d, float disc) {
  float y = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(gHor, gTop, pow(y, 0.45));
  float a = acos(clamp(dot(d, sunDir()), -1.0, 1.0));
  float r = 0.018 * uSunSize;
  float vis = (1.0 - gStorm * 0.85) * smoothstep(-0.12, 0.02, sunDir().y);   // в шторм солнце за тучами
  col += gSun * vis * (smoothstep(r, r * 0.75, a) * 3.0 * disc + exp(-a / (0.12 * uSunSize)) * 0.45 + exp(-a / (0.6 * uSunSize)) * 0.15);
  col += mix(gHor, vec3(0.85, 0.9, 1.0), 0.6) * gFlash * (0.2 + 0.4 * y);
  return col;
}

// Вал: синусоида с острым гребнем, аргумент которой сдвинут шумом —
// гребни гнутся и рвутся, а не тянутся прямой линией.
float swell(vec2 p, float sharp) {
  p += 1.2 * (vec2(noise(p * 0.5), noise(p * 0.5 + 7.3)) - 0.5) * 2.0;
  vec2 w = 1.0 - abs(sin(p));                 // острые вершины, пологие впадины
  vec2 c = abs(cos(p));
  w = mix(w, c, w);                           // скругляем впадины
  return pow(1.0 - pow(w.x * w.y, 0.65), sharp);
}

// Высота моря: 5 октав валов; каждая следующая мельче, слабее и повёрнута.
// Мелкие октавы вдали гаснут — они мельче пикселя и только рябили бы.
// octaves — сколько октав считать: для поиска поверхности хватает 2 крупных.
float seaHeight(vec2 x, float t, float footprint, int octaves) {
  vec2 p = x * vec2(1.0 / uStretch, 1.0);     // вытягиваем вдоль горизонта
  float f = uFrequency * 0.06;
  // В шторм море бушует: валы втрое выше и длиннее, гребни острее, бегут быстрее.
  // Шторм — не один огромный вал, а много острых гребней разного размера: море «кипит».
  float amp = 0.55 * uAmplitude * (1.0 + gStorm * 1.3);
  f *= 1.0 + gStorm * 0.15;
  // Острота — показатель степени: больше — острее пики и площе впадины. В шторм — сильно больше.
  float sharp = 1.6 + uChoppy * 3.0 + gStorm * 2.0;
  t *= 1.0 + gStorm * 0.8;
  float h = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    float lambda = 6.2832 / f;
    float fade = smoothstep(1.2, 4.0, lambda / footprint) * (i < 2 ? 1.0 : uDetail * 1.6);
    h += (swell((p + t) * f, sharp) + swell((p - t) * f, sharp)) * amp * fade;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p;        // поворот ~37° и масштаб ×2
    f *= 1.9;
    amp *= mix(0.22, 0.34, gStorm);   // в шторм мелкие гребни сильнее
    sharp = mix(sharp, 1.0, 0.2);
  }
  return h;
}

// Живая вода из симуляции (мягко гаснет к краям участка).
float liveWater(vec2 x) {
  vec2 uv = (x - PATCH_MIN) / PATCH;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  float fade = smoothstep(0.0, 0.15, uv.x) * smoothstep(1.0, 0.85, uv.x) * smoothstep(1.0, 0.55, uv.y);
  return texture(uSim, uv).r * fade;
}

// Круги от дождя по всему морю: сетка ячеек, в каждой — своя капля со своим
// моментом удара. splash — вспышка в момент удара (видна и вдали, где круги мельче пикселя).
float rainRipples(vec2 x, float footprint, out float splash, out float ring) {
  splash = 0.0;
  ring = 0.0;
  if (gRain <= 0.0) return 0.0;
  const float CELL = 0.55;
  vec2 base = floor(x / CELL - 0.5);
  float h = 0.0;
  for (int j = 0; j < 2; j++)
  for (int i = 0; i < 2; i++) {
    vec2 id = base + vec2(float(i), float(j));
    float t = uTime * 1.1 + hash(id * 3.1);
    float ph = fract(t);
    // Даже слабый дождь заметен: вероятность капли в ячейке растёт быстрее силы дождя.
    if (hash(id + floor(t) * 7.7) > min(1.0, gRain * 2.0)) continue;
    vec2 c = (id + 0.3 + 0.4 * hash2(id + floor(t))) * CELL;
    float d = length(x - c);
    // Кольцо не больше ~половины ячейки — иначе его обрезали бы края ячейки (квадраты).
    float r = ph * 0.26;
    float k = (1.0 - ph) * (1.0 - ph) * smoothstep(0.3, 0.2, d);
    float near = smoothstep(0.2, 0.5, 0.12 / footprint);
    h += sin((d - r) * 60.0) * exp(-abs(d - r) * 30.0) * k * near;
    // Светлая кромка круга — видна даже поверх высоких волн (одна рябь по наклону теряется).
    ring += exp(-abs(d - r) / (0.006 + footprint)) * k * smoothstep(0.05, 0.25, 0.12 / footprint);
    splash += exp(-d / 0.03) * smoothstep(0.2, 0.0, ph) * smoothstep(0.3, 0.15, footprint);
  }
  // Чем выше волны, тем сильнее круги — иначе они теряются на крутых склонах.
  return h * 0.05 * (0.6 + uAmplitude);
}

// Вдали, где круги мельче пикселя, капли видны всплесками-искрами. Их считаем
// в координатах экрана: сетка ячеек, в каждой — своя вспышка в свой момент.
float farSplashes(vec2 p, float footprint) {
  if (gRain <= 0.0) return 0.0;
  vec2 g = p * vec2(70.0, 140.0);
  vec2 id = floor(g);
  float t = uTime * 2.0 + hash(id * 1.3);
  float ph = fract(t);
  if (hash(id + floor(t) * 3.1) > gRain * 0.6) return 0.0;
  vec2 c = 0.25 + 0.5 * hash2(id + floor(t));
  float d = length((fract(g) - c) * vec2(1.0, 0.5));
  return smoothstep(0.22, 0.0, d) * smoothstep(0.35, 0.0, ph) * smoothstep(0.08, 0.4, footprint);
}

float heightAt(vec2 x, float t, float footprint) {
  return seaHeight(x, t, footprint, 5) + liveWater(x) * 0.6;
}

// Падающие капли — штрихи поверх кадра в трёх слоях (ближние крупнее и быстрее).
vec3 rainStreaks(vec2 p) {
  if (gRain <= 0.0) return vec3(0.0);
  vec2 q = rot(-radians(uRainAngle)) * p;
  float sum = 0.0;
  // Сверху капли летят почти на нас — видны короткими чёрточками, сбоку — длинными штрихами.
  float side = smoothstep(0.0, 0.45, uHorizon);
  float len = mix(0.12, 0.45, side);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 14.0 + fi * 10.0;
    vec2 g = q * scale / vec2(1.0, 6.0) + vec2(fi * 7.3, uTime * (9.0 - fi * 2.0));
    vec2 id = floor(g);
    vec2 f = fract(g);
    float present = step(hash(id + fi * 11.0), gRain * 0.8);
    float x = hash(id * 1.7 + 3.0) * 0.8 + 0.1;
    float head = hash(id * 2.3 + 7.0);
    float line = smoothstep(0.06, 0.0, abs(f.x - x)) * smoothstep(head - len, head, f.y) * step(f.y, head);
    sum += line * present * (0.55 - fi * 0.12);
  }
  sum *= mix(1.6, 1.0, side);   // короткие чёрточки чуть ярче, чтобы читались
  return gHor * sum * 0.6 + vec3(gFlash * sum * 0.4);
}

// Молния: когда бить — по слотам времени; вспышка с «двойным» мерцанием.
void setupLightning() {
  float slot = floor(uTime * 0.6);
  float ph = fract(uTime * 0.6);
  float on = step(hash(vec2(slot, 3.0)), gLightning * 0.55);
  gFlash = on * (exp(-ph * 16.0) + 0.7 * exp(-abs(ph - 0.12) * 45.0));
  // В пределах кадра при любых пропорциях холста.
  gBoltX = (hash(vec2(slot, 9.0)) * 2.0 - 1.0) * 0.38 * uResolution.x / uResolution.y;
  gBoltSeed = slot;
  gBoltNear = pow(hash(vec2(slot, 21.0)), 1.5);
  gBoltEnd = pitch() - gBoltNear * 0.38;
}

// Разряд: ломаная от верха кадра до воды. Ближний удар — ниже на экране,
// толще и ярче, а в точке удара по воде расходится вспышка.
vec3 bolt(vec2 p) {
  if (gFlash <= 0.01 || p.y < gBoltEnd - 0.03) return vec3(0.0);
  float y = p.y;
  float x = gBoltX + (fbm(vec2(y * 2.5, gBoltSeed)) - 0.5) * 0.5 + (noise(vec2(y * 30.0, gBoltSeed)) - 0.5) * 0.05;
  float d = abs(p.x - x);
  float w = 0.004 * (1.0 + gBoltNear * 2.5);
  float core = smoothstep(w, 0.0, d) * step(gBoltEnd, y);
  float glow = exp(-d * 70.0 / (1.0 + gBoltNear * 2.0)) * 0.5 * step(gBoltEnd, y);
  float xEnd = gBoltX + (fbm(vec2(gBoltEnd * 2.5, gBoltSeed)) - 0.5) * 0.5;
  float impact = exp(-length((p - vec2(xEnd, gBoltEnd)) * vec2(1.0, 3.0)) * 14.0) * (0.4 + gBoltNear);
  return vec3(0.9, 0.93, 1.0) * (core + glow + impact) * gFlash;
}

void main() {
  setupScene();
  setupLightning();
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed * 0.35;
  vec3 rd = rayDir(p);
  vec3 sd = sunDir();

  // Выше горизонта — небо.
  if (rd.y > -0.002) {
    vec3 col = sky(rd, 1.0);
    col = mix(col, gHor, exp(-rd.y * 40.0) * min(gHaze, 1.0) * 0.6);
    col = mix(col, gHor * 0.8, gRain * 0.35);     // в дождь небо серее
    // Тучи: в шторм небо затягивает тяжёлыми тёмными клубами.
    if (gStorm > 0.0) {
      // Проекция на «потолок» облаков; у горизонта тучи тают в дымке (иначе полосы).
      vec2 sp = rd.xz / (rd.y + 0.12) * 0.6 + vec2(uTime * 0.04, 0.0);
      float cl = fbm(sp + fbm(sp * 0.5 - uTime * 0.02) * 1.5);
      float fade = smoothstep(0.02, 0.2, rd.y);
      col = mix(col, gTop * 0.45 + gFlash * 0.4, smoothstep(0.35, 0.75, cl) * gStorm * 0.85 * fade);
    }
    fragColor = vec4(col + bolt(p) + rainStreaks(p), 1.0);
    return;
  }

  // Поиск поверхности (трассировка карты высот): идём по лучу, пока он не
  // окажется ниже воды. Ближний вал закрывает воду за собой — гребни видны
  // объёмом, а не только светом. Высота — по 2 крупным октавам (быстро).
  float LIFT = mix(0.18, 0.26, gStorm);   // во сколько раз «высота» волн поднимает воду
  vec3 ro = vec3(0.0, camH(), 0.0);
  float dist = camH() / -rd.y;   // плоскость — запасной вариант
  // Выше самого высокого гребня воды быть не может — с этой высоты и начинаем.
  float hMax = 2.6 * 0.55 * uAmplitude * (1.0 + gStorm * 1.3) * LIFT;
  float tt = max(0.0, (camH() - hMax) / -rd.y);
  for (int i = 0; i < 28; i++) {
    vec3 pos = ro + rd * tt;
    float above = pos.y - seaHeight(pos.xz, t, 0.002, 2) * LIFT;
    if (above < 0.002 + tt * 0.0015) { dist = tt; break; }
    tt += max(above * 0.75, 0.01 + tt * 0.004);
    if (tt > dist * 1.2) break;   // дальше плоскости не уйдём
  }
  vec2 x = (ro + rd * dist).xz;
  // Сколько единиц воды попадает в один пиксель (вдали — много).
  float footprint = dist * dist / camH() / uResolution.y * 1.5 + 0.002;

  float e = 0.01 + footprint;
  float splash;
  float ring;
  float dummy;
  float dummy2;
  float rr = rainRipples(x, footprint, splash, ring);
  float h = heightAt(x, t, footprint);
  vec3 n = normalize(vec3(
    heightAt(x - vec2(e, 0.0), t, footprint) - heightAt(x + vec2(e, 0.0), t, footprint)
      + rr - rainRipples(x + vec2(e, 0.0), footprint, dummy, dummy2),
    2.0 * e,
    heightAt(x - vec2(0.0, e), t, footprint) - heightAt(x + vec2(0.0, e), t, footprint)
      + rr - rainRipples(x + vec2(0.0, e), footprint, dummy, dummy2)));

  // Вода: в основном отражённое небо (Френель) — мягко и без резкого контраста.
  vec3 refl = reflect(rd, n);
  refl.y = abs(refl.y);
  float fresnel = clamp(0.04 + 0.96 * pow(1.0 - max(dot(n, -rd), 0.0), 3.0), 0.0, 1.0);
  float lit = max(dot(n, sd), 0.0);
  vec3 water = mix(gDeep, gLit, clamp(0.2 + h * 0.6, 0.0, 1.0)) * (0.55 + 0.45 * lit);
  // Гребни светлее толщи: свет проходит сквозь тонкую верхушку вала. В шторм это главное —
  // светлые острые гребни на почти чёрной воде.
  float crest = smoothstep(0.55, 1.0, h / max(1.1 * uAmplitude * (1.0 + gStorm * 1.3), 0.05));
  water += gLit * crest * (0.12 + gStorm * 0.45);
  vec3 col = mix(water, sky(refl, 0.2), fresnel * 0.85 + 0.1);
  // Блики солнца на гребнях.
  float spark = pow(max(dot(refl, sd), 0.0), 600.0 / uSunSize);
  col += gSun * spark * uGlitter * 4.0 * smoothstep(-0.15, 0.1, sd.y) * (1.0 - gStorm * 0.8);
  // Всплески капель.
  col += mix(gHor, vec3(1.0), 0.5) * (splash * min(1.0, gRain * 2.0) * 0.7 + farSplashes(p, footprint) * 0.55);
  col += mix(gHor, vec3(1.0), 0.6) * ring * min(1.0, gRain * 2.0) * 0.35;

  // Дымка: вдали вода растворяется в небе у горизонта.
  float fog = 1.0 - exp(-dist * gHaze * 0.045);
  col = mix(col, sky(normalize(vec3(rd.x, 0.02, rd.z)), 0.0), fog);
  fragColor = vec4(col + bolt(p) + rainStreaks(p), 1.0);
}`,
}
