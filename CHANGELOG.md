# Changelog

All notable changes to AirFighter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [7.00.0] - 2026-06-12

### 🎉 Phase 16完全達成: BotW級の完璧な静的構造

Major release achieving Breath of the Wild level quality in static structure design.

### Added

#### 発見要素の大幅拡張（75個 → 537個）

- **コレクティブルシステム拡張**: 75個 → 300個
  - 各MAP 75個（Easy 35, Medium 25, Hard 12, Expert 3）
  - 全て手動配置、ランドマークと連動
  - 各アイテムに文脈豊富なloreテキスト
  - 配置例: Titan Peak頂上、Mega Tower最上階、Mothership司令室

- **Logsシステム実装**: 120個の環境レコード
  - 各MAP 40個の発見可能なレコード
  - 発光する結晶体ビジュアル（八面体ジオメトリ）
  - LocalStorage永続化
  - テーマ: 登山記録、建設記録、艦隊記録など
  - 新規ファイル: `src/logsSystem.ts`

- **環境ストーリーテリング**: 117個のストーリーオブジェクト
  - 13のストーリーシーン（Original 4、Tokyo 4、Space 5）
  - オブジェクト配置で物語を語る環境デザイン
  - 各MAPに統一されたテーマ:
    - Original: 古代文明の崩壊と再生
    - Tokyo: 最後の48時間
    - Space: 大戦の終結
  - ストーリーシーン例:
    - 避難の軌跡（12オブジェクト）
    - 古代の儀式跡（17オブジェクト）
    - 最終防衛線（6オブジェクト）
  - 新規ファイル: `src/environmentalStorySystem.ts`

#### ランダム配置の完全削除

- **決定的配置システム実装**: 8,500+オブジェクトを決定的配置に変更
  - 木・植生: 5,020本（4,000本の広葉樹 + 520本のバイオーム植生 + 500個の灌木）
  - 岩・巨岩: 466個（46本の岩塔 + 420個の巨岩）
  - Space MAP要素: 3,050個（デブリ、ケーブル、パネル、コンテナ、衛星、工具）
  - 都市建物: 可変数（addCityArea関数）

- **deterministicRandom()関数**: シード値ベースの疑似ランダム生成
  ```typescript
  function deterministicRandom(seed: number): number {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }
  ```

- **グリッドベース配置**: 40m/50m/70m/100mグリッドでの決定的配置
  - 木: 40mグリッド
  - 灌木: 50mグリッド
  - 巨岩: 70mグリッド
  - バイオーム植生: 100mグリッド

### Changed

- **構造物配置**: Math.random()から決定的配置に全面移行
  - 木の配置ロジック（4,000本）
  - 高地植生の配置（500個）
  - バイオーム植生（雪山針葉樹300本、ジャングル巨大樹20本、砂漠サボテン200本）
  - 岩塔クラスター配置（46本）
  - 巨岩分布（420個）
  - 都市建物配置（可変）
  - Space MAPデブリベルト（2,000個）
  - Space MAP浮遊ケーブル（300本）
  - Space MAPパネル破片（400個）
  - Space MAP貨物コンテナ（200個）
  - Space MAP小型衛星（50個）
  - Space MAP浮遊工具（100個）

- **MAP初期化**: switchMap()関数にLogs・Storyシステム統合
  - MAP切り替え時にログ配置を自動生成
  - ストーリーシーンを自動配置

### Technical

- **新規システムファイル**:
  - `src/logsSystem.ts` (412行): Logsシステム実装
  - `src/environmentalStorySystem.ts` (492行): 環境ストーリーシステム実装

- **主要編集ファイル**:
  - `src/main.ts`: 決定的配置実装、Logs・Storyシステム統合
  - `src/collectibleSystem.ts`: 225個のコレクティブル追加

- **ビルドサイズ**:
  - `dist/index.html`: 43.88 kB (gzip: 9.30 kB)
  - `dist/assets/index-*.js`: 935.62 kB (gzip: 252.37 kB)

### Documentation

- **新規ドキュメント**:
  - `.steering/20260612-botw-level-perfection-phase16/COMPLETION.md`: Phase 16完了レポート
  - `README.md`: プロジェクト概要とv7.00.0リリースノート
  - `CHANGELOG.md`: 変更履歴

### Performance

- **一貫したパフォーマンス**: 決定的配置により毎回同じ負荷
- **予測可能な挙動**: リロードしても構造物配置が変わらない

### Quality

- **BotW級の手作り感**: 全構造物が意図的配置
- **探索価値の最大化**: 537個の発見要素
- **環境ストーリーテリング**: 13シーン、117オブジェクト
- **物理的一貫性**: 見えるものは全て存在する

---

## [6.20.0] - 2026-06-12 (内部バージョン)

### Added
- 決定的配置システムの基盤実装
- deterministicRandom()関数

### Changed
- 木・植生の配置ロジック
- 岩塔・巨岩の配置ロジック
- Space MAPデブリベルトの配置ロジック

---

## [6.10.0] - 2026-06-12 (内部バージョン)

### Added
- Logsシステム実装（120個の環境レコード）
- 発光する結晶体ビジュアル

### Changed
- コレクティブル数: 75個 → 300個

---

## [6.00.0] - 2026-06-12 (Phase 15完了)

### Added
- 隠しエリア: 30個 → 90個（各MAP 20個追加）
- コレクティブル拡張開始

### Changed
- 中間ランドマーク追加（各MAP 6個）
- 外周エリア詳細化

---

## [5.80.0] - 2026-06-11

### Added
- Space MAP: 宇宙戦場完全実装
- Mothership（全長1,000m）
- Fortress（3層構造）
- Mining Colony
- Capital Ships（4種類）

---

## [5.70.0] - 2026-06-10

### Added
- Tokyo MAP詳細構造
- Mega Tower内部構造
- 地下都市システム

---

## [5.61.0] - 2026-06-09

### Added
- Original MAP基本構造
- バイオームシステム（雪山、温帯、ジャングル、砂漠）
- 主要ランドマーク

---

## 過去バージョン

過去のバージョン履歴は省略。v5.60.0以前のバージョンは初期開発フェーズです。

---

**Note**: バージョン番号はSemantic Versioningに従っています。
- Major (X.0.0): 破壊的変更、大規模機能追加
- Minor (0.X.0): 新機能追加、後方互換性維持
- Patch (0.0.X): バグ修正、小規模改善
