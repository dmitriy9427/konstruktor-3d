/**
 * Панель производительности в углу экрана.
 *
 * На сайте — только в режиме разработки:
 *   if (import.meta.env.DEV) import('./engine/perf').then((m) => m.mountPerf())
 * (при сборке условие становится if (false), и код панели выбрасывается).
 * В Студии — включается переключателем.
 *
 * Что показывает:
 *   FPS страницы   — сколько кадров в секунду реально рисует браузер;
 *   по каждому эффекту — время кадра на процессоре и видеокарте (если
 *   браузер умеет его мерить), плотность пикселей, размер холста, вызовы отрисовки;
 *   память JS (только Chrome).
 * Цвет FPS: зелёный ≥ 55, жёлтый ≥ 40, красный — ниже.
 */
import type { EffectStats } from '../runtime/runtime'

type Registry = Set<EffectStats>

const registry = (): Registry => ((globalThis as { __K3D_EFFECTS__?: Registry }).__K3D_EFFECTS__ ??= new Set())

export function mountPerf(parent: HTMLElement = document.body) {
  const box = document.createElement('div')
  box.className = 'k3d-perf'
  box.setAttribute('role', 'status')
  box.setAttribute('aria-label', 'Производительность')
  // На странице — в правом нижнем углу экрана; в Студии — в углу превью.
  const inBody = parent === document.body
  Object.assign(box.style, {
    position: inBody ? 'fixed' : 'absolute',
    right: inBody ? '12px' : '28px',
    [inBody ? 'bottom' : 'top']: inBody ? '12px' : '28px',
    zIndex: '9999',
    minWidth: '180px',
    padding: '10px 12px',
    borderRadius: '12px',
    background: 'rgba(10, 10, 16, 0.82)',
    backdropFilter: 'blur(8px)',
    color: '#e8e8f0',
    font: '11px/1.5 "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    pointerEvents: 'none',
    boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
  })
  parent.append(box)

  let frames = 0
  let start = performance.now()
  let fps = 0
  let raf = 0
  const loop = (now: number) => {
    frames++
    if (now - start >= 500) {
      fps = Math.round((frames * 1000) / (now - start))
      frames = 0
      start = now
      render()
    }
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  const color = (value: number) => (value >= 55 ? '#4ade80' : value >= 40 ? '#facc15' : '#f87171')
  const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(2))

  function render() {
    const effects = [...registry()]
    const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory
    const rows = effects
      .map(
        (s) =>
          `<div style="margin-top:6px;opacity:.9"><b>${escape(s.name)}</b><br>` +
          `CPU ${fmt(s.cpuMs)} мс · GPU ${fmt(s.gpuMs)} мс<br>` +
          `${s.width}×${s.height} · dpr ${s.dpr.toFixed(2)} · draw ${s.drawCalls}</div>`,
      )
      .join('')
    box.innerHTML =
      `<div style="font-size:13px"><b style="color:${color(fps)}">${fps}</b> FPS · эффектов: ${effects.length}</div>` +
      (memory ? `<div style="opacity:.7">память JS ${(memory.usedJSHeapSize / 1048576).toFixed(0)} МБ</div>` : '') +
      rows
  }

  return {
    destroy() {
      cancelAnimationFrame(raf)
      box.remove()
    },
  }
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
