/**
 * «Рой» — тысячи частиц летят по потоку и тянутся к курсору.
 *
 * Симуляции нет: ВЕРШИННЫЙ шейдер каждый кадр считает место частицы
 * формулой от времени. Каждая кружит вокруг оси со своей скоростью
 * (ближние к оси — быстрее, как в вихре), покачивается вверх-вниз, а
 * плавный «поток» (сумма синусов разной частоты) закручивает её в струи.
 * Курсор — точка в 3D; частицы рядом с ней притягиваются (или
 * разлетаются, если сила отрицательная). Форма облака (эллипсоид, шар, диск,
 * кольцо, куб) задаётся один раз при сборке; остальное — uniform. Всё на видеокарте — даже 60 000
 * частиц не нагружают процессор.
 */
export function swarm({ THREE, scene, camera, renderer, values }) {
  camera.position.set(0, 0, 7 / (values.zoom || 1))
  scene.background = new THREE.Color(values.background)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector3() },
      uMouseActive: { value: 0 },
      uAttract: { value: 1 },
      uSpread: { value: 1 },
      uSize: { value: 1 },
      uPixelRatio: { value: 1 },
      uTurbulence: { value: 0.32 },
      uFlowScale: { value: 0.8 },
      uSwirl: { value: 1 },
      uBob: { value: 0.25 },
      uReach: { value: 0.9 },
      uSoftness: { value: 1.8 },
      uBrightness: { value: 1 },
      uPulse: { value: 0 },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uMouse;
      uniform float uMouseActive;
      uniform float uAttract;
      uniform float uSpread;
      uniform float uSize;
      uniform float uPixelRatio;
      uniform float uTurbulence;
      uniform float uFlowScale;
      uniform float uSwirl;
      uniform float uBob;
      uniform float uReach;
      uniform float uPulse;
      attribute vec4 aSeed;
      varying float vMix;
      varying float vGlow;
      // Плавный «поток»: сумма синусов с разными частотами по каждой оси.
      vec3 flow(vec3 p, float t) {
        return vec3(
          sin(p.y * 1.3 + t) + sin(p.z * 0.7 - t * 0.6),
          sin(p.z * 1.1 + t * 0.8) + sin(p.x * 0.9 + t * 0.5),
          sin(p.x * 1.2 - t * 0.7) + sin(p.y * 0.8 + t * 0.4)
        );
      }
      void main() {
        vec3 p = position * uSpread;
        // Вихрь: поворот вокруг оси Y, ближние к оси — быстрее.
        float r = length(p.xz);
        float angle = uSwirl * uTime * (0.25 + aSeed.w * 0.35) / (0.4 + r * 0.35);
        p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
        p.y += sin(uTime * 0.7 + aSeed.x * 6.28) * uBob;
        // Поток закручивает частицы в струи.
        p += flow(p * uFlowScale, uTime * 0.6) * uTurbulence;
        // Притяжение к курсору: сильнее вблизи, не дальше ~2.5 единиц.
        vec3 toMouse = uMouse - p;
        float d = length(toMouse);
        float pull = uAttract * uMouseActive * exp(-d * uReach);
        p += normalize(toMouse + 1e-4) * min(d * 0.9, 1.6) * pull;
        vGlow = clamp(pull * 1.5, 0.0, 1.0);
        vMix = aSeed.w;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        // «Пульс»: размер частиц дышит, у каждой своя фаза.
        float pulse = 1.0 + uPulse * 0.6 * sin(uTime * 2.0 + aSeed.y * 6.28);
        gl_PointSize = uSize * pulse * (0.6 + aSeed.w) * uPixelRatio * 34.0 / -view.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uSoftness;
      uniform float uBrightness;
      varying float vMix;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(1.0 - smoothstep(0.0, 0.5, d), uSoftness) * uBrightness;
        vec3 c = mix(uColorA, uColorB, vMix) + vGlow * 0.6;
        gl_FragColor = vec4(c * a, a);
      }`,
  })

  let points = null
  const build = () => {
    if (points) {
      scene.remove(points)
      points.geometry.dispose()
    }
    const count = Math.round(values.count)
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      // Облако-эллипсоид: шире, чем выше.
      const u = Math.random() * 2 - 1
      const a = Math.random() * Math.PI * 2
      const r = Math.cbrt(Math.random()) * 2.4
      const s = Math.sqrt(1 - u * u)
      let x = s * Math.cos(a) * r * 1.5
      let y = u * r * 0.8
      let z = s * Math.sin(a) * r
      if (values.shape === 'sphere') {
        x = s * Math.cos(a) * r
        y = u * r
      } else if (values.shape === 'disc') {
        // Плоский диск: радиус по корню — равномерно по площади.
        const rr = Math.sqrt(Math.random()) * 2.8
        x = Math.cos(a) * rr
        y = (Math.random() - 0.5) * 0.3
        z = Math.sin(a) * rr
      } else if (values.shape === 'ring') {
        // Кольцо-тор: частицы вокруг окружности радиуса 2.
        const v = Math.random() * Math.PI * 2
        const tube = Math.sqrt(Math.random()) * 0.7
        x = (2 + Math.cos(v) * tube) * Math.cos(a)
        y = Math.sin(v) * tube
        z = (2 + Math.cos(v) * tube) * Math.sin(a)
      } else if (values.shape === 'cube') {
        x = (Math.random() * 2 - 1) * 2
        y = (Math.random() * 2 - 1) * 2
        z = (Math.random() * 2 - 1) * 2
      }
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    // Кольцо и диск лежат в плоскости XZ — наклоняем к камере, иначе видно только ребро.
    points.rotation.x = values.shape === 'ring' || values.shape === 'disc' ? 0.6 : 0
    scene.add(points)
  }
  build()
  let count = values.count
  let shape = values.shape

  // Курсор → точка в 3D на плоскости z = 0.
  const ray = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const hit = new THREE.Vector3()
  const ndc = new THREE.Vector2()

  return {
    update({ time, pointer }) {
      const u = material.uniforms
      u.uTime.value = time * values.speed
      camera.position.z = 7 / values.zoom
      u.uAttract.value = values.attract
      u.uSpread.value = values.spread
      u.uSize.value = values.size
      u.uPixelRatio.value = renderer.getPixelRatio()
      u.uTurbulence.value = values.turbulence
      u.uFlowScale.value = values.flowScale
      u.uSwirl.value = values.swirl
      u.uBob.value = values.bob
      u.uReach.value = 1 / Math.max(0.05, values.reach) // радиус → скорость затухания
      u.uSoftness.value = values.softness
      u.uBrightness.value = values.brightness
      u.uPulse.value = values.pulse
      u.uColorA.value.set(values.colorA)
      u.uColorB.value.set(values.colorB)
      ndc.set(pointer.x, pointer.y)
      ray.setFromCamera(ndc, camera)
      // Курсор — в координатах облака (оно может быть наклонено).
      if (ray.ray.intersectPlane(plane, hit)) {
        points.updateMatrixWorld()
        u.uMouse.value.copy(points.worldToLocal(hit))
      }
      u.uMouseActive.value = pointer.active
    },
    set(next) {
      scene.background.set(next.background)
      if (next.count !== count || next.shape !== shape) {
        count = next.count
        shape = next.shape
        build()
      }
    },
    dispose() {
      points?.geometry.dispose()
      material.dispose()
    },
  }
}
