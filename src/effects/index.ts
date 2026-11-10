/**
 * Каталог эффектов. Новый эффект: файл в этой папке + строка здесь.
 * Ползунки, превью и экспорт построятся из его описания сами.
 */
import { aurora } from './aurora'
import { blackHole } from './black-hole'
import { cells } from './cells'
import { gradient } from './gradient'
import { fire, liquidMetal } from './liquid-fire'
import { CURSORS } from './cursors'
import { ripplesCursor } from './cursor-ripples'
import { glow } from './glow'
import { UI_EFFECTS } from './ui'
import { clouds } from './clouds'
import { imageDistort } from './image-distort'
import { imageGlass } from './image-glass'
import { imageLiquid } from './image-liquid'
import { imageReveal } from './image-reveal'
import { imageFlow, imageMask } from './image-fluid'
import { lava } from './lava'
import { noise } from './noise'
import { plasma } from './plasma'
import { scramble } from './scramble'
import { shatter } from './shatter'
import { slides } from './slides'
import { space } from './space'
import { blob, galaxy, glass, glassShapes, morph, swarm, textParticles } from './three'
import { tilt } from './tilt'
import { burn, curtain, dissolve, melt } from './transitions'
import { makeCustomEffect, TEMPLATES } from '../engine/custom'
import type { Category, EffectDef } from './types'
import { waves } from './waves'

/** «Свой эффект» в каталоге — с кодом шаблона; настоящий код Студия подставляет сама. */
export const CUSTOM = makeCustomEffect(TEMPLATES[1].code)

// Порядок здесь = порядок в каталоге Студии (внутри раздела). Раздел задаёт поле category.
export const EFFECTS: EffectDef[] = [
  CUSTOM,
  // Фоны
  gradient, noise, lava, cells, liquidMetal, fire, waves, clouds, space, aurora, plasma, blackHole,
  // Изображения
  imageDistort, imageLiquid, imageReveal, imageMask, imageFlow, imageGlass,
  // Переходы
  burn, dissolve, curtain, melt, slides, shatter,
  // 3D
  galaxy, swarm, morph, textParticles, glass, glassShapes, blob,
  // Курсоры
  ...CURSORS, ripplesCursor,
  // Интерфейс
  ...UI_EFFECTS, scramble,
  // Без WebGL
  tilt, glow,
]

export const CATEGORIES: Category[] = ['Свой эффект', 'Фоны', 'Изображения', 'Переходы', '3D', 'Курсоры', 'Интерфейс', 'Без WebGL']

export const effectById = (id: string) => EFFECTS.find((e) => e.id === id)

export type { EffectDef } from './types'
