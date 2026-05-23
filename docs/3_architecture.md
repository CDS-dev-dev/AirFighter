# アーキテクチャ設計書

## 1. システム構成概要

AirFighter は完全静的な SPA（Single Page Application）。サーバーサイドロジックは持たず、GitHub Pages からファイルを配信する。

```mermaid
graph TB
    subgraph クライアント
        A[ブラウザ / スマートフォン]
    end

    subgraph フロントエンド - GitHub Pages
        B[index.html\nHUD / CSS / タッチUI]
        C[src/main.ts\nゲームロジック全体]
        D[src/neoTokyoMapSystem.ts\nNEO東京マップ]
        E[src/multiplayer.ts\nマルチプレイクライアント stub]
    end

    subgraph アセット - public/
        F[terrain.glb\nオリジナル地形メッシュ]
        G[models/*.glb\n機体・建物・キャリア]
    end

    subgraph 外部サービス
        H[(Supabase\nリーダーボード予定)]
        I[Cloudflare Workers\nマルチプレイ予定]
    end

    A --> B
    B --> C
    C --> D
    C --> E
    C --> F
    C --> G
    C -.->|将来| H
    E -.->|将来| I
```

---

## 2. テクノロジースタック

### レンダリング・ゲームエンジン

| 技術 | 用途 | 選定理由 |
|---|---|---|
| Three.js r184 | 3D レンダリング | WebGL 抽象化。ブラウザ完結で最も実績がある |
| TypeScript 6 | 言語 | 型安全。`any` 禁止で実行時エラーを事前排除 |
| Vite 8 | バンドラー / Dev サーバー | HMR が速く Three.js との相性が良い |

### レンダリング設定

| 項目 | 設定値 | 備考 |
|---|---|---|
| トーンマッピング | ACESFilmic | 映像的な露出感 |
| 露出 | 0.78 | 黄金時間帯の暖色 |
| ピクセル比 | PC: 2.0、モバイル: 1.5 | モバイルは描画負荷を下げる |
| シャドウ | PC のみ有効 | BasicShadowMap、512×512 |
| フォグ | FogExp2(0.000075) | 大気散乱の霞み |
| スカイ | Three.js Sky シェーダー | PC のみ（モバイルは背景色で代替） |

### インフラ

| 技術 | 用途 |
|---|---|
| GitHub Pages | 静的ホスティング（無料） |
| GitHub Actions | CI/CD（push to main → 自動ビルド & デプロイ） |
| Supabase | 将来のリーダーボード用 DB（環境変数 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`）|

---

## 3. ゲームループ構造

```mermaid
graph LR
    A[requestAnimationFrame] --> B[入力処理\nキーボード / タッチ]
    B --> C[プレイヤー物理\n速度・姿勢・衝突]
    C --> D[AI 更新\n敵機 / 味方機 / 地上目標]
    D --> E[弾薬更新\n機銃 / ミサイル / フレア]
    E --> F[ロックオン判定\n3000m 以内 + 正面コーン]
    F --> G[HUD 更新\n速度 / HP / スコア]
    G --> H[Three.js レンダリング]
    H --> A
```

---

## 4. マップシステム

2 つのマップはロード時に切り替わる。切り替えは `cleanup()` → `initialize()` のライフサイクルで管理する。

```mermaid
graph TD
    subgraph オリジナル MAP
        A1[terrainH関数\nfBm + 山脈 + 峡谷]
        A2[terrain.glb\nBlenderで事前生成]
        A3[建物・基地 GLB\nBlenderで事前生成]
    end

    subgraph NEO 東京 MAP - NeoTokyoMapSystem
        B1[地形高度\n丘陵 + 水域くぼみ]
        B2[巨大ビル群\n飛行回廊の壁]
        B3[東京ランドマーク\n実在コア + 未来増築]
        B4[交通・水域\n山手線 / 橋 / 湾岸]
        B5[保護ゾーン\n視界と余白]
        B6[空中飛行ルート\n発光レーン + ゲート]
    end

    A1 --> A2
    B1 --> B2
    B1 --> B3
    B5 -->|配置制限| B2
    B5 -->|主役化| B3
    B1 --> B4
    B6 -->|配置制限| B2
    B3 -->|行き先| B6
    B4 -->|導線| B6
    B3 -->|個別メッシュ| C[衝突判定]
    B2 -->|個別コライダー| C
```

### NEO 東京マップの衝突設計

`InstancedMesh` は `Box3.setFromObject()` を呼ぶと**全インスタンスを包含する巨大な箱**が返るため、プレイヤーが建物の隙間に入れなくなるバグが発生する。

解決策: 視覚用の InstancedMesh とは別に、建物ごとの不可視 Box コライダーを生成する。衝突対象は実体として扱うランドマークと建物コライダーに限定し、水面、ホログラム、発光リング、アーチ、飛行ルートのような半透明演出は装飾として扱う。

### NEO 東京マップのランドマーク設計

NEO 東京は「実在東京の骨格が2087年まで保存・増築された都市」として扱う。東京タワー、スカイツリー、東京駅、レインボーブリッジ、フジテレビ、浅草寺などは実在の形・色・位置をコアとして残し、その周囲に展望リング、空中デッキ、発光参道、上層橋などを増築する。

```mermaid
graph TD
    A[実在の東京記号\n塔・駅舎・橋・寺社] --> B[NEO増築\nリング・空中デッキ・発光導線]
    B --> C[飛行体験\nくぐる・沿う・抜ける]
    D[保護ゾーン\n高層ビルを寄せない] --> A
    D --> B
    E[湾岸と河川\n地形を沈めた水域] --> C
```

ランドマーク保護ゾーンでは汎用巨大ビルと巨大支柱を置かず、低層・広場・水辺・交通導線で視界を確保する。巨大ビルは外周や飛行回廊の壁として使い、東京らしい要素を主役として読めるようにする。

### NEO 東京マップの飛行ルート設計

東京ランドマーク間に `FLYWAY_SEGMENTS` を定義し、各線分に幅・高度・色を持たせる。ビル生成時はこの幅を避けて配置し、描画時は薄い空中レーン、左右レール、通過ゲートを生成する。

```mermaid
graph TD
    A[ランドマーク\n東京らしい目的地] -->|区間定義| B[空中飛行ルート\n幅・高度・色]
    B -->|ビル配置を制限| C[開けた空域\n旋回・低空・高速飛行]
    B -->|発光レーンを描画| D[視覚ガイド\n通る場所がわかる]
    D -->|装飾扱い| E[衝突なし\n透けるものは通れる]
    C --> F[飛行体験\nくぐる・沿う・抜ける]
    A --> F
```

### マップ境界設計

ゲームループ内でマップ別の矩形境界をチェックする。境界はオリジナル MAP と NEO 東京 MAP で別値を持つが、処理は共通で、プレイヤーが境界外へ出た場合は境界内へクランプし、速度を落として警告を表示する。

---

## 5. Blender GLB パイプライン（オリジナル MAP 用）

```mermaid
graph LR
    A[gen_terrain.py\nPython スクリプト] -->|Blender ヘッドレス実行| B[public/terrain.glb]
    C[gen_aircraft.py] --> D[public/models/fighter.glb\nheli.glb / bomber.glb]
    E[gen_buildings.py] --> F[public/models/hangar.glb 等]
    G[gen_carrier.py] --> H[public/models/carrier.glb]
    B --> I[main.ts で GLTFLoader 読み込み]
    D --> I; F --> I; H --> I
```

**重要**: `terrainH()` (main.ts) と `terrain_h()` (gen_terrain.py) は**完全一致が必要**。
地形関数を変更したら必ず GLB を再生成する。

---

## 6. モバイル最適化戦略

| 項目 | PC | モバイル |
|---|---|---|
| ピクセル比 | 2.0 | 1.5 |
| シャドウ | 有効 | 無効 |
| Sky シェーダー | 有効 | 無効（背景色） |
| ビル密度 | 100% | ~52%（seed > 0.52 でスキップ） |
| 山手線・高速道路 | 表示 | 非表示 |
| テレインセグメント数 | 128〜256 | 64 |
