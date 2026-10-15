/**
 * Переходы между секциями: «прожигание», растворение, шторка — без WebGL.
 *
 * Как и runtime.js, файл самодостаточен: Студия вставляет его текст в экспорт.
 *
 * Главная идея — секция остаётся НАСТОЯЩЕЙ (текст, ссылки, видео работают),
 * а дыры в ней прожигает SVG-фильтр (CSS filter: url(#…)):
 *
 *   1. Один раз считаем «поле времени»: для каждой точки секции — число 0…1,
 *      КОГДА она прогорит. Точки около очагов — раньше, дальние — позже,
 *      плюс шум, чтобы фронт был рваным. Поле выравниваем по рангу:
 *      прогресс 0.3 = прогорело ровно 30 % площади.
 *   2. Поле — это картинка (серый PNG). Фильтр берёт её (feImage) и для
 *      текущего прогресса p оставляет секцию только там, где поле > p.
 *      Полоски поля чуть больше p — это тлеющий край: жёлтый, оранжевый,
 *      обугленный, со свечением.
 *   3. Каждый кадр меняются только четыре числа в фильтре (intercept) —
 *      картинка поля не пересчитывается.
 *   4. Пепел — частицы на лёгком 2D-холсте поверх страницы. Где их рождать,
 *      знаем точно: клетки поля со значением около p — это и есть горящий край.
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
 * Запустить переход на элементе.
 * @param {HTMLElement} el — секция, которая прогорит (за ней видно то, что под ней)
 * @param {Record<string, unknown>} values — параметры вида (см. DEFAULTS)
 * @param {object} [options] — { trigger, duration, scroller, once, onComplete }
 */
export function createTransition(el, values = {}, options = {}) {
  const v = { ...DEFAULTS, ...values }
  const opts = { trigger: v.trigger, duration: v.duration, once: false, scroller: null, onComplete: null, ...options }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const id = `k3d-burn-${++uid}`
  const stats = { name: v.name ?? 'переход', fps: 0, cpuMs: 0, gpuMs: null, dpr: 1, drawCalls: 0, width: 0, height: 0 }

  // ─── Поле и фильтр ────────────────────────────────────────────────────────
  const rect0 = el.getBoundingClientRect()
  const fw = 256
  const fh = Math.max(48, Math.min(512, Math.round(fw / Math.max(0.2, (rect0.width || 16) / (rect0.height || 9)))))
  const field = buildField(fw, fh, v)

  // Ширина тлеющего края в долях поля и «запас», чтобы при p=0 не было дыр,
  // а при p=1 прогорели и края.
  const edge = Math.max(0.002, v.edge)
  const tail = edge * 3 + 0.01
  const slope = 1 / Math.max(0.0015, v.softness)

  const image = node('feImage', { x: 0, y: 0, preserveAspectRatio: 'none', result: 'img' })
  const href = fieldToImage(field)
  image.setAttribute('href', href)
  image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href)
  const ramp = (result) => {
    const fn = node('feFuncA', { type: 'linear', slope, intercept: 0 })
    return { fn, el: node('feComponentTransfer', { in: 'field', result }, [fn]) }
  }
  const keep = ramp('keep')
  const hot = ramp('hotEnd')
  const ember = ramp('emberEnd')
  // Копоть: градиент — у края темно, дальше светлеет (наклон отрицательный).
  const charFn = node('feFuncA', { type: 'linear', slope: 0, intercept: 0 })
  const char = { fn: charFn, el: node('feComponentTransfer', { in: 'field', result: 'charGrad' }, [charFn]) }
  const blur = node('feGaussianBlur', { in: 'edge', stdDeviation: 0, result: 'glow' })
  const flood = (color, opacity, result) => node('feFlood', { 'flood-color': color, 'flood-opacity': opacity, result })
  const minus = (a, b, result) => node('feComposite', { in: a, in2: b, operator: 'arithmetic', k1: 0, k2: 1, k3: -1, k4: 0, result })
  const inside = (a, b, result) => node('feComposite', { in: a, in2: b, operator: 'in', result })
  const filter = node(
    'filter',
    { id, filterUnits: 'userSpaceOnUse', primitiveUnits: 'userSpaceOnUse', x: 0, y: 0, 'color-interpolation-filters': 'sRGB' },
    [
      image,
      node('feColorMatrix', { in: 'img', type: 'luminanceToAlpha', result: 'field' }),
      keep.el,
      hot.el,
      ember.el,
      char.el,
      inside('SourceGraphic', 'keep', 'kept'),
      // Полоски: «ещё есть, но вот-вот прогорит».
      inside('charGrad', 'keep', 'charBand'),
      minus('keep', 'emberEnd', 'emberBand'),
      minus('keep', 'hotEnd', 'hotBand'),
      flood(v.soot, v.char, 'sootColor'),
      inside('sootColor', 'charBand', 'soot'),
      flood(v.ember, 1, 'emberColor'),
      inside('emberColor', 'emberBand', 'emberLayer'),
      flood(v.hot, 1, 'hotColor'),
      inside('hotColor', 'hotBand', 'hotLayer'),
      node('feMerge', { result: 'edge' }, [node('feMergeNode', { in: 'emberLayer' }), node('feMergeNode', { in: 'hotLayer' })]),
      blur,
      // Снизу вверх: свечение (видно и в дырах) → секция → копоть → огненный край.
      node('feMerge', {}, [
        node('feMergeNode', { in: 'glow' }),
        node('feMergeNode', { in: 'kept' }),
        node('feMergeNode', { in: 'soot' }),
        node('feMergeNode', { in: 'edge' }),
      ]),
    ],
  )
  const svg = node('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' }, [node('defs', {}, [filter])])
  Object.assign(svg.style, { position: 'absolute', width: '0', height: '0', overflow: 'hidden' })
  document.body.append(svg)

  const resize = () => {
    const w = el.offsetWidth
    const h = el.offsetHeight
    for (const target of [filter, image]) {
      target.setAttribute('width', String(w))
      target.setAttribute('height', String(h))
    }
    blur.setAttribute('stdDeviation', String(Math.min(w, h) * 0.012 * v.glow))
    stats.width = w
    stats.height = h
  }
  const ro = new ResizeObserver(resize)
  ro.observe(el)
  resize()

  // ─── Пепел ────────────────────────────────────────────────────────────────
  let ash = null
  const particles = []
  const ensureAsh = () => {
    if (ash || v.ash <= 0) return
    const canvas = document.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '2147483000' })
    document.body.append(canvas)
    ash = { canvas, ctx: canvas.getContext('2d') }
  }
  const hotRgb = hex(v.hot)
  const emberRgb = hex(v.ember)
  const spawn = (count, p) => {
    if (!count) return
    ensureAsh()
    const r = el.getBoundingClientRect()
    const n = field.order.length
    const from = Math.floor(Math.max(0, p) * (n - 1))
    const to = Math.min(n - 1, from + Math.max(1, Math.floor(edge * n)))
    for (let i = 0; i < count && particles.length < 900; i++) {
      const cell = field.order[from + Math.floor(Math.random() * (to - from + 1))]
      const cx = ((cell % field.width) + Math.random()) / field.width
      const cy = (Math.floor(cell / field.width) + Math.random()) / field.height
      particles.push({
        x: r.left + cx * r.width,
        y: r.top + cy * r.height,
        vx: (Math.random() - 0.5) * 30,
        vy: -20 - Math.random() * 60,
        life: 1,
        decay: 0.5 + Math.random() * 0.9,
        size: 0.6 + Math.random() * 2.2,
        spin: Math.random() * 6.28,
      })
    }
  }
  const stepAsh = (dt) => {
    if (!ash) return
    const { canvas, ctx } = ash
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5)
    const w = Math.round(innerWidth * dpr)
    const h = Math.round(innerHeight * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, innerWidth, innerHeight)
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
      // Цвет: жёлтый → оранжевый → серый пепел.
      const t = q.life
      const c = t > 0.6 ? mixRgb(emberRgb, hotRgb, (t - 0.6) / 0.4) : mixRgb([90, 84, 80], emberRgb, t / 0.6)
      ctx.globalAlpha = Math.min(1, t * 1.6)
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`
      ctx.beginPath()
      ctx.arc(q.x, q.y, q.size, 0, 6.2832)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    stats.drawCalls = particles.length
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
    // Порог поля: при p=0 — чуть меньше нуля (ничего не горит), при p=1 — с запасом на края.
    const t = -0.01 + p * (1 + tail + 0.01)
    keep.fn.setAttribute('intercept', String(-slope * t))
    hot.fn.setAttribute('intercept', String(-slope * (t + edge * 0.35)))
    ember.fn.setAttribute('intercept', String(-slope * (t + edge)))
    // Копоть: 1 на линии огня, 0 через 2.5 ширины края.
    const span = edge * 2.5
    char.fn.setAttribute('slope', String(-1 / span))
    char.fn.setAttribute('intercept', String((t + edge + span) / span))
    spawn(Math.round(delta * 1400 * v.ash), t)
  }

  // ─── Цикл кадров: анимация play/reverse и пепел ──────────────────────────
  let raf = 0
  let last = 0
  let target = null // куда едет анимация: 0 или 1
  let animFrom = 0
  let animStart = 0
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
    if (current > 0 && current < 1 && v.ash > 0) spawn(Math.random() < v.ash * 0.5 ? 1 : 0, -0.01 + current * (1 + tail + 0.01))
    stepAsh(dt)
    stats.cpuMs = performance.now() - cpu
    stats.fps = Math.round(1 / dt)
    if (target !== null || particles.length || (current > 0 && current < 1 && v.ash > 0 && opts.trigger !== 'scroll')) wake()
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
  let destroyed = false
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
      ash?.canvas.remove()
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

function hex(color) {
  const h = String(color).replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixRgb(a, b, t) {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t))
}
