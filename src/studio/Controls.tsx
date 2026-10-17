/**
 * Панель ползунков. Строится из описания параметров эффекта: для числа —
 * ползунок, для цвета — палитра и поле #hex, для «да/нет» — переключатель,
 * для выбора — сегменты, для текста — поле. Новый параметр в эффекте →
 * новый контрол здесь сам. Подсказка (hint) всплывает при наведении (Hint.tsx).
 */
import { useId, useState } from 'react'

import type { Common } from '../engine/params'
import { parseList, type ListParam, type Param, type PostOptions, type Values } from '../runtime/runtime'
import { HintIcon, useHintId, WithHint } from './Hint'

type ParamProps = {
  name: string
  param: Param
  value: Values[string]
  onChange: (v: Values[string]) => void
  /** Для параметров «точки»: идёт ли рисование в превью и управление им. */
  drawing?: boolean
  newStroke?: boolean
  onDraw?: (on: boolean) => void
  onNewStroke?: () => void
  /** Параметр сейчас не действует — пояснение, когда заработает. */
  inactive?: string
}

export function ParamControl(props: ParamProps) {
  const row = (
    <WithHint hint={props.param.hint}>
      <ParamInput {...props} />
    </WithHint>
  )
  if (!props.inactive) return row
  return (
    <>
      <div className="control--inactive">{row}</div>
      <p className="inactive-note">{props.inactive}</p>
    </>
  )
}

/** Пояснение для неактивного параметра или null, если он действует. */
export function inactiveNote(param: Param, params: Record<string, Param>, values: Values): string | null {
  if (!param.when) return null
  for (const [key, allowed] of Object.entries(param.when)) {
    if (allowed.includes(values[key])) continue
    const other = params[key]
    const names = allowed.map((a) => (other?.type === 'select' ? (other.options.find((o) => o.value === a)?.label ?? a) : a === true ? 'вкл.' : a === false ? 'выкл.' : a))
    return `Действует, когда «${other?.label ?? key}»: ${names.map((n) => `«${n}»`).join(' или ')}`
  }
  return null
}

function ParamInput({ name, param, value, onChange, drawing, newStroke, onDraw, onNewStroke }: ParamProps) {
  const id = useId()
  const described = useHintId()
  switch (param.type) {
    case 'list':
      return <ListControl param={param} value={String(value)} onChange={onChange} picking={Boolean(drawing)} onPick={(on) => onDraw?.(on)} />
    case 'points': {
      const points = String(value).split(';').filter(Boolean)
      return (
        <div className="control" aria-describedby={described}>
          <span className="control__label">
            <span>
              {param.label}
              <HintIcon />
            </span>
            <output className="control__value">
              {points.length} / {param.max ?? 32}
            </output>
          </span>
          <div className="points">
            <button type="button" className={`button button--small${drawing ? ' button--primary' : ''}`} aria-pressed={drawing} onClick={() => onDraw?.(!drawing)}>
              {drawing ? 'Готово' : 'Рисовать'}
            </button>
            <button type="button" className="button button--small" disabled={!drawing || newStroke} onClick={onNewStroke}>
              Новая линия
            </button>
            <button type="button" className="button button--small" disabled={!points.length} onClick={() => onChange(points.slice(0, -1).join(';'))}>
              Отменить
            </button>
            <button type="button" className="button button--small" disabled={!points.length} onClick={() => onChange('')}>
              Очистить
            </button>
          </div>
          {drawing && <p className="points__help">Кликайте по превью — звёзды соединяются по порядку{newStroke ? '. Следующая начнёт новую линию' : ''}</p>}
        </div>
      )
    }
    case 'number':
      return <Range id={id} label={param.label} min={param.min} max={param.max} step={param.step ?? 0.01} value={Number(value)} onChange={onChange} />
    case 'color':
      return <ColorField id={id} label={param.label} value={String(value)} onChange={onChange} />
    case 'boolean':
      return <Toggle id={id} label={param.label} checked={Boolean(value)} onChange={onChange} />
    case 'text':
      return (
        <div className="control">
          <label className="control__label" htmlFor={id}>
            <span>
              {param.label}
              <HintIcon />
            </span>
          </label>
          <input
            id={id}
            className="text-field"
            value={String(value)}
            maxLength={param.maxLength ?? 40}
            spellCheck={false}
            aria-describedby={described}
            onChange={(e) => onChange(e.currentTarget.value)}
          />
        </div>
      )
    case 'select':
      return (
        <fieldset className="control control--segmented" data-param={name} aria-describedby={described}>
          <legend className="control__label">
            <span>
              {param.label}
              <HintIcon />
            </span>
          </legend>
          <div className="segmented">
            {param.options.map((option) => (
              <label key={option.value} className="segmented__item">
                <input type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )
  }
}

export function Range({ id, label, min, max, step, value, onChange }: { id: string; label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  const described = useHintId()
  const decimals = step >= 1 ? 0 : String(step).split('.')[1]?.length ?? 2
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className="control">
      <label className="control__label" htmlFor={id}>
        <span>
          {label}
          <HintIcon />
        </span>
        <output className="control__value">{value.toFixed(decimals)}</output>
      </label>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={described}
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  )
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const described = useHintId()
  // Текст поля — свой: пока вводят «#ff8», цвет не должен прыгать.
  const [draft, setDraft] = useState(value)
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setDraft(value)
  }
  return (
    <div className="control control--color">
      <label className="control__label" htmlFor={id}>
        <span>
          {label}
          <HintIcon />
        </span>
      </label>
      <div className="color">
        <input className="color__swatch" type="color" value={value} aria-label={`${label}: палитра`} onChange={(e) => onChange(e.currentTarget.value)} />
        <input
          id={id}
          className="color__hex"
          value={draft}
          spellCheck={false}
          maxLength={7}
          aria-describedby={described}
          onChange={(e) => {
            const next = e.currentTarget.value
            setDraft(next)
            if (/^#[\da-f]{6}$/i.test(next)) onChange(next.toLowerCase())
          }}
          onBlur={() => setDraft(value)}
        />
      </div>
    </div>
  )
}

export function Toggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const described = useHintId()
  return (
    <label className="control control--toggle" htmlFor={id}>
      <span className="control__label">
        <span>
          {label}
          <HintIcon />
        </span>
      </span>
      <input id={id} className="switch" type="checkbox" role="switch" checked={checked} aria-describedby={described} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  )
}

/**
 * Список объектов (свои галактики): вкладки по объектам, поля выбранного,
 * «Добавить» — следующий клик по превью ставит новый объект в это место.
 */
function ListControl({ param, value, onChange, picking, onPick }: { param: ListParam; value: string; onChange: (v: string) => void; picking: boolean; onPick: (on: boolean) => void }) {
  const items = parseList(value, param)
  const [selected, setSelected] = useState(0)
  const index = Math.min(selected, items.length - 1)
  // Добавили объект — сразу открываем его.
  const [count, setCount] = useState(items.length)
  if (items.length !== count) {
    setCount(items.length)
    if (items.length > count) setSelected(items.length - 1)
  }
  const update = (next: Values[]) => onChange(JSON.stringify(next))
  const max = param.max ?? 8
  return (
    <div className="control list">
      <span className="control__label">
        <span>
          {param.label}
          <HintIcon />
        </span>
        <output className="control__value">
          {items.length} / {max}
        </output>
      </span>
      <div className="points">
        <button
          type="button"
          className={`button button--small${picking ? ' button--primary' : ''}`}
          aria-pressed={picking}
          disabled={!picking && items.length >= max}
          onClick={() => onPick(!picking)}
        >
          {picking ? 'Отмена' : `+ ${param.itemLabel}`}
        </button>
      </div>
      {picking && <p className="points__help">Кликните по превью — туда встанет {param.itemLabel.toLowerCase()}</p>}
      {items.length > 0 && (
        <>
          <div className="tabs list__tabs" role="tablist" aria-label={param.label}>
            {items.map((_, i) => (
              <button key={i} type="button" role="tab" className="tabs__tab" aria-selected={i === index} onClick={() => setSelected(i)}>
                {param.itemLabel} {i + 1}
              </button>
            ))}
          </div>
          <div className="list__item">
            {Object.entries(param.fields).map(([field, fp]) => (
              <ParamControl
                key={`${index}-${field}`}
                name={field}
                param={fp}
                value={items[index][field]}
                onChange={(v) => update(items.map((it, i) => (i === index ? { ...it, [field]: v } : it)))}
              />
            ))}
            <button type="button" className="button button--small" onClick={() => update(items.filter((_, i) => i !== index))}>
              Удалить {param.itemLabel.toLowerCase()} {index + 1}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const POST: Record<keyof PostOptions, { label: string; hint: string }> = {
  bloom: { label: 'Свечение', hint: 'Яркие места «расплываются» светом вокруг себя' },
  grain: { label: 'Зерно', hint: 'Шум плёнки, меняется каждый кадр. Заодно прячет полосы на тёмных градиентах' },
  chroma: { label: 'Хроматическая аберрация', hint: 'Красный и синий каналы расходятся к краям кадра, как у дешёвого объектива' },
  vignette: { label: 'Виньетка', hint: 'Края кадра темнее — взгляд тянется к центру' },
}

const FPS_OPTIONS = [
  { value: 0, label: 'Без лимита' },
  { value: 60, label: '60' },
  { value: 30, label: '30' },
]

const PATHS: { value: Common['path']; label: string }[] = [
  { value: 'none', label: 'Нет' },
  { value: 'circle', label: 'Круг' },
  { value: 'eight', label: 'Восьмёрка' },
  { value: 'wave', label: 'Волна' },
  { value: 'custom', label: 'Своя' },
]

/** Траектория «точки влияния»: то, на что эффект реагирует мышью, летит по пути. */
function PathControls({ common, set, drawing, onDraw }: { common: Common; set: (patch: Partial<Common>) => void; drawing: boolean; onDraw: (on: boolean) => void }) {
  const id = useId()
  const count = common.pathPoints.split(';').filter(Boolean).length
  return (
    <>
      <h3 className="panel__subtitle">Траектория</h3>
      <WithHint hint="Точка, на которую эффект реагирует мышью (капля, водоворот, притяжение…), сама летит по пути. Своя — кликайте по превью">
        <fieldset className="control control--segmented">
          <legend className="control__label">
            <span>
              Путь
              <HintIcon />
            </span>
          </legend>
          <div className="segmented">
            {PATHS.map((o) => (
              <label key={o.value} className="segmented__item">
                <input type="radio" name={`${id}-path`} checked={common.path === o.value} onChange={() => set({ path: o.value })} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </WithHint>
      {common.path === 'custom' && (
        <div className="control">
          <span className="control__label">
            Точки пути
            <output className="control__value">{count} / 64</output>
          </span>
          <div className="points">
            <button type="button" className={`button button--small${drawing ? ' button--primary' : ''}`} aria-pressed={drawing} onClick={() => onDraw(!drawing)}>
              {drawing ? 'Готово' : 'Рисовать'}
            </button>
            <button type="button" className="button button--small" disabled={!count} onClick={() => set({ pathPoints: common.pathPoints.split(';').slice(0, -1).join(';') })}>
              Отменить
            </button>
            <button type="button" className="button button--small" disabled={!count} onClick={() => set({ pathPoints: '' })}>
              Очистить
            </button>
          </div>
          {drawing && <p className="points__help">Кликайте по превью — путь пройдёт через точки по порядку</p>}
        </div>
      )}
      {common.path === 'custom' && (
        <WithHint hint="Замкнутый путь идёт по кругу, открытый — туда и обратно">
          <Toggle id={`${id}-closed`} label="Замкнуть путь" checked={common.pathClosed} onChange={(pathClosed) => set({ pathClosed })} />
        </WithHint>
      )}
      {common.path !== 'none' && (
        <>
          <WithHint hint="Кругов за 10 секунд">
            <Range id={`${id}-pspeed`} label="Скорость по пути" min={0.1} max={5} step={0.05} value={common.pathSpeed} onChange={(pathSpeed) => set({ pathSpeed })} />
          </WithHint>
          <WithHint hint="Только без мыши — когда курсор над эффектом, он главный, а ушёл — точка снова летит по пути. Всегда — мышь не мешает">
            <Toggle id={`${id}-always`} label="Всегда по пути" checked={common.pathMode === 'always'} onChange={(on) => set({ pathMode: on ? 'always' : 'idle' })} />
          </WithHint>
        </>
      )}
    </>
  )
}

/** Общие настройки: мышь, траектория, качество, экономия, постобработка. */
export function CommonControls({
  common,
  onChange,
  usesMouse,
  shader,
  quality,
  drawingPath = false,
  onDrawPath,
}: {
  common: Common
  onChange: (c: Common) => void
  usesMouse: boolean
  shader: boolean
  quality: boolean
  drawingPath?: boolean
  onDrawPath?: (on: boolean) => void
}) {
  const id = useId()
  const set = (patch: Partial<Common>) => onChange({ ...common, ...patch })
  return (
    <>
      {usesMouse && (
        <>
          <WithHint hint="Выключите, если эффект лежит под формой или текстом и движение за курсором отвлекает">
            <Toggle id={`${id}-mouse`} label="Следовать за мышью" checked={common.mouse} onChange={(mouse) => set({ mouse })} />
          </WithHint>
          {common.mouse && quality && (
            <WithHint hint="0 — эффект реагирует мгновенно, 0.6 — очень плавно, с запаздыванием">
              <Range id={`${id}-inertia`} label="Инерция мыши" min={0} max={0.6} step={0.01} value={common.inertia} onChange={(inertia) => set({ inertia })} />
            </WithHint>
          )}
          {quality && <PathControls common={common} set={set} drawing={drawingPath} onDraw={(on) => onDrawPath?.(on)} />}
        </>
      )}
      {quality && (
        <>
          <WithHint hint="Потолок плотности пикселей. 1 — как CSS-пиксели, 2 — как ретина. Мягким фонам хватает 1–1.5, а нагрузка падает в разы">
            <Range id={`${id}-quality`} label="Качество (плотность пикселей)" min={0.5} max={2} step={0.05} value={common.quality} onChange={(quality) => set({ quality })} />
          </WithHint>
          <h3 className="panel__subtitle">Экономия</h3>
          <WithHint hint="Эффект не рисует ни одного кадра, пока его не видно на экране">
            <Toggle id={`${id}-offscreen`} label="Пауза за экраном" checked={common.offscreen} onChange={(offscreen) => set({ offscreen })} />
          </WithHint>
          <WithHint hint="Если пользователь не двигает мышь, не крутит страницу и не нажимает клавиши — анимация замирает. Любое движение будит её. 0 — не засыпать">
            <Range id={`${id}-sleep`} label="Засыпать без действий, с" min={0} max={60} step={1} value={common.sleep} onChange={(sleep) => set({ sleep })} />
          </WithHint>
          <WithHint hint="30 кадров вдвое легче для батареи ноутбука и телефона. Для медленных фонов разницы почти не видно">
            <fieldset className="control control--segmented">
              <legend className="control__label">
                <span>
                  Кадров в секунду, не больше
                  <HintIcon />
                </span>
              </legend>
              <div className="segmented">
                {FPS_OPTIONS.map((o) => (
                  <label key={o.value} className="segmented__item">
                    <input type="radio" name={`${id}-fps`} checked={common.fps === o.value} onChange={() => set({ fps: o.value })} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </WithHint>
        </>
      )}
      {shader && (
        <>
          <h3 className="panel__subtitle">Постобработка</h3>
          {(Object.keys(POST) as (keyof PostOptions)[]).map((key) => (
            <WithHint key={key} hint={POST[key].hint}>
              <Range
                id={`${id}-${key}`}
                label={POST[key].label}
                min={0}
                max={1}
                step={0.01}
                value={common.post[key]}
                onChange={(v) => set({ post: { ...common.post, [key]: v } })}
              />
            </WithHint>
          ))}
        </>
      )}
    </>
  )
}
