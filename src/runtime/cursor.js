/**
 * Курсоры без WebGL: след из частиц, кольцо, фонарик.
 *
 * Как и runtime.js, файл самодостаточен: Студия вставляет его текст в экспорт.
 *
 *   trail      — 2D-холст поверх страницы. Движение мыши рождает частицы
 *                (пропорционально пройденному пути), клик — салют. У частиц
 *                скорость, гравитация, сопротивление воздуха и время жизни.
 *   ring       — две метки: точка точно под курсором и кольцо, которое
 *                догоняет её с инерцией. Над ссылками и кнопками кольцо
 *                растёт; mix-blend-mode: difference инвертирует цвет под ним —
 *                курсор виден на любом фоне.
 *   flashlight — слой-затемнение с «дыркой» radial-gradient у курсора;
 *                позиция — в CSS-переменных, перерисовку делает браузер.
 *
 * Пока мыши нет над областью — курсор прячется. На тач-экранах ничего не делает
 * (мыши нет), при «уменьшить движение» — без следа и инерции.
 */

/**
 * @param {HTMLElement} root — где работает курсор: document.body (вся страница) или блок
 * @param {Record<string, unknown>} values — параметры (см. DEFAULTS)
 */
export function createCursor(root, values = {}) {
  const v = { ...CURSOR_DEFAULTS, ...values }
  const page = root === document.body || root === document.documentElement
  const fine = typeof matchMedia !== 'function' || matchMedia('(pointer: fine)').matches
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const stats = { name: v.name ?? 'курсор', fps: 0, cpuMs: 0, gpuMs: null, dpr: 1, drawCalls: 0, width: 0, height: 0 }
  const cleanups = []
  if (!fine) return { stats, set() {}, destroy() {} }

  if (!page && getComputedStyle(root).position === 'static') root.style.position = 'relative'
  // Слой поверх всего содержимого области; клики проходят сквозь.
  const layer = document.createElement('div')
  layer.setAttribute('aria-hidden', 'true')
  Object.assign(layer.style, {
    position: page ? 'fixed' : 'absolute',
    inset: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '2147483000',
  })
  root.append(layer)
  cleanups.push(() => layer.remove())

  const prevCursor = root.style.cursor
  const applyCursor = () => (root.style.cursor = v.hideCursor ? 'none' : prevCursor)
  applyCursor()
  cleanups.push(() => (root.style.cursor = prevCursor))

  // ─── Мышь в координатах области ───────────────────────────────────────────
  const m = { x: 0, y: 0, px: 0, py: 0, inside: false, down: false, over: false }
  const toLocal = (e) => {
    const r = page ? { left: 0, top: 0, width: innerWidth, height: innerHeight } : root.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top, r]
  }
  const onMove = (e) => {
    const [x, y, r] = toLocal(e)
    m.inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height
    m.x = x
    m.y = y
    // Над ссылкой, кнопкой, полем — «интерактивное».
    m.over = Boolean(e.target?.closest?.('a, button, [role="button"], input, textarea, select, label, summary'))
    wake()
  }
  const onDown = (e) => {
    const [x, y] = toLocal(e)
    m.down = true
    if (m.inside) burst(x, y)
    wake()
  }
  const onUp = () => (m.down = false)
  const onLeave = () => {
    m.inside = false
    wake()
  }
  addEventListener('pointermove', onMove, { passive: true })
  addEventListener('pointerdown', onDown, { passive: true })
  addEventListener('pointerup', onUp, { passive: true })
  document.addEventListener('pointerleave', onLeave)
  cleanups.push(() => {
    removeEventListener('pointermove', onMove)
    removeEventListener('pointerdown', onDown)
    removeEventListener('pointerup', onUp)
    document.removeEventListener('pointerleave', onLeave)
  })

  // ─── Виды ─────────────────────────────────────────────────────────────────
  let frame = () => false // вернуть true, если нужен следующий кадр
  let burst = () => {}
  let restyle = null // перекрасить метки после set()

  if (v.type === 'trail') {
    const canvas = document.createElement('canvas')
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' })
    layer.append(canvas)
    const ctx = canvas.getContext('2d')
    const parts = []
    let carry = 0
    const palette = () => [v.colorA, v.colorB, v.colorC]
    const spawn = (x, y, vx, vy, n) => {
      for (let i = 0; i < n && parts.length < 1500; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = Math.random() * v.spread * 60
        parts.push({
          x,
          y,
          vx: vx * 0.15 + Math.cos(a) * sp,
          vy: vy * 0.15 + Math.sin(a) * sp,
          life: 1,
          decay: 1 / (v.life * (0.6 + Math.random() * 0.8)),
          size: v.size * (0.5 + Math.random()),
          rot: Math.random() * 6.28,
          color: v.rainbow ? `hsl(${(performance.now() * 0.12 + Math.random() * 40) % 360} 90% 65%)` : palette()[Math.floor(Math.random() * 3)],
        })
      }
    }
    burst = (x, y) => {
      const n = Math.round(30 * v.burst)
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        const sp = 140 + Math.random() * 220
        spawn(x, y, Math.cos(a) * sp / 0.15 * 0.3, Math.sin(a) * sp / 0.15 * 0.3, 1)
      }
    }
    const shapes = {
      circle: (s) => (ctx.beginPath(), ctx.arc(0, 0, s, 0, 6.2832), ctx.fill()),
      square: (s) => ctx.fillRect(-s, -s, s * 2, s * 2),
      star: (s) => {
        ctx.beginPath()
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? s * 0.45 : s * 1.2
          const a = (i / 10) * 6.2832 - 1.5708
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
        }
        ctx.fill()
      },
      heart: (s) => {
        ctx.beginPath()
        ctx.moveTo(0, s * 0.9)
        ctx.bezierCurveTo(-s * 1.6, -s * 0.2, -s * 0.6, -s * 1.4, 0, -s * 0.5)
        ctx.bezierCurveTo(s * 0.6, -s * 1.4, s * 1.6, -s * 0.2, 0, s * 0.9)
        ctx.fill()
      },
    }
    let last = { x: 0, y: 0, has: false }
    frame = (dt) => {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      const w = layer.clientWidth
      const h = layer.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
      }
      // Рождаем частицы по пройденному пути: быстрый взмах — длинный густой след.
      if (m.inside && !reduced) {
        if (last.has) {
          const dx = m.x - last.x
          const dy = m.y - last.y
          const dist = Math.hypot(dx, dy)
          carry += dist * v.density * 0.25
          const n = Math.floor(carry)
          carry -= n
          for (let i = 0; i < n; i++) {
            const t = (i + 1) / n
            spawn(last.x + dx * t, last.y + dy * t, dx / dt, dy / dt, 1)
          }
        }
        last = { x: m.x, y: m.y, has: true }
      } else last.has = false

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = v.glow ? 'lighter' : 'source-over'
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.life -= p.decay * dt
        if (p.life <= 0) {
          parts.splice(i, 1)
          continue
        }
        p.vy += v.gravity * 400 * dt
        const drag = Math.exp(-2.2 * dt)
        p.vx *= drag
        p.vy *= drag
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += dt * 3
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.globalAlpha = Math.min(1, p.life * 1.5)
        ctx.fillStyle = p.color
        ;(shapes[v.shape] ?? shapes.circle)(p.size * (0.4 + 0.6 * p.life))
        ctx.restore()
      }
      stats.drawCalls = parts.length
      stats.width = canvas.width
      stats.height = canvas.height
      return parts.length > 0 || m.inside
    }
  }

  if (v.type === 'ring') {
    const make = (styles) => {
      const el = document.createElement('div')
      Object.assign(el.style, { position: 'absolute', left: '0', top: '0', borderRadius: '50%', willChange: 'transform', transition: 'opacity .25s', ...styles })
      layer.append(el)
      return el
    }
    const ring = make({})
    const dot = make({})
    const style = () => {
      const blend = v.invert ? 'difference' : 'normal'
      Object.assign(dot.style, { width: `${v.dotSize}px`, height: `${v.dotSize}px`, background: v.color, mixBlendMode: blend })
      Object.assign(ring.style, {
        width: `${v.ringSize}px`,
        height: `${v.ringSize}px`,
        border: `${v.ringWidth}px solid ${v.color}`,
        mixBlendMode: blend,
        background: 'transparent',
      })
    }
    style()
    const r = { x: 0, y: 0, s: 1, init: false }
    frame = (dt) => {
      if (!r.init && m.inside) {
        r.x = m.x
        r.y = m.y
        r.init = true
      }
      const k = reduced ? 1 : 1 - Math.exp(-dt / Math.max(0.01, v.lag) * 0.35)
      r.x += (m.x - r.x) * k
      r.y += (m.y - r.y) * k
      const target = (m.over ? v.hoverScale : 1) * (m.down ? 0.8 : 1)
      r.s += (target - r.s) * (1 - Math.exp(-dt * 14))
      const show = m.inside ? '1' : '0'
      dot.style.opacity = show
      ring.style.opacity = show
      dot.style.transform = `translate(${m.x - v.dotSize / 2}px, ${m.y - v.dotSize / 2}px) scale(${m.over ? 0.5 : 1})`
      ring.style.transform = `translate(${r.x - v.ringSize / 2}px, ${r.y - v.ringSize / 2}px) scale(${r.s})`
      // Над интерактивным кольцо заливается — «лупа».
      ring.style.background = m.over && v.fillOnHover ? v.color : 'transparent'
      return Math.abs(m.x - r.x) + Math.abs(m.y - r.y) > 0.1 || Math.abs(target - r.s) > 0.001
    }
    restyle = style
  }

  if (v.type === 'flashlight') {
    const shade = document.createElement('div')
    Object.assign(shade.style, { position: 'absolute', inset: '0', transition: 'opacity .3s' })
    layer.append(shade)
    const paint = (x, y) => {
      const rgb = hex(v.shade)
      const a = v.darkness
      const tint = hex(v.tint)
      shade.style.background = `radial-gradient(circle ${v.radius}px at ${x}px ${y}px, rgba(${tint},${v.glowAmt * 0.25}) 0%, rgba(${rgb},0) ${Math.round(
        (1 - v.softness) * 100,
      )}%, rgba(${rgb},${a}) 100%)`
    }
    const f = { x: 0, y: 0 }
    frame = (dt) => {
      const k = reduced ? 1 : 1 - Math.exp(-dt / Math.max(0.01, v.lag) * 0.35)
      f.x += (m.x - f.x) * k
      f.y += (m.y - f.y) * k
      // Мышь ушла — затемнение остаётся, но свет гаснет к центру области.
      if (m.inside) paint(f.x, f.y)
      else paint(layer.clientWidth / 2, layer.clientHeight / 2)
      return Math.abs(m.x - f.x) + Math.abs(m.y - f.y) > 0.1
    }
  }

  // ─── Цикл ─────────────────────────────────────────────────────────────────
  let raf = 0
  let last = 0
  function tick(now) {
    raf = 0
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60
    last = now
    const cpu = performance.now()
    const more = frame(dt)
    stats.cpuMs = performance.now() - cpu
    stats.fps = Math.round(1 / dt)
    if (more) wake()
    else last = 0
  }
  function wake() {
    if (!raf) raf = requestAnimationFrame(tick)
  }
  wake()
  cleanups.push(() => raf && cancelAnimationFrame(raf))

  const registry = (globalThis.__K3D_EFFECTS__ ??= new Set())
  registry.add(stats)
  cleanups.push(() => registry.delete(stats))

  return {
    stats,
    /** Поменять параметры на лету. */
    set(next) {
      Object.assign(v, next)
      applyCursor()
      restyle?.()
      wake()
    },
    destroy() {
      cleanups.splice(0).reverse().forEach((fn) => fn())
    },
  }
}

export const CURSOR_DEFAULTS = {
  type: 'trail',
  hideCursor: false,
  // trail
  shape: 'star',
  density: 1,
  size: 5,
  life: 0.9,
  spread: 1,
  gravity: 0.4,
  burst: 1,
  glow: true,
  rainbow: false,
  colorA: '#ffd166',
  colorB: '#ff6b9d',
  colorC: '#a78bfa',
  // ring
  dotSize: 8,
  ringSize: 38,
  ringWidth: 2,
  lag: 0.12,
  hoverScale: 1.8,
  invert: true,
  fillOnHover: false,
  color: '#ffffff',
  // flashlight
  radius: 180,
  softness: 0.35,
  darkness: 0.88,
  glowAmt: 0,
  shade: '#05040c',
  tint: '#ffd9a8',
}

function hex(color) {
  const h = String(color).replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}
