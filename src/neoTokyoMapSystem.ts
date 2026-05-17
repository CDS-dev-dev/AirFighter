import * as THREE from 'three'

/**
 * NEO TOKYO MAP — 廃墟都市 × 断層峡谷  (v2)
 *
 * Scale matches Original Map: terrain 0–1200 m ASL.
 *
 * Terrain layout:
 *   Base plateau   :  400 m
 *   NE mega-district: +600 m → peak 1000 m
 *   NW fortress     : +500 m → peak  900 m
 *   SE industrial   : +400 m → peak  800 m
 *   Canyon Alpha (E-W, z≈-500): cuts 420 m → floor   0 m
 *   Canyon Beta  (N-S, x≈-700): cuts 370 m → floor  30 m
 *   Fault  Gamma (diagonal)   : cuts 300 m → floor 100 m
 *   Crater lake (x=1600,z=1100): cuts 320 m → floor  80 m
 *
 * Buildings: megablock scale, 80–300 m wide.
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
    this.createMegaBlocks()
    this.createBridges()
    this.createUpperDistrictFortress()
    this.createCanyonWreckage()
    this.createHolograms()
    this.createSkyways()
  }

  // ── Terrain height — MUST match vertex positions exactly ─────────────────

  private static sm(t: number): number {
    const c = Math.max(0, Math.min(1, t))
    return c * c * (3 - 2 * c)
  }

  /** Double-smoothstep canyon: steep walls, flat floor */
  private static cn(dist: number, hw: number, depth: number): number {
    const t = Math.max(0, 1 - Math.abs(dist) / hw)
    const s = NeoTokyoMapSystem.sm(t)
    return NeoTokyoMapSystem.sm(s) * depth
  }

  static heightAt(x: number, z: number): number {
    const { sm, cn } = NeoTokyoMapSystem

    let h = 400  // base plateau — same scale as original map's 300m base

    // ── Mountain districts (artificial mega-plateaus) ─────────────────────
    // NE district — upper city / government zone
    h += Math.exp(-((x - 1600) ** 2 / 650000 + (z + 1900) ** 2 / 420000)) * 620
    // NW district — fortress / military
    h += Math.exp(-((x + 2100) ** 2 / 550000 + (z + 700) ** 2 / 480000)) * 520
    // SE district — industrial / factory
    h += Math.exp(-((x + 400) ** 2 / 420000 + (z - 1700) ** 2 / 380000)) * 430

    // ── Fault canyons ──────────────────────────────────────────────────────
    // Canyon Alpha — E-W, dominant fault (floor ~0m)
    h -= cn(z + 500, 400, 420)
    // Canyon Beta  — N-S (floor ~30m)
    h -= cn(x + 700, 270, 380)
    // Fault Gamma  — diagonal x-z=900 (floor ~100m)
    h -= cn((x - z - 900) / Math.SQRT2, 195, 310)

    // ── Crater ────────────────────────────────────────────────────────────
    const cr = Math.hypot(x - 1600, z - 1100)
    h -= sm(Math.max(0, 1 - cr / 600)) * 330

    // ── Large-amplitude undulation (same magnitude as original map) ────────
    h += Math.sin(x * 0.002) * Math.cos(z * 0.0025) * 200
    h += Math.sin(x * 0.005) * Math.sin(z * 0.0042) * 130
    h += Math.sin(x * 0.009 + 1.3) * Math.cos(z * 0.0075) * 80
    h += Math.sin((x + z) * 0.0018) * 90

    return Math.max(0, h)
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
    const cols = new Float32Array(pos.length)

    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], z = pos[i + 2]
      const h = NeoTokyoMapSystem.heightAt(x, z)
      pos[i + 1] = h

      let r: number, g: number, b: number

      if (h > 700) {
        // High district peaks — blue-grey steel
        r = 0.16; g = 0.17; b = 0.22
      } else if (h > 450) {
        // Mid plateau — dark concrete
        r = 0.12; g = 0.12; b = 0.15
        // Road grid
        const rx = Math.abs(x % 400), rz = Math.abs(z % 400)
        if (rx < 55 || rz < 55) { r = 0.08; g = 0.06; b = 0.14 }
      } else if (h > 150) {
        // Upper cliff — oxidised concrete
        const t = (h - 150) / 300
        r = 0.22 - t * 0.10; g = 0.18 - t * 0.06; b = 0.14 - t * 0.01
      } else if (h > 20) {
        // Lower cliff — raw rock
        r = 0.16; g = 0.12; b = 0.09
      } else {
        // Canyon / crater floor — abyss with neon bleed
        r = 0.06; g = 0.05; b = 0.10
        const glow = Math.max(0, 1 - h / 20)
        r += glow * 0.05; g += glow * 0.02; b += glow * 0.10
      }

      const noise = Math.sin(x * 0.032) * Math.cos(z * 0.027) * 0.018
      cols[i]     = Math.max(0, Math.min(1, r + noise))
      cols[i + 1] = Math.max(0, Math.min(1, g + noise * 0.5))
      cols[i + 2] = Math.max(0, Math.min(1, b))
    }

    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3))
    geo.computeVertexNormals()

    this.terrainMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0.06,
    }))
    this.terrainMesh.name = 'NeoTokyoTerrain'
    this.scene.add(this.terrainMesh)
  }

  // ── Canyon floors ─────────────────────────────────────────────────────────

  private createCanyonFloors(): void {
    // Alpha floor (z≈-500, y≈0)
    this.floorPlane(0, 2, -500, 800, 600, 0x001122, 0x003366, 0.45)
    this.addToxicPools(0, 3, -500, 700, 480, 6)

    // Beta floor (x≈-700, y≈30)
    this.floorPlane(-700, 32, 0, 500, 750, 0x001122, 0x003366, 0.40)
    this.addToxicPools(-700, 33, 0, 440, 600, 4)

    // Gamma floor (diagonal)
    const gf = new THREE.Mesh(
      new THREE.PlaneGeometry(390, 2200),
      new THREE.MeshStandardMaterial({
        color: 0x000f1a, emissive: 0x002030, emissiveIntensity: 0.35, roughness: 0.95,
      })
    )
    gf.rotation.x = -Math.PI / 2; gf.rotation.z = Math.PI / 4
    gf.position.set(300, 102, -600)
    this.scene.add(gf); this.canyonDecor.push(gf)

    // Crater lake
    const lakeMat = new THREE.MeshStandardMaterial({
      color: 0x002200, emissive: 0x00ff44, emissiveIntensity: 0.7,
      roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.88,
    })
    const lake = new THREE.Mesh(new THREE.CircleGeometry(520, 40), lakeMat)
    lake.rotation.x = -Math.PI / 2
    lake.position.set(1600, 82, 1100)
    this.scene.add(lake); this.canyonDecor.push(lake)
    if (!this.isMobile) {
      const gl = new THREE.PointLight(0x00ff44, 4, 1000)
      gl.position.set(1600, 100, 1100)
      this.scene.add(gl); this.canyonDecor.push(gl as unknown as THREE.Object3D)
    }

    // Neon grid — Alpha canyon
    const bm = new THREE.MeshBasicMaterial({ color: 0x0077ff })
    const bm2 = new THREE.MeshBasicMaterial({ color: 0xff4400 })
    for (let z = -820; z <= -180; z += 140) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1500, 1, 2), bm)
      b.position.set(0, 4, z); this.scene.add(b); this.canyonDecor.push(b)
    }
    for (let xg = -650; xg <= 650; xg += 140) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 650), bm)
      b.position.set(xg, 4, -500); this.scene.add(b); this.canyonDecor.push(b)
    }
    // Beta canyon grid
    for (let z = -700; z <= 450; z += 140) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(480, 1, 2), bm2)
      b.position.set(-700, 34, z); this.scene.add(b); this.canyonDecor.push(b)
    }
  }

  private floorPlane(
    cx: number, cy: number, cz: number,
    w: number, d: number,
    color: number, emissive: number, ei: number
  ): void {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.9 })
    )
    m.rotation.x = -Math.PI / 2
    m.position.set(cx, cy, cz)
    this.scene.add(m); this.canyonDecor.push(m)
  }

  private addToxicPools(
    cx: number, cy: number, cz: number,
    hw: number, hd: number, count: number
  ): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x001a00, emissive: 0x00cc44, emissiveIntensity: 0.8,
      roughness: 0.04, transparent: true, opacity: 0.82,
    })
    for (let i = 0; i < count; i++) {
      const px = cx + (Math.random() - 0.5) * hw * 1.3
      const pz = cz + (Math.random() - 0.5) * hd * 1.3
      const r = 35 + Math.random() * 80
      const p = new THREE.Mesh(new THREE.CircleGeometry(r, 12), mat.clone())
      p.rotation.x = -Math.PI / 2
      p.position.set(px, cy + 0.5, pz)
      this.scene.add(p); this.canyonDecor.push(p)
    }
  }

  // ── Megablock buildings (instanced, 80–300 m wide) ────────────────────────

  private createBuildings(): void {
    const cnt = this.isMobile ? 200 : 480
    // Low megablocks
    this.addBuildingTier(Math.floor(cnt * 0.30), 40,  130, 80,  180, 0x1e1e2a, 0x1a1a3a, 0.25)
    // Mid megablocks
    this.addBuildingTier(Math.floor(cnt * 0.28), 130, 300, 100, 220, 0x252538, 0x202050, 0.40)
    // High megablocks
    this.addBuildingTier(Math.floor(cnt * 0.24), 300, 550, 120, 260, 0x303048, 0x282870, 0.60)
    // Supertall megablocks
    this.addBuildingTier(Math.floor(cnt * 0.18), 550, 900, 140, 300, 0x3a3a58, 0x3030bb, 0.85)
  }

  private addBuildingTier(
    count: number,
    minH: number, maxH: number,
    minW: number, maxW: number,
    color: number, emissive: number, emissiveIntensity: number
  ): void {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity, roughness: 0.35, metalness: 0.65,
    })
    const im = new THREE.InstancedMesh(geo, mat, count)
    im.castShadow = false
    im.receiveShadow = false
    const dummy = new THREE.Object3D()
    let placed = 0, attempts = 0

    while (placed < count && attempts < count * 10) {
      attempts++
      const x = (Math.random() - 0.5) * 10000
      const z = (Math.random() - 0.5) * 10000
      if (!this.isValidBuildingPos(x, z)) continue
      const gh = NeoTokyoMapSystem.heightAt(x, z)
      const bh = minH + Math.random() * (maxH - minH)
      const bw = minW + Math.random() * (maxW - minW)
      const bd = minW + Math.random() * (maxW - minW)
      dummy.position.set(x, gh + bh / 2, z)
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
    if (NeoTokyoMapSystem.heightAt(x, z) < 300) return false  // canyon / slope
    if (Math.abs(z + 500) < 550) return false  // Alpha canyon buffer
    if (Math.abs(x + 700) < 400) return false  // Beta canyon buffer
    if (Math.abs((x - z - 900) / Math.SQRT2) < 300) return false  // Gamma buffer
    if (Math.hypot(x - 1600, z - 1100) < 800) return false  // Crater buffer
    return true
  }

  // ── Hand-placed megablock landmarks ───────────────────────────────────────

  private createMegaBlocks(): void {
    // Central Arcology — 500m wide pyramid-stack
    this.addMegaBlockStep(0, -900, [
      { w: 500, d: 400, h: 200 },
      { w: 360, d: 280, h: 200 },
      { w: 220, d: 160, h: 250 },
      { w: 100, d: 80,  h: 300 },
    ], 0x20203a, 0x4444ff, 0.6)

    // NW Citadel — massive slab
    this.addMegaBlockStep(-2000, -700, [
      { w: 600, d: 500, h: 250 },
      { w: 400, d: 320, h: 300 },
      { w: 180, d: 140, h: 400 },
    ], 0x1a1a28, 0xff4400, 0.5)

    // SE Hive — honeycomb cluster
    this.addMegaBlockStep(700, 1500, [
      { w: 450, d: 380, h: 180 },
      { w: 300, d: 260, h: 220 },
      { w: 150, d: 130, h: 280 },
    ], 0x282832, 0x00ffcc, 0.55)

    // Canyon rim watchtowers (Alpha north rim)
    for (const [rx, rz] of [[-800, -100], [-300, -100], [200, -100], [700, -100]]) {
      const bh = NeoTokyoMapSystem.heightAt(rx, rz)
      this.addTower(rx, bh, rz, 22, 180, 0x252535, 0x0088ff)
    }

    // Canyon rim watchtowers (Beta west rim)
    for (const [rx, rz] of [[-940, -600], [-940, -100], [-940, 350]]) {
      const bh = NeoTokyoMapSystem.heightAt(rx, rz)
      this.addTower(rx, bh, rz, 18, 150, 0x252535, 0xff4400)
    }
  }

  private addMegaBlockStep(
    cx: number, cz: number,
    steps: { w: number; d: number; h: number }[],
    color: number, emissive: number, ei: number
  ): void {
    const mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: ei, roughness: 0.4, metalness: 0.6,
    })
    const base = NeoTokyoMapSystem.heightAt(cx, cz)
    let y = base
    for (const step of steps) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(step.w, step.h, step.d), mat)
      m.position.set(cx, y + step.h / 2, cz)
      this.scene.add(m)
      this.megastructures.push(m)
      y += step.h
    }
    // Beacon on top
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(12, 8, 8),
      new THREE.MeshStandardMaterial({ color: emissive, emissive, emissiveIntensity: 3.0 })
    )
    beacon.position.set(cx, y + 12, cz)
    this.scene.add(beacon); this.megastructures.push(beacon)
  }

  private addTower(
    x: number, baseH: number, z: number,
    r: number, h: number, color: number, emissive: number
  ): void {
    const mat = new THREE.MeshStandardMaterial({
      color, emissive, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.3,
    })
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, h, 8), mat)
    t.position.set(x, baseH + h / 2, z)
    this.scene.add(t); this.megastructures.push(t)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 8), new THREE.MeshStandardMaterial({
      color: emissive, emissive, emissiveIntensity: 2.5,
    }))
    tip.position.set(x, baseH + h + r * 0.8, z)
    this.scene.add(tip); this.megastructures.push(tip)
  }

  // ── Suspension bridges ────────────────────────────────────────────────────

  private createBridges(): void {
    // Bridge 1 — spans Alpha (z=-500), wider/taller to match new scale
    this.addBridge(-950, 390, -500,  950, 390, -500, 65, 0x2a2a3a, 0xff6600)
    // Bridge 2 — spans Beta (x=-700)
    this.addBridge(-700, 370, -750, -700, 370,  500, 55, 0x2a2a3a, 0x00ccff)
    // Bridge 3 — Gamma fault diagonal
    this.addBridge(-200, 370, -1150,  700, 370, -250, 45, 0x2a2a3a, 0xff00cc)
  }

  private addBridge(
    x1: number, y1: number, z1: number,
    x2: number, _y2: number, z2: number,
    deckW: number, deckColor: number, cableColor: number
  ): void {
    const bridge = new THREE.Group()
    const dx = x2 - x1, dz = z2 - z1
    const span = Math.hypot(dx, dz)
    const angle = Math.atan2(dz, dx)
    const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2
    const deckY = y1

    // Deck
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(span, 6, deckW),
      new THREE.MeshStandardMaterial({ color: deckColor, roughness: 0.5, metalness: 0.8 })
    )
    deck.position.set(mx, deckY, mz); deck.rotation.y = angle
    bridge.add(deck)

    // Guard rails
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(span, 5, 2),
        new THREE.MeshStandardMaterial({ color: 0x444466, metalness: 0.9 })
      )
      rail.position.set(mx, deckY + 5.5, mz + side * (deckW / 2 - 2))
      rail.rotation.y = angle
      bridge.add(rail)
    }

    // Towers
    const towerH = 160
    const cableMat = new THREE.MeshBasicMaterial({ color: cableColor })
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x303045, emissive: cableColor, emissiveIntensity: 0.7, metalness: 0.8, roughness: 0.3,
    })

    for (const frac of [0.25, 0.75]) {
      const tx = x1 + dx * frac, tz = z1 + dz * frac
      const floorH = NeoTokyoMapSystem.heightAt(tx, tz)
      const totalH = deckY + towerH - floorH
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(7, 11, totalH, 8), towerMat)
      tower.position.set(tx, floorH + totalH / 2, tz)
      bridge.add(tower)

      const topGlow = new THREE.Mesh(
        new THREE.SphereGeometry(11, 8, 8),
        new THREE.MeshStandardMaterial({ color: cableColor, emissive: cableColor, emissiveIntensity: 2.5 })
      )
      topGlow.position.set(tx, deckY + towerH, tz)
      bridge.add(topGlow)

      // Cable segments (catenary)
      const segs = 10
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs
        const ft = (t0 + t1) / 2
        const sag = NeoTokyoMapSystem.sm(1 - Math.abs(ft - 0.5) * 2)
        const y0 = deckY + towerH - sag * towerH * 0.88
        const y1c = deckY + towerH - NeoTokyoMapSystem.sm(1 - Math.abs(t1 - 0.5) * 2) * towerH * 0.88
        const sx0 = x1 + dx * (frac - 0.25 + t0 * 0.5)
        const sz0 = z1 + dz * (frac - 0.25 + t0 * 0.5)
        const sx1c = x1 + dx * (frac - 0.25 + t1 * 0.5)
        const sz1c = z1 + dz * (frac - 0.25 + t1 * 0.5)
        const segLen = Math.hypot(sx1c - sx0, y1c - y0, sz1c - sz0)
        if (segLen < 1) continue
        const cable = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, segLen, 4), cableMat)
        cable.position.set((sx0 + sx1c) / 2, (y0 + y1c) / 2, (sz0 + sz1c) / 2)
        const dir = new THREE.Vector3(sx1c - sx0, y1c - y0, sz1c - sz0).normalize()
        cable.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
        bridge.add(cable)
      }
    }

    this.scene.add(bridge)
    this.bridges.push(bridge)
    this.megastructures.push(bridge)
  }

  // ── NE district fortress ──────────────────────────────────────────────────

  private createUpperDistrictFortress(): void {
    const cx = 1600, cz = -1900
    const baseH = NeoTokyoMapSystem.heightAt(cx, cz)  // ~1020m

    // Perimeter walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x181825, roughness: 0.75, metalness: 0.4 })
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2
      const r = i % 2 === 0 ? 350 : 280
      const wl = i % 2 === 0 ? 700 : 580
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wl, 40, 12), wallMat)
      wall.position.set(cx + Math.sin(a) * r, baseH + 20, cz + Math.cos(a) * r)
      wall.rotation.y = a
      this.scene.add(wall); this.megastructures.push(wall)
    }

    // Corner towers
    const ctMat = new THREE.MeshStandardMaterial({
      color: 0x202030, emissive: 0x4444ff, emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.3,
    })
    for (const [ox, oz] of [[-320, -260], [320, -260], [-320, 260], [320, 260]]) {
      const ct = new THREE.Mesh(new THREE.CylinderGeometry(22, 28, 110, 8), ctMat)
      ct.position.set(cx + ox, baseH + 55, cz + oz)
      this.scene.add(ct); this.megastructures.push(ct)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(28, 45, 8), ctMat)
      cap.position.set(cx + ox, baseH + 115, cz + oz)
      this.scene.add(cap); this.megastructures.push(cap)
    }

    // Command block
    const cmd = new THREE.Mesh(
      new THREE.BoxGeometry(220, 160, 180),
      new THREE.MeshStandardMaterial({ color: 0x222236, emissive: 0x2222aa, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.4 })
    )
    cmd.position.set(cx, baseH + 80, cz)
    this.scene.add(cmd); this.megastructures.push(cmd)

    // Radar
    const rdBase = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 14, 80, 8),
      new THREE.MeshStandardMaterial({ color: 0x303040, metalness: 0.85 })
    )
    rdBase.position.set(cx + 100, baseH + 40, cz - 60)
    this.scene.add(rdBase); this.megastructures.push(rdBase)

    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(40, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0x404055, emissive: 0x0044ff, emissiveIntensity: 0.5,
        metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide,
      })
    )
    dish.rotation.x = -Math.PI / 2; dish.rotation.z = Math.PI / 5
    dish.position.set(cx + 100, baseH + 82, cz - 60)
    this.scene.add(dish); this.megastructures.push(dish)
  }

  // ── Canyon wreckage ───────────────────────────────────────────────────────

  private createCanyonWreckage(): void {
    const wreckMat = new THREE.MeshStandardMaterial({ color: 0x2a2015, roughness: 0.9, metalness: 0.3 })

    // Crashed bomber hull — Alpha canyon
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 80, 8), wreckMat)
    hull.rotation.z = Math.PI / 2; hull.rotation.y = 0.35
    hull.position.set(180, 5, -530)
    this.scene.add(hull); this.canyonDecor.push(hull)

    const wing = new THREE.Mesh(new THREE.BoxGeometry(75, 3, 22), wreckMat)
    wing.position.set(170, 4, -515); wing.rotation.y = 0.35
    this.scene.add(wing); this.canyonDecor.push(wing)

    // Rubble
    const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x1e1e28, roughness: 0.95, metalness: 0.05 })
    const rubbles: [number, number, number, number, number, number][] = [
      [-350, 3, -490, 120, 55, 90],
      [ 450, 3, -540,  90, 40, 70],
      [-650, 3, -470, 140, 65, 110],
      [ 120, 3, -560, 100, 45, 80],
      [-150, 34, -710, 130, 60, 100],
      [-820, 34, -280, 95,  42, 75],
    ]
    for (const [rx, ry, rz, rw, rh, rd] of rubbles) {
      const rb = new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), rubbleMat)
      rb.position.set(rx, ry + rh / 2, rz); rb.rotation.y = Math.random() * Math.PI
      this.scene.add(rb); this.canyonDecor.push(rb)
    }

    // Tilted fragments near Alpha north rim
    const fragMat = new THREE.MeshStandardMaterial({ color: 0x252535, emissive: 0x111122, emissiveIntensity: 0.2, roughness: 0.7 })
    const frags: [number, number, number, number][] = [
      [-450, -85, 32, 250], [320, -75, 28, 190], [-120, -100, 36, 220], [540, -90, 26, 175],
    ]
    for (const [fx, fz, tilt, fh] of frags) {
      const bh = NeoTokyoMapSystem.heightAt(fx, fz)
      const frag = new THREE.Mesh(new THREE.BoxGeometry(45, fh, 35), fragMat)
      frag.position.set(fx, bh + fh / 4, fz)
      frag.rotation.z = tilt * Math.PI / 180; frag.rotation.y = Math.random() * Math.PI
      this.scene.add(frag); this.canyonDecor.push(frag)
    }
  }

  // ── Holograms ─────────────────────────────────────────────────────────────

  private createHolograms(): void {
    const colors = [0xff00ff, 0x00ffff, 0xff6a00, 0x00ff44, 0xff0055, 0xffee00]
    const count = this.isMobile ? 50 : 100

    for (let i = 0; i < count; i++) {
      let x = 0, z = 0, attempts = 0
      do {
        x = (Math.random() - 0.5) * 9000
        z = (Math.random() - 0.5) * 9000
        attempts++
      } while (!this.isValidBuildingPos(x, z) && attempts < 15)

      const gh = NeoTokyoMapSystem.heightAt(x, z)
      const col = colors[i % colors.length]
      const w = 70 + Math.random() * 120, h = 110 + Math.random() * 180
      const bill = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: col, transparent: true, opacity: 0.55 + Math.random() * 0.35,
          side: THREE.DoubleSide, depthWrite: false,
        })
      )
      bill.position.set(x, gh + 120 + Math.random() * 250, z)
      bill.rotation.y = Math.random() * Math.PI * 2
      this.scene.add(bill); this.holograms.push(bill)
    }
  }

  // ── Skyways ───────────────────────────────────────────────────────────────

  private createSkyways(): void {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x2a2a3a, emissive: 0xff6a00, emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.4,
    })
    // Cross-canyon spans
    const fixed: [number, number, number, number, number][] = [
      [-700, -500,  700, -500, 385],   // Alpha cross 1
      [-500, -450,  500, -550, 390],   // Alpha cross 2
      [-700, -800, -700,  450, 370],   // Beta cross
      [-200, -1100,  700, -300, 370],  // Gamma cross
    ]
    for (const [x1, z1, x2, z2, y] of fixed) {
      this.addSkyway(x1, y, z1, x2, y, z2, mat)
    }
    // Random plateau skyways
    const cnt = this.isMobile ? 12 : 30
    let placed = 0, attempts = 0
    while (placed < cnt && attempts < cnt * 8) {
      attempts++
      const x1 = (Math.random() - 0.5) * 8000
      const z1 = (Math.random() - 0.5) * 8000
      if (!this.isValidBuildingPos(x1, z1)) continue
      const x2 = x1 + (Math.random() - 0.5) * 900
      const z2 = z1 + (Math.random() - 0.5) * 900
      const y = NeoTokyoMapSystem.heightAt(x1, z1) + 150 + Math.random() * 250
      this.addSkyway(x1, y, z1, x2, y, z2, mat)
      placed++
    }
  }

  private addSkyway(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    mat: THREE.Material
  ): void {
    const dx = x2 - x1, dz = z2 - z1
    const len = Math.hypot(dx, dz)
    if (len < 60) return
    const s = new THREE.Mesh(new THREE.BoxGeometry(len, 5, 40), mat)
    s.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2)
    s.rotation.y = Math.atan2(dz, dx)
    this.scene.add(s); this.skyways.push(s)
  }

  // ── Interface ─────────────────────────────────────────────────────────────

  getCollisionObjects(): THREE.Object3D[] {
    return [...this.megastructures, ...this.bridges]
  }

  getSafeSpawnPosition(): { x: number; y: number; z: number } {
    return { x: 0, y: 750, z: -900 }
  }

  cleanup(): void {
    if (this.terrainMesh) { this.scene.remove(this.terrainMesh); this.terrainMesh = null }
    for (const m of this.instancedMeshes) this.scene.remove(m)
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
