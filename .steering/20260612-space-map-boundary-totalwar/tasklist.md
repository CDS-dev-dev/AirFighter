# タスクリスト

## 完了済み

### Phase 1: ゲートブースト削除 & 3次元配置改善
- [x] ゲートブースト関連コードを削除
  - [x] updateSpaceGates関数
  - [x] playGateBoostSound関数
  - [x] spaceGateBoostTimer変数
  - [x] ゲート構造物生成（addGate関数）
  - [x] ゲートベースの方向キュー
- [x] ゾーン配置を3次元化
  - [x] Y軸を-1800〜+2000に拡張
  - [x] space_map_zones.jsonの更新
  - [x] 標準偏差比率の検証（目標: 3軸とも30%前後）

### Phase 2: MAP境界システム実装
- [x] SPACE_MAP_BOUNDS定数を定義
- [x] createMapBoundary関数を実装
  - [x] 6面×格子（200m間隔）
  - [x] LineSegmentsで生成
- [x] updateMapBoundary関数を実装
  - [x] 距離計算（各面への最短距離）
  - [x] フェードイン処理（300m→100m）
- [x] プレイヤーの境界制限
  - [x] 各軸で境界チェック
  - [x] 超えたら境界値に固定
- [x] 敵の境界制限
  - [x] updateEnemies内で同様の制限

### Phase 3: 総力戦モード実装
- [x] GroundTargetインターフェース拡張
  - [x] typeに'battleship'と'turret'を追加
  - [x] attachedTo, turretRotation フィールド追加
- [x] createBattleship関数を実装
  - [x] 船体、艦橋、主砲、エンジン光
  - [x] 4隻の配置座標決定
- [x] createTurret関数を実装
  - [x] 基部、砲塔、砲身、レーダー光
  - [x] 14基の配置座標決定（ゾーン相対）
- [x] spawnSpaceTotalWarEnemies関数を実装
  - [x] 戦艦配置ループ
  - [x] 砲台配置ループ
- [x] 総力戦モードの開始処理更新
  - [x] startGame関数のsouryokusenケース
  - [x] 目標数カウント（戦艦+砲台）
  - [x] 目標表示更新
- [x] 攻撃処理を実装
  - [x] 戦艦の主砲発射（updateGroundTargets内）
  - [x] 砲台のレーザー弾発射
  - [x] 砲塔回転アニメーション

### Phase 4: ビルド & リリース
- [x] TypeScript型チェック
  - [x] MAP_BOUNDS重複エラー修正（→SPACE_MAP_BOUNDS）
- [x] 本番ビルド
- [x] バージョン更新（5.51.0 → 5.52.0）
- [x] ドキュメント作成
  - [x] requirements.md
  - [x] design.md
  - [x] tasklist.md

## 今後の改善案（未実装）
- [ ] 戦艦の移動パターン（現在は静止）
- [ ] 砲台の破壊エフェクト強化
- [ ] 戦艦のHP表示（大型目標用）
- [ ] 総力戦のウェーブシステム（敵の増援）
- [ ] ゾーン制圧ボーナス（特定ゾーンの敵を全滅させると報酬）
