/**
 * 3D-наклон карточки за курсором — без WebGL, только CSS-трансформации.
 *
 * Как и runtime.js, файл самодостаточен: Студия вставляет его текст в экспорт.
 *
 * Как работает: курсор над карточкой → доля от центра (−1…1) по осям →
 * поворот rotateX/rotateY. Значения догоняют цель с инерцией (своя пружина
 * на requestAnimationFrame), поэтому наклон плавный даже при рывке мыши.
 * Блик — полупрозрачный радиальный градиент поверх карточки, который едет
 * за курсором. На тач-экранах и при «уменьшить движение» ничего не делает.
 */

/**
 * @param {HTMLElement} el
 * @param {Record<string, unknown>} values
 *   max — угол наклона, °; perspective — px; scale — увеличение при наведении;
 *   inertia — 0…1; glare — сила блика 0…1; reverse — наклон «от курсора»; axis — both | x | y
 */
export function createTilt(el, values = {}) {
  const v = { max: 12, perspective: 900, scale: 1.04, inertia: 0.15, glare: 0.35, reverse: false, axis: 'both', ...values }
  const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  const glare = document.createElement('span')
  glare.setAttribute('aria-hidden', 'true')
  Object.assign(glare.style, {
    position: 'absolute',
    inset: '0',
    borderRadius: 'inherit',
    pointerEvents: 'none',
    opacity: '0',
    transition: 'opacity 0.3s',
    mixBlendMode: 'soft-light',
  })
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
  el.style.transformStyle = 'preserve-3d'
  el.style.willChange = 'transform'
  el.append(glare)

  const state = { x: 0, y: 0, tx: 0, ty: 0, s: 1, ts: 1, gx: 50, gy: 50 }
  let frame = 0

  const apply = () => {
    const ax = v.axis === 'y' ? 0 : 1
    const ay = v.axis === 'x' ? 0 : 1
    const dir = v.reverse ? -1 : 1
    el.style.transform = `perspective(${v.perspective}px) rotateX(${(-state.y * v.max * ay * dir).toFixed(2)}deg) rotateY(${(state.x * v.max * ax * dir).toFixed(2)}deg) scale(${state.s.toFixed(3)})`
    glare.style.background = `radial-gradient(circle at ${state.gx}% ${state.gy}%, rgba(255,255,255,${v.glare}), transparent 60%)`
  }

  const step = () => {
    frame = 0
    const k = 1 - Math.pow(Math.max(0.001, Math.min(v.inertia, 0.95)), 0.35)
    state.x += (state.tx - state.x) * k
    state.y += (state.ty - state.y) * k
    state.s += (state.ts - state.s) * k
    apply()
    if (Math.abs(state.tx - state.x) + Math.abs(state.ty - state.y) + Math.abs(state.ts - state.s) > 0.001) {
      frame = requestAnimationFrame(step)
    }
  }
  const kick = () => {
    if (!frame) frame = requestAnimationFrame(step)
  }

  const onMove = (event) => {
    const rect = el.getBoundingClientRect()
    const px = (event.clientX - rect.left) / rect.width
    const py = (event.clientY - rect.top) / rect.height
    state.tx = px * 2 - 1
    state.ty = py * 2 - 1
    state.ts = v.scale
    state.gx = Math.round(px * 100)
    state.gy = Math.round(py * 100)
    glare.style.opacity = '1'
    kick()
  }
  const onLeave = () => {
    state.tx = 0
    state.ty = 0
    state.ts = 1
    glare.style.opacity = '0'
    kick()
  }

  if (canHover && !reduced) {
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
  }

  return {
    set(next) {
      Object.assign(v, next)
      apply()
    },
    destroy() {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      glare.remove()
      el.style.transform = ''
      el.style.willChange = ''
      el.style.transformStyle = ''
    },
  }
}
