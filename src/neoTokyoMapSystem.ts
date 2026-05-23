import * as THREE from 'three'

type RGB = [number, number, number]

function sr(n: number): number {
  return Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453 % 1)
}

function makeWinTex(bg: RGB, win: RGB, cols: number, rows: number): THREE.DataTexture {
  const W = 128, H = 128
  const data = new Uint8Array(4 * W * H)
  const cw = W / cols, rh = H / rows
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const cx = (px % cw) / cw, cy = (py % rh) / rh
      const row = Math.floor(py / rh), col = Math.floor(px / cw)
      const inW = cx > 0.08 && cx < 0.92 && cy > 0.08 && cy < 0.88
      const neonStrip = cy > 0.91 && cy < 0.99
      const bright = sr(row * 7.1 + col * 3.3) > 0.35
      const dimmed = sr(row * 2.3 + col * 5.7) < 0.15
      let r: number, g: number, b: number
      if (neonStrip) {
        r = win[0]; g = win[1]; b = win[2]
      } else if (inW && !dimmed) {
        const boost = bright ? 35 : 0
        r = Math.min(255, win[0] + boost); g = Math.min(255, win[1] + boost); b = Math.min(255, win[2] + boost)
      } else {
        r = bg[0]; g = bg[1]; b = bg[2]
      }
      const i = (py * W + px) * 4
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  return t
}

function makeGlassTex(tint: RGB): THREE.DataTexture {
  const W = 64, H = 64
  const data = new Uint8Array(4 * W * H)
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4
      const isV = (px % 8) < 1, isH = (py % 10) < 1
      const reflect = sr(px * 0.3 + py * 0.7) * 20
      let r = tint[0], g = tint[1], b = tint[2]
      if (isV || isH) {
        r = Math.max(0, r - 20); g = Math.max(0, g - 20); b = Math.max(0, b - 20)
      } else {
        r = Math.min(255, r + reflect); g = Math.min(255, g + reflect); b = Math.min(255, b + reflect)
      }
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  return t
}

function makeHwyTex(): THREE.DataTexture {
  const W = 64, H = 64
  const data = new Uint8Array(4 * W * H)
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4
      let r = 22, g = 22, b = 26
      if ((px % 18) < 2 && (py % 22) < 14) { r = 220; g = 200; b = 0 }
      if (px < 3 || px > W - 4) { r = 0; g = 180; b = 220 }
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  return t
}

interface BSpec { type: number; x: number; z: number; w: number; d: number; h: number; ry: number }

interface FlywaySegment {
  name: string
  x1: number
  z1: number
  x2: number
  z2: number
  width: number
  alt: number
  color: number
}

interface LandmarkZone {
  name: string
  x: number
  z: number
  r: number
  minTowerDistance?: number
}

const WATER_LEVEL = 1.2

const LANDMARK_ZONES: LandmarkZone[] = [
  { name: 'Tokyo Station', x: 30, z: 20, r: 720, minTowerDistance: 980 },
  { name: 'Imperial Palace', x: -500, z: 80, r: 900, minTowerDistance: 1150 },
  { name: 'Tokyo Tower', x: -600, z: 800, r: 560, minTowerDistance: 820 },
  { name: 'Skytree', x: 1600, z: -1400, r: 620, minTowerDistance: 900 },
  { name: 'Rainbow Bridge', x: 1300, z: 1050, r: 760, minTowerDistance: 980 },
  { name: 'Odaiba', x: 2000, z: 2000, r: 740, minTowerDistance: 980 },
  { name: 'Sensoji', x: 1500, z: -1500, r: 440, minTowerDistance: 720 },
  { name: 'Roppongi', x: -930, z: 980, r: 520, minTowerDistance: 780 },
  { name: 'Shinjuku', x: -2000, z: -200, r: 780, minTowerDistance: 980 },
]

const FLYWAY_SEGMENTS: FlywaySegment[] = [
  { name: 'Tokyo Station to Tokyo Tower', x1: 30, z1: 20, x2: -600, z2: 800, width: 360, alt: 190, color: 0x66d9ff },
  { name: 'Tokyo Tower to Rainbow Bridge', x1: -600, z1: 800, x2: 1300, z2: 1050, width: 420, alt: 210, color: 0xff8844 },
  { name: 'Rainbow Bridge to Odaiba', x1: 1300, z1: 1050, x2: 2000, z2: 2000, width: 520, alt: 170, color: 0x66ddff },
  { name: 'Odaiba Bay Run', x1: 2000, z1: 2000, x2: 2680, z2: 2600, width: 560, alt: 260, color: 0x00ddff },
  { name: 'Odaiba to Skytree', x1: 2000, z1: 2000, x2: 1600, z2: -1400, width: 470, alt: 620, color: 0x00ffcc },
  { name: 'Skytree to Sensoji', x1: 1600, z1: -1400, x2: 1500, z2: -1500, width: 360, alt: 360, color: 0x00ff88 },
  { name: 'Sensoji to Tokyo Station', x1: 1500, z1: -1500, x2: 30, z2: 20, width: 410, alt: 320, color: 0xffcc66 },
  { name: 'Tokyo Station to Shinjuku', x1: 30, z1: 20, x2: -2000, z2: -200, width: 460, alt: 520, color: 0x00aaff },
  { name: 'Shinjuku to Shibuya', x1: -2000, z1: -200, x2: -1300, z2: 800, width: 440, alt: 430, color: 0xff33bb },
  { name: 'Shibuya to Tokyo Tower', x1: -1300, z1: 800, x2: -600, z2: 800, width: 360, alt: 260, color: 0xff8844 },
]

function distToSegment2D(x: number, z: number, x1: number, z1: number, x2: number, z2: number): number {
  const dx = x2 - x1
  const dz = z2 - z1
  const lenSq = dx * dx + dz * dz
  if (lenSq <= 0.0001) return Math.hypot(x - x1, z - z1)
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / lenSq))
  const px = x1 + dx * t
  const pz = z1 + dz * t
  return Math.hypot(x - px, z - pz)
}

function isInFlightCorridor(x: number, z: number, extra = 0): boolean {
  return FLYWAY_SEGMENTS.some(seg => distToSegment2D(x, z, seg.x1, seg.z1, seg.x2, seg.z2) < seg.width / 2 + extra)
}

function isInLandmarkZone(x: number, z: number, extra = 0): boolean {
  return LANDMARK_ZONES.some(zone => Math.hypot(x - zone.x, z - zone.z) < zone.r + extra)
}

function isInWaterArea(x: number, z: number): boolean {
  const tokyoBay = z > 3200 || (x > 850 && x < 2850 && z > 1150 && z < 3150)
  const sumida = Math.abs(x - 1100) < 90 && z > -4800 && z < 2600
  const kanda = Math.abs(x + 1500) < 58 && z > -2100 && z < 2800
  const arakawa = Math.abs(x - 2600) < 135 && z > -4800 && z < 3200
  const odaibaIsland = Math.hypot(x - 2000, z - 2000) < 620
  const bridgeApproach = Math.hypot(x - 1300, z - 1050) < 360
  return (tokyoBay || sumida || kanda || arakawa) && !odaibaIsland && !bridgeApproach
}

// NEO Tokyo 2087 Redesign — darker, calmer colors for better visibility
const BTYPE = [
  { bg: [2,  5, 10] as RGB, win: [0,   180, 200] as RGB, cols: 8, rows: 18, em: 0x00ffcc }, // 0 Shinjuku Cyber (cyan)
  { bg: [2,  5, 12] as RGB, win: [50,  100, 180] as RGB, cols: 10, rows: 20, em: 0x003366 }, // 1 Core (dark blue)
  { bg: [5,  0, 8 ] as RGB, win: [200,  50, 150] as RGB, cols: 6, rows: 12, em: 0xff00aa }, // 2 Shibuya Neon (pink)
  { bg: [0,  5, 10] as RGB, win: [0,   180, 220] as RGB, cols: 8, rows: 16, em: 0x00ddff }, // 3 Odaiba Aqua
]

// Yamanote Line waypoints — real Tokyo loop at game scale (~1 game unit = 3m)
// Centre = Tokyo Station (0,0), z-north = negative, x-east = positive
const YAMANOTE_WP = [
  { x:    0, z:    0 }, // Tokyo
  { x:  -80, z:  400 }, // Shinbashi
  { x:  150, z:  600 }, // Hamamatsucho
  { x:  200, z: 1200 }, // Shinagawa
  { x: -200, z: 1400 }, // Osaki
  { x: -600, z: 1200 }, // Meguro
  { x: -900, z: 1000 }, // Ebisu
  { x:-1300, z:  800 }, // Shibuya
  { x:-1700, z:  400 }, // Harajuku
  { x:-2000, z:    0 }, // Shinjuku S
  { x:-2100, z: -400 }, // Shinjuku N
  { x:-2200, z:-1000 }, // Takadanobaba
  { x:-2200, z:-1800 }, // Ikebukuro
  { x:-1800, z:-2400 }, // Sugamo
  { x: -800, z:-2600 }, // Tabata
  { x:  200, z:-2400 }, // Nippori
  { x:  500, z:-1800 }, // Ueno
  { x:  600, z:-1200 }, // Okachimachi/Akihabara
  { x:  400, z: -500 }, // Kanda
  { x:    0, z:    0 }, // back to Tokyo
]

export class NeoTokyoMapSystem {
  private scene: THREE.Scene
  private mobile: boolean
  private terrainMesh: THREE.Mesh | null = null
  private instancedMeshes: THREE.InstancedMesh[] = []
  private landmarks: THREE.Object3D[] = []
  private deco: THREE.Object3D[] = []
  private buildingColliders: THREE.Mesh[] = []  // Simple collision boxes for each building

  constructor(scene: THREE.Scene, isMobile = false) {
    this.scene = scene
    this.mobile = isMobile
  }

  async initialize(): Promise<void> {
    this.createTerrain()
    this.createBuildings()
    this.createVariedBuildings()
    if (!this.mobile) {
      this.createMegaPillars()
      this.createMegaRings()
      this.createMegaArches()
    }
    this.createLandmarks()
    this.createNeoLandmarkExtensions()
    this.createImperialPalace()
    this.buildRainbowBridge()
    if (!this.mobile) {
      this.createYamanoteLine()
      this.createHighways()
    }
    this.createFlightCorridors()
    this.createHolograms()
    this.createWater()
  }

  // Tokyo topography: Musashino Plateau (west, high), CBD (center), Bay (east-south, low)
  // Scale: 1 unit ≈ 3m real. Gaussian bumps approximate real Tokyo elevation.
  static heightAt(x: number, z: number): number {
    if (isInWaterArea(x, z)) return WATER_LEVEL - 3
    let h = 45 - x * 0.005   // gentle E-W gradient: west higher
    // Shinjuku/Yoyogi hill cluster (NW)
    h += 45 * Math.exp(-((x + 2000) ** 2 / 2500000 + (z + 200) ** 2 / 2000000))
    // Minato/Tokyo Tower ridge
    h += 22 * Math.exp(-((x + 1000) ** 2 / 1800000 + (z - 800) ** 2 / 1500000))
    // Ueno ridge (northeast)
    h += 16 * Math.exp(-((x - 400) ** 2 / 1100000 + (z + 1500) ** 2 / 1000000))
    // Odaiba/bay depression (southeast)
    h -= 30 * Math.exp(-((x - 2000) ** 2 / 3500000 + (z - 1800) ** 2 / 3000000))
    // Micro undulation
    h += Math.sin(x * 0.0008) * Math.cos(z * 0.001) * 8
    h += Math.sin(x * 0.0025) * Math.sin(z * 0.002) * 4
    const bayDrop = z - 4000
    if (bayDrop > 0) h -= bayDrop * 0.02
    return Math.max(0, h)
  }

  getTerrainHeight(x: number, z: number): number { return NeoTokyoMapSystem.heightAt(x, z) }
  getSafeSpawnPosition(): { x: number; y: number; z: number } { return { x: -900, y: 900, z: -4700 } }

  // InstancedMesh excluded: Box3.setFromObject(instancedMesh) returns a box covering
  // ALL instances (the entire city), causing false collision hits in building gaps.
  getCollisionObjects(): THREE.Object3D[] {
    return [...this.landmarks, ...this.buildingColliders]
  }

  cleanup(): void {
    if (this.terrainMesh) { this.scene.remove(this.terrainMesh); this.terrainMesh = null }
    for (const m of this.instancedMeshes) this.scene.remove(m)
    this.instancedMeshes.length = 0
    for (const c of this.buildingColliders) this.scene.remove(c)
    this.buildingColliders.length = 0
    for (const l of this.landmarks) this.scene.remove(l)
    this.landmarks.length = 0
    for (const d of this.deco) this.scene.remove(d)
    this.deco.length = 0
  }

  // ===== TERRAIN =====

  private createTerrain(): void {
    const SIZE = 14000, SEGS = this.mobile ? 64 : 128
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position.array as Float32Array
    const cols = new Float32Array(pos.length)
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], z = pos[i + 2]
      pos[i + 1] = NeoTokyoMapSystem.heightAt(x, z)
      // 600m road grid pattern
      const rx = ((x % 600) + 600) % 600, rz = ((z % 600) + 600) % 600
      const dR = Math.min(Math.min(rx, 600 - rx), Math.min(rz, 600 - rz))
      let r: number, g: number, b: number
      if (isInWaterArea(x, z)) {
        r = 0.015; g = 0.035; b = 0.065
      } else if (dR < 55) {
        r = 0.08 + sr(i * 0.009) * 0.02; g = 0.09 + sr(i * 0.011) * 0.01; b = 0.12 + sr(i * 0.013) * 0.02
      } else if (dR < 65) {
        r = 0.15; g = 0.14; b = 0.16
      } else {
        r = 0.13 + sr(i * 0.017) * 0.04; g = 0.12 + sr(i * 0.021) * 0.03; b = 0.14 + sr(i * 0.025) * 0.04
      }
      cols[i] = Math.max(0, Math.min(1, r))
      cols[i + 1] = Math.max(0, Math.min(1, g))
      cols[i + 2] = Math.max(0, Math.min(1, b))
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    geo.computeVertexNormals()
    this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
    this.terrainMesh.name = 'NeoTokyoTerrain'
    this.scene.add(this.terrainMesh)
  }

  // ===== BUILDINGS (InstancedMesh — 6 draw calls for 700+ buildings) =====

  private createBuildings(): void {
    const textures = BTYPE.map(b => makeWinTex(b.bg, b.win, b.cols, b.rows))
    textures.forEach(t => t.repeat.set(1, 2))
    const specs = this.collectBuildingSpecs()
    const unitGeo = new THREE.BoxGeometry(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion()

    // Invisible collision material
    const colliderMat = new THREE.MeshBasicMaterial({ visible: false })

    for (let t = 0; t < BTYPE.length; t++) {
      const list = specs.filter(s => s.type === t)
      if (!list.length) continue
      // Cyberpunk boost: brighter emissive for neon feel
      let emIntensity = 0.4  // Base
      if (t === 0) emIntensity = 0.6  // Shinjuku cyan
      else if (t === 2) emIntensity = 0.7  // Shibuya pink
      else emIntensity = 0.5  // Core/Odaiba

      const mat = new THREE.MeshLambertMaterial({
        map: textures[t], emissive: new THREE.Color(BTYPE[t].em), emissiveIntensity: emIntensity,
      })
      const mesh = new THREE.InstancedMesh(unitGeo, mat, list.length)
      mesh.castShadow = !this.mobile; mesh.name = `NT_B_${t}`
      list.forEach((s, i) => {
        const gy = NeoTokyoMapSystem.heightAt(s.x, s.z)
        q.setFromAxisAngle(up, s.ry)
        mtx.compose(new THREE.Vector3(s.x, gy + s.h / 2, s.z), q, new THREE.Vector3(s.w, s.h, s.d))
        mesh.setMatrixAt(i, mtx)

        // Create individual collision box for each building
        const collider = new THREE.Mesh(unitGeo, colliderMat)
        collider.position.set(s.x, gy + s.h / 2, s.z)
        collider.scale.set(s.w, s.h, s.d)
        collider.rotation.y = s.ry
        collider.name = 'BuildingCollider'
        this.scene.add(collider)
        this.buildingColliders.push(collider)
      })
      mesh.instanceMatrix.needsUpdate = true
      this.scene.add(mesh); this.instancedMeshes.push(mesh)
    }
    console.log(`[NEO Tokyo] Created ${this.buildingColliders.length} building colliders`)
  }

  private collectBuildingSpecs(): BSpec[] {
    const specs: BSpec[] = []

    // NEO Tokyo 2087 Redesign: Large buildings, wide streets, flight-first
    // Target: 150-200 buildings (vs 700+), size 200-600m (vs 100m)

    const canPlaceTower = (x: number, z: number, h: number): boolean => {
      if (isInWaterArea(x, z)) return false
      if (isInFlightCorridor(x, z, h > 1000 ? 180 : 90)) return false
      for (const zone of LANDMARK_ZONES) {
        const minDistance = h > 1000 ? zone.minTowerDistance ?? zone.r : zone.r
        if (Math.hypot(x - zone.x, z - zone.z) < minDistance) return false
      }
      return true
    }

    // District 1: Tokyo Station Core (0-1km) — 5-6 mega towers
    const corePos = [[980, -520], [-1150, -520], [1050, 620], [-1180, 650], [0, -980]]
    for (const [cx, cz] of corePos) {
      const bs = sr(cx * 0.1 + cz * 0.1)
      const h = 1450 + bs * 420
      if (!canPlaceTower(cx, cz, h)) continue
      specs.push({
        type: 1,
        x: cx,
        z: cz,
        w: 400 + bs * 200,  // 400-600m
        d: 400 + bs * 200,
        h,
        ry: sr(bs) > 0.5 ? Math.PI / 2 : 0
      })
    }

    // District 2: Shinjuku Mega Towers (west -2km) — 3-4 towers
    const shinjukuPos = [[-2950, -420], [-2950, 240], [-1180, -520], [-2920, -980]]
    for (const [cx, cz] of shinjukuPos) {
      const bs = sr(cx * 0.1 + cz * 0.1)
      const h = 1050 + bs * 520
      if (!canPlaceTower(cx, cz, h)) continue
      specs.push({
        type: 0,
        x: cx,
        z: cz,
        w: 300 + bs * 200,  // 300-500m
        d: 300 + bs * 200,
        h,
        ry: sr(bs) > 0.5 ? Math.PI / 2 : 0
      })
    }

    // District 3: Shibuya Neon (southwest) — 8-10 medium towers
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 0.5 + Math.PI * 0.75
      const dist = 1500 + (i % 3) * 300
      const cx = Math.cos(angle) * dist
      const cz = Math.sin(angle) * dist
      const bs = sr(cx * 0.1 + cz * 0.1)
      const h = 760 + bs * 320
      if (!canPlaceTower(cx, cz, h)) continue
      specs.push({
        type: 2,
        x: cx,
        z: cz,
        w: 200 + bs * 100,  // 200-300m
        d: 200 + bs * 100,
        h,
        ry: Math.PI / 6  // diagonal
      })
    }

    // District 4: Odaiba Platform (southeast) — 5-6 medium
    const odaibaPos = [[1200, 2600], [2800, 2050], [3000, 2500], [1650, 2950], [2700, 1450]]
    for (const [cx, cz] of odaibaPos) {
      const bs = sr(cx * 0.1 + cz * 0.1)
      const h = 560 + bs * 320
      if (!canPlaceTower(cx, cz, h)) continue
      specs.push({
        type: 3,
        x: cx,
        z: cz,
        w: 200 + bs * 200,  // 200-400m
        d: 200 + bs * 200,
        h,
        ry: sr(bs) > 0.5 ? Math.PI / 2 : 0
      })
    }

    // District 5: Mid-ring scattered towers (2-3.5km) — ~30 buildings
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      for (let r = 2000; r < 3500; r += 600) {
        const cx = Math.cos(a) * r + (sr(a + r) - 0.5) * 400
        const cz = Math.sin(a) * r + (sr(a - r) - 0.5) * 400
        if (sr(cx * 0.01 + cz * 0.01) > 0.6) continue  // sparse

        const bs = sr(cx * 0.1 + cz * 0.1)
        let type = 1
        if (cx < -1000 && Math.abs(cz) < 800) type = 0  // Shinjuku area
        else if (cx < 0 && cz > 500) type = 2  // Shibuya area
        else if (cx > 1000 && cz > 1000) type = 3  // Odaiba area

        const h = 640 + bs * 420
        if (!canPlaceTower(cx, cz, h)) continue
        specs.push({
          type,
          x: cx,
          z: cz,
          w: 250 + bs * 150,  // 250-400m
          d: 250 + bs * 150,
          h,
          ry: sr(bs) > 0.5 ? Math.PI / 2 : 0
        })
      }
    }

    console.log(`[NEO Tokyo Redesign] Generated ${specs.length} large buildings (target: 150-200)`)
    return specs
  }

  // ===== MEGA STRUCTURES (Vertical City Infrastructure) =====

  private createMegaPillars(): void {
    // 12 Mega Pillars — vertical support pillars for NEO Tokyo 2087
    const positions: [number, number][] = [
      [3200, -3200],
      [-3600, -2600],
      [-3800, 1500],
      [3600, 3600],
      [-500, -3600],
      [4200, 400],
      [-3400, 3400],
      [800, 3600],
      [3500, -1600],
      [-4200, -300],
      [2200, -3600],
      [-1800, 3600],
    ]

    const geo = new THREE.CylinderGeometry(25, 30, 1, 16)
    positions.forEach(([px, pz], i) => {
      const pillarHeight = 2000 + Math.random() * 500
      if (isInLandmarkZone(px, pz, 260) || isInWaterArea(px, pz)) return
      const gy = NeoTokyoMapSystem.heightAt(px, pz)

      const mat = new THREE.MeshStandardMaterial({
        color: 0x112233,
        emissive: new THREE.Color(0x0088ff + i * 0x110011),
        emissiveIntensity: 0.4,
        metalness: 0.7,
        roughness: 0.3
      })

      const pillar = new THREE.Mesh(geo, mat)
      pillar.position.set(px, gy + pillarHeight / 2, pz)
      pillar.scale.y = pillarHeight
      pillar.name = `MegaPillar_${i}`
      this.scene.add(pillar)
      this.landmarks.push(pillar)
    })
    console.log(`[NEO Tokyo] Created 12 Mega Pillars`)
  }

  private createMegaRings(): void {
    // 4 giant rings you can fly through
    const rings = [
      { x: 760, z: -760, r: 360, alt: 520, tube: 34, c: 0x0066ff, name: 'Marunouchi Flight Gate' },
      { x: -2900, z: -760, r: 380, alt: 720, tube: 36, c: 0x00ffcc, name: 'Shinjuku Outer Gate' },
      { x: 2680, z: 2600, r: 420, alt: 360, tube: 38, c: 0x00ddff, name: 'Odaiba Bay Gate' },
      { x: 2300, z: -1920, r: 300, alt: 980, tube: 30, c: 0x00ff88, name: 'Skytree Sky Gate' },
    ]
    for (const ring of rings) {
      const gy = NeoTokyoMapSystem.heightAt(ring.x, ring.z)
      const geo = new THREE.TorusGeometry(ring.r, ring.tube, 24, 64)
      const mat = new THREE.MeshLambertMaterial({
        color: ring.c,
        emissive: new THREE.Color(ring.c),
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.58,
        depthWrite: false
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(ring.x, gy + ring.alt, ring.z)
      mesh.rotation.x = Math.PI / 2
      mesh.name = ring.name
      this.scene.add(mesh)
      this.deco.push(mesh)
    }
    console.log(`[NEO Tokyo] Created 4 Mega Rings`)
  }

  private createMegaArches(): void {
    // Giant arches connecting buildings
    const arches = [
      { x1: 820, z1: -740, x2: 1160, z2: -420, h: 620, c: 0x0088ff },
      { x1: -3300, z1: -650, x2: -2650, z2: -900, h: 680, c: 0x00ffcc },
      { x1: -1850, z1: 1200, x2: -1300, z2: 1700, h: 520, c: 0xff00aa },
      { x1: 2500, z1: 2550, x2: 3100, z2: 3000, h: 460, c: 0x00ddff },
      { x1: 2400, z1: -1850, x2: 3000, z2: -1500, h: 620, c: 0x00ff88 },
    ]
    for (const arch of arches) {
      const dx = arch.x2 - arch.x1
      const dz = arch.z2 - arch.z1
      const span = Math.hypot(dx, dz)
      const midX = (arch.x1 + arch.x2) / 2
      const midZ = (arch.z1 + arch.z2) / 2
      const angle = Math.atan2(dx, dz)
      const gy = NeoTokyoMapSystem.heightAt(midX, midZ)

      const segments = 12
      const archGroup = new THREE.Group()
      for (let i = 0; i <= segments; i++) {
        const t = i / segments
        const x = arch.x1 + dx * t
        const z = arch.z1 + dz * t
        const archHeight = Math.sin(t * Math.PI) * arch.h
        const segGeo = new THREE.CylinderGeometry(30, 30, span / segments * 1.2, 16)
        const segMat = new THREE.MeshLambertMaterial({
          color: arch.c,
          emissive: new THREE.Color(arch.c),
          emissiveIntensity: 1.0,
          transparent: true,
          opacity: 0.55,
          depthWrite: false
        })
        const seg = new THREE.Mesh(segGeo, segMat)
        seg.position.set(x - midX, archHeight, z - midZ)
        if (i < segments) {
          const nextT = (i + 1) / segments
          const nextHeight = Math.sin(nextT * Math.PI) * arch.h
          const localAngle = Math.atan2(span / segments, nextHeight - archHeight)
          seg.rotation.z = -localAngle
          seg.rotation.y = -angle
        }
        archGroup.add(seg)
      }
      archGroup.position.set(midX, gy, midZ)
      archGroup.name = 'MegaArch'
      this.scene.add(archGroup)
      this.deco.push(archGroup)
    }
    console.log(`[NEO Tokyo] Created ${arches.length} Mega Arches`)
  }

  private createVariedBuildings(): void {
    // Add varied building shapes for visual interest

    // Ring Buildings (5x in Core)
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      const dist = 600 + (i % 2) * 200
      const x = Math.cos(angle) * dist
      const z = Math.sin(angle) * dist
      if (isInLandmarkZone(x, z, 160) || isInWaterArea(x, z)) continue
      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const outerR = 120 + i * 10
      const innerR = 70 + i * 5
      const h = 1000 + i * 100

      const outerGeo = new THREE.CylinderGeometry(outerR, outerR, h, 32)
      const innerGeo = new THREE.CylinderGeometry(innerR, innerR, h + 10, 32)
      const mat = new THREE.MeshLambertMaterial({
        color: 0x0a0f18,
        emissive: 0x0066ff,
        emissiveIntensity: 0.4
      })

      const ring = new THREE.Mesh(outerGeo, mat)
      ring.position.set(x, gy + h / 2, z)
      this.scene.add(ring)
      this.landmarks.push(ring)

      // Inner glow
      const glowMat = new THREE.MeshLambertMaterial({
        color: 0x00aaff,
        emissive: 0x0088ff,
        emissiveIntensity: 0.8,
        side: THREE.BackSide
      })
      const glow = new THREE.Mesh(innerGeo, glowMat)
      glow.position.set(x, gy + h / 2, z)
      this.scene.add(glow)
      this.deco.push(glow)
    }

    // Cylinder Towers (10x scattered)
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = 1500 + Math.random() * 2000
      const x = Math.cos(angle) * dist
      const z = Math.sin(angle) * dist
      if (isInLandmarkZone(x, z, 160) || isInWaterArea(x, z)) continue
      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const r = 75 + Math.random() * 75
      const h = 800 + Math.random() * 800

      const geo = new THREE.CylinderGeometry(r, r * 0.8, h, 24)
      const colorChoice = [0x00ffcc, 0x0066ff, 0xff00aa, 0x00ddff][i % 4]
      const mat = new THREE.MeshLambertMaterial({
        color: 0x0a0f18,
        emissive: colorChoice,
        emissiveIntensity: 0.3
      })

      const tower = new THREE.Mesh(geo, mat)
      tower.position.set(x, gy + h / 2, z)
      this.scene.add(tower)
      this.landmarks.push(tower)
    }

    // Pyramid Buildings (3x in Core/Odaiba)
    const pyramidPos = [[0, -600], [600, 0], [2000, 2200]]
    for (const [x, z] of pyramidPos) {
      if (isInLandmarkZone(x, z, 160) || isInWaterArea(x, z)) continue
      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const baseR = 200
      const h = 1200
      const geo = new THREE.CylinderGeometry(0, baseR, h, 4)
      const mat = new THREE.MeshLambertMaterial({
        color: 0x0a0f18,
        emissive: 0x0066ff,
        emissiveIntensity: 0.35
      })

      const pyramid = new THREE.Mesh(geo, mat)
      pyramid.position.set(x, gy + h / 2, z)
      pyramid.rotation.y = Math.PI / 4
      this.scene.add(pyramid)
      this.landmarks.push(pyramid)
    }

    console.log(`[NEO Tokyo] Created varied buildings: rings, cylinders, pyramids`)
  }

  // ===== LANDMARKS (individually placed — accurate per-object collision) =====

  private createLandmarks(): void {
    this.buildSkytree(1600, -1400)
    this.buildTokyoTower(-600, 800)
    this.buildShinjukuCluster()
    this.buildTokyoStation(30, 20)
    this.buildRoppongiHills(-1000, 1000)
    this.buildAzabudaiHills(-850, 950)
    this.buildDietBuilding(-600, 700)
    this.buildFujiTV(2000, 2000)
    this.buildSensoji(1500, -1500)
    this.buildMast(1000, -800, 20, 500)   // broadcast mast near Skytree
    this.buildMast(-900, 1100, 14, 360)   // Roppongi area mast
  }

  private createNeoLandmarkExtensions(): void {
    this.extendTokyoTower(-600, 800)
    this.extendSkytree(1600, -1400)
    this.extendTokyoStation(30, 20)
    this.extendRainbowBridge()
    this.extendFujiTV(2000, 2000)
    this.extendSensoji(1500, -1500)
  }

  private extendTokyoTower(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff3300, emissive: 0xff1100, emissiveIntensity: 2.2 })
    const ringMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xff5533, emissiveIntensity: 1.8, transparent: true, opacity: 0.82 })
    for (const y of [260, 430, 610]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(96, 5, 8, 48), ringMat)
      ring.position.y = y
      ring.rotation.x = Math.PI / 2
      g.add(ring)
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(3, 8, 220, 8), redMat)
    mast.position.y = 760
    g.add(mast)
    this.scene.add(g); this.landmarks.push(g)
  }

  private extendSkytree(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x88ccff, emissive: 0x2277ff, emissiveIntensity: 1.5, transparent: true, opacity: 0.72 })
    const spineMat = new THREE.MeshLambertMaterial({ color: 0x33aaff, emissive: 0x0088ff, emissiveIntensity: 2.2 })
    for (let i = 0; i < 18; i++) {
      const a = i * 0.65
      const y = 280 + i * 62
      const r = 150 + Math.sin(i * 0.6) * 18
      const deck = new THREE.Mesh(new THREE.BoxGeometry(120, 6, 14), deckMat)
      deck.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      deck.rotation.y = -a
      g.add(deck)
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 95, 6), spineMat)
      strut.position.set(Math.cos(a) * (r - 35), y - 25, Math.sin(a) * (r - 35))
      strut.rotation.z = 0.35
      g.add(strut)
    }
    const beacon = new THREE.Mesh(new THREE.TorusGeometry(190, 9, 10, 64), spineMat)
    beacon.position.y = 1360
    beacon.rotation.x = Math.PI / 2
    g.add(beacon)
    this.scene.add(g); this.landmarks.push(g)
  }

  private extendTokyoStation(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x9bd8ff, emissive: 0x1a66aa, emissiveIntensity: 1.0, transparent: true, opacity: 0.42 })
    const railMat = new THREE.MeshLambertMaterial({ color: 0xffcc88, emissive: 0xff8844, emissiveIntensity: 1.5 })
    const terminal = new THREE.Mesh(new THREE.BoxGeometry(620, 54, 220), glassMat)
    terminal.position.set(0, 150, 0)
    g.add(terminal)
    for (const zOff of [-140, 140]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(760, 8, 12), railMat)
      rail.position.set(0, 185, zOff)
      g.add(rail)
    }
    this.scene.add(g); this.deco.push(g)
  }

  private extendRainbowBridge(): void {
    const x1 = 900, z1 = 700, x2 = 1700, z2 = 1400
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.hypot(dx, dz)
    const angle = Math.atan2(dx, dz)
    const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x243040, emissive: 0x102040, emissiveIntensity: 0.5 })
    const neonMat = new THREE.MeshLambertMaterial({ color: 0x88ddff, emissive: 0x44aaff, emissiveIntensity: 2.2 })
    const upper = new THREE.Group()
    upper.position.set(midX, 118, midZ)
    upper.rotation.y = -angle
    upper.add(new THREE.Mesh(new THREE.BoxGeometry(len + 360, 8, 34), deckMat))
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 380, 4, 3), neonMat)
      rail.position.set(0, 7, side * 18)
      upper.add(rail)
    }
    this.scene.add(upper); this.deco.push(upper)
  }

  private extendFujiTV(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const sphereMat = new THREE.MeshLambertMaterial({ color: 0xaad8ff, emissive: 0x3388ff, emissiveIntensity: 1.2 })
    const ringMat = new THREE.MeshLambertMaterial({ color: 0x00ddff, emissive: 0x00aaff, emissiveIntensity: 2.0 })
    for (const [dx, y, r] of [[-120, 210, 34], [120, 245, 28], [0, 300, 24]] as [number, number, number][]) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), sphereMat)
      sphere.position.set(X + dx, gy + y, Z)
      this.scene.add(sphere); this.deco.push(sphere)
    }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(130, 5, 8, 48), ringMat)
    halo.position.set(X, gy + 170, Z)
    halo.rotation.x = Math.PI / 2
    this.scene.add(halo); this.deco.push(halo)
  }

  private extendSensoji(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const lanternMat = new THREE.MeshLambertMaterial({ color: 0xff5533, emissive: 0xff2200, emissiveIntensity: 2.4 })
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x552211, emissive: 0xff5522, emissiveIntensity: 0.8, transparent: true, opacity: 0.55 })
    const path = new THREE.Mesh(new THREE.BoxGeometry(38, 1.5, 520), pathMat)
    path.position.set(X, gy + 2.5, Z - 230)
    this.scene.add(path); this.deco.push(path)
    for (let i = 0; i < 11; i++) {
      const z = Z - 470 + i * 42
      for (const side of [-1, 1]) {
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(7, 8, 6), lanternMat)
        lantern.position.set(X + side * 42, gy + 24, z)
        this.scene.add(lantern); this.deco.push(lantern)
      }
    }
  }

  private buildSkytree(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4c, emissive: 0x081428, emissiveIntensity: 0.3 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x66aacc, emissive: 0x1144aa, emissiveIntensity: 1.2 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0x4466ff, emissive: 0x3355ee, emissiveIntensity: 3.0 })
    const neonR    = new THREE.MeshLambertMaterial({ color: 0x8844ff, emissive: 0x6633ee, emissiveIntensity: 3.0 })
    // NEO TOKYO: 2.5x scale — 634m → 1585m
    const S = 2.5
    const base = new THREE.Mesh(new THREE.CylinderGeometry(18*S, 80*S, 350*S, 3), steelMat); base.position.y = 175*S; g.add(base)
    const d1 = new THREE.Mesh(new THREE.CylinderGeometry(42*S, 42*S, 18*S, 16), glassMat); d1.position.y = 362*S; g.add(d1)
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(14*S, 18*S, 110*S, 8), steelMat); s1.position.y = 418*S; g.add(s1)
    const d2 = new THREE.Mesh(new THREE.CylinderGeometry(30*S, 30*S, 16*S, 12), glassMat); d2.position.y = 474*S; g.add(d2)
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(7*S, 14*S, 160*S, 6), steelMat); s2.position.y = 556*S; g.add(s2)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.5*S, 5*S, 38*S, 6), steelMat); mast.position.y = 637*S; g.add(mast)
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2
      const spine = new THREE.Mesh(new THREE.BoxGeometry(3*S, 350*S, 3*S), c === 0 ? neonMat : neonR)
      spine.position.set(Math.cos(a) * 44*S, 175*S, Math.sin(a) * 44*S); g.add(spine)
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(2.5*S, 12*S, 2.5*S), neonMat); p1.position.set(Math.cos(a) * 38*S, 358*S, Math.sin(a) * 38*S); g.add(p1)
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(2*S, 10*S, 2*S), neonR);        p2.position.set(Math.cos(a) * 28*S, 470*S, Math.sin(a) * 28*S); g.add(p2)
    }
    this.scene.add(g); this.landmarks.push(g)
  }

  private buildTokyoTower(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const redMat   = new THREE.MeshLambertMaterial({ color: 0xff2800, emissive: 0x440a00, emissiveIntensity: 0.6 })
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0x222222, emissiveIntensity: 0.2 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbcc, emissive: 0x112233, emissiveIntensity: 0.8 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 2.5 })
    // NEO TOKYO: 2x scale — 333m → 666m
    const S = 2
    const body = new THREE.Mesh(new THREE.CylinderGeometry(5*S, 44*S, 330*S, 4), redMat)
    body.position.y = 165*S; body.rotation.y = Math.PI / 4; g.add(body)
    for (const [y, hw] of [[65, 38], [130, 30], [198, 20], [265, 12]] as [number, number][]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(hw*S * 2, 6*S, hw*S * 2), whiteMat)
      band.position.y = y*S; band.rotation.y = Math.PI / 4; g.add(band)
    }
    const obs1 = new THREE.Mesh(new THREE.CylinderGeometry(26*S, 26*S, 18*S, 12), glassMat); obs1.position.y = 207*S; g.add(obs1)
    const obs2 = new THREE.Mesh(new THREE.CylinderGeometry(17*S, 17*S, 14*S, 12), glassMat); obs2.position.y = 322*S; g.add(obs2)
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(3*S, 9*S, 88*S, 4), redMat)
    upper.position.y = 376*S; upper.rotation.y = Math.PI / 4; g.add(upper)
    for (let c = 0; c < 4; c++) {
      const a = c * Math.PI / 2 + Math.PI / 4
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2*S, 325*S, 2*S), neonMat)
      strip.position.set(Math.cos(a) * 24*S, 165*S, Math.sin(a) * 24*S); g.add(strip)
    }
    this.scene.add(g); this.landmarks.push(g)
  }

  private buildShinjukuCluster(): void {
    // Hand-placed towers around Shinjuku area (-2000, -200)
    const towers = [
      { x:-2000, z: -220, w:115, d:100, h: 700 },
      { x:-2180, z: -350, w: 95, d: 88, h: 620 },
      { x:-1820, z: -350, w:100, d: 92, h: 560 },
      { x:-2260, z:  -80, w: 88, d: 80, h: 500 },
      { x:-1740, z:  -80, w: 92, d: 84, h: 480 },
      { x:-2080, z:  100, w: 80, d: 74, h: 420 },
      { x:-1920, z:  110, w: 84, d: 76, h: 395 },
      { x:-2340, z: -250, w: 70, d: 64, h: 360 },
    ]
    const neonColors = [0x00ffcc, 0xff00aa, 0x0088ff, 0xffcc00, 0xff4400, 0x88ff00, 0x00aaff, 0xff8800]
    towers.forEach((p, i) => {
      const gy = NeoTokyoMapSystem.heightAt(p.x, p.z)
      const nC = neonColors[i % neonColors.length]
      const winRGB: RGB = [(nC >> 16) & 0xff, (nC >> 8) & 0xff, nC & 0xff]
      const tex = makeWinTex([5, 8, 20] as RGB, winRGB, 7, 14); tex.repeat.set(1, 2)
      const tower = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d),
        new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(nC), emissiveIntensity: 0.30 }))
      tower.position.set(p.x, gy + p.h / 2, p.z); tower.castShadow = !this.mobile
      this.scene.add(tower); this.landmarks.push(tower)
      // Neon crown
      const crown = new THREE.Mesh(new THREE.BoxGeometry(p.w + 14, 16, p.d + 14),
        new THREE.MeshLambertMaterial({ color: nC, emissive: new THREE.Color(nC), emissiveIntensity: 2.2 }))
      crown.position.set(p.x, gy + p.h + 8, p.z); this.scene.add(crown); this.landmarks.push(crown)
      // Corner neon strips
      const stripMat = new THREE.MeshLambertMaterial({ color: nC, emissive: new THREE.Color(nC), emissiveIntensity: 1.8 })
      for (let c = 0; c < 4; c++) {
        const a = c * Math.PI / 2 + Math.PI / 4
        const strip = new THREE.Mesh(new THREE.BoxGeometry(3, p.h, 3), stripMat)
        strip.position.set(p.x + Math.cos(a) * (p.w / 2 + 2.5), gy + p.h / 2, p.z + Math.sin(a) * (p.d / 2 + 2.5))
        this.scene.add(strip); this.landmarks.push(strip)
      }
    })
  }

  // 東京駅 Marunouchi facade — red brick, twin stone domes
  private buildTokyoStation(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const brickMat = new THREE.MeshLambertMaterial({ color: 0x8b3a2a, emissive: 0x2a0e0a, emissiveIntensity: 0.15 })
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xc8b89a, emissive: 0x1a1008, emissiveIntensity: 0.1 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x88aacc, emissive: 0x112244, emissiveIntensity: 0.3 })
    const facade = new THREE.Mesh(new THREE.BoxGeometry(420, 52, 78), brickMat); facade.position.set(0, 26, 0); g.add(facade)
    const base   = new THREE.Mesh(new THREE.BoxGeometry(432, 10, 84), stoneMat); base.position.set(0, 5, 0); g.add(base)
    for (const tz of [-180, 180]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(68, 58, 68), brickMat); tower.position.set(0, 29, tz); g.add(tower)
      const dome  = new THREE.Mesh(new THREE.SphereGeometry(34, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), stoneMat)
      dome.position.set(0, 58, tz); g.add(dome)
      for (let face = 0; face < 4; face++) {
        const fa = face * Math.PI / 2
        const win = new THREE.Mesh(new THREE.BoxGeometry(18, 22, 2), glassMat)
        win.position.set(Math.sin(fa) * 35, 36, tz + Math.cos(fa) * 35); win.rotation.y = fa; g.add(win)
      }
    }
    for (let wx = -180; wx <= 180; wx += 28) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(16, 18, 2), glassMat); win.position.set(wx, 30, 40); g.add(win)
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(270, 10, 10), stoneMat); ridge.position.set(0, 57, 0); g.add(ridge)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 六本木ヒルズ森タワー 238m
  private buildRoppongiHills(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const glassTex = makeGlassTex([80, 110, 145])
    const mat    = new THREE.MeshLambertMaterial({ map: glassTex, color: 0x8899aa, emissive: 0x0a1520, emissiveIntensity: 0.4 })
    const neonMat = new THREE.MeshLambertMaterial({ color: 0xff3300, emissive: 0xff1100, emissiveIntensity: 1.5 })
    const annexMat = new THREE.MeshLambertMaterial({ color: 0x333344, emissive: 0x11112a, emissiveIntensity: 0.2 })
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(115, 150, 100), mat); b1.position.y = 75; g.add(b1)
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(100, 100,  86), mat); b2.position.y = 200; g.add(b2)
    const b3 = new THREE.Mesh(new THREE.BoxGeometry( 80,  50,  70), mat); b3.position.y = 275; g.add(b3)
    const b4 = new THREE.Mesh(new THREE.BoxGeometry( 60,  18,  52), mat); b4.position.y = 309; g.add(b4)
    const band = new THREE.Mesh(new THREE.BoxGeometry(117, 5, 102), neonMat); band.position.y = 151; g.add(band)
    const ann1 = new THREE.Mesh(new THREE.BoxGeometry(100, 38, 64), annexMat); ann1.position.set(100, 19, 40); g.add(ann1)
    const ann2 = new THREE.Mesh(new THREE.BoxGeometry( 76, 26, 100), annexMat); ann2.position.set(-105, 13, 25); g.add(ann2)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 麻布台ヒルズ 330m — Japan's tallest as of 2023
  private buildAzabudaiHills(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const glassTex = makeGlassTex([100, 140, 160])
    const mat    = new THREE.MeshLambertMaterial({ map: glassTex, color: 0x99bbcc, emissive: 0x081824, emissiveIntensity: 0.5 })
    const neonMat = new THREE.MeshLambertMaterial({ color: 0x00ccff, emissive: 0x0099cc, emissiveIntensity: 1.8 })
    const podMat  = new THREE.MeshLambertMaterial({ color: 0x2a3a44, emissive: 0x0a1218, emissiveIntensity: 0.2 })
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(85, 170, 72), mat); t1.position.y = 85; g.add(t1)
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(72, 110, 60), mat); t2.position.y = 225; g.add(t2)
    const t3 = new THREE.Mesh(new THREE.BoxGeometry(56,  90, 46), mat); t3.position.y = 325; g.add(t3)
    // Cyan crown
    for (const yp of [255, 340, 365]) {
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(78, 4, 4), neonMat); r1.position.set(0, yp,  34); g.add(r1)
      const r2 = new THREE.Mesh(new THREE.BoxGeometry(78, 4, 4), neonMat); r2.position.set(0, yp, -34); g.add(r2)
    }
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(120, 62, 52), podMat); p1.position.set(80, 31, 0); g.add(p1)
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(62, 44, 120), podMat); p2.position.set(0, 22, 90); g.add(p2)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 国会議事堂 — stone pyramid center
  private buildDietBuilding(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xc8c0a8, emissive: 0x18160e, emissiveIntensity: 0.15 })
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x888070, emissive: 0x0e0e0a, emissiveIntensity: 0.1 })
    const main = new THREE.Mesh(new THREE.BoxGeometry(210, 38, 130), stoneMat); main.position.set(0, 19, 0); g.add(main)
    const lw = new THREE.Mesh(new THREE.BoxGeometry(90, 70, 90), stoneMat); lw.position.set(-105, 35, 0); g.add(lw)
    const lt = new THREE.Mesh(new THREE.BoxGeometry(65, 20, 65), stoneMat); lt.position.set(-105, 80, 0); g.add(lt)
    const rw = new THREE.Mesh(new THREE.BoxGeometry(90, 70, 90), stoneMat); rw.position.set( 105, 35, 0); g.add(rw)
    const rt = new THREE.Mesh(new THREE.BoxGeometry(65, 20, 65), stoneMat); rt.position.set( 105, 80, 0); g.add(rt)
    const ct = new THREE.Mesh(new THREE.BoxGeometry(58, 76, 58), stoneMat); ct.position.set(0, 76, 0); g.add(ct)
    const ps = new THREE.Mesh(new THREE.BoxGeometry(54, 26, 54), darkMat);  ps.position.set(0, 127, 0); g.add(ps)
    const pyr = new THREE.Mesh(new THREE.CylinderGeometry(0, 28, 56, 4), stoneMat)
    pyr.position.set(0, 158, 0); pyr.rotation.y = Math.PI / 4; g.add(pyr)
    this.scene.add(g); this.landmarks.push(g)
  }

  // フジテレビ Odaiba — H-frame with titanium sphere
  private buildFujiTV(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const concMat   = new THREE.MeshLambertMaterial({ color: 0xb8b8c0, emissive: 0x101018, emissiveIntensity: 0.2 })
    const sphereMat = new THREE.MeshLambertMaterial({ color: 0xaac0d0, emissive: 0x2244aa, emissiveIntensity: 0.5 })
    const neonMat   = new THREE.MeshLambertMaterial({ color: 0x00aaff, emissive: 0x0077cc, emissiveIntensity: 1.5 })
    for (const xo of [-55, 55]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(26, 130, 26), concMat); leg.position.set(xo, 65, 0); g.add(leg)
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(136, 26, 100), concMat); beam.position.set(0, 120, 0); g.add(beam)
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(38, 16, 12), sphereMat); sphere.position.set(0, 150, 0); g.add(sphere)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const ring = new THREE.Mesh(new THREE.BoxGeometry(2, 76, 2), new THREE.MeshLambertMaterial({ color: 0x606070 }))
      ring.position.set(Math.cos(a) * 38, 150, Math.sin(a) * 38); g.add(ring)
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(160, 46, 120), concMat); base.position.set(0, 23, 0); g.add(base)
    const neonBar = new THREE.Mesh(new THREE.BoxGeometry(138, 4, 4), neonMat); neonBar.position.set(0, 134, 52); g.add(neonBar)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 浅草寺 5-story pagoda + Kaminarimon gate
  private buildSensoji(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const roofMat   = new THREE.MeshLambertMaterial({ color: 0x1a5c1a, emissive: 0x051505, emissiveIntensity: 0.2 })
    const wallMat   = new THREE.MeshLambertMaterial({ color: 0xcc4400, emissive: 0x330a00, emissiveIntensity: 0.2 })
    const goldMat   = new THREE.MeshLambertMaterial({ color: 0xffcc00, emissive: 0xaa8800, emissiveIntensity: 0.8 })
    const gateMat   = new THREE.MeshLambertMaterial({ color: 0xcc2200, emissive: 0x330600, emissiveIntensity: 0.3 })
    const lanternMat = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 1.5 })
    let curY = 0
    for (const [fw, fh] of [[52, 22], [44, 20], [36, 18], [29, 16], [22, 14]] as [number, number][]) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fw), wallMat); body.position.y = curY + fh / 2; g.add(body)
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, fw * 0.75, fh * 0.65, 4), roofMat)
      roof.position.y = curY + fh; roof.rotation.y = Math.PI / 4; g.add(roof)
      curY += fh + fh * 0.65
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3.2, 32, 6), goldMat); spire.position.y = curY + 16; g.add(spire)
    // Main hall
    const hall = new THREE.Mesh(new THREE.BoxGeometry(78, 26, 52), wallMat); hall.position.set(0, 13, -80); g.add(hall)
    const hRoof = new THREE.Mesh(new THREE.CylinderGeometry(0, 52, 20, 4), roofMat)
    hRoof.position.set(0, 36, -80); hRoof.rotation.y = Math.PI / 4; g.add(hRoof)
    // Kaminarimon gate
    for (const xo of [-26, 26]) {
      const gp = new THREE.Mesh(new THREE.BoxGeometry(7, 32, 7), gateMat); gp.position.set(xo, 16, -140); g.add(gp)
    }
    const gbeam = new THREE.Mesh(new THREE.BoxGeometry(66, 8, 10), gateMat); gbeam.position.set(0, 33, -140); g.add(gbeam)
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(5, 8, 6), lanternMat); lantern.position.set(0, 27, -140); g.add(lantern)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 皇居 Imperial Palace compound with moat, walls, palace
  private createImperialPalace(): void {
    const X = -500, Z = 80
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const parkMat = new THREE.MeshLambertMaterial({ color: 0x2d5a1e, emissive: 0x0a1a08, emissiveIntensity: 0.15 })
    const park = new THREE.Mesh(new THREE.BoxGeometry(700, 3, 560), parkMat)
    park.position.set(X, gy + 1.5, Z); this.scene.add(park); this.deco.push(park)
    const moatMat = new THREE.MeshLambertMaterial({
      color: 0x0a2030, emissive: 0x000c18, emissiveIntensity: 0.4,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    })
    for (const [mx, mz, mw, md] of [
      [X, Z - 308, 730, 44], [X, Z + 308, 730, 44],
      [X - 378, Z, 44, 572], [X + 378, Z, 44, 572],
    ] as [number, number, number, number][]) {
      const moat = new THREE.Mesh(new THREE.BoxGeometry(mw, 2, md), moatMat)
      moat.position.set(mx, gy + 0.8, mz); this.scene.add(moat); this.deco.push(moat)
    }
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x888070, emissive: 0x0e0e0a, emissiveIntensity: 0.1 })
    for (const [wx, wz, ww, wd, wh] of [
      [X, Z - 280, 680, 10, 22], [X, Z + 280, 680, 10, 22],
      [X - 340, Z, 10, 530, 22], [X + 340, Z, 10, 530, 22],
    ] as [number, number, number, number, number][]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), wallMat)
      wall.position.set(wx, gy + wh / 2 + 2, wz); this.scene.add(wall); this.landmarks.push(wall)
    }
    const palMat  = new THREE.MeshLambertMaterial({ color: 0xe8e0d0, emissive: 0x1a1810, emissiveIntensity: 0.15 })
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a5a3a, emissive: 0x0a120a, emissiveIntensity: 0.2 })
    const palace = new THREE.Mesh(new THREE.BoxGeometry(140, 22, 80), palMat)
    palace.position.set(X, gy + 13, Z); this.scene.add(palace); this.landmarks.push(palace)
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 80, 24, 4), roofMat)
    roof.position.set(X, gy + 35, Z); roof.rotation.y = Math.PI / 4; this.scene.add(roof); this.deco.push(roof)
  }

  // レインボーブリッジ — Shibaura to Odaiba (correct position)
  // Shibaura: (900, 700) → Odaiba: (1700, 1400)
  private buildRainbowBridge(): void {
    const x1 = 900, z1 = 700, x2 = 1700, z2 = 1400
    const DECK_Y = 55, TOWER_H = 140
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.hypot(dx, dz)
    const angle = Math.atan2(dx, dz)
    const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2
    const concMat  = new THREE.MeshLambertMaterial({ color: 0xc0c0c8, emissive: 0x101018, emissiveIntensity: 0.15 })
    const cableMat = new THREE.MeshLambertMaterial({ color: 0xd0d0d8, emissive: 0x181820, emissiveIntensity: 0.2 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 })
    // Bridge deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len + 300, 6, 28), concMat)
    deck.position.set(midX, DECK_Y + 3, midZ); deck.rotation.y = -angle
    this.scene.add(deck); this.deco.push(deck)
    // Neon edge rails
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 300, 2, 1.2), neonMat)
      rail.position.set(midX + Math.cos(angle) * side * 14, DECK_Y + 6.5, midZ - Math.sin(angle) * side * 14)
      rail.rotation.y = -angle; this.scene.add(rail); this.deco.push(rail)
    }
    // Suspension towers
    for (const t of [0.28, 0.72]) {
      const tx = x1 + dx * t, tz = z1 + dz * t
      const tgy = NeoTokyoMapSystem.heightAt(tx, tz)
      const towG = new THREE.Group(); towG.position.set(tx, tgy, tz)
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(9, TOWER_H, 9), concMat)
        leg.position.set(side * 15, TOWER_H / 2, 0); towG.add(leg)
      }
      for (const yp of [TOWER_H * 0.5, TOWER_H * 0.8]) {
        const xb = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 9), concMat); xb.position.set(0, yp, 0); towG.add(xb)
      }
      for (const side of [-1, 1]) {
        const top = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 4),
          new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3.0 }))
        top.position.set(side * 15, TOWER_H + 5, 0); towG.add(top)
      }
      this.scene.add(towG); this.landmarks.push(towG)
    }
    // Suspension cables
    const cPts: Array<[[number, number, number], [number, number, number]]> = [
      [[x1 + dx * 0.28, DECK_Y + TOWER_H, z1 + dz * 0.28], [x1, DECK_Y, z1]],
      [[x1 + dx * 0.28, DECK_Y + TOWER_H, z1 + dz * 0.28], [midX, DECK_Y, midZ]],
      [[x1 + dx * 0.72, DECK_Y + TOWER_H, z1 + dz * 0.72], [midX, DECK_Y, midZ]],
      [[x1 + dx * 0.72, DECK_Y + TOWER_H, z1 + dz * 0.72], [x2, DECK_Y, z2]],
    ]
    for (const [from, to] of cPts) {
      const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2])
      const cLen = dir.length()
      const q = new THREE.Quaternion(); q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
      const cable = new THREE.Mesh(new THREE.BoxGeometry(4, cLen, 4), cableMat)
      cable.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2)
      cable.quaternion.copy(q); this.scene.add(cable); this.deco.push(cable)
    }
  }

  // 山手線 elevated loop
  private createYamanoteLine(): void {
    const TRACK_Y = 16
    const deckMat   = new THREE.MeshLambertMaterial({ color: 0x2a2a30, emissive: 0x080810, emissiveIntensity: 0.2 })
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x606068, emissive: 0x0a0a0e, emissiveIntensity: 0.1 })
    const railMat   = new THREE.MeshLambertMaterial({ color: 0xaaaaaa, emissive: 0x181818, emissiveIntensity: 0.3 })
    const trainMat  = new THREE.MeshLambertMaterial({ color: 0x4dbd00, emissive: 0x1a4000, emissiveIntensity: 0.5 })
    const winMat    = new THREE.MeshLambertMaterial({ color: 0x88ccff, emissive: 0x2244aa, emissiveIntensity: 0.5 })
    const WP = YAMANOTE_WP
    for (let i = 0; i < WP.length - 1; i++) {
      const a = WP[i], b = WP[i + 1]
      const sdx = b.x - a.x, sdz = b.z - a.z
      const segLen = Math.hypot(sdx, sdz)
      if (segLen < 1) continue
      const ang = Math.atan2(sdx, sdz)
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2
      const gy = NeoTokyoMapSystem.heightAt(mx, mz)
      const elevY = gy + TRACK_Y
      const tg = new THREE.Group(); tg.position.set(mx, elevY, mz); tg.rotation.y = -ang
      tg.add(new THREE.Mesh(new THREE.BoxGeometry(segLen, 5, 18), deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen, 1.5, 1.8), railMat)
        rail.position.set(0, 3, side * 5); tg.add(rail)
      }
      this.scene.add(tg); this.deco.push(tg)
      const nP = Math.max(1, Math.ceil(segLen / 250))
      for (let p = 0; p <= nP; p++) {
        const t = p / nP
        const px = a.x + sdx * t, pz = a.z + sdz * t
        const pgy = NeoTokyoMapSystem.heightAt(px, pz)
        const pilH = TRACK_Y + gy - pgy + 1
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(5, pilH, 5), pillarMat)
        pillar.position.set(px, pgy + pilH / 2, pz); this.scene.add(pillar); this.deco.push(pillar)
      }
    }
    // Parked green trains
    for (const [tx, tz, ra] of [[-2000, -100, 0.4], [500, -1600, 1.2]] as [number, number, number][]) {
      const gy = NeoTokyoMapSystem.heightAt(tx, tz)
      const body = new THREE.Mesh(new THREE.BoxGeometry(150, 5, 5), trainMat)
      body.position.set(tx, gy + TRACK_Y + 5, tz); body.rotation.y = ra
      this.scene.add(body); this.deco.push(body)
      const wins = new THREE.Mesh(new THREE.BoxGeometry(140, 2, 0.6), winMat)
      wins.position.set(tx, gy + TRACK_Y + 6.5, tz); wins.rotation.y = ra
      this.scene.add(wins); this.deco.push(wins)
    }
  }

  // ===== METROPOLITAN EXPRESSWAY =====

  private createHighways(): void {
    const hwyTex = makeHwyTex(); hwyTex.repeat.set(1, 5)
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x141420, map: hwyTex })
    const pMat    = new THREE.MeshLambertMaterial({ color: 0x1c1c28 })
    const railMat = new THREE.MeshLambertMaterial({ color: 0x0088cc, emissive: 0x0055aa, emissiveIntensity: 0.8 })
    // Inner loop r=800m, outer r=1800m
    this.buildHwyRing(800,  42, 22, 4, 28, deckMat, pMat, railMat)
    this.buildHwyRing(1800, 62, 24, 4, 40, deckMat, pMat, railMat)
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const cos = Math.cos(a), sin = Math.sin(a)
      const sg = new THREE.Group()
      sg.position.set(cos * 1300, 52, sin * 1300); sg.rotation.y = -a + Math.PI / 2
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(1000, 4, 22), deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1000, 2.5, 1.2), railMat)
        rail.position.set(0, 3, 10.5 * side); sg.add(rail)
      }
      this.scene.add(sg); this.deco.push(sg)
      for (let p = 0; p < 5; p++) {
        const pr = 800 + (p + 0.5) * 200
        const pl = new THREE.Mesh(new THREE.BoxGeometry(5, 52, 5), pMat)
        pl.position.set(cos * pr, 26, sin * pr); this.scene.add(pl); this.deco.push(pl)
      }
    }
  }

  private buildHwyRing(R: number, Y: number, roadW: number, deckH: number, N: number,
    deckMat: THREE.Material, pMat: THREE.Material, railMat: THREE.Material): void {
    for (let i = 0; i < N; i++) {
      const am = ((i + 0.5) / N) * Math.PI * 2
      const len = 2 * R * Math.sin(Math.PI / N) + 0.5
      const seg = new THREE.Group()
      seg.position.set(Math.cos(am) * R, Y, Math.sin(am) * R); seg.rotation.y = -am + Math.PI / 2
      seg.add(new THREE.Mesh(new THREE.BoxGeometry(len, deckH, roadW), deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 1.2), railMat)
        rail.position.set(0, (deckH + 2.5) / 2, (roadW / 2 - 0.6) * side); seg.add(rail)
      }
      this.scene.add(seg); this.deco.push(seg)
      if (i % 5 === 0) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(6, Y, 6), pMat)
        pl.position.set(Math.cos(am) * R, Y / 2, Math.sin(am) * R); this.scene.add(pl); this.deco.push(pl)
      }
    }
  }

  // ===== HOLOGRAMS + NEON ROAD GRID =====

  private createHolograms(): void {
    // Redesign: 5 large holograms at key districts (reduced from 7)
    const holograms = [
      { x: 0, z: 0, w: 300, h: 180, alt: 600, c: 0x0066ff },  // Tokyo Station
      { x: -2000, z: 0, w: 280, h: 170, alt: 500, c: 0x00ffcc },  // Shinjuku
      { x: -1500, z: 1000, w: 260, h: 150, alt: 400, c: 0xff00aa },  // Shibuya
      { x: 1600, z: -1400, w: 240, h: 140, alt: 700, c: 0x00ff88 },  // Skytree
      { x: 2000, z: 2000, w: 280, h: 160, alt: 350, c: 0x00ddff },  // Odaiba
    ]
    for (const holo of holograms) {
      const gy = NeoTokyoMapSystem.heightAt(holo.x, holo.z)
      const mat = new THREE.MeshLambertMaterial({ color: holo.c, emissive: new THREE.Color(holo.c), emissiveIntensity: 2.5, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      const board = new THREE.Mesh(new THREE.PlaneGeometry(holo.w, holo.h), mat)
      board.position.set(holo.x, gy + holo.alt, holo.z); this.scene.add(board); this.deco.push(board)
      const beamMat = new THREE.MeshLambertMaterial({ color: holo.c, emissive: new THREE.Color(holo.c), emissiveIntensity: 1.5, transparent: true, opacity: 0.1 })
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(20, 25, holo.alt, 16), beamMat)
      beam.position.set(holo.x, gy + holo.alt / 2, holo.z); this.scene.add(beam); this.deco.push(beam)
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 3, 16), new THREE.MeshLambertMaterial({ color: holo.c, emissive: new THREE.Color(holo.c), emissiveIntensity: 2.0 }))
      disc.position.set(holo.x, gy + 1.5, holo.z); this.scene.add(disc); this.deco.push(disc)
    }
    // Neon road grid — keep water clear to avoid shimmer over bay/river surfaces
    const neonMat = new THREE.MeshLambertMaterial({ color: 0x00aacc, emissive: 0x006688, emissiveIntensity: 0.5 })
    for (let x = -6000; x <= 6000; x += 1200) {
      this.addNeonRoadSegment(x, -6000, x, 6000, neonMat)
    }
    for (let z = -6000; z <= 6000; z += 1200) {
      this.addNeonRoadSegment(-6000, z, 6000, z, neonMat)
    }
  }

  private addNeonRoadSegment(x1: number, z1: number, x2: number, z2: number, mat: THREE.Material): void {
    const STEPS = 48
    let start: number | null = null
    const dx = x2 - x1, dz = z2 - z1
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS
      const x = x1 + dx * t, z = z1 + dz * t
      const blocked = isInWaterArea(x, z) || isInLandmarkZone(x, z, 80)
      if (!blocked && start === null) start = t
      if ((blocked || i === STEPS) && start !== null) {
        const end = blocked ? (i - 1) / STEPS : t
        if (end > start) {
          const sx = x1 + dx * start, sz = z1 + dz * start
          const ex = x1 + dx * end, ez = z1 + dz * end
          const len = Math.hypot(ex - sx, ez - sz)
          if (len > 80) {
            const mx = (sx + ex) / 2, mz = (sz + ez) / 2
            const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 3), mat)
            strip.position.set(mx, NeoTokyoMapSystem.heightAt(mx, mz) + 0.3, mz)
            strip.rotation.y = -Math.atan2(ex - sx, ez - sz) + Math.PI / 2
            this.scene.add(strip); this.deco.push(strip)
          }
        }
        start = null
      }
    }
  }

  private createFlightCorridors(): void {
    const railGeo = new THREE.BoxGeometry(1, 5, 6)
    const markerGeo = new THREE.BoxGeometry(10, 70, 10)
    for (const seg of FLYWAY_SEGMENTS) {
      const dx = seg.x2 - seg.x1
      const dz = seg.z2 - seg.z1
      const len = Math.hypot(dx, dz)
      if (len < 1) continue

      const mx = (seg.x1 + seg.x2) / 2
      const mz = (seg.z1 + seg.z2) / 2
      const angle = -Math.atan2(dz, dx)
      const group = new THREE.Group()
      group.position.set(mx, 0, mz)
      group.rotation.y = angle
      group.name = `FlightCorridor_${seg.name}`

      const laneMat = new THREE.MeshLambertMaterial({
        color: seg.color,
        emissive: new THREE.Color(seg.color),
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide
      })
      const lane = new THREE.Mesh(new THREE.BoxGeometry(len, 1.5, Math.max(44, seg.width * 0.2)), laneMat)
      lane.position.set(0, seg.alt, 0)
      group.add(lane)

      const railMat = new THREE.MeshLambertMaterial({
        color: seg.color,
        emissive: new THREE.Color(seg.color),
        emissiveIntensity: 1.8
      })
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(railGeo, railMat)
        rail.scale.x = len
        rail.position.set(0, seg.alt + 8, side * seg.width * 0.5)
        group.add(rail)
      }

      const gateCount = this.mobile ? Math.min(3, Math.floor(len / 900)) : Math.min(7, Math.floor(len / 520))
      const gateMat = new THREE.MeshLambertMaterial({
        color: seg.color,
        emissive: new THREE.Color(seg.color),
        emissiveIntensity: 1.4,
        transparent: true,
        opacity: 0.64,
        depthWrite: false
      })
      for (let i = 1; i <= gateCount; i++) {
        const offset = -len / 2 + (len * i) / (gateCount + 1)
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(58, seg.width * 0.18), 6, 8, 32), gateMat)
        ring.position.set(offset, seg.alt + 18, 0)
        ring.rotation.y = Math.PI / 2
        group.add(ring)

        for (const side of [-1, 1]) {
          const marker = new THREE.Mesh(markerGeo, gateMat)
          marker.position.set(offset, seg.alt + 4, side * seg.width * 0.5)
          group.add(marker)
        }
      }

      this.scene.add(group)
      this.deco.push(group)
    }
    console.log(`[NEO Tokyo] Created ${FLYWAY_SEGMENTS.length} flight corridors`)
  }

  // ===== WATER =====

  private createWater(): void {
    const wMat = new THREE.MeshLambertMaterial({
      color: 0x05101e, emissive: 0x000c18, emissiveIntensity: 0.3,
      transparent: true, opacity: 0.92,
    })
    // Tokyo Bay (large, southeast)
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(10000, 8000), wMat)
    bay.rotation.x = -Math.PI / 2; bay.position.set(2500, WATER_LEVEL, 5500)
    this.scene.add(bay); this.deco.push(bay)
    // Inner bay near Odaiba/Shibaura
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(3000, 2000), wMat)
    inner.rotation.x = -Math.PI / 2; inner.position.set(1500, WATER_LEVEL + 0.02, 2200); this.scene.add(inner); this.deco.push(inner)
    // Sumida River (north-south through east Tokyo)
    const sumida = new THREE.Mesh(new THREE.PlaneGeometry(90, 8000), wMat)
    sumida.rotation.x = -Math.PI / 2; sumida.position.set(1100, WATER_LEVEL + 0.04, -1000); this.scene.add(sumida); this.deco.push(sumida)
    // Kanda/Tama rivers
    const kanda = new THREE.Mesh(new THREE.PlaneGeometry(60, 5000), wMat)
    kanda.rotation.x = -Math.PI / 2; kanda.position.set(-1500, WATER_LEVEL + 0.06, 500); this.scene.add(kanda); this.deco.push(kanda)
    // Arakawa river (far east)
    const arakawa = new THREE.Mesh(new THREE.PlaneGeometry(120, 8000), wMat)
    arakawa.rotation.x = -Math.PI / 2; arakawa.position.set(2600, WATER_LEVEL + 0.08, -500); this.scene.add(arakawa); this.deco.push(arakawa)
  }

  private buildMast(x: number, z: number, radius: number, h: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.06, radius * 0.22, h, 6),
      new THREE.MeshLambertMaterial({ color: 0x707080 }))
    shaft.position.set(x, gy + h / 2, z); this.scene.add(shaft); this.landmarks.push(shaft)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.28, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xff1100, emissive: 0xff1100, emissiveIntensity: 3.5 }))
    beacon.position.set(x, gy + h, z); this.scene.add(beacon); this.landmarks.push(beacon)
  }
}
