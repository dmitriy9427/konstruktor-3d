/**
 * Каталог эффектов. Новый эффект: файл в этой папке + строка здесь.
 * Ползунки, превью и экспорт построятся из его описания сами.
 */
import { aurora } from './aurora'
import { cells } from './cells'
import { gradient } from './gradient'
import { CURSORS } from './cursors'
import { UI_EFFECTS } from './ui'
import { clouds } from './clouds'
import { imageDistort } from './image-distort'
import { imageLiquid } from './image-liquid'
import { imageReveal } from './image-reveal'
import { lava } from './lava'
import { noise } from './noise'
import { plasma } from './plasma'
import { slides } from './slides'
import { space } from './space'
import { galaxy, glass, morph, swarm, textParticles } from './three'
import { tilt } from './tilt'
import { burn, curtain, dissolve, melt } from './transitions'
import { makeCustomEffect, TEMPLATES } from '../engine/custom'
import type { Category, EffectDef } from './types'
import { waves } from './waves'

/** «Свой эффект» в каталоге — с кодом шаблона; настоящий код Студия подставляет сама. */
export const CUSTOM = makeCustomEffect(TEMPLATES[1].code)

export const EFFECTS: EffectDef[] = [CUSTOM, gradient, noise, lava, cells, waves, clouds, space, aurora, plasma, imageDistort, imageLiquid, imageReveal, burn, dissolve, curtain, melt, slides, galaxy, swarm, morph, textParticles, glass, ...CURSORS, ...UI_EFFECTS, tilt]

export const CATEGORIES: Category[] = ['Свой эффект', 'Фоны', 'Изображения', 'Переходы', '3D', 'Курсоры', 'Интерфейс', 'Без WebGL']

export const effectById = (id: string) => EFFECTS.find((e) => e.id === id)

export type { EffectDef } from './types'
