import type { EffectDef } from './types'

/**
 * Эффекты фото на симуляции следа мыши (текстура uSim, как вода в «Волнах»).
 *
 *   «Жидкая маска» — фото спрятано; где прошёл курсор, оно проявляется
 *     «каплей»: в симуляции копится плотность следа, её немного уносит
 *     вихревой поток и она тает. В картинке плотность обрезается порогом с
 *     мягким краем — соседние пятна слипаются в каплю, как ртуть (тот же
 *     приём, что фильтр goo у жидкой кнопки, только в шейдере).
 *   «Жидкое искажение» — в симуляции хранится скорость (rg): мышь толкает
 *     её, скорость переносится сама собой и затухает. Картинка читается со
 *     сдвигом на эту скорость, каналы расходятся там, где течёт сильнее.
 */

const CURL = /* glsl */ `
vec2 curl(vec2 p, float t) {
  float e = 0.01;
  float n1 = noise(p + vec2(0.0, e) + t), n2 = noise(p - vec2(0.0, e) + t);
  float n3 = noise(p + vec2(e, 0.0) + t), n4 = noise(p - vec2(e, 0.0) + t);
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * h);
}
`

export const imageMask: EffectDef = {
  id: 'image-mask',
  name: 'Жидкая маска',
  category: 'Изображения',
  kind: 'image',
  description: 'Фото проявляется жидкой каплей там, где прошёл курсор',
  usesMouse: true,
  defaultCommon: { inertia: 0.05 },
  params: {
    size: { type: 'number', label: 'Размер капли', min: 0.03, max: 0.4, step: 0.005, default: 0.12 },
    trail: { type: 'number', label: 'Длина следа', min: 0.9, max: 0.995, step: 0.001, default: 0.975, hint: 'Ближе к 1 — проявленное держится дольше' },
    goo: { type: 'number', label: 'Липкость', min: 0, max: 1, step: 0.01, default: 0.6, hint: 'Насколько пятна сливаются в одну каплю' },
    wobble: { type: 'number', label: 'Колыхание края', min: 0, max: 1, step: 0.01, default: 0.5 },
    flow: { type: 'number', label: 'Течение', min: 0, max: 2, step: 0.01, default: 0.6, hint: 'Капля медленно растекается' },
    idle: { type: 'boolean', label: 'Капля в покое', default: true, hint: 'Когда мыши нет — в центре живёт небольшая капля, чтобы было понятно, что тут что-то есть' },
    background: { type: 'color', label: 'Фон', default: '#f6f1e7' },
    rim: { type: 'color', label: 'Кромка', default: '#ff6b9d', hint: 'Тонкая цветная кромка капли' },
  },
  presets: [
    { name: 'Светлый', values: {} },
    { name: 'Тёмный', values: { background: '#07060f', rim: '#22d3ee' } },
    { name: 'Большие капли', values: { size: 0.22, goo: 0.85, trail: 0.985, flow: 1.2 } },
  ],
  simulation: {
    size: 256,
    fragment:
      CURL +
      /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uSimRes;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 q = uv * vec2(aspect, 1.0);
  vec2 vel = curl(q * 3.0, uTime * 0.05) * uFlow * 0.03;
  float prev = texture(uState, uv - vel / 60.0 / vec2(aspect, 1.0)).r * pow(uTrail, 1.0);
  vec2 now = uMouse * vec2(aspect, 1.0);
  vec2 before = (uMouse - uMouseVel / 60.0) * vec2(aspect, 1.0);
  float add = exp(-pow(segment(q, before, now) / uSize, 2.0)) * uMouseActive;
  // Капля в покое: в центре, дышит.
  float idle = uIdle * (1.0 - uMouseActive) * exp(-pow(length(q - vec2(0.5 * aspect, 0.5)) / (uSize * (1.2 + 0.2 * sin(uTime * 1.5))), 2.0)) * 0.05;
  fragColor = vec4(min(prev + add * 0.9 + idle, 2.0), 0.0, 0.0, 1.0);
}`,
  },
  fragment: /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float d = texture(uSim, uv).r;
  d += (fbm(uv * vec2(aspect, 1.0) * 6.0 + uTime * 0.2) - 0.5) * 0.35 * uWobble;
  float th = 0.5;
  float w = mix(0.25, 0.03, uGoo);
  float m = smoothstep(th - w, th + w, d);
  float rim = smoothstep(th - w - 0.06, th - w, d) * (1.0 - m);
  vec3 photo = texture(uImage, coverUv(uv, uResolution, uImageRes)).rgb;
  vec3 col = mix(uBackground, photo, m);
  col = mix(col, uRim, rim * 0.9);
  fragColor = vec4(col, 1.0);
}`,
}

export const imageFlow: EffectDef = {
  id: 'image-flow',
  name: 'Жидкое искажение',
  category: 'Изображения',
  kind: 'image',
  description: 'Курсор «размешивает» фото, след течёт и успокаивается',
  usesMouse: true,
  defaultCommon: { inertia: 0.04 },
  params: {
    strength: { type: 'number', label: 'Сила', min: 0, max: 2, step: 0.01, default: 0.8 },
    radius: { type: 'number', label: 'Ширина следа', min: 0.03, max: 0.4, step: 0.005, default: 0.1 },
    settle: { type: 'number', label: 'Успокаивается', min: 0.9, max: 0.995, step: 0.001, default: 0.965, hint: 'Ближе к 1 — вода дольше колышется' },
    split: { type: 'number', label: 'Расслоение цвета', min: 0, max: 2, step: 0.01, default: 0.6, hint: 'Каналы расходятся там, где течёт сильнее' },
    swirl: { type: 'number', label: 'Завихрения', min: 0, max: 2, step: 0.01, default: 0.5 },
    shine: { type: 'number', label: 'Блики', min: 0, max: 2, step: 0.01, default: 0.4, hint: 'Светлые блики на «волнах» следа' },
  },
  presets: [
    { name: 'Вода', values: {} },
    { name: 'Глитч', values: { split: 2, strength: 1.2, shine: 0, swirl: 0 } },
    { name: 'Масло', values: { settle: 0.985, strength: 0.6, split: 0.2, swirl: 1.4, shine: 0.8 } },
  ],
  simulation: {
    size: 256,
    fragment:
      CURL +
      /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uSimRes;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 q = uv * vec2(aspect, 1.0);
  vec2 v = texture(uState, uv).rg;
  // Скорость переносит сама себя (адвекция) и чуть закручивается.
  v = texture(uState, uv - v * 0.004).rg;
  v += curl(q * 4.0, uTime * 0.1) * uSwirl * 0.002 * length(v);
  v *= uSettle;
  vec2 now = uMouse * vec2(aspect, 1.0);
  vec2 before = (uMouse - uMouseVel / 60.0) * vec2(aspect, 1.0);
  float near = exp(-pow(segment(q, before, now) / uRadius, 2.0)) * uMouseActive;
  v += uMouseVel * near * 0.6;
  fragColor = vec4(clamp(v, -4.0, 4.0), 0.0, 1.0);
}`,
  },
  fragment: /* glsl */ `
vec3 photo(vec2 uv) { return texture(uImage, coverUv(uv, uResolution, uImageRes)).rgb; }

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 v = texture(uSim, uv).rg;
  vec2 off = -v * 0.12 * uStrength;
  float mag = length(v);
  vec2 sp = normalize(v + 1e-5) * min(mag, 2.0) * 0.006 * uSplit;
  vec3 col = vec3(photo(uv + off + sp).r, photo(uv + off).g, photo(uv + off - sp).b);
  // Блик: где поле скорости резко меняется — «гребень» волны.
  vec2 e = vec2(1.0) / uResolution * 2.0;
  float dv = length(texture(uSim, uv + vec2(e.x, 0.0)).rg - texture(uSim, uv - vec2(e.x, 0.0)).rg)
           + length(texture(uSim, uv + vec2(0.0, e.y)).rg - texture(uSim, uv - vec2(0.0, e.y)).rg);
  col += vec3(1.0) * smoothstep(0.05, 0.6, dv) * 0.25 * uShine;
  fragColor = vec4(col, 1.0);
}`,
}
