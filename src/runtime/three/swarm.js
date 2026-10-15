/**
 * «Рой» — тысячи частиц летят по потоку и тянутся к курсору.
 *
 * Симуляции нет: ВЕРШИННЫЙ шейдер каждый кадр считает место частицы
 * формулой от времени. Каждая кружит вокруг оси со своей скоростью
 * (ближние к оси — быстрее, как в вихре), покачивается вверх-вниз, а
 * плавный «поток» (сумма синусов разной частоты) закручивает её в струи.
 * Курсор — точка в 3D; частицы рядом с ней притягиваются (или
 * разлетаются, если сила отрицательная). Всё на видеокарте — даже 60 000
 * частиц не нагружают процессор.
 */
export function swarm({ THREE, scene, camera, renderer, values }) {
  camera.position.set(0, 0, 7)
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
        float angle = uTime * (0.25 + aSeed.w * 0.35) / (0.4 + r * 0.35);
        p.xz = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * p.xz;
        p.y += sin(uTime * 0.7 + aSeed.x * 6.28) * 0.25;
        // Поток закручивает частицы в струи.
        p += flow(p * 0.8, uTime * 0.6) * 0.32;
        // Притяжение к курсору: сильнее вблизи, не дальше ~2.5 единиц.
        vec3 toMouse = uMouse - p;
        float d = length(toMouse);
        float pull = uAttract * uMouseActive * exp(-d * 0.9);
        p += normalize(toMouse + 1e-4) * min(d * 0.9, 1.6) * pull;
        vGlow = clamp(pull * 1.5, 0.0, 1.0);
        vMix = aSeed.w;
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = uSize * (0.6 + aSeed.w) * uPixelRatio * 34.0 / -view.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vMix;
      varying float vGlow;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = pow(1.0 - smoothstep(0.0, 0.5, d), 1.8);
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
      positions[i * 3] = s * Math.cos(a) * r * 1.5
      positions[i * 3 + 1] = u * r * 0.8
      positions[i * 3 + 2] = s * Math.sin(a) * r
      seeds.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)
  }
  build()
  let count = values.count

  // Курсор → точка в 3D на плоскости z = 0.
  const ray = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const hit = new THREE.Vector3()
  const ndc = new THREE.Vector2()

  return {
    update({ time, pointer }) {
      const u = material.uniforms
      u.uTime.value = time * values.speed
      u.uAttract.value = values.attract
      u.uSpread.value = values.spread
      u.uSize.value = values.size
      u.uPixelRatio.value = renderer.getPixelRatio()
      u.uColorA.value.set(values.colorA)
      u.uColorB.value.set(values.colorB)
      ndc.set(pointer.x, pointer.y)
      ray.setFromCamera(ndc, camera)
      if (ray.ray.intersectPlane(plane, hit)) u.uMouse.value.copy(hit)
      u.uMouseActive.value = pointer.active
    },
    set(next) {
      scene.background.set(next.background)
      if (next.count !== count) {
        count = next.count
        build()
      }
    },
    dispose() {
      points?.geometry.dispose()
      material.dispose()
    },
  }
}
