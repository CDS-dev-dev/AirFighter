import * as THREE from 'three'

type RGB = [number, number, number]

// Window-grid texture for buildings
function makeWinTex(bg: RGB, win: RGB, cols: number, rows: number): THREE.DataTexture {
  const W = 128, H = 128
  const data = new Uint8Array(4 * W * H)
  const cw = W / cols, rh = H / rows
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const cx = (px % cw) / cw, cy = (py % rh) / rh
      const inW = cx > 0.12 && cx < 0.86 && cy > 0.12 && cy < 0.86
      const [r, g, b] = inW ? win : bg
      const i = (py * W + px) * 4
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
      let r = 26, g = 26, b = 30
      if ((px % 18) < 2 && (py % 24) < 16) { r = 215; g = 195; b = 0 }
      if (px < 3 || px > W - 4) { r = 105; g = 108; b = 122 }
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  return t
}

function sr(n: number): number {
  return Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453 % 1)
}

interface BSpec { type: number; x: number; z: number; w: number; d: number; h: number; ry: number }

// 6 building types — all TALL (≥120 m)
const BTYPE = [
  { bg: [22, 34, 56] as RGB,  win: [138, 218, 255] as RGB, cols: 7, rows: 14, em: 0x001828 }, // 0 Shinjuku glass
  { bg: [50, 56, 70] as RGB,  win: [220, 228, 246] as RGB, cols: 8, rows: 16, em: 0x000d1c }, // 1 Marunouchi corp
  { bg: [16, 8,  22] as RGB,  win: [255, 78,  200] as RGB, cols: 5, rows: 10, em: 0x1c0022 }, // 2 Kabukicho neon
  { bg: [82, 74, 62] as RGB,  win: [255, 230, 145] as RGB, cols: 6, rows: 12, em: 0x0e0e00 }, // 3 Residential highrise
  { bg: [18, 30, 50] as RGB,  win: [78,  200, 255] as RGB, cols: 6, rows: 12, em: 0x001320 }, // 4 Odaiba bayside
  { bg: [70, 58, 44] as RGB,  win: [198, 148, 58]  as RGB, cols: 4, rows: 8,  em: 0x0e0700 }, // 5 Ueno historic
]

export class NeoTokyoMapSystem {
  private scene: THREE.Scene
  private mobile: boolean
  private terrainMesh: THREE.Mesh | null = null
  private instancedMeshes: THREE.InstancedMesh[] = []
  private landmarks: THREE.Object3D[] = []
  private highways: THREE.Object3D[] = []

  constructor(scene: THREE.Scene, isMobile = false) {
    this.scene = scene
    this.mobile = isMobile
  }

  async initialize(): Promise<void> {
    this.createTerrain()
    this.createBuildings()
    this.createHighways()
    this.createLandmarks()
    this.createWater()
  }

  // Flat urban terrain — all height variation comes from buildings
  static heightAt(x: number, z: number): number {
    let h = 8
    h += Math.sin(x * 0.0006) * Math.cos(z * 0.0008) * 10
    h += Math.sin(x * 0.003) * Math.sin(z * 0.0025) * 4
    return Math.max(0, h)
  }

  getTerrainHeight(x: number, z: number): number { return NeoTokyoMapSystem.heightAt(x, z) }

  getSafeSpawnPosition(): { x: number; y: number; z: number } {
    return { x: 0, y: 900, z: -2200 }
  }

  // Buildings have collision. The key is that clear 85 m corridors exist between them.
  getCollisionObjects(): THREE.Object3D[] { return [...this.landmarks, ...this.instancedMeshes] }

  cleanup(): void {
    if (this.terrainMesh) { this.scene.remove(this.terrainMesh); this.terrainMesh = null }
    for (const m of this.instancedMeshes) this.scene.remove(m)
    this.instancedMeshes.length = 0
    for (const l of this.landmarks) this.scene.remove(l)
    this.landmarks.length = 0
    for (const h of this.highways) this.scene.remove(h)
    this.highways.length = 0
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

      // Road grid on 300 m spacing
      const rx = ((x % 300) + 300) % 300
      const rz = ((z % 300) + 300) % 300
      const dR = Math.min(Math.min(rx, 300 - rx), Math.min(rz, 300 - rz))

      let r: number, g: number, b: number
      if (dR < 42) {
        r = 0.11; g = 0.11; b = 0.12
        const n = sr(i * 0.009) * 0.02; r += n; g += n; b += n
      } else if (dR < 52) {
        r = 0.22; g = 0.21; b = 0.19
      } else {
        r = 0.19 + sr(i * 0.017) * 0.05
        g = 0.18 + sr(i * 0.022) * 0.04
        b = 0.17 + sr(i * 0.027) * 0.03
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
    // repeat(1,2): texture tiles once wide, twice tall → windows look closer to square
    textures.forEach(t => t.repeat.set(1, 2))

    const specs = this.collectBuildingSpecs()
    const unitGeo = new THREE.BoxGeometry(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)
    const mtx = new THREE.Matrix4()
    const q = new THREE.Quaternion()

    for (let t = 0; t < BTYPE.length; t++) {
      const list = specs.filter(s => s.type === t)
      if (!list.length) continue

      const mat = new THREE.MeshLambertMaterial({
        map: textures[t],
        emissive: new THREE.Color(BTYPE[t].em),
        emissiveIntensity: 0.14,
      })

      const mesh = new THREE.InstancedMesh(unitGeo, mat, list.length)
      mesh.castShadow = !this.mobile
      mesh.name = `NT_B_${t}`

      list.forEach((s, i) => {
        const gy = NeoTokyoMapSystem.heightAt(s.x, s.z)
        q.setFromAxisAngle(up, s.ry)
        mtx.compose(
          new THREE.Vector3(s.x, gy + s.h / 2, s.z),
          q,
          new THREE.Vector3(s.w, s.h, s.d)
        )
        mesh.setMatrixAt(i, mtx)
      })

      mesh.instanceMatrix.needsUpdate = true
      this.scene.add(mesh)
      this.instancedMeshes.push(mesh)
    }
  }

  private collectBuildingSpecs(): BSpec[] {
    const specs: BSpec[] = []
    const ROAD = 300   // road grid spacing
    const HALF = 1350  // city radius
    // Sub-blocks at 0.25 and 0.75 of each 300 m road interval = centres at 75 m and 225 m
    // Distance between adjacent centres: 150 m
    // MAX building width: 65 m → minimum corridor: 150 - 65 = 85 m ✓
    const MAX_W = 65
    const offsets = [0.25, 0.75]

    for (const ox of offsets) {
      for (let bx = -HALF; bx < HALF; bx += ROAD) {
        const cx = bx + ox * ROAD
        for (const oz of offsets) {
          for (let bz = -HALF; bz < HALF; bz += ROAD) {
            const cz = bz + oz * ROAD
            const r = Math.hypot(cx, cz)
            if (r > HALF) continue

            const seed = sr(cx * 0.13 + cz * 0.07)
            // Mobile: 50 % density
            if (this.mobile && seed > 0.5) continue
            // Thin out outer fringe naturally
            if (r > 900 && seed > 0.72) continue

            // District type by position (mirrors real Tokyo geography)
            let type: number, hMin: number, hMax: number

            if (r < 500) {
              // Marunouchi/CBD core — corporate steel towers
              type = 1; hMin = 250; hMax = 680
            } else if (cx < -100 && cz < 100 && r < 1100) {
              // Shinjuku/Nishi-Shinjuku (west/NW) — glass skyscrapers
              type = 0; hMin = 180; hMax = 520
            } else if (cx < 0 && cz > 100 && r < 950) {
              // Shibuya/Roppongi (SW) — entertainment neon + residential
              type = seed < 0.55 ? 2 : 3; hMin = 130; hMax = 320
            } else if (cx > 100 && cz > 0 && r < 1100) {
              // Odaiba/Shiodome (SE) — bayside glass
              type = 4; hMin = 150; hMax = 400
            } else if (cx > 100 && cz < -100 && r < 1000) {
              // Ueno/Asakusa direction (NE) — historic concrete + corp mix
              type = seed < 0.5 ? 5 : 1; hMin = 120; hMax = 280
            } else {
              // Outer ring — residential high-rise
              type = 3; hMin = 120; hMax = 220
            }

            const bs = sr(cx * 3.1 + cz * 7.7)
            const w = MAX_W * (0.5 + bs * 0.5)        // 32–65 m wide
            const d = MAX_W * (0.5 + sr(bs * 5.3) * 0.5)
            const h = hMin + sr(bs * 3.7) * (hMax - hMin)
            const ry = (sr(bs * 9.3) - 0.5) * Math.PI * 0.14  // ±13°

            specs.push({ type, x: cx, z: cz, w, d, h, ry })
          }
        }
      }
    }
    return specs
  }

  // ===== METROPOLITAN EXPRESSWAY (Shuto Kosoku) =====

  private createHighways(): void {
    const hwyTex = makeHwyTex()
    hwyTex.repeat.set(1, 6)
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x1a1a24, map: hwyTex })
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x222230 })
    const railMat = new THREE.MeshLambertMaterial({ color: 0x444558, emissive: 0x00082c, emissiveIntensity: 0.4 })

    // Inner loop: r=500 m, y=32 m — threads through CBD base
    this.buildHwyRing(500, 32, 22, 3, 40, deckMat, pillarMat, railMat)
    // Outer loop: r=1000 m, y=48 m — above low outer buildings
    this.buildHwyRing(1000, 48, 24, 3, 48, deckMat, pillarMat, railMat)

    // N/S/E/W radial spokes connecting the two rings
    const SPOKE_Y = 40, SPOKE_W = 18
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const cos = Math.cos(a), sin = Math.sin(a)
      const len = 500  // r=500 to r=1000

      const sg = new THREE.Group()
      sg.position.set(cos * 750, SPOKE_Y, sin * 750)
      sg.rotation.y = -a + Math.PI / 2
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(len, 3, SPOKE_W), deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 2, 1), railMat)
        rail.position.set(0, 2.5, (SPOKE_W / 2 - 0.5) * side)
        sg.add(rail)
      }
      this.scene.add(sg); this.highways.push(sg)

      for (let p = 0; p < 4; p++) {
        const pr = 500 + (p + 0.5) * 125
        const pl = new THREE.Mesh(new THREE.BoxGeometry(4, SPOKE_Y, 4), pillarMat)
        pl.position.set(cos * pr, SPOKE_Y / 2, sin * pr)
        this.scene.add(pl); this.highways.push(pl)
      }
    }
  }

  private buildHwyRing(
    R: number, Y: number, roadW: number, deckH: number, N: number,
    deckMat: THREE.Material, pillarMat: THREE.Material, railMat: THREE.Material
  ): void {
    for (let i = 0; i < N; i++) {
      const am = ((i + 0.5) / N) * Math.PI * 2
      const len = 2 * R * Math.sin(Math.PI / N) + 0.5

      const seg = new THREE.Group()
      seg.position.set(Math.cos(am) * R, Y, Math.sin(am) * R)
      seg.rotation.y = -am + Math.PI / 2
      seg.add(new THREE.Mesh(new THREE.BoxGeometry(len, deckH, roadW), deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 1.2), railMat)
        rail.position.set(0, (deckH + 2.5) / 2, (roadW / 2 - 0.6) * side)
        seg.add(rail)
      }
      this.scene.add(seg); this.highways.push(seg)

      if (i % 4 === 0) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(5, Y, 5), pillarMat)
        pl.position.set(Math.cos(am) * R, Y / 2, Math.sin(am) * R)
        this.scene.add(pl); this.highways.push(pl)
      }
    }
  }

  // ===== TOKYO LANDMARKS =====

  private createLandmarks(): void {
    this.buildSkytree(820, 620)
    this.buildTokyoTower(-450, 510)
    if (!this.mobile) this.buildRainbowBridge()
    this.buildShinjukuCluster()
    // Broadcast mast (NE area)
    this.buildMast(360, -210, 22, 440)
  }

  // Tokyo Skytree — 634 m, distinctive graduated lattice silhouette
  private buildSkytree(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group()
    g.position.set(X, gy, Z)

    const steelMat = new THREE.MeshLambertMaterial({ color: 0x3a4a5c, emissive: 0x0a1428, emissiveIntensity: 0.15 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0x4466ff, emissive: 0x2244ee, emissiveIntensity: 1.6 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x88aacc, emissive: 0x1133aa, emissiveIntensity: 0.4 })

    // Lower lattice section: wide triangular base tapering upward
    // CylinderGeometry(topR, bottomR, height, radialSegs=3) → triangular cross-section
    const base = new THREE.Mesh(new THREE.CylinderGeometry(14, 55, 350, 3), steelMat)
    base.position.y = 175
    g.add(base)

    // First observation deck ring at 350 m
    const deck1 = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 12, 16), glassMat)
    deck1.position.y = 356
    g.add(deck1)

    // Mid shaft
    const shaft1 = new THREE.Mesh(new THREE.CylinderGeometry(10, 14, 104, 8), steelMat)
    shaft1.position.y = 408
    g.add(shaft1)

    // Second observation deck at 450 m
    const deck2 = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 12, 12), glassMat)
    deck2.position.y = 456
    g.add(deck2)

    // Upper shaft 450 → 600 m
    const shaft2 = new THREE.Mesh(new THREE.CylinderGeometry(5, 10, 150, 6), steelMat)
    shaft2.position.y = 525
    g.add(shaft2)

    // Broadcast mast 600 → 634 m
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1, 4, 34, 6), steelMat)
    mast.position.y = 617
    g.add(mast)

    // Three vertical neon strips on lattice edges
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2, 350, 2), neonMat)
      strip.position.set(Math.cos(a) * 30, 175, Math.sin(a) * 30)
      g.add(strip)
    }

    // Neon ring at deck 1
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const post = new THREE.Mesh(new THREE.BoxGeometry(2, 8, 2), neonMat)
      post.position.set(Math.cos(a) * 26, 352, Math.sin(a) * 26)
      g.add(post)
    }

    this.scene.add(g); this.landmarks.push(g)
  }

  // Tokyo Tower — 333 m, red/white Eiffel-style lattice
  private buildTokyoTower(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group()
    g.position.set(X, gy, Z)

    const redMat   = new THREE.MeshLambertMaterial({ color: 0xff3300, emissive: 0x440e00, emissiveIntensity: 0.25 })
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xdddddd })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x99bbcc, emissive: 0x112233, emissiveIntensity: 0.3 })

    // Main body: 4-sided tapered cylinder approximates the lattice silhouette
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 30, 260, 4), redMat)
    body.position.y = 130; body.rotation.y = Math.PI / 4
    g.add(body)

    // White horizontal bands
    for (const [y, rBase] of [[55, 25], [110, 18], [165, 12], [220, 7]] as [number, number][]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(rBase * 2, 4, rBase * 2), whiteMat)
      band.position.y = y; band.rotation.y = Math.PI / 4
      g.add(band)
    }

    // Main observation deck at 150 m
    const obs1 = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 12, 12), glassMat)
    obs1.position.y = 156; g.add(obs1)

    // Special deck at 250 m
    const obs2 = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 10, 12), glassMat)
    obs2.position.y = 256; g.add(obs2)

    // Upper shaft 260 → 333 m
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(2, 6, 73, 4), redMat)
    upper.position.y = 297; upper.rotation.y = Math.PI / 4
    g.add(upper)

    this.scene.add(g); this.landmarks.push(g)
  }

  // Rainbow Bridge — suspension bridge over Tokyo Bay
  private buildRainbowBridge(): void {
    const BX1 = -250, BX2 = 950, BZ = 1900
    const DECK_Y = 40, TOWER_H = 110

    const towerMat = new THREE.MeshLambertMaterial({ color: 0xcc3300, emissive: 0x441100, emissiveIntensity: 0.2 })
    const deckMat  = new THREE.MeshLambertMaterial({ color: 0x223344 })
    const cableMat = new THREE.MeshLambertMaterial({ color: 0x445566 })

    const addObj = (obj: THREE.Object3D) => { this.scene.add(obj); this.landmarks.push(obj) }

    // Two towers
    for (const tx of [BX1, BX2]) {
      const base = NeoTokyoMapSystem.heightAt(tx, BZ)
      const t = new THREE.Mesh(new THREE.BoxGeometry(14, TOWER_H, 14), towerMat)
      t.position.set(tx, base + TOWER_H / 2, BZ)
      addObj(t)
      // Crossbar
      for (const cy of [60, 90]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 50), towerMat)
        bar.position.set(tx, base + cy, BZ)
        addObj(bar)
      }
    }

    // Main deck
    const span = BX2 - BX1
    const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 5, 38), deckMat)
    deck.position.set((BX1 + BX2) / 2, DECK_Y, BZ)
    addObj(deck)

    // Suspension cables (8 simplified diagonal segments each side)
    for (let ci = 0; ci < 8; ci++) {
      const t = (ci + 0.5) / 8
      const cx = BX1 + t * span
      const peakY = DECK_Y + TOWER_H * (1 - Math.abs(t - 0.5) * 2) * 0.55
      const segLen = span / 8
      for (const zOff of [-16, 16]) {
        const cable = new THREE.Mesh(new THREE.BoxGeometry(segLen, 1.5, 1.5), cableMat)
        cable.position.set(cx, (DECK_Y + peakY) / 2, BZ + zOff)
        cable.rotation.z = Math.atan2(peakY - DECK_Y, segLen) * (t < 0.5 ? -1 : 1)
        addObj(cable)
      }
    }
  }

  // Shinjuku skyscraper cluster — manually placed for best look
  private buildShinjukuCluster(): void {
    const towers = [
      { x: -560, z: -360, w: 62, d: 55, h: 490 },
      { x: -650, z: -230, w: 52, d: 48, h: 428 },
      { x: -490, z: -290, w: 58, d: 52, h: 375 },
      { x: -720, z: -360, w: 46, d: 42, h: 306 },
      { x: -595, z: -460, w: 54, d: 50, h: 348 },
      { x: -430, z: -390, w: 44, d: 40, h: 268 },
    ]

    const texA = makeWinTex([20, 28, 48] as RGB, [140, 215, 255] as RGB, 7, 14)
    const texB = makeWinTex([48, 54, 68] as RGB, [215, 225, 242] as RGB, 8, 16)
    texA.repeat.set(1, 2); texB.repeat.set(1, 2)

    const matA = new THREE.MeshLambertMaterial({ map: texA, emissive: 0x001828, emissiveIntensity: 0.12 })
    const matB = new THREE.MeshLambertMaterial({ map: texB, emissive: 0x000e1c, emissiveIntensity: 0.08 })
    const neonC = 0x0088ff
    const neonMat = new THREE.MeshLambertMaterial({ color: neonC, emissive: new THREE.Color(neonC), emissiveIntensity: 1.4 })

    towers.forEach((p, i) => {
      const gy = NeoTokyoMapSystem.heightAt(p.x, p.z)
      const tower = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), i % 2 === 0 ? matA : matB)
      tower.position.set(p.x, gy + p.h / 2, p.z)
      tower.castShadow = !this.mobile
      this.scene.add(tower); this.landmarks.push(tower)

      // Neon crown band
      const crown = new THREE.Mesh(new THREE.BoxGeometry(p.w + 8, 9, p.d + 8), neonMat)
      crown.position.set(p.x, gy + p.h + 4.5, p.z)
      this.scene.add(crown); this.landmarks.push(crown)
    })
  }

  // Generic broadcast mast with blinking beacon
  private buildMast(x: number, z: number, radius: number, h: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.06, radius * 0.22, h, 6),
      new THREE.MeshLambertMaterial({ color: 0x808090 })
    )
    shaft.position.set(x, gy + h / 2, z)
    this.scene.add(shaft); this.landmarks.push(shaft)

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.28, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 3.0 })
    )
    beacon.position.set(x, gy + h, z)
    this.scene.add(beacon); this.landmarks.push(beacon)
  }

  // ===== WATER =====

  private createWater(): void {
    // Tokyo Bay
    const bay = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 4500),
      new THREE.MeshLambertMaterial({ color: 0x071626, emissive: 0x000e1a, emissiveIntensity: 0.25 })
    )
    bay.rotation.x = -Math.PI / 2
    bay.position.set(600, 0.2, 3900)
    this.scene.add(bay); this.highways.push(bay)

    // Sumida river
    const river = new THREE.Mesh(
      new THREE.BoxGeometry(70, 0.3, 5200),
      new THREE.MeshLambertMaterial({ color: 0x061220, emissive: 0x000c16, emissiveIntensity: 0.2 })
    )
    river.position.set(630, 0.2, 0)
    this.scene.add(river); this.highways.push(river)

    // Kanda river (secondary canal)
    const canal = new THREE.Mesh(
      new THREE.BoxGeometry(40, 0.3, 3000),
      new THREE.MeshLambertMaterial({ color: 0x061220, emissive: 0x000c16, emissiveIntensity: 0.2 })
    )
    canal.position.set(-760, 0.2, 400)
    this.scene.add(canal); this.highways.push(canal)
  }
}
