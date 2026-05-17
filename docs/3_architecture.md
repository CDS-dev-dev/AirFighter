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
        B1[heightAt関数\nガウス丘陵 + 東京地形]
        B2[InstancedMesh ビル群\n6 draw calls / 600+ 棟]
        B3[個別ランドマーク Mesh\n衝突判定対象]
        B4[Deco オブジェクト\n山手線 / 橋 / 水面]
    end

    A1 --> A2
    B1 --> B2
    B1 --> B3
    B3 -->|getCollisionObjects| C[衝突判定]
    B2 -.->|除外: Box3が全インスタンスを包含してしまう| C
```

### NEO 東京マップの衝突設計

`InstancedMesh` は `Box3.setFromObject()` を呼ぶと**全インスタンスを包含する巨大な箱**が返るため、プレイヤーが建物の隙間に入れなくなるバグが発生する。

解決策: `getCollisionObjects()` は個別配置した `landmarks` 配列のみを返す。InstancedMesh ビルは視覚専用。

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
