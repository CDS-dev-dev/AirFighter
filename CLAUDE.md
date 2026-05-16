# AirFighter — Claude / Agent 開発ガイド

## 言語・ドキュメント方針

- コミットメッセージ・コードコメントは**英語**
- ユーザーへの回答・説明は**日本語**
- アーキテクチャ図は**2次元の関係マップ**で描く（一列の箱の羅列にしない）
- コンポーネント間はデータ/リクエスト/更新フローが見える矢印で接続する
- ラベルは実装用語そのままではなく、読み手が理解できる言葉にする

---

## プロジェクト概要

**Three.js + TypeScript + Vite** で作った WebGL 3D 空戦ゲーム。GitHub Pages にデプロイ。

| 項目 | 内容 |
|---|---|
| リポジトリ | CDS-dev-dev/AirFighter |
| デプロイ先 | GitHub Pages（`/AirFighter/` パス） |
| エントリポイント | `src/main.ts`（全ロジック集中、約4500行） |
| モデル生成 | `blender/` 以下の Python スクリプトを Blender ヘッドレスで実行 |

---

## ゲームモード

| モード | 内容 |
|---|---|
| `dogfight` | 青vs赤チーム戦。プレイヤーは北側（z=-200〜-350）にスポーン |
| `souryokusen` | 地上目標17個（うちキャリアボス1）を全破壊 |
| `free` | 自由飛行 |

---

## 重要な不変条件（変えてはいけないもの）

### 地形関数の同期
`terrainH()` in `src/main.ts` と `terrain_h()` in `blender/gen_terrain.py` は**完全一致**が必要。
- 衝突判定・オブジェクト配置（main.ts）と視覚地形（terrain.glb）が一致しないとオブジェクトが浮く・埋まる
- 地形関数を変更したら必ず Blender で `terrain.glb` を再生成する
- 現在の地形：極限地形MAP（ベース300m、4方向山脈、十字峡谷深600m、放射峡谷深400m、フラクタル起伏）

### Blender 座標系
- Blender: X=East, Y=South（Three.jsのZ反転）, Z=Up
- Three.js への読み込み時: `rotation.x = Math.PI / 2` が必要
- GLB 出力先: `public/terrain.glb`（`public/models/` ではない）、機体は `public/models/`

### バージョン同期
コミット時は必ず3ファイルを揃える：
- `package.json` → `"version"`
- `index.html` → タイトルの `vX.X.X` 表示
- 機能追加・バグ修正はマイナーバージョンアップ（例: 4.3 → 4.4）

---

## ファイル構成

```
AirFighter/
├── src/main.ts          # ゲームロジック全体（単一ファイル）
├── index.html           # UI・CSS・HUD・タッチコントロール
├── blender/
│   ├── gen_terrain.py   # terrain.glb 生成（地形関数を main.ts と同期）
│   ├── gen_aircraft.py  # fighter.glb / heli.glb / bomber.glb
│   ├── gen_buildings.py # hangar.glb 等
│   └── gen_carrier.py   # carrier.glb（ボス）
└── public/
    ├── terrain.glb      # 地形メッシュ
    └── models/          # 機体・建物 GLB
```

---

## コーディング規約

- **コメントは原則書かない**。なぜそうするかが非自明な場合のみ1行で
- セクション区切りは `// ===== SECTION NAME =====` 形式
- Three.js の使い捨てベクトルは `_fwd` 等のプレフィックス付き再利用変数を使う
- 型は明示的に書く（`any` は避ける）
- `npx tsc --noEmit` でエラーゼロを確認してからコミット

---

## 主要変数・定数

| 変数 | 内容 |
|---|---|
| `speed` | プレイヤー現在速度（m/s）。初期150、ブースト550 |
| `playerHP` / `MAX_HP` | プレイヤーHP（現在 MAX_HP=3） |
| `MISSILE_LOCK_RANGE` | ロックオン射程（現在3000m） |
| `enemies[]` / `allies[]` | 敵・味方機配列 |
| `groundTargets[]` | 地上目標（souryokusen） |
| `bullets[]` / `enemyBullets[]` | プレイヤー弾 / 敵マシンガン弾 |
| `lockedTarget` | 現在ロック中のターゲット |
| `currentMode` | `'dogfight'` \| `'souryokusen'` \| `'free'` \| `null` |
| `currentMap` | `'original'` \| `'tokyo'` |

---

## タッチ操作（スマホ）の注意

スマホ縦持ちで `body { transform: rotate(90deg) translateY(-100%) }` している関係で、
`position: fixed` 要素は landscape 座標系に固定される。

縦持ち時のタッチ座標変換：
```
viewport(px, py) → element_local(x = clientY, y = W - clientX)
```
（W = window.innerWidth）

---

## Blender GLB 再生成コマンド

```bash
blender --background --python blender/gen_terrain.py
blender --background --python blender/gen_aircraft.py
blender --background --python blender/gen_buildings.py
blender --background --python blender/gen_carrier.py
```

---

## 今後の主要開発方針

- **マルチプレイ**: Cloudflare Workers + Durable Objects でランダムマッチ実装予定
- **キャンペーンモード**: ミッション構造・機体解放
- MAP追加は優先度低（オリジナルMAP + NEO東京で十分）
