# 07. Студия: React-часть

**Зачем:** понять, как интерфейс строится из описания эффектов и почему он так мало знает о
самих эффектах. Код — `src/studio/` и `src/engine/params.ts`.

## Компоненты

| Файл | Отвечает за |
| --- | --- |
| `main.tsx` | Шрифты, стили, `createRoot` |
| `App.tsx` | Состояние: какой эффект, значения, общие настройки, картинка; каталог и панель |
| `Controls.tsx` | Контролы: ползунок, цвет, переключатель, сегменты; общие настройки |
| `Preview.tsx` | Живое превью: шейдер или наклон |
| `CodeDrawer.tsx` | «Забрать код» |

## Состояние живёт в адресе

```tsx
const [initial] = useState(() => fromSearch(location.search, paramsOf, EFFECTS[0].id))
…
const search = useMemo(() => toSearch(effectId, effect.params, values, common), […])
useEffect(() => { history.replaceState(null, '', search) }, [search])
```

- При открытии читаем адрес (`fromSearch`): эффект, значения, общие настройки. Каждое значение
  проходит `sanitize`: число зажимается в диапазон, цвет приводится к `#rrggbb`, неизвестный
  вариант `select` заменяется умолчанием. Кривая ссылка не сломает Студию.
- При изменении пишем адрес (`toSearch`) — только отличия от умолчаний.
- `replaceState`, а не `pushState`: иначе каждое движение ползунка стало бы записью в истории, и
  «Назад» пришлось бы нажимать сто раз.

Пример: `?e=lava&speed=1.2&colorA=123456&_mouse=0&_grain=0.3`. Решётку у цвета убираем — в
адресе она означает «якорь».

## Контролы строятся из схемы

```tsx
{Object.entries(effect.params).map(([key, param]) => (
  <ParamControl key={`${effectId}-${key}`} param={param} value={values[key]} onChange={…} />
))}
```

`ParamControl` смотрит на `param.type`:

| Тип | Контрол |
| --- | --- |
| `number` | `<input type="range">` + текущее значение (знаков после запятой — по шагу) |
| `color` | Палитра `<input type="color">` + поле `#hex` |
| `boolean` | Переключатель (`role="switch"`) |
| `select` | Сегменты — радиокнопки, оформленные как кнопки |

**Заливка ползунка** — CSS-переменная `--fill` в процентах и градиент дорожки:
`linear-gradient(90deg, акцент var(--fill), серый var(--fill))`. Без JS-библиотек.

**Поле цвета** хранит свой «черновик»: пока вы печатаете `#ff8`, цвет не прыгает. Значение
уходит наверх, только когда введено полностью (`#ff8800`). Ушли из поля — черновик
возвращается к настоящему значению.

Ключ `${effectId}-${key}` нужен, чтобы при смене эффекта React создал контролы заново, а не
переиспользовал ползунок «Скорость» одного эффекта для «Скорости» другого с чужим диапазоном.

## Превью

```tsx
export function Preview(props) {
  if (props.effect.kind === 'css') return <TiltPreview {...props} />
  return <ShaderPreview key={props.effect.id} {...props} />
}
```

`ShaderPreview` создаёт эффект в `useEffect`, зависящем **только от эффекта**:

```tsx
useEffect(() => {
  const canvas = document.createElement('canvas')    // новый холст на каждый запуск
  host.current.append(canvas)
  instance.current = createEffect(canvas, { …, values: latest.current.values }, …)
  return () => { instance.current?.destroy(); canvas.remove() }
}, [effect])

useEffect(() => instance.current?.set(values), [values])         // ползунки — без пересоздания
useEffect(() => instance.current?.setOptions(…), [common])
```

Почему так:

- **Ползунки не пересоздают WebGL.** Движение ползунка — это `set()`, один новый кадр. Если бы
  эффект зависел от `values`, каждое движение компилировало бы шейдер заново.
- **`latest` в ref.** При создании нужны текущие значения, но эффект не должен от них
  зависеть. Ref обновляется в `useLayoutEffect` — до того, как отработают обычные эффекты.
- **Холст создаётся внутри эффекта.** `destroy()` отпускает WebGL-контекст навсегда, а
  `StrictMode` в разработке вызывает эффект дважды. Если бы `<canvas>` был в JSX, второй запуск
  получил бы «мёртвый» холст. (На этом мы споткнулись при разработке — превью показывало
  «Ошибка шейдера: null».)

Ошибку компиляции шейдера превью показывает красным блоком.

## «Забрать код»

```tsx
const files = useMemo(() => generate(effect, values, common, { format, lazy, link }), […])
```

Файлы пересобираются при любом изменении — ящик можно держать открытым и двигать ползунки
(на широком экране). Вкладки — по файлам, копирование — `navigator.clipboard.writeText`,
скачивание — `Blob` + временная ссылка `<a download>`. `Escape` закрывает ящик.

## Своя картинка

```tsx
setImage(URL.createObjectURL(file))
useEffect(() => () => void (image.startsWith('blob:') && URL.revokeObjectURL(image)), [image])
```

Файл не загружается на сервер: `createObjectURL` даёт локальный адрес вида `blob:…`, который
живёт, пока его не отпустят. Сменили картинку — старый адрес отпускаем, память освобождается.

## Адаптивность

- Шире 1100 px — три колонки: каталог | превью | параметры.
- 720–1100 px — каталог становится лентой сверху.
- Уже 720 px — всё в столбик: превью на 62 % высоты экрана, параметры под ним.
