/**
 * Главная страница (пока простая — витрина со скролл-сценой будет на этапе 4).
 * Фон героя — эффект «Аврора» из каталога, подключённый так же, как его
 * подключит пользователь: тот же рантайм, лениво.
 */
import '@fontsource-variable/onest'
import '../styles/base.css'
import '../styles/site.css'

import { aurora } from '../effects/aurora'
import { resolveValues } from '../engine/params'

const target = document.querySelector<HTMLElement>('#hero-bg')!

const observer = new IntersectionObserver(
  async ([entry]) => {
    if (!entry.isIntersecting) return
    observer.disconnect()
    const { createEffect } = await import('../runtime/runtime.js')
    const canvas = document.createElement('canvas')
    canvas.className = 'hero__canvas'
    canvas.setAttribute('aria-hidden', 'true')
    target.append(canvas)
    try {
      createEffect(canvas, { name: aurora.name, fragment: aurora.fragment!, params: aurora.params, values: resolveValues(aurora.params) }, { post: { grain: 0.25, vignette: 0.4 } })
      canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'ease-out' })
    } catch {
      canvas.remove()
    }
  },
  { rootMargin: '50% 0px' },
)
observer.observe(target)

// Панель производительности — только при разработке: в сборку не попадает.
if (import.meta.env.DEV) void import('../engine/perf').then((m) => m.mountPerf())
