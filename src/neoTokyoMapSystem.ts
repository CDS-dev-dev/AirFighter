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

const BTYPE = [
  { bg: [5,  12, 22] as RGB, win: [0,   255, 200] as RGB, cols: 7, rows: 14, em: 0x00aa77 }, // 0 Shinjuku Cyber
  { bg: [10, 15, 30] as RGB, win: [100, 180, 255] as RGB, cols: 8, rows: 16, em: 0x0033aa }, // 1 Marunouchi Steel
  { bg: [8,   0, 18] as RGB, win: [255,  50, 185] as RGB, cols: 5, rows: 10, em: 0xaa0077 }, // 2 Kabukicho Neon
  { bg: [18, 12,  5] as RGB, win: [255, 210,  80] as RGB, cols: 6, rows: 12, em: 0x664400 }, // 3 Residential
  { bg: [0,  12, 25] as RGB, win: [0,   220, 255] as RGB, cols: 6, rows: 12, em: 0x005588 }, // 4 Odaiba Aqua
  { bg: [22, 10,  5] as RGB, win: [255, 140,  20] as RGB, cols: 4, rows:  8, em: 0x883300 }, // 5 Industrial
]

// Yamanote Line waypoints — clockwise loop around central Tokyo
const YAMANOTE_WP = [
  { x:  50, z:  -30 }, { x:  60, z:  180 }, { x: 100, z:  370 },
  { x: 110, z:  600 }, { x: 100, z:  780 }, { x: -80, z:  800 },
  { x: -240, z: 670 }, { x: -360, z: 560 }, { x: -500, z: 460 },
  { x: -620, z: 310 }, { x: -700, z: 120 }, { x: -760, z: -80 },
  { x: -780, z: -420 }, { x: -710, z: -680 }, { x: -510, z: -800 },
  { x: -220, z: -840 }, { x:  110, z: -790 }, { x:  160, z: -620 },
  { x:  200, z: -430 }, { x:  210, z: -260 }, { x:  160, z: -120 },
  { x:  50, z:  -30 }, // close loop
]

export class NeoTokyoMapSystem {
  private scene: THREE.Scene
  private mobile: boolean
  private terrainMesh: THREE.Mesh | null = null
  private instancedMeshes: THREE.InstancedMesh[] = []
  private landmarks: THREE.Object3D[] = []
  private deco: THREE.Object3D[] = []

  constructor(scene: THREE.Scene, isMobile = false) {
    this.scene = scene
    this.mobile = isMobile
  }

  async initialize(): Promise<void> {
    this.createTerrain()
    this.createBuildings()
    this.createLandmarks()
    this.createImperialPalace()
    this.buildRainbowBridge()
    if (!this.mobile) {
      this.createYamanoteLine()
      this.createHighways()
    }
    this.createHolograms()
    this.createWater()
  }

  static heightAt(x: number, z: number): number {
    let h = 45 - x * 0.016
    h += 45 * Math.exp(-((x + 650) ** 2 / 260000 + z ** 2 / 220000))
    h += 24 * Math.exp(-((x + 450) ** 2 / 200000 + (z - 520) ** 2 / 180000))
    h += 18 * Math.exp(-((x - 200) ** 2 / 130000 + (z + 480) ** 2 / 110000))
    h -= 28 * Math.exp(-((x - 850) ** 2 / 380000 + (z - 900) ** 2 / 330000))
    h += Math.sin(x * 0.0025) * Math.cos(z * 0.003) * 8
    h += Math.sin(x * 0.007) * Math.sin(z * 0.006) * 4
    const bayDrop = z - 2200
    if (bayDrop > 0) h -= bayDrop * 0.02
    return Math.max(0, h)
  }

  getTerrainHeight(x: number, z: number): number { return NeoTokyoMapSystem.heightAt(x, z) }
  getSafeSpawnPosition(): { x: number; y: number; z: number } { return { x: 0, y: 900, z: -2200 } }
  getCollisionObjects(): THREE.Object3D[] { return [...this.landmarks] }

  cleanup(): void {
    if (this.terrainMesh) { this.scene.remove(this.terrainMesh); this.terrainMesh = null }
    for (const m of this.instancedMeshes) this.scene.remove(m)
    this.instancedMeshes.length = 0
    for (const l of this.landmarks) this.scene.remove(l)
    this.landmarks.length = 0
    for (const d of this.deco) this.scene.remove(d)
    this.deco.length = 0
  }

  // ===== TERRAIN =====

  private createTerrain(): void {
    const SIZE = 12000, SEGS = this.mobile ? 64 : 128
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position.array as Float32Array
    const cols = new Float32Array(pos.length)
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], z = pos[i + 2]
      pos[i + 1] = NeoTokyoMapSystem.heightAt(x, z)
      const rx = ((x % 400) + 400) % 400, rz = ((z % 400) + 400) % 400
      const dR = Math.min(Math.min(rx, 400 - rx), Math.min(rz, 400 - rz))
      let r: number, g: number, b: number
      if (dR < 42) {
        r = 0.08 + sr(i * 0.009) * 0.02; g = 0.09 + sr(i * 0.011) * 0.01; b = 0.12 + sr(i * 0.013) * 0.02
      } else if (dR < 50) {
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

  // ===== BUILDINGS =====

  private createBuildings(): void {
    const textures = BTYPE.map(b => makeWinTex(b.bg, b.win, b.cols, b.rows))
    textures.forEach(t => t.repeat.set(1, 2))
    const specs = this.collectBuildingSpecs()
    const unitGeo = new THREE.BoxGeometry(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion()
    for (let t = 0; t < BTYPE.length; t++) {
      const list = specs.filter(s => s.type === t)
      if (!list.length) continue
      const mat = new THREE.MeshLambertMaterial({
        map: textures[t], emissive: new THREE.Color(BTYPE[t].em), emissiveIntensity: 0.28,
      })
      const mesh = new THREE.InstancedMesh(unitGeo, mat, list.length)
      mesh.castShadow = !this.mobile
      mesh.name = `NT_B_${t}`
      list.forEach((s, i) => {
        const gy = NeoTokyoMapSystem.heightAt(s.x, s.z)
        q.setFromAxisAngle(up, s.ry)
        mtx.compose(new THREE.Vector3(s.x, gy + s.h / 2, s.z), q, new THREE.Vector3(s.w, s.h, s.d))
        mesh.setMatrixAt(i, mtx)
      })
      mesh.instanceMatrix.needsUpdate = true
      this.scene.add(mesh)
      this.instancedMeshes.push(mesh)
    }
  }

  private collectBuildingSpecs(): BSpec[] {
    const specs: BSpec[] = []
    // ROAD=400m grid, sub-blocks at [0.25, 0.75] → centers 200m apart, MAX_W=120m → corridor=80m
    const ROAD = 400, HALF = 1600, MAX_W = 120
    const offsets = [0.25, 0.75]

    // Exclusion zones around hand-placed landmarks
    const EXCL = [
      { x: -170, z: 120, r: 340 }, // Imperial Palace
      { x:  820, z: 640, r: 130 }, // Skytree
      { x: -450, z: 510, r: 110 }, // Tokyo Tower
      { x: -560, z: -360, r: 220 }, // Shinjuku cluster
      { x:  850, z: 780, r: 160 }, // Fuji TV
      { x:  700, z: 520, r: 100 }, // Senso-ji
    ]

    for (const ox of offsets) {
      for (let bx = -HALF; bx < HALF; bx += ROAD) {
        const cx = bx + ox * ROAD
        for (const oz of offsets) {
          for (let bz = -HALF; bz < HALF; bz += ROAD) {
            const cz = bz + oz * ROAD
            const r = Math.hypot(cx, cz)
            if (r > HALF) continue
            if (EXCL.some(e => Math.hypot(cx - e.x, cz - e.z) < e.r)) continue

            const seed = sr(cx * 0.13 + cz * 0.07)
            if (this.mobile && seed > 0.52) continue
            if (r > 1100 && seed > 0.72) continue

            let type: number, hMin: number, hMax: number
            if (r < 500) {
              type = 1; hMin = 300; hMax = 700
            } else if (cx < -100 && cz > -250 && cz < 200 && r < 1100) {
              type = 0; hMin = 220; hMax = 560   // Shinjuku
            } else if (cx < -80 && cz > 100 && cz < 650 && r < 950) {
              type = seed < 0.55 ? 2 : 3; hMin = 160; hMax = 400  // Shibuya/Roppongi
            } else if (cx > 150 && cz > 200 && r < 1200) {
              type = 4; hMin = 150; hMax = 400   // Odaiba/Toyosu
            } else if (cx < -150 && cz < -300 && r < 1050) {
              type = seed < 0.5 ? 0 : 2; hMin = 200; hMax = 500  // Ikebukuro
            } else if (cx > 50 && cz < 0 && r < 1000) {
              type = seed < 0.45 ? 5 : 1; hMin = 140; hMax = 320 // Ueno/Akihabara
            } else if (cx > 0 && cz > 600 && r < 1050) {
              type = seed < 0.6 ? 3 : 1; hMin = 150; hMax = 340  // Shinagawa
            } else {
              type = seed < 0.55 ? 3 : 5; hMin = 130; hMax = 240
            }

            const bs = sr(cx * 3.1 + cz * 7.7)
            const aspect = 0.55 + sr(bs * 4.1) * 0.9
            const w = MAX_W * (0.58 + bs * 0.42)
            const d = Math.min(MAX_W, w * aspect)
            const h = hMin + sr(bs * 3.7) * (hMax - hMin)
            const ry = (sr(bs * 9.3) - 0.5) * Math.PI * 0.15
            specs.push({ type, x: cx, z: cz, w, d, h, ry })
          }
        }
      }
    }
    return specs
  }

  // ===== LANDMARKS =====

  private createLandmarks(): void {
    this.buildSkytree(820, 640)
    this.buildTokyoTower(-450, 510)
    this.buildShinjukuCluster()
    this.buildTokyoStation(30, 20)
    this.buildRoppongiHills(-350, 420)
    this.buildAzabudaiHills(-240, 380)
    this.buildDietBuilding(-180, 340)
    this.buildFujiTV(850, 780)
    this.buildSensoji(700, 520)
    this.buildMast(340, -220, 20, 420)
    this.buildMast(-280, 380, 14, 320)
  }

  private buildSkytree(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const steelMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4c, emissive: 0x081428, emissiveIntensity: 0.2 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x66aacc, emissive: 0x1144aa, emissiveIntensity: 0.6 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0x4466ff, emissive: 0x3355ee, emissiveIntensity: 2.0 })
    const neonR    = new THREE.MeshLambertMaterial({ color: 0x8844ff, emissive: 0x6633ee, emissiveIntensity: 2.0 })
    const base = new THREE.Mesh(new THREE.CylinderGeometry(13, 58, 350, 3), steelMat); base.position.y = 175; g.add(base)
    const d1 = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 14, 16), glassMat); d1.position.y = 357; g.add(d1)
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(10, 13, 100, 8), steelMat); s1.position.y = 400; g.add(s1)
    const d2 = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 12, 12), glassMat); d2.position.y = 456; g.add(d2)
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(5, 10, 150, 6), steelMat); s2.position.y = 525; g.add(s2)
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1, 4, 34, 6), steelMat); mast.position.y = 617; g.add(mast)
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2
      const spine = new THREE.Mesh(new THREE.BoxGeometry(2, 350, 2), c === 0 ? neonMat : neonR)
      spine.position.set(Math.cos(a) * 32, 175, Math.sin(a) * 32); g.add(spine)
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 2), neonMat); p1.position.set(Math.cos(a) * 28, 352, Math.sin(a) * 28); g.add(p1)
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 8, 1.5), neonR); p2.position.set(Math.cos(a) * 20, 452, Math.sin(a) * 20); g.add(p2)
    }
    this.scene.add(g); this.landmarks.push(g)
  }

  private buildTokyoTower(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const redMat   = new THREE.MeshLambertMaterial({ color: 0xff2800, emissive: 0x440a00, emissiveIntensity: 0.3 })
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0x222222, emissiveIntensity: 0.1 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbcc, emissive: 0x112233, emissiveIntensity: 0.4 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1.0 })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 32, 262, 4), redMat)
    body.position.y = 131; body.rotation.y = Math.PI / 4; g.add(body)
    for (const [y, hw] of [[50, 28], [100, 22], [155, 15], [210, 9]] as [number, number][]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 5, hw * 2), whiteMat)
      band.position.y = y; band.rotation.y = Math.PI / 4; g.add(band)
    }
    const obs1 = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 14, 12), glassMat); obs1.position.y = 157; g.add(obs1)
    const obs2 = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 12, 12), glassMat); obs2.position.y = 256; g.add(obs2)
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(2, 7, 71, 4), redMat)
    upper.position.y = 298; upper.rotation.y = Math.PI / 4; g.add(upper)
    for (let c = 0; c < 4; c++) {
      const a = c * Math.PI / 2 + Math.PI / 4
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 260, 1.5), neonMat)
      strip.position.set(Math.cos(a) * 18, 131, Math.sin(a) * 18); g.add(strip)
    }
    this.scene.add(g); this.landmarks.push(g)
  }

  private buildShinjukuCluster(): void {
    const towers = [
      { x: -560, z: -360, w: 82, d: 72, h: 510 },
      { x: -648, z: -225, w: 70, d: 64, h: 445 },
      { x: -488, z: -292, w: 78, d: 70, h: 390 },
      { x: -718, z: -362, w: 64, d: 58, h: 318 },
      { x: -592, z: -458, w: 72, d: 64, h: 362 },
      { x: -432, z: -394, w: 62, d: 54, h: 276 },
    ]
    const neonColors = [0x00ffcc, 0xff00aa, 0x0088ff, 0xffcc00, 0xff4400, 0x88ff00]
    towers.forEach((p, i) => {
      const gy = NeoTokyoMapSystem.heightAt(p.x, p.z)
      const nC = neonColors[i % neonColors.length]
      const winRGB: RGB = [(nC >> 16) & 0xff, (nC >> 8) & 0xff, nC & 0xff]
      const tex = makeWinTex([5, 8, 20] as RGB, winRGB, 7, 14); tex.repeat.set(1, 2)
      const tower = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d),
        new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(nC), emissiveIntensity: 0.30 }))
      tower.position.set(p.x, gy + p.h / 2, p.z); tower.castShadow = !this.mobile
      this.scene.add(tower); this.landmarks.push(tower)
      const crown = new THREE.Mesh(new THREE.BoxGeometry(p.w + 10, 12, p.d + 10),
        new THREE.MeshLambertMaterial({ color: nC, emissive: new THREE.Color(nC), emissiveIntensity: 2.2 }))
      crown.position.set(p.x, gy + p.h + 6, p.z)
      this.scene.add(crown); this.landmarks.push(crown)
      const stripMat = new THREE.MeshLambertMaterial({ color: nC, emissive: new THREE.Color(nC), emissiveIntensity: 1.8 })
      for (let c = 0; c < 4; c++) {
        const a = c * Math.PI / 2 + Math.PI / 4
        const strip = new THREE.Mesh(new THREE.BoxGeometry(2, p.h, 2), stripMat)
        strip.position.set(p.x + Math.cos(a) * (p.w / 2 + 2), gy + p.h / 2, p.z + Math.sin(a) * (p.d / 2 + 2))
        this.scene.add(strip); this.landmarks.push(strip)
      }
    })
  }

  // 東京駅 (Tokyo Station) — red brick Marunouchi facade with twin domes
  private buildTokyoStation(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const brickMat = new THREE.MeshLambertMaterial({ color: 0x8b3a2a, emissive: 0x2a0e0a, emissiveIntensity: 0.15 })
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xc8b89a, emissive: 0x1a1008, emissiveIntensity: 0.1 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x88aacc, emissive: 0x112244, emissiveIntensity: 0.3 })
    // Long facade
    const facade = new THREE.Mesh(new THREE.BoxGeometry(320, 40, 60), brickMat); facade.position.set(0, 20, 0); g.add(facade)
    const base   = new THREE.Mesh(new THREE.BoxGeometry(330, 8, 65), stoneMat);  base.position.set(0, 4, 0); g.add(base)
    // Twin dome towers at ends
    for (const tz of [-140, 140]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(52, 45, 52), brickMat); tower.position.set(0, 22.5, tz); g.add(tower)
      const dome  = new THREE.Mesh(new THREE.SphereGeometry(26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), stoneMat)
      dome.position.set(0, 45, tz); g.add(dome)
      for (let face = 0; face < 4; face++) {
        const fa = face * Math.PI / 2
        const win = new THREE.Mesh(new THREE.BoxGeometry(14, 18, 2), glassMat)
        win.position.set(Math.sin(fa) * 27, 28, tz + Math.cos(fa) * 27); win.rotation.y = fa; g.add(win)
      }
    }
    // Window row
    for (let wx = -140; wx <= 140; wx += 22) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(12, 14, 2), glassMat); win.position.set(wx, 24, 31); g.add(win)
    }
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(210, 8, 8), stoneMat); ridge.position.set(0, 44, 0); g.add(ridge)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 六本木ヒルズ (Roppongi Hills Mori Tower) — 238m
  private buildRoppongiHills(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const glassTex = makeGlassTex([80, 110, 145])
    const mat    = new THREE.MeshLambertMaterial({ map: glassTex, color: 0x8899aa, emissive: 0x0a1520, emissiveIntensity: 0.4 })
    const neonMat = new THREE.MeshLambertMaterial({ color: 0xff3300, emissive: 0xff1100, emissiveIntensity: 1.5 })
    const annexMat = new THREE.MeshLambertMaterial({ color: 0x333344, emissive: 0x11112a, emissiveIntensity: 0.2 })
    // Mori Tower — stepped form
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(82, 120, 72), mat); b1.position.y = 60; g.add(b1)
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(70, 80, 60),  mat); b2.position.y = 160; g.add(b2)
    const b3 = new THREE.Mesh(new THREE.BoxGeometry(55, 38, 48),  mat); b3.position.y = 219; g.add(b3)
    const b4 = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 36),  mat); b4.position.y = 245; g.add(b4)
    // Red neon band
    const band = new THREE.Mesh(new THREE.BoxGeometry(84, 4, 74), neonMat); band.position.y = 121; g.add(band)
    // Adjacent buildings
    const ann1 = new THREE.Mesh(new THREE.BoxGeometry(80, 30, 50), annexMat); ann1.position.set(72, 15, 30); g.add(ann1)
    const ann2 = new THREE.Mesh(new THREE.BoxGeometry(60, 20, 80), annexMat); ann2.position.set(-82, 10, 20); g.add(ann2)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 麻布台ヒルズ (Azabudai Hills) — 330m Japan's tallest
  private buildAzabudaiHills(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const glassTex = makeGlassTex([100, 140, 160])
    const mat    = new THREE.MeshLambertMaterial({ map: glassTex, color: 0x99bbcc, emissive: 0x081824, emissiveIntensity: 0.5 })
    const neonMat = new THREE.MeshLambertMaterial({ color: 0x00ccff, emissive: 0x0099cc, emissiveIntensity: 1.8 })
    const podMat  = new THREE.MeshLambertMaterial({ color: 0x2a3a44, emissive: 0x0a1218, emissiveIntensity: 0.2 })
    // Main slender tower
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(65, 150, 55), mat); t1.position.y = 75; g.add(t1)
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(55, 100, 47), mat); t2.position.y = 200; g.add(t2)
    const t3 = new THREE.Mesh(new THREE.BoxGeometry(42,  80, 36), mat); t3.position.y = 290; g.add(t3)
    // Cyan crown bands
    for (const yp of [225, 300, 325]) {
      const r1 = new THREE.Mesh(new THREE.BoxGeometry(60, 3, 3), neonMat); r1.position.set(0, yp,  27); g.add(r1)
      const r2 = new THREE.Mesh(new THREE.BoxGeometry(60, 3, 3), neonMat); r2.position.set(0, yp, -27); g.add(r2)
    }
    // Podium
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(90, 50, 40), podMat); p1.position.set(62, 25, 0); g.add(p1)
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(50, 35, 90), podMat); p2.position.set(0, 17, 72); g.add(p2)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 国会議事堂 (National Diet Building) — pyramid center tower
  private buildDietBuilding(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0xc8c0a8, emissive: 0x18160e, emissiveIntensity: 0.15 })
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x888070, emissive: 0x0e0e0a, emissiveIntensity: 0.1 })
    // Main body
    const main = new THREE.Mesh(new THREE.BoxGeometry(160, 30, 100), stoneMat); main.position.set(0, 15, 0); g.add(main)
    // Wings
    const lw = new THREE.Mesh(new THREE.BoxGeometry(70, 55, 70), stoneMat); lw.position.set(-80, 27, 0); g.add(lw)
    const lt = new THREE.Mesh(new THREE.BoxGeometry(50, 15, 50), stoneMat); lt.position.set(-80, 62, 0); g.add(lt)
    const rw = new THREE.Mesh(new THREE.BoxGeometry(70, 55, 70), stoneMat); rw.position.set( 80, 27, 0); g.add(rw)
    const rt = new THREE.Mesh(new THREE.BoxGeometry(50, 15, 50), stoneMat); rt.position.set( 80, 62, 0); g.add(rt)
    // Center tower + pyramid
    const ct = new THREE.Mesh(new THREE.BoxGeometry(45, 60, 45), stoneMat); ct.position.set(0, 60, 0); g.add(ct)
    const ps = new THREE.Mesh(new THREE.BoxGeometry(42, 20, 42), darkMat);  ps.position.set(0, 100, 0); g.add(ps)
    const pyr = new THREE.Mesh(new THREE.CylinderGeometry(0, 22, 45, 4), stoneMat)
    pyr.position.set(0, 125, 0); pyr.rotation.y = Math.PI / 4; g.add(pyr)
    this.scene.add(g); this.landmarks.push(g)
  }

  // フジテレビ (Fuji TV Odaiba) — floating titanium sphere
  private buildFujiTV(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const concMat   = new THREE.MeshLambertMaterial({ color: 0xb8b8c0, emissive: 0x101018, emissiveIntensity: 0.2 })
    const sphereMat = new THREE.MeshLambertMaterial({ color: 0xaac0d0, emissive: 0x2244aa, emissiveIntensity: 0.5 })
    const neonMat   = new THREE.MeshLambertMaterial({ color: 0x00aaff, emissive: 0x0077cc, emissiveIntensity: 1.5 })
    // Vertical legs
    for (const xo of [-40, 40]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(20, 100, 20), concMat); leg.position.set(xo, 50, 0); g.add(leg)
    }
    // Horizontal beam
    const beam = new THREE.Mesh(new THREE.BoxGeometry(100, 20, 80), concMat); beam.position.set(0, 92, 0); g.add(beam)
    // Titanium sphere
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(28, 16, 12), sphereMat); sphere.position.set(0, 115, 0); g.add(sphere)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const ring = new THREE.Mesh(new THREE.BoxGeometry(1.5, 56, 1.5), new THREE.MeshLambertMaterial({ color: 0x606070 }))
      ring.position.set(Math.cos(a) * 28, 115, Math.sin(a) * 28); g.add(ring)
    }
    // Base building
    const base = new THREE.Mesh(new THREE.BoxGeometry(120, 35, 90), concMat); base.position.set(0, 17, 0); g.add(base)
    const neonBar = new THREE.Mesh(new THREE.BoxGeometry(102, 3, 3), neonMat); neonBar.position.set(0, 103, 41); g.add(neonBar)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 浅草寺 (Senso-ji) — 5-story pagoda + Kaminarimon gate
  private buildSensoji(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group(); g.position.set(X, gy, Z)
    const roofMat   = new THREE.MeshLambertMaterial({ color: 0x1a5c1a, emissive: 0x051505, emissiveIntensity: 0.2 })
    const wallMat   = new THREE.MeshLambertMaterial({ color: 0xcc4400, emissive: 0x330a00, emissiveIntensity: 0.2 })
    const goldMat   = new THREE.MeshLambertMaterial({ color: 0xffcc00, emissive: 0xaa8800, emissiveIntensity: 0.8 })
    const gateMat   = new THREE.MeshLambertMaterial({ color: 0xcc2200, emissive: 0x330600, emissiveIntensity: 0.3 })
    const lanternMat = new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff0000, emissiveIntensity: 1.5 })
    // 5-story pagoda
    let curY = 0
    for (const [fw, fh] of [[40, 18], [33, 16], [27, 14], [22, 13], [17, 11]] as [number, number][]) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, fw), wallMat); body.position.y = curY + fh / 2; g.add(body)
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, fw * 0.75, fh * 0.6, 4), roofMat)
      roof.position.y = curY + fh; roof.rotation.y = Math.PI / 4; g.add(roof)
      curY += fh + fh * 0.6
    }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.5, 25, 6), goldMat); spire.position.y = curY + 12; g.add(spire)
    // Main hall
    const hall = new THREE.Mesh(new THREE.BoxGeometry(60, 20, 40), wallMat); hall.position.set(0, 10, -65); g.add(hall)
    const hRoof = new THREE.Mesh(new THREE.CylinderGeometry(0, 40, 16, 4), roofMat)
    hRoof.position.set(0, 28, -65); hRoof.rotation.y = Math.PI / 4; g.add(hRoof)
    // Kaminarimon gate
    for (const xo of [-20, 20]) {
      const gp = new THREE.Mesh(new THREE.BoxGeometry(5, 25, 5), gateMat); gp.position.set(xo, 12, -110); g.add(gp)
    }
    const gbeam = new THREE.Mesh(new THREE.BoxGeometry(50, 6, 8), gateMat); gbeam.position.set(0, 26, -110); g.add(gbeam)
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), lanternMat); lantern.position.set(0, 21, -110); g.add(lantern)
    this.scene.add(g); this.landmarks.push(g)
  }

  // 皇居 (Imperial Palace) — green compound with moat, walls, palace
  private createImperialPalace(): void {
    const X = -170, Z = 120
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const parkMat = new THREE.MeshLambertMaterial({ color: 0x2d5a1e, emissive: 0x0a1a08, emissiveIntensity: 0.15 })
    const park = new THREE.Mesh(new THREE.BoxGeometry(500, 3, 400), parkMat)
    park.position.set(X, gy + 1.5, Z); this.scene.add(park); this.deco.push(park)

    const moatMat = new THREE.MeshLambertMaterial({
      color: 0x0a2030, emissive: 0x000c18, emissiveIntensity: 0.4,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    })
    for (const [mx, mz, mw, md] of [
      [X, Z - 220, 520, 30], [X, Z + 220, 520, 30],
      [X - 265, Z, 30, 410], [X + 265, Z, 30, 410],
    ] as [number, number, number, number][]) {
      const moat = new THREE.Mesh(new THREE.BoxGeometry(mw, 2, md), moatMat)
      moat.position.set(mx, gy + 0.8, mz); this.scene.add(moat); this.deco.push(moat)
    }

    const wallMat = new THREE.MeshLambertMaterial({ color: 0x888070, emissive: 0x0e0e0a, emissiveIntensity: 0.1 })
    for (const [wx, wz, ww, wd, wh] of [
      [X, Z - 200, 480, 8, 18], [X, Z + 200, 480, 8, 18],
      [X - 240, Z, 8, 380, 18], [X + 240, Z, 8, 380, 18],
    ] as [number, number, number, number, number][]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), wallMat)
      wall.position.set(wx, gy + wh / 2 + 2, wz); this.scene.add(wall); this.landmarks.push(wall)
    }

    const palMat  = new THREE.MeshLambertMaterial({ color: 0xe8e0d0, emissive: 0x1a1810, emissiveIntensity: 0.15 })
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a5a3a, emissive: 0x0a120a, emissiveIntensity: 0.2 })
    const palace = new THREE.Mesh(new THREE.BoxGeometry(100, 18, 60), palMat)
    palace.position.set(X, gy + 11, Z); this.scene.add(palace); this.landmarks.push(palace)
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 60, 20, 4), roofMat)
    roof.position.set(X, gy + 28, Z); roof.rotation.y = Math.PI / 4; this.scene.add(roof); this.deco.push(roof)
  }

  // レインボーブリッジ (Rainbow Bridge)
  private buildRainbowBridge(): void {
    const x1 = 480, z1 = 380, x2 = 750, z2 = 700
    const DECK_Y = 52, TOWER_H = 120
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.hypot(dx, dz)
    const angle = Math.atan2(dx, dz)
    const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2
    const concMat  = new THREE.MeshLambertMaterial({ color: 0xc0c0c8, emissive: 0x101018, emissiveIntensity: 0.15 })
    const cableMat = new THREE.MeshLambertMaterial({ color: 0xd0d0d8, emissive: 0x181820, emissiveIntensity: 0.2 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.2 })

    // Bridge deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len + 200, 5, 22), concMat)
    deck.position.set(midX, DECK_Y + 2.5, midZ); deck.rotation.y = -angle
    this.scene.add(deck); this.deco.push(deck)

    // Neon edge rails
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 200, 2, 1), neonMat)
      rail.position.set(midX, DECK_Y + 5.5, midZ); rail.rotation.y = -angle
      rail.position.x += Math.cos(angle) * side * 11
      rail.position.z += -Math.sin(angle) * side * 11
      this.scene.add(rail); this.deco.push(rail)
    }

    // Suspension towers
    for (const t of [0.28, 0.72]) {
      const tx = x1 + dx * t, tz = z1 + dz * t
      const tgy = NeoTokyoMapSystem.heightAt(tx, tz)
      const towG = new THREE.Group(); towG.position.set(tx, tgy, tz)
      for (const side of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(7, TOWER_H, 7), concMat)
        leg.position.set(side * 12, TOWER_H / 2, 0); towG.add(leg)
      }
      for (const yp of [TOWER_H * 0.5, TOWER_H * 0.8]) {
        const xb = new THREE.Mesh(new THREE.BoxGeometry(30, 6, 7), concMat); xb.position.set(0, yp, 0); towG.add(xb)
      }
      for (const side of [-1, 1]) {
        const top = new THREE.Mesh(new THREE.BoxGeometry(3, 8, 3),
          new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3.0 }))
        top.position.set(side * 12, TOWER_H + 4, 0); towG.add(top)
      }
      this.scene.add(towG); this.landmarks.push(towG)
    }

    // Suspension cables (4 segments)
    const cablePoints: Array<[[number, number, number], [number, number, number]]> = [
      [[x1 + dx * 0.28, DECK_Y + TOWER_H, z1 + dz * 0.28], [x1, DECK_Y, z1]],
      [[x1 + dx * 0.28, DECK_Y + TOWER_H, z1 + dz * 0.28], [midX, DECK_Y, midZ]],
      [[x1 + dx * 0.72, DECK_Y + TOWER_H, z1 + dz * 0.72], [midX, DECK_Y, midZ]],
      [[x1 + dx * 0.72, DECK_Y + TOWER_H, z1 + dz * 0.72], [x2, DECK_Y, z2]],
    ]
    for (const [from, to] of cablePoints) {
      const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2])
      const cLen = dir.length()
      const q = new THREE.Quaternion(); q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
      const cable = new THREE.Mesh(new THREE.BoxGeometry(3, cLen, 3), cableMat)
      cable.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2)
      cable.quaternion.copy(q)
      this.scene.add(cable); this.deco.push(cable)
    }
  }

  // 山手線 (Yamanote Line) — elevated loop rail
  private createYamanoteLine(): void {
    const TRACK_Y = 14
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

      // Track group
      const tg = new THREE.Group(); tg.position.set(mx, elevY, mz); tg.rotation.y = -ang
      tg.add(new THREE.Mesh(new THREE.BoxGeometry(segLen, 4, 14), deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(segLen, 1.2, 1.5), railMat)
        rail.position.set(0, 2.6, side * 4); tg.add(rail)
      }
      this.scene.add(tg); this.deco.push(tg)

      // Pillars every ~200m
      const nP = Math.max(1, Math.ceil(segLen / 200))
      for (let p = 0; p <= nP; p++) {
        const t = p / nP
        const px = a.x + sdx * t, pz = a.z + sdz * t
        const pgy = NeoTokyoMapSystem.heightAt(px, pz)
        const pilH = TRACK_Y + gy - pgy + 1
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(4, pilH, 4), pillarMat)
        pillar.position.set(px, pgy + pilH / 2, pz); this.scene.add(pillar); this.deco.push(pillar)
      }
    }

    // Parked train cars at Shinjuku and Ueno
    for (const [tx, tz, ra] of [[-700, 0, 0], [160, -600, Math.PI / 6]] as [number, number, number][]) {
      const gy = NeoTokyoMapSystem.heightAt(tx, tz)
      const body = new THREE.Mesh(new THREE.BoxGeometry(120, 4, 3.8), trainMat)
      body.position.set(tx, gy + TRACK_Y + 4, tz); body.rotation.y = ra
      this.scene.add(body); this.deco.push(body)
      const wins = new THREE.Mesh(new THREE.BoxGeometry(110, 1.5, 0.5), winMat)
      wins.position.set(tx, gy + TRACK_Y + 5.2, tz); wins.rotation.y = ra
      this.scene.add(wins); this.deco.push(wins)
    }
  }

  // ===== METROPOLITAN EXPRESSWAY =====

  private createHighways(): void {
    const hwyTex = makeHwyTex(); hwyTex.repeat.set(1, 5)
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x141420, map: hwyTex })
    const pMat    = new THREE.MeshLambertMaterial({ color: 0x1c1c28 })
    const railMat = new THREE.MeshLambertMaterial({ color: 0x0088cc, emissive: 0x0055aa, emissiveIntensity: 0.8 })
    this.buildHwyRing(480, 30, 20, 3, 24, deckMat, pMat, railMat)
    this.buildHwyRing(950, 46, 22, 3, 32, deckMat, pMat, railMat)
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const cos = Math.cos(a), sin = Math.sin(a)
      const sg = new THREE.Group()
      sg.position.set(cos * 715, 38, sin * 715); sg.rotation.y = -a + Math.PI / 2
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(470, 3, 18), deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(470, 2, 1), railMat); rail.position.set(0, 2.5, 8.5 * side); sg.add(rail)
      }
      this.scene.add(sg); this.deco.push(sg)
      for (let p = 0; p < 4; p++) {
        const pr = 480 + (p + 0.5) * 117.5
        const pl = new THREE.Mesh(new THREE.BoxGeometry(4, 38, 4), pMat); pl.position.set(cos * pr, 19, sin * pr)
        this.scene.add(pl); this.deco.push(pl)
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
      if (i % 4 === 0) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(5, Y, 5), pMat)
        pl.position.set(Math.cos(am) * R, Y / 2, Math.sin(am) * R); this.scene.add(pl); this.deco.push(pl)
      }
    }
  }

  // ===== HOLOGRAMS + NEON ROAD GRID =====

  private createHolograms(): void {
    const beams = [
      { x:   0, z: -600, c: 0x00ffcc }, { x: 300, z:    0, c: 0xff00aa },
      { x:   0, z:  500, c: 0x0088ff }, { x:-300, z:    0, c: 0xffcc00 },
      { x: 600, z: -400, c: 0x00ffcc }, { x:-600, z:  400, c: 0xff00aa },
      { x: 900, z:  300, c: 0x00aaff }, { x:-250, z: -800, c: 0xff4400 },
    ]
    for (const bp of beams) {
      const gy = NeoTokyoMapSystem.heightAt(bp.x, bp.z)
      const mat = new THREE.MeshLambertMaterial({ color: bp.c, emissive: new THREE.Color(bp.c), emissiveIntensity: 2.5, transparent: true, opacity: 0.28 })
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 900, 8), mat)
      beam.position.set(bp.x, gy + 450, bp.z); this.scene.add(beam); this.deco.push(beam)
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 1, 16),
        new THREE.MeshLambertMaterial({ color: bp.c, emissive: new THREE.Color(bp.c), emissiveIntensity: 2.0, transparent: true, opacity: 0.5 }))
      disc.position.set(bp.x, gy + 0.5, bp.z); this.scene.add(disc); this.deco.push(disc)
    }
    const neonMat = new THREE.MeshLambertMaterial({ color: 0x00ccff, emissive: 0x0088cc, emissiveIntensity: 0.8 })
    for (let x = -1200; x <= 1200; x += 400) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 3600), neonMat)
      strip.position.set(x, NeoTokyoMapSystem.heightAt(x, 0) + 0.3, 0); this.scene.add(strip); this.deco.push(strip)
    }
    for (let z = -1200; z <= 1200; z += 400) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(3600, 0.5, 4), neonMat)
      strip.position.set(0, NeoTokyoMapSystem.heightAt(0, z) + 0.3, z); this.scene.add(strip); this.deco.push(strip)
    }
  }

  // ===== WATER (polygonOffset prevents z-fighting with terrain) =====

  private createWater(): void {
    const wMat = new THREE.MeshLambertMaterial({
      color: 0x05101e, emissive: 0x000c18, emissiveIntensity: 0.3,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    })
    // Tokyo Bay
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(7000, 5000), wMat)
    bay.rotation.x = -Math.PI / 2; bay.position.set(800, 2.0, 4200)
    this.scene.add(bay); this.deco.push(bay)
    // Inner bay (near Odaiba/Shinagawa)
    const inner = new THREE.Mesh(new THREE.BoxGeometry(1800, 0.5, 1200), wMat)
    inner.position.set(700, 2.0, 900); this.scene.add(inner); this.deco.push(inner)
    // Sumida River
    const sumida = new THREE.Mesh(new THREE.BoxGeometry(70, 0.5, 5500), wMat)
    sumida.position.set(640, 2.0, 0); this.scene.add(sumida); this.deco.push(sumida)
    // Kanda River
    const kanda = new THREE.Mesh(new THREE.BoxGeometry(45, 0.5, 3200), wMat)
    kanda.position.set(-750, 2.0, 300); this.scene.add(kanda); this.deco.push(kanda)
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
