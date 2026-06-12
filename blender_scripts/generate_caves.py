import bpy
import math
import random

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# === 洞窟チャンバー（Chamber）===
def create_cave_chamber(size="medium"):
    sizes = {
        "small": 30,
        "medium": 50,
        "large": 80
    }
    radius = sizes.get(size, 50)

    mat = bpy.data.materials.new(name="Cave_Rock")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.25, 0.22, 0.20, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.95

    # 詳細なノーマルマップ
    noise1 = nodes.new('ShaderNodeTexNoise')
    noise1.inputs['Scale'].default_value = 5.0
    noise1.inputs['Detail'].default_value = 8.0

    noise2 = nodes.new('ShaderNodeTexNoise')
    noise2.inputs['Scale'].default_value = 20.0
    noise2.inputs['Detail'].default_value = 4.0

    mix = nodes.new('ShaderNodeMixRGB')
    mix.blend_type = 'ADD'
    mix.inputs['Fac'].default_value = 0.5

    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.8

    mat.node_tree.links.new(noise1.outputs['Fac'], mix.inputs['Color1'])
    mat.node_tree.links.new(noise2.outputs['Fac'], mix.inputs['Color2'])
    mat.node_tree.links.new(mix.outputs['Color'], bump.inputs['Height'])
    mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    # UV球（有機的な空間）
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=radius,
        segments=32,
        ring_count=16,
        location=(0, 0, 0)
    )
    chamber = bpy.context.active_object
    chamber.name = f"Cave_Chamber_{size}"

    # サブディビジョン + ディスプレイスメント
    bpy.ops.object.modifier_add(type='SUBSURF')
    chamber.modifiers["Subdivision"].levels = 2

    bpy.ops.object.modifier_add(type='DISPLACE')
    disp_mod = chamber.modifiers["Displace"]

    # ディスプレイス用テクスチャ
    tex = bpy.data.textures.new(name="Displace_Tex", type='VORONOI')
    tex.noise_scale = 2.0
    disp_mod.texture = tex
    disp_mod.strength = radius * 0.15

    bpy.ops.object.modifier_apply(modifier="Subdivision")
    bpy.ops.object.modifier_apply(modifier="Displace")

    chamber.data.materials.append(mat)

    # 鍾乳石（stalactites）をランダム配置
    random.seed(789)
    stalactites = []
    for i in range(int(radius / 5)):
        angle_h = random.uniform(0, math.pi * 2)
        angle_v = random.uniform(-math.pi/3, math.pi/3)

        distance = radius * random.uniform(0.7, 0.95)
        x = distance * math.cos(angle_h) * math.cos(angle_v)
        y = distance * math.sin(angle_h) * math.cos(angle_v)
        z = distance * math.sin(angle_v)

        length = random.uniform(3, 8)
        bpy.ops.mesh.primitive_cone_add(
            vertices=6,
            radius1=0.8,
            radius2=0.1,
            depth=length,
            location=(x, y, z)
        )
        stalactite = bpy.context.active_object

        # 天井から垂れ下がる向きに
        direction = bpy.context.scene.cursor.location - stalactite.location
        stalactite.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()

        stalactite.data.materials.append(mat)
        stalactites.append(stalactite)

    # 全体結合
    bpy.ops.object.select_all(action='DESELECT')
    chamber.select_set(True)
    for stal in stalactites:
        stal.select_set(True)
    bpy.context.view_layer.objects.active = chamber
    bpy.ops.object.join()

    chamber = bpy.context.active_object
    chamber.location = (0, 0, 0)

    return chamber

# === 洞窟トンネル（Tunnel）===
def create_cave_tunnel(length_type="medium"):
    lengths = {
        "short": 60,
        "medium": 100,
        "long": 150
    }
    length = lengths.get(length_type, 100)

    mat = bpy.data.materials.new(name="Tunnel_Rock")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.22, 0.20, 0.18, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.98

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 15.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.7

    mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    # 円柱をベースに
    bpy.ops.mesh.primitive_cylinder_add(
        radius=12,
        depth=length,
        vertices=16,
        location=(0, 0, 0)
    )
    tunnel = bpy.context.active_object
    tunnel.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    tunnel.name = f"Cave_Tunnel_{length_type}"

    # サブディビジョン
    bpy.ops.object.modifier_add(type='SUBSURF')
    tunnel.modifiers["Subdivision"].levels = 2

    # ディスプレイスメント
    bpy.ops.object.modifier_add(type='DISPLACE')
    disp_mod = tunnel.modifiers["Displace"]

    tex = bpy.data.textures.new(name="Tunnel_Displace", type='CLOUDS')
    tex.noise_scale = 1.5
    disp_mod.texture = tex
    disp_mod.strength = 3.0

    bpy.ops.object.modifier_apply(modifier="Subdivision")
    bpy.ops.object.modifier_apply(modifier="Displace")

    tunnel.data.materials.append(mat)

    return tunnel

# エクスポート
def export_cave(func, filename, *args):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    obj = func(*args)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    filepath = f"/home/vscode/AirFighter/public/models/{filename}"
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_materials='EXPORT'
    )
    print(f"✅ Exported: {filename}")

# チャンバー3サイズ
export_cave(create_cave_chamber, "cave_chamber_small.glb", "small")
export_cave(create_cave_chamber, "cave_chamber_medium.glb", "medium")
export_cave(create_cave_chamber, "cave_chamber_large.glb", "large")

# トンネル3長さ
export_cave(create_cave_tunnel, "cave_tunnel_short.glb", "short")
export_cave(create_cave_tunnel, "cave_tunnel_medium.glb", "medium")
export_cave(create_cave_tunnel, "cave_tunnel_long.glb", "long")

print("✅ All cave structures generated!")
