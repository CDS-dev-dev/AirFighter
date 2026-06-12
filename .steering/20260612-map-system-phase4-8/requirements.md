# Phase 4-8: MAP システム統一（追加改善）

## 実装日
2026-06-12

## 前提
Phase 1-3 (v5.54.0) で以下が完了:
- ✅ 境界システム統一
- ✅ ナビゲーションビーコン追加
- ✅ 固定砲台追加

## 残存する問題点

### Phase 4: 総力戦モードの不統一 🔴

**現状**:
```typescript
// line 2951-2953
modeObjectiveTotal = 17  // 3艦船 + 4戦車 + 2爆撃機 + 4SAM + 3ヘリ + 浮遊空母1
setObjective(`地上目標を破壊 0 / 17`)
spawnSouryokusen()  // Original/Tokyo共通
```

**問題**:
- Original/Tokyo MAPで同じ敵構成
  - 船3隻（海上配置） → Tokyo MAP（都市）で海上艦船は違和感
  - 世界観に合わない

**要求**:
- Tokyo MAP専用の総力戦関数 `spawnTokyoSouryokusen()` を実装
- 都市らしい敵構成:
  - 地上装甲車両（道路上）
  - ビル屋上SAM
  - 攻撃ヘリ（ビル間低空飛行）
  - 大型輸送機（爆撃ルート）
  - 司令部ビル（破壊目標）
  - 既存の砲台4基

---

### Phase 5: 補給システムの不統一 🟡

**現状**:
```typescript
// line 720-725 (Original MAPのみ)
const SUPPLY_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3( 920,  0,  0),
  new THREE.Vector3(-200,  0,  480),
  new THREE.Vector3(1200,  0, -380),
  new THREE.Vector3(-1080, 0, -720),
]

// line 3308-3312 (Space MAPのみ)
const SPACE_SUPPLY_POSITIONS = [
  new THREE.Vector3(-320, 240, -400),
  new THREE.Vector3(360, -40, -570),
  new THREE.Vector3(0, 120, 50),
]
```

**問題**:
- Tokyo MAPには補給ポイントがない
- Original MAPの補給ポイントが見えづらい（地形に埋もれる）

**要求**:
- Tokyo MAP専用の補給ポイント配置
  - ランドマーク付近（東京タワー、スカイツリー、新宿副都心）
  - 高度を適切に設定（ビル屋上レベル）
- Original MAPの補給ポイント位置を調整
  - 基地施設付近に配置（視認しやすい）

---

### Phase 6: Dogfightモードの目標数不統一 🟡

**現状**:
```typescript
// line 2834-2835
modeObjectiveTotal = 0  // Dogfightはスコアのみで目標数なし
setObjective('敵機を撃墜せよ — SCORE: 0')
```

**問題**:
- 実装はスコア制（目標数なし）だが、分析ドキュメントでは目標20機と記載
- 実際には問題なし（設計通り）

**要求**:
- 特に変更不要（現状維持）
- ただしTokyo MAPは大きいので初期敵数を増やす:
  - `dfEnemyCount` のMAP別調整
  - Tokyo: 初期5機 → 7機（Space並み）

---

### Phase 7: バージョン番号の不整合 🟢

**現状**:
```typescript
// package.json: "5.54.0"
// main.ts line 8: const VERSION = '5.29.0'
```

**問題**:
- バージョン番号が一致していない

**要求**:
- `main.ts` のVERSIONを `5.55.0` に更新
- `package.json` も `5.55.0` に更新（今回のリリース）

---

### Phase 8: パフォーマンス最適化 🟢

**現状**:
- `isMobileDevice` 判定が各所に散在
- 同じ条件を何度も評価

**問題**:
- コード可読性の低下
- わずかなパフォーマンスロス

**要求**:
- 設定を一元管理する `PERF_CONFIG` を作成
- `isMobileDevice` 判定を1箇所にまとめる

---

## 成功基準

### Phase 4
- [ ] Tokyo MAP総力戦で都市らしい敵が出現する
- [ ] Original MAP総力戦は現状維持
- [ ] Space MAP総力戦は現状維持

### Phase 5
- [ ] Tokyo MAPに補給ポイント3箇所追加
- [ ] Original MAPの補給ポイントを基地付近に再配置
- [ ] Space MAPは現状維持

### Phase 6
- [ ] Tokyo Dogfightで初期敵数が7機になる
- [ ] Original/Space Dogfightは現状維持

### Phase 7
- [ ] VERSIONが `5.55.0` になる
- [ ] package.jsonが `5.55.0` になる

### Phase 8
- [ ] PERF_CONFIGが作成される
- [ ] コードが読みやすくなる

---

## 実装順序

1. **Phase 7**: バージョン番号更新（1分）
2. **Phase 8**: パフォーマンス設定統一（10分）
3. **Phase 5**: 補給システム統一（30分）
4. **Phase 6**: Dogfight調整（10分）
5. **Phase 4**: Tokyo総力戦実装（2時間）

合計: 約3時間
