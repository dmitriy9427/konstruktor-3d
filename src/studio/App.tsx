/**
 * Студия: слева — каталог эффектов, в центре — живое превью, справа —
 * параметры. Всё состояние (эффект, значения, общие настройки) живёт в
 * адресе страницы: ссылкой можно поделиться, перезагрузка ничего не теряет.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CATEGORIES, EFFECTS, effectById } from '../effects'
import { decodeCode, encodeCode, makeCustomEffect, parseParams, TEMPLATES } from '../engine/custom'
import { buildFragment, parseList } from '../runtime/runtime'
import { DEFAULT_COMMON, fromSearch, pathPoints, randomValues, resolveValues, toSearch, type Common } from '../engine/params'
import { mountPerf } from '../engine/perf'
import type { Values } from '../runtime/runtime'
import { CodeDrawer } from './CodeDrawer'
import { CodeEditor } from './CodeEditor'
import { CommonControls, inactiveNote, ParamControl, Toggle } from './Controls'
import { Preview } from './Preview'

const DEMO_IMAGE = `${import.meta.env.BASE_URL}demo/photo.svg`
const DRAFT_KEY = 'k3d:custom-code'

/** Код «Своего эффекта»: из ссылки, иначе черновик из браузера, иначе шаблон. */
function initialCode() {
  const fromUrl = new URLSearchParams(location.search).get('code')
  const decoded = fromUrl ? decodeCode(fromUrl) : null
  if (decoded) return decoded
  try {
    return localStorage.getItem(DRAFT_KEY) || TEMPLATES[1].code
  } catch {
    return TEMPLATES[1].code
  }
}

function initialState() {
  const code = initialCode()
  const paramsOf = (id: string) => (id === 'custom' ? parseParams(code).params : effectById(id)?.params)
  // По умолчанию открываем первый эффект каталога после «Своего».
  return { ...fromSearch(location.search, paramsOf, EFFECTS[1].id), code }
}

/** Ошибку видеокарты «ERROR: 0:57: …» переводим в строку поля редактора. */
function mapErrorLines(message: string, params: ReturnType<typeof parseParams>['params']) {
  const prefix = buildFragment({ fragment: '', params }).split('\n').length - 1
  return message.replace(/ERROR: \d+:(\d+):/g, (_, line) => `Строка ${Math.max(1, Number(line) - prefix)}:`).replace(/^Ошибка шейдера: /, '')
}

export function App() {
  const [initial] = useState(initialState)
  const [code, setCode] = useState(initial.code)
  // Превью пересобирается не на каждую букву, а через 400 мс после паузы в наборе.
  const [compiled, setCompiled] = useState(initial.code)
  useEffect(() => {
    const timer = setTimeout(() => setCompiled(code), 400)
    try {
      localStorage.setItem(DRAFT_KEY, code)
    } catch {
      // без черновика — не страшно
    }
    return () => clearTimeout(timer)
  }, [code])
  const custom = useMemo(() => makeCustomEffect(compiled), [compiled])
  const paramErrors = useMemo(() => parseParams(compiled).errors, [compiled])
  const [compileError, setCompileError] = useState('')
  const [effectId, setEffectId] = useState(initial.effectId)
  const [storedValues, setValues] = useState<Values>(initial.values)
  const [common, setCommon] = useState<Common>(initial.common)
  const [image, setImage] = useState(DEMO_IMAGE)
  // Рисование точек в превью (параметр типа «points»): какой параметр рисуем и начать ли новую линию.
  const [drawing, setDrawing] = useState<string | null>(null)
  const [newStroke, setNewStroke] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [perf, setPerf] = useState(import.meta.env.DEV)
  const effect = effectId === 'custom' ? custom : effectById(effectId)!
  const isCustom = effectId === 'custom'

  // Для «Своего эффекта» параметры меняются вместе с кодом: значения тех, что
  // остались, берём из сохранённых, новые — по умолчанию.
  const values = useMemo(() => (isCustom ? resolveValues(custom.params, storedValues) : storedValues), [isCustom, custom, storedValues])

  const search = useMemo(
    () => toSearch(effectId, effect.params, values, common) + (isCustom ? `&code=${encodeCode(compiled)}` : ''),
    [effectId, effect, values, common, isCustom, compiled],
  )
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
    setDrawing(null)
    const next = id === 'custom' ? custom : effectById(id)!
    setEffectId(id)
    setValues(resolveValues(next.params))
  }

  // Текущий пресет — тот, с которым совпадают все значения эффекта.
  const activePreset = effect.presets?.find((preset) => {
    const target = resolveValues(effect.params, preset.values)
    return Object.keys(target).every((key) => target[key] === values[key])
  })?.name

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
    <div className={`studio${isCustom ? ' studio--custom' : ''}`}>
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
        <Preview
          effect={effect}
          values={values}
          common={common}
          image={image}
          drawing={drawing !== null}
          path={drawing === '_path' ? pathPoints(common) : undefined}
          onError={isCustom ? setCompileError : undefined}
          onPick={(x, y) => {
            if (!drawing) return
            if (drawing === '_path') {
              setCommon((c) => ({ ...c, path: 'custom', pathPoints: [c.pathPoints, `${x.toFixed(3)},${y.toFixed(3)}`].filter(Boolean).join(';') }))
              return
            }
            const target = effect.params[drawing]
            if (target?.type === 'list') {
              // Новый объект списка — в месте клика, остальные поля по умолчанию.
              setValues((prev) => {
                const items = parseList(prev[drawing], target)
                return { ...prev, [drawing]: JSON.stringify([...items, { ...resolveValues(target.fields), x: +x.toFixed(3), y: +y.toFixed(3) }]) }
              })
              setDrawing(null)
              return
            }
            setValues((prev) => {
              const current = String(prev[drawing] ?? '')
              const point = `${x.toFixed(3)},${y.toFixed(3)},${newStroke || !current ? 0 : 1}`
              return { ...prev, [drawing]: current ? `${current};${point}` : point }
            })
            setNewStroke(false)
          }}
        />
        <div className="stage__caption">
          <h1>{effect.name}</h1>
          <p>{effect.description}</p>
        </div>
      </main>

      <aside className="panel" aria-label="Параметры">
        {effect.presets && (
          <div className="presets">
            {effect.presets.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="chip"
                aria-pressed={preset.name === activePreset}
                onClick={() => setValues(resolveValues(effect.params, preset.values))}
              >
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

        {isCustom && (
          <>
            <h3 className="panel__subtitle">Код шейдера</h3>
            <CodeEditor
              code={code}
              onChange={setCode}
              onLoad={(next) => {
                setCode(next)
                setCompiled(next)
                setValues(resolveValues(parseParams(next).params))
              }}
              error={compileError ? mapErrorLines(compileError, custom.params) : ''} paramErrors={paramErrors} />
          </>
        )}
        <h3 className="panel__subtitle">Эффект</h3>
        {Object.entries(effect.params).map(([key, param]) => (
          <ParamControl
            key={`${effectId}-${key}`}
            name={key}
            param={param}
            value={values[key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [key]: v }))}
            drawing={drawing === key}
            newStroke={newStroke}
            onDraw={(on) => {
              setDrawing(on ? key : null)
              setNewStroke(false)
              if (on && param.type === 'points')
                setValues((prev) => ({
                  ...prev,
                  ...param.enable,
                  // Пример по умолчанию не дорисовываем — начинаем с чистого листа.
                  [key]: prev[key] === param.default ? '' : prev[key],
                }))
            }}
            onNewStroke={() => setNewStroke(true)}
            inactive={inactiveNote(param, effect.params, values) ?? undefined}
          />
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
        <CommonControls
          common={common}
          onChange={setCommon}
          usesMouse={effect.usesMouse ?? false}
          shader={shader && !effect.overlay}
          quality={shader || is3d}
          drawingPath={drawing === '_path'}
          onDrawPath={(on) => setDrawing(on ? '_path' : null)}
        />
      </aside>

      {codeOpen && <CodeDrawer effect={effect} values={values} common={common} link={link} onClose={closeCode} />}
    </div>
  )
}
