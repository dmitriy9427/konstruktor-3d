/**
 * «Шифр» — текст проявляется из случайных символов, буква за буквой.
 *
 * Образец эффекта без WebGL и без холста: работает прямо с элементом страницы.
 * Как и runtime.js, файл самодостаточен (ни одного import): Студия вставляет
 * его текст в экспорт.
 *
 * Как работает:
 *   1. Текст элемента режем на буквы: каждая — свой <span> фиксированной ширины
 *      (ширину меряем заранее, в em), поэтому при смене символов строка не
 *      «дышит» и ничего не перескакивает на другую строку.
 *   2. У каждой буквы — момент, когда она «расшифруется». До него в ячейке
 *      мелькают случайные символы, после — стоит настоящая буква.
 *   3. Настоящий текст остаётся в aria-label: программа чтения с экрана читает
 *      его, а не мельтешение.
 */

const GLYPHS = {
  symbols: '!<>-_\\/[]{}=+*^?#%&',
  digits: '0123456789',
  binary: '01',
  katakana: 'アイウエオカキクケコサシスセソタチツテトナニヌネノ',
  // letters — особый набор: случайная буква того же алфавита, что и настоящая.
}
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const CYRILLIC = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ'

/**
 * @param {HTMLElement} el — элемент с текстом (заголовок, ссылка, кнопка)
 * @param {Record<string, unknown>} values
 *   glyphs — symbols | letters | digits | binary | katakana; order — left | random | center;
 *   duration — секунд на весь текст; rate — смен символа в секунду; empty — буквы
 *   появляются из пустоты; trigger — appear | hover | loop; pause — пауза в режиме loop, с;
 *   color — цвет «шифра»; glow — свечение 0…1
 */
export function createScramble(el, values = {}) {
  const v = { glyphs: 'symbols', order: 'left', duration: 1.4, rate: 30, empty: false, trigger: 'appear', pause: 2.5, color: '#a78bfa', glow: 0.6, ...values }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  // ── Разметка: слова (не рвутся при переносе) → буквы ──
  const original = el.textContent ?? ''
  const hadLabel = el.getAttribute('aria-label')
  if (hadLabel === null) el.setAttribute('aria-label', original)
  const fontSize = parseFloat(getComputedStyle(el).fontSize) || 16
  el.textContent = ''
  /** @type {{ span: HTMLSpanElement, char: string, at: number, shown: string }[]} */
  const cells = []
  for (const part of original.split(/(\s+)/)) {
    if (!part) continue
    if (/^\s+$/.test(part)) {
      el.append(document.createTextNode(part))
      continue
    }
    const word = document.createElement('span')
    word.setAttribute('aria-hidden', 'true')
    Object.assign(word.style, { display: 'inline-block', whiteSpace: 'nowrap' })
    for (const char of part) {
      const span = document.createElement('span')
      span.textContent = char
      Object.assign(span.style, { display: 'inline-block', textAlign: 'center' })
      word.append(span)
      cells.push({ span, char, at: 0, shown: char })
    }
    el.append(word)
  }
  // Ширину фиксируем после вставки всех букв (одним проходом — без лишних пересчётов вёрстки).
  const widths = cells.map((c) => c.span.getBoundingClientRect().width)
  cells.forEach((c, i) => widths[i] && (c.span.style.width = `${(widths[i] / fontSize).toFixed(4)}em`))

  // ── Расписание: когда какая буква расшифруется (доля 0…1 от длительности) ──
  const schedule = () => {
    const n = Math.max(1, cells.length - 1)
    cells.forEach((c, i) => {
      const k = v.order === 'random' ? Math.random() : v.order === 'center' ? Math.abs(i / n - 0.5) * 2 : i / n
      c.at = 0.25 + k * 0.75
    })
  }
  const glyphFor = (char) => {
    if (v.glyphs === 'letters') {
      const set = /[а-яё]/i.test(char) ? CYRILLIC : /[a-z]/i.test(char) ? LATIN : GLYPHS.symbols
      const g = set[Math.floor(Math.random() * set.length)]
      return char === char.toLowerCase() ? g.toLowerCase() : g
    }
    const set = GLYPHS[v.glyphs] ?? GLYPHS.symbols
    return set[Math.floor(Math.random() * set.length)]
  }
  const paint = (c, text, coded, hidden = false) => {
    if (c.shown !== text) c.span.textContent = c.shown = text
    c.span.style.color = coded ? v.color : ''
    c.span.style.textShadow = coded && v.glow > 0 ? `0 0 ${(v.glow * 0.6).toFixed(2)}em ${v.color}` : ''
    c.span.style.opacity = hidden ? '0' : ''
  }

  // ── Анимация ──
  let frame = 0
  let timer = 0
  let start = 0
  let lastSwap = 0
  let destroyed = false
  const finish = () => cells.forEach((c) => paint(c, c.char, false))
  const tick = (now) => {
    frame = 0
    const p = Math.min(1, (now - start) / (Math.max(0.1, v.duration) * 1000))
    // Символы меняются не каждый кадр, а rate раз в секунду.
    const swap = now - lastSwap >= 1000 / Math.max(1, v.rate)
    if (swap) lastSwap = now
    for (const c of cells) {
      if (p >= c.at) paint(c, c.char, false)
      // «Из пустоты»: буква невидима, пока до её очереди далеко.
      else if (v.empty && p < c.at - 0.25) paint(c, c.char, false, true)
      else if (swap || c.shown === c.char) paint(c, glyphFor(c.char), true)
    }
    if (p < 1) frame = requestAnimationFrame(tick)
    else if (v.trigger === 'loop' && !destroyed) timer = setTimeout(play, Math.max(0.2, v.pause) * 1000)
  }
  function play() {
    if (destroyed) return
    clearTimeout(timer)
    cancelAnimationFrame(frame)
    if (reduced) return finish()
    schedule()
    start = performance.now()
    lastSwap = 0
    frame = requestAnimationFrame(tick)
  }

  // ── Запуск: при появлении на экране, по наведению или по кругу ──
  const onEnter = () => v.trigger === 'hover' && play()
  el.addEventListener('pointerenter', onEnter)
  let io = null
  if (typeof IntersectionObserver === 'function') {
    // В режиме «по наведению» текст спокойно ждёт курсора — сам не запускается.
    io = new IntersectionObserver(([entry]) => entry.isIntersecting && v.trigger !== 'hover' && play(), { threshold: 0.4 })
    io.observe(el)
  } else if (v.trigger !== 'hover') play()

  return {
    /** Проиграть заново. */
    play,
    /** Поменять параметры на лету (цвет, скорость, порядок…). */
    set(next) {
      const restart = next.trigger !== undefined && next.trigger !== v.trigger
      Object.assign(v, next)
      if (restart) play()
    },
    /** Вернуть элементу обычный текст. */
    destroy() {
      destroyed = true
      clearTimeout(timer)
      cancelAnimationFrame(frame)
      io?.disconnect()
      el.removeEventListener('pointerenter', onEnter)
      el.textContent = original
      if (hadLabel === null) el.removeAttribute('aria-label')
    },
  }
}
