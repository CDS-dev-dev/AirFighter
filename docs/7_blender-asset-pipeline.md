# Blender Asset Pipeline

## 方針

AirFighter では、飛行体験に影響する主役構造物を **Blender 正本**へ寄せる。

- 主役のランドマーク、ゲート、チューブ、巨大骨格、要塞、艦船残骸は Blender
- 小物散布、仮配置、動的補助物はコード生成を残してよい

この方針の目的は、見た目と当たり判定の信用感を揃えつつ、構造物の説得力を上げること。

## 運用

- 資産台帳: `blender/asset-registry.json`
- 監査: `npm run assets:audit`
- 生成物: `public/` と `public/models/`
- 生成元: `blender/*.py` と `blender_scripts/*.py`

## 現在の最初の移行対象

1. Original MAP の巨大骨格回廊
2. Tokyo MAP のフライトゲート
3. Tokyo MAP の上昇チューブ

## コリジョン原則

Blender 化した主役構造物は、原則として **visible mesh ベース**で collision を取る。

- 見えているのに抜ける状態を避ける
- 通れそうなのに見えない壁で止まる状態を避ける
- MAPごとに collision 思想がズレる状態を避ける
