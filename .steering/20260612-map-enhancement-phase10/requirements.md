# Phase 10: MAP体験総合強化

## 実装日
2026-06-12

## バージョン
v5.56.0 → v5.57.0

## 問題点

### 1. Tokyo MAP: Urban Canyonが視覚的に不明瞭 🔴
**現状**:
- `URBAN_CANYONS` は11本定義されている
- ビル配置の除外条件としてのみ使用
- プレイヤーには「飛行回廊」として認識されない

**問題**:
- どこを飛べばいいか分からない
- Urban Canyonの戦術的な意味が薄い
- 世界観（都市の谷間を飛ぶ）が伝わらない

**改善**:
- Urban Canyon沿いに「壁ビル」を配置
- 両側に高さ300-400mの統一された壁を作る
- 視覚的に明確な飛行回廊を形成

---

### 2. Original MAP: 峡谷が飛行ルートとして不明瞭 🟡
**現状**:
- 十字峡谷の地形は存在する（X軸・Z軸）
- 峡谷の深さが浅い（視覚的に弱い）
- ナビゲーションビーコンが峡谷を誘導していない

**問題**:
- プレイヤーが峡谷を飛行ルートとして認識しない
- 峡谷を使った戦術（低空飛行、隠密）が成立しない

**改善**:
- 峡谷入口にナビゲーションビーコンを4箇所配置
- 峡谷の深さを強調（地形関数の調整）
- 峡谷の壁に視覚的な目印（岩の色変更）

---

### 3. Space MAP: 構造物密度が低い 🟡
**現状**:
- 宇宙ステーション: 5基
- デブリ: 少数
- 飛行の障害物として不足

**問題**:
- 広大な空間で構造物が疎らすぎる
- 障害物回避の楽しさが少ない
- 世界観（デブリフィールド）が弱い

**改善**:
- デブリフィールドの密度を2倍に
- 巨大回転リングステーション追加（3基）
- 破損した船体パーツを追加

---

### 4. 全MAP: 構造物の多様性が不足 🟢
**現状**:
- Original: 岩柱とアーチのみ
- Tokyo: 四角いビルのみ
- Space: 既存モデルの使い回し

**問題**:
- 視覚的な単調さ
- 探索の面白さが少ない
- 世界観の深みが不足

**改善**:
- **Original**: 
  - 自然橋（3箇所）
  - 巨大奇岩（5箇所、高さ400-600m）
  - 洞窟入口（視覚的な目印）
- **Tokyo**: 
  - 曲線ビル（5棟、円筒形）
  - 巨大高架道路（2本）
  - 吊り橋（レインボーブリッジ強化）
- **Space**: 
  - リング状ステーション（3基、回転）
  - 巨大通信アンテナ（3基）
  - 破損船体（大型、10個）

---

## 実装タスク

### Task 1: Tokyo Urban Canyon 視覚化
**ファイル**: `src/neoTokyoMapSystem.ts`

**実装内容**:
```typescript
// collectBuildingSpecs() に追加

// Urban Canyon Wall Buildings
for (const canyon of URBAN_CANYONS) {
  if (canyon.width < 400) continue  // 狭すぎる峡谷は壁を作らない
  
  const length = Math.hypot(canyon.x2 - canyon.x1, canyon.z2 - canyon.z1)
  const steps = Math.floor(length / 180)  // 180m間隔
  
  for (let i = 0; i < steps; i++) {
    const t = i / steps
    const cx = canyon.x1 + (canyon.x2 - canyon.x1) * t
    const cz = canyon.z1 + (canyon.z2 - canyon.z1) * t
    
    // 両側に壁ビル配置
    const wallOffset = canyon.width / 2 + 60
    const angle = Math.atan2(canyon.z2 - canyon.z1, canyon.x2 - canyon.x1) + Math.PI / 2
    
    for (const side of [-1, 1]) {
      const x = cx + Math.cos(angle) * wallOffset * side
      const z = cz + Math.sin(angle) * wallOffset * side
      const h = 300 + Math.random() * 100  // 統一された高さ
      
      pushSpec({
        type: 0,
        x, z,
        w: 160 + Math.random() * 40,
        d: 160 + Math.random() * 40,
        h,
        ry: angle + Math.PI / 2
      })
    }
  }
}
```

---

### Task 2: Original 峡谷誘導強化
**ファイル**: `src/main.ts`

**実装内容**:
```typescript
// ナビゲーションビーコン追加（峡谷入口4箇所）
const CANYON_BEACONS = [
  { x: -1200, z: 0, label: 'West Canyon' },
  { x: 1200, z: 0, label: 'East Canyon' },
  { x: 0, z: -1200, label: 'North Canyon' },
  { x: 0, z: 1200, label: 'South Canyon' },
]

for (const beacon of CANYON_BEACONS) {
  const beaconGroup = new THREE.Group()
  beaconGroup.name = `CanyonBeacon_${beacon.label}`
  beaconGroup.position.set(beacon.x, terrainH(beacon.x, beacon.z) + 50, beacon.z)
  
  // 発光マーカー
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 8, 60, 8),
    new THREE.MeshStandardMaterial({ 
      color: 0x00ff88, 
      emissive: 0x00ff88, 
      emissiveIntensity: 0.8 
    })
  )
  beaconGroup.add(marker)
  scene.add(beaconGroup)
}
```

**峡谷深さ強調**:
```typescript
// terrainH() 関数内のX軸峡谷・Z軸峡谷の係数を調整
// 現状: canyon = smooth(1 - Math.abs(xnorm) / 0.15) * -28
// 改善: canyon = smooth(1 - Math.abs(xnorm) / 0.15) * -50
```

---

### Task 3: Space MAP 構造物密度向上
**ファイル**: `src/main.ts`

**実装内容**:
```typescript
// デブリフィールド密度2倍
// 現状のデブリ生成ループを探して数を増やす

// 巨大回転リングステーション追加
const RING_STATIONS = [
  { x: -800, y: 400, z: -800, radius: 200, rotSpeed: 0.001 },
  { x: 800, y: -200, z: 600, radius: 180, rotSpeed: -0.0008 },
  { x: 0, y: 600, z: 0, radius: 250, rotSpeed: 0.0012 },
]

for (const ring of RING_STATIONS) {
  const ringGeo = new THREE.TorusGeometry(ring.radius, 20, 16, 32)
  const ringMesh = new THREE.Mesh(
    ringGeo,
    new THREE.MeshStandardMaterial({ 
      color: 0x4488bb, 
      metalness: 0.8, 
      roughness: 0.3 
    })
  )
  ringMesh.position.set(ring.x, ring.y, ring.z)
  ringMesh.rotation.x = Math.random() * Math.PI
  ringMesh.rotation.z = Math.random() * Math.PI
  ringMesh.name = 'SpaceRingStation'
  scene.add(ringMesh)
  
  // 回転アニメーション用に配列に保存
  rotatingObjects.push({ mesh: ringMesh, speed: ring.rotSpeed })
}
```

---

### Task 4: Original MAP 構造物多様性
**ファイル**: `src/main.ts`

**実装内容**:
```typescript
// 巨大奇岩（Monolith）
const MONOLITHS = [
  { x: -500, z: -1200, h: 480 },
  { x: 600, z: 1000, h: 520 },
  { x: -1000, z: 800, h: 450 },
  { x: 1100, z: -900, h: 500 },
  { x: -200, z: 0, h: 600 },
]

for (const mono of MONOLITHS) {
  const base = terrainH(mono.x, mono.z)
  const geometry = new THREE.BoxGeometry(40, mono.h, 60)
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ 
      color: 0x8b7355, 
      roughness: 0.95 
    })
  )
  mesh.position.set(mono.x, base + mono.h / 2, mono.z)
  mesh.rotation.y = Math.random() * Math.PI
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.name = 'OriginalMonolith'
  scene.add(mesh)
}

// 自然橋（Natural Bridge）
const NATURAL_BRIDGES = [
  { x: 400, z: -600, span: 120, h: 80 },
  { x: -700, z: 500, span: 140, h: 90 },
  { x: 200, z: 800, span: 100, h: 70 },
]

for (const bridge of NATURAL_BRIDGES) {
  const base = terrainH(bridge.x, bridge.z)
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(bridge.span / 2, 12, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ 
      color: 0x9b8575, 
      roughness: 0.9 
    })
  )
  arch.position.set(bridge.x, base + bridge.h, bridge.z)
  arch.rotation.z = Math.PI / 2
  arch.rotation.y = Math.random() * Math.PI
  arch.castShadow = true
  arch.name = 'NaturalBridge'
  scene.add(arch)
}
```

---

### Task 5: Tokyo MAP 構造物多様性
**ファイル**: `src/neoTokyoMapSystem.ts`

**実装内容**:
```typescript
// 円筒形ビル（Cylindrical Towers）
const CYLINDRICAL_TOWERS = [
  { x: -1200, z: 600, h: 420, r: 80 },
  { x: 800, z: -800, h: 380, r: 70 },
  { x: -400, z: -1200, h: 450, r: 85 },
  { x: 1000, z: 1200, h: 400, r: 75 },
  { x: -1800, z: -1000, h: 360, r: 65 },
]

// createBuildings() メソッド内で追加
for (const tower of CYLINDRICAL_TOWERS) {
  const geo = new THREE.CylinderGeometry(tower.r, tower.r, tower.h, 32)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({
      color: 0xaebbd0,
      emissive: new THREE.Color(0x1a3d5f),
      emissiveIntensity: 0.3,
    })
  )
  const gy = NeoTokyoMapSystem.heightAt(tower.x, tower.z)
  mesh.position.set(tower.x, gy + tower.h / 2, tower.z)
  mesh.castShadow = !this.mobile
  mesh.name = 'CylindricalTower'
  this.scene.add(mesh)
  
  // Collider
  const collider = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }))
  collider.position.copy(mesh.position)
  collider.name = 'BuildingCollider'
  this.scene.add(collider)
  this.buildingColliders.push(collider)
}

// 巨大高架道路（Elevated Highway）
const HIGHWAYS = [
  { x1: -2000, z1: -1500, x2: 2000, z2: -1500, y: 100, width: 40 },
  { x1: 1500, z1: -2000, x2: 1500, z2: 2000, y: 120, width: 40 },
]

for (const hw of HIGHWAYS) {
  const length = Math.hypot(hw.x2 - hw.x1, hw.z2 - hw.z1)
  const geo = new THREE.BoxGeometry(hw.width, 8, length)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 })
  )
  const angle = Math.atan2(hw.z2 - hw.z1, hw.x2 - hw.x1)
  mesh.position.set((hw.x1 + hw.x2) / 2, hw.y, (hw.z1 + hw.z2) / 2)
  mesh.rotation.y = angle
  mesh.name = 'ElevatedHighway'
  this.scene.add(mesh)
}
```

---

### Task 6: Space MAP 構造物多様性
**ファイル**: `src/main.ts`

**実装内容**:
```typescript
// 巨大通信アンテナ
const ANTENNAS = [
  { x: -600, y: 200, z: -400, h: 300 },
  { x: 800, y: -100, z: 700, h: 350 },
  { x: -400, y: 500, z: 800, h: 280 },
]

for (const ant of ANTENNAS) {
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(8, 12, ant.h, 8),
    new THREE.MeshStandardMaterial({ 
      color: 0xaaaaaa, 
      metalness: 0.9, 
      roughness: 0.2 
    })
  )
  tower.position.set(ant.x, ant.y, ant.z)
  tower.name = 'SpaceAntenna'
  scene.add(tower)
  
  // アンテナ皿
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(40, 35, 10, 32),
    new THREE.MeshStandardMaterial({ 
      color: 0xcccccc, 
      metalness: 0.8, 
      roughness: 0.3 
    })
  )
  dish.position.set(ant.x, ant.y + ant.h / 2 + 20, ant.z)
  dish.rotation.x = Math.PI / 6
  dish.name = 'AntennaDish'
  scene.add(dish)
}

// 破損船体（大型）
const WRECKS = [
  { x: -900, y: 100, z: -600, scale: 80 },
  { x: 700, y: -200, z: 500, scale: 100 },
  { x: -300, y: 400, z: 900, scale: 70 },
  { x: 900, y: 300, z: -800, scale: 90 },
  { x: -1000, y: -100, z: 300, scale: 85 },
  { x: 400, y: 500, z: -900, scale: 75 },
  { x: -700, y: -300, z: -1000, scale: 95 },
  { x: 1000, y: 200, z: 600, scale: 80 },
  { x: -500, y: 600, z: -300, scale: 70 },
  { x: 600, y: -400, z: 1000, scale: 85 },
]

for (const wreck of WRECKS) {
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(wreck.scale, wreck.scale * 0.4, wreck.scale * 2),
    new THREE.MeshStandardMaterial({ 
      color: 0x553322, 
      metalness: 0.6, 
      roughness: 0.9 
    })
  )
  hull.position.set(wreck.x, wreck.y, wreck.z)
  hull.rotation.set(
    Math.random() * Math.PI / 4,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI / 4
  )
  hull.name = 'SpaceWreck'
  scene.add(hull)
}
```

---

## 成功基準

### Task 1: Tokyo Urban Canyon
- [ ] Urban Canyon沿いに壁ビルが配置される
- [ ] 飛行回廊が視覚的に明確
- [ ] プレイヤーがUrban Canyonを認識できる

### Task 2: Original 峡谷誘導
- [ ] 峡谷入口に4つのビーコン配置
- [ ] ビーコンが視覚的に目立つ
- [ ] 峡谷の深さが強調される

### Task 3: Space 構造物密度
- [ ] デブリが2倍に増加
- [ ] リングステーション3基が回転
- [ ] 障害物として機能

### Task 4-6: 構造物多様性
- [ ] Original: 巨大奇岩5個、自然橋3個
- [ ] Tokyo: 円筒ビル5棟、高架道路2本
- [ ] Space: アンテナ3基、破損船体10個

---

## 期待される効果

1. **飛行体験の明確化**: どこを飛べばいいか分かる
2. **戦術性の向上**: 地形を活かした戦闘が可能
3. **視覚的な豊かさ**: 単調さの解消
4. **世界観の深化**: 各MAPの個性が強まる

---

## 実装順序
1. Task 1: Tokyo Urban Canyon（30分）
2. Task 2: Original 峡谷誘導（20分）
3. Task 3: Space 構造物密度（20分）
4. Task 4: Original 多様性（25分）
5. Task 5: Tokyo 多様性（30分）
6. Task 6: Space 多様性（25分）

合計: 約2.5時間
