/**
 * Редактор кода «Своего эффекта»: текстовое поле с номерами строк.
 * Tab вставляет два пробела (а не уводит фокус), Escape — выйти из поля.
 * Ошибки компиляции видеокарты приходят с номерами строк всего шейдера —
 * пересчитываем их в строки этого поля.
 */
import { useRef, useState } from 'react'

import { codeFromEffect, TEMPLATES } from '../engine/custom'
import { EFFECTS } from '../effects'

export function CodeEditor({
  code,
  onChange,
  onLoad,
  error,
  paramErrors,
}: {
  code: string
  onChange: (code: string) => void
  /** Загрузка шаблона: новый код целиком (значения ползунков — по умолчанию). */
  onLoad: (code: string) => void
  error: string
  paramErrors: string[]
}) {
  const area = useRef<HTMLTextAreaElement>(null)
  // Что загружено последним — показываем в списке (после правок — «изменён»).
  const [loaded, setLoaded] = useState<{ value: string; code: string } | null>(null)
  const current = loaded && loaded.code === code ? loaded.value : ''
  const gutter = useRef<HTMLPreElement>(null)
  const lines = code.split('\n').length
  const copyable = EFFECTS.filter((e) => e.kind === 'quad' && !e.simulation && e.id !== 'custom')

  return (
    <div className="editor">
      <div className="editor__bar">
        <label className="editor__start">
          <span>Начать с</span>
          <select
            value={current}
            onChange={(e) => {
              const v = e.currentTarget.value
              if (!v) return
              const template = TEMPLATES.find((t) => t.name === v)
              const source = EFFECTS.find((x) => x.id === v)
              const next = template?.code ?? (source ? codeFromEffect(source) : null)
              if (next && (code.trim() === '' || confirm('Заменить текущий код?'))) {
                onLoad(next)
                setLoaded({ value: v, code: next })
              }
            }}
          >
            <option value="">{loaded ? 'своего кода (изменён)' : 'шаблона…'}</option>
            <optgroup label="Шаблоны">
              {TEMPLATES.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Копия эффекта">
              {copyable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>
      <div className="editor__body">
        <pre ref={gutter} className="editor__gutter" aria-hidden="true">
          {Array.from({ length: lines }, (_, i) => i + 1).join('\n')}
        </pre>
        <textarea
          ref={area}
          className="editor__code"
          value={code}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Код шейдера"
          onScroll={(e) => gutter.current && (gutter.current.scrollTop = e.currentTarget.scrollTop)}
          onChange={(e) => onChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return e.currentTarget.blur()
            if (e.key !== 'Tab') return
            e.preventDefault()
            const el = e.currentTarget
            const { selectionStart: s, selectionEnd: end } = el
            onChange(code.slice(0, s) + '  ' + code.slice(end))
            requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
          }}
        />
      </div>
      {(paramErrors.length > 0 || error) && (
        <div className="editor__errors" role="alert">
          {paramErrors.map((e) => (
            <p key={e}>{e}</p>
          ))}
          {error && <p>{error}</p>}
        </div>
      )}
    </div>
  )
}
