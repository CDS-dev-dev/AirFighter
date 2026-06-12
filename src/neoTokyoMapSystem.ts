import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

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
      const inW = cx > 0.2 && cx < 0.8 && cy > 0.2 && cy < 0.7
      const band = row % 7 === 2 && cy > 0.74 && cy < 0.88
      const neonStrip = band && sr(row * 4.2 + col * 6.1) > 0.44
      const bright = sr(Math.floor(row / 2) * 7.1 + Math.floor(col / 2) * 3.3) > 0.72
      const halfLit = sr(row * 1.7 + col * 9.1) > 0.5
      const signage = col % 6 === 1 && cy > 0.12 && cy < 0.9 && sr(row * 3.9 + col) > 0.9
      let r: number, g: number, b: number
      if (neonStrip) {
        r = win[0]; g = win[1]; b = win[2]
      } else if (signage) {
        r = Math.min(255, win[0] + 16); g = Math.min(255, win[1] + 16); b = Math.min(255, win[2] + 16)
      } else if (inW && bright) {
        r = Math.min(255, win[0] * 0.54 + 36); g = Math.min(255, win[1] * 0.54 + 36); b = Math.min(255, win[2] * 0.54 + 36)
      } else if (inW && halfLit) {
        r = Math.min(255, win[0] * 0.14 + bg[0]); g = Math.min(255, win[1] * 0.14 + bg[1]); b = Math.min(255, win[2] * 0.14 + bg[2])
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
  y2?: number
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

export interface TubeOpening {
  x: number
  y: number
  z: number
  radius: number
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
  { x1: 1560, z1: 1450, x2: 1320, z2: 1160, y: 360, innerRadius: 170, outerRadius: 230, entrySpacing: 999999, entryLength: 0 },
  { x1: 1320, z1: 1160, x2: 980, z2: 760, y: 760, innerRadius: 170, outerRadius: 230, entrySpacing: 999999, entryLength: 0 },
  { x1: 980, z1: 760, x2: 620, z2: 360, y: 1160, innerRadius: 170, outerRadius: 230, entrySpacing: 999999, entryLength: 0 },
  { x1: 620, z1: 360, x2: 520, z2: -160, y: 1540, innerRadius: 170, outerRadius: 230, entrySpacing: 999999, entryLength: 0 },
]
const YAMANOTE_TUBE_RESERVE = 560

const LANDMARK_ZONES: LandmarkZone[] = [
  { name: 'Tokyo Station', x: 30, z: 20, r: 720, minTowerDistance: 980 },
  { name: 'Imperial Palace', x: -500, z: 80, r: 900, minTowerDistance: 1150 },
  { name: 'Tokyo Tower', x: -420, z: 2140, r: 620, minTowerDistance: 940 },
  { name: 'Skytree', x: 1600, z: -1400, r: 620, minTowerDistance: 900 },
  { name: 'Rainbow Bridge', x: 1560, z: 1450, r: 1060, minTowerDistance: 1220 },
  { name: 'Odaiba', x: 2000, z: 2000, r: 740, minTowerDistance: 980 },
  { name: 'Sensoji', x: 1500, z: -1500, r: 440, minTowerDistance: 720 },
  { name: 'Roppongi', x: -930, z: 980, r: 520, minTowerDistance: 780 },
  { name: 'Shinjuku', x: -2000, z: -200, r: 780, minTowerDistance: 980 },
]

const URBAN_CANYONS: UrbanCanyon[] = [
  { x1: 0, z1: -4400, x2: 0, z2: -1700, width: 1500 },
  { x1: 0, z1: -1700, x2: 160, z2: -1120, width: 1040 },
  { x1: 160, z1: -1120, x2: 940, z2: 520, width: 880 },
  { x1: 940, z1: 520, x2: 1760, z2: 1540, width: 900 },
  { x1: 1760, z1: 1540, x2: -460, z2: 1740, width: 920 },
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

function isSegmentInTubeReserve(x1: number, z1: number, x2: number, z2: number, extra = 0): boolean {
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (isInTubeReserve(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, extra)) return true
  }
  return false
}

function isInUrbanCanyon(x: number, z: number, extra = 0): boolean {
  return URBAN_CANYONS.some(canyon => distToSegment2D(x, z, canyon.x1, canyon.z1, canyon.x2, canyon.z2) < canyon.width / 2 + extra)
}

function isInSpawnApproach(x: number, z: number, extra = 0): boolean {
  return z < -1500 && z > -4550 && Math.abs(x) < 720 + extra
}

function isInTubeReserve(x: number, z: number, extra = 0): boolean {
  const nearStraightTube = TUBE_CORRIDOR_LAYOUT.some(tube => distToSegment2D(x, z, tube.x1, tube.z1, tube.x2, tube.z2) < tube.outerRadius + extra)
  const nearYamanoteTube = YAMANOTE_WP.slice(0, -1).some((a, i) => {
    const b = YAMANOTE_WP[i + 1]
    return distToSegment2D(x, z, a.x, a.z, b.x, b.z) < YAMANOTE_TUBE_RESERVE + extra
  })
  return nearStraightTube || nearYamanoteTube
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

// NEO Tokyo 2077 palette — brighter wet glass, grouped cyan/magenta signage, warm amber windows
const BTYPE = [
  { bg: [9,  18, 30] as RGB, win: [82,  220, 255] as RGB, cols: 8, rows: 18, em: 0x249dff },
  { bg: [10, 14, 24] as RGB, win: [178, 214, 255] as RGB, cols: 9, rows: 20, em: 0x466dff },
  { bg: [15,  8, 20] as RGB, win: [255,  74, 172] as RGB, cols: 6, rows: 16, em: 0xff3aa8 },
  { bg: [10, 16, 24] as RGB, win: [255, 152,  58] as RGB, cols: 8, rows: 16, em: 0xff8a26 },
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
  private gltfLoader: GLTFLoader | null = null
  private terrainMesh: THREE.Mesh | null = null
  private instancedMeshes: THREE.InstancedMesh[] = []
  private landmarks: THREE.Object3D[] = []
  private deco: THREE.Object3D[] = []
  private buildingColliders: THREE.Mesh[] = []  // Simple collision boxes for each building
  private tubeCorridors: TubeCorridor[] = []
  private ringTubeCorridors: RingTubeCorridor[] = []
  private tubeOpenings: TubeOpening[] = []

  constructor(scene: THREE.Scene, isMobile = false, gltfLoader: GLTFLoader | null = null) {
    this.scene = scene
    this.mobile = isMobile
    this.gltfLoader = gltfLoader
  }

  async initialize(): Promise<void> {
    this.createTerrain()
    this.createUrbanFabric()
    this.createBuildings()
    this.createVariedBuildings()
    this.createChunkyMegaBlocks()
    this.createHeroTowers()
    this.createFlightCanyonRoute()
    this.createCombatArenaRoutes()
    this.createCentralCombatDistrict()
    this.createRouteSideDensity()
    this.createDistantSkyline()
    this.createPeripheralBuildings()
    this.createDistrictFeatures()
    this.createLandmarks()
    this.createNeoLandmarkExtensions()
    this.createImperialPalace()
    this.buildRainbowBridge()
    this.createRainbowBridgeAscentTube()
    this.createHolograms()
    this.createWater()
    this.createUndergroundStructure()
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
  getSafeSpawnPosition(): { x: number; y: number; z: number } { return { x: 0, y: 760, z: -3900 } }

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

  getTubeOpenings(): TubeOpening[] {
    return this.tubeOpenings
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
    this.tubeOpenings.length = 0
  }

  // ===== TERRAIN =====

  private createTerrain(): void {
    const SIZE = 14000, SEGS = 128
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
        r = 0.02; g = 0.052; b = 0.09
      } else if (dR < 55) {
        const wet = 0.9 + sr(i * 0.009) * 0.16
        r = 0.052 * wet; g = 0.064 * wet; b = 0.088 * wet
      } else if (dR < 65) {
        r = 0.105; g = 0.088; b = 0.1
      } else {
        const wet = 0.75 + sr(i * 0.017) * 0.2
        const low = 1 - smooth01(y / 55)
        r = 0.062 * wet + low * 0.018
        g = 0.071 * wet + low * 0.018
        b = 0.092 * wet + low * 0.026
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
    const podiumMat = new THREE.MeshLambertMaterial({ color: 0x172234, emissive: 0x10223a, emissiveIntensity: 0.5 })
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x1a2940, emissive: 0x10243c, emissiveIntensity: 0.36 })

    for (let ix = -7; ix <= 7; ix++) {
      for (let iz = -7; iz <= 7; iz++) {
        const x = ix * 520 + (sr(ix * 3.1 + iz) - 0.5) * 44
        const z = iz * 520 + (sr(ix - iz * 4.4) - 0.5) * 44
        if (Math.hypot(x, z) > 4300 || isInWaterArea(x, z) || isInLandmarkZone(x, z, 320) || isInUrbanCanyon(x, z, 92) || isInSpawnApproach(x, z, 220) || isInTubeReserve(x, z, 125)) continue
        const gy = NeoTokyoMapSystem.heightAt(x, z)
        const major = sr(ix * 7.3 + iz) > 0.5
        const w = major ? 610 : 470
        const d = major ? 500 : 380
        const h = major ? 86 : 52
        const g = new THREE.Group()
        g.name = 'NeoTokyoUrbanFabric'
        g.position.set(x, gy, z)
        g.rotation.y = districtAngle(x, z)

        const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), podiumMat)
        slab.position.y = h / 2
        g.add(slab)

        const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 0.68, 3, d * 0.62), roofMat)
        roof.position.y = h + 3
        g.add(roof)

        if (sr(ix + iz * 1.7) > 0.36) {
          const stackH = major ? 140 : 84
          const stack = new THREE.Mesh(new THREE.BoxGeometry(w * 0.38, stackH, d * 0.34), roofMat)
          stack.position.set((sr(ix) - 0.5) * w * 0.26, h + stackH / 2, (sr(iz) - 0.5) * d * 0.26)
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
      let emIntensity = 0.24
      if (t === 0) emIntensity = 0.34
      else if (t === 2) emIntensity = 0.38
      else if (t === 3) emIntensity = 0.36

      const mat = new THREE.MeshLambertMaterial({
        map: textures[t],
        color: 0xaebbd0,
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

    // ===== 円筒形ビル（Cylindrical Towers - GLB 3バリエーション） =====
    const CYLINDRICAL_TOWERS = [
      { x: -1200, z: 600, h: 420, r: 80 },
      { x: 800, z: -800, h: 380, r: 70 },
      { x: -400, z: -1200, h: 450, r: 85 },
      { x: 1000, z: 1200, h: 400, r: 75 },
      { x: -1800, z: -1000, h: 360, r: 65 },
    ]

    if (this.gltfLoader) {
      const TOWER_MODELS = ['small', 'medium', 'large']
      Promise.all(TOWER_MODELS.map(size =>
        new Promise((resolve) => {
          this.gltfLoader!.load(import.meta.env.BASE_URL + `models/building_cylindrical_${size}.glb`, resolve)
        })
      )).then((gltfs: any[]) => {
        for (const tower of CYLINDRICAL_TOWERS) {
          // 高さに応じてモデルを選択
          let modelIndex = 0
          if (tower.h > 420) modelIndex = 2      // large
          else if (tower.h > 380) modelIndex = 1 // medium
          else modelIndex = 0                     // small

          const gltf = gltfs[modelIndex]
          const inst = gltf.scene.clone()
          const gy = NeoTokyoMapSystem.heightAt(tower.x, tower.z)
          inst.position.set(tower.x, gy, tower.z)
          inst.scale.set(tower.r / 75, tower.h / 400, tower.r / 75) // 基準: 75m半径, 400m高
          inst.name = 'CylindricalTower'

          inst.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = !this.mobile
            }
          })

          this.scene.add(inst)

          // Collider
          const collider = new THREE.Mesh(
            new THREE.CylinderGeometry(tower.r, tower.r, tower.h, 16),
            new THREE.MeshBasicMaterial({ visible: false })
          )
          collider.position.set(tower.x, gy + tower.h / 2, tower.z)
          collider.name = 'BuildingCollider'
          this.scene.add(collider)
          this.buildingColliders.push(collider)
        }
      })
    }

    // ===== 巨大高架道路（Elevated Highway） =====
    const HIGHWAYS = [
      { x1: -2000, z1: -1500, x2: 2000, z2: -1500, y: 100, width: 40 },
      { x1: 1500, z1: -2000, x2: 1500, z2: 2000, y: 120, width: 40 },
    ]

    for (const hw of HIGHWAYS) {
      const length = Math.hypot(hw.x2 - hw.x1, hw.z2 - hw.z1)
      const geo = new THREE.BoxGeometry(hw.width, 8, length)
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 })
      )
      const angle = Math.atan2(hw.z2 - hw.z1, hw.x2 - hw.x1)
      mesh.position.set((hw.x1 + hw.x2) / 2, hw.y, (hw.z1 + hw.z2) / 2)
      mesh.rotation.y = angle
      mesh.name = 'ElevatedHighway'
      this.scene.add(mesh)
    }

    // ===== 環状高架道路（Ring Highway） =====
    const RING_HIGHWAY = {
      radius: 2500,
      y: 180,
      width: 40,
      segments: 32,
    }

    const highwayMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 })

    for (let i = 0; i < RING_HIGHWAY.segments; i++) {
      const angle1 = (i / RING_HIGHWAY.segments) * Math.PI * 2
      const angle2 = ((i + 1) / RING_HIGHWAY.segments) * Math.PI * 2

      const x1 = Math.cos(angle1) * RING_HIGHWAY.radius
      const z1 = Math.sin(angle1) * RING_HIGHWAY.radius
      const x2 = Math.cos(angle2) * RING_HIGHWAY.radius
      const z2 = Math.sin(angle2) * RING_HIGHWAY.radius

      const length = Math.hypot(x2 - x1, z2 - z1)
      const geo = new THREE.BoxGeometry(RING_HIGHWAY.width, 8, length)
      const mesh = new THREE.Mesh(geo, highwayMat)

      const midX = (x1 + x2) / 2
      const midZ = (z1 + z2) / 2
      const segmentAngle = Math.atan2(z2 - z1, x2 - x1)

      mesh.position.set(midX, RING_HIGHWAY.y, midZ)
      mesh.rotation.y = segmentAngle
      mesh.name = 'RingHighway'
      this.scene.add(mesh)
    }
    console.log('✅ Ring Highway created (32 segments, radius 2500m)')

    console.log(`[NEO Tokyo] Created ${this.buildingColliders.length} building colliders (including cylindrical towers)`)
  }

  private collectBuildingSpecs(): BSpec[] {
    const specs: BSpec[] = []

    // NEO Tokyo 2077 Redesign: dense vertical city, narrow supertowers, flight-first
    // Target: 100+ readable towers, still sparse enough for flight gaps.

    const canPlaceTower = (x: number, z: number, h: number): boolean => {
      if (isInWaterArea(x, z)) return false
      if (isInUrbanCanyon(x, z, h > 1100 ? 120 : 70)) return false
      if (isInSpawnApproach(x, z, h > 1100 ? 360 : 220)) return false
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
      const h = 400 + bs * 400  // 改善: 1700-2420m → 400-800m
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
      const h = 300 + bs * 200  // 改善: 1150-1910m → 300-500m
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
      const h = 200 + bs * 200  // 改善: 760-1280m → 200-400m
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
      const h = 150 + bs * 150  // 改善: 520-980m → 150-300m
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

        const h = 100 + bs * 150  // 改善: 520-1300m → 100-250m (一般ビル)
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

    // ===== URBAN CANYON WALL BUILDINGS =====
    // Urban Canyonの両側に壁ビルを配置して視覚的な飛行回廊を形成
    for (const canyon of URBAN_CANYONS) {
      if (canyon.width < 400) continue  // 狭すぎる峡谷はスキップ

      const length = Math.hypot(canyon.x2 - canyon.x1, canyon.z2 - canyon.z1)
      const steps = Math.floor(length / 180)  // 180m間隔

      for (let i = 0; i < steps; i++) {
        const t = i / steps
        const cx = canyon.x1 + (canyon.x2 - canyon.x1) * t
        const cz = canyon.z1 + (canyon.z2 - canyon.z1) * t

        // 両側に壁ビル配置
        const wallOffset = canyon.width / 2 + 60
        const angle = Math.atan2(canyon.z2 - canyon.z1, canyon.x2 - canyon.x1) + Math.PI / 2

        for (const side of [-1, 1]) {
          const x = cx + Math.cos(angle) * wallOffset * side
          const z = cz + Math.sin(angle) * wallOffset * side

          // 水域・ランドマーク・スポーンエリアを避ける
          if (isInWaterArea(x, z) || isInLandmarkZone(x, z, 200) || isInSpawnApproach(x, z, 180)) continue

          const h = 300 + Math.random() * 100  // 統一された高さ300-400m

          pushSpec({
            type: 0,
            x, z,
            w: 160 + Math.random() * 40,
            d: 160 + Math.random() * 40,
            h,
            ry: angle + Math.PI / 2
          })
        }
      }
    }

    console.log(`[NEO Tokyo 2077] Generated ${specs.length} dense skyline towers (including Urban Canyon walls)`)
    return specs
  }

  // ===== MEGA STRUCTURES (Vertical City Infrastructure) =====

  private createChunkyMegaBlocks(): void {
    const blocks: Array<{ x: number; z: number; w: number; d: number; h: number; c: number }> = [
      { x: -520, z: -1420, w: 560, d: 420, h: 350, c: 0x3ddcff },  // 820→350m
      { x: 1180, z: -1120, w: 520, d: 480, h: 400, c: 0xff3aa8 },  // 960→400m
      { x: -1760, z: 1180, w: 620, d: 380, h: 300, c: 0xff8a26 },  // 720→300m
      { x: 2580, z: 1600, w: 680, d: 520, h: 280, c: 0x3ddcff },   // 620→280m
      { x: -3300, z: -760, w: 580, d: 520, h: 320, c: 0xff3aa8 },  // 760→320m
      { x: 2900, z: -760, w: 470, d: 580, h: 350, c: 0x6ce8ff },   // 840→350m
    ]

    for (const b of blocks) {
      if (isInWaterArea(b.x, b.z) || isInLandmarkZone(b.x, b.z, 260) || isInUrbanCanyon(b.x, b.z, 120) || isInSpawnApproach(b.x, b.z, 360)) continue
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

  createLayeredSkyCity(): void {
    const platformMat = new THREE.MeshLambertMaterial({
      color: 0x141a24,
      emissive: 0x0c1830,
      emissiveIntensity: 0.55
    })
    const railCyan = new THREE.MeshLambertMaterial({ color: 0x2faed8, emissive: 0x0a6fa8, emissiveIntensity: 0.72 })

    this.createYamanoteFlightTube(platformMat, railCyan)
  }

  private createYamanoteFlightTube(platformMat: THREE.Material, railMat: THREE.Material): void {
    const y = 4200
    const w = 54
    const entryIndices = [0, 3, 10, 17]
    const ramps: Array<{ sx: number; sz: number; px: number; pz: number; q: THREE.Quaternion }> = []
    for (const i of entryIndices) {
      const p = YAMANOTE_WP[i]
      const outward = new THREE.Vector3(p.x, 0, p.z)
      if (outward.lengthSq() < 1) outward.set(-0.7, 0, 0.7)
      outward.normalize()
      const sx = p.x + outward.x * 760
      const sz = p.z + outward.z * 760
      const rampAxis = new THREE.Vector3(p.x - sx, 0, p.z - sz).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), rampAxis)
      this.tubeOpenings.push({ x: p.x, y, z: p.z, radius: 285 })
      this.tubeOpenings.push({ x: sx, y, z: sz, radius: 285 })
      ramps.push({ sx, sz, px: p.x, pz: p.z, q })
    }

    this.buildCurvedSkyway(YAMANOTE_WP.slice(0, -1), y, w, railMat)

    for (const ramp of ramps) {
      this.buildSkyway(ramp.sx, ramp.sz, ramp.px, ramp.pz, y, w, platformMat, railMat, false)
      this.createTubeInterchangePortal(ramp.sx, ramp.sz, ramp.px, ramp.pz, y, ramp.q)

      const gate = new THREE.Mesh(new THREE.TorusGeometry(250, 12, 8, 64), railMat)
      gate.position.set(ramp.px, y, ramp.pz)
      gate.quaternion.copy(ramp.q)
      gate.name = 'NeoTokyoYamanoteTubeEntry'
      this.scene.add(gate)
      this.deco.push(gate)

      const mouth = new THREE.Mesh(new THREE.TorusGeometry(250, 14, 8, 64), railMat)
      mouth.position.set(ramp.sx, y, ramp.sz)
      mouth.quaternion.copy(ramp.q)
      mouth.name = 'NeoTokyoYamanoteTubeMouth'
      this.scene.add(mouth)
      this.deco.push(mouth)

      const mergeMat = new THREE.MeshLambertMaterial({ color: 0xff9a2a, emissive: 0xff5a10, emissiveIntensity: 1.05 })
      for (const [t, width] of [[0.18, 300], [0.5, 430], [0.82, 300]] as [number, number][]) {
        const marker = new THREE.Mesh(new THREE.BoxGeometry(width, 12, 30), mergeMat)
        marker.position.set(ramp.sx + (ramp.px - ramp.sx) * t, y + 88, ramp.sz + (ramp.pz - ramp.sz) * t)
        marker.quaternion.copy(ramp.q)
        marker.name = 'NeoTokyoYamanoteEntryGuide'
        this.scene.add(marker)
        this.deco.push(marker)
      }

      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 760), railMat)
        rail.position.set((ramp.sx + ramp.px) / 2, y + 22, (ramp.sz + ramp.pz) / 2)
        rail.quaternion.copy(ramp.q)
        rail.translateX(side * 135)
        rail.name = 'NeoTokyoYamanoteMergeRail'
        this.scene.add(rail)
        this.deco.push(rail)
      }
    }
  }

  private createTubeInterchangePortal(sx: number, sz: number, px: number, pz: number, y: number, q: THREE.Quaternion): void {
    const dx = px - sx
    const dz = pz - sz
    const len = Math.hypot(dx, dz)
    if (len < 1) return

    const g = new THREE.Group()
    g.name = 'NeoTokyoTubeInterchangePortal'
    g.position.set((sx + px) / 2, y, (sz + pz) / 2)
    g.quaternion.copy(q)

    const shellMat = new THREE.MeshLambertMaterial({ color: 0x18263a, emissive: 0x12345a, emissiveIntensity: 0.82 })
    const cyanMat = new THREE.MeshLambertMaterial({ color: 0x68e6ff, emissive: 0x1cbcff, emissiveIntensity: 1.65 })
    const amberMat = new THREE.MeshLambertMaterial({ color: 0xffb468, emissive: 0xff8428, emissiveIntensity: 1.35 })
    const magentaMat = new THREE.MeshLambertMaterial({ color: 0xff58b6, emissive: 0xff2e94, emissiveIntensity: 1.1 })

    const throat = new THREE.Mesh(new THREE.CylinderGeometry(162, 132, len * 0.72, 18, 1, true), shellMat)
    throat.rotation.x = Math.PI / 2
    g.add(throat)

    for (const z of [-len * 0.32, 0, len * 0.32]) {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(168, 8, 8, 48), cyanMat)
      frame.position.z = z
      g.add(frame)
    }

    for (const side of [-1, 1]) {
      const spar = new THREE.Mesh(new THREE.BoxGeometry(18, 18, len * 0.78), side > 0 ? amberMat : magentaMat)
      spar.position.set(side * 142, -74, 0)
      g.add(spar)

      const fin = new THREE.Mesh(new THREE.BoxGeometry(20, 165, len * 0.42), shellMat)
      fin.position.set(side * 192, 0, -len * 0.08)
      fin.rotation.z = side * 0.16
      g.add(fin)
    }

    const approach = new THREE.Mesh(new THREE.BoxGeometry(360, 10, 72), amberMat)
    approach.position.set(0, -138, -len * 0.42)
    g.add(approach)

    this.scene.add(g)
    this.deco.push(g)
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
      if (isInLandmarkZone(t.x, t.z, 220) || isInWaterArea(t.x, t.z) || isInUrbanCanyon(t.x, t.z, 80) || isInSpawnApproach(t.x, t.z, 420) || isInTubeReserve(t.x, t.z, 300)) continue
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

  private createFlightCanyonRoute(): void {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x172235, emissive: 0x10243c, emissiveIntensity: 0.72 })
    const coreMat = new THREE.MeshLambertMaterial({ color: 0x22344a, emissive: 0x17304b, emissiveIntensity: 0.7 })
    const cyanMat = new THREE.MeshLambertMaterial({ color: 0x76eaff, emissive: 0x16a8ff, emissiveIntensity: 1.55 })
    const magentaMat = new THREE.MeshLambertMaterial({ color: 0xff58b6, emissive: 0xff2e94, emissiveIntensity: 1.1 })
    const route: Array<{ x: number; z: number; y: number; w: number; h: number }> = [
      { x: 0, z: -1280, y: 620, w: 760, h: 520 },
      { x: 430, z: -520, y: 660, w: 760, h: 540 },
      { x: 960, z: 180, y: 690, w: 760, h: 540 },
      { x: 1420, z: 900, y: 720, w: 780, h: 560 },
      { x: 980, z: 1580, y: 760, w: 760, h: 560 },
      { x: 320, z: 2220, y: 790, w: 720, h: 540 },
    ]

    for (let i = 0; i < route.length; i++) {
      const gate = route[i]
      if (isInLandmarkZone(gate.x, gate.z, 180) || isInWaterArea(gate.x, gate.z)) continue
      const next = route[Math.min(route.length - 1, i + 1)]
      const prev = route[Math.max(0, i - 1)]
      const dx = next.x - prev.x
      const dz = next.z - prev.z
      const angle = Math.atan2(dx, dz)
      const g = new THREE.Group()
      g.name = 'NeoTokyoFlightCanyonGate'
      const groundY = NeoTokyoMapSystem.heightAt(gate.x, gate.z)
      g.position.set(gate.x, groundY, gate.z)
      g.rotation.y = angle

      const deckY = Math.max(gate.y + gate.h / 2, 760)
      const sideH = deckY - groundY
      for (const side of [-1, 1]) {
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(176, sideH, 190), bodyMat)
        pylon.position.set(side * gate.w / 2, sideH / 2, 0)
        g.add(pylon)
        this.buildingColliders.push(pylon)

        const core = new THREE.Mesh(new THREE.CylinderGeometry(72, 92, sideH * 0.94, 6), coreMat)
        core.position.set(side * (gate.w / 2 + 126), sideH * 0.49, 0)
        core.rotation.y = Math.PI / 6
        g.add(core)
        this.buildingColliders.push(core)

        const verticalBand = new THREE.Mesh(new THREE.BoxGeometry(14, sideH * 0.66, 18), side > 0 ? cyanMat : magentaMat)
        verticalBand.position.set(side * (gate.w / 2 - 92), sideH * 0.5, -104)
        g.add(verticalBand)
      }

      const skyDeck = new THREE.Mesh(new THREE.BoxGeometry(gate.w + 360, 96, 190), bodyMat)
      skyDeck.position.set(0, sideH, 0)
      g.add(skyDeck)
      this.buildingColliders.push(skyDeck)

      const lip = new THREE.Mesh(new THREE.BoxGeometry(gate.w + 160, 12, 24), cyanMat)
      lip.position.set(0, sideH + 58, -108)
      g.add(lip)

      this.scene.add(g)
      this.deco.push(g)
    }
  }

  private createCombatArenaRoutes(): void {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x121b28, emissive: 0x0a1828, emissiveIntensity: 0.72 })
    const capMat = new THREE.MeshLambertMaterial({ color: 0x243348, emissive: 0x142b46, emissiveIntensity: 0.75 })
    const cyanMat = new THREE.MeshLambertMaterial({ color: 0x72e8ff, emissive: 0x16b7ff, emissiveIntensity: 1.35 })
    const magentaMat = new THREE.MeshLambertMaterial({ color: 0xff4cad, emissive: 0xff2d96, emissiveIntensity: 1.15 })
    const amberMat = new THREE.MeshLambertMaterial({ color: 0xffb75e, emissive: 0xff7c24, emissiveIntensity: 1.08 })
    const segments = [
      { a: { x: 0, z: -1500 }, b: { x: 430, z: -520 }, clear: 640 },
      { a: { x: 430, z: -520 }, b: { x: 960, z: 180 }, clear: 620 },
      { a: { x: 960, z: 180 }, b: { x: 1420, z: 900 }, clear: 640 },
      { a: { x: 1420, z: 900 }, b: { x: 980, z: 1580 }, clear: 660 },
      { a: { x: 980, z: 1580 }, b: { x: 320, z: 2220 }, clear: 620 },
    ]

    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si]
      const dx = seg.b.x - seg.a.x
      const dz = seg.b.z - seg.a.z
      const len = Math.hypot(dx, dz)
      if (len < 1) continue
      const yaw = Math.atan2(dx, dz)
      const sideX = dz / len
      const sideZ = -dx / len
      const forwardX = dx / len
      const forwardZ = dz / len

      const breakerTs = si === 0 ? [0.68] : [0.24, 0.54, 0.8]
      for (const t of breakerTs) {
        const cx = seg.a.x + dx * t
        const cz = seg.a.z + dz * t
        for (const side of [-1, 1]) {
          const seed = si * 37 + t * 101 + side * 13
          const offset = seg.clear + 160 + sr(seed) * 120
          const x = cx + sideX * side * offset
          const z = cz + sideZ * side * offset
          if (isInWaterArea(x, z) || isInLandmarkZone(x, z, 260) || isInSpawnApproach(x, z, 280) || isInTubeReserve(x, z, 140)) continue
          const gy = NeoTokyoMapSystem.heightAt(x, z)
          const h = 380 + sr(seed * 1.7) * 360
          const w = 260 + sr(seed * 2.1) * 170
          const d = 230 + sr(seed * 3.2) * 150
          const g = new THREE.Group()
          g.name = 'NeoTokyoMissileBreaker'
          g.position.set(x, gy, z)
          g.rotation.y = -yaw + side * 0.18

          const slab = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
          slab.position.y = h / 2
          g.add(slab)
          this.buildingColliders.push(slab)

          const crown = new THREE.Mesh(new THREE.BoxGeometry(w * 1.08, 28, d * 1.15), capMat)
          crown.position.y = h + 14
          g.add(crown)
          this.buildingColliders.push(crown)

          const finMat = (si + side) % 2 === 0 ? cyanMat : magentaMat
          const fin = new THREE.Mesh(new THREE.BoxGeometry(14, h * 0.72, 16), finMat)
          fin.position.set(side * w * 0.42, h * 0.5, -d * 0.53)
          g.add(fin)

          const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.22, w * 0.27, h * 0.56, 6), capMat)
          shoulder.position.set(-side * w * 0.24, h * 0.74, d * 0.08)
          shoulder.rotation.y = Math.PI / 6
          g.add(shoulder)
          this.buildingColliders.push(shoulder)

          this.scene.add(g)
          this.landmarks.push(g)
        }
      }

      const overpassTs = si === 0 ? [0.82] : [0.38, 0.7]
      for (const t of overpassTs) {
        const cx = seg.a.x + dx * t
        const cz = seg.a.z + dz * t
        const x = cx + forwardX * 40
        const z = cz + forwardZ * 40
        if (isInWaterArea(x, z) || isInLandmarkZone(x, z, 320) || isInSpawnApproach(x, z, 340)) continue
        const gy = NeoTokyoMapSystem.heightAt(x, z)
        const bridge = new THREE.Group()
        bridge.name = 'NeoTokyoCombatOverpass'
        bridge.position.set(x, gy, z)
        bridge.rotation.y = -yaw

        const leftPier = new THREE.Mesh(new THREE.BoxGeometry(120, 430, 150), wallMat)
        leftPier.position.set(-seg.clear * 0.62, 215, 0)
        bridge.add(leftPier)
        this.buildingColliders.push(leftPier)

        const rightPier = new THREE.Mesh(new THREE.BoxGeometry(120, 430, 150), wallMat)
        rightPier.position.set(seg.clear * 0.62, 215, 0)
        bridge.add(rightPier)
        this.buildingColliders.push(rightPier)

        const deck = new THREE.Mesh(new THREE.BoxGeometry(seg.clear * 1.44, 54, 130), capMat)
        deck.position.y = 590
        bridge.add(deck)
        this.buildingColliders.push(deck)

        const marker = new THREE.Mesh(new THREE.BoxGeometry(seg.clear * 0.78, 10, 18), si % 2 === 0 ? amberMat : cyanMat)
        marker.position.set(0, 624, -74)
        bridge.add(marker)

        this.scene.add(bridge)
        this.deco.push(bridge)
      }
    }
  }

  private createCentralCombatDistrict(): void {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x101927, emissive: 0x0a1728, emissiveIntensity: 0.68 })
    const capMat = new THREE.MeshLambertMaterial({ color: 0x24364c, emissive: 0x132c48, emissiveIntensity: 0.72 })
    const cyanMat = new THREE.MeshLambertMaterial({ color: 0x68e7ff, emissive: 0x16b7ff, emissiveIntensity: 1.35 })
    const magentaMat = new THREE.MeshLambertMaterial({ color: 0xff55b0, emissive: 0xff2f97, emissiveIntensity: 1.15 })
    const blocks = [
      { x: -980, z: -420, w: 360, d: 440, h: 760, r: 0.04, c: cyanMat },
      { x: 1180, z: -520, w: 420, d: 380, h: 820, r: -0.08, c: magentaMat },
      { x: -1080, z: 760, w: 390, d: 360, h: 620, r: -0.22, c: magentaMat },
      { x: 1240, z: 860, w: 360, d: 420, h: 700, r: 0.18, c: cyanMat },
      { x: 0, z: 1080, w: 520, d: 300, h: 540, r: Math.PI / 2, c: cyanMat },
    ]

    for (const b of blocks) {
      if (isInWaterArea(b.x, b.z) || isInLandmarkZone(b.x, b.z, 140) || isInUrbanCanyon(b.x, b.z, 110) || isInTubeReserve(b.x, b.z, 220)) continue
      const gy = NeoTokyoMapSystem.heightAt(b.x, b.z)
      const g = new THREE.Group()
      g.name = 'NeoTokyoCentralCombatBlock'
      g.position.set(b.x, gy, b.z)
      g.rotation.y = b.r

      const base = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h * 0.72, b.d), bodyMat)
      base.position.y = b.h * 0.36
      g.add(base)
      this.buildingColliders.push(base)

      const crown = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.9, b.h * 0.18, b.d * 0.72), capMat)
      crown.position.y = b.h * 0.85
      crown.rotation.y = 0.18
      g.add(crown)
      this.buildingColliders.push(crown)

      const fin = new THREE.Mesh(new THREE.BoxGeometry(16, b.h * 0.62, 18), b.c)
      fin.position.set(-b.w * 0.42, b.h * 0.48, -b.d * 0.52)
      g.add(fin)

      const roofLane = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.78, 8, 18), b.c)
      roofLane.position.set(0, b.h * 0.98, -b.d * 0.42)
      g.add(roofLane)

      this.scene.add(g)
      this.landmarks.push(g)
    }
  }

  private createRouteSideDensity(): void {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x101722, emissive: 0x0c1826, emissiveIntensity: 0.52 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2b3f, emissive: 0x143150, emissiveIntensity: 0.72 })
    const magentaMat = new THREE.MeshLambertMaterial({ color: 0xff4cad, emissive: 0xff2f9a, emissiveIntensity: 1.45 })
    const cyanMat = new THREE.MeshLambertMaterial({ color: 0x67e8ff, emissive: 0x1ebfff, emissiveIntensity: 1.45 })
    const amberMat = new THREE.MeshLambertMaterial({ color: 0xffb85c, emissive: 0xff7c24, emissiveIntensity: 1.25 })
    const route: Array<{ x: number; z: number }> = [
      { x: 0, z: -1860 },
      { x: 0, z: -1280 },
      { x: 430, z: -520 },
      { x: 960, z: 180 },
      { x: 1420, z: 900 },
      { x: 980, z: 1580 },
      { x: 320, z: 2220 },
    ]

    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i]
      const b = route[i + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 1) continue
      const sideX = dz / len
      const sideZ = -dx / len
      const yaw = Math.atan2(dx, dz)

      for (const side of [-1, 1]) {
        const seed = i * 19 + side * 5
        const offset = 430 + sr(seed) * 60
        const x = (a.x + b.x) / 2 + sideX * side * offset
        const z = (a.z + b.z) / 2 + sideZ * side * offset
        if (isInWaterArea(x, z) || isInLandmarkZone(x, z, 260) || isInSpawnApproach(x, z, 260) || isInTubeReserve(x, z, 115)) continue

        const gy = NeoTokyoMapSystem.heightAt(x, z)
        const h = 150 + sr(seed * 1.8) * 180
        const g = new THREE.Group()
        g.name = 'NeoTokyoRouteEdgeDistrict'
        g.position.set(x, gy, z)
        g.rotation.y = -yaw

        const slab = new THREE.Mesh(new THREE.BoxGeometry(190 + sr(seed * 2.4) * 120, h, len * 0.78), bodyMat)
        slab.position.y = h / 2
        g.add(slab)

        const terrace = new THREE.Mesh(new THREE.BoxGeometry(150 + sr(seed * 3.2) * 90, h * 0.42, len * 0.34), glassMat)
        terrace.position.set(-side * 22, h * 1.18, -len * 0.12)
        g.add(terrace)

        const crown = new THREE.Mesh(new THREE.BoxGeometry(180, 6, len * 0.64), side > 0 ? cyanMat : magentaMat)
        crown.position.y = h + 8
        g.add(crown)

        this.scene.add(g)
        this.deco.push(g)
      }
    }

    for (let i = 1; i < route.length - 1; i++) {
      const prev = route[i - 1]
      const p = route[i]
      const next = route[i + 1]
      const dx = next.x - prev.x
      const dz = next.z - prev.z
      const len = Math.hypot(dx, dz)
      if (len < 1) continue
      const sideX = dz / len
      const sideZ = -dx / len
      const yaw = Math.atan2(dx, dz)

      for (const side of [-1, 1]) {
        const seed = i * 31 + side * 7
        const offset = 560 + sr(seed) * 220
        const x = p.x + sideX * side * offset
        const z = p.z + sideZ * side * offset
        if (isInWaterArea(x, z) || isInLandmarkZone(x, z, 300) || isInSpawnApproach(x, z, 300) || isInTubeReserve(x, z, 150)) continue

        const gy = NeoTokyoMapSystem.heightAt(x, z)
        const h = 520 + sr(seed * 1.7) * 620
        const w = 380 + sr(seed * 2.3) * 260
        const d = 320 + sr(seed * 3.1) * 220
        const g = new THREE.Group()
        g.name = 'NeoTokyoRouteSideBlock'
        g.position.set(x, gy, z)
        g.rotation.y = -yaw + side * 0.08

        const base = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.42, d), bodyMat)
        base.position.y = h * 0.21
        g.add(base)

        const tower = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.34, w * 0.45, h * 0.62, 6), glassMat)
        tower.position.set(side * w * 0.08, h * 0.72, 0)
        tower.rotation.y = Math.PI / 6
        g.add(tower)

        const shoulder = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, h * 0.16, d * 0.7), bodyMat)
        shoulder.position.set(-side * w * 0.1, h * 0.48, 0)
        shoulder.rotation.y = side * 0.2
        g.add(shoulder)

        const signMat = i % 3 === 0 ? magentaMat : (i % 3 === 1 ? cyanMat : amberMat)
        const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.08, h * 0.46, 8), signMat)
        sign.position.set(-side * w * 0.46, h * 0.62, -d * 0.51)
        g.add(sign)

        for (let j = 0; j < 3; j++) {
          const band = new THREE.Mesh(new THREE.BoxGeometry(w * (0.55 + j * 0.08), 5, d * 0.08), j === 1 ? magentaMat : cyanMat)
          band.position.set(0, h * (0.32 + j * 0.19), d * 0.52)
          g.add(band)
        }

        this.scene.add(g)
        this.deco.push(g)
      }
    }
  }

  private createDistantSkyline(): void {
    const mat = new THREE.MeshLambertMaterial({
      color: 0x142235,
      emissive: 0x1b4160,
      emissiveIntensity: 0.62
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

  private createPeripheralBuildings(): void {
    // 周辺部ビル（低層・中層、80-200m）
    const mat = new THREE.MeshLambertMaterial({
      color: 0x1a2838,
      emissive: 0x1f3a50,
      emissiveIntensity: 0.5
    })
    const geo = new THREE.BoxGeometry(1, 1, 1)

    let count = 0
    for (let x = -4000; x < 4000; x += 150) {
      for (let z = -4000; z < 4000; z += 150) {
        const dist = Math.hypot(x, z)
        // 中心部（2000m以内）をスキップ
        if (dist < 2000) continue
        // 外周部（3500m以上）もスキップ
        if (dist > 3500) continue
        // 水域をスキップ
        if (isInWaterArea(x, z)) continue

        const gy = NeoTokyoMapSystem.heightAt(x, z)
        const h = 80 + sr(x * 0.1 + z * 0.2) * 120  // 80-200m
        const w = 25 + sr(x * 0.15 + z * 0.25) * 20  // 25-45m
        const d = 25 + sr(x * 0.2 + z * 0.3) * 20   // 25-45m

        const building = new THREE.Mesh(geo, mat)
        building.position.set(x, gy + h / 2, z)
        building.scale.set(w, h, d)
        building.rotation.y = sr(x + z) * Math.PI
        this.scene.add(building)
        this.deco.push(building)
        count++
      }
    }
    console.log(`✅ Peripheral buildings created: ${count}`)
  }

  private createDistrictFeatures(): void {
    // ===== A. 商業地区（中心部、半径1000m） =====
    const COMMERCIAL_DISTRICT = {
      center: { x: 0, z: 0 },
      radius: 1000,
    }

    // ネオンサイン200個（消灯状態）
    const neonMat = new THREE.MeshStandardMaterial({
      color: 0x3344ff,
      emissive: 0x001133,
      emissiveIntensity: 0.3,
      metalness: 0.7,
      roughness: 0.3
    })

    let neonCount = 0
    for (let i = 0; i < 200; i++) {
      const angle = sr(i * 13.7) * Math.PI * 2
      const r = sr(i * 7.3) * COMMERCIAL_DISTRICT.radius
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r

      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const signH = 30 + sr(i * 5.1) * 50  // 30-80m高さに配置

      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(20 + sr(i * 3.2) * 15, 8 + sr(i * 4.1) * 6, 2),
        neonMat
      )
      sign.position.set(x, gy + signH, z)
      sign.rotation.y = sr(i * 2.1) * Math.PI * 2
      this.scene.add(sign)
      this.deco.push(sign)
      neonCount++
    }

    // 大型スクリーン20個
    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22,
      emissive: 0x111122,
      emissiveIntensity: 0.2,
      metalness: 0.9,
      roughness: 0.1
    })

    for (let i = 0; i < 20; i++) {
      const angle = sr(i * 17.3) * Math.PI * 2
      const r = sr(i * 11.1) * COMMERCIAL_DISTRICT.radius * 0.8
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r

      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const screenH = 100 + sr(i * 6.7) * 80  // 100-180m高さ

      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(40 + sr(i * 8.3) * 30, 25 + sr(i * 9.1) * 20, 3),
        screenMat
      )
      screen.position.set(x, gy + screenH, z)
      screen.rotation.y = Math.atan2(z, x) + Math.PI  // 中心を向く
      this.scene.add(screen)
      this.deco.push(screen)
    }

    // 広告看板500枚（小型）
    const billboardMat = new THREE.MeshLambertMaterial({
      color: 0x444455,
      emissive: 0x111122,
      emissiveIntensity: 0.15
    })

    for (let i = 0; i < 500; i++) {
      const angle = sr(i * 23.7) * Math.PI * 2
      const r = sr(i * 19.3) * COMMERCIAL_DISTRICT.radius
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r

      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const billH = 15 + sr(i * 7.7) * 100  // 15-115m高さ

      const billboard = new THREE.Mesh(
        new THREE.BoxGeometry(8 + sr(i * 3.9) * 6, 5 + sr(i * 4.3) * 4, 0.5),
        billboardMat
      )
      billboard.position.set(x, gy + billH, z)
      billboard.rotation.y = sr(i * 5.5) * Math.PI * 2
      this.scene.add(billboard)
      this.deco.push(billboard)
    }

    console.log(`✅ Commercial district features: ${neonCount} neon signs, 20 screens, 500 billboards`)

    // ===== B. 住宅地区（外周、半径1000-2500m） =====
    const RESIDENTIAL_DISTRICT = {
      innerRadius: 1000,
      outerRadius: 2500,
    }

    // 低層マンション300棟（5-10階）
    const apartmentMat = new THREE.MeshLambertMaterial({
      color: 0x2a3a4a,
      emissive: 0x0f1f2f,
      emissiveIntensity: 0.2
    })

    let apartmentCount = 0
    for (let i = 0; i < 300; i++) {
      const angle = sr(i * 31.3) * Math.PI * 2
      const r = RESIDENTIAL_DISTRICT.innerRadius + sr(i * 27.7) * (RESIDENTIAL_DISTRICT.outerRadius - RESIDENTIAL_DISTRICT.innerRadius)
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r

      // 水域スキップ
      if (isInWaterArea(x, z)) continue

      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const floors = 5 + Math.floor(sr(i * 8.9) * 6)  // 5-10階
      const h = floors * 3.5  // 17.5-35m

      const apartment = new THREE.Mesh(
        new THREE.BoxGeometry(18 + sr(i * 6.1) * 10, h, 12 + sr(i * 7.3) * 8),
        apartmentMat
      )
      apartment.position.set(x, gy + h / 2, z)
      apartment.rotation.y = sr(i * 4.7) * Math.PI * 2
      this.scene.add(apartment)
      this.deco.push(apartment)
      apartmentCount++
    }

    // 一戸建て風の建物100棟（2-3階）
    const houseMat = new THREE.MeshLambertMaterial({
      color: 0x4a3a2a,
      emissive: 0x1f0f0a,
      emissiveIntensity: 0.1
    })

    for (let i = 0; i < 100; i++) {
      const angle = sr(i * 41.7) * Math.PI * 2
      const r = RESIDENTIAL_DISTRICT.innerRadius + sr(i * 37.3) * (RESIDENTIAL_DISTRICT.outerRadius - RESIDENTIAL_DISTRICT.innerRadius)
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r

      if (isInWaterArea(x, z)) continue

      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const floors = 2 + Math.floor(sr(i * 9.7) * 2)  // 2-3階
      const h = floors * 3.2  // 6.4-9.6m

      const house = new THREE.Mesh(
        new THREE.BoxGeometry(12 + sr(i * 5.3) * 6, h, 10 + sr(i * 6.7) * 5),
        houseMat
      )
      house.position.set(x, gy + h / 2, z)
      house.rotation.y = sr(i * 3.3) * Math.PI * 2
      this.scene.add(house)
      this.deco.push(house)
    }

    // 公園5箇所
    const parkMat = new THREE.MeshLambertMaterial({ color: 0x1a2a1a })

    const parkPositions = [
      { x: -1800, z: -1800 },
      { x: 1800, z: -1800 },
      { x: -1800, z: 1800 },
      { x: 1800, z: 1800 },
      { x: 0, z: 2200 },
    ]

    for (const pos of parkPositions) {
      const gy = NeoTokyoMapSystem.heightAt(pos.x, pos.z)
      const park = new THREE.Mesh(
        new THREE.BoxGeometry(80, 1, 80),
        parkMat
      )
      park.position.set(pos.x, gy + 0.5, pos.z)
      this.scene.add(park)
      this.deco.push(park)
    }

    // 学校3箇所
    const schoolMat = new THREE.MeshLambertMaterial({
      color: 0x5a4a3a,
      emissive: 0x2a1a0a,
      emissiveIntensity: 0.1
    })

    const schoolPositions = [
      { x: -1500, z: -1500 },
      { x: 1500, z: -1500 },
      { x: 0, z: -2000 },
    ]

    for (const pos of schoolPositions) {
      const gy = NeoTokyoMapSystem.heightAt(pos.x, pos.z)
      const school = new THREE.Mesh(
        new THREE.BoxGeometry(60, 18, 40),  // 3階建て想定
        schoolMat
      )
      school.position.set(pos.x, gy + 9, pos.z)
      this.scene.add(school)
      this.deco.push(school)
    }

    // 病院2箇所
    const hospitalMat = new THREE.MeshLambertMaterial({
      color: 0xeaeaea,
      emissive: 0x3a3a3a,
      emissiveIntensity: 0.15
    })

    const hospitalPositions = [
      { x: -2000, z: 0 },
      { x: 2000, z: 0 },
    ]

    for (const pos of hospitalPositions) {
      const gy = NeoTokyoMapSystem.heightAt(pos.x, pos.z)
      const hospital = new THREE.Mesh(
        new THREE.BoxGeometry(70, 36, 50),  // 8階建て想定
        hospitalMat
      )
      hospital.position.set(pos.x, gy + 18, pos.z)
      this.scene.add(hospital)
      this.deco.push(hospital)

      // 屋上ヘリポート
      const helipad = new THREE.Mesh(
        new THREE.CylinderGeometry(12, 12, 1, 16),
        new THREE.MeshLambertMaterial({ color: 0xff4444 })
      )
      helipad.position.set(pos.x, gy + 36.5, pos.z)
      this.scene.add(helipad)
      this.deco.push(helipad)
    }

    console.log(`✅ Residential district features: ${apartmentCount} apartments, 100 houses, 5 parks, 3 schools, 2 hospitals`)

    // ===== C. 工業地区（南東部、特定エリア） =====
    const INDUSTRIAL_DISTRICT = {
      center: { x: 2000, z: 2000 },
      radius: 1000,
    }

    // 工場10棟（煙突付き）
    const factoryMat = new THREE.MeshLambertMaterial({
      color: 0x3a3a3a,
      emissive: 0x1a1a1a,
      emissiveIntensity: 0.1
    })

    const chimneyMat = new THREE.MeshLambertMaterial({ color: 0x5a3a2a })

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2
      const r = sr(i * 15.7) * INDUSTRIAL_DISTRICT.radius * 0.8
      const x = INDUSTRIAL_DISTRICT.center.x + Math.cos(angle) * r
      const z = INDUSTRIAL_DISTRICT.center.z + Math.sin(angle) * r

      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const factoryH = 30 + sr(i * 8.3) * 20  // 30-50m

      // 工場本体
      const factory = new THREE.Mesh(
        new THREE.BoxGeometry(80 + sr(i * 6.7) * 40, factoryH, 60 + sr(i * 7.9) * 30),
        factoryMat
      )
      factory.position.set(x, gy + factoryH / 2, z)
      factory.rotation.y = sr(i * 5.1) * Math.PI * 2
      this.scene.add(factory)
      this.deco.push(factory)

      // 煙突
      const chimneyH = 60 + sr(i * 9.1) * 40  // 60-100m
      const chimney = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 6, chimneyH, 12),
        chimneyMat
      )
      chimney.position.set(x + 20, gy + chimneyH / 2, z + 10)
      this.scene.add(chimney)
      this.deco.push(chimney)
    }

    // 倉庫50棟
    const warehouseMat = new THREE.MeshLambertMaterial({ color: 0x4a4a4a })

    for (let i = 0; i < 50; i++) {
      const angle = sr(i * 29.3) * Math.PI * 2
      const r = sr(i * 23.7) * INDUSTRIAL_DISTRICT.radius
      const x = INDUSTRIAL_DISTRICT.center.x + Math.cos(angle) * r
      const z = INDUSTRIAL_DISTRICT.center.z + Math.sin(angle) * r

      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const warehouseH = 12 + sr(i * 7.7) * 8  // 12-20m

      const warehouse = new THREE.Mesh(
        new THREE.BoxGeometry(25 + sr(i * 5.3) * 15, warehouseH, 20 + sr(i * 6.1) * 10),
        warehouseMat
      )
      warehouse.position.set(x, gy + warehouseH / 2, z)
      warehouse.rotation.y = sr(i * 4.3) * Math.PI * 2
      this.scene.add(warehouse)
      this.deco.push(warehouse)
    }

    // クレーン15基
    const craneMat = new THREE.MeshStandardMaterial({
      color: 0xff8800,
      metalness: 0.7,
      roughness: 0.4
    })

    for (let i = 0; i < 15; i++) {
      const angle = sr(i * 33.7) * Math.PI * 2
      const r = sr(i * 27.1) * INDUSTRIAL_DISTRICT.radius * 0.9
      const x = INDUSTRIAL_DISTRICT.center.x + Math.cos(angle) * r
      const z = INDUSTRIAL_DISTRICT.center.z + Math.sin(angle) * r

      const gy = NeoTokyoMapSystem.heightAt(x, z)

      // クレーン支柱
      const craneH = 50 + sr(i * 8.9) * 30  // 50-80m
      const cranePole = new THREE.Mesh(
        new THREE.BoxGeometry(6, craneH, 6),
        craneMat
      )
      cranePole.position.set(x, gy + craneH / 2, z)
      this.scene.add(cranePole)
      this.deco.push(cranePole)

      // クレーンアーム
      const armLength = 30 + sr(i * 7.3) * 20  // 30-50m
      const craneArm = new THREE.Mesh(
        new THREE.BoxGeometry(armLength, 3, 3),
        craneMat
      )
      craneArm.position.set(x + armLength / 2, gy + craneH, z)
      craneArm.rotation.y = sr(i * 6.7) * Math.PI * 2
      this.scene.add(craneArm)
      this.deco.push(craneArm)
    }

    // タンク20基（石油タンク）
    const tankMat = new THREE.MeshLambertMaterial({ color: 0x5a5a5a })

    for (let i = 0; i < 20; i++) {
      const angle = sr(i * 37.9) * Math.PI * 2
      const r = sr(i * 31.3) * INDUSTRIAL_DISTRICT.radius * 0.7
      const x = INDUSTRIAL_DISTRICT.center.x + Math.cos(angle) * r
      const z = INDUSTRIAL_DISTRICT.center.z + Math.sin(angle) * r

      const gy = NeoTokyoMapSystem.heightAt(x, z)
      const tankR = 10 + sr(i * 5.7) * 8  // 半径10-18m
      const tankH = 15 + sr(i * 6.3) * 10  // 高さ15-25m

      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(tankR, tankR, tankH, 16),
        tankMat
      )
      tank.position.set(x, gy + tankH / 2, z)
      this.scene.add(tank)
      this.deco.push(tank)
    }

    // 貨物列車3編成（停止）
    const trainMat = new THREE.MeshLambertMaterial({ color: 0x2a2a3a })
    const locomotiveMat = new THREE.MeshLambertMaterial({
      color: 0x4a4a6a,
      emissive: 0x1a1a2a,
      emissiveIntensity: 0.2
    })

    const trainPaths = [
      { x: 1500, z: 2000, angle: 0, cars: 8 },
      { x: 2000, z: 1500, angle: Math.PI / 2, cars: 10 },
      { x: 2500, z: 2500, angle: Math.PI / 4, cars: 6 },
    ]

    for (const path of trainPaths) {
      const gy = NeoTokyoMapSystem.heightAt(path.x, path.z)

      // 機関車
      const locomotive = new THREE.Mesh(
        new THREE.BoxGeometry(8, 8, 15),
        locomotiveMat
      )
      locomotive.position.set(path.x, gy + 4, path.z)
      locomotive.rotation.y = path.angle
      this.scene.add(locomotive)
      this.deco.push(locomotive)

      // 貨車
      for (let i = 1; i <= path.cars; i++) {
        const offsetX = Math.cos(path.angle + Math.PI) * i * 18
        const offsetZ = Math.sin(path.angle + Math.PI) * i * 18

        const car = new THREE.Mesh(
          new THREE.BoxGeometry(7, 7, 16),
          trainMat
        )
        car.position.set(path.x + offsetX, gy + 3.5, path.z + offsetZ)
        car.rotation.y = path.angle
        this.scene.add(car)
        this.deco.push(car)
      }
    }

    console.log(`✅ Industrial district features: 10 factories, 50 warehouses, 15 cranes, 20 tanks, 3 cargo trains`)
  }

  buildSkyRing(R: number, Y: number, roadW: number, N: number, _deckMat: THREE.Material, railMat: THREE.Material): void {
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
    if (isSegmentInTubeReserve(x1, z1, x2, z2, 60) && Math.abs(y - 1220) > 100) return
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

  private buildCurvedSkyway(points: Array<{ x: number; z: number }>, y: number, w: number, railMat: THREE.Material): void {
    const innerRadius = Math.max(78, w * 1.72)
    const outerRadius = innerRadius + 30
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, y, p.z)), true, 'catmullrom', 0.35)
    const innerGlowMat = new THREE.MeshLambertMaterial({
      color: 0x65dcff,
      emissive: 0x18a8ff,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    })
    const sampleCount = 168
    const samples = curve.getSpacedPoints(sampleCount)

    const guideTube = new THREE.Mesh(new THREE.TubeGeometry(curve, 256, innerRadius * 0.12, 10, true), innerGlowMat)
    guideTube.name = 'NeoTokyoTubeInnerGuide'
    this.scene.add(guideTube)
    this.deco.push(guideTube)

    const isOpeningPoint = (p: THREE.Vector3): boolean => this.tubeOpenings.some(opening => {
      const ox = p.x - opening.x
      const oy = p.y - opening.y
      const oz = p.z - opening.z
      return Math.sqrt(ox * ox + oy * oy + oz * oz) < opening.radius
    })

    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]
      const b = samples[i + 1]
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
      const blockedByOpening = isOpeningPoint(a) || isOpeningPoint(b) || isOpeningPoint(mid)
      if (blockedByOpening) continue
      this.tubeCorridors.push({
        x1: a.x,
        z1: a.z,
        x2: b.x,
        z2: b.z,
        y,
        innerRadius,
        outerRadius,
        entrySpacing: 999999,
        entryLength: 0
      })
    }

    for (let i = 0; i < samples.length; i += 126) {
      const p = samples[i]
      const prev = samples[(i - 1 + samples.length) % samples.length]
      const next = samples[(i + 1) % samples.length]
      const axis = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(outerRadius + 5, 4, 8, 42), railMat)
      ring.position.copy(p)
      ring.quaternion.copy(q)
      ring.name = 'NeoTokyoTubeRib'
      this.scene.add(ring)
      this.deco.push(ring)

      const up = new THREE.Vector3(0, 1, 0)
      const side = new THREE.Vector3().crossVectors(up, axis).normalize()
      for (const s of [-1, 1]) {
        const wallStrip = new THREE.Mesh(new THREE.BoxGeometry(7, 70, 10), innerGlowMat)
        wallStrip.position.copy(p)
        wallStrip.position.addScaledVector(side, s * innerRadius * 0.74)
        wallStrip.position.y += innerRadius * 0.22
        wallStrip.quaternion.copy(q)
        wallStrip.name = 'NeoTokyoTubeInnerWallStrip'
        this.scene.add(wallStrip)
        this.deco.push(wallStrip)
      }

      if (i % 252 === 0) {
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(18, 12, 8), innerGlowMat)
        lamp.position.copy(p)
        lamp.position.y -= innerRadius * 0.48
        lamp.name = 'NeoTokyoTubeInnerLamp'
        this.scene.add(lamp)
        this.deco.push(lamp)
      }
    }
  }

  buildSkyway(x1: number, z1: number, x2: number, z2: number, y: number, w: number, _deckMat: THREE.Material, railMat: THREE.Material, showEntries = true): void {
    const dx = x2 - x1
    const dz = z2 - z1
    const len = Math.hypot(dx, dz)
    if (len < 1) return

    const innerRadius = Math.max(72, w * 1.72)
    const outerRadius = innerRadius + 28
    const entrySpacing = Math.max(860, innerRadius * 10.4)
    const entryLength = showEntries ? Math.max(280, innerRadius * 3.4) : 0
    this.tubeCorridors.push({ x1, z1, x2, z2, y, innerRadius, outerRadius, entrySpacing, entryLength })

    const axis = new THREE.Vector3(dx / len, 0, dz / len)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
    const ringQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
    const glowMat = railMat
    const innerMat = new THREE.MeshLambertMaterial({
      color: 0x65dcff,
      emissive: 0x18a8ff,
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    })
    const chunkLen = 220
    let cursor = 0
    while (cursor < len) {
      const slot = (cursor + chunkLen * 0.5) % entrySpacing
      if (entryLength > 0 && slot < entryLength) {
        cursor += chunkLen
        continue
      }
      const actualLen = Math.min(chunkLen, len - cursor)
      const t = (cursor + actualLen * 0.5) / len
      const cx = x1 + dx * t
      const cz = z1 + dz * t
      const nearOpening = this.tubeOpenings.some(opening => {
        const ox = cx - opening.x
        const oy = y - opening.y
        const oz = cz - opening.z
        return Math.sqrt(ox * ox + oy * oy + oz * oz) < opening.radius
      })
      if (nearOpening) {
        cursor += actualLen
        continue
      }
      const guide = new THREE.Mesh(new THREE.CylinderGeometry(innerRadius * 0.12, innerRadius * 0.12, actualLen, 10, 1), innerMat)
      guide.position.set(cx, y, cz)
      guide.quaternion.copy(q)
      guide.name = 'NeoTokyoTubeInnerGuide'
      this.scene.add(guide)
      this.deco.push(guide)

      for (const side of [-1, 1]) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(5, actualLen, 7), glowMat)
        strip.position.set(cx + Math.cos(Math.atan2(dz, dx) + Math.PI / 2) * side * outerRadius * 0.72, y - outerRadius * 0.52, cz + Math.sin(Math.atan2(dz, dx) + Math.PI / 2) * side * outerRadius * 0.72)
        strip.quaternion.copy(q)
        this.scene.add(strip)
        this.deco.push(strip)
      }
      cursor += actualLen
    }

    const ringCount = Math.max(2, Math.floor(len / 620))
    for (let i = 0; i <= ringCount; i++) {
      const t = i / ringCount
      const d = t * len
      if (entryLength > 0 && d % entrySpacing < entryLength) continue
      const rx = x1 + dx * t
      const rz = z1 + dz * t
      const nearOpening = this.tubeOpenings.some(opening => {
        const ox = rx - opening.x
        const oy = y - opening.y
        const oz = rz - opening.z
        return Math.sqrt(ox * ox + oy * oy + oz * oz) < opening.radius
      })
      if (nearOpening) continue
      const ring = new THREE.Mesh(new THREE.TorusGeometry(outerRadius + 5, 4, 8, 40), glowMat)
      ring.position.set(rx, y, rz)
      ring.quaternion.copy(ringQ)
      ring.name = 'NeoTokyoTubeRib'
      this.scene.add(ring)
      this.deco.push(ring)
    }

    if (showEntries) {
      for (let d = entryLength * 0.5; d < len; d += entrySpacing) {
        const t = d / len
        const ex = x1 + dx * t
        const ez = z1 + dz * t
        const gate = new THREE.Mesh(new THREE.TorusGeometry(innerRadius + 10, 4, 8, 36), glowMat)
        gate.position.set(ex, y, ez)
        gate.quaternion.copy(ringQ)
        gate.name = 'NeoTokyoTubeEntry'
        this.scene.add(gate)
        this.deco.push(gate)
      }
    }
  }

  createMegaPillars(): void {
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
      if (isInLandmarkZone(px, pz, 260) || isInWaterArea(px, pz) || isInTubeReserve(px, pz, 260)) return
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

  createMegaRings(): void {
    // 4 giant rings you can fly through
    const rings = [
      { x: 760, z: -760, r: 360, alt: 520, tube: 34, c: 0x0066ff, name: 'Marunouchi Flight Gate' },
      { x: -2900, z: -760, r: 380, alt: 720, tube: 36, c: 0x00ffcc, name: 'Shinjuku Outer Gate' },
      { x: 2680, z: 2600, r: 420, alt: 360, tube: 38, c: 0x00ddff, name: 'Odaiba Bay Gate' },
      { x: 2300, z: -1920, r: 300, alt: 980, tube: 30, c: 0x00ff88, name: 'Skytree Sky Gate' },
    ]
    for (const ring of rings) {
      if (isInTubeReserve(ring.x, ring.z, ring.r + 140)) continue
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

  createMegaArches(): void {
    // Giant arches connecting buildings
    const arches = [
      { x1: 820, z1: -740, x2: 1160, z2: -420, h: 620, c: 0x0088ff },
      { x1: -3300, z1: -650, x2: -2650, z2: -900, h: 680, c: 0x00ffcc },
      { x1: -1850, z1: 1200, x2: -1300, z2: 1700, h: 520, c: 0xff00aa },
      { x1: 2500, z1: 2550, x2: 3100, z2: 3000, h: 460, c: 0x00ddff },
      { x1: 2400, z1: -1850, x2: 3000, z2: -1500, h: 620, c: 0x00ff88 },
    ]
    for (const arch of arches) {
      if (isSegmentInTubeReserve(arch.x1, arch.z1, arch.x2, arch.z2, 220)) continue
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
      if (isInLandmarkZone(x, z, 160) || isInWaterArea(x, z) || isInTubeReserve(x, z, 260)) continue
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
      if (isInLandmarkZone(x, z, 160) || isInWaterArea(x, z) || isInTubeReserve(x, z, 240)) continue
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
      if (isInLandmarkZone(x, z, 160) || isInWaterArea(x, z) || isInTubeReserve(x, z, 280)) continue
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
    this.buildTokyoTower(-420, 2140)
    this.buildShinjukuCluster()
    this.buildTokyoStation(30, 20)
    this.buildRoppongiHills(-1000, 1000)
    this.buildAzabudaiHills(-850, 950)
    this.buildDietBuilding(-600, 700)
    this.buildFujiTV(2000, 2000)
    this.buildSensoji(1500, -1500)
  }

  private createNeoLandmarkExtensions(): void {
    this.extendTokyoTower(-420, 2140)
    this.extendSkytree(1600, -1400)
    this.extendRainbowBridge()
    this.extendFujiTV(2000, 2000)
    this.extendSensoji(1500, -1500)
  }

  private extendTokyoTower(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff3300, emissive: 0xff1100, emissiveIntensity: 2.2 })
    const ringMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xff5533, emissiveIntensity: 1.8 })
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
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x88ccff, emissive: 0x2277ff, emissiveIntensity: 1.5 })
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
    const pathMat = new THREE.MeshLambertMaterial({ color: 0x552211, emissive: 0xff5522, emissiveIntensity: 0.8 })
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
      if (isInTubeReserve(p.x, p.z, 160)) return
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
    const bridgeYaw = -Math.atan2(dz, dx)
    const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2
    const concMat  = new THREE.MeshLambertMaterial({ color: 0xaeb8c4, emissive: 0x152032, emissiveIntensity: 0.32 })
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x182230, emissive: 0x0a1424, emissiveIntensity: 0.55 })
    const cableMat = new THREE.MeshLambertMaterial({ color: 0xd9e8f6, emissive: 0x24445c, emissiveIntensity: 0.45 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0x9beeff, emissive: 0x44cfff, emissiveIntensity: 2.2 })
    const magentaMat = new THREE.MeshLambertMaterial({ color: 0xff55aa, emissive: 0xff2299, emissiveIntensity: 1.8 })
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len + 420, 14, 96), darkMat)
    deck.position.set(midX, DECK_Y + 7, midZ); deck.rotation.y = bridgeYaw
    this.scene.add(deck); this.deco.push(deck)
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 440, 5, 4), side > 0 ? neonMat : magentaMat)
      rail.position.set(midX + Math.cos(angle) * side * 49, DECK_Y + 19, midZ - Math.sin(angle) * side * 49)
      rail.rotation.y = bridgeYaw; this.scene.add(rail); this.deco.push(rail)
    }
    for (const t of [0.28, 0.72]) {
      const tx = x1 + dx * t, tz = z1 + dz * t
      const tgy = NeoTokyoMapSystem.heightAt(tx, tz)
      const towG = new THREE.Group(); towG.position.set(tx, tgy, tz); towG.rotation.y = bridgeYaw
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
    for (const t of [0.5]) {
      const gx = x1 + dx * t, gz = z1 + dz * t
      const gate = new THREE.Group()
      gate.position.set(gx, DECK_Y + 78, gz)
      gate.rotation.y = bridgeYaw
      const ring = new THREE.Mesh(new THREE.TorusGeometry(92, 5, 8, 42), neonMat)
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

  private createRainbowBridgeAscentTube(): void {
    const railMat = new THREE.MeshLambertMaterial({ color: 0x73e8ff, emissive: 0x18b7ff, emissiveIntensity: 1.25 })
    const amberMat = new THREE.MeshLambertMaterial({ color: 0xffb15c, emissive: 0xff7a24, emissiveIntensity: 1.05 })
    const shellMat = new THREE.MeshLambertMaterial({
      color: 0x263f58,
      emissive: 0x123653,
      emissiveIntensity: 0.85,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    const innerMat = new THREE.MeshLambertMaterial({
      color: 0x31516c,
      emissive: 0x123a5c,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    const points = [
      new THREE.Vector3(1560, 340, 1450),
      new THREE.Vector3(1320, 660, 1160),
      new THREE.Vector3(980, 980, 760),
      new THREE.Vector3(620, 1320, 360),
      new THREE.Vector3(520, 1680, -160),
    ]
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.32)
    const innerRadius = 170
    const outerRadius = 230
    const samples = curve.getSpacedPoints(42)

    this.tubeOpenings.push({ x: points[0].x, y: points[0].y, z: points[0].z, radius: 320 })
    this.tubeOpenings.push({ x: points[points.length - 1].x, y: points[points.length - 1].y, z: points[points.length - 1].z, radius: 320 })

    const guide = new THREE.Mesh(new THREE.TubeGeometry(curve, 128, innerRadius * 0.08, 10, false), innerMat)
    guide.name = 'NeoTokyoRainbowAscentTubeGuide'
    this.scene.add(guide)
    this.deco.push(guide)

    const shell = new THREE.Mesh(new THREE.TubeGeometry(curve, 128, outerRadius, 18, false), shellMat)
    shell.name = 'NeoTokyoRainbowAscentTubeShell'
    this.scene.add(shell)
    this.deco.push(shell)

    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i]
      const b = samples[i + 1]
      this.tubeCorridors.push({
        x1: a.x,
        z1: a.z,
        x2: b.x,
        z2: b.z,
        y: a.y,
        y2: b.y,
        innerRadius,
        outerRadius,
        entrySpacing: 999999,
        entryLength: 0
      })

      const dir = new THREE.Vector3().subVectors(b, a)
      const len = dir.length()
      if (len < 1) continue
      const axis = dir.clone().normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis)
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
      const side = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), axis)
      if (side.lengthSq() < 0.001) side.set(1, 0, 0)
      side.normalize()
      const up = new THREE.Vector3().crossVectors(axis, side).normalize()

      for (const [offset, mat] of [
        [side.clone().multiplyScalar(outerRadius * 0.74), railMat],
        [side.clone().multiplyScalar(-outerRadius * 0.74), railMat],
        [up.clone().multiplyScalar(outerRadius * 0.74), amberMat],
      ] as Array<[THREE.Vector3, THREE.Material]>) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, len, 8), mat)
        rail.position.copy(mid).add(offset)
        rail.quaternion.copy(q)
        rail.name = 'NeoTokyoRainbowAscentTubeRail'
        this.scene.add(rail)
        this.deco.push(rail)
      }
    }

    for (let i = 0; i < samples.length; i += 6) {
      const p = samples[i]
      const prev = samples[Math.max(0, i - 1)]
      const next = samples[Math.min(samples.length - 1, i + 1)]
      const axis = new THREE.Vector3().subVectors(next, prev).normalize()
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(outerRadius, 8, 8, 48), i % 12 === 0 ? amberMat : railMat)
      ring.position.copy(p)
      ring.quaternion.copy(q)
      ring.name = 'NeoTokyoRainbowAscentTubeRib'
      this.scene.add(ring)
      this.deco.push(ring)
    }
  }

  // 山手線 elevated loop
  createYamanoteLine(): void {
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

  createHighways(): void {
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
      if (i % 10 === 0) {
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

  private createUndergroundStructure(): void {
    // Tokyo地下5層構造
    const undergroundMat = new THREE.MeshLambertMaterial({ color: 0x222222, emissive: 0x333333, emissiveIntensity: 0.3 })
    const glowMat = new THREE.MeshLambertMaterial({ color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 1.0 })

    // B1層（-10m）: 商業施設、駐車場
    const b1Areas = [
      { x: 0, z: 0, w: 800, d: 800 },
      { x: 1000, z: 0, w: 600, d: 600 },
      { x: -1000, z: 0, w: 600, d: 600 },
      { x: 0, z: 1000, w: 500, d: 500 },
      { x: 0, z: -1000, w: 500, d: 500 },
    ]

    for (const area of b1Areas) {
      const floor = new THREE.Mesh(
        new THREE.BoxGeometry(area.w, 1, area.d),
        undergroundMat
      )
      floor.position.set(area.x, -10, area.z)
      this.scene.add(floor)
      this.deco.push(floor)

      // 柱×16
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const pillar = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 2, 8, 8),
            undergroundMat
          )
          pillar.position.set(
            area.x + (i - 1.5) * area.w / 4,
            -10 + 4,
            area.z + (j - 1.5) * area.d / 4
          )
          this.scene.add(pillar)
          this.deco.push(pillar)
        }
      }
    }

    // B2層（-20m）: 地下鉄駅、通路
    const b2Tunnels = [
      { x1: -1500, z1: 0, x2: 1500, z2: 0 },  // 東西線
      { x1: 0, z1: -1500, x2: 0, z2: 1500 },  // 南北線
    ]

    for (const tunnel of b2Tunnels) {
      const length = Math.hypot(tunnel.x2 - tunnel.x1, tunnel.z2 - tunnel.z1)
      const midX = (tunnel.x1 + tunnel.x2) / 2
      const midZ = (tunnel.z1 + tunnel.z2) / 2
      const angle = Math.atan2(tunnel.z2 - tunnel.z1, tunnel.x2 - tunnel.x1)

      const tunnelMesh = new THREE.Mesh(
        new THREE.BoxGeometry(length, 6, 15),
        undergroundMat
      )
      tunnelMesh.position.set(midX, -20, midZ)
      tunnelMesh.rotation.y = angle
      this.scene.add(tunnelMesh)
      this.deco.push(tunnelMesh)

      // 照明×20
      for (let i = 0; i < 20; i++) {
        const t = i / 19
        const light = new THREE.Mesh(
          new THREE.BoxGeometry(2, 0.5, 2),
          glowMat
        )
        light.position.set(
          tunnel.x1 + (tunnel.x2 - tunnel.x1) * t,
          -17,
          tunnel.z1 + (tunnel.z2 - tunnel.z1) * t
        )
        this.scene.add(light)
        this.deco.push(light)
      }
    }

    // B3層（-30m）: 下水道、配管
    const b3Pipes = [
      { x: -800, z: -800, x2: 800, z2: -800 },
      { x: -800, z: 800, x2: 800, z2: 800 },
      { x: -800, z: -800, x2: -800, z2: 800 },
      { x: 800, z: -800, x2: 800, z2: 800 },
    ]

    for (const pipe of b3Pipes) {
      const length = Math.hypot(pipe.x2 - pipe.x, pipe.z2 - pipe.z)
      const midX = (pipe.x + pipe.x2) / 2
      const midZ = (pipe.z + pipe.z2) / 2
      const angle = Math.atan2(pipe.z2 - pipe.z, pipe.x2 - pipe.x)

      const pipeMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 5, length, 12),
        new THREE.MeshLambertMaterial({ color: 0x444444 })
      )
      pipeMesh.position.set(midX, -30, midZ)
      pipeMesh.rotation.set(0, 0, angle + Math.PI / 2)
      this.scene.add(pipeMesh)
      this.deco.push(pipeMesh)
    }

    // B4層（-40m）: シェルター
    const shelters = [
      { x: 0, z: 0, r: 100 },
      { x: -500, z: -500, r: 60 },
      { x: 500, z: -500, r: 60 },
      { x: -500, z: 500, r: 60 },
      { x: 500, z: 500, r: 60 },
    ]

    for (const shelter of shelters) {
      const shelterMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(shelter.r, shelter.r, 8, 24),
        new THREE.MeshLambertMaterial({ color: 0x555555 })
      )
      shelterMesh.position.set(shelter.x, -40, shelter.z)
      this.scene.add(shelterMesh)
      this.deco.push(shelterMesh)

      // 入口標識
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(10, 3, 1),
        glowMat
      )
      sign.position.set(shelter.x, -36, shelter.z + shelter.r)
      this.scene.add(sign)
      this.deco.push(sign)
    }

    // B5層（-50m）: 秘密施設（隠しエリア）
    const secretFacility = new THREE.Mesh(
      new THREE.BoxGeometry(200, 10, 150),
      new THREE.MeshLambertMaterial({ color: 0x111111, emissive: 0x220000, emissiveIntensity: 0.5 })
    )
    secretFacility.position.set(-500, -50, 300)
    this.scene.add(secretFacility)
    this.deco.push(secretFacility)

    // アクセストンネル（B1→B5）
    const accessShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 8, 40, 12),
      undergroundMat
    )
    accessShaft.position.set(-500, -30, 300)
    this.scene.add(accessShaft)
    this.deco.push(accessShaft)

    console.log('✅ Tokyo underground structure created (5 layers, B1-B5)')

    // ===== 隠しエリア（Hidden Areas - 10箇所） =====
    const hiddenMat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: 0xff8800,
      emissiveIntensity: 0.6,
      metalness: 0.3,
      roughness: 0.4
    })

    const HIDDEN_AREAS_TOKYO = [
      { name: 'Mega Tower最上階の秘密ルーム', x: 0, y: 780, z: 0, size: 20 },
      { name: '地下B5の秘密施設', x: -500, y: -50, z: 300, size: 15 },
      { name: '高架道路下の隠し空間', x: 0, y: 50, z: -1500, size: 18 },
      { name: '廃ビルの屋上庭園', x: -800, y: 250, z: 600, size: 16 },
      { name: '地下鉄の封鎖区間', x: 600, y: -20, z: -800, size: 14 },
      { name: '工場の秘密倉庫', x: 2000, y: 20, z: 2000, size: 17 },
      { name: 'Rainbow Bridge中空構造', x: 1500, y: 100, z: 0, size: 13 },
      { name: '下水道の拡張部', x: -1200, y: -30, z: -600, size: 12 },
      { name: '放棄されたヘリポート', x: 1000, y: 400, z: -1000, size: 15 },
      { name: '皇居の地下', x: 800, y: -40, z: -200, size: 19 },
    ]

    for (const area of HIDDEN_AREAS_TOKYO) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(area.size, 12, 12),
        hiddenMat
      )
      marker.position.set(area.x, area.y, area.z)
      marker.name = `HiddenArea_${area.name}`
      this.scene.add(marker)
      this.deco.push(marker)
    }

    console.log('✅ Hidden areas created (10 locations in Tokyo MAP)')

    // ===== 中型ランドマーク（Mid-size Landmarks - 7個、300-634m級） =====
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0xdd6633,
      metalness: 0.7,
      roughness: 0.4,
      emissive: 0x442200,
      emissiveIntensity: 0.2
    })

    const buildingMat = new THREE.MeshLambertMaterial({
      color: 0x3a4a5a,
      emissive: 0x1a2a3a,
      emissiveIntensity: 0.3
    })

    // 1. 東京タワー（333m）
    const TOKYO_TOWER = { x: -1500, z: 800, height: 333 }
    const tokyoTower = new THREE.Mesh(
      new THREE.CylinderGeometry(15, 30, TOKYO_TOWER.height, 4),
      towerMat
    )
    const towerY = NeoTokyoMapSystem.heightAt(TOKYO_TOWER.x, TOKYO_TOWER.z)
    tokyoTower.position.set(TOKYO_TOWER.x, towerY + TOKYO_TOWER.height / 2, TOKYO_TOWER.z)
    tokyoTower.name = 'TokyoTower'
    this.scene.add(tokyoTower)
    this.deco.push(tokyoTower)

    // 2. スカイツリー（634m）
    const SKYTREE = { x: 2000, z: -1000, height: 634 }
    const skytree = new THREE.Mesh(
      new THREE.CylinderGeometry(20, 35, SKYTREE.height, 3),
      new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0x4444ff,
        emissiveIntensity: 0.15
      })
    )
    const skytreeY = NeoTokyoMapSystem.heightAt(SKYTREE.x, SKYTREE.z)
    skytree.position.set(SKYTREE.x, skytreeY + SKYTREE.height / 2, SKYTREE.z)
    skytree.name = 'Skytree'
    this.scene.add(skytree)
    this.deco.push(skytree)

    // 3. 巨大競技場（Stadium, 高さ80m、直径400m）
    const STADIUM = { x: -2500, z: -2000, radius: 200, height: 80 }
    const stadiumOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(STADIUM.radius, STADIUM.radius, STADIUM.height, 32),
      buildingMat
    )
    const stadiumY = NeoTokyoMapSystem.heightAt(STADIUM.x, STADIUM.z)
    stadiumOuter.position.set(STADIUM.x, stadiumY + STADIUM.height / 2, STADIUM.z)
    this.scene.add(stadiumOuter)
    this.deco.push(stadiumOuter)

    // 競技場の屋根
    const stadiumRoof = new THREE.Mesh(
      new THREE.RingGeometry(STADIUM.radius * 0.6, STADIUM.radius, 32),
      new THREE.MeshLambertMaterial({ color: 0x666666 })
    )
    stadiumRoof.position.set(STADIUM.x, stadiumY + STADIUM.height, STADIUM.z)
    stadiumRoof.rotation.x = -Math.PI / 2
    this.scene.add(stadiumRoof)
    this.deco.push(stadiumRoof)

    // 4. 超高層ツインタワー（450m×2）
    const TWIN_TOWERS = { x: 1000, z: 1500, height: 450, spacing: 120 }
    for (let side of [-1, 1]) {
      const twinTower = new THREE.Mesh(
        new THREE.BoxGeometry(60, TWIN_TOWERS.height, 60),
        buildingMat
      )
      const twinY = NeoTokyoMapSystem.heightAt(TWIN_TOWERS.x + side * TWIN_TOWERS.spacing / 2, TWIN_TOWERS.z)
      twinTower.position.set(
        TWIN_TOWERS.x + side * TWIN_TOWERS.spacing / 2,
        twinY + TWIN_TOWERS.height / 2,
        TWIN_TOWERS.z
      )
      twinTower.name = 'TwinTower'
      this.scene.add(twinTower)
      this.deco.push(twinTower)
    }

    // 5. 廃墟化した展望ビル（380m）
    const OBSERVATION_BUILDING = { x: -1000, z: -1500, height: 380 }
    const obsBuilding = new THREE.Mesh(
      new THREE.CylinderGeometry(40, 35, OBSERVATION_BUILDING.height, 8),
      new THREE.MeshLambertMaterial({
        color: 0x555555,
        emissive: 0x222222,
        emissiveIntensity: 0.1
      })
    )
    const obsY = NeoTokyoMapSystem.heightAt(OBSERVATION_BUILDING.x, OBSERVATION_BUILDING.z)
    obsBuilding.position.set(OBSERVATION_BUILDING.x, obsY + OBSERVATION_BUILDING.height / 2, OBSERVATION_BUILDING.z)
    this.scene.add(obsBuilding)
    this.deco.push(obsBuilding)

    // 6. 傾いた超高層ビル（420m、15度傾斜）
    const TILTED_BUILDING = { x: 1800, z: 500, height: 420, tilt: Math.PI / 12 }
    const tiltedBuilding = new THREE.Mesh(
      new THREE.BoxGeometry(50, TILTED_BUILDING.height, 50),
      new THREE.MeshLambertMaterial({
        color: 0x4a4a5a,
        emissive: 0x2a1a1a,
        emissiveIntensity: 0.2
      })
    )
    const tiltedY = NeoTokyoMapSystem.heightAt(TILTED_BUILDING.x, TILTED_BUILDING.z)
    tiltedBuilding.position.set(TILTED_BUILDING.x, tiltedY + TILTED_BUILDING.height / 2, TILTED_BUILDING.z)
    tiltedBuilding.rotation.z = TILTED_BUILDING.tilt
    tiltedBuilding.name = 'TiltedBuilding'
    this.scene.add(tiltedBuilding)
    this.deco.push(tiltedBuilding)

    // 7. 巨大ドーム（高さ150m、直径500m）
    const DOME = { x: -2000, z: 2500, radius: 250, height: 150 }
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME.radius, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 0.6,
        roughness: 0.4,
        transparent: true,
        opacity: 0.8
      })
    )
    const domeY = NeoTokyoMapSystem.heightAt(DOME.x, DOME.z)
    dome.position.set(DOME.x, domeY, DOME.z)
    dome.name = 'GiantDome'
    this.scene.add(dome)
    this.deco.push(dome)

    console.log('✅ Mid-size landmarks created (7 landmarks: Tokyo Tower, Skytree, Stadium, Twin Towers, Observation Building, Tilted Building, Giant Dome)')

    // ===== 細部ディテール（Urban Details） =====
    const signMat = new THREE.MeshLambertMaterial({ color: 0x666666 })
    const trafficLightMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x885533 })
    const vendingMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x440000, emissiveIntensity: 0.2 })
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x888888, emissive: 0x444444, emissiveIntensity: 0.3 })

    // 道路標識500個
    const signCount = this.mobile ? 200 : 500
    for (let i = 0; i < signCount; i++) {
      const sx = (Math.random() - 0.5) * 8000
      const sz = (Math.random() - 0.5) * 8000
      if (isInWaterArea(sx, sz)) continue

      const gy = NeoTokyoMapSystem.heightAt(sx, sz)
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 5, 6),
        signMat
      )
      pole.position.set(sx, gy + 2.5, sz)
      this.scene.add(pole)
      this.deco.push(pole)

      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1, 0.1),
        signMat
      )
      sign.position.set(sx, gy + 5, sz)
      sign.rotation.y = Math.random() * Math.PI * 2
      this.scene.add(sign)
      this.deco.push(sign)
    }

    // 信号機300個
    const trafficLightCount = this.mobile ? 120 : 300
    for (let i = 0; i < trafficLightCount; i++) {
      const tx = (Math.random() - 0.5) * 8000
      const tz = (Math.random() - 0.5) * 8000
      if (isInWaterArea(tx, tz)) continue

      const gy = NeoTokyoMapSystem.heightAt(tx, tz)
      const trafficLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 2, 0.4),
        trafficLightMat
      )
      trafficLight.position.set(tx, gy + 6, tz)
      this.scene.add(trafficLight)
      this.deco.push(trafficLight)
    }

    // ベンチ200個
    const benchCount = this.mobile ? 80 : 200
    for (let i = 0; i < benchCount; i++) {
      const bx = (Math.random() - 0.5) * 7000
      const bz = (Math.random() - 0.5) * 7000
      if (isInWaterArea(bx, bz)) continue

      const gy = NeoTokyoMapSystem.heightAt(bx, bz)
      const bench = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.5, 1),
        benchMat
      )
      bench.position.set(bx, gy + 0.5, bz)
      bench.rotation.y = Math.random() * Math.PI * 2
      this.scene.add(bench)
      this.deco.push(bench)
    }

    // ゴミ箱400個
    const trashCount = this.mobile ? 160 : 400
    for (let i = 0; i < trashCount; i++) {
      const gx = (Math.random() - 0.5) * 8000
      const gz = (Math.random() - 0.5) * 8000
      if (isInWaterArea(gx, gz)) continue

      const gy = NeoTokyoMapSystem.heightAt(gx, gz)
      const trash = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1, 8),
        new THREE.MeshLambertMaterial({ color: 0x444444 })
      )
      trash.position.set(gx, gy + 0.5, gz)
      this.scene.add(trash)
      this.deco.push(trash)
    }

    // 自動販売機150台
    const vendingCount = this.mobile ? 60 : 150
    for (let i = 0; i < vendingCount; i++) {
      const vx = (Math.random() - 0.5) * 7000
      const vz = (Math.random() - 0.5) * 7000
      if (isInWaterArea(vx, vz)) continue

      const gy = NeoTokyoMapSystem.heightAt(vx, vz)
      const vending = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 2, 0.8),
        vendingMat
      )
      vending.position.set(vx, gy + 1, vz)
      vending.rotation.y = Math.random() * Math.PI * 2
      this.scene.add(vending)
      this.deco.push(vending)
    }

    // 自転車100台
    const bicycleCount = this.mobile ? 40 : 100
    for (let i = 0; i < bicycleCount; i++) {
      const bcx = (Math.random() - 0.5) * 7000
      const bcz = (Math.random() - 0.5) * 7000
      if (isInWaterArea(bcx, bcz)) continue

      const gy = NeoTokyoMapSystem.heightAt(bcx, bcz)
      const bicycle = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1, 0.3),
        new THREE.MeshLambertMaterial({ color: 0x4488ff })
      )
      bicycle.position.set(bcx, gy + 0.5, bcz)
      bicycle.rotation.y = Math.random() * Math.PI * 2
      this.scene.add(bicycle)
      this.deco.push(bicycle)
    }

    // 駐車車両500台
    const parkedCarCount = this.mobile ? 200 : 500
    for (let i = 0; i < parkedCarCount; i++) {
      const pcx = (Math.random() - 0.5) * 8000
      const pcz = (Math.random() - 0.5) * 8000
      if (isInWaterArea(pcx, pcz)) continue

      const gy = NeoTokyoMapSystem.heightAt(pcx, pcz)
      const car = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1.5, 2),
        new THREE.MeshLambertMaterial({ color: Math.random() > 0.5 ? 0x333333 : 0x666666 })
      )
      car.position.set(pcx, gy + 0.75, pcz)
      car.rotation.y = Math.random() * Math.PI * 2
      this.scene.add(car)
      this.deco.push(car)
    }

    // 街灯800本
    const streetLampCount = this.mobile ? 320 : 800
    for (let i = 0; i < streetLampCount; i++) {
      const lx = (Math.random() - 0.5) * 8000
      const lz = (Math.random() - 0.5) * 8000
      if (isInWaterArea(lx, lz)) continue

      const gy = NeoTokyoMapSystem.heightAt(lx, lz)
      const lampPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 8, 8),
        lampMat
      )
      lampPole.position.set(lx, gy + 4, lz)
      this.scene.add(lampPole)
      this.deco.push(lampPole)

      const lampHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 8, 8),
        lampMat
      )
      lampHead.position.set(lx, gy + 8, lz)
      this.scene.add(lampHead)
      this.deco.push(lampHead)
    }

    // 電柱600本
    const poleCount = this.mobile ? 240 : 600
    for (let i = 0; i < poleCount; i++) {
      const px = (Math.random() - 0.5) * 8000
      const pz = (Math.random() - 0.5) * 8000
      if (isInWaterArea(px, pz)) continue

      const gy = NeoTokyoMapSystem.heightAt(px, pz)
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0x5a4a3a })
      )
      pole.position.set(px, gy + 5, pz)
      this.scene.add(pole)
      this.deco.push(pole)
    }

    // 瓦礫の山200個
    const rubbleCount = this.mobile ? 80 : 200
    for (let i = 0; i < rubbleCount; i++) {
      const rx = (Math.random() - 0.5) * 8000
      const rz = (Math.random() - 0.5) * 8000
      if (isInWaterArea(rx, rz)) continue

      const gy = NeoTokyoMapSystem.heightAt(rx, rz)
      const rubble = new THREE.Mesh(
        new THREE.DodecahedronGeometry(3 + Math.random() * 3, 0),
        new THREE.MeshLambertMaterial({ color: 0x666666 })
      )
      rubble.position.set(rx, gy + 2, rz)
      rubble.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
      this.scene.add(rubble)
      this.deco.push(rubble)
    }

    console.log('✅ Urban details added (500 signs, 300 traffic lights, 200 benches, 400 trash cans, 150 vending machines, 100 bicycles, 500 cars, 800 lamps, 600 poles, 200 rubble)')

    // ===== 外周エリアの詳細化（Outer Area Details, 3500-8600m圏） =====
    const suburbanMat = new THREE.MeshLambertMaterial({
      color: 0x4a5a6a,
      emissive: 0x1a2a3a,
      emissiveIntensity: 0.15
    })

    // 郊外住宅地（低層、2-5階）
    const SUBURBAN_AREAS = [
      { centerX: -6000, centerZ: -6000, radius: 2000, buildings: this.mobile ? 200 : 500 },
      { centerX: 6000, centerZ: 6000, radius: 2000, buildings: this.mobile ? 160 : 400 },
    ]

    for (const area of SUBURBAN_AREAS) {
      for (let i = 0; i < area.buildings; i++) {
        const angle = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * area.radius
        const sx = area.centerX + Math.cos(angle) * r
        const sz = area.centerZ + Math.sin(angle) * r

        if (isInWaterArea(sx, sz)) continue

        const gy = NeoTokyoMapSystem.heightAt(sx, sz)
        const floors = 2 + Math.floor(Math.random() * 4)  // 2-5階
        const h = floors * 3.5

        const house = new THREE.Mesh(
          new THREE.BoxGeometry(12 + Math.random() * 8, h, 10 + Math.random() * 6),
          suburbanMat
        )
        house.position.set(sx, gy + h / 2, sz)
        house.rotation.y = Math.random() * Math.PI * 2
        this.scene.add(house)
        this.deco.push(house)
      }
    }

    // 工業地帯拡張
    const EXTENDED_INDUSTRIAL = [
      { centerX: 5000, centerZ: 5000, factories: 15, warehouses: 80 },
      { centerX: 6000, centerZ: -5000, factories: 10, warehouses: 60 },
    ]

    const factoryExtMat = new THREE.MeshLambertMaterial({ color: 0x3a3a3a })

    for (const area of EXTENDED_INDUSTRIAL) {
      // 工場
      for (let i = 0; i < area.factories; i++) {
        const fx = area.centerX + (Math.random() - 0.5) * 1500
        const fz = area.centerZ + (Math.random() - 0.5) * 1500

        if (isInWaterArea(fx, fz)) continue

        const gy = NeoTokyoMapSystem.heightAt(fx, fz)
        const fh = 25 + Math.random() * 20

        const factory = new THREE.Mesh(
          new THREE.BoxGeometry(60 + Math.random() * 40, fh, 50 + Math.random() * 30),
          factoryExtMat
        )
        factory.position.set(fx, gy + fh / 2, fz)
        this.scene.add(factory)
        this.deco.push(factory)
      }

      // 倉庫
      for (let i = 0; i < area.warehouses; i++) {
        const wx = area.centerX + (Math.random() - 0.5) * 2000
        const wz = area.centerZ + (Math.random() - 0.5) * 2000

        if (isInWaterArea(wx, wz)) continue

        const gy = NeoTokyoMapSystem.heightAt(wx, wz)
        const wh = 10 + Math.random() * 8

        const warehouse = new THREE.Mesh(
          new THREE.BoxGeometry(20 + Math.random() * 15, wh, 15 + Math.random() * 10),
          new THREE.MeshLambertMaterial({ color: 0x4a4a4a })
        )
        warehouse.position.set(wx, gy + wh / 2, wz)
        this.scene.add(warehouse)
        this.deco.push(warehouse)
      }
    }

    // 港湾エリア
    const PORT_AREA = { x: -7000, z: 5000 }
    const portMat = new THREE.MeshLambertMaterial({ color: 0x555555 })

    // コンテナヤード（200個）
    const containerCount = this.mobile ? 80 : 200
    for (let i = 0; i < containerCount; i++) {
      const cx = PORT_AREA.x + (Math.random() - 0.5) * 1000
      const cz = PORT_AREA.z + (Math.random() - 0.5) * 800

      const gy = NeoTokyoMapSystem.heightAt(cx, cz)
      const container = new THREE.Mesh(
        new THREE.BoxGeometry(12, 2.5, 2.5),
        new THREE.MeshLambertMaterial({
          color: Math.random() > 0.5 ? 0xff4444 : 0x4444ff
        })
      )
      container.position.set(cx, gy + 1.25, cz)
      container.rotation.y = Math.random() * Math.PI * 2
      this.scene.add(container)
      this.deco.push(container)
    }

    // クレーン20基
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xff8800, metalness: 0.7, roughness: 0.4 })
    for (let i = 0; i < 20; i++) {
      const crx = PORT_AREA.x + (Math.random() - 0.5) * 1200
      const crz = PORT_AREA.z + (Math.random() - 0.5) * 1000

      const gy = NeoTokyoMapSystem.heightAt(crx, crz)
      const craneH = 40 + Math.random() * 20

      const cranePole = new THREE.Mesh(
        new THREE.BoxGeometry(5, craneH, 5),
        craneMat
      )
      cranePole.position.set(crx, gy + craneH / 2, crz)
      this.scene.add(cranePole)
      this.deco.push(cranePole)
    }

    // 倉庫50棟
    for (let i = 0; i < 50; i++) {
      const whx = PORT_AREA.x + (Math.random() - 0.5) * 1500
      const whz = PORT_AREA.z + (Math.random() - 0.5) * 1200

      const gy = NeoTokyoMapSystem.heightAt(whx, whz)
      const warehouse = new THREE.Mesh(
        new THREE.BoxGeometry(30 + Math.random() * 20, 15, 25 + Math.random() * 15),
        portMat
      )
      warehouse.position.set(whx, gy + 7.5, whz)
      this.scene.add(warehouse)
      this.deco.push(warehouse)
    }

    // 山岳部（西側）
    const WESTERN_MOUNTAINS = [
      { x: -7000, z: -3000, height: 600 },
      { x: -7500, z: 0, height: 800 },
      { x: -7000, z: 3000, height: 700 },
    ]

    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.9 })

    for (const mt of WESTERN_MOUNTAINS) {
      const mountain = new THREE.Mesh(
        new THREE.ConeGeometry(300, mt.height, 8),
        mountainMat
      )
      mountain.position.set(mt.x, mt.height / 2, mt.z)
      this.scene.add(mountain)
      this.deco.push(mountain)
    }

    console.log('✅ Outer area details added (900 suburban buildings, 235 industrial structures, 270 port facilities, 3 mountains)')
  }

}
