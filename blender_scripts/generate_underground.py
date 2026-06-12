import bpy
import math

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# === 地下神殿（Underground Temple）===
def create_underground_temple():
    mat_stone = bpy.data.materials.new(name="Ancient_Stone")
    mat_stone.use_nodes = True
    nodes = mat_stone.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.35, 0.32, 0.28, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 10.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.5

    mat_stone.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat_stone.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mat_stone.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    # メインホール
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(0, 0, 15)
    )
    hall = bpy.context.active_object
    hall.scale = (30, 20, 15)
    bpy.ops.object.transform_apply(scale=True)
    hall.data.materials.append(mat_stone)

    # 柱 x4
    pillars = []
    for x, y in [(-20, -10), (20, -10), (-20, 10), (20, 10)]:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=3,
            depth=28,
            vertices=8,
            location=(x, y, 14)
        )
        pillar = bpy.context.active_object
        pillar.data.materials.append(mat_stone)
        pillars.append(pillar)

    # 祭壇
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(0, -15, 5)
    )
    altar = bpy.context.active_object
    altar.scale = (8, 6, 5)
    bpy.ops.object.transform_apply(scale=True)
    altar.data.materials.append(mat_stone)

    # 階段
    stairs = []
    for i in range(5):
        bpy.ops.mesh.primitive_cube_add(
            size=1,
            location=(0, -5 + i * 2, i * 1)
        )
        stair = bpy.context.active_object
        stair.scale = (10, 2, 1)
        bpy.ops.object.transform_apply(scale=True)
        stair.data.materials.append(mat_stone)
        stairs.append(stair)

    # 結合
    bpy.ops.object.select_all(action='DESELECT')
    hall.select_set(True)
    for obj in pillars + stairs + [altar]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = hall
    bpy.ops.object.join()

    temple = bpy.context.active_object
    temple.name = "Underground_Temple"
    temple.location = (0, 0, 0)

    return temple

# === バンカー（Bunker）===
def create_bunker():
    mat_concrete = bpy.data.materials.new(name="Concrete")
    mat_concrete.use_nodes = True
    nodes = mat_concrete.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.4, 0.4, 0.38, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.85

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 25.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.3

    mat_concrete.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat_concrete.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mat_concrete.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    # メイン構造
    bpy.ops.mesh.primitive_cube_add(
        size=1,
        location=(0, 0, 8)
    )
    main_body = bpy.context.active_object
    main_body.scale = (25, 20, 8)
    bpy.ops.object.transform_apply(scale=True)
    main_body.data.materials.append(mat_concrete)

    # 入口トンネル
    bpy.ops.mesh.primitive_cylinder_add(
        radius=4,
        depth=30,
        vertices=12,
        location=(0, 25, 8)
    )
    entrance = bpy.context.active_object
    entrance.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    entrance.data.materials.append(mat_concrete)

    # 換気塔
    vents = []
    for x in [-10, 10]:
        bpy.ops.mesh.primitive_cylinder_add(
            radius=1.5,
            depth=12,
            vertices=8,
            location=(x, 0, 20)
        )
        vent = bpy.context.active_object
        vent.data.materials.append(mat_concrete)
        vents.append(vent)

    # 結合
    bpy.ops.object.select_all(action='DESELECT')
    main_body.select_set(True)
    entrance.select_set(True)
    for vent in vents:
        vent.select_set(True)
    bpy.context.view_layer.objects.active = main_body
    bpy.ops.object.join()

    bunker = bpy.context.active_object
    bunker.name = "Underground_Bunker"
    bunker.location = (0, 0, 0)

    return bunker

# === 地下湖（Underground Lake Platform）===
def create_underground_lake_platform():
    mat_rock = bpy.data.materials.new(name="Lake_Rock")
    mat_rock.use_nodes = True
    nodes = mat_rock.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.28, 0.26, 0.24, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.95

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 8.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6

    mat_rock.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat_rock.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mat_rock.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    # 円形プラットフォーム
    bpy.ops.mesh.primitive_cylinder_add(
        radius=40,
        depth=3,
        vertices=32,
        location=(0, 0, 1.5)
    )
    platform = bpy.context.active_object

    # サブディビジョン + ディスプレイスメント
    bpy.ops.object.modifier_add(type='SUBSURF')
    platform.modifiers["Subdivision"].levels = 1

    bpy.ops.object.modifier_add(type='DISPLACE')
    disp_mod = platform.modifiers["Displace"]
    tex = bpy.data.textures.new(name="Platform_Disp", type='VORONOI')
    tex.noise_scale = 3.0
    disp_mod.texture = tex
    disp_mod.strength = 2.0

    bpy.ops.object.modifier_apply(modifier="Subdivision")
    bpy.ops.object.modifier_apply(modifier="Displace")

    platform.data.materials.append(mat_rock)
    platform.name = "Underground_Lake_Platform"

    return platform

# エクスポート
def export_underground(func, filename):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    obj = func()
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

export_underground(create_underground_temple, "underground_temple.glb")
export_underground(create_bunker, "underground_bunker.glb")
export_underground(create_underground_lake_platform, "underground_lake_platform.glb")

print("✅ All underground structures generated!")
