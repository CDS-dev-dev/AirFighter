# リポジトリ構造定義書

## 1. 概要

Three.js + TypeScript + Vite のモノリポ構成。ゲームロジックは `src/main.ts` に集中管理。
マップ固有ロジックは独立ファイルに分離する方針（NEO 東京が先行例）。

---

## 2. ディレクトリ構成

```
AirFighter/
│
├── src/
│   ├── main.ts                # ゲームロジック全体（約 4,500 行）
│   │                          # レンダリング / 物理 / AI / 入力 / HUD / マップ切替
│   ├── neoTokyoMapSystem.ts   # NEO 東京マップシステム（建物・ランドマーク・地形）
│   ├── multiplayer.ts         # マルチプレイクライアント（スタブ、未接続）
│   ├── tokyoMapSystem.ts      # 旧東京マップ（アーカイブ、現在未使用）
│   ├── counter.ts             # Vite テンプレート残留（未使用）
│   ├── assets/                # 静的アセット（画像など）
│   └── style.css              # グローバルスタイル
│
├── index.html                 # HUD / CSS / タッチコントロール / モーダル UI
│                              # すべての HTML/CSS/UI は index.html に集中
│
├── public/
│   ├── terrain.glb            # オリジナル地形メッシュ（Blender 生成）
│   ├── manifest.json          # PWA マニフェスト
│   ├── apple-touch-icon.png   # ホーム画面アイコン
│   └── models/
│       ├── fighter.glb        # プレイヤー機・敵機モデル
│       ├── heli.glb           # ヘリコプターモデル
│       ├── bomber.glb         # 爆撃機モデル
│       └── carrier.glb        # 空母ボスモデル
│
├── blender/
│   ├── gen_terrain.py         # terrain.glb 生成スクリプト
│   │                          # terrain_h() は main.ts の terrainH() と完全一致が必須
│   ├── gen_aircraft.py        # fighter / heli / bomber GLB 生成
│   ├── gen_buildings.py       # hangar 等の建物 GLB 生成
│   ├── gen_carrier.py         # carrier.glb（ボス）生成
│   ├── gen_original_colossal_skeleton.py # 巨大骨格回廊 GLB 生成
│   └── asset-registry.json    # Blender資産台帳
│
├── tools/
│   └── audit-blender-assets.mjs # Blender資産の整合監査
│
├── docs/                      # 設計ドキュメント（本ドキュメント群）
│   ├── 1_product-requirements.md
│   ├── 2_functional-design.md
│   ├── 3_architecture.md
│   ├── 4_repository-structure.md   ← このファイル
│   ├── 5_development-guidelines.md
│   ├── 6_glossary.md
│   └── 7_blender-asset-pipeline.md
│
├── .steering/
│   └── UI-DESIGN-RULES.md     # UI 設計ルール（スマホ横画面対応など）
│
├── .github/
│   └── workflows/
│       └── deploy.yml         # GitHub Actions: push to main → Pages デプロイ
│
├── CLAUDE.md                  # Claude / AI エージェント向け開発ガイド
├── package.json               # npm 設定・バージョン管理
├── tsconfig.json              # TypeScript コンパイラ設定
└── vite.config.ts             # Vite ビルド設定
```

---

## 3. 主要ファイルの責務

### `src/main.ts`
ゲームの全ロジックを 1 ファイルに集中させる設計思想。セクション区切り `// ===== SECTION =====` でナビゲートする。

| セクション | 内容 |
|---|---|
| VERSION / RENDERER | バージョン定数・WebGL 設定 |
| SCENE / SKY / LIGHTING | 3D シーン・大気・照明 |
| TERRAIN | オリジナル地形関数 `terrainH()` とメッシュ生成 |
| GAME OBJECTS | 建物・基地・港・橋・補給ポイント配置 |
| PLAYER | プレイヤー機の生成・物理・入力処理 |
| ENEMY / ALLY | AI 機の生成・行動更新 |
| WEAPONS | 機銃・ミサイル・フレア・SAM |
| LOCK-ON | ロックオン判定ロジック |
| HUD | スピードメータ・HP・スコア・ピップ表示 |
| GAME LOOP | `requestAnimationFrame` メインループ |
| MAP SYSTEM | マップ切替・NEO 東京ロード |

### `src/neoTokyoMapSystem.ts`
NEO 東京固有のすべての 3D オブジェクトを管理するクラス。main.ts から `new NeoTokyoMapSystem(scene, isMobile)` で生成。

| メソッド | 役割 |
|---|---|
| `initialize()` | 全オブジェクトを生成してシーンに追加 |
| `cleanup()` | 全オブジェクトをシーンから除去 |
| `getCollisionObjects()` | 衝突判定対象の `landmarks` 配列を返す |
| `static heightAt(x, z)` | 東京地形の高度を返す（main.ts から参照） |
| `getTerrainHeight(x, z)` | `heightAt` のインスタンスメソッドラッパー |
| `getSafeSpawnPosition()` | プレイヤーの初期スポーン座標を返す |

---

## 4. バージョン管理ルール

コミット時は以下の 3 ファイルを**必ず同時に更新**する：

```
package.json    → "version": "X.X.X"
index.html      → タイトル内の vX.X.X
src/main.ts     → const VERSION = 'X.X.X'
```

| 変更種別 | バージョンアップ |
|---|---|
| 機能追加・バグ修正 | マイナー +1（例: 5.1 → 5.2） |
| 大規模リファクタ | マイナー +1 |
| 重大な変更 | メジャー +1（例: 4.x → 5.0） |
