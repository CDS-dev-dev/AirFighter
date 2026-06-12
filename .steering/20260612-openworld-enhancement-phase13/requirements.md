# Phase 13: オープンワールド完成度向上

## 実装日
2026-06-12

## バージョン
v5.59.0 → v5.60.0

## 目的
MAPの物理構造（87%完成）を、オープンワールドゲームとして魅力的な世界（95%完成）に引き上げる。

---

## 改善項目

### 1. ランドマークの強化 🔴 高優先度

#### Original MAP: 巨大奇岩「タイタンピーク」
**現状**: 最大奇岩600m

**改善**: 圧倒的スケールのランドマーク
```typescript
const TITAN_PEAK = {
  x: 0, y: 0, z: 0,
  h: 1200,  // 高さ1200m（既存の2倍）
  radius: 150,  // 太さも倍増
  name: "Titan Peak"
}
// MAP中央に配置、全域から視認可能
// 頂上に到達報酬（後述）
```

#### Tokyo MAP: 「メガタワー」
**現状**: 最大ビル450m

**改善**: 超高層複合ビル
```typescript
const MEGA_TOWER = {
  x: 0, y: 0, z: 0,
  h: 800,  // 高さ800m
  radius: 80,  // 太さ80m
  floors: 160,  // 160階建て
  heliports: 5,  // ヘリポート5箇所
  name: "Neo Tokyo Mega Tower"
}
// 展望台フロア（300m, 500m, 750m）
// 内部飛行可能な吹き抜けアトリウム
```

#### Space MAP: 「マザーシップ残骸」
**現状**: 最大要塞400×300×200m

**改善**: 超巨大戦艦残骸
```typescript
const MOTHERSHIP_WRECK = {
  x: 0, y: -500, z: -3000,  // MAP奥深く
  length: 1500,  // 全長1500m
  width: 400,   // 幅400m
  height: 300,  // 高さ300m
  name: "Mothership Ark Nova"
}
// 船体内部飛行可能
// ブリッジ、エンジンルーム、ハンガーデッキ
```

---

### 2. 探索報酬の追加 🔴 高優先度

#### コレクティブル「記憶の欠片」
**概念**: MAP各所に配置された収集アイテム

**実装**:
```typescript
// データ構造
interface Collectible {
  id: string
  position: { x: number, y: number, z: number }
  mapName: string
  difficulty: 'easy' | 'medium' | 'hard' | 'expert'
  description: string
  lore: string  // ストーリー断片
}

// 配置例（Original MAP: 20個）
const ORIGINAL_COLLECTIBLES = [
  // Easy（平地、見つけやすい場所）: 8個
  { id: 'ori_001', position: { x: -500, y: 50, z: 300 }, difficulty: 'easy', lore: '...' },
  
  // Medium（中腹、奇岩周辺）: 7個
  { id: 'ori_008', position: { x: 920, y: 400, z: 100 }, difficulty: 'medium', lore: '...' },
  
  // Hard（洞窟内部、峡谷深部）: 4個
  { id: 'ori_015', position: { x: -300, y: 30, z: 600 }, difficulty: 'hard', lore: '...' },
  
  // Expert（タイタンピーク頂上）: 1個
  { id: 'ori_020', position: { x: 0, y: 1200, z: 0 }, difficulty: 'expert', lore: '...' },
]

// Tokyo MAP: 25個（ビル屋上、高架道路、地下）
// Space MAP: 30個（要塞内部、船墓場、小惑星クラスター）
```

**視覚表現**:
- 半透明の光る球体（直径5m）
- パルス発光（1秒周期）
- 接近時に回転開始
- 取得時にパーティクルエフェクト

**UI実装**:
```typescript
// 収集状況表示
interface CollectionProgress {
  total: number
  collected: number
  byDifficulty: {
    easy: { total: number, collected: number },
    medium: { total: number, collected: number },
    hard: { total: number, collected: number },
    expert: { total: number, collected: number },
  }
}

// ESCメニューに「コレクション」タブ追加
// 各MAPごとの収集率表示
// 未取得の場所にヒント表示（Hard以上は取得後に次のヒント解放）
```

---

### 3. ストーリー性の追加 🟡 中優先度

#### 背景設定の可視化

**Original MAP: 古代文明遺跡**
```typescript
// 奇岩に彫刻・文様を追加（テクスチャ）
// 自然橋に「人工的な加工痕」
// 洞窟内部に壁画（Blenderで作成）

const ANCIENT_RUINS = [
  { type: 'pillar', x: -800, y: 0, z: -600, h: 150, inscription: true },
  { type: 'altar', x: 300, y: 50, z: 400, scale: 30 },
  { type: 'obelisk', x: -200, y: 0, z: 800, h: 80 },
]
```

**Tokyo MAP: 崩壊の痕跡**
```typescript
// 一部ビルに損壊表現
// 避難標識、警告看板
// 放棄された車両、ヘリコプター

const ABANDONED_VEHICLES = [
  { type: 'car', x: -1200, y: 0, z: 300, count: 15 },
  { type: 'helicopter', x: 500, y: 350, z: -800, crashed: true },
  { type: 'truck', x: -600, y: 0, z: -400, count: 8 },
]
```

**Space MAP: 戦闘の記録**
```typescript
// 弾痕、爆発痕
// 漂流する脱出ポッド
// 戦闘機の残骸（小型、10m級）

const BATTLE_DEBRIS = [
  { type: 'escape_pod', x: -1000, y: 200, z: -500, count: 12 },
  { type: 'fighter_wreck', x: 1500, y: -300, z: 800, count: 8 },
  { type: 'missile_debris', x: -500, y: 100, z: 1200, count: 20 },
]
```

---

### 4. スケール感の強化 🔴 高優先度

**巨大構造物の追加**（上記1.ランドマーク参照）

**遠景描画の最適化**:
```typescript
// LOD（Level of Detail）システム
// 距離に応じてモデル簡略化
const LOD_LEVELS = [
  { distance: 0, model: 'high' },      // 0-1000m
  { distance: 1000, model: 'medium' }, // 1000-3000m
  { distance: 3000, model: 'low' },    // 3000-5000m
  { distance: 5000, model: 'billboard' }, // 5000m-（2Dテクスチャ）
]
```

**スケール感演出**:
```typescript
// 飛行速度に応じた視野角変更（FOV調整）
// 構造物接近時のカメラシェイク
// 巨大構造物の影（動的シャドウ）
```

---

### 5. 密度のムラ解消 🟡 中優先度

#### Tokyo MAP: 周辺部ビル密度向上
**現状**: 中心部のみ密集

**改善**:
```typescript
// Phase 12で保留したTask 8を実装
const PERIPHERAL_BUILDINGS = []
for (let x = -4000; x < 4000; x += 150) {
  for (let z = -4000; z < 4000; z += 150) {
    const dist = Math.hypot(x, z)
    // 中心部（2000m以内）をスキップ
    if (dist < 2000) continue
    // 外周部（3500m以上）もスキップ
    if (dist > 3500) continue
    
    // 低層ビル（80-200m）
    const h = 80 + Math.random() * 120
    PERIPHERAL_BUILDINGS.push({ x, z, h, type: 'residential' })
  }
}
// 約250棟追加（既存120棟 + 250棟 = 370棟）
```

#### Original MAP: 中腹～高地の密度向上
**現状**: 低地は密林、高地は岩肌のみ

**改善**:
```typescript
// 高地（500-800m）に高山植物的な植生
// 灌木、低木、草地
const HIGH_ALTITUDE_VEGETATION = {
  shrubs: 500,   // 低木500本
  grass_patches: 200,  // 草地パッチ200個
}

// 中腹（200-500m）の岩配置
const MIDSLOPE_ROCKS = 300  // 中型岩300個
```

#### Space MAP: 外周部の構造物追加
**現状**: MAP中心部のみ密集

**改善**:
```typescript
// 外周部に通信衛星、観測ステーション
const OUTER_STRUCTURES = [
  { type: 'comm_satellite', x: -3000, y: 500, z: -2000, scale: 30 },
  { type: 'observatory', x: 2800, y: -400, z: 2500, scale: 40 },
  { type: 'relay_station', x: -2500, y: 300, z: 3000, scale: 35 },
  // ... 計15個
]
```

---

### 6. 接続性・動線の改善 🟡 中優先度

#### Original MAP: 自然橋の増設
**現状**: 3本のみ

**改善**:
```typescript
// 主要地点を結ぶ自然橋を追加
const ADDITIONAL_BRIDGES = [
  { x1: -800, z1: -600, x2: -400, z2: -300, span: 450, y: 250 },
  { x1: 600, z1: 400, x2: 900, z2: 700, span: 380, y: 300 },
  { x1: -300, z1: 800, x2: 200, z2: 1000, span: 520, y: 200 },
]
// 計6本（既存3本 + 新規3本）
```

#### Tokyo MAP: 高架道路のネットワーク化
**現状**: 4本の独立した直線道路

**改善**:
```typescript
// ジャンクション（交差点）追加
const JUNCTIONS = [
  { x: 0, z: -1500, radius: 80, connections: ['north', 'east'] },
  { x: 1500, z: 0, radius: 80, connections: ['east', 'south'] },
]

// 環状高架道路（外周）
const RING_HIGHWAY = {
  center: { x: 0, z: 0 },
  radius: 2500,
  segments: 32,  // 32セグメントの円形
  y: 180,
}
```

#### Space MAP: 軌道パス
**現状**: 構造物間に明確なルートなし

**改善**:
```typescript
// 推奨飛行ルート（視覚的ガイド）
const ORBITAL_PATHS = [
  { name: 'Main Route', points: [
    { x: 0, y: 0, z: 0 },           // 中央ハブ
    { x: 0, y: 350, z: -2400 },     // 軌道リング
    { x: 2100, y: -200, z: -1600 }, // 船墓場
    { x: -2300, y: -1800, z: -400 },// 採掘コロニー
    { x: 600, y: -800, z: -2400 },  // 要塞
  ]},
]
// パス上に誘導ビーコン配置（光の軌跡）
```

---

## 実装タスク

### Task 1: ランドマーク追加（60分）🔴
- Blenderでタイタンピーク、メガタワー、マザーシップ残骸を生成
- main.ts、neoTokyoMapSystem.tsに配置コード追加
- LODシステム実装

### Task 2: コレクティブル実装（90分）🔴
- コレクティブルシステム実装（配置、当たり判定、取得処理）
- 全MAP合計75個配置（Original: 20, Tokyo: 25, Space: 30）
- UI実装（収集状況表示、ヒントシステム）
- LocalStorage保存

### Task 3: ストーリー要素追加（45分）🟡
- 古代遺跡モデル生成（Blender）
- 放棄車両モデル生成
- 戦闘デブリモデル生成
- 配置コード実装

### Task 4: 密度向上（60分）🟡
- Tokyo周辺部ビル250棟追加
- Original高地植生500本追加
- Space外周構造物15個追加

### Task 5: 接続性改善（45分）🟡
- Original自然橋3本追加
- Tokyo環状高架道路実装
- Space軌道パス可視化

---

## 成功基準

### Task 1: ランドマーク
- [ ] タイタンピーク（1200m）がMAP全域から視認できる
- [ ] メガタワー（800m）が都市の中心として機能
- [ ] マザーシップ残骸（1500m）の内部飛行が可能

### Task 2: コレクティブル
- [ ] 全75個が適切な難易度で配置されている
- [ ] 取得時にエフェクトとサウンドが発生
- [ ] 収集状況がUIで確認できる
- [ ] 取得状態がセーブされる

### Task 3: ストーリー要素
- [ ] 各MAPに世界観を感じさせる要素がある
- [ ] 探索時に「発見」の楽しさがある

### Task 4: 密度向上
- [ ] Tokyo全域で都市感がある
- [ ] Original高地が単調でない
- [ ] Space外周部に探索価値がある

### Task 5: 接続性
- [ ] 主要地点間の移動が直感的
- [ ] 飛行ルートに「流れ」がある

---

## 期待される効果

1. **探索動機の向上**: コレクティブルにより「隅々まで探索したくなる」
2. **ランドマーク効果**: 「あそこに行きたい」と思わせる目標の明確化
3. **世界観の深化**: ストーリー要素により没入感向上
4. **リプレイ性向上**: 収集要素によるやり込み要素
5. **スケール感の実現**: 巨大構造物により圧倒的な世界観

---

## 実装順序
1. Task 1: ランドマーク追加（視覚的インパクト最大）
2. Task 2: コレクティブル実装（探索動機づけ）
3. Task 4: 密度向上（世界の充実感）
4. Task 5: 接続性改善（動線の最適化）
5. Task 3: ストーリー要素（仕上げ）

合計: 約5時間

---

## ビルド後の完成度予測

- **ランドマーク**: 60% → 95%
- **探索価値**: 50% → 90%
- **世界観の説得力**: 85% → 95%
- **密度**: 75% → 90%
- **総合（オープンワールドとして）**: 75% → **95%**
