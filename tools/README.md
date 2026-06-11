# 宇宙MAP生成ツール

宇宙MAPのゾーン配置を計算し、設定ファイルを生成するツール。

## space_zone_generator.py

6つのゾーンをMAP全体にバランスよく配置し、Three.js用のJSON設定ファイルを生成。

### 使用方法

```bash
python tools/space_zone_generator.py
```

### 出力ファイル

1. **`public/space_map_zones.json`**  
   ゾーン配置設定（位置、回転、スケール、メタデータ）

2. **`src/space_map_types.ts`**  
   TypeScript型定義

### 生成される設定

#### ゾーン配置

```
         北（Z-）
    ┌─────────────┐
    │ ⛏️ │ 🏗️ │
    │採掘│建造│
    ├─────┼─────┤
西  │💥│🌟│🌌│  東
(X-)│要塞│中央│環│(X+)
    ├─────┼─────┤
    │ 🚀 │
    │墓場│
    └─────────────┘
         南（Z+）
```

- **中央補給ステーション**: (0, 130, 420) - スタート地点
- **破壊された要塞**: (-2200, 0, 0) - 西
- **小惑星採掘コロニー**: (-1600, -100, -1800) - 北西
- **宇宙船墓場**: (2000, -50, 1500) - 南東
- **軌道リング都市**: (2400, 100, -500) - 東
- **建造現場**: (1800, 200, -2000) - 北東

#### 追加情報

- **ナビゲーションルート**: 中央ハブから各ゾーンへの方向ベクトル
- **スポーン地点**: 敵20箇所、味方10箇所（各ゾーン周辺）

### JSON構造

```json
{
  "version": "1.0",
  "map_type": "space_sector",
  "bounds": {
    "minX": -7600,
    "maxX": 7600,
    "minZ": -7600,
    "maxZ": 7600,
    "minY": -620,
    "maxY": 720
  },
  "zones": {
    "fortress": {
      "zone_id": "fortress",
      "name": "破壊された要塞",
      "glb_file": "space_fortress_destroyed.glb",
      "position": {"x": -2200, "y": 0, "z": 0},
      "rotation": {"x": 0.15, "y": -0.4, "z": 0.2},
      "scale": 1.0,
      "size": "large",
      "features": ["内部飛行可能", "多層構造", "破損開口部"]
    }
    ...
  }
}
```

### カスタマイズ

#### ゾーン位置を変更

`space_zone_generator.py`の`calculate_zone_positions()`関数内で座標を変更：

```python
zones_config['fortress'] = {
    'position': {'x': -2200, 'y': 0, 'z': 0},  # ← ここを変更
    'rotation': {'x': 0.15, 'y': -0.4, 'z': 0.2},
    'scale': 1.0,
    ...
}
```

#### ゾーン追加

1. `ZONES`辞書に新しいゾーン定義を追加
2. `calculate_zone_positions()`で配置を追加
3. ツールを再実行

### バリデーション

ツールは以下をチェック：

- ✅ MAP境界内に配置されているか
- ✅ ゾーン間の距離（最小500m）
- ⚠️ 警告が出た場合は配置を調整

### トラブルシューティング

#### エラー: `ModuleNotFoundError: No module named 'json'`
→ Python 3.8以上を使用してください

#### 警告: ゾーンが近すぎる
→ `calculate_zone_positions()`で座標を調整

#### TypeScript型定義が生成されない
→ `src/`ディレクトリが存在するか確認

## 開発フロー

1. **ゾーン配置を決定**  
   `tools/space_zone_generator.py`を実行

2. **3Dモデルを生成**  
   `blender/generate_*.py`を実行

3. **ゲームに統合**  
   `src/main.ts`の`loadSpaceZones()`が自動で読み込み

4. **テスト**  
   `npm run dev`で動作確認

## ライセンス

MIT License
