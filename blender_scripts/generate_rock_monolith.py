"""
Rock Monolith Generator for AirFighter
巨大奇岩を生成するBlenderスクリプト

Usage:
  blender --background --python generate_rock_monolith.py -- small
  blender --background --python generate_rock_monolith.py -- medium
  blender --background --python generate_rock_monolith.py -- large
"""

import bpy
import sys
import math
import random
from mathutils import Vector

# コマンドライン引数を取得
argv = sys.argv
argv = argv[argv.index("--") + 1:]  # -- 以降の引数を取得
size = argv[0] if len(argv) > 0 else 'medium'

# サイズ設定
SIZE_PRESETS = {
    'small': {'base_height': 450, 'base_width': 35, 'base_depth': 55, 'scale': 0.9},
    'medium': {'base_height': 500, 'base_width': 40, 'base_depth': 60, 'scale': 1.0},
    'large': {'base_height': 600, 'base_width': 45, 'base_depth': 65, 'scale': 1.1},
}

preset = SIZE_PRESETS[size]

# シーンをクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ランプとカメラを削除
for obj in bpy.data.objects:
    bpy.data.objects.remove(obj, do_unlink=True)

# 基本形状作成（立方体）
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
monolith = bpy.context.active_object
monolith.name = f'RockMonolith_{size}'

# スケール調整
monolith.scale = (
    preset['base_width'] * preset['scale'],
    preset['base_depth'] * preset['scale'],
    preset['base_height'] * preset['scale']
)
bpy.ops.object.transform_apply(scale=True)

# 編集モードに入る
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')

# サブディビジョン（細分化）
bpy.ops.mesh.subdivide(number_cuts=3)

# オブジェクトモードに戻る
bpy.ops.object.mode_set(mode='OBJECT')

# Displacementモディファイアで有機的な形状を作成
# 1. ノイズテクスチャ
displacement = monolith.modifiers.new(name='Displacement', type='DISPLACE')
tex = bpy.data.textures.new(name='NoiseTexture', type='MUSGRAVE')
tex.musgrave_type = 'RIDGED_MULTIFRACTAL'
tex.dimension_max = 1.2
tex.lacunarity = 2.5
tex.octaves = 6
tex.noise_scale = 0.15
displacement.texture = tex
displacement.strength = 8.0
displacement.mid_level = 0.5

# モディファイアを適用
bpy.ops.object.modifier_apply(modifier=displacement.name)

# 2. 風化効果（上部を細くする）
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')

# 上部の頂点を選択して内側に移動
for v in monolith.data.vertices:
    if v.co.z > preset['base_height'] * 0.6:
        scale_factor = 0.85 - (v.co.z / preset['base_height']) * 0.15
        v.co.x *= scale_factor
        v.co.y *= scale_factor

# 3. 亀裂を追加（エッジスプリット）
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')

# ランダムに一部のエッジを選択して押し出し（亀裂効果）
bpy.ops.mesh.select_random(ratio=0.1, seed=42)
bpy.ops.mesh.extrude_region_move(
    TRANSFORM_OT_translate={"value": (0, 0, 0.5)}
)

bpy.ops.object.mode_set(mode='OBJECT')

# スムースシェーディング
bpy.ops.object.shade_smooth()

# マテリアル作成（PBR）
mat = bpy.data.materials.new(name=f'RockMaterial_{size}')
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links

# 既存ノードをクリア
nodes.clear()

# ノード作成
output_node = nodes.new(type='ShaderNodeOutputMaterial')
output_node.location = (400, 0)

bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf_node.location = (0, 0)

# 岩の色（茶色～灰色）
bsdf_node.inputs['Base Color'].default_value = (0.545, 0.451, 0.333, 1.0)  # 0x8b7355
bsdf_node.inputs['Roughness'].default_value = 0.95
bsdf_node.inputs['Specular'].default_value = 0.1

# ノーマルマップ用ノイズテクスチャ
tex_coord = nodes.new(type='ShaderNodeTexCoord')
tex_coord.location = (-800, 0)

noise_tex = nodes.new(type='ShaderNodeTexNoise')
noise_tex.location = (-600, 0)
noise_tex.inputs['Scale'].default_value = 5.0
noise_tex.inputs['Detail'].default_value = 10.0
noise_tex.inputs['Roughness'].default_value = 0.6

bump_node = nodes.new(type='ShaderNodeBump')
bump_node.location = (-200, -200)
bump_node.inputs['Strength'].default_value = 0.8

# ノード接続
links.new(tex_coord.outputs['Generated'], noise_tex.inputs['Vector'])
links.new(noise_tex.outputs['Fac'], bump_node.inputs['Height'])
links.new(bump_node.outputs['Normal'], bsdf_node.inputs['Normal'])
links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])

# マテリアルを適用
monolith.data.materials.append(mat)

# 原点を底面に移動
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
monolith.location.z = preset['base_height'] / 2

# GLBエクスポート
output_path = f'/home/vscode/AirFighter/public/models/rock_monolith_{size}.glb'
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_materials='EXPORT',
    export_colors=True,
    export_normals=True,
    export_yup=True
)

print(f'✅ Generated: {output_path}')
