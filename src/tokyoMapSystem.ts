import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * 東京MAP - リアルな都市デザイン
 *
 * コンセプト：
 * - 実際の東京をモデルにした色彩とテクスチャ
 * - 飛行しやすい大通り（航空機が通れる幅広の道路）
 * - 建物タイプごとの多様な色彩
 * - 緑地・公園・水域の再現
 */

export class TokyoMapSystem {
  private scene: THREE.Scene
  private terrainMesh: THREE.Mesh | null = null
  private roadMeshes: THREE.Mesh[] = []
  private buildingMeshes: THREE.Mesh[] = []
  private waterMeshes: THREE.Mesh[] = []

  constructor(scene: THREE.Scene, _loader: GLTFLoader) {
    this.scene = scene
  }

  async initialize(): Promise<void> {
    console.log('🗼 東京MAP初期化開始（リアルデザイン）')

    // 1. 地面（実際の都市色彩）
    this.createUrbanGround()

    // 2. 飛行用大通り（幅広の道路網）
    this.createFlightFriendlyRoads()

    // 3. 水域（東京湾・隅田川・運河）
    this.createWaterBodies()

    // 4. 建物群（リアルな色彩とデザイン）
    this.createBuildings()

    console.log('✅ 東京MAP初期化完了')
  }

  /**
   * 都市地面を作成（実際の東京をモデルにした色彩）
   */
  private createUrbanGround(): void {
    const size = 12000
    const segments = 128

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
    geometry.rotateX(-Math.PI / 2)

    const positions = geometry.attributes.position.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] = 0
    }

    // 実際の都市らしい色彩パターン
    const colors = new Float32Array(positions.length)
    for (let i = 0; i < colors.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]

      // 基本色: 都市のアスファルト・コンクリート
      let r = 0.38, g = 0.38, b = 0.40

      // 細街路（80m間隔）
      const blockSize = 80
      const xMod = Math.abs(x % blockSize)
      const zMod = Math.abs(z % blockSize)
      if (xMod < 6 || zMod < 6) {
        // 細い道路: ダークグレー
        r = 0.28; g = 0.28; b = 0.30
      }

      // 大通り（400m間隔）- 飛行しやすい
      const majorRoadSize = 400
      const xMajor = Math.abs(x % majorRoadSize)
      const zMajor = Math.abs(z % majorRoadSize)
      if (xMajor < 30 || zMajor < 30) {
        // 幅広の道路: より暗いグレー
        r = 0.22; g = 0.22; b = 0.24
      }

      // 公園・緑地（実際の位置を参考）
      if (Math.sqrt((x - 800) ** 2 + (z - 1200) ** 2) < 500) {
        // 皇居: 濃い緑
        r = 0.18; g = 0.32; b = 0.20
      }
      if (Math.sqrt((x - 200) ** 2 + (z - 1000) ** 2) < 350) {
        // 明治神宮: 深い森の緑
        r = 0.15; g = 0.28; b = 0.18
      }
      if (Math.sqrt((x - 2600) ** 2 + (z - 2600) ** 2) < 300) {
        // 上野公園: 明るい緑
        r = 0.22; g = 0.36; b = 0.24
      }
      if (Math.sqrt((x + 800) ** 2 + (z - 800) ** 2) < 280) {
        // 代々木公園
        r = 0.20; g = 0.34; b = 0.22
      }

      // 建物エリアの多様性
      const noise = (Math.sin(x * 0.008) * Math.cos(z * 0.008)) * 0.04
      r += noise
      g += noise
      b += noise + 0.02  // わずかに青みがかる

      colors[i] = Math.max(0, Math.min(1, r))
      colors[i + 1] = Math.max(0, Math.min(1, g))
      colors[i + 2] = Math.max(0, Math.min(1, b))
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02
    })

    this.terrainMesh = new THREE.Mesh(geometry, material)
    this.terrainMesh.receiveShadow = true
    this.terrainMesh.name = 'TokyoGround'
    this.scene.add(this.terrainMesh)

    console.log('✅ 都市地面作成完了（リアル色彩）')
  }

  /**
   * 飛行しやすい道路網を作成
   * - 環状線: 幅広（60-100m）
   * - 放射線: 幅広（50-80m）
   * - 建物の間を通れるよう設計
   */
  private createFlightFriendlyRoads(): void {
    const roadMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1c,  // ダークアスファルト
      roughness: 0.95,
      metalness: 0
    })

    // 環状道路（幅広）
    this.createRing(0, 0, 2000, 80, roadMaterial, 'InnerRing')
    this.createRing(0, 0, 3500, 90, roadMaterial, 'MiddleRing')
    this.createRing(0, 0, 5000, 100, roadMaterial, 'OuterRing')

    // 放射状大通り（12方向・幅広）
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const dx = Math.cos(angle) * 6000
      const dz = Math.sin(angle) * 6000
      this.createRoad(0, 0, dx, dz, 80, roadMaterial, `Radial${i}`)
    }

    console.log(`✅ 飛行用大通り作成完了: ${this.roadMeshes.length}本`)
  }

  private createRing(cx: number, cz: number, radius: number, width: number, material: THREE.Material, name: string): void {
    const segments = 64
    const shape = new THREE.Shape()
    shape.absarc(0, 0, radius + width / 2, 0, Math.PI * 2, false)
    const hole = new THREE.Path()
    hole.absarc(0, 0, radius - width / 2, 0, Math.PI * 2, true)
    shape.holes.push(hole)

    const geometry = new THREE.ShapeGeometry(shape, segments)
    geometry.rotateX(-Math.PI / 2)

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(cx, 0.1, cz)
    mesh.receiveShadow = true
    mesh.name = `TokyoRoad_${name}`
    this.scene.add(mesh)
    this.roadMeshes.push(mesh)
  }

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
   * 水域を作成
   */
  private createWaterBodies(): void {
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a3a5a,
      roughness: 0.15,
      metalness: 0.75,
      transparent: true,
      opacity: 0.90
    })

    const riverMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a4a5a,
      roughness: 0.20,
      metalness: 0.70,
      transparent: true,
      opacity: 0.88
    })

    // 東京湾
    const bayGeometry = new THREE.PlaneGeometry(5000, 4000)
    bayGeometry.rotateX(-Math.PI / 2)
    const bayMesh = new THREE.Mesh(bayGeometry, waterMaterial)
    bayMesh.position.set(3500, 0.05, -3800)
    bayMesh.name = 'TokyoBay'
    this.scene.add(bayMesh)
    this.waterMeshes.push(bayMesh)

    // 隅田川
    const sumidaPoints = [
      { x: 2000, z: 3500 }, { x: 2100, z: 3000 }, { x: 2300, z: 2500 },
      { x: 2500, z: 2000 }, { x: 2700, z: 1500 }, { x: 2800, z: 1000 },
      { x: 2900, z: 500 }, { x: 3000, z: 0 }, { x: 3100, z: -500 },
      { x: 3200, z: -1000 }, { x: 3300, z: -1500 }, { x: 3400, z: -2000 }
    ]
    this.createRiverSegments(sumidaPoints, 120, riverMaterial, 'Sumida')

    // 荒川
    const arakawaPoints = [
      { x: 3500, z: 4000 }, { x: 3600, z: 3000 }, { x: 3800, z: 2000 },
      { x: 4000, z: 1000 }, { x: 4200, z: 0 }, { x: 4300, z: -1000 }
    ]
    this.createRiverSegments(arakawaPoints, 180, riverMaterial, 'Arakawa')

    console.log(`✅ 水域作成完了: ${this.waterMeshes.length}個`)
  }

  private createRiverSegments(points: Array<{ x: number; z: number }>, width: number, material: THREE.Material, name: string): void {
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]
      const p2 = points[i + 1]
      const dx = p2.x - p1.x
      const dz = p2.z - p1.z
      const length = Math.sqrt(dx * dx + dz * dz)
      const angle = Math.atan2(dz, dx)

      const geometry = new THREE.PlaneGeometry(length, width)
      geometry.rotateX(-Math.PI / 2)
      geometry.rotateY(-angle)

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set((p1.x + p2.x) / 2, 0.05, (p1.z + p2.z) / 2)
      mesh.name = `Tokyo${name}_${i}`
      this.scene.add(mesh)
      this.waterMeshes.push(mesh)
    }
  }

  /**
   * 建物群を作成（実際の東京をモデルにした色彩）
   */
  private createBuildings(): void {
    // 地区定義: [名前, 中心X, 中心Z, 範囲X, 範囲Z, 建物数, 最小高さ, 最大高さ, タイプ]
    const districts: Array<[string, number, number, number, number, number, number, number, string]> = [
      // 都心部（超高層ビル）
      ['新宿西口', -2500, 800, 600, 600, 60, 180, 280, 'office'],
      ['新宿東口', -1800, 800, 500, 500, 55, 80, 180, 'commercial'],
      ['渋谷駅前', 0, 0, 400, 400, 50, 120, 240, 'tech'],
      ['六本木', 1800, -200, 700, 700, 50, 120, 260, 'office'],
      ['丸の内', 800, 1200, 500, 400, 55, 150, 210, 'financial'],
      ['銀座', 1400, 600, 600, 500, 60, 50, 120, 'luxury'],

      // 副都心
      ['池袋', -1800, 2800, 600, 600, 50, 100, 200, 'commercial'],
      ['品川', 2000, -2000, 700, 700, 45, 100, 180, 'office'],
      ['上野', 2800, 2200, 600, 600, 40, 60, 120, 'cultural'],

      // 臨海部
      ['お台場', 4200, -3200, 1000, 1000, 30, 80, 160, 'resort'],
      ['豊洲', 3800, -1200, 800, 800, 40, 80, 150, 'modern'],

      // 住宅地
      ['恵比寿', 600, -600, 500, 500, 50, 50, 110, 'residential'],
      ['中野', -3200, 1800, 700, 700, 55, 50, 100, 'residential'],
      ['吉祥寺', -4800, 2800, 800, 800, 60, 40, 90, 'shopping']
    ]

    for (const [name, cx, cz, rangeX, rangeZ, count, minH, maxH, type] of districts) {
      this.createDistrictBuildings(name, cx, cz, rangeX, rangeZ, count, minH, maxH, type)
    }

    console.log(`✅ 建物作成完了: ${this.buildingMeshes.length}棟`)
  }

  /**
   * 地区ごとの建物群を生成（実際の東京をモデルにした色彩）
   */
  private createDistrictBuildings(
    district: string,
    cx: number,
    cz: number,
    rangeX: number,
    rangeZ: number,
    count: number,
    minHeight: number,
    maxHeight: number,
    type: string
  ): void {
    // 建物タイプごとのリアルな色彩
    const materialsByType: Record<string, THREE.MeshStandardMaterial[]> = {
      office: [
        new THREE.MeshStandardMaterial({ color: 0xa0b0c0, roughness: 0.3, metalness: 0.7 }), // 青ガラス
        new THREE.MeshStandardMaterial({ color: 0x90a0b0, roughness: 0.35, metalness: 0.65 }), // グレーガラス
        new THREE.MeshStandardMaterial({ color: 0xb0b8c0, roughness: 0.25, metalness: 0.75 })  // シルバーガラス
      ],
      financial: [
        new THREE.MeshStandardMaterial({ color: 0xb8c0c8, roughness: 0.25, metalness: 0.75 }), // 高級ガラス
        new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.30, metalness: 0.70 })
      ],
      tech: [
        new THREE.MeshStandardMaterial({ color: 0x8098b8, roughness: 0.4, metalness: 0.6 }), // テックブルー
        new THREE.MeshStandardMaterial({ color: 0x90a0b0, roughness: 0.35, metalness: 0.65 })
      ],
      commercial: [
        new THREE.MeshStandardMaterial({ color: 0xc0c0b8, roughness: 0.5, metalness: 0.4 }), // ベージュ
        new THREE.MeshStandardMaterial({ color: 0xb0b0a8, roughness: 0.55, metalness: 0.35 }),
        new THREE.MeshStandardMaterial({ color: 0xd0d0c8, roughness: 0.45, metalness: 0.45 })
      ],
      residential: [
        new THREE.MeshStandardMaterial({ color: 0xe0d8d0, roughness: 0.75, metalness: 0.15 }), // クリーム色
        new THREE.MeshStandardMaterial({ color: 0xd0c8c0, roughness: 0.80, metalness: 0.10 }),
        new THREE.MeshStandardMaterial({ color: 0xc8c0b8, roughness: 0.78, metalness: 0.12 })
      ],
      luxury: [
        new THREE.MeshStandardMaterial({ color: 0xf0e8e0, roughness: 0.35, metalness: 0.5 }), // 高級クリーム
        new THREE.MeshStandardMaterial({ color: 0xe8e0d8, roughness: 0.30, metalness: 0.55 })
      ],
      modern: [
        new THREE.MeshStandardMaterial({ color: 0x9098a8, roughness: 0.35, metalness: 0.65 }), // モダングレー
        new THREE.MeshStandardMaterial({ color: 0xa0a8b0, roughness: 0.30, metalness: 0.70 })
      ],
      cultural: [
        new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.85, metalness: 0.08 }), // 文化施設
        new THREE.MeshStandardMaterial({ color: 0xc0b8a8, roughness: 0.80, metalness: 0.10 })
      ],
      resort: [
        new THREE.MeshStandardMaterial({ color: 0xc8d8e8, roughness: 0.45, metalness: 0.35 }), // リゾート
        new THREE.MeshStandardMaterial({ color: 0xb8c8d8, roughness: 0.50, metalness: 0.30 })
      ],
      shopping: [
        new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.60, metalness: 0.25 }), // ショッピング
        new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.65, metalness: 0.20 })
      ]
    }

    const materials = materialsByType[type] || materialsByType.commercial

    for (let i = 0; i < count; i++) {
      const x = cx + (Math.random() - 0.5) * rangeX
      const z = cz + (Math.random() - 0.5) * rangeZ

      // 大通りを避ける（飛行しやすくする）
      if (this.isOnMajorRoad(x, z)) continue

      let width: number, depth: number
      if (type === 'office' || type === 'financial') {
        width = 35 + Math.random() * 50
        depth = 35 + Math.random() * 50
      } else if (type === 'residential') {
        width = 18 + Math.random() * 28
        depth = 18 + Math.random() * 28
      } else {
        width = 25 + Math.random() * 40
        depth = 25 + Math.random() * 40
      }

      const height = minHeight + Math.random() * (maxHeight - minHeight)

      const geometry = new THREE.BoxGeometry(width, height, depth)
      const material = materials[Math.floor(Math.random() * materials.length)]
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
   * 大通り（飛行用道路）上かどうかの判定
   */
  private isOnMajorRoad(x: number, z: number): boolean {
    const distFromCenter = Math.sqrt(x * x + z * z)

    // 環状道路チェック（幅広）
    if (Math.abs(distFromCenter - 2000) < 80) return true
    if (Math.abs(distFromCenter - 3500) < 90) return true
    if (Math.abs(distFromCenter - 5000) < 100) return true

    // 放射道路チェック（12方向・幅広）
    const angle = Math.atan2(z, x)
    for (let i = 0; i < 12; i++) {
      const roadAngle = (i / 12) * Math.PI * 2
      const angleDiff = Math.abs(((angle - roadAngle + Math.PI) % (Math.PI * 2)) - Math.PI)
      if (angleDiff < 0.08 && distFromCenter < 6000) return true
    }

    return false
  }

  getTerrainHeight(_x: number, _z: number): number {
    return 0
  }

  getCollisionObjects(): THREE.Object3D[] {
    return [...this.buildingMeshes]
  }

  getSafeSpawnPosition(): { x: number; y: number; z: number } {
    return { x: 0, y: 500, z: 0 }
  }

  dispose(): void {
    console.log('🗑️ 東京MAPクリーンアップ開始')

    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh)
      this.terrainMesh.geometry.dispose()
      ;(this.terrainMesh.material as THREE.Material).dispose()
    }

    this.roadMeshes.forEach(mesh => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    })

    this.buildingMeshes.forEach(mesh => {
      this.scene.remove(mesh)
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    })

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
