# Blender 3Dモデル生成スクリプト

宇宙MAP用の高品質3Dモデルを生成するBlenderスクリプト集。

## 生成されるモデル

| スクリプト | 出力ファイル | サイズ | 説明 |
|-----------|------------|--------|------|
| `generate_construction.py` | `space_construction.glb` | 4.5MB | 建造中コロニー、クレーン、足場 |
| `generate_destroyed_fortress.py` | `space_fortress_destroyed.glb` | 1.3MB | 破壊された要塞、内部飛行可能 |
| `generate_mining_colony.py` | `space_mining_colony.glb` | 764KB | 小惑星採掘コロニー、トンネル |
| `generate_orbital_ring.py` | `space_orbital_ring.glb` | 3.0MB | 軌道リング都市、ドッキングベイ |
| `generate_ship_graveyard.py` | `space_ship_graveyard.glb` | 1.2MB | 宇宙船墓場、デブリ層 |

## 使用方法

### 前提条件

- Blender 3.4以上がインストールされていること
- Python 3.8以上

### 個別生成

```bash
# 破壊された要塞
blender --background --python blender/generate_destroyed_fortress.py

# 採掘コロニー
blender --background --python blender/generate_mining_colony.py

# 宇宙船墓場
blender --background --python blender/generate_ship_graveyard.py

# 軌道リング都市
blender --background --python blender/generate_orbital_ring.py

# 建造現場
blender --background --python blender/generate_construction.py
```

### 一括生成

```bash
# 全てのモデルを並列生成
for script in blender/generate_*.py; do
    blender --background --python "$script" &
done
wait
```

生成されたGLBファイルは `public/` ディレクトリに出力されます。

## モデルの特徴

### 🏗️ 建造現場（space_construction.glb）
- 建造中のコロニー骨組み（4セクション、円筒型+円錐型）
- 建設クレーン（3基、高さ90-120m）
- 足場構造（8基、作業灯付き）
- 作業船（5隻、溶接アーム搭載）
- トンネル骨組み（24セグメント、飛行可能）

### 💥 破壊された要塞（space_fortress_destroyed.glb）
- 中央コア構造（内部空洞、飛行可能）
- 破損防御タワー（4基、破損開口部あり）
- 浮遊装甲板（20枚、損傷バリエーション）
- 砲台残骸（8基、微かな発光）
- デブリフィールド（80個、ランダム配置）

### ⛏️ 小惑星採掘コロニー（space_mining_colony.glb）
- くり抜かれた小惑星（メイン1個+サブ3個）
- 採掘ステーション（6基、ドリルアーム付き）
- 輸送レール（3本、支柱付き）
- トンネル（3本、内部照明あり）
- 鉱石コンテナ（15個）
- 鉱石処理プラント（煙突、パイプライン）

### 🌌 軌道リング都市（space_orbital_ring.glb）
- メインリング（直径360m、トーラス構造）
- 居住モジュール（24個、窓・アンテナ付き）
- タワー（6基、高さ50-80m、展望台）
- 接続ブリッジ（3本、照明ガイド付き）
- トンネルセグメント（64個、内部交通路）
- ドッキングベイ（4個、誘導灯付き）
- 放射状スポーク（8本、中心部へ）

### 🚀 宇宙船墓場（space_ship_graveyard.glb）
- 廃棄巡洋艦（2隻、大型、内部飛行可能）
- 廃棄フリゲート（5隻、中型）
- 貨物コンテナ船（3隻、開いた貨物室）
- サルベージ船（2隻、作業中、発光）
- デブリ層（210個、3層構造）

## カスタマイズ

各スクリプトは以下のパラメータで調整可能：

- オブジェクト数（モバイル用に削減可能）
- スケール
- マテリアル（色、発光強度）
- 配置（ランダムシード）

例：
```python
# generate_destroyed_fortress.py の冒頭で
isMobileDevice = True  # モバイル用に簡素化
debris_count = 40  # デブリ数を半減
```

## トラブルシューティング

### エラー: `NameError: name 'Euler' is not defined`
→ `from mathutils import Vector, Matrix, Euler` を確認

### エラー: `TypeError: Vector.rotate(value): expected a Euler`
→ `rotation`タプルを`Euler(rotation)`に変換

### GLBファイルが大きすぎる
→ スクリプト内のオブジェクト数を削減
→ Blenderの「Decimate Modifier」で頂点数削減

## 技術詳細

- **マテリアル**: Principled BSDF（メタリック、ラフネス、発光）
- **ジオメトリ**: プリミティブ + Boolean演算
- **エクスポート**: glTF 2.0 (.glb)
- **座標系**: Three.js準拠（Y-up）

## ライセンス

MIT License - 自由に改変・再配布可能
