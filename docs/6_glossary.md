# 用語集（ユビキタス言語定義）

このドキュメントは AirFighter 開発において、会話・ドキュメント・コード上で統一して使う用語を定義します。

---

## 1. ゲームドメイン用語

| 日本語 | 英語（コード上） | 定義 |
|---|---|---|
| ドッグファイト | `dogfight` | 青（味方）vs 赤（敵）のチーム空戦モード |
| 総力戦 | `souryokusen` | 地上目標 17 個を全破壊する攻略モード |
| フリーフライト | `free` | 戦闘なし自由飛行モード |
| オリジナル MAP | `original` | 極限地形マップ（山脈・峡谷） |
| NEO 東京 MAP | `tokyo` | 実際の東京を模したサイバーパンク都市マップ |
| 巡航速度 | cruise speed | 150 m/s（540 km/h）。ブーストなし時の維持速度 |
| ブースト | boost | 最高速 550 m/s（1,980 km/h）まで加速する操作 |
| ブレーキ | brake | 最低速 50 m/s まで減速する操作 |
| ロックオン | lock-on | 3,000 m 以内の敵に照準を合わせる操作 |
| ホーミングミサイル | homing missile | ロックオンした目標を追尾するミサイル |
| フレア | flare | 敵ミサイルを撒き散らして回避するデコイ |
| スコア | score | 敵機・地上目標を撃墜した合計数 |
| ミッションクリア | mission complete | souryokusen で全目標破壊 |
| ゲームオーバー | game over | プレイヤー HP が 0 になった状態 |
| リスポーン | respawn | ゲームオーバー後に再出撃すること |
| 補給ポイント | supply point | HP・弾薬を回復できるマップ上の地点 |
| SAM | SAM | Surface-to-Air Missile。地上から発射される地対空ミサイル |
| キャリアボス | carrier boss | souryokusen の最終ボス。空母型の地上目標 |

---

## 2. 技術用語（Three.js / ゲームエンジン）

| 用語 | 定義 |
|---|---|
| `InstancedMesh` | 同一ジオメトリを大量に描画する Three.js のクラス。1 draw call で数百棟のビルを描画できる |
| `Box3` | 軸並行バウンディングボックス（AABB）。衝突判定に使用 |
| `GLTFLoader` | .glb / .gltf 形式の 3D モデルを読み込む Three.js のローダー |
| `MeshLambertMaterial` | 拡散反射のみのライティング。`MeshStandardMaterial` より軽量で都市ビルに使用 |
| `MeshStandardMaterial` | PBR（物理ベースレンダリング）マテリアル。機体モデルに使用 |
| `DataTexture` | JavaScript の `TypedArray` からリアルタイム生成するテクスチャ。ビルの窓模様に使用 |
| `FogExp2` | 指数関数的なフォグ。距離に比例して大気の霞みを表現 |
| `PMREM` | Pre-filtered Mipmapped Radiance Environment Map。金属反射の IBL に使用 |
| `ACESFilmic` | 映像的なトーンマッピング方式。露出 0.78 で黄金時間帯の雰囲気を演出 |
| `fBm` | Fractional Brownian Motion（分数ブラウン運動）。オリジナル地形のフラクタル起伏生成に使用 |
| `terrainH(x, z)` | オリジナル MAP の地形高度関数（main.ts）。`terrain_h()` (Blender) と完全一致が必須 |
| `heightAt(x, z)` | NEO 東京 MAP の地形高度関数（NeoTokyoMapSystem）。ガウス丘陵で東京地形を近似 |
| `polygonOffset` | Z-fighting（面のちらつき）を防ぐ描画オフセット設定。水面と地形の重なりに適用 |
| `seeded random` | 同じシード値から同じ乱数を生成する関数。`sr(n) = |sin(n×127.1+311.7) × 43758.5453 % 1|` |
| `sr(n)` | AirFighter 独自のシード乱数関数。ビルの位置・高さを毎回同じ配置で決定する |

---

## 3. マップシステム用語

| 用語 | 定義 |
|---|---|
| `landmarks` | 個別配置した `THREE.Mesh` / `THREE.Group` の配列。衝突判定対象 |
| `deco` | 視覚専用オブジェクトの配列。衝突なし。山手線・橋・水面・ホログラムなど |
| `instancedMeshes` | `InstancedMesh` の配列。都市のビル群。衝突なし（視覚専用） |
| `cleanup()` | マップ切替時に全オブジェクトを scene から除去するメソッド |
| `getCollisionObjects()` | 衝突判定対象オブジェクトを返すメソッド |
| `getSafeSpawnPosition()` | プレイヤー初期スポーン座標を返すメソッド |
| HALF | ビル配置グリッドの半径（m）。現在 NEO 東京では 6,000m |
| ROAD | ビル配置グリッドの間隔（m）。現在 NEO 東京では 600m |
| MAX_W | ビル 1 棟の最大幅（m）。廊下幅 = サブブロック間隔 - MAX_W |

---

## 4. 地名（NEO 東京マップ）

| 地名 | 座標 (x, z) | 特徴 |
|---|---|---|
| 東京駅 / 丸の内 | (30, 20) | 赤レンガ駅舎・CBD 中心 |
| 皇居 | (-500, 120) | 緑の公園・お堀・石垣 |
| 新宿 | (-2000, -200) | シアン系高層ビル群 |
| 渋谷 / 六本木 | (-1500, 1000) | ネオンピンク系 |
| 池袋 | (-2200, -2000) | 北西の繁華街 |
| 上野 / 秋葉原 | (400, -700) | 北東エリア |
| 浅草寺 | (1500, -1500) | 五重塔・雷門 |
| スカイツリー | (1600, -1400) | 634m 三角格子タワー |
| 東京タワー | (-600, 800) | 333m 赤白格子タワー |
| 六本木ヒルズ | (-1000, 1000) | 森タワー 238m |
| 麻布台ヒルズ | (-850, 950) | 日本一高層 330m |
| 国会議事堂 | (-600, 700) | ピラミッド屋根 |
| フジテレビ | (2000, 2000) | 球体展望台・お台場 |
| レインボーブリッジ | (1200, 1300)→(1900, 1800) | 吊り橋・お台場アクセス |
| 山手線 | ループ全線 | 高架鉄道・緑の車体 |
| お台場 | x>1500, z>1200 | 水面・aqua 系ビル |

---

## 5. ファイル名

| ファイル | 役割 |
|---|---|
| `src/main.ts` | ゲームロジック全体（単一ファイル設計） |
| `src/neoTokyoMapSystem.ts` | NEO 東京マップクラス |
| `src/multiplayer.ts` | マルチプレイクライアント（スタブ） |
| `public/terrain.glb` | オリジナル地形メッシュ（Blender 生成） |
| `public/models/fighter.glb` | プレイヤー機・敵機モデル |
| `public/models/carrier.glb` | ボスキャリアモデル |
| `blender/gen_terrain.py` | terrain.glb 生成スクリプト |
| `CLAUDE.md` | AI エージェント向け開発ガイド |
| `.steering/UI-DESIGN-RULES.md` | UI 設計ルール（横画面対応） |
