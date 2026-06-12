import bpy
import math
import random

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# === 高地低木（High Altitude Shrub）===
def create_shrub():
    mat = bpy.data.materials.new(name="Shrub_Mat")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.3, 0.4, 0.25, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 8.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.5

    mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    # 不規則な球体クラスター
    parts = []
    random.seed(123)
    for i in range(5):
        offset_x = random.uniform(-0.5, 0.5)
        offset_y = random.uniform(-0.5, 0.5)
        offset_z = random.uniform(-0.3, 0.5)
        radius = random.uniform(0.4, 0.7)

        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=2,
            radius=radius,
            location=(offset_x, offset_y, offset_z)
        )
        sphere = bpy.context.active_object
        sphere.data.materials.append(mat)
        parts.append(sphere)

    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()

    shrub = bpy.context.active_object
    shrub.name = "Shrub_HighAltitude"
    shrub.location = (0, 0, 0)

    return shrub

# === ジャングル植生（Jungle Vegetation）===
def create_jungle_plant():
    mat = bpy.data.materials.new(name="Jungle_Mat")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.15, 0.45, 0.2, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.8
    bsdf.inputs['Subsurface'].default_value = 0.15
    bsdf.inputs['Subsurface Color'].default_value = (0.2, 0.5, 0.25, 1.0)

    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    # 大きな葉のクラスター
    parts = []
    random.seed(456)
    for i in range(6):
        angle = (i / 6) * math.pi * 2 + random.uniform(-0.3, 0.3)
        distance = random.uniform(0.8, 1.2)
        offset_x = math.cos(angle) * distance
        offset_y = math.sin(angle) * distance
        offset_z = random.uniform(0.5, 1.5)

        # 楕円体（葉）
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=0.6,
            segments=8,
            ring_count=6,
            location=(offset_x, offset_y, offset_z)
        )
        leaf = bpy.context.active_object
        leaf.scale = (1.5, 0.8, 0.2)
        leaf.rotation_euler = (random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5), angle)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
        leaf.data.materials.append(mat)
        parts.append(leaf)

    # 中心の茎
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.1,
        depth=2.0,
        vertices=6,
        location=(0, 0, 1.0)
    )
    stem = bpy.context.active_object
    stem.data.materials.append(mat)
    parts.append(stem)

    bpy.ops.object.select_all(action='DESELECT')
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()

    plant = bpy.context.active_object
    plant.name = "Plant_Jungle"
    plant.location = (0, 0, 0)

    return plant

# === サボテン（Desert Cactus）===
def create_cactus():
    mat = bpy.data.materials.new(name="Cactus_Mat")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.35, 0.5, 0.3, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.7

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 12.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.6

    mat.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    # メイン柱状体
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.4,
        depth=3.5,
        vertices=8,
        location=(0, 0, 1.75)
    )
    main_stem = bpy.context.active_object
    main_stem.data.materials.append(mat)

    # 側面アーム（2本）
    arms = []
    for i, (angle, height) in enumerate([(math.pi/3, 2.0), (-math.pi/4, 1.5)]):
        bpy.ops.mesh.primitive_cylinder_add(
            radius=0.25,
            depth=1.5,
            vertices=8,
            location=(0, 0, height)
        )
        arm = bpy.context.active_object
        arm.rotation_euler = (0, math.radians(70), angle)
        bpy.ops.object.transform_apply(rotation=True)
        arm.data.materials.append(mat)
        arms.append(arm)

    bpy.ops.object.select_all(action='DESELECT')
    main_stem.select_set(True)
    for arm in arms:
        arm.select_set(True)
    bpy.context.view_layer.objects.active = main_stem
    bpy.ops.object.join()

    cactus = bpy.context.active_object
    cactus.name = "Plant_Cactus"
    cactus.location = (0, 0, 0)

    return cactus

# エクスポート
def export_vegetation(func, filename):
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

export_vegetation(create_shrub, "vegetation_shrub.glb")
export_vegetation(create_jungle_plant, "vegetation_jungle.glb")
export_vegetation(create_cactus, "vegetation_cactus.glb")

print("✅ All vegetation generated!")
