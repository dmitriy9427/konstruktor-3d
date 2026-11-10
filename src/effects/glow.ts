import type { EffectDef } from './types'

/**
 * «Свет по рамке» — раздел «Без WebGL», вид css (эффект на обычном элементе).
 *
 * Образец: описание и ползунки — здесь, код — src/runtime/glow.js. Ключи params —
 * поля объекта values для createGlow(el, values). Эффект вешается на каждую
 * карточку отдельно, поэтому в экспорте mount('.card') принимает селектор.
 */
export const glow: EffectDef = {
  // ── Паспорт ──
  id: 'glow',
  name: 'Свет по рамке',
  category: 'Без WebGL',
  kind: 'css',
  description: 'Пятно света едет за курсором и зажигает рамки соседних карточек',

  // ── Ползунки ──
  params: {
    size: { type: 'number', label: 'Размер пятна, px', min: 120, max: 800, step: 10, default: 360, hint: 'Диаметр пятна света. Больше — свет дотягивается до дальних карточек' },
    border: { type: 'number', label: 'Толщина рамки, px', min: 0.5, max: 4, step: 0.1, default: 1.5, hint: 'Ширина светящейся полоски по краю карточки' },
    fill: { type: 'number', label: 'Заливка', min: 0, max: 0.5, step: 0.01, default: 0.14, hint: 'Насколько свет заходит внутрь карточки; 0 — светится только рамка' },
    inertia: { type: 'number', label: 'Инерция', min: 0, max: 0.9, step: 0.01, default: 0.25, hint: 'Плавность: больше — свет догоняет курсор медленнее' },
    color: { type: 'color', label: 'Центр пятна', default: '#a78bfa' },
    colorB: { type: 'color', label: 'Край пятна', default: '#22d3ee' },
  },

  // ── Пресеты ──
  presets: [
    { name: 'Аметист', values: {} },
    { name: 'Сияние', values: { color: '#a3e635', colorB: '#22d3ee', size: 520, fill: 0.2 } },
    { name: 'Золото', values: { color: '#ffe29a', colorB: '#ff8a1f', border: 2, fill: 0.1 } },
    { name: 'Тонкая белая', values: { color: '#ffffff', colorB: '#ffffff', border: 1, fill: 0, size: 260, inertia: 0 } },
  ],
}
