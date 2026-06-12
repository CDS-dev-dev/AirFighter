"""
Abandoned Vehicles (放棄車両) - Tokyo MAP用
車（Car）、ヘリコプター（Helicopter）、トラック（Truck）
"""

import bpy
import math

# 既存オブジェクトをクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# 車両マテリアル（錆びた金属）
vehicle_mat = bpy.data.materials.new(name="VehicleMaterial")
vehicle_mat.use_nodes = True
nodes = vehicle_mat.node_tree.nodes
links = vehicle_mat.node_tree.links
nodes.clear()

bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf.location = (0, 0)
bsdf.inputs['Base Color'].default_value = (0.3, 0.25, 0.22, 1.0)
bsdf.inputs['Metallic'].default_value = 0.6
bsdf.inputs['Roughness'].default_value = 0.9

output = nodes.new(type='ShaderNodeOutputMaterial')
output.location = (300, 0)
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

# ===== 1. 車（Car） =====
# ボディ
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(-20, 0, 1.5)
)
car_body = bpy.context.active_object
car_body.name = "CarBody"
car_body.scale = (4.5, 2, 1.5)
bpy.ops.object.transform_apply(scale=True)
car_body.data.materials.append(vehicle_mat)

# ルーフ
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(-20, 0, 2.8)
)
car_roof = bpy.context.active_object
car_roof.name = "CarRoof"
car_roof.scale = (3, 1.8, 0.8)
bpy.ops.object.transform_apply(scale=True)
car_roof.data.materials.append(vehicle_mat)

# タイヤ×4
tire_mat = bpy.data.materials.new(name="TireMaterial")
tire_mat.use_nodes = True
tire_nodes = tire_mat.node_tree.nodes
tire_links = tire_mat.node_tree.links
tire_nodes.clear()

tire_bsdf = tire_nodes.new(type='ShaderNodeBsdfPrincipled')
tire_bsdf.inputs['Base Color'].default_value = (0.1, 0.1, 0.1, 1.0)
tire_bsdf.inputs['Roughness'].default_value = 0.95

tire_output = tire_nodes.new(type='ShaderNodeOutputMaterial')
tire_links.new(tire_bsdf.outputs['BSDF'], tire_output.inputs['Surface'])

for i, (x, z) in enumerate([(-1.5, 0), (1.5, 0), (-1.5, 0), (1.5, 0)]):
    y = -1 if i < 2 else 1
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.6,
        depth=0.5,
        location=(-20 + x, y, 0.6),
        vertices=16
    )
    tire = bpy.context.active_object
    tire.name = f"Tire_{i+1}"
    tire.rotation_euler = (0, math.radians(90), 0)
    tire.data.materials.append(tire_mat)

# ===== 2. ヘリコプター（Helicopter - 墜落状態） =====
# 機体（胴体）
bpy.ops.mesh.primitive_uv_sphere_add(
    radius=1,
    location=(20, 0, 0.5)
)
heli_body = bpy.context.active_object
heli_body.name = "HeliBody"
heli_body.scale = (3, 1.5, 1.2)
bpy.ops.object.transform_apply(scale=True)
heli_body.rotation_euler = (math.radians(20), 0, math.radians(15))
heli_body.data.materials.append(vehicle_mat)

# テールブーム
bpy.ops.mesh.primitive_cylinder_add(
    radius=0.4,
    depth=5,
    location=(17.5, 0, 1)
)
tail_boom = bpy.context.active_object
tail_boom.name = "TailBoom"
tail_boom.rotation_euler = (0, math.radians(90), 0)
tail_boom.data.materials.append(vehicle_mat)

# メインローター（破損状態）
for i in range(2):
    angle = i * math.pi
    x = 20 + math.cos(angle) * 2
    y = math.sin(angle) * 2
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(x, y, 2.5)
    )
    blade = bpy.context.active_object
    blade.name = f"MainBlade_{i+1}"
    blade.scale = (2.5, 0.3, 0.05)
    blade.rotation_euler = (0, 0, angle)
    bpy.ops.object.transform_apply(scale=True)
    blade.data.materials.append(vehicle_mat)

# テールローター（破損）
bpy.ops.mesh.primitive_cylinder_add(
    radius=0.8,
    depth=0.05,
    location=(15, 0, 1.2)
)
tail_rotor = bpy.context.active_object
tail_rotor.name = "TailRotor"
tail_rotor.rotation_euler = (0, math.radians(90), 0)
tail_rotor.data.materials.append(vehicle_mat)

# ===== 3. トラック（Truck） =====
# キャビン
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(0, 0, 2)
)
truck_cabin = bpy.context.active_object
truck_cabin.name = "TruckCabin"
truck_cabin.scale = (2.5, 2.5, 2)
bpy.ops.object.transform_apply(scale=True)
truck_cabin.data.materials.append(vehicle_mat)

# 荷台
bpy.ops.mesh.primitive_cube_add(
    size=1,
    location=(-4, 0, 1.5)
)
truck_bed = bpy.context.active_object
truck_bed.name = "TruckBed"
truck_bed.scale = (6, 2.5, 1.5)
bpy.ops.object.transform_apply(scale=True)
truck_bed.data.materials.append(vehicle_mat)

# タイヤ×6
for i, x in enumerate([-5.5, -3.5, -1.5, 1, 1, -5.5]):
    y = -1.3 if i < 5 else 1.3
    if i == 5:
        x = -5.5
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.8,
        depth=0.6,
        location=(x, y, 0.8),
        vertices=16
    )
    tire = bpy.context.active_object
    tire.name = f"TruckTire_{i+1}"
    tire.rotation_euler = (0, math.radians(90), 0)
    tire.data.materials.append(tire_mat)

# GLBエクスポート
output_path = "/home/vscode/AirFighter/public/models/story_abandoned_vehicles.glb"
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_materials='EXPORT',
    export_colors=True,
    export_normals=True,
    export_texcoords=True,
    export_yup=True,
)

print(f"✅ Abandoned Vehicles exported: {output_path}")
