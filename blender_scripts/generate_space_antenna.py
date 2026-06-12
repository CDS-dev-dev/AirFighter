"""
Space Antenna Generator for AirFighter
宇宙通信アンテナを生成するBlenderスクリプト
"""

import bpy
import sys
import math

argv = sys.argv
argv = argv[argv.index("--") + 1:]
size = argv[0] if len(argv) > 0 else 'large'

SIZE_PRESETS = {
    'small': {'height': 280, 'dish_radius': 35, 'scale': 0.85},
    'large': {'height': 350, 'dish_radius': 40, 'scale': 1.15},
}

preset = SIZE_PRESETS[size]

# シーンクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for obj in bpy.data.objects:
    bpy.data.objects.remove(obj, do_unlink=True)

# トラス構造（細いタワー）
bpy.ops.mesh.primitive_cylinder_add(
    radius=8,
    depth=preset['height'],
    vertices=8
)
tower = bpy.context.active_object
tower.name = f'AntennaTower_{size}'

# タワーの下部を太く
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')

for v in tower.data.vertices:
    if v.co.z < -preset['height'] * 0.3:
        scale = 1.5 - (v.co.z / preset['height'])
        v.co.x *= scale
        v.co.y *= scale

# トラス（支柱）4本
for i in range(4):
    angle = (i / 4) * math.pi * 2
    offset = 6
    x = math.cos(angle) * offset
    y = math.sin(angle) * offset

    bpy.ops.mesh.primitive_cylinder_add(
        radius=1,
        depth=preset['height'],
        vertices=6,
        location=(x, y, 0)
    )
    strut = bpy.context.active_object
    strut.name = f'Strut_{i}'

# パラボラアンテナ（皿）
bpy.ops.mesh.primitive_uv_sphere_add(
    radius=preset['dish_radius'],
    segments=32,
    ring_count=16,
    location=(0, 0, preset['height']/2 + 20)
)
dish = bpy.context.active_object
dish.name = 'ParabolicDish'

# 皿を半分だけ残す
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')

for v in dish.data.vertices:
    if v.co.z < (preset['height']/2 + 20):
        v.select = True

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')

# 皿を浅くする
dish.scale.z = 0.3
bpy.ops.object.transform_apply(scale=True)

# 回転（角度をつける）
dish.rotation_euler = (math.radians(30), 0, 0)

# アンテナ素子（中央の棒）
bpy.ops.mesh.primitive_cylinder_add(
    radius=1.5,
    depth=preset['dish_radius'] * 0.8,
    vertices=8,
    location=(0, 0, preset['height']/2 + 20)
)
antenna_element = bpy.context.active_object
antenna_element.rotation_euler = (math.radians(30), 0, 0)
antenna_element.name = 'AntennaElement'

# サブアンテナ（小型）
for i in range(3):
    angle = (i / 3) * math.pi * 2
    radius = preset['dish_radius'] * 1.5
    x = math.cos(angle) * radius
    y = math.sin(angle) * radius
    z = preset['height']/2 + 10

    bpy.ops.mesh.primitive_cylinder_add(
        radius=3,
        depth=preset['dish_radius'] * 0.3,
        vertices=8,
        location=(x, y, z)
    )
    sub_dish = bpy.context.active_object
    sub_dish.rotation_euler = (math.radians(45), 0, angle)
    sub_dish.name = f'SubDish_{i}'

# 全てを統合
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = tower
bpy.ops.object.join()

# スムースシェーディング
bpy.ops.object.shade_smooth()

# マテリアル（メタリック）
mat = bpy.data.materials.new(name=f'AntennaMaterial_{size}')
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

output_node = nodes.new(type='ShaderNodeOutputMaterial')
output_node.location = (400, 0)

bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf_node.location = (0, 0)
bsdf_node.inputs['Base Color'].default_value = (0.667, 0.667, 0.667, 1.0)  # 0xaaaaaa
bsdf_node.inputs['Metallic'].default_value = 0.9
bsdf_node.inputs['Roughness'].default_value = 0.2

links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])

tower.data.materials.append(mat)

# GLBエクスポート
output_path = f'/home/vscode/AirFighter/public/models/space_antenna_{size}.glb'
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
