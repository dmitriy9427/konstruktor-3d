# 06. Экспорт: `src/engine/codegen.ts`

**Зачем:** понять, как Студия превращает эффект и ползунки в файл, который работает в чужом
проекте без Студии.

## Главный трюк: `?raw`

```ts
import runtimeSource from '../runtime/runtime.js?raw'
```

Суффикс `?raw` — возможность Vite: вместо **выполнения** файла получить его **текст** строкой.
Студия вставляет этот текст в начало `effect.js`. Значит, в ваш проект попадает **ровно тот
код**, который рисовал превью. Обновили рантайм — обновился и экспорт, синхронизировать нечего.

## Из чего состоит `effect.js`

```js
/** Шум — сгенерировано в 3D-конструкторе. Открыть с этими настройками: https://… */

// 1. Весь runtime.js (createEffect, buildFragment, …)
export function createEffect(canvas, spec, options) { … }

// 2. Эффект и ваши значения
const SPEC = {
  name: "Шум",
  fragment: "void main() { … }",
  params: { speed: { type: "number", default: 0.35 }, … },   // без подписей — шейдеру не нужны
  values: { speed: 0.8, colorA: "#0b0820", … },             // то, что вы накрутили
}
const OPTIONS = { mouse: true, inertia: 0.12, quality: 1.5, post: { grain: 0.2, … } }

// 3. Удобная обёртка
export function mount(target, options = {}) { … }
```

Ссылка в шапке файла открывает Студию **с этими же настройками** — через полгода можно
вернуться и подкрутить.

`runtimeParams()` выбрасывает из описания параметров подписи, подсказки, min/max — в экспорте
они не нужны. Для `select` остаются варианты: по ним значение превращается в номер.

## `mount()` — по шагам

```js
export function mount(target, options = {}) {
  let canvas = target
  if (!(target instanceof HTMLCanvasElement)) {
    canvas = document.createElement('canvas')         // 1. свой холст
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' })
    if (getComputedStyle(target).position === 'static') target.style.position = 'relative'
    target.append(canvas)
  }
  let effect
  try {
    effect = createEffect(canvas, SPEC, { ...OPTIONS, ...options, post: { ...OPTIONS.post, ...options.post } })
  } catch (error) {                                    // 2. нет WebGL2 — тихо уходим
    console.warn('[3D-конструктор]', error)
    canvas.remove()
    return { destroy() {}, set() {}, setOptions() {} }
  }
  canvas.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600 })   // 3. плавное появление
  const destroyEffect = effect.destroy                                   // 4. уборка вместе с холстом
  effect.destroy = () => { destroyEffect(); canvas.remove() }
  return effect
}
```

1. **Свой холст:** можно передать любой блок — холст растянется на него. Если у блока
   `position: static`, ставим `relative`, иначе `absolute` уедет к странице.
2. **Запасной вариант:** без WebGL2 вызывающий код получает объект-«пустышку» с теми же
   методами — ваш код не упадёт на `effect.destroy()`.
3. **Плавное появление:** первый кадр не «вспыхивает».
4. **Уборка:** `destroy()` заодно убирает наш холст. Возвращаем **сам** объект эффекта, а не
   копию `{ ...effect }`: при копировании геттер (например, `index` у слайдера — «какой слайд
   сейчас») превратился бы в число, которое больше никогда не меняется. На этом мы попались —
   тест «экспортированный слайдер листается» показал `index: 0` после `next()`.

Для эффектов картинки `mount()` находит `<img>` внутри блока и отдаёт её рантайму:
`const spec = { ...SPEC, image: target.querySelector('img') }`.

## Сниппет подключения (`index.html`)

`usageHtml()` собирает пример под ваш эффект:

- фон — блок `#hero-bg` с заглушкой цвета вашего **первого цвета** (не умолчания, а того, что
  вы выбрали);
- картинка — обёртка `.photo` с `<img>` внутри;
- наклон — `mount('.card')` по селектору: на все карточки сразу.

С ленивой загрузкой — `IntersectionObserver` + `import()` (глава 01).

## Веб-компонент

К модулю дописывается класс:

```js
class Effect extends HTMLElement {
  connectedCallback() {                    // тег появился на странице
    if (getComputedStyle(this).display === 'inline') this.style.display = 'block'
    const start = () => (this.instance = mount(this))
    if (!this.hasAttribute('lazy')) return start()
    this.observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      this.observer.disconnect()
      start()
    }, { rootMargin: '50% 0px' })
    this.observer.observe(this)
  }
  disconnectedCallback() {                 // тег убрали — убираем эффект
    this.observer?.disconnect()
    this.instance?.destroy()
  }
}
if (!customElements.get('k3d-noise')) customElements.define('k3d-noise', Effect)
```

- Свои теги по умолчанию `display: inline` — у строчного элемента нет высоты, поэтому ставим `block`.
- Проверка `customElements.get` — файл можно подключить дважды без ошибки «тег уже определён».
- `disconnectedCallback` — SPA и CMS могут убрать блок: видеокарта освобождается.

## React-компонент

```tsx
export function Effect({ className, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const instance = mount(el)
    return () => instance.destroy()        // уборка при размонтировании
  }, [])
  return <div ref={ref} className={className} style={{ position: 'relative', ...style }} />
}
```

Почему это безопасно в `StrictMode`: React в разработке вызывает эффект, уборку и эффект снова.
`mount()` каждый раз создаёт **новый** холст, а `destroy()` убирает старый — двух эффектов не будет.

С ленивой загрузкой `import('./effect.js')` асинхронный, поэтому есть флаг `cancelled`: если
компонент успел размонтироваться до загрузки, эффект не создаётся.

## Размер

В ящике «Забрать код» показан размер файла и **размер в gzip** — столько реально уйдёт по сети.
Считает сам браузер, без библиотек:

```ts
const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
const size = (await new Response(stream).arrayBuffer()).byteLength
```

Эффект — около 24 КБ текста и около 8 КБ в gzip; большая часть — комментарии рантайма. Если
ваш сборщик минифицирует JS, будет ещё меньше.
