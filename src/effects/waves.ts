import type { EffectDef } from './types'

/**
 * «Волны» — море до горизонта с небом и солнцем, вода откликается на мышь.
 *
 * Два шейдера:
 *   1. Симуляция (каждый кадр): высота «живой» воды в текстуре 256×256 —
 *      участок моря перед камерой. Классическая схема волнового уравнения:
 *      новая высота = (сумма 4 соседей / 2 − прошлая высота) × затухание.
 *      Мышь толкает воду, клик бросает каплю, «Дождь» — случайные капли.
 *   2. Картинка: для каждого пикселя — луч камеры. Выше горизонта — небо
 *      (градиент, солнце с ореолом). Ниже — точка на воде: высота = сумма
 *      волн (форма exp(sin − 1): острый гребень, пологая впадина) + живая
 *      вода из симуляции. По наклону — отражение неба (Френель), блёстки
 *      солнца, дымка к горизонту.
 *
 * Направления волн разведены «золотым углом» (137.5°) — они никогда не
 * совпадают, и вода не складывается в сетку из прямоугольников. Мелкие
 * волны вдали гаснут: они мельче пикселя и только рябили бы.
 */

/** Общее для обоих шейдеров: камера и участок воды под симуляцией. */
const SHARED = /* glsl */ `
const float CAM_H = 1.2;
// Участок моря под «живой» водой: x от −4 до 4, z (вдаль) от 0.3 до 8.3.
const vec2 PATCH_MIN = vec2(-4.0, 0.3);
const float PATCH = 8.0;

// Луч камеры для точки экрана: «Линия горизонта» поднимает и опускает взгляд.
vec3 rayDir(vec2 p) {
  float pitch = mix(0.6, 0.0, uHorizon);
  return normalize(vec3(p.x, p.y - pitch, 1.0));
}
// Точка на воде (y = 0) под лучом: доли холста → координаты моря.
vec2 waterAt(vec2 screen01) {
  vec2 p = (screen01 - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  vec3 rd = rayDir(p);
  return rd.xz * (CAM_H / max(-rd.y, 0.02));
}
`

export const waves: EffectDef = {
  id: 'waves',
  name: 'Волны',
  category: 'Фоны',
  kind: 'quad',
  description: 'Море с небом и солнцем: мышь толкает воду, клик — капля, дождь',
  usesMouse: true,
  params: {
    speed: { type: 'number', label: 'Скорость', min: 0, max: 3, step: 0.01, default: 0.8, hint: 'Как быстро бегут волны' },
    frequency: { type: 'number', label: 'Частота', min: 1, max: 20, step: 0.1, default: 5, hint: 'Длина волн: больше — мельче рябь' },
    amplitude: { type: 'number', label: 'Высота', min: 0, max: 2, step: 0.01, default: 0.7, hint: 'Насколько круты склоны волн' },
    choppy: { type: 'number', label: 'Неровность', min: 0, max: 1, step: 0.01, default: 0.45, hint: 'Острота гребней: 0 — мягкая зыбь, 1 — штормовые пики' },
    groups: { type: 'number', label: 'Рваность гребней', min: 0, max: 1, step: 0.01, default: 0.75, hint: '0 — длинные ровные гребни через весь кадр, 1 — короткие волны, которые возникают и гаснут' },
    horizon: { type: 'number', label: 'Линия горизонта', min: 0, max: 1, step: 0.01, default: 0.6, hint: '0 — смотрим на воду сверху, неба не видно; 1 — горизонт посередине кадра' },
    haze: { type: 'number', label: 'Дымка', min: 0, max: 2, step: 0.01, default: 0.6, hint: 'Туман у горизонта: вода вдали растворяется в небе' },
    sunHeight: { type: 'number', label: 'Высота солнца, °', min: -10, max: 80, step: 1, default: 12, hint: 'Ниже — длиннее солнечная дорожка на воде; меньше нуля — солнце за горизонтом' },
    sunSide: { type: 'number', label: 'Солнце слева–справа, °', min: -60, max: 60, step: 1, default: 0, hint: 'Где солнце по горизонтали' },
    sunSize: { type: 'number', label: 'Размер солнца', min: 0.3, max: 4, step: 0.01, default: 1, hint: 'Диск и ореол вокруг него' },
    glitter: { type: 'number', label: 'Блёстки', min: 0, max: 3, step: 0.01, default: 1, hint: 'Яркие искры солнца на гребнях' },
    push: { type: 'number', label: 'Мышь толкает воду', min: 0, max: 3, step: 0.01, default: 1, hint: 'Сила волны, которую оставляет курсор при движении. 0 — вода курсор не чувствует' },
    drop: { type: 'number', label: 'Сила капли (клик)', min: 0, max: 3, step: 0.01, default: 1, hint: 'Насколько сильные круги от клика' },
    dropSize: { type: 'number', label: 'Размер капли', min: 0.05, max: 1.2, step: 0.01, default: 0.3, hint: 'Радиус удара — от клика, курсора и дождя' },
    rain: { type: 'number', label: 'Дождь', min: 0, max: 1, step: 0.01, default: 0, hint: 'Сила дождя: капли падают в кадре и расходятся кругами по воде. 0 — без дождя' },
    rainAngle: { type: 'number', label: 'Наклон дождя, °', min: -40, max: 40, step: 1, default: 8, hint: 'Ветер сносит капли вбок' },
    damping: { type: 'number', label: 'Затухание кругов', min: 0.9, max: 0.999, step: 0.001, default: 0.985, hint: 'Ближе к 1 — круги бегут дольше и дальше' },
    deep: { type: 'color', label: 'Глубина', default: '#04121f', hint: 'Цвет воды в тени и в глубине' },
    shallow: { type: 'color', label: 'Вода на свету', default: '#1f6f8f', hint: 'Цвет освещённых склонов' },
    skyTop: { type: 'color', label: 'Небо вверху', default: '#3f86d9', hint: 'Цвет неба в зените' },
    skyHorizon: { type: 'color', label: 'Небо у горизонта', default: '#cfe4f2', hint: 'Цвет неба и дымки у горизонта' },
    sun: { type: 'color', label: 'Солнце', default: '#fff3d6', hint: 'Цвет солнца, ореола и блёсток' },
  },
  presets: [
    { name: 'День', values: { sunHeight: 35, sunSide: -20, skyTop: '#3f86d9', skyHorizon: '#cfe4f2', sun: '#fff8e6', deep: '#04121f', shallow: '#1f6f8f', haze: 0.5 } },
    { name: 'Рассвет', values: { sunHeight: 4, skyTop: '#6b6fa8', skyHorizon: '#ffc79a', sun: '#ffd27a', deep: '#1a1726', shallow: '#6f5a6e', haze: 1.2, amplitude: 0.5, choppy: 0.25 } },
    { name: 'Закат', values: { sunHeight: 2, sunSide: 10, skyTop: '#2b1b4f', skyHorizon: '#ff8a5c', sun: '#ffb36b', deep: '#120a1c', shallow: '#5b2a4a', haze: 0.9, glitter: 1.6 } },
    { name: 'Шторм', values: { sunHeight: 30, skyTop: '#2a3140', skyHorizon: '#5d6675', sun: '#aab4c2', deep: '#05080d', shallow: '#26394a', amplitude: 1.4, choppy: 0.9, speed: 1.6, frequency: 4, haze: 1.6, glitter: 0.3, rain: 0.8, rainAngle: 18 } },
    { name: 'Ночь', values: { sunHeight: 18, sunSize: 0.6, skyTop: '#02040c', skyHorizon: '#121a33', sun: '#dfe8ff', deep: '#010309', shallow: '#0d1c33', haze: 0.7, glitter: 1.4, amplitude: 0.5 } },
    { name: 'Бассейн сверху', values: { horizon: 0, deep: '#0a4a6e', shallow: '#3fc2d9', amplitude: 0.25, choppy: 0, frequency: 9, speed: 0.4, glitter: 0.6, rain: 0.15, damping: 0.99 } },
  ],
  simulation: {
    size: 256,
    fragment:
      SHARED +
      /* glsl */ `
// Удар по воде: опускаем её «колоколом» радиуса r.
float hit(vec2 x, vec2 at, float r) { return smoothstep(r, 0.0, length(x - at)); }

void main() {
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
  // Дождь: на каждом шаге до 8 капель в случайных местах участка (сила дождя — вероятность).
  for (int i = 0; i < 8; i++) {
    vec2 r = hash2(vec2(uSimStep * 0.137 + float(i) * 17.31, float(i) * 3.7 + uSimStep * 0.071));
    if (hash(r * 91.7 + uSimStep) < uRain * uRain * 0.35) h -= 0.5 * hit(x, PATCH_MIN + r * PATCH, 0.04 + uDropSize * 0.12);
  }
  // У края участка вода гасится — круги не отражаются от «стенки».
  float edge = smoothstep(0.0, 0.06, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
  fragColor = vec4(h * edge, s.r, 0.0, 1.0);
}`,
  },
  fragment:
    SHARED +
    /* glsl */ `
vec3 sunDir() {
  float el = radians(uSunHeight);
  float az = radians(uSunSide);
  return normalize(vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el)));
}

// Небо: градиент + солнечный диск + ореол. disc — яркость диска (в отражении
// диск приглушён: дорожку на воде рисуют блёстки, иначе вышла бы ровная полоса).
vec3 sky(vec3 d, float disc) {
  float y = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyTop, pow(y, 0.45));
  float a = acos(clamp(dot(d, sunDir()), -1.0, 1.0));
  float r = 0.018 * uSunSize;
  col += uSun * (smoothstep(r, r * 0.75, a) * 3.0 * disc + exp(-a / (0.12 * uSunSize)) * 0.45 + exp(-a / (0.6 * uSunSize)) * 0.15);
  return col;
}

// Высота волн; мелкие волны вдали гаснут (они мельче пикселя).
// Чистая синусоида — бесконечно длинный прямой гребень, и на воде видны
// ровные полосы через весь кадр. Поэтому каждую волну (1) изгибаем медленным
// шумом — гребни кривые — и (2) гасим «пачками»: амплитуда умножается на шум,
// гребень живёт отрезок и пропадает, как настоящие группы волн.
float waveHeight(vec2 x, float t, float footprint) {
  float h = 0.0, sum = 0.0, amp = 1.0;
  float f = uFrequency * 0.22;
  vec2 bend = vec2(noise(x * 0.11 + t * 0.03), noise(x * 0.11 + 17.0 - t * 0.03)) - 0.5;
  // Главная волна бежит к зрителю (как зыбь к берегу) — тогда солнечная
  // дорожка рассыпается на блики, а не тянется ровной полосой.
  vec2 dir = normalize(vec2(0.35, 1.0));
  for (int i = 0; i < 9; i++) {
    float lambda = 6.2832 / f;
    float w = amp * smoothstep(1.5, 5.0, lambda / footprint);
    vec2 xb = x + bend * lambda * 1.6;
    // Группы волн: шум, вытянутый вдоль гребня, — отрезки разной длины.
    vec2 across = vec2(-dir.y, dir.x);
    float group = noise(vec2(dot(x, across) * f * 0.12, dot(x, dir) * f * 0.05) + float(i) * 13.1 + t * 0.05);
    w *= mix(1.0, smoothstep(0.2, 0.75, group) * 1.6, uGroups);
    float phase = dot(xb, dir) * f + t * sqrt(f) * 1.6 + float(i) * 1.7;
    h += w * exp((sin(phase) - 1.0) * (1.0 + uChoppy * 2.5));
    sum += amp;
    amp *= 0.6;
    f *= 1.37;
    dir = rot(2.39996) * dir;   // золотой угол
  }
  return h / sum;
}

// Живая вода из симуляции (0 вне участка, мягко гаснет к его краям).
float liveWater(vec2 x) {
  vec2 uv = (x - PATCH_MIN) / PATCH;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  // К краям участка (особенно к дальнему) живая вода плавно гаснет — без видимой границы.
  float fade = smoothstep(0.0, 0.15, uv.x) * smoothstep(1.0, 0.85, uv.x) * smoothstep(1.0, 0.55, uv.y);
  return texture(uSim, uv).r * fade;
}

float heightAt(vec2 x, float t, float footprint) {
  return waveHeight(x, t, footprint) * uAmplitude * 0.55 + liveWater(x) * 0.6;
}

// Падающие капли — штрихи поверх кадра в трёх слоях (ближние крупнее и быстрее).
// Каждый слой — сетка вытянутых ячеек; в части ячеек — капля со своей фазой.
vec3 rainStreaks(vec2 p) {
  if (uRain <= 0.0) return vec3(0.0);
  float a = radians(uRainAngle);
  vec2 q = rot(-a) * p;
  float sum = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float scale = 14.0 + fi * 10.0;
    vec2 cellSize = vec2(1.0, 6.0) / scale;
    vec2 g = q / cellSize + vec2(fi * 7.3, uTime * (9.0 - fi * 2.0));
    vec2 id = floor(g);
    vec2 f = fract(g);
    float present = step(hash(id + fi * 11.0), uRain * 0.8);
    float x = hash(id * 1.7 + 3.0) * 0.8 + 0.1;
    float head = hash(id * 2.3 + 7.0);
    float line = smoothstep(0.06, 0.0, abs(f.x - x)) * smoothstep(head - 0.45, head, f.y) * step(f.y, head);
    sum += line * present * (0.55 - fi * 0.12);
  }
  return uSkyHorizon * sum * 0.6;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float t = uTime * uSpeed;
  vec3 rd = rayDir(p);
  vec3 sd = sunDir();

  // Выше горизонта — небо.
  if (rd.y > -0.002) {
    vec3 col = sky(rd, 1.0);
    // Дымка прижимается к горизонту.
    col = mix(col, uSkyHorizon, exp(-rd.y * 40.0) * min(uHaze, 1.0) * 0.6);
    col = mix(col, uSkyHorizon * 0.8, uRain * 0.35);   // в дождь небо серее
    fragColor = vec4(col + rainStreaks(p), 1.0);
    return;
  }

  float dist = CAM_H / -rd.y;
  vec2 x = rd.xz * dist;
  // Сколько метров воды попадает в один пиксель (вдали — много).
  float footprint = dist * dist / CAM_H / uResolution.y * 1.5 + 0.002;

  float e = 0.01 + footprint;
  float h = heightAt(x, t, footprint);
  vec3 n = normalize(vec3(
    heightAt(x - vec2(e, 0.0), t, footprint) - heightAt(x + vec2(e, 0.0), t, footprint),
    2.0 * e,
    heightAt(x - vec2(0.0, e), t, footprint) - heightAt(x + vec2(0.0, e), t, footprint)));

  // Отражение неба (Френель) + свет на склонах.
  vec3 refl = reflect(rd, n);
  refl.y = abs(refl.y);
  float fresnel = 0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
  vec3 water = mix(uDeep, uShallow, clamp(0.25 + h * 0.8, 0.0, 1.0)) * (0.45 + 0.55 * max(dot(n, sd), 0.0));
  vec3 col = mix(water, sky(refl, 0.25), fresnel);
  // Блёстки: узкий блик солнца на склонах, обращённых к нему.
  float spark = pow(max(dot(refl, sd), 0.0), 900.0 / uSunSize);
  col += uSun * spark * uGlitter * 6.0 * smoothstep(-0.15, 0.1, sd.y);

  // Дымка: вдали вода растворяется в небе у горизонта.
  float fog = 1.0 - exp(-dist * uHaze * 0.035);
  col = mix(col, sky(normalize(vec3(rd.x, 0.02, rd.z)), 0.0), fog);
  // Всплески: где живая вода резко пошла вниз (свежая капля) — светлое пятнышко.
  col += uSkyHorizon * clamp(-liveWater(x) * 3.0 - 0.6, 0.0, 1.0) * uRain * 0.8;
  fragColor = vec4(col + rainStreaks(p), 1.0);
}`,
}
