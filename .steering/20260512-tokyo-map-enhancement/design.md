# 東京MAP強化 - 設計書

## 1. 地形（高低）の実装

### 実際の東京の地形
```
西側（山の手）：標高40-60m
├─ 新宿・渋谷エリア：40-50m
├─ 目黒・品川エリア：30-40m
└─ 世田谷エリア：30-50m

中央部（武蔵野台地）：標高20-30m

東側（下町）：標高0-10m
├─ 隅田川沿い：0-5m
├─ 江戸川区：0-5m
└─ 墨田区・台東区：5-10m
```

### 実装方法
```typescript
function getTokyoTerrainHeight(x: number, z: number): number {
  // 基準点：中心を皇居（標高20m）に設定
  
  // 西側ほど高い（山の手台地）
  const westSlope = Math.max(0, -x * 0.015)  // 西に行くほど標高UP
  
  // 多摩丘陵（西部の丘陵地帯）
  const tamaHills = Math.max(0, (-x - 3000) * 0.03) * 
                    Math.exp(-Math.abs(z) / 2000)
  
  // 東側は低地
  const eastLowland = x > 0 ? -x * 0.008 : 0
  
  // 武蔵野台地の基準高度
  const baseHeight = 20
  
  return baseHeight + westSlope + tamaHills + eastLowland
}
```

## 2. 建物配置戦略

### 密度マップ
```
[超密集] 都心3区（千代田・中央・港）：300棟/km²
[密集] 副都心（新宿・渋谷・池袋）：250棟/km²
[高密度] 商業地：180棟/km²
[中密度] 住宅地：120棟/km²
[低密度] 郊外：80棟/km²
```

### 地区分類
```typescript
const districtTypes = {
  // 都心部（超高層）
  chiyoda: { center: [800, 1200], radius: 600, density: 300, height: [150, 280] },
  minato: { center: [1800, -200], radius: 700, density: 280, height: [120, 260] },
  
  // 副都心（高層）
  shinjuku: { center: [-2000, 800], radius: 700, density: 250, height: [80, 240] },
  shibuya: { center: [0, 0], radius: 500, density: 260, height: [100, 220] },
  ikebukuro: { center: [-1800, 2800], radius: 600, density: 240, height: [80, 200] },
  
  // 住宅地（低層密集）
  setagaya: { center: [-2800, -800], radius: 1200, density: 120, height: [20, 60] },
  nerima: { center: [-4200, 3800], radius: 1000, density: 110, height: [20, 55] },
  ota: { center: [1500, -3800], radius: 1100, density: 130, height: [25, 65] },
  // ... 計20-25地区
}
```

## 3. 公園・緑地の実装

### 大規模公園（樹木を配置）
```typescript
const majorParks = [
  {
    name: '新宿御苑',
    center: [-1500, 500],
    size: [580, 350],
    trees: 200,  // 樹木数
    color: 0x2a5a2a  // 濃い緑
  },
  {
    name: '代々木公園',
    center: [-800, 200],
    size: [540, 400],
    trees: 250,
    color: 0x3a6a3a
  },
  {
    name: '井の頭公園',
    center: [-4500, 400],
    size: [430, 380],
    trees: 180,
    pond: true  // 池あり
  },
  // ... 計15-20箇所
]
```

### 樹木の実装
```typescript
function createTree(height: number): THREE.Group {
  const tree = new THREE.Group()
  
  // 幹
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.4, height * 0.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x4a3020 })
  )
  trunk.position.y = height * 0.2
  
  // 葉（3段の円錐）
  const foliageColor = 0x2a5520
  for (let i = 0; i < 3; i++) {
    const foliage = new THREE.Mesh(
      new THREE.ConeGeometry(height * 0.15, height * 0.3, 8),
      new THREE.MeshStandardMaterial({ color: foliageColor })
    )
    foliage.position.y = height * (0.5 + i * 0.15)
    tree.add(foliage)
  }
  
  tree.add(trunk)
  return tree
}
```

### 街路樹
主要道路沿いに30-50m間隔で配置

## 4. 地面の色分け

```typescript
function getGroundColor(x: number, z: number): number {
  // 公園内か判定
  if (isInPark(x, z)) return 0x2a5a2a  // 緑
  
  // 道路か判定
  if (isOnRoad(x, z)) return 0x2a2a2e  // 暗灰色
  
  // 河川か判定
  if (isInRiver(x, z)) return 0x1a3a5a  // 青
  
  // 建物密度で判定
  const density = getBuildingDensity(x, z)
  if (density > 200) return 0x606060  // 都心（グレー）
  if (density > 100) return 0x707070  // 商業地（明るいグレー）
  return 0x505050  // 住宅地（やや暗いグレー）
}
```

## 5. パフォーマンス最適化

### InstancedMesh適用
```typescript
// 同じ高さ・形状の建物をグループ化
const buildingGroups = {
  low: [],      // 20-60m
  medium: [],   // 60-120m
  high: [],     // 120-200m
  skyscraper: [] // 200-300m
}

// 各グループをInstancedMeshで描画
for (const [type, buildings] of Object.entries(buildingGroups)) {
  const instancedMesh = new THREE.InstancedMesh(
    geometry,
    material,
    buildings.length
  )
  // 位置・回転・スケールを設定
}
```

### LOD設定
```typescript
camera.far = 8000  // 8km以遠は描画しない
// 距離に応じて詳細度を変更
```

## 実装順序

1. **Phase 1**: 地形高低の実装（1時間）
2. **Phase 2**: 建物密度の均一化（2時間）
3. **Phase 3**: 大規模公園15箇所の追加（1.5時間）
4. **Phase 4**: 街路樹の配置（1時間）
5. **Phase 5**: 地面の色分け（1時間）
6. **Phase 6**: パフォーマンステスト＆最適化（1時間）

**合計見積もり**: 7.5時間
