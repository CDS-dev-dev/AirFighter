import * as THREE from 'three';

// 主要エリアの詳細デザイン: 複数ルート、3D探索、隠しエリアへの手がかり

export interface DetailedArea {
  id: string;
  mapName: 'original' | 'tokyo' | 'space';
  name: string;
  description: string;
  centerPosition: { x: number; y: number; z: number };
  radius: number;
  routes: Route[];
  landmarks: Landmark[];
  secrets: SecretHint[];
}

export interface Route {
  id: string;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  waypoints: { x: number; y: number; z: number }[];
  description: string;
}

export interface Landmark {
  type: string;
  position: { x: number; y: number; z: number };
  description: string;
}

export interface SecretHint {
  position: { x: number; y: number; z: number };
  hint: string;
  leadsTo: string;  // 隠しエリアID
}

// === ORIGINAL MAP: 8エリア ===

const ORIGINAL_DETAILED_AREAS: DetailedArea[] = [
  {
    id: 'ori_titan_peak_summit',
    mapName: 'original',
    name: 'Titan Peak Summit（頂上アプローチ）',
    description: '標高1,500mの頂上への3つの登頂ルート',
    centerPosition: { x: -100, y: 1500, z: -2740 },
    radius: 300,
    routes: [
      {
        id: 'route_easy',
        name: '北東ルート（緩斜面）',
        difficulty: 'easy',
        waypoints: [
          { x: -50, y: 800, z: -2600 },
          { x: -70, y: 1100, z: -2650 },
          { x: -90, y: 1300, z: -2700 },
          { x: -100, y: 1500, z: -2740 },
        ],
        description: '最も安全だが時間がかかるルート'
      },
      {
        id: 'route_medium',
        name: '南西ルート（岩壁登攀）',
        difficulty: 'medium',
        waypoints: [
          { x: -150, y: 800, z: -2800 },
          { x: -130, y: 1200, z: -2770 },
          { x: -100, y: 1500, z: -2740 },
        ],
        description: '岩壁を登る中級者向けルート'
      },
      {
        id: 'route_hard',
        name: '西壁直登（氷壁）',
        difficulty: 'hard',
        waypoints: [
          { x: -200, y: 1000, z: -2740 },
          { x: -150, y: 1250, z: -2740 },
          { x: -100, y: 1500, z: -2740 },
        ],
        description: '氷壁を直登する上級者専用ルート'
      },
    ],
    landmarks: [
      { type: 'camp', position: { x: -80, y: 1100, z: -2750 }, description: 'ベースキャンプ跡' },
      { type: 'cairn', position: { x: -100, y: 1350, z: -2720 }, description: '頂上到達証明のケルン' },
      { type: 'observatory', position: { x: -90, y: 1490, z: -2740 }, description: '古代の観測所跡' },
    ],
    secrets: [
      { position: { x: -120, y: 1200, z: -2760 }, hint: '氷壁の裏に洞窟の入口が…', leadsTo: 'ori_hidden_ice_cave' },
    ],
  },

  {
    id: 'ori_grand_canyon_exploration',
    mapName: 'original',
    name: 'Grand Canyon Exploration（峡谷探索）',
    description: '地表から地底湖までの垂直探索',
    centerPosition: { x: 1300, y: 100, z: -1850 },
    radius: 400,
    routes: [
      {
        id: 'route_surface',
        name: '地表ルート（崖沿い）',
        difficulty: 'easy',
        waypoints: [
          { x: 1100, y: 200, z: -1800 },
          { x: 1200, y: 150, z: -1850 },
          { x: 1300, y: 100, z: -1900 },
          { x: 1400, y: 80, z: -1850 },
        ],
        description: '崖の縁を飛行する安全ルート'
      },
      {
        id: 'route_mid',
        name: '中層ルート（洞窟経由）',
        difficulty: 'medium',
        waypoints: [
          { x: 1200, y: 150, z: -1850 },
          { x: 1250, y: 80, z: -1870 },
          { x: 1300, y: 50, z: -1900 },
        ],
        description: '洞窟を通る中層ルート'
      },
      {
        id: 'route_deep',
        name: '深層ルート（地底湖直行）',
        difficulty: 'hard',
        waypoints: [
          { x: 1300, y: 200, z: -1850 },
          { x: 1300, y: 50, z: -1850 },
          { x: 1300, y: 10, z: -1850 },
        ],
        description: '峡谷を垂直降下する危険ルート'
      },
    ],
    landmarks: [
      { type: 'fossil_site', position: { x: 1350, y: 150, z: -1750 }, description: '化石発掘現場' },
      { type: 'underground_lake', position: { x: 1220, y: 10, z: -1950 }, description: '地底湖' },
      { type: 'mineral_vein', position: { x: 1400, y: 80, z: -1820 }, description: 'オリハルコン鉱脈' },
    ],
    secrets: [
      { position: { x: 1280, y: 50, z: -1900 }, hint: '滝の裏に隠された通路', leadsTo: 'ori_hidden_waterfall_cave' },
    ],
  },

  {
    id: 'ori_great_waterfall_approach',
    mapName: 'original',
    name: 'Great Waterfall Approach（滝接近）',
    description: '滝裏の洞窟へのアプローチルート',
    centerPosition: { x: 2100, y: 120, z: 1200 },
    radius: 250,
    routes: [
      {
        id: 'route_front',
        name: '正面ルート（滝壺経由）',
        difficulty: 'easy',
        waypoints: [
          { x: 2000, y: 50, z: 1150 },
          { x: 2080, y: 10, z: 1180 },
          { x: 2100, y: 50, z: 1200 },
        ],
        description: '滝壺から接近'
      },
      {
        id: 'route_behind',
        name: '裏ルート（滝裏洞窟）',
        difficulty: 'medium',
        waypoints: [
          { x: 2150, y: 100, z: 1150 },
          { x: 2100, y: 120, z: 1180 },
          { x: 2050, y: 180, z: 1150 },
        ],
        description: '滝の裏側を通るルート'
      },
      {
        id: 'route_top',
        name: '上部ルート（滝上から降下）',
        difficulty: 'hard',
        waypoints: [
          { x: 2100, y: 250, z: 1200 },
          { x: 2100, y: 150, z: 1200 },
          { x: 2050, y: 180, z: 1150 },
        ],
        description: '滝上から垂直降下'
      },
    ],
    landmarks: [
      { type: 'rainbow', position: { x: 2120, y: 120, z: 1250 }, description: '常時出現する虹' },
      { type: 'cave_entrance', position: { x: 2050, y: 180, z: 1150 }, description: '滝裏の洞窟入口' },
      { type: 'glowing_fish', position: { x: 2080, y: 10, z: 1180 }, description: '発光魚の群れ' },
    ],
    secrets: [
      { position: { x: 2050, y: 180, z: 1150 }, hint: '古代の壁画が示す方向…', leadsTo: 'ori_hidden_ancient_shrine' },
    ],
  },

  {
    id: 'ori_natural_arch_pass',
    mapName: 'original',
    name: 'Natural Arch Pass（アーチ通過）',
    description: 'Natural Archを通過する複数ルート',
    centerPosition: { x: -1800, y: 100, z: 1500 },
    radius: 200,
    routes: [
      {
        id: 'route_through',
        name: 'アーチ通過ルート',
        difficulty: 'medium',
        waypoints: [
          { x: -1900, y: 100, z: 1500 },
          { x: -1800, y: 100, z: 1500 },
          { x: -1700, y: 100, z: 1500 },
        ],
        description: 'アーチを通過する正統ルート'
      },
      {
        id: 'route_over',
        name: 'アーチ上空ルート',
        difficulty: 'easy',
        waypoints: [
          { x: -1900, y: 200, z: 1500 },
          { x: -1800, y: 200, z: 1500 },
          { x: -1700, y: 200, z: 1500 },
        ],
        description: 'アーチ上空を飛行'
      },
      {
        id: 'route_ascent',
        name: 'アーチ登攀ルート',
        difficulty: 'hard',
        waypoints: [
          { x: -1850, y: 60, z: 1520 },
          { x: -1820, y: 100, z: 1510 },
          { x: -1780, y: 150, z: 1490 },
        ],
        description: 'アーチ頂上に登る上級ルート'
      },
    ],
    landmarks: [
      { type: 'climber_memorial', position: { x: -1780, y: 150, z: 1490 }, description: 'クライマーの記念碑' },
      { type: 'wind_chime', position: { x: -1820, y: 60, z: 1520 }, description: '風が奏でる自然の音' },
    ],
    secrets: [
      { position: { x: -1830, y: 100, z: 1510 }, hint: '日の出時の影が指す場所…', leadsTo: 'ori_hidden_shadow_shrine' },
    ],
  },

  {
    id: 'ori_alpine_lake_shore',
    mapName: 'original',
    name: 'Alpine Lake Shore（高地湖畔）',
    description: '湖畔周辺と湖底探索',
    centerPosition: { x: -800, y: 440, z: -1200 },
    radius: 200,
    routes: [
      {
        id: 'route_shore',
        name: '湖畔ルート',
        difficulty: 'easy',
        waypoints: [
          { x: -850, y: 440, z: -1150 },
          { x: -800, y: 440, z: -1200 },
          { x: -750, y: 440, z: -1150 },
        ],
        description: '湖畔沿いを飛行'
      },
      {
        id: 'route_dive',
        name: '湖底探索ルート',
        difficulty: 'hard',
        waypoints: [
          { x: -800, y: 440, z: -1200 },
          { x: -800, y: 350, z: -1200 },
          { x: -800, y: 260, z: -1200 },
        ],
        description: '湖底の構造物を調査'
      },
    ],
    landmarks: [
      { type: 'cabin', position: { x: -780, y: 440, z: -1190 }, description: '隠者の小屋' },
      { type: 'underwater_structure', position: { x: -800, y: 260, z: -1200 }, description: '湖底の謎の構造物' },
    ],
    secrets: [
      { position: { x: -800, y: 260, z: -1200 }, hint: '湖底の構造物は何かの入口…', leadsTo: 'ori_hidden_underwater_complex' },
    ],
  },

  {
    id: 'ori_jungle_heart_center',
    mapName: 'original',
    name: 'Jungle Heart Center（ジャングル中心）',
    description: 'ジャングル最深部への侵入ルート',
    centerPosition: { x: 820, y: 80, z: 2200 },
    radius: 300,
    routes: [
      {
        id: 'route_canopy',
        name: 'キャノピー（樹冠）ルート',
        difficulty: 'medium',
        waypoints: [
          { x: 700, y: 120, z: 2100 },
          { x: 760, y: 150, z: 2150 },
          { x: 820, y: 120, z: 2200 },
        ],
        description: '樹冠を飛行するルート'
      },
      {
        id: 'route_ground',
        name: '地上ルート',
        difficulty: 'hard',
        waypoints: [
          { x: 700, y: 50, z: 2100 },
          { x: 760, y: 60, z: 2150 },
          { x: 820, y: 50, z: 2200 },
        ],
        description: '地面すれすれを飛ぶ危険ルート'
      },
    ],
    landmarks: [
      { type: 'giant_tree', position: { x: 850, y: 80, z: 2250 }, description: '巨大樹' },
      { type: 'ancient_ruins', position: { x: 820, y: 120, z: 2180 }, description: 'ジャングルに埋もれた古代遺跡' },
      { type: 'bioluminescent_mushrooms', position: { x: 800, y: 50, z: 2220 }, description: '発光キノコの群生地' },
    ],
    secrets: [
      { position: { x: 820, y: 120, z: 2180 }, hint: '遺跡の壁に刻まれた地図…', leadsTo: 'ori_hidden_jungle_temple' },
    ],
  },

  {
    id: 'ori_desert_oasis_refuge',
    mapName: 'original',
    name: 'Desert Oasis Refuge（砂漠オアシス）',
    description: 'オアシス周辺の探索',
    centerPosition: { x: 2500, y: 12, z: -800 },
    radius: 150,
    routes: [
      {
        id: 'route_oasis',
        name: 'オアシス周回ルート',
        difficulty: 'easy',
        waypoints: [
          { x: 2450, y: 15, z: -750 },
          { x: 2500, y: 12, z: -800 },
          { x: 2550, y: 15, z: -750 },
        ],
        description: 'オアシスを周回'
      },
    ],
    landmarks: [
      { type: 'caravan_rest', position: { x: 2480, y: 15, z: -750 }, description: 'キャラバン休息地跡' },
      { type: 'water_source', position: { x: 2500, y: 12, z: -800 }, description: '湧水源' },
      { type: 'star_chart', position: { x: 2490, y: 10, z: -780 }, description: '古代の星図' },
    ],
    secrets: [
      { position: { x: 2520, y: 10, z: -820 }, hint: '砂に埋もれた階段が見える…', leadsTo: 'ori_hidden_underground_spring' },
    ],
  },

  {
    id: 'ori_underground_sanctuary_entry',
    mapName: 'original',
    name: 'Underground Sanctuary Entry（地下シェルター入口）',
    description: '地下シェルターへの降下',
    centerPosition: { x: 100, y: -100, z: -500 },
    radius: 200,
    routes: [
      {
        id: 'route_main',
        name: 'メインシャフト',
        difficulty: 'medium',
        waypoints: [
          { x: 100, y: 50, z: -500 },
          { x: 100, y: -50, z: -500 },
          { x: 100, y: -150, z: -500 },
        ],
        description: 'メインエレベーターシャフト'
      },
      {
        id: 'route_emergency',
        name: '緊急脱出経路',
        difficulty: 'hard',
        waypoints: [
          { x: 150, y: 0, z: -450 },
          { x: 130, y: -100, z: -480 },
          { x: 100, y: -150, z: -500 },
        ],
        description: '狭い緊急脱出路'
      },
    ],
    landmarks: [
      { type: 'entrance', position: { x: 100, y: -50, z: -500 }, description: 'シェルター入口、開いたまま' },
      { type: 'time_capsule', position: { x: 110, y: -170, z: -510 }, description: '2156年のタイムカプセル' },
      { type: 'life_support', position: { x: 120, y: -150, z: -520 }, description: '生命維持システム、稼働中' },
    ],
    secrets: [
      { position: { x: 80, y: -200, z: -480 }, hint: 'シェルター最深部に封印された部屋…', leadsTo: 'ori_hidden_deep_vault' },
    ],
  },
];

// === TOKYO MAP: 6エリア ===

const TOKYO_DETAILED_AREAS: DetailedArea[] = [
  {
    id: 'tok_mega_tower_ascent',
    mapName: 'tokyo',
    name: 'Mega Tower Ascent（メガタワー上昇）',
    description: '800m高のメガタワーを登る3ルート',
    centerPosition: { x: 0, y: 400, z: 0 },
    radius: 100,
    routes: [
      {
        id: 'route_exterior',
        name: '外壁ルート',
        difficulty: 'easy',
        waypoints: [
          { x: 50, y: 100, z: 0 },
          { x: 40, y: 300, z: 0 },
          { x: 20, y: 600, z: 0 },
          { x: 0, y: 798, z: 0 },
        ],
        description: '外壁沿いを上昇'
      },
      {
        id: 'route_interior',
        name: '内部ルート（エレベーターシャフト）',
        difficulty: 'hard',
        waypoints: [
          { x: 0, y: 100, z: 0 },
          { x: 0, y: 400, z: 0 },
          { x: 0, y: 700, z: 0 },
          { x: 0, y: 798, z: 0 },
        ],
        description: 'エレベーターシャフト内を直登'
      },
      {
        id: 'route_spiral',
        name: 'スパイラルルート',
        difficulty: 'medium',
        waypoints: [
          { x: 50, y: 100, z: 50 },
          { x: -50, y: 300, z: 50 },
          { x: -50, y: 500, z: -50 },
          { x: 50, y: 700, z: -50 },
          { x: 0, y: 798, z: 0 },
        ],
        description: 'タワーを螺旋状に上昇'
      },
    ],
    landmarks: [
      { type: 'floor_70_observation', position: { x: 10, y: 700, z: -20 }, description: '70階展望台' },
      { type: 'comm_antenna', position: { x: -20, y: 780, z: 15 }, description: '78階通信室' },
      { type: 'rooftop', position: { x: 0, y: 798, z: 0 }, description: '最上階屋上' },
    ],
    secrets: [
      { position: { x: 5, y: 795, z: -5 }, hint: '最上階の封鎖されたラボ…', leadsTo: 'tok_hidden_secret_lab' },
    ],
  },

  {
    id: 'tok_skytree_observation',
    mapName: 'tokyo',
    name: 'Skytree Observation（スカイツリー展望）',
    description: '634mのスカイツリー展望デッキ巡り',
    centerPosition: { x: 600, y: 450, z: -400 },
    radius: 80,
    routes: [
      {
        id: 'route_ascent',
        name: '上昇ルート',
        difficulty: 'medium',
        waypoints: [
          { x: 600, y: 100, z: -400 },
          { x: 600, y: 350, z: -400 },
          { x: 600, y: 550, z: -400 },
          { x: 600, y: 630, z: -400 },
        ],
        description: 'スカイツリーを直登'
      },
    ],
    landmarks: [
      { type: 'deck_1', position: { x: 610, y: 350, z: -410 }, description: '第一展望台（350m）' },
      { type: 'deck_2', position: { x: 590, y: 450, z: -390 }, description: '第二展望台（450m）' },
      { type: 'antenna_top', position: { x: 605, y: 630, z: -405 }, description: '頂上アンテナ' },
    ],
    secrets: [
      { position: { x: 595, y: 500, z: -395 }, hint: '展望台の隠し部屋…', leadsTo: 'tok_hidden_observation_room' },
    ],
  },

  {
    id: 'tok_stadium_interior',
    mapName: 'tokyo',
    name: 'Stadium Interior（スタジアム内部）',
    description: '直径400mのドーム型スタジアム探索',
    centerPosition: { x: -600, y: 45, z: 800 },
    radius: 200,
    routes: [
      {
        id: 'route_arena',
        name: 'アリーナ周回',
        difficulty: 'easy',
        waypoints: [
          { x: -600, y: 35, z: 800 },
          { x: -550, y: 40, z: 850 },
          { x: -600, y: 45, z: 900 },
          { x: -650, y: 40, z: 850 },
        ],
        description: 'アリーナを周回'
      },
      {
        id: 'route_roof',
        name: '屋根ルート',
        difficulty: 'medium',
        waypoints: [
          { x: -600, y: 25, z: 800 },
          { x: -600, y: 65, z: 800 },
        ],
        description: '開閉式屋根を通過'
      },
    ],
    landmarks: [
      { type: 'center_field', position: { x: -600, y: 25, z: 800 }, description: 'センターフィールド' },
      { type: 'underground_facility', position: { x: -610, y: 5, z: 810 }, description: '地下トレーニング施設' },
    ],
    secrets: [
      { position: { x: -620, y: 15, z: 780 }, hint: 'VIP専用通路の先…', leadsTo: 'tok_hidden_vip_lounge' },
    ],
  },

  {
    id: 'tok_underground_labyrinth',
    mapName: 'tokyo',
    name: 'Underground Labyrinth（地下迷宮）',
    description: '5層構造の地下都市探索',
    centerPosition: { x: 50, y: -150, z: -50 },
    radius: 150,
    routes: [
      {
        id: 'route_level_1',
        name: 'レベル1（地下街）',
        difficulty: 'easy',
        waypoints: [
          { x: 50, y: -50, z: -50 },
          { x: 80, y: -50, z: -80 },
          { x: 20, y: -50, z: -20 },
        ],
        description: '地下街レベル'
      },
      {
        id: 'route_level_3',
        name: 'レベル3（地下農場）',
        difficulty: 'medium',
        waypoints: [
          { x: 50, y: -50, z: -50 },
          { x: 80, y: -150, z: -80 },
          { x: 50, y: -180, z: -50 },
        ],
        description: '地下農場を通過'
      },
      {
        id: 'route_level_5',
        name: 'レベル5（リニア新幹線）',
        difficulty: 'hard',
        waypoints: [
          { x: 50, y: -50, z: -50 },
          { x: 50, y: -250, z: -50 },
        ],
        description: '最深部のリニア新幹線トンネル'
      },
    ],
    landmarks: [
      { type: 'shopping_district', position: { x: 80, y: -50, z: -80 }, description: '地下ショッピング街' },
      { type: 'farm', position: { x: 80, y: -180, z: -80 }, description: '地下農場' },
      { type: 'linear_station', position: { x: 50, y: -250, z: -50 }, description: 'リニア駅' },
    ],
    secrets: [
      { position: { x: 20, y: -250, z: -20 }, hint: '封鎖された旧トンネル…', leadsTo: 'tok_hidden_old_metro' },
    ],
  },

  {
    id: 'tok_port_district',
    mapName: 'tokyo',
    name: 'Port District（港湾地区）',
    description: '自動化コンテナターミナルと港湾施設',
    centerPosition: { x: -1200, y: 15, z: 1500 },
    radius: 300,
    routes: [
      {
        id: 'route_docks',
        name: 'ドック周回',
        difficulty: 'easy',
        waypoints: [
          { x: -1100, y: 15, z: 1400 },
          { x: -1200, y: 15, z: 1500 },
          { x: -1300, y: 15, z: 1600 },
        ],
        description: 'ドックエリアを周回'
      },
      {
        id: 'route_container',
        name: 'コンテナ迷路',
        difficulty: 'hard',
        waypoints: [
          { x: -1150, y: 20, z: 1480 },
          { x: -1180, y: 15, z: 1490 },
          { x: -1220, y: 18, z: 1520 },
        ],
        description: 'コンテナの間を縫うルート'
      },
    ],
    landmarks: [
      { type: 'container_terminal', position: { x: -1200, y: 8, z: 1500 }, description: '自動化コンテナターミナル' },
      { type: 'crane', position: { x: -1150, y: 25, z: 1480 }, description: '巨大クレーン' },
      { type: 'warehouse', position: { x: -1250, y: 12, z: 1520 }, description: '倉庫群' },
    ],
    secrets: [
      { position: { x: -1250, y: 5, z: 1550 }, hint: '倉庫の地下に隠された入口…', leadsTo: 'tok_hidden_smuggling_tunnel' },
    ],
  },

  {
    id: 'tok_rainbow_bridge_crossing',
    mapName: 'tokyo',
    name: 'Rainbow Bridge Crossing（レインボーブリッジ横断）',
    description: '放棄車両の渋滞を抜けるルート',
    centerPosition: { x: 1500, y: 100, z: 0 },
    radius: 200,
    routes: [
      {
        id: 'route_upper',
        name: '上層ルート',
        difficulty: 'medium',
        waypoints: [
          { x: 1300, y: 120, z: 0 },
          { x: 1500, y: 100, z: 0 },
          { x: 1700, y: 120, z: 0 },
        ],
        description: '橋の上層を通過'
      },
      {
        id: 'route_slalom',
        name: 'スラロームルート',
        difficulty: 'hard',
        waypoints: [
          { x: 1300, y: 100, z: -10 },
          { x: 1400, y: 95, z: 10 },
          { x: 1500, y: 100, z: -10 },
          { x: 1600, y: 95, z: 10 },
          { x: 1700, y: 100, z: 0 },
        ],
        description: '車両の間をスラローム'
      },
    ],
    landmarks: [
      { type: 'checkpoint', position: { x: 1500, y: 100, z: 0 }, description: '検問所跡' },
      { type: 'car_pile', position: { x: 1450, y: 98, z: 5 }, description: '放棄車両の列' },
    ],
    secrets: [
      { position: { x: 1520, y: 80, z: -20 }, hint: '橋の下に避難者の痕跡…', leadsTo: 'tok_hidden_bridge_shelter' },
    ],
  },
];

// === SPACE MAP: 6エリア ===

const SPACE_DETAILED_AREAS: DetailedArea[] = [
  {
    id: 'spa_mothership_command',
    mapName: 'space',
    name: 'Mothership Command Deck（艦橋）',
    description: '全長1,000m旗艦の艦橋エリア探索',
    centerPosition: { x: 0, y: 550, z: 0 },
    radius: 150,
    routes: [
      {
        id: 'route_approach',
        name: '正面アプローチ',
        difficulty: 'medium',
        waypoints: [
          { x: 0, y: 400, z: -200 },
          { x: 0, y: 500, z: -100 },
          { x: 0, y: 550, z: 0 },
        ],
        description: '艦橋への正面アプローチ'
      },
      {
        id: 'route_hangar',
        name: '格納庫経由',
        difficulty: 'hard',
        waypoints: [
          { x: 50, y: 450, z: -50 },
          { x: 30, y: 500, z: -30 },
          { x: 0, y: 550, z: 0 },
        ],
        description: '格納庫を通過して艦橋へ'
      },
    ],
    landmarks: [
      { type: 'bridge', position: { x: 20, y: 550, z: -30 }, description: '司令室' },
      { type: 'captains_quarters', position: { x: -15, y: 580, z: 20 }, description: '艦長室' },
      { type: 'escape_pods', position: { x: -20, y: 600, z: 15 }, description: '脱出ポッド格納庫' },
    ],
    secrets: [
      { position: { x: 30, y: 530, z: -20 }, hint: 'ブラックボックスが示す座標…', leadsTo: 'spa_hidden_secret_room' },
    ],
  },

  {
    id: 'spa_fortress_core_descent',
    mapName: 'space',
    name: 'Fortress Core Descent（要塞コア降下）',
    description: '3層構造の要塞を最深部まで降下',
    centerPosition: { x: -800, y: 450, z: 800 },
    radius: 200,
    routes: [
      {
        id: 'route_layer1',
        name: 'Layer 1突破',
        difficulty: 'easy',
        waypoints: [
          { x: -800, y: 500, z: 700 },
          { x: -800, y: 450, z: 750 },
          { x: -800, y: 420, z: 800 },
        ],
        description: '外殻層を突破'
      },
      {
        id: 'route_layer2',
        name: 'Layer 2通過',
        difficulty: 'medium',
        waypoints: [
          { x: -800, y: 420, z: 800 },
          { x: -780, y: 380, z: 780 },
          { x: -800, y: 350, z: 800 },
        ],
        description: '居住層を通過'
      },
      {
        id: 'route_core',
        name: 'コア到達',
        difficulty: 'hard',
        waypoints: [
          { x: -800, y: 350, z: 800 },
          { x: -810, y: 300, z: 810 },
          { x: -800, y: 250, z: 800 },
        ],
        description: '要塞コアへ降下'
      },
    ],
    landmarks: [
      { type: 'outer_armor', position: { x: -820, y: 450, z: 820 }, description: '外殻装甲、チタン合金50cm' },
      { type: 'living_quarters', position: { x: -780, y: 380, z: 780 }, description: '居住区' },
      { type: 'core_reactor', position: { x: -800, y: 250, z: 800 }, description: 'コア反応炉' },
    ],
    secrets: [
      { position: { x: -790, y: 280, z: 790 }, hint: 'コア制御室の封印されたデータ…', leadsTo: 'spa_hidden_ai_chamber' },
    ],
  },

  {
    id: 'spa_mining_colony_depths',
    mapName: 'space',
    name: 'Mining Colony Depths（採掘コロニー深部）',
    description: '小惑星内部の採掘坑道探索',
    centerPosition: { x: 1200, y: 200, z: -1200 },
    radius: 150,
    routes: [
      {
        id: 'route_main_shaft',
        name: 'メインシャフト',
        difficulty: 'medium',
        waypoints: [
          { x: 1200, y: 250, z: -1200 },
          { x: 1200, y: 200, z: -1200 },
          { x: 1200, y: 150, z: -1200 },
        ],
        description: 'メイン採掘シャフト'
      },
      {
        id: 'route_tunnel',
        name: '坑道ネットワーク',
        difficulty: 'hard',
        waypoints: [
          { x: 1200, y: 200, z: -1200 },
          { x: 1220, y: 180, z: -1220 },
          { x: 1180, y: 160, z: -1180 },
        ],
        description: '複雑な坑道を通過'
      },
    ],
    landmarks: [
      { type: 'drill_robot', position: { x: 1210, y: 250, z: -1210 }, description: '最新型ドリルロボット' },
      { type: 'miners_quarters', position: { x: 1200, y: 180, z: -1200 }, description: '鉱夫の居住区' },
      { type: 'temple', position: { x: 1180, y: 150, z: -1180 }, description: '小惑星内部の古代寺院' },
    ],
    secrets: [
      { position: { x: 1180, y: 150, z: -1180 }, hint: '寺院の壁に刻まれた星図…', leadsTo: 'spa_hidden_ancient_chamber' },
    ],
  },

  {
    id: 'spa_habitat_module_life',
    mapName: 'space',
    name: 'Habitat Module Life（居住区）',
    description: '宇宙居住区の日常空間探索',
    centerPosition: { x: -1000, y: 500, z: 1500 },
    radius: 100,
    routes: [
      {
        id: 'route_corridor',
        name: '居住区通路',
        difficulty: 'easy',
        waypoints: [
          { x: -1050, y: 500, z: 1450 },
          { x: -1000, y: 500, z: 1500 },
          { x: -950, y: 500, z: 1550 },
        ],
        description: '居住区を通過'
      },
    ],
    landmarks: [
      { type: 'quarters', position: { x: -1000, y: 500, z: 1500 }, description: '家族居住区' },
      { type: 'farm_dome', position: { x: -980, y: 520, z: 1520 }, description: '農業ドーム' },
      { type: 'school', position: { x: -1020, y: 490, z: 1480 }, description: '学校' },
    ],
    secrets: [
      { position: { x: -1000, y: 510, z: 1500 }, hint: '個室に残された日記の最後のページ…', leadsTo: 'spa_hidden_diary_room' },
    ],
  },

  {
    id: 'spa_derelict_fleet_assembly',
    mapName: 'space',
    name: 'Derelict Fleet Assembly（廃艦隊集積所）',
    description: '船墓場の5隻の戦艦内部探索',
    centerPosition: { x: 2350, y: -250, z: -1600 },
    radius: 400,
    routes: [
      {
        id: 'route_exterior',
        name: '外部ルート',
        difficulty: 'easy',
        waypoints: [
          { x: 2100, y: -200, z: -1600 },
          { x: 2300, y: -150, z: -1700 },
          { x: 2500, y: -100, z: -1500 },
        ],
        description: '艦外を飛行'
      },
      {
        id: 'route_interior',
        name: '艦内ルート',
        difficulty: 'hard',
        waypoints: [
          { x: 2100, y: -200, z: -1600 },
          { x: 2200, y: -180, z: -1650 },
          { x: 2300, y: -150, z: -1700 },
          { x: 2400, y: -120, z: -1550 },
          { x: 2500, y: -100, z: -1500 },
        ],
        description: '破損した艦内を通過'
      },
    ],
    landmarks: [
      { type: 'flagship_wreck', position: { x: 2100, y: -200, z: -1600 }, description: '旗艦の残骸' },
      { type: 'battleship_wreck', position: { x: 2300, y: -150, z: -1700 }, description: '戦艦の残骸' },
      { type: 'personal_effects', position: { x: 2250, y: -170, z: -1650 }, description: '乗組員の遺品' },
    ],
    secrets: [
      { position: { x: 2350, y: -130, z: -1620 }, hint: '艦長室の金庫に残された座標…', leadsTo: 'spa_hidden_treasure_vault' },
    ],
  },

  {
    id: 'spa_observatory_watchtower',
    mapName: 'space',
    name: 'Observatory Watchtower（観測所監視塔）',
    description: '謎の信号を捉えた観測所',
    centerPosition: { x: 2000, y: 350, z: 1800 },
    radius: 100,
    routes: [
      {
        id: 'route_approach',
        name: 'アプローチルート',
        difficulty: 'medium',
        waypoints: [
          { x: 1900, y: 300, z: 1700 },
          { x: 1950, y: 325, z: 1750 },
          { x: 2000, y: 350, z: 1800 },
        ],
        description: '観測所へのアプローチ'
      },
    ],
    landmarks: [
      { type: 'telescope', position: { x: 2000, y: 350, z: 1800 }, description: '大型望遠鏡' },
      { type: 'computer', position: { x: 2005, y: 351, z: 1805 }, description: 'データ記録コンピューター' },
      { type: 'warning', position: { x: 2007, y: 352, z: 1807 }, description: '警告メッセージ' },
    ],
    secrets: [
      { position: { x: 2010, y: 355, z: 1810 }, hint: '望遠鏡が向けられている方角…', leadsTo: 'spa_hidden_anomaly_zone' },
    ],
  },
];

// 全詳細エリアをエクスポート
export const ALL_DETAILED_AREAS: DetailedArea[] = [
  ...ORIGINAL_DETAILED_AREAS,
  ...TOKYO_DETAILED_AREAS,
  ...SPACE_DETAILED_AREAS,
];

// MAPごとの詳細エリアを取得
export function getDetailedAreasByMap(mapName: 'original' | 'tokyo' | 'space'): DetailedArea[] {
  return ALL_DETAILED_AREAS.filter(area => area.mapName === mapName);
}

// ルートマーカーのビジュアル作成
export function createRouteMarkers(scene: THREE.Scene, areas: DetailedArea[]): THREE.Group {
  const markersGroup = new THREE.Group();
  markersGroup.name = 'RouteMarkers';

  const markerMat = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    emissive: 0x00ff00,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.6,
  });

  for (const area of areas) {
    for (const route of area.routes) {
      for (const waypoint of route.waypoints) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(3, 8, 8),
          markerMat
        );

        marker.position.set(waypoint.x, waypoint.y, waypoint.z);
        marker.userData = {
          areaId: area.id,
          routeId: route.id,
          routeName: route.name,
          difficulty: route.difficulty,
        };

        markersGroup.add(marker);
      }
    }
  }

  scene.add(markersGroup);
  return markersGroup;
}

// エリア情報の取得（プレイヤーが近づいた時）
export function getAreaInfo(playerPosition: THREE.Vector3, areas: DetailedArea[]): DetailedArea | null {
  for (const area of areas) {
    const distance = playerPosition.distanceTo(
      new THREE.Vector3(area.centerPosition.x, area.centerPosition.y, area.centerPosition.z)
    );

    if (distance < area.radius) {
      return area;
    }
  }
  return null;
}
