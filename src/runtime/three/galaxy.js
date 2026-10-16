/**
 * «Галактика» — спиральная галактика из частиц.
 *
 * JavaScript только один раз раскладывает звёзды по рукавам: радиус r,
 * угол рукава, случайный разброс (чем дальше от центра — тем больше).
 * Вращение считает ВЕРШИННЫЙ шейдер: каждая звезда поворачивается на угол
 * время × скорость / r — внутренние быстрее внешних (дифференциальное
 * вращение, как у настоящих галактик), поэтому рукава закручиваются.
 * Фрагментный шейдер рисует круглую мягкую точку; сложение (AdditiveBlending)
 * даёт свечение там, где звёзд много.
 */
export function galaxy({ THREE, scene, camera, renderer, values }) {
  // Камера: высота и отдаление — параметры «Наклон камеры» и «Отдаление».
  const placeCamera = () => {
    const tilt = (values.cameraTilt * Math.PI) / 180
    const distance = 6.1 / values.zoom
    camera.position.set(0, Math.sin(tilt) * distance, Math.cos(tilt) * distance)
    camera.lookAt(0, 0, 0)
  }
  placeCamera()
  const group = new THREE.Group()
  scene.add(group)
  scene.background = new THREE.Color(values.background)

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 1 },
      uSpin: { value: 1 },
      uPixelRatio: { value: 1 },
      uTwinkle: { value: 0 },
      uSoftness: { value: 2.2 },
      uBrightness: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uSize;
      uniform float uSpin;
      uniform float uPixelRatio;
      uniform float uTwinkle;
      attribute float aScale;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        // Поворот вокруг оси Y на угол, зависящий от радиуса.
        float r = length(position.xz);
        float angle = atan(position.z, position.x) + uTime * uSpin / (r + 0.35);
        vec3 p = vec3(cos(angle) * r, position.y, sin(angle) * r);
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        // Размер точки уменьшается с расстоянием до камеры (перспектива).
        gl_PointSize = uSize * aScale * uPixelRatio * 22.0 / -view.z;
        vColor = aColor;
        // Мерцание: у каждой звезды своя фаза (из размера) — не в такт.
        vTwinkle = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * 3.0 + aScale * 91.0));
      }`,
    fragmentShader: /* glsl */ `
      uniform float uSoftness;
      uniform float uBrightness;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        // Мягкий круг: яркий центр, плавно гаснет к краю (uSoftness — крутизна).
        float d = length(gl_PointCoord - 0.5);
        float a = pow(1.0 - smoothstep(0.0, 0.5, d), uSoftness) * vTwinkle * uBrightness;
        gl_FragColor = vec4(vColor * a, a);
      }`,
  })

  let points = null
  const build = () => {
    if (points) {
      group.remove(points)
      points.geometry.dispose()
    }
    const count = Math.round(values.count)
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const scales = new Float32Array(count)
    const inside = new THREE.Color(values.inside)
    const outside = new THREE.Color(values.outside)
    const radius = values.radius
    for (let i = 0; i < count; i++) {
      // Больше звёзд у центра: радиус в степени.
      const r = Math.pow(Math.random(), values.concentration) * radius
      const arm = ((i % values.arms) / values.arms) * Math.PI * 2
      const bend = r * values.curl
      // Разброс: случайное число в степени — большинство у оси рукава.
      const spread = () => Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * values.randomness * r
      positions[i * 3] = Math.cos(arm + bend) * r + spread()
      positions[i * 3 + 1] = spread() * values.thickness
      positions[i * 3 + 2] = Math.sin(arm + bend) * r + spread()
      const c = inside.clone().lerp(outside, Math.pow(r / radius, values.colorFalloff))
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
      scales[i] = 0.4 + Math.random() * Math.random() * 1.6 * values.sizeVariance
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    points = new THREE.Points(geometry, material)
    group.add(points)
  }
  build()

  // Структура (сколько звёзд, рукава, цвета) — пересобрать; остальное — uniform.
  const shapeKeys = ['count', 'arms', 'radius', 'curl', 'randomness', 'inside', 'outside', 'concentration', 'thickness', 'colorFalloff', 'sizeVariance']
  let shape = shapeKeys.map((k) => values[k]).join()

  return {
    update({ time, pointer }) {
      material.uniforms.uTime.value = time * values.speed
      material.uniforms.uSize.value = values.size
      material.uniforms.uSpin.value = values.spin
      material.uniforms.uPixelRatio.value = renderer.getPixelRatio()
      material.uniforms.uTwinkle.value = values.twinkle
      material.uniforms.uSoftness.value = values.softness
      material.uniforms.uBrightness.value = values.brightness
      // Мышь наклоняет галактику (сила — «Наклон за мышью»), «Наклон диска» — постоянный крен.
      group.rotation.x = pointer.y * 0.35 * values.mouseTilt * pointer.active + (values.diskTilt * Math.PI) / 180
      group.rotation.z = -pointer.x * 0.25 * values.mouseTilt * pointer.active
    },
    set(next) {
      scene.background.set(next.background)
      placeCamera()
      const now = shapeKeys.map((k) => next[k]).join()
      if (now !== shape) {
        shape = now
        build()
      }
    },
    dispose() {
      points?.geometry.dispose()
      material.dispose()
    },
  }
}
