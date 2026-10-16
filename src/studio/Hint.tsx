/**
 * Подсказка к параметру. Строка параметра оборачивается в <WithHint>:
 *   - наведение на строку или фокус внутри неё (Tab) — подсказка всплывает;
 *   - на тач-экране — по нажатию на значок «?»;
 *   - Escape — прячет.
 * Позицию считает Floating UI: по умолчанию слева от панели (она справа),
 * если места нет — переворачивает (flip) и сдвигает внутрь экрана (shift).
 * Текст подсказки привязан к полю ввода через aria-describedby — экранная
 * читалка прочитает его вместе с названием.
 */
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react-dom'
import { createContext, useContext, useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** id текста подсказки (для aria-describedby у поля ввода) и переключатель — для значка «?». */
const HintContext = createContext<{ id: string; open: boolean; toggle: () => void } | null>(null)
export const useHintId = () => useContext(HintContext)?.id

/** Значок «?» — ставится внутрь подписи параметра. Без подсказки ничего не рисует. */
export function HintIcon() {
  const hint = useContext(HintContext)
  if (!hint) return null
  return (
    <button
      type="button"
      className="hint-icon"
      aria-label="Подсказка"
      aria-expanded={hint.open}
      onClick={(e) => {
        // Значок внутри <label>: без этого клик ещё и переключил бы поле.
        e.preventDefault()
        hint.toggle()
      }}
    >
      ?
    </button>
  )
}

export function WithHint({ hint, children }: { hint?: string; children: ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const {
    refs: { setReference, setFloating },
    floatingStyles,
    placement,
  } = useFloating({
    open,
    placement: 'left',
    // fixed — подсказка не участвует в раскладке страницы. С absolute невидимые
    // подсказки (их по одной на параметр) растягивали документ, и страница прокручивалась.
    strategy: 'fixed',
    middleware: [offset(14), flip({ fallbackPlacements: ['top', 'bottom'] }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!hint) return <>{children}</>
  return (
    <HintContext.Provider value={{ id, open, toggle: () => setOpen((v) => !v) }}>
      <div
        ref={setReference}
        className="hinted"
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setOpen(false)}
      >
        {children}
      </div>
      {/* Текст всегда в DOM (для aria-describedby), видимым становится только при open. */}
      {createPortal(
        <div ref={setFloating} id={id} role="tooltip" className="tooltip" data-open={open} data-side={placement.split('-')[0]} style={floatingStyles}>
          {hint}
        </div>,
        document.body,
      )}
    </HintContext.Provider>
  )
}
