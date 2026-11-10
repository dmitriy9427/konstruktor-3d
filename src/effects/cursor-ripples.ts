import type { EffectDef } from './types'

/**
 * «Круги на воде» — раздел «Курсоры», шейдерный курсор (kind quad + overlay).
 *
 * Образец курсора с симуляцией. overlay: true — холст прозрачный, лежит поверх
 * всей страницы и пропускает клики. Страницу шейдер не видит, поэтому «воду»
 * рисуем одним светом: блик на склоне волны, обращённом к свету, тень — на обратном.
 *
 * Два шейдера:
 *   simulation — шаг физики. Состояние живёт в текстуре: r — высота воды, g — её
 *     скорость. Каждый шаг точка тянется к среднему соседей (волновое уравнение),
 *     курсор и клики добавляют высоту. Рантайм делает 60 шагов в секунду и даёт
 *     прошлое состояние как uState, клики — как uClicks[4] (x, y, сила).
 *   fragment — картинка: читает высоты из uSim, считает наклон, красит.
 */

// ── Шаг симуляции ──
const SIM = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uSimRes;
  vec2 px = 1.0 / uSimRes;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec4 s = texture(uState, uv);
  float h = s.r, v = s.g;

  // Соседи. Текстура квадратная, а экран — нет: чтобы круги были круглыми, а не
  // овалами, соседям по длинной стороне экрана даём меньший вес.
  float hl = texture(uState, uv - vec2(px.x, 0.0)).r, hr = texture(uState, uv + vec2(px.x, 0.0)).r;
  float hd = texture(uState, uv - vec2(0.0, px.y)).r, hu = texture(uState, uv + vec2(0.0, px.y)).r;
  vec2 w = vec2(1.0 / (aspect * aspect), 1.0);
  w /= max(w.x, w.y);
  float pull = (w.x * (hl + hr - 2.0 * h) + w.y * (hd + hu - 2.0 * h)) * 0.5;

  v += pull * uSpeed;          // ускорение — к среднему соседей
  v *= uDamping;               // вода успокаивается
  h += v;

  // Курсор: чем быстрее движение, тем выше волна.
  vec2 q = uv * vec2(aspect, 1.0);
  float d = length(q - uMouse * vec2(aspect, 1.0));
  float move = min(length(uMouseVel), 3.0);
  h += exp(-d * d / (uRadius * uRadius)) * move * uStrength * 0.12 * uMouseActive;

  // Клики — капли (сила 0 — клика в этом шаге нет).
  for (int i = 0; i < 4; i++) {
    vec4 c = uClicks[i];
    float dc = length(q - c.xy * vec2(aspect, 1.0));
    h -= exp(-dc * dc / (uRadius * uRadius * 4.0)) * c.z * uDrop * 0.2;
  }

  // У края экрана волна гаснет — без отражения от «бортов».
  float border = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  h *= mix(0.9, 1.0, smoothstep(0.0, 0.05, border));
  fragColor = vec4(clamp(h, -4.0, 4.0), clamp(v, -4.0, 4.0), 0.0, 1.0);
}`

// ── Картинка ──
const IMAGE = /* glsl */ `
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 px = 1.0 / uSimRes;
  float aspect = uResolution.x / uResolution.y;
  float h = texture(uSim, uv).r;
  float hl = texture(uSim, uv - vec2(px.x, 0.0)).r, hr = texture(uSim, uv + vec2(px.x, 0.0)).r;
  float hd = texture(uSim, uv - vec2(0.0, px.y)).r, hu = texture(uSim, uv + vec2(0.0, px.y)).r;
  // Наклон поверхности: разница высот соседей по горизонтали и вертикали.
  vec2 slope = vec2((hr - hl) / aspect, hu - hd);
  // Свет сверху-слева: склон к свету — блик, от света — тень.
  float lit = dot(slope, normalize(vec2(-1.0, 1.0))) * uContrast * 40.0;
  // Гребень волны (точка выше соседей) собирает свет в тонкую яркую линию, как на дне бассейна.
  float crest = max(0.0, 4.0 * h - hl - hr - hd - hu) * uContrast * 60.0;
  // 1 − exp(−x): мягкий потолок — сильная волна не выгорает в белое пятно.
  float light = 1.0 - exp(-(max(lit, 0.0) + crest));
  float shade = clamp(-lit, 0.0, 1.0) * uShadow;
  // Прозрачный холст: цвет уже умножен на альфу. Блик прибавляет свет, тень — только альфу.
  vec3 col = uColor * light + vec3(1.0) * pow(light, 3.0) * 0.5;
  fragColor = vec4(col, clamp(light * 0.85 + shade, 0.0, 1.0));
}`

export const ripplesCursor: EffectDef = {
  // ── Паспорт ──
  id: 'cursor-ripples',
  name: 'Круги на воде',
  category: 'Курсоры',
  kind: 'quad',
  overlay: true,
  description: 'Страница как гладь воды: курсор гонит рябь, клик роняет каплю',
  usesMouse: true,
  // Быстрый отклик: воде инерция курсора не нужна.
  defaultCommon: { inertia: 0.03 },

  // ── Ползунки ──
  params: {
    radius: { type: 'number', label: 'Ширина следа', min: 0.008, max: 0.08, step: 0.001, default: 0.022, hint: 'Размер волны от курсора (доля высоты экрана)' },
    strength: { type: 'number', label: 'Сила ряби', min: 0.1, max: 3, step: 0.01, default: 1, hint: 'Высота волн от движения курсора' },
    speed: { type: 'number', label: 'Скорость волн', min: 0.1, max: 0.95, step: 0.01, default: 0.7, hint: 'Как быстро круги разбегаются' },
    damping: { type: 'number', label: 'Долгота кругов', min: 0.95, max: 0.998, step: 0.001, default: 0.991, hint: 'Ближе к 1 — вода успокаивается дольше' },
    drop: { type: 'number', label: 'Капля по клику', min: 0, max: 3, step: 0.01, default: 1.2, hint: 'Сила всплеска от клика; 0 — клики не действуют' },
    contrast: { type: 'number', label: 'Блики', min: 0.2, max: 3, step: 0.01, default: 1, hint: 'Яркость света на волнах' },
    shadow: { type: 'number', label: 'Тени', min: 0, max: 1, step: 0.01, default: 0.45, hint: 'Затемнение на обратном склоне волны — добавляет объём на светлых страницах' },
    color: { type: 'color', label: 'Цвет бликов', default: '#bfe9ff' },
    // Этот параметр читает не шейдер, а Студия и экспорт (прячут стрелку мыши).
    hideCursor: { type: 'boolean', label: 'Скрыть обычный курсор', default: false, hint: 'Стрелка мыши прячется — остаётся только эффект' },
  },

  // ── Пресеты ──
  presets: [
    { name: 'Вода', values: {} },
    { name: 'Ртуть', values: { color: '#ffffff', contrast: 1.8, shadow: 0.8, damping: 0.975, radius: 0.03 } },
    { name: 'Неон', values: { color: '#ff4fd8', contrast: 2.2, shadow: 0, damping: 0.992, strength: 1.6 } },
    { name: 'Тихая заводь', values: { strength: 0.5, speed: 0.4, damping: 0.994, radius: 0.04, contrast: 0.8, drop: 2 } },
  ],

  simulation: { size: 256, fragment: SIM },
  fragment: IMAGE,
}
