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
      const inW = cx > 0.18 && cx < 0.82 && cy > 0.18 && cy < 0.72
      const neonStrip = cy > 0.88 && cy < 0.96 && sr(row * 4.2 + col * 6.1) > 0.68
      const bright = sr(row * 7.1 + col * 3.3) > 0.78
      const halfLit = sr(row * 1.7 + col * 9.1) > 0.58
      const signage = col % 5 === 0 && cy > 0.12 && cy < 0.9 && sr(row * 3.9 + col) > 0.82
      let r: number, g: number, b: number
      if (neonStrip) {
        r = win[0]; g = win[1]; b = win[2]
      } else if (signage) {
        r = Math.min(255, win[0] + 20); g = Math.min(255, win[1] + 20); b = Math.min(255, win[2] + 20)
      } else if (inW && bright) {
        r = Math.min(255, win[0] * 0.72 + 26); g = Math.min(255, win[1] * 0.72 + 26); b = Math.min(255, win[2] * 0.72 + 26)
      } else if (inW && halfLit) {
        r = Math.min(255, win[0] * 0.24 + bg[0]); g = Math.min(255, win[1] * 0.24 + bg[1]); b = Math.min(255, win[2] * 0.24 + bg[2])
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

interface UrbanCanyon {
  x1: number
  z1: number
  x2: number
  z2: number
  width: number
}

export interface TubeCorridor {
  x1: number
  z1: number
  x2: number
  z2: number
  y: number
  innerRadius: number
  outerRadius: number
  entrySpacing: number
  entryLength: number
}

export interface RingTubeCorridor {
  x: number
  z: number
  radius: number
  y: number
  innerRadius: number
  outerRadius: number
  entryAngleSpacing: number
  entryAngle: number
}

interface LandmarkZone {
  name: string
  x: number
  z: number
  r: number
  minTowerDistance?: number
}

const WATER_LEVEL = 1.2

const TUBE_CORRIDOR_LAYOUT: TubeCorridor[] = [
  { x1: -3300, z1: -980, x2: 900, z2: -980, y: 540, innerRadius: 88, outerRadius: 126, entrySpacing: 760, entryLength: 210 },
  { x1: 900, z1: -980, x2: 2500, z2: 650, y: 540, innerRadius: 92, outerRadius: 132, entrySpacing: 720, entryLength: 210 },
  { x1: -3300, z1: 760, x2: 2500, z2: 760, y: 445, innerRadius: 86, outerRadius: 124, entrySpacing: 820, entryLength: 230 },
]

const LANDMARK_ZONES: LandmarkZone[] = [
  { name: 'Tokyo Station', x: 30, z: 20, r: 720, minTowerDistance: 980 },
  { name: 'Imperial Palace', x: -500, z: 80, r: 900, minTowerDistance: 1150 },
  { name: 'Tokyo Tower', x: -600, z: 800, r: 560, minTowerDistance: 820 },
  { name: 'Skytree', x: 1600, z: -1400, r: 620, minTowerDistance: 900 },
  { name: 'Rainbow Bridge', x: 1560, z: 1450, r: 1060, minTowerDistance: 1220 },
  { name: 'Odaiba', x: 2000, z: 2000, r: 740, minTowerDistance: 980 },
  { name: 'Sensoji', x: 1500, z: -1500, r: 440, minTowerDistance: 720 },
  { name: 'Roppongi', x: -930, z: 980, r: 520, minTowerDistance: 780 },
  { name: 'Shinjuku', x: -2000, z: -200, r: 780, minTowerDistance: 980 },
]

const URBAN_CANYONS: UrbanCanyon[] = [
  { x1: -900, z1: -3400, x2: -180, z2: -860, width: 330 },
  { x1: -180, z1: -860, x2: 260, z2: 220, width: 300 },
  { x1: 260, z1: 220, x2: -600, z2: 800, width: 260 },
  { x1: -2400, z1: -420, x2: -1450, z2: 820, width: 270 },
  { x1: 1600, z1: -1400, x2: 1300, z2: 1050, width: 310 },
  { x1: 760, z1: 520, x2: 2320, z2: 2300, width: 520 },
]

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function smooth01(v: number): number {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}

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

function isInUrbanCanyon(x: number, z: number, extra = 0): boolean {
  return URBAN_CANYONS.some(canyon => distToSegment2D(x, z, canyon.x1, canyon.z1, canyon.x2, canyon.z2) < canyon.width / 2 + extra)
}

function isInTubeReserve(x: number, z: number, extra = 0): boolean {
  return TUBE_CORRIDOR_LAYOUT.some(tube => distToSegment2D(x, z, tube.x1, tube.z1, tube.x2, tube.z2) < tube.outerRadius + extra)
}

function districtAngle(x: number, z: number): number {
  if (x > 700 && z > 700) return Math.PI / 4
  if (x < -900 && z > 250) return -Math.PI / 4
  if (x < -1300 && z < 300) return Math.PI / 2
  if (Math.abs(x) < 1200 && Math.abs(z) < 1300) return 0
  return Math.abs(x) > Math.abs(z) ? Math.PI / 2 : 0
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
  const bridgeApproach = distToSegment2D(x, z, 620, 520, 2500, 2380) < 240
  return (tokyoBay || sumida || kanda || arakawa) && !odaibaIsland && !bridgeApproach
}

// NEO Tokyo 2077 palette — dark wet steel, cyan/magenta signage, sparse amber traffic
const BTYPE = [
  { bg: [4,  8, 14] as RGB, win: [55,  210, 255] as RGB, cols: 9, rows: 24, em: 0x1688ff },
  { bg: [5,  7, 12] as RGB, win: [180, 205, 255] as RGB, cols: 11, rows: 28, em: 0x3355ff },
  { bg: [9,  4, 10] as RGB, win: [255,  45, 175] as RGB, cols: 7, rows: 20, em: 0xff2299 },
  { bg: [3,  8, 12] as RGB, win: [255, 125,  35] as RGB, cols: 10, rows: 18, em: 0xff6a22 },
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
  private tubeCorridors: TubeCorridor[] = []
  private ringTubeCorridors: RingTubeCorridor[] = []

  constructor(scene: THREE.Scene, isMobile = false) {
    this.scene = scene
    this.mobile = isMobile
  }

  async initialize(): Promise<void> {
    this.createTerrain()
    this.createUrbanFabric()
    this.createBuildings()
    this.createVariedBuildings()
    if (!this.mobile) {
      this.createLayeredSkyCity()
      this.createChunkyMegaBlocks()
      this.createHeroTowers()
      this.createDistantSkyline()
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
    this.createHolograms()
    this.createWater()
  }

  // Tokyo topography: Musashino Plateau (west, high), CBD (center), Bay (east-south, low)
  // Scale: 1 unit ≈ 3m real. Gaussian bumps approximate real Tokyo elevation.
  static heightAt(x: number, z: number): number {
    if (isInWaterArea(x, z)) return WATER_LEVEL - 3

    let h = 10 - x * 0.0028
    h += 28 * Math.exp(-((x + 2200) ** 2 / 6000000 + (z + 150) ** 2 / 4000000))
    h += 20 * Math.exp(-((x + 1150) ** 2 / 2200000 + (z - 900) ** 2 / 1700000))
    h += 14 * Math.exp(-((x - 300) ** 2 / 1600000 + (z + 1500) ** 2 / 1400000))
    h += 8 * Math.exp(-((x + 450) ** 2 / 1400000 + (z - 40) ** 2 / 1200000))
    h -= 18 * Math.exp(-((x - 2100) ** 2 / 4200000 + (z - 2100) ** 2 / 3400000))
    h += Math.sin(x * 0.0014) * Math.cos(z * 0.0018) * 4
    h += Math.sin((x + z) * 0.0012 + 0.9) * 3

    const bayDrop = z - 4000
    if (bayDrop > 0) h -= bayDrop * 0.006
    return Math.max(0, h)
  }

  getTerrainHeight(x: number, z: number): number { return NeoTokyoMapSystem.heightAt(x, z) }
  getSafeSpawnPosition(): { x: number; y: number; z: number } { return { x: -900, y: 560, z: -2650 } }

  // InstancedMesh excluded: Box3.setFromObject(instancedMesh) returns a box covering
  // ALL instances (the entire city), causing false collision hits in building gaps.
  getCollisionObjects(): THREE.Object3D[] {
    return [...this.landmarks, ...this.buildingColliders]
  }

  getTubeCorridors(): TubeCorridor[] {
    return this.tubeCorridors
  }

  getRingTubeCorridors(): RingTubeCorridor[] {
    return this.ringTubeCorridors
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
    this.tubeCorridors.length = 0
    this.ringTubeCorridors.length = 0
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
      const y = NeoTokyoMapSystem.heightAt(x, z)
      pos[i + 1] = y
      // 600m road grid pattern
      const rx = ((x % 600) + 600) % 600, rz = ((z % 600) + 600) % 600
      const dR = Math.min(Math.min(rx, 600 - rx), Math.min(rz, 600 - rz))
      let r: number, g: number, b: number
      if (isInWaterArea(x, z)) {
        r = 0.015; g = 0.035; b = 0.065
      } else if (dR < 55) {
        const wet = 0.9 + sr(i * 0.009) * 0.16
        r = 0.035 * wet; g = 0.045 * wet; b = 0.065 * wet
      } else if (dR < 65) {
        r = 0.08; g = 0.065; b = 0.08
      } else {
        const wet = 0.75 + sr(i * 0.017) * 0.2
        const low = 1 - smooth01(y / 55)
        r = 0.045 * wet + low * 0.014
        g = 0.052 * wet + low * 0.012
        b = 0.068 * wet + low * 0.018
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

  private createUrbanFabric(): void {
    const podiumMat = new THREE.MeshLambertMaterial({ color: 0x101620, emissive: 0x0a1522, emissiveIntensity: 0.45 })
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x182233, emissive: 0x0d2238, emissiveIntensity: 0.55 })
    const cyanMat = new THREE.MeshLambertMaterial({ color: 0x2ddcff, emissive: 0x00aaff, emissiveIntensity: 1.35 })
    const amberMat = new THREE.MeshLambertMaterial({ color: 0xff8a26, emissive: 0xff5a10, emissiveIntensity: 1.1 })

    for (let ix = -5; ix <= 5; ix++) {
      for (let iz = -5; iz <= 5; iz++) {
        const x = ix * 640 + (sr(ix * 3.1 + iz) - 0.5) * 52
        const z = iz * 640 + (sr(ix - iz * 4.4) - 0.5) * 52
        if (Math.hypot(x, z) > 4200 || isInWaterArea(x, z) || isInLandmarkZone(x, z, 360) || isInUrbanCanyon(x, z, 140) || isInTubeReserve(x, z, 170)) continue
        const gy = NeoTokyoMapSystem.heightAt(x, z)
        const major = sr(ix * 7.3 + iz) > 0.5
        const w = major ? 520 : 380
        const d = major ? 420 : 300
        const h = major ? 64 : 38
        const g = new THREE.Group()
        g.name = 'NeoTokyoUrbanFabric'
        g.position.set(x, gy, z)
        g.rotation.y = districtAngle(x, z)

        const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), podiumMat)
        slab.position.y = h / 2
        g.add(slab)

        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.78, 4, d * 0.72), roofMat)
        roof.position.y = h + 3
        g.add(roof)

        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, 2.5, 3), side > 0 ? cyanMat : amberMat)
          rail.position.set(0, h + 7, side * d * 0.38)
          g.add(rail)
        }

        if (sr(ix + iz * 1.7) > 0.55) {
          const stackH = major ? 88 : 52
          const stack = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, stackH, d * 0.32), roofMat)
          stack.position.set((sr(ix) - 0.5) * w * 0.22, h + stackH / 2, (sr(iz) - 0.5) * d * 0.22)
          g.add(stack)
        }

        this.scene.add(g)
        this.deco.push(g)
      }
    }
  }

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
      let emIntensity = 0.18
      if (t === 0) emIntensity = 0.26
      else if (t === 2) emIntensity = 0.34
      else if (t === 3) emIntensity = 0.28

      const mat = new THREE.MeshLambertMaterial({
        map: textures[t],
        color: 0x9aa8ba,
        emissive: new THREE.Color(BTYPE[t].em),
        emissiveIntensity: emIntensity,
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

    // NEO Tokyo 2077 Redesign: dense vertical city, narrow supertowers, flight-first
    // Target: 100+ readable towers, still sparse enough for flight gaps.

    const canPlaceTower = (x: number, z: number, h: number): boolean => {
      if (isInWaterArea(x, z)) return false
      if (isInUrbanCanyon(x, z, h > 1100 ? 120 : 70)) return false
      if (isInTubeReserve(x, z, h > 1100 ? 260 : 190)) return false
      for (const zone of LANDMARK_ZONES) {
        const minDistance = h > 1000 ? zone.minTowerDistance ?? zone.r : zone.r
        if (Math.hypot(x - zone.x, z - zone.z) < minDistance) return false
      }
      return true
    }

    const hasClearFootprint = (spec: BSpec): boolean => {
      const size = Math.max(spec.w, spec.d)
      return !specs.some(existing => {
        const existingSize = Math.max(existing.w, existing.d)
        const minDistance = size * 0.48 + existingSize * 0.48 + 90
        return Math.hypot(spec.x - existing.x, spec.z - existing.z) < minDistance
      })
    }

    const pushSpec = (spec: BSpec): void => {
      if (hasClearFootprint(spec)) specs.push(spec)
    }

    // District 1: Corporate core supertowers around Marunouchi
    const corePos = [[820, -520], [-980, -520], [980, 520], [-1080, 620], [0, -1080], [420, 980], [-480, 980]]
    for (const [cx, cz] of corePos) {
      const bs = sr(cx * 0.1 + cz * 0.1)
      const h = 1700 + bs * 720
      if (!canPlaceTower(cx, cz, h)) continue
      pushSpec({
        type: 1,
        x: cx,
        z: cz,
        w: 310 + bs * 240,
        d: 280 + bs * 230,
        h,
        ry: districtAngle(cx, cz)
      })
    }

    // District 2: Shinjuku and west-side tower forest
    const shinjukuPos = [[-2950, -420], [-2950, 240], [-2600, -980], [-2350, 560], [-3300, -1080], [-3500, 520]]
    for (const [cx, cz] of shinjukuPos) {
      const bs = sr(cx * 0.1 + cz * 0.1)
      const h = 1150 + bs * 760
      if (!canPlaceTower(cx, cz, h)) continue
      pushSpec({
        type: 0,
        x: cx,
        z: cz,
        w: 250 + bs * 210,
        d: 230 + bs * 200,
        h,
        ry: districtAngle(cx, cz)
      })
    }

    // District 3: Shibuya Neon (southwest) — 8-10 medium towers
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 0.5 + Math.PI * 0.75
      const dist = 1500 + (i % 3) * 300
      const cx = Math.cos(angle) * dist
      const cz = Math.sin(angle) * dist
      const bs = sr(cx * 0.1 + cz * 0.1)
      const h = 760 + bs * 520
      if (!canPlaceTower(cx, cz, h)) continue
      pushSpec({
        type: 2,
        x: cx,
        z: cz,
        w: 210 + bs * 150,
        d: 190 + bs * 145,
        h,
        ry: districtAngle(cx, cz)
      })
    }

    // District 4: Odaiba Platform (southeast) — 5-6 medium
    const odaibaPos = [[1200, 2600], [2800, 2050], [3000, 2500], [1650, 2950], [2700, 1450]]
    for (const [cx, cz] of odaibaPos) {
      const bs = sr(cx * 0.1 + cz * 0.1)
      const h = 520 + bs * 460
      if (!canPlaceTower(cx, cz, h)) continue
      pushSpec({
        type: 3,
        x: cx,
        z: cz,
        w: 260 + bs * 240,
        d: 230 + bs * 220,
        h,
        ry: districtAngle(cx, cz)
      })
    }

    // District 5: metropolitan tower field
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
      for (let r = 1400; r < 4700; r += 500) {
        const cx = Math.cos(a) * r + (sr(a + r) - 0.5) * 160
        const cz = Math.sin(a) * r + (sr(a - r) - 0.5) * 160
        if (sr(cx * 0.01 + cz * 0.01) > 0.72) continue

        const bs = sr(cx * 0.1 + cz * 0.1)
        let type = 1
        if (cx < -1000 && Math.abs(cz) < 800) type = 0  // Shinjuku area
        else if (cx < 0 && cz > 500) type = 2  // Shibuya area
        else if (cx > 1000 && cz > 1000) type = 3  // Odaiba area

        const h = 520 + bs * 780
        if (!canPlaceTower(cx, cz, h)) continue
        pushSpec({
          type,
          x: cx,
          z: cz,
          w: 150 + bs * 160,
          d: 135 + bs * 150,
          h,
          ry: districtAngle(cx, cz)
        })
      }
    }

    console.log(`[NEO Tokyo 2077] Generated ${specs.length} dense skyline towers`)
    return specs
  }

  // ===== MEGA STRUCTURES (Vertical City Infrastructure) =====

  private createChunkyMegaBlocks(): void {
    const blocks: Array<{ x: number; z: number; w: number; d: number; h: number; c: number }> = [
      { x: -520, z: -1420, w: 560, d: 420, h: 820, c: 0x3ddcff },
      { x: 1180, z: -1120, w: 520, d: 480, h: 960, c: 0xff3aa8 },
      { x: -1760, z: 1180, w: 620, d: 380, h: 720, c: 0xff8a26 },
      { x: 2580, z: 1600, w: 680, d: 520, h: 620, c: 0x3ddcff },
      { x: -3300, z: -760, w: 580, d: 520, h: 760, c: 0xff3aa8 },
      { x: 2900, z: -760, w: 470, d: 580, h: 840, c: 0x6ce8ff },
    ]

    for (const b of blocks) {
      if (isInWaterArea(b.x, b.z) || isInLandmarkZone(b.x, b.z, 260) || isInUrbanCanyon(b.x, b.z, 120)) continue
      const gy = NeoTokyoMapSystem.heightAt(b.x, b.z)
      const g = new THREE.Group()
      g.name = 'NeoTokyoMegaBlock'
      g.position.set(b.x, gy, b.z)
      g.rotation.y = districtAngle(b.x, b.z)

      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x111923, emissive: 0x0b1624, emissiveIntensity: 0.55 })
      const glassMat = new THREE.MeshLambertMaterial({ color: 0x18283a, emissive: new THREE.Color(b.c), emissiveIntensity: 0.38 })
      const glowMat = new THREE.MeshLambertMaterial({ color: b.c, emissive: new THREE.Color(b.c), emissiveIntensity: 1.65 })

      const base = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h * 0.34, b.d), bodyMat)
      base.position.y = b.h * 0.17
      g.add(base)

      const mid = new THREE.Mesh(new THREE.CylinderGeometry(b.w * 0.38, b.w * 0.46, b.h * 0.42, 6), glassMat)
      mid.position.y = b.h * 0.55
      mid.rotation.y = Math.PI / 6
      g.add(mid)

      const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.62, b.h * 0.18, b.d * 0.72), bodyMat)
      cap.position.y = b.h * 0.88
      cap.rotation.y = -0.22
      g.add(cap)

      for (const y of [b.h * 0.36, b.h * 0.68, b.h * 0.98]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(b.w, b.d) * 0.37, 5, 6, 36), glowMat)
        ring.position.y = y
        ring.rotation.x = Math.PI / 2
        g.add(ring)
      }

      for (const side of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(12, b.h * 0.84, b.d * 0.08), glowMat)
        fin.position.set(side * b.w * 0.42, b.h * 0.48, 0)
        g.add(fin)
      }

      this.scene.add(g)
      this.landmarks.push(g)
    }
  }

  private createLayeredSkyCity(): void {
    const platformMat = new THREE.MeshLambertMaterial({
      color: 0x141a24,
      emissive: 0x0c1830,
      emissiveIntensity: 0.55
    })
    const railCyan = new THREE.MeshLambertMaterial({ color: 0x3ddcff, emissive: 0x00aaff, emissiveIntensity: 1.6 })
    const railPink = new THREE.MeshLambertMaterial({ color: 0xff3aa8, emissive: 0xff1177, emissiveIntensity: 1.5 })
    const railAmber = new THREE.MeshLambertMaterial({ color: 0xff8a26, emissive: 0xff5a10, emissiveIntensity: 1.4 })

    const central = new THREE.Group()
    central.name = 'NeoTokyoCentralDome'
    const domeBaseY = NeoTokyoMapSystem.heightAt(260, 220)
    central.position.set(260, domeBaseY, 220)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(360, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({
      color: 0x33465c,
      emissive: 0x163a55,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.74,
      depthWrite: false
    }))
    dome.position.y = 88
    central.add(dome)
    for (const y of [110, 170, 235]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(370 + y * 0.25, 5, 8, 72), y === 170 ? railPink : railCyan)
      ring.position.y = y
      ring.rotation.x = Math.PI / 2
      central.add(ring)
    }
    this.scene.add(central)
    this.deco.push(central)

    for (const ring of [
      { r: 1500, y: 420, w: 22, c: railCyan, n: 48 },
      { r: 2450, y: 690, w: 26, c: railPink, n: 64 },
      { r: 3550, y: 980, w: 30, c: railAmber, n: 72 },
    ]) {
      this.buildSkyRing(ring.r, ring.y, ring.w, ring.n, platformMat, ring.c)
    }

    for (const seg of [
      [-3300, -980, 900, -980, 560, railCyan],
      [900, -980, 2500, 650, 560, railCyan],
      [-3300, 760, 2500, 760, 460, railPink],
    ] as [number, number, number, number, number, THREE.Material][]) {
      this.buildSkyway(seg[0], seg[1], seg[2], seg[3], seg[4], 42, platformMat, seg[5])
    }

    for (const seg of [
      [-900, 1500, 2600, 2400, 330, railAmber],
      [1400, -1850, 1400, 1700, 760, railCyan],
      [-3400, -1300, -1500, 760, 640, railPink],
    ] as [number, number, number, number, number, THREE.Material][]) {
      this.buildOpenSkyway(seg[0], seg[1], seg[2], seg[3], seg[4], 24, platformMat, seg[5])
    }

    const spireMat = new THREE.MeshLambertMaterial({ color: 0x101622, emissive: 0x5ac8ff, emissiveIntensity: 1.25 })
    for (const [x, z, h] of [
      [420, -620, 1450],
      [980, -980, 1280],
      [-1250, -760, 1180],
      [-2750, -120, 1360],
      [2100, -1100, 1550],
    ] as [number, number, number][]) {
      if (isInLandmarkZone(x, z, 220) || isInWaterArea(x, z)) continue
      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(12, 46, h, 7), spireMat)
      spire.position.set(x, gy + h / 2, z)
      this.scene.add(spire)
      this.landmarks.push(spire)
    }
  }

  private createHeroTowers(): void {
    const towers: Array<{ x: number; z: number; h: number; w: number; c: number; style: number }> = [
      { x: -420, z: -980, h: 1680, w: 110, c: 0x59d8ff, style: 0 },
      { x: 720, z: -760, h: 1460, w: 120, c: 0xff3aa8, style: 1 },
      { x: -1480, z: 1180, h: 1180, w: 135, c: 0xff7a2a, style: 2 },
      { x: 2420, z: 260, h: 1320, w: 100, c: 0x79f2ff, style: 0 },
      { x: -3120, z: 820, h: 1260, w: 125, c: 0xff3aa8, style: 1 },
      { x: 2920, z: 2140, h: 960, w: 150, c: 0xff8a26, style: 2 },
    ]
    for (const t of towers) {
      if (isInLandmarkZone(t.x, t.z, 220) || isInWaterArea(t.x, t.z) || isInUrbanCanyon(t.x, t.z, 80)) continue
      const gy = NeoTokyoMapSystem.heightAt(t.x, t.z)
      const g = new THREE.Group()
      g.name = 'NeoTokyoHeroTower'
      g.position.set(t.x, gy, t.z)
      g.rotation.y = districtAngle(t.x, t.z)
      const bodyMat = new THREE.MeshLambertMaterial({ color: 0x101722, emissive: 0x08111e, emissiveIntensity: 0.55 })
      const glowMat = new THREE.MeshLambertMaterial({ color: t.c, emissive: new THREE.Color(t.c), emissiveIntensity: 1.7 })
      const glassMat = new THREE.MeshLambertMaterial({
        color: 0x182436,
        emissive: new THREE.Color(t.c),
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.72
      })

      if (t.style === 0) {
        for (let i = 0; i < 4; i++) {
          const sectionH = t.h * (0.31 - i * 0.035)
          const y = t.h * (0.15 + i * 0.235)
          const scale = 1 - i * 0.12
          const block = new THREE.Mesh(new THREE.BoxGeometry(t.w * scale, sectionH, t.w * 0.82 * scale), i % 2 ? glassMat : bodyMat)
          block.position.set((i % 2 ? 18 : -12) * scale, y, 0)
          block.rotation.y = i * 0.28
          g.add(block)
        }
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(4, 16, t.h * 0.28, 7), glowMat)
        mast.position.y = t.h * 1.02
        g.add(mast)
      } else if (t.style === 1) {
        const core = new THREE.Mesh(new THREE.CylinderGeometry(t.w * 0.38, t.w * 0.55, t.h, 8), bodyMat)
        core.position.y = t.h / 2
        g.add(core)
        for (let i = 0; i < 9; i++) {
          const y = 120 + i * (t.h - 260) / 8
          const ring = new THREE.Mesh(new THREE.TorusGeometry(t.w * (0.76 + i * 0.015), 5, 6, 32), glowMat)
          ring.position.y = y
          ring.rotation.x = Math.PI / 2
          ring.rotation.z = i * 0.22
          g.add(ring)
        }
      } else {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(t.w * 0.7, t.w * 0.9, t.h * 0.7, 5), bodyMat)
        base.position.y = t.h * 0.35
        g.add(base)
        const crown = new THREE.Mesh(new THREE.BoxGeometry(t.w * 1.45, t.h * 0.16, t.w * 1.45), glassMat)
        crown.position.y = t.h * 0.78
        crown.rotation.y = Math.PI / 4
        g.add(crown)
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(2, 18, t.h * 0.32, 6), glowMat)
        spire.position.y = t.h * 1.02
        g.add(spire)
      }

      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4
        const strip = new THREE.Mesh(new THREE.BoxGeometry(4, t.h * 0.78, 4), glowMat)
        strip.position.set(Math.cos(a) * t.w * 0.58, t.h * 0.43, Math.sin(a) * t.w * 0.58)
        g.add(strip)
      }

      this.scene.add(g)
      this.landmarks.push(g)
    }
  }

  private createDistantSkyline(): void {
    const mat = new THREE.MeshLambertMaterial({
      color: 0x0d1724,
      emissive: 0x15253a,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.78,
      depthWrite: false
    })
    const glowMat = new THREE.MeshLambertMaterial({ color: 0x274f78, emissive: 0x163c65, emissiveIntensity: 0.8 })
    const geo = new THREE.BoxGeometry(1, 1, 1)
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2
      const r = 6500 + sr(i * 1.9) * 420
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (isInWaterArea(x, z)) continue
      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const h = 180 + sr(i * 4.3) * 560
      const w = 38 + sr(i * 7.2) * 64
      const tower = new THREE.Mesh(geo, mat)
      tower.position.set(x, gy + h / 2, z)
      tower.scale.set(w, h, w * (0.7 + sr(i * 2.1) * 0.6))
      tower.rotation.y = sr(i) * Math.PI
      this.scene.add(tower)
      this.deco.push(tower)
      if (i % 5 === 0) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.15, 8, w * 0.9), glowMat)
        cap.position.set(x, gy + h + 6, z)
        cap.rotation.y = tower.rotation.y
        this.scene.add(cap)
        this.deco.push(cap)
      }
    }
  }

  private buildSkyRing(R: number, Y: number, roadW: number, N: number, _deckMat: THREE.Material, railMat: THREE.Material): void {
    for (let i = 0; i < N; i++) {
      const am = ((i + 0.5) / N) * Math.PI * 2
      const len = 2 * R * Math.sin(Math.PI / N) + 1
      const seg = new THREE.Group()
      seg.position.set(Math.cos(am) * R, Y, Math.sin(am) * R)
      seg.rotation.y = -am + Math.PI / 2
      seg.name = 'NeoTokyoSkyRing'
      seg.add(new THREE.Mesh(new THREE.BoxGeometry(len, 6, roadW), _deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 3, 2), railMat)
        rail.position.set(0, 5, side * roadW * 0.47)
        seg.add(rail)
      }
      this.scene.add(seg)
      this.deco.push(seg)
    }
  }

  private buildOpenSkyway(x1: number, z1: number, x2: number, z2: number, y: number, w: number, deckMat: THREE.Material, railMat: THREE.Material): void {
    const dx = x2 - x1
    const dz = z2 - z1
    const len = Math.hypot(dx, dz)
    if (len < 1) return
    const midX = (x1 + x2) / 2
    const midZ = (z1 + z2) / 2
    const angle = Math.atan2(dx, dz)
    const deck = new THREE.Group()
    deck.name = 'NeoTokyoOpenSkyway'
    deck.position.set(midX, y, midZ)
    deck.rotation.y = -angle
    deck.add(new THREE.Mesh(new THREE.BoxGeometry(len, 6, w), deckMat))
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 3, 2), railMat)
      rail.position.set(0, 5, side * w * 0.46)
      deck.add(rail)
    }
    this.scene.add(deck)
    this.deco.push(deck)
  }

  private buildSkyway(x1: number, z1: number, x2: number, z2: number, y: number, w: number, _deckMat: THREE.Material, railMat: THREE.Material): void {
    const dx = x2 - x1
    const dz = z2 - z1
    const len = Math.hypot(dx, dz)
    if (len < 1) return

    const innerRadius = Math.max(72, w * 1.72)
    const outerRadius = innerRadius + 28
    const entrySpacing = Math.max(860, innerRadius * 10.4)
    const entryLength = Math.max(280, innerRadius * 3.4)
    this.tubeCorridors.push({ x1, z1, x2, z2, y, innerRadius, outerRadius, entrySpacing, entryLength })

    const axis = new THREE.Vector3(dx / len, 0, dz / len)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
    const ringQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
    const shellMat = new THREE.MeshLambertMaterial({
      color: 0x111d2a,
      emissive: 0x0a2238,
      emissiveIntensity: 0.95,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    const glowMat = railMat
    const chunkLen = 220
    let cursor = 0
    while (cursor < len) {
      const slot = (cursor + chunkLen * 0.5) % entrySpacing
      if (slot < entryLength) {
        cursor += chunkLen
        continue
      }
      const actualLen = Math.min(chunkLen, len - cursor)
      const t = (cursor + actualLen * 0.5) / len
      const cx = x1 + dx * t
      const cz = z1 + dz * t
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(outerRadius, outerRadius, actualLen, 28, 1, true), shellMat)
      tube.position.set(cx, y, cz)
      tube.quaternion.copy(q)
      tube.name = 'NeoTokyoFlightTube'
      this.scene.add(tube)
      this.deco.push(tube)

      for (const side of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(5, actualLen, 7), glowMat)
        strip.position.set(cx + Math.cos(Math.atan2(dz, dx) + Math.PI / 2) * side * outerRadius * 0.72, y - outerRadius * 0.52, cz + Math.sin(Math.atan2(dz, dx) + Math.PI / 2) * side * outerRadius * 0.72)
        strip.quaternion.copy(q)
        this.scene.add(strip)
        this.deco.push(strip)
      }
      cursor += actualLen
    }

    const ringCount = Math.max(2, Math.floor(len / 420))
    for (let i = 0; i <= ringCount; i++) {
      const t = i / ringCount
      const d = t * len
      if (d % entrySpacing < entryLength) continue
      const rx = x1 + dx * t
      const rz = z1 + dz * t
      const ring = new THREE.Mesh(new THREE.TorusGeometry(outerRadius + 5, 7, 8, 40), glowMat)
      ring.position.set(rx, y, rz)
      ring.quaternion.copy(ringQ)
      ring.name = 'NeoTokyoTubeRib'
      this.scene.add(ring)
      this.deco.push(ring)
    }

    for (let d = entryLength * 0.5; d < len; d += entrySpacing) {
      const t = d / len
      const ex = x1 + dx * t
      const ez = z1 + dz * t
      const gate = new THREE.Mesh(new THREE.TorusGeometry(innerRadius + 10, 5, 8, 36), glowMat)
      gate.position.set(ex, y, ez)
      gate.quaternion.copy(ringQ)
      gate.name = 'NeoTokyoTubeEntry'
      this.scene.add(gate)
      this.deco.push(gate)
    }
  }

  private createMegaPillars(): void {
    // 12 Mega Pillars — vertical support pillars for NEO Tokyo 2077
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
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x243040, emissive: 0x102040, emissiveIntensity: 0.5 })
    const neonMat = new THREE.MeshLambertMaterial({ color: 0x88ddff, emissive: 0x44aaff, emissiveIntensity: 2.2 })
    this.buildOpenSkyway(-420, 180, 620, 520, 128, 42, deckMat, neonMat)
    this.buildOpenSkyway(2500, 2380, 3320, 3260, 172, 44, deckMat, neonMat)
    this.buildOpenSkyway(1180, 760, 2060, 1640, 236, 30, deckMat, neonMat)
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

  // Rainbow Bridge: enlarged from landmark scenery into a flight route.
  private buildRainbowBridge(): void {
    const x1 = 620, z1 = 520, x2 = 2500, z2 = 2380
    const DECK_Y = 145, TOWER_H = 460
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.hypot(dx, dz)
    const angle = Math.atan2(dx, dz)
    const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2
    const concMat  = new THREE.MeshLambertMaterial({ color: 0xaeb8c4, emissive: 0x152032, emissiveIntensity: 0.32 })
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x182230, emissive: 0x0a1424, emissiveIntensity: 0.55 })
    const cableMat = new THREE.MeshLambertMaterial({ color: 0xd9e8f6, emissive: 0x24445c, emissiveIntensity: 0.45 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0x9beeff, emissive: 0x44cfff, emissiveIntensity: 2.2 })
    const magentaMat = new THREE.MeshLambertMaterial({ color: 0xff55aa, emissive: 0xff2299, emissiveIntensity: 1.8 })
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len + 420, 14, 96), darkMat)
    deck.position.set(midX, DECK_Y + 7, midZ); deck.rotation.y = -angle
    this.scene.add(deck); this.deco.push(deck)
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 440, 5, 4), side > 0 ? neonMat : magentaMat)
      rail.position.set(midX + Math.cos(angle) * side * 49, DECK_Y + 19, midZ - Math.sin(angle) * side * 49)
      rail.rotation.y = -angle; this.scene.add(rail); this.deco.push(rail)
    }
    for (const t of [0.28, 0.72]) {
      const tx = x1 + dx * t, tz = z1 + dz * t
      const tgy = NeoTokyoMapSystem.heightAt(tx, tz)
      const towG = new THREE.Group(); towG.position.set(tx, tgy, tz); towG.rotation.y = -angle
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(24, TOWER_H, 24), concMat)
        leg.position.set(side * 62, TOWER_H / 2, 0); towG.add(leg)
        const spine = new THREE.Mesh(new THREE.BoxGeometry(7, TOWER_H * 0.86, 7), neonMat)
        spine.position.set(side * 62, TOWER_H * 0.48, 18); towG.add(spine)
      }
      for (const yp of [TOWER_H * 0.35, TOWER_H * 0.62, TOWER_H * 0.86]) {
        const xb = new THREE.Mesh(new THREE.BoxGeometry(148, 16, 18), concMat); xb.position.set(0, yp, 0); towG.add(xb)
      }
      for (const side of [-1, 1]) {
        const top = new THREE.Mesh(new THREE.CylinderGeometry(8, 18, 42, 6), side > 0 ? neonMat : magentaMat)
        top.position.set(side * 62, TOWER_H + 20, 0); towG.add(top)
      }
      this.scene.add(towG); this.landmarks.push(towG)
    }
    for (const t of [0.38, 0.5, 0.62]) {
      const gx = x1 + dx * t, gz = z1 + dz * t
      const gate = new THREE.Group()
      gate.position.set(gx, DECK_Y + 78, gz)
      gate.rotation.y = -angle
      const ring = new THREE.Mesh(new THREE.TorusGeometry(78, 5, 8, 42), t === 0.5 ? magentaMat : neonMat)
      ring.rotation.y = Math.PI / 2
      gate.add(ring)
      this.scene.add(gate); this.deco.push(gate)
    }
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
    this.buildHwyRing(800,  42, 22, 4, 28, deckMat, pMat, railMat)
    this.buildHwyRing(1800, 62, 24, 4, 40, deckMat, pMat, railMat)

    const routes: [number, number, number, number, number, number][] = [
      [-4200, -950, 3800, -950, 118, 32],
      [-3600, 760, 3000, 760, 92, 30],
      [760, -2600, 760, 2860, 136, 32],
      [-2780, -1300, -900, 760, 108, 28],
      [620, 520, 2500, 2380, 168, 44],
    ]
    for (const [x1, z1, x2, z2, y, w] of routes) {
      this.buildOpenSkyway(x1, z1, x2, z2, y, w, deckMat, railMat)
      const dx = x2 - x1
      const dz = z2 - z1
      const len = Math.hypot(dx, dz)
      const count = Math.max(2, Math.floor(len / 620))
      for (let i = 1; i < count; i++) {
        const t = i / count
        const px = x1 + dx * t
        const pz = z1 + dz * t
        if (isInWaterArea(px, pz)) continue
        const gy = NeoTokyoMapSystem.heightAt(px, pz)
        const h = Math.max(12, y - gy)
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(7, h, 7), pMat)
        pillar.position.set(px, gy + h / 2, pz)
        this.scene.add(pillar); this.deco.push(pillar)
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
