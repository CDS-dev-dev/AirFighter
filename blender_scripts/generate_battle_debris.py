"""
Battle Debris (戦闘デブリ) - Space MAP用
脱出ポッド（Escape Pod）、戦闘機残骸（Fighter Wreck）、ミサイル残骸（Missile Debris）
"""

import bpy
import math
import random

# 既存オブジェクトをクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# デブリマテリアル（焦げた金属）
debris_mat = bpy.data.materials.new(name="DebrisMaterial")
debris_mat.use_nodes = True
nodes = debris_mat.node_tree.nodes
links = debris_mat.node_tree.links
nodes.clear()

bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf.location = (0, 0)
bsdf.inputs['Base Color'].default_value = (0.15, 0.13, 0.12, 1.0)
bsdf.inputs['Metallic'].default_value = 0.7
bsdf.inputs['Roughness'].default_value = 0.9

output = nodes.new(type='ShaderNodeOutputMaterial')
output.location = (300, 0)
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

# ===== 1. 脱出ポッド（Escape Pod） =====
# カプセル本体
bpy.ops.mesh.primitive_uv_sphere_add(
    radius=1,
    location=(-30, 0, 0)
)
pod_body = bpy.context.active_object
pod_body.name = "EscapePod"
pod_body.scale = (2, 2, 3)
bpy.ops.object.transform_apply(scale=True)
pod_body.data.materials.append(debris_mat)

# ハッチ
bpy.ops.mesh.primitive_cylinder_add(
    radius=1.2,
    depth=0.3,
    location=(-30, 0, 2.5),
    vertices=16
)
hatch = bpy.context.active_object
hatch.name = "Hatch"
hatch.data.materials.append(debris_mat)

# 推進ユニット×4
for i in range(4):
    angle = i * math.pi / 2
    x = -30 + math.cos(angle) * 1.8
    y = math.sin(angle) * 1.8
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.3,
        depth=1.5,
        location=(x, y, -1.5)
    )
    thruster = bpy.context.active_object
    thruster.name = f"Thruster_{i+1}"
    thruster.rotation_euler = (math.radians(20), 0, angle)
    thruster.data.materials.append(debris_mat)

# ===== 2. 戦闘機残骸（Fighter Wreck） =====
# 機首（破損）
bpy.ops.mesh.primitive_cone_add(
    radius1=1.5,
    depth=4,
    location=(0, 0, 2),
    vertices=8
)
fighter_nose = bpy.context.active_object
fighter_nose.name = "FighterNose"
fighter_nose.rotation_euler = (math.radians(90), 0, 0)
fighter_nose.data.materials.append(debris_mat)

# 胴体（破損）
bpy.ops.mesh.primitive_cylinder_add(
    radius=1.2,
    depth=8,
    location=(0, -5, 0),
    vertices=12
)
fighter_body = bpy.context.active_object
fighter_body.name = "FighterBody"
fighter_body.rotation_euler = (math.radians(90), 0, 0)
fighter_body.data.materials.append(debris_mat)

# 主翼（片方のみ、破損状態）
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(-3, -3, 0)
)
wing = bpy.context.active_object
wing.name = "Wing"
wing.scale = (4, 0.2, 1.5)
wing.rotation_euler = (0, math.radians(15), math.radians(-20))
bpy.ops.object.transform_apply(scale=True)
wing.data.materials.append(debris_mat)

# エンジンノズル（破損）
bpy.ops.mesh.primitive_cylinder_add(
    radius=0.8,
    depth=2,
    location=(0, -9, 0),
    vertices=12
)
engine = bpy.context.active_object
engine.name = "Engine"
engine.rotation_euler = (math.radians(90), 0, 0)
engine.data.materials.append(debris_mat)

# ===== 3. ミサイル残骸（Missile Debris） =====
# ミサイル本体（破裂状態）
bpy.ops.mesh.primitive_cylinder_add(
    radius=0.3,
    depth=5,
    location=(30, 0, 0),
    vertices=8
)
missile_body = bpy.context.active_object
missile_body.name = "MissileBody"
missile_body.rotation_euler = (0, math.radians(45), 0)
missile_body.data.materials.append(debris_mat)

# 弾頭（変形）
bpy.ops.mesh.primitive_cone_add(
    radius1=0.4,
    depth=1,
    location=(32, 0, 1.5),
    vertices=8
)
warhead = bpy.context.active_object
warhead.name = "Warhead"
warhead.rotation_euler = (math.radians(45), math.radians(45), 0)
warhead.data.materials.append(debris_mat)

# 尾翼（破損、×2）
for i in range(2):
    angle = i * math.pi
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(28 + math.sin(angle) * 0.3, math.cos(angle) * 0.8, 0)
    )
    fin = bpy.context.active_object
    fin.name = f"Fin_{i+1}"
    fin.scale = (0.05, 1, 0.8)
    fin.rotation_euler = (0, math.radians(45), angle)
    bpy.ops.object.transform_apply(scale=True)
    fin.data.materials.append(debris_mat)

# 破片（ランダム配置）
random.seed(42)
for i in range(12):
    size = random.uniform(0.3, 1.2)
    x = random.uniform(-35, 35)
    y = random.uniform(-5, 5)
    z = random.uniform(-3, 3)

    bpy.ops.mesh.primitive_cube_add(
        size=size,
        location=(x, y, z)
    )
    fragment = bpy.context.active_object
    fragment.name = f"Fragment_{i+1}"
    fragment.rotation_euler = (
        random.uniform(0, math.pi),
        random.uniform(0, math.pi),
        random.uniform(0, math.pi)
    )
    fragment.data.materials.append(debris_mat)

# GLBエクスポート
output_path = "/home/vscode/AirFighter/public/models/story_battle_debris.glb"
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_materials='EXPORT',
    export_colors=True,
    export_normals=True,
    export_texcoords=True,
    export_yup=True,
)

print(f"✅ Battle Debris exported: {output_path}")
