import * as THREE from 'three'

type RGB = [number, number, number]

// Cyberpunk building facade: dark background + vivid neon windows
function makeWinTex(bg: RGB, win: RGB, cols: number, rows: number): THREE.DataTexture {
  const W = 128, H = 128
  const data = new Uint8Array(4 * W * H)
  const cw = W / cols, rh = H / rows
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const cx = (px % cw) / cw, cy = (py % rh) / rh
      const row = Math.floor(py / rh), col = Math.floor(px / cw)
      // Window pane
      const inW = cx > 0.10 && cx < 0.90 && cy > 0.10 && cy < 0.85
      // Neon floor strip at bottom of each row
      const neonStrip = cy > 0.88 && cy < 0.98
      // Random window brightness variation
      const bright = sr(row * 7.1 + col * 3.3) > 0.35

      let r: number, g: number, b: number
      if (neonStrip) {
        r = win[0]; g = win[1]; b = win[2]  // full brightness strip
      } else if (inW) {
        const boost = bright ? 40 : 0
        r = Math.min(255, win[0] + boost)
        g = Math.min(255, win[1] + boost)
        b = Math.min(255, win[2] + boost)
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

function makeHwyTex(): THREE.DataTexture {
  const W = 64, H = 64
  const data = new Uint8Array(4 * W * H)
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4
      let r = 22, g = 22, b = 26
      // Neon yellow lane markings
      if ((px % 18) < 2 && (py % 22) < 14) { r = 220; g = 200; b = 0 }
      // Cyan edge strips
      if (px < 3 || px > W - 4) { r = 0; g = 180; b = 220 }
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

// Cyberpunk building types — all TALL, all dark with vivid neon windows
const BTYPE = [
  // bg=near-black, win=vivid neon, emissive creates district glow
  { bg: [5, 12, 22]  as RGB, win: [0,   255, 200] as RGB, cols: 7, rows: 14, em: 0x00aa77 }, // 0 Shinjuku Cyber (cyan)
  { bg: [10, 15, 30] as RGB, win: [100, 180, 255] as RGB, cols: 8, rows: 16, em: 0x0033aa }, // 1 Marunouchi Steel (blue)
  { bg: [8,  0,  18] as RGB, win: [255, 50,  185] as RGB, cols: 5, rows: 10, em: 0xaa0077 }, // 2 Kabukicho Neon (hot pink)
  { bg: [18, 12, 5]  as RGB, win: [255, 210, 80]  as RGB, cols: 6, rows: 12, em: 0x664400 }, // 3 Residential warm (amber)
  { bg: [0,  12, 25] as RGB, win: [0,   220, 255] as RGB, cols: 6, rows: 12, em: 0x005588 }, // 4 Odaiba Aqua (aqua)
  { bg: [22, 10, 5]  as RGB, win: [255, 140, 20]  as RGB, cols: 4, rows: 8,  em: 0x883300 }, // 5 Industrial (orange)
]

export class NeoTokyoMapSystem {
  private scene: THREE.Scene
  private mobile: boolean
  private terrainMesh: THREE.Mesh | null = null
  private instancedMeshes: THREE.InstancedMesh[] = []
  private landmarks: THREE.Object3D[] = []  // solid collision objects
  private deco: THREE.Object3D[] = []       // visual-only (holograms, water, highway)

  constructor(scene: THREE.Scene, isMobile = false) {
    this.scene = scene
    this.mobile = isMobile
  }

  async initialize(): Promise<void> {
    this.createTerrain()
    this.createBuildings()
    if (!this.mobile) this.createHighways()
    this.createLandmarks()
    this.createHolograms()
    this.createWater()
  }

  // ===== TOKYO TOPOGRAPHY =====
  // West (Musashino Plateau): 60-120 m | CBD: 40-60 m | Bay/east: 5-20 m
  static heightAt(x: number, z: number): number {
    // E-W gradient: Musashino Plateau on west, Kanto Plain/bay on east
    let h = 45 - x * 0.016

    // Shinjuku / Yoyogi hill cluster (NW)
    h += 45 * Math.exp(-((x + 650) ** 2 / 260000 + z ** 2 / 220000))

    // Minato / Tokyo Tower ridge (south of CBD)
    h += 24 * Math.exp(-((x + 450) ** 2 / 200000 + (z - 520) ** 2 / 180000))

    // Ueno ridge (NE toward Skytree)
    h += 18 * Math.exp(-((x - 200) ** 2 / 130000 + (z + 480) ** 2 / 110000))

    // Odaiba / bay area depression
    h -= 28 * Math.exp(-((x - 850) ** 2 / 380000 + (z - 900) ** 2 / 330000))

    // Small-scale terrain undulation
    h += Math.sin(x * 0.0025) * Math.cos(z * 0.003) * 8
    h += Math.sin(x * 0.007) * Math.sin(z * 0.006) * 4

    // Bay: water south of city
    const bayDrop = z - 2200
    if (bayDrop > 0) h -= bayDrop * 0.02

    return Math.max(0, h)
  }

  getTerrainHeight(x: number, z: number): number { return NeoTokyoMapSystem.heightAt(x, z) }

  getSafeSpawnPosition(): { x: number; y: number; z: number } {
    return { x: 0, y: 900, z: -2200 }
  }

  // InstancedMesh buildings are visual-only — Box3.setFromObject() on InstancedMesh
  // returns a box covering ALL instances (the entire city), causing false collisions.
  // Only individually-placed landmark meshes have accurate per-object bounding boxes.
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

      // Road grid on 300 m spacing — dark asphalt with subtle cyan markings
      const rx = ((x % 300) + 300) % 300, rz = ((z % 300) + 300) % 300
      const dR = Math.min(Math.min(rx, 300 - rx), Math.min(rz, 300 - rz))

      let r: number, g: number, b: number
      if (dR < 38) {
        // Road surface — near-black asphalt with slight blue tint
        r = 0.08 + sr(i * 0.009) * 0.02
        g = 0.09 + sr(i * 0.011) * 0.01
        b = 0.12 + sr(i * 0.013) * 0.02
      } else if (dR < 44) {
        // Sidewalk — dark concrete
        r = 0.15; g = 0.14; b = 0.16
      } else {
        // City block — dark urban concrete, slight variation
        r = 0.13 + sr(i * 0.017) * 0.04
        g = 0.12 + sr(i * 0.021) * 0.03
        b = 0.14 + sr(i * 0.025) * 0.04
      }
      cols[i]     = Math.max(0, Math.min(1, r))
      cols[i + 1] = Math.max(0, Math.min(1, g))
      cols[i + 2] = Math.max(0, Math.min(1, b))
    }

    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    geo.computeVertexNormals()
    this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
    this.terrainMesh.name = 'NeoTokyoTerrain'
    this.scene.add(this.terrainMesh)
  }

  // ===== BUILDINGS (InstancedMesh — visual only, no player collision) =====

  private createBuildings(): void {
    const textures = BTYPE.map(b => makeWinTex(b.bg, b.win, b.cols, b.rows))
    // repeat(1,2): twice the vertical density → windows closer to square
    textures.forEach(t => t.repeat.set(1, 2))

    const specs = this.collectBuildingSpecs()
    const unitGeo = new THREE.BoxGeometry(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion()

    for (let t = 0; t < BTYPE.length; t++) {
      const list = specs.filter(s => s.type === t)
      if (!list.length) continue

      const mat = new THREE.MeshLambertMaterial({
        map: textures[t],
        emissive: new THREE.Color(BTYPE[t].em),
        emissiveIntensity: 0.28,
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
    const ROAD = 300, HALF = 1350
    // Sub-block centres at 0.25 and 0.75 of each 300 m road interval (75 m and 225 m)
    // Adjacent centre spacing: 150 m
    // MAX_W = 62 m → guaranteed corridor: 150 - 62 = 88 m ✓
    const MAX_W = 62
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
            if (this.mobile && seed > 0.48) continue
            if (r > 950 && seed > 0.70) continue  // thin out outer area

            // District type maps to real Tokyo geography
            // negative z = north, positive x = east
            let type: number, hMin: number, hMax: number

            if (r < 500) {
              // Marunouchi / Nihonbashi — CBD corporate
              type = 1; hMin = 250; hMax = 680
            } else if (cx < -120 && cz < 150 && r < 1100) {
              // Shinjuku / Nishi-Shinjuku (west-northwest) — cyber glass
              type = 0; hMin = 200; hMax = 560
            } else if (cx < -80 && cz > 80 && r < 1000) {
              // Shibuya / Roppongi (southwest) — neon entertainment
              type = seed < 0.55 ? 2 : 3; hMin = 150; hMax = 340
            } else if (cx > 150 && cz > 0 && r < 1100) {
              // Odaiba / Shiodome / Toyosu (east-southeast) — aqua glass
              type = 4; hMin = 150; hMax = 420
            } else if (cx > 80 && cz < -50 && r < 1000) {
              // Ueno / Akihabara / Asakusa (northeast toward Skytree)
              type = seed < 0.45 ? 5 : 1; hMin = 130; hMax = 300
            } else {
              // Outer rings — residential / light industrial
              type = seed < 0.55 ? 3 : 5; hMin = 130; hMax = 240
            }

            const bs = sr(cx * 3.1 + cz * 7.7)
            const w = MAX_W * (0.48 + bs * 0.52)           // 30–62 m wide
            const d = MAX_W * (0.48 + sr(bs * 5.3) * 0.52)
            const h = hMin + sr(bs * 3.7) * (hMax - hMin)
            const ry = (sr(bs * 9.3) - 0.5) * Math.PI * 0.12  // ±11°

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
    hwyTex.repeat.set(1, 5)
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x141420, map: hwyTex })
    const pMat   = new THREE.MeshLambertMaterial({ color: 0x1c1c28 })
    const railMat = new THREE.MeshLambertMaterial({ color: 0x0088cc, emissive: 0x0055aa, emissiveIntensity: 0.8 })

    // Inner loop r=480 m, y=30 m (threads through CBD base)
    this.buildHwyRing(480, 30, 20, 3, 24, deckMat, pMat, railMat)
    // Outer loop r=950 m, y=46 m
    this.buildHwyRing(950, 46, 22, 3, 32, deckMat, pMat, railMat)

    // 4 radial spokes
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const cos = Math.cos(a), sin = Math.sin(a)
      const len = 470  // r 480→950
      const sg = new THREE.Group()
      sg.position.set(cos * 715, 38, sin * 715)
      sg.rotation.y = -a + Math.PI / 2
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(len, 3, 18), deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 2, 1), railMat)
        rail.position.set(0, 2.5, 8.5 * side)
        sg.add(rail)
      }
      this.scene.add(sg); this.deco.push(sg)
      for (let p = 0; p < 4; p++) {
        const pr = 480 + (p + 0.5) * 117.5
        const pl = new THREE.Mesh(new THREE.BoxGeometry(4, 38, 4), pMat)
        pl.position.set(cos * pr, 19, sin * pr)
        this.scene.add(pl); this.deco.push(pl)
      }
    }
  }

  private buildHwyRing(
    R: number, Y: number, roadW: number, deckH: number, N: number,
    deckMat: THREE.Material, pMat: THREE.Material, railMat: THREE.Material
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
      this.scene.add(seg); this.deco.push(seg)
      if (i % 4 === 0) {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(5, Y, 5), pMat)
        pl.position.set(Math.cos(am) * R, Y / 2, Math.sin(am) * R)
        this.scene.add(pl); this.deco.push(pl)
      }
    }
  }

  // ===== TOKYO LANDMARKS (individually placed — accurate collision) =====

  private createLandmarks(): void {
    this.buildSkytree(820, 640)
    this.buildTokyoTower(-450, 510)
    this.buildShinjukuCluster()
    this.buildMast(340, -220, 20, 420)
    this.buildMast(-280, 380, 14, 320)
  }

  // Tokyo Skytree 634 m — triangular lattice base, two observation decks, neon spine
  private buildSkytree(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group()
    g.position.set(X, gy, Z)

    const steelMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4c, emissive: 0x081428, emissiveIntensity: 0.2 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x66aacc, emissive: 0x1144aa, emissiveIntensity: 0.6 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0x4466ff, emissive: 0x3355ee, emissiveIntensity: 2.0 })
    const neonR    = new THREE.MeshLambertMaterial({ color: 0x8844ff, emissive: 0x6633ee, emissiveIntensity: 2.0 })

    // Base triangular lattice (0-350 m): CylinderGeometry radialSegs=3 → triangle cross-section
    const base = new THREE.Mesh(new THREE.CylinderGeometry(13, 58, 350, 3), steelMat)
    base.position.y = 175; g.add(base)

    // Deck 1 at 350 m
    const d1 = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 14, 16), glassMat)
    d1.position.y = 357; g.add(d1)

    // Mid shaft 350-450 m
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(10, 13, 100, 8), steelMat)
    s1.position.y = 400; g.add(s1)

    // Deck 2 at 450 m
    const d2 = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 12, 12), glassMat)
    d2.position.y = 456; g.add(d2)

    // Upper shaft 450-600 m
    const s2 = new THREE.Mesh(new THREE.CylinderGeometry(5, 10, 150, 6), steelMat)
    s2.position.y = 525; g.add(s2)

    // Broadcast mast 600-634 m
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(1, 4, 34, 6), steelMat)
    mast.position.y = 617; g.add(mast)

    // 3 neon vertical spines along lattice edges
    for (let c = 0; c < 3; c++) {
      const a = (c / 3) * Math.PI * 2
      const mat = c === 0 ? neonMat : neonR
      const spine = new THREE.Mesh(new THREE.BoxGeometry(2, 350, 2), mat)
      spine.position.set(Math.cos(a) * 32, 175, Math.sin(a) * 32)
      g.add(spine)
    }

    // Neon rings at decks
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 2), neonMat)
      p1.position.set(Math.cos(a) * 28, 352, Math.sin(a) * 28)
      g.add(p1)
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 8, 1.5), neonR)
      p2.position.set(Math.cos(a) * 20, 452, Math.sin(a) * 20)
      g.add(p2)
    }

    this.scene.add(g); this.landmarks.push(g)
  }

  // Tokyo Tower 333 m — red/white 4-sided tapered lattice + observation decks
  private buildTokyoTower(X: number, Z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(X, Z)
    const g = new THREE.Group()
    g.position.set(X, gy, Z)

    const redMat   = new THREE.MeshLambertMaterial({ color: 0xff2800, emissive: 0x440a00, emissiveIntensity: 0.3 })
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0x222222, emissiveIntensity: 0.1 })
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x88bbcc, emissive: 0x112233, emissiveIntensity: 0.4 })
    const neonMat  = new THREE.MeshLambertMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1.0 })

    // Main body: 4-sided tapered tower
    const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 32, 262, 4), redMat)
    body.position.y = 131; body.rotation.y = Math.PI / 4; g.add(body)

    // White structural bands
    for (const [y, hw] of [[50, 28], [100, 22], [155, 15], [210, 9]] as [number, number][]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(hw * 2, 5, hw * 2), whiteMat)
      band.position.y = y; band.rotation.y = Math.PI / 4; g.add(band)
    }

    // Observation deck 1 (150 m)
    const obs1 = new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 14, 12), glassMat)
    obs1.position.y = 157; g.add(obs1)

    // Special deck 2 (250 m)
    const obs2 = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 12, 12), glassMat)
    obs2.position.y = 256; g.add(obs2)

    // Upper shaft 262-333 m
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(2, 7, 71, 4), redMat)
    upper.position.y = 298; upper.rotation.y = Math.PI / 4; g.add(upper)

    // Neon edge strips (cyberpunk addition)
    for (let c = 0; c < 4; c++) {
      const a = c * Math.PI / 2 + Math.PI / 4
      const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 260, 1.5), neonMat)
      strip.position.set(Math.cos(a) * 18, 131, Math.sin(a) * 18)
      g.add(strip)
    }

    this.scene.add(g); this.landmarks.push(g)
  }

  // Shinjuku skyscraper cluster — hand-placed, maximally cyberpunk
  private buildShinjukuCluster(): void {
    const towers = [
      { x: -560, z: -360, w: 60, d: 54, h: 510 },
      { x: -648, z: -225, w: 50, d: 47, h: 445 },
      { x: -488, z: -292, w: 58, d: 52, h: 390 },
      { x: -718, z: -362, w: 45, d: 41, h: 318 },
      { x: -592, z: -458, w: 52, d: 48, h: 362 },
      { x: -432, z: -394, w: 44, d: 40, h: 276 },
    ]

    const neonColors = [0x00ffcc, 0xff00aa, 0x0088ff, 0xffcc00, 0xff4400, 0x88ff00]

    towers.forEach((p, i) => {
      const gy = NeoTokyoMapSystem.heightAt(p.x, p.z)
      const nC = neonColors[i % neonColors.length]
      const tex = makeWinTex([5, 8, 20] as RGB, [nC >> 16 & 0xff, nC >> 8 & 0xff, nC & 0xff] as RGB, 7, 14)
      tex.repeat.set(1, 2)

      const tower = new THREE.Mesh(
        new THREE.BoxGeometry(p.w, p.h, p.d),
        new THREE.MeshLambertMaterial({
          map: tex,
          emissive: new THREE.Color(nC),
          emissiveIntensity: 0.30,
        })
      )
      tower.position.set(p.x, gy + p.h / 2, p.z)
      tower.castShadow = !this.mobile
      this.scene.add(tower); this.landmarks.push(tower)

      // Neon crown
      const crown = new THREE.Mesh(
        new THREE.BoxGeometry(p.w + 8, 10, p.d + 8),
        new THREE.MeshLambertMaterial({ color: nC, emissive: new THREE.Color(nC), emissiveIntensity: 2.2 })
      )
      crown.position.set(p.x, gy + p.h + 5, p.z)
      this.scene.add(crown); this.landmarks.push(crown)

      // Vertical neon corner strips
      const stripMat = new THREE.MeshLambertMaterial({ color: nC, emissive: new THREE.Color(nC), emissiveIntensity: 1.8 })
      for (let c = 0; c < 4; c++) {
        const a = c * Math.PI / 2 + Math.PI / 4
        const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, p.h, 1.5), stripMat)
        strip.position.set(p.x + Math.cos(a) * (p.w / 2 + 1), gy + p.h / 2, p.z + Math.sin(a) * (p.d / 2 + 1))
        this.scene.add(strip); this.landmarks.push(strip)
      }
    })
  }

  private buildMast(x: number, z: number, radius: number, h: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.06, radius * 0.22, h, 6),
      new THREE.MeshLambertMaterial({ color: 0x707080 })
    )
    shaft.position.set(x, gy + h / 2, z)
    this.scene.add(shaft); this.landmarks.push(shaft)

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.28, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xff1100, emissive: 0xff1100, emissiveIntensity: 3.5 })
    )
    beacon.position.set(x, gy + h, z)
    this.scene.add(beacon); this.landmarks.push(beacon)
  }

  // ===== CYBERPUNK HOLOGRAPHIC BEAMS (visual deco, no collision) =====

  private createHolograms(): void {
    const beamPositions = [
      { x:   0, z: -600, color: 0x00ffcc },
      { x: 300, z:    0, color: 0xff00aa },
      { x:   0, z:  500, color: 0x0088ff },
      { x:-300, z:    0, color: 0xffcc00 },
      { x: 600, z: -400, color: 0x00ffcc },
      { x:-600, z:  400, color: 0xff00aa },
      { x: 900, z:  300, color: 0x00aaff },
      { x:-250, z: -800, color: 0xff4400 },
    ]

    for (const bp of beamPositions) {
      const gy = NeoTokyoMapSystem.heightAt(bp.x, bp.z)
      const mat = new THREE.MeshLambertMaterial({
        color: bp.color,
        emissive: new THREE.Color(bp.color),
        emissiveIntensity: 2.5,
        transparent: true,
        opacity: 0.28,
      })
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 900, 8), mat)
      beam.position.set(bp.x, gy + 450, bp.z)
      this.scene.add(beam); this.deco.push(beam)

      // Base glow disc
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(18, 18, 1, 16),
        new THREE.MeshLambertMaterial({ color: bp.color, emissive: new THREE.Color(bp.color), emissiveIntensity: 2.0, transparent: true, opacity: 0.5 })
      )
      disc.position.set(bp.x, gy + 0.5, bp.z)
      this.scene.add(disc); this.deco.push(disc)
    }

    // Neon road grid lines at major intersections (cross-shaped flat strips)
    const roadNeonMat = new THREE.MeshLambertMaterial({
      color: 0x00ccff, emissive: 0x0088cc, emissiveIntensity: 0.8,
    })
    for (let x = -900; x <= 900; x += 300) {
      const gy = NeoTokyoMapSystem.heightAt(x, 0)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 2800), roadNeonMat)
      strip.position.set(x, gy + 0.3, 0)
      this.scene.add(strip); this.deco.push(strip)
    }
    for (let z = -900; z <= 900; z += 300) {
      const gy = NeoTokyoMapSystem.heightAt(0, z)
      const strip = new THREE.Mesh(new THREE.BoxGeometry(2800, 0.5, 4), roadNeonMat)
      strip.position.set(0, gy + 0.3, z)
      this.scene.add(strip); this.deco.push(strip)
    }
  }

  // ===== WATER =====

  private createWater(): void {
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x05101e, emissive: 0x000c18, emissiveIntensity: 0.3 })

    // Tokyo Bay
    const bay = new THREE.Mesh(new THREE.PlaneGeometry(7000, 5000), waterMat)
    bay.rotation.x = -Math.PI / 2
    bay.position.set(800, 0.3, 4200)
    this.scene.add(bay); this.deco.push(bay)

    // Sumida river (north-south)
    const sumida = new THREE.Mesh(new THREE.BoxGeometry(70, 0.4, 5500), waterMat)
    sumida.position.set(640, 0.2, 0)
    this.scene.add(sumida); this.deco.push(sumida)

    // Kanda river (east-west diagonal)
    const kanda = new THREE.Mesh(new THREE.BoxGeometry(45, 0.4, 3200), waterMat)
    kanda.position.set(-750, 0.2, 300)
    this.scene.add(kanda); this.deco.push(kanda)
  }
}
