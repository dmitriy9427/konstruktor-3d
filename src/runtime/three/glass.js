/**
 * «Стекло» — прозрачная фигура, через которую фон преломляется.
 *
 * Материал MeshPhysicalMaterial с transmission = 1 — физическое стекло
 * three.js: он рисует сцену ЗА объектом в отдельную текстуру и читает её со
 * сдвигом по нормали (преломление, ior), с размытием (roughness), с
 * радужными краями (dispersion — разный ior для красного, зелёного и синего).
 * Чтобы преломлению было что преломлять, за фигурой стоит плоскость с
 * яркими полосами и крупным текстом (рисуются на 2D-холсте).
 * Отражения даёт карта окружения RoomEnvironment — «комната» с источниками
 * света, посчитанная один раз.
 */
export function glass({ THREE, scene, camera, renderer, values, addons }) {
  camera.position.set(0, 0, 6)
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTarget = addons.RoomEnvironment ? pmrem.fromScene(new addons.RoomEnvironment(), 0.04) : null
  scene.environment = envTarget?.texture ?? null

  // Фон за стеклом: полосы + текст на холсте.
  const canvas = document.createElement('canvas')
  canvas.width = 2048
  canvas.height = 1024
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const drawBackdrop = () => {
    const g = canvas.getContext('2d')
    g.fillStyle = values.background
    g.fillRect(0, 0, 2048, 1024)
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? values.stripeA : values.stripeB
      g.globalAlpha = 0.9
      g.fillRect(i * 160 - 40, 0, 70, 1024)
    }
    g.globalAlpha = 1
    g.fillStyle = values.textColor
    g.font = '800 300px system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(String(values.text || 'GLASS'), 1024, 520)
    texture.needsUpdate = true
  }
  drawBackdrop()
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: texture }))
  backdrop.position.z = -3
  scene.add(backdrop)

  const material = new THREE.MeshPhysicalMaterial({ transmission: 1, metalness: 0, thickness: 1, roughness: 0, ior: 1.5 })
  const geometries = {
    knot: () => new THREE.TorusKnotGeometry(1, 0.36, 220, 32),
    sphere: () => new THREE.SphereGeometry(1.4, 96, 64),
    ico: () => new THREE.IcosahedronGeometry(1.5, 0),
    torus: () => new THREE.TorusGeometry(1.15, 0.48, 64, 160),
  }
  const mesh = new THREE.Mesh(geometries[values.shape]?.() ?? geometries.knot(), material)
  scene.add(mesh)
  let shape = values.shape
  let backdropKey = ''

  const apply = () => {
    material.ior = values.ior
    material.thickness = values.thickness
    material.roughness = values.roughness
    material.dispersion = values.dispersion
    material.color.set(values.tint)
    const key = [values.text, values.background, values.stripeA, values.stripeB, values.textColor].join('|')
    if (key !== backdropKey) {
      backdropKey = key
      drawBackdrop()
    }
    if (values.shape !== shape) {
      shape = values.shape
      mesh.geometry.dispose()
      mesh.geometry = (geometries[shape] ?? geometries.knot)()
    }
  }
  apply()

  return {
    update({ time, pointer }) {
      mesh.rotation.x = time * 0.25 * values.speed + pointer.y * 0.6 * pointer.active
      mesh.rotation.y = time * 0.35 * values.speed + pointer.x * 0.8 * pointer.active
      // Фон чуть сдвигается за мышью — преломление «играет».
      backdrop.position.x = -pointer.x * 0.4 * pointer.active
    },
    set: apply,
    dispose() {
      envTarget?.dispose()
      pmrem.dispose()
      texture.dispose()
    },
  }
}
