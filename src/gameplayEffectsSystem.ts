// 機能統合: バイオーム効果と地形戦術効果

export interface BiomeEffect {
  name: string;
  visibilityMultiplier: number;  // 視界倍率（1.0が通常）
  speedMultiplier: number;        // 速度倍率
  radarAccuracy: number;          // レーダー精度（0.0-1.0）
  description: string;
}

export interface TerrainTacticalEffect {
  type: string;
  benefit: string;
  description: string;
}

// === バイオーム効果 ===

export const BIOME_EFFECTS: Record<string, BiomeEffect> = {
  snow: {
    name: '雪山',
    visibilityMultiplier: 0.7,  // 視界30%低下
    speedMultiplier: 0.9,        // 速度10%低下
    radarAccuracy: 0.85,         // レーダー精度85%
    description: '吹雪により視界低下、氷結リスクで速度低下'
  },

  jungle: {
    name: 'ジャングル',
    visibilityMultiplier: 0.6,  // 視界40%低下
    speedMultiplier: 1.0,        // 速度変化なし
    radarAccuracy: 0.6,          // レーダー精度60%
    description: '密林により視界遮蔽、レーダー精度大幅低下'
  },

  desert: {
    name: '砂漠',
    visibilityMultiplier: 0.8,  // 視界20%低下
    speedMultiplier: 0.95,       // 速度5%低下（熱波）
    radarAccuracy: 0.9,          // レーダー精度90%
    description: '熱波による視界歪み、エンジン冷却で速度微減'
  },

  temperate: {
    name: '温帯',
    visibilityMultiplier: 1.0,  // 視界通常
    speedMultiplier: 1.0,        // 速度通常
    radarAccuracy: 1.0,          // レーダー精度通常
    description: '標準的な気候条件'
  },

  underground: {
    name: '地下',
    visibilityMultiplier: 0.5,  // 視界50%低下
    speedMultiplier: 0.85,       // 速度15%低下
    radarAccuracy: 0.3,          // レーダー精度30%（GPS遮断）
    description: '暗闇で視界制限、GPSロストでレーダー機能低下'
  },

  urban: {
    name: '都市',
    visibilityMultiplier: 0.9,  // 視界10%低下
    speedMultiplier: 1.0,        // 速度通常
    radarAccuracy: 0.7,          // レーダー精度70%（建物反射）
    description: '建物による視界一部遮蔽、レーダー反射で精度低下'
  },

  space: {
    name: '宇宙',
    visibilityMultiplier: 1.2,  // 視界20%向上
    speedMultiplier: 1.05,       // 速度5%向上（空気抵抗なし）
    radarAccuracy: 1.0,          // レーダー精度通常
    description: '空気抵抗なしで視界良好、速度微増'
  },
};

// === 地形戦術効果 ===

export const TERRAIN_TACTICAL_EFFECTS: Record<string, TerrainTacticalEffect> = {
  canyon: {
    type: '峡谷',
    benefit: '敵レーダーから隠れる、ミサイル回避',
    description: '峡谷内を低空飛行することで敵のレーダーから消え、ミサイルの追尾を妨害'
  },

  mountain: {
    type: '山岳',
    benefit: '高度優位、上昇気流',
    description: '山岳上空で高度を取り、敵機に対する優位を確保。上昇気流で速度増加'
  },

  city: {
    type: '都市',
    benefit: '建物を盾に、敵AI追跡困難',
    description: '高層建築物を盾として利用し、敵AIの追跡を妨害'
  },

  forest: {
    type: '森林',
    benefit: '低空飛行で隠密',
    description: '樹冠すれすれを飛行することで視覚的に隠れ、発見されにくい'
  },

  open_field: {
    type: '開けた平野',
    benefit: '高速飛行、長距離射撃',
    description: '障害物がないため最高速度を維持でき、長距離射撃が有利'
  },

  underground_tunnel: {
    type: '地下トンネル',
    benefit: 'ミサイル完全回避、追跡不可',
    description: 'トンネル内では敵ミサイルが追跡不可能。ただし視界極めて悪い'
  },

  space_debris_belt: {
    type: 'デブリベルト',
    benefit: '隠密、ミサイル障害物',
    description: 'デブリの中に身を潜め、敵ミサイルはデブリに衝突する可能性'
  },

  space_station: {
    type: '宇宙ステーション',
    benefit: '防衛線利用、補給',
    description: 'ステーション防衛システムを利用し、補給ポイントへのアクセス'
  },
};

// === バイオーム判定（既存のgetBiome関数を使用） ===

export function getCurrentBiomeEffect(biome: string): BiomeEffect {
  return BIOME_EFFECTS[biome] || BIOME_EFFECTS.temperate;
}

// === 地形効果の適用 ===

export interface TerrainContext {
  altitude: number;
  nearestTerrain: string;  // 'canyon', 'mountain', 'city', etc.
  distanceToNearestTerrain: number;
}

export function getTerrainTacticalEffect(context: TerrainContext): TerrainTacticalEffect | null {
  // 地形に十分近い場合のみ効果を適用
  if (context.distanceToNearestTerrain > 200) {
    return null;
  }

  return TERRAIN_TACTICAL_EFFECTS[context.nearestTerrain] || null;
}

// === 速度補正の計算 ===

export function calculateSpeedModifier(biomeEffect: BiomeEffect, altitude: number): number {
  let modifier = biomeEffect.speedMultiplier;

  // 高度ボーナス（1000m以上で速度5%増加）
  if (altitude > 1000) {
    modifier *= 1.05;
  }

  // 低空ペナルティ（50m以下で速度5%減少）
  if (altitude < 50) {
    modifier *= 0.95;
  }

  return modifier;
}

// === レーダー精度の計算 ===

export function calculateRadarAccuracy(biomeEffect: BiomeEffect, terrainEffect: TerrainTacticalEffect | null): number {
  let accuracy = biomeEffect.radarAccuracy;

  // 地形効果によるレーダー精度低下
  if (terrainEffect) {
    if (terrainEffect.type === '峡谷' || terrainEffect.type === '地下トンネル') {
      accuracy *= 0.5;  // 峡谷・地下では50%に低下
    } else if (terrainEffect.type === '都市' || terrainEffect.type === 'デブリベルト') {
      accuracy *= 0.7;  // 都市・デブリベルトでは70%に低下
    }
  }

  return Math.max(0, Math.min(1, accuracy));
}

// === 視界範囲の計算 ===

export function calculateVisibilityRange(biomeEffect: BiomeEffect, baseRange: number): number {
  return baseRange * biomeEffect.visibilityMultiplier;
}

// === エフェクト情報の取得（HUD表示用） ===

export function getActiveEffects(biome: string, terrainContext: TerrainContext): {
  biomeEffect: BiomeEffect;
  terrainEffect: TerrainTacticalEffect | null;
  modifiers: {
    speed: number;
    radar: number;
    visibility: number;
  };
} {
  const biomeEffect = getCurrentBiomeEffect(biome);
  const terrainEffect = getTerrainTacticalEffect(terrainContext);

  const speedModifier = calculateSpeedModifier(biomeEffect, terrainContext.altitude);
  const radarAccuracy = calculateRadarAccuracy(biomeEffect, terrainEffect);
  const visibilityRange = calculateVisibilityRange(biomeEffect, 1.0);

  return {
    biomeEffect,
    terrainEffect,
    modifiers: {
      speed: speedModifier,
      radar: radarAccuracy,
      visibility: visibilityRange,
    },
  };
}

// === 隠密状態の判定 ===

export function isPlayerStealthy(terrainContext: TerrainContext, altitude: number): boolean {
  // 峡谷内かつ低空（100m以下）
  if (terrainContext.nearestTerrain === 'canyon' && altitude < 100 && terrainContext.distanceToNearestTerrain < 50) {
    return true;
  }

  // 森林内かつ超低空（30m以下）
  if (terrainContext.nearestTerrain === 'forest' && altitude < 30 && terrainContext.distanceToNearestTerrain < 20) {
    return true;
  }

  // 地下トンネル内
  if (terrainContext.nearestTerrain === 'underground_tunnel' && terrainContext.distanceToNearestTerrain < 30) {
    return true;
  }

  // デブリベルト内
  if (terrainContext.nearestTerrain === 'space_debris_belt' && terrainContext.distanceToNearestTerrain < 100) {
    return true;
  }

  return false;
}

// === ミサイル回避ボーナスの計算 ===

export function getMissileEvasionBonus(terrainContext: TerrainContext): number {
  // 峡谷内：ミサイル回避+30%
  if (terrainContext.nearestTerrain === 'canyon' && terrainContext.distanceToNearestTerrain < 50) {
    return 0.3;
  }

  // 都市内：ミサイル回避+20%
  if (terrainContext.nearestTerrain === 'city' && terrainContext.distanceToNearestTerrain < 100) {
    return 0.2;
  }

  // デブリベルト内：ミサイル回避+40%
  if (terrainContext.nearestTerrain === 'space_debris_belt' && terrainContext.distanceToNearestTerrain < 100) {
    return 0.4;
  }

  return 0;
}
