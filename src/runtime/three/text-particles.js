/**
 * «Текст из частиц» — заголовок, собранный из тысяч точек.
 *
 * Точки берутся с текста, нарисованного на скрытом холсте. ВЕРШИННЫЙ шейдер:
 *   - рассыпание: каждая точка улетает по своему направлению (aDir) на
 *     расстояние uScatter, с закруткой — текст «рассыпается» и собирается;
 *   - курсор расталкивает точки рядом с собой (всегда, даже в собранном тексте);
 *   - лёгкое «дыхание» — точки чуть дрожат, текст живой.
 * Рассыпание: при наведении, от прокрутки, само (туда-обратно) или из кода.
 */
export function textParticles({ THREE, scene, camera, renderer, values, helpers }) {
  camera.position.set(0, 0, 6)
  scene.background = new THREE.Color(values.background)
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uScatter: { value: 0 },
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector3(99, 99, 0) },
      uRepel: { value: 1 },
      uSize: { value: 1 },
      uPixelRatio: { value: 1 },
      uRadius: { value: 4 },
      uBreathe: { value: 0.012 },
      uTwist: { value: 2.5 },
      uDistance: { value: 3 },
      uDirMode: { value: 0 },
      uSoftness: { value: 1.5 },
      uBrightness: { value: 1 },
      uFade: { value: 0.6 },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      uniform float uScatter;
      uniform float uTime;
      uniform vec3 uMouse;
      uniform float uRepel;
      uniform float uSize;
      uniform float uPixelRatio;
      uniform float uRadius;
      uniform float uBreathe;
      uniform float uTwist;
      uniform float uDistance;
      uniform float uDirMode;
      attribute vec4 aDir;
      varying float vFar;
      void main() {
        vec3 p = position;
        // Рассыпание: у каждой точки своя скорость (aDir.w) — рваный край.
        float s = smoothstep(0.0, 1.0, clamp(uScatter * (0.6 + aDir.w), 0.0, 1.0));
        float a = s * uTwist * (aDir.w - 0.5);
        vec3 dir = aDir.xyz;
        // Куда улетают: во все стороны (0), вверх (1), на камеру (2), по касательной вихрем (3).
        if (uDirMode > 2.5) dir = vec3(-p.y, p.x, aDir.z * 0.5) * 0.6 + aDir.xyz * 0.4;
        else if (uDirMode > 1.5) dir = vec3(aDir.xy * 0.35, abs(aDir.z) + 0.6);
        else if (uDirMode > 0.5) dir = vec3(aDir.x * 0.4, abs(aDir.y) + 0.5, aDir.z * 0.4);
        dir.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * dir.xy;
        p += dir * s * uDistance;
        // Курсор расталкивает.
        vec2 away = p.xy - uMouse.xy;
        float d = length(away);
        p.xy += normalize(away + 1e-4) * uRepel * 0.6 * exp(-d * d * 4.0 / (uRadius * 0.25));
        // «Дыхание».
        p += uBreathe * vec3(sin(uTime * 2.0 + aDir.w * 50.0), cos(uTime * 1.7 + aDir.w * 40.0), 0.0);
        vFar = s;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = uSize * uPixelRatio * (16.0 + s * 10.0) / -view.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      uniform float uSoftness;
      uniform float uBrightness;
      uniform float uFade;
      varying float vFar;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(1.0 - smoothstep(0.0, 0.5, d), uSoftness) * (1.0 - vFar * uFade) * uBrightness;
        gl_FragColor = vec4(mix(uColorA, uColorB, vFar) * a, a);
      }`,
  })

  let points = null
  let built = ''
  const build = () => {
    const key = [values.text, values.count, values.weight, values.depth].join('|')
    if (key === built) return
    built = key
    if (points) {
      scene.remove(points)
      points.geometry.dispose()
    }
    const count = Math.round(values.count)
    const positions = helpers.samplePixels(helpers.drawText(String(values.text || 'Привет'), values.weight), count, 5)
    // Объём текста: разброс точек по z.
    for (let i = 0; i < count; i++) positions[i * 3 + 2] = (Math.random() - 0.5) * values.depth
    const dirs = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const z = Math.random() * 2 - 1
      const r = Math.sqrt(1 - z * z)
      dirs.set([Math.cos(a) * r, Math.sin(a) * r, z, Math.random()], i * 4)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aDir', new THREE.BufferAttribute(dirs, 4))
    points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    points.scale.setScalar(Math.min(1, (helpers.visibleWidth(camera) * 0.86) / 5))
    scene.add(points)
  }
  build()

  const ray = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const hit = new THREE.Vector3()
  const ndc = new THREE.Vector2()
  let scatter = 0

  return {
    // Текст шириной 5 — на узком экране уменьшаем, чтобы влез с полями.
    resize() {
      points?.scale.setScalar(Math.min(1, (helpers.visibleWidth(camera) * 0.86) / 5))
    },
    update({ time, dt, pointer, scroll, hover, progress }) {
      let target
      if (progress !== null) target = progress
      else if (values.trigger === 'hover') target = hover
      else if (values.trigger === 'scroll') target = Math.min(1, Math.max(0, (scroll - 0.4) / 0.4))
      // «Само»: большую часть периода текст собран, рассыпается коротким всплеском.
      else target = Math.pow(Math.max(0, Math.sin((time * Math.PI) / Math.max(0.5, values.period))), 3)
      scatter += (target - scatter) * Math.min(1, dt * 4 || 1)
      const u = material.uniforms
      u.uScatter.value = scatter * values.scatter
      u.uTime.value = time
      u.uRepel.value = values.repel * pointer.active
      u.uSize.value = values.size
      u.uPixelRatio.value = renderer.getPixelRatio()
      u.uRadius.value = values.repelRadius
      u.uBreathe.value = values.breathe
      u.uTwist.value = values.twist
      u.uDistance.value = values.distance
      u.uDirMode.value = ['all', 'up', 'camera', 'vortex'].indexOf(values.direction)
      u.uSoftness.value = values.softness
      u.uBrightness.value = values.brightness
      u.uFade.value = values.fade
      u.uColorA.value.set(values.colorA)
      u.uColorB.value.set(values.colorB)
      ndc.set(pointer.x, pointer.y)
      ray.setFromCamera(ndc, camera)
      // Курсор — в координатах текста (он мог быть уменьшен).
      if (ray.ray.intersectPlane(plane, hit) && points) u.uMouse.value.copy(hit).divideScalar(points.scale.x)
      if (points) {
        points.rotation.y = pointer.x * 0.35 * values.mouseTilt * pointer.active
        points.rotation.x = -pointer.y * 0.25 * values.mouseTilt * pointer.active
      }
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
