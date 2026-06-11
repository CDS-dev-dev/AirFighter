#!/usr/bin/env python3
"""
小惑星採掘コロニーモデル生成スクリプト

Usage:
    blender --background --python generate_mining_colony.py
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
        bsdf.inputs['Emission Strength'].default_value = 1.2

    output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    return mat

# マテリアル定義
mat_asteroid = create_material('Asteroid', (0.35, 0.32, 0.28, 1.0), metallic=0.05, roughness=0.95)
mat_metal = create_material('Metal', (0.45, 0.47, 0.5, 1.0), metallic=0.85, roughness=0.4)
mat_industrial = create_material('Industrial', (0.6, 0.5, 0.3, 1.0), metallic=0.7, roughness=0.6)
mat_rail = create_material('Rail', (0.3, 0.35, 0.4, 1.0), metallic=0.9, roughness=0.3)
mat_glow_blue = create_material('GlowBlue', (0.2, 0.6, 1.0, 1.0), metallic=0.2, roughness=0.4,
                                emissive=(0.2, 0.7, 1.0, 1.0))
mat_glow_orange = create_material('GlowOrange', (1.0, 0.5, 0.1, 1.0), metallic=0.2, roughness=0.4,
                                  emissive=(1.0, 0.6, 0.15, 1.0))

def add_material_to_object(obj, mat):
    """オブジェクトにマテリアルを適用"""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

def create_hollowed_asteroid(location, radius=80):
    """くり抜かれた小惑星（内部飛行可能）"""
    # 外殻
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=3,
        radius=radius,
        location=location
    )
    asteroid = bpy.context.active_object
    asteroid.name = 'HollowedAsteroid'

    # 表面をランダムに変形
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(asteroid.data)
    for v in bm.verts:
        noise = random.uniform(0.7, 1.3)
        v.co *= noise
    bmesh.update_edit_mesh(asteroid.data)
    bpy.ops.object.mode_set(mode='OBJECT')

    add_material_to_object(asteroid, mat_asteroid)

    # 内部空洞を作成
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=2,
        radius=radius * 0.65,
        location=location
    )
    hollow = bpy.context.active_object

    # Boolean で空洞化
    mod = asteroid.modifiers.new(name='Hollow', type='BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = hollow
    bpy.context.view_layer.objects.active = asteroid
    bpy.ops.object.modifier_apply(modifier='Hollow')
    bpy.data.objects.remove(hollow, do_unlink=True)

    # 開口部（入口）を3箇所作成
    for i in range(3):
        angle_h = (i / 3) * math.pi * 2 + random.uniform(-0.2, 0.2)
        angle_v = random.uniform(-0.3, 0.3)

        entrance_pos = (
            location[0] + math.cos(angle_h) * math.cos(angle_v) * radius * 0.9,
            location[1] + math.sin(angle_h) * math.cos(angle_v) * radius * 0.9,
            location[2] + math.sin(angle_v) * radius * 0.9
        )

        bpy.ops.mesh.primitive_cylinder_add(
            radius=radius * 0.3,
            depth=radius * 0.4,
            location=entrance_pos
        )
        entrance = bpy.context.active_object
        entrance.rotation_euler = (angle_v, 0, angle_h + math.pi / 2)

        mod = asteroid.modifiers.new(name=f'Entrance{i}', type='BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = entrance
        bpy.context.view_layer.objects.active = asteroid
        bpy.ops.object.modifier_apply(modifier=f'Entrance{i}')
        bpy.data.objects.remove(entrance, do_unlink=True)

    return asteroid

def create_mining_station(location, rotation):
    """採掘ステーション（小惑星表面に付着）"""
    # メイン構造
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    station = bpy.context.active_object
    station.scale = (20, 15, 12)
    station.rotation_euler = rotation
    station.name = 'MiningStation'
    add_material_to_object(station, mat_industrial)

    # ドリルアーム
    drill_offset = Vector((0, 0, -15))
    drill_offset.rotate(Euler(rotation))
    drill_pos = Vector(location) + drill_offset

    bpy.ops.mesh.primitive_cylinder_add(
        radius=3,
        depth=25,
        location=drill_pos
    )
    drill = bpy.context.active_object
    drill.rotation_euler = rotation
    drill.name = 'DrillArm'
    add_material_to_object(drill, mat_metal)

    # ドリルヘッド（発光）
    drill_head_offset = Vector((0, 0, -27))
    drill_head_offset.rotate(Euler(rotation))
    drill_head_pos = Vector(location) + drill_head_offset

    bpy.ops.mesh.primitive_cone_add(
        radius1=5,
        radius2=1,
        depth=10,
        location=drill_head_pos
    )
    drill_head = bpy.context.active_object
    drill_head.rotation_euler = rotation
    add_material_to_object(drill_head, mat_glow_orange)

    # アンテナ
    antenna_offset = Vector((0, 0, 8))
    antenna_offset.rotate(Euler(rotation))
    antenna_pos = Vector(location) + antenna_offset

    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.5,
        depth=10,
        location=antenna_pos
    )
    antenna = bpy.context.active_object
    antenna.rotation_euler = rotation
    add_material_to_object(antenna, mat_rail)

    # 照明
    for i in range(4):
        angle = (i / 4) * math.pi * 2
        light_local = Vector((math.cos(angle) * 8, math.sin(angle) * 6, 0))
        light_local.rotate(Euler(rotation))
        light_pos = Vector(location) + light_local

        bpy.ops.mesh.primitive_cube_add(size=2, location=light_pos)
        light = bpy.context.active_object
        add_material_to_object(light, mat_glow_blue)

    return station

def create_transport_rail(start, end, supports=5):
    """輸送レール（小惑星間を接続）"""
    # レール本体
    direction = Vector(end) - Vector(start)
    length = direction.length
    center = (Vector(start) + Vector(end)) / 2

    bpy.ops.mesh.primitive_cylinder_add(
        radius=1.5,
        depth=length,
        location=center
    )
    rail = bpy.context.active_object
    rail.name = 'TransportRail'

    # 方向を合わせる
    direction.normalize()
    rail.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()

    add_material_to_object(rail, mat_rail)

    # サポート支柱
    support_objs = []
    for i in range(supports):
        t = (i + 1) / (supports + 1)
        support_pos = Vector(start).lerp(Vector(end), t)

        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=support_pos
        )
        support = bpy.context.active_object
        support.scale = (3, 3, 8)
        support.rotation_euler = rail.rotation_euler
        add_material_to_object(support, mat_metal)
        support_objs.append(support)

    return rail, support_objs

def create_tunnel(start, end, radius=15):
    """トンネル（小惑星内部を接続）"""
    direction = Vector(end) - Vector(start)
    length = direction.length
    center = (Vector(start) + Vector(end)) / 2

    # トンネル本体（円柱）
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius,
        depth=length,
        location=center
    )
    tunnel = bpy.context.active_object
    tunnel.name = 'Tunnel'

    # 方向を合わせる
    direction.normalize()
    tunnel.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()

    add_material_to_object(tunnel, mat_industrial)

    # 内壁のライン（照明ガイド）
    for i in range(8):
        angle = (i / 8) * math.pi * 2
        line_radius = radius * 0.9

        line_start = Vector((
            center[0] + math.cos(angle) * line_radius,
            center[1] + math.sin(angle) * line_radius,
            center[2] - length / 2
        ))
        line_end = Vector((
            center[0] + math.cos(angle) * line_radius,
            center[1] + math.sin(angle) * line_radius,
            center[2] + length / 2
        ))

        # 回転を考慮して位置を調整
        line_start.rotate(tunnel.rotation_euler)
        line_end.rotate(tunnel.rotation_euler)

        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.8,
            depth=length * 0.95,
            location=center
        )
        line = bpy.context.active_object
        line.rotation_euler = tunnel.rotation_euler
        offset = Vector((math.cos(angle) * line_radius, math.sin(angle) * line_radius, 0))
        line.location = center + offset
        add_material_to_object(line, mat_glow_blue)

    return tunnel

def create_ore_container(location, scale=1.0):
    """鉱石コンテナ"""
    bpy.ops.mesh.primitive_cube_add(
        size=10 * scale,
        location=location
    )
    container = bpy.context.active_object
    container.rotation_euler = (
        random.uniform(-0.2, 0.2),
        random.uniform(-0.2, 0.2),
        random.uniform(0, math.pi * 2)
    )
    container.name = 'OreContainer'
    add_material_to_object(container, mat_metal)

    # ラベル（発光）
    bpy.ops.mesh.primitive_cube_add(
        size=3 * scale,
        location=(location[0], location[1], location[2] + 5 * scale)
    )
    label = bpy.context.active_object
    add_material_to_object(label, mat_glow_orange)

    return container

def create_processing_plant(location):
    """鉱石処理プラント"""
    # メイン施設
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    plant = bpy.context.active_object
    plant.scale = (30, 25, 20)
    plant.name = 'ProcessingPlant'
    add_material_to_object(plant, mat_industrial)

    # 煙突（排気口）
    for i in range(3):
        offset_x = (i - 1) * 12
        chimney_pos = (location[0] + offset_x, location[1], location[2] + 15)

        bpy.ops.mesh.primitive_cylinder_add(
            radius=3,
            depth=20,
            location=chimney_pos
        )
        chimney = bpy.context.active_object
        add_material_to_object(chimney, mat_metal)

        # 排気エフェクト（発光）
        bpy.ops.mesh.primitive_cone_add(
            radius1=4,
            radius2=6,
            depth=8,
            location=(chimney_pos[0], chimney_pos[1], chimney_pos[2] + 14)
        )
        exhaust = bpy.context.active_object
        add_material_to_object(exhaust, mat_glow_orange)

    # パイプライン
    for i in range(4):
        angle = (i / 4) * math.pi * 2
        pipe_start = (
            location[0] + math.cos(angle) * 18,
            location[1] + math.sin(angle) * 15,
            location[2]
        )
        bpy.ops.mesh.primitive_cylinder_add(
            radius=2,
            depth=25,
            location=pipe_start
        )
        pipe = bpy.context.active_object
        pipe.rotation_euler = (math.pi / 2, 0, angle)
        add_material_to_object(pipe, mat_rail)

    return plant

# ===== メイン生成 =====
print("⛏️ 小惑星採掘コロニーを生成中...")

# 主小惑星（くり抜き済み）
main_asteroid = create_hollowed_asteroid((0, 0, 0), radius=85)
print("✅ 主小惑星完成")

# 採掘ステーション（表面に配置）
stations = []
for i in range(6):
    angle_h = (i / 6) * math.pi * 2
    angle_v = random.uniform(-0.4, 0.4)
    dist = 85

    pos = (
        math.cos(angle_h) * math.cos(angle_v) * dist,
        math.sin(angle_h) * math.cos(angle_v) * dist,
        math.sin(angle_v) * dist
    )
    rot = (angle_v, 0, angle_h + math.pi)

    station = create_mining_station(pos, rot)
    stations.append(station)
print(f"✅ 採掘ステーション {len(stations)}基 完成")

# サブ小惑星
sub_asteroids = []
sub_positions = [
    (180, 120, 60),
    (-150, -140, -50),
    (100, -160, 80)
]
for pos in sub_positions:
    sub_ast = create_hollowed_asteroid(pos, radius=50)
    sub_asteroids.append(sub_ast)
print(f"✅ サブ小惑星 {len(sub_asteroids)}個 完成")

# 輸送レール（小惑星間）
rails = []
rail_pairs = [
    ((0, 0, 0), (180, 120, 60)),
    ((0, 0, 0), (-150, -140, -50)),
    ((180, 120, 60), (100, -160, 80))
]
for start, end in rail_pairs:
    rail, supports = create_transport_rail(start, end, supports=6)
    rails.append(rail)
print(f"✅ 輸送レール {len(rails)}本 完成")

# トンネル（主小惑星内部）
tunnels = []
tunnel_pairs = [
    ((30, 0, 0), (-30, 0, 0)),
    ((0, 30, 0), (0, -30, 0)),
    ((0, 0, 30), (0, 0, -30))
]
for start, end in tunnel_pairs:
    tunnel = create_tunnel(start, end, radius=18)
    tunnels.append(tunnel)
print(f"✅ トンネル {len(tunnels)}本 完成")

# 鉱石コンテナ（散在）
containers = []
for i in range(15):
    angle = random.uniform(0, math.pi * 2)
    dist = random.uniform(100, 150)
    height = random.uniform(-40, 40)
    pos = (
        math.cos(angle) * dist,
        math.sin(angle) * dist,
        height
    )
    container = create_ore_container(pos, scale=random.uniform(0.8, 1.2))
    containers.append(container)
print(f"✅ 鉱石コンテナ {len(containers)}個 完成")

# 処理プラント
plant = create_processing_plant((0, 0, 100))
print("✅ 鉱石処理プラント完成")

# エクスポート
output_path = '/home/vscode/AirFighter/public/space_mining_colony.glb'
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
    export_apply=True
)

print(f"✅ エクスポート完了: {output_path}")
print("⛏️ 小惑星採掘コロニー生成完了！")
