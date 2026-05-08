import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * 東京MAP - 完全新規実装
 *
 * コンセプト：
 * - 東京23区の主要エリアを3D再現
 * - 渋谷駅を中心座標(0, 0, 0)とする
 * - スケール: 1 unit = 10m（つまり100unit = 1km）
 * - 完全フラットな地形（標高差なし）
 * - 実際の建物配置を簡略化して再現
 * - 主要道路を表示
 * - 東京湾・隅田川などの水域
 * - 有名ランドマーク（東京タワー、スカイツリー等）
 */

export class TokyoMapSystem {
  private scene: THREE.Scene
  private terrainMesh: THREE.Mesh | null = null
  private roadMeshes: THREE.Mesh[] = []
  private buildingMeshes: THREE.Mesh[] = []
  private waterMeshes: THREE.Mesh[] = []

  constructor(scene: THREE.Scene, _loader: GLTFLoader) {
    this.scene = scene
    // loader は将来のランドマークGLB読み込みで使用予定
  }

  /**
   * 東京MAP初期化
   */
  async initialize(): Promise<void> {
    console.log('🗼 東京MAP初期化開始（完全新規実装）')

    // 1. 地面（コンクリート・アスファルト質感）
    this.createUrbanGround()

    // 2. 道路網（環状線 + 放射線）
    this.createRoadNetwork()

    // 3. 水域（東京湾・隅田川）
    this.createWaterBodies()

    // 4. 建物群（地区ごとに配置）
    this.createBuildings()

    console.log('✅ 東京MAP初期化完了')
  }

  /**
   * 都市地面を作成（12km x 12km）
   * 色: 灰色系（コンクリート・アスファルト）
   */
  private createUrbanGround(): void {
    const size = 12000  // 12km四方
    const segments = 64

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
    geometry.rotateX(-Math.PI / 2)

    // 完全フラット（高さ0）
    const positions = geometry.attributes.position.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] = 0  // Y = 0
    }

    // 頂点カラー: グレー系のバリエーション
    const colors = new Float32Array(positions.length)
    for (let i = 0; i < colors.length; i += 3) {
      const baseGray = 0.45 + Math.random() * 0.10  // 0.45-0.55のグレー
      colors[i] = baseGray
      colors[i + 1] = baseGray
      colors[i + 2] = baseGray + 0.02  // わずかに青みがかる
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.1
    })

    this.terrainMesh = new THREE.Mesh(geometry, material)
    this.terrainMesh.receiveShadow = true
    this.terrainMesh.name = 'TokyoGround'
    this.scene.add(this.terrainMesh)

    console.log('✅ 都市地面作成完了')
  }

  /**
   * 道路網を作成
   * - 環状線（山手線・環七・環八）
   * - 放射状道路（青山通り・甲州街道など）
   */
  private createRoadNetwork(): void {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,  // ダークグレー（アスファルト）
      roughness: 0.95,
      metalness: 0
    })

    // 環状道路1: 内側（半径2km）
    this.createRing(0, 0, 2000, 40, roadMaterial, 'Ring1')

    // 環状道路2: 中間（半径3.5km）
    this.createRing(0, 0, 3500, 50, roadMaterial, 'Ring2')

    // 環状道路3: 外側（半径5km）
    this.createRing(0, 0, 5000, 60, roadMaterial, 'Ring3')

    // 放射状道路（8方向）
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const dx = Math.cos(angle) * 6000
      const dz = Math.sin(angle) * 6000
      this.createRoad(0, 0, dx, dz, 35, roadMaterial, `Radial${i}`)
    }

    console.log(`✅ 道路網作成完了: ${this.roadMeshes.length}本`)
  }

  /**
   * 環状道路を作成
   */
  private createRing(cx: number, cz: number, radius: number, width: number, material: THREE.Material, name: string): void {
    const segments = 64
    const shape = new THREE.Shape()

    // 外円
    shape.absarc(0, 0, radius + width / 2, 0, Math.PI * 2, false)

    // 内円（穴を開ける）
    const hole = new THREE.Path()
    hole.absarc(0, 0, radius - width / 2, 0, Math.PI * 2, true)
    shape.holes.push(hole)

    const geometry = new THREE.ShapeGeometry(shape, segments)
    geometry.rotateX(-Math.PI / 2)

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(cx, 0.1, cz)  // わずかに浮かせて地面と干渉回避
    mesh.receiveShadow = true
    mesh.name = `TokyoRoad_${name}`
    this.scene.add(mesh)
    this.roadMeshes.push(mesh)
  }

  /**
   * 直線道路を作成
   */
  private createRoad(x1: number, z1: number, x2: number, z2: number, width: number, material: THREE.Material, name: string): void {
    const dx = x2 - x1
    const dz = z2 - z1
    const length = Math.sqrt(dx * dx + dz * dz)
    const angle = Math.atan2(dz, dx)

    const geometry = new THREE.PlaneGeometry(length, width)
    geometry.rotateX(-Math.PI / 2)
    geometry.rotateY(-angle)

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set((x1 + x2) / 2, 0.1, (z1 + z2) / 2)
    mesh.receiveShadow = true
    mesh.name = `TokyoRoad_${name}`
    this.scene.add(mesh)
    this.roadMeshes.push(mesh)
  }

  /**
   * 水域を作成（東京湾・隅田川）
   */
  private createWaterBodies(): void {
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a3a5a,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85
    })

    // 東京湾（南東エリア）
    const bayGeometry = new THREE.PlaneGeometry(4000, 3000)
    bayGeometry.rotateX(-Math.PI / 2)
    const bayMesh = new THREE.Mesh(bayGeometry, waterMaterial)
    bayMesh.position.set(3000, 0.05, -3500)  // 南東
    bayMesh.name = 'TokyoBay'
    this.scene.add(bayMesh)
    this.waterMeshes.push(bayMesh)

    // 隅田川（蛇行する川を簡易表現）
    const riverPoints = [
      { x: 1500, z: 3000 },
      { x: 1600, z: 2000 },
      { x: 1800, z: 1000 },
      { x: 2000, z: 0 },
      { x: 2200, z: -1000 },
      { x: 2400, z: -2000 },
      { x: 2600, z: -3000 }
    ]

    for (let i = 0; i < riverPoints.length - 1; i++) {
      const p1 = riverPoints[i]
      const p2 = riverPoints[i + 1]
      const dx = p2.x - p1.x
      const dz = p2.z - p1.z
      const length = Math.sqrt(dx * dx + dz * dz)
      const angle = Math.atan2(dz, dx)

      const riverGeometry = new THREE.PlaneGeometry(length, 80)
      riverGeometry.rotateX(-Math.PI / 2)
      riverGeometry.rotateY(-angle)

      const riverMesh = new THREE.Mesh(riverGeometry, waterMaterial)
      riverMesh.position.set((p1.x + p2.x) / 2, 0.05, (p1.z + p2.z) / 2)
      riverMesh.name = `TokyoRiver_${i}`
      this.scene.add(riverMesh)
      this.waterMeshes.push(riverMesh)
    }

    console.log(`✅ 水域作成完了: ${this.waterMeshes.length}個`)
  }

  /**
   * 建物群を作成
   * 地区ごとに高さと密度を変える
   */
  private createBuildings(): void {
    // 地区定義: [名前, 中心X, 中心Z, 範囲X, 範囲Z, 建物数, 最小高さ, 最大高さ]
    const districts: Array<[string, number, number, number, number, number, number, number]> = [
      // 都心部（高層ビル密集）
      ['新宿', -2000, 500, 800, 800, 40, 120, 250],
      ['渋谷', 0, 0, 600, 600, 35, 100, 230],
      ['六本木', 1500, -500, 700, 700, 30, 100, 240],
      ['丸の内', 800, 800, 600, 500, 25, 140, 200],
      ['銀座', 1200, 400, 700, 600, 30, 60, 120],

      // 副都心
      ['池袋', -1800, 2500, 700, 700, 30, 80, 180],
      ['品川', 2000, -1800, 800, 800, 25, 80, 160],
      ['上野', 2500, 2000, 600, 600, 20, 50, 100],

      // 臨海部
      ['お台場', 4000, -3000, 1000, 1000, 15, 60, 150],
      ['豊洲', 3500, -1500, 800, 800, 18, 70, 140],

      // 住宅・商業混在
      ['恵比寿', 500, -800, 500, 500, 25, 50, 100],
      ['中野', -3000, 1500, 600, 600, 20, 40, 80],
      ['吉祥寺', -4500, 2500, 700, 700, 18, 30, 70]
    ]

    for (const [name, cx, cz, rangeX, rangeZ, count, minH, maxH] of districts) {
      this.createDistrictBuildings(name, cx, cz, rangeX, rangeZ, count, minH, maxH)
    }

    console.log(`✅ 建物作成完了: ${this.buildingMeshes.length}棟`)
  }

  /**
   * 地区ごとの建物群を生成
   */
  private createDistrictBuildings(
    district: string,
    cx: number,
    cz: number,
    rangeX: number,
    rangeZ: number,
    count: number,
    minHeight: number,
    maxHeight: number
  ): void {
    const buildingMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0x909090, roughness: 0.75, metalness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.7, metalness: 0.25 }),
      new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.85, metalness: 0.15 })
    ]

    for (let i = 0; i < count; i++) {
      const x = cx + (Math.random() - 0.5) * rangeX
      const z = cz + (Math.random() - 0.5) * rangeZ

      // 道路上を避ける簡易チェック
      if (this.isOnRoad(x, z)) continue

      const width = 20 + Math.random() * 40
      const depth = 20 + Math.random() * 40
      const height = minHeight + Math.random() * (maxHeight - minHeight)

      const geometry = new THREE.BoxGeometry(width, height, depth)
      const material = buildingMaterials[Math.floor(Math.random() * buildingMaterials.length)]
      const mesh = new THREE.Mesh(geometry, material)

      mesh.position.set(x, height / 2, z)
      mesh.rotation.y = Math.random() * Math.PI * 2
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.name = `TokyoBuilding_${district}_${i}`

      this.scene.add(mesh)
      this.buildingMeshes.push(mesh)
    }
  }

  /**
   * 道路上かどうかの簡易判定
   */
  private isOnRoad(x: number, z: number): boolean {
    const distFromCenter = Math.sqrt(x * x + z * z)

    // 環状道路チェック
    if (Math.abs(distFromCenter - 2000) < 50) return true
    if (Math.abs(distFromCenter - 3500) < 60) return true
    if (Math.abs(distFromCenter - 5000) < 70) return true

    // 放射道路チェック（8方向）
    const angle = Math.atan2(z, x)
    for (let i = 0; i < 8; i++) {
      const roadAngle = (i / 8) * Math.PI * 2
      const angleDiff = Math.abs(((angle - roadAngle + Math.PI) % (Math.PI * 2)) - Math.PI)
      if (angleDiff < 0.05 && distFromCenter < 6000) return true
    }

    return false
  }

  /**
   * 地形高さ取得（東京MAPは常に0）
   */
  getTerrainHeight(_x: number, _z: number): number {
    return 0
  }

  /**
   * 衝突判定用オブジェクト取得
   */
  getCollisionObjects(): THREE.Object3D[] {
    return [...this.buildingMeshes]
  }

  /**
   * 安全なスポーン位置取得
   */
  getSafeSpawnPosition(): { x: number; y: number; z: number } {
    return { x: 0, y: 500, z: 0 }
  }

  /**
   * クリーンアップ
   */
  dispose(): void {
    console.log('🗑️ 東京MAPクリーンアップ開始')

    // 地形削除
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh)
      this.terrainMesh.geometry.dispose()
      ;(this.terrainMesh.material as THREE.Material).dispose()
    }

    // 道路削除
    this.roadMeshes.forEach(mesh => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    })

    // 建物削除
    this.buildingMeshes.forEach(mesh => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    })

    // 水域削除
    this.waterMeshes.forEach(mesh => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    })

    this.terrainMesh = null
    this.roadMeshes = []
    this.buildingMeshes = []
    this.waterMeshes = []

    console.log('✅ 東京MAPクリーンアップ完了')
  }
}
