import * as THREE from 'three'

// ===== PROCEDURAL TEXTURE HELPERS =====

function makeWinTex(
  bg: [number, number, number],
  win: [number, number, number],
  cols: number,
  rows: number,
  winPct = 0.70
): THREE.DataTexture {
  const W = 128, H = 256
  const data = new Uint8Array(4 * W * H)
  const cw = W / cols, rh = H / rows
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const cx = (px % cw) / cw
      const cy = (py % rh) / rh
      const inWin = cx < winPct && cy < winPct
      const [r, g, b] = inWin ? win : bg
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
      // Lane markings
      if ((px % 20) < 2 && (py % 28) < 18) { r = 200; g = 185; b = 0 }
      // Guard rail strips
      if (px < 3 || px > W - 4) { r = 110; g = 115; b = 130 }
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  return t
}

// Seeded deterministic pseudo-random [0, 1)
function sr(seed: number): number {
  return Math.abs(Math.sin(seed * 127.1 + 311.7) * 43758.5453 % 1)
}

// Distance from v to nearest multiple of step
function distToGrid(v: number, step: number): number {
  const mod = ((v % step) + step) % step
  return Math.min(mod, step - mod)
}

interface BSpec { type: number; x: number; z: number; w: number; d: number; h: number; ry: number }

interface BuildingTypeDef {
  bg: [number, number, number]
  win: [number, number, number]
  cols: number
  rows: number
  emissive: number
}

const BUILDING_TYPES: BuildingTypeDef[] = [
  { bg: [14, 20, 36],  win: [155, 220, 255], cols: 6,  rows: 20, emissive: 0x001e3a }, // 0 Glass Tower
  { bg: [44, 50, 62],  win: [215, 225, 245], cols: 8,  rows: 24, emissive: 0x000d1a }, // 1 Corp Steel
  { bg: [10, 8,  16],  win: [255, 75,  205], cols: 5,  rows: 16, emissive: 0x1e0020 }, // 2 Neon Entertainment
  { bg: [58, 53, 48],  win: [200, 148, 48],  cols: 4,  rows: 8,  emissive: 0x0e0700 }, // 3 Concrete Industrial
  { bg: [72, 68, 58],  win: [255, 228, 138], cols: 6,  rows: 18, emissive: 0x0e0e00 }, // 4 Residential
  { bg: [8,  13, 9],   win: [38,  200, 68],  cols: 3,  rows: 10, emissive: 0x001000 }, // 5 Dark Facility
]

// ===== MAIN CLASS =====

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
    if (!this.mobile) this.createHighways()
    this.createLandmarks()
    this.createWater()
  }

  // ===== PUBLIC INTERFACE =====

  // Flat urban terrain — artificial fill land, height variation from buildings
  static heightAt(x: number, z: number): number {
    let h = 6
    h += Math.sin(x * 0.0007) * Math.cos(z * 0.0009) * 10
    h += Math.sin(x * 0.0032) * Math.sin(z * 0.0027) * 4
    const bayDrop = z - 2600
    if (bayDrop > 0) h -= bayDrop * 0.012
    return Math.max(0, h)
  }

  getTerrainHeight(x: number, z: number): number {
    return NeoTokyoMapSystem.heightAt(x, z)
  }

  getSafeSpawnPosition(): { x: number; y: number; z: number } {
    return { x: 0, y: 900, z: -2000 }
  }

  getCollisionObjects(): THREE.Object3D[] {
    return [...this.landmarks, ...this.instancedMeshes]
  }

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
    const SIZE = 12000
    const SEGS = this.mobile ? 64 : 128
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position.array as Float32Array
    const cols = new Float32Array(pos.length)

    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], z = pos[i + 2]
      pos[i + 1] = NeoTokyoMapSystem.heightAt(x, z)

      // Ground coloring: dark asphalt roads on a 300 m grid, concrete blocks between
      const dRoad = Math.min(distToGrid(x, 300), distToGrid(z, 300))
      let r: number, g: number, b: number
      if (dRoad < 50) {
        // Road surface — dark asphalt
        r = 0.12; g = 0.12; b = 0.13
        const n = sr(i * 0.007) * 0.025
        r += n; g += n; b += n
      } else if (dRoad < 58) {
        // Sidewalk / kerb — lighter concrete
        r = 0.24; g = 0.23; b = 0.21
      } else {
        // City block — concrete plaza
        r = 0.20; g = 0.19; b = 0.17
        // Subtle random texture variation
        r += sr(i * 0.019) * 0.04
        g += sr(i * 0.023) * 0.03
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
    const textures = BUILDING_TYPES.map(t => makeWinTex(t.bg, t.win, t.cols, t.rows))
    // Repeat scale: 4 tiles wide × 8 tiles tall per unit geometry face
    textures.forEach(t => t.repeat.set(4, 8))

    const specs = this.collectBuildingSpecs()
    const unitGeo = new THREE.BoxGeometry(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)

    for (let t = 0; t < BUILDING_TYPES.length; t++) {
      const list = specs.filter(s => s.type === t)
      if (!list.length) continue

      const mat = new THREE.MeshLambertMaterial({
        map: textures[t],
        emissive: new THREE.Color(BUILDING_TYPES[t].emissive),
        emissiveIntensity: 0.10,
      })

      const mesh = new THREE.InstancedMesh(unitGeo, mat, list.length)
      mesh.castShadow = !this.mobile
      mesh.name = `NeoTokyo_Buildings_t${t}`

      const mtx = new THREE.Matrix4()
      const q = new THREE.Quaternion()

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
    const BLOCK = 240, HALF = 2400
    // Clearance from road centrelines (roads at every 300 m)
    const ROAD_CLEAR = 68

    for (let bx = -HALF; bx < HALF; bx += BLOCK) {
      for (let bz = -HALF; bz < HALF; bz += BLOCK) {
        const cx = bx + BLOCK / 2
        const cz = bz + BLOCK / 2

        // Skip blocks that straddle a road corridor
        if (distToGrid(cx, 300) < ROAD_CLEAR) continue
        if (distToGrid(cz, 300) < ROAD_CLEAR) continue

        const seed = sr(bx * 0.1 + bz * 0.013)
        // Halve density on mobile
        if (this.mobile && seed > 0.5) continue

        const r = Math.hypot(cx, cz)
        let type: number, hMin: number, hMax: number, wMin: number, wMax: number

        if (r < 500) {
          // CBD — tall glass towers
          type = 0; hMin = 180; hMax = 620; wMin = 50; wMax = 110
        } else if (r < 900) {
          // Midtown — corp + neon mix
          type = seed < 0.55 ? 1 : 2; hMin = 80; hMax = 300; wMin = 60; wMax = 170
        } else if (r < 1500) {
          // Inner suburbs — residential + corp
          type = seed < 0.6 ? 4 : 1; hMin = 50; hMax = 160; wMin = 55; wMax = 130
        } else if (r < 2100) {
          // Outer — industrial + residential
          type = seed < 0.42 ? 3 : 4; hMin = 30; hMax = 100; wMin = 90; wMax = 260
        } else {
          // City fringe — dark facilities + warehouses
          type = seed < 0.5 ? 5 : 3; hMin = 20; hMax = 65; wMin = 110; wMax = 300
        }

        const bs = sr(bx * 7.1 + bz * 3.7)
        const w = Math.max(30, wMin + bs * (wMax - wMin))
        const d = Math.max(30, wMin + sr(bs * 5.1) * (wMax - wMin))
        const h = hMin + sr(bs * 3.3) * (hMax - hMin)
        // Slight offset within block so buildings don't all sit at grid centres
        const maxOx = Math.max(0, (BLOCK - w) / 2 - 15)
        const maxOz = Math.max(0, (BLOCK - d) / 2 - 15)
        const ox = (sr(bs * 1.7) - 0.5) * 2 * maxOx
        const oz = (sr(bs * 2.3) - 0.5) * 2 * maxOz
        // Slight random rotation (up to ±22.5°) for visual variety
        const ry = (sr(bs * 9.1) - 0.5) * Math.PI * 0.25

        specs.push({ type, x: cx + ox, z: cz + oz, w, d, h, ry })
      }
    }

    return specs
  }

  // ===== ELEVATED HIGHWAY RING =====

  private createHighways(): void {
    const hwyTex = makeHwyTex()
    hwyTex.repeat.set(1, 5)
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x1c1c22, map: hwyTex })
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x282832 })
    const railMat = new THREE.MeshLambertMaterial({
      color: 0x4a4a5c,
      emissive: 0x00112a,
      emissiveIntensity: 0.4,
    })

    const HWY_Y = 62, RING_R = 1050, ROAD_W = 28, DECK_H = 3, N = 48

    // Outer ring
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2
      const a1 = ((i + 1) / N) * Math.PI * 2
      const am = (a0 + a1) / 2
      const len = 2 * RING_R * Math.sin(Math.PI / N) + 1

      const seg = new THREE.Group()
      seg.position.set(Math.cos(am) * RING_R, HWY_Y, Math.sin(am) * RING_R)
      seg.rotation.y = -am + Math.PI / 2

      // Deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(len, DECK_H, ROAD_W), deckMat)
      seg.add(deck)

      // Guard rails (local Z offset)
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 1.2), railMat)
        rail.position.set(0, DECK_H / 2 + 1.25, (ROAD_W / 2 - 0.6) * side)
        seg.add(rail)
      }

      this.scene.add(seg)
      this.highways.push(seg)

      // Support pillar every 3rd segment
      if (i % 3 === 0) {
        const px = Math.cos(am) * RING_R
        const pz = Math.sin(am) * RING_R
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(5, HWY_Y, 5), pillarMat)
        pillar.position.set(px, HWY_Y / 2, pz)
        this.scene.add(pillar)
        this.highways.push(pillar)
      }
    }

    // Radial spokes: N / S / E / W from ring down toward CBD
    const SPOKE_LEN = RING_R - 320
    const spokeAngles = [Math.PI * 1.5, Math.PI * 0.5, 0, Math.PI]

    for (const a of spokeAngles) {
      const cos = Math.cos(a), sin = Math.sin(a)
      const cx = cos * (RING_R - SPOKE_LEN / 2)
      const cz = sin * (RING_R - SPOKE_LEN / 2)

      const spokeGroup = new THREE.Group()
      spokeGroup.position.set(cx, HWY_Y, cz)
      spokeGroup.rotation.y = -a + Math.PI / 2

      const sDeck = new THREE.Mesh(new THREE.BoxGeometry(SPOKE_LEN, DECK_H, ROAD_W - 4), deckMat)
      spokeGroup.add(sDeck)
      for (const side of [-1, 1]) {
        const sRail = new THREE.Mesh(new THREE.BoxGeometry(SPOKE_LEN, 2.5, 1.2), railMat)
        sRail.position.set(0, DECK_H / 2 + 1.25, ((ROAD_W - 4) / 2 - 0.6) * side)
        spokeGroup.add(sRail)
      }

      this.scene.add(spokeGroup)
      this.highways.push(spokeGroup)

      // Pillars along spoke
      const nP = Math.floor(SPOKE_LEN / 130)
      for (let p = 0; p < nP; p++) {
        const t = (p + 0.5) / nP
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(5, HWY_Y, 5), pillarMat)
        pillar.position.set(
          cos * (RING_R - t * SPOKE_LEN),
          HWY_Y / 2,
          sin * (RING_R - t * SPOKE_LEN)
        )
        this.scene.add(pillar)
        this.highways.push(pillar)
      }
    }

    // Inner ring (overpass loop around CBD at radius 380 m)
    const IN_R = 380, IN_Y = 42, IN_N = 32
    const innerDeckMat = new THREE.MeshLambertMaterial({ color: 0x181820, map: hwyTex })
    for (let i = 0; i < IN_N; i++) {
      const am = ((i + 0.5) / IN_N) * Math.PI * 2
      const len = 2 * IN_R * Math.sin(Math.PI / IN_N) + 1

      const seg = new THREE.Group()
      seg.position.set(Math.cos(am) * IN_R, IN_Y, Math.sin(am) * IN_R)
      seg.rotation.y = -am + Math.PI / 2

      const deck = new THREE.Mesh(new THREE.BoxGeometry(len, DECK_H - 1, 22), innerDeckMat)
      seg.add(deck)
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 2, 1), railMat)
        rail.position.set(0, (DECK_H - 1) / 2 + 1, 10.5 * side)
        seg.add(rail)
      }

      this.scene.add(seg)
      this.highways.push(seg)
    }
  }

  // ===== LANDMARK MEGASTRUCTURES =====

  private createLandmarks(): void {
    // 1. Central Spire — 85 m wide, 740 m tall glass tower
    this.addSpire(0, 0, 85, 740, 0x00ccff)

    // 2. Tokyo Gate — twin towers north of CBD
    this.addTower(-210, -640, 72, 60, 570, [18, 26, 44], [0, 170, 220])
    this.addTower( 210, -640, 72, 60, 570, [18, 26, 44], [0, 170, 220])
    // Skybridge between towers at y = 370
    const skybridge = new THREE.Mesh(
      new THREE.BoxGeometry(450, 14, 48),
      new THREE.MeshLambertMaterial({ color: 0x0a1828, emissive: 0x003366, emissiveIntensity: 0.45 })
    )
    skybridge.position.set(0, 378, -640)
    this.scene.add(skybridge); this.landmarks.push(skybridge)

    // 3. NE Corp Cluster
    this.addTower( 820, -820, 110, 85, 400, [28, 22, 14], [255, 160, 0])
    this.addTower( 990, -720, 65,  55, 290, [28, 22, 14], [255, 120, 0])
    this.addTower( 740, -950, 55,  50, 240, [28, 22, 14], [255, 100, 0])

    // 4. SE Entertainment Megaplex — wide low-rise with neon crown
    this.addMegaBlock(880, 920, 420, 360, 130, [8, 4, 18])
    this.addNeonRing(880, 134, 920, 185, 0xff00cc, 26)

    // 5. NW Fortress — dark imposing tower
    this.addTower(-1250, -820, 130, 110, 480, [14, 14, 22], [60, 60, 255])

    // 6. Broadcast masts
    this.addMast( 320, -120, 22, 420)
    this.addMast(-370,  220, 16, 360)
    this.addMast( 900,  400, 14, 280)

    // 7. Elevated billboard clusters along the main E-W arterial (z ≈ 0)
    for (const x of [-1400, -900, 900, 1400]) {
      this.addBillboard(x, 0)
    }

    // 8. Port cranes near bay
    this.addCrane( 1500, 1900)
    this.addCrane(-1100, 2100)
    this.addCrane(  400, 2300)
  }

  // Large signature tower with neon-stripe corners
  private addSpire(x: number, z: number, w: number, h: number, neonColor: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, gy, z)

    const bodyMat = new THREE.MeshLambertMaterial({
      map: makeWinTex([10, 18, 32], [140, 220, 255], 8, 32),
      emissive: 0x00111e,
      emissiveIntensity: 0.08,
    })
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.78, w), bodyMat)
    body.position.y = h * 0.39
    g.add(body)

    // Step-back section
    const mid = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.7, h * 0.12, w * 0.7),
      new THREE.MeshLambertMaterial({ color: 0x081018, emissive: 0x001830, emissiveIntensity: 0.25 })
    )
    mid.position.y = h * 0.78 + h * 0.06
    g.add(mid)

    // Tapered spire top
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.04, w * 0.32, h * 0.15, 4),
      new THREE.MeshLambertMaterial({ color: 0x05101a, emissive: new THREE.Color(neonColor), emissiveIntensity: 0.8 })
    )
    top.position.y = h * 0.9 + h * 0.075
    top.rotation.y = Math.PI / 4
    g.add(top)

    // Neon corner stripes
    const neonMat = new THREE.MeshLambertMaterial({ color: neonColor, emissive: new THREE.Color(neonColor), emissiveIntensity: 2.0 })
    for (let c = 0; c < 4; c++) {
      const a = c * Math.PI / 2 + Math.PI / 4
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2, h * 0.80, 2), neonMat)
      stripe.position.set(Math.cos(a) * w * 0.53, h * 0.40, Math.sin(a) * w * 0.53)
      g.add(stripe)
    }

    // Crown ring
    const crownMat = new THREE.MeshLambertMaterial({ color: neonColor, emissive: new THREE.Color(neonColor), emissiveIntensity: 1.5 })
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w + 8, 6, w + 8), crownMat)
    crown.position.y = h * 0.78
    g.add(crown)

    this.scene.add(g); this.landmarks.push(g)
  }

  // Standard landmark tower
  private addTower(
    x: number, z: number, w: number, d: number, h: number,
    bgRGB: [number, number, number], neonRGB: [number, number, number]
  ): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, gy, z)

    const neonHex = (neonRGB[0] << 16) | (neonRGB[1] << 8) | neonRGB[2]
    const bodyMat = new THREE.MeshLambertMaterial({
      map: makeWinTex(bgRGB, [180, 220, 255], 5, 22),
      emissive: new THREE.Color((bgRGB[0] >> 1) << 16 | (bgRGB[1] >> 1) << 8 | (bgRGB[2] >> 1)),
      emissiveIntensity: 0.06,
    })

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat)
    body.position.y = h / 2
    g.add(body)

    // Neon crown band
    const crownMat = new THREE.MeshLambertMaterial({
      color: neonHex,
      emissive: new THREE.Color(neonHex),
      emissiveIntensity: 1.4,
    })
    const crown = new THREE.Mesh(new THREE.BoxGeometry(w + 5, 9, d + 5), crownMat)
    crown.position.y = h + 4.5
    g.add(crown)

    this.scene.add(g); this.landmarks.push(g)
  }

  // Wide low megablock
  private addMegaBlock(x: number, z: number, w: number, d: number, h: number, bgRGB: [number, number, number]): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({
        map: makeWinTex(bgRGB, [255, 55, 175], 14, 6),
        emissive: 0x150020,
        emissiveIntensity: 0.18,
      })
    )
    block.position.set(x, gy + h / 2, z)
    this.scene.add(block); this.landmarks.push(block)
  }

  // Neon ring of posts at top of megablock
  private addNeonRing(x: number, y: number, z: number, r: number, color: number, n: number): void {
    const mat = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 2.0 })
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const post = new THREE.Mesh(new THREE.BoxGeometry(3.5, 14, 3.5), mat)
      post.position.set(x + Math.cos(a) * r, y, z + Math.sin(a) * r)
      this.scene.add(post); this.landmarks.push(post)
    }
  }

  // Broadcast mast with tapered shaft and beacon
  private addMast(x: number, z: number, radius: number, h: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.08, radius * 0.28, h, 6),
      new THREE.MeshLambertMaterial({ color: 0x808090 })
    )
    shaft.position.set(x, gy + h / 2, z)
    this.scene.add(shaft); this.landmarks.push(shaft)

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.38, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 2.5 })
    )
    beacon.position.set(x, gy + h, z)
    this.scene.add(beacon); this.landmarks.push(beacon)
  }

  // Roadside billboard pole
  private addBillboard(x: number, z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, gy, z)

    const colors = [0xff0066, 0x00ccff, 0xffaa00, 0x00ff88]
    const color = colors[Math.floor(Math.abs(x) % colors.length)]

    // Pole
    const pole = new THREE.Mesh(new THREE.BoxGeometry(3, 80, 3),
      new THREE.MeshLambertMaterial({ color: 0x303038 }))
    pole.position.y = 40
    g.add(pole)

    // Board
    const board = new THREE.Mesh(new THREE.BoxGeometry(60, 30, 2),
      new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.8 }))
    board.position.y = 90
    g.add(board)

    this.scene.add(g); this.landmarks.push(g)
  }

  // Port crane
  private addCrane(x: number, z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, gy, z)
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a6028 })

    const mast = new THREE.Mesh(new THREE.BoxGeometry(9, 210, 9), mat)
    mast.position.y = 105
    g.add(mast)

    const boom = new THREE.Mesh(new THREE.BoxGeometry(320, 5, 5), mat)
    boom.position.set(90, 210, 0)
    g.add(boom)

    const counter = new THREE.Mesh(new THREE.BoxGeometry(110, 5, 5), mat)
    counter.position.set(-70, 205, 0)
    g.add(counter)

    // Hook cable
    const cable = new THREE.Mesh(new THREE.BoxGeometry(1, 60, 1),
      new THREE.MeshLambertMaterial({ color: 0x404048 }))
    cable.position.set(180, 180, 0)
    g.add(cable)

    this.scene.add(g); this.landmarks.push(g)
  }

  // ===== WATER =====

  private createWater(): void {
    // Tokyo Bay — south-east
    const bay = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 4000),
      new THREE.MeshLambertMaterial({ color: 0x081828, emissive: 0x00101e, emissiveIntensity: 0.25 })
    )
    bay.rotation.x = -Math.PI / 2
    bay.position.set(600, 0.1, 3800)
    this.scene.add(bay); this.highways.push(bay)

    // Sumida river channel through city
    const river = new THREE.Mesh(
      new THREE.BoxGeometry(70, 0.3, 5000),
      new THREE.MeshLambertMaterial({ color: 0x071420, emissive: 0x000f18, emissiveIntensity: 0.2 })
    )
    river.position.set(650, 0.15, 0)
    this.scene.add(river); this.highways.push(river)

    // Second canal
    const canal = new THREE.Mesh(
      new THREE.BoxGeometry(40, 0.3, 3000),
      new THREE.MeshLambertMaterial({ color: 0x071420, emissive: 0x000f18, emissiveIntensity: 0.2 })
    )
    canal.position.set(-800, 0.15, 800)
    this.scene.add(canal); this.highways.push(canal)
  }
}
