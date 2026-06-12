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

      // ===== 追加コレクティブル（225個）=====
      // Original MAP追加（75個）- Easy 35, Medium 25, Hard 12, Expert 3

      // Easy（35個）
      { id: 'ori_021', mapName: 'original', position: { x: -100, y: 650, z: -2750 }, difficulty: 'easy', lore: 'Titan Peak：登山者たちの足跡が今も残る', collected: false },
      { id: 'ori_022', mapName: 'original', position: { x: 50, y: 850, z: -2800 }, difficulty: 'easy', lore: 'Titan Peak：頂上への道は険しくも美しい', collected: false },
      { id: 'ori_023', mapName: 'original', position: { x: -2100, y: 100, z: 1400 }, difficulty: 'easy', lore: 'Grand Canyon：大地の傷跡が歴史を語る', collected: false },
      { id: 'ori_024', mapName: 'original', position: { x: -1950, y: -100, z: 1600 }, difficulty: 'easy', lore: 'Grand Canyon：深淵の底に古代の秘密が', collected: false },
      { id: 'ori_025', mapName: 'original', position: { x: 1550, y: 200, z: -1050 }, difficulty: 'easy', lore: 'Great Waterfall：水の轟音が心を洗う', collected: false },
      { id: 'ori_026', mapName: 'original', position: { x: 2550, y: 380, z: 2050 }, difficulty: 'easy', lore: 'Natural Arch：自然の造形美に圧倒される', collected: false },
      { id: 'ori_027', mapName: 'original', position: { x: 550, y: 1010, z: -2450 }, difficulty: 'easy', lore: 'Alpine Lake：高山の湖は透明な鏡', collected: false },
      { id: 'ori_028', mapName: 'original', position: { x: 2450, y: 120, z: 350 }, difficulty: 'easy', lore: 'Jungle Heart：緑の王国に迷い込む', collected: false },
      { id: 'ori_029', mapName: 'original', position: { x: 250, y: 10, z: 2550 }, difficulty: 'easy', lore: 'Desert Oasis：砂漠の宝石、生命の源', collected: false },
      { id: 'ori_030', mapName: 'original', position: { x: -50, y: 1520, z: -2850 }, difficulty: 'easy', lore: 'Snow Temple：凍てついた祈りの場', collected: false },
      { id: 'ori_031', mapName: 'original', position: { x: -1200, y: 60, z: 800 }, difficulty: 'easy', lore: '森の記憶：木々が時の流れを記録する', collected: false },
      { id: 'ori_032', mapName: 'original', position: { x: 1100, y: 80, z: -700 }, difficulty: 'easy', lore: '峡谷の記憶：風が運ぶ古の歌', collected: false },
      { id: 'ori_033', mapName: 'original', position: { x: -1800, y: 45, z: -500 }, difficulty: 'easy', lore: '草原の記憶：広がる地平線の彼方へ', collected: false },
      { id: 'ori_034', mapName: 'original', position: { x: 1500, y: 70, z: 1200 }, difficulty: 'easy', lore: '丘陵の記憶：なだらかな起伏が続く', collected: false },
      { id: 'ori_035', mapName: 'original', position: { x: -800, y: 35, z: -1200 }, difficulty: 'easy', lore: '渓流の記憶：清らかな水の流れ', collected: false },
      { id: 'ori_036', mapName: 'original', position: { x: 2000, y: 90, z: -800 }, difficulty: 'easy', lore: '高地の記憶：空に近い場所', collected: false },
      { id: 'ori_037', mapName: 'original', position: { x: -2200, y: 55, z: 800 }, difficulty: 'easy', lore: '湿地の記憶：水と土が混ざり合う', collected: false },
      { id: 'ori_038', mapName: 'original', position: { x: 800, y: 65, z: -1500 }, difficulty: 'easy', lore: '岩場の記憶：風化した石の物語', collected: false },
      { id: 'ori_039', mapName: 'original', position: { x: -1500, y: 40, z: 1500 }, difficulty: 'easy', lore: '平原の記憶：果てしなく広がる大地', collected: false },
      { id: 'ori_040', mapName: 'original', position: { x: 1800, y: 75, z: 800 }, difficulty: 'easy', lore: '丘の記憶：緩やかな登り道', collected: false },
      { id: 'ori_041', mapName: 'original', position: { x: -1000, y: 50, z: -1800 }, difficulty: 'easy', lore: '谷の記憶：深く刻まれた大地の傷', collected: false },
      { id: 'ori_042', mapName: 'original', position: { x: 2200, y: 85, z: -200 }, difficulty: 'easy', lore: '台地の記憶：平らな高み', collected: false },
      { id: 'ori_043', mapName: 'original', position: { x: -2500, y: 60, z: -1000 }, difficulty: 'easy', lore: '森林の記憶：木々が語る歴史', collected: false },
      { id: 'ori_044', mapName: 'original', position: { x: 1200, y: 70, z: 1800 }, difficulty: 'easy', lore: '湖畔の記憶：静かな水面', collected: false },
      { id: 'ori_045', mapName: 'original', position: { x: -600, y: 45, z: 2000 }, difficulty: 'easy', lore: '砂丘の記憶：風が描く模様', collected: false },
      { id: 'ori_046', mapName: 'original', position: { x: 2800, y: 95, z: 500 }, difficulty: 'easy', lore: 'ジャングルの記憶：生命が溢れる', collected: false },
      { id: 'ori_047', mapName: 'original', position: { x: -200, y: 1200, z: -2600 }, difficulty: 'easy', lore: '雪原の記憶：純白の世界', collected: false },
      { id: 'ori_048', mapName: 'original', position: { x: 500, y: 55, z: -2200 }, difficulty: 'easy', lore: '氷河の記憶：凍りついた時間', collected: false },
      { id: 'ori_049', mapName: 'original', position: { x: -3000, y: 65, z: 500 }, difficulty: 'easy', lore: '辺境の記憶：人里離れた場所', collected: false },
      { id: 'ori_050', mapName: 'original', position: { x: 3000, y: 80, z: -500 }, difficulty: 'easy', lore: '境界の記憶：世界の端', collected: false },
      { id: 'ori_051', mapName: 'original', position: { x: -500, y: 1400, z: -2900 }, difficulty: 'easy', lore: '山頂の記憶：雲の上の世界', collected: false },
      { id: 'ori_052', mapName: 'original', position: { x: 400, y: -15, z: 2600 }, difficulty: 'easy', lore: 'オアシスの記憶：砂漠の奇跡', collected: false },
      { id: 'ori_053', mapName: 'original', position: { x: -6500, y: 1050, z: -6800 }, difficulty: 'easy', lore: '遠方の峰：未踏の頂', collected: false },
      { id: 'ori_054', mapName: 'original', position: { x: 6500, y: 35, z: 500 }, difficulty: 'easy', lore: '森の深部：静寂に包まれて', collected: false },
      { id: 'ori_055', mapName: 'original', position: { x: -6000, y: 53, z: 3050 }, difficulty: 'easy', lore: '大湖：水平線の彼方', collected: false },

      // Medium（25個）
      { id: 'ori_056', mapName: 'original', position: { x: 0, y: 1480, z: -2805 }, difficulty: 'medium', lore: 'Titan Peak頂上：すべてを見渡せる場所', collected: false },
      { id: 'ori_057', mapName: 'original', position: { x: -2000, y: -270, z: 1500 }, difficulty: 'medium', lore: 'Grand Canyon最深部：古代の祭壇が眠る', collected: false },
      { id: 'ori_058', mapName: 'original', position: { x: 1515, y: 95, z: -1055 }, difficulty: 'medium', lore: 'Great Waterfall裏：虹が架かる聖域', collected: false },
      { id: 'ori_059', mapName: 'original', position: { x: 2505, y: 365, z: 2005 }, difficulty: 'medium', lore: 'Natural Arch頂上：門の守護者の視点', collected: false },
      { id: 'ori_060', mapName: 'original', position: { x: 2500, y: 145, z: 305 }, difficulty: 'medium', lore: 'Jungle Heart樹上：空中都市の名残', collected: false },
      { id: 'ori_061', mapName: 'original', position: { x: 2555, y: -28, z: 295 }, difficulty: 'medium', lore: 'Jungle Heart地下：根の下の秘密', collected: false },
      { id: 'ori_062', mapName: 'original', position: { x: 255, y: -23, z: 2505 }, difficulty: 'medium', lore: 'Desert Oasis地下：生命の水脈', collected: false },
      { id: 'ori_063', mapName: 'original', position: { x: 5, y: 1517, z: -2798 }, difficulty: 'medium', lore: 'Snow Temple内部：凍てついた僧侶', collected: false },
      { id: 'ori_064', mapName: 'original', position: { x: -5, y: -198, z: 3 }, difficulty: 'medium', lore: '地下聖域中心：光が集まる場所', collected: false },
      { id: 'ori_065', mapName: 'original', position: { x: -1005, y: 195, z: -2005 }, difficulty: 'medium', lore: '巨大洞窟深部：闇の奥の輝き', collected: false },
      { id: 'ori_066', mapName: 'original', position: { x: -805, y: 155, z: 605 }, difficulty: 'medium', lore: '滝の裏深部：水しぶきの中で', collected: false },
      { id: 'ori_067', mapName: 'original', position: { x: 55, y: -52, z: -255 }, difficulty: 'medium', lore: 'クレバス最深部：亀裂の底', collected: false },
      { id: 'ori_068', mapName: 'original', position: { x: -1505, y: 52, z: 505 }, difficulty: 'medium', lore: '温泉中心：湯煙の向こう', collected: false },
      { id: 'ori_069', mapName: 'original', position: { x: 1205, y: 905, z: -805 }, difficulty: 'medium', lore: '天文台中央：星を観測した場所', collected: false },
      { id: 'ori_070', mapName: 'original', position: { x: -7005, y: 1105, z: -7005 }, difficulty: 'medium', lore: '遠方の峰頂上：世界の果て', collected: false },
      { id: 'ori_071', mapName: 'original', position: { x: -7505, y: 855, z: 5 }, difficulty: 'medium', lore: '西の断崖頂上：灯台の最上階', collected: false },
      { id: 'ori_072', mapName: 'original', position: { x: 6505, y: 32, z: 505 }, difficulty: 'medium', lore: '森の最深部：光が届かない場所', collected: false },
      { id: 'ori_073', mapName: 'original', position: { x: 505, y: 1005, z: -2505 }, difficulty: 'medium', lore: 'Alpine Lake中心：湖底の謎', collected: false },
      { id: 'ori_074', mapName: 'original', position: { x: 405, y: 42, z: -605 }, difficulty: 'medium', lore: '自然橋下深部：支柱の根元', collected: false },
      { id: 'ori_075', mapName: 'original', position: { x: 85, y: 12, z: -205 }, difficulty: 'medium', lore: '峡谷横穴奥：隠された祠', collected: false },
      { id: 'ori_076', mapName: 'original', position: { x: 355, y: 7, z: 2555 }, difficulty: 'medium', lore: 'Oasis商隊宿屋上：見張り台', collected: false },
      { id: 'ori_077', mapName: 'original', position: { x: -55, y: 1525, z: -2855 }, difficulty: 'medium', lore: 'Snow Temple鐘楼頂上：祈りの鐘', collected: false },
      { id: 'ori_078', mapName: 'original', position: { x: -12, y: -182, z: -12 }, difficulty: 'medium', lore: '地下聖域祭壇上：光の頂点', collected: false },
      { id: 'ori_079', mapName: 'original', position: { x: -2055, y: 52, z: 1305 }, difficulty: 'medium', lore: 'Grand Canyon横穴奥：壁画の間', collected: false },
      { id: 'ori_080', mapName: 'original', position: { x: 2455, y: 372, z: 2005 }, difficulty: 'medium', lore: 'Natural Arch門番塔頂上：関所の記録', collected: false },

      // Hard（12個）
      { id: 'ori_081', mapName: 'original', position: { x: 3, y: 1498, z: -2803 }, difficulty: 'hard', lore: 'Titan Peak最頂部：世界の屋根', collected: false },
      { id: 'ori_082', mapName: 'original', position: { x: -2002, y: -298, z: 1502 }, difficulty: 'hard', lore: 'Grand Canyon絶対底部：大地の核心', collected: false },
      { id: 'ori_083', mapName: 'original', position: { x: 1518, y: 98, z: -1053 }, difficulty: 'hard', lore: 'Great Waterfall虹の中心：七色の秘密', collected: false },
      { id: 'ori_084', mapName: 'original', position: { x: 2503, y: 378, z: 2003 }, difficulty: 'hard', lore: 'Natural Arch天井：アーチの秘密', collected: false },
      { id: 'ori_085', mapName: 'original', position: { x: 503, y: 1003, z: -2503 }, difficulty: 'hard', lore: 'Alpine Lake湖底中心：水の底の真実', collected: false },
      { id: 'ori_086', mapName: 'original', position: { x: 2503, y: 152, z: 403 }, difficulty: 'hard', lore: 'Jungle Heart最高樹上：緑の王座', collected: false },
      { id: 'ori_087', mapName: 'original', position: { x: 2553, y: -32, z: 303 }, difficulty: 'hard', lore: 'Jungle Heart最深地下：根の心臓', collected: false },
      { id: 'ori_088', mapName: 'original', position: { x: 3, y: 1518, z: -2853 }, difficulty: 'hard', lore: 'Snow Temple最深部：凍結した時間', collected: false },
      { id: 'ori_089', mapName: 'original', position: { x: 2, y: -203, z: 2 }, difficulty: 'hard', lore: '地下聖域最深部：封印の核', collected: false },
      { id: 'ori_090', mapName: 'original', position: { x: -7008, y: 1108, z: -7008 }, difficulty: 'hard', lore: '遠方の峰絶頂：未到の場所', collected: false },
      { id: 'ori_091', mapName: 'original', position: { x: -7508, y: 858, z: 8 }, difficulty: 'hard', lore: '西の断崖最頂部：灯台の光源', collected: false },
      { id: 'ori_092', mapName: 'original', position: { x: -1003, y: 198, z: -2003 }, difficulty: 'hard', lore: '巨大洞窟最深点：闇の中心', collected: false },

      // Expert（3個）
      { id: 'ori_093', mapName: 'original', position: { x: 0, y: 1500, z: -2800 }, difficulty: 'expert', lore: 'Titan Peak真頂：神々の座', collected: false },
      { id: 'ori_094', mapName: 'original', position: { x: -2000, y: -300, z: 1500 }, difficulty: 'expert', lore: 'Grand Canyon絶対最深部：世界の記憶', collected: false },
      { id: 'ori_095', mapName: 'original', position: { x: 0, y: -205, z: 0 }, difficulty: 'expert', lore: '地下聖域核心：すべての始まり', collected: false },

      // Tokyo MAP追加（75個）- Easy 35, Medium 25, Hard 12, Expert 3
      // Easy（35個）
      { id: 'tok_026', mapName: 'tokyo', position: { x: 5, y: 205, z: 5 }, difficulty: 'easy', lore: 'Mega Tower 20階：避難の記録', collected: false },
      { id: 'tok_027', mapName: 'tokyo', position: { x: -5, y: 405, z: -5 }, difficulty: 'easy', lore: 'Mega Tower 40階：半ばの記憶', collected: false },
      { id: 'tok_028', mapName: 'tokyo', position: { x: 10, y: 605, z: 10 }, difficulty: 'easy', lore: 'Mega Tower 60階：希望の階', collected: false },
      { id: 'tok_029', mapName: 'tokyo', position: { x: 2005, y: 455, z: -1005 }, difficulty: 'easy', lore: 'Skytree 450m：東京を見下ろす', collected: false },
      { id: 'tok_030', mapName: 'tokyo', position: { x: 2005, y: 555, z: -1005 }, difficulty: 'easy', lore: 'Skytree 550m：空に近づく', collected: false },
      { id: 'tok_031', mapName: 'tokyo', position: { x: -2505, y: 18, z: -2005 }, difficulty: 'easy', lore: 'Stadium医療施設：癒しの場所', collected: false },
      { id: 'tok_032', mapName: 'tokyo', position: { x: -2485, y: 12, z: -2025 }, difficulty: 'easy', lore: 'Stadium食料庫：最後の備蓄', collected: false },
      { id: 'tok_033', mapName: 'tokyo', position: { x: 1005, y: 305, z: 1505 }, difficulty: 'easy', lore: 'Twin Tower連絡橋：双子の絆', collected: false },
      { id: 'tok_034', mapName: 'tokyo', position: { x: 1805, y: 255, z: 505 }, difficulty: 'easy', lore: '傾いたビル避難階段：崩壊の予兆', collected: false },
      { id: 'tok_035', mapName: 'tokyo', position: { x: -2005, y: 85, z: 2505 }, difficulty: 'easy', lore: 'Giant Dome内部：静寂のドーム', collected: false },
      { id: 'tok_036', mapName: 'tokyo', position: { x: -1505, y: 255, z: 805 }, difficulty: 'easy', lore: 'Tokyo Tower展望台：東京の象徴', collected: false },
      { id: 'tok_037', mapName: 'tokyo', position: { x: -7055, y: 42, z: 5005 }, difficulty: 'easy', lore: '港湾灯台：海への道標', collected: false },
      { id: 'tok_038', mapName: 'tokyo', position: { x: -7105, y: 8, z: 5105 }, difficulty: 'easy', lore: '港湾停泊船：最後の航海', collected: false },
      { id: 'tok_039', mapName: 'tokyo', position: { x: -6005, y: 22, z: -6005 }, difficulty: 'easy', lore: '郊外廃校：子供たちの声', collected: false },
      { id: 'tok_040', mapName: 'tokyo', position: { x: 5005, y: 32, z: 5005 }, difficulty: 'easy', lore: '工業地帯制御室：機械の心臓', collected: false },
      { id: 'tok_041', mapName: 'tokyo', position: { x: -7005, y: 655, z: 5 }, difficulty: 'easy', lore: '山岳部展望台：都市と自然の境界', collected: false },
      { id: 'tok_042', mapName: 'tokyo', position: { x: -1773, y: 182, z: -1773 }, difficulty: 'easy', lore: '環状道路休憩所：環状線の記憶', collected: false },
      { id: 'tok_043', mapName: 'tokyo', position: { x: 5, y: -42, z: 5 }, difficulty: 'easy', lore: '地下B4シェルター：最後の避難所', collected: false },
      { id: 'tok_044', mapName: 'tokyo', position: { x: -1205, y: 60, z: 605 }, difficulty: 'easy', lore: '廃ビル屋上：植物が占拠', collected: false },
      { id: 'tok_045', mapName: 'tokyo', position: { x: 605, y: -18, z: -805 }, difficulty: 'easy', lore: '地下鉄封鎖区間：暗闇の路線', collected: false },
      { id: 'tok_046', mapName: 'tokyo', position: { x: 2005, y: 22, z: 2005 }, difficulty: 'easy', lore: '工場秘密倉庫：隠された物資', collected: false },
      { id: 'tok_047', mapName: 'tokyo', position: { x: 1505, y: 102, z: 5 }, difficulty: 'easy', lore: 'Rainbow Bridge中空：橋の秘密', collected: false },
      { id: 'tok_048', mapName: 'tokyo', position: { x: -1205, y: -28, z: -605 }, difficulty: 'easy', lore: '下水道拡張部：地下水路', collected: false },
      { id: 'tok_049', mapName: 'tokyo', position: { x: 1005, y: 405, z: -1005 }, difficulty: 'easy', lore: '放棄ヘリポート：空からの脱出', collected: false },
      { id: 'tok_050', mapName: 'tokyo', position: { x: 805, y: -38, z: -205 }, difficulty: 'easy', lore: '皇居地下：歴史の保管庫', collected: false },
      { id: 'tok_051', mapName: 'tokyo', position: { x: -1500, y: 80, z: -1200 }, difficulty: 'easy', lore: '高架道路下：巨大な影', collected: false },
      { id: 'tok_052', mapName: 'tokyo', position: { x: 800, y: 150, z: 600 }, difficulty: 'easy', lore: 'ビル群中層：都市の脈動', collected: false },
      { id: 'tok_053', mapName: 'tokyo', position: { x: -2000, y: 200, z: 1500 }, difficulty: 'easy', lore: '住宅地高層：生活の痕跡', collected: false },
      { id: 'tok_054', mapName: 'tokyo', position: { x: 1200, y: 100, z: -800 }, difficulty: 'easy', lore: '商業地区屋上：ネオンの残照', collected: false },
      { id: 'tok_055', mapName: 'tokyo', position: { x: -800, y: 120, z: -1500 }, difficulty: 'easy', lore: '工業地帯屋上：煙突の群れ', collected: false },
      { id: 'tok_056', mapName: 'tokyo', position: { x: 1800, y: 180, z: 1200 }, difficulty: 'easy', lore: '郊外中層：静かな街', collected: false },
      { id: 'tok_057', mapName: 'tokyo', position: { x: -2500, y: 150, z: -800 }, difficulty: 'easy', lore: '外周ビル群：都市の境界', collected: false },
      { id: 'tok_058', mapName: 'tokyo', position: { x: 2800, y: 170, z: -600 }, difficulty: 'easy', lore: '新興住宅地：未完の夢', collected: false },
      { id: 'tok_059', mapName: 'tokyo', position: { x: -3000, y: 140, z: 1000 }, difficulty: 'easy', lore: '郊外倉庫街：物流の跡', collected: false },
      { id: 'tok_060', mapName: 'tokyo', position: { x: 3200, y: 160, z: 800 }, difficulty: 'easy', lore: '拡張地区：発展途上', collected: false },

      // Medium（25個）
      { id: 'tok_061', mapName: 'tokyo', position: { x: 2, y: 782, z: 2 }, difficulty: 'medium', lore: 'Mega Tower最上階：最後の希望', collected: false },
      { id: 'tok_062', mapName: 'tokyo', position: { x: 12, y: 798, z: 12 }, difficulty: 'medium', lore: 'Mega Tower通信室：最後の通信', collected: false },
      { id: 'tok_063', mapName: 'tokyo', position: { x: 2008, y: 632, z: -1008 }, difficulty: 'medium', lore: 'Skytree放送室：沈黙の放送', collected: false },
      { id: 'tok_064', mapName: 'tokyo', position: { x: -2502, y: 42, z: -2002 }, difficulty: 'medium', lore: 'Stadium中央：避難の中心', collected: false },
      { id: 'tok_065', mapName: 'tokyo', position: { x: 1002, y: 452, z: 1502 }, difficulty: 'medium', lore: 'Twin Tower最上階：双子の頂', collected: false },
      { id: 'tok_066', mapName: 'tokyo', position: { x: 1802, y: 422, z: 502 }, difficulty: 'medium', lore: '傾いたビル最上階：危険な頂', collected: false },
      { id: 'tok_067', mapName: 'tokyo', position: { x: -1002, y: 382, z: 502 }, difficulty: 'medium', lore: '展望ビル最上階：廃墟の眺望', collected: false },
      { id: 'tok_068', mapName: 'tokyo', position: { x: -1502, y: 335, z: 802 }, difficulty: 'medium', lore: 'Tokyo Tower最上部：赤い塔の頂', collected: false },
      { id: 'tok_069', mapName: 'tokyo', position: { x: -2002, y: 152, z: 2502 }, difficulty: 'medium', lore: 'Giant Dome天井：ドームの秘密', collected: false },
      { id: 'tok_070', mapName: 'tokyo', position: { x: -505, y: -52, z: 305 }, difficulty: 'medium', lore: '地下B5中心：研究の核心', collected: false },
      { id: 'tok_071', mapName: 'tokyo', position: { x: 3, y: -48, z: 3 }, difficulty: 'medium', lore: '地下B5実験室：禁断の研究', collected: false },
      { id: 'tok_072', mapName: 'tokyo', position: { x: -7052, y: 48, z: 5002 }, difficulty: 'medium', lore: '港湾灯台頂上：最後の灯', collected: false },
      { id: 'tok_073', mapName: 'tokyo', position: { x: -7102, y: 12, z: 5102 }, difficulty: 'medium', lore: '停泊船艦橋：船長の決断', collected: false },
      { id: 'tok_074', mapName: 'tokyo', position: { x: -6002, y: 28, z: -6002 }, difficulty: 'medium', lore: '廃校屋上：子供の夢', collected: false },
      { id: 'tok_075', mapName: 'tokyo', position: { x: 5002, y: 38, z: 5002 }, difficulty: 'medium', lore: '工業制御室中心：機械の脳', collected: false },
      { id: 'tok_076', mapName: 'tokyo', position: { x: -7002, y: 802, z: 2 }, difficulty: 'medium', lore: '山岳展望台頂上：都市全景', collected: false },
      { id: 'tok_077', mapName: 'tokyo', position: { x: 1502, y: 105, z: 2 }, difficulty: 'medium', lore: 'Rainbow Bridge中央：橋の心臓', collected: false },
      { id: 'tok_078', mapName: 'tokyo', position: { x: -1202, y: -32, z: -602 }, difficulty: 'medium', lore: '下水道最深部：闇の水路', collected: false },
      { id: 'tok_079', mapName: 'tokyo', position: { x: 1002, y: 408, z: -1002 }, difficulty: 'medium', lore: 'ヘリポート中央：空の門', collected: false },
      { id: 'tok_080', mapName: 'tokyo', position: { x: 802, y: -42, z: -202 }, difficulty: 'medium', lore: '皇居地下最深部：歴史の核', collected: false },
      { id: 'tok_081', mapName: 'tokyo', position: { x: 2, y: 52, z: -1502 }, difficulty: 'medium', lore: '高架道路下中心：影の中心', collected: false },
      { id: 'tok_082', mapName: 'tokyo', position: { x: -802, y: 252, z: 602 }, difficulty: 'medium', lore: '廃ビル屋上庭園中心：緑の楽園', collected: false },
      { id: 'tok_083', mapName: 'tokyo', position: { x: 602, y: -22, z: -802 }, difficulty: 'medium', lore: '地下鉄封鎖区間最深部：暗黒の終点', collected: false },
      { id: 'tok_084', mapName: 'tokyo', position: { x: 2002, y: 25, z: 2002 }, difficulty: 'medium', lore: '工場倉庫奥：秘密の物資', collected: false },
      { id: 'tok_085', mapName: 'tokyo', position: { x: 2, y: -45, z: 2 }, difficulty: 'medium', lore: '地下B4シェルター中心：最終避難', collected: false },

      // Hard（12個）
      { id: 'tok_086', mapName: 'tokyo', position: { x: 0, y: 800, z: 0 }, difficulty: 'hard', lore: 'Mega Tower絶頂：都市の頂点', collected: false },
      { id: 'tok_087', mapName: 'tokyo', position: { x: 2000, y: 634, z: -1000 }, difficulty: 'hard', lore: 'Skytree最上部：天を貫く', collected: false },
      { id: 'tok_088', mapName: 'tokyo', position: { x: -2500, y: 80, z: -2000 }, difficulty: 'hard', lore: 'Stadium最上段：競技場の真実', collected: false },
      { id: 'tok_089', mapName: 'tokyo', position: { x: 1000, y: 450, z: 1500 }, difficulty: 'hard', lore: 'Twin Tower絶頂：双子の秘密', collected: false },
      { id: 'tok_090', mapName: 'tokyo', position: { x: 1800, y: 420, z: 500 }, difficulty: 'hard', lore: '傾いたビル最頂部：崩壊の瞬間', collected: false },
      { id: 'tok_091', mapName: 'tokyo', position: { x: -1000, y: 380, z: -1500 }, difficulty: 'hard', lore: '展望ビル絶頂：廃墟の王座', collected: false },
      { id: 'tok_092', mapName: 'tokyo', position: { x: -1500, y: 333, z: 800 }, difficulty: 'hard', lore: 'Tokyo Tower天辺：塔の守護者', collected: false },
      { id: 'tok_093', mapName: 'tokyo', position: { x: -2000, y: 150, z: 2500 }, difficulty: 'hard', lore: 'Giant Dome頂点：ドームの真実', collected: false },
      { id: 'tok_094', mapName: 'tokyo', position: { x: -500, y: -50, z: 300 }, difficulty: 'hard', lore: '地下B5核心：禁断の部屋', collected: false },
      { id: 'tok_095', mapName: 'tokyo', position: { x: -7050, y: 50, z: 5000 }, difficulty: 'hard', lore: '港湾灯台光源：永遠の光', collected: false },
      { id: 'tok_096', mapName: 'tokyo', position: { x: -7000, y: 800, z: 0 }, difficulty: 'hard', lore: '山岳絶頂：都市と自然の調和', collected: false },
      { id: 'tok_097', mapName: 'tokyo', position: { x: 800, y: -40, z: -200 }, difficulty: 'hard', lore: '皇居地下核心：歴史の真実', collected: false },

      // Expert（3個）
      { id: 'tok_098', mapName: 'tokyo', position: { x: 0, y: 800, z: 0 }, difficulty: 'expert', lore: 'Mega Tower真頂：都市の記憶すべて', collected: false },
      { id: 'tok_099', mapName: 'tokyo', position: { x: 2000, y: 634, z: -1000 }, difficulty: 'expert', lore: 'Skytree真頂：空の記録', collected: false },
      { id: 'tok_100', mapName: 'tokyo', position: { x: -500, y: -50, z: 300 }, difficulty: 'expert', lore: '地下B5最深核：崩壊の真因', collected: false },

      // Space MAP追加（75個）- Easy 35, Medium 25, Hard 12, Expert 3
      // Easy（35個）
      { id: 'spa_026', mapName: 'space', position: { x: -8, y: -348, z: -3008 }, difficulty: 'easy', lore: 'Mothership司令室：艦隊の指揮', collected: false },
      { id: 'spa_027', mapName: 'space', position: { x: 18, y: -418, z: -2993 }, difficulty: 'easy', lore: 'Mothership艦長室：最後の決断', collected: false },
      { id: 'spa_028', mapName: 'space', position: { x: -48, y: -378, z: -3048 }, difficulty: 'easy', lore: 'Mothership脱出ポッド：最後の希望', collected: false },
      { id: 'spa_029', mapName: 'space', position: { x: 605, y: -848, z: -2405 }, difficulty: 'easy', lore: '要塞第1層司令室：防衛の指揮', collected: false },
      { id: 'spa_030', mapName: 'space', position: { x: 605, y: -948, z: -2405 }, difficulty: 'easy', lore: '要塞第2層動力炉：エネルギーの心臓', collected: false },
      { id: 'spa_031', mapName: 'space', position: { x: 625, y: -878, z: -2425 }, difficulty: 'easy', lore: '要塞兵器庫：武器の保管', collected: false },
      { id: 'spa_032', mapName: 'space', position: { x: -2305, y: -1748, z: -405 }, difficulty: 'easy', lore: '採掘コロニー司令室：採掘の指揮', collected: false },
      { id: 'spa_033', mapName: 'space', position: { x: -2325, y: -1798, z: -425 }, difficulty: 'easy', lore: '採掘コロニー宿舎：鉱夫の生活', collected: false },
      { id: 'spa_034', mapName: 'space', position: { x: -2005, y: -293, z: 1505 }, difficulty: 'easy', lore: 'Cruiser艦橋：戦艦の頭脳', collected: false },
      { id: 'spa_035', mapName: 'space', position: { x: 2505, y: 222, z: -1005 }, difficulty: 'easy', lore: 'Mining Platform制御室：採掘の制御', collected: false },
      { id: 'spa_036', mapName: 'space', position: { x: -1505, y: 602, z: -2005 }, difficulty: 'easy', lore: 'Comm Tower通信室：宇宙との交信', collected: false },
      { id: 'spa_037', mapName: 'space', position: { x: 1805, y: -198, z: 2178 }, difficulty: 'easy', lore: 'Habitat Ring個室群：生活の記録', collected: false },
      { id: 'spa_038', mapName: 'space', position: { x: -2205, y: 122, z: 2205 }, difficulty: 'easy', lore: 'Fuel Refinery精製室：燃料の生成', collected: false },
      { id: 'spa_039', mapName: 'space', position: { x: 2005, y: 372, z: 1805 }, difficulty: 'easy', lore: 'Observatory観測室：宇宙の観測', collected: false },
      { id: 'spa_040', mapName: 'space', position: { x: 5005, y: 22, z: 5005 }, difficulty: 'easy', lore: '外周Station研究室：辺境の研究', collected: false },
      { id: 'spa_041', mapName: 'space', position: { x: -5505, y: 412, z: 5 }, difficulty: 'easy', lore: '廃棄Station居住区：放棄された生活', collected: false },
      { id: 'spa_042', mapName: 'space', position: { x: 4505, y: 102, z: -4505 }, difficulty: 'easy', lore: 'Debris Belt補給船：隠された物資', collected: false },
      { id: 'spa_043', mapName: 'space', position: { x: -1605, y: 57, z: -1093 }, difficulty: 'easy', lore: '小惑星寺院祭壇：古代の儀式', collected: false },
      { id: 'spa_044', mapName: 'space', position: { x: 2005, y: -93, z: -1405 }, difficulty: 'easy', lore: 'Battleship艦橋：戦艦の指揮', collected: false },
      { id: 'spa_045', mapName: 'space', position: { x: 2405, y: -293, z: -1805 }, difficulty: 'easy', lore: 'Carrier格納庫：艦載機の保管', collected: false },
      { id: 'spa_046', mapName: 'space', position: { x: 805, y: -198, z: 605 }, difficulty: 'easy', lore: 'デブリ船：漂流の記録', collected: false },
      { id: 'spa_047', mapName: 'space', position: { x: 1505, y: 302, z: 1205 }, difficulty: 'easy', lore: '凍結船：時が止まった船', collected: false },
      { id: 'spa_048', mapName: 'space', position: { x: -205, y: 352, z: -2205 }, difficulty: 'easy', lore: 'Ring Station中枢：リングの核', collected: false },
      { id: 'spa_049', mapName: 'space', position: { x: -1005, y: 502, z: 1505 }, difficulty: 'easy', lore: 'Habitat秘密ドック：隠された格納庫', collected: false },
      { id: 'spa_050', mapName: 'space', position: { x: -1505, y: 102, z: -1005 }, difficulty: 'easy', lore: '採掘施設内部：小惑星の秘密', collected: false },
      { id: 'spa_051', mapName: 'space', position: { x: 605, y: -998, z: -2405 }, difficulty: 'easy', lore: '要塞コア：要塞の心臓', collected: false },
      { id: 'spa_052', mapName: 'space', position: { x: 5, y: -398, z: -3005 }, difficulty: 'easy', lore: 'Mothership艦橋：艦隊の頭脳', collected: false },
      { id: 'spa_053', mapName: 'space', position: { x: 1200, y: -150, z: 800 }, difficulty: 'easy', lore: 'デブリフィールド：漂流物の海', collected: false },
      { id: 'spa_054', mapName: 'space', position: { x: -1800, y: 200, z: -1500 }, difficulty: 'easy', lore: '小惑星帯：岩の群れ', collected: false },
      { id: 'spa_055', mapName: 'space', position: { x: 2500, y: -100, z: -2000 }, difficulty: 'easy', lore: '船墓場：廃艦の集積', collected: false },
      { id: 'spa_056', mapName: 'space', position: { x: -2800, y: 150, z: 1200 }, difficulty: 'easy', lore: '外周宙域：辺境の空間', collected: false },
      { id: 'spa_057', mapName: 'space', position: { x: 3200, y: -250, z: 1800 }, difficulty: 'easy', lore: '未踏宙域：未知の領域', collected: false },
      { id: 'spa_058', mapName: 'space', position: { x: -3500, y: 100, z: -2200 }, difficulty: 'easy', lore: '放棄宙域：忘れられた空間', collected: false },
      { id: 'spa_059', mapName: 'space', position: { x: 2800, y: 300, z: -1500 }, difficulty: 'easy', lore: '静寂の宙域：音のない世界', collected: false },
      { id: 'spa_060', mapName: 'space', position: { x: -2500, y: -200, z: 2500 }, difficulty: 'easy', lore: '暗黒の宙域：光が届かない場所', collected: false },

      // Medium（25個）
      { id: 'spa_061', mapName: 'space', position: { x: -12, y: -352, z: -3012 }, difficulty: 'medium', lore: 'Mothership司令室中央：指揮の核心', collected: false },
      { id: 'spa_062', mapName: 'space', position: { x: 20, y: -422, z: -2995 }, difficulty: 'medium', lore: 'Mothership艦長席：艦長の決断', collected: false },
      { id: 'spa_063', mapName: 'space', position: { x: -52, y: -382, z: -3052 }, difficulty: 'medium', lore: 'Mothership脱出ポッド中央：最後の脱出', collected: false },
      { id: 'spa_064', mapName: 'space', position: { x: 602, y: -852, z: -2402 }, difficulty: 'medium', lore: '要塞第1層中央：第一防衛線', collected: false },
      { id: 'spa_065', mapName: 'space', position: { x: 602, y: -952, z: -2402 }, difficulty: 'medium', lore: '要塞第2層動力炉中心：動力の源', collected: false },
      { id: 'spa_066', mapName: 'space', position: { x: 622, y: -882, z: -2422 }, difficulty: 'medium', lore: '要塞兵器庫奥：最強の武器', collected: false },
      { id: 'spa_067', mapName: 'space', position: { x: -2302, y: -1752, z: -402 }, difficulty: 'medium', lore: '採掘コロニー司令室中央：採掘の中枢', collected: false },
      { id: 'spa_068', mapName: 'space', position: { x: -2322, y: -1802, z: -422 }, difficulty: 'medium', lore: '採掘コロニー宿舎奥：鉱夫の記録', collected: false },
      { id: 'spa_069', mapName: 'space', position: { x: -2002, y: -297, z: 1502 }, difficulty: 'medium', lore: 'Cruiser艦橋中央：戦術の核心', collected: false },
      { id: 'spa_070', mapName: 'space', position: { x: 2502, y: 225, z: -1002 }, difficulty: 'medium', lore: 'Mining Platform中央：採掘の中心', collected: false },
      { id: 'spa_071', mapName: 'space', position: { x: -1502, y: 605, z: -2002 }, difficulty: 'medium', lore: 'Comm Tower通信室中央：交信の核', collected: false },
      { id: 'spa_072', mapName: 'space', position: { x: 1802, y: -202, z: 2002 }, difficulty: 'medium', lore: 'Habitat Ring中央：生活の中心', collected: false },
      { id: 'spa_073', mapName: 'space', position: { x: -2202, y: 125, z: 2202 }, difficulty: 'medium', lore: 'Fuel Refinery中央：精製の核心', collected: false },
      { id: 'spa_074', mapName: 'space', position: { x: 2002, y: 375, z: 1802 }, difficulty: 'medium', lore: 'Observatory中央：観測の中心', collected: false },
      { id: 'spa_075', mapName: 'space', position: { x: 5002, y: 25, z: 5002 }, difficulty: 'medium', lore: '外周Station中央：研究の核', collected: false },
      { id: 'spa_076', mapName: 'space', position: { x: -5502, y: 415, z: 2 }, difficulty: 'medium', lore: '廃棄Station中央：放棄の記録', collected: false },
      { id: 'spa_077', mapName: 'space', position: { x: 4502, y: 105, z: -4502 }, difficulty: 'medium', lore: 'Debris Belt補給船中央：隠された核心', collected: false },
      { id: 'spa_078', mapName: 'space', position: { x: -1602, y: 52, z: -1098 }, difficulty: 'medium', lore: '小惑星寺院中央：祭壇の真実', collected: false },
      { id: 'spa_079', mapName: 'space', position: { x: 2002, y: -98, z: -1402 }, difficulty: 'medium', lore: 'Battleship艦橋中央：指揮の核心', collected: false },
      { id: 'spa_080', mapName: 'space', position: { x: 2402, y: -298, z: -1802 }, difficulty: 'medium', lore: 'Carrier格納庫奥：艦載機の秘密', collected: false },
      { id: 'spa_081', mapName: 'space', position: { x: 802, y: -202, z: 602 }, difficulty: 'medium', lore: 'デブリ船中央：漂流の核心', collected: false },
      { id: 'spa_082', mapName: 'space', position: { x: 1502, y: 305, z: 1202 }, difficulty: 'medium', lore: '凍結船中央：凍結の中心', collected: false },
      { id: 'spa_083', mapName: 'space', position: { x: -202, y: 355, z: -2202 }, difficulty: 'medium', lore: 'Ring Station中枢深部：リングの秘密', collected: false },
      { id: 'spa_084', mapName: 'space', position: { x: -1002, y: 505, z: 1502 }, difficulty: 'medium', lore: 'Habitat秘密ドック奥：隠された真実', collected: false },
      { id: 'spa_085', mapName: 'space', position: { x: -1502, y: 105, z: -1002 }, difficulty: 'medium', lore: '採掘施設最深部：小惑星の核心', collected: false },

      // Hard（12個）
      { id: 'spa_086', mapName: 'space', position: { x: 0, y: -400, z: -3000 }, difficulty: 'hard', lore: 'Mothership艦橋隠し部屋：艦の真実', collected: false },
      { id: 'spa_087', mapName: 'space', position: { x: 600, y: -1000, z: -2400 }, difficulty: 'hard', lore: '要塞コア最深部：制御の核心', collected: false },
      { id: 'spa_088', mapName: 'space', position: { x: -1500, y: 100, z: -1000 }, difficulty: 'hard', lore: '小惑星採掘施設核心：採掘の真実', collected: false },
      { id: 'spa_089', mapName: 'space', position: { x: 2400, y: -300, z: -1800 }, difficulty: 'hard', lore: '廃棄戦艦ブラックボックス：戦闘の記録', collected: false },
      { id: 'spa_090', mapName: 'space', position: { x: -1000, y: 500, z: 1500 }, difficulty: 'hard', lore: 'Habitat秘密ドック最深部：ドックの秘密', collected: false },
      { id: 'spa_091', mapName: 'space', position: { x: -200, y: 350, z: -2200 }, difficulty: 'hard', lore: 'Ring Station中枢核心：リングの真実', collected: false },
      { id: 'spa_092', mapName: 'space', position: { x: 800, y: -200, z: 600 }, difficulty: 'hard', lore: 'デブリフィールド隠し船：漂流の秘密', collected: false },
      { id: 'spa_093', mapName: 'space', position: { x: -1600, y: 50, z: -1100 }, difficulty: 'hard', lore: '小惑星内部神殿：古代の真実', collected: false },
      { id: 'spa_094', mapName: 'space', position: { x: 1500, y: 300, z: 1200 }, difficulty: 'hard', lore: '凍結宇宙船核心：凍結の謎', collected: false },
      { id: 'spa_095', mapName: 'space', position: { x: -2300, y: -1800, z: -400 }, difficulty: 'hard', lore: '採掘コロニー最深部：コロニーの秘密', collected: false },
      { id: 'spa_096', mapName: 'space', position: { x: 2000, y: 350, z: 1800 }, difficulty: 'hard', lore: 'Observatory最深部：観測の真実', collected: false },
      { id: 'spa_097', mapName: 'space', position: { x: 5000, y: 0, z: 5000 }, difficulty: 'hard', lore: '外周Station核心：辺境の真実', collected: false },

      // Expert（3個）
      { id: 'spa_098', mapName: 'space', position: { x: 0, y: -500, z: -3000 }, difficulty: 'expert', lore: 'Mothership核心：艦のすべて', collected: false },
      { id: 'spa_099', mapName: 'space', position: { x: 600, y: -1050, z: -2400 }, difficulty: 'expert', lore: '要塞絶対核心：要塞のすべて', collected: false },
      { id: 'spa_100', mapName: 'space', position: { x: 0, y: 0, z: 0 }, difficulty: 'expert', lore: 'ワームホール核心：宇宙の真実', collected: false },
    ]
  }
}
