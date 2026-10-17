/**
 * Рантайм 3D-эффектов на three.js.
 *
 * Как и runtime.js, файл без import: Студия вставляет его текст в экспорт,
 * а сам three.js передаётся параметром (THREE). Так один и тот же код
 * работает и в Студии, и в вашем проекте (import * as THREE from 'three').
 *
 * Эффект — функция setup(ctx), которая наполняет сцену и возвращает
 *   { update(frame), set(values), dispose() }.
 * Всё общее — здесь: рендерер, камера, размер и плотность пикселей, мышь с
 * инерцией, наведение и прокрутка, пауза за экраном, «уменьшить движение»,
 * адаптивное качество, статистика для панели производительности, уборка.
 */

/**
 * @param {typeof import('three')} THREE
 * @param {HTMLCanvasElement} canvas
 * @param {(ctx: object) => { update?: Function, set?: Function, dispose?: Function }} setup
 * @param {{ name?: string, values?: Record<string, unknown> }} spec
 * @param {object} [options] — mouse, inertia, quality, adaptive, reducedMotion, pauseOffscreen, addons
 */
export function createScene(THREE, canvas, setup, spec = {}, options = {}) {
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
    /** Траектория «точки влияния» — как в runtime.js. */
    path: null,
    addons: {},
    ...options,
  }
  const values = { ...spec.values }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200)
  camera.position.set(0, 0, 6)

  // ─── Мышь (−1…1, y вверх), наведение, прокрутка ───────────────────────────
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: 0, tactive: 0, hover: 0, thover: 0 }
  const onMove = (event) => {
    const r = canvas.getBoundingClientRect()
    pointer.tx = ((event.clientX - r.left) / r.width) * 2 - 1
    pointer.ty = -(((event.clientY - r.top) / r.height) * 2 - 1)
    const inside = Math.abs(pointer.tx) <= 1 && Math.abs(pointer.ty) <= 1
    pointer.tactive = inside ? 1 : 0
    pointer.thover = inside ? 1 : 0
    wake()
  }
  const onLeave = () => {
    pointer.tactive = 0
    pointer.thover = 0
  }
  globalThis.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('pointerleave', onLeave)

  // ─── Экономия: засыпание без действий пользователя ───────────────────────
  // Мышь, прокрутка, клавиши, касания — «пользователь здесь». Если ничего не было
  // sleepAfter секунд, кадры перестают рисоваться; любое действие будит эффект.
  let lastActivity = performance.now()
  const onActivity = () => {
    const wasAsleep = !awake()
    lastActivity = performance.now()
    if (wasAsleep) wake()
  }
  const awake = () => !opts.sleepAfter || performance.now() - lastActivity < opts.sleepAfter * 1000
  const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'wheel', 'scroll', 'keydown', 'touchstart']
  for (const name of ACTIVITY_EVENTS) globalThis.addEventListener?.(name, onActivity, { passive: true, capture: true })
  const scrollProgress = () => {
    const r = canvas.getBoundingClientRect()
    const vh = globalThis.innerHeight || 1
    return Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)))
  }

  // ─── Эффект ───────────────────────────────────────────────────────────────
  const ctx = { THREE, scene, camera, renderer, canvas, values, addons: opts.addons, helpers: makeHelpers(THREE) }
  const effect = setup(ctx) ?? {}

  // ─── Размер ───────────────────────────────────────────────────────────────
  let adaptiveScale = 1
  const resize = () => {
    const r = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.round(r.width))
    const h = Math.max(1, Math.round(r.height))
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, opts.quality) * adaptiveScale)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    effect.resize?.(w, h)
    wake()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  // ─── Цикл кадров ──────────────────────────────────────────────────────────
  let destroyed = false
  let visible = true
  let paused = false
  let raf = 0
  let last = 0
  let time = 0
  let slow = 0
  let progress = null
  let pathTime = 0 // ручной прогресс (morph.progress(0.5)), иначе null
  const stats = { name: spec.name ?? '3D', fps: 0, cpuMs: 0, gpuMs: null, dpr: 1, drawCalls: 0, width: 0, height: 0 }
  let fpsFrames = 0
  let fpsStart = 0

  const running = () => !destroyed && (visible || !opts.pauseOffscreen) && awake() && !paused && !opts.reducedMotion
  function wake() {
    if (!raf && !destroyed) raf = requestAnimationFrame(tick)
  }
  function tick(now) {
    raf = 0
    // Потолок FPS: рано для нового кадра — ждём следующего обновления экрана.
    if (opts.maxFps > 0 && last && now - last < 1000 / opts.maxFps - 2) {
      raf = requestAnimationFrame(tick)
      return
    }
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60
    last = now
    const cpu = performance.now()
    // Время идёт, только пока анимация запущена: разовая перерисовка (размер,
    // новые параметры) у спящего или стоящего эффекта не сдвигает кадр.
    if (running()) time += dt
    const k = 1 - Math.exp(-dt * (1 / Math.max(opts.inertia, 0.001)) * 0.25)
    // Траектория: когда мыши нет (или всегда) цель — точка на пути (доли → −1…1).
    let tx = pointer.tx
    let ty = pointer.ty
    let ta = opts.mouse ? pointer.tactive : 0
    const path = opts.path?.points?.length ? opts.path : null
    if (path && (path.mode === 'always' || !ta)) {
      if (running()) pathTime += dt * (path.speed ?? 1) * 0.1
      const [px, py] = pathPoint(path.points, path.closed !== false, pathTime)
      tx = px * 2 - 1
      ty = py * 2 - 1
      ta = 1
    }
    const follow = !opts.reducedMotion && (opts.mouse || path)
    pointer.x += ((follow ? tx : 0) - pointer.x) * k
    pointer.y += ((follow ? ty : 0) - pointer.y) * k
    pointer.active += ((follow ? ta : 0) - pointer.active) * k
    pointer.hover += (pointer.thover - pointer.hover) * Math.min(1, dt * 4)

    effect.update?.({ time, dt: opts.reducedMotion ? 0 : dt, pointer, scroll: scrollProgress(), hover: pointer.hover, progress })
    renderer.render(scene, camera)

    stats.cpuMs = performance.now() - cpu
    stats.drawCalls = renderer.info.render.calls
    stats.dpr = renderer.getPixelRatio()
    stats.width = canvas.width
    stats.height = canvas.height
    fpsFrames++
    if (now - fpsStart > 500) {
      stats.fps = Math.round((fpsFrames * 1000) / (now - fpsStart))
      fpsFrames = 0
      fpsStart = now
    }
    if (opts.adaptive && dt > 0.024) {
      if (++slow > 30 && adaptiveScale > 0.5) {
        adaptiveScale = Math.max(0.5, adaptiveScale - 0.15)
        slow = 0
        resize()
      }
    } else slow = Math.max(0, slow - 1)

    if (running() || Math.abs(pointer.hover - pointer.thover) > 0.001) wake()
    else last = 0
  }

  let io = null
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) wake()
    })
    io.observe(canvas)
  }
  resize()

  const registry = (globalThis.__K3D_EFFECTS__ ??= new Set())
  registry.add(stats)

  return {
    stats,
    set(next) {
      Object.assign(values, next)
      effect.set?.(values)
      wake()
    },
    setOptions(next) {
      Object.assign(opts, next)
      if ('quality' in next) {
        adaptiveScale = 1
        resize()
      }
      wake()
    },
    /** Ручной прогресс 0…1 для эффектов с превращением (null — снова сам). */
    progress(p) {
      progress = p === null ? null : Math.min(1, Math.max(0, p))
      wake()
    },
    play() {
      paused = false
      wake()
    },
    pause() {
      paused = true
    },
    destroy() {
      destroyed = true
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      io?.disconnect()
      globalThis.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      for (const name of ACTIVITY_EVENTS) globalThis.removeEventListener(name, onActivity, { capture: true })
      registry.delete(stats)
      effect.dispose?.()
      // Видеопамять: геометрии, материалы и текстуры сцены.
      scene.traverse((object) => {
        object.geometry?.dispose()
        for (const material of [object.material].flat()) {
          if (!material) continue
          for (const value of Object.values(material)) if (value?.isTexture) value.dispose()
          material.dispose()
        }
      })
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}

/**
 * Точка на траектории: сглаженная кривая (Catmull–Rom) через точки пути.
 * t — 0…1 (по кругу для замкнутого пути, туда-обратно для открытого).
 * Точки — доли холста (0…1, y вверх). Скорость по пути примерно равномерная:
 * каждый отрезок получает время по своей длине.
 */
function pathPoint(points, closed, t) {
  const n = points.length
  if (n === 1) return points[0]
  const segs = closed ? n : n - 1
  const at = (i) => points[closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))]
  const lengths = []
  let total = 0
  for (let i = 0; i < segs; i++) {
    const a = at(i)
    const b = at(i + 1)
    total += Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6
    lengths.push(total)
  }
  let u = closed ? ((t % 1) + 1) % 1 : 1 - Math.abs(((t % 2) + 2) % 2 - 1)
  u *= total
  let i = lengths.findIndex((l) => l >= u)
  if (i < 0) i = segs - 1
  const start = i ? lengths[i - 1] : 0
  const s = (u - start) / (lengths[i] - start || 1)
  const p0 = at(i - 1)
  const p1 = at(i)
  const p2 = at(i + 1)
  const p3 = at(i + 2)
  const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (3 * b - a - 3 * c + d) * s * s * s)
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]
}

/** Общие помощники для эффектов. */
function makeHelpers(THREE) {
  return {
    /**
     * Точки из текста или картинки: рисуем на скрытом 2D-холсте и берём
     * случайные непрозрачные пиксели. Возвращает Float32Array (x, y, 0) * count,
     * по ширине — от −width/2 до width/2.
     */
    samplePixels(draw, count, width = 4, resolution = 400) {
      const c = document.createElement('canvas')
      c.width = resolution
      c.height = resolution
      const g = c.getContext('2d', { willReadFrequently: true })
      draw(g, resolution)
      const data = g.getImageData(0, 0, resolution, resolution).data
      const filled = []
      let minX = resolution
      let maxX = 0
      let minY = resolution
      let maxY = 0
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          if (data[(y * resolution + x) * 4 + 3] > 128) {
            filled.push(x, y)
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
            minY = Math.min(minY, y)
            maxY = Math.max(maxY, y)
          }
        }
      }
      const out = new Float32Array(count * 3)
      if (!filled.length) return out
      const scale = width / Math.max(1, maxX - minX)
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      for (let i = 0; i < count; i++) {
        const j = Math.floor(Math.random() * (filled.length / 2)) * 2
        out[i * 3] = (filled[j] - cx + Math.random()) * scale
        out[i * 3 + 1] = -(filled[j + 1] - cy + Math.random()) * scale
        out[i * 3 + 2] = (Math.random() - 0.5) * 0.08
      }
      return out
    },
    /**
     * Видимая ширина сцены (в единицах three) на глубине z = 0 —
     * чтобы подогнать логотип под узкий экран.
     */
    visibleWidth(camera) {
      const distance = camera.position.length()
      return 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect
    },
    /**
     * Нарисовать картинку (логотип) по центру холста, вписав с полями (для samplePixels).
     * Точки берутся там, где картинка непрозрачная; у картинки без прозрачности —
     * где она темнее фона (по яркости), чтобы подходили и чёрные логотипы на белом.
     */
    drawImage(img) {
      return (g, size) => {
        const k = Math.min((size * 0.9) / img.naturalWidth, (size * 0.9) / img.naturalHeight)
        const w = img.naturalWidth * k
        const h = img.naturalHeight * k
        g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
        const data = g.getImageData(0, 0, size, size)
        const d = data.data
        let opaque = 0
        for (let i = 3; i < d.length; i += 4) if (d[i] > 250) opaque++
        // Почти всё непрозрачно — значит, у логотипа фон: превращаем яркость в прозрачность.
        if (opaque > d.length / 4 * 0.6) {
          for (let i = 0; i < d.length; i += 4) d[i + 3] = 255 - (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114)
          g.putImageData(data, 0, 0)
        }
      }
    },
    /** Загрузить картинку и вызвать done(img), когда загрузится. */
    loadImage(url, done) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => done(img)
      img.src = url
    },
    /** Нарисовать текст по центру холста (для samplePixels). */
    drawText(text, weight = 800) {
      return (g, size) => {
        let font = size * 0.5
        g.font = `${weight} ${font}px system-ui, sans-serif`
        const w = g.measureText(text).width
        font = Math.min(font, (font * size * 0.92) / Math.max(1, w))
        g.font = `${weight} ${font}px system-ui, sans-serif`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillStyle = '#fff'
        g.fillText(text, size / 2, size / 2)
      }
    },
    /** Точки на поверхности фигуры: sphere | torus | cube | wave | helix. */
    shape(kind, count, radius = 1.6) {
      const out = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        let x
        let y
        let z
        if (kind === 'torus') {
          const u = Math.random() * Math.PI * 2
          const v = Math.random() * Math.PI * 2
          const R = radius * 0.8
          const r = radius * 0.32
          x = (R + r * Math.cos(v)) * Math.cos(u)
          y = (R + r * Math.cos(v)) * Math.sin(u)
          z = r * Math.sin(v)
        } else if (kind === 'cube') {
          const face = Math.floor(Math.random() * 6)
          const a = (Math.random() * 2 - 1) * radius * 0.75
          const b = (Math.random() * 2 - 1) * radius * 0.75
          const s = (face % 2 ? 1 : -1) * radius * 0.75
          ;[x, y, z] = face < 2 ? [s, a, b] : face < 4 ? [a, s, b] : [a, b, s]
        } else if (kind === 'helix') {
          // Двойная спираль: две нити, повернутые на 180°, плюс разброс по сечению.
          const t = Math.random() * 2 - 1
          const a = t * Math.PI * 4 + (Math.random() < 0.5 ? 0 : Math.PI)
          const spread = 0.12 * radius
          x = Math.cos(a) * radius * 0.55 + (Math.random() - 0.5) * spread
          z = Math.sin(a) * radius * 0.55 + (Math.random() - 0.5) * spread
          y = t * radius * 1.3
        } else if (kind === 'wave') {
          x = (Math.random() * 2 - 1) * radius * 1.4
          z = (Math.random() * 2 - 1) * radius * 1.4
          y = Math.sin(x * 2) * Math.cos(z * 2) * 0.35
        } else {
          // Равномерно по сфере: z — равномерно, угол — равномерно.
          z = Math.random() * 2 - 1
          const t = Math.random() * Math.PI * 2
          const r = Math.sqrt(1 - z * z)
          x = r * Math.cos(t) * radius
          y = r * Math.sin(t) * radius
          z *= radius
        }
        out[i * 3] = x
        out[i * 3 + 1] = y
        out[i * 3 + 2] = z
      }
      return out
    },
    color: (hex) => new THREE.Color(hex),
  }
}
