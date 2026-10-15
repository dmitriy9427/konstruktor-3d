/**
 * Студия: слева — каталог эффектов, в центре — живое превью, справа —
 * параметры. Всё состояние (эффект, значения, общие настройки) живёт в
 * адресе страницы: ссылкой можно поделиться, перезагрузка ничего не теряет.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CATEGORIES, EFFECTS, effectById } from '../effects'
import { DEFAULT_COMMON, fromSearch, randomValues, resolveValues, toSearch, type Common } from '../engine/params'
import { mountPerf } from '../engine/perf'
import type { Values } from '../runtime/runtime'
import { CodeDrawer } from './CodeDrawer'
import { CommonControls, ParamControl, Toggle } from './Controls'
import { Preview } from './Preview'

const DEMO_IMAGE = `${import.meta.env.BASE_URL}demo/photo.svg`
const paramsOf = (id: string) => effectById(id)?.params

function initialState() {
  return fromSearch(location.search, paramsOf, EFFECTS[0].id)
}

export function App() {
  const [initial] = useState(initialState)
  const [effectId, setEffectId] = useState(initial.effectId)
  const [values, setValues] = useState<Values>(initial.values)
  const [common, setCommon] = useState<Common>(initial.common)
  const [image, setImage] = useState(DEMO_IMAGE)
  const [codeOpen, setCodeOpen] = useState(false)
  const [perf, setPerf] = useState(import.meta.env.DEV)
  const effect = effectById(effectId)!

  const search = useMemo(() => toSearch(effectId, effect.params, values, common), [effectId, effect, values, common])
  const link = `${location.origin}${location.pathname}${search}`

  // Адрес обновляем без новой записи в истории: «Назад» уводит со Студии, а не по ползункам.
  useEffect(() => {
    history.replaceState(null, '', search)
  }, [search])

  const stage = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!perf || !stage.current) return
    const panel = mountPerf(stage.current)
    return () => panel.destroy()
  }, [perf])

  // Своя картинка: objectURL живёт, пока его не отпустят.
  useEffect(() => () => void (image.startsWith('blob:') && URL.revokeObjectURL(image)), [image])

  const choose = (id: string) => {
    const next = effectById(id)!
    setEffectId(id)
    setValues(resolveValues(next.params))
  }

  const closeCode = useCallback(() => setCodeOpen(false), [])
  const [copiedLink, setCopiedLink] = useState(false)
  const shareLink = async () => {
    await navigator.clipboard.writeText(link)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 1500)
  }

  const shader = effect.kind === 'quad' || effect.kind === 'image' || effect.kind === 'slides'
  const is3d = effect.kind === 'three'
  const hasCommon = shader || is3d || Boolean(effect.usesMouse)

  return (
    <div className="studio">
      <header className="topbar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand__mark" aria-hidden="true" />
          3D-конструктор
        </a>
        <span className="topbar__crumb">Студия</span>
        <div className="topbar__actions">
          <Toggle id="perf" label="FPS" checked={perf} onChange={setPerf} />
          <button type="button" className="button" onClick={shareLink}>
            {copiedLink ? 'Ссылка скопирована ✓' : 'Поделиться'}
          </button>
          <button type="button" className="button button--primary" onClick={() => setCodeOpen(true)}>
            Забрать код
          </button>
        </div>
      </header>

      <nav className="catalog" aria-label="Эффекты">
        {CATEGORIES.map((category) => (
          <section key={category} className="catalog__group">
            <h2 className="catalog__title">{category}</h2>
            <ul>
              {EFFECTS.filter((e) => e.category === category).map((e) => (
                <li key={e.id}>
                  <button type="button" className="catalog__item" aria-current={e.id === effectId} onClick={() => choose(e.id)}>
                    <span className="catalog__name">{e.name}</span>
                    <span className="catalog__desc">{e.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>

      <main ref={stage} className="stage">
        <Preview effect={effect} values={values} common={common} image={image} />
        <div className="stage__caption">
          <h1>{effect.name}</h1>
          <p>{effect.description}</p>
        </div>
      </main>

      <aside className="panel" aria-label="Параметры">
        {effect.presets && (
          <div className="presets">
            {effect.presets.map((preset) => (
              <button key={preset.name} type="button" className="chip" onClick={() => setValues(resolveValues(effect.params, preset.values))}>
                {preset.name}
              </button>
            ))}
          </div>
        )}
        <div className="panel__row">
          <button type="button" className="button button--small" onClick={() => setValues(randomValues(effect.params, values))}>
            🎲 Случайно
          </button>
          <button
            type="button"
            className="button button--small"
            onClick={() => {
              setValues(resolveValues(effect.params))
              setCommon(DEFAULT_COMMON)
            }}
          >
            Сбросить
          </button>
        </div>

        <h3 className="panel__subtitle">Эффект</h3>
        {Object.entries(effect.params).map(([key, param]) => (
          <ParamControl key={`${effectId}-${key}`} name={key} param={param} value={values[key]} onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))} />
        ))}

        {(effect.kind === 'image' || effect.kind === 'css' || effect.kind === 'slides') && (
          <label className="upload">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0]
                if (file) setImage(URL.createObjectURL(file))
              }}
            />
            <span>Своя картинка…</span>
          </label>
        )}

        {hasCommon && <h3 className="panel__subtitle">Общие</h3>}
        <CommonControls common={common} onChange={setCommon} usesMouse={effect.usesMouse ?? false} shader={shader} quality={shader || is3d} />
      </aside>

      {codeOpen && <CodeDrawer effect={effect} values={values} common={common} link={link} onClose={closeCode} />}
    </div>
  )
}
