/**
 * «Морфинг» — облако частиц перетекает из логотипа (текста) в фигуру.
 *
 * У каждой частицы две позиции: в логотипе (aFrom — точки, взятые с
 * текста, нарисованного на скрытом холсте) и в фигуре (aTo — точки на
 * поверхности сферы, тора, куба или волны). ВЕРШИННЫЙ шейдер смешивает их:
 *   p = mix(aFrom, aTo, t)
 * У каждой частицы своя задержка (aDelay), поэтому превращение идёт
 * волной, а не всё сразу. В середине пути частицы «вихрятся» — смещение по
 * синусам, умноженное на sin(t·π): ноль в начале и в конце, максимум посередине.
 *
 * Прогресс: сам туда-обратно (auto), при наведении (hover), от прокрутки
 * (scroll) или из кода: effect.progress(0.5).
 */
export function morph({ THREE, scene, camera, renderer, values, helpers }) {
  camera.position.set(0, 0, 6.5)
  scene.background = new THREE.Color(values.background)
  const group = new THREE.Group()
  scene.add(group)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uMorph: { value: 0 },
      uTime: { value: 0 },
      uChaos: { value: 1 },
      uSize: { value: 1 },
      uPixelRatio: { value: 1 },
      uStagger: { value: 0.4 },
      uSoftness: { value: 1.6 },
      uBrightness: { value: 1 },
      uJitter: { value: 0 },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      uniform float uMorph;
      uniform float uTime;
      uniform float uChaos;
      uniform float uSize;
      uniform float uPixelRatio;
      uniform float uStagger;
      uniform float uJitter;
      attribute vec3 aTo;
      attribute float aDelay;
      varying float vT;
      void main() {
        // Своя задержка: частица начинает путь в [delay·s, delay·s + (1−s)], s — «Растянутость волны».
        float t = smoothstep(aDelay * uStagger, aDelay * uStagger + (1.0 - uStagger), uMorph);
        vec3 p = mix(position, aTo, t);
        float swirl = sin(t * 3.14159) * uChaos;
        p += vec3(
          sin(aDelay * 40.0 + uTime * 1.3),
          cos(aDelay * 31.0 + uTime * 1.1),
          sin(aDelay * 23.0 - uTime)
        ) * swirl * 0.6;
        // Дрожь частиц в собранном виде (и логотип, и фигура).
        p += uJitter * 0.03 * vec3(sin(uTime * 3.0 + aDelay * 91.0), cos(uTime * 2.6 + aDelay * 67.0), sin(uTime * 2.2 + aDelay * 43.0));
        vT = t;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = uSize * uPixelRatio * (26.0 + swirl * 14.0) / -view.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uSoftness;
      uniform float uBrightness;
      varying float vT;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(1.0 - smoothstep(0.0, 0.5, d), uSoftness) * uBrightness;
        gl_FragColor = vec4(mix(uColorA, uColorB, vT) * a, a);
      }`,
  })

  let points = null
  let built = ''
  // Логотип из картинки: грузится асинхронно — пока не загрузился, показываем текст.
  let logoImg = null
  let logoUrl = ''
  const loadLogo = () => {
    if (values.source !== 'image' || !values.logo || values.logo === logoUrl) return
    logoUrl = values.logo
    const url = values.logo
    helpers.loadImage(url, (img) => {
      // Пока грузилась, могли выбрать другую картинку — берём только последнюю.
      if (url !== logoUrl) return
      logoImg = img
      build()
    })
  }
  const build = () => {
    loadLogo()
    const key = [values.source, values.logo, logoImg?.src ?? '', values.text, values.shape, values.count, values.weight, values.shapeSize, values.wave, values.depth].join('|')
    if (key === built) return
    built = key
    if (points) {
      group.remove(points)
      points.geometry.dispose()
    }
    const count = Math.round(values.count)
    const draw = values.source === 'image' && logoImg ? helpers.drawImage(logoImg) : helpers.drawText(String(values.text || '3D'), values.weight)
    const from = helpers.samplePixels(draw, count, values.source === 'image' && logoImg ? 3 : 4.2)
    const to = helpers.shape(values.shape, count, values.shapeSize)
    // Толщина логотипа: частицы выдвигаются по z (у плоского текста почти нет объёма).
    for (let i = 0; i < count; i++) from[i * 3 + 2] = (Math.random() - 0.5) * values.depth
    const delay = new Float32Array(count)
    // Откуда идёт волна: слева направо, из центра наружу, сверху вниз или вразнобой.
    for (let i = 0; i < count; i++) {
      const x = from[i * 3] / 4.2
      const y = from[i * 3 + 1] / 4.2
      const base = values.wave === 'center' ? Math.hypot(x, y) * 1.6 : values.wave === 'down' ? 0.5 - y * 1.6 : values.wave === 'random' ? Math.random() : x + 0.5
      delay[i] = Math.min(1, Math.max(0, base + (Math.random() - 0.5) * 0.3))
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(from, 3))
    geometry.setAttribute('aTo', new THREE.BufferAttribute(to, 3))
    geometry.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1))
    points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    group.add(points)
  }
  build()

  let morphValue = 0
  return {
    // Логотип шириной 4.2 — на узком экране уменьшаем всю группу.
    resize() {
      group.scale.setScalar(Math.min(1, (helpers.visibleWidth(camera) * 0.86) / 4.2))
    },
    update({ time, dt, pointer, scroll, hover, progress }) {
      let target
      if (progress !== null) target = progress
      else if (values.trigger === 'hover') target = hover
      else if (values.trigger === 'scroll') target = Math.min(1, Math.max(0, (scroll - 0.25) / 0.5))
      else target = 0.5 - 0.5 * Math.cos((time * Math.PI) / Math.max(0.5, values.period))
      // Плавно догоняем цель (кроме авто — там уже плавно).
      morphValue += (target - morphValue) * (values.trigger === 'auto' && progress === null ? 1 : Math.min(1, dt * 5))
      const u = material.uniforms
      u.uMorph.value = morphValue
      u.uTime.value = time
      u.uChaos.value = values.chaos
      u.uSize.value = values.size
      u.uPixelRatio.value = renderer.getPixelRatio()
      u.uStagger.value = values.stagger
      u.uSoftness.value = values.softness
      u.uBrightness.value = values.brightness
      u.uJitter.value = values.jitter
      u.uColorA.value.set(values.colorA)
      u.uColorB.value.set(values.colorB)
      // Фигура медленно вращается, когда собрана; мышь наклоняет.
      group.rotation.y = morphValue * time * 0.25 * values.spin + pointer.x * 0.4 * values.mouseTilt * pointer.active
      group.rotation.x = -pointer.y * 0.3 * values.mouseTilt * pointer.active
    },
    set(next) {
      scene.background.set(next.background)
      build()
    },
    dispose() {
      points?.geometry.dispose()
      material.dispose()
    },
  }
}
