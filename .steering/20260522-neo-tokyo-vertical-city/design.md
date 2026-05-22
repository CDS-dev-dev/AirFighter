# NEO Tokyo 垂直都市MAP - 設計書

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────┐
│          NEO Tokyo Vertical City                │
│                 12km × 12km                     │
└─────────────────────────────────────────────────┘
         │
         ├─ Zone System (地区別クラスター)
         │   ├─ Core District (中心部 0-2km)
         │   │   └─ Ultra-High Towers: 1500-2500m
         │   ├─ Mid District (2-4km)
         │   │   └─ High-Rise: 800-1800m
         │   └─ Outer District (4-6km)
         │       └─ Mid-Rise: 400-1200m
         │
         ├─ Structure Layers (構造物レイヤー)
         │   ├─ Layer 1 (0-200m): 高架道路・地上構造
         │   ├─ Layer 2 (200-600m): ビル間連結橋
         │   └─ Layer 3 (600-2500m): 超高層・垂直塔
         │
         └─ Visual System (ビジュアル)
             ├─ Dynamic Neon (時間変化)
             ├─ Fog/Atmospheric (高度別)
             └─ Emissive Layers (発光強度)
```

## 地区構成（Zone System）

### Core District（中心部 半径0〜2km）
**テーマ：超密集垂直都市**

- **ビル高さ**：1500m〜2500m
- **密度**：300mグリッド、回廊30〜60m
- **特徴**：
  - 縦に長い細いビル（幅50〜100m）
  - ビル間連結橋が多数（高度200m〜1000m）
  - 垂直構造の巨大支柱（直径30m、高さ2200m）
- **飛行体験**：峡谷のような垂直空間、高速回避必須

### Mid District（中層部 半径2〜4km）
**テーマ：サイバーパンク繁華街**

- **ビル高さ**：800m〜1800m
- **密度**：400mグリッド、回廊40〜80m
- **特徴**：
  - 多様な形状（四角・L字・十字）
  - ネオン最強エリア（Shibuya/Shinjuku風）
  - 高架道路網（高度50m〜200m）
- **飛行体験**：ビル間を縫う飛行、中層に飛行ルート

### Outer District（外周部 半径4〜6km）
**テーマ：工業・港湾エリア**

- **ビル高さ**：400m〜1200m
- **密度**：600mグリッド、回廊80〜120m
- **特徴**：
  - 低層削除（400m未満は配置しない）
  - 巨大工業施設（横に広い）
  - お台場エリアは海上プラットフォーム
- **飛行体験**：開放的、スピード重視

## 構造物設計

### 1. 超高層ビル（Ultra-High Towers）
```typescript
// Core Districtに配置
{
  width: 50-100m,    // 細長い
  depth: 50-100m,
  height: 1500-2500m, // 2.5倍化
  spacing: 300m,      // 密集
  corridor: 30-60m    // 狭い回廊
}
```

### 2. ビル間連結橋（Sky Bridges）
```typescript
// 2つのビル間を接続
{
  width: 15-25m,
  height: 8-12m,
  length: 50-150m,
  altitude: [200, 400, 600, 800, 1000], // 複数階層
  frequency: 0.3  // 30%のビルペアに設置
}
```

### 3. 高架道路（Elevated Highways）
```typescript
// グリッド状に配置
{
  width: 40m,
  height: 3m,
  altitude: [50, 100, 150, 200], // 4層構造
  spacing: 1200m,  // 2グリッドごと
  lanes: 6
}
```

### 4. 垂直支柱（Mega Pillars）
```typescript
// ランドマーク的配置
{
  diameter: 30-50m,
  height: 2000-2500m,
  count: 12,  // マップ全体に
  style: 'cylindrical',
  features: ['platforms', 'lights', 'antenna']
}
```

## ビル削減・最適化戦略

### Before（現状）
- 総ビル数：700+
- 高さ範囲：130m〜850m
- 多数の低層ビル（130m〜300m）→ 処理負荷大

### After（改修後）
- 総ビル数：400〜500（削減）
- 高さ範囲：400m〜2500m
- **400m未満を全削除** → 処理負荷30%削減
- 高層化で視覚的インパクト増

### LOD実装（オプション）
```typescript
// 距離別簡略化
if (distance > 4000m) {
  detail = 'low'    // テクスチャ解像度下げる
} else if (distance > 2000m) {
  detail = 'medium'
} else {
  detail = 'high'
}
```

## サイバーパンク演出強化

### ネオン強化
```typescript
// 発光強度を上げる
emissiveIntensity: 0.28 → 0.5  // 1.8倍明るく

// 色をより鮮やかに
win: [0, 255, 200] → [0, 255, 240]  // 彩度UP

// 動的な明滅（オプション）
// 時間経過で明滅パターン
```

### 大気表現
```typescript
// 高度別フォグ
if (altitude < 300) {
  fog.color = dark_cyan
  fog.density = high
} else if (altitude < 1000) {
  fog.color = purple
  fog.density = medium
} else {
  fog.color = blue
  fog.density = low
}
```

## 衝突判定の最適化

### ビル衝突
- InstancedMeshの境界ボックス利用
- 粗い判定（AABB）→ 精密判定（OBB）の2段階

### 構造物衝突
- 連結橋・高架道路も衝突判定対象
- プレイヤー速度550m/s時、先読み距離100m

## 実装順序

### Phase 1: ビル配置改修（優先度：高）
1. 低層ビル削除（400m未満）
2. Core District超高層化（1500-2500m）
3. Mid/Outer District調整（800-1800m / 400-1200m）
4. 密度・回廊幅調整

### Phase 2: 構造物追加（優先度：高）
1. ビル間連結橋
2. 高架道路網
3. 垂直支柱

### Phase 3: ビジュアル強化（優先度：中）
1. ネオン強化
2. 大気表現
3. 発光パターン

### Phase 4: 最適化（優先度：中）
1. LOD実装
2. 衝突判定最適化
3. パフォーマンス計測

## テスト項目

- [ ] Core Districtを低空（100m）で飛行→回廊が狭く緊張感
- [ ] Mid Districtを中空（500m）で飛行→連結橋回避が必要
- [ ] Outer Districtを高空（1500m）で飛行→超高層が障害に
- [ ] ブースト時（550m/s）でも回避可能
- [ ] フレームレート：PC 60fps / Mobile 30fps維持
- [ ] 衝突判定：ビル・構造物すべて機能
- [ ] 敵AI：新しいマップでも正常動作

## 想定される課題

### パフォーマンス
- **対策**：低層削除（-30%）、LOD実装、インスタンシング維持

### 衝突判定の複雑化
- **対策**：2段階判定、空間分割（必要なら）

### 敵AIの挙動
- **対策**：敵の高度制御調整、衝突回避ロジック確認

### 視認性
- **対策**：ネオン強化、フォグで遠景を隠す

## 拡張性

将来的な追加要素：
- 動的な天候（雨・雷）
- ホログラム広告
- 飛行可能なビル内部空間
- 地下エリア（トンネル網）
