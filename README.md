# AirFighter v7.15.1

**BotW級の完璧なオープンワールド3Dアクションゲーム**

[![Version](https://img.shields.io/badge/version-7.15.1-blue.svg)](https://github.com/cds-dev-dev/AirFighter)
[![Built with Three.js](https://img.shields.io/badge/Built%20with-Three.js-000000.svg)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)

---

## 🎮 概要

AirFighterは、Three.jsで作られた本格的な3D空中戦闘ゲームです。v7.15.1時点では、**v7.00.0で到達したBotW級の手作り感と探索価値**を土台に、Original MAPの巨大骨格飛行回廊に加えて、3MAP横断のコリジョン整合改善まで進んでいます。

### 主な特徴

- 🗺️ **3つの広大なMAP**: Original（自然世界）、Neo Tokyo（未来都市）、Space（宇宙戦場）
- ✈️ **本格的な空中戦闘**: ドッグファイト、ミサイル、フレア、ロックオン
- 🎯 **537個の発見要素**: コレクティブル300個、ログ120個、ストーリーオブジェクト117個
- 📖 **環境ストーリーテリング**: 13のストーリーシーン、オブジェクト配置で物語を語る
- 🎨 **完全な決定的配置**: 8,500+オブジェクトが手動デザイン、ランダム性を完全排除

---

## 🚀 v7.15.1 現行リリース概要（2026-06-13）

### 現在の正式版について

このリポジトリの正式な現行バージョンは **v7.15.1** です。  
直近の開発では、以下の内容が `v7.00.0` の基盤に積み上がっています。

- **ゲームプレイ演出の統合**: `gameplayEffectsSystem` をゲームループへ統合
- **GLBアセット移行の進行**: 植生モデル、地下洞窟システムをGLB化
- **宇宙MAP再設計**: 飛行可能Yレンジの統一、3D小惑星分布、立体導線の追加、初期視界の圧迫軽減
- **Original MAP飛行導線強化**: 巨大な背骨・肋骨による回廊型フライトギミックを追加
- **戦闘UI/操作改善**: 前方コーン型ロックオン、候補なし通知、プレイヤーミサイル追跡HUD
- **コリジョン整合改善**: Original / Tokyo / Space の主要構造物について、見た目と当たり判定のズレを縮小
- **探索/環境密度の継続改善**: 既存の手作り配置思想を維持したまま拡張

詳細なフェーズ進行や実装メモは [`.steering/`](./.steering) 配下のドキュメントを参照してください。

---

## 🧱 v7.00.0 メジャーリリース基盤（2026-06-12）

### 🎉 Phase 16完全達成: BotW級の完璧な静的構造

#### 新機能

##### 1. 発見要素の大幅拡張（75個 → 537個）

**コレクティブル**: 300個
- 各MAP 75個（Easy 35, Medium 25, Hard 12, Expert 3）
- 全て手動配置、ランドマークと連動
- 各アイテムに文脈豊富なloreテキスト

**Logs（環境レコード）**: 120個
- 各MAP 40個の発見可能なレコード
- 発光する結晶体ビジュアル（八面体）
- 環境ストーリーテリングテキスト
- LocalStorage永続化

**ストーリーオブジェクト**: 117個
- 13のストーリーシーン
- オブジェクト配置で物語を語る
- 各MAPに統一されたテーマ

##### 2. ランダム配置の完全削除

**決定的配置に変更** (8,500+オブジェクト):
- 木・植生: 5,020本
- 岩・巨岩: 466個
- Space MAP要素: 3,050個
- 都市建物: 可変

**実装手法**:
```typescript
// 決定的疑似ランダム関数
function deterministicRandom(seed: number): number {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}
```

**効果**:
- 毎回同じ配置が再現される
- リロードしても構造物の位置が変わらない
- 手動デザインの意図を完全保証

##### 3. 環境ストーリーテリング

**13のストーリーシーン、117オブジェクト**:

**Original MAP** (4シーン):
- 避難の軌跡: 古代文明崩壊時の避難ルート
- 古代の儀式跡: Snow Temple周辺の宗教儀式
- 古戦場の痕跡: Grand Canyon周辺の古代戦争
- 探検家のキャンプ: Natural Arch調査隊

**Tokyo MAP** (4シーン):
- 避難の混乱: Mega Tower周辺の避難パニック
- 最後の放送: Skytree展望台の放送スタジオ
- 地下シェルター準備: 地下施設の避難準備
- 屋上の救助信号: Mega Tower屋上のSOS

**Space MAP** (5シーン):
- 最終防衛線: Mothership周辺の艦隊配置
- 脱出ポッドの軌跡: Fortress崩壊時の脱出
- 採掘コロニーの日常: Mining Colony住居区の生活
- 最後の抵抗: Fortress内部の最終防衛戦
- 観測所の発見: Observatory Watchtowerの観測記録

#### 技術的改善

- **新システム**: Logs System (`src/logsSystem.ts`)
- **新システム**: Environmental Story System (`src/environmentalStorySystem.ts`)
- **最適化**: 決定的配置による一貫したパフォーマンス
- **品質**: BotW級の手作り感を実現

---

## 🎯 ゲームモード

### 1. ドッグファイトモード
- 敵機を撃墜してスコアを稼ぐ
- 無限リスポーン、スコアアタック

### 2. 総力戦モード
- 地上目標・艦隊を破壊するミッション
- 目標達成でクリア

### 3. MAP探索モード
- 537個の発見要素を探索
- コレクティブル、ログ、ストーリーオブジェクト

---

## 🗺️ MAP詳細

### Original MAP: 自然世界
- **テーマ**: 古代文明の崩壊と再生
- **主要ランドマーク**: 
  - Titan Peak（1,500m）
  - Grand Canyon
  - Great Waterfall
  - Natural Arch
  - Alpine Lake
  - Snow Temple
  - Underground Sanctuary
- **バイオーム**: 雪山、温帯、ジャングル、砂漠
- **発見要素**: 195個（コレクティブル75、ログ40、ストーリー39、隠しエリア20）

### Tokyo MAP: Neo Tokyo（未来都市）
- **テーマ**: 最後の48時間
- **主要ランドマーク**:
  - Mega Tower（800m）
  - Tokyo Skytree（634m）
  - Stadium（直径400m）
  - Twin Towers（450m）
  - Tilted Building（420m、15°傾斜）
  - Giant Dome（直径500m）
- **エリア**: 商業地区、住宅地区、工業地区、港湾地区、地下都市
- **発見要素**: 187個（コレクティブル75、ログ40、ストーリー32、隠しエリア20）

### Space MAP: 宇宙戦場
- **テーマ**: 大戦の終結
- **主要構造物**:
  - Mothership（全長1,000m）
  - Fortress（3層構造）
  - Mining Colony
  - Capital Ships（Dreadnought、Carrier、Cruiser、Destroyer）
  - 4つのOuter Stations
  - Debris Belt（2,000個のデブリ）
- **発見要素**: 201個（コレクティブル75、ログ40、ストーリー46、隠しエリア20）

---

## 🎮 操作方法

### キーボード・マウス
- **移動**: WASD / 矢印キー
- **加速**: Shift
- **射撃**: Z / A / Q / 左クリック
- **ミサイル**: X / 右クリック
- **フレア**: C
- **ロックオン**: Tab
- **視点**: マウス移動

### タッチ操作
- **左スティック**: 機体操作
- **右スティック**: 視点操作
- **ボタン**: 射撃、ミサイル、フレア、ロックオン

---

## 🛠️ 技術スタック

- **フレームワーク**: Three.js v0.184.0
- **言語**: TypeScript v6.0.2
- **ビルドツール**: Vite v8.0.10
- **バックエンド**: Supabase v2.105.4（マルチプレイヤー）

---

## 📦 インストール・起動

```bash
# 依存パッケージのインストール
npm install

# 開発サーバー起動
npm run dev

# プロダクションビルド
npm run build

# プレビュー
npm run preview
```

---

## 🌐 デプロイ

GitHub Pagesにデプロイされています:
https://cds-dev-dev.github.io/AirFighter/

---

## 📂 プロジェクト構造

```
AirFighter/
├── src/
│   ├── main.ts                          # メインエントリーポイント
│   ├── neoTokyoMapSystem.ts             # Tokyo MAPシステム
│   ├── collectibleSystem.ts             # コレクティブルシステム
│   ├── logsSystem.ts                    # Logsシステム（NEW）
│   ├── environmentalStorySystem.ts      # 環境ストーリーシステム（NEW）
│   └── multiplayer.ts                   # マルチプレイヤーシステム
├── public/
│   └── models/                          # 3DモデルGLBファイル
├── .steering/                           # 開発ドキュメント
│   └── 20260612-botw-level-perfection-phase16/
│       ├── requirements.md
│       ├── design.md
│       ├── tasklist.md
│       ├── progress.md
│       └── COMPLETION.md               # Phase 16完了レポート
├── index.html
├── package.json
└── README.md
```

---

## 🎯 Phase 16達成内容

Phase 16「BotW級の完璧な静的構造」を100%達成:

- ✅ コレクティブル拡張（75→300個）
- ✅ Logsシステム実装（120個）
- ✅ ランダム配置の完全削除（8,500+オブジェクト）
- ✅ 環境ストーリーテリング（13シーン）
- ✅ 手作り感の保証
- ✅ 探索価値の最大化

詳細: `.steering/20260612-botw-level-perfection-phase16/COMPLETION.md`

---

## 🤝 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずissueを開いて変更内容を議論してください。

---

## 📝 ライセンス

[MIT License](LICENSE)

---

## 🙏 謝辞

- Three.js コミュニティ
- Supabase チーム
- ゼルダの伝説 BotW（品質基準として）

---

**Developed with Claude Code**  
Version: 7.00.0  
Release Date: 2026-06-12
