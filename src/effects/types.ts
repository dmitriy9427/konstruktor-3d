/**
 * Описание эффекта для Студии. Эффект — это ДАННЫЕ: шейдер + параметры +
 * пресеты. Ползунки, экспорт и превью строятся из этого описания сами,
 * поэтому новый эффект — это новый файл в src/effects/, без правки интерфейса.
 */
import type { Params, Values } from '../runtime/runtime'

/** Контекст 3D-эффекта (см. src/runtime/scene.js). */
export type SceneSetup = (ctx: never) => unknown

export type EffectKind =
  /** Полноэкранный шейдер: фоны, шум, лава, космос. */
  | 'quad'
  /** Шейдер поверх картинки: искажение при наведении. */
  | 'image'
  /** Без WebGL: CSS-трансформации (наклон карточки). */
  | 'css'
  /** Слайдер: несколько картинок и шейдерный переход между ними. */
  | 'slides'
  /** 3D-сцена на three.js: частицы, стекло. */
  | 'three'
  /** Переход между секциями: SVG-фильтр поверх настоящей секции. */
  | 'transition'

export type Category = 'Свой эффект' | 'Фоны' | 'Изображения' | 'Переходы' | '3D' | 'Без WebGL'

export type EffectDef = {
  id: string
  name: string
  category: Category
  kind: EffectKind
  /** Одна строка для карточки в галерее. */
  description: string
  /** Тело фрагментного шейдера (для quad и image). */
  fragment?: string
  /** Симуляция: шейдер шага (состояние в текстуре, см. runtime.js), её результат — uSim. */
  simulation?: { fragment: string; size?: number }
  params: Params
  /** Готовые наборы значений: «Закат», «Неон»… */
  presets?: { name: string; values: Values }[]
  /** 3D: функция-эффект из src/runtime/three/, её имя (по нему экспорт берёт текст файла) и нужные дополнения three. */
  setup?: SceneSetup
  setupName?: string
  addons?: ('RoomEnvironment')[]
  /** Использует ли эффект мышь (иначе переключатель «за мышью» скрыт). */
  usesMouse?: boolean
}
