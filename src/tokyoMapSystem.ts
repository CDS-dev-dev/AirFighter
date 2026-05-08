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
   * 色: 灰色系（コンクリート・アスファルト）+ 街区パターン
   */
  private createUrbanGround(): void {
    const size = 12000  // 12km四方
    const segments = 128  // 密度向上

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
    geometry.rotateX(-Math.PI / 2)

    // 完全フラット（高さ0）
    const positions = geometry.attributes.position.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] = 0  // Y = 0
    }

    // 頂点カラー: 街区パターンを反映
    const colors = new Float32Array(positions.length)
    for (let i = 0; i < colors.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]

      // 基本色: 都市らしいグレー
      let r = 0.42, g = 0.42, b = 0.44

      // 細かいグリッド（街区）を表現
      const blockSize = 80  // 80m間隔
      const xMod = Math.abs(x % blockSize)
      const zMod = Math.abs(z % blockSize)

      // 道路部分（グリッド線）を暗く
      if (xMod < 8 || zMod < 8) {
        r = 0.28
        g = 0.28
        b = 0.28
      }

      // 大通り（より太い道路）
      const majorRoadSize = 400
      const xMajor = Math.abs(x % majorRoadSize)
      const zMajor = Math.abs(z % majorRoadSize)
      if (xMajor < 20 || zMajor < 20) {
        r = 0.25
        g = 0.25
        b = 0.25
      }

      // 公園エリア（緑）
      // 皇居（中心から北東1km）
      if (Math.sqrt((x - 800) ** 2 + (z - 1200) ** 2) < 500) {
        r = 0.20
        g = 0.35
        b = 0.22
      }
      // 明治神宮（原宿近く）
      if (Math.sqrt((x - 200) ** 2 + (z - 1000) ** 2) < 350) {
        r = 0.18
        g = 0.32
        b = 0.20
      }
      // 上野公園
      if (Math.sqrt((x - 2600) ** 2 + (z - 2600) ** 2) < 300) {
        r = 0.22
        g = 0.36
        b = 0.24
      }
      // 代々木公園
      if (Math.sqrt((x + 800) ** 2 + (z - 800) ** 2) < 280) {
        r = 0.21
        g = 0.34
        b = 0.23
      }

      // ノイズで多様性を追加
      const noise = (Math.sin(x * 0.01) * Math.cos(z * 0.01)) * 0.03
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
      roughness: 0.85,
      metalness: 0.05
    })

    this.terrainMesh = new THREE.Mesh(geometry, material)
    this.terrainMesh.receiveShadow = true
    this.terrainMesh.name = 'TokyoGround'
    this.scene.add(this.terrainMesh)

    console.log('✅ 都市地面作成完了（街区パターン付き）')
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
   * 水域を作成（東京湾・隅田川・運河）
   */
  private createWaterBodies(): void {
    const waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a3a5a,
      roughness: 0.2,
      metalness: 0.7,
      transparent: true,
      opacity: 0.88
    })

    const riverMaterial = new THREE.MeshStandardMaterial({
      color: 0x243a4a,
      roughness: 0.25,
      metalness: 0.65,
      transparent: true,
      opacity: 0.85
    })

    // 東京湾（南東の広いエリア）
    const bayGeometry = new THREE.PlaneGeometry(5000, 4000)
    bayGeometry.rotateX(-Math.PI / 2)
    const bayMesh = new THREE.Mesh(bayGeometry, waterMaterial)
    bayMesh.position.set(3500, 0.05, -3800)  // 南東
    bayMesh.name = 'TokyoBay'
    this.scene.add(bayMesh)
    this.waterMeshes.push(bayMesh)

    // 隅田川（北から南へ流れる）
    const sumidaPoints = [
      { x: 2000, z: 3500 },  // 北（荒川分岐点付近）
      { x: 2100, z: 3000 },
      { x: 2300, z: 2500 },
      { x: 2500, z: 2000 },
      { x: 2700, z: 1500 },
      { x: 2800, z: 1000 },
      { x: 2900, z: 500 },
      { x: 3000, z: 0 },
      { x: 3100, z: -500 },
      { x: 3200, z: -1000 },
      { x: 3300, z: -1500 },
      { x: 3400, z: -2000 },  // 東京湾へ
    ]

    this.createRiverSegments(sumidaPoints, 100, riverMaterial, 'Sumida')

    // 荒川（東側を流れる大きな川）
    const arakawaPoints = [
      { x: 3500, z: 4000 },
      { x: 3600, z: 3000 },
      { x: 3800, z: 2000 },
      { x: 4000, z: 1000 },
      { x: 4200, z: 0 },
      { x: 4300, z: -1000 }
    ]

    this.createRiverSegments(arakawaPoints, 150, riverMaterial, 'Arakawa')

    // 目黒川（南西）
    const meguroPoints = [
      { x: 500, z: -1000 },
      { x: 800, z: -1500 },
      { x: 1200, z: -2000 },
      { x: 1600, z: -2500 },
      { x: 2000, z: -3000 }
    ]

    this.createRiverSegments(meguroPoints, 60, riverMaterial, 'Meguro')

    // 運河（臨海部）
    const canals = [
      [{ x: 3500, z: -2000 }, { x: 4500, z: -2000 }],
      [{ x: 3800, z: -2500 }, { x: 4800, z: -2500 }],
      [{ x: 4000, z: -3000 }, { x: 5000, z: -3000 }]
    ]

    for (let i = 0; i < canals.length; i++) {
      this.createRiverSegments(canals[i], 40, riverMaterial, `Canal${i}`)
    }

    console.log(`✅ 水域作成完了: ${this.waterMeshes.length}個`)
  }

  /**
   * 川のセグメントを作成（ヘルパー関数）
   */
  private createRiverSegments(
    points: Array<{ x: number; z: number }>,
    width: number,
    material: THREE.Material,
    name: string
  ): void {
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
   * 建物群を作成
   * 実際の東京の地区配置を参考に高密度で配置
   */
  private createBuildings(): void {
    // 地区定義: [名前, 中心X, 中心Z, 範囲X, 範囲Z, 建物数, 最小高さ, 最大高さ, タイプ]
    // 座標は実際の位置関係を反映（渋谷駅=原点）
    const districts: Array<[string, number, number, number, number, number, number, number, string]> = [
      // ===== 都心3区（超高層ビル密集地帯）=====
      // 新宿エリア（西新宿：超高層ビル群）
      ['新宿西口', -2500, 800, 600, 600, 80, 180, 280, 'office'],
      ['新宿東口', -1800, 800, 500, 500, 70, 80, 180, 'commercial'],
      ['新宿三丁目', -1600, 500, 400, 400, 60, 60, 140, 'commercial'],

      // 渋谷エリア（IT企業・ファッション）
      ['渋谷駅前', 0, 0, 400, 400, 70, 120, 240, 'commercial'],
      ['渋谷南', 200, -400, 500, 500, 55, 80, 180, 'commercial'],
      ['表参道', 600, 400, 600, 400, 50, 50, 120, 'fashion'],
      ['原宿', 300, 800, 400, 400, 45, 40, 100, 'fashion'],

      // 港区エリア（六本木・赤坂・麻布）
      ['六本木', 1800, -200, 700, 700, 65, 120, 260, 'office'],
      ['六本木ヒルズ周辺', 1500, -500, 400, 400, 40, 100, 240, 'office'],
      ['赤坂', 1200, 400, 600, 600, 55, 80, 180, 'office'],
      ['麻布', 1000, -800, 500, 500, 45, 50, 120, 'residential'],
      ['青山', 800, 200, 500, 500, 50, 60, 140, 'office'],

      // 千代田区（丸の内・大手町：金融街）
      ['丸の内', 800, 1200, 500, 400, 70, 150, 210, 'financial'],
      ['大手町', 1200, 1500, 600, 500, 65, 140, 200, 'financial'],
      ['日比谷', 600, 800, 400, 400, 45, 100, 160, 'office'],
      ['霞が関', 200, 600, 500, 500, 40, 80, 150, 'government'],

      // 中央区（銀座・日本橋）
      ['銀座', 1400, 600, 600, 500, 80, 50, 120, 'luxury'],
      ['日本橋', 1800, 1200, 700, 600, 70, 80, 160, 'financial'],
      ['築地', 2200, 400, 500, 500, 40, 40, 100, 'commercial'],

      // ===== 副都心（主要ターミナル駅周辺）=====
      ['池袋東口', -1500, 2800, 600, 600, 75, 100, 200, 'commercial'],
      ['池袋西口', -2200, 2800, 600, 600, 70, 80, 180, 'commercial'],
      ['池袋北', -1800, 3400, 500, 500, 50, 60, 140, 'residential'],

      ['品川駅東', 2200, -2000, 700, 700, 65, 100, 180, 'office'],
      ['品川駅西', 1600, -2000, 600, 600, 55, 80, 160, 'office'],

      ['上野駅前', 2800, 2200, 600, 600, 60, 60, 120, 'commercial'],
      ['上野公園周辺', 2600, 2800, 500, 500, 35, 40, 80, 'cultural'],

      ['秋葉原', 2200, 1400, 600, 600, 80, 60, 120, 'tech'],
      ['神田', 1600, 1800, 500, 500, 65, 50, 100, 'commercial'],

      // ===== 東エリア =====
      ['東京駅', 1000, 1000, 400, 400, 60, 120, 180, 'station'],
      ['八重洲', 1200, 800, 400, 400, 55, 80, 150, 'office'],

      ['浜松町', 1800, -800, 500, 500, 50, 80, 160, 'office'],
      ['田町', 2000, -1200, 500, 500, 45, 70, 140, 'office'],

      // ===== 臨海副都心（お台場エリア）=====
      ['お台場', 4200, -3200, 1000, 1000, 45, 80, 160, 'resort'],
      ['青海', 3800, -2800, 700, 700, 35, 60, 140, 'commercial'],
      ['豊洲', 3800, -1200, 800, 800, 55, 80, 150, 'residential'],
      ['有明', 4600, -2200, 800, 800, 40, 70, 130, 'commercial'],

      // ===== 住宅・商業混在エリア =====
      ['恵比寿', 600, -600, 500, 500, 65, 50, 110, 'residential'],
      ['代官山', 200, -800, 400, 400, 50, 40, 90, 'residential'],
      ['中目黒', 400, -1200, 500, 500, 55, 50, 100, 'residential'],
      ['目黒', 1000, -1600, 600, 600, 60, 50, 110, 'residential'],

      ['五反田', 1400, -2400, 600, 600, 65, 60, 120, 'office'],
      ['大崎', 1800, -2600, 600, 600, 55, 70, 140, 'office'],

      // ===== 西エリア =====
      ['代々木', -600, 600, 500, 500, 50, 50, 100, 'commercial'],
      ['新大久保', -2200, 1200, 500, 500, 60, 40, 90, 'residential'],
      ['高田馬場', -2800, 2200, 600, 600, 65, 50, 100, 'student'],

      ['中野', -3200, 1800, 700, 700, 70, 50, 100, 'residential'],
      ['高円寺', -3800, 1400, 600, 600, 60, 40, 80, 'residential'],
      ['阿佐ヶ谷', -4400, 1600, 600, 600, 55, 35, 75, 'residential'],

      ['吉祥寺', -4800, 2800, 800, 800, 75, 40, 90, 'commercial'],

      // ===== 北エリア =====
      ['日暮里', 3200, 2800, 500, 500, 50, 40, 80, 'residential'],
      ['西日暮里', 2800, 3200, 500, 500, 45, 35, 75, 'residential'],

      ['駒込', 1800, 3400, 600, 600, 55, 40, 85, 'residential'],
      ['巣鴨', 1200, 3800, 600, 600, 50, 35, 80, 'residential'],

      // ===== 南エリア =====
      ['大井町', 2200, -3200, 700, 700, 60, 50, 110, 'commercial'],
      ['蒲田', 2800, -4200, 800, 800, 70, 45, 95, 'commercial']
    ]

    for (const [name, cx, cz, rangeX, rangeZ, count, minH, maxH, type] of districts) {
      this.createDistrictBuildings(name, cx, cz, rangeX, rangeZ, count, minH, maxH, type)
    }

    console.log(`✅ 建物作成完了: ${this.buildingMeshes.length}棟`)
  }

  /**
   * 地区ごとの建物群を生成（タイプ別の外観）
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
    // 建物タイプごとのマテリアル定義
    const materialsByType: Record<string, THREE.MeshStandardMaterial[]> = {
      office: [
        new THREE.MeshStandardMaterial({ color: 0x9098a0, roughness: 0.4, metalness: 0.6 }), // ガラス系
        new THREE.MeshStandardMaterial({ color: 0x7080a0, roughness: 0.35, metalness: 0.65 }), // 青ガラス
        new THREE.MeshStandardMaterial({ color: 0x808890, roughness: 0.5, metalness: 0.5 })  // シルバー
      ],
      financial: [
        new THREE.MeshStandardMaterial({ color: 0xa0a8b0, roughness: 0.3, metalness: 0.7 }), // 高級ガラス
        new THREE.MeshStandardMaterial({ color: 0x909098, roughness: 0.35, metalness: 0.65 })
      ],
      commercial: [
        new THREE.MeshStandardMaterial({ color: 0xa0a0a0, roughness: 0.6, metalness: 0.3 }), // グレー
        new THREE.MeshStandardMaterial({ color: 0x989898, roughness: 0.65, metalness: 0.25 }),
        new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.55, metalness: 0.35 })
      ],
      residential: [
        new THREE.MeshStandardMaterial({ color: 0xc8c8c0, roughness: 0.8, metalness: 0.1 }), // ベージュ
        new THREE.MeshStandardMaterial({ color: 0xb8b8b0, roughness: 0.85, metalness: 0.05 }),
        new THREE.MeshStandardMaterial({ color: 0xa8a8a0, roughness: 0.82, metalness: 0.08 })
      ],
      luxury: [
        new THREE.MeshStandardMaterial({ color: 0xd0d0c8, roughness: 0.4, metalness: 0.4 }), // 高級感
        new THREE.MeshStandardMaterial({ color: 0xe0e0d8, roughness: 0.35, metalness: 0.45 })
      ],
      tech: [
        new THREE.MeshStandardMaterial({ color: 0x7088a8, roughness: 0.5, metalness: 0.5 }), // テック系ブルー
        new THREE.MeshStandardMaterial({ color: 0x8090a0, roughness: 0.45, metalness: 0.55 })
      ],
      fashion: [
        new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.6, metalness: 0.2 }), // 明るいベージュ
        new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.65, metalness: 0.15 })
      ],
      government: [
        new THREE.MeshStandardMaterial({ color: 0x909088, roughness: 0.75, metalness: 0.2 }), // 厳格な灰色
        new THREE.MeshStandardMaterial({ color: 0x989890, roughness: 0.8, metalness: 0.15 })
      ],
      resort: [
        new THREE.MeshStandardMaterial({ color: 0xb0c0d0, roughness: 0.5, metalness: 0.3 }), // リゾート系明るめ
        new THREE.MeshStandardMaterial({ color: 0xa0b0c0, roughness: 0.55, metalness: 0.25 })
      ],
      cultural: [
        new THREE.MeshStandardMaterial({ color: 0xa8a098, roughness: 0.85, metalness: 0.1 }), // 文化施設系
        new THREE.MeshStandardMaterial({ color: 0xb0a898, roughness: 0.9, metalness: 0.05 })
      ],
      student: [
        new THREE.MeshStandardMaterial({ color: 0xc0c0b8, roughness: 0.75, metalness: 0.15 }), // 学生街
        new THREE.MeshStandardMaterial({ color: 0xb8b8b0, roughness: 0.8, metalness: 0.1 })
      ],
      station: [
        new THREE.MeshStandardMaterial({ color: 0xa8a8a8, roughness: 0.6, metalness: 0.4 }) // 駅周辺
      ]
    }

    const materials = materialsByType[type] || materialsByType.commercial

    for (let i = 0; i < count; i++) {
      const x = cx + (Math.random() - 0.5) * rangeX
      const z = cz + (Math.random() - 0.5) * rangeZ

      // 道路上を避ける
      if (this.isOnRoad(x, z)) continue

      // 建物サイズ（タイプによって変動）
      let width: number, depth: number
      if (type === 'office' || type === 'financial') {
        // オフィス：大型ビル
        width = 30 + Math.random() * 50
        depth = 30 + Math.random() * 50
      } else if (type === 'residential') {
        // 住宅：細長いマンション
        width = 15 + Math.random() * 25
        depth = 15 + Math.random() * 25
      } else {
        // 商業：中型
        width = 20 + Math.random() * 40
        depth = 20 + Math.random() * 40
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
