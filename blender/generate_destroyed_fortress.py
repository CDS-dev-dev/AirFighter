#!/usr/bin/env python3
"""
破壊された宇宙要塞モデル生成スクリプト

Usage:
    blender --background --python generate_destroyed_fortress.py
"""

import bpy
import bmesh
import math
import random
from mathutils import Vector, Matrix, Euler

# シーンクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# マテリアル作成
def create_material(name, base_color, metallic=0.8, roughness=0.5, emissive=None):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness

    if emissive:
        bsdf.inputs['Emission'].default_value = emissive
        bsdf.inputs['Emission Strength'].default_value = 0.8

    output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    return mat

# マテリアル定義
mat_armor = create_material('FortressArmor', (0.25, 0.28, 0.32, 1.0), metallic=0.85, roughness=0.65)
mat_damaged = create_material('DamagedArmor', (0.18, 0.12, 0.08, 1.0), metallic=0.6, roughness=0.85)
mat_interior = create_material('Interior', (0.08, 0.08, 0.12, 1.0), metallic=0.3, roughness=0.7)
mat_glow_red = create_material('GlowRed', (0.8, 0.1, 0.1, 1.0), metallic=0.2, roughness=0.4,
                               emissive=(1.0, 0.15, 0.15, 1.0))
mat_warning = create_material('Warning', (0.95, 0.65, 0.0, 1.0), metallic=0.5, roughness=0.3,
                              emissive=(1.0, 0.7, 0.0, 1.0))

def add_material_to_object(obj, mat):
    """オブジェクトにマテリアルを適用"""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

def create_broken_tower(location, rotation, scale=1.0):
    """破壊された防御タワー"""
    # ベース円柱
    bpy.ops.mesh.primitive_cylinder_add(
        radius=18 * scale,
        depth=120 * scale,
        location=location
    )
    tower = bpy.context.active_object
    tower.rotation_euler = rotation
    tower.name = 'BrokenTower'

    # 破損部分を作成（Boolean差分で穴を開ける）
    # 上部を破壊
    bpy.ops.mesh.primitive_cube_add(
        size=50 * scale,
        location=(location[0], location[1], location[2] + 50 * scale)
    )
    cutter = bpy.context.active_object
    cutter.rotation_euler = (
        random.uniform(-0.3, 0.3),
        random.uniform(-0.3, 0.3),
        random.uniform(0, math.pi * 2)
    )

    # Boolean modifier
    mod = tower.modifiers.new(name='Break', type='BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = cutter
    bpy.context.view_layer.objects.active = tower
    bpy.ops.object.modifier_apply(modifier='Break')
    bpy.data.objects.remove(cutter, do_unlink=True)

    # 装甲マテリアル適用
    add_material_to_object(tower, mat_armor)

    # 内部露出部分を追加
    bpy.ops.mesh.primitive_cylinder_add(
        radius=14 * scale,
        depth=30 * scale,
        location=(location[0], location[1], location[2] + 40 * scale)
    )
    interior = bpy.context.active_object
    interior.name = 'TowerInterior'
    add_material_to_object(interior, mat_interior)

    # 警告灯
    for i in range(3):
        angle = (i / 3) * math.pi * 2
        light_pos = (
            location[0] + math.cos(angle) * 16 * scale,
            location[1] + math.sin(angle) * 16 * scale,
            location[2] + random.uniform(-20, 20) * scale
        )
        bpy.ops.mesh.primitive_cube_add(size=2 * scale, location=light_pos)
        light = bpy.context.active_object
        add_material_to_object(light, mat_warning)

    return tower

def create_armor_plate(location, rotation, scale=1.0, damaged=False):
    """装甲板（破損/通常）"""
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    plate = bpy.context.active_object
    plate.scale = (40 * scale, 30 * scale, 3 * scale)
    plate.rotation_euler = rotation
    plate.name = 'ArmorPlate'

    if damaged:
        # 損傷エフェクト（ランダムに頂点を変形）
        bpy.ops.object.mode_set(mode='EDIT')
        bm = bmesh.from_edit_mesh(plate.data)
        for v in bm.verts:
            if random.random() > 0.5:
                v.co += Vector((
                    random.uniform(-5, 5),
                    random.uniform(-5, 5),
                    random.uniform(-2, 2)
                ))
        bmesh.update_edit_mesh(plate.data)
        bpy.ops.object.mode_set(mode='OBJECT')
        add_material_to_object(plate, mat_damaged)
    else:
        add_material_to_object(plate, mat_armor)

    return plate

def create_gun_turret_wreckage(location, rotation, scale=1.0):
    """砲台の残骸"""
    # ベース
    bpy.ops.mesh.primitive_cylinder_add(
        radius=12 * scale,
        depth=8 * scale,
        location=location
    )
    base = bpy.context.active_object
    base.rotation_euler = (math.pi / 2, 0, rotation[2])
    base.name = 'TurretBase'
    add_material_to_object(base, mat_armor)

    # 破壊された砲身
    barrel_offset = Vector((0, 0, 15 * scale))
    barrel_offset.rotate(Euler(rotation))
    barrel_loc = Vector(location) + barrel_offset

    bpy.ops.mesh.primitive_cylinder_add(
        radius=3 * scale,
        depth=35 * scale,
        location=barrel_loc
    )
    barrel = bpy.context.active_object
    barrel.rotation_euler = (
        rotation[0] + random.uniform(-0.5, 0.5),
        rotation[1] + random.uniform(-0.3, 0.3),
        rotation[2]
    )
    barrel.name = 'TurretBarrel'
    add_material_to_object(barrel, mat_damaged)

    # 発光部分（破損）
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=5 * scale,
        location=location
    )
    glow = bpy.context.active_object
    add_material_to_object(glow, mat_glow_red)

    return base

def create_core_structure(location):
    """中央コア構造（内部飛行可能）"""
    # 外殻（八角柱）
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=8,
        radius=60,
        depth=150,
        location=location
    )
    core = bpy.context.active_object
    core.name = 'CoreStructure'
    add_material_to_object(core, mat_armor)

    # 内部空洞
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=8,
        radius=48,
        depth=155,
        location=location
    )
    hollow = bpy.context.active_object

    # Boolean で空洞化
    mod = core.modifiers.new(name='Hollow', type='BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = hollow
    bpy.context.view_layer.objects.active = core
    bpy.ops.object.modifier_apply(modifier='Hollow')
    bpy.data.objects.remove(hollow, do_unlink=True)

    # 破損部分（開口部）
    for i in range(3):
        angle = (i / 3) * math.pi * 2 + random.uniform(-0.3, 0.3)
        breach_loc = (
            location[0] + math.cos(angle) * 55,
            location[1] + math.sin(angle) * 55,
            location[2] + random.uniform(-40, 40)
        )
        bpy.ops.mesh.primitive_cube_add(size=30, location=breach_loc)
        breach = bpy.context.active_object
        breach.rotation_euler = (random.uniform(0, math.pi), random.uniform(0, math.pi), angle)

        mod = core.modifiers.new(name=f'Breach{i}', type='BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = breach
        bpy.context.view_layer.objects.active = core
        bpy.ops.object.modifier_apply(modifier=f'Breach{i}')
        bpy.data.objects.remove(breach, do_unlink=True)

    # 内部構造パイプ
    for i in range(6):
        angle = (i / 6) * math.pi * 2
        pipe_start = (
            location[0] + math.cos(angle) * 45,
            location[1] + math.sin(angle) * 45,
            location[2] - 70
        )
        pipe_end = (
            location[0] + math.cos(angle) * 45,
            location[1] + math.sin(angle) * 45,
            location[2] + 70
        )

        bpy.ops.mesh.primitive_cylinder_add(radius=2, depth=140, location=location)
        pipe = bpy.context.active_object
        pipe.rotation_euler = (0, 0, angle)
        add_material_to_object(pipe, mat_interior)

    return core

def create_debris_field(center, count=50, radius=200):
    """デブリフィールド（小さな破片）"""
    debris_collection = []

    for i in range(count):
        # ランダム位置
        angle_h = random.uniform(0, math.pi * 2)
        angle_v = random.uniform(-math.pi / 4, math.pi / 4)
        dist = random.uniform(50, radius)

        pos = (
            center[0] + math.cos(angle_h) * math.cos(angle_v) * dist,
            center[1] + math.sin(angle_h) * math.cos(angle_v) * dist,
            center[2] + math.sin(angle_v) * dist
        )

        # ランダムな形状
        debris_type = random.choice(['cube', 'ico_sphere', 'cylinder'])
        size = random.uniform(2, 8)

        if debris_type == 'cube':
            bpy.ops.mesh.primitive_cube_add(size=size, location=pos)
        elif debris_type == 'ico_sphere':
            bpy.ops.mesh.primitive_ico_sphere_add(radius=size * 0.5, location=pos)
        else:
            bpy.ops.mesh.primitive_cylinder_add(radius=size * 0.3, depth=size, location=pos)

        debris = bpy.context.active_object
        debris.rotation_euler = (
            random.uniform(0, math.pi * 2),
            random.uniform(0, math.pi * 2),
            random.uniform(0, math.pi * 2)
        )
        debris.name = f'Debris_{i}'
        add_material_to_object(debris, random.choice([mat_armor, mat_damaged, mat_interior]))
        debris_collection.append(debris)

    return debris_collection

# ===== メイン生成 =====
print("🏭 破壊された宇宙要塞を生成中...")

# 中央コア
core = create_core_structure((0, 0, 0))
print("✅ コア構造完成")

# 防御タワー（破損）
towers = []
tower_positions = [
    ((-80, -80, 30), (0.3, 0, 0)),
    ((80, -80, -20), (-0.2, 0, math.pi / 6)),
    ((-70, 90, 50), (0.4, 0, -math.pi / 4)),
    ((90, 80, -30), (-0.3, 0, math.pi / 3))
]
for pos, rot in tower_positions:
    tower = create_broken_tower(pos, rot, scale=random.uniform(0.8, 1.2))
    towers.append(tower)
print(f"✅ タワー {len(towers)}基 完成")

# 装甲板（浮遊）
plates = []
for i in range(20):
    angle = (i / 20) * math.pi * 2
    dist = random.uniform(100, 180)
    pos = (
        math.cos(angle) * dist,
        math.sin(angle) * dist,
        random.uniform(-60, 60)
    )
    rot = (
        random.uniform(-math.pi / 2, math.pi / 2),
        random.uniform(-math.pi / 2, math.pi / 2),
        random.uniform(0, math.pi * 2)
    )
    plate = create_armor_plate(pos, rot, scale=random.uniform(0.7, 1.3),
                               damaged=random.random() > 0.5)
    plates.append(plate)
print(f"✅ 装甲板 {len(plates)}枚 完成")

# 砲台残骸
turrets = []
for i in range(8):
    angle = (i / 8) * math.pi * 2
    dist = random.uniform(120, 160)
    pos = (
        math.cos(angle) * dist,
        math.sin(angle) * dist,
        random.uniform(-40, 40)
    )
    rot = (0, random.uniform(-0.5, 0.5), angle)
    turret = create_gun_turret_wreckage(pos, rot, scale=random.uniform(0.8, 1.1))
    turrets.append(turret)
print(f"✅ 砲台残骸 {len(turrets)}基 完成")

# デブリフィールド
debris = create_debris_field((0, 0, 0), count=80, radius=220)
print(f"✅ デブリ {len(debris)}個 完成")

# エクスポート
output_path = '/home/vscode/AirFighter/public/space_fortress_destroyed.glb'
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
    export_apply=True
)

print(f"✅ エクスポート完了: {output_path}")
print("🏭 破壊された宇宙要塞生成完了！")
