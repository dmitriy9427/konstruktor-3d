/**
 * «Жидкая сфера» — живая капля с перламутровыми переливами.
 *
 * Образец 3D-эффекта. Правила те же, что у scene.js: в файле нет import (его
 * текст уходит в экспорт), three приходит параметром THREE. Эффект — функция
 * setup(ctx): наполняет сцену и возвращает { update(frame), set(values), dispose() }.
 *
 * Как сделана капля:
 *   - шар из мелких треугольников (IcosahedronGeometry);
 *   - ВЕРШИННЫЙ шейдер каждую вершину двигает вдоль её направления от центра на
 *     высоту «поля» — суммы синусов с завихрением координат (дёшево и плавно);
 *   - нормаль (куда «смотрит» поверхность) считаем там же: сдвигаем две соседние
 *     точки и берём перпендикуляр к получившейся площадке — без этого капля
 *     выглядела бы плоским пятном;
 *   - ФРАГМЕНТНЫЙ шейдер красит: два цвета по высоте + радуга на скользящих
 *     углах (эффект Френеля: край шара всегда «блестит» сильнее середины).
 */
export function blob({ THREE, scene, camera, values }) {
  // ── Сцена ──
  camera.position.set(0, 0, 6 / (values.zoom || 1))
  scene.background = new THREE.Color(values.background)

  // ── Uniform-переменные: мост из JS в шейдер ──
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: 0.3 },
    uScale: { value: 1.6 },
    uPointer: { value: new THREE.Vector3(0, 0, 1) },
    uPush: { value: 0 },
    uColorA: { value: new THREE.Color() },
    uColorB: { value: new THREE.Color() },
    uColorC: { value: new THREE.Color() },
    uIridescence: { value: 0.7 },
    uShift: { value: 1 },
    uGloss: { value: 0.7 },
    uRim: { value: 0.6 },
  }

  // ── Материал капли ──
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      uniform float uTime, uAmp, uScale, uPush;
      uniform vec3 uPointer;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;

      // «Поле» высот: синусы от завихрённых координат. −1…1, плавное, без текстур.
      float field(vec3 p) {
        p += 0.55 * sin(p.yzx * 1.3 + uTime * 0.9);
        p += 0.28 * sin(p.zxy * 2.7 - uTime * 1.4);
        return (sin(p.x * 1.9 + uTime) + sin(p.y * 2.1 - uTime * 0.7) + sin(p.z * 1.7 + uTime * 0.5)) / 3.0;
      }
      // Высота над шаром в направлении n: поле + бугор в сторону курсора.
      float heightAt(vec3 n) {
        return field(n * uScale) * uAmp + uPush * exp(-(1.0 - dot(n, uPointer)) * 5.0);
      }
      vec3 surface(vec3 n) { return n * 1.5 * (1.0 + heightAt(n)); }

      void main() {
        vec3 n = normalize(position);
        vec3 p = surface(n);
        // Нормаль: две соседние точки поверхности → перпендикуляр к площадке.
        vec3 t = normalize(cross(n, abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 b = cross(n, t);
        vec3 pa = surface(normalize(n + t * 0.02));
        vec3 pb = surface(normalize(n + b * 0.02));
        vNormal = normalize(normalMatrix * cross(pa - p, pb - p));
        vHeight = heightAt(n);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uIridescence, uShift, uGloss, uRim, uAmp;
      uniform vec3 uColorA, uColorB, uColorC;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vView);
        // Френель: 0 — смотрим на поверхность прямо, 1 — вскользь (край шара).
        float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.5);
        // Основа: впадины — один цвет, бугры — другой.
        float k = smoothstep(-1.0, 1.0, vHeight / max(uAmp, 0.05));
        vec3 base = mix(uColorA, uColorB, k);
        // Перелив: радуга, фаза зависит от угла взгляда, высоты и времени.
        float phase = fresnel * 1.2 + vHeight * uShift + uTime * 0.05;
        vec3 rainbow = 0.5 + 0.5 * cos(6.2832 * (phase + vec3(0.0, 0.33, 0.67)));
        vec3 col = mix(base, rainbow, uIridescence * (0.2 + 0.8 * fresnel));
        // Свет: мягкий сверху-справа + блик; контровой свет по краю — третьим цветом.
        vec3 L = normalize(vec3(0.5, 0.8, 0.6));
        col *= 0.3 + 0.7 * max(dot(N, L), 0.0);
        float spec = pow(max(dot(reflect(-L, N), V), 0.0), mix(12.0, 140.0, uGloss));
        col += spec * uGloss * 1.4 + uColorC * fresnel * uRim * 1.5;
        gl_FragColor = vec4(col, 1.0);
        // Те же тональная кривая и цветовое пространство, что у встроенных материалов three.
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })

  let detail = Math.round(values.detail)
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, detail), material)
  scene.add(mesh)

  // ── Ореол: плоскость за каплей с мягким пятном света ──
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.ShaderMaterial({
      uniforms: { uColor: uniforms.uColorC, uGlow: { value: 0.5 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uGlow; varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5) * 2.0;
          gl_FragColor = vec4(uColor * exp(-r * r * 5.0) * uGlow, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  )
  halo.position.z = -1.2
  scene.add(halo)

  // ── Значения из Студии → uniform (вызывается при каждом движении ползунка) ──
  const apply = () => {
    uniforms.uAmp.value = values.amplitude
    uniforms.uScale.value = values.scale
    uniforms.uColorA.value.set(values.colorA)
    uniforms.uColorB.value.set(values.colorB)
    uniforms.uColorC.value.set(values.colorC)
    uniforms.uIridescence.value = values.iridescence
    uniforms.uShift.value = values.shift
    uniforms.uGloss.value = values.gloss
    uniforms.uRim.value = values.rim
    halo.material.uniforms.uGlow.value = values.glow
    scene.background.set(values.background)
    // Детализация меняет число треугольников — геометрию собираем заново.
    if (Math.round(values.detail) !== detail) {
      detail = Math.round(values.detail)
      mesh.geometry.dispose()
      mesh.geometry = new THREE.IcosahedronGeometry(1, detail)
    }
  }
  apply()

  // ── Кадр ──
  let phase = 0 // своё время: смена «Скорости» не дёргает каплю
  const toPointer = new THREE.Vector3()
  const inverse = new THREE.Quaternion()
  return {
    update({ dt, pointer }) {
      phase += dt * values.speed
      uniforms.uTime.value = phase
      mesh.rotation.y = phase * 0.15 + pointer.x * 0.5 * pointer.active
      mesh.rotation.x = Math.sin(phase * 0.2) * 0.15 - pointer.y * 0.35 * pointer.active
      // Курсор (−1…1) → направление от центра капли в его сторону, в координатах самой капли.
      toPointer.set(pointer.x * camera.aspect * 0.9, pointer.y * 0.9, 0.75).normalize()
      inverse.copy(mesh.quaternion).invert()
      uniforms.uPointer.value.copy(toPointer).applyQuaternion(inverse)
      uniforms.uPush.value = values.mouse * pointer.active
      // На узком (вертикальном) экране камера отходит дальше — капля не обрезается по бокам.
      camera.position.z = (6 / values.zoom) * Math.max(1, 0.95 / camera.aspect)
    },
    set: apply,
  }
}
