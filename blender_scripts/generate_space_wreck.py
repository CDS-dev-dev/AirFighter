"""
Space Wreck Generator for AirFighter
破損船体を生成するBlenderスクリプト（5バリエーション）
"""

import bpy
import sys
import math
import random

argv = sys.argv
argv = argv[argv.index("--") + 1:]
wreck_type = argv[0] if len(argv) > 0 else 'type1'

# シーンクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
for obj in bpy.data.objects:
    bpy.data.objects.remove(obj, do_unlink=True)

# ランダムシード（タイプごとに固定）
type_seeds = {'type1': 1, 'type2': 2, 'type3': 3, 'type4': 4, 'type5': 5}
random.seed(type_seeds[wreck_type])

# 船体本体（変形した直方体）
bpy.ops.mesh.primitive_cube_add(size=1)
wreck = bpy.context.active_object
wreck.name = f'SpaceWreck_{wreck_type}'

# タイプごとに異なる形状
if wreck_type == 'type1':
    # 細長い輸送船
    wreck.scale = (80, 30, 150)
elif wreck_type == 'type2':
    # ずんぐりした貨物船
    wreck.scale = (100, 60, 90)
elif wreck_type == 'type3':
    # 横長の巡洋艦
    wreck.scale = (120, 40, 70)
elif wreck_type == 'type4':
    # 縦長の偵察船
    wreck.scale = (50, 50, 130)
elif wreck_type == 'type5':
    # 大型の戦艦
    wreck.scale = (110, 80, 100)

bpy.ops.object.transform_apply(scale=True)

# 細分化
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.subdivide(number_cuts=3)
bpy.ops.object.mode_set(mode='OBJECT')

# 破損効果（ランダムに頂点を削除）
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')

# 上面の一部を選択して削除（破損穴）
vertices_to_delete = []
for v in wreck.data.vertices:
    # タイプごとに異なる破損パターン
    if wreck_type == 'type1':
        if v.co.z > 50 and abs(v.co.x) < 20:
            vertices_to_delete.append(v.index)
    elif wreck_type == 'type2':
        if v.co.y > 20 and v.co.z > 0:
            vertices_to_delete.append(v.index)
    elif wreck_type == 'type3':
        if v.co.x > 40 and abs(v.co.z) < 15:
            vertices_to_delete.append(v.index)
    elif wreck_type == 'type4':
        if v.co.z < -40 and abs(v.co.x) < 15:
            vertices_to_delete.append(v.index)
    elif wreck_type == 'type5':
        if v.co.y > 25 and v.co.x > 0:
            vertices_to_delete.append(v.index)

# 選択した頂点を削除
for v_idx in vertices_to_delete:
    wreck.data.vertices[v_idx].select = True

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.delete(type='VERT')
bpy.ops.object.mode_set(mode='OBJECT')

# Displacementで損傷表現
displacement = wreck.modifiers.new(name='Displacement', type='DISPLACE')
tex = bpy.data.textures.new(name='NoiseTexture', type='VORONOI')
tex.noise_scale = 0.5
displacement.texture = tex
displacement.strength = 3.0 + random.random() * 2.0
displacement.mid_level = 0.5

bpy.ops.object.modifier_apply(modifier=displacement.name)

# デブリ追加（小さな破片）
for i in range(5):
    bpy.ops.mesh.primitive_cube_add(
        size=random.uniform(5, 15),
        location=(
            random.uniform(-60, 60),
            random.uniform(-40, 40),
            random.uniform(-50, 50)
        )
    )
    debris = bpy.context.active_object
    debris.rotation_euler = (
        random.uniform(0, math.pi),
        random.uniform(0, math.pi),
        random.uniform(0, math.pi)
    )
    debris.name = f'Debris_{i}'

# 全てを統合
bpy.ops.object.select_all(action='SELECT')
bpy.context.view_layer.objects.active = wreck
bpy.ops.object.join()

# スムースシェーディング
bpy.ops.object.shade_smooth()

# マテリアル（錆びた金属）
mat = bpy.data.materials.new(name=f'WreckMaterial_{wreck_type}')
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

output_node = nodes.new(type='ShaderNodeOutputMaterial')
output_node.location = (400, 0)

bsdf_node = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf_node.location = (0, 0)
bsdf_node.inputs['Base Color'].default_value = (0.333, 0.2, 0.133, 1.0)  # 0x553322
bsdf_node.inputs['Metallic'].default_value = 0.6
bsdf_node.inputs['Roughness'].default_value = 0.9

# 汚れテクスチャ
tex_coord = nodes.new(type='ShaderNodeTexCoord')
tex_coord.location = (-800, 0)

noise_tex = nodes.new(type='ShaderNodeTexNoise')
noise_tex.location = (-600, 0)
noise_tex.inputs['Scale'].default_value = 3.0
noise_tex.inputs['Detail'].default_value = 6.0

color_ramp = nodes.new(type='ShaderNodeValToRGB')
color_ramp.location = (-400, 0)
color_ramp.color_ramp.elements[0].color = (0.1, 0.05, 0.02, 1.0)  # 暗い錆
color_ramp.color_ramp.elements[1].color = (0.5, 0.3, 0.2, 1.0)   # 明るい錆

links.new(tex_coord.outputs['Generated'], noise_tex.inputs['Vector'])
links.new(noise_tex.outputs['Fac'], color_ramp.inputs['Fac'])
links.new(color_ramp.outputs['Color'], bsdf_node.inputs['Base Color'])
links.new(bsdf_node.outputs['BSDF'], output_node.inputs['Surface'])

wreck.data.materials.append(mat)

# GLBエクスポート
output_path = f'/home/vscode/AirFighter/public/models/space_wreck_{wreck_type}.glb'
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
