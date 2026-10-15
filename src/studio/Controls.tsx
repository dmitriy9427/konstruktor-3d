/**
 * Панель ползунков. Строится из описания параметров эффекта: для числа —
 * ползунок, для цвета — палитра и поле #hex, для «да/нет» — переключатель,
 * для выбора — сегменты. Новый параметр в эффекте → новый контрол здесь сам.
 */
import { useId, useState } from 'react'

import type { Param, PostOptions, Values } from '../runtime/runtime'
import type { Common } from '../engine/params'

export function ParamControl(props: { name: string; param: Param; value: Values[string]; onChange: (v: Values[string]) => void }) {
  return (
    <>
      <ParamInput {...props} />
      {props.param.hint && <p className="control__hint">{props.param.hint}</p>}
    </>
  )
}

function ParamInput({ name, param, value, onChange }: { name: string; param: Param; value: Values[string]; onChange: (v: Values[string]) => void }) {
  const id = useId()
  switch (param.type) {
    case 'number':
      return <Range id={id} label={param.label} min={param.min} max={param.max} step={param.step ?? 0.01} value={Number(value)} onChange={onChange} />
    case 'color':
      return <ColorField id={id} label={param.label} value={String(value)} onChange={onChange} />
    case 'boolean':
      return <Toggle id={id} label={param.label} checked={Boolean(value)} onChange={onChange} />
    case 'select':
      return (
        <fieldset className="control control--segmented" data-param={name}>
          <legend className="control__label">{param.label}</legend>
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
  const decimals = step >= 1 ? 0 : String(step).split('.')[1]?.length ?? 2
  const fill = ((value - min) / (max - min)) * 100
  return (
    <div className="control">
      <label className="control__label" htmlFor={id}>
        {label}
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
        style={{ '--fill': `${fill}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
      />
    </div>
  )
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
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
        {label}
      </label>
      <div className="color">
        <input className="color__swatch" type="color" value={value} aria-label={`${label}: палитра`} onChange={(e) => onChange(e.currentTarget.value)} />
        <input
          id={id}
          className="color__hex"
          value={draft}
          spellCheck={false}
          maxLength={7}
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

export function Toggle({ id, label, checked, onChange, hint }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="control control--toggle" htmlFor={id}>
      <span className="control__label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input id={id} className="switch" type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  )
}

const POST_LABELS: Record<keyof PostOptions, string> = {
  bloom: 'Свечение',
  grain: 'Зерно',
  chroma: 'Хроматическая аберрация',
  vignette: 'Виньетка',
}

/** Общие настройки: мышь, качество, постобработка. */
export function CommonControls({ common, onChange, usesMouse, shader }: { common: Common; onChange: (c: Common) => void; usesMouse: boolean; shader: boolean }) {
  const id = useId()
  return (
    <>
      {usesMouse && (
        <>
          <Toggle id={`${id}-mouse`} label="Следовать за мышью" checked={common.mouse} onChange={(mouse) => onChange({ ...common, mouse })} />
          {common.mouse && shader && (
            <Range id={`${id}-inertia`} label="Инерция мыши" min={0} max={0.6} step={0.01} value={common.inertia} onChange={(inertia) => onChange({ ...common, inertia })} />
          )}
        </>
      )}
      {shader && (
        <>
          <Range id={`${id}-quality`} label="Качество (плотность пикселей)" min={0.5} max={2} step={0.05} value={common.quality} onChange={(quality) => onChange({ ...common, quality })} />
          <h3 className="panel__subtitle">Постобработка</h3>
          {(Object.keys(POST_LABELS) as (keyof PostOptions)[]).map((key) => (
            <Range
              key={key}
              id={`${id}-${key}`}
              label={POST_LABELS[key]}
              min={0}
              max={1}
              step={0.01}
              value={common.post[key]}
              onChange={(v) => onChange({ ...common, post: { ...common.post, [key]: v } })}
            />
          ))}
        </>
      )}
    </>
  )
}
