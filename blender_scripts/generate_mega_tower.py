"""
Mega Tower (メガタワー) - Tokyo MAP中央の超高層複合ビル
高さ800m、160階建て
"""

import bpy
import math

# 既存オブジェクトをクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# メインタワー（円柱）
bpy.ops.mesh.primitive_cylinder_add(
    radius=80,
    depth=800,
    location=(0, 0, 400),
    vertices=32
)
tower = bpy.context.active_object
tower.name = "MegaTower"

# タワーマテリアル（ガラス・金属）
mat = bpy.data.materials.new(name="MegaTowerMaterial")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

# Principled BSDF
bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf.location = (0, 0)
bsdf.inputs['Base Color'].default_value = (0.1, 0.15, 0.2, 1.0)  # ダークブルー
bsdf.inputs['Metallic'].default_value = 0.8
bsdf.inputs['Roughness'].default_value = 0.3
bsdf.inputs['Transmission'].default_value = 0.2  # ガラス感

# Output
output = nodes.new(type='ShaderNodeOutputMaterial')
output.location = (300, 0)
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

tower.data.materials.append(mat)

# フロアリング（各フロア5m）
floor_mat = bpy.data.materials.new(name="FloorMaterial")
floor_mat.use_nodes = True
floor_nodes = floor_mat.node_tree.nodes
floor_links = floor_mat.node_tree.links
floor_nodes.clear()

floor_bsdf = floor_nodes.new(type='ShaderNodeBsdfPrincipled')
floor_bsdf.inputs['Base Color'].default_value = (0.8, 0.75, 0.7, 1.0)  # ライトグレー
floor_bsdf.inputs['Metallic'].default_value = 0.9
floor_bsdf.inputs['Roughness'].default_value = 0.2

floor_output = floor_nodes.new(type='ShaderNodeOutputMaterial')
floor_links.new(floor_bsdf.outputs['BSDF'], floor_output.inputs['Surface'])

# フロアリング配置（20階ごとに太いリング）
for i in range(0, 161, 20):
    if i == 0:
        continue
    y = i * 5.0  # 各フロア5m
    bpy.ops.mesh.primitive_cylinder_add(
        radius=82,
        depth=3,
        location=(0, 0, y),
        vertices=32
    )
    floor_ring = bpy.context.active_object
    floor_ring.name = f"FloorRing_{i}"
    floor_ring.data.materials.append(floor_mat)

# ヘリポート（300m, 500m, 750m）
heliport_positions = [300, 500, 750]
for i, y in enumerate(heliport_positions):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=40,
        depth=2,
        location=(0, 0, y),
        vertices=16
    )
    heliport = bpy.context.active_object
    heliport.name = f"Heliport_{i+1}"

    # ヘリポートマテリアル（黄色マーキング）
    heliport_mat = bpy.data.materials.new(name=f"HeliportMaterial_{i+1}")
    heliport_mat.use_nodes = True
    heliport_nodes = heliport_mat.node_tree.nodes
    heliport_links = heliport_mat.node_tree.links
    heliport_nodes.clear()

    heliport_emission = heliport_nodes.new(type='ShaderNodeEmission')
    heliport_emission.inputs['Color'].default_value = (1.0, 0.9, 0.0, 1.0)  # 黄色
    heliport_emission.inputs['Strength'].default_value = 2.0

    heliport_output = heliport_nodes.new(type='ShaderNodeOutputMaterial')
    heliport_links.new(heliport_emission.outputs['Emission'], heliport_output.inputs['Surface'])

    heliport.data.materials.append(heliport_mat)

# 頂上アンテナ
bpy.ops.mesh.primitive_cylinder_add(
    radius=3,
    depth=50,
    location=(0, 0, 825),
    vertices=8
)
antenna = bpy.context.active_object
antenna.name = "Antenna"

antenna_mat = bpy.data.materials.new(name="AntennaMaterial")
antenna_mat.use_nodes = True
antenna_nodes = antenna_mat.node_tree.nodes
antenna_links = antenna_mat.node_tree.links
antenna_nodes.clear()

antenna_bsdf = antenna_nodes.new(type='ShaderNodeBsdfPrincipled')
antenna_bsdf.inputs['Base Color'].default_value = (0.9, 0.1, 0.1, 1.0)  # 赤
antenna_bsdf.inputs['Metallic'].default_value = 0.8
antenna_bsdf.inputs['Roughness'].default_value = 0.3

antenna_output = antenna_nodes.new(type='ShaderNodeOutputMaterial')
antenna_links.new(antenna_bsdf.outputs['BSDF'], antenna_output.inputs['Surface'])

antenna.data.materials.append(antenna_mat)

# アンテナライト（点滅用）
bpy.ops.mesh.primitive_uv_sphere_add(radius=5, location=(0, 0, 850))
light_sphere = bpy.context.active_object
light_sphere.name = "AntennaLight"

light_mat = bpy.data.materials.new(name="AntennaLightMaterial")
light_mat.use_nodes = True
light_nodes = light_mat.node_tree.nodes
light_links = light_mat.node_tree.links
light_nodes.clear()

light_emission = light_nodes.new(type='ShaderNodeEmission')
light_emission.inputs['Color'].default_value = (1.0, 0.0, 0.0, 1.0)  # 赤
light_emission.inputs['Strength'].default_value = 10.0

light_output = light_nodes.new(type='ShaderNodeOutputMaterial')
light_links.new(light_emission.outputs['Emission'], light_output.inputs['Surface'])

light_sphere.data.materials.append(light_mat)

# GLBエクスポート
output_path = "/home/vscode/AirFighter/public/models/landmark_mega_tower.glb"
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_materials='EXPORT',
    export_colors=True,
    export_normals=True,
    export_texcoords=True,
    export_yup=True,
)

print(f"✅ Mega Tower exported: {output_path}")
