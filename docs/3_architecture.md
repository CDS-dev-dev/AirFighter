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
        B1[実地形ベース高度\n低い起伏 + 水域くぼみ]
        B2[巨大ビル群\n細長い超高層]
        B3[東京ランドマーク\n実在コア + 未来増築]
        B4[交通・水域\n山手線 / 橋 / 湾岸 / 空中高速]
        B5[保護ゾーン\n視界と余白]
        B6[上層都市構造\nリング / ドーム / スパイア]
        B7[都市キャニオン\n見えない配置余白]
        B8[遠景シルエット\n衝突なし背景密度]
    end

    A1 --> A2
    B1 --> B2
    B1 --> B3
    B5 -->|配置制限| B2
    B5 -->|主役化| B3
    B1 --> B4
    B2 -->|都市密度| B6
    B3 -->|目的地| B6
    B4 -->|導線| B6
    B7 -->|配置制限| B2
    B8 -->|背景密度| H[視界演出]
    B3 -->|個別メッシュ| C[衝突判定]
    B2 -->|個別コライダー| C
```

### NEO 東京マップの衝突設計

`InstancedMesh` は `Box3.setFromObject()` を呼ぶと**全インスタンスを包含する巨大な箱**が返るため、プレイヤーが建物の隙間に入れなくなるバグが発生する。

解決策: 視覚用の InstancedMesh とは別に、建物ごとの不可視 Box コライダーを生成する。衝突対象は実体として扱うランドマークと建物コライダーに限定し、水面、ホログラム、発光リング、アーチのような半透明演出は装飾として扱う。

### NEO 東京マップのランドマーク設計

NEO 東京は「実在東京の骨格が2077年まで保存・増築された都市」として扱う。東京タワー、スカイツリー、東京駅、レインボーブリッジ、フジテレビ、浅草寺などは実在の形・色・位置をコアとして残し、その周囲に展望リング、空中デッキ、発光参道、上層橋などを増築する。

```mermaid
graph TD
    A[実在の東京記号\n塔・駅舎・橋・寺社] --> B[NEO増築\nリング・空中デッキ・発光導線]
    B --> C[飛行体験\nくぐる・沿う・抜ける]
    D[保護ゾーン\n高層ビルを寄せない] --> A
    D --> B
    E[湾岸と河川\n地形を沈めた水域] --> C
```

ランドマーク保護ゾーンでは汎用巨大ビルと巨大支柱を置かず、低層・広場・水辺・交通導線で視界を確保する。巨大ビルは外周や背景の都市壁として使い、東京らしい要素を主役として読めるようにする。

### NEO 東京マップの都市飛行設計

NEO 東京では地形をゲーム都合で大きく盛らない。`heightAt()` は武蔵野台地、都心低地、湾岸低地を低い起伏として近似し、飛行体験は `createLayeredSkyCity()` が生成する中央ドーム、上層リング、空中ハイウェイ、スパイアで作る。

`URBAN_CANYONS` は見えるガイドではなく、ビル配置を避けるための線分として使う。これにより、発光レーンを置かずに、ビル群の間へ自然な低空の抜け道を作る。遠景密度は `createDistantSkyline()` の装飾タワーが担当し、衝突対象には含めない。

```mermaid
graph TD
    A[実地形ベース\n低い起伏] --> B[水辺と都市床\n東京らしい平坦さ]
    C[超高層タワー群] --> D[都市の谷間\n低空飛行]
    E[上層リング / 空中高速] --> F[高高度の抜け道\n沿う・くぐる]
    G[中央ドーム / スパイア] --> H[目標物\n旋回・接近]
    J[都市キャニオン\n建物配置の余白] --> D
    K[遠景シルエット\n衝突なし] --> L[都市の奥行き]
    B --> I[飛行体験]
    D --> I
    F --> I
    H --> I
    L --> I
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
