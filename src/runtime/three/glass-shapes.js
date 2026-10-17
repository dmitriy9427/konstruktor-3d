/**
 * «Стеклянные фигуры» — россыпь прозрачных фигур (кубы, шары, капсулы,
 * кольца) перед ярким фоном; каждая преломляет его по-своему.
 *
 * Материал — тот же физический MeshPhysicalMaterial, что у «Стекла».
 * Поведение (values.behavior):
 *   mouse  — фигуры отталкиваются от курсора и поворачиваются к нему;
 *   scroll — при прокрутке фигуры поднимаются с разной скоростью (параллакс)
 *            и вращаются;
 *   click  — клик по фигуре: она подпрыгивает, крутится и вспыхивает; клик
 *            мимо — все фигуры разлетаются и собираются обратно;
 *   float  — просто плавают.
 * У каждой фигуры «дом» — место, к которому её тянет пружина.
 */
export function glassShapes({ THREE, scene, camera, renderer, canvas, values, addons }) {
  camera.position.set(0, 0, 9)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTarget = addons.RoomEnvironment ? pmrem.fromScene(new addons.RoomEnvironment(), 0.04) : null
  scene.environment = envTarget?.texture ?? null

  // Фон: градиентные пятна и надпись.
  const bgCanvas = document.createElement('canvas')
  bgCanvas.width = 2048
  bgCanvas.height = 1024
  const bgTexture = new THREE.CanvasTexture(bgCanvas)
  bgTexture.colorSpace = THREE.SRGBColorSpace
  const drawBg = () => {
    const g = bgCanvas.getContext('2d')
    g.fillStyle = values.background
    g.fillRect(0, 0, 2048, 1024)
    const blob = (x, y, r, c) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r)
      gr.addColorStop(0, c)
      gr.addColorStop(1, 'transparent')
      g.fillStyle = gr
      g.fillRect(0, 0, 2048, 1024)
    }
    blob(500, 350, 600, values.colorA)
    blob(1500, 650, 650, values.colorB)
    blob(1100, 200, 450, values.colorC)
    g.fillStyle = values.textColor
    g.font = '800 260px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(values.text || ''), 1024, 520)
    bgTexture.needsUpdate = true
  }
  drawBg()
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(26, 13), new THREE.MeshBasicMaterial({ map: bgTexture }))
  backdrop.position.z = -4
  scene.add(backdrop)

  const material = new THREE.MeshPhysicalMaterial({ transmission: 1, roughness: 0.05, thickness: 1, ior: 1.5, metalness: 0 })
  const geometries = {
    cube: new THREE.BoxGeometry(1, 1, 1, 4, 4, 4),
    sphere: new THREE.SphereGeometry(0.62, 48, 32),
    capsule: new THREE.CapsuleGeometry(0.35, 0.7, 8, 24),
    ring: new THREE.TorusGeometry(0.5, 0.18, 24, 64),
  }
  // Скруглённый куб: вершины тянем к сфере тем сильнее, чем больше «скругление».
  const roundCube = () => {
    const pos = geometries.cube.attributes.position
    const base = geometries.cube.userData.base ?? (geometries.cube.userData.base = pos.array.slice())
    const r = values.rounding
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(base[i * 3], base[i * 3 + 1], base[i * 3 + 2])
      const s = v.clone().normalize().multiplyScalar(0.75)
      v.lerp(s, r)
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
    geometries.cube.computeVertexNormals()
  }
  roundCube()

  const group = new THREE.Group()
  scene.add(group)
  let shapes = []
  const random = (() => {
    let s = 7
    return () => ((s = (s * 16807) % 2147483647) / 2147483647)
  })()
  const build = () => {
    shapes.forEach((sh) => group.remove(sh.mesh))
    const kinds = values.shapes === 'mix' ? ['cube', 'sphere', 'capsule', 'ring'] : [values.shapes]
    shapes = Array.from({ length: Math.round(values.count) }, (_, i) => {
      const mesh = new THREE.Mesh(geometries[kinds[i % kinds.length]], material)
      const home = new THREE.Vector3((random() - 0.5) * 9 * values.spread, (random() - 0.5) * 5 * values.spread, (random() - 0.5) * 2.5)
      mesh.position.copy(home)
      const s = values.size * (0.6 + random() * 0.8)
      mesh.scale.setScalar(s)
      mesh.rotation.set(random() * 6, random() * 6, random() * 6)
      group.add(mesh)
      return { mesh, home, vel: new THREE.Vector3(), spin: new THREE.Vector3((random() - 0.5) * 0.6, (random() - 0.5) * 0.6, 0), depth: 0.4 + random(), base: s, pop: 0, phase: random() * 6.28 }
    })
  }
  build()
  let built = [values.count, values.shapes, values.spread, values.size].join()

  const apply = () => {
    material.ior = values.ior
    material.roughness = values.roughness
    material.thickness = values.thickness
    material.dispersion = values.dispersion
    material.color.set(values.tint)
    const key = [values.count, values.shapes, values.spread, values.size].join()
    if (key !== built) {
      built = key
      build()
    }
    roundCube()
    drawBg()
  }
  apply()

  // Клики: луч из камеры → в какую фигуру попали.
  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const onDown = (e) => {
    if (values.behavior !== 'click') return
    const r = canvas.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    if (x < 0 || y < 0 || x > 1 || y > 1) return
    ndc.set(x * 2 - 1, -(y * 2 - 1))
    ray.setFromCamera(ndc, camera)
    const hit = ray.intersectObjects(shapes.map((s) => s.mesh))[0]
    if (hit) {
      const sh = shapes.find((s) => s.mesh === hit.object)
      sh.pop = 1
      sh.vel.z += 6 * values.force
      sh.spin.x += 6
    } else {
      // Мимо — взрыв от точки клика: все разлетаются и пружиной собираются обратно.
      const p = new THREE.Vector3(ndc.x * 5, ndc.y * 3, 0)
      for (const sh of shapes) {
        const d = sh.mesh.position.clone().sub(p)
        sh.vel.add(d.normalize().multiplyScalar(14 * values.force / (1 + d.length() * 0.3)))
      }
    }
  }
  addEventListener('pointerdown', onDown)

  const mouse3 = new THREE.Vector3()
  return {
    update({ time, dt, pointer, scroll }) {
      mouse3.set(pointer.x * 5.2, pointer.y * 3, 0)
      for (const sh of shapes) {
        const target = sh.home.clone()
        target.y += Math.sin(time * 0.6 + sh.phase) * 0.15 * values.floatAmt
        if (values.behavior === 'scroll') target.y += (scroll - 0.5) * 8 * sh.depth * values.force
        // Пружина к «дому» + отталкивание от курсора.
        const toHome = target.sub(sh.mesh.position)
        sh.vel.addScaledVector(toHome, 8 * dt)
        if (values.behavior === 'mouse' && pointer.active > 0.01) {
          const away = sh.mesh.position.clone().sub(mouse3)
          away.z *= 0.3
          const d = away.length()
          sh.vel.addScaledVector(away.normalize(), (values.force * 30 * pointer.active * dt) / (0.5 + d * d))
        }
        sh.vel.multiplyScalar(Math.exp(-dt * 3))
        sh.mesh.position.addScaledVector(sh.vel, dt)
        const spin = values.behavior === 'scroll' ? 1 + scroll * 4 : 1
        sh.mesh.rotation.x += (sh.spin.x * values.rotate * spin) * dt
        sh.mesh.rotation.y += (sh.spin.y * values.rotate * spin + 0.2 * values.rotate) * dt
        sh.spin.x += (Math.sign(sh.spin.x || 1) * 0.3 - sh.spin.x) * dt
        if (values.behavior === 'mouse') {
          sh.mesh.rotation.z += pointer.x * pointer.active * dt * 0.5
        }
        sh.pop *= Math.exp(-dt * 4)
        sh.mesh.scale.setScalar(sh.base * (1 + sh.pop * 0.35 * Math.sin(sh.pop * 12)))
      }
      backdrop.position.x = -pointer.x * 0.5 * pointer.active
    },
    set: apply,
    dispose() {
      removeEventListener('pointerdown', onDown)
      envTarget?.dispose()
      pmrem.dispose()
      bgTexture.dispose()
      Object.values(geometries).forEach((g) => g.dispose())
    },
  }
}
