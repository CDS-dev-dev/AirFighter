"""
Natural Bridge Generator for AirFighter
自然橋を生成するBlenderスクリプト
"""

import bpy
import sys
import math
import random

argv = sys.argv
argv = argv[argv.index("--") + 1:]
size = argv[0] if len(argv) > 0 else 'medium'

SIZE_PRESETS = {
    'small': {'span': 100, 'height': 70, 'thickness': 12, 'scale': 0.85},
    'medium': {'span': 120, 'height': 80, 'thickness': 14, 'scale': 1.0},
    'large': {'span': 140, 'height': 90, 'thickness': 16, 'scale': 1.15},
}

preset = SIZE_PRESETS[size]

# シーンクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for obj in bpy.data.objects:
    bpy.data.objects.remove(obj, do_unlink=True)

# トーラス（半円アーチ）作成
bpy.ops.mesh.primitive_torus_add(
    major_radius=preset['span'] / 2,
    minor_radius=preset['thickness'],
    major_segments=48,
    minor_segments=16
)
bridge = bpy.context.active_object
bridge.name = f'NaturalBridge_{size}'

# 半分だけ残す（上半分）
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')

# 下半分の頂点を削除
for v in bridge.data.vertices:
    if v.co.z < 0:
        v.select = True

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')

# 回転（Z軸を正面に）
bridge.rotation_euler = (0, math.radians(90), 0)
bpy.ops.object.transform_apply(rotation=True)

# 高さ調整
bridge.location.z = preset['height']

# Displacementで不規則な形状
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.subdivide(number_cuts=2)
bpy.ops.object.mode_set(mode='OBJECT')

displacement = bridge.modifiers.new(name='Displacement', type='DISPLACE')
tex = bpy.data.textures.new(name='NoiseTexture', type='MUSGRAVE')
tex.musgrave_type = 'RIDGED_MULTIFRACTAL'
tex.dimension_max = 0.8
tex.lacunarity = 2.0
tex.octaves = 4
tex.noise_scale = 0.25
displacement.texture = tex
displacement.strength = 4.0
displacement.mid_level = 0.5

bpy.ops.object.modifier_apply(modifier=displacement.name)

# 侵食効果（下部を太く）
for v in bridge.data.vertices:
    height_ratio = v.co.z / preset['height']
    if height_ratio < 0.3:
        scale = 1.2 - height_ratio * 0.5
        v.co.x *= scale
        v.co.y *= scale

# スムースシェーディング
bpy.ops.object.shade_smooth()

# マテリアル（ベージュの岩）
mat = bpy.data.materials.new(name=f'BridgeMaterial_{size}')
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

output_node = nodes.new(type='ShaderNodeOutputMaterial')
output_node.location = (400, 0)

bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf_node.location = (0, 0)
bsdf_node.inputs['Base Color'].default_value = (0.608, 0.522, 0.459, 1.0)  # 0x9b8575
bsdf_node.inputs['Roughness'].default_value = 0.9
bsdf_node.inputs['Specular'].default_value = 0.1

# ノーマルマップ
tex_coord = nodes.new(type='ShaderNodeTexCoord')
tex_coord.location = (-800, 0)

noise_tex = nodes.new(type='ShaderNodeTexNoise')
noise_tex.location = (-600, 0)
noise_tex.inputs['Scale'].default_value = 4.0
noise_tex.inputs['Detail'].default_value = 8.0

bump_node = nodes.new(type='ShaderNodeBump')
bump_node.location = (-200, -200)
bump_node.inputs['Strength'].default_value = 0.6

links.new(tex_coord.outputs['Generated'], noise_tex.inputs['Vector'])
links.new(noise_tex.outputs['Fac'], bump_node.inputs['Height'])
links.new(bump_node.outputs['Normal'], bsdf_node.inputs['Normal'])
links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])

bridge.data.materials.append(mat)

# 原点調整
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')

# GLBエクスポート
output_path = f'/home/vscode/AirFighter/public/models/rock_natural_bridge_{size}.glb'
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_draco_mesh_compression_enable=False,
    export_materials='EXPORT',
    export_colors=True,
    export_normals=True,
    export_yup=True
)

print(f'✅ Generated: {output_path}')
