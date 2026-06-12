"""
Cylindrical Building Generator for AirFighter (Tokyo MAP)
円筒形ビルを生成するBlenderスクリプト
"""

import bpy
import sys
import math

argv = sys.argv
argv = argv[argv.index("--") + 1:]
size = argv[0] if len(argv) > 0 else 'medium'

SIZE_PRESETS = {
    'small': {'height': 360, 'radius': 65, 'scale': 0.9},
    'medium': {'height': 400, 'radius': 75, 'scale': 1.0},
    'large': {'height': 450, 'radius': 85, 'scale': 1.1},
}

preset = SIZE_PRESETS[size]

# シーンクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for obj in bpy.data.objects:
    bpy.data.objects.remove(obj, do_unlink=True)

# 円筒形ビル本体
bpy.ops.mesh.primitive_cylinder_add(
    radius=preset['radius'],
    depth=preset['height'],
    vertices=64
)
building = bpy.context.active_object
building.name = f'CylindricalBuilding_{size}'

# フロアごとの水平ライン（リング）
for i in range(0, int(preset['height']), 20):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=preset['radius'] * 1.02,
        minor_radius=1.5,
        major_segments=64,
        minor_segments=8,
        location=(0, 0, -preset['height']/2 + i)
    )
    ring = bpy.context.active_object
    ring.name = f'FloorRing_{i}'

# 屋上構造物（ヘリポート）
bpy.ops.mesh.primitive_cylinder_add(
    radius=preset['radius'] * 0.6,
    depth=5,
    vertices=32,
    location=(0, 0, preset['height']/2 + 2.5)
)
helipad = bpy.context.active_object
helipad.name = 'Helipad'

# アンテナ
bpy.ops.mesh.primitive_cylinder_add(
    radius=2,
    depth=preset['height'] * 0.15,
    vertices=8,
    location=(0, 0, preset['height']/2 + preset['height'] * 0.075 + 5)
)
antenna = bpy.context.active_object
antenna.name = 'Antenna'

# 全てを統合
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = building
bpy.ops.object.join()

# スムースシェーディング
bpy.ops.object.shade_smooth()

# マテリアル（ガラスカーテンウォール＋発光）
mat = bpy.data.materials.new(name=f'BuildingMaterial_{size}')
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

output_node = nodes.new(type='ShaderNodeOutputMaterial')
output_node.location = (600, 0)

# ガラス部分
glass_bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
glass_bsdf.location = (0, 0)
glass_bsdf.inputs['Base Color'].default_value = (0.682, 0.733, 0.816, 1.0)  # 0xaebbd0
glass_bsdf.inputs['Metallic'].default_value = 0.2
glass_bsdf.inputs['Roughness'].default_value = 0.15
glass_bsdf.inputs['Transmission'].default_value = 0.2

# 発光部分（窓）
emission_node = nodes.new(type='ShaderNodeEmission')
emission_node.location = (0, -200)
emission_node.inputs['Color'].default_value = (0.102, 0.239, 0.373, 1.0)  # 0x1a3d5f
emission_node.inputs['Strength'].default_value = 0.3

# 混合
mix_shader = nodes.new(type='ShaderNodeMixShader')
mix_shader.location = (300, 0)

# テクスチャ座標（縦方向のストライプ）
tex_coord = nodes.new(type='ShaderNodeTexCoord')
tex_coord.location = (-600, -400)

separate_xyz = nodes.new(type='ShaderNodeSeparateXYZ')
separate_xyz.location = (-400, -400)

math_node = nodes.new(type='ShaderNodeMath')
math_node.location = (-200, -400)
math_node.operation = 'MODULO'
math_node.inputs[1].default_value = 0.05  # フロア間隔

links.new(tex_coord.outputs['Generated'], separate_xyz.inputs['Vector'])
links.new(separate_xyz.outputs['Z'], math_node.inputs[0])
links.new(math_node.outputs['Value'], mix_shader.inputs['Fac'])
links.new(glass_bsdf.outputs['BSDF'], mix_shader.inputs[1])
links.new(emission_node.outputs['Emission'], mix_shader.inputs[2])
links.new(mix_shader.outputs['Shader'], output_node.inputs['Surface'])

building.data.materials.append(mat)

# GLBエクスポート
output_path = f'/home/vscode/AirFighter/public/models/building_cylindrical_{size}.glb'
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
