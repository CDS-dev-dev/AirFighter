# MAP システム横断改善提案

## 現状分析

### MAP別の特徴

| MAP | サイズ | 境界システム | 地形 | 敵タイプ |
|-----|--------|-------------|------|---------|
| Original | 8.6km × 8.6km | warningMarginのみ | プロシージャル地形 | 航空機のみ |
| Tokyo | 13.6km × 13.6km | warningMarginのみ | ビル群 | 航空機のみ |
| Space | 6km × 6km × 0.9km | 硬い境界＋格子 | 小惑星 | 航空機＋戦艦＋砲台 |

## 発見された不整合

### 1. 境界システムの不統一 ⚠️ **最重要**

**問題**:
- **Original/Tokyo**: `warningMargin`のみ（境界が見えない、超えられる）
- **Space**: 硬い境界＋格子表示（境界が見える、超えられない）

**影響**:
- Original/Tokyoで無限に飛んでいけてしまう
- 境界を超えるとwarningMargin外でも特にペナルティなし
- プレイヤー体験が不統一

**改善提案**:
```typescript
// 全MAPで統一した境界システム
interface MapBoundarySystem {
  hardBoundary: boolean        // 硬い境界（超えられない）
  gridVisualization: boolean   // 格子表示
  fadeInDistance: number       // 格子のフェードイン距離
  warningDistance: number      // 警告表示距離
}

const BOUNDARY_CONFIG: Record<GameMap, MapBoundarySystem> = {
  original: {
    hardBoundary: true,
    gridVisualization: true,   // 格子を追加
    fadeInDistance: 500,
    warningDistance: 800
  },
  tokyo: {
    hardBoundary: true,
    gridVisualization: true,   // 格子を追加
    fadeInDistance: 700,
    warningDistance: 1000
  },
  space: {
    hardBoundary: true,         // 既存
    gridVisualization: true,    // 既存
    fadeInDistance: 300,
    warningDistance: 400
  }
}
```

### 2. 敵タイプの不均衡

**問題**:
- **Original/Tokyo**: Dogfightモードで航空機のみ
- **Space**: Dogfightで航空機、総力戦で戦艦＋砲台

**改善提案**:
- **Original**: 総力戦に地上目標（既存）+ 固定砲台を追加
  - 岩柱・アーチに砲台を配置
  - 防衛拠点のような演出
  
- **Tokyo**: 総力戦にビル屋上砲台を追加
  - 高層ビルの屋上に対空砲
  - 都市防衛戦の雰囲気

### 3. MAPサイズの不統一

**問題**:
- Original: 8.6km（基準）
- Tokyo: 13.6km（1.58倍）← 大きすぎる？
- Space: 6km（0.7倍）← 小さすぎる？

**考察**:
- **Tokyo大きい理由**: 都市の広がり感、ランドマーク間の距離
- **Space小さい理由**: 3D空間（Y軸も使う）、密度重視

**改善不要**: 各MAPの世界観に合ったサイズ
- ただし、プレイヤーが迷わないようナビゲーション強化は検討

### 4. ナビゲーションシステムの不統一

**問題**:
- **Original**: ミニマップのみ
- **Tokyo**: ミニマップのみ
- **Space**: ミニマップ＋ゾーンビーコン＋方向キュー＋ゾーン名表示

**改善提案**:
- **Original**: 主要構造物（岩柱、アーチ）にビーコン追加
- **Tokyo**: ランドマーク（東京タワー、スカイツリーなど）にビーコン追加

### 5. 総力戦モードの目標タイプ不統一

**現状**:
```
Original総力戦: 船3 + 戦車4 + 爆撃機2 + SAM4 + ヘリ3 + 空母1 = 17目標
Tokyo総力戦:    同上（座標のみ異なる）
Space総力戦:    戦艦4 + 砲台14 + 航空機7 = 25敵（目標18）
```

**改善提案**: 各MAPの特色を活かす
- **Original**: 地上＋空中の混成部隊（現状維持）
- **Tokyo**: 地上＋ビル屋上砲台
- **Space**: 宇宙艦隊＋固定砲台（現状維持）

## 優先度付き実装ロードマップ

### Phase 1: 境界システム統一 🔴 **最優先**
**目的**: 全MAPで一貫したプレイヤー体験

**タスク**:
1. Original/Tokyoに硬い境界を追加
2. Original/Tokyoに格子表示を追加
3. 境界制限コードをMAP共通化

**工数**: 2-3時間
**影響**: 大（ゲームプレイの根幹）

### Phase 2: ナビゲーション強化 🟡
**目的**: プレイヤーが迷わない

**タスク**:
1. Originalに構造物ビーコン追加
2. Tokyoにランドマークビーコン追加
3. ミニマップの視認性向上（共通）

**工数**: 3-4時間
**影響**: 中（UX改善）

### Phase 3: 敵タイプ追加 🟢
**目的**: 各MAPの戦術的深さ

**タスク**:
1. Original総力戦に岩柱砲台追加
2. Tokyo総力戦にビル屋上砲台追加
3. バランス調整

**工数**: 4-5時間
**影響**: 中（コンテンツ拡充）

## 設計原則（今後のMAP追加時）

### 1. 境界システム
- ✅ 全MAPで硬い境界（プレイヤー・敵が超えられない）
- ✅ 格子表示（近づくとフェードイン）
- ✅ 距離ベースの透明度制御

### 2. ナビゲーション
- ✅ 主要地点にビーコン配置
- ✅ ミニマップで確認可能
- ✅ 画面外の重要地点に方向キュー

### 3. 敵配置
- ✅ Dogfightモード: 航空機中心
- ✅ 総力戦モード: MAPの特色を活かした多様な敵
  - 地上MAP: 地上目標＋固定砲台
  - 空中MAP: 大型飛行物体＋固定砲台
  - 宇宙MAP: 宇宙艦隊＋固定砲台

### 4. MAPサイズ
- ✅ 世界観に合わせて調整（統一不要）
- ✅ ただしナビゲーションで迷わせない

## 技術的考慮事項

### 境界格子の統一実装

```typescript
// MAP別の格子パラメータ
interface GridConfig {
  spacing: number      // 格子間隔
  color: number        // 色
  opacity: number      // 最大透明度
}

const GRID_CONFIG: Record<GameMap, GridConfig> = {
  original: { spacing: 300, color: 0x88ff44, opacity: 0.6 },  // 緑
  tokyo: { spacing: 400, color: 0xff4488, opacity: 0.6 },     // ピンク
  space: { spacing: 200, color: 0xff6600, opacity: 0.7 }      // オレンジ
}

function createMapBoundaryGrid(map: GameMap) {
  const bounds = MAP_BOUNDS[map]
  const config = GRID_CONFIG[map]
  // ... 実装
}
```

### パフォーマンス

**懸念**: 3つのMAP全てに格子を追加すると重い？

**対策**:
- LineSegmentsで軽量実装（既存実装と同じ）
- フェードイン範囲でのみ描画（カリング）
- モバイルでは格子密度を下げる

```typescript
const spacing = isMobileDevice ? config.spacing * 2 : config.spacing
```

## まとめ

### 最重要改善点
1. **境界システムの統一** - Original/Tokyoにも格子境界を追加
2. ナビゲーションの強化 - 構造物・ランドマークのビーコン
3. 敵タイプの追加 - 各MAPに固定砲台

### 実装優先順位
1. 🔴 Phase 1: 境界システム統一（2-3時間）
2. 🟡 Phase 2: ナビゲーション強化（3-4時間）
3. 🟢 Phase 3: 敵タイプ追加（4-5時間）

### 期待される効果
- ✅ 一貫したプレイヤー体験
- ✅ MAPごとの戦術的深さ
- ✅ 迷いにくいナビゲーション
- ✅ 将来のMAP追加時の設計指針明確化
