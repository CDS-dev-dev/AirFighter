"""
Ancient Ruins (古代遺跡) - Original MAP用
柱（Pillar）、祭壇（Altar）、オベリスク（Obelisk）
"""

import bpy
import math

# 既存オブジェクトをクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ===== 1. 古代の柱（Pillar） =====
bpy.ops.mesh.primitive_cylinder_add(
    radius=8,
    depth=150,
    location=(-50, 0, 75),
    vertices=16
)
pillar = bpy.context.active_object
pillar.name = "AncientPillar"

# 柱の上部を細く
pillar.scale = (1.0, 1.0, 1.0)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.object.mode_set(mode='OBJECT')

# 柱マテリアル（風化した石）
pillar_mat = bpy.data.materials.new(name="PillarMaterial")
pillar_mat.use_nodes = True
pillar_nodes = pillar_mat.node_tree.nodes
pillar_links = pillar_mat.node_tree.links
pillar_nodes.clear()

pillar_bsdf = pillar_nodes.new(type='ShaderNodeBsdfPrincipled')
pillar_bsdf.location = (0, 0)
pillar_bsdf.inputs['Base Color'].default_value = (0.35, 0.32, 0.28, 1.0)  # 古代石
pillar_bsdf.inputs['Roughness'].default_value = 0.95
pillar_bsdf.inputs['Metallic'].default_value = 0.0

# ノイズテクスチャ（風化）
noise = pillar_nodes.new(type='ShaderNodeTexNoise')
noise.location = (-400, 0)
noise.inputs['Scale'].default_value = 12.0

color_ramp = pillar_nodes.new(type='ShaderNodeValToRGB')
color_ramp.location = (-200, 0)
color_ramp.color_ramp.elements[0].color = (0.25, 0.23, 0.20, 1.0)
color_ramp.color_ramp.elements[1].color = (0.45, 0.40, 0.35, 1.0)

pillar_output = pillar_nodes.new(type='ShaderNodeOutputMaterial')
pillar_output.location = (300, 0)

pillar_links.new(noise.outputs['Fac'], color_ramp.inputs['Fac'])
pillar_links.new(color_ramp.outputs['Color'], pillar_bsdf.inputs['Base Color'])
pillar_links.new(pillar_bsdf.outputs['BSDF'], pillar_output.inputs['Surface'])

pillar.data.materials.append(pillar_mat)

# 柱の頂部（キャピタル）
bpy.ops.mesh.primitive_cylinder_add(
    radius=10,
    depth=8,
    location=(-50, 0, 151),
    vertices=16
)
capital = bpy.context.active_object
capital.name = "Capital"
capital.data.materials.append(pillar_mat)

# ===== 2. 祭壇（Altar） =====
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(50, 0, 0)
)
altar = bpy.context.active_object
altar.name = "Altar"
altar.scale = (30, 20, 10)
bpy.ops.object.transform_apply(scale=True)

# 祭壇マテリアル（暗い石）
altar_mat = bpy.data.materials.new(name="AltarMaterial")
altar_mat.use_nodes = True
altar_nodes = altar_mat.node_tree.nodes
altar_links = altar_mat.node_tree.links
altar_nodes.clear()

altar_bsdf = altar_nodes.new(type='ShaderNodeBsdfPrincipled')
altar_bsdf.inputs['Base Color'].default_value = (0.20, 0.18, 0.16, 1.0)
altar_bsdf.inputs['Roughness'].default_value = 0.9
altar_bsdf.inputs['Metallic'].default_value = 0.0

altar_output = altar_nodes.new(type='ShaderNodeOutputMaterial')
altar_links.new(altar_bsdf.outputs['BSDF'], altar_output.inputs['Surface'])

altar.data.materials.append(altar_mat)

# 祭壇の上に小さな柱（装飾）
for i, (x_off, z_off) in enumerate([(-10, -6), (10, -6), (-10, 6), (10, 6)]):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=2,
        depth=15,
        location=(50 + x_off, 0, 10 + 7.5),
        vertices=8
    )
    small_pillar = bpy.context.active_object
    small_pillar.name = f"AltarPillar_{i+1}"
    small_pillar.data.materials.append(pillar_mat)

# ===== 3. オベリスク（Obelisk） =====
# ベース
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(0, 60, 0)
)
obelisk_base = bpy.context.active_object
obelisk_base.name = "ObeliskBase"
obelisk_base.scale = (12, 12, 5)
bpy.ops.object.transform_apply(scale=True)

# オベリスク本体（四角錐状の柱）
bpy.ops.mesh.primitive_cylinder_add(
    radius=6,
    depth=80,
    location=(0, 60, 42.5),
    vertices=4
)
obelisk_body = bpy.context.active_object
obelisk_body.name = "ObeliskBody"
obelisk_body.rotation_euler = (0, 0, math.radians(45))

# 頂部（ピラミッド型）
bpy.ops.mesh.primitive_cone_add(
    radius1=6,
    depth=12,
    location=(0, 60, 88),
    vertices=4
)
obelisk_top = bpy.context.active_object
obelisk_top.name = "ObeliskTop"
obelisk_top.rotation_euler = (0, 0, math.radians(45))

# オベリスクマテリアル（黒っぽい石）
obelisk_mat = bpy.data.materials.new(name="ObeliskMaterial")
obelisk_mat.use_nodes = True
obelisk_nodes = obelisk_mat.node_tree.nodes
obelisk_links = obelisk_mat.node_tree.links
obelisk_nodes.clear()

obelisk_bsdf = obelisk_nodes.new(type='ShaderNodeBsdfPrincipled')
obelisk_bsdf.inputs['Base Color'].default_value = (0.15, 0.14, 0.13, 1.0)
obelisk_bsdf.inputs['Roughness'].default_value = 0.8
obelisk_bsdf.inputs['Metallic'].default_value = 0.1

obelisk_output = obelisk_nodes.new(type='ShaderNodeOutputMaterial')
obelisk_links.new(obelisk_bsdf.outputs['BSDF'], obelisk_output.inputs['Surface'])

obelisk_base.data.materials.append(obelisk_mat)
obelisk_body.data.materials.append(obelisk_mat)
obelisk_top.data.materials.append(obelisk_mat)

# GLBエクスポート
output_path = "/home/vscode/AirFighter/public/models/story_ancient_ruins.glb"
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_materials='EXPORT',
    export_colors=True,
    export_normals=True,
    export_texcoords=True,
    export_yup=True,
)

print(f"✅ Ancient Ruins exported: {output_path}")
