/**
 * Живое превью эффекта.
 *
 * Шейдерные эффекты рисуются тем же рантаймом, что уходит в экспорт.
 * Холст создаём сами внутри useEffect и убираем при очистке: рантайм при
 * уничтожении отпускает WebGL-контекст, и старый холст переиспользовать
 * нельзя. (StrictMode в разработке монтирует эффект дважды — так каждый
 * запуск получает свежий холст.)
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { EffectDef } from '../effects/types'
import type { Common } from '../engine/params'
import { createEffect, type EffectInstance, type Values } from '../runtime/runtime'
import { createTilt, type TiltInstance } from '../runtime/tilt'

type Props = { effect: EffectDef; values: Values; common: Common; image: string }

export function Preview(props: Props) {
  if (props.effect.kind === 'css') return <TiltPreview {...props} />
  return <ShaderPreview key={props.effect.id} {...props} />
}

function ShaderPreview({ effect, values, common, image }: Props) {
  const host = useRef<HTMLElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const instance = useRef<EffectInstance | null>(null)
  const [error, setError] = useState('')
  // Последние значения — в ref: эффект создания читает их, не завися от них.
  const latest = useRef({ values, common })
  useLayoutEffect(() => {
    latest.current = { values, common }
  })

  useEffect(() => {
    if (!host.current) return
    const canvas = document.createElement('canvas')
    canvas.className = effect.kind === 'image' ? 'photo__canvas' : 'preview__canvas'
    canvas.setAttribute('aria-hidden', 'true')
    host.current.append(canvas)
    try {
      const { values: v, common: c } = latest.current
      instance.current = createEffect(
        canvas,
        { name: effect.name, fragment: effect.fragment!, params: effect.params, values: v, image: effect.kind === 'image' ? (img.current ?? undefined) : undefined },
        { mouse: c.mouse, inertia: c.inertia, quality: c.quality, post: c.post, reducedMotion: false },
      )
    } catch (e) {
      // Ошибка приходит из внешней системы (компиляция шейдера) — показать её можно только так.
      // oxlint-disable-next-line react/set-state-in-effect
      setError(e instanceof Error ? e.message : String(e))
    }
    return () => {
      instance.current?.destroy()
      instance.current = null
      canvas.remove()
    }
  }, [effect])

  useEffect(() => instance.current?.set(values), [values])
  useEffect(() => instance.current?.setOptions({ mouse: common.mouse, inertia: common.inertia, quality: common.quality, post: common.post }), [common])
  useEffect(() => {
    if (effect.kind === 'image' && img.current) instance.current?.setImage(img.current)
  }, [image, effect.kind])

  if (effect.kind === 'image') {
    return (
      <div className="preview preview--image">
        <figure ref={host as React.RefObject<HTMLElement>} className="photo">
          <img ref={img} src={image} alt="Пример картинки" />
        </figure>
        <p className="preview__hint">Наведите курсор на картинку</p>
        {error && <p className="preview__error">{error}</p>}
      </div>
    )
  }
  return (
    <div ref={host as React.RefObject<HTMLDivElement>} className="preview" role="img" aria-label={`Превью: ${effect.name}`}>
      {error && <p className="preview__error">{error}</p>}
    </div>
  )
}

function TiltPreview({ values, image }: Props) {
  const card = useRef<HTMLElement>(null)
  const instance = useRef<TiltInstance | null>(null)
  const latest = useRef(values)
  useLayoutEffect(() => {
    latest.current = values
  })
  useEffect(() => {
    if (!card.current) return
    instance.current = createTilt(card.current, latest.current)
    return () => instance.current?.destroy()
  }, [])
  useEffect(() => instance.current?.set(values), [values])
  return (
    <div className="preview preview--tilt">
      <article ref={card} className="tilt-card">
        <img src={image} alt="" />
        <div className="tilt-card__body">
          <p className="tilt-card__eyebrow">Карточка</p>
          <h3>Наведите курсор</h3>
          <p>Карточка наклоняется за курсором, по ней бежит блик. Только CSS — без WebGL.</p>
        </div>
      </article>
    </div>
  )
}
