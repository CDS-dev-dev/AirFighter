"""
Biome Assets (バイオーム別アセット)
- 雪山: 針葉樹、氷河
- ジャングル: 巨大樹、シダ
- 砂漠: サボテン、砂岩
"""

import bpy
import math
import random

# 既存オブジェクトをクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ===== 1. 針葉樹（Pine Tree - 雪山用） =====
# 幹
bpy.ops.mesh.primitive_cylinder_add(
    radius=0.4,
    depth=20,
    location=(-30, 0, 10),
    vertices=8
)
pine_trunk = bpy.context.active_object
pine_trunk.name = "PineTrunk"

trunk_mat = bpy.data.materials.new(name="PineTrunkMaterial")
trunk_mat.use_nodes = True
trunk_nodes = trunk_mat.node_tree.nodes
trunk_nodes.clear()
trunk_bsdf = trunk_nodes.new(type='ShaderNodeBsdfPrincipled')
trunk_bsdf.inputs['Base Color'].default_value = (0.3, 0.25, 0.2, 1.0)
trunk_bsdf.inputs['Roughness'].default_value = 0.95
trunk_output = trunk_nodes.new(type='ShaderNodeOutputMaterial')
trunk_mat.node_tree.links.new(trunk_bsdf.outputs['BSDF'], trunk_output.inputs['Surface'])
pine_trunk.data.materials.append(trunk_mat)

# 葉（円錐×3層）
needle_mat = bpy.data.materials.new(name="NeedleMaterial")
needle_mat.use_nodes = True
needle_nodes = needle_mat.node_tree.nodes
needle_nodes.clear()
needle_bsdf = needle_nodes.new(type='ShaderNodeBsdfPrincipled')
needle_bsdf.inputs['Base Color'].default_value = (0.1, 0.3, 0.2, 1.0)  # 濃い緑
needle_bsdf.inputs['Roughness'].default_value = 0.9
needle_output = needle_nodes.new(type='ShaderNodeOutputMaterial')
needle_mat.node_tree.links.new(needle_bsdf.outputs['BSDF'], needle_output.inputs['Surface'])

for i, (y, r) in enumerate([(15, 5), (12, 6), (8, 7)]):
    bpy.ops.mesh.primitive_cone_add(
        radius1=r,
        depth=6,
        location=(-30, 0, y),
        vertices=8
    )
    foliage = bpy.context.active_object
    foliage.name = f"PineFoliage_{i+1}"
    foliage.data.materials.append(needle_mat)

# ===== 2. 巨大樹（Giant Tree - ジャングル用） =====
bpy.ops.mesh.primitive_cylinder_add(
    radius=3,
    depth=50,
    location=(0, 0, 25),
    vertices=12
)
giant_trunk = bpy.context.active_object
giant_trunk.name = "GiantTrunk"
giant_trunk.data.materials.append(trunk_mat)

# 巨大樹の葉（球体）
giant_foliage_mat = bpy.data.materials.new(name="GiantFoliageMaterial")
giant_foliage_mat.use_nodes = True
gf_nodes = giant_foliage_mat.node_tree.nodes
gf_nodes.clear()
gf_bsdf = gf_nodes.new(type='ShaderNodeBsdfPrincipled')
gf_bsdf.inputs['Base Color'].default_value = (0.2, 0.5, 0.2, 1.0)  # 明るい緑
gf_bsdf.inputs['Roughness'].default_value = 0.9
gf_output = gf_nodes.new(type='ShaderNodeOutputMaterial')
giant_foliage_mat.node_tree.links.new(gf_bsdf.outputs['BSDF'], gf_output.inputs['Surface'])

bpy.ops.mesh.primitive_ico_sphere_add(
    subdivisions=2,
    radius=15,
    location=(0, 0, 45)
)
giant_foliage = bpy.context.active_object
giant_foliage.name = "GiantFoliage"
giant_foliage.data.materials.append(giant_foliage_mat)

# ===== 3. サボテン（Cactus - 砂漠用） =====
# 本体
bpy.ops.mesh.primitive_cylinder_add(
    radius=1.5,
    depth=15,
    location=(30, 0, 7.5),
    vertices=12
)
cactus_body = bpy.context.active_object
cactus_body.name = "CactusBody"

cactus_mat = bpy.data.materials.new(name="CactusMaterial")
cactus_mat.use_nodes = True
cactus_nodes = cactus_mat.node_tree.nodes
cactus_nodes.clear()
cactus_bsdf = cactus_nodes.new(type='ShaderNodeBsdfPrincipled')
cactus_bsdf.inputs['Base Color'].default_value = (0.3, 0.5, 0.3, 1.0)  # 緑
cactus_bsdf.inputs['Roughness'].default_value = 0.8
cactus_output = cactus_nodes.new(type='ShaderNodeOutputMaterial')
cactus_mat.node_tree.links.new(cactus_bsdf.outputs['BSDF'], cactus_output.inputs['Surface'])
cactus_body.data.materials.append(cactus_mat)

# 腕×2
for i, angle in enumerate([math.pi/3, -math.pi/3]):
    x_offset = math.sin(angle) * 2
    z_offset = 8

    bpy.ops.mesh.primitive_cylinder_add(
        radius=1.0,
        depth=8,
        location=(30 + x_offset, 0, z_offset),
        vertices=12
    )
    arm = bpy.context.active_object
    arm.name = f"CactusArm_{i+1}"
    arm.rotation_euler = (0, angle, 0)
    arm.data.materials.append(cactus_mat)

# ===== 4. 氷河（Glacier - 雪山用） =====
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(-60, 0, 5)
)
glacier = bpy.context.active_object
glacier.name = "Glacier"
glacier.scale = (20, 30, 10)
bpy.ops.object.transform_apply(scale=True)

glacier_mat = bpy.data.materials.new(name="GlacierMaterial")
glacier_mat.use_nodes = True
glacier_nodes = glacier_mat.node_tree.nodes
glacier_nodes.clear()
glacier_bsdf = glacier_nodes.new(type='ShaderNodeBsdfPrincipled')
glacier_bsdf.inputs['Base Color'].default_value = (0.8, 0.9, 1.0, 1.0)  # 青白い
glacier_bsdf.inputs['Roughness'].default_value = 0.2
glacier_bsdf.inputs['Metallic'].default_value = 0.1
glacier_bsdf.inputs['Transmission'].default_value = 0.3  # 半透明
glacier_output = glacier_nodes.new(type='ShaderNodeOutputMaterial')
glacier_mat.node_tree.links.new(glacier_bsdf.outputs['BSDF'], glacier_output.inputs['Surface'])
glacier.data.materials.append(glacier_mat)

# ===== 5. シダ（Fern - ジャングル用） =====
# 茎
bpy.ops.mesh.primitive_cylinder_add(
    radius=0.1,
    depth=3,
    location=(60, 0, 1.5),
    vertices=6
)
fern_stem = bpy.context.active_object
fern_stem.name = "FernStem"

fern_mat = bpy.data.materials.new(name="FernMaterial")
fern_mat.use_nodes = True
fern_nodes = fern_mat.node_tree.nodes
fern_nodes.clear()
fern_bsdf = fern_nodes.new(type='ShaderNodeBsdfPrincipled')
fern_bsdf.inputs['Base Color'].default_value = (0.2, 0.6, 0.3, 1.0)
fern_bsdf.inputs['Roughness'].default_value = 0.9
fern_output = fern_nodes.new(type='ShaderNodeOutputMaterial')
fern_mat.node_tree.links.new(fern_bsdf.outputs['BSDF'], fern_output.inputs['Surface'])
fern_stem.data.materials.append(fern_mat)

# 葉（平面×4）
for i in range(4):
    angle = i * math.pi / 2
    x = 60 + math.cos(angle) * 1.5
    y = math.sin(angle) * 1.5

    bpy.ops.mesh.primitive_plane_add(
        size=2,
        location=(x, y, 2)
    )
    leaf = bpy.context.active_object
    leaf.name = f"FernLeaf_{i+1}"
    leaf.rotation_euler = (math.radians(30), 0, angle)
    leaf.data.materials.append(fern_mat)

# ===== 6. 砂岩（Sandstone - 砂漠用） =====
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(90, 0, 8)
)
sandstone = bpy.context.active_object
sandstone.name = "Sandstone"
sandstone.scale = (10, 8, 16)
bpy.ops.object.transform_apply(scale=True)

sandstone_mat = bpy.data.materials.new(name="SandstoneMaterial")
sandstone_mat.use_nodes = True
sandstone_nodes = sandstone_mat.node_tree.nodes
sandstone_nodes.clear()
sandstone_bsdf = sandstone_nodes.new(type='ShaderNodeBsdfPrincipled')
sandstone_bsdf.inputs['Base Color'].default_value = (0.8, 0.7, 0.5, 1.0)  # 砂色
sandstone_bsdf.inputs['Roughness'].default_value = 0.95
sandstone_output = sandstone_nodes.new(type='ShaderNodeOutputMaterial')
sandstone_mat.node_tree.links.new(sandstone_bsdf.outputs['BSDF'], sandstone_output.inputs['Surface'])
sandstone.data.materials.append(sandstone_mat)

# GLBエクスポート
output_path = "/home/vscode/AirFighter/public/models/biome_assets.glb"
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_materials='EXPORT',
    export_colors=True,
    export_normals=True,
    export_texcoords=True,
    export_yup=True,
)

print(f"✅ Biome Assets exported: {output_path}")
