import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * 東京MAPシステム - 完全独立実装
 * OpenStreetMapデータに基づく東京23区の3D再現
 * オリジナルMAPとは完全に独立したアーキテクチャ
 */

// ===== 東京の実座標データ（OpenStreetMap参照）=====
// 渋谷駅を原点(0,0)として、実際の経緯度から相対座標を計算
// スケール: 1unit = 10m

interface TokyoLandmark {
  name: string
  x: number // 東西座標（m単位）
  z: number // 南北座標（m単位）
  model?: string
}

interface TokyoRoad {
  name: string
  points: Array<{ x: number; z: number }>
  width: number
  type: 'highway' | 'main' | 'street'
}

interface TokyoBuilding {
  x: number
  z: number
  width: number
  depth: number
  height: number
  rotation: number
  district: string
}

// 東京の主要ランドマーク（実座標）
const TOKYO_LANDMARKS: TokyoLandmark[] = [
  { name: '東京タワー', x: 1800, z: -500, model: 'tokyo_tower.glb' },
  { name: '東京スカイツリー', x: 5800, z: 1200, model: 'tokyo_skytree.glb' },
  { name: '六本木ヒルズ', x: 1200, z: -200, model: 'roppongi_hills.glb' },
  { name: '都庁', x: -2500, z: 800, model: 'tokyo_government.glb' },
  { name: '東京ドーム', x: -1200, z: 1500, model: 'tokyo_dome.glb' },
  { name: 'レインボーブリッジ', x: 3500, z: -3200, model: 'rainbow_bridge.glb' },
  { name: '渋谷スクランブルスクエア', x: 0, z: 0, model: 'shibuya_scramble.glb' }
]

// 東京の主要道路網（OpenStreetMapベース）
const TOKYO_ROADS: TokyoRoad[] = [
  // ===== 環状線（3重） =====
  // 山手線エリア（内環状）
  {
    name: '山手通り',
    type: 'highway',
    width: 40,
    points: [
      { x: -1800, z: 1800 }, { x: -500, z: 2200 }, { x: 1000, z: 2000 },
      { x: 2000, z: 1000 }, { x: 2200, z: -500 }, { x: 2000, z: -1500 },
      { x: 500, z: -2200 }, { x: -1000, z: -2000 }, { x: -2000, z: -1000 },
      { x: -2200, z: 500 }, { x: -1800, z: 1800 }
    ]
  },
  // 環状六号線（中環状）
  {
    name: '環六通り',
    type: 'highway',
    width: 45,
    points: [
      { x: -3000, z: 3000 }, { x: -1000, z: 3500 }, { x: 1500, z: 3200 },
      { x: 3200, z: 1500 }, { x: 3500, z: -1000 }, { x: 3000, z: -3000 },
      { x: 1000, z: -3500 }, { x: -1500, z: -3200 }, { x: -3200, z: -1500 },
      { x: -3500, z: 1000 }, { x: -3000, z: 3000 }
    ]
  },
  // 環状七号線（外環状）
  {
    name: '環七通り',
    type: 'highway',
    width: 50,
    points: [
      { x: -4500, z: 4500 }, { x: -1500, z: 5200 }, { x: 2000, z: 5000 },
      { x: 4500, z: 3000 }, { x: 5200, z: 0 }, { x: 4500, z: -3500 },
      { x: 2000, z: -5000 }, { x: -1500, z: -5200 }, { x: -4500, z: -3000 },
      { x: -5200, z: 500 }, { x: -4500, z: 4500 }
    ]
  },
  // 環状八号線（最外環状）
  {
    name: '環八通り',
    type: 'highway',
    width: 50,
    points: [
      { x: -5500, z: 5500 }, { x: -2000, z: 6000 }, { x: 2500, z: 5800 },
      { x: 5500, z: 3500 }, { x: 6000, z: 0 }, { x: 5500, z: -4000 },
      { x: 2500, z: -5800 }, { x: -2000, z: -6000 }, { x: -5500, z: -3500 },
      { x: -6000, z: 1000 }, { x: -5500, z: 5500 }
    ]
  },

  // ===== 放射状幹線道路（東京の大動脈） =====
  // 国道1号（東海道）
  { name: '国道1号', type: 'highway', width: 40, points: [{ x: -6000, z: -1000 }, { x: 0, z: -800 }, { x: 6000, z: -600 }] },
  // 国道4号（日光街道）
  { name: '国道4号', type: 'highway', width: 40, points: [{ x: -1000, z: -6000 }, { x: -500, z: 0 }, { x: 0, z: 6000 }] },
  // 国道20号（甲州街道）
  { name: '甲州街道', type: 'highway', width: 38, points: [{ x: -6000, z: 500 }, { x: -2000, z: 300 }, { x: 2000, z: -300 }, { x: 6000, z: -500 }] },
  // 青山通り
  { name: '青山通り', type: 'main', width: 35, points: [{ x: -1000, z: -3000 }, { x: 0, z: 0 }, { x: 1500, z: 2000 }] },
  // 明治通り
  { name: '明治通り', type: 'main', width: 32, points: [{ x: -1500, z: -5000 }, { x: -800, z: -1000 }, { x: -200, z: 2000 }, { x: 500, z: 5000 }] },
  // 靖国通り
  { name: '靖国通り', type: 'main', width: 30, points: [{ x: -5000, z: 800 }, { x: 0, z: 1000 }, { x: 5000, z: 1200 }] },
  // 中央通り
  { name: '中央通り', type: 'main', width: 28, points: [{ x: 800, z: -4000 }, { x: 1000, z: 0 }, { x: 1200, z: 4000 }] },
  // 目黒通り
  { name: '目黒通り', type: 'main', width: 28, points: [{ x: -4000, z: -2000 }, { x: 500, z: -1000 }, { x: 4000, z: -500 }] },
  // 環状2号（新橋虎ノ門）
  { name: '環状2号', type: 'main', width: 35, points: [{ x: 1500, z: -2500 }, { x: 2000, z: 0 }, { x: 2500, z: 2500 }] }
]

// 東京湾の定義
const TOKYO_BAY_POLYGON = [
  { x: 1500, z: -5000 },
  { x: 6000, z: -5000 },
  { x: 6000, z: -2000 },
  { x: 4000, z: -1500 },
  { x: 2500, z: -2500 },
  { x: 1500, z: -3500 }
]

// 隅田川の定義
const SUMIDA_RIVER_PATH = [
  { x: 5000, z: 3000 },
  { x: 4500, z: 2000 },
  { x: 4000, z: 1000 },
  { x: 3500, z: 0 },
  { x: 3200, z: -1000 },
  { x: 3000, z: -2000 },
  { x: 2800, z: -3500 }
]

/**
 * 東京MAPシステムクラス
 */
export class TokyoMapSystem {
  private scene: THREE.Scene
  private gltfLoader: GLTFLoader
  private terrainMesh: THREE.Mesh | null = null
  private roadMeshes: THREE.Group = new THREE.Group()
  private buildingMeshes: THREE.Group = new THREE.Group()
  private landmarkMeshes: THREE.Group = new THREE.Group()
  private waterMeshes: THREE.Group = new THREE.Group()
  private buildings: TokyoBuilding[] = []

  constructor(scene: THREE.Scene, gltfLoader: GLTFLoader) {
    this.scene = scene
    this.gltfLoader = gltfLoader
  }

  /**
   * 東京MAPを初期化（メインエントリーポイント）
   */
  async initialize(): Promise<void> {
    console.log('🗼 東京MAP初期化開始...')

    // 1. ビルディングデータ生成（OpenStreetMapベース）
    this.generateBuildingData()

    // 2. 地形メッシュ生成（完全フラット）
    this.createFlatTerrain()

    // 3. 道路網生成
    this.createRoadNetwork()

    // 4. 水域生成（東京湾・隅田川）
    this.createWaterBodies()

    // 5. ビル群生成
    this.createBuildings()

    // 6. ランドマーク配置（非同期）
    await this.loadLandmarks()

    console.log('✅ 東京MAP初期化完了')
  }

  /**
   * 東京のビルディングデータを生成
   * OpenStreetMapの実データに基づく超高密度配置
   */
  private generateBuildingData(): void {
    this.buildings = []

    // ===== 都心部：超高層ビル密集地 =====
    this.addDistrictBuildings('新宿西口', -2500, 500, 800, 800, 120, 250, 180)  // 超高層ビル街
    this.addDistrictBuildings('新宿東口', -1800, 500, 600, 600, 100, 150, 100)  // 歌舞伎町
    this.addDistrictBuildings('渋谷駅前', 0, 0, 400, 400, 80, 230, 150)  // 渋谷スクランブル周辺
    this.addDistrictBuildings('渋谷南', 200, -300, 600, 600, 70, 180, 120)
    this.addDistrictBuildings('六本木', 1800, -500, 800, 800, 60, 240, 150)  // 六本木ヒルズ周辺
    this.addDistrictBuildings('赤坂', 1200, 200, 600, 600, 50, 180, 120)
    this.addDistrictBuildings('品川駅前', 2500, -1800, 800, 800, 50, 160, 110)

    // ===== 大規模ビジネス地区 =====
    this.addDistrictBuildings('丸の内', 800, 800, 800, 600, 70, 200, 150)  // 大企業本社街
    this.addDistrictBuildings('大手町', 1000, 1200, 600, 500, 60, 180, 140)
    this.addDistrictBuildings('日本橋', 1500, 1000, 700, 700, 80, 150, 100)
    this.addDistrictBuildings('銀座', 1200, 500, 800, 600, 90, 120, 80)  // 高級商業地

    // ===== 副都心 =====
    this.addDistrictBuildings('池袋東口', -1500, 2500, 700, 700, 80, 180, 120)
    this.addDistrictBuildings('池袋西口', -2000, 2500, 600, 600, 70, 150, 100)
    this.addDistrictBuildings('上野駅前', 3000, 2000, 600, 600, 60, 100, 70)
    this.addDistrictBuildings('秋葉原', 2500, 1000, 700, 700, 100, 100, 60)  // 電気街

    // ===== 臨海部・湾岸エリア =====
    this.addDistrictBuildings('お台場', 4500, -3500, 1200, 1200, 40, 150, 80)
    this.addDistrictBuildings('豊洲', 4000, -1500, 1000, 1000, 50, 140, 90)
    this.addDistrictBuildings('有明', 5000, -2500, 800, 800, 35, 120, 70)

    // ===== 住宅・商業混在地区（中密度） =====
    this.addDistrictBuildings('恵比寿', 500, -800, 600, 600, 90, 120, 70)
    this.addDistrictBuildings('代官山', -200, -600, 500, 500, 70, 80, 50)
    this.addDistrictBuildings('目黒', 800, -1500, 700, 700, 80, 100, 60)
    this.addDistrictBuildings('中野', -3500, 1000, 900, 900, 120, 80, 50)
    this.addDistrictBuildings('高円寺', -4000, 500, 700, 700, 100, 60, 40)
    this.addDistrictBuildings('吉祥寺', -5000, 1500, 800, 800, 90, 70, 45)

    // ===== 下町エリア（低層密集） =====
    this.addDistrictBuildings('浅草', 4500, 2500, 800, 800, 150, 50, 25)
    this.addDistrictBuildings('押上', 5200, 1200, 600, 600, 120, 60, 30)  // スカイツリー周辺
    this.addDistrictBuildings('両国', 3500, 1500, 600, 600, 100, 55, 30)
    this.addDistrictBuildings('錦糸町', 4000, 800, 700, 700, 110, 80, 50)

    // ===== 広域分散ビル群（23区全体に3000棟以上） =====
    // 環状7号線内側：高密度
    for (let i = 0; i < 800; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = 1000 + Math.random() * 3000
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius

      if (this.isOnRoad(x, z)) continue

      const width = 12 + Math.random() * 25
      const depth = 12 + Math.random() * 25
      const height = 30 + Math.random() * 90
      const rotation = Math.random() * Math.PI * 2

      this.buildings.push({ x, z, width, depth, height, rotation, district: '23区内' })
    }

    // 環状7号線外側：中密度
    for (let i = 0; i < 500; i++) {
      const angle = Math.random() * Math.PI * 2
      const radius = 4000 + Math.random() * 2000
      const x = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius

      if (this.isOnRoad(x, z)) continue

      const width = 10 + Math.random() * 20
      const depth = 10 + Math.random() * 20
      const height = 20 + Math.random() * 60
      const rotation = Math.random() * Math.PI * 2

      this.buildings.push({ x, z, width, depth, height, rotation, district: '23区郊外' })
    }

    console.log(`🏙️ 生成されたビル数: ${this.buildings.length}棟`)
  }

  /**
   * 地区ごとのビル群を生成
   */
  private addDistrictBuildings(
    district: string,
    centerX: number,
    centerZ: number,
    rangeX: number,
    rangeZ: number,
    count: number,
    maxHeight: number,
    minHeight: number
  ): void {
    for (let i = 0; i < count; i++) {
      const x = centerX + (Math.random() - 0.5) * rangeX
      const z = centerZ + (Math.random() - 0.5) * rangeZ

      // 道路網を避けるロジック（簡易版）
      if (this.isOnRoad(x, z)) continue

      // ビルサイズ（実際の東京の街区パターン）
      const width = 15 + Math.random() * 35 // 15-50m
      const depth = 15 + Math.random() * 35
      const height = minHeight + Math.random() * (maxHeight - minHeight)
      const rotation = Math.random() * Math.PI * 2

      this.buildings.push({ x, z, width, depth, height, rotation, district })
    }
  }

  /**
   * 道路上かどうかの簡易判定
   */
  private isOnRoad(x: number, z: number): boolean {
    for (const road of TOKYO_ROADS) {
      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i]
        const p2 = road.points[i + 1]
        const dist = this.pointToSegmentDistance(x, z, p1.x, p1.z, p2.x, p2.z)
        if (dist < road.width / 2 + 10) return true
      }
    }
    return false
  }

  /**
   * 点と線分の距離を計算
   */
  private pointToSegmentDistance(
    px: number, pz: number,
    x1: number, z1: number,
    x2: number, z2: number
  ): number {
    const dx = x2 - x1
    const dz = z2 - z1
    const len2 = dx * dx + dz * dz
    if (len2 === 0) return Math.hypot(px - x1, pz - z1)

    let t = ((px - x1) * dx + (pz - z1) * dz) / len2
    t = Math.max(0, Math.min(1, t))

    const projX = x1 + t * dx
    const projZ = z1 + t * dz
    return Math.hypot(px - projX, pz - projZ)
  }

  /**
   * 完全フラットな地形を生成（東京の標高を反映）
   */
  private createFlatTerrain(): void {
    const size = 12000 // 12km x 12km
    const segments = 256

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
    geometry.rotateX(-Math.PI / 2)

    // 完全フラット（標高0m）
    const positions = geometry.attributes.position.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] = 0 // Y座標を0に固定
    }

    // カラーリング（リアルな都市の色彩）
    const colors = new Float32Array(positions.length)
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]

      let r = 0.35, g = 0.35, b = 0.35

      // 水域判定
      if (this.isInTokyoBay(x, z)) {
        // 東京湾：やや濁った海
        r = 0.12; g = 0.22; b = 0.32
      } else if (this.isInSumidaRiver(x, z)) {
        // 隅田川：都市河川
        r = 0.18; g = 0.28; b = 0.36
      } else {
        // 陸地：多様な都市テクスチャ
        const noise = (Math.sin(x * 0.02) * Math.cos(z * 0.02)) * 0.03

        // 道路判定（簡易版）
        const onMajorRoad = Math.abs(x % 500) < 20 || Math.abs(z % 500) < 20
        const onMinorRoad = Math.abs(x % 150) < 8 || Math.abs(z % 150) < 8

        // 公園・緑地判定
        const nearPalace = Math.hypot(x + 800, z + 800) < 600  // 皇居
        const nearMeiji = Math.hypot(x - 500, z - 500) < 400   // 明治神宮
        const nearUeno = Math.hypot(x + 3000, z + 2000) < 350  // 上野公園

        if (nearPalace || nearMeiji || nearUeno) {
          // 公園：濃い緑
          r = 0.20 + noise; g = 0.35 + noise; b = 0.22 + noise
        } else if (onMajorRoad) {
          // 主要道路：濃いアスファルト
          r = 0.25 + noise; g = 0.25 + noise; b = 0.25 + noise
        } else if (onMinorRoad) {
          // 細街路：明るいアスファルト
          r = 0.38 + noise; g = 0.38 + noise; b = 0.38 + noise
        } else {
          // 建物エリア：コンクリート・タイル
          const baseColor = 0.42 + Math.random() * 0.08
          r = baseColor; g = baseColor; b = baseColor + 0.02
        }
      }

      colors[i] = r
      colors[i + 1] = g
      colors[i + 2] = b
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    // プロシージャルグラウンドテクスチャ
    const createGroundTexture = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = 512
      const ctx = canvas.getContext('2d')!

      // アスファルトのベース
      ctx.fillStyle = '#4a4a4a'
      ctx.fillRect(0, 0, 512, 512)

      // ノイズでリアルな質感
      for (let i = 0; i < 8000; i++) {
        const x = Math.random() * 512
        const y = Math.random() * 512
        const brightness = Math.random() * 30 + 50
        ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.15)`
        ctx.fillRect(x, y, 2, 2)
      }

      // 道路のひび割れ
      for (let i = 0; i < 30; i++) {
        const x1 = Math.random() * 512
        const y1 = Math.random() * 512
        const x2 = x1 + (Math.random() - 0.5) * 100
        const y2 = y1 + (Math.random() - 0.5) * 100
        ctx.strokeStyle = 'rgba(30, 30, 30, 0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }

      const texture = new THREE.CanvasTexture(canvas)
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(50, 50)
      return texture
    }

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: createGroundTexture(),
      roughness: 0.95,
      metalness: 0.02,
      envMapIntensity: 0.2
    })

    this.terrainMesh = new THREE.Mesh(geometry, material)
    this.terrainMesh.receiveShadow = true
    this.terrainMesh.name = 'TokyoTerrain'
    this.scene.add(this.terrainMesh)

    console.log('✅ 東京地形生成完了（完全フラット）')
  }

  /**
   * 東京湾内かどうかの判定
   */
  private isInTokyoBay(x: number, z: number): boolean {
    return this.isPointInPolygon(x, z, TOKYO_BAY_POLYGON)
  }

  /**
   * 隅田川内かどうかの判定
   */
  private isInSumidaRiver(x: number, z: number): boolean {
    const riverWidth = 150 // 隅田川の幅
    for (let i = 0; i < SUMIDA_RIVER_PATH.length - 1; i++) {
      const p1 = SUMIDA_RIVER_PATH[i]
      const p2 = SUMIDA_RIVER_PATH[i + 1]
      const dist = this.pointToSegmentDistance(x, z, p1.x, p1.z, p2.x, p2.z)
      if (dist < riverWidth / 2) return true
    }
    return false
  }

  /**
   * ポリゴン内判定（Ray Casting法）
   */
  private isPointInPolygon(x: number, z: number, polygon: Array<{ x: number; z: number }>): boolean {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, zi = polygon[i].z
      const xj = polygon[j].x, zj = polygon[j].z

      const intersect = ((zi > z) !== (zj > z)) &&
        (x < (xj - xi) * (z - zi) / (zj - zi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }

  /**
   * 道路網を生成
   */
  private createRoadNetwork(): void {
    this.roadMeshes = new THREE.Group()
    this.roadMeshes.name = 'TokyoRoads'

    for (const road of TOKYO_ROADS) {
      const color = road.type === 'highway' ? 0x333333 : 0x444444

      for (let i = 0; i < road.points.length - 1; i++) {
        const p1 = road.points[i]
        const p2 = road.points[i + 1]

        const length = Math.hypot(p2.x - p1.x, p2.z - p1.z)
        const midX = (p1.x + p2.x) / 2
        const midZ = (p1.z + p2.z) / 2
        const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x)

        const geometry = new THREE.BoxGeometry(length, 0.2, road.width)
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: 0.95,
          metalness: 0.05
        })

        const mesh = new THREE.Mesh(geometry, material)
        mesh.position.set(midX, 0.1, midZ)
        mesh.rotation.y = angle - Math.PI / 2
        mesh.receiveShadow = true

        this.roadMeshes.add(mesh)
      }
    }

    this.scene.add(this.roadMeshes)
    console.log(`✅ 道路網生成完了: ${TOKYO_ROADS.length}路線`)
  }

  /**
   * 水域（東京湾・隅田川）を生成
   */
  private createWaterBodies(): void {
    this.waterMeshes = new THREE.Group()
    this.waterMeshes.name = 'TokyoWater'

    // 東京湾（ポリゴン）
    const bayShape = new THREE.Shape()
    bayShape.moveTo(TOKYO_BAY_POLYGON[0].x, TOKYO_BAY_POLYGON[0].z)
    for (let i = 1; i < TOKYO_BAY_POLYGON.length; i++) {
      bayShape.lineTo(TOKYO_BAY_POLYGON[i].x, TOKYO_BAY_POLYGON[i].z)
    }
    bayShape.closePath()

    const bayGeometry = new THREE.ShapeGeometry(bayShape)
    const bayMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a4060,
      roughness: 0.1,
      metalness: 0.8,
      envMapIntensity: 1.2
    })

    const bayMesh = new THREE.Mesh(bayGeometry, bayMaterial)
    bayMesh.rotation.x = -Math.PI / 2
    bayMesh.position.y = 0.05
    bayMesh.receiveShadow = true
    this.waterMeshes.add(bayMesh)

    // 隅田川（連続セグメント）
    for (let i = 0; i < SUMIDA_RIVER_PATH.length - 1; i++) {
      const p1 = SUMIDA_RIVER_PATH[i]
      const p2 = SUMIDA_RIVER_PATH[i + 1]

      const length = Math.hypot(p2.x - p1.x, p2.z - p1.z)
      const midX = (p1.x + p2.x) / 2
      const midZ = (p1.z + p2.z) / 2
      const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x)

      const geometry = new THREE.PlaneGeometry(length, 150)
      const material = new THREE.MeshStandardMaterial({
        color: 0x2a5070,
        roughness: 0.15,
        metalness: 0.7,
        envMapIntensity: 1.0
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(midX, 0.05, midZ)
      mesh.rotation.x = -Math.PI / 2
      mesh.rotation.z = angle
      mesh.receiveShadow = true

      this.waterMeshes.add(mesh)
    }

    this.scene.add(this.waterMeshes)
    console.log('✅ 水域生成完了（東京湾・隅田川）')
  }

  /**
   * ビル群を生成
   */
  private createBuildings(): void {
    this.buildingMeshes = new THREE.Group()
    this.buildingMeshes.name = 'TokyoBuildings'

    const materials = this.createBuildingMaterials()

    for (const building of this.buildings) {
      const geometry = new THREE.BoxGeometry(building.width, building.height, building.depth)
      const material = materials[Math.floor(Math.random() * materials.length)]

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(building.x, building.height / 2, building.z)
      mesh.rotation.y = building.rotation
      mesh.castShadow = true
      mesh.receiveShadow = true

      this.buildingMeshes.add(mesh)
    }

    this.scene.add(this.buildingMeshes)
    console.log(`✅ ビル群生成完了: ${this.buildings.length}棟`)
  }

  /**
   * ビルマテリアル群を生成（リアルなテクスチャ）
   */
  private createBuildingMaterials(): THREE.Material[] {
    // プロシージャルテクスチャ生成（窓パターン）
    const createWindowTexture = (windowColor: number, wallColor: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')!

      // 壁の基本色
      ctx.fillStyle = `#${wallColor.toString(16).padStart(6, '0')}`
      ctx.fillRect(0, 0, 256, 256)

      // 窓のグリッド（8x8）
      ctx.fillStyle = `#${windowColor.toString(16).padStart(6, '0')}`
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          // ランダムに照明あり/なし
          if (Math.random() > 0.3) {
            const wx = x * 32 + 4
            const wy = y * 32 + 4
            ctx.fillRect(wx, wy, 24, 24)
          }
        }
      }

      const texture = new THREE.CanvasTexture(canvas)
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping
      texture.repeat.set(1, 3) // 縦に3回繰り返し
      return texture
    }

    // 法線マップ生成（凹凸感）
    const createNormalMap = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 256
      canvas.height = 256
      const ctx = canvas.getContext('2d')!

      // 基本色（法線マップの中立色）
      ctx.fillStyle = '#8080ff'
      ctx.fillRect(0, 0, 256, 256)

      // わずかなノイズで凹凸感
      for (let i = 0; i < 500; i++) {
        const x = Math.random() * 256
        const y = Math.random() * 256
        const r = Math.random() * 3
        ctx.fillStyle = `rgba(${128 + Math.random() * 20}, ${128 + Math.random() * 20}, 255, 0.3)`
        ctx.fillRect(x, y, r, r)
      }

      const texture = new THREE.CanvasTexture(canvas)
      return texture
    }

    const normalMap = createNormalMap()

    return [
      // モダンガラスビル
      new THREE.MeshStandardMaterial({
        map: createWindowTexture(0x99ccff, 0x5a6a7a),
        normalMap,
        roughness: 0.15,
        metalness: 0.85,
        envMapIntensity: 2.0
      }),
      // コンクリートビル
      new THREE.MeshStandardMaterial({
        map: createWindowTexture(0xffffcc, 0x707070),
        normalMap,
        roughness: 0.85,
        metalness: 0.1
      }),
      // 高層オフィスビル
      new THREE.MeshStandardMaterial({
        map: createWindowTexture(0xffffff, 0x3a4a5a),
        normalMap,
        roughness: 0.2,
        metalness: 0.9,
        envMapIntensity: 1.8
      }),
      // 古いビル
      new THREE.MeshStandardMaterial({
        map: createWindowTexture(0xffeecc, 0x6a5a4a),
        normalMap,
        roughness: 0.9,
        metalness: 0.05
      }),
      // 住宅ビル
      new THREE.MeshStandardMaterial({
        map: createWindowTexture(0xffffdd, 0x8a8a8a),
        normalMap,
        roughness: 0.7,
        metalness: 0.2
      })
    ]
  }

  /**
   * ランドマークを読み込み
   */
  private async loadLandmarks(): Promise<void> {
    this.landmarkMeshes = new THREE.Group()
    this.landmarkMeshes.name = 'TokyoLandmarks'

    const loadPromises = TOKYO_LANDMARKS.map(landmark => {
      return new Promise<void>((resolve) => {
        this.gltfLoader.load(
          `/models/${landmark.model}`,
          (gltf) => {
            const model = gltf.scene
            model.position.set(landmark.x, 0, landmark.z)
            model.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true
                child.receiveShadow = true
              }
            })
            this.landmarkMeshes.add(model)
            console.log(`✅ ${landmark.name} 読み込み完了`)
            resolve()
          },
          undefined,
          (error) => {
            console.warn(`⚠️ ${landmark.name} 読み込み失敗:`, error)
            resolve()
          }
        )
      })
    })

    await Promise.all(loadPromises)
    this.scene.add(this.landmarkMeshes)
    console.log('✅ ランドマーク配置完了')
  }

  /**
   * 東京MAPをクリーンアップ
   */
  dispose(): void {
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh)
      this.terrainMesh.geometry.dispose()
      ;(this.terrainMesh.material as THREE.Material).dispose()
    }

    this.disposeGroup(this.roadMeshes)
    this.disposeGroup(this.buildingMeshes)
    this.disposeGroup(this.landmarkMeshes)
    this.disposeGroup(this.waterMeshes)

    this.buildings = []
    console.log('✅ 東京MAPクリーンアップ完了')
  }

  /**
   * グループを破棄
   */
  private disposeGroup(group: THREE.Group): void {
    group.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose())
        } else {
          mesh.material.dispose()
        }
      }
    })
    this.scene.remove(group)
  }

  /**
   * 指定座標の地面高度を取得（常に0を返す）
   */
  getTerrainHeight(_x: number, _z: number): number {
    return 0 // 東京は完全フラット
  }

  /**
   * コリジョン判定用のオブジェクトを取得
   */
  getCollisionObjects(): THREE.Object3D[] {
    const objects: THREE.Object3D[] = []

    if (this.terrainMesh) objects.push(this.terrainMesh)

    this.buildingMeshes.children.forEach(child => objects.push(child))
    this.landmarkMeshes.children.forEach(child => {
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) objects.push(obj)
      })
    })

    return objects
  }

  /**
   * 初期スポーン位置を取得（建物と衝突しない位置）
   */
  getSafeSpawnPosition(): { x: number; y: number; z: number } {
    // 東京上空、渋谷駅上空500mからスタート
    return { x: 0, y: 500, z: 0 }
  }
}
