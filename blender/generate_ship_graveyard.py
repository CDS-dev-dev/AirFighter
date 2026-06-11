#!/usr/bin/env python3
"""
宇宙船墓場（スクラップヤード）モデル生成スクリプト

Usage:
    blender --background --python generate_ship_graveyard.py
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
def create_material(name, base_color, metallic=0.5, roughness=0.5, emissive=None):
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
        bsdf.inputs['Emission Strength'].default_value = 0.9

    output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    return mat

# マテリアル定義
mat_hull_rusty = create_material('RustyHull', (0.28, 0.22, 0.18, 1.0), metallic=0.6, roughness=0.85)
mat_hull_clean = create_material('CleanHull', (0.5, 0.52, 0.55, 1.0), metallic=0.8, roughness=0.5)
mat_window = create_material('Window', (0.1, 0.15, 0.2, 1.0), metallic=0.95, roughness=0.1)
mat_engine = create_material('Engine', (0.15, 0.12, 0.1, 1.0), metallic=0.7, roughness=0.7)
mat_glow_dying = create_material('DyingGlow', (0.8, 0.3, 0.1, 1.0), metallic=0.2, roughness=0.6,
                                 emissive=(1.0, 0.4, 0.1, 1.0))
mat_salvage = create_material('Salvage', (0.95, 0.85, 0.2, 1.0), metallic=0.7, roughness=0.4)

def add_material_to_object(obj, mat):
    """オブジェクトにマテリアルを適用"""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

def create_derelict_cruiser(location, rotation, scale=1.0):
    """廃棄巡洋艦（大型、内部飛行可能）"""
    # 船体メイン
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    hull = bpy.context.active_object
    hull.scale = (120 * scale, 40 * scale, 30 * scale)
    hull.rotation_euler = rotation
    hull.name = 'DerelictCruiser'
    add_material_to_object(hull, mat_hull_rusty)

    # 船首（先細り）
    bow_offset = Vector((70 * scale, 0, 0))
    bow_offset.rotate(Euler(rotation))
    bow_pos = Vector(location) + bow_offset

    bpy.ops.mesh.primitive_cone_add(
        radius1=20 * scale,
        radius2=5 * scale,
        depth=40 * scale,
        location=bow_pos
    )
    bow = bpy.context.active_object
    bow.rotation_euler = (rotation[0], rotation[1] + math.pi / 2, rotation[2])
    add_material_to_object(bow, mat_hull_rusty)

    # ブリッジ（上部構造）
    bridge_offset = Vector((-20 * scale, 0, 20 * scale))
    bridge_offset.rotate(Euler(rotation))
    bridge_pos = Vector(location) + bridge_offset

    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=bridge_pos
    )
    bridge = bpy.context.active_object
    bridge.scale = (30 * scale, 25 * scale, 15 * scale)
    bridge.rotation_euler = rotation
    add_material_to_object(bridge, mat_hull_clean)

    # 窓
    for i in range(8):
        window_x = -30 * scale + i * 8 * scale
        window_offset = Vector((window_x, 12 * scale, 20 * scale))
        window_offset.rotate(Euler(rotation))
        window_pos = Vector(location) + window_offset

        bpy.ops.mesh.primitive_cube_add(size=3 * scale, location=window_pos)
        window = bpy.context.active_object
        window.rotation_euler = rotation
        add_material_to_object(window, mat_window)

    # エンジンノズル（後部）
    for i in range(4):
        angle = (i / 4) * math.pi * 2
        engine_local = Vector((
            -70 * scale,
            math.cos(angle) * 15 * scale,
            math.sin(angle) * 10 * scale
        ))
        engine_local.rotate(Euler(rotation))
        engine_pos = Vector(location) + engine_local

        bpy.ops.mesh.primitive_cylinder_add(
            radius=8 * scale,
            depth=25 * scale,
            location=engine_pos
        )
        engine = bpy.context.active_object
        engine.rotation_euler = (rotation[0], rotation[1] + math.pi / 2, rotation[2])
        add_material_to_object(engine, mat_engine)

        # 微かな発光（まだ動作している）
        if random.random() > 0.5:
            glow_offset = Vector((-10 * scale, 0, 0))
            glow_offset.rotate(Euler((rotation[0], rotation[1] + math.pi / 2, rotation[2])))
            glow_pos = Vector(engine_pos) + glow_offset

            bpy.ops.mesh.primitive_cylinder_add(
                radius=7 * scale,
                depth=3 * scale,
                location=glow_pos
            )
            glow = bpy.context.active_object
            glow.rotation_euler = (rotation[0], rotation[1] + math.pi / 2, rotation[2])
            add_material_to_object(glow, mat_glow_dying)

    # 破損部分（開口部）
    for i in range(3):
        breach_offset = Vector((
            random.uniform(-40, 40) * scale,
            random.uniform(-15, 15) * scale,
            random.uniform(-10, 10) * scale
        ))
        breach_offset.rotate(Euler(rotation))
        breach_pos = Vector(location) + breach_offset

        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=2,
            radius=12 * scale,
            location=breach_pos
        )
        breach = bpy.context.active_object

        mod = hull.modifiers.new(name=f'Breach{i}', type='BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = breach
        bpy.context.view_layer.objects.active = hull
        bpy.ops.object.modifier_apply(modifier=f'Breach{i}')
        bpy.data.objects.remove(breach, do_unlink=True)

    return hull

def create_derelict_frigate(location, rotation, scale=1.0):
    """廃棄フリゲート（中型）"""
    # 船体
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    hull = bpy.context.active_object
    hull.scale = (70 * scale, 25 * scale, 20 * scale)
    hull.rotation_euler = rotation
    hull.name = 'DerelictFrigate'
    add_material_to_object(hull, mat_hull_rusty)

    # 船首
    bow_offset = Vector((45 * scale, 0, 0))
    bow_offset.rotate(Euler(rotation))
    bow_pos = Vector(location) + bow_offset

    bpy.ops.mesh.primitive_cone_add(
        radius1=12 * scale,
        radius2=3 * scale,
        depth=25 * scale,
        location=bow_pos
    )
    bow = bpy.context.active_object
    bow.rotation_euler = (rotation[0], rotation[1] + math.pi / 2, rotation[2])
    add_material_to_object(bow, mat_hull_clean)

    # エンジン
    for i in range(2):
        side = 1 if i == 0 else -1
        engine_offset = Vector((-40 * scale, side * 10 * scale, -5 * scale))
        engine_offset.rotate(Euler(rotation))
        engine_pos = Vector(location) + engine_offset

        bpy.ops.mesh.primitive_cylinder_add(
            radius=5 * scale,
            depth=15 * scale,
            location=engine_pos
        )
        engine = bpy.context.active_object
        engine.rotation_euler = (rotation[0], rotation[1] + math.pi / 2, rotation[2])
        add_material_to_object(engine, mat_engine)

    return hull

def create_cargo_container_ship(location, rotation, scale=1.0):
    """貨物コンテナ船（開いた貨物室）"""
    # 船体
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    hull = bpy.context.active_object
    hull.scale = (90 * scale, 35 * scale, 25 * scale)
    hull.rotation_euler = rotation
    hull.name = 'CargoShip'
    add_material_to_object(hull, mat_hull_rusty)

    # 開いた貨物ハッチ（上部）
    hatch_offset = Vector((0, 0, 15 * scale))
    hatch_offset.rotate(Euler(rotation))
    hatch_pos = Vector(location) + hatch_offset

    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=hatch_pos
    )
    hatch = bpy.context.active_object
    hatch.scale = (60 * scale, 25 * scale, 5 * scale)
    hatch.rotation_euler = rotation

    mod = hull.modifiers.new(name='CargoHatch', type='BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = hatch
    bpy.context.view_layer.objects.active = hull
    bpy.ops.object.modifier_apply(modifier='CargoHatch')
    bpy.data.objects.remove(hatch, do_unlink=True)

    # 貨物コンテナ（散乱）
    for i in range(8):
        container_offset = Vector((
            random.uniform(-30, 30) * scale,
            random.uniform(-10, 10) * scale,
            random.uniform(20, 40) * scale
        ))
        container_offset.rotate(Euler(rotation))
        container_pos = Vector(location) + container_offset

        bpy.ops.mesh.primitive_cube_add(
            size=8 * scale,
            location=container_pos
        )
        container = bpy.context.active_object
        container.rotation_euler = (
            rotation[0] + random.uniform(-0.5, 0.5),
            rotation[1] + random.uniform(-0.5, 0.5),
            rotation[2] + random.uniform(-0.5, 0.5)
        )
        add_material_to_object(container, random.choice([mat_hull_clean, mat_hull_rusty]))

    return hull

def create_salvage_ship(location, rotation, scale=1.0):
    """サルベージ船（作業中、発光あり）"""
    # 船体
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    hull = bpy.context.active_object
    hull.scale = (40 * scale, 20 * scale, 15 * scale)
    hull.rotation_euler = rotation
    hull.name = 'SalvageShip'
    add_material_to_object(hull, mat_salvage)

    # クレーンアーム
    arm_offset = Vector((25 * scale, 0, 0))
    arm_offset.rotate(Euler(rotation))
    arm_pos = Vector(location) + arm_offset

    bpy.ops.mesh.primitive_cylinder_add(
        radius=2 * scale,
        depth=35 * scale,
        location=arm_pos
    )
    arm = bpy.context.active_object
    arm.rotation_euler = (rotation[0], rotation[1] + math.pi / 2, rotation[2])
    add_material_to_object(arm, mat_engine)

    # 作業灯（発光）
    for i in range(6):
        angle = (i / 6) * math.pi * 2
        light_offset = Vector((
            math.cos(angle) * 10 * scale,
            math.sin(angle) * 10 * scale,
            8 * scale
        ))
        light_offset.rotate(Euler(rotation))
        light_pos = Vector(location) + light_offset

        bpy.ops.mesh.primitive_cube_add(size=2 * scale, location=light_pos)
        light = bpy.context.active_object
        add_material_to_object(light, mat_glow_dying)

    return hull

def create_debris_layer(center, count=60, layer_thickness=50, radius=180):
    """デブリ層（レイヤー状に浮遊）"""
    debris_collection = []

    for i in range(count):
        # 層状に配置
        angle = random.uniform(0, math.pi * 2)
        dist = random.uniform(radius * 0.5, radius)
        height = center[2] + random.uniform(-layer_thickness / 2, layer_thickness / 2)

        pos = (
            center[0] + math.cos(angle) * dist,
            center[1] + math.sin(angle) * dist,
            height
        )

        # ランダムな形状・サイズ
        debris_type = random.choice(['panel', 'beam', 'chunk'])
        size = random.uniform(5, 15)

        if debris_type == 'panel':
            bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
            debris = bpy.context.active_object
            debris.scale = (size * 2, size * 1.5, size * 0.2)
        elif debris_type == 'beam':
            bpy.ops.mesh.primitive_cylinder_add(radius=size * 0.2, depth=size * 3, location=pos)
            debris = bpy.context.active_object
        else:
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size, location=pos)
            debris = bpy.context.active_object

        debris.rotation_euler = (
            random.uniform(0, math.pi * 2),
            random.uniform(0, math.pi * 2),
            random.uniform(0, math.pi * 2)
        )
        debris.name = f'Debris_{i}'
        add_material_to_object(debris, random.choice([mat_hull_rusty, mat_hull_clean, mat_engine]))
        debris_collection.append(debris)

    return debris_collection

# ===== メイン生成 =====
print("🚀 宇宙船墓場を生成中...")

# 大型廃棄船（巡洋艦）
cruisers = []
cruiser_positions = [
    ((0, 0, 0), (0.2, 0.3, 0)),
    ((-150, 80, 30), (-0.3, 0, 0.6)),
]
for pos, rot in cruiser_positions:
    cruiser = create_derelict_cruiser(pos, rot, scale=1.0)
    cruisers.append(cruiser)
print(f"✅ 廃棄巡洋艦 {len(cruisers)}隻 完成")

# 中型廃棄船（フリゲート）
frigates = []
for i in range(5):
    angle = (i / 5) * math.pi * 2 + random.uniform(-0.3, 0.3)
    dist = random.uniform(120, 180)
    height = random.uniform(-40, 40)

    pos = (
        math.cos(angle) * dist,
        math.sin(angle) * dist,
        height
    )
    rot = (
        random.uniform(-0.5, 0.5),
        random.uniform(-0.5, 0.5),
        angle + random.uniform(-0.5, 0.5)
    )

    frigate = create_derelict_frigate(pos, rot, scale=random.uniform(0.8, 1.2))
    frigates.append(frigate)
print(f"✅ 廃棄フリゲート {len(frigates)}隻 完成")

# 貨物船
cargo_ships = []
for i in range(3):
    angle = (i / 3) * math.pi * 2
    pos = (
        math.cos(angle) * 100,
        math.sin(angle) * 100,
        random.uniform(-20, 20)
    )
    rot = (random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), angle)

    cargo = create_cargo_container_ship(pos, rot, scale=1.0)
    cargo_ships.append(cargo)
print(f"✅ 貨物船 {len(cargo_ships)}隻 完成")

# サルベージ船（作業中）
salvage_ships = []
for i in range(2):
    pos = (
        random.uniform(-50, 50),
        random.uniform(-50, 50),
        random.uniform(30, 50)
    )
    rot = (0, 0, random.uniform(0, math.pi * 2))

    salvage = create_salvage_ship(pos, rot, scale=0.9)
    salvage_ships.append(salvage)
print(f"✅ サルベージ船 {len(salvage_ships)}隻 完成")

# デブリ層（3層）
all_debris = []
for layer in range(3):
    layer_height = -50 + layer * 50
    debris = create_debris_layer((0, 0, layer_height), count=70, layer_thickness=40, radius=200)
    all_debris.extend(debris)
print(f"✅ デブリ {len(all_debris)}個 完成")

# エクスポート
output_path = '/home/vscode/AirFighter/public/space_ship_graveyard.glb'
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
    export_apply=True
)

print(f"✅ エクスポート完了: {output_path}")
print("🚀 宇宙船墓場生成完了！")
