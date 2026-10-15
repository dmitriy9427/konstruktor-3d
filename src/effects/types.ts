/**
 * Описание эффекта для Студии. Эффект — это ДАННЫЕ: шейдер + параметры +
 * пресеты. Ползунки, экспорт и превью строятся из этого описания сами,
 * поэтому новый эффект — это новый файл в src/effects/, без правки интерфейса.
 */
import type { Params, Values } from '../runtime/runtime'

export type EffectKind =
  /** Полноэкранный шейдер: фоны, шум, лава, космос. */
  | 'quad'
  /** Шейдер поверх картинки: искажение при наведении. */
  | 'image'
  /** Без WebGL: CSS-трансформации (наклон карточки). */
  | 'css'

export type Category = 'Фоны' | 'Изображения' | 'Без WebGL'

export type EffectDef = {
  id: string
  name: string
  category: Category
  kind: EffectKind
  /** Одна строка для карточки в галерее. */
  description: string
  /** Тело фрагментного шейдера (для quad и image). */
  fragment?: string
  params: Params
  /** Готовые наборы значений: «Закат», «Неон»… */
  presets?: { name: string; values: Values }[]
  /** Использует ли эффект мышь (иначе переключатель «за мышью» скрыт). */
  usesMouse?: boolean
}
