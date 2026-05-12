import * as THREE from 'three'

/**
 * NEO TOKYO MAP - サイバーパンク都市
 *
 * コンセプト：
 * - ブレードランナー風の立体都市
 * - 軽量化（InstancedMesh使用）
 * - ネオン発光エフェクト
 * - 超高層ビル＋メガストラクチャー
 */

export class NeoTokyoMapSystem {
  private scene: THREE.Scene
  private terrainMesh: THREE.Mesh | null = null

  // InstancedMesh（軽量化の鍵）
  private lowBuildings: THREE.InstancedMesh | null = null     // 20-60m
  private midBuildings: THREE.InstancedMesh | null = null     // 60-150m
  private highBuildings: THREE.InstancedMesh | null = null    // 150-300m
  private skyscrapers: THREE.InstancedMesh | null = null      // 300-800m

  private megastructures: THREE.Object3D[] = []
  private skyways: THREE.Mesh[] = []
  private holograms: THREE.Mesh[] = []

  constructor(scene: THREE.Scene) {
    this.scene = scene
  }

  async initialize(): Promise<void> {
    console.log('🌃 NEO TOKYO MAP初期化開始（サイバーパンク）')

    // 1. 暗い地面（夜の都市）
    this.createDarkGround()

    // 2. メガストリート（幅広の発光道路）
    this.createMegaStreets()

    // 3. 建物群（InstancedMesh）
    this.createInstancedBuildings()

    // 4. メガストラクチャー（巨大建造物）
    this.createMegastructures()

    // 5. 空中道路（スカイウェイ）
    this.createSkyways()

    // 6. ホログラム広告
    this.createHolograms()

    console.log('✅ NEO TOKYO MAP初期化完了')
  }

  /**
   * 暗い地面を作成（夜の都市）
   */
  private createDarkGround(): void {
    const size = 12000
    const segments = 64

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
    geometry.rotateX(-Math.PI / 2)

    const positions = geometry.attributes.position.array as Float32Array

    // 地形高低（実際の東京の地形を反映）
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]

      let height = 20  // 基準高度

      // 山の手台地（西側）
      const yamanoteHeight = Math.max(0, -x * 0.012)
      height += yamanoteHeight

      // 多摩丘陵（西部）
      if (x < -3000) {
        const tamaHills = Math.max(0, (-x - 3000) * 0.025) *
                         Math.exp(-Math.abs(z) / 2500)
        height += tamaHills
      }

      // 下町低地（東側）
      if (x > 1000) {
        const shitamachiLowland = -(x - 1000) * 0.015
        height += shitamachiLowland
      }

      // 河川低地
      const distToSumida = Math.abs(x - 2500)
      if (distToSumida < 400) {
        const riverDepth = (1 - distToSumida / 400) * 12
        height -= riverDepth
      }

      const distToArakawa = Math.abs(x - 3800)
      if (distToArakawa < 500) {
        const riverDepth = (1 - distToArakawa / 500) * 15
        height -= riverDepth
      }

      // 武蔵野台地の起伏
      height += Math.sin(x * 0.0008) * Math.cos(z * 0.0006) * 8

      positions[i + 1] = Math.max(0, height)
    }

    // 暗い色彩（夜の都市）
    const colors = new Float32Array(positions.length)
    for (let i = 0; i < colors.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]

      // 基本色: ダークグレー（アスファルト）
      let r = 0.12, g = 0.12, b = 0.15

      // メガストリート（400m間隔、幅60m）
      const majorRoadSize = 400
      const xMajor = Math.abs(x % majorRoadSize)
      const zMajor = Math.abs(z % majorRoadSize)
      if (xMajor < 60 || zMajor < 60) {
        // 発光する道路
        r = 0.15; g = 0.10; b = 0.20  // 紫がかった道路
      }

      // ノイズ
      const noise = (Math.sin(x * 0.01) * Math.cos(z * 0.01)) * 0.02
      r += noise
      g += noise
      b += noise

      colors[i] = Math.max(0, Math.min(1, r))
      colors[i + 1] = Math.max(0, Math.min(1, g))
      colors[i + 2] = Math.max(0, Math.min(1, b))
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.05
    })

    this.terrainMesh = new THREE.Mesh(geometry, material)
    this.terrainMesh.receiveShadow = true
    this.terrainMesh.name = 'NeoTokyoGround'
    this.scene.add(this.terrainMesh)

    console.log('✅ ダークグラウンド作成完了')
  }

  /**
   * メガストリート（発光道路）
   */
  private createMegaStreets(): void {
    // 環状道路（3本）
    const rings = [
      { radius: 2000, width: 80, color: 0xff6a00 },
      { radius: 3500, width: 90, color: 0x00ffff },
      { radius: 5000, width: 100, color: 0xff00ff }
    ]

    for (const ring of rings) {
      const curve = new THREE.EllipseCurve(
        0, 0,
        ring.radius, ring.radius,
        0, 2 * Math.PI,
        false,
        0
      )

      const points = curve.getPoints(100)
      const geometry = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p.x, 0.3, p.y))),
        100,
        ring.width / 2,
        8,
        true
      )

      const material = new THREE.MeshStandardMaterial({
        color: ring.color,
        emissive: ring.color,
        emissiveIntensity: 0.5,
        roughness: 0.3
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `MegaRing_${ring.radius}`
      this.scene.add(mesh)
    }

    console.log('✅ メガストリート作成完了')
  }

  /**
   * InstancedMeshによる建物群（軽量化）
   */
  private createInstancedBuildings(): void {
    // 低層ビル（20-60m）: 500棟
    this.createBuildingLayer(
      500,
      20, 60,
      0x2a2a3a,
      0x1a1a3a,
      0.3,
      'Low'
    )

    // 中層ビル（60-150m）: 600棟
    this.createBuildingLayer(
      600,
      60, 150,
      0x3a3a4a,
      0x2a2a5a,
      0.4,
      'Mid'
    )

    // 高層ビル（150-300m）: 300棟
    this.createBuildingLayer(
      300,
      150, 300,
      0x4a4a5a,
      0x3a3a6a,
      0.6,
      'High'
    )

    // 超高層ビル（300-800m）: 100棟
    this.createBuildingLayer(
      100,
      300, 800,
      0x5a5a6a,
      0x4a4aff,
      0.8,
      'Skyscraper'
    )

    console.log('✅ InstancedMesh建物作成完了: 1500棟')
  }

  private createBuildingLayer(
    count: number,
    minHeight: number,
    maxHeight: number,
    baseColor: number,
    emissiveColor: number,
    emissiveIntensity: number,
    layerName: string
  ): void {
    // 基本形状（Box）
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: emissiveColor,
      emissiveIntensity,
      roughness: 0.4,
      metalness: 0.6
    })

    const instancedMesh = new THREE.InstancedMesh(geometry, material, count)
    instancedMesh.castShadow = true
    instancedMesh.receiveShadow = true
    instancedMesh.name = `NeoBuildings_${layerName}`

    const dummy = new THREE.Object3D()

    for (let i = 0; i < count; i++) {
      // ランダム配置（メガストリートを避ける）
      let x, z
      let attempts = 0
      do {
        x = (Math.random() - 0.5) * 10000
        z = (Math.random() - 0.5) * 10000
        attempts++
      } while (this.isOnMegaStreet(x, z) && attempts < 10)

      const y = this.getTerrainHeight(x, z)
      const height = minHeight + Math.random() * (maxHeight - minHeight)
      const width = 20 + Math.random() * 40
      const depth = 20 + Math.random() * 40

      dummy.position.set(x, y + height / 2, z)
      dummy.scale.set(width, height, depth)
      dummy.rotation.y = Math.random() * Math.PI * 2
      dummy.updateMatrix()

      instancedMesh.setMatrixAt(i, dummy.matrix)
    }

    this.scene.add(instancedMesh)

    // メンバー変数に保存
    if (layerName === 'Low') this.lowBuildings = instancedMesh
    else if (layerName === 'Mid') this.midBuildings = instancedMesh
    else if (layerName === 'High') this.highBuildings = instancedMesh
    else if (layerName === 'Skyscraper') this.skyscrapers = instancedMesh
  }

  /**
   * メガストラクチャー（巨大建造物）
   */
  private createMegastructures(): void {
    // 1. 中央タワー（800m）
    this.createCentralTower()

    // 2. リングシティ（空中都市）
    this.createRingCity()

    // 3. ピラミッド型メガビル
    this.createMegaPyramid()

    // 4-10. その他のメガストラクチャー
    this.createAdditionalMegastructures()

    console.log(`✅ メガストラクチャー作成完了: ${this.megastructures.length}個`)
  }

  private createCentralTower(): void {
    const tower = new THREE.Group()

    // メイン塔身
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(80, 120, 800, 16),
      new THREE.MeshStandardMaterial({
        color: 0x2a2a3a,
        emissive: 0x4a4aff,
        emissiveIntensity: 0.8,
        metalness: 0.7,
        roughness: 0.3
      })
    )
    body.position.y = 400
    body.castShadow = true
    tower.add(body)

    // 頂上のリング
    const topRing = new THREE.Mesh(
      new THREE.TorusGeometry(100, 10, 16, 32),
      new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 2.0
      })
    )
    topRing.position.y = 800
    topRing.rotation.x = Math.PI / 2
    tower.add(topRing)

    tower.position.set(0, 20, 0)
    tower.name = 'CentralTower'
    this.scene.add(tower)
    this.megastructures.push(tower)
  }

  private createRingCity(): void {
    const ringCity = new THREE.Group()

    // リング本体
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1500, 40, 16, 64),
      new THREE.MeshStandardMaterial({
        color: 0x3a3a4a,
        emissive: 0xff6a00,
        emissiveIntensity: 0.6,
        metalness: 0.8,
        roughness: 0.2
      })
    )
    ring.rotation.x = Math.PI / 2
    ring.castShadow = true
    ringCity.add(ring)

    ringCity.position.set(0, 300, 0)
    ringCity.name = 'RingCity'
    this.scene.add(ringCity)
    this.megastructures.push(ringCity)
  }

  private createMegaPyramid(): void {
    const pyramid = new THREE.Mesh(
      new THREE.ConeGeometry(200, 600, 4),
      new THREE.MeshStandardMaterial({
        color: 0x3a3a3a,
        emissive: 0xff00ff,
        emissiveIntensity: 0.5,
        metalness: 0.6,
        roughness: 0.4
      })
    )
    pyramid.position.set(-2000, 320, -2000)
    pyramid.rotation.y = Math.PI / 4
    pyramid.castShadow = true
    pyramid.name = 'MegaPyramid'
    this.scene.add(pyramid)
    this.megastructures.push(pyramid)
  }

  private createAdditionalMegastructures(): void {
    const locations = [
      { x: 2500, z: 2500, height: 700, type: 'cylinder' },
      { x: -2500, z: 2500, height: 650, type: 'box' },
      { x: 2500, z: -2500, height: 680, type: 'cylinder' },
      { x: -3000, z: 0, height: 620, type: 'box' },
      { x: 3000, z: 0, height: 640, type: 'cylinder' },
      { x: 0, z: 3000, height: 660, type: 'box' },
      { x: 0, z: -3000, height: 630, type: 'cylinder' }
    ]

    for (const loc of locations) {
      const geometry = loc.type === 'cylinder'
        ? new THREE.CylinderGeometry(60, 90, loc.height, 12)
        : new THREE.BoxGeometry(150, loc.height, 150)

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: 0x3a3a4a,
          emissive: [0x00ffff, 0xff00ff, 0xff6a00][Math.floor(Math.random() * 3)],
          emissiveIntensity: 0.6,
          metalness: 0.7,
          roughness: 0.3
        })
      )

      const baseY = this.getTerrainHeight(loc.x, loc.z)
      mesh.position.set(loc.x, baseY + loc.height / 2, loc.z)
      mesh.castShadow = true
      mesh.name = `Megastructure_${this.megastructures.length}`
      this.scene.add(mesh)
      this.megastructures.push(mesh)
    }
  }

  /**
   * 空中道路（スカイウェイ）
   */
  private createSkyways(): void {
    for (let i = 0; i < 50; i++) {
      const x1 = (Math.random() - 0.5) * 8000
      const z1 = (Math.random() - 0.5) * 8000
      const x2 = x1 + (Math.random() - 0.5) * 600
      const z2 = z1 + (Math.random() - 0.5) * 600
      const y = 150 + Math.random() * 250

      const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)
      const angle = Math.atan2(z2 - z1, x2 - x1)

      const skyway = new THREE.Mesh(
        new THREE.BoxGeometry(length, 3, 30),
        new THREE.MeshStandardMaterial({
          color: 0x3a3a4a,
          emissive: 0xff6a00,
          emissiveIntensity: 0.5,
          metalness: 0.6,
          roughness: 0.4
        })
      )

      skyway.position.set((x1 + x2) / 2, y, (z1 + z2) / 2)
      skyway.rotation.y = angle
      skyway.name = `Skyway_${i}`
      this.scene.add(skyway)
      this.skyways.push(skyway)
    }

    console.log(`✅ スカイウェイ作成完了: ${this.skyways.length}本`)
  }

  /**
   * ホログラム広告
   */
  private createHolograms(): void {
    const colors = [0xff00ff, 0x00ffff, 0xff6a00, 0x00ff00, 0xff0055]

    for (let i = 0; i < 200; i++) {
      const x = (Math.random() - 0.5) * 8000
      const z = (Math.random() - 0.5) * 8000
      const y = 50 + Math.random() * 200

      const billboard = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 60),
        new THREE.MeshBasicMaterial({
          color: colors[i % colors.length],
          transparent: true,
          opacity: 0.7,
          side: THREE.DoubleSide
        })
      )

      billboard.position.set(x, y, z)
      billboard.rotation.y = Math.random() * Math.PI * 2
      billboard.name = `Hologram_${i}`
      this.scene.add(billboard)
      this.holograms.push(billboard)
    }

    console.log(`✅ ホログラム作成完了: ${this.holograms.length}枚`)
  }

  /**
   * メガストリート上かどうか
   */
  private isOnMegaStreet(x: number, z: number): boolean {
    const majorRoadSize = 400
    const xMajor = Math.abs(x % majorRoadSize)
    const zMajor = Math.abs(z % majorRoadSize)
    return xMajor < 60 || zMajor < 60
  }

  /**
   * 地形高度を返す
   */
  getTerrainHeight(x: number, z: number): number {
    let height = 20

    // 山の手台地（西側）
    const yamanoteHeight = Math.max(0, -x * 0.012)
    height += yamanoteHeight

    // 多摩丘陵（西部）
    if (x < -3000) {
      const tamaHills = Math.max(0, (-x - 3000) * 0.025) *
                       Math.exp(-Math.abs(z) / 2500)
      height += tamaHills
    }

    // 下町低地（東側）
    if (x > 1000) {
      const shitamachiLowland = -(x - 1000) * 0.015
      height += shitamachiLowland
    }

    // 河川低地
    const distToSumida = Math.abs(x - 2500)
    if (distToSumida < 400) {
      const riverDepth = (1 - distToSumida / 400) * 12
      height -= riverDepth
    }

    const distToArakawa = Math.abs(x - 3800)
    if (distToArakawa < 500) {
      const riverDepth = (1 - distToArakawa / 500) * 15
      height -= riverDepth
    }

    // 武蔵野台地の起伏
    height += Math.sin(x * 0.0008) * Math.cos(z * 0.0006) * 8

    return Math.max(0, height)
  }

  getCollisionObjects(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = []

    // InstancedMeshは衝突判定から除外（パフォーマンス優先）
    // メガストラクチャーのみ判定
    objects.push(...this.megastructures)

    return objects
  }

  getSafeSpawnPosition(): { x: number; y: number; z: number } {
    return { x: 0, y: 500, z: 0 }
  }

  cleanup(): void {
    // 全オブジェクトを削除
    if (this.terrainMesh) this.scene.remove(this.terrainMesh)
    if (this.lowBuildings) this.scene.remove(this.lowBuildings)
    if (this.midBuildings) this.scene.remove(this.midBuildings)
    if (this.highBuildings) this.scene.remove(this.highBuildings)
    if (this.skyscrapers) this.scene.remove(this.skyscrapers)

    for (const mega of this.megastructures) this.scene.remove(mega)
    for (const skyway of this.skyways) this.scene.remove(skyway)
    for (const holo of this.holograms) this.scene.remove(holo)

    console.log('✅ NEO TOKYO MAPクリーンアップ完了')
  }
}
