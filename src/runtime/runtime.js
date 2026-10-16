/**
 * Рантайм шейдерных эффектов 3D-конструктора.
 *
 * Этот файл — сердце проекта и работает в двух местах:
 *   1. в Студии — показывает превью;
 *   2. в экспортированном коде — Студия вставляет его ТЕКСТ целиком в файл,
 *      который вы забираете. Поэтому здесь нет ни одного import: файл
 *      самодостаточен, и «что видите в превью — то и получаете в проекте».
 *
 * Эффект — это фрагментный шейдер (GLSL) плюс описание параметров:
 *   { fragment: 'void main() { … fragColor = … }', params: { speed: { type: 'number', … } } }
 * Каждый параметр становится uniform-переменной: speed → uSpeed, colorA → uColorA.
 *
 * Что рантайм берёт на себя:
 *   - WebGL2, один полноэкранный треугольник, сборку шейдера;
 *   - общие uniform: время, размер, мышь (с инерцией), наведение, прокрутка;
 *   - картинку-текстуру (для эффектов «искажение изображения»);
 *   - слайды: несколько картинок и анимированный переход между ними;
 *   - симуляцию: состояние (например, высота воды) живёт в текстуре и
 *     пересчитывается своим шейдером каждый кадр — круги от капель, мышь толкает воду;
 *   - постобработку: зерно, хроматическая аберрация, виньетка, свечение;
 *   - экономию: кадры только пока эффект на экране, «уменьшить движение»,
 *     потолок плотности пикселей и его автоматическое снижение при просадке FPS;
 *   - статистику для панели производительности.
 */

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

/**
 * Общий GLSL, доступный каждому эффекту: uniform-переменные и функции шума.
 * hash/noise/fbm — «плавная случайность» для облаков, лавы, сияния.
 */
export const COMMON = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uMouse;
uniform float uMouseActive;
uniform vec2 uMouseVel;
uniform float uHover;
uniform float uScroll;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// Координаты «как у фото с object-fit: cover»: картинка заполняет блок без искажения пропорций.
vec2 coverUv(vec2 uv, vec2 box, vec2 img) {
  float rb = box.x / box.y, ri = img.x / img.y;
  vec2 s = rb > ri ? vec2(1.0, ri / rb) : vec2(rb / ri, 1.0);
  return (uv - 0.5) * s + 0.5;
}
`

const POST_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uTime;
uniform float uGrain;
uniform float uChroma;
uniform float uVignette;
uniform float uBloom;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 dir = uv - 0.5;
  // Хроматическая аберрация: красный и синий каналы чуть расходятся к краям.
  float ca = uChroma * 0.008;
  vec3 col = vec3(texture(uScene, uv + dir * ca).r, texture(uScene, uv).g, texture(uScene, uv - dir * ca).b);
  // Свечение: яркие места «расплываются» вокруг себя (два кольца выборок).
  if (uBloom > 0.0) {
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5236;
      vec2 o = vec2(cos(a), sin(a)) / uResolution;
      glow += max(texture(uScene, uv + o * 6.0).rgb - 0.5, 0.0);
      glow += max(texture(uScene, uv + o * 16.0).rgb - 0.5, 0.0) * 0.6;
    }
    col += glow / 12.0 * uBloom * 1.6;
  }
  col *= mix(1.0, smoothstep(1.15, 0.2, length(dir) * 1.35), uVignette);
  // Зерно: шум, который меняется каждый кадр, — «плёнка».
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5) * uGrain * 0.16;
  fragColor = vec4(col, 1.0);
}`

/** Имя uniform-переменной параметра: speed → uSpeed. */
export const uniformName = (key) => `u${key[0].toUpperCase()}${key.slice(1)}`

/** '#ff8800' / '#f80' → [1, 0.53, 0]. */
export function hexToRgb(hex) {
  let h = String(hex).trim().replace('#', '')
  if (h.length === 3) h = h.replace(/./g, '$&$&')
  const n = parseInt(h, 16)
  if (!Number.isFinite(n) || h.length !== 6) return [1, 1, 1]
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** GLSL-тип параметра. */
const glslType = (param) => (param.type === 'color' ? 'vec3' : 'float')

/**
 * Параметр «точки» (например, своё созвездие): строка «x,y,c;x,y,c…», где x, y —
 * доли холста (0…1, y вверх), c = 1 — соединить линией с предыдущей точкой.
 * В шейдере — массив vec3 и число точек: uName[max], uNameCount.
 */
export function parsePoints(value, max = 32) {
  return String(value ?? '')
    .split(';')
    .map((s) => s.split(',').map(Number))
    .filter((p) => p.length >= 2 && p.every(Number.isFinite))
    .slice(0, max)
    .map(([x, y, c = 1]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)), c ? 1 : 0])
}

/** Объявления uniform для параметров (текст в шейдер не уходит). */
function declarations(params) {
  return Object.entries(params)
    .filter(([, param]) => param.type !== 'text')
    .map(([key, param]) =>
      param.type === 'points'
        ? `uniform vec3 ${uniformName(key)}[${param.max ?? 32}];\nuniform float ${uniformName(key)}Count;`
        : `uniform ${glslType(param)} ${uniformName(key)};`,
    )
    .join('\n')
}

/** Значение параметра → то, что уходит в uniform. */
export function uniformValue(param, value) {
  if (param.type === 'color') return hexToRgb(value)
  if (param.type === 'boolean') return value ? 1 : 0
  if (param.type === 'select') return Math.max(0, param.options.findIndex((o) => o.value === value))
  return Number(value)
}

/** Собрать полный текст фрагментного шейдера эффекта. */
export function buildFragment(spec) {
  const decls = declarations(spec.params)
  const image = spec.image ? 'uniform sampler2D uImage;\nuniform vec2 uImageRes;\n' : ''
  // Слайды: «откуда» и «куда» + прогресс перехода 0…1 и направление (1 — вперёд, −1 — назад).
  const slides = spec.images
    ? `uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec2 uFromRes;
uniform vec2 uToRes;
uniform float uProgress;
uniform float uDirection;
vec3 fromAt(vec2 uv) { return texture(uFrom, coverUv(uv, uResolution, uFromRes)).rgb; }
vec3 toAt(vec2 uv) { return texture(uTo, coverUv(uv, uResolution, uToRes)).rgb; }
`
    : ''
  // Симуляция: результат прошлого шага — текстура uSim (её пишет buildSimulation).
  const sim = spec.simulation ? 'uniform sampler2D uSim;\nuniform vec2 uSimRes;\n' : ''
  return `#version 300 es\n${COMMON}\n${image}${decls}\n${slides}${sim}out vec4 fragColor;\n${spec.fragment}`
}

/**
 * Шейдер шага симуляции. Читает прошлое состояние (uState), пишет новое.
 * Доступны те же общие uniform и параметры эффекта, плюс клики мыши этого
 * шага: uClicks[i] = (x, y в долях холста, сила, 0); сила 0 — клика нет.
 */
export function buildSimulation(spec) {
  const decls = declarations(spec.params)
  return `#version 300 es\n${COMMON}\n${decls}\nuniform sampler2D uState;\nuniform vec2 uSimRes;\nuniform vec4 uClicks[4];\nuniform float uSimStep;\nout vec4 fragColor;\n${spec.simulation.fragment}`
}

const DEFAULT_POST = { grain: 0, chroma: 0, vignette: 0, bloom: 0 }

/**
 * Запустить эффект на canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {import('./runtime').EffectSpec} spec
 * @param {import('./runtime').EffectOptions} [options]
 * @returns {import('./runtime').EffectInstance}
 */
export function createEffect(canvas, spec, options = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false })
  if (!gl) throw new Error('WebGL2 недоступен')

  const opts = {
    mouse: true,
    inertia: 0.12,
    quality: 1.5,
    adaptive: true,
    reducedMotion: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    pauseOffscreen: true,
    /** Засыпать через столько секунд без действий пользователя (0 — никогда). */
    sleepAfter: 0,
    /** Не больше стольких кадров в секунду (0 — сколько даёт экран). */
    maxFps: 0,
    ...options,
    post: { ...DEFAULT_POST, ...options.post },
  }
  const values = { ...defaultsOf(spec.params), ...spec.values }
  let destroyed = false

  // ─── Шейдеры ──────────────────────────────────────────────────────────────
  const compile = (type, source) => {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`Ошибка шейдера: ${log}`)
    }
    return shader
  }
  const link = (fragmentSource) => {
    const program = gl.createProgram()
    const vs = compile(gl.VERTEX_SHADER, VERTEX)
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSource)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.bindAttribLocation(program, 0, 'aPos')
    gl.linkProgram(program)
    gl.deleteShader(vs)
    gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Ошибка сборки: ${gl.getProgramInfoLog(program)}`)
    const cache = new Map()
    const loc = (name) => {
      if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name))
      return cache.get(name)
    }
    return { program, loc }
  }

  const main = link(buildFragment(spec))
  const post = link(POST_FRAGMENT)

  // ─── Симуляция (если эффект её описал) ────────────────────────────────────
  // Две текстуры с плавающей точкой по очереди («пинг-понг»): шаг читает одну,
  // пишет в другую. Нужен рендер в float-текстуру (EXT_color_buffer_float) —
  // его нет на части старых телефонов; тогда эффект работает без симуляции.
  const simulation = (() => {
    if (!spec.simulation || !gl.getExtension('EXT_color_buffer_float')) return null
    const size = spec.simulation.size ?? 256
    const make = () => {
      const texture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, size, size, 0, gl.RGBA, gl.HALF_FLOAT, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const framebuffer = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return { texture, framebuffer }
    }
    return { size, program: link(buildSimulation(spec)), a: make(), b: make(), step: 0, pending: 0 }
  })()
  // Клики мыши по холсту — капли, удары; уходят в один ближайший шаг симуляции.
  const clicks = []
  const onDown = (event) => {
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width
    const y = 1 - (event.clientY - rect.top) / rect.height
    if (x < 0 || x > 1 || y < 0 || y > 1 || !simulation) return
    clicks.push([x, y, 1])
    if (clicks.length > 4) clicks.shift()
    requestDraw()
  }
  globalThis.addEventListener?.('pointerdown', onDown, { passive: true })

  // Один треугольник больше экрана накрывает его целиком — дешевле двух для прямоугольника.
  const vao = gl.createVertexArray()
  gl.bindVertexArray(vao)
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  // ─── Картинка (для эффектов изображения) ──────────────────────────────────
  // Текстура = { texture, size }. Одна для эффектов картинки, по одной на слайд.
  const textures = []
  const loadTexture = (source, slot) => {
    const img = typeof source === 'string' ? Object.assign(new Image(), { src: source }) : source
    const upload = () => {
      if (destroyed || !img.naturalWidth) return
      slot.texture ??= gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, slot.texture)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      slot.size = [img.naturalWidth, img.naturalHeight]
      requestDraw()
    }
    if (img.complete && img.naturalWidth) upload()
    else img.addEventListener('load', upload, { once: true })
  }
  const imageSlot = { texture: null, size: [1, 1] }
  const loadImage = (source) => loadTexture(source, imageSlot)
  const slideSlots = (spec.images ?? []).map(() => ({ texture: null, size: [1, 1] }))
  textures.push(imageSlot, ...slideSlots)

  // ─── Слайды ───────────────────────────────────────────────────────────────
  // Переход: from → to, прогресс едет 0 → 1 за duration секунд. Длительность и
  // автопрокрутку рантайм читает из параметров эффекта (duration, autoplay).
  const slide = { from: 0, to: 0, progress: 1, direction: 1, active: false, idle: 0 }
  const slideCount = slideSlots.length
  const goTo = (index, direction) => {
    if (!slideCount) return
    const next = ((index % slideCount) + slideCount) % slideCount
    if (next === slide.to && !slide.active) return
    // Новый переход во время старого начинается с того слайда, что уже виден.
    slide.from = slide.active && slide.progress > 0.5 ? slide.to : slide.active ? slide.from : slide.to
    slide.to = next
    slide.direction = direction ?? (next >= slide.from ? 1 : -1)
    slide.progress = 0
    slide.active = true
    slide.idle = 0
    if (opts.reducedMotion) {
      slide.progress = 1
      slide.active = false
    }
    requestDraw()
  }
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)

  // ─── Кадр для постобработки ───────────────────────────────────────────────
  let fbo = null
  let fboTexture = null
  const postEnabled = () => opts.post.grain > 0 || opts.post.chroma > 0 || opts.post.vignette > 0 || opts.post.bloom > 0
  const ensureFbo = () => {
    fboTexture ??= gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, fboTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    fbo ??= gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboTexture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  // ─── Размер и качество ────────────────────────────────────────────────────
  // Плотность пикселей не выше quality: на экране с плотностью 3 это экономит
  // в разы, а для мягких шейдеров разницы не видно. Если кадры не успевают —
  // плотность снижается сама (adaptiveScale).
  let adaptiveScale = 1
  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    const dpr = Math.min(globalThis.devicePixelRatio || 1, opts.quality) * adaptiveScale
    const w = Math.max(1, Math.round(rect.width * dpr))
    const h = Math.max(1, Math.round(rect.height * dpr))
    if (canvas.width === w && canvas.height === h) return
    canvas.width = w
    canvas.height = h
    if (fbo) ensureFbo()
    requestDraw()
  }

  // ─── Мышь, наведение, прокрутка ───────────────────────────────────────────
  // Мышь — в долях блока (0…1, y вверх, как в шейдере). Цель меняется сразу,
  // а значение для шейдера догоняет её с инерцией.
  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, tactive: 0, hover: 0, thover: 0 }
  const onMove = (event) => {
    const rect = canvas.getBoundingClientRect()
    pointer.tx = (event.clientX - rect.left) / rect.width
    pointer.ty = 1 - (event.clientY - rect.top) / rect.height
    const inside = pointer.tx >= 0 && pointer.tx <= 1 && pointer.ty >= 0 && pointer.ty <= 1
    pointer.tactive = inside ? 1 : 0
    pointer.thover = inside ? 1 : 0
    requestDraw()
  }
  const onLeave = () => {
    pointer.tactive = 0
    pointer.thover = 0
  }
  globalThis.addEventListener?.('pointermove', onMove, { passive: true })
  document.addEventListener('pointerleave', onLeave)

  // ─── Экономия: засыпание без действий пользователя ───────────────────────
  // Мышь, прокрутка, клавиши, касания — «пользователь здесь». Если ничего не было
  // sleepAfter секунд, кадры перестают рисоваться; любое действие будит эффект.
  let lastActivity = performance.now()
  const onActivity = () => {
    const wasAsleep = !awake()
    lastActivity = performance.now()
    if (wasAsleep) requestDraw()
  }
  const awake = () => !opts.sleepAfter || performance.now() - lastActivity < opts.sleepAfter * 1000
  const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'scroll', 'keydown', 'touchstart']
  for (const name of ACTIVITY_EVENTS) globalThis.addEventListener?.(name, onActivity, { passive: true, capture: true })

  // uScroll: 0…1. Обычно — как блок проезжает через экран (появился снизу → ушёл вверх).
  // С opts.scrollStack — как прокручен «липкий» стек: блок стоит на месте, пока
  // стек проезжает, и прогресс идёт от верха стека у верха экрана до его конца.
  const scrollProgress = () => {
    const vp = opts.scroller ? opts.scroller.getBoundingClientRect() : { top: 0, height: globalThis.innerHeight || 1 }
    if (opts.scrollStack) {
      const r = opts.scrollStack.getBoundingClientRect()
      const run = r.height - vp.height
      return run > 0 ? Math.min(1, Math.max(0, (vp.top - r.top) / run)) : 0
    }
    const rect = canvas.getBoundingClientRect()
    return Math.min(1, Math.max(0, (vp.top + vp.height - rect.top) / (vp.height + rect.height)))
  }
  // Прокрутка будит кадр (эффект мог стоять: «уменьшить движение», пауза).
  const onScrollDraw = () => opts.scrollStack && requestDraw()
  ;(opts.scroller ?? globalThis).addEventListener?.('scroll', onScrollDraw, { passive: true })

  // ─── Цикл кадров ──────────────────────────────────────────────────────────
  let visible = true
  let paused = false
  let frame = 0
  let time = spec.startTime ?? 4
  let last = 0
  let slowFrames = 0
  const stats = { name: spec.name ?? 'эффект', fps: 0, cpuMs: 0, gpuMs: null, dpr: 1, drawCalls: 0, width: 0, height: 0 }
  let fpsFrames = 0
  let fpsStart = 0

  // Время видеокарты — через расширение (есть не везде; где нет — null).
  const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  let query = null

  // Слайдеру кадры нужны только во время перехода (и для автопрокрутки).
  const onScreen = () => visible || !opts.pauseOffscreen
  const running = () => !destroyed && onScreen() && awake() && !paused && !opts.reducedMotion && (!slideCount || slide.active || Number(values.autoplay) > 0)

  function requestDraw() {
    if (!frame && !destroyed) frame = requestAnimationFrame(tick)
  }

  function tick(now) {
    frame = 0
    if (destroyed) return
    // Потолок FPS: рано для нового кадра — ждём следующего обновления экрана.
    if (opts.maxFps > 0 && last && now - last < 1000 / opts.maxFps - 2) {
      frame = requestAnimationFrame(tick)
      return
    }
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60
    last = now
    const cpuStart = performance.now()

    // Время идёт, только пока анимация запущена: разовая перерисовка (размер,
    // новые параметры) у спящего или стоящего эффекта не сдвигает кадр.
    if (running()) time += dt
    if (slide.active) {
      slide.progress = Math.min(1, slide.progress + dt / Math.max(0.05, Number(values.duration ?? 1.2)))
      if (slide.progress >= 1) {
        slide.active = false
        slide.from = slide.to
      }
    } else if (slideCount > 1 && Number(values.autoplay) > 0 && visible && !paused && !opts.reducedMotion) {
      slide.idle += dt
      if (slide.idle >= Number(values.autoplay)) goTo(slide.to + 1, 1)
    }
    const k = 1 - Math.exp(-dt * (1 / Math.max(opts.inertia, 0.001)) * 0.25)
    const follow = opts.mouse && !opts.reducedMotion
    pointer.x += ((follow ? pointer.tx : 0.5) - pointer.x) * k
    pointer.y += ((follow ? pointer.ty : 0.5) - pointer.y) * k
    pointer.active += ((follow ? pointer.tactive : 0) - pointer.active) * k
    pointer.hover += (pointer.thover - pointer.hover) * Math.min(1, dt * 6)
    // Скорость мыши (доли холста в секунду) — чтобы «толкать» воду сильнее при быстром движении.
    pointer.vx = (pointer.x - (pointer.px ?? pointer.x)) / Math.max(dt, 1e-3)
    pointer.vy = (pointer.y - (pointer.py ?? pointer.y)) / Math.max(dt, 1e-3)
    pointer.px = pointer.x
    pointer.py = pointer.y
    // Симуляция — 60 шагов в секунду при любой частоте экрана (на 120 Гц круги не бегут вдвое быстрее).
    if (simulation && running()) simulation.pending = Math.min(3, (simulation.pending ?? 0) + dt * 60)

    draw()

    stats.cpuMs = performance.now() - cpuStart
    fpsFrames++
    if (now - fpsStart > 500) {
      stats.fps = Math.round((fpsFrames * 1000) / (now - fpsStart))
      fpsFrames = 0
      fpsStart = now
    }
    // Адаптивное качество: полсекунды подряд кадр дольше 24 мс — снижаем плотность.
    if (opts.adaptive && dt > 0.024) {
      if (++slowFrames > 30 && adaptiveScale > 0.5) {
        adaptiveScale = Math.max(0.5, adaptiveScale - 0.15)
        slowFrames = 0
        resize()
      }
    } else slowFrames = Math.max(0, slowFrames - 1)

    const settling = Math.abs(pointer.hover - pointer.thover) > 0.001
    if (running() || settling) requestDraw()
    else last = 0
  }

  /** Общие uniform — одинаковые для шага симуляции и основного шейдера. */
  function setCommon(program) {
    gl.uniform2f(program.loc('uResolution'), canvas.width, canvas.height)
    gl.uniform1f(program.loc('uTime'), time)
    gl.uniform2f(program.loc('uMouse'), pointer.x, pointer.y)
    gl.uniform1f(program.loc('uMouseActive'), pointer.active)
    gl.uniform2f(program.loc('uMouseVel'), pointer.vx || 0, pointer.vy || 0)
    gl.uniform1f(program.loc('uHover'), pointer.hover)
    gl.uniform1f(program.loc('uScroll'), scrollProgress())
    for (const [key, param] of Object.entries(spec.params)) {
      if (param.type === 'text') continue
      if (param.type === 'points') {
        const max = param.max ?? 32
        const pts = parsePoints(values[key], max)
        const data = new Float32Array(max * 3)
        pts.forEach((p, i) => data.set(p, i * 3))
        gl.uniform3fv(program.loc(`${uniformName(key)}[0]`), data)
        gl.uniform1f(program.loc(`${uniformName(key)}Count`), pts.length)
        continue
      }
      const value = uniformValue(param, values[key])
      if (Array.isArray(value)) gl.uniform3fv(program.loc(uniformName(key)), value)
      else gl.uniform1f(program.loc(uniformName(key)), value)
    }
  }

  /** Один шаг симуляции: читаем a, пишем в b, меняем местами. */
  function stepSimulation() {
    const { program, size } = simulation
    gl.bindFramebuffer(gl.FRAMEBUFFER, simulation.b.framebuffer)
    gl.viewport(0, 0, size, size)
    gl.useProgram(program.program)
    setCommon(program)
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, simulation.a.texture)
    gl.uniform1i(program.loc('uState'), 4)
    gl.uniform2f(program.loc('uSimRes'), size, size)
    gl.uniform1f(program.loc('uSimStep'), simulation.step++)
    const data = new Float32Array(16)
    clicks.splice(0).forEach((c, i) => data.set([c[0], c[1], c[2], 0], i * 4))
    gl.uniform4fv(program.loc('uClicks'), data)
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    ;[simulation.a, simulation.b] = [simulation.b, simulation.a]
  }

  function draw() {
    // Симуляция шагает, только пока анимация идёт (спящий эффект — вода замерла).
    if (simulation) {
      if (clicks.length && simulation.pending < 1) simulation.pending = 1
      for (; simulation.pending >= 1; simulation.pending--) stepSimulation()
    }
    const usePost = postEnabled()
    if (usePost && !fbo) ensureFbo()
    if (timer && !query) {
      query = gl.createQuery()
      gl.beginQuery(timer.TIME_ELAPSED_EXT, query)
    } else if (query) readQuery()

    gl.bindFramebuffer(gl.FRAMEBUFFER, usePost ? fbo : null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(main.program)
    setCommon(main)
    if (spec.simulation) {
      // Нет float-текстур — uSim останется пустой (нулевой) текстурой: вода без кругов.
      gl.activeTexture(gl.TEXTURE5)
      gl.bindTexture(gl.TEXTURE_2D, simulation ? simulation.a.texture : null)
      gl.uniform1i(main.loc('uSim'), 5)
      gl.uniform2f(main.loc('uSimRes'), simulation?.size ?? 1, simulation?.size ?? 1)
    }
    if (spec.image) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, imageSlot.texture)
      gl.uniform1i(main.loc('uImage'), 0)
      gl.uniform2f(main.loc('uImageRes'), imageSlot.size[0], imageSlot.size[1])
    }
    if (slideCount) {
      const from = slideSlots[slide.active ? slide.from : slide.to]
      const to = slideSlots[slide.to]
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, from.texture)
      gl.uniform1i(main.loc('uFrom'), 2)
      gl.activeTexture(gl.TEXTURE3)
      gl.bindTexture(gl.TEXTURE_2D, to.texture)
      gl.uniform1i(main.loc('uTo'), 3)
      gl.uniform2f(main.loc('uFromRes'), from.size[0], from.size[1])
      gl.uniform2f(main.loc('uToRes'), to.size[0], to.size[1])
      gl.uniform1f(main.loc('uProgress'), slide.active ? easeInOut(slide.progress) : 1)
      gl.uniform1f(main.loc('uDirection'), slide.direction)
    }
    gl.bindVertexArray(vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    stats.drawCalls = 1

    if (usePost) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(post.program)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, fboTexture)
      gl.uniform1i(post.loc('uScene'), 1)
      gl.uniform2f(post.loc('uResolution'), canvas.width, canvas.height)
      gl.uniform1f(post.loc('uTime'), time)
      gl.uniform1f(post.loc('uGrain'), opts.post.grain)
      gl.uniform1f(post.loc('uChroma'), opts.post.chroma)
      gl.uniform1f(post.loc('uVignette'), opts.post.vignette)
      gl.uniform1f(post.loc('uBloom'), opts.post.bloom)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      stats.drawCalls = 2
    }
    if (query && timer && !queryEnded) {
      gl.endQuery(timer.TIME_ELAPSED_EXT)
      queryEnded = true
    }
    stats.dpr = canvas.width / Math.max(1, canvas.getBoundingClientRect().width)
    stats.width = canvas.width
    stats.height = canvas.height
  }

  let queryEnded = false
  function readQuery() {
    if (!queryEnded) return
    const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)
    const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT)
    if (available || disjoint) {
      if (available && !disjoint) stats.gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6
      gl.deleteQuery(query)
      query = null
      queryEnded = false
    }
  }

  // ─── Видимость ────────────────────────────────────────────────────────────
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  let io = null
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) requestDraw()
    })
    io.observe(canvas)
  }
  resize()
  if (spec.image) loadImage(spec.image)
  spec.images?.forEach((source, i) => loadTexture(source, slideSlots[i]))
  requestDraw()

  const registry = (globalThis.__K3D_EFFECTS__ ??= new Set())
  registry.add(stats)

  return {
    stats,
    /** Поменять значения параметров (цвет, скорость…). */
    set(next) {
      Object.assign(values, next)
      requestDraw()
    },
    /** Поменять общие настройки: мышь, инерция, качество, постобработка. */
    setOptions(next) {
      const { post: nextPost, ...rest } = next
      Object.assign(opts, rest)
      if (nextPost) Object.assign(opts.post, nextPost)
      if ('quality' in next) {
        adaptiveScale = 1
        resize()
      }
      requestDraw()
    },
    /** Новая картинка для эффектов изображения: адрес или <img>. */
    setImage: loadImage,
    /** Слайды: следующий, предыдущий, по номеру. */
    next() {
      goTo(slide.to + 1, 1)
    },
    prev() {
      goTo(slide.to - 1, -1)
    },
    goTo(index) {
      goTo(index)
    },
    /** Номер слайда, который показан (или к которому идёт переход). */
    get index() {
      return slide.to
    },
    play() {
      paused = false
      requestDraw()
    },
    pause() {
      paused = true
    },
    destroy() {
      destroyed = true
      if (frame) cancelAnimationFrame(frame)
      ro.disconnect()
      io?.disconnect()
      globalThis.removeEventListener?.('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      for (const name of ACTIVITY_EVENTS) globalThis.removeEventListener?.(name, onActivity, { capture: true })
      ;(opts.scroller ?? globalThis).removeEventListener?.('scroll', onScrollDraw)
      registry.delete(stats)
      gl.deleteProgram(main.program)
      gl.deleteProgram(post.program)
      globalThis.removeEventListener?.('pointerdown', onDown)
      if (simulation) {
        gl.deleteProgram(simulation.program.program)
        for (const target of [simulation.a, simulation.b]) {
          gl.deleteTexture(target.texture)
          gl.deleteFramebuffer(target.framebuffer)
        }
      }
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      for (const slot of textures) if (slot.texture) gl.deleteTexture(slot.texture)
      if (fboTexture) gl.deleteTexture(fboTexture)
      if (fbo) gl.deleteFramebuffer(fbo)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

/** Значения по умолчанию из описания параметров. */
export function defaultsOf(params) {
  return Object.fromEntries(Object.entries(params).map(([key, param]) => [key, param.default]))
}
