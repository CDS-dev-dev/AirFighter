import * as THREE from 'three'

/**
 * NEO TOKYO MAP — 廃墟都市 × 断層峡谷
 *
 * World: post-war Tokyo shattered by mega-earthquakes.
 * The land cracked into deep fault canyons.
 * Survivors built on the plateaus; the canyon floors glow
 * with the remnants of an underground city.
 *
 * Terrain layout:
 *   Base plateau:   200 m ASL
 *   Upper plateau:  350 m ASL  (NE quadrant)
 *   Canyon Alpha:   E-W fault,  z ≈ -500,  floor  ~10 m
 *   Canyon Beta:    N-S fault,  x ≈ -700,  floor  ~30 m
 *   Fault Gamma:    diagonal,   x-z = 900,  floor  ~60 m
 *   Crater lake:    x=1600,z=1100  r=600,   floor  ~40 m
 */

export class NeoTokyoMapSystem {
  private scene: THREE.Scene
  private isMobile: boolean

  private terrainMesh: THREE.Mesh | null = null
  private instancedMeshes: THREE.InstancedMesh[] = []
  private megastructures: THREE.Object3D[] = []
  private bridges: THREE.Object3D[] = []
  private canyonDecor: THREE.Object3D[] = []
  private holograms: THREE.Mesh[] = []
  private skyways: THREE.Mesh[] = []

  constructor(scene: THREE.Scene, isMobile = false) {
    this.scene = scene
    this.isMobile = isMobile
  }

  async initialize(): Promise<void> {
    this.createTerrain()
    this.createCanyonFloors()
    this.createBuildings()
    this.createBridges()
    this.createUpperPlateauFortress()
    this.createCanyonWreckage()
    this.createMegastructures()
    this.createHolograms()
    this.createSkyways()
  }

  // ── Terrain height function (must match mesh exactly) ─────────────────────

  private static sm(t: number): number {
    const c = Math.max(0, Math.min(1, t))
    return c * c * (3 - 2 * c)
  }

  /** Canyon cut: double-smoothstep gives steep walls and flat floor */
  private static cn(dist: number, hw: number, depth: number): number {
    const t = Math.max(0, 1 - Math.abs(dist) / hw)
    const s = NeoTokyoMapSystem.sm(t)
    return NeoTokyoMapSystem.sm(s) * depth
  }

  static heightAt(x: number, z: number): number {
    const { sm, cn } = NeoTokyoMapSystem

    let h = 200  // base plateau

    // Canyon Alpha — major E-W fault at z = -500
    h -= cn(z + 500, 380, 190)

    // Canyon Beta — N-S fault at x = -700
    h -= cn(x + 700, 240, 170)

    // Fault Gamma — diagonal (x - z = 900), NW-SE
    h -= cn((x - z - 900) / Math.SQRT2, 180, 140)

    // Upper plateau lift (NE quadrant: x > 1000, z < -800)
    const ux = sm((x - 1000) / 500)
    const uz = sm((-z - 800) / 500)
    h += Math.min(ux, uz) * 150

    // Crater lake (SE, x=1600 z=1100)
    const cr = Math.hypot(x - 1600, z - 1100)
    h -= sm(Math.max(0, 1 - cr / 580)) * 160

    // Macro terrain undulation
    h += Math.sin(x * 0.0016) * Math.cos(z * 0.0021) * 20
    h += Math.sin(x * 0.006 + 1.7) * Math.sin(z * 0.007) * 8

    return Math.max(2, h)
  }

  getTerrainHeight(x: number, z: number): number {
    return NeoTokyoMapSystem.heightAt(x, z)
  }

  // ── Terrain mesh ──────────────────────────────────────────────────────────

  private createTerrain(): void {
    const size = 12000
    const segs = this.isMobile ? 64 : 128
    const geo = new THREE.PlaneGeometry(size, size, segs, segs)
    geo.rotateX(-Math.PI / 2)

    const pos = geo.attributes.position.array as Float32Array
    const colors = new Float32Array(pos.length)

    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]
      const z = pos[i + 2]
      const h = NeoTokyoMapSystem.heightAt(x, z)
      pos[i + 1] = h

      // Color by height zone
      let r: number, g: number, b: number
      if (h > 280) {
        // Upper plateau — steel-blue military concrete
        r = 0.13; g = 0.14; b = 0.18
      } else if (h > 150) {
        // Plateau surface — dark asphalt
        r = 0.11; g = 0.11; b = 0.14
        // Road grid (400m spacing)
        const rx = Math.abs(x % 400), rz = Math.abs(z % 400)
        if (rx < 50 || rz < 50) { r = 0.09; g = 0.06; b = 0.14 }
      } else if (h > 60) {
        // Cliff face — oxidised concrete
        const t = (h - 60) / 90
        r = 0.20 - t * 0.09; g = 0.17 - t * 0.06; b = 0.13 - t * 0.01
      } else if (h > 15) {
        // Lower cliff — dark rock
        r = 0.14; g = 0.11; b = 0.09
      } else {
        // Canyon / crater floor — abyss glow
        r = 0.06; g = 0.05; b = 0.10
        // Underground neon bleed
        const glow = Math.max(0, 1 - h / 15)
        r += glow * 0.04; g += glow * 0.02; b += glow * 0.08
      }

      // Crack / rubble noise near canyon rims
      const noise = (Math.sin(x * 0.03) * Math.cos(z * 0.025)) * 0.015
      colors[i]     = Math.max(0, Math.min(1, r + noise))
      colors[i + 1] = Math.max(0, Math.min(1, g + noise * 0.5))
      colors[i + 2] = Math.max(0, Math.min(1, b))
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.05,
    })

    this.terrainMesh = new THREE.Mesh(geo, mat)
    this.terrainMesh.name = 'NeoTokyoTerrain'
    this.scene.add(this.terrainMesh)
  }

  // ── Canyon floors — neon grid + toxic pools ───────────────────────────────

  private createCanyonFloors(): void {
    // Canyon Alpha floor (z ≈ -500, floor ≈ 10m)
    this.addCanyonFloor(0, 12, -500, 700, 500, 0x001122, 0x003366)
    // Canyon Beta floor (x ≈ -700, floor ≈ 30m)
    this.addCanyonFloorNS(-700, 32, 0, 430, 600, 0x001122, 0x003366)
    // Fault Gamma floor
    this.addFaultGammaFloor()
    // Crater lake
    this.addCraterLake()
    // Neon grid lines across canyons
    this.addNeonGrid()
  }

  private addCanyonFloor(
    cx: number, cy: number, cz: number,
    halfW: number, halfD: number,
    baseColor: number, emissiveColor: number
  ): void {
    const mat = new THREE.MeshStandardMaterial({
      color: baseColor, emissive: emissiveColor,
      emissiveIntensity: 0.4, roughness: 0.9, metalness: 0.1,
    })
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(halfW * 2, halfD * 2),
      mat
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(cx, cy, cz)
    mesh.name = 'CanyonFloor_Alpha'
    this.scene.add(mesh)
    this.canyonDecor.push(mesh)

    // Toxic puddles
    for (let i = 0; i < 5; i++) {
      const px = cx + (Math.random() - 0.5) * halfW * 1.4
      const pz = cz + (Math.random() - 0.5) * halfD * 1.4
      this.addToxicPool(px, cy + 0.3, pz, 30 + Math.random() * 50)
    }
  }

  private addCanyonFloorNS(
    cx: number, cy: number, cz: number,
    halfW: number, halfD: number,
    baseColor: number, emissiveColor: number
  ): void {
    const mat = new THREE.MeshStandardMaterial({
      color: baseColor, emissive: emissiveColor,
      emissiveIntensity: 0.4, roughness: 0.9, metalness: 0.1,
    })
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(halfW * 2, halfD * 2),
      mat
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(cx, cy, cz)
    mesh.name = 'CanyonFloor_Beta'
    this.scene.add(mesh)
    this.canyonDecor.push(mesh)
    for (let i = 0; i < 4; i++) {
      const px = cx + (Math.random() - 0.5) * halfW * 1.4
      const pz = cz + (Math.random() - 0.5) * halfD * 1.4
      this.addToxicPool(px, cy + 0.3, pz, 25 + Math.random() * 40)
    }
  }

  private addFaultGammaFloor(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x001015, emissive: 0x002020, emissiveIntensity: 0.3,
      roughness: 0.95,
    })
    // Gamma fault: x - z = 900. Points along the fault:
    // z from -1400 to 200 → x = z + 900 → x from -500 to 1100
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(360, 1800), mat)
    mesh.rotation.x = -Math.PI / 2
    mesh.rotation.z = Math.PI / 4  // 45° diagonal
    mesh.position.set(300, 62, -600)
    mesh.name = 'CanyonFloor_Gamma'
    this.scene.add(mesh)
    this.canyonDecor.push(mesh)
  }

  private addCraterLake(): void {
    // Glowing toxic lake at crater centre
    const mat = new THREE.MeshStandardMaterial({
      color: 0x003300, emissive: 0x00ff44,
      emissiveIntensity: 0.6, roughness: 0.05, metalness: 0.3,
      transparent: true, opacity: 0.85,
    })
    const lake = new THREE.Mesh(new THREE.CircleGeometry(500, 32), mat)
    lake.rotation.x = -Math.PI / 2
    lake.position.set(1600, 42, 1100)
    lake.name = 'CraterLake'
    this.scene.add(lake)
    this.canyonDecor.push(lake)

    if (!this.isMobile) {
      const glow = new THREE.PointLight(0x00ff44, 3, 800)
      glow.position.set(1600, 60, 1100)
      this.scene.add(glow)
      this.canyonDecor.push(glow as unknown as THREE.Object3D)
    }
  }

  private addToxicPool(x: number, y: number, z: number, r: number): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x001a00, emissive: 0x00cc44,
      emissiveIntensity: 0.7, roughness: 0.05,
      transparent: true, opacity: 0.8,
    })
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 12), mat)
    pool.rotation.x = -Math.PI / 2
    pool.position.set(x, y, z)
    this.scene.add(pool)
    this.canyonDecor.push(pool)
  }

  private addNeonGrid(): void {
    // Glowing neon lines across Canyon Alpha floor
    const lineMat = new THREE.MeshBasicMaterial({ color: 0x0088ff })
    const gridStep = 120
    // East-West lines in Canyon Alpha (z≈-500)
    for (let z = -800; z <= -200; z += gridStep) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1200, 0.8, 2), lineMat)
      bar.position.set(0, 13, z)
      this.scene.add(bar); this.canyonDecor.push(bar)
    }
    // North-South lines
    for (let x = -500; x <= 500; x += gridStep) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 600), lineMat)
      bar.position.set(x, 13, -500)
      this.scene.add(bar); this.canyonDecor.push(bar)
    }
    // Canyon Beta grid (x≈-700)
    const lineMat2 = new THREE.MeshBasicMaterial({ color: 0xff4400 })
    for (let z = -600; z <= 400; z += gridStep) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 460), lineMat2)
      bar.position.set(-700, 33, z)
      bar.rotation.y = Math.PI / 2
      this.scene.add(bar); this.canyonDecor.push(bar)
    }
  }

  // ── Buildings — plateau only ──────────────────────────────────────────────

  private createBuildings(): void {
    const buildCount = this.isMobile ? 400 : 900
    this.addBuildingTier(Math.floor(buildCount * 0.35), 20,  60,  0x1e1e2a, 0x1a1a2f, 0.25)
    this.addBuildingTier(Math.floor(buildCount * 0.30), 60,  150, 0x252535, 0x202040, 0.40)
    this.addBuildingTier(Math.floor(buildCount * 0.22), 150, 300, 0x303048, 0x282855, 0.60)
    this.addBuildingTier(Math.floor(buildCount * 0.13), 300, 750, 0x3a3a50, 0x3030aa, 0.85)
  }

  private addBuildingTier(
    count: number, minH: number, maxH: number,
    color: number, emissive: number, emissiveIntensity: number
  ): void {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity,
      roughness: 0.35, metalness: 0.65,
    })
    const im = new THREE.InstancedMesh(geo, mat, count)
    im.castShadow = !this.isMobile
    im.receiveShadow = !this.isMobile
    const dummy = new THREE.Object3D()
    let placed = 0, attempts = 0

    while (placed < count && attempts < count * 8) {
      attempts++
      const x = (Math.random() - 0.5) * 10000
      const z = (Math.random() - 0.5) * 10000
      if (!this.isValidBuildingPos(x, z)) continue

      const groundH = NeoTokyoMapSystem.heightAt(x, z)
      const bh = minH + Math.random() * (maxH - minH)
      const bw = 18 + Math.random() * 45
      const bd = 18 + Math.random() * 45

      dummy.position.set(x, groundH + bh / 2, z)
      dummy.scale.set(bw, bh, bd)
      dummy.rotation.y = Math.random() * Math.PI * 2
      dummy.updateMatrix()
      im.setMatrixAt(placed, dummy.matrix)
      placed++
    }

    this.scene.add(im)
    this.instancedMeshes.push(im)
  }

  private isValidBuildingPos(x: number, z: number): boolean {
    const h = NeoTokyoMapSystem.heightAt(x, z)
    if (h < 120) return false  // canyon / crater

    // Keep clear of canyon centres (unstable ground)
    if (Math.abs(z + 500) < 500) return false  // Alpha canyon zone
    if (Math.abs(x + 700) < 350) return false  // Beta canyon zone
    if (Math.abs((x - z - 900) / Math.SQRT2) < 260) return false  // Gamma fault zone
    if (Math.hypot(x - 1600, z - 1100) < 750) return false  // Crater zone

    return true
  }

  // ── Suspension bridges ────────────────────────────────────────────────────

  private createBridges(): void {
    // Bridge 1 — spans Canyon Alpha (E-W), at z = -500
    this.addBridge(
      new THREE.Vector3(-950, 185, -500),
      new THREE.Vector3( 950, 185, -500),
      185, 48, 0x2a2a3a, 0xff6600
    )

    // Bridge 2 — spans Canyon Beta (N-S), at x = -700
    this.addBridge(
      new THREE.Vector3(-700, 168, -700),
      new THREE.Vector3(-700, 168,  450),
      168, 40, 0x2a2a3a, 0x00ccff
    )

    // Bridge 3 — diagonal Fault Gamma span (shorter)
    this.addBridge(
      new THREE.Vector3(-150, 155, -1050),
      new THREE.Vector3( 650, 155,  -250),
      155, 32, 0x2a2a3a, 0xff00cc
    )
  }

  private addBridge(
    from: THREE.Vector3, to: THREE.Vector3,
    deckY: number, deckWidth: number,
    deckColor: number, cableColor: number
  ): void {
    const bridge = new THREE.Group()
    const dx = to.x - from.x, dz = to.z - from.z
    const span = Math.sqrt(dx * dx + dz * dz)
    const angle = Math.atan2(dz, dx)
    const cx = (from.x + to.x) / 2
    const cz = (from.z + to.z) / 2

    // Deck
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(span, 4, deckWidth),
      new THREE.MeshStandardMaterial({
        color: deckColor, roughness: 0.5, metalness: 0.8,
      })
    )
    deck.position.set(cx, deckY, cz)
    deck.rotation.y = angle
    bridge.add(deck)

    // Guard rails
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(span, 3, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x444466, metalness: 0.9 })
      )
      rail.position.set(cx, deckY + 3.5, cz + side * (deckWidth / 2 - 1))
      rail.rotation.y = angle
      bridge.add(rail)
    }

    // Towers (at 1/4 and 3/4 span)
    const towerH = 100
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x303045, emissive: cableColor,
      emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3,
    })

    for (const frac of [0.28, 0.72]) {
      const tx = from.x + dx * frac
      const tz = from.z + dz * frac
      // Tower base from terrain/canyon floor to deck top
      const baseH = NeoTokyoMapSystem.heightAt(tx, tz)
      const totalH = deckY + towerH - baseH
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 8, totalH, 8),
        towerMat
      )
      tower.position.set(tx, baseH + totalH / 2, tz)
      bridge.add(tower)

      // Tower top glow
      const topGlow = new THREE.Mesh(
        new THREE.SphereGeometry(8, 8, 8),
        new THREE.MeshStandardMaterial({
          color: cableColor, emissive: cableColor, emissiveIntensity: 2.0,
        })
      )
      topGlow.position.set(tx, deckY + towerH, tz)
      bridge.add(topGlow)

      // Cables (catenary approximation via cylinder segments)
      const cableMat = new THREE.MeshBasicMaterial({ color: cableColor })
      const cableSegs = 8
      for (let s = 0; s < cableSegs; s++) {
        const t0 = s / cableSegs, t1 = (s + 1) / cableSegs
        const ct = (t0 + t1) / 2
        // Catenary: y = cosh(x) shape from tower top to deck ends
        const catY0 = deckY + towerH - NeoTokyoMapSystem.sm(1 - Math.abs(t0 - 0.5) * 2) * towerH * 0.9
        const catY1 = deckY + towerH - NeoTokyoMapSystem.sm(1 - Math.abs(t1 - 0.5) * 2) * towerH * 0.9
        const sx0 = from.x + dx * (frac - 0.28 + t0 * 0.56)
        const sz0 = from.z + dz * (frac - 0.28 + t0 * 0.56)
        const sx1 = from.x + dx * (frac - 0.28 + t1 * 0.56)
        const sz1 = from.z + dz * (frac - 0.28 + t1 * 0.56)
        const segLen = Math.hypot(sx1 - sx0, catY1 - catY0, sz1 - sz0)
        if (segLen < 1) continue
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, segLen, 4), cableMat)
        const midX = (sx0 + sx1) / 2, midY = (catY0 + catY1) / 2, midZ = (sz0 + sz1) / 2
        cable.position.set(midX, midY, midZ)
        const dir = new THREE.Vector3(sx1 - sx0, catY1 - catY0, sz1 - sz0).normalize()
        cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        ct  // suppress unused warning
        bridge.add(cable)
      }
    }

    this.scene.add(bridge)
    this.bridges.push(bridge)
    this.megastructures.push(bridge)  // add to collision objects
  }

  // ── Upper plateau fortress ────────────────────────────────────────────────

  private createUpperPlateauFortress(): void {
    const baseH = NeoTokyoMapSystem.heightAt(1500, -1300)  // ≈ 350m
    const fort = new THREE.Group()

    // Perimeter wall ring
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a25, roughness: 0.7, metalness: 0.4,
    })
    for (let i = 0; i < 4; i++) {
      const wallW = i % 2 === 0 ? 600 : 400
      const wallD = i % 2 === 0 ? 8 : 8
      const wallH = 25
      const wm = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, wallD), wallMat)
      const angle = i * Math.PI / 2
      const r = i % 2 === 0 ? 200 : 300
      wm.position.set(
        1500 + Math.sin(angle) * r,
        baseH + wallH / 2,
        -1300 + Math.cos(angle) * r
      )
      wm.rotation.y = angle
      fort.add(wm)
    }

    // Corner towers
    const cornerMat = new THREE.MeshStandardMaterial({
      color: 0x202030, emissive: 0x4444ff, emissiveIntensity: 0.5,
      metalness: 0.7, roughness: 0.3,
    })
    for (const [ox, oz] of [[-250, -200], [250, -200], [-250, 200], [250, 200]]) {
      const ct = new THREE.Mesh(new THREE.CylinderGeometry(18, 22, 80, 8), cornerMat)
      ct.position.set(1500 + ox, baseH + 40, -1300 + oz)
      fort.add(ct)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(22, 30, 8), cornerMat)
      cap.position.set(1500 + ox, baseH + 85, -1300 + oz)
      fort.add(cap)
    }

    // Command centre (large building)
    const cmdMat = new THREE.MeshStandardMaterial({
      color: 0x25253a, emissive: 0x2222aa, emissiveIntensity: 0.4,
      metalness: 0.6, roughness: 0.4,
    })
    const cmd = new THREE.Mesh(new THREE.BoxGeometry(180, 120, 140), cmdMat)
    cmd.position.set(1500, baseH + 60, -1300)
    fort.add(cmd)

    // Radar dish
    const radarBase = new THREE.Mesh(
      new THREE.CylinderGeometry(8, 12, 60, 8),
      new THREE.MeshStandardMaterial({ color: 0x303040, metalness: 0.8 })
    )
    radarBase.position.set(1500 + 80, baseH + 30, -1300 - 50)
    fort.add(radarBase)
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(30, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0x404050, emissive: 0x0044ff,
        emissiveIntensity: 0.4, metalness: 0.9, roughness: 0.2,
        side: THREE.DoubleSide,
      })
    )
    dish.rotation.x = -Math.PI / 2
    dish.rotation.z = Math.PI / 6
    dish.position.set(1500 + 80, baseH + 62, -1300 - 50)
    fort.add(dish)

    // Runway lights
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff6600 })
    for (let i = 0; i < 10; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(2, 4, 4), lightMat)
      l.position.set(1500 - 200 + i * 40, baseH + 1, -1300 + 220)
      fort.add(l)
    }

    this.scene.add(fort)
    this.megastructures.push(fort)
  }

  // ── Canyon wreckage ───────────────────────────────────────────────────────

  private createCanyonWreckage(): void {
    // Crashed bomber in Canyon Alpha
    const wreckMat = new THREE.MeshStandardMaterial({
      color: 0x2a2015, roughness: 0.9, metalness: 0.3,
    })
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 60, 8), wreckMat)
    hull.rotation.z = Math.PI / 2
    hull.rotation.y = 0.4
    hull.position.set(200, 14, -520)
    this.scene.add(hull); this.canyonDecor.push(hull)

    // Wing stub
    const wing = new THREE.Mesh(new THREE.BoxGeometry(60, 2, 18), wreckMat)
    wing.position.set(190, 13, -505)
    wing.rotation.y = 0.4
    this.scene.add(wing); this.canyonDecor.push(wing)

    // Rubble piles (collapsed buildings)
    const rubbleMat = new THREE.MeshStandardMaterial({
      color: 0x1e1e28, roughness: 0.95, metalness: 0.05,
    })
    const rubblePositions: [number, number, number, number, number, number][] = [
      [-300, 14, -480, 80, 40, 60],
      [ 400, 14, -530, 60, 30, 50],
      [-600, 14, -460, 100, 50, 80],
      [ 100, 14, -560, 70, 35, 55],
      [-100, 33, -700, 90, 45, 70],  // Beta canyon
      [-800, 33, -300, 65, 30, 50],
    ]
    for (const [rx, ry, rz, rw, rh, rd] of rubblePositions) {
      const rubble = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), rubbleMat)
      rubble.position.set(rx, ry + rh / 2, rz)
      rubble.rotation.y = Math.random() * Math.PI
      this.scene.add(rubble); this.canyonDecor.push(rubble)
    }

    // Tilted building fragments near canyon edges (Alpha north rim)
    const fragMat = new THREE.MeshStandardMaterial({
      color: 0x252535, emissive: 0x111122, emissiveIntensity: 0.2,
      roughness: 0.7,
    })
    const fragments: [number, number, number, number][] = [
      [-400, -90, 30, 200],
      [ 300, -70, 25, 150],
      [-100, -115, 35, 180],
      [ 500, -95, 28, 160],
    ]
    for (const [fx, fz, tilt, fh] of fragments) {
      const baseH = NeoTokyoMapSystem.heightAt(fx, fz)
      const frag = new THREE.Mesh(new THREE.BoxGeometry(35, fh, 25), fragMat)
      frag.position.set(fx, baseH + fh / 4, fz)
      frag.rotation.z = tilt * Math.PI / 180
      frag.rotation.y = Math.random() * Math.PI
      this.scene.add(frag); this.canyonDecor.push(frag)
    }
  }

  // ── Megastructures ────────────────────────────────────────────────────────

  private createMegastructures(): void {
    // Central tower (on plateau, z offset north to avoid Alpha canyon)
    this.addMegaTower(0, NeoTokyoMapSystem.heightAt(0, -900), -900, 800, 80, 120, 0x2a2a3a, 0x00ffff)

    // Ring city
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a4a, emissive: 0xff6a00, emissiveIntensity: 0.6,
      metalness: 0.8, roughness: 0.2,
    })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1400, 35, 12, 64), ringMat)
    ring.rotation.x = Math.PI / 2
    ring.position.set(0, 320, -900)
    ring.name = 'RingCity'
    this.scene.add(ring)
    this.megastructures.push(ring)

    // Mega pyramid (SW)
    this.addMegaTower(-2200, NeoTokyoMapSystem.heightAt(-2200, 2000), 2000, 550, 180, 160, 0x333333, 0xff00ff)

    // Relay towers along canyon rim
    const rimTowers: [number, number][] = [
      [-900, -120], [-500, -120], [100, -120], [600, -120],  // Alpha north rim
      [-700, -800], [-700, -400], [-700, 200],               // Beta west rim
    ]
    for (const [rx, rz] of rimTowers) {
      const rh = NeoTokyoMapSystem.heightAt(rx, rz)
      this.addRelayTower(rx, rh, rz)
    }
  }

  private addMegaTower(
    x: number, baseH: number, z: number,
    height: number, topR: number, botR: number,
    color: number, emissive: number
  ): void {
    const mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: 0.8, metalness: 0.7, roughness: 0.3,
    })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, height, 16), mat)
    body.position.set(x, baseH + height / 2, z)
    body.castShadow = !this.isMobile
    this.scene.add(body)
    this.megastructures.push(body)

    const topRing = new THREE.Mesh(
      new THREE.TorusGeometry(topR + 20, 8, 8, 32),
      new THREE.MeshStandardMaterial({ color: emissive, emissive, emissiveIntensity: 2.0 })
    )
    topRing.rotation.x = Math.PI / 2
    topRing.position.set(x, baseH + height, z)
    this.scene.add(topRing)
    this.megastructures.push(topRing)
  }

  private addRelayTower(x: number, baseH: number, z: number): void {
    const h = 60 + Math.random() * 80
    const mat = new THREE.MeshStandardMaterial({
      color: 0x282838, emissive: 0x4444ff, emissiveIntensity: 0.5,
      metalness: 0.8, roughness: 0.3,
    })
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 6, h, 6), mat)
    tower.position.set(x, baseH + h / 2, z)
    this.scene.add(tower)
    this.canyonDecor.push(tower)
  }

  // ── Holograms ─────────────────────────────────────────────────────────────

  private createHolograms(): void {
    const colors = [0xff00ff, 0x00ffff, 0xff6a00, 0x00ff44, 0xff0055, 0xffee00]
    const count = this.isMobile ? 60 : 120

    for (let i = 0; i < count; i++) {
      let x: number, z: number
      let attempts = 0
      do {
        x = (Math.random() - 0.5) * 9000
        z = (Math.random() - 0.5) * 9000
        attempts++
      } while (!this.isValidBuildingPos(x, z) && attempts < 15)

      const groundH = NeoTokyoMapSystem.heightAt(x, z)
      const offsetY = 80 + Math.random() * 200

      const w = 50 + Math.random() * 80
      const h = 80 + Math.random() * 120
      const col = colors[i % colors.length]

      const billboard = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.65 + Math.random() * 0.25,
          side: THREE.DoubleSide, depthWrite: false,
        })
      )
      billboard.position.set(x, groundH + offsetY, z)
      billboard.rotation.y = Math.random() * Math.PI * 2
      billboard.name = `Hologram_${i}`
      this.scene.add(billboard)
      this.holograms.push(billboard)
    }
  }

  // ── Skyways ───────────────────────────────────────────────────────────────

  private createSkyways(): void {
    const count = this.isMobile ? 20 : 40
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3a, emissive: 0xff6a00, emissiveIntensity: 0.4,
      metalness: 0.6, roughness: 0.4,
    })

    // Cross-canyon skyways (deliberately span canyons)
    const crossings: [number, number, number, number, number][] = [
      [-600, -500, 600, -500, 180],   // Alpha crossing 1
      [-400, -450, 400, -550, 175],   // Alpha crossing 2
      [-700, -800, -700, 400, 165],   // Beta crossing
      [-200, -1200, 600, -400, 160],  // Gamma crossing
    ]
    for (const [x1, z1, x2, z2, y] of crossings) {
      this.addSkyway(x1, y, z1, x2, y, z2, mat)
    }

    // Random plateau skyways
    let placed = 0, attempts = 0
    while (placed < count - crossings.length && attempts < count * 6) {
      attempts++
      const x1 = (Math.random() - 0.5) * 8000
      const z1 = (Math.random() - 0.5) * 8000
      if (!this.isValidBuildingPos(x1, z1)) continue
      const x2 = x1 + (Math.random() - 0.5) * 800
      const z2 = z1 + (Math.random() - 0.5) * 800
      const y = NeoTokyoMapSystem.heightAt(x1, z1) + 100 + Math.random() * 150
      this.addSkyway(x1, y, z1, x2, y, z2, mat)
      placed++
    }
  }

  private addSkyway(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    mat: THREE.Material
  ): void {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (len < 50) return
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, mz = (z1 + z2) / 2
    const angle = Math.atan2(dz, dx)

    const skyway = new THREE.Mesh(new THREE.BoxGeometry(len, 3, 28), mat)
    skyway.position.set(mx, my, mz)
    skyway.rotation.y = angle
    skyway.name = 'Skyway'
    this.scene.add(skyway)
    this.skyways.push(skyway)
  }

  // ── Interface ─────────────────────────────────────────────────────────────

  getCollisionObjects(): THREE.Object3D[] {
    return [...this.megastructures, ...this.bridges]
  }

  getSafeSpawnPosition(): { x: number; y: number; z: number } {
    // Spawn above the main plateau, clear of all canyons
    return { x: 0, y: 600, z: -900 }
  }

  cleanup(): void {
    if (this.terrainMesh) { this.scene.remove(this.terrainMesh); this.terrainMesh = null }

    for (const im of this.instancedMeshes) this.scene.remove(im)
    this.instancedMeshes.length = 0

    for (const m of this.megastructures) this.scene.remove(m)
    this.megastructures.length = 0

    for (const b of this.bridges) this.scene.remove(b)
    this.bridges.length = 0

    for (const d of this.canyonDecor) this.scene.remove(d)
    this.canyonDecor.length = 0

    for (const h of this.holograms) this.scene.remove(h)
    this.holograms.length = 0

    for (const s of this.skyways) this.scene.remove(s)
    this.skyways.length = 0
  }
}
