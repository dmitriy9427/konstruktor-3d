/**
 * Живое превью эффекта.
 *
 * Шейдерные эффекты рисуются тем же рантаймом, что уходит в экспорт.
 * Холст создаём сами внутри useEffect и убираем при очистке: рантайм при
 * уничтожении отпускает WebGL-контекст, и старый холст переиспользовать
 * нельзя. (StrictMode в разработке монтирует эффект дважды — так каждый
 * запуск получает свежий холст.)
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { EffectDef } from '../effects/types'
import { runtimeOptions, type Common } from '../engine/params'
import { createEffect, type EffectInstance, type Values } from '../runtime/runtime'
import { createCursor, type CursorInstance } from '../runtime/cursor'
import { createLiquidButton, createPreloader, type LiquidButtonInstance, type PreloaderInstance } from '../runtime/ui'
import type { SceneInstance } from '../runtime/scene'
import { createTilt, type TiltInstance } from '../runtime/tilt'
import { createTransition, type TransitionInstance, type TransitionTrigger } from '../runtime/transition'

type Props = {
  effect: EffectDef
  values: Values
  common: Common
  image: string
  /** Режим рисования точек: клик по превью → onPick(x, y) в долях (y вверх). */
  drawing?: boolean
  onPick?: (x: number, y: number) => void
  /** Пока рисуют траекторию — показать её поверх превью. */
  path?: [number, number][]
  /** Ошибка компиляции (для «Своего эффекта» её показывает редактор кода). */
  onError?: (message: string) => void
}

/** Прозрачный слой поверх превью: ловит клики, пока рисуют точки (и показывает путь). */
function DrawLayer({ onPick, path, dots }: { onPick?: (x: number, y: number) => void; path?: [number, number][]; dots?: [number, number][] }) {
  return (
    <div
      className="draw-layer"
      role="button"
      aria-label={path ? 'Поставить точку пути' : 'Поставить звезду'}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onPick?.((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height)
      }}
    >
      {dots && dots.length > 0 && (
        <svg className="draw-layer__path" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          {dots.map(([x, y], i) => (
            <circle key={i} cx={x} cy={1 - y} r={0.012} className="draw-layer__origin" />
          ))}
        </svg>
      )}
      {path && path.length > 0 && (
        <svg className="draw-layer__path" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={path.map(([x, y]) => `${x},${1 - y}`).join(' ')} vectorEffect="non-scaling-stroke" />
          {path.map(([x, y], i) => (
            <circle key={i} cx={x} cy={1 - y} r={0.006} />
          ))}
        </svg>
      )}
    </div>
  )
}

export function Preview(props: Props) {
  if (props.effect.kind === 'css') return <TiltPreview {...props} />
  if (props.effect.kind === 'transition') return <TransitionPreview {...props} />
  if (props.effect.kind === 'slides') return <SlidesPreview key={props.effect.id} {...props} />
  if (props.effect.kind === 'three') return <ScenePreview key={props.effect.id} {...props} />
  if (props.effect.id === 'liquid-button') return <LiquidButtonPreview key={props.effect.id} {...props} />
  if (props.effect.id === 'preloader') return <PreloaderPreview key={props.effect.id} {...props} />
  if (props.effect.kind === 'cursor' || props.effect.overlay) return <CursorPreview key={props.effect.id} {...props} />
  // Режим «по прокрутке» — мини-страница, которую можно листать (своя разметка → свой key).
  const scroll = props.values.cycle === 'scroll'
  return <ShaderPreview key={props.effect.id + (scroll ? '-scroll' : '')} {...props} scroll={scroll} />
}

const SCROLL_SCENES = ['Рассвет', 'День', 'Закат', 'Шторм', 'Ночь']

function ShaderPreview({ effect, values, common, image, scroll = false, drawing, onPick, path, onError }: Props & { scroll?: boolean }) {
  const host = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const stack = useRef<HTMLDivElement>(null)
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
        { name: effect.name, fragment: effect.fragment!, params: effect.params, values: v, simulation: effect.simulation, image: effect.kind === 'image' ? (img.current ?? undefined) : undefined },
        { ...runtimeOptions(c), post: c.post, reducedMotion: false, scrollStack: stack.current, scroller: scroller.current },
      )
      // «Свой эффект» пересобирается без смены компонента — прошлую ошибку сбрасываем.
      // oxlint-disable-next-line react/set-state-in-effect
      setError('')
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

  // Ошибку отдаём наверх; удачная сборка — пустая строка.
  const report = useRef(onError)
  useLayoutEffect(() => {
    report.current = onError
  })
  useEffect(() => report.current?.(error), [error])

  useEffect(() => instance.current?.set(values), [values])
  useEffect(() => instance.current?.setOptions({ ...runtimeOptions(common), post: common.post }), [common])
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
  if (scroll) {
    // Липкий стек: эффект прилип к экрану, поверх едут подписи сцен.
    return (
      <div className="preview preview--scroll">
        <div ref={scroller} className="demo">
          <div ref={stack} className="scroll-stage">
            <div ref={host as React.RefObject<HTMLDivElement>} className="scroll-stage__sticky" role="img" aria-label={`Превью: ${effect.name}`} />
            {SCROLL_SCENES.map((name, i) => (
              <section key={name} className="scroll-stage__scene">
                <p className="demo__eyebrow">Сцена {i + 1} / 5</p>
                <h2>{name}</h2>
                {i === 0 && <p>Прокручивайте превью — море стоит на месте, меняется время суток</p>}
              </section>
            ))}
          </div>
        </div>
        {error && <p className="preview__error">{error}</p>}
      </div>
    )
  }
  return (
    <div ref={host as React.RefObject<HTMLDivElement>} className="preview" role="img" aria-label={`Превью: ${effect.name}`}>
      {drawing && <DrawLayer onPick={onPick} path={path} />}
      {error && !onError && <p className="preview__error">{error}</p>}
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

/**
 * Превью перехода — маленькая страница внутри превью, её можно прокручивать.
 * «Секция 1» лежит поверх «Секции 2» в «липком» стеке, как на настоящем сайте.
 * Переход пересоздаётся при каждом изменении параметров (поле времени
 * зависит от них); прогресс для «Появления» и «Из кода» сохраняем.
 */
function TransitionPreview({ effect, values, drawing, onPick }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const cover = useRef<HTMLElement>(null)
  const instance = useRef<TransitionInstance | null>(null)
  const kept = useRef(0)
  const trigger = values.trigger as TransitionTrigger

  useEffect(() => {
    if (!cover.current || !scroller.current) return
    const t = createTransition(cover.current, { ...values, name: effect.name }, { scroller: scroller.current, trigger })
    if (trigger === 'manual' && kept.current) t.progress(kept.current)
    instance.current = t
    return () => {
      kept.current = t.value
      t.destroy()
      instance.current = null
    }
  }, [effect, values, trigger])

  // Новый режим запуска — начинаем сначала.
  useEffect(() => {
    kept.current = 0
    scroller.current?.scrollTo({ top: 0 })
  }, [trigger, effect])

  const scrollable = trigger !== 'manual'
  return (
    <div className="preview preview--transition">
      <div ref={scroller} className={`demo demo--${trigger}`}>
        {scrollable && (
          <div className="demo__intro">
            <p>{trigger === 'scroll' ? 'Прокрутите превью вниз — переход идёт вместе со скроллом' : 'Прокрутите вниз — секция сгорит, когда покажется'}</p>
            <span aria-hidden="true">↓</span>
          </div>
        )}
        <div className="demo__stack">
          <section ref={cover} className="demo__a">
            <p className="demo__eyebrow">Секция 1</p>
            <h2>Всё, что было до</h2>
            <p>Это настоящая HTML-секция: текст выделяется, кнопка нажимается. Переход не делает снимок страницы — он прожигает дыры прямо в ней.</p>
            <button type="button" className="button">Кнопка внутри</button>
          </section>
          <section className="demo__b">
            <p className="demo__eyebrow">Секция 2</p>
            <h2>Всё, что будет после</h2>
          </section>
        </div>
        {scrollable && <div className="demo__outro">Конец страницы</div>}
      </div>
      {drawing && (
        <DrawLayer
          onPick={onPick}
          dots={String(values.origins ?? '')
            .split(';')
            .filter(Boolean)
            .map((p) => p.split(',').map(Number).slice(0, 2) as [number, number])}
        />
      )}
      {!scrollable && (
        <div className="demo__controls">
          <button type="button" className="button button--primary" onClick={() => instance.current?.play()}>
            Сжечь
          </button>
          <button type="button" className="button" onClick={() => instance.current?.reverse()}>
            Вернуть
          </button>
        </div>
      )}
    </div>
  )
}

const SLIDES = ['photo.svg', 'photo-2.svg', 'photo-3.svg'].map((name) => `${import.meta.env.BASE_URL}demo/${name}`)

/** Превью слайдера: три демо-фото, кнопки и точки. */
function SlidesPreview({ effect, values, common, image }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const instance = useRef<EffectInstance | null>(null)
  const [index, setIndex] = useState(0)
  const [error, setError] = useState('')
  const latest = useRef({ values, common })
  useLayoutEffect(() => {
    latest.current = { values, common }
  })
  // Своя картинка встаёт первым слайдом.
  const images = useMemo(() => (image.startsWith('blob:') ? [image, ...SLIDES.slice(1)] : SLIDES), [image])

  useEffect(() => {
    if (!host.current) return
    const canvas = document.createElement('canvas')
    canvas.className = 'slider__canvas'
    host.current.append(canvas)
    try {
      const { values: v, common: c } = latest.current
      instance.current = createEffect(
        canvas,
        { name: effect.name, fragment: effect.fragment!, params: effect.params, values: v, images: effect.hoverSwap ? images.slice(0, 2) : images, hoverSwap: effect.hoverSwap },
        { ...runtimeOptions(c), post: c.post, reducedMotion: false },
      )
    } catch (e) {
      // oxlint-disable-next-line react/set-state-in-effect
      setError(e instanceof Error ? e.message : String(e))
    }
    // Номер слайда — из рантайма (меняется и автопрокруткой).
    const timer = setInterval(() => instance.current && setIndex(instance.current.index), 150)
    return () => {
      clearInterval(timer)
      instance.current?.destroy()
      instance.current = null
      canvas.remove()
    }
  }, [effect, images])

  useEffect(() => instance.current?.set(values), [values])
  useEffect(() => instance.current?.setOptions({ ...runtimeOptions(common), post: common.post }), [common])

  return (
    <div className="preview preview--image">
      <div ref={host} className="slider">
        <img src={images[0]} alt="Слайд 1" />
      </div>
      {effect.hoverSwap ? (
        <p className="preview__hint">Наведите курсор на картинку</p>
      ) : (
      <div className="slider__nav">
        <button type="button" className="icon-button" aria-label="Предыдущий слайд" onClick={() => instance.current?.prev()}>
          ←
        </button>
        {images.map((_, i) => (
          <button key={i} type="button" className="slider__dot" aria-label={`Слайд ${i + 1}`} aria-current={i === index} onClick={() => instance.current?.goTo(i)} />
        ))}
        <button type="button" className="icon-button" aria-label="Следующий слайд" onClick={() => instance.current?.next()}>
          →
        </button>
      </div>
      )}
      {error && <p className="preview__error">{error}</p>}
    </div>
  )
}

/**
 * Превью 3D: three.js (≈ 170 КБ gzip) скачивается, только когда выбран
 * 3D-эффект, — остальная Студия его не грузит. Пока грузится — подпись.
 */
function ScenePreview({ effect, values, common, drawing, onPick, path }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const instance = useRef<SceneInstance | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const latest = useRef({ values, common })
  useLayoutEffect(() => {
    latest.current = { values, common }
  })

  useEffect(() => {
    let cancelled = false
    let canvas: HTMLCanvasElement | null = null
    void (async () => {
      const [THREE, { createScene }, room] = await Promise.all([
        import('three'),
        import('../runtime/scene.js'),
        effect.addons?.includes('RoomEnvironment') ? import('three/addons/environments/RoomEnvironment.js') : null,
      ])
      if (cancelled || !host.current) return
      canvas = document.createElement('canvas')
      canvas.className = 'preview__canvas'
      host.current.append(canvas)
      try {
        const { values: v, common: c } = latest.current
        instance.current = createScene(THREE, canvas, effect.setup!, { name: effect.name, values: v }, {
          ...runtimeOptions(c),
          reducedMotion: false,
          addons: room ? { RoomEnvironment: room.RoomEnvironment } : {},
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
      instance.current?.destroy()
      instance.current = null
      canvas?.remove()
    }
  }, [effect])

  useEffect(() => instance.current?.set(values), [values])
  useEffect(() => instance.current?.setOptions(runtimeOptions(common)), [common])

  return (
    <div ref={host} className="preview" role="img" aria-label={`Превью: ${effect.name}`}>
      {loading && <p className="preview__loading">Загружаю three.js…</p>}
      {drawing && <DrawLayer onPick={onPick} path={path} />}
      {error && <p className="preview__error">{error}</p>}
    </div>
  )
}

/**
 * Превью курсора: демо-страница (заголовок, текст, кнопки, карточки), а курсор
 * работает только внутри неё. Шейдерные курсоры — прозрачный холст поверх
 * страницы; лёгкие — слой из cursor.js.
 */
function CursorPreview({ effect, values, common }: Props) {
  const page = useRef<HTMLDivElement>(null)
  const instance = useRef<EffectInstance | CursorInstance | null>(null)
  const [error, setError] = useState('')
  const latest = useRef({ values, common })
  useLayoutEffect(() => {
    latest.current = { values, common }
  })

  useEffect(() => {
    const host = page.current
    if (!host) return
    const { values: v, common: c } = latest.current
    let canvas: HTMLCanvasElement | null = null
    try {
      if (effect.kind === 'cursor') {
        instance.current = createCursor(host, { ...v, type: effect.id.replace('cursor-', ''), name: effect.name })
      } else {
        canvas = document.createElement('canvas')
        canvas.className = 'cursor-demo__canvas'
        host.append(canvas)
        instance.current = createEffect(
          canvas,
          { name: effect.name, fragment: effect.fragment!, params: effect.params, values: v, simulation: effect.simulation },
          { ...runtimeOptions(c), reducedMotion: false, transparent: true },
        )
      }
    } catch (e) {
      // oxlint-disable-next-line react/set-state-in-effect
      setError(e instanceof Error ? e.message : String(e))
    }
    return () => {
      instance.current?.destroy()
      instance.current = null
      canvas?.remove()
    }
  }, [effect])

  useEffect(() => {
    instance.current?.set(values)
    // Шейдерному курсору «скрыть курсор» — на самой странице.
    if (effect.kind !== 'cursor' && page.current) page.current.style.cursor = values.hideCursor ? 'none' : ''
  }, [values, effect.kind])
  useEffect(() => {
    const it = instance.current
    if (it && 'setOptions' in it) it.setOptions(runtimeOptions(common))
  }, [common])

  return (
    <div className="preview preview--cursor">
      <div ref={page} className="cursor-demo">
        <p className="demo__eyebrow">Поводите мышью</p>
        <h2>Курсор, который запоминается</h2>
        <p>Наведите на кнопки и ссылки, кликните — посмотрите, как курсор отвечает. Это обычная страница: текст, <a href="#cursor">ссылка</a>, карточки.</p>
        <div className="cursor-demo__actions">
          <button type="button" className="button button--primary">Главная кнопка</button>
          <button type="button" className="button">Вторая</button>
        </div>
        <div className="cursor-demo__cards">
          <div className="cursor-demo__card cursor-demo__card--light">Светлая карточка</div>
          <div className="cursor-demo__card cursor-demo__card--accent">Яркая карточка</div>
          <div className="cursor-demo__card">Тёмная карточка</div>
        </div>
      </div>
      {error && <p className="preview__error">{error}</p>}
    </div>
  )
}

/** Жидкая кнопка на тёмном фоне по центру превью. */
function LiquidButtonPreview({ values }: Props) {
  const button = useRef<HTMLButtonElement>(null)
  const instance = useRef<LiquidButtonInstance | null>(null)
  const latest = useRef(values)
  useLayoutEffect(() => {
    latest.current = values
  })
  useEffect(() => {
    if (!button.current) return
    instance.current = createLiquidButton(button.current, latest.current)
    return () => instance.current?.destroy()
  }, [])
  useEffect(() => instance.current?.set(values), [values])
  return (
    <div className="preview preview--ui">
      <button ref={button} type="button" className="liquid-demo">
        {String(values.label)}
      </button>
      <p className="preview__hint">Наведите, поводите и нажмите</p>
    </div>
  )
}

/** Прелоадер над демо-страницей; «Показать ещё раз» — заново. */
function PreloaderPreview({ values }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const instance = useRef<PreloaderInstance | null>(null)
  const latest = useRef(values)
  useLayoutEffect(() => {
    latest.current = values
  })
  const [manual, setManual] = useState(0)
  useEffect(() => {
    if (!host.current) return
    instance.current = createPreloader(host.current, latest.current)
    return () => instance.current?.destroy()
    // Новый текст, вид или режим — новый прелоадер с начала.
  }, [values.text, values.style, values.mode, values.reveal])
  useEffect(() => instance.current?.set(values), [values])
  return (
    <div className="preview preview--ui">
      <div ref={host} className="preloader-demo">
        <div className="preloader-demo__site">
          <p className="demo__eyebrow">Сайт загрузился</p>
          <h2>Здесь ваш контент</h2>
        </div>
      </div>
      <div className="demo__controls">
        {values.mode === 'manual' && (
          <button
            type="button"
            className="button"
            onClick={() => {
              const next = Math.min(1, manual + 0.25)
              setManual(next)
              instance.current?.progress(next)
            }}
          >
            +25 %
          </button>
        )}
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            setManual(0)
            instance.current?.replay()
          }}
        >
          Показать ещё раз
        </button>
      </div>
    </div>
  )
}
