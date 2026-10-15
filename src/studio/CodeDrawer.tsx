/**
 * «Забрать код»: файлы экспорта, переключатель формата, ленивая загрузка,
 * копирование и скачивание. Размер файла показываем и «как есть», и после
 * сжатия gzip (столько реально уйдёт по сети) — сжатие считает сам браузер
 * (CompressionStream), без библиотек.
 */
import { useEffect, useMemo, useState } from 'react'

import type { EffectDef } from '../effects/types'
import { generate, type ExportFormat } from '../engine/codegen'
import type { Common } from '../engine/params'
import type { Values } from '../runtime/runtime'

const FORMATS: { value: ExportFormat; label: string; hint: string }[] = [
  { value: 'module', label: 'JS-модуль', hint: 'Обычный сайт, Vite, любая сборка' },
  { value: 'react', label: 'React', hint: 'Компонент + модуль эффекта' },
  { value: 'element', label: 'Веб-компонент', hint: 'Тег <k3d-…> — для CMS и HTML без сборки' },
]

async function gzipSize(text: string) {
  if (typeof CompressionStream === 'undefined') return null
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return (await new Response(stream).arrayBuffer()).byteLength
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} КБ`

export function CodeDrawer({ effect, values, common, link, onClose }: { effect: EffectDef; values: Values; common: Common; link: string; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>('module')
  const [lazy, setLazy] = useState(true)
  const files = useMemo(() => generate(effect, values, common, { format, lazy, link }), [effect, values, common, format, lazy, link])
  const [active, setActive] = useState(0)
  const file = files[Math.min(active, files.length - 1)]
  const [copied, setCopied] = useState(false)
  const [gzip, setGzip] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void gzipSize(file.code).then((size) => !cancelled && setGzip(size))
    return () => {
      cancelled = true
    }
  }, [file.code])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    await navigator.clipboard.writeText(file.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const url = URL.createObjectURL(new Blob([file.code], { type: 'text/plain' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="drawer" role="dialog" aria-modal="false" aria-labelledby="code-title">
      <header className="drawer__head">
        <h2 id="code-title">Забрать код</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть">
          ✕
        </button>
      </header>

      <div className="drawer__options">
        <div className="segmented" role="radiogroup" aria-label="Формат">
          {FORMATS.map((f) => (
            <label key={f.value} className="segmented__item" title={f.hint}>
              <input
                type="radio"
                name="format"
                value={f.value}
                checked={format === f.value}
                onChange={() => {
                  setFormat(f.value)
                  setActive(0)
                }}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={lazy} onChange={(e) => setLazy(e.currentTarget.checked)} />
          <span>
            Ленивая загрузка
            <small>код скачается, когда блок подъедет к экрану</small>
          </span>
        </label>
      </div>
      <p className="drawer__hint">{FORMATS.find((f) => f.value === format)?.hint}</p>

      <div className="tabs" role="tablist" aria-label="Файлы">
        {files.map((f, i) => (
          <button key={f.name} type="button" role="tab" aria-selected={f === file} className="tabs__tab" onClick={() => setActive(i)}>
            {f.name}
          </button>
        ))}
      </div>

      <pre className="code" tabIndex={0} aria-label={`Код файла ${file.name}`}>
        <code>{file.code}</code>
      </pre>

      <footer className="drawer__foot">
        <span className="drawer__size">
          {kb(new Blob([file.code]).size)}
          {gzip !== null && ` · ${kb(gzip)} gzip`}
        </span>
        <button type="button" className="button" onClick={download}>
          Скачать {file.name}
        </button>
        <button type="button" className="button button--primary" onClick={copy}>
          {copied ? 'Скопировано ✓' : 'Скопировать'}
        </button>
      </footer>
    </section>
  )
}
