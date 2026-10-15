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
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      uniform float uMorph;
      uniform float uTime;
      uniform float uChaos;
      uniform float uSize;
      uniform float uPixelRatio;
      attribute vec3 aTo;
      attribute float aDelay;
      varying float vT;
      void main() {
        // Своя задержка: частица начинает путь в [delay·0.4, delay·0.4 + 0.6].
        float t = smoothstep(aDelay * 0.4, aDelay * 0.4 + 0.6, uMorph);
        vec3 p = mix(position, aTo, t);
        float swirl = sin(t * 3.14159) * uChaos;
        p += vec3(
          sin(aDelay * 40.0 + uTime * 1.3),
          cos(aDelay * 31.0 + uTime * 1.1),
          sin(aDelay * 23.0 - uTime)
        ) * swirl * 0.6;
        vT = t;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = uSize * uPixelRatio * (26.0 + swirl * 14.0) / -view.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vT;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(1.0 - smoothstep(0.0, 0.5, d), 1.6);
        gl_FragColor = vec4(mix(uColorA, uColorB, vT) * a, a);
      }`,
  })

  let points = null
  let built = ''
  const build = () => {
    const key = [values.text, values.shape, values.count].join('|')
    if (key === built) return
    built = key
    if (points) {
      group.remove(points)
      points.geometry.dispose()
    }
    const count = Math.round(values.count)
    const from = helpers.samplePixels(helpers.drawText(String(values.text || '3D')), count, 4.2)
    const to = helpers.shape(values.shape, count, 1.6)
    const delay = new Float32Array(count)
    // Задержка зависит от x логотипа: волна идёт слева направо (+ немного случайности).
    for (let i = 0; i < count; i++) delay[i] = Math.min(1, Math.max(0, from[i * 3] / 4.2 + 0.5 + (Math.random() - 0.5) * 0.3))
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
      u.uColorA.value.set(values.colorA)
      u.uColorB.value.set(values.colorB)
      // Фигура медленно вращается, когда собрана; мышь наклоняет.
      group.rotation.y = morphValue * time * 0.25 + pointer.x * 0.4 * pointer.active
      group.rotation.x = -pointer.y * 0.3 * pointer.active
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
