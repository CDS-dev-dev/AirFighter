"""
Mothership Wreck (マザーシップ残骸) - Space MAPの超巨大戦艦残骸
全長1500m、内部飛行可能
"""

import bpy
import math
import random

# 既存オブジェクトをクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# メイン船体（楕円体）
bpy.ops.mesh.primitive_uv_sphere_add(
    segments=64,
    ring_count=32,
    radius=1.0,
    location=(0, 0, 0)
)
hull = bpy.context.active_object
hull.name = "MothershipHull"
hull.scale = (750, 200, 150)  # 全長1500m（半径×2）、幅400m、高さ300m
bpy.ops.object.transform_apply(scale=True)

# 船体を破損させる（Displace Modifier）
disp = hull.modifiers.new(name='Damage', type='DISPLACE')
tex = bpy.data.textures.new(name='DamageTex', type='VORONOI')
tex.noise_scale = 2.0
tex.noise_intensity = 2.0
disp.texture = tex
disp.strength = -80.0  # 負の値で凹ませる
disp.mid_level = 0.3

# Subdivision
subsurf = hull.modifiers.new(name='Subdivision', type='SUBSURF')
subsurf.levels = 2
subsurf.render_levels = 3

# 船体マテリアル
hull_mat = bpy.data.materials.new(name="HullMaterial")
hull_mat.use_nodes = True
nodes = hull_mat.node_tree.nodes
links = hull_mat.node_tree.links
nodes.clear()

bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf.location = (0, 0)
bsdf.inputs['Base Color'].default_value = (0.2, 0.22, 0.25, 1.0)  # ダークグレー
bsdf.inputs['Metallic'].default_value = 0.9
bsdf.inputs['Roughness'].default_value = 0.7

# ダメージテクスチャ（錆・焦げ）
noise = nodes.new(type='ShaderNodeTexNoise')
noise.location = (-400, 0)
noise.inputs['Scale'].default_value = 8.0

color_ramp = nodes.new(type='ShaderNodeValToRGB')
color_ramp.location = (-200, 0)
color_ramp.color_ramp.elements[0].color = (0.1, 0.08, 0.06, 1.0)  # 焦げ茶
color_ramp.color_ramp.elements[1].color = (0.3, 0.28, 0.26, 1.0)  # グレー

output = nodes.new(type='ShaderNodeOutputMaterial')
output.location = (300, 0)

links.new(noise.outputs['Fac'], color_ramp.inputs['Fac'])
links.new(color_ramp.outputs['Color'], bsdf.inputs['Base Color'])
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

hull.data.materials.append(hull_mat)

# ブリッジ（艦橋）- 前方
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(600, 0, 100)
)
bridge = bpy.context.active_object
bridge.name = "Bridge"
bridge.scale = (80, 120, 80)
bpy.ops.object.transform_apply(scale=True)

bridge_mat = bpy.data.materials.new(name="BridgeMaterial")
bridge_mat.use_nodes = True
bridge_nodes = bridge_mat.node_tree.nodes
bridge_links = bridge_mat.node_tree.links
bridge_nodes.clear()

bridge_bsdf = bridge_nodes.new(type='ShaderNodeBsdfPrincipled')
bridge_bsdf.inputs['Base Color'].default_value = (0.15, 0.18, 0.22, 1.0)
bridge_bsdf.inputs['Metallic'].default_value = 0.8
bridge_bsdf.inputs['Roughness'].default_value = 0.5

bridge_output = bridge_nodes.new(type='ShaderNodeOutputMaterial')
bridge_links.new(bridge_bsdf.outputs['BSDF'], bridge_output.inputs['Surface'])

bridge.data.materials.append(bridge_mat)

# エンジンユニット（後方×2）
for i, x_offset in enumerate([-100, 100]):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=60,
        depth=200,
        location=(-600, x_offset, 0),
        vertices=16
    )
    engine = bpy.context.active_object
    engine.name = f"Engine_{i+1}"
    engine.rotation_euler = (0, math.radians(90), 0)

    engine_mat = bpy.data.materials.new(name=f"EngineMaterial_{i+1}")
    engine_mat.use_nodes = True
    engine_nodes = engine_mat.node_tree.nodes
    engine_links = engine_mat.node_tree.links
    engine_nodes.clear()

    engine_bsdf = engine_nodes.new(type='ShaderNodeBsdfPrincipled')
    engine_bsdf.inputs['Base Color'].default_value = (0.25, 0.15, 0.1, 1.0)  # 焦げ茶
    engine_bsdf.inputs['Metallic'].default_value = 0.7
    engine_bsdf.inputs['Roughness'].default_value = 0.9

    engine_output = engine_nodes.new(type='ShaderNodeOutputMaterial')
    engine_links.new(engine_bsdf.outputs['BSDF'], engine_output.inputs['Surface'])

    engine.data.materials.append(engine_mat)

# ハンガーデッキ（内部空間）- 下部
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(0, 0, -100)
)
hangar = bpy.context.active_object
hangar.name = "Hangar"
hangar.scale = (400, 150, 50)
bpy.ops.object.transform_apply(scale=True)

hangar_mat = bpy.data.materials.new(name="HangarMaterial")
hangar_mat.use_nodes = True
hangar_nodes = hangar_mat.node_tree.nodes
hangar_links = hangar_mat.node_tree.links
hangar_nodes.clear()

hangar_emission = hangar_nodes.new(type='ShaderNodeEmission')
hangar_emission.inputs['Color'].default_value = (0.05, 0.08, 0.12, 1.0)  # 暗いブルー
hangar_emission.inputs['Strength'].default_value = 0.5

hangar_output = hangar_nodes.new(type='ShaderNodeOutputMaterial')
hangar_links.new(hangar_emission.outputs['Emission'], hangar_output.inputs['Surface'])

hangar.data.materials.append(hangar_mat)

# 破損部分（穴）- 複数箇所にデブリ
debris_mat = bpy.data.materials.new(name="DebrisMaterial")
debris_mat.use_nodes = True
debris_nodes = debris_mat.node_tree.nodes
debris_links = debris_mat.node_tree.links
debris_nodes.clear()

debris_bsdf = debris_nodes.new(type='ShaderNodeBsdfPrincipled')
debris_bsdf.inputs['Base Color'].default_value = (0.15, 0.13, 0.12, 1.0)
debris_bsdf.inputs['Metallic'].default_value = 0.6
debris_bsdf.inputs['Roughness'].default_value = 0.95

debris_output = debris_nodes.new(type='ShaderNodeOutputMaterial')
debris_links.new(debris_bsdf.outputs['BSDF'], debris_output.inputs['Surface'])

random.seed(42)
for i in range(30):
    x = random.uniform(-600, 600)
    y = random.uniform(-150, 150)
    z = random.uniform(-100, 100)
    size = random.uniform(10, 40)

    bpy.ops.mesh.primitive_cube_add(
        size=size,
        location=(x, y, z)
    )
    debris = bpy.context.active_object
    debris.name = f"Debris_{i+1}"
    debris.rotation_euler = (
        random.uniform(0, math.pi),
        random.uniform(0, math.pi),
        random.uniform(0, math.pi)
    )
    debris.data.materials.append(debris_mat)

# GLBエクスポート
output_path = "/home/vscode/AirFighter/public/models/landmark_mothership_wreck.glb"
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_materials='EXPORT',
    export_colors=True,
    export_normals=True,
    export_texcoords=True,
    export_yup=True,
)

print(f"✅ Mothership Wreck exported: {output_path}")
