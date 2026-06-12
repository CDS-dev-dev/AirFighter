"""
Ring Station Generator for AirFighter
宇宙リングステーションを生成するBlenderスクリプト
"""

import bpy
import sys
import math

argv = sys.argv
argv = argv[argv.index("--") + 1:]
size = argv[0] if len(argv) > 0 else 'medium'

SIZE_PRESETS = {
    'small': {'radius': 180, 'tube_radius': 18, 'scale': 0.9},
    'medium': {'radius': 200, 'tube_radius': 20, 'scale': 1.0},
    'large': {'radius': 250, 'tube_radius': 24, 'scale': 1.25},
}

preset = SIZE_PRESETS[size]

# シーンクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for obj in bpy.data.objects:
    bpy.data.objects.remove(obj, do_unlink=True)

# メイントーラス（リング本体）
bpy.ops.mesh.primitive_torus_add(
    major_radius=preset['radius'],
    minor_radius=preset['tube_radius'],
    major_segments=64,
    minor_segments=16
)
ring = bpy.context.active_object
ring.name = f'SpaceRingStation_{size}'

# トラス構造（内側のリング）
bpy.ops.mesh.primitive_torus_add(
    major_radius=preset['radius'] * 0.95,
    minor_radius=preset['tube_radius'] * 0.3,
    major_segments=32,
    minor_segments=8
)
inner_truss = bpy.context.active_object
inner_truss.name = 'InnerTruss'

# 外側のリング
bpy.ops.mesh.primitive_torus_add(
    major_radius=preset['radius'] * 1.05,
    minor_radius=preset['tube_radius'] * 0.25,
    major_segments=32,
    minor_segments=8
)
outer_truss = bpy.context.active_object
outer_truss.name = 'OuterTruss'

# ドッキングポート（8箇所）
for i in range(8):
    angle = (i / 8) * math.pi * 2
    x = math.cos(angle) * preset['radius']
    y = math.sin(angle) * preset['radius']

    bpy.ops.mesh.primitive_cylinder_add(
        radius=preset['tube_radius'] * 0.6,
        depth=preset['tube_radius'] * 2,
        location=(x, y, 0)
    )
    port = bpy.context.active_object
    port.rotation_euler = (0, 0, angle)
    port.name = f'DockingPort_{i}'

# ソーラーパネル（4箇所）
for i in range(4):
    angle = (i / 4) * math.pi * 2 + math.pi / 4
    x = math.cos(angle) * preset['radius'] * 1.3
    y = math.sin(angle) * preset['radius'] * 1.3

    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(x, y, 0)
    )
    panel = bpy.context.active_object
    panel.scale = (preset['radius'] * 0.4, preset['radius'] * 0.05, preset['radius'] * 0.3)
    panel.rotation_euler = (0, 0, angle)
    panel.name = f'SolarPanel_{i}'
    bpy.ops.object.transform_apply(scale=True)

# 全てを統合
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = ring
bpy.ops.object.join()

# スムースシェーディング
bpy.ops.object.shade_smooth()

# マテリアル（メタリック）
mat = bpy.data.materials.new(name=f'StationMaterial_{size}')
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

output_node = nodes.new(type='ShaderNodeOutputMaterial')
output_node.location = (400, 0)

bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf_node.location = (0, 0)
bsdf_node.inputs['Base Color'].default_value = (0.267, 0.533, 0.733, 1.0)  # 0x4488bb
bsdf_node.inputs['Metallic'].default_value = 0.8
bsdf_node.inputs['Roughness'].default_value = 0.3

# 発光部分（窓）
emission_node = nodes.new(type='ShaderNodeEmission')
emission_node.location = (0, -200)
emission_node.inputs['Color'].default_value = (0.0, 0.831, 1.0, 1.0)  # シアン
emission_node.inputs['Strength'].default_value = 0.5

mix_shader = nodes.new(type='ShaderNodeMixShader')
mix_shader.location = (200, 0)
mix_shader.inputs['Fac'].default_value = 0.1

links.new(bsdf_node.outputs['BSDF'], mix_shader.inputs[1])
links.new(emission_node.outputs['Emission'], mix_shader.inputs[2])
links.new(mix_shader.outputs['Shader'], output_node.inputs['Surface'])

ring.data.materials.append(mat)

# GLBエクスポート
output_path = f'/home/vscode/AirFighter/public/models/space_ring_station_{size}.glb'
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
