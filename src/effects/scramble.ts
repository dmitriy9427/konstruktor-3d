import type { EffectDef } from './types'

/**
 * «Шифр» — раздел «Интерфейс», вид css (эффект на обычном элементе, без холста).
 *
 * Образец эффекта без шейдера: здесь только описание и ползунки, а код живёт в
 * src/runtime/scramble.js. Ключи params — это поля объекта values, который
 * получает createScramble(el, values). Чтобы такой эффект появился в Студии,
 * кроме этого файла нужны три строки: превью (studio/Preview.tsx → DomPreview),
 * экспорт (engine/codegen.ts → DOM_EFFECTS) и каталог (effects/index.ts).
 */
export const scramble: EffectDef = {
  // ── Паспорт ──
  id: 'scramble',
  name: 'Шифр',
  category: 'Интерфейс',
  kind: 'css',
  description: 'Заголовок проявляется из мелькающих символов, буква за буквой',

  // ── Ползунки ──
  params: {
    text: { type: 'text', label: 'Текст (для примера)', default: 'Доступ разрешён', maxLength: 32 },
    trigger: {
      type: 'select',
      label: 'Запуск',
      hint: 'При появлении — каждый раз, когда текст въезжает на экран. По наведению — когда курсор заходит на текст. По кругу — сам, с паузой',
      options: [
        { value: 'appear', label: 'При появлении' },
        { value: 'hover', label: 'По наведению' },
        { value: 'loop', label: 'По кругу' },
      ],
      default: 'loop',
    },
    glyphs: {
      type: 'select',
      label: 'Символы',
      hint: 'Из чего состоит «шифр». Буквы — случайные буквы того же алфавита',
      options: [
        { value: 'symbols', label: 'Знаки' },
        { value: 'letters', label: 'Буквы' },
        { value: 'digits', label: 'Цифры' },
        { value: 'binary', label: '0 и 1' },
        { value: 'katakana', label: 'Катакана' },
      ],
      default: 'symbols',
    },
    order: {
      type: 'select',
      label: 'Порядок',
      hint: 'В каком порядке буквы расшифровываются',
      options: [
        { value: 'left', label: 'Слева направо' },
        { value: 'center', label: 'Из центра' },
        { value: 'random', label: 'Вразнобой' },
      ],
      default: 'left',
    },
    duration: { type: 'number', label: 'Длительность, с', min: 0.3, max: 5, step: 0.05, default: 1.6, hint: 'За сколько секунд расшифруется весь текст' },
    rate: { type: 'number', label: 'Мелькание', min: 4, max: 60, step: 1, default: 28, hint: 'Сколько раз в секунду меняется символ' },
    // when: пауза нужна только в режиме «По кругу» — в остальных Студия покажет её бледной.
    pause: { type: 'number', label: 'Пауза, с', min: 0.2, max: 8, step: 0.1, default: 2, when: { trigger: ['loop'] }, hint: 'Сколько текст стоит расшифрованным до следующего круга' },
    empty: { type: 'boolean', label: 'Появляться из пустоты', default: false, hint: 'Буквы невидимы, пока до них не дошла очередь, — текст «печатается»' },
    glow: { type: 'number', label: 'Свечение', min: 0, max: 1, step: 0.01, default: 0.6, hint: 'Ореол вокруг символов шифра' },
    color: { type: 'color', label: 'Цвет шифра', default: '#22d3ee' },
  },

  // ── Пресеты ──
  presets: [
    { name: 'Терминал', values: {} },
    { name: 'Матрица', values: { glyphs: 'katakana', color: '#4ade80', order: 'random', duration: 2.2, glow: 0.9 } },
    { name: 'Печать', values: { glyphs: 'letters', empty: true, glow: 0, color: '#9a9ab0', rate: 40, duration: 1.2 } },
    { name: 'Сейф', values: { glyphs: 'digits', order: 'center', color: '#ffb347', rate: 50, duration: 2.4 } },
  ],
}
