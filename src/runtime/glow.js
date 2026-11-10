/**
 * «Свет по рамке» — пятно света едет за курсором и зажигает рамки карточек.
 *
 * Образец эффекта без WebGL: только CSS-градиенты и две CSS-переменные.
 * Как и runtime.js, файл самодостаточен (ни одного import): Студия вставляет
 * его текст в экспорт.
 *
 * Как работает:
 *   - в карточку добавляются два слоя (span), оба не ловят клики:
 *       рамка — радиальный градиент с центром в курсоре, от которого маской
 *               оставлена только полоска по краю (padding = толщина рамки);
 *       заливка — тот же градиент, но слабый и на всю карточку;
 *   - курсор слушаем на всём документе, а не на карточке: свет виден и у
 *     СОСЕДНИХ карточек, пока курсор рядом, — рамки «перетекают» одна в другую;
 *   - положение света догоняет курсор с инерцией (requestAnimationFrame).
 * На тач-экранах и при «уменьшить движение» ничего не делает.
 */

/**
 * @param {HTMLElement} el — карточка (у неё должен быть border-radius, если нужны скруглённые углы)
 * @param {Record<string, unknown>} values
 *   size — диаметр пятна, px; border — толщина рамки, px; fill — заливка 0…1;
 *   inertia — 0…0.9; color, colorB — цвета света (центр и край пятна)
 */
export function createGlow(el, values = {}) {
  const v = { size: 340, border: 1.5, fill: 0.14, inertia: 0.25, color: '#a78bfa', colorB: '#22d3ee', ...values }
  const canHover = typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  // ── Слои ──
  const layer = () => {
    const span = document.createElement('span')
    span.setAttribute('aria-hidden', 'true')
    Object.assign(span.style, { position: 'absolute', inset: '0', borderRadius: 'inherit', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.35s' })
    return span
  }
  const ring = layer()
  const fill = layer()
  // Маска «всё минус содержимое» оставляет от слоя только полоску padding — это и есть рамка.
  ring.style.webkitMask = 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)'
  ring.style.webkitMaskComposite = 'xor' // старое имя режима — для Safari
  ring.style.maskComposite = 'exclude'
  fill.style.mixBlendMode = 'plus-lighter'
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
  el.append(fill, ring)

  // ── Оформление из параметров (вызывается и при каждом движении ползунка) ──
  const at = 'var(--k3d-glow-x, 50%) var(--k3d-glow-y, 50%)'
  const apply = () => {
    ring.style.padding = `${v.border}px`
    ring.style.background = `radial-gradient(${v.size}px circle at ${at}, ${v.color}, ${v.colorB} 45%, transparent 75%)`
    // Заливка — тот же свет, но прозрачнее: color-mix подмешивает прозрачность к цвету.
    const soft = (color) => `color-mix(in srgb, ${color} ${Math.round(v.fill * 100)}%, transparent)`
    fill.style.background = `radial-gradient(${v.size * 1.3}px circle at ${at}, ${soft(v.color)}, ${soft(v.colorB)} 40%, transparent 70%)`
  }
  apply()

  // ── Курсор: цель и текущее положение света (в px от угла карточки) ──
  const state = { x: 0, y: 0, tx: 0, ty: 0, placed: false }
  let frame = 0
  const step = () => {
    frame = 0
    const k = 1 - Math.pow(Math.max(0.001, Math.min(v.inertia, 0.95)), 0.35)
    state.x += (state.tx - state.x) * k
    state.y += (state.ty - state.y) * k
    el.style.setProperty('--k3d-glow-x', `${state.x.toFixed(1)}px`)
    el.style.setProperty('--k3d-glow-y', `${state.y.toFixed(1)}px`)
    if (Math.abs(state.tx - state.x) + Math.abs(state.ty - state.y) > 0.3) frame = requestAnimationFrame(step)
  }
  const onMove = (event) => {
    const rect = el.getBoundingClientRect()
    state.tx = event.clientX - rect.left
    state.ty = event.clientY - rect.top
    // Свет виден, пока курсор не дальше радиуса пятна от карточки.
    const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right)
    const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom)
    const near = Math.hypot(dx, dy) < v.size * 0.6
    ring.style.opacity = fill.style.opacity = near ? '1' : '0'
    if (!near) return
    // Первое появление — сразу на месте, без «прилёта» из угла.
    if (!state.placed) {
      state.placed = true
      state.x = state.tx
      state.y = state.ty
    }
    if (!frame) frame = requestAnimationFrame(step)
  }
  const onLeave = () => {
    ring.style.opacity = fill.style.opacity = '0'
    state.placed = false
  }
  if (canHover && !reduced) {
    document.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onLeave)
  }

  return {
    set(next) {
      Object.assign(v, next)
      apply()
    },
    destroy() {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onLeave)
      ring.remove()
      fill.remove()
      el.style.removeProperty('--k3d-glow-x')
      el.style.removeProperty('--k3d-glow-y')
    },
  }
}
