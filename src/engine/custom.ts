/**
 * «Свой эффект»: шейдер пишется прямо в Студии, ползунки — из комментариев.
 *
 *   // @param speed number 0 2 0.5 Скорость
 *   // @param tint color #ff6b9d Оттенок
 *   // @param glow boolean true Свечение
 *   // @param mode select wave|rings|dots wave Узор
 *
 * Формат строки: имя, тип, дальше — по типу:
 *   number  — мин макс по-умолчанию [подпись…]
 *   color   — #rrggbb [подпись…]
 *   boolean — true|false [подпись…]
 *   select  — вариант|вариант|… по-умолчанию [подпись…]
 * В шейдере параметр — uniform с именем u + Имя: speed → uSpeed (объявлять не нужно).
 * Код живёт в адресе страницы (?code=…) — им можно поделиться ссылкой.
 */
import type { EffectDef } from '../effects/types'
import type { Param, Params } from '../runtime/runtime'

const NAME = /^[a-z][a-zA-Z0-9]*$/

/** Разобрать строки «// @param …» в описание параметров. Ошибки — по строкам. */
export function parseParams(code: string): { params: Params; errors: string[] } {
  const params: Params = {}
  const errors: string[] = []
  code.split('\n').forEach((line, i) => {
    const m = /^\s*\/\/\s*@param\s+(.+)$/.exec(line)
    if (!m) return
    const [name, type, ...rest] = m[1].trim().split(/\s+/)
    const where = `строка ${i + 1}`
    if (!name || !NAME.test(name)) return errors.push(`${where}: имя «${name ?? ''}» — латиница, с маленькой буквы (speed, colorA)`)
    if (params[name]) return errors.push(`${where}: параметр «${name}» уже есть`)
    let param: Param | null = null
    if (type === 'number') {
      const [min, max, def] = rest.slice(0, 3).map(Number)
      if (![min, max, def].every(Number.isFinite) || min >= max) return errors.push(`${where}: number — мин макс по-умолчанию, например 0 2 0.5`)
      const span = max - min
      param = { type: 'number', min, max, default: Math.min(max, Math.max(min, def)), step: span <= 2 ? 0.01 : span <= 20 ? 0.1 : 1, label: rest.slice(3).join(' ') || name }
    } else if (type === 'color') {
      if (!/^#[\da-f]{6}$/i.test(rest[0] ?? '')) return errors.push(`${where}: color — цвет #rrggbb, например #ff6b9d`)
      param = { type: 'color', default: rest[0].toLowerCase(), label: rest.slice(1).join(' ') || name }
    } else if (type === 'boolean') {
      if (rest[0] !== 'true' && rest[0] !== 'false') return errors.push(`${where}: boolean — true или false`)
      param = { type: 'boolean', default: rest[0] === 'true', label: rest.slice(1).join(' ') || name }
    } else if (type === 'select') {
      const options = (rest[0] ?? '').split('|').filter(Boolean)
      if (options.length < 2 || !options.includes(rest[1])) return errors.push(`${where}: select — варианты через | и вариант по умолчанию, например wave|rings wave`)
      param = { type: 'select', options: options.map((o) => ({ value: o, label: o })), default: rest[1], label: rest.slice(2).join(' ') || name }
    } else {
      return errors.push(`${where}: тип «${type ?? ''}» — number, color, boolean или select`)
    }
    params[name] = param
  })
  return { params, errors }
}

export function makeCustomEffect(code: string): EffectDef {
  return {
    id: 'custom',
    name: 'Свой эффект',
    category: 'Свой эффект',
    kind: 'quad',
    description: 'Пишите шейдер прямо здесь: ползунки — из строк // @param',
    usesMouse: /uMouse/.test(code),
    params: parseParams(code).params,
    fragment: code,
  }
}

// ─── Адрес: код в base64 (UTF-8), безопасный для ссылки ──────────────────────
export function encodeCode(code: string) {
  const bytes = new TextEncoder().encode(code)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCode(text: string) {
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

/** Шаблоны для старта. Все — рабочие, с параметрами и комментариями. */
export const TEMPLATES: { name: string; code: string }[] = [
  {
    name: 'Градиент',
    code: `// Самый простой эффект: градиент, который медленно «дышит».
// @param speed number 0 3 0.6 Скорость
// @param colorA color #7c4dff Цвет 1
// @param colorB color #22d3ee Цвет 2

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;          // координаты 0…1
  float t = 0.5 + 0.5 * sin(uTime * uSpeed + uv.x * 3.0);
  vec3 col = mix(uColorA, uColorB, mix(uv.y, t, 0.5));
  fragColor = vec4(col, 1.0);
}
`,
  },
  {
    name: 'Кольца',
    code: `// Кольца расходятся от курсора (или центра).
// @param speed number 0 5 1.5 Скорость
// @param rings number 2 40 14 Колец
// @param width number 0.05 0.95 0.5 Толщина
// @param ink color #0b0820 Фон
// @param paint color #ff6b9d Кольца

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec2 m = (uMouse - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uMouseActive;
  float d = length(p - m);
  float wave = fract(d * uRings - uTime * uSpeed * 0.3);
  float ring = smoothstep(uWidth, uWidth - 0.08, abs(wave - 0.5) * 2.0);
  fragColor = vec4(mix(uInk, uPaint, ring * exp(-d * 1.5)), 1.0);
}
`,
  },
  {
    name: 'Шум',
    code: `// Шум от шума: fbm, координаты которого искривлены другим fbm.
// @param speed number 0 2 0.4 Скорость
// @param scale number 0.5 8 2.5 Масштаб
// @param warp number 0 4 1.8 Закрутка
// @param dark color #05030f Тень
// @param light color #a78bfa Свет

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * uScale;
  float t = uTime * uSpeed * 0.2;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  float n = fbm(p + uWarp * q);
  fragColor = vec4(mix(uDark, uLight, smoothstep(0.2, 0.8, n)), 1.0);
}
`,
  },
  {
    name: 'Пустой',
    code: `// Пустой шаблон. Доступно: uTime, uResolution, uMouse (0…1), uMouseActive,
// uHover, uScroll, функции hash, hash2, noise, fbm, rot. Цвет — в fragColor.
// @param speed number 0 2 1 Скорость

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  fragColor = vec4(uv, 0.5 + 0.5 * sin(uTime * uSpeed), 1.0);
}
`,
  },
]

/** Код готового эффекта с его параметрами в виде строк // @param — «сделать копию и править». */
export function codeFromEffect(effect: EffectDef): string {
  const lines = Object.entries(effect.params).flatMap(([key, p]) => {
    if (p.type === 'number') return [`// @param ${key} number ${p.min} ${p.max} ${p.default} ${p.label}`]
    if (p.type === 'color') return [`// @param ${key} color ${p.default} ${p.label}`]
    if (p.type === 'boolean') return [`// @param ${key} boolean ${p.default} ${p.label}`]
    if (p.type === 'select') return [`// @param ${key} select ${p.options.map((o) => o.value).join('|')} ${p.default} ${p.label}`]
    return []
  })
  return `// Копия эффекта «${effect.name}» — правьте как хотите.\n${lines.join('\n')}\n${effect.fragment ?? ''}`
}
