# 設計書 v2 - 自然な追跡AI

## 設計方針

数値制限による強制的な位置調整ではなく、物理ベースの運動モデルで自然な動きを実現します。

## 実装アプローチ

### 1. 物理ベースの運動
- **速度ベクトル**：現在の移動方向と速さを保持
- **加速度**：滑らかな加減速（急激な速度変化を避ける）
- **旋回半径**：角速度制限による自然な旋回
- **慣性**：航空機らしい慣性を持った動き

### 2. 追跡ロジック
- ターゲットへの相対位置を常に計算
- 距離に応じて加速・減速
- 角度に応じて旋回速度を調整
- 高度差を徐々に解消

### 3. 高度制御
- 地面からの距離を一定に保つ
- ターゲットの高度に徐々に近づく
- 障害物回避（地形が近い場合は上昇）

### 4. 戦術的バリエーション
- 各敵機の追跡パラメータを変える
  - 積極型：近距離、高速旋回
  - 慎重型：中距離、緩やかな旋回
  - 高高度型：上方から追跡
  - 側面型：側面に回り込む

## 主な変更点

### Enemy interfaceの拡張
```typescript
interface Enemy {
  group: THREE.Group
  health: number
  fireCooldown: number
  missileAmmo: number
  seekingSupply: boolean
  evadeDelay: number
  lastPos: THREE.Vector3
  velocity: THREE.Vector3
  targetSpeed: number  // 目標速度
  tacticType: number   // 戦術タイプ（0-3）
  preferredDistance: number  // 好む交戦距離
  preferredAltitude: number  // 好む相対高度
}
```

### updateEnemies関数の全面書き直し
- 目標位置計算を廃止
- ターゲットへの相対ベクトルから直接速度・方向を計算
- 物理シミュレーションベースの更新
