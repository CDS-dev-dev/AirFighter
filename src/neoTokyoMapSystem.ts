import * as THREE from 'three'

// ===== PROCEDURAL TEXTURE HELPERS =====

function makeWinTex(
  bg: [number, number, number],
  win: [number, number, number],
  cols: number,
  rows: number
): THREE.DataTexture {
  const W = 128, H = 256
  const data = new Uint8Array(4 * W * H)
  const cw = W / cols, rh = H / rows
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const cx = (px % cw) / cw, cy = (py % rh) / rh
      // Window pane (inner 70%), frame = outer 30%
      const inWin = cx > 0.08 && cx < 0.82 && cy > 0.08 && cy < 0.82
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
      let r = 28, g = 28, b = 32
      if ((px % 18) < 2 && (py % 26) < 16) { r = 210; g = 195; b = 0 }
      if (px < 3 || px > W - 4) { r = 105; g = 110; b = 125 }
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.needsUpdate = true
  return t
}

// Deterministic pseudo-random [0,1)
function sr(n: number): number {
  return Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453 % 1)
}

interface BSpec { type: number; x: number; z: number; w: number; d: number; h: number; ry: number }

// ===== BUILDING TYPE DEFINITIONS =====
// bg and win are 0-255 RGB values for DataTexture
const B_TYPES = [
  { bg: [22, 32, 54]  as [number,number,number], win: [160,225,255] as [number,number,number], cols: 6,  rows: 20, em: 0x001830 }, // 0 Glass Tower (CBD)
  { bg: [52, 58, 70]  as [number,number,number], win: [220,228,248] as [number,number,number], cols: 7,  rows: 22, em: 0x000e1c }, // 1 Corp Steel
  { bg: [18, 10, 28]  as [number,number,number], win: [255, 80,210] as [number,number,number], cols: 5,  rows: 14, em: 0x1c0024 }, // 2 Neon Entertainment
  { bg: [62, 58, 52]  as [number,number,number], win: [205,155, 55] as [number,number,number], cols: 4,  rows: 7,  em: 0x100800 }, // 3 Concrete Industrial
  { bg: [80, 74, 62]  as [number,number,number], win: [255,232,145] as [number,number,number], cols: 5,  rows: 16, em: 0x0e0e00 }, // 4 Residential
  { bg: [10, 16, 10]  as [number,number,number], win: [ 40,205, 72] as [number,number,number], cols: 3,  rows: 9,  em: 0x001200 }, // 5 Dark Facility
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
    this.createHighways()
    this.createLandmarks()
    this.createWater()
  }

  // ===== PUBLIC INTERFACE =====

  // Gentle rolling city terrain — primary height comes from buildings
  static heightAt(x: number, z: number): number {
    let h = 12
    // Gentle hills (0–80 m range) — like actual Tokyo topography
    h += Math.sin(x * 0.00055) * Math.cos(z * 0.00070) * 38
    h += Math.sin(x * 0.0018)  * Math.sin(z * 0.0022)  * 18
    h += Math.sin(x * 0.0045)  * Math.cos(z * 0.0038)  * 9
    // Slight bay depression in south
    const bay = z - 2500
    if (bay > 0) h -= bay * 0.015
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
    const SIZE = 12000, SEGS = this.mobile ? 64 : 128
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position.array as Float32Array
    const cols = new Float32Array(pos.length)

    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], z = pos[i + 2]
      pos[i + 1] = NeoTokyoMapSystem.heightAt(x, z)

      // Asphalt roads on a 300 m grid, concrete blocks between
      const rx = ((x % 300) + 300) % 300
      const rz = ((z % 300) + 300) % 300
      const dRx = Math.min(rx, 300 - rx)
      const dRz = Math.min(rz, 300 - rz)
      const dRoad = Math.min(dRx, dRz)

      let r: number, g: number, b: number
      if (dRoad < 44) {
        // Road asphalt
        r = 0.115; g = 0.115; b = 0.125
        const n = sr(i * 0.009) * 0.02
        r += n; g += n; b += n
      } else if (dRoad < 52) {
        // Kerb / sidewalk
        r = 0.22; g = 0.21; b = 0.19
      } else {
        // City block ground — concrete, slight variation
        r = 0.19 + sr(i * 0.017) * 0.05
        g = 0.18 + sr(i * 0.021) * 0.04
        b = 0.17 + sr(i * 0.025) * 0.03
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

  // ===== BUILDINGS =====

  private createBuildings(): void {
    const textures = B_TYPES.map(t => makeWinTex(t.bg, t.win, t.cols, t.rows))
    // 1 tile per face — texture fills entire face (bigger buildings = bigger-looking windows)
    // This gives consistent visual density that scales naturally with building size
    textures.forEach(t => t.repeat.set(1, 1))

    const specs = this.collectBuildingSpecs()

    const unitGeo = new THREE.BoxGeometry(1, 1, 1)
    const up = new THREE.Vector3(0, 1, 0)

    for (let t = 0; t < B_TYPES.length; t++) {
      const list = specs.filter(s => s.type === t)
      if (!list.length) continue

      const mat = new THREE.MeshLambertMaterial({
        map: textures[t],
        emissive: new THREE.Color(B_TYPES[t].em),
        emissiveIntensity: 0.12,
      })

      const mesh = new THREE.InstancedMesh(unitGeo, mat, list.length)
      mesh.castShadow = !this.mobile
      mesh.name = `NTBuildings_t${t}`

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

    // City block grid aligned to 300 m road spacing
    // Each road is 50 m wide → 250 m of buildable block per 300 m interval
    // We place 2 sub-blocks per 300 m: one at ±75 m offset from block centre
    const ROAD_STEP = 300
    const HALF = 2400

    // Block centres: at ±75, ±375, ±675, ... from origin
    // i.e. (n + 0.25) * 300 and (n + 0.75) * 300 for integer n
    const offsets = [0.25, 0.75]

    for (const ox of offsets) {
      for (let bx = -HALF; bx < HALF; bx += ROAD_STEP) {
        const cx = bx + ox * ROAD_STEP
        if (cx < -HALF || cx >= HALF) continue

        for (const oz of offsets) {
          for (let bz = -HALF; bz < HALF; bz += ROAD_STEP) {
            const cz = bz + oz * ROAD_STEP
            if (cz < -HALF || cz >= HALF) continue

            const r = Math.hypot(cx, cz)
            const seed = sr(cx * 0.13 + cz * 0.07)

            // Mobile: reduce to 40% density
            if (this.mobile && seed > 0.4) continue

            let type: number, hMin: number, hMax: number, wMin: number, wMax: number

            // Each sub-block = one building (4 sub-blocks per 300 m road cell = good density)
            if (r < 450) {
              type = 0; hMin = 200; hMax = 630; wMin = 45; wMax = 95
            } else if (r < 800) {
              type = seed < 0.55 ? 1 : 2; hMin = 90; hMax = 320; wMin = 55; wMax = 140
            } else if (r < 1300) {
              type = seed < 0.6 ? 4 : 1; hMin = 45; hMax = 170; wMin = 50; wMax = 115
            } else if (r < 2000) {
              type = seed < 0.45 ? 3 : 4; hMin = 25; hMax = 95; wMin = 75; wMax = 200
            } else {
              type = seed < 0.5 ? 5 : 3; hMin = 18; hMax = 65; wMin = 95; wMax = 260
            }

            // Skip ~20 % of outer positions for natural variety (not too grid-regular)
            if (r > 500 && seed > 0.80) continue

            const bs = sr(cx * 3.1 + cz * 7.7)
            const w = Math.max(25, wMin + bs * (wMax - wMin))
            const d = Math.max(25, wMin + sr(bs * 5.3) * (wMax - wMin))
            const h = hMin + sr(bs * 3.7) * (hMax - hMin)

            // Slight offset within the 130 m sub-block so the grid isn't perfectly regular
            const blockSize = ROAD_STEP * 0.43
            const maxOx2 = Math.max(0, (blockSize - w) / 2 - 5)
            const maxOz2 = Math.max(0, (blockSize - d) / 2 - 5)
            const dx = (sr(bs * 1.9) - 0.5) * 2 * maxOx2
            const dz = (sr(bs * 2.7) - 0.5) * 2 * maxOz2
            const ry = (sr(bs * 9.3) - 0.5) * Math.PI * 0.17

            specs.push({ type, x: cx + dx, z: cz + dz, w, d, h, ry })
          }
        }
      }
    }

    return specs
  }

  // ===== ELEVATED HIGHWAYS =====

  private createHighways(): void {
    const hwyTex = makeHwyTex()
    hwyTex.repeat.set(1, 6)
    const deckMat = new THREE.MeshLambertMaterial({ color: 0x1a1a22, map: hwyTex })
    const pillarMat = new THREE.MeshLambertMaterial({ color: 0x252530 })
    const railMat = new THREE.MeshLambertMaterial({
      color: 0x4a4c60, emissive: 0x00082a, emissiveIntensity: 0.5,
    })

    // Outer ring: radius 1050 m at y=160 m — safely above midtown rooflines (90-320 m)
    // but below the tallest CBD towers (200-630 m), creating dramatic close-passes
    this.buildRing(1050, 160, 30, 4, 48, deckMat, pillarMat, railMat, hwyTex)

    // Inner loop: radius 420 m at y=80 m — just above low-rise ring, weaves near CBD base
    this.buildRing(420, 80, 22, 3, 32, deckMat, pillarMat, railMat, hwyTex)

    // N/S/E/W radial spokes connecting rings, at y=160 m
    const SPOKE_R_OUTER = 1050, SPOKE_R_INNER = 420, SPOKE_Y = 160
    const SPOKE_W = 22
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const cos = Math.cos(a), sin = Math.sin(a)
      const spokeLen = SPOKE_R_OUTER - SPOKE_R_INNER
      const cx = cos * (SPOKE_R_INNER + spokeLen / 2)
      const cz = sin * (SPOKE_R_INNER + spokeLen / 2)

      const sg = new THREE.Group()
      sg.position.set(cx, SPOKE_Y, cz)
      sg.rotation.y = -a + Math.PI / 2
      sg.add(new THREE.Mesh(new THREE.BoxGeometry(spokeLen, 3, SPOKE_W), deckMat))
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(spokeLen, 2, 1), railMat)
        rail.position.set(0, 2.5, (SPOKE_W / 2 - 0.5) * side)
        sg.add(rail)
      }
      this.scene.add(sg); this.highways.push(sg)

      // Pillars
      const nP = Math.ceil(spokeLen / 140)
      for (let p = 0; p < nP; p++) {
        const t = (p + 0.5) / nP
        const pr = SPOKE_R_INNER + t * spokeLen
        const pl = new THREE.Mesh(new THREE.BoxGeometry(5, SPOKE_Y, 5), pillarMat)
        pl.position.set(Math.cos(a) * pr, SPOKE_Y / 2, Math.sin(a) * pr)
        this.scene.add(pl); this.highways.push(pl)
      }
    }
  }

  private buildRing(
    R: number, Y: number, roadW: number, deckH: number, N: number,
    deckMat: THREE.Material, pillarMat: THREE.Material, railMat: THREE.Material,
    _hwyTex: THREE.DataTexture
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

      if (i % 3 === 0) {
        const px = Math.cos(am) * R, pz = Math.sin(am) * R
        const pl = new THREE.Mesh(new THREE.BoxGeometry(6, Y, 6), pillarMat)
        pl.position.set(px, Y / 2, pz)
        this.scene.add(pl); this.highways.push(pl)
      }
    }
  }

  // ===== LANDMARKS =====

  private createLandmarks(): void {
    // 1. Central Spire — the CBD centrepiece
    this.addSpire(0, 0, 82, 740, 0x00ccff)

    // 2. Tokyo Gate towers — north approach landmark
    this.addLandmarkTower(-220, -660, 74, 62, 580, [16, 26, 44], [0, 170, 225])
    this.addLandmarkTower( 220, -660, 74, 62, 580, [16, 26, 44], [0, 170, 225])
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(464, 15, 50),
      new THREE.MeshLambertMaterial({ color: 0x091624, emissive: 0x003055, emissiveIntensity: 0.5 })
    )
    bridge.position.set(0, 390, -660)
    this.scene.add(bridge); this.landmarks.push(bridge)

    // 3. NE Corporate Cluster
    this.addLandmarkTower( 840, -840, 115, 90, 420, [28, 22, 14], [255, 160,  0])
    this.addLandmarkTower(1020, -730,  68, 58, 295, [28, 22, 14], [255, 120,  0])
    this.addLandmarkTower( 750, -960,  58, 52, 250, [28, 22, 14], [255, 100,  0])

    // 4. SE Entertainment Megaplex
    this.addMegaBlock(900, 940, 440, 380, 140, [8, 4, 18])
    this.addNeonRing(900, 143, 940, 190, 0xff00cc, 28)

    // 5. NW Fortress
    this.addLandmarkTower(-1270, -840, 135, 115, 500, [14, 14, 22], [55, 55, 255])

    // 6. Broadcast masts
    this.addMast( 330, -130, 24, 430)
    this.addMast(-380,  240, 18, 370)
    this.addMast( 920,  420, 15, 290)

    // 7. Roadside neon billboards along main east arterial
    for (const x of [-1450, -950, 950, 1450]) this.addBillboard(x, 0)

    // 8. Port cranes at bay
    this.addCrane( 1520, 1950)
    this.addCrane(-1080, 2120)
    this.addCrane(  450, 2350)
  }

  // Signature tapered tower with neon corner stripes
  private addSpire(x: number, z: number, w: number, h: number, neon: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, gy, z)

    // Body
    const bodyTex = makeWinTex([10, 18, 32], [145, 222, 255], 8, 30)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h * 0.78, w),
      new THREE.MeshLambertMaterial({ map: bodyTex, emissive: 0x001020, emissiveIntensity: 0.08 })
    )
    body.position.y = h * 0.39
    g.add(body)

    // Step-back
    const stepback = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.68, h * 0.12, w * 0.68),
      new THREE.MeshLambertMaterial({ color: 0x07101c, emissive: 0x00182c, emissiveIntensity: 0.3 })
    )
    stepback.position.y = h * 0.84
    g.add(stepback)

    // Tapered top
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(w * 0.04, w * 0.30, h * 0.14, 4),
      new THREE.MeshLambertMaterial({ color: 0x04101a, emissive: new THREE.Color(neon), emissiveIntensity: 0.85 })
    )
    top.position.y = h * 0.90 + h * 0.07
    top.rotation.y = Math.PI / 4
    g.add(top)

    // Neon corner stripes
    const neonMat = new THREE.MeshLambertMaterial({ color: neon, emissive: new THREE.Color(neon), emissiveIntensity: 2.2 })
    for (let c = 0; c < 4; c++) {
      const a = c * Math.PI / 2 + Math.PI / 4
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, h * 0.80, 2.2), neonMat)
      stripe.position.set(Math.cos(a) * w * 0.535, h * 0.40, Math.sin(a) * w * 0.535)
      g.add(stripe)
    }

    // Crown ring
    g.add(Object.assign(
      new THREE.Mesh(new THREE.BoxGeometry(w + 10, 7, w + 10), neonMat),
      { position: new THREE.Vector3(0, h * 0.79, 0) }
    ))

    this.scene.add(g); this.landmarks.push(g)
  }

  private addLandmarkTower(
    x: number, z: number, w: number, d: number, h: number,
    bgRGB: [number, number, number], neonRGB: [number, number, number]
  ): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, gy, z)

    const neonC = (neonRGB[0] << 16) | (neonRGB[1] << 8) | neonRGB[2]
    const bodyTex = makeWinTex(bgRGB, [180, 220, 255], 5, 20)
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ map: bodyTex, emissive: 0x000810, emissiveIntensity: 0.06 })
    )
    body.position.y = h / 2
    g.add(body)

    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(w + 6, 9, d + 6),
      new THREE.MeshLambertMaterial({ color: neonC, emissive: new THREE.Color(neonC), emissiveIntensity: 1.5 })
    )
    crown.position.y = h + 4.5
    g.add(crown)

    this.scene.add(g); this.landmarks.push(g)
  }

  private addMegaBlock(x: number, z: number, w: number, d: number, h: number, bgRGB: [number, number, number]): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const tex = makeWinTex(bgRGB, [255, 55, 175], 14, 5)
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ map: tex, emissive: 0x130018, emissiveIntensity: 0.22 })
    )
    block.position.set(x, gy + h / 2, z)
    this.scene.add(block); this.landmarks.push(block)
  }

  private addNeonRing(x: number, y: number, z: number, r: number, color: number, n: number): void {
    const mat = new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 2.2 })
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const post = new THREE.Mesh(new THREE.BoxGeometry(3.5, 16, 3.5), mat)
      post.position.set(x + Math.cos(a) * r, y, z + Math.sin(a) * r)
      this.scene.add(post); this.landmarks.push(post)
    }
  }

  private addMast(x: number, z: number, radius: number, h: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.07, radius * 0.25, h, 6),
      new THREE.MeshLambertMaterial({ color: 0x808090 })
    )
    shaft.position.set(x, gy + h / 2, z)
    this.scene.add(shaft); this.landmarks.push(shaft)

    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 0.35, 6, 4),
      new THREE.MeshLambertMaterial({ color: 0xff2200, emissive: 0xff2200, emissiveIntensity: 2.8 })
    )
    beacon.position.set(x, gy + h, z)
    this.scene.add(beacon); this.landmarks.push(beacon)
  }

  private addBillboard(x: number, z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, gy, z)

    const colors = [0xff0066, 0x00ccff, 0xffaa00, 0x00ff88]
    const color = colors[((Math.abs(x) / 500) | 0) % colors.length]

    const pole = new THREE.Mesh(new THREE.BoxGeometry(3, 85, 3),
      new THREE.MeshLambertMaterial({ color: 0x2e2e38 }))
    pole.position.y = 42.5
    g.add(pole)

    const board = new THREE.Mesh(new THREE.BoxGeometry(65, 32, 3),
      new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color), emissiveIntensity: 0.9 }))
    board.position.y = 96
    g.add(board)

    this.scene.add(g); this.landmarks.push(g)
  }

  private addCrane(x: number, z: number): void {
    const gy = NeoTokyoMapSystem.heightAt(x, z)
    const g = new THREE.Group()
    g.position.set(x, gy, z)
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a6028 })

    const mast = new THREE.Mesh(new THREE.BoxGeometry(10, 210, 10), mat)
    mast.position.y = 105; g.add(mast)

    const boom = new THREE.Mesh(new THREE.BoxGeometry(330, 6, 6), mat)
    boom.position.set(95, 210, 0); g.add(boom)

    const counter = new THREE.Mesh(new THREE.BoxGeometry(115, 6, 6), mat)
    counter.position.set(-72, 204, 0); g.add(counter)

    const cable = new THREE.Mesh(new THREE.BoxGeometry(1.5, 65, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x3a3a48 }))
    cable.position.set(185, 178, 0); g.add(cable)

    this.scene.add(g); this.landmarks.push(g)
  }

  // ===== WATER =====

  private createWater(): void {
    const bay = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 4500),
      new THREE.MeshLambertMaterial({ color: 0x071626, emissive: 0x00101e, emissiveIntensity: 0.3 })
    )
    bay.rotation.x = -Math.PI / 2
    bay.position.set(600, 0.2, 3900)
    this.scene.add(bay); this.highways.push(bay)

    // Sumida-like river
    const river = new THREE.Mesh(
      new THREE.BoxGeometry(75, 0.4, 5200),
      new THREE.MeshLambertMaterial({ color: 0x06121e, emissive: 0x000e16, emissiveIntensity: 0.22 })
    )
    river.position.set(640, 0.2, 0)
    this.scene.add(river); this.highways.push(river)

    // Secondary canal
    const canal = new THREE.Mesh(
      new THREE.BoxGeometry(45, 0.4, 3200),
      new THREE.MeshLambertMaterial({ color: 0x06121e, emissive: 0x000e16, emissiveIntensity: 0.22 })
    )
    canal.position.set(-820, 0.2, 600)
    this.scene.add(canal); this.highways.push(canal)
  }
}
