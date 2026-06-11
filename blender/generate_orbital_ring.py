#!/usr/bin/env python3
"""
軌道リング都市モデル生成スクリプト

Usage:
    blender --background --python generate_orbital_ring.py
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
        bsdf.inputs['Emission Strength'].default_value = 1.5

    output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    return mat

# マテリアル定義
mat_ring_structure = create_material('RingStructure', (0.55, 0.58, 0.62, 1.0), metallic=0.85, roughness=0.35)
mat_habitat = create_material('Habitat', (0.35, 0.4, 0.45, 1.0), metallic=0.6, roughness=0.5)
mat_glass = create_material('Glass', (0.8, 0.85, 0.9, 1.0), metallic=0.1, roughness=0.05)
mat_glow_white = create_material('GlowWhite', (0.9, 0.95, 1.0, 1.0), metallic=0.2, roughness=0.3,
                                 emissive=(0.9, 0.95, 1.0, 1.0))
mat_glow_cyan = create_material('GlowCyan', (0.3, 0.8, 1.0, 1.0), metallic=0.2, roughness=0.3,
                                emissive=(0.3, 0.9, 1.0, 1.0))
mat_bridge = create_material('Bridge', (0.65, 0.55, 0.4, 1.0), metallic=0.75, roughness=0.45)

def add_material_to_object(obj, mat):
    """オブジェクトにマテリアルを適用"""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

def create_main_ring(center, radius=180, thickness=15, segments=64):
    """メインリング構造（トーラス）"""
    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius,
        minor_radius=thickness,
        major_segments=segments,
        minor_segments=24,
        location=center
    )
    ring = bpy.context.active_object
    ring.name = 'MainOrbitalRing'
    ring.rotation_euler = (math.pi / 2, 0, 0)  # 水平に配置
    add_material_to_object(ring, mat_ring_structure)

    # リングの内側にライトライン
    for i in range(segments):
        angle = (i / segments) * math.pi * 2
        light_pos = (
            center[0] + math.cos(angle) * (radius - thickness * 0.8),
            center[1] + math.sin(angle) * (radius - thickness * 0.8),
            center[2]
        )
        bpy.ops.mesh.primitive_cube_add(size=2, location=light_pos)
        light = bpy.context.active_object
        add_material_to_object(light, mat_glow_cyan)

    return ring

def create_habitat_module(location, rotation, scale=1.0):
    """居住モジュール（リング表面）"""
    # モジュール本体
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    module = bpy.context.active_object
    module.scale = (25 * scale, 18 * scale, 12 * scale)
    module.rotation_euler = rotation
    module.name = 'HabitatModule'
    add_material_to_object(module, mat_habitat)

    # 窓（ガラス部分）
    for i in range(5):
        window_offset = Vector((-10 * scale + i * 5 * scale, 0, 7 * scale))
        window_offset.rotate(Euler(rotation))
        window_pos = Vector(location) + window_offset

        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=window_pos
        )
        window = bpy.context.active_object
        window.scale = (3 * scale, 18 * scale, 4 * scale)
        window.rotation_euler = rotation
        add_material_to_object(window, mat_glass)

    # アンテナ
    antenna_offset = Vector((0, 0, 8 * scale))
    antenna_offset.rotate(Euler(rotation))
    antenna_pos = Vector(location) + antenna_offset

    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.5 * scale,
        depth=6 * scale,
        location=antenna_pos
    )
    antenna = bpy.context.active_object
    antenna.rotation_euler = rotation
    add_material_to_object(antenna, mat_bridge)

    return module

def create_connecting_bridge(start, end, width=8):
    """接続ブリッジ"""
    direction = Vector(end) - Vector(start)
    length = direction.length
    center = (Vector(start) + Vector(end)) / 2

    # ブリッジ本体
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=center
    )
    bridge = bpy.context.active_object
    bridge.scale = (length, width, width * 0.6)
    bridge.name = 'ConnectingBridge'

    # 方向を合わせる
    direction.normalize()
    up = Vector((0, 0, 1))
    if abs(direction.dot(up)) > 0.99:
        up = Vector((1, 0, 0))
    right = direction.cross(up).normalized()
    up = right.cross(direction).normalized()

    rot_matrix = Matrix([right, up, direction]).transposed().to_4x4()
    bridge.rotation_euler = rot_matrix.to_euler()

    add_material_to_object(bridge, mat_bridge)

    # ブリッジのライトライン
    for i in range(int(length / 10)):
        t = (i + 0.5) / int(length / 10)
        light_pos = Vector(start).lerp(Vector(end), t)

        bpy.ops.mesh.primitive_cube_add(size=2, location=light_pos)
        light = bpy.context.active_object
        add_material_to_object(light, mat_glow_white)

    return bridge

def create_tower(base_location, height=60, rotation=0):
    """タワー（リングから垂直に伸びる）"""
    # タワー本体
    bpy.ops.mesh.primitive_cylinder_add(
        radius=8,
        depth=height,
        location=(base_location[0], base_location[1], base_location[2] + height / 2)
    )
    tower = bpy.context.active_object
    tower.name = 'Tower'
    add_material_to_object(tower, mat_ring_structure)

    # タワートップ（展望台）
    top_pos = (base_location[0], base_location[1], base_location[2] + height)
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=12,
        segments=16,
        ring_count=8,
        location=top_pos
    )
    top = bpy.context.active_object
    add_material_to_object(top, mat_glass)

    # 展望台の照明
    for i in range(8):
        angle = (i / 8) * math.pi * 2
        light_pos = (
            top_pos[0] + math.cos(angle) * 10,
            top_pos[1] + math.sin(angle) * 10,
            top_pos[2]
        )
        bpy.ops.mesh.primitive_cube_add(size=2, location=light_pos)
        light = bpy.context.active_object
        add_material_to_object(light, mat_glow_white)

    # タワーの中間照明
    for i in range(int(height / 15)):
        light_height = base_location[2] + 10 + i * 15
        for j in range(4):
            angle = (j / 4) * math.pi * 2 + rotation
            light_pos = (
                base_location[0] + math.cos(angle) * 7,
                base_location[1] + math.sin(angle) * 7,
                light_height
            )
            bpy.ops.mesh.primitive_cube_add(size=1.5, location=light_pos)
            light = bpy.context.active_object
            add_material_to_object(light, mat_glow_cyan)

    return tower

def create_tunnel_segment(center, angle_start, angle_end, radius, tunnel_radius=12):
    """トンネルセグメント（リング内部の交通路）"""
    segments = 16
    angle_step = (angle_end - angle_start) / segments

    tunnel_segments = []
    for i in range(segments):
        angle1 = angle_start + i * angle_step
        angle2 = angle_start + (i + 1) * angle_step

        pos1 = (
            center[0] + math.cos(angle1) * radius,
            center[1] + math.sin(angle1) * radius,
            center[2]
        )
        pos2 = (
            center[0] + math.cos(angle2) * radius,
            center[1] + math.sin(angle2) * radius,
            center[2]
        )

        # セグメント作成
        direction = Vector(pos2) - Vector(pos1)
        length = direction.length
        seg_center = (Vector(pos1) + Vector(pos2)) / 2

        bpy.ops.mesh.primitive_cylinder_add(
            radius=tunnel_radius,
            depth=length,
            location=seg_center
        )
        segment = bpy.context.active_object

        # 方向を合わせる
        direction.normalize()
        segment.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()

        add_material_to_object(segment, mat_glass)

        # トンネル内のライト
        for j in range(3):
            light_angle = (j / 3) * math.pi * 2
            light_offset = Vector((
                math.cos(light_angle) * (tunnel_radius * 0.9),
                math.sin(light_angle) * (tunnel_radius * 0.9),
                0
            ))
            light_offset.rotate(segment.rotation_euler)
            light_pos = Vector(seg_center) + light_offset

            bpy.ops.mesh.primitive_cylinder_add(
                radius=1,
                depth=length * 0.95,
                location=light_pos
            )
            light = bpy.context.active_object
            light.rotation_euler = segment.rotation_euler
            add_material_to_object(light, mat_glow_cyan)

        tunnel_segments.append(segment)

    return tunnel_segments

def create_docking_bay(location, rotation):
    """ドッキングベイ（船舶の出入り口）"""
    # ベイ構造
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    bay = bpy.context.active_object
    bay.scale = (35, 30, 20)
    bay.rotation_euler = rotation
    bay.name = 'DockingBay'
    add_material_to_object(bay, mat_habitat)

    # 開口部（入口）
    opening_offset = Vector((20, 0, 0))
    opening_offset.rotate(Euler(rotation))
    opening_pos = Vector(location) + opening_offset

    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=opening_pos
    )
    opening = bpy.context.active_object
    opening.scale = (12, 22, 16)
    opening.rotation_euler = rotation

    mod = bay.modifiers.new(name='Opening', type='BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = opening
    bpy.context.view_layer.objects.active = bay
    bpy.ops.object.modifier_apply(modifier='Opening')
    bpy.data.objects.remove(opening, do_unlink=True)

    # ドッキングライト（誘導灯）
    for i in range(6):
        for j in range(2):
            side = 1 if j == 0 else -1
            light_offset = Vector((15 + i * 3, side * 10, 0))
            light_offset.rotate(Euler(rotation))
            light_pos = Vector(location) + light_offset

            bpy.ops.mesh.primitive_cube_add(size=2, location=light_pos)
            light = bpy.context.active_object
            add_material_to_object(light, mat_glow_cyan if i % 2 == 0 else mat_glow_white)

    return bay

def create_radial_spokes(center, radius, count=8, length=60):
    """放射状スポーク（リングから中心へ）"""
    spokes = []

    for i in range(count):
        angle = (i / count) * math.pi * 2

        start_pos = (
            center[0] + math.cos(angle) * radius,
            center[1] + math.sin(angle) * radius,
            center[2]
        )
        end_pos = (
            center[0] + math.cos(angle) * length,
            center[1] + math.sin(angle) * length,
            center[2]
        )

        direction = Vector(end_pos) - Vector(start_pos)
        spoke_length = direction.length
        spoke_center = (Vector(start_pos) + Vector(end_pos)) / 2

        bpy.ops.mesh.primitive_cylinder_add(
            radius=4,
            depth=spoke_length,
            location=spoke_center
        )
        spoke = bpy.context.active_object
        spoke.name = f'RadialSpoke_{i}'

        # 方向を合わせる
        direction.normalize()
        spoke.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()

        add_material_to_object(spoke, mat_bridge)
        spokes.append(spoke)

    return spokes

# ===== メイン生成 =====
print("🌌 軌道リング都市を生成中...")

center = (0, 0, 0)
ring_radius = 180
ring_thickness = 15

# メインリング
main_ring = create_main_ring(center, radius=ring_radius, thickness=ring_thickness, segments=64)
print("✅ メインリング完成")

# 居住モジュール（リング外周に配置）
modules = []
module_count = 24
for i in range(module_count):
    angle = (i / module_count) * math.pi * 2
    module_radius = ring_radius + ring_thickness + 10

    pos = (
        center[0] + math.cos(angle) * module_radius,
        center[1] + math.sin(angle) * module_radius,
        center[2]
    )
    rot = (0, 0, angle + math.pi / 2)

    module = create_habitat_module(pos, rot, scale=random.uniform(0.9, 1.1))
    modules.append(module)
print(f"✅ 居住モジュール {len(modules)}個 完成")

# タワー（主要ポイント）
towers = []
tower_count = 6
for i in range(tower_count):
    angle = (i / tower_count) * math.pi * 2
    tower_base = (
        center[0] + math.cos(angle) * ring_radius,
        center[1] + math.sin(angle) * ring_radius,
        center[2]
    )
    tower = create_tower(tower_base, height=random.uniform(50, 80), rotation=angle)
    towers.append(tower)
print(f"✅ タワー {len(towers)}基 完成")

# 接続ブリッジ（リング横断）
bridges = []
bridge_pairs = [
    (0, math.pi),
    (math.pi / 2, math.pi * 1.5),
    (math.pi / 4, math.pi * 1.25),
]
for angle1, angle2 in bridge_pairs:
    start = (
        center[0] + math.cos(angle1) * (ring_radius - ring_thickness),
        center[1] + math.sin(angle1) * (ring_radius - ring_thickness),
        center[2]
    )
    end = (
        center[0] + math.cos(angle2) * (ring_radius - ring_thickness),
        center[1] + math.sin(angle2) * (ring_radius - ring_thickness),
        center[2]
    )
    bridge = create_connecting_bridge(start, end, width=10)
    bridges.append(bridge)
print(f"✅ 接続ブリッジ {len(bridges)}本 完成")

# トンネルセグメント（リング内部の交通路）
tunnels = []
tunnel_sections = [
    (0, math.pi / 2),
    (math.pi / 2, math.pi),
    (math.pi, math.pi * 1.5),
    (math.pi * 1.5, math.pi * 2),
]
for start_angle, end_angle in tunnel_sections:
    segments = create_tunnel_segment(center, start_angle, end_angle, ring_radius - ring_thickness * 0.5, tunnel_radius=10)
    tunnels.extend(segments)
print(f"✅ トンネルセグメント {len(tunnels)}個 完成")

# ドッキングベイ
bays = []
bay_count = 4
for i in range(bay_count):
    angle = (i / bay_count) * math.pi * 2 + math.pi / 8
    bay_pos = (
        center[0] + math.cos(angle) * (ring_radius + ring_thickness + 25),
        center[1] + math.sin(angle) * (ring_radius + ring_thickness + 25),
        center[2]
    )
    rot = (0, 0, angle + math.pi / 2)

    bay = create_docking_bay(bay_pos, rot)
    bays.append(bay)
print(f"✅ ドッキングベイ {len(bays)}個 完成")

# 放射状スポーク
spokes = create_radial_spokes(center, ring_radius - ring_thickness, count=8, length=50)
print(f"✅ 放射状スポーク {len(spokes)}本 完成")

# エクスポート
output_path = '/home/vscode/AirFighter/public/space_orbital_ring.glb'
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
    export_apply=True
)

print(f"✅ エクスポート完了: {output_path}")
print("🌌 軌道リング都市生成完了！")
