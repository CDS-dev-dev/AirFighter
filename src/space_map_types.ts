/**
 * 宇宙MAPゾーン設定の型定義
 * Auto-generated from space_zone_generator.py
 */

export type ZoneId = 'central_hub' | 'fortress' | 'mining_colony' | 'ship_graveyard' | 'orbital_ring' | 'construction';

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
