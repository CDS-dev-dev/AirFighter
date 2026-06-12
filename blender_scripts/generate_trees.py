import bpy
import math
import random

# シーンクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# === 落葉樹（Deciduous Tree）===
def create_deciduous_tree():
    # 幹
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.4,
        depth=5.2,
        vertices=8,
        location=(0, 0, 2.6)
    )
    trunk = bpy.context.active_object
    trunk.name = "Trunk"

    # マテリアル: 樹皮
    mat_trunk = bpy.data.materials.new(name="Bark")
    mat_trunk.use_nodes = True
    nodes = mat_trunk.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.42, 0.27, 0.14, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9

    # ノーマルマップ（手続き的バンプ）
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 15.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.3

    mat_trunk.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat_trunk.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mat_trunk.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    trunk.data.materials.append(mat_trunk)

    # 葉冠（複数球体で有機的に）
    mat_foliage = bpy.data.materials.new(name="Foliage")
    mat_foliage.use_nodes = True
    nodes_f = mat_foliage.node_tree.nodes
    nodes_f.clear()

    output_f = nodes_f.new('ShaderNodeOutputMaterial')
    bsdf_f = nodes_f.new('ShaderNodeBsdfPrincipled')
    bsdf_f.inputs['Base Color'].default_value = (0.2, 0.5, 0.15, 1.0)
    bsdf_f.inputs['Roughness'].default_value = 0.8
    bsdf_f.inputs['Subsurface'].default_value = 0.1
    bsdf_f.inputs['Subsurface Color'].default_value = (0.3, 0.6, 0.2, 1.0)

    mat_foliage.node_tree.links.new(bsdf_f.outputs['BSDF'], output_f.inputs['Surface'])

    # 葉冠: 8個の球体をクラスター配置
    foliage_parts = []
    random.seed(42)
    for i in range(8):
        angle = (i / 8) * math.pi * 2
        offset_x = math.cos(angle) * 1.2 + random.uniform(-0.3, 0.3)
        offset_y = math.sin(angle) * 1.2 + random.uniform(-0.3, 0.3)
        offset_z = 5.8 + random.uniform(-0.5, 0.8)

        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=1.8,
            segments=12,
            ring_count=8,
            location=(offset_x, offset_y, offset_z)
        )
        sphere = bpy.context.active_object
        sphere.data.materials.append(mat_foliage)
        foliage_parts.append(sphere)

    # 全体を結合
    bpy.ops.object.select_all(action='DESELECT')
    trunk.select_set(True)
    for part in foliage_parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = trunk
    bpy.ops.object.join()

    tree = bpy.context.active_object
    tree.name = "Tree_Deciduous"
    tree.location = (0, 0, 0)

    return tree

# === 針葉樹（Conifer Tree）===
def create_conifer_tree():
    # 幹
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.35,
        depth=8.0,
        vertices=8,
        location=(0, 0, 4.0)
    )
    trunk = bpy.context.active_object
    trunk.name = "Trunk_Conifer"

    mat_trunk = bpy.data.materials.new(name="Bark_Dark")
    mat_trunk.use_nodes = True
    nodes = mat_trunk.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.3, 0.2, 0.12, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.95

    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 20.0
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.4

    mat_trunk.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    mat_trunk.node_tree.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    mat_trunk.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    trunk.data.materials.append(mat_trunk)

    # 針葉（円錐形の層）
    mat_needles = bpy.data.materials.new(name="Needles")
    mat_needles.use_nodes = True
    nodes_n = mat_needles.node_tree.nodes
    nodes_n.clear()

    output_n = nodes_n.new('ShaderNodeOutputMaterial')
    bsdf_n = nodes_n.new('ShaderNodeBsdfPrincipled')
    bsdf_n.inputs['Base Color'].default_value = (0.1, 0.3, 0.12, 1.0)
    bsdf_n.inputs['Roughness'].default_value = 0.85

    mat_needles.node_tree.links.new(bsdf_n.outputs['BSDF'], output_n.inputs['Surface'])

    # 5層の円錐
    needle_parts = []
    for i in range(5):
        z = 2.0 + i * 1.5
        radius = 2.5 - i * 0.35

        bpy.ops.mesh.primitive_cone_add(
            vertices=12,
            radius1=radius,
            radius2=0.2,
            depth=2.0,
            location=(0, 0, z)
        )
        cone = bpy.context.active_object
        cone.data.materials.append(mat_needles)
        needle_parts.append(cone)

    # 結合
    bpy.ops.object.select_all(action='DESELECT')
    trunk.select_set(True)
    for part in needle_parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = trunk
    bpy.ops.object.join()

    tree = bpy.context.active_object
    tree.name = "Tree_Conifer"
    tree.location = (0, 0, 0)

    return tree

# === ヤシの木（Palm Tree）===
def create_palm_tree():
    # 幹（曲線的）
    bpy.ops.mesh.primitive_cylinder_add(
        radius=0.3,
        depth=6.5,
        vertices=8,
        location=(0, 0, 3.25)
    )
    trunk = bpy.context.active_object
    trunk.name = "Trunk_Palm"

    # シンプルな曲げ変形
    bpy.ops.object.modifier_add(type='SIMPLE_DEFORM')
    trunk.modifiers["SimpleDeform"].deform_method = 'BEND'
    trunk.modifiers["SimpleDeform"].angle = 0.15
    bpy.ops.object.modifier_apply(modifier="SimpleDeform")

    mat_trunk = bpy.data.materials.new(name="Palm_Bark")
    mat_trunk.use_nodes = True
    nodes = mat_trunk.node_tree.nodes
    nodes.clear()

    output = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.5, 0.4, 0.25, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.85

    mat_trunk.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    trunk.data.materials.append(mat_trunk)

    # 葉（8枚の放射状配置）
    mat_leaf = bpy.data.materials.new(name="Palm_Leaf")
    mat_leaf.use_nodes = True
    nodes_l = mat_leaf.node_tree.nodes
    nodes_l.clear()

    output_l = nodes_l.new('ShaderNodeOutputMaterial')
    bsdf_l = nodes_l.new('ShaderNodeBsdfPrincipled')
    bsdf_l.inputs['Base Color'].default_value = (0.25, 0.5, 0.2, 1.0)
    bsdf_l.inputs['Roughness'].default_value = 0.7

    mat_leaf.node_tree.links.new(bsdf_l.outputs['BSDF'], output_l.inputs['Surface'])

    leaf_parts = []
    for i in range(8):
        angle = (i / 8) * math.pi * 2

        # 葉: 細長い楕円体
        bpy.ops.mesh.primitive_uv_sphere_add(
            radius=1.0,
            segments=8,
            ring_count=6,
            location=(0, 0, 6.5)
        )
        leaf = bpy.context.active_object
        leaf.scale = (0.4, 2.5, 0.1)
        leaf.rotation_euler = (math.radians(30), 0, angle)

        bpy.ops.object.transform_apply(scale=True, rotation=True)
        leaf.data.materials.append(mat_leaf)
        leaf_parts.append(leaf)

    # 結合
    bpy.ops.object.select_all(action='DESELECT')
    trunk.select_set(True)
    for part in leaf_parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = trunk
    bpy.ops.object.join()

    tree = bpy.context.active_object
    tree.name = "Tree_Palm"
    tree.location = (0, 0, 0)

    return tree

# === エクスポート ===
def export_tree(tree_func, filename):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()

    tree = tree_func()
    tree.select_set(True)
    bpy.context.view_layer.objects.active = tree

    filepath = f"/home/vscode/AirFighter/public/models/{filename}"
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_materials='EXPORT',
        export_colors=True,
        export_normals=True,
        export_tangents=True
    )
    print(f"✅ Exported: {filename}")

# 全樹木生成
export_tree(create_deciduous_tree, "tree_deciduous.glb")
export_tree(create_conifer_tree, "tree_conifer.glb")
export_tree(create_palm_tree, "tree_palm.glb")

print("✅ All trees generated successfully!")
