#!/usr/bin/env python3
"""
宇宙コロニー建造現場モデル生成スクリプト

Usage:
    blender --background --python generate_construction.py
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
        bsdf.inputs['Emission Strength'].default_value = 1.8

    output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    return mat

# マテリアル定義
mat_frame = create_material('Frame', (0.7, 0.65, 0.55, 1.0), metallic=0.75, roughness=0.45)
mat_scaffold = create_material('Scaffold', (0.85, 0.8, 0.3, 1.0), metallic=0.65, roughness=0.6)
mat_panel = create_material('Panel', (0.6, 0.62, 0.65, 1.0), metallic=0.8, roughness=0.4)
mat_crane = create_material('Crane', (0.95, 0.5, 0.1, 1.0), metallic=0.7, roughness=0.5)
mat_glow_yellow = create_material('GlowYellow', (1.0, 0.9, 0.3, 1.0), metallic=0.2, roughness=0.4,
                                  emissive=(1.0, 0.95, 0.4, 1.0))
mat_glow_green = create_material('GlowGreen', (0.3, 1.0, 0.4, 1.0), metallic=0.2, roughness=0.4,
                                 emissive=(0.4, 1.0, 0.5, 1.0))
mat_welding = create_material('WeldingGlow', (1.0, 0.7, 0.3, 1.0), metallic=0.1, roughness=0.2,
                              emissive=(1.0, 0.8, 0.4, 1.0))

def add_material_to_object(obj, mat):
    """オブジェクトにマテリアルを適用"""
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)

def create_colony_frame_section(location, rotation, section_type='cylinder'):
    """コロニー骨組みセクション"""
    if section_type == 'cylinder':
        # 円筒型セクション
        bpy.ops.mesh.primitive_cylinder_add(
            vertices=12,
            radius=65,
            depth=80,
            location=location
        )
        frame = bpy.context.active_object
        frame.rotation_euler = rotation
    else:
        # 円錐型セクション（先端部）
        bpy.ops.mesh.primitive_cone_add(
            vertices=12,
            radius1=65,
            radius2=30,
            depth=60,
            location=location
        )
        frame = bpy.context.active_object
        frame.rotation_euler = rotation

    frame.name = f'ColonyFrame_{section_type}'
    add_material_to_object(frame, mat_frame)

    # 骨組み内部を空洞化（飛行可能）
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12,
        radius=60,
        depth=85 if section_type == 'cylinder' else 65,
        location=location
    )
    hollow = bpy.context.active_object
    hollow.rotation_euler = rotation

    mod = frame.modifiers.new(name='Hollow', type='BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.object = hollow
    bpy.context.view_layer.objects.active = frame
    bpy.ops.object.modifier_apply(modifier='Hollow')
    bpy.data.objects.remove(hollow, do_unlink=True)

    # 骨組みの縦梁
    rib_count = 12
    for i in range(rib_count):
        angle = (i / rib_count) * math.pi * 2
        rib_start = Vector((
            math.cos(angle) * 62,
            math.sin(angle) * 62,
            -40 if section_type == 'cylinder' else -30
        ))
        rib_end = Vector((
            math.cos(angle) * 62,
            math.sin(angle) * 62,
            40 if section_type == 'cylinder' else 30
        ))

        rib_start.rotate(Euler(rotation))
        rib_end.rotate(Euler(rotation))
        rib_start += Vector(location)
        rib_end += Vector(location)

        # 梁作成
        direction = rib_end - rib_start
        length = direction.length
        rib_center = (rib_start + rib_end) / 2

        bpy.ops.mesh.primitive_cylinder_add(
            radius=2.5,
            depth=length,
            location=rib_center
        )
        rib = bpy.context.active_object
        rib.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
        add_material_to_object(rib, mat_frame)

    # 横梁（リング）
    ring_count = 4 if section_type == 'cylinder' else 3
    for i in range(ring_count):
        z_offset = -30 + (60 / (ring_count - 1)) * i if ring_count > 1 else 0
        ring_pos = Vector((0, 0, z_offset))
        ring_pos.rotate(Euler(rotation))
        ring_pos += Vector(location)

        bpy.ops.mesh.primitive_torus_add(
            major_radius=62,
            minor_radius=2,
            major_segments=48,
            minor_segments=12,
            location=ring_pos
        )
        ring = bpy.context.active_object
        ring.rotation_euler = rotation
        add_material_to_object(ring, mat_frame)

    return frame

def create_scaffolding(location, rotation, width=40, height=60, depth=30):
    """足場構造"""
    # 足場フレーム
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    scaffold = bpy.context.active_object
    scaffold.scale = (width, depth, height)
    scaffold.rotation_euler = rotation
    scaffold.name = 'Scaffolding'
    add_material_to_object(scaffold, mat_scaffold)

    # メッシュ状に変換
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.delete(type='ONLY_FACE')  # 面だけ削除（エッジは残す）
    bpy.ops.object.mode_set(mode='OBJECT')

    # 横梁を追加
    levels = 5
    for i in range(levels):
        level_height = -height / 2 + (height / (levels - 1)) * i
        for j in range(4):
            if j < 2:  # X軸方向
                beam_offset = Vector((0, (1 if j == 0 else -1) * depth / 2, level_height))
            else:  # Y軸方向
                beam_offset = Vector(((1 if j == 2 else -1) * width / 2, 0, level_height))

            beam_offset.rotate(Euler(rotation))
            beam_pos = Vector(location) + beam_offset

            bpy.ops.mesh.primitive_cylinder_add(
                radius=1.5,
                depth=width if j < 2 else depth,
                location=beam_pos
            )
            beam = bpy.context.active_object
            if j < 2:
                beam.rotation_euler = (rotation[0], rotation[1] + math.pi / 2, rotation[2])
            else:
                beam.rotation_euler = rotation
            add_material_to_object(beam, mat_scaffold)

    # 作業灯
    for i in range(4):
        light_offset = Vector((
            (1 if i % 2 == 0 else -1) * width / 2,
            (1 if i < 2 else -1) * depth / 2,
            height / 2
        ))
        light_offset.rotate(Euler(rotation))
        light_pos = Vector(location) + light_offset

        bpy.ops.mesh.primitive_cube_add(size=3, location=light_pos)
        light = bpy.context.active_object
        add_material_to_object(light, mat_glow_yellow)

    return scaffold

def create_construction_crane(location, rotation, height=100):
    """建設クレーン"""
    # クレーンベース
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    base = bpy.context.active_object
    base.scale = (15, 15, 10)
    base.rotation_euler = rotation
    base.name = 'CraneBase'
    add_material_to_object(base, mat_crane)

    # メインタワー
    tower_top = Vector((0, 0, height / 2))
    tower_top.rotate(Euler(rotation))
    tower_pos = Vector(location) + tower_top

    bpy.ops.mesh.primitive_cylinder_add(
        radius=4,
        depth=height,
        location=tower_pos
    )
    tower = bpy.context.active_object
    tower.rotation_euler = rotation
    add_material_to_object(tower, mat_crane)

    # ジブ（横アーム）
    jib_length = 80
    jib_offset = Vector((jib_length / 2, 0, height))
    jib_offset.rotate(Euler(rotation))
    jib_pos = Vector(location) + jib_offset

    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=jib_pos
    )
    jib = bpy.context.active_object
    jib.scale = (jib_length, 3, 3)
    jib.rotation_euler = rotation
    add_material_to_object(jib, mat_crane)

    # カウンターウェイト
    counter_offset = Vector((-25, 0, height))
    counter_offset.rotate(Euler(rotation))
    counter_pos = Vector(location) + counter_offset

    bpy.ops.mesh.primitive_cube_add(
        size=12,
        location=counter_pos
    )
    counter = bpy.context.active_object
    counter.rotation_euler = rotation
    add_material_to_object(counter, mat_frame)

    # フック（吊り下げ）
    hook_offset = Vector((30, 0, height - 20))
    hook_offset.rotate(Euler(rotation))
    hook_pos = Vector(location) + hook_offset

    # ワイヤー
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.5,
        depth=20,
        location=(hook_pos[0], hook_pos[1], hook_pos[2] - 10)
    )
    wire = bpy.context.active_object
    wire.rotation_euler = rotation
    add_material_to_object(wire, mat_frame)

    # フック本体
    bpy.ops.mesh.primitive_torus_add(
        major_radius=3,
        minor_radius=1,
        location=hook_pos
    )
    hook = bpy.context.active_object
    hook.rotation_euler = (rotation[0] + math.pi / 2, rotation[1], rotation[2])
    add_material_to_object(hook, mat_crane)

    # クレーン照明
    for i in range(4):
        angle = (i / 4) * math.pi * 2
        light_offset = Vector((
            math.cos(angle) * 3,
            math.sin(angle) * 3,
            height + 5
        ))
        light_offset.rotate(Euler(rotation))
        light_pos = Vector(location) + light_offset

        bpy.ops.mesh.primitive_cube_add(size=2, location=light_pos)
        light = bpy.context.active_object
        add_material_to_object(light, mat_glow_yellow)

    return base

def create_panel_stack(location, count=8):
    """建材パネルの山"""
    panels = []

    for i in range(count):
        offset = Vector((
            random.uniform(-5, 5),
            random.uniform(-5, 5),
            i * 2 + random.uniform(-0.5, 0.5)
        ))
        panel_pos = Vector(location) + offset

        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=panel_pos
        )
        panel = bpy.context.active_object
        panel.scale = (25, 18, 1.5)
        panel.rotation_euler = (
            random.uniform(-0.1, 0.1),
            random.uniform(-0.1, 0.1),
            random.uniform(0, math.pi * 2)
        )
        add_material_to_object(panel, mat_panel)
        panels.append(panel)

    return panels

def create_work_ship(location, rotation):
    """作業船（溶接・組立用）"""
    # 船体
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=location
    )
    ship = bpy.context.active_object
    ship.scale = (20, 12, 8)
    ship.rotation_euler = rotation
    ship.name = 'WorkShip'
    add_material_to_object(ship, mat_crane)

    # コックピット
    cockpit_offset = Vector((12, 0, 3))
    cockpit_offset.rotate(Euler(rotation))
    cockpit_pos = Vector(location) + cockpit_offset

    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=5,
        segments=16,
        ring_count=8,
        location=cockpit_pos
    )
    cockpit = bpy.context.active_object
    add_material_to_object(cockpit, mat_glow_green)

    # 溶接アーム
    for i in range(2):
        side = 1 if i == 0 else -1
        arm_offset = Vector((8, side * 8, -2))
        arm_offset.rotate(Euler(rotation))
        arm_pos = Vector(location) + arm_offset

        bpy.ops.mesh.primitive_cylinder_add(
            radius=1.5,
            depth=15,
            location=arm_pos
        )
        arm = bpy.context.active_object
        arm.rotation_euler = rotation
        add_material_to_object(arm, mat_frame)

        # 溶接トーチ（発光）
        torch_offset = Vector((8, 0, 0))
        torch_offset.rotate(Euler(rotation))
        torch_pos = Vector(arm_pos) + torch_offset

        bpy.ops.mesh.primitive_cone_add(
            radius1=2,
            radius2=0.5,
            depth=4,
            location=torch_pos
        )
        torch = bpy.context.active_object
        torch.rotation_euler = (rotation[0], rotation[1] + math.pi / 2, rotation[2])
        add_material_to_object(torch, mat_welding)

    # スラスター
    for i in range(4):
        angle = (i / 4) * math.pi * 2
        thruster_offset = Vector((
            -12,
            math.cos(angle) * 5,
            math.sin(angle) * 3
        ))
        thruster_offset.rotate(Euler(rotation))
        thruster_pos = Vector(location) + thruster_offset

        bpy.ops.mesh.primitive_cylinder_add(
            radius=1.5,
            depth=3,
            location=thruster_pos
        )
        thruster = bpy.context.active_object
        thruster.rotation_euler = (rotation[0], rotation[1] + math.pi / 2, rotation[2])
        add_material_to_object(thruster, mat_glow_green)

    return ship

def create_tunnel_framework(start, end, radius=18, segments=8):
    """トンネル骨組み（飛行可能）"""
    direction = Vector(end) - Vector(start)
    length = direction.length

    tunnel_segments = []

    for i in range(segments):
        t = i / segments
        seg_pos = Vector(start).lerp(Vector(end), t + 0.5 / segments)

        bpy.ops.mesh.primitive_torus_add(
            major_radius=radius,
            minor_radius=2,
            major_segments=32,
            minor_segments=12,
            location=seg_pos
        )
        seg = bpy.context.active_object

        # 方向を合わせる
        direction_norm = direction.normalized()
        seg.rotation_euler = direction_norm.to_track_quat('Z', 'Y').to_euler()

        add_material_to_object(seg, mat_frame)
        tunnel_segments.append(seg)

        # セグメントごとに照明
        for j in range(4):
            angle = (j / 4) * math.pi * 2
            light_local = Vector((
                math.cos(angle) * (radius * 0.95),
                math.sin(angle) * (radius * 0.95),
                0
            ))
            light_local.rotate(seg.rotation_euler)
            light_pos = Vector(seg_pos) + light_local

            bpy.ops.mesh.primitive_cube_add(size=2, location=light_pos)
            light = bpy.context.active_object
            add_material_to_object(light, mat_glow_yellow)

    return tunnel_segments

# ===== メイン生成 =====
print("🏗️ 宇宙コロニー建造現場を生成中...")

# コロニー骨組み（中央）
frame_sections = []
section_positions = [
    ((0, 0, -80), (0, 0, 0), 'cylinder'),
    ((0, 0, 0), (0, 0, 0), 'cylinder'),
    ((0, 0, 80), (0, 0, 0), 'cylinder'),
    ((0, 0, 150), (0, 0, 0), 'cone'),
]
for pos, rot, sec_type in section_positions:
    section = create_colony_frame_section(pos, rot, section_type=sec_type)
    frame_sections.append(section)
print(f"✅ コロニー骨組み {len(frame_sections)}セクション 完成")

# 足場（各セクションに配置）
scaffolds = []
for i in range(8):
    angle = (i / 8) * math.pi * 2
    scaffold_pos = (
        math.cos(angle) * 75,
        math.sin(angle) * 75,
        random.uniform(-60, 100)
    )
    rot = (0, 0, angle)

    scaffold = create_scaffolding(scaffold_pos, rot, width=35, height=50, depth=25)
    scaffolds.append(scaffold)
print(f"✅ 足場 {len(scaffolds)}基 完成")

# 建設クレーン
cranes = []
crane_positions = [
    ((80, 80, -50), (0, 0, -math.pi / 4)),
    ((-90, 70, 0), (0, 0, math.pi * 0.75)),
    ((70, -85, 50), (0, 0, -math.pi * 0.6)),
]
for pos, rot in crane_positions:
    crane = create_construction_crane(pos, rot, height=random.uniform(90, 120))
    cranes.append(crane)
print(f"✅ 建設クレーン {len(cranes)}基 完成")

# 建材パネルの山
panel_stacks = []
for i in range(6):
    angle = (i / 6) * math.pi * 2
    stack_pos = (
        math.cos(angle) * 110,
        math.sin(angle) * 110,
        random.uniform(-70, 70)
    )
    panels = create_panel_stack(stack_pos, count=random.randint(6, 10))
    panel_stacks.extend(panels)
print(f"✅ 建材パネル {len(panel_stacks)}枚 完成")

# 作業船
work_ships = []
for i in range(5):
    angle = random.uniform(0, math.pi * 2)
    dist = random.uniform(60, 90)
    height = random.uniform(-50, 100)

    ship_pos = (
        math.cos(angle) * dist,
        math.sin(angle) * dist,
        height
    )
    rot = (
        random.uniform(-0.3, 0.3),
        random.uniform(-0.3, 0.3),
        angle + random.uniform(-0.5, 0.5)
    )

    ship = create_work_ship(ship_pos, rot)
    work_ships.append(ship)
print(f"✅ 作業船 {len(work_ships)}隻 完成")

# トンネル骨組み（飛行ルート）
tunnels = []
tunnel_pairs = [
    ((0, 0, -120), (0, 0, -40)),
    ((0, 0, 40), (0, 0, 120)),
    ((-70, 0, 0), (70, 0, 0)),
    ((0, -70, 50), (0, 70, 50)),
]
for start, end in tunnel_pairs:
    segments = create_tunnel_framework(start, end, radius=22, segments=6)
    tunnels.extend(segments)
print(f"✅ トンネル骨組み {len(tunnels)}セグメント 完成")

# エクスポート
output_path = '/home/vscode/AirFighter/public/space_construction.glb'
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
    export_apply=True
)

print(f"✅ エクスポート完了: {output_path}")
print("🏗️ 宇宙コロニー建造現場生成完了！")
