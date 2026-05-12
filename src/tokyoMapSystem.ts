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

    // 5. 大規模公園と樹木
    this.createMajorParks()

    // 6. ランドマーク（東京タワー、スカイツリーなど）
    this.createLandmarks()

    console.log('✅ 東京MAP初期化完了')
  }

  /**
   * 都市地面を作成（実際の東京をモデルにした色彩）
   */
  private createUrbanGround(): void {
    const size = 12000
    const segments = 64  // 128 → 64（パフォーマンス改善）

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
    geometry.rotateX(-Math.PI / 2)

    const positions = geometry.attributes.position.array as Float32Array

    // 実際の東京の地形高低を再現
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i]
      const z = positions[i + 2]

      // 基準高度：皇居を20mに設定
      let height = 20

      // 山の手台地（西側が高い：40-60m）
      const yamanoteHeight = Math.max(0, -x * 0.012)  // 西に行くほど高くなる
      height += yamanoteHeight

      // 多摩丘陵（西部の丘陵地帯：最大80m）
      if (x < -3000) {
        const tamaHills = Math.max(0, (-x - 3000) * 0.025) *
                         Math.exp(-Math.abs(z) / 2500)
        height += tamaHills
      }

      // 下町低地（東側が低い：0-10m）
      if (x > 1000) {
        const shitamachiLowland = -(x - 1000) * 0.015
        height += shitamachiLowland
      }

      // 荒川・隅田川の河川低地（さらに低い）
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

      // 武蔵野台地の緩やかな起伏
      height += Math.sin(x * 0.0008) * Math.cos(z * 0.0006) * 8

      // 最低高度を0mに制限
      positions[i + 1] = Math.max(0, height)
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

      // 大通り（400m間隔）- 飛行しやすい（幅30m→60mに拡大）
      const majorRoadSize = 400
      const xMajor = Math.abs(x % majorRoadSize)
      const zMajor = Math.abs(z % majorRoadSize)
      if (xMajor < 60 || zMajor < 60) {
        // 幅広の道路: より暗いグレー（戦闘機が通りやすい）
        r = 0.22; g = 0.22; b = 0.24
      }

      // 公園・緑地（大規模公園15箇所 + 既存の緑地）
      const parks = [
        { x: -1500, z: 500, w: 580, h: 350 },    // 新宿御苑
        { x: -800, z: 200, w: 540, h: 400 },     // 代々木公園
        { x: -4500, z: 400, w: 430, h: 380 },    // 井の頭公園
        { x: -3200, z: -1800, w: 600, h: 500 },  // 砧公園
        { x: -4600, z: 3400, w: 600, h: 500 },   // 光が丘公園
        { x: -4800, z: 3800, w: 400, h: 380 },   // 石神井公園
        { x: -3800, z: 800, w: 350, h: 320 },    // 善福寺公園
        { x: -1400, z: -2200, w: 500, h: 480 },  // 駒沢オリンピック公園
        { x: 400, z: -2000, w: 380, h: 320 },    // 林試の森公園
        { x: 5000, z: 3200, w: 700, h: 600 },    // 水元公園
        { x: 2400, z: 5000, w: 600, h: 550 },    // 舎人公園
        { x: 5600, z: -1800, w: 800, h: 700 },   // 葛西臨海公園
        { x: -5400, z: 2200, w: 700, h: 600 },   // 小金井公園
        { x: -5800, z: 400, w: 500, h: 450 },    // 府中の森公園
        { x: -5000, z: 0, w: 450, h: 400 }       // 野川公園
      ]

      for (const park of parks) {
        const dx = Math.abs(x - park.x)
        const dz = Math.abs(z - park.z)
        if (dx < park.w / 2 && dz < park.h / 2) {
          r = 0.18; g = 0.34; b = 0.20  // 公園の緑
          break
        }
      }

      // 皇居
      if (Math.sqrt((x - 800) ** 2 + (z - 1200) ** 2) < 500) {
        r = 0.18; g = 0.32; b = 0.20
      }
      // 明治神宮
      if (Math.sqrt((x - 200) ** 2 + (z - 1000) ** 2) < 350) {
        r = 0.15; g = 0.28; b = 0.18
      }
      // 上野公園
      if (Math.sqrt((x - 2600) ** 2 + (z - 2600) ** 2) < 300) {
        r = 0.22; g = 0.36; b = 0.24
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
    mesh.position.set(cx, 0.5, cz)  // Z-fighting回避のため0.1→0.5に変更
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
    mesh.position.set((x1 + x2) / 2, 0.5, (z1 + z2) / 2)  // Z-fighting回避のため0.1→0.5に変更
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
    bayMesh.position.set(3500, 0.2, -3800)  // Z-fighting回避のため0.05→0.2に変更
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
      mesh.position.set((p1.x + p2.x) / 2, 0.2, (p1.z + p2.z) / 2)  // Z-fighting回避のため0.05→0.2に変更
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
      // ===== 都心部（超高層ビル）=====
      ['新宿西口', -2500, 800, 600, 600, 70, 180, 280, 'office'],
      ['新宿東口', -1800, 800, 500, 500, 60, 80, 180, 'commercial'],
      ['渋谷駅前', 0, 0, 400, 400, 60, 120, 240, 'tech'],
      ['六本木', 1800, -200, 700, 700, 60, 120, 260, 'office'],
      ['丸の内', 800, 1200, 500, 400, 60, 150, 210, 'financial'],
      ['銀座', 1400, 600, 600, 500, 70, 50, 120, 'luxury'],
      ['虎ノ門', 1200, 200, 500, 500, 55, 100, 200, 'office'],

      // ===== 副都心 =====
      ['池袋', -1800, 2800, 600, 600, 60, 100, 200, 'commercial'],
      ['品川', 2000, -2000, 700, 700, 50, 100, 180, 'office'],
      ['上野', 2800, 2200, 600, 600, 50, 60, 120, 'cultural'],
      ['立川', -5500, -1500, 700, 700, 50, 80, 150, 'commercial'],
      ['錦糸町', 3000, 1000, 600, 600, 55, 70, 140, 'commercial'],

      // ===== 臨海部 =====
      ['お台場', 4200, -3200, 1000, 1000, 40, 80, 160, 'resort'],
      ['豊洲', 3800, -1200, 800, 800, 50, 80, 150, 'modern'],
      ['有明', 4500, -2200, 700, 700, 35, 60, 120, 'modern'],
      ['辰巳', 4000, -500, 600, 600, 30, 50, 100, 'residential'],

      // ===== 商業地 =====
      ['恵比寿', 600, -600, 500, 500, 55, 50, 110, 'residential'],
      ['中野', -3200, 1800, 700, 700, 60, 50, 100, 'residential'],
      ['吉祥寺', -4800, 2800, 800, 800, 65, 40, 90, 'shopping'],
      ['秋葉原', 2200, 800, 500, 500, 80, 40, 80, 'tech'],
      ['下北沢', -1200, -400, 400, 400, 75, 30, 60, 'shopping'],
      ['三軒茶屋', -400, -1200, 400, 400, 80, 35, 70, 'commercial'],
      ['高円寺', -3800, 1200, 500, 500, 70, 35, 65, 'residential'],
      ['荻窪', -4400, 1600, 600, 600, 65, 35, 70, 'residential'],
      ['自由が丘', -1600, -1800, 500, 500, 70, 35, 75, 'shopping'],

      // ===== 住宅地（東京23区内）=====
      ['目黒', -800, -1500, 700, 700, 60, 30, 80, 'residential'],
      ['世田谷', -2800, -800, 1000, 1000, 80, 25, 70, 'residential'],
      ['練馬', -4200, 3800, 900, 900, 70, 25, 65, 'residential'],
      ['葛飾', 4500, 2500, 1000, 1000, 70, 25, 70, 'residential'],
      ['江戸川', 5200, 800, 900, 900, 65, 25, 75, 'residential'],
      ['板橋', -3500, 3200, 800, 800, 65, 30, 75, 'residential'],
      ['足立', 1200, 4200, 1100, 1100, 70, 25, 65, 'residential'],
      ['大田', 1500, -3800, 1000, 1000, 70, 30, 80, 'residential'],
      ['杉並', -3600, 600, 900, 900, 75, 30, 70, 'residential'],
      ['北区', 600, 3800, 800, 800, 60, 30, 75, 'residential'],
      ['豊島', -2200, 2200, 600, 600, 65, 40, 90, 'residential'],
      ['文京', 1400, 2400, 600, 600, 60, 35, 85, 'residential'],
      ['台東', 2400, 1800, 600, 600, 65, 35, 80, 'residential'],
      ['墨田', 3200, 600, 700, 700, 60, 30, 75, 'residential'],
      ['荒川', 2000, 3400, 700, 700, 60, 30, 70, 'residential'],
      ['中央区南部', 2200, -800, 600, 600, 65, 50, 110, 'commercial'],

      // ===== 多摩地域（西部）=====
      ['調布', -5200, -600, 800, 800, 55, 25, 60, 'residential'],
      ['府中', -5600, 200, 800, 800, 55, 30, 65, 'residential'],
      ['町田', -4000, -3000, 900, 900, 60, 30, 75, 'residential'],
      ['八王子', -6200, -1200, 1000, 1000, 65, 30, 80, 'residential'],
      ['多摩', -5800, 1400, 800, 800, 50, 25, 60, 'residential'],
      ['国分寺', -5200, 1800, 700, 700, 50, 30, 65, 'residential'],
      ['小平', -5000, 3000, 700, 700, 50, 25, 55, 'residential'],
      ['東村山', -4800, 4200, 700, 700, 50, 25, 55, 'residential'],

      // ===== 東部（千葉寄り）=====
      ['小岩', 5400, 1800, 800, 800, 55, 25, 65, 'residential'],
      ['亀戸', 3600, 600, 600, 600, 60, 35, 75, 'residential'],
      ['押上', 3400, 1400, 500, 500, 65, 40, 90, 'residential'],

      // ===== 北部 =====
      ['赤羽', 800, 4800, 700, 700, 55, 35, 80, 'commercial'],
      ['王子', 1200, 3600, 600, 600, 55, 30, 75, 'residential'],
      ['西新井', 2400, 4800, 800, 800, 55, 30, 70, 'residential'],

      // ===== 南西部 =====
      ['蒲田', 2400, -3200, 800, 800, 65, 35, 85, 'commercial'],
      ['武蔵小杉', -800, -2800, 600, 600, 70, 60, 140, 'modern'],
      ['二子玉川', -2000, -2400, 600, 600, 60, 45, 95, 'shopping'],
      ['成城学園', -3400, -1600, 700, 700, 55, 30, 65, 'residential']
    ]

    for (const [name, cx, cz, rangeX, rangeZ, count, minH, maxH, type] of districts) {
      this.createDistrictBuildings(name, cx, cz, rangeX, rangeZ, count, minH, maxH, type)
    }

    console.log(`✅ 建物作成完了: ${this.buildingMeshes.length}棟`)
  }

  /**
   * 窓テクスチャを生成（オフィスビル用）
   */
  private createWindowTexture(buildingType: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const ctx = canvas.getContext('2d')!

    // 建物タイプごとの窓の配置と色
    const windowConfig = {
      office: { rows: 12, cols: 8, spacing: 4, lightColor: '#b0d0ff', darkColor: '#304050' },
      financial: { rows: 14, cols: 10, spacing: 3, lightColor: '#c8e0ff', darkColor: '#203040' },
      commercial: { rows: 10, cols: 6, spacing: 5, lightColor: '#ffe0a0', darkColor: '#403020' },
      residential: { rows: 8, cols: 5, spacing: 6, lightColor: '#ffd080', darkColor: '#302820' }
    }

    const config = windowConfig[buildingType as keyof typeof windowConfig] || windowConfig.office

    // 背景（建物の壁）
    ctx.fillStyle = '#808890'
    ctx.fillRect(0, 0, 256, 256)

    // 窓を描画
    const windowW = (256 - config.spacing * (config.cols + 1)) / config.cols
    const windowH = (256 - config.spacing * (config.rows + 1)) / config.rows

    for (let row = 0; row < config.rows; row++) {
      for (let col = 0; col < config.cols; col++) {
        const x = config.spacing + col * (windowW + config.spacing)
        const y = config.spacing + row * (windowH + config.spacing)

        // ランダムに点灯/消灯
        const isLit = Math.random() > 0.3
        ctx.fillStyle = isLit ? config.lightColor : config.darkColor
        ctx.fillRect(x, y, windowW, windowH)
      }
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    return texture
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

      // テクスチャ付きマテリアルを作成（高さ80m以上のビルのみ）
      let material: THREE.Material
      if (height > 80) {
        const baseMat = materials[Math.floor(Math.random() * materials.length)]
        const texture = this.createWindowTexture(type)
        texture.repeat.set(width / 30, height / 40)
        material = new THREE.MeshStandardMaterial({
          color: baseMat.color,
          map: texture,
          roughness: baseMat.roughness,
          metalness: baseMat.metalness
        })
      } else {
        material = materials[Math.floor(Math.random() * materials.length)]
      }

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
   * 大通り（飛行用道路）上かどうかの判定（幅30m→60mに拡大）
   */
  private isOnMajorRoad(x: number, z: number): boolean {
    const distFromCenter = Math.sqrt(x * x + z * z)

    // 環状道路チェック（幅を2倍に拡大 - 飛行しやすく）
    if (Math.abs(distFromCenter - 2000) < 160) return true
    if (Math.abs(distFromCenter - 3500) < 180) return true
    if (Math.abs(distFromCenter - 5000) < 200) return true

    // 放射道路チェック（12方向・幅を2倍に拡大）
    const angle = Math.atan2(z, x)
    for (let i = 0; i < 12; i++) {
      const roadAngle = (i / 12) * Math.PI * 2
      const angleDiff = Math.abs(((angle - roadAngle + Math.PI) % (Math.PI * 2)) - Math.PI)
      if (angleDiff < 0.16 && distFromCenter < 6000) return true
    }

    return false
  }

  getTerrainHeight(x: number, z: number): number {
    // 実際の東京の地形高低を返す
    let height = 20  // 基準高度（皇居）

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

  /**
   * 大規模公園と樹木を配置
   */
  private createMajorParks(): void {
    const parks = [
      { name: '新宿御苑', x: -1500, z: 500, w: 580, h: 350, trees: 150 },
      { name: '代々木公園', x: -800, z: 200, w: 540, h: 400, trees: 180 },
      { name: '井の頭公園', x: -4500, z: 400, w: 430, h: 380, trees: 140 },
      { name: '砧公園', x: -3200, z: -1800, w: 600, h: 500, trees: 160 },
      { name: '光が丘公園', x: -4600, z: 3400, w: 600, h: 500, trees: 150 },
      { name: '石神井公園', x: -4800, z: 3800, w: 400, h: 380, trees: 130 },
      { name: '善福寺公園', x: -3800, z: 800, w: 350, h: 320, trees: 100 },
      { name: '駒沢オリンピック公園', x: -1400, z: -2200, w: 500, h: 480, trees: 120 },
      { name: '林試の森公園', x: 400, z: -2000, w: 380, h: 320, trees: 110 },
      { name: '水元公園', x: 5000, z: 3200, w: 700, h: 600, trees: 180 },
      { name: '舎人公園', x: 2400, z: 5000, w: 600, h: 550, trees: 150 },
      { name: '葛西臨海公園', x: 5600, z: -1800, w: 800, h: 700, trees: 160 },
      { name: '小金井公園', x: -5400, z: 2200, w: 700, h: 600, trees: 170 },
      { name: '府中の森公園', x: -5800, z: 400, w: 500, h: 450, trees: 130 },
      { name: '野川公園', x: -5000, z: 0, w: 450, h: 400, trees: 120 }
    ]

    const treeTrunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.85 })
    const treeFoliageMat = new THREE.MeshStandardMaterial({ color: 0x2a5520, roughness: 0.7 })

    for (const park of parks) {
      // 公園の地面（芝生）
      const parkGround = new THREE.Mesh(
        new THREE.PlaneGeometry(park.w, park.h),
        new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.9 })
      )
      parkGround.rotateX(-Math.PI / 2)
      const parkY = this.getTerrainHeight(park.x, park.z)
      parkGround.position.set(park.x, parkY + 0.5, park.z)
      parkGround.receiveShadow = true
      parkGround.name = `Park_${park.name}_Ground`
      this.scene.add(parkGround)

      // 樹木を配置
      for (let i = 0; i < park.trees; i++) {
        const treeX = park.x + (Math.random() - 0.5) * park.w * 0.9
        const treeZ = park.z + (Math.random() - 0.5) * park.h * 0.9
        const treeY = this.getTerrainHeight(treeX, treeZ)
        const treeHeight = 8 + Math.random() * 6

        const tree = new THREE.Group()

        // 幹
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.45, treeHeight * 0.35, 6),
          treeTrunkMat
        )
        trunk.position.y = treeHeight * 0.175
        trunk.castShadow = true
        tree.add(trunk)

        // 葉（3段の円錐）
        for (let j = 0; j < 3; j++) {
          const foliage = new THREE.Mesh(
            new THREE.ConeGeometry(treeHeight * 0.18, treeHeight * 0.28, 8),
            treeFoliageMat
          )
          foliage.position.y = treeHeight * (0.4 + j * 0.18)
          foliage.castShadow = true
          tree.add(foliage)
        }

        tree.position.set(treeX, treeY, treeZ)
        tree.name = `Tree_${park.name}_${i}`
        this.scene.add(tree)
      }
    }

    console.log(`✅ 大規模公園作成完了: ${parks.length}箇所、樹木${parks.reduce((sum, p) => sum + p.trees, 0)}本`)
  }

  /**
   * 東京のランドマーク建造物を追加
   */
  private createLandmarks(): void {
    // 東京タワー（赤と白のツートン）
    this.createTokyoTower()

    // スカイツリー（銀色）
    this.createSkytree()

    // 浅草寺（伝統的な赤）
    this.createSensoji()

    // 皇居（緑と伝統建築）
    this.createImperialPalace()
  }

  private createTokyoTower(): void {
    const x = 800, z = -800  // 六本木近く
    const group = new THREE.Group()

    // 鉄骨構造を模した4本の脚
    const redMat = new THREE.MeshStandardMaterial({
      color: 0xff5533,
      emissive: 0xff2200,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.7
    })
    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.6
    })

    // 下部（赤）0-150m
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      const legX = Math.cos(angle) * 25
      const legZ = Math.sin(angle) * 25
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 150, 6), redMat)
      leg.position.set(legX, 75, legZ)
      group.add(leg)
      this.buildingMeshes.push(leg)
    }

    // 中部（白）150-250m
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2
      const legX = Math.cos(angle) * 15
      const legZ = Math.sin(angle) * 15
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 100, 6), whiteMat)
      leg.position.set(legX, 200, legZ)
      group.add(leg)
      this.buildingMeshes.push(leg)
    }

    // 大展望台（150m地点）
    const mainDeck = new THREE.Mesh(new THREE.CylinderGeometry(18, 22, 15, 8), redMat)
    mainDeck.position.y = 150
    group.add(mainDeck)
    this.buildingMeshes.push(mainDeck)

    // 特別展望台（250m地点）
    const specialDeck = new THREE.Mesh(new THREE.CylinderGeometry(12, 14, 12, 8), whiteMat)
    specialDeck.position.y = 250
    group.add(specialDeck)
    this.buildingMeshes.push(specialDeck)

    // アンテナ（赤）250-333m
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1, 83, 6), redMat)
    antenna.position.y = 291.5
    group.add(antenna)
    this.buildingMeshes.push(antenna)

    // 横梁（トラス構造を模擬）
    for (let h = 30; h < 250; h += 40) {
      const beam = new THREE.Mesh(
        new THREE.TorusGeometry(h < 150 ? 22 : 16, 0.8, 4, 8),
        h < 150 ? redMat : whiteMat
      )
      beam.rotation.x = Math.PI / 2
      beam.position.y = h
      group.add(beam)
      this.buildingMeshes.push(beam)
    }

    group.position.set(x, 0, z)
    this.scene.add(group)
  }

  private createSkytree(): void {
    const x = 4000, z = 1500  // 墨田区方面
    const group = new THREE.Group()

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xc8d0d8,
      roughness: 0.15,
      metalness: 0.85
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xe0f0ff,
      emissive: 0x4488cc,
      emissiveIntensity: 0.5,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.9
    })

    // 三角形断面のタワー本体（3セクション）
    // 下部 0-350m
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2
      const baseX = Math.cos(angle) * 20
      const baseZ = Math.sin(angle) * 20
      const topX = Math.cos(angle) * 10
      const topZ = Math.sin(angle) * 10

      const geometry = new THREE.CylinderGeometry(2, 3, 350, 6)
      const pillar = new THREE.Mesh(geometry, baseMat)
      pillar.position.set((baseX + topX) / 2, 175, (baseZ + topZ) / 2)

      pillar.rotation.z = Math.atan2(topX - baseX, 350) * 0.3

      group.add(pillar)
      this.buildingMeshes.push(pillar)
    }

    // 第一展望台（天望デッキ 350m）
    const deck1 = new THREE.Mesh(new THREE.CylinderGeometry(15, 18, 30, 8), glassMat)
    deck1.position.y = 350
    group.add(deck1)
    this.buildingMeshes.push(deck1)

    // 中部 350-450m
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2
      const x1 = Math.cos(angle) * 10
      const z1 = Math.sin(angle) * 10
      const x2 = Math.cos(angle) * 6
      const z2 = Math.sin(angle) * 6

      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2, 100, 6), baseMat)
      pillar.position.set((x1 + x2) / 2, 400, (z1 + z2) / 2)
      group.add(pillar)
      this.buildingMeshes.push(pillar)
    }

    // 第二展望台（天望回廊 450m）
    const deck2 = new THREE.Mesh(new THREE.CylinderGeometry(12, 14, 25, 8), glassMat)
    deck2.position.y = 450
    group.add(deck2)
    this.buildingMeshes.push(deck2)

    // 上部 450-634m（アンテナ含む）
    const topSection = new THREE.Mesh(new THREE.CylinderGeometry(1, 6, 184, 8), baseMat)
    topSection.position.y = 542
    group.add(topSection)
    this.buildingMeshes.push(topSection)

    // 避雷針
    const lightning = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 20, 6), baseMat)
    lightning.position.y = 644
    group.add(lightning)
    this.buildingMeshes.push(lightning)

    // 装飾リング
    for (let h = 100; h < 500; h += 80) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(h / 30, 0.5, 6, 12),
        baseMat
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = h
      group.add(ring)
      this.buildingMeshes.push(ring)
    }

    group.position.set(x, 0, z)
    this.scene.add(group)
  }

  private createSensoji(): void {
    const x = 3500, z = 2000  // 浅草
    const group = new THREE.Group()

    const redMat = new THREE.MeshStandardMaterial({ color: 0xbb2222, roughness: 0.6 })
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 })
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      emissive: 0xaa8800,
      emissiveIntensity: 0.3,
      roughness: 0.3,
      metalness: 0.8
    })
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x654321, roughness: 0.85 })

    // === 雷門 ===
    // 門柱
    for (const px of [-12, 12]) {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 20, 8), redMat)
      pillar.position.set(px, 10, 80)
      group.add(pillar)
      this.buildingMeshes.push(pillar)
    }
    // 雷門屋根
    const gateRoof = new THREE.Mesh(new THREE.ConeGeometry(22, 8, 4), roofMat)
    gateRoof.position.set(0, 24, 80)
    gateRoof.rotation.y = Math.PI / 4
    group.add(gateRoof)
    this.buildingMeshes.push(gateRoof)

    // 大提灯（雷門）
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 12, 16), redMat)
    lantern.position.set(0, 14, 80)
    group.add(lantern)
    this.buildingMeshes.push(lantern)

    // === 五重塔 ===
    const pagodaX = -60
    for (let i = 0; i < 5; i++) {
      const size = 12 - i * 1.5
      const height = 8
      const y = 4 + i * 9

      // 各層
      const floor = new THREE.Mesh(new THREE.BoxGeometry(size, height, size), redMat)
      floor.position.set(pagodaX, y, -20)
      group.add(floor)
      this.buildingMeshes.push(floor)

      // 各層の屋根
      const roof = new THREE.Mesh(new THREE.ConeGeometry(size * 0.8, 4, 4), roofMat)
      roof.position.set(pagodaX, y + height / 2 + 2, -20)
      roof.rotation.y = Math.PI / 4
      group.add(roof)
      this.buildingMeshes.push(roof)
    }

    // 相輪（塔の先端）
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, 10, 8), goldMat)
    spire.position.set(pagodaX, 52, -20)
    group.add(spire)
    this.buildingMeshes.push(spire)

    // === 本堂 ===
    // 基壇
    const platform = new THREE.Mesh(new THREE.BoxGeometry(90, 3, 70), woodMat)
    platform.position.set(0, 1.5, 0)
    group.add(platform)
    this.buildingMeshes.push(platform)

    // 本堂建物
    const mainHall = new THREE.Mesh(new THREE.BoxGeometry(85, 30, 65), redMat)
    mainHall.position.set(0, 18, 0)
    group.add(mainHall)
    this.buildingMeshes.push(mainHall)

    // 本堂屋根（入母屋造り風）
    const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(60, 18, 4), roofMat)
    mainRoof.position.set(0, 42, 0)
    mainRoof.rotation.y = Math.PI / 4
    group.add(mainRoof)
    this.buildingMeshes.push(mainRoof)

    // 破風（屋根の装飾）
    const gable = new THREE.Mesh(new THREE.BoxGeometry(40, 8, 2), goldMat)
    gable.position.set(0, 38, 33)
    group.add(gable)
    this.buildingMeshes.push(gable)

    // 柱（本堂前）
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 30, 8), redMat)
      pillar.position.set(i * 12, 15, 35)
      group.add(pillar)
      this.buildingMeshes.push(pillar)
    }

    group.position.set(x, 0, z)
    this.scene.add(group)
  }

  private createImperialPalace(): void {
    const x = 1200, z = 1500  // 千代田区
    const group = new THREE.Group()

    const parkMat = new THREE.MeshStandardMaterial({ color: 0x2a5520, roughness: 0.9 })
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x334455,
      roughness: 0.2,
      metalness: 0.6
    })
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.4 })
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x4a7c59,
      roughness: 0.5,
      metalness: 0.4
    })
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 })

    // 外堀（お堀）
    const moat = new THREE.Mesh(new THREE.TorusGeometry(220, 30, 8, 32), waterMat)
    moat.rotation.x = Math.PI / 2
    moat.position.y = -2
    group.add(moat)
    this.buildingMeshes.push(moat)

    // 石垣
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2
      const wallX = Math.cos(angle) * 190
      const wallZ = Math.sin(angle) * 190
      const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 10), stoneMat)
      wall.position.set(wallX, 6, wallZ)
      wall.rotation.y = angle
      group.add(wall)
      this.buildingMeshes.push(wall)
    }

    // 内苑の緑地
    const innerPark = new THREE.Mesh(new THREE.CylinderGeometry(180, 180, 3, 32), parkMat)
    innerPark.position.y = 1.5
    group.add(innerPark)
    this.buildingMeshes.push(innerPark)

    // === 宮殿（本体） ===
    // 中央棟
    const centralWing = new THREE.Mesh(new THREE.BoxGeometry(70, 18, 50), wallMat)
    centralWing.position.y = 9
    group.add(centralWing)
    this.buildingMeshes.push(centralWing)

    // 中央棟の屋根
    const centralRoof = new THREE.Mesh(new THREE.ConeGeometry(45, 15, 4), roofMat)
    centralRoof.position.y = 26
    centralRoof.rotation.y = Math.PI / 4
    group.add(centralRoof)
    this.buildingMeshes.push(centralRoof)

    // 東西の翼棟
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(40, 15, 35), wallMat)
      wing.position.set(side * 55, 7.5, 0)
      group.add(wing)
      this.buildingMeshes.push(wing)

      const wingRoof = new THREE.Mesh(new THREE.ConeGeometry(28, 10, 4), roofMat)
      wingRoof.position.set(side * 55, 20, 0)
      wingRoof.rotation.y = Math.PI / 4
      group.add(wingRoof)
      this.buildingMeshes.push(wingRoof)
    }

    // 渡り廊下
    for (const side of [-1, 1]) {
      const corridor = new THREE.Mesh(new THREE.BoxGeometry(15, 8, 15), wallMat)
      corridor.position.set(side * 25, 4, 0)
      group.add(corridor)
      this.buildingMeshes.push(corridor)
    }

    // === 二重橋（有名な石橋） ===
    const bridgeZ = 190
    const bridge1 = new THREE.Mesh(new THREE.BoxGeometry(50, 3, 25), stoneMat)
    bridge1.position.set(0, 1.5, bridgeZ)
    group.add(bridge1)
    this.buildingMeshes.push(bridge1)

    // 橋の欄干
    for (const side of [-1, 1]) {
      const railing = new THREE.Mesh(new THREE.BoxGeometry(50, 2, 1), stoneMat)
      railing.position.set(0, 3, bridgeZ + side * 12)
      group.add(railing)
      this.buildingMeshes.push(railing)
    }

    // === 桜の木（簡易表現） ===
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const treeX = Math.cos(angle) * 140
      const treeZ = Math.sin(angle) * 140

      // 幹
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1, 2, 15, 6), stoneMat)
      trunk.position.set(treeX, 7.5, treeZ)
      group.add(trunk)
      this.buildingMeshes.push(trunk)

      // 桜の葉（ピンク）
      const foliage = new THREE.Mesh(
        new THREE.SphereGeometry(8, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffb0c0, roughness: 0.9 })
      )
      foliage.position.set(treeX, 18, treeZ)
      group.add(foliage)
      this.buildingMeshes.push(foliage)
    }

    group.position.set(x, 0, z)
    this.scene.add(group)
  }
}
