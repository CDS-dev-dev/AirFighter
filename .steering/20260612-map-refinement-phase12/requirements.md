# Phase 12: MAP構造の最終調整

## 実装日
2026-06-12

## バージョン
v5.58.0 → v5.59.0

## 目的
Phase 1-11で構築したMAP構造の細部を詰め、完成度を85% → 95%に引き上げる。

---

## 改善項目

### 1. 構造物バリエーション使い分け 🔴 高優先度
**現状**: small/medium/large モデルを生成したが、mediumしか使っていない

**改善**:
```typescript
// 奇岩: 高さに応じて使い分け
if (mono.h > 550) modelIndex = 2      // large
else if (mono.h > 480) modelIndex = 1 // medium
else modelIndex = 0                    // small

// 自然橋: スパンに応じて使い分け
if (bridge.span > 130) modelIndex = 2
else if (bridge.span > 110) modelIndex = 1
else modelIndex = 0

// 円筒ビル: 高さに応じて使い分け
if (tower.h > 420) modelIndex = 2
else if (tower.h > 380) modelIndex = 1
else modelIndex = 0

// リングステーション: 半径に応じて使い分け
if (ring.radius > 220) modelIndex = 2
else if (ring.radius > 190) modelIndex = 1
else modelIndex = 0

// アンテナ: 高さに応じて使い分け
if (ant.h > 320) modelIndex = 1 // large
else modelIndex = 0              // small
```

---

### 2. Space MAP: 構造物配置最適化 🟡
**現状**: 構造物が孤立している

**改善**: ゾーン別テーマ配置
```typescript
// 採掘コロニー周辺: 小惑星デブリ密集
const MINING_ZONE_CENTER = { x: -2000, y: -250, z: -1500 }
// この周辺に小惑星を追加配置

// 船墓場: 破損船体を集中配置
const GRAVEYARD_CENTER = { x: 2100, y: -200, z: -1600 }
// 既存のWRECKS配列を船墓場周辺に集中

// 軌道リング周辺: リングステーションを配置
const ORBITAL_RING_CENTER = { x: 0, y: 350, z: -2400 }
// RING_STATIONSをこの周辺に集中
```

---

### 3. Tokyo MAP: 高架道路配置改善 🟡
**現状**: 4000mの完全直線

**改善**: カーブとジャンクション
```typescript
// 北側高架道路（カーブ）
const HIGHWAY_NORTH = [
  { x: -2000, z: -1500 },
  { x: -500, z: -1500 },  // カーブ開始
  { x: 500, z: -1400 },   // カーブ中
  { x: 2000, z: -1300 },  // カーブ終了
]

// 東側高架道路（カーブ）
const HIGHWAY_EAST = [
  { x: 1500, z: -2000 },
  { x: 1500, z: -500 },
  { x: 1600, z: 500 },
  { x: 1500, z: 2000 },
]

// ジャンクション（交差点）
const JUNCTION = { x: 1500, z: -1500, radius: 100 }
```

---

### 4. Original MAP: 地形メリハリ（標高別植生） 🟡
**現状**: 全標高に木が生える

**改善**:
```typescript
// 現状の樹木配置条件
if (ty > 800 || treeSlope > 6.0 || ...) { i--; continue }

// 改善後
if (ty > 500) { i--; continue }  // 高地には木を生やさない
if (ty < 4) { i--; continue }     // 水面下にも生やさない

// 低地（0-200m）: 密林
// 中腹（200-500m）: まばらな木
if (ty > 200 && Math.random() < 0.6) { i--; continue }

// 峡谷底に川を追加
if (crossX < 50 && Math.abs(z) > 300) {
  // 川のメッシュ配置
}
```

---

### 5. Space MAP: 小惑星フィールド改善 🟡
**現状**: ランダム配置、単一形状

**改善**: クラスター配置
```typescript
// 既存のランダム配置に加えて、クラスター配置を追加
const ASTEROID_CLUSTERS = [
  { x: -1500, y: 100, z: -1000, count: 200, radius: 300 },
  { x: 1000, y: -200, z: 800, count: 150, radius: 250 },
  { x: -800, y: 400, z: 1200, count: 180, radius: 280 },
]

for (const cluster of ASTEROID_CLUSTERS) {
  for (let i = 0; i < cluster.count; i++) {
    // クラスター中心からの相対座標
    const offsetX = (Math.random() - 0.5) * cluster.radius
    const offsetY = (Math.random() - 0.5) * cluster.radius
    const offsetZ = (Math.random() - 0.5) * cluster.radius
    // 小惑星配置
  }
}
```

---

### 6. Tokyo MAP: 高架道路GLB化 🟢
**現状**: BoxGeometry

**改善**: Blender製GLB
```python
# blender_scripts/generate_elevated_highway.py
# 支柱構造付き高架道路セグメント（100m単位）
```

---

### 7. Original MAP: 洞窟改善 🟢
**現状**: 滑らかなTorusGeometry

**改善**: 不規則な洞窟入口
```python
# blender_scripts/generate_cave_entrance.py
# 不規則な岩の洞窟入口
```

---

### 8. Tokyo MAP: ビル密度向上 🟢
**現状**: 周辺部がスカスカ

**改善**: 低層ビル追加
```typescript
// 周辺部に低層ビル（100-200m）を追加
const PERIPHERAL_BUILDINGS = []
for (let x = -4000; x < 4000; x += 200) {
  for (let z = -4000; z < 4000; z += 200) {
    // 中心部を避ける
    if (Math.hypot(x, z) < 2000) continue
    // 低層ビル配置
    PERIPHERAL_BUILDINGS.push({ x, z, h: 100 + Math.random() * 100 })
  }
}
```

---

## 実装タスク

### Task 1: 構造物バリエーション使い分け（30分）
- main.ts: 奇岩、自然橋
- main.ts: リングステーション、アンテナ
- neoTokyoMapSystem.ts: 円筒ビル

### Task 2: Space 構造物配置最適化（20分）
- main.ts: RING_STATIONS座標をゾーン中心に調整
- main.ts: WRECKS座標を船墓場に集中
- main.ts: 小惑星クラスター追加配置

### Task 3: Tokyo 高架道路配置改善（30分）
- neoTokyoMapSystem.ts: カーブ・ジャンクション対応

### Task 4: Original 地形メリハリ（20分）
- main.ts: 樹木配置条件を標高別に調整

### Task 5: Space 小惑星クラスター（15分）
- main.ts: クラスター配置ロジック追加

### Task 6: Tokyo 高架道路GLB化（30分）
- Blenderスクリプト作成
- GLB生成
- コード置き換え

### Task 7: Original 洞窟GLB化（20分）
- Blenderスクリプト作成
- GLB生成
- コード置き換え

### Task 8: Tokyo ビル密度向上（20分）
- neoTokyoMapSystem.ts: 周辺部ビル追加

---

## 成功基準

### Task 1: 構造物バリエーション
- [ ] 奇岩が3種類のモデルで表示される
- [ ] 自然橋が3種類のモデルで表示される
- [ ] 円筒ビルが3種類のモデルで表示される
- [ ] リングステーションが3種類のモデルで表示される
- [ ] 視覚的に単調さが解消される

### Task 2: Space 配置最適化
- [ ] 破損船体が船墓場に集中している
- [ ] リングステーションが軌道リング周辺にある
- [ ] ゾーンごとのテーマ性が感じられる

### Task 3: 高架道路配置
- [ ] カーブが自然に見える
- [ ] ジャンクションがある
- [ ] 直線的すぎる印象が解消される

### Task 4: 地形メリハリ
- [ ] 高地（500m-）に木がない
- [ ] 低地に森林が密集している
- [ ] 標高による変化が感じられる

### Task 5: 小惑星クラスター
- [ ] 小惑星が密集しているエリアがある
- [ ] ランダム配置との違いが分かる
- [ ] 戦術的に使える密集地

### Task 6-8: GLB化・密度向上
- [ ] 高架道路に支柱構造がある
- [ ] 洞窟入口が不規則
- [ ] Tokyo周辺部にビルがある

---

## 期待される効果

1. **視覚的多様性**: 同じ構造物でも形状が異なる
2. **世界観の説得力**: ゾーンごとのテーマ性
3. **飛行体験の向上**: 地形メリハリで飛行ルートが明確
4. **完成度**: 85% → 95%

---

## 実装順序
1. Task 1: バリエーション使い分け（即効性高）
2. Task 4: 地形メリハリ（視覚的効果大）
3. Task 2: Space配置最適化（世界観向上）
4. Task 5: 小惑星クラスター（視覚的効果）
5. Task 3: 高架道路配置（視覚的改善）
6. Task 6-8: GLB化・密度向上（時間があれば）

合計: 約3時間
