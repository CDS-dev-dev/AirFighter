/**
 * コレクティブルシステム
 * MAP各所に配置された「記憶の欠片」を収集
 */

import * as THREE from 'three'

export interface Collectible {
  id: string
  mapName: 'original' | 'tokyo' | 'space'
  position: { x: number; y: number; z: number }
  difficulty: 'easy' | 'medium' | 'hard' | 'expert'
  lore: string
  collected: boolean
}

export interface CollectionProgress {
  total: number
  collected: number
  byMap: {
    original: { total: number; collected: number }
    tokyo: { total: number; collected: number }
    space: { total: number; collected: number }
  }
  byDifficulty: {
    easy: { total: number; collected: number }
    medium: { total: number; collected: number }
    hard: { total: number; collected: number }
    expert: { total: number; collected: number }
  }
}

export class CollectibleSystem {
  private collectibles: Collectible[] = []
  private meshes: Map<string, THREE.Mesh> = new Map()
  private scene: THREE.Scene
  private checkRadius = 30 // 取得判定距離

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.loadProgress()
  }

  /**
   * コレクティブルを初期化
   */
  initialize(mapName: 'original' | 'tokyo' | 'space') {
    // 既存メッシュをクリア
    this.meshes.forEach((mesh) => this.scene.remove(mesh))
    this.meshes.clear()

    // 該当MAPのコレクティブルのみロード
    const mapCollectibles = this.collectibles.filter((c) => c.mapName === mapName && !c.collected)

    // メッシュ生成
    mapCollectibles.forEach((collectible) => {
      const mesh = this.createCollectibleMesh(collectible)
      this.meshes.set(collectible.id, mesh)
      this.scene.add(mesh)
    })
  }

  /**
   * コレクティブルメッシュ作成
   */
  private createCollectibleMesh(collectible: Collectible): THREE.Mesh {
    // 半透明の光る球体
    const geometry = new THREE.SphereGeometry(5, 16, 16)
    const material = new THREE.MeshStandardMaterial({
      color: this.getDifficultyColor(collectible.difficulty),
      transparent: true,
      opacity: 0.6,
      emissive: this.getDifficultyColor(collectible.difficulty),
      emissiveIntensity: 0.8,
      roughness: 0.3,
      metalness: 0.1,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(collectible.position.x, collectible.position.y, collectible.position.z)
    mesh.userData.collectibleId = collectible.id

    return mesh
  }

  /**
   * 難易度別の色
   */
  private getDifficultyColor(difficulty: Collectible['difficulty']): THREE.Color {
    switch (difficulty) {
      case 'easy':
        return new THREE.Color(0x00ff00) // 緑
      case 'medium':
        return new THREE.Color(0xffff00) // 黄
      case 'hard':
        return new THREE.Color(0xff8800) // オレンジ
      case 'expert':
        return new THREE.Color(0xff0000) // 赤
    }
  }

  /**
   * 毎フレーム更新（回転・パルス）
   */
  update(deltaTime: number) {
    const time = Date.now() * 0.001

    this.meshes.forEach((mesh) => {
      // 回転
      mesh.rotation.y += deltaTime * 0.5

      // パルス発光（1秒周期）
      const pulse = Math.sin(time * Math.PI * 2) * 0.3 + 0.7
      const material = mesh.material as THREE.MeshStandardMaterial
      material.opacity = pulse * 0.6
    })
  }

  /**
   * プレイヤー位置チェック＆取得判定
   */
  checkCollection(playerPosition: THREE.Vector3): Collectible | null {
    for (const [id, mesh] of this.meshes.entries()) {
      const distance = playerPosition.distanceTo(mesh.position)
      if (distance < this.checkRadius) {
        // 取得処理
        const collectible = this.collectibles.find((c) => c.id === id)
        if (collectible && !collectible.collected) {
          this.collect(collectible)
          return collectible
        }
      }
    }
    return null
  }

  /**
   * 取得処理
   */
  private collect(collectible: Collectible) {
    collectible.collected = true

    // メッシュを削除
    const mesh = this.meshes.get(collectible.id)
    if (mesh) {
      this.scene.remove(mesh)
      this.meshes.delete(collectible.id)
    }

    // 進捗保存
    this.saveProgress()

    // パーティクルエフェクト（TODO: 実装）
    console.log(`✅ Collected: ${collectible.id} - ${collectible.lore}`)
  }

  /**
   * 進捗取得
   */
  getProgress(): CollectionProgress {
    const total = this.collectibles.length
    const collected = this.collectibles.filter((c) => c.collected).length

    const byMap = {
      original: {
        total: this.collectibles.filter((c) => c.mapName === 'original').length,
        collected: this.collectibles.filter((c) => c.mapName === 'original' && c.collected).length,
      },
      tokyo: {
        total: this.collectibles.filter((c) => c.mapName === 'tokyo').length,
        collected: this.collectibles.filter((c) => c.mapName === 'tokyo' && c.collected).length,
      },
      space: {
        total: this.collectibles.filter((c) => c.mapName === 'space').length,
        collected: this.collectibles.filter((c) => c.mapName === 'space' && c.collected).length,
      },
    }

    const byDifficulty = {
      easy: {
        total: this.collectibles.filter((c) => c.difficulty === 'easy').length,
        collected: this.collectibles.filter((c) => c.difficulty === 'easy' && c.collected).length,
      },
      medium: {
        total: this.collectibles.filter((c) => c.difficulty === 'medium').length,
        collected: this.collectibles.filter((c) => c.difficulty === 'medium' && c.collected).length,
      },
      hard: {
        total: this.collectibles.filter((c) => c.difficulty === 'hard').length,
        collected: this.collectibles.filter((c) => c.difficulty === 'hard' && c.collected).length,
      },
      expert: {
        total: this.collectibles.filter((c) => c.difficulty === 'expert').length,
        collected: this.collectibles.filter((c) => c.difficulty === 'expert' && c.collected).length,
      },
    }

    return { total, collected, byMap, byDifficulty }
  }

  /**
   * 進捗をLocalStorageに保存
   */
  private saveProgress() {
    const collectedIds = this.collectibles.filter((c) => c.collected).map((c) => c.id)
    localStorage.setItem('airfighter_collectibles', JSON.stringify(collectedIds))
  }

  /**
   * 進捗をLocalStorageから読み込み
   */
  private loadProgress() {
    const saved = localStorage.getItem('airfighter_collectibles')
    const collectedIds: string[] = saved ? JSON.parse(saved) : []

    // コレクティブルデータ読み込み
    this.collectibles = this.loadCollectiblesData()

    // 収集済みフラグをセット
    this.collectibles.forEach((c) => {
      c.collected = collectedIds.includes(c.id)
    })
  }

  /**
   * コレクティブルデータ読み込み
   */
  private loadCollectiblesData(): Collectible[] {
    return [
      // Original MAP（20個）
      // Easy（8個）
      {
        id: 'ori_001',
        mapName: 'original',
        position: { x: -500, y: 50, z: 300 },
        difficulty: 'easy',
        lore: '古代文明の記憶：この地には かつて高度な文明が栄えていた',
        collected: false,
      },
      {
        id: 'ori_002',
        mapName: 'original',
        position: { x: 400, y: 60, z: -600 },
        difficulty: 'easy',
        lore: '古代文明の記憶：彼らは自然と調和する技術を持っていた',
        collected: false,
      },
      {
        id: 'ori_003',
        mapName: 'original',
        position: { x: -800, y: 40, z: -400 },
        difficulty: 'easy',
        lore: '古代文明の記憶：奇岩は神殿として崇められていた',
        collected: false,
      },
      {
        id: 'ori_004',
        mapName: 'original',
        position: { x: 700, y: 55, z: 500 },
        difficulty: 'easy',
        lore: '古代文明の記憶：自然橋は聖なる道として使われた',
        collected: false,
      },
      {
        id: 'ori_005',
        mapName: 'original',
        position: { x: -200, y: 45, z: 900 },
        difficulty: 'easy',
        lore: '古代文明の記憶：水は生命の源であり、儀式の場だった',
        collected: false,
      },
      {
        id: 'ori_006',
        mapName: 'original',
        position: { x: 900, y: 70, z: -200 },
        difficulty: 'easy',
        lore: '古代文明の記憶：峡谷には神秘的な力が宿ると信じられていた',
        collected: false,
      },
      {
        id: 'ori_007',
        mapName: 'original',
        position: { x: -600, y: 35, z: 700 },
        difficulty: 'easy',
        lore: '古代文明の記憶：森には守護霊が住むと伝えられていた',
        collected: false,
      },
      {
        id: 'ori_008',
        mapName: 'original',
        position: { x: 300, y: 80, z: -900 },
        difficulty: 'easy',
        lore: '古代文明の記憶：彼らは突然姿を消した。理由は不明。',
        collected: false,
      },

      // Medium（7個）
      {
        id: 'ori_009',
        mapName: 'original',
        position: { x: 920, y: 400, z: 100 },
        difficulty: 'medium',
        lore: '奇岩の記憶：この岩は何千年もの風雨に耐えてきた',
        collected: false,
      },
      {
        id: 'ori_010',
        mapName: 'original',
        position: { x: 905, y: 350, z: -200 },
        difficulty: 'medium',
        lore: '奇岩の記憶：岩肌には古代の文字が刻まれている',
        collected: false,
      },
      {
        id: 'ori_011',
        mapName: 'original',
        position: { x: 935, y: 300, z: -480 },
        difficulty: 'medium',
        lore: '奇岩の記憶：頂上には祭壇の跡がある',
        collected: false,
      },
      {
        id: 'ori_012',
        mapName: 'original',
        position: { x: -300, y: 250, z: 600 },
        difficulty: 'medium',
        lore: '自然橋の記憶：橋の下を風が吹き抜ける音は聖歌に似ている',
        collected: false,
      },
      {
        id: 'ori_013',
        mapName: 'original',
        position: { x: 400, y: 200, z: -700 },
        difficulty: 'medium',
        lore: '中腹の記憶：ここから見る景色は絶景だった',
        collected: false,
      },
      {
        id: 'ori_014',
        mapName: 'original',
        position: { x: -700, y: 280, z: -300 },
        difficulty: 'medium',
        lore: '中腹の記憶：まばらな木々は高地の厳しさを物語る',
        collected: false,
      },
      {
        id: 'ori_015',
        mapName: 'original',
        position: { x: 500, y: 320, z: 800 },
        difficulty: 'medium',
        lore: '中腹の記憶：この高さまで文明の痕跡が残る',
        collected: false,
      },

      // Hard（4個）
      {
        id: 'ori_016',
        mapName: 'original',
        position: { x: -300, y: 30, z: 600 },
        difficulty: 'hard',
        lore: '洞窟の記憶：暗闇の中で何かが光っていた',
        collected: false,
      },
      {
        id: 'ori_017',
        mapName: 'original',
        position: { x: -100, y: 25, z: -500 },
        difficulty: 'hard',
        lore: '洞窟の記憶：壁画には星空の地図が描かれている',
        collected: false,
      },
      {
        id: 'ori_018',
        mapName: 'original',
        position: { x: 50, y: 15, z: -250 },
        difficulty: 'hard',
        lore: '峡谷深部の記憶：ここは時が止まったような場所',
        collected: false,
      },
      {
        id: 'ori_019',
        mapName: 'original',
        position: { x: -80, y: 20, z: 100 },
        difficulty: 'hard',
        lore: '峡谷深部の記憶：水の流れる音だけが聞こえる',
        collected: false,
      },

      // Expert（1個）
      {
        id: 'ori_020',
        mapName: 'original',
        position: { x: 0, y: 1200, z: 0 },
        difficulty: 'expert',
        lore: 'タイタンピークの記憶：世界を見渡す者は真理を知る',
        collected: false,
      },

      // Tokyo MAP（25個）
      // Easy（10個）
      {
        id: 'tok_001',
        mapName: 'tokyo',
        position: { x: -1000, y: 100, z: 500 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：この街は一夜にして沈黙した',
        collected: false,
      },
      {
        id: 'tok_002',
        mapName: 'tokyo',
        position: { x: 800, y: 80, z: -700 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：人々は何かから逃げるように去った',
        collected: false,
      },
      {
        id: 'tok_003',
        mapName: 'tokyo',
        position: { x: -500, y: 90, z: -900 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：最後の放送は謎の警告だった',
        collected: false,
      },
      {
        id: 'tok_004',
        mapName: 'tokyo',
        position: { x: 1200, y: 70, z: 300 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：避難指示は混乱の中で出された',
        collected: false,
      },
      {
        id: 'tok_005',
        mapName: 'tokyo',
        position: { x: -1500, y: 95, z: -200 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：放棄された車両がすべてを物語る',
        collected: false,
      },
      {
        id: 'tok_006',
        mapName: 'tokyo',
        position: { x: 600, y: 85, z: 900 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：ヘリコプターは離陸できなかった',
        collected: false,
      },
      {
        id: 'tok_007',
        mapName: 'tokyo',
        position: { x: -800, y: 75, z: 700 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：高架道路は脱出ルートだった',
        collected: false,
      },
      {
        id: 'tok_008',
        mapName: 'tokyo',
        position: { x: 1500, y: 100, z: -500 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：ビルの明かりが一斉に消えた',
        collected: false,
      },
      {
        id: 'tok_009',
        mapName: 'tokyo',
        position: { x: -1200, y: 65, z: -600 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：緊急警報が鳴り響いた',
        collected: false,
      },
      {
        id: 'tok_010',
        mapName: 'tokyo',
        position: { x: 300, y: 110, z: -1000 },
        difficulty: 'easy',
        lore: 'ネオ東京の記憶：誰もが空を見上げていた',
        collected: false,
      },

      // Medium（10個）
      {
        id: 'tok_011',
        mapName: 'tokyo',
        position: { x: 0, y: 300, z: 0 },
        difficulty: 'medium',
        lore: 'メガタワーの記憶：最上階には秘密の研究施設があった',
        collected: false,
      },
      {
        id: 'tok_012',
        mapName: 'tokyo',
        position: { x: -600, y: 250, z: 400 },
        difficulty: 'medium',
        lore: '高層ビルの記憶：屋上ヘリポートに人々が集まった',
        collected: false,
      },
      {
        id: 'tok_013',
        mapName: 'tokyo',
        position: { x: 800, y: 280, z: -600 },
        difficulty: 'medium',
        lore: '高層ビルの記憶：窓から見える光景は悪夢だった',
        collected: false,
      },
      {
        id: 'tok_014',
        mapName: 'tokyo',
        position: { x: -1000, y: 180, z: -1500 },
        difficulty: 'medium',
        lore: '高架道路の記憶：渋滞の中で時間だけが過ぎた',
        collected: false,
      },
      {
        id: 'tok_015',
        mapName: 'tokyo',
        position: { x: 1500, y: 180, z: 0 },
        difficulty: 'medium',
        lore: '高架道路の記憶：ここから見る都市は美しかった',
        collected: false,
      },
      {
        id: 'tok_016',
        mapName: 'tokyo',
        position: { x: -400, y: 200, z: 900 },
        difficulty: 'medium',
        lore: '円筒ビルの記憶：360度の展望が自慢だった',
        collected: false,
      },
      {
        id: 'tok_017',
        mapName: 'tokyo',
        position: { x: 1200, y: 220, z: 600 },
        difficulty: 'medium',
        lore: '円筒ビルの記憶：回転レストランは営業中だった',
        collected: false,
      },
      {
        id: 'tok_018',
        mapName: 'tokyo',
        position: { x: -1400, y: 150, z: 300 },
        difficulty: 'medium',
        lore: '周辺部の記憶：低層ビルには生活の痕跡が残る',
        collected: false,
      },
      {
        id: 'tok_019',
        mapName: 'tokyo',
        position: { x: 700, y: 160, z: -1200 },
        difficulty: 'medium',
        lore: '周辺部の記憶：日常は突然終わりを告げた',
        collected: false,
      },
      {
        id: 'tok_020',
        mapName: 'tokyo',
        position: { x: -900, y: 190, z: -800 },
        difficulty: 'medium',
        lore: '周辺部の記憶：住民は何も持たずに避難した',
        collected: false,
      },

      // Hard（4個）
      {
        id: 'tok_021',
        mapName: 'tokyo',
        position: { x: 0, y: 500, z: 0 },
        difficulty: 'hard',
        lore: 'メガタワー展望台の記憶：ここから真実が見えた',
        collected: false,
      },
      {
        id: 'tok_022',
        mapName: 'tokyo',
        position: { x: 50, y: 5, z: -50 },
        difficulty: 'hard',
        lore: '地下の記憶：シェルターは満員だった',
        collected: false,
      },
      {
        id: 'tok_023',
        mapName: 'tokyo',
        position: { x: -1500, y: 180, z: -1500 },
        difficulty: 'hard',
        lore: 'ジャンクションの記憶：ここで道は分かれた',
        collected: false,
      },
      {
        id: 'tok_024',
        mapName: 'tokyo',
        position: { x: 1500, y: 180, z: 1500 },
        difficulty: 'hard',
        lore: '外周高架の記憶：最後の脱出ルート',
        collected: false,
      },

      // Expert（1個）
      {
        id: 'tok_025',
        mapName: 'tokyo',
        position: { x: 0, y: 750, z: 0 },
        difficulty: 'expert',
        lore: 'メガタワー最上階の記憶：すべての答えがここにある',
        collected: false,
      },

      // Space MAP（30個）
      // Easy（12個）
      {
        id: 'spa_001',
        mapName: 'space',
        position: { x: -500, y: 200, z: -800 },
        difficulty: 'easy',
        lore: '宇宙戦争の記憶：最初の攻撃は予期せぬものだった',
        collected: false,
      },
      {
        id: 'spa_002',
        mapName: 'space',
        position: { x: 800, y: -300, z: 600 },
        difficulty: 'easy',
        lore: '宇宙戦争の記憶：防衛艦隊は瞬く間に壊滅した',
        collected: false,
      },
      {
        id: 'spa_003',
        mapName: 'space',
        position: { x: -1000, y: 400, z: 1000 },
        difficulty: 'easy',
        lore: '宇宙戦争の記憶：脱出ポッドが次々と射出された',
        collected: false,
      },
      {
        id: 'spa_004',
        mapName: 'space',
        position: { x: 1200, y: -500, z: -400 },
        difficulty: 'easy',
        lore: '宇宙戦争の記憶：通信は混乱し、指揮系統は崩壊した',
        collected: false,
      },
      {
        id: 'spa_005',
        mapName: 'space',
        position: { x: -1500, y: 100, z: -1000 },
        difficulty: 'easy',
        lore: '採掘コロニーの記憶：労働者たちは避難できなかった',
        collected: false,
      },
      {
        id: 'spa_006',
        mapName: 'space',
        position: { x: 1000, y: -200, z: 800 },
        difficulty: 'easy',
        lore: '小惑星帯の記憶：資源は豊富だったが、今は墓場だ',
        collected: false,
      },
      {
        id: 'spa_007',
        mapName: 'space',
        position: { x: -800, y: 400, z: 1200 },
        difficulty: 'easy',
        lore: '建造現場の記憶：新しい希望が建造されていた',
        collected: false,
      },
      {
        id: 'spa_008',
        mapName: 'space',
        position: { x: 600, y: 300, z: -1500 },
        difficulty: 'easy',
        lore: '宇宙戦争の記憶：ミサイルの雨が降り注いだ',
        collected: false,
      },
      {
        id: 'spa_009',
        mapName: 'space',
        position: { x: -700, y: -600, z: 500 },
        difficulty: 'easy',
        lore: '宇宙戦争の記憶：爆発の光が宇宙を照らした',
        collected: false,
      },
      {
        id: 'spa_010',
        mapName: 'space',
        position: { x: 1400, y: 250, z: 200 },
        difficulty: 'easy',
        lore: '宇宙戦争の記憶：戦闘機パイロットは最後まで戦った',
        collected: false,
      },
      {
        id: 'spa_011',
        mapName: 'space',
        position: { x: -400, y: -400, z: -1200 },
        difficulty: 'easy',
        lore: '宇宙戦争の記憶：救難信号は途絶えた',
        collected: false,
      },
      {
        id: 'spa_012',
        mapName: 'space',
        position: { x: 900, y: 500, z: -900 },
        difficulty: 'easy',
        lore: '宇宙戦争の記憶：生存者はいないはずだった',
        collected: false,
      },

      // Medium（12個）
      {
        id: 'spa_013',
        mapName: 'space',
        position: { x: 0, y: 350, z: -2400 },
        difficulty: 'medium',
        lore: '軌道リングの記憶：ここは交易の中心だった',
        collected: false,
      },
      {
        id: 'spa_014',
        mapName: 'space',
        position: { x: -200, y: 350, z: -2200 },
        difficulty: 'medium',
        lore: 'リングステーションの記憶：回転が停止した時、すべてが終わった',
        collected: false,
      },
      {
        id: 'spa_015',
        mapName: 'space',
        position: { x: 300, y: 400, z: -2600 },
        difficulty: 'medium',
        lore: 'リングステーションの記憶：ドッキングポートは満員だった',
        collected: false,
      },
      {
        id: 'spa_016',
        mapName: 'space',
        position: { x: 2100, y: -200, z: -1600 },
        difficulty: 'medium',
        lore: '船墓場の記憶：破損した船体が集まる場所',
        collected: false,
      },
      {
        id: 'spa_017',
        mapName: 'space',
        position: { x: 2300, y: -150, z: -1700 },
        difficulty: 'medium',
        lore: '船墓場の記憶：残骸は戦争の証人',
        collected: false,
      },
      {
        id: 'spa_018',
        mapName: 'space',
        position: { x: 1900, y: -250, z: -1500 },
        difficulty: 'medium',
        lore: '船墓場の記憶：ここで多くの命が失われた',
        collected: false,
      },
      {
        id: 'spa_019',
        mapName: 'space',
        position: { x: -2300, y: -1800, z: -400 },
        difficulty: 'medium',
        lore: '採掘コロニーの記憶：資源採掘は続いていた',
        collected: false,
      },
      {
        id: 'spa_020',
        mapName: 'space',
        position: { x: 600, y: -800, z: -2400 },
        difficulty: 'medium',
        lore: '要塞の記憶：防衛ラインは突破された',
        collected: false,
      },
      {
        id: 'spa_021',
        mapName: 'space',
        position: { x: 300, y: 500, z: -800 },
        difficulty: 'medium',
        lore: 'アンテナの記憶：最後の通信は警告だった',
        collected: false,
      },
      {
        id: 'spa_022',
        mapName: 'space',
        position: { x: -500, y: -300, z: 1000 },
        difficulty: 'medium',
        lore: 'デブリ帯の記憶：かつてここに艦隊がいた',
        collected: false,
      },
      {
        id: 'spa_023',
        mapName: 'space',
        position: { x: 1100, y: 350, z: 500 },
        difficulty: 'medium',
        lore: '宇宙ステーションの記憶：避難は間に合わなかった',
        collected: false,
      },
      {
        id: 'spa_024',
        mapName: 'space',
        position: { x: -1200, y: -100, z: -600 },
        difficulty: 'medium',
        lore: '戦闘エリアの記憶：激戦の跡が残る',
        collected: false,
      },

      // Hard（5個）
      {
        id: 'spa_025',
        mapName: 'space',
        position: { x: 600, y: -700, z: -2400 },
        difficulty: 'hard',
        lore: '要塞内部の記憶：司令室は沈黙している',
        collected: false,
      },
      {
        id: 'spa_026',
        mapName: 'space',
        position: { x: 650, y: -850, z: -2450 },
        difficulty: 'hard',
        lore: '要塞深部の記憶：最後の防衛ラインがここだった',
        collected: false,
      },
      {
        id: 'spa_027',
        mapName: 'space',
        position: { x: -1450, y: 80, z: -1050 },
        difficulty: 'hard',
        lore: '小惑星クラスター深部の記憶：採掘機械が停止している',
        collected: false,
      },
      {
        id: 'spa_028',
        mapName: 'space',
        position: { x: 2200, y: -220, z: -1650 },
        difficulty: 'hard',
        lore: '船墓場中心部の記憶：ここが最も激しい戦場だった',
        collected: false,
      },
      {
        id: 'spa_029',
        mapName: 'space',
        position: { x: -750, y: 420, z: 1180 },
        difficulty: 'hard',
        lore: '建造現場深部の記憶：未完成の希望が眠る',
        collected: false,
      },

      // Expert（1個）
      {
        id: 'spa_030',
        mapName: 'space',
        position: { x: 0, y: -500, z: -3000 },
        difficulty: 'expert',
        lore: 'マザーシップの記憶：艦の中枢に すべての真実が記録されている',
        collected: false,
      },
    ]
  }
}
