#!/usr/bin/env python3
"""
宇宙MAPゾーン配置ツール

6つのゾーンをMAP全体にバランスよく配置し、
Three.js用のJSON設定ファイルを生成する

Usage:
    python tools/space_zone_generator.py
"""

import json
import math
from typing import Dict, List, Tuple

# ゾーン定義
ZONES = {
    'fortress': {
        'name': '破壊された要塞',
        'glb_file': 'space_fortress_destroyed.glb',
        'description': '戦闘の跡が残る巨大要塞の残骸。内部に入れる破損部分あり',
        'size': 'large',  # 約300m
        'features': ['内部飛行可能', '多層構造', '破損開口部'],
    },
    'mining_colony': {
        'name': '小惑星採掘コロニー',
        'glb_file': 'space_mining_colony.glb',
        'description': 'くり抜かれた小惑星群。採掘ステーション、トンネル、輸送レール',
        'size': 'large',  # 約250m
        'features': ['小惑星内部空洞', 'トンネル飛行', '採掘施設'],
    },
    'ship_graveyard': {
        'name': '宇宙船墓場',
        'glb_file': 'space_ship_graveyard.glb',
        'description': '廃棄宇宙船が漂うスクラップヤード。船体間をすり抜ける',
        'size': 'large',  # 約400m
        'features': ['巨大船内部', 'デブリ層', 'サルベージ船'],
    },
    'orbital_ring': {
        'name': '軌道リング都市',
        'glb_file': 'space_orbital_ring.glb',
        'description': '巨大リング構造。リング内外、トンネル、ドッキングベイ',
        'size': 'xlarge',  # 約360m直径
        'features': ['リング内側飛行', '接続ブリッジ', 'トンネル'],
    },
    'construction': {
        'name': '建造現場',
        'glb_file': 'space_construction.glb',
        'description': '建造中のコロニー。足場、クレーン、トンネル骨組み',
        'size': 'large',  # 約280m
        'features': ['骨組み飛行', '作業船', 'トンネルフレーム'],
    },
    'central_hub': {
        'name': '中央補給ステーション',
        'glb_file': None,  # 既存のステーションを使用
        'description': 'プレイヤースタート地点、補給ポイント',
        'size': 'medium',  # 約100m
        'features': ['補給ビーコン', 'ナビゲーション'],
    }
}

# MAP境界（src/main.tsのMAP_BOUNDSと一致）
MAP_BOUNDS = {
    'minX': -7600,
    'maxX': 7600,
    'minZ': -7600,
    'maxZ': 7600,
    'minY': -620,
    'maxY': 720,
}

def calculate_zone_positions() -> Dict[str, Dict]:
    """
    6つのゾーンをMAP全体にバランスよく配置

    レイアウト:
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
    """

    zones_config = {}

    # 1. 中央補給ステーション（スタート地点）
    zones_config['central_hub'] = {
        'zone_id': 'central_hub',
        'position': {'x': 0, 'y': 130, 'z': 420},
        'rotation': {'x': 0, 'y': 0, 'z': 0},
        'scale': 1.0,
        **ZONES['central_hub']
    }

    # 2. 破壊された要塞（西）
    zones_config['fortress'] = {
        'zone_id': 'fortress',
        'position': {'x': -2200, 'y': 0, 'z': 0},
        'rotation': {'x': 0.15, 'y': -0.4, 'z': 0.2},
        'scale': 1.0,
        **ZONES['fortress']
    }

    # 3. 小惑星採掘コロニー（北西）
    zones_config['mining_colony'] = {
        'zone_id': 'mining_colony',
        'position': {'x': -1600, 'y': -100, 'z': -1800},
        'rotation': {'x': 0.2, 'y': 0.8, 'z': -0.1},
        'scale': 1.0,
        **ZONES['mining_colony']
    }

    # 4. 宇宙船墓場（南東）
    zones_config['ship_graveyard'] = {
        'zone_id': 'ship_graveyard',
        'position': {'x': 2000, 'y': -50, 'z': 1500},
        'rotation': {'x': -0.1, 'y': 0.6, 'z': 0.15},
        'scale': 1.0,
        **ZONES['ship_graveyard']
    }

    # 5. 軌道リング都市（東）
    zones_config['orbital_ring'] = {
        'zone_id': 'orbital_ring',
        'position': {'x': 2400, 'y': 100, 'z': -500},
        'rotation': {'x': 0.3, 'y': -0.5, 'z': 0.1},
        'scale': 1.0,
        **ZONES['orbital_ring']
    }

    # 6. 建造現場（北東）
    zones_config['construction'] = {
        'zone_id': 'construction',
        'position': {'x': 1800, 'y': 200, 'z': -2000},
        'rotation': {'x': -0.2, 'y': 0.3, 'z': 0.05},
        'scale': 1.0,
        **ZONES['construction']
    }

    return zones_config

def validate_positions(zones: Dict[str, Dict]) -> List[str]:
    """ゾーン配置のバリデーション"""
    warnings = []

    for zone_id, zone in zones.items():
        pos = zone['position']

        # MAP境界チェック
        if pos['x'] < MAP_BOUNDS['minX'] or pos['x'] > MAP_BOUNDS['maxX']:
            warnings.append(f"⚠️ {zone_id}: X座標がMAP外 ({pos['x']})")
        if pos['z'] < MAP_BOUNDS['minZ'] or pos['z'] > MAP_BOUNDS['maxZ']:
            warnings.append(f"⚠️ {zone_id}: Z座標がMAP外 ({pos['z']})")
        if pos['y'] < MAP_BOUNDS['minY'] or pos['y'] > MAP_BOUNDS['maxY']:
            warnings.append(f"⚠️ {zone_id}: Y座標がMAP外 ({pos['y']})")

    # ゾーン間距離チェック（近すぎないか）
    zone_list = list(zones.items())
    min_distance = 500  # 最小距離500m

    for i, (zone_id1, zone1) in enumerate(zone_list):
        for zone_id2, zone2 in zone_list[i+1:]:
            if zone_id1 == 'central_hub' or zone_id2 == 'central_hub':
                continue  # 中央ハブは除外

            pos1 = zone1['position']
            pos2 = zone2['position']

            distance = math.sqrt(
                (pos1['x'] - pos2['x']) ** 2 +
                (pos1['y'] - pos2['y']) ** 2 +
                (pos1['z'] - pos2['z']) ** 2
            )

            if distance < min_distance:
                warnings.append(
                    f"⚠️ {zone_id1}と{zone_id2}が近すぎる: {distance:.0f}m "
                    f"(推奨: {min_distance}m以上)"
                )

    return warnings

def calculate_navigation_routes(zones: Dict[str, Dict]) -> List[Dict]:
    """ゾーン間のナビゲーションルートを計算"""
    routes = []

    # 中央ハブから各ゾーンへのルート
    hub_pos = zones['central_hub']['position']

    for zone_id, zone in zones.items():
        if zone_id == 'central_hub':
            continue

        zone_pos = zone['position']

        # 距離計算
        distance = math.sqrt(
            (zone_pos['x'] - hub_pos['x']) ** 2 +
            (zone_pos['y'] - hub_pos['y']) ** 2 +
            (zone_pos['z'] - hub_pos['z']) ** 2
        )

        # 方向ベクトル
        direction = {
            'x': zone_pos['x'] - hub_pos['x'],
            'y': zone_pos['y'] - hub_pos['y'],
            'z': zone_pos['z'] - hub_pos['z']
        }

        # 正規化
        mag = math.sqrt(direction['x']**2 + direction['y']**2 + direction['z']**2)
        if mag > 0:
            direction = {k: v/mag for k, v in direction.items()}

        routes.append({
            'from': 'central_hub',
            'to': zone_id,
            'distance': round(distance, 1),
            'direction': direction,
            'waypoints': []  # 必要に応じて中間ポイントを追加
        })

    return routes

def generate_spawn_points(zones: Dict[str, Dict]) -> Dict[str, List[Dict]]:
    """各ゾーン付近の敵・味方スポーン地点を生成"""
    spawn_points = {
        'enemy': [],
        'ally': []
    }

    for zone_id, zone in zones.items():
        if zone_id == 'central_hub':
            continue

        pos = zone['position']

        # 各ゾーン周辺に敵スポーン地点を4箇所
        for i in range(4):
            angle = (i / 4) * math.pi * 2
            offset_dist = 300  # ゾーンから300m離れた位置

            spawn_points['enemy'].append({
                'zone': zone_id,
                'position': {
                    'x': pos['x'] + math.cos(angle) * offset_dist,
                    'y': pos['y'] + (i - 2) * 50,  # 高度に変化を付ける
                    'z': pos['z'] + math.sin(angle) * offset_dist
                }
            })

        # 各ゾーン周辺に味方スポーン地点を2箇所
        for i in range(2):
            angle = (i / 2) * math.pi * 2 + math.pi / 4
            offset_dist = 250

            spawn_points['ally'].append({
                'zone': zone_id,
                'position': {
                    'x': pos['x'] + math.cos(angle) * offset_dist,
                    'y': pos['y'] + (i - 0.5) * 40,
                    'z': pos['z'] + math.sin(angle) * offset_dist
                }
            })

    return spawn_points

def export_to_json(output_path: str):
    """設定をJSONファイルにエクスポート"""
    print("🌌 宇宙MAPゾーン配置を計算中...")

    # ゾーン配置計算
    zones = calculate_zone_positions()
    print(f"✅ {len(zones)}個のゾーンを配置")

    # バリデーション
    warnings = validate_positions(zones)
    if warnings:
        print("\n⚠️ 警告:")
        for warning in warnings:
            print(f"  {warning}")
    else:
        print("✅ バリデーション合格")

    # ナビゲーションルート計算
    routes = calculate_navigation_routes(zones)
    print(f"✅ {len(routes)}本のナビゲーションルートを計算")

    # スポーン地点生成
    spawn_points = generate_spawn_points(zones)
    print(f"✅ 敵スポーン地点: {len(spawn_points['enemy'])}箇所")
    print(f"✅ 味方スポーン地点: {len(spawn_points['ally'])}箇所")

    # 統合データ
    config = {
        'version': '1.0',
        'map_type': 'space_sector',
        'bounds': MAP_BOUNDS,
        'zones': zones,
        'navigation_routes': routes,
        'spawn_points': spawn_points,
        'meta': {
            'total_zones': len(zones),
            'total_area': (MAP_BOUNDS['maxX'] - MAP_BOUNDS['minX']) *
                         (MAP_BOUNDS['maxZ'] - MAP_BOUNDS['minZ']),
            'description': '宇宙MAPの6つのゾーン配置とナビゲーション設定'
        }
    }

    # JSON出力
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

    print(f"\n✅ エクスポート完了: {output_path}")
    print(f"📊 ファイルサイズ: {len(json.dumps(config))} bytes")

    # サマリー表示
    print("\n📍 ゾーン配置サマリー:")
    for zone_id, zone in zones.items():
        pos = zone['position']
        print(f"  • {zone['name']}: ({pos['x']:.0f}, {pos['y']:.0f}, {pos['z']:.0f})")

def export_typescript_types(output_path: str):
    """TypeScript型定義ファイルを生成"""
    zones = calculate_zone_positions()

    ts_content = '''/**
 * 宇宙MAPゾーン設定の型定義
 * Auto-generated from space_zone_generator.py
 */

export type ZoneId = ''' + ' | '.join(f"'{z}'" for z in zones.keys()) + ''';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface Rotation3D {
  x: number;
  y: number;
  z: number;
}

export interface ZoneConfig {
  zone_id: ZoneId;
  name: string;
  glb_file: string | null;
  description: string;
  size: 'medium' | 'large' | 'xlarge';
  features: string[];
  position: Position3D;
  rotation: Rotation3D;
  scale: number;
}

export interface NavigationRoute {
  from: ZoneId;
  to: ZoneId;
  distance: number;
  direction: Position3D;
  waypoints: Position3D[];
}

export interface SpawnPoint {
  zone: ZoneId;
  position: Position3D;
}

export interface SpaceMapConfig {
  version: string;
  map_type: 'space_sector';
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    minY: number;
    maxY: number;
  };
  zones: Record<ZoneId, ZoneConfig>;
  navigation_routes: NavigationRoute[];
  spawn_points: {
    enemy: SpawnPoint[];
    ally: SpawnPoint[];
  };
  meta: {
    total_zones: number;
    total_area: number;
    description: string;
  };
}
'''

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(ts_content)

    print(f"✅ TypeScript型定義エクスポート: {output_path}")

def main():
    """メイン処理"""
    import os

    # 出力パス
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_output = os.path.join(base_dir, 'public', 'space_map_zones.json')
    ts_output = os.path.join(base_dir, 'src', 'space_map_types.ts')

    # JSON生成
    export_to_json(json_output)

    # TypeScript型定義生成
    export_typescript_types(ts_output)

    print("\n🌌 宇宙MAPゾーン配置ツール完了！")

if __name__ == '__main__':
    main()
