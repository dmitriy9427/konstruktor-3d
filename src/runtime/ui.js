/**
 * Элементы интерфейса без WebGL: жидкая кнопка и прелоадер.
 *
 * Как и runtime.js, файл самодостаточен: Студия вставляет его текст в экспорт.
 *
 * Жидкая кнопка — «липкий» SVG-фильтр (goo): несколько кругов-капель вокруг
 * кнопки размываются (feGaussianBlur), а потом прозрачность «обрезается»
 * порогом (feColorMatrix: альфа × 20 − 8). Размытые соседние круги сливаются
 * в одну каплю с плавными перемычками — как ртуть. Капли тянутся к курсору,
 * дрожат в покое, по клику разлетаются брызгами и стекаются обратно.
 * Текст лежит поверх и в фильтр не попадает — остаётся чётким.
 *
 * Прелоадер — 2D-холст поверх страницы (или блока):
 *   fill    — название заполняется жидкостью снизу вверх, волна на поверхности;
 *   scatter — название из точек, в конце точки разлетаются;
 * потом слой уходит: растворяется, уезжает вверх или открывается кругом.
 * Прогресс: сам за duration секунд, до события load страницы или из кода:
 *   preloader.progress(0.4) … preloader.done()
 */

let uid = 0

// ─── Жидкая кнопка ──────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} button — кнопка или ссылка
 * @param {Record<string, unknown>} values — см. LIQUID_DEFAULTS
 */
export function createLiquidButton(button, values = {}) {
  const v = { ...LIQUID_DEFAULTS, ...values }
  const id = `k3d-goo-${++uid}`
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const stats = { name: v.name ?? 'жидкая кнопка', fps: 0, cpuMs: 0, gpuMs: null, dpr: 1, drawCalls: 0, width: 0, height: 0 }

  // Фильтр «слипания».
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('aria-hidden', 'true')
  Object.assign(svg.style, { position: 'absolute', width: '0', height: '0' })
  svg.innerHTML = `<filter id="${id}"><feGaussianBlur in="SourceGraphic" stdDeviation="${v.goo}" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter>`
  document.body.append(svg)
  const blurNode = svg.querySelector('feGaussianBlur')

  const prev = { position: button.style.position, background: button.style.background, isolation: button.style.isolation, color: button.style.color }
  if (getComputedStyle(button).position === 'static') button.style.position = 'relative'
  button.style.isolation = 'isolate'
  button.style.background = 'transparent'
  button.style.color = v.textColor

  const layer = document.createElement('span')
  layer.setAttribute('aria-hidden', 'true')
  Object.assign(layer.style, { position: 'absolute', inset: `-${v.room}px`, zIndex: '-1', filter: `url(#${id})`, pointerEvents: 'none' })
  button.prepend(layer)

  const body = document.createElement('span')
  Object.assign(body.style, { position: 'absolute', inset: `${v.room}px`, borderRadius: '999px', background: v.color, transition: 'transform .3s' })
  layer.append(body)

  const blobs = []
  const makeBlobs = () => {
    blobs.splice(0).forEach((b) => b.el.remove())
    for (let i = 0; i < v.blobs; i++) {
      const el = document.createElement('span')
      Object.assign(el.style, { position: 'absolute', left: '0', top: '0', borderRadius: '50%', background: v.color, willChange: 'transform' })
      layer.append(el)
      blobs.push({ el, a: (i / v.blobs) * Math.PI * 2, x: 0, y: 0, vx: 0, vy: 0, phase: Math.random() * 6.28, size: 0.6 + Math.random() * 0.5 })
    }
  }
  makeBlobs()

  const m = { x: 0, y: 0, over: false, power: 0 }
  // Мышь слушаем на всём окне: капли тянутся за курсором и за краем кнопки —
  // пока он ближе «Дотягиваются до» (в высотах кнопки).
  const onMove = (e) => {
    const r = button.getBoundingClientRect()
    m.x = e.clientX - r.left
    m.y = e.clientY - r.top
    const dx = Math.max(0, -m.x, m.x - r.width)
    const dy = Math.max(0, -m.y, m.y - r.height)
    const over = Math.hypot(dx, dy) < r.height * v.reach * 0.6
    if (over || m.over) wake()
    m.over = over
  }
  const onLeave = () => {
    m.over = false
    wake()
  }
  const onDown = () => {
    // Брызги: капли получают толчок наружу.
    for (const b of blobs) {
      b.vx += Math.cos(b.a) * 900 * v.splash
      b.vy += Math.sin(b.a) * 900 * v.splash
    }
    wake()
  }
  addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerleave', onLeave)
  button.addEventListener('pointerdown', onDown)

  let raf = 0
  let last = 0
  let t = 0
  function tick(now) {
    raf = 0
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60
    last = now
    t += dt
    const cpu = performance.now()
    const w = button.offsetWidth
    const h = button.offsetHeight
    const room = v.room
    m.power += ((m.over ? 1 : 0) - m.power) * (1 - Math.exp(-dt * 8))
    // Сама кнопка чуть тянется за мышью («Тело следует»).
    const bx = (m.x - w / 2) * v.bodyFollow * 0.12 * m.power
    const by = (m.y - h / 2) * v.bodyFollow * 0.12 * m.power
    body.style.transform = `translate(${bx}px, ${by}px) scale(${1 + m.power * 0.04})`
    let moving = m.power > 0.001 && m.power < 0.999
    for (const b of blobs) {
      // Своё место — на краю «пилюли»; в покое капля чуть дышит.
      const cx = w / 2 + Math.cos(b.a) * (w / 2 - h * 0.35)
      const cy = h / 2 + Math.sin(b.a) * h * 0.32
      const wob = reduced ? 0 : Math.sin(t * 2.2 + b.phase) * v.wobble * 6
      let tx = cx + Math.cos(b.a) * wob
      let ty = cy + Math.sin(b.a) * wob
      // Капли тянутся к курсору: ближние — сильнее (радиус — «Дотягиваются до»),
      // но не дальше «Отрыва» от своего места — дальше капля «рвётся» обратно.
      if (m.power > 0.01) {
        const dx = m.x - cx
        const dy = m.y - cy
        const reach = h * v.reach
        const near = Math.exp(-(dx * dx + dy * dy) / (reach * reach))
        let ox = dx * near * v.stretch * m.power
        let oy = dy * near * v.stretch * m.power
        const len = Math.hypot(ox, oy)
        const maxLen = h * v.detach
        if (len > maxLen) {
          ox *= maxLen / len
          oy *= maxLen / len
        }
        tx += ox
        ty += oy
      }
      // Пружина к цели: «Упругость» — жёсткость, «Вязкость» — как быстро гаснут колебания.
      b.vx += (tx - b.x) * v.elasticity * 200 * dt
      b.vy += (ty - b.y) * v.elasticity * 200 * dt
      const damp = Math.exp(-dt * v.viscosity * 14)
      b.vx *= damp
      b.vy *= damp
      b.x += b.vx * dt
      b.y += b.vy * dt
      const s = h * 0.55 * b.size * v.blobSize
      b.el.style.width = `${s}px`
      b.el.style.height = `${s}px`
      b.el.style.transform = `translate(${b.x + room - s / 2}px, ${b.y + room - s / 2}px)`
      if (Math.abs(b.vx) + Math.abs(b.vy) > 1) moving = true
    }
    stats.cpuMs = performance.now() - cpu
    stats.fps = Math.round(1 / dt)
    if (moving || m.over || (v.wobble > 0 && !reduced)) wake()
    else last = 0
  }
  function wake() {
    if (!raf) raf = requestAnimationFrame(tick)
  }
  // Первая расстановка капель — без «влёта» из угла.
  requestAnimationFrame(() => {
    for (const b of blobs) {
      b.x = button.offsetWidth / 2 + Math.cos(b.a) * (button.offsetWidth / 2 - button.offsetHeight * 0.35)
      b.y = button.offsetHeight / 2 + Math.sin(b.a) * button.offsetHeight * 0.32
    }
    wake()
  })

  const registry = (globalThis.__K3D_EFFECTS__ ??= new Set())
  registry.add(stats)

  return {
    stats,
    set(next) {
      const rebuild = next.blobs !== undefined && next.blobs !== v.blobs
      Object.assign(v, next)
      blurNode.setAttribute('stdDeviation', String(v.goo))
      body.style.background = v.color
      button.style.color = v.textColor
      layer.style.inset = `-${v.room}px`
      body.style.inset = `${v.room}px`
      if (rebuild) makeBlobs()
      else blobs.forEach((b) => (b.el.style.background = v.color))
      wake()
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf)
      removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      button.removeEventListener('pointerdown', onDown)
      layer.remove()
      svg.remove()
      Object.assign(button.style, prev)
      registry.delete(stats)
    },
  }
}

export const LIQUID_DEFAULTS = {
  color: '#a78bfa',
  textColor: '#0b0b12',
  blobs: 8,
  goo: 10,
  room: 30,
  wobble: 0.6,
  stretch: 1.4,
  reach: 1.6,
  detach: 1.1,
  elasticity: 0.6,
  viscosity: 0.55,
  bodyFollow: 0.6,
  blobSize: 1,
  splash: 1,
}

// ─── Прелоадер ──────────────────────────────────────────────────────────────

/**
 * @param {HTMLElement} root — document.body (вся страница) или блок
 * @param {Record<string, unknown>} values — см. PRELOADER_DEFAULTS
 * @returns {{ progress(p: number): void, done(): void, replay(): void, destroy(): void, finished: Promise<void> }}
 */
export function createPreloader(root, values = {}) {
  const v = { ...PRELOADER_DEFAULTS, ...values }
  const page = root === document.body
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const stats = { name: v.name ?? 'прелоадер', fps: 0, cpuMs: 0, gpuMs: null, dpr: 1, drawCalls: 0, width: 0, height: 0 }

  if (!page && getComputedStyle(root).position === 'static') root.style.position = 'relative'
  const layer = document.createElement('div')
  layer.setAttribute('role', 'progressbar')
  layer.setAttribute('aria-label', 'Загрузка')
  Object.assign(layer.style, { position: page ? 'fixed' : 'absolute', inset: '0', zIndex: '2147483600', overflow: 'hidden' })
  // Фон — отдельный слой: при открытии он уходит своим ходом (плавно), а холст — своим.
  const bg = document.createElement('div')
  Object.assign(bg.style, { position: 'absolute', inset: '0', background: v.background })
  layer.append(bg)
  const halves = [0, 1].map(() => {
    const el = document.createElement('div')
    // 50.5 % — створки чуть заходят друг на друга: без щели посередине при округлении.
    Object.assign(el.style, { position: 'absolute', top: '0', bottom: '0', width: '50.5%', background: v.background, display: 'none' })
    layer.append(el)
    return el
  })
  halves[0].style.left = '0'
  halves[1].style.right = '0'
  // Прожигание: маска на маленьком холсте (дёшево), растягивается на весь слой.
  const burn = document.createElement('canvas')
  Object.assign(burn.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'none', imageRendering: 'auto' })
  layer.append(burn)
  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' })
  layer.append(canvas)
  root.append(layer)
  const ctx = canvas.getContext('2d')
  const mask = document.createElement('canvas')
  const mctx = mask.getContext('2d', { willReadFrequently: true })

  let resolveFinished
  const finished = new Promise((r) => (resolveFinished = r))
  const state = { target: 0, shown: 0, start: performance.now(), doneAt: 0, w: 0, h: 0, dots: [] }

  const font = () => `${v.weight} ${Math.min(state.w / Math.max(3, String(v.text).length) * 1.5, state.h * 0.28) * v.size}px system-ui, sans-serif`
  const layout = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    state.w = layer.clientWidth
    state.h = layer.clientHeight
    // Слой скрыт или ещё не разложен — читать нечего (getImageData с шириной 0 падает).
    if (!state.w || !state.h) return
    canvas.width = Math.round(state.w * dpr)
    canvas.height = Math.round(state.h * dpr)
    mask.width = canvas.width
    mask.height = canvas.height
    mctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    mctx.clearRect(0, 0, state.w, state.h)
    mctx.font = font()
    mctx.textAlign = 'center'
    mctx.textBaseline = 'middle'
    mctx.fillStyle = '#fff'
    mctx.fillText(String(v.text), state.w / 2, state.h / 2)
    // Точки букв (для «scatter»): сетка с шагом gap, берём закрашенные.
    const data = mctx.getImageData(0, 0, mask.width, mask.height).data
    const gap = Math.max(2, Math.round(4 * dpr))
    state.dots = []
    for (let y = 0; y < mask.height; y += gap)
      for (let x = 0; x < mask.width; x += gap)
        if (data[(y * mask.width + x) * 4 + 3] > 128) {
          const a = Math.random() * Math.PI * 2
          state.dots.push({ x: x / dpr, y: y / dpr, a, sp: 200 + Math.random() * 600, delay: Math.random() })
        }
    stats.width = canvas.width
    stats.height = canvas.height
  }
  layout()
  const ro = new ResizeObserver(layout)
  ro.observe(layer)

  // Прогресс «сам»: за duration секунд; «до загрузки»: тянется к 90 %, на load — 100 %.
  const onLoad = () => (state.target = 1)
  if (v.mode === 'load') {
    if (document.readyState === 'complete') state.target = 1
    else addEventListener('load', onLoad, { once: true })
  }

  let raf = 0
  let last = 0
  function tick(now) {
    raf = 0
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60
    last = now
    const cpu = performance.now()
    const age = (now - state.start) / 1000
    if (v.mode === 'auto') state.target = Math.min(1, age / Math.max(0.2, v.duration))
    if (v.mode === 'load' && state.target < 1) state.target = Math.min(0.9, age / 3)
    state.shown += (state.target - state.shown) * (1 - Math.exp(-dt * 5))
    if (state.target >= 1 && state.shown > 0.995 && !state.doneAt) state.doneAt = now

    const out = state.doneAt ? Math.min(1, (now - state.doneAt) / 1000 / Math.max(0.1, v.revealTime)) : 0
    draw(age, out)
    reveal(out)

    stats.cpuMs = performance.now() - cpu
    stats.fps = Math.round(1 / dt)
    if (out < 1) raf = requestAnimationFrame(tick)
    else {
      layer.style.display = 'none'
      resolveFinished()
    }
  }

  function draw(age, out) {
    const dpr = canvas.width / Math.max(1, state.w)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const p = state.shown
    if (v.style === 'counter') {
      // Большие цифры и тонкая линия прогресса.
      ctx.fillStyle = v.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${v.weight} ${Math.min(state.w * 0.3, state.h * 0.35) * v.size}px system-ui, sans-serif`
      ctx.globalAlpha = 1 - out
      ctx.fillText(`${Math.round(p * 100)}`, state.w / 2, state.h / 2)
      ctx.font = `500 ${14 * Math.max(1, v.size)}px system-ui, sans-serif`
      ctx.globalAlpha = 0.6 * (1 - out)
      ctx.fillText(String(v.text), state.w / 2, state.h / 2 + Math.min(state.w * 0.3, state.h * 0.35) * v.size * 0.55)
      ctx.globalAlpha = 1 - out
      const lw = state.w * 0.4
      ctx.fillRect(state.w / 2 - lw / 2, state.h * 0.82, lw * p, 2)
      ctx.globalAlpha = 0.2 * (1 - out)
      ctx.fillRect(state.w / 2 - lw / 2, state.h * 0.82, lw, 2)
      ctx.globalAlpha = 1
      return
    }
    if (v.style === 'fill') {
      // 1) пустые буквы — бледным; 2) жидкость: прямоугольник под волной, вырезанный по буквам.
      ctx.globalAlpha = 0.18
      ctx.drawImage(mask, 0, 0, state.w, state.h)
      ctx.globalAlpha = 1
      const top = state.h / 2 - state.h * 0.16 * v.size
      const bottom = state.h / 2 + state.h * 0.16 * v.size
      const level = bottom - (bottom - top) * p
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(0, state.h)
      for (let x = 0; x <= state.w; x += 6) {
        const wave = Math.sin(x * 0.03 + age * 4 * v.waveSpeed) * 6 * v.wave + Math.sin(x * 0.017 - age * 2.6 * v.waveSpeed) * 4 * v.wave
        ctx.lineTo(x, level + wave * (1 - p * 0.6))
      }
      ctx.lineTo(state.w, state.h)
      ctx.closePath()
      ctx.fillStyle = v.color
      ctx.fill()
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(mask, 0, 0, state.w, state.h)
      ctx.restore()
      ctx.globalCompositeOperation = 'source-over'
    } else {
      // Точки букв: появляются по прогрессу (в случайном порядке), в конце разлетаются.
      ctx.fillStyle = v.color
      for (const d of state.dots) {
        if (d.delay > p) continue
        const fly = reduced ? 0 : Math.max(0, out * 1.6 - d.delay * 0.6)
        const x = d.x + Math.cos(d.a) * d.sp * fly * fly
        const y = d.y + Math.sin(d.a) * d.sp * fly * fly
        ctx.globalAlpha = 1 - Math.min(1, fly)
        ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4)
      }
      ctx.globalAlpha = 1
      stats.drawCalls = state.dots.length
    }
    // Проценты.
    if (v.percent && v.style !== 'counter') {
      ctx.fillStyle = v.color
      ctx.globalAlpha = 0.7 * (1 - out)
      ctx.font = `500 14px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(`${Math.round(p * 100)}%`, state.w / 2, state.h / 2 + state.h * 0.2 * v.size + 24)
      ctx.globalAlpha = 1
    }
  }

  // Поле прожигания: для каждой клетки — когда она прогорит (шум + расстояние до очагов).
  let burnField = null
  const buildBurn = () => {
    const W = 160
    const H = Math.max(40, Math.round((W * state.h) / Math.max(1, state.w)))
    const centers = Array.from({ length: 4 }, () => [Math.random(), Math.random()])
    const f = new Float32Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = x / W
        const w = y / H
        let d = 9
        for (const [cx, cy] of centers) d = Math.min(d, Math.hypot((u - cx) * (W / H), w - cy))
        const n = Math.sin(u * 23.1 + w * 7.3) * 0.5 + Math.sin(u * 9.7 - w * 17.9) * 0.5
        f[y * W + x] = d + n * 0.06 + Math.random() * 0.03
      }
    let max = 0
    for (const x of f) max = Math.max(max, x)
    for (let i = 0; i < f.length; i++) f[i] /= max
    burn.width = W
    burn.height = H
    burnField = { W, H, f, img: burn.getContext('2d').createImageData(W, H) }
  }
  const bgRgb = () => {
    const n = parseInt(String(v.background).replace('#', ''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }

  function reveal(out) {
    const e = out * out * (3 - 2 * out)
    // Холст с текстом/точками: в «scatter» не гасим — точки разлетаются над страницей сами.
    canvas.style.opacity = v.style === 'scatter' ? '1' : String(1 - Math.min(1, out * 1.6))
    bg.style.display = v.reveal === 'split' || v.reveal === 'burn' ? 'none' : ''
    halves.forEach((h) => (h.style.display = v.reveal === 'split' ? '' : 'none'))
    burn.style.display = v.reveal === 'burn' ? '' : 'none'
    if (v.reveal === 'fade') bg.style.opacity = String(1 - e)
    else if (v.reveal === 'up') bg.style.transform = `translateY(${-e * 100}%)`
    else if (v.reveal === 'circle') bg.style.clipPath = `circle(${(1 - e) * 150}% at 50% 50%)`
    else if (v.reveal === 'split') {
      halves[0].style.transform = `translateX(${-e * 100}%)`
      halves[1].style.transform = `translateX(${e * 100}%)`
    } else if (v.reveal === 'burn') {
      if (!burnField) buildBurn()
      const { f, img } = burnField
      const [r, g, b] = bgRgb()
      const t = out * 1.15 - 0.05
      const edge = 0.05
      for (let i = 0; i < f.length; i++) {
        const d = f[i] - t
        const k = i * 4
        if (d < 0) {
          img.data[k + 3] = 0
          continue
        }
        // Край: жёлтый → оранжевый → фон.
        const heat = Math.max(0, 1 - d / edge)
        img.data[k] = r + (255 - r) * heat
        img.data[k + 1] = g + (180 * heat * heat + 60 * heat - g * heat)
        img.data[k + 2] = b * (1 - heat) + 40 * heat * heat
        img.data[k + 3] = 255
      }
      burn.getContext('2d').putImageData(img, 0, 0)
    }
  }

  const wake = () => {
    if (!raf) raf = requestAnimationFrame(tick)
  }
  wake()

  const registry = (globalThis.__K3D_EFFECTS__ ??= new Set())
  registry.add(stats)

  return {
    stats,
    finished,
    /** Прогресс 0…1 (для mode: 'manual'). */
    progress(p) {
      state.target = Math.min(1, Math.max(0, p))
      wake()
    },
    /** Всё загружено — показать сайт. */
    done() {
      state.target = 1
      wake()
    },
    /** Показать заново (для Студии). */
    replay() {
      Object.assign(state, { target: 0, shown: 0, start: performance.now(), doneAt: 0 })
      layer.style.display = ''
      Object.assign(bg.style, { opacity: '', transform: '', clipPath: '', background: v.background })
      halves.forEach((h) => Object.assign(h.style, { transform: '', background: v.background }))
      burnField = null
      last = 0
      wake()
    },
    set(next) {
      Object.assign(v, next)
      bg.style.background = v.background
      halves.forEach((h) => (h.style.background = v.background))
      burnField = null
      layout()
      wake()
    },
    destroy() {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      removeEventListener('load', onLoad)
      layer.remove()
      registry.delete(stats)
    },
  }
}

export const PRELOADER_DEFAULTS = {
  text: 'Studio',
  style: 'fill',
  mode: 'auto',
  duration: 2.5,
  reveal: 'circle',
  revealTime: 0.9,
  size: 1,
  weight: 800,
  wave: 1,
  waveSpeed: 1,
  percent: true,
  color: '#a78bfa',
  background: '#07060f',
}
