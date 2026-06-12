# Phase 11: Blenderモデル品質向上

## 実装日
2026-06-12（計画）

## バージョン
v5.57.0 → v5.58.0

## 目的
Phase 10で追加したプロシージャル生成構造物をBlender製GLBモデルに置き換え、視覚的クオリティを最高水準に引き上げる。

---

## 現状の問題点

### 1. プロシージャル生成の限界 🔴
**現状**:
- 奇岩（Monolith）: BoxGeometry（直方体）
- 自然橋（Natural Bridge）: TorusGeometry（滑らかすぎる）
- 円筒ビル: CylinderGeometry（単純な円筒）
- 高架道路: BoxGeometry（平坦）
- リングステーション: TorusGeometry（単純）
- アンテナ: CylinderGeometry（単純）
- 破損船体: BoxGeometry（直方体）

**問題**:
- 有機的な形状が表現できない
- テクスチャのディテールがない
- 視覚的に単調
- 世界観の説得力が弱い

**改善**:
- Blenderで有機的な形状を作成
- テクスチャマッピングで質感向上
- ノーマルマップで表面のディテール追加
- LOD（Level of Detail）対応

---

## Blenderモデル化対象

### Original MAP

#### 1. 巨大奇岩（Monolith） - 優先度: 🔴 高
**現状**: BoxGeometry（40×600×60m）

**Blender実装**:
- ファイル: `rock_monolith.glb`
- 特徴:
  - 風化した表面（凹凸）
  - 亀裂・割れ目
  - 色のグラデーション（茶～灰色）
  - ノーマルマップで岩肌の質感
- サイズバリエーション: 3種類（小・中・大）
- ポリゴン数: 800-1500（モバイル対応）

#### 2. 自然橋（Natural Bridge） - 優先度: 🔴 高
**現状**: TorusGeometry（滑らかな半円）

**Blender実装**:
- ファイル: `rock_natural_bridge.glb`
- 特徴:
  - 不規則な岩の断面
  - 侵食による形状の歪み
  - 苔・植物の痕跡（テクスチャ）
  - 下部に垂れ下がる岩の突起
- サイズバリエーション: 3種類
- ポリゴン数: 1000-2000

---

### Tokyo MAP

#### 3. 円筒形ビル（Cylindrical Tower） - 優先度: 🟡 中
**現状**: CylinderGeometry（単純な円筒）

**Blender実装**:
- ファイル: `building_cylindrical.glb`
- 特徴:
  - ガラスカーテンウォール（反射）
  - フロアごとの水平ライン
  - 屋上の構造物（アンテナ、ヘリポート）
  - 発光窓（エミッシブマップ）
  - NEOトーキョー風のサイバーパンクディテール
- サイズバリエーション: 3種類
- ポリゴン数: 1200-2000

#### 4. 巨大高架道路（Elevated Highway） - 優先度: 🟢 低
**現状**: BoxGeometry（平坦な板）

**Blender実装**:
- ファイル: `structure_elevated_highway.glb`
- 特徴:
  - 支柱構造（Y字型・V字型）
  - ガードレール
  - 路面のテクスチャ（アスファルト、ライン）
  - 照明設備
  - 風化・汚れの表現
- セグメント単位で配置（100m単位）
- ポリゴン数: 600-1000（セグメント）

---

### Space MAP

#### 5. リングステーション（Ring Station） - 優先度: 🔴 高
**現状**: TorusGeometry（単純なリング）

**Blender実装**:
- ファイル: `space_ring_station.glb`
- 特徴:
  - 内部構造（トラス、モジュール）
  - ドッキングポート
  - 通信アンテナ
  - ソーラーパネル
  - メタリック質感
  - 発光部分（窓、ライト）
- サイズバリエーション: 3種類
- ポリゴン数: 1500-2500

#### 6. 巨大通信アンテナ（Antenna） - 優先度: 🟡 中
**現状**: CylinderGeometry（単純な円筒＋皿）

**Blender実装**:
- ファイル: `space_antenna.glb`
- 特徴:
  - トラス構造（骨組み）
  - パラボラアンテナ（メッシュ模様）
  - 複数のアンテナ素子
  - ケーブル・配管
  - メタリック質感
- サイズバリエーション: 2種類
- ポリゴン数: 800-1500

#### 7. 破損船体（Space Wreck） - 優先度: 🔴 高
**現状**: BoxGeometry（単純な直方体）

**Blender実装**:
- ファイル: `space_wreck_large.glb`
- 特徴:
  - 破損部分（裂け目、穴）
  - 内部構造が見える
  - 焦げ跡・損傷のテクスチャ
  - 浮遊デブリ（一体化）
  - 錆・劣化の表現
- バリエーション: 5種類（多様性重視）
- ポリゴン数: 1000-2000

---

## 実装タスク

### Task 1: Blenderモデル作成（外部作業）
**期間**: 1-2週間
**担当**: 3Dモデラー（外注推奨）

**成果物**:
- `rock_monolith_small.glb`, `rock_monolith_medium.glb`, `rock_monolith_large.glb`
- `rock_natural_bridge_small.glb`, `rock_natural_bridge_medium.glb`, `rock_natural_bridge_large.glb`
- `building_cylindrical_small.glb`, `building_cylindrical_medium.glb`, `building_cylindrical_large.glb`
- `structure_elevated_highway_segment.glb`
- `space_ring_station_small.glb`, `space_ring_station_medium.glb`, `space_ring_station_large.glb`
- `space_antenna_small.glb`, `space_antenna_large.glb`
- `space_wreck_type1.glb` ～ `space_wreck_type5.glb`

**品質基準**:
- ポリゴン数: モバイル対応（1000-2500/モデル）
- テクスチャサイズ: 512×512 ～ 1024×1024
- PBRマテリアル（Base Color, Metallic, Roughness, Normal）
- GLTFエクスポート設定: Draco圧縮、Y-up

---

### Task 2: コード置き換え（プログラム作業）
**期間**: 2-3日
**ファイル**: `src/main.ts`, `src/neoTokyoMapSystem.ts`

#### 2-1. Original MAP構造物置き換え
```typescript
// 奇岩（Monolith）
gltfLoader.load(import.meta.env.BASE_URL + 'models/rock_monolith_medium.glb', (gltf) => {
  const proto = gltf.scene
  for (const mono of MONOLITHS) {
    const inst = proto.clone()
    inst.position.set(mono.x, terrainH(mono.x, mono.z), mono.z)
    inst.scale.setScalar(mono.h / 500)  // 基準高500mでスケール
    scene.add(inst)
  }
})

// 自然橋（Natural Bridge）
gltfLoader.load(import.meta.env.BASE_URL + 'models/rock_natural_bridge_medium.glb', (gltf) => {
  const proto = gltf.scene
  for (const bridge of NATURAL_BRIDGES) {
    const inst = proto.clone()
    inst.position.set(bridge.x, terrainH(bridge.x, bridge.z) + bridge.h, bridge.z)
    inst.scale.setScalar(bridge.span / 120)  // 基準スパン120mでスケール
    scene.add(inst)
  }
})
```

#### 2-2. Tokyo MAP構造物置き換え
```typescript
// 円筒形ビル
gltfLoader.load(import.meta.env.BASE_URL + 'models/building_cylindrical_medium.glb', (gltf) => {
  const proto = gltf.scene
  for (const tower of CYLINDRICAL_TOWERS) {
    const inst = proto.clone()
    const gy = NeoTokyoMapSystem.heightAt(tower.x, tower.z)
    inst.position.set(tower.x, gy, tower.z)
    inst.scale.set(tower.r / 75, tower.h / 400, tower.r / 75)
    this.scene.add(inst)
    
    // Collider（GLBのバウンディングボックスから自動生成）
    const bbox = new THREE.Box3().setFromObject(inst)
    const size = bbox.getSize(new THREE.Vector3())
    const collider = new THREE.Mesh(
      new THREE.CylinderGeometry(tower.r, tower.r, tower.h, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    collider.position.copy(inst.position)
    collider.position.y += tower.h / 2
    this.scene.add(collider)
    this.buildingColliders.push(collider)
  }
})
```

#### 2-3. Space MAP構造物置き換え
```typescript
// リングステーション
gltfLoader.load(import.meta.env.BASE_URL + 'models/space_ring_station_medium.glb', (gltf) => {
  const proto = gltf.scene
  for (const ring of RING_STATIONS) {
    const inst = proto.clone()
    inst.position.set(ring.x, ring.y, ring.z)
    inst.scale.setScalar(ring.radius / 200)
    inst.rotation.x = Math.random() * Math.PI
    space.add(inst)
    rotatingSpaceObjects.push(inst)
  }
})

// 破損船体（バリエーション5種をランダム配置）
const wreckModels = ['type1', 'type2', 'type3', 'type4', 'type5']
Promise.all(wreckModels.map(type => 
  new Promise((resolve) => {
    gltfLoader.load(import.meta.env.BASE_URL + `models/space_wreck_${type}.glb`, resolve)
  })
)).then((gltfs) => {
  for (const wreck of WRECKS) {
    const gltf = gltfs[Math.floor(Math.random() * gltfs.length)] as any
    const inst = gltf.scene.clone()
    inst.position.set(wreck.x, wreck.y, wreck.z)
    inst.scale.setScalar(wreck.scale / 80)
    inst.rotation.set(
      Math.random() * Math.PI / 4,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI / 4
    )
    space.add(inst)
  }
})
```

---

### Task 3: LOD（Level of Detail）実装
**目的**: 遠距離でポリゴン数を削減してパフォーマンス向上

```typescript
// 各モデルに3段階のLODを設定
const lod = new THREE.LOD()
lod.addLevel(highDetailMesh, 0)      // 0-500m: 高品質
lod.addLevel(mediumDetailMesh, 500)  // 500-1500m: 中品質
lod.addLevel(lowDetailMesh, 1500)    // 1500m-: 低品質
scene.add(lod)
```

---

### Task 4: テクスチャ最適化
**目的**: モバイル対応のためテクスチャサイズ最適化

```typescript
// テクスチャ圧縮設定
const textureLoader = new THREE.TextureLoader()
const loadOptimizedTexture = (path: string) => {
  const tex = textureLoader.load(path)
  tex.anisotropy = isMobileDevice ? 1 : 4
  tex.generateMipmaps = true
  return tex
}
```

---

## 成功基準

### 視覚的品質
- [ ] 構造物が有機的な形状になる
- [ ] テクスチャのディテールが見える
- [ ] 遠景でも認識できる
- [ ] 世界観の説得力が向上

### パフォーマンス
- [ ] フレームレート60fps維持（デスクトップ）
- [ ] フレームレート30fps維持（モバイル）
- [ ] ロード時間が5秒以内
- [ ] メモリ使用量が許容範囲内

### 技術的品質
- [ ] GLBファイルがDraco圧縮されている
- [ ] PBRマテリアルが正しく動作
- [ ] 衝突判定が機能する
- [ ] LODが自動切り替わる

---

## 期待される効果

1. **視覚的クオリティの向上**: プロ品質の3Dモデルで没入感アップ
2. **世界観の強化**: ディテールが世界観の説得力を高める
3. **探索の楽しさ**: 美しい構造物が探索のモチベーションに
4. **ブランド価値向上**: 高品質なビジュアルがゲームの評価を高める

---

## 実装順序（優先度順）
1. **Phase 11-A（1週間）**: 高優先度モデル作成
   - 奇岩、自然橋、リングステーション、破損船体
2. **Phase 11-B（3日）**: コード置き換え（高優先度）
3. **Phase 11-C（1週間）**: 中優先度モデル作成
   - 円筒ビル、アンテナ
4. **Phase 11-D（2日）**: コード置き換え（中優先度）
5. **Phase 11-E（1週間）**: 低優先度モデル作成
   - 高架道路
6. **Phase 11-F（1日）**: LOD実装
7. **Phase 11-G（1日）**: パフォーマンス最適化

合計: 約3-4週間

---

## 外注する場合の発注仕様書

### 成果物
- GLBファイル（20-30個）
- テクスチャファイル（PNGまたはJPG、512×512 ～ 1024×1024）
- PBRマテリアル（Base Color, Metallic, Roughness, Normal）

### 技術仕様
- Blender 3.6以上で作成
- GLTFエクスポート: Draco圧縮、Y-up座標系
- ポリゴン数: 800-2500/モデル
- UV展開済み
- シャドウ・ライティング対応

### 納期
- Phase 11-A: 1週間
- Phase 11-C: 1週間（Phase 11-A完了後）
- Phase 11-E: 1週間（Phase 11-C完了後）

### 予算目安
- 1モデルあたり: $50-150（複雑度による）
- 合計20-30モデル: $1,000-4,000

---

## 次のステップ

1. **外注先の選定**: Fiverr, Upwork, ArtStationで3Dモデラーを探す
2. **サンプル発注**: 1-2モデルで品質確認
3. **本発注**: 全モデルの発注
4. **コード実装**: GLBローダー実装
5. **テスト**: 全MAPでの動作確認
6. **デプロイ**: v5.58.0リリース
