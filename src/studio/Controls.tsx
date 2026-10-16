/**
 * Панель ползунков. Строится из описания параметров эффекта: для числа —
 * ползунок, для цвета — палитра и поле #hex, для «да/нет» — переключатель,
 * для выбора — сегменты, для текста — поле. Новый параметр в эффекте →
 * новый контрол здесь сам. Подсказка (hint) всплывает при наведении (Hint.tsx).
 */
import { useId, useState } from 'react'

import type { Common } from '../engine/params'
import type { Param, PostOptions, Values } from '../runtime/runtime'
import { HintIcon, useHintId, WithHint } from './Hint'

export function ParamControl(props: { name: string; param: Param; value: Values[string]; onChange: (v: Values[string]) => void }) {
  return (
    <WithHint hint={props.param.hint}>
      <ParamInput {...props} />
    </WithHint>
  )
}

function ParamInput({ name, param, value, onChange }: { name: string; param: Param; value: Values[string]; onChange: (v: Values[string]) => void }) {
  const id = useId()
  const described = useHintId()
  switch (param.type) {
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

/** Общие настройки: мышь, качество, экономия, постобработка. */
export function CommonControls({ common, onChange, usesMouse, shader, quality }: { common: Common; onChange: (c: Common) => void; usesMouse: boolean; shader: boolean; quality: boolean }) {
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
