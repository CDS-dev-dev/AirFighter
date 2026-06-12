# Phase 11: Blenderモデル品質向上 - 設計書

## アーキテクチャ

### 1. モデル管理システム

```
public/models/
├── rock_monolith_small.glb
├── rock_monolith_medium.glb
├── rock_monolith_large.glb
├── rock_natural_bridge_small.glb
├── rock_natural_bridge_medium.glb
├── rock_natural_bridge_large.glb
├── building_cylindrical_small.glb
├── building_cylindrical_medium.glb
├── building_cylindrical_large.glb
├── structure_elevated_highway_segment.glb
├── space_ring_station_small.glb
├── space_ring_station_medium.glb
├── space_ring_station_large.glb
├── space_antenna_small.glb
├── space_antenna_large.glb
├── space_wreck_type1.glb
├── space_wreck_type2.glb
├── space_wreck_type3.glb
├── space_wreck_type4.glb
└── space_wreck_type5.glb
```

### 2. GLBローダーシステム

```typescript
// GLBローダーのキャッシュシステム
class ModelCache {
  private cache = new Map<string, THREE.Group>()
  private loader = new GLTFLoader()

  async load(path: string): Promise<THREE.Group> {
    if (this.cache.has(path)) {
      return this.cache.get(path)!.clone()
    }
    
    return new Promise((resolve, reject) => {
      this.loader.load(
        import.meta.env.BASE_URL + path,
        (gltf) => {
          this.cache.set(path, gltf.scene)
          resolve(gltf.scene.clone())
        },
        undefined,
        reject
      )
    })
  }

  clear() {
    this.cache.clear()
  }
}

const modelCache = new ModelCache()
```

### 3. LODシステム

```typescript
// LOD自動生成
function createLOD(
  highDetail: THREE.Group,
  mediumDetail: THREE.Group,
  lowDetail: THREE.Group
): THREE.LOD {
  const lod = new THREE.LOD()
  lod.addLevel(highDetail, 0)      // 0-500m
  lod.addLevel(mediumDetail, 500)  // 500-1500m
  lod.addLevel(lowDetail, 1500)    // 1500m-
  return lod
}

// 使用例
const highModel = await modelCache.load('models/rock_monolith_large.glb')
const mediumModel = await modelCache.load('models/rock_monolith_medium.glb')
const lowModel = await modelCache.load('models/rock_monolith_small.glb')
const lod = createLOD(highModel, mediumModel, lowModel)
lod.position.set(x, y, z)
scene.add(lod)
```

### 4. 衝突判定システム

```typescript
// GLBモデルから自動的にコライダー生成
function createColliderFromGLB(model: THREE.Group): THREE.Mesh {
  const bbox = new THREE.Box3().setFromObject(model)
  const size = bbox.getSize(new THREE.Vector3())
  const center = bbox.getCenter(new THREE.Vector3())
  
  const collider = new THREE.Mesh(
    new THREE.BoxGeometry(size.x, size.y, size.z),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  collider.position.copy(center)
  collider.name = 'Collider'
  
  return collider
}

// 円筒形の場合
function createCylindricalCollider(
  model: THREE.Group,
  radius: number,
  height: number
): THREE.Mesh {
  const collider = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 16),
    new THREE.MeshBasicMaterial({ visible: false })
  )
  collider.position.copy(model.position)
  collider.position.y += height / 2
  collider.name = 'Collider'
  
  return collider
}
```

---

## 実装詳細

### Original MAP: 奇岩（Monolith）

```typescript
// buildWorldStructures() 内に追加
async function loadMonoliths() {
  const MONOLITH_MODELS = ['small', 'medium', 'large']
  const models = await Promise.all(
    MONOLITH_MODELS.map(size => 
      modelCache.load(`models/rock_monolith_${size}.glb`)
    )
  )

  for (const mono of MONOLITHS) {
    // 高さに応じてモデルを選択
    let modelIndex = 0
    if (mono.h > 550) modelIndex = 2      // large
    else if (mono.h > 480) modelIndex = 1 // medium
    else modelIndex = 0                    // small

    const model = models[modelIndex].clone()
    const base = terrainH(mono.x, mono.z)
    
    model.position.set(mono.x, base, mono.z)
    model.scale.setScalar(mono.h / 500) // 基準高500m
    model.rotation.y = Math.random() * Math.PI
    
    // シャドウ設定
    model.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).castShadow = true
        ;(child as THREE.Mesh).receiveShadow = true
      }
    })
    
    scene.add(model)
    
    // コライダー
    const collider = createColliderFromGLB(model)
    scene.add(collider)
  }
}

// 初期化時に呼び出し
if (currentMap === 'original') {
  await loadMonoliths()
}
```

### Original MAP: 自然橋（Natural Bridge）

```typescript
async function loadNaturalBridges() {
  const BRIDGE_MODELS = ['small', 'medium', 'large']
  const models = await Promise.all(
    BRIDGE_MODELS.map(size => 
      modelCache.load(`models/rock_natural_bridge_${size}.glb`)
    )
  )

  for (const bridge of NATURAL_BRIDGES) {
    // スパンに応じてモデルを選択
    let modelIndex = 0
    if (bridge.span > 130) modelIndex = 2
    else if (bridge.span > 110) modelIndex = 1
    else modelIndex = 0

    const model = models[modelIndex].clone()
    const base = terrainH(bridge.x, bridge.z)
    
    model.position.set(bridge.x, base + bridge.h, bridge.z)
    model.scale.setScalar(bridge.span / 120) // 基準スパン120m
    model.rotation.y = Math.random() * Math.PI
    
    model.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).castShadow = true
        ;(child as THREE.Mesh).receiveShadow = true
      }
    })
    
    scene.add(model)
  }
}
```

### Tokyo MAP: 円筒形ビル

```typescript
// NeoTokyoMapSystem.createBuildings() 内に追加
async loadCylindricalTowers() {
  const TOWER_MODELS = ['small', 'medium', 'large']
  const models = await Promise.all(
    TOWER_MODELS.map(size => 
      modelCache.load(`models/building_cylindrical_${size}.glb`)
    )
  )

  for (const tower of CYLINDRICAL_TOWERS) {
    // 高さに応じてモデルを選択
    let modelIndex = 0
    if (tower.h > 420) modelIndex = 2
    else if (tower.h > 380) modelIndex = 1
    else modelIndex = 0

    const model = models[modelIndex].clone()
    const gy = NeoTokyoMapSystem.heightAt(tower.x, tower.z)
    
    model.position.set(tower.x, gy, tower.z)
    model.scale.set(
      tower.r / 75,
      tower.h / 400,
      tower.r / 75
    )
    
    // 発光設定（エミッシブ）
    model.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = !this.mobile
        mesh.receiveShadow = !this.mobile
        
        // 窓の発光
        if (mesh.material && 'emissive' in mesh.material) {
          (mesh.material as any).emissive = new THREE.Color(0x1a3d5f)
          ;(mesh.material as any).emissiveIntensity = 0.3
        }
      }
    })
    
    this.scene.add(model)
    
    // コライダー
    const collider = createCylindricalCollider(model, tower.r, tower.h)
    this.scene.add(collider)
    this.buildingColliders.push(collider)
  }
}
```

### Space MAP: リングステーション

```typescript
// buildSpaceMap() 内に追加
async function loadRingStations() {
  const RING_MODELS = ['small', 'medium', 'large']
  const models = await Promise.all(
    RING_MODELS.map(size => 
      modelCache.load(`models/space_ring_station_${size}.glb`)
    )
  )

  for (const ring of RING_STATIONS) {
    // 半径に応じてモデルを選択
    let modelIndex = 0
    if (ring.radius > 220) modelIndex = 2
    else if (ring.radius > 190) modelIndex = 1
    else modelIndex = 0

    const model = models[modelIndex].clone()
    
    model.position.set(ring.x, ring.y, ring.z)
    model.scale.setScalar(ring.radius / 200) // 基準半径200m
    model.rotation.x = Math.random() * Math.PI
    model.rotation.z = Math.random() * Math.PI
    
    // メタリック質感
    model.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (mesh.material && 'metalness' in mesh.material) {
          (mesh.material as any).metalness = 0.8
          ;(mesh.material as any).roughness = 0.3
        }
      }
    })
    
    space.add(model)
    rotatingSpaceObjects.push(model)
  }
}
```

### Space MAP: 破損船体（バリエーション）

```typescript
async function loadSpaceWrecks() {
  const WRECK_TYPES = ['type1', 'type2', 'type3', 'type4', 'type5']
  const models = await Promise.all(
    WRECK_TYPES.map(type => 
      modelCache.load(`models/space_wreck_${type}.glb`)
    )
  )

  for (const wreck of WRECKS) {
    // ランダムにバリエーションを選択
    const model = models[Math.floor(Math.random() * models.length)].clone()
    
    model.position.set(wreck.x, wreck.y, wreck.z)
    model.scale.setScalar(wreck.scale / 80) // 基準スケール80
    model.rotation.set(
      Math.random() * Math.PI / 4,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI / 4
    )
    
    // 損傷・劣化の質感
    model.traverse(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        if (mesh.material && 'metalness' in mesh.material) {
          (mesh.material as any).metalness = 0.6
          ;(mesh.material as any).roughness = 0.9
        }
      }
    })
    
    space.add(model)
  }
}
```

---

## パフォーマンス最適化

### 1. 非同期ロード
```typescript
// 全モデルを並列ロード
async function preloadModels() {
  const modelPaths = [
    'models/rock_monolith_small.glb',
    'models/rock_monolith_medium.glb',
    // ... 他のモデル
  ]
  
  await Promise.all(modelPaths.map(path => modelCache.load(path)))
  console.log('All models preloaded')
}

// ゲーム開始前にロード
await preloadModels()
```

### 2. インスタンシング（同一モデル多数配置時）
```typescript
// 同じモデルを大量配置する場合はInstancedMeshを使用
function createInstancedWrecks(model: THREE.Group, count: number) {
  // モデルからメッシュを抽出
  const meshes: THREE.Mesh[] = []
  model.traverse(child => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh)
  })
  
  // 各メッシュをインスタンス化
  const instancedMeshes = meshes.map(mesh => {
    const instancedMesh = new THREE.InstancedMesh(
      mesh.geometry,
      mesh.material,
      count
    )
    return instancedMesh
  })
  
  return instancedMeshes
}
```

### 3. Frustum Culling（視錐台カリング）
```typescript
// Three.jsが自動的に行うが、明示的に設定することも可能
model.frustumCulled = true
```

### 4. テクスチャ圧縮
```typescript
// モバイル用にテクスチャを動的に縮小
function optimizeTextures(model: THREE.Group) {
  model.traverse(child => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh
      if (mesh.material && 'map' in mesh.material) {
        const texture = (mesh.material as any).map as THREE.Texture
        if (texture && isMobileDevice) {
          texture.anisotropy = 1
          texture.minFilter = THREE.LinearMipmapLinearFilter
        }
      }
    }
  })
}
```

---

## テスト計画

### 1. ビジュアル確認
- [ ] 各モデルが正しく表示される
- [ ] テクスチャが正しく適用される
- [ ] ライティングが適切
- [ ] 遠景でもシルエットが認識できる

### 2. パフォーマンステスト
- [ ] デスクトップ: 60fps維持
- [ ] モバイル: 30fps維持
- [ ] ロード時間: 5秒以内
- [ ] メモリ使用量: 許容範囲内

### 3. 機能テスト
- [ ] 衝突判定が機能する
- [ ] LODが正しく切り替わる
- [ ] キャッシュが機能する
- [ ] 回転アニメーションが動作する（リングステーション）

---

## 移行計画

### Phase 11-A: 高優先度モデル実装
1. Blenderモデル作成（外注）
2. GLBファイルを`public/models/`に配置
3. コード実装（奇岩、自然橋、リングステーション、破損船体）
4. テスト・調整

### Phase 11-B: 中優先度モデル実装
1. Blenderモデル作成（外注）
2. コード実装（円筒ビル、アンテナ）
3. テスト・調整

### Phase 11-C: 低優先度モデル実装
1. Blenderモデル作成（外注）
2. コード実装（高架道路）
3. テスト・調整

### Phase 11-D: 最適化
1. LOD実装
2. パフォーマンス最適化
3. 最終テスト

---

## 今後の拡張性

### 1. モデルバリエーション追加
- 各カテゴリにさらに多様なモデルを追加
- 季節・時間帯による見た目の変化

### 2. プロシージャル配置の高度化
- バイオーム（地域特性）に応じた配置
- 密度マップによる動的配置

### 3. インタラクティブ要素
- 破壊可能な構造物
- 動的な環境変化（崩壊、爆発）

### 4. アニメーション
- リングステーションの回転
- アンテナの可動
- 破損船体の浮遊

これらの拡張は、Blender製GLBモデルであれば容易に実装可能です。
