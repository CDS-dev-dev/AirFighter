# 開発ガイドライン

## 1. コーディング規約

### 基本方針（CLAUDE.md と共通）
- TypeScript の型を必ず付ける（`any` 禁止）
- コメントは「なぜそうするか」が非自明な場合のみ 1 行で書く
- セクション区切りは `// ===== SECTION NAME =====` 形式

### 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| 定数 | UPPER_SNAKE_CASE | `MISSILE_LOCK_RANGE`, `MAX_HP` |
| 変数・関数 | camelCase | `terrainH`, `spawnEnemy`, `fireMissile` |
| クラス | PascalCase | `NeoTokyoMapSystem`, `MultiplayerClient` |
| Three.js 使い捨てベクトル | `_` プレフィックス | `_fwd`, `_toTarget`, `_missileRaycaster` |
| GLB 由来の Three.js グループ | `group` / `mesh` | `enemy.group`, `gt.group` |

### TypeScript

```typescript
// ✅ 良い例：型を明示する
interface Enemy { group: THREE.Group; health: number; missileAmmo: number }
const MISSILE_LOCK_RANGE = 3000

// ❌ 悪い例：any を使う
const enemy: any = spawnEnemy()
```

---

## 2. Three.js パフォーマンス原則

### InstancedMesh を使う場面
同じジオメトリを大量に配置するとき（例：都市のビル群）は `InstancedMesh` を使い draw call を削減する。

```typescript
// 600 棟のビルを 6 draw calls で描画
const mesh = new THREE.InstancedMesh(boxGeo, mat, buildingCount)
mesh.setMatrixAt(i, matrix)
```

### InstancedMesh と衝突判定の注意

**`Box3.setFromObject(instancedMesh)` は全インスタンスを包む巨大な AABB を返す。**
これをそのまま衝突判定に使うと「都市全体に当たり判定がある」状態になり、飛行できなくなる。

解決策：個別配置したランドマーク（個々の `Mesh`）のみ `getCollisionObjects()` で返す。InstancedMesh ビルは衝突なし（視覚専用）。

```typescript
// ✅ 正しい: landmarks のみ返す
getCollisionObjects(): THREE.Object3D[] { return [...this.landmarks] }

// ❌ 間違い: instancedMeshes を含める
getCollisionObjects(): THREE.Object3D[] { return [...this.landmarks, ...this.instancedMeshes] }
```

### 再利用ベクトルのパターン

ゲームループ内では毎フレーム `new THREE.Vector3()` を生成しない。モジュールスコープで宣言した変数を再利用する。

```typescript
// モジュールスコープで宣言
const _fwd = new THREE.Vector3()
const _toTarget = new THREE.Vector3()

// ゲームループ内で再利用
_fwd.set(0, 0, -1).applyQuaternion(player.quaternion)
_toTarget.subVectors(enemy.group.position, player.position).normalize()
```

---

## 3. NEO 東京マップ 設計方針

### 座標系

| 方向 | 値 |
|---|---|
| 北（スポーン側） | z 負 |
| 南（東京湾側） | z 正 |
| 東（スカイツリー方向） | x 正 |
| 西（新宿・渋谷方向） | x 負 |
| 中心 = 東京駅 | (0, 0) |

スケール：ゲーム 1 unit ≈ 実距離 3m（12,000m ゲーム空間 ≈ 実際の東京 36km）

### 主要地区の座標範囲

| 地区 | game x | game z |
|---|---|---|
| 丸の内 / 東京駅 | -500〜+500 | -500〜+500 |
| 新宿 | -2500〜-1500 | -500〜+500 |
| 渋谷 / 表参道 | -2200〜-1400 | +600〜+1500 |
| 六本木 / 麻布 | -1200〜-600 | +500〜+1200 |
| 池袋 | -2500〜-1800 | -2500〜-1500 |
| 上野 / 秋葉原 | 0〜+800 | -1200〜-300 |
| 浅草 / スカイツリー | +1000〜+2000 | -2000〜-1000 |
| お台場 | +1500〜+3000 | +1200〜+2500 |
| 品川 | -200〜+600 | +1200〜+2000 |

### ビル配置の回廊保証

```
ROAD = 600m グリッド
offsets = [0.25, 0.75] → サブブロック中心が 150m, 450m
サブブロック間距離 = 300m
MAX_W = 180m → 最小隙間 = 300 - 180 = 120m ✓
```

プレイヤーは巡航速度 150 m/s で 120m の隙間を 0.8 秒で通過できる。

### オブジェクトの種別と管理

| 種別 | 配列 | 衝突 | cleanup |
|---|---|---|---|
| InstancedMesh ビル群 | `instancedMeshes` | なし | `scene.remove` |
| ランドマーク個別 Mesh | `landmarks` | あり（AABB） | `scene.remove` |
| 視覚専用オブジェクト | `deco` | なし | `scene.remove` |
| 地形 | `terrainMesh` | あり（heightAt） | `scene.remove` |

---

## 4. バージョン同期ルール

コミット時は以下の 3 ファイルを**必ず同時に更新**すること。1 ファイルでも抜けた場合は次のコミットで揃える。

```bash
package.json   # "version": "X.X.X"
index.html     # vX.X.X（タイトル内）
src/main.ts    # const VERSION = 'X.X.X'
```

---

## 5. モバイル対応チェックリスト

新しい UI 要素を追加するとき：

- [ ] スマホ横画面（iPhone SE サイズ）で 1 画面に収まるか
- [ ] `@media (pointer: coarse) and (orientation: landscape)` でフォント・余白を縮小したか
- [ ] UI 要素が他の要素と重なっていないか
- [ ] タッチ操作（ボタン）で機能するか

詳細は `.steering/UI-DESIGN-RULES.md` を参照。

---

## 6. ビルド & デプロイ手順

```bash
# 型チェック（エラーゼロを確認してからコミット）
npx tsc --noEmit

# プロダクションビルド
npm run build

# push すると GitHub Actions が自動デプロイ
git push origin main
```

Supabase を使う機能（将来のリーダーボード等）は以下の環境変数が必要：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

ローカルでは `.env.local`、GitHub Actions では Secrets に設定する。

---

## 7. Blender GLB 再生成

オリジナル MAP の地形関数を変更した場合、必ず GLB を再生成する。

```bash
blender --background --python blender/gen_terrain.py
blender --background --python blender/gen_aircraft.py
blender --background --python blender/gen_buildings.py
blender --background --python blender/gen_carrier.py
```

`terrainH()` (main.ts) と `terrain_h()` (gen_terrain.py) は**完全一致が必須**。どちらかを変えたら必ず両方更新する。
