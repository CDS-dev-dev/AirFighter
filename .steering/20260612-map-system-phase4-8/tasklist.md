# Phase 4-8 タスクリスト

## Phase 7: バージョン番号統一 ✅
- [x] main.ts の VERSION を 5.55.0 に更新
- [x] package.json の version を 5.55.0 に更新

## Phase 8: パフォーマンス設定統一 ✅
- [x] PERF_CONFIG オブジェクトを作成
- [x] renderer.setPixelRatio を PERF_CONFIG.pixelRatio に変更
- [x] renderer.shadowMap.enabled を PERF_CONFIG.shadowEnabled に変更
- [x] sky の表示判定を PERF_CONFIG.skyEnabled に変更

## Phase 5: 補給システム統一 ✅
- [x] ORIGINAL_SUPPLY_POSITIONS を定義（基地付近）
- [x] TOKYO_SUPPLY_POSITIONS を定義（ランドマーク付近）
- [x] switchMap('tokyo') で TOKYO_SUPPLY_POSITIONS に更新
- [x] switchMap('original') で ORIGINAL_SUPPLY_POSITIONS に更新
- [x] switchMap('space') で SPACE_SUPPLY_POSITIONS に更新（既存）

## Phase 6: Dogfight目標数調整 ✅
- [x] DOGFIGHT_INITIAL_ENEMIES を定義
- [x] original: 5機
- [x] tokyo: 7機
- [x] space: 7機
- [x] startGame('dogfight') で DOGFIGHT_INITIAL_ENEMIES を使用

## Phase 4: Tokyo総力戦実装 ✅
- [x] spawnTokyoSouryokusen() 関数を作成
- [x] 空中敵機 x5 スポーン
- [x] 地上装甲車両 x6 配置（道路上）
- [x] ビル屋上SAM x5 配置
- [x] 攻撃ヘリ x4 配置（旋回哨戒）
- [x] 大型輸送機 x2 配置（高度300m、東進）
- [x] 司令部ビル（BOSS） x1 配置（東京タワー）
- [x] 固定砲台 x4 配置（Phase 3実装再利用）
- [x] 目標数を22に設定
- [x] startGame('souryokusen') で Tokyo MAP 時に spawnTokyoSouryokusen() を呼び出し
- [x] spawnSouryokusen() から Tokyo MAP 用のコードを削除

## ドキュメント作成 ✅
- [x] requirements.md 作成
- [x] implementation-summary.md 作成
- [x] tasklist.md 作成

## テスト（未実施）
- [ ] 全Phase の機能テスト
- [ ] 各MAP でゲームプレイ確認
- [ ] モバイル環境でのパフォーマンステスト

## リリース準備
- [ ] git commit
- [ ] CHANGELOG更新（必要に応じて）
- [ ] デプロイ

---

## 実装時間

- Phase 7: 1分
- Phase 8: 10分
- Phase 5: 30分
- Phase 6: 10分
- Phase 4: 2時間
- ドキュメント: 30分

**合計**: 約3時間20分
