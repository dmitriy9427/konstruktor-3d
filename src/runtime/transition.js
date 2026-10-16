/**
 * Переходы между секциями: «прожигание», растворение, шторка.
 *
 * Как и runtime.js, файл самодостаточен: Студия вставляет его текст в экспорт.
 *
 * Главная идея — секция остаётся НАСТОЯЩЕЙ (текст, ссылки, видео работают):
 *
 *   1. Один раз считаем «поле времени»: для каждой точки секции — число 0…1,
 *      КОГДА она прогорит. Точки около очагов — раньше, дальние — позже,
 *      плюс шум, чтобы фронт был рваным. Поле выравниваем по рангу:
 *      прогресс 0.3 = прогорело ровно 30 % площади.
 *   2. ДЫРЫ режет минимальный SVG-фильтр (CSS filter: url(#…)) из трёх шагов:
 *      картинка поля → порог → «секция там, где поле больше порога».
 *      Каждый кадр меняется одно число. Это дёшево даже на ретине.
 *   3. ОГОНЬ (жёлтый и оранжевый край), копоть, свечение и пепел рисует
 *      один WebGL-холст поверх секции — шейдер читает то же поле, поэтому
 *      огонь ложится ровно по краю дыр. Почему не тем же фильтром: каждый
 *      полноэкранный слой SVG-фильтра на ретине стоит десятки миллисекунд
 *      (замеры — docs/11-transitions.md), а шейдер рисует всё за один проход.
 *   4. Пепел рождается там, где поле около порога, — это и есть горящий край.
 *
 * Запуск (trigger):
 *   scroll — прогресс привязан к прокрутке (секция в «липком» стеке);
 *   appear — проигрывается, когда секция показалась на экране;
 *   manual — только из кода: play(), reverse(), progress(0.5).
 */

let uid = 0

// ─── Шум на процессоре (как noise/fbm в шейдерах, только в JS) ──────────────
function makeNoise(seed) {
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295
  }
  const smooth = (t) => t * t * (3 - 2 * t)
  const noise = (x, y) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = smooth(x - xi)
    const v = smooth(y - yi)
    const a = hash(xi, yi)
    const b = hash(xi + 1, yi)
    const c = hash(xi, yi + 1)
    const d = hash(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  return (x, y) => {
    let v = 0
    let a = 0.5
    for (let i = 0; i < 5; i++) {
      v += a * noise(x, y)
      x = x * 2.03 + 17.1
      y = y * 2.03 + 3.7
      a *= 0.5
    }
    return v
  }
}

/** Случайные числа с зерном: одинаковое зерно — одинаковые очаги. */
function makeRandom(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1
  return () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
}

/**
 * Поле времени прогорания. Возвращает ранги (0…1) и порядок клеток по рангу.
 * pattern: points — из нескольких очагов; noise — везде сразу (растворение);
 * up / down — снизу вверх / сверху вниз; center — из центра.
 */
export function buildField(width, height, v) {
  const fbm = makeNoise(v.seed)
  const random = makeRandom(v.seed)
  const aspect = width / height
  const count = Math.max(1, Math.round(v.points))
  const centers = Array.from({ length: count }, () => [0.1 + random() * 0.8, 0.1 + random() * 0.8])
  const raw = new Float32Array(width * height)
  const rough = v.roughness
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / (width - 1)
      const w = y / (height - 1) // 0 — верх
      // Крупный шум — форма фронта, мелкий — рваный край.
      const n = fbm(u * aspect * v.scale, w * v.scale) - 0.5 + (fbm(u * aspect * v.scale * 6 + 40, w * v.scale * 6) - 0.5) * 0.35
      let base
      if (v.pattern === 'noise') base = 0
      else if (v.pattern === 'up') base = 1 - w
      else if (v.pattern === 'down') base = w
      else if (v.pattern === 'center') base = Math.hypot((u - 0.5) * aspect, w - 0.5)
      else {
        base = Infinity
        for (const [cx, cy] of centers) base = Math.min(base, Math.hypot((u - cx) * aspect, w - cy))
      }
      raw[y * width + x] = base + n * (v.pattern === 'noise' ? 1 : rough)
    }
  }
  // Выравнивание по рангу: значение клетки = её место в очереди на прогорание.
  const order = new Uint32Array(raw.length)
  for (let i = 0; i < order.length; i++) order[i] = i
  order.sort((a, b) => raw[a] - raw[b])
  const rank = new Float32Array(raw.length)
  for (let i = 0; i < order.length; i++) rank[order[i]] = i / (order.length - 1)
  return { width, height, rank, order }
}

/** Поле → серая картинка (data URL) для feImage. */
function fieldToImage(field) {
  const canvas = document.createElement('canvas')
  canvas.width = field.width
  canvas.height = field.height
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(field.width, field.height)
  for (let i = 0; i < field.rank.length; i++) {
    const g = Math.round(field.rank[i] * 255)
    img.data[i * 4] = g
    img.data[i * 4 + 1] = g
    img.data[i * 4 + 2] = g
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

const SVG = 'http://www.w3.org/2000/svg'
const node = (name, attrs = {}, children = []) => {
  const el = document.createElementNS(SVG, name)
  for (const [k, val] of Object.entries(attrs)) el.setAttribute(k, String(val))
  for (const child of children) el.append(child)
  return el
}

/**
 * Шейдер огня: для каждого пикселя поверх секции берём значение поля f и
 * сравниваем с порогом t. d = f − t: меньше нуля — дыра, чуть больше — горит.
 */
const EMBER_VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

const EMBER_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec4 uRect;        // секция в пикселях холста: x, y (снизу), ширина, высота
uniform float uT;          // порог
uniform float uEdge;       // ширина огненного края (в долях поля)
uniform float uChar;
uniform float uGlow;
uniform float uTime;
uniform vec3 uHot;
uniform vec3 uEmber;
uniform vec3 uSoot;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 uv = (gl_FragCoord.xy - uRect.xy) / uRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
  float f = texture(uField, vec2(uv.x, 1.0 - uv.y)).r;
  float d = f - uT;
  float aa = fwidth(f) * 1.5 + 1e-4;           // сглаживание края в один пиксель
  float e = max(uEdge, 1e-4);
  // Мерцание жара: шум, который меняется во времени.
  float flicker = 0.8 + 0.2 * hash(floor(gl_FragCoord.xy / 3.0) + floor(uTime * 12.0));
  vec4 col = vec4(0.0);
  // Копоть: от края огня внутрь секции, темнеет к огню.
  float soot = (1.0 - smoothstep(e, e * 3.5, d)) * smoothstep(-aa, aa, d - e * 0.5) * uChar;
  col = vec4(uSoot, 1.0) * soot * 0.9;
  // Огненный край: жёлтый у самой дыры → оранжевый → копоть.
  float band = smoothstep(-aa, aa, d) * (1.0 - smoothstep(e - aa, e + aa, d));
  vec3 fire = mix(uHot, uEmber, smoothstep(0.0, e, d)) * flicker;
  col = mix(col, vec4(fire, 1.0), band * step(0.0001, uEdge));
  // Свечение: и в дыру, и на секцию. Цвет без альфы — складывается со всем, что под ним.
  // В сторону дыры гаснет вдвое быстрее — открывшаяся секция остаётся чистой.
  float glow = exp(-(d < 0.0 ? -d * 2.2 : d) / (e * 1.6 + 0.004)) * uGlow * 0.5;
  col.rgb += uEmber * glow * flicker;
  fragColor = col;
}`

const ASH_VERTEX = `#version 300 es
in vec4 aParticle;   // x, y (пиксели холста, y снизу), жизнь, размер
uniform vec2 uCanvas;
out float vLife;
void main() {
  gl_Position = vec4(aParticle.xy / uCanvas * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = aParticle.w;
  vLife = aParticle.z;
}`

const ASH_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 uHot;
uniform vec3 uEmber;
in float vLife;
out vec4 fragColor;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.2, 0.5, d)) * min(1.0, vLife * 1.6);
  // Цвет: жёлтый → оранжевый → серый пепел.
  vec3 c = vLife > 0.6 ? mix(uEmber, uHot, (vLife - 0.6) / 0.4) : mix(vec3(0.35, 0.33, 0.31), uEmber, vLife / 0.6);
  fragColor = vec4(c * a, a);
}`

/**
 * Запустить переход на элементе.
 * @param {HTMLElement} el — секция, которая прогорит (за ней видно то, что под ней)
 * @param {Record<string, unknown>} values — параметры вида (см. DEFAULTS)
 * @param {object} [options] — { trigger, duration, scroller, stack, once, onComplete }
 */
export function createTransition(el, values = {}, options = {}) {
  const v = { ...DEFAULTS, ...values }
  const opts = { trigger: v.trigger, duration: v.duration, once: false, scroller: null, onComplete: null, ...options }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const id = `k3d-burn-${++uid}`
  const stats = { name: v.name ?? 'переход', fps: 0, cpuMs: 0, gpuMs: null, dpr: 1, drawCalls: 0, width: 0, height: 0 }

  // ─── Поле ─────────────────────────────────────────────────────────────────
  const rect0 = el.getBoundingClientRect()
  const fw = 256
  const fh = Math.max(48, Math.min(512, Math.round(fw / Math.max(0.2, (rect0.width || 16) / (rect0.height || 9)))))
  const field = buildField(fw, fh, v)
  const edge = Math.max(0, v.edge)
  // Запас: при p = 0 порог чуть меньше нуля (ничего не горит), при p = 1 прогорают и края.
  const tail = edge * 3.5 + 0.01
  const threshold = (p) => -0.01 + p * (1 + tail + 0.01)

  // ─── Дыры: минимальный SVG-фильтр ─────────────────────────────────────────
  const slope = 1 / Math.max(0.0015, v.softness)
  const image = node('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'img' })
  const href = fieldToImage(field)
  image.setAttribute('href', href)
  image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href)
  const keep = node('feFuncA', { type: 'linear', slope, intercept: 0 })
  const filter = node(
    'filter',
    { id, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', x: 0, y: 0, 'color-interpolation-filters': 'sRGB' },
    [
      image,
      node('feColorMatrix', { in: 'img', type: 'luminanceToAlpha', result: 'field' }),
      node('feComponentTransfer', { in: 'field', result: 'keep' }, [keep]),
      node('feComposite', { in: 'SourceGraphic', in2: 'keep', operator: 'in' }),
    ],
  )
  const svg = node('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' }, [node('defs', {}, [filter])])
  Object.assign(svg.style, { position: 'absolute', width: '0', height: '0', overflow: 'hidden' })
  document.body.append(svg)

  const resize = () => {
    for (const target of [filter, image]) {
      target.setAttribute('width', String(el.offsetWidth))
      target.setAttribute('height', String(el.offsetHeight))
    }
    stats.width = el.offsetWidth
    stats.height = el.offsetHeight
  }
  const ro = new ResizeObserver(resize)
  ro.observe(el)
  resize()

  // ─── Огонь и пепел: WebGL-холст поверх секции ─────────────────────────────
  // Холст кладём в тот же контейнер, сразу ПОСЛЕ секции, и каждый кадр
  // ставим на её место (с запасом PAD вокруг — для свечения и пепла). Так он в
  // том же слое, что и секция: окна, шапки и модалки остаются поверх него, а
  // контейнер с overflow обрезает его вместе с секцией. Создаётся при первом
  // кадре перехода; нет WebGL2 — переход работает без огня.
  const PAD = 80
  const fx = { canvas: null, gl: null, ember: null, ash: null, buffer: null, ashBuffer: null, failed: false }
  const wantsFx = !reduced && (edge > 0 || v.glow > 0 || v.char > 0 || v.ash > 0)
  const ensureFx = () => {
    if (fx.gl || fx.failed || !wantsFx) return Boolean(fx.gl)
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    const parent = el.parentElement ?? document.body
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative'
    const z = getComputedStyle(el).zIndex
    // max-width: none — частый сброс стилей «canvas { max-width: 100% }» сжал бы холст,
    // и огонь съехал бы с края дыр (холст шире секции на PAD с каждой стороны).
    Object.assign(canvas.style, { position: 'absolute', left: '0', top: '0', maxWidth: 'none', maxHeight: 'none', pointerEvents: 'none', zIndex: z === 'auto' ? '' : z })
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false })
    if (!gl) {
      fx.failed = true
      return false
    }
    el.after(canvas)
    const program = (vs, fs) => {
      const p = gl.createProgram()
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const sh = gl.createShader(type)
        gl.shaderSource(sh, src)
        gl.compileShader(sh)
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`Ошибка шейдера перехода: ${gl.getShaderInfoLog(sh)}`)
        gl.attachShader(p, sh)
        gl.deleteShader(sh)
      }
      gl.bindAttribLocation(p, 0, vs.includes('aPos') ? 'aPos' : 'aParticle')
      gl.linkProgram(p)
      const loc = new Map()
      return { p, u: (name) => (loc.has(name) ? loc.get(name) : loc.set(name, gl.getUniformLocation(p, name)).get(name)) }
    }
    fx.ember = program(EMBER_VERTEX, EMBER_FRAGMENT)
    fx.ash = program(ASH_VERTEX, ASH_FRAGMENT)
    fx.buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, fx.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    fx.ashBuffer = gl.createBuffer()
    // Поле — текстура из одного канала (те же ранги, что и в картинке фильтра).
    const bytes = new Uint8Array(field.rank.length)
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(field.rank[i] * 255)
    fx.texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, fx.texture)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, field.width, field.height, 0, gl.RED, gl.UNSIGNED_BYTE, bytes)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    fx.canvas = canvas
    fx.gl = gl
    return true
  }
  const hotRgb = hex(v.hot)
  const emberRgb = hex(v.ember)
  const sootRgb = hex(v.soot)
  const particles = []
  let visualTime = 0

  const spawn = (count, t) => {
    if (!count || v.ash <= 0) return
    // Частицы живут в координатах секции (px от её левого верхнего угла) — едут вместе с ней.
    const r = { width: el.offsetWidth, height: el.offsetHeight }
    const n = field.order.length
    const from = Math.floor(Math.min(1, Math.max(0, t)) * (n - 1))
    const to = Math.min(n - 1, from + Math.max(1, Math.floor(Math.max(edge, 0.01) * n)))
    for (let i = 0; i < count && particles.length < 900; i++) {
      const cell = field.order[from + Math.floor(Math.random() * (to - from + 1))]
      const cx = ((cell % field.width) + Math.random()) / field.width
      const cy = (Math.floor(cell / field.width) + Math.random()) / field.height
      particles.push({
        x: cx * r.width,
        y: cy * r.height,
        vx: (Math.random() - 0.5) * 30,
        vy: -20 - Math.random() * 60,
        life: 1,
        decay: 0.5 + Math.random() * 0.9,
        size: 1.2 + Math.random() * 4,
        spin: Math.random() * 6.28,
      })
    }
  }

  const drawFx = (dt) => {
    const active = current > 0 && current < 1
    if (!active && !particles.length) {
      if (fx.canvas) fx.canvas.style.display = 'none'
      return
    }
    if (!ensureFx()) return
    const { gl, canvas } = fx
    canvas.style.display = ''
    // Ставим холст на место секции (у «липкой» секции место меняется при прокрутке).
    const r = el.getBoundingClientRect()
    const pr = canvas.parentElement.getBoundingClientRect()
    const parent = canvas.parentElement
    const cssW = r.width + PAD * 2
    const cssH = r.height + PAD * 2
    canvas.style.transform = `translate(${r.left - pr.left - parent.clientLeft + parent.scrollLeft - PAD}px, ${r.top - pr.top - parent.clientTop + parent.scrollTop - PAD}px)`
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5)
    const w = Math.round(cssW * dpr)
    const h = Math.round(cssH * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    visualTime += dt
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    let draws = 0
    if (active && (edge > 0 || v.glow > 0 || v.char > 0)) {
      const { p, u } = fx.ember
      gl.useProgram(p)
      gl.bindBuffer(gl.ARRAY_BUFFER, fx.buffer)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, fx.texture)
      gl.uniform1i(u('uField'), 0)
      gl.uniform4f(u('uRect'), PAD * dpr, PAD * dpr, r.width * dpr, r.height * dpr)
      gl.uniform1f(u('uT'), threshold(current))
      gl.uniform1f(u('uEdge'), edge)
      gl.uniform1f(u('uChar'), v.char)
      gl.uniform1f(u('uGlow'), v.glow)
      gl.uniform1f(u('uTime'), visualTime)
      gl.uniform3f(u('uHot'), ...hotRgb)
      gl.uniform3f(u('uEmber'), ...emberRgb)
      gl.uniform3f(u('uSoot'), ...sootRgb)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      draws++
    }
    // Пепел: позиции считаем на процессоре (их не больше 900), рисуем точками.
    for (let i = particles.length - 1; i >= 0; i--) {
      const q = particles[i]
      q.life -= q.decay * dt
      if (q.life <= 0) {
        particles.splice(i, 1)
        continue
      }
      q.spin += dt * 3
      q.vx += Math.sin(q.spin) * 40 * dt
      q.vy -= 30 * dt // тёплый воздух поднимает пепел
      q.x += q.vx * dt
      q.y += q.vy * dt
    }
    if (particles.length) {
      const data = new Float32Array(particles.length * 4)
      particles.forEach((q, i) => data.set([(q.x + PAD) * dpr, (cssH - q.y - PAD) * dpr, q.life, q.size * dpr], i * 4))
      const { p, u } = fx.ash
      gl.useProgram(p)
      gl.bindBuffer(gl.ARRAY_BUFFER, fx.ashBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0)
      gl.uniform2f(u('uCanvas'), w, h)
      gl.uniform3f(u('uHot'), ...hotRgb)
      gl.uniform3f(u('uEmber'), ...emberRgb)
      gl.drawArrays(gl.POINTS, 0, particles.length)
      draws++
    }
    stats.drawCalls = draws
    stats.dpr = dpr
  }

  // ─── Прогресс ─────────────────────────────────────────────────────────────
  let current = -1
  const apply = (p) => {
    p = Math.min(1, Math.max(0, p))
    if (p === current) return
    const delta = current < 0 ? 0 : Math.abs(p - current)
    current = p
    if (reduced) {
      // «Уменьшить движение»: просто плавное исчезновение.
      el.style.opacity = String(1 - p)
      el.style.visibility = p >= 1 ? 'hidden' : ''
      return
    }
    if (p <= 0) {
      el.style.filter = ''
      el.style.visibility = ''
      return
    }
    if (p >= 1) {
      el.style.visibility = 'hidden'
      el.style.filter = ''
      return
    }
    el.style.visibility = ''
    el.style.filter = `url(#${id})`
    keep.setAttribute('intercept', String(-slope * threshold(p)))
    spawn(Math.round(delta * 1400 * v.ash), threshold(p))
  }

  // ─── Цикл кадров ──────────────────────────────────────────────────────────
  let raf = 0
  let last = 0
  let target = null // куда едет анимация: 0 или 1
  let animFrom = 0
  let animStart = 0
  let destroyed = false
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
  const loop = (now) => {
    raf = 0
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
    last = now
    const cpu = performance.now()
    if (target !== null) {
      const duration = Math.max(0.05, opts.duration) * Math.abs(target - animFrom)
      const k = Math.min(1, (now - animStart) / 1000 / duration)
      apply(animFrom + (target - animFrom) * ease(k))
      if (k >= 1) {
        const done = target
        target = null
        if (done === 1) opts.onComplete?.()
      }
    }
    // Пока край горит — понемногу искрит и без движения.
    if (current > 0 && current < 1 && Math.random() < v.ash * 0.5) spawn(1, threshold(current))
    drawFx(dt)
    stats.cpuMs = performance.now() - cpu
    stats.fps = Math.round(1 / dt)
    // Кадры нужны, пока идёт анимация, летит пепел или мерцает огонь.
    if (target !== null || particles.length || (current > 0 && current < 1 && wantsFx)) wake()
    else last = 0
  }
  const wake = () => {
    if (!raf && !destroyed) raf = requestAnimationFrame(loop)
  }
  const animateTo = (to) => {
    animFrom = Math.max(0, current)
    target = to
    animStart = performance.now()
    wake()
  }

  // ─── Триггеры ─────────────────────────────────────────────────────────────
  let io = null
  let onScroll = null
  const scroller = opts.scroller
  if (opts.trigger === 'scroll') {
    // Прогресс = насколько проехали «липкий» стек: от его верха у верха экрана
    // до его низа у низа экрана. Стек по умолчанию — родитель секции.
    const stack = opts.stack ?? el.parentElement
    const view = () => (scroller ? scroller.getBoundingClientRect() : { top: 0, height: innerHeight })
    let ticking = false
    onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const r = stack.getBoundingClientRect()
        const vp = view()
        const run = r.height - vp.height
        apply(run > 0 ? (vp.top - r.top) / run : 0)
        wake()
      })
    }
    ;(scroller ?? globalThis).addEventListener('scroll', onScroll, { passive: true })
    globalThis.addEventListener('resize', onScroll)
    onScroll()
  } else if (opts.trigger === 'appear') {
    io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= v.threshold) {
          animateTo(1)
          if (opts.once) io.disconnect()
        } else if (!entry.isIntersecting && !opts.once) {
          // Ушла с экрана — вернём, чтобы при следующем появлении сгорела снова.
          target = null
          apply(0)
          wake()
        }
      },
      { root: scroller, threshold: [0, v.threshold] },
    )
    io.observe(el)
    apply(0)
  } else apply(0)

  const registry = (globalThis.__K3D_EFFECTS__ ??= new Set())
  registry.add(stats)

  return {
    stats,
    /** Прогресс 0…1 вручную (например, из GSAP ScrollTrigger: onUpdate: (s) => t.progress(s.progress)). */
    progress(p) {
      target = null
      apply(p)
      wake()
    },
    get value() {
      return Math.max(0, current)
    },
    /** Прогореть до конца (анимация). */
    play() {
      animateTo(1)
    },
    /** Вернуть секцию. */
    reverse() {
      animateTo(0)
    },
    destroy() {
      destroyed = true
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io?.disconnect()
      if (onScroll) {
        ;(scroller ?? globalThis).removeEventListener('scroll', onScroll)
        globalThis.removeEventListener('resize', onScroll)
      }
      registry.delete(stats)
      svg.remove()
      if (fx.gl) {
        fx.gl.deleteTexture(fx.texture)
        fx.gl.deleteBuffer(fx.buffer)
        fx.gl.deleteBuffer(fx.ashBuffer)
        fx.gl.deleteProgram(fx.ember.p)
        fx.gl.deleteProgram(fx.ash.p)
        fx.gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
      fx.canvas?.remove()
      el.style.filter = ''
      el.style.visibility = ''
      el.style.opacity = ''
    },
  }
}

export const DEFAULTS = {
  pattern: 'points',
  points: 5,
  scale: 3,
  roughness: 0.35,
  edge: 0.035,
  softness: 0.004,
  glow: 0.8,
  char: 0.75,
  ash: 0.6,
  hot: '#fff1a8',
  ember: '#ff5a1f',
  soot: '#1a0c05',
  seed: 7,
  trigger: 'scroll',
  duration: 1.8,
  threshold: 0.5,
}

/** '#ff8800' → [1, 0.53, 0] (для uniform). */
function hex(color) {
  const h = String(color).replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
