# MAP革命 - 設計書

## オリジナルMAP：極限地形

### 戦略：全域を「戦場」に
現在は中央部だけ劇的で、周辺部は平坦。これを**全域を劇的に**変更。

### 地形生成アルゴリズム改革

```typescript
function terrainH(x: number, z: number): number {
  // ===== 基本高度を大幅UP =====
  let h = 400  // 基準を100m→400mに引き上げ
  
  // ===== 全域に巨大山脈を配置 =====
  // 北部山脈（標高800m）
  h += Math.exp(-((x - 0) ** 2 / 800000 + (z - 1200) ** 2 / 300000)) * 600
  
  // 南部山脈（標高700m）
  h += Math.exp(-((x + 300) ** 2 / 700000 + (z + 1000) ** 2 / 400000)) * 500
  
  // 東部山脈（標高750m）
  h += Math.exp(-((x - 1000) ** 2 / 400000 + (z - 200) ** 2 / 800000)) * 550
  
  // 西部山脈（標高850m、最高峰）
  h += Math.exp(-((x + 1200) ** 2 / 500000 + (z + 400) ** 2 / 600000)) * 650
  
  // ===== 深い峡谷群（深さ600m級）=====
  // 十字峡谷（MAP中央を横断）
  const crossX = Math.abs(x)
  const crossZ = Math.abs(z)
  if (crossX < 150) h -= 500 * Math.exp(-(crossX / 80) ** 2)
  if (crossZ < 150) h -= 500 * Math.exp(-(crossZ / 80) ** 2)
  
  // 放射峡谷（4方向）
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const dx = x * Math.cos(angle) + z * Math.sin(angle)
    const dz = -x * Math.sin(angle) + z * Math.cos(angle)
    const dist = Math.abs(dz)
    if (dist < 100 && Math.abs(dx) < 2000) {
      h -= 400 * Math.exp(-(dist / 60) ** 2)
    }
  }
  
  // ===== 激しい起伏（フラクタル地形）=====
  h += Math.sin(x * 0.003) * Math.cos(z * 0.004) * 300
  h += Math.sin(x * 0.007) * Math.sin(z * 0.006) * 200
  h += Math.sin(x * 0.012) * Math.cos(z * 0.010) * 150
  
  // ===== 最低高度は0m =====
  return Math.max(0, h)
}
```

### 岩塔・巨岩の配置

```typescript
function createRockPillars() {
  // 岩の塔（30-80m）を100本配置
  for (let i = 0; i < 100; i++) {
    const x = (Math.random() - 0.5) * 5000
    const z = (Math.random() - 0.5) * 5000
    const baseY = terrainH(x, z)
    const height = 30 + Math.random() * 50
    const radius = 8 + Math.random() * 12
    
    const pillar = new CylinderGeometry(radius * 0.7, radius, height, 8)
    // 岩らしい色（茶色・灰色）
    const material = new MeshStandardMaterial({ 
      color: 0x6a5a4a,
      roughness: 0.9 
    })
    
    mesh.position.set(x, baseY + height / 2, z)
    mesh.castShadow = true
  }
  
  // 巨岩（10-30m）を300個配置
  for (let i = 0; i < 300; i++) {
    const x = (Math.random() - 0.5) * 5000
    const z = (Math.random() - 0.5) * 5000
    const baseY = terrainH(x, z)
    const size = 10 + Math.random() * 20
    
    // 不規則な形状（DodecahedronGeometry）
    const rock = new DodecahedronGeometry(size, 0)
    const material = new MeshStandardMaterial({ 
      color: 0x5a4a3a,
      roughness: 0.95 
    })
    
    mesh.position.set(x, baseY + size / 2, z)
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    )
    mesh.castShadow = true
  }
}
```

### 橋の大幅追加

```typescript
// 峡谷を横断する橋を20本追加
const bridges = [
  { x: 0, z: -500, length: 200, angle: 0 },
  { x: -500, z: 0, length: 200, angle: Math.PI/2 },
  // ... 計20本
]
```

---

## NEO東京MAP：サイバーパンク都市

### 戦略：軽量化 + 立体感 + 視覚的インパクト

### InstancedMeshによる最適化

```typescript
class NeoTokyoMapSystem {
  // 建物を高さ別にグループ化
  private lowBuildings: InstancedMesh  // 20-60m: 500棟
  private midBuildings: InstancedMesh  // 60-150m: 600棟
  private highBuildings: InstancedMesh // 150-300m: 300棟
  private skyscrapers: InstancedMesh   // 300-800m: 100棟
  
  // 合計1500棟（従来の37.5%）
  
  createBuildings() {
    // 低層ビル（BoxGeometry 1つで500棟を描画）
    const lowGeo = new BoxGeometry(30, 40, 30)
    const lowMat = new MeshStandardMaterial({ 
      color: 0x404050,
      emissive: 0x1a1a3a,
      emissiveIntensity: 0.3
    })
    this.lowBuildings = new InstancedMesh(lowGeo, lowMat, 500)
    
    // 各建物の位置・スケールを設定
    for (let i = 0; i < 500; i++) {
      const matrix = new Matrix4()
      const x = (Math.random() - 0.5) * 10000
      const z = (Math.random() - 0.5) * 10000
      const y = this.getTerrainHeight(x, z)
      const height = 20 + Math.random() * 40
      
      matrix.makeScale(1, height / 40, 1)
      matrix.setPosition(x, y + height / 2, z)
      this.lowBuildings.setMatrixAt(i, matrix)
    }
  }
}
```

### メガストラクチャー

```typescript
// 巨大建造物（単体オブジェクト）
createMegastructures() {
  // 1. 中央タワー（800m）
  const centralTower = new CylinderGeometry(80, 120, 800, 12)
  const towerMat = new MeshStandardMaterial({
    color: 0x2a2a3a,
    emissive: 0x4a4aff,
    emissiveIntensity: 0.8
  })
  
  // 2. リングシティ（空中都市）
  const ringRadius = 1500
  const ringTube = new TorusGeometry(ringRadius, 40, 16, 32)
  
  // 3. ピラミッド型メガビル（600m）
  const pyramid = new ConeGeometry(200, 600, 4)
  
  // ... 計10個
}
```

### 空中道路（スカイウェイ）

```typescript
createSkyways() {
  // ビル間を繋ぐ空中道路（50本）
  for (let i = 0; i < 50; i++) {
    const x1 = (Math.random() - 0.5) * 8000
    const z1 = (Math.random() - 0.5) * 8000
    const x2 = x1 + (Math.random() - 0.5) * 500
    const z2 = z1 + (Math.random() - 0.5) * 500
    const y = 150 + Math.random() * 200
    
    const length = Math.sqrt((x2-x1)**2 + (z2-z1)**2)
    const angle = Math.atan2(z2-z1, x2-x1)
    
    const skyway = new BoxGeometry(length, 3, 30)
    const mat = new MeshStandardMaterial({
      color: 0x3a3a4a,
      emissive: 0xff6a00,
      emissiveIntensity: 0.5
    })
    
    mesh.position.set((x1+x2)/2, y, (z1+z2)/2)
    mesh.rotation.y = angle
  }
}
```

### ホログラム広告

```typescript
createHolograms() {
  // 発光する広告板（200枚）
  for (let i = 0; i < 200; i++) {
    const x = (Math.random() - 0.5) * 8000
    const z = (Math.random() - 0.5) * 8000
    const y = 50 + Math.random() * 150
    
    const billboard = new PlaneGeometry(40, 60)
    const mat = new MeshBasicMaterial({
      color: [0xff00ff, 0x00ffff, 0xff00aa][i % 3],
      transparent: true,
      opacity: 0.8,
      side: DoubleSide
    })
    
    mesh.position.set(x, y, z)
  }
}
```

### 配色（サイバーパンク）

```typescript
const neonColors = {
  cyan: 0x00ffff,
  magenta: 0xff00ff,
  orange: 0xff6a00,
  purple: 0x8a00ff,
  blue: 0x0044ff
}

// 建物はダークグレー + ネオン発光
// 地面は黒っぽいアスファルト
// 空中道路はオレンジ発光
```

---

## 実装順序

1. **オリジナルMAP改革**（60分）
   - terrainH関数を完全書き換え（20分）
   - 岩塔100本配置（15分）
   - 巨岩300個配置（15分）
   - 橋20本追加（10分）

2. **NEO東京MAP新規作成**（60分）
   - NeoTokyoMapSystemクラス作成（10分）
   - InstancedMesh実装（20分）
   - メガストラクチャー10個（15分）
   - 空中道路50本（10分）
   - ホログラム200枚（5分）

3. **テスト＆最適化**（10分）

**合計：130分**
