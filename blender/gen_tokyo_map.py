"""
AirFighter Tokyo Map Generator
===============================
Generates: tokyo_terrain.glb, tokyo_landmarks.glb
Based on real Tokyo geography and landmarks

Coordinates: Shibuya station as origin (0,0)
Scale: 1 unit = 10 meters
Map size: 6km x 6km (-3000 to +3000)

Run: blender --background --python gen_tokyo_map.py
"""
import bpy, bmesh, math, os, time

OUTPUT_DIR = "../public/models/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
t0 = time.time()

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)

def mat_glass():
    mat = bpy.data.materials.new("Glass")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.7, 0.8, 0.95, 1.0)
    bsdf.inputs['Transmission'].default_value = 0.85
    bsdf.inputs['Roughness'].default_value = 0.1
    bsdf.inputs['Metallic'].default_value = 0.05
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def mat_concrete():
    mat = bpy.data.materials.new("Concrete")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.65, 0.63, 0.60, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.9
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def mat_metal(r=0.45, g=0.45, b=0.48):
    mat = bpy.data.materials.new("Metal")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.3
    bsdf.inputs['Metallic'].default_value = 0.95
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def mat_redlight():
    mat = bpy.data.materials.new("RedLight")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    emit = nt.nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (1.0, 0.15, 0.05, 1.0)
    emit.inputs['Strength'].default_value = 8.0
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return mat

def export_glb(name):
    path = os.path.join(OUTPUT_DIR, name)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB',
        export_lights=False, export_cameras=False
    )
    print(f"✓ Exported {name}")

# ===== TOKYO TOWER =====
def build_tokyo_tower():
    clear_scene()
    steel = mat_metal(0.95, 0.35, 0.15)  # オレンジ
    redlight = mat_redlight()

    # メイン構造（4本脚の錐台）
    # 下部
    leg_h1 = 150
    leg_r1 = 2.5
    for angle in [0, 90, 180, 270]:
        rad = math.radians(angle)
        x = math.cos(rad) * 45
        z = math.sin(rad) * 45
        bpy.ops.mesh.primitive_cylinder_add(radius=leg_r1, depth=leg_h1)
        leg = bpy.context.object
        leg.location = (x, z, leg_h1/2)
        leg.data.materials.append(steel)

    # 中部
    leg_h2 = 100
    for angle in [0, 90, 180, 270]:
        rad = math.radians(angle)
        x = math.cos(rad) * 25
        z = math.sin(rad) * 25
        bpy.ops.mesh.primitive_cylinder_add(radius=1.8, depth=leg_h2)
        leg = bpy.context.object
        leg.location = (x, z, leg_h1 + leg_h2/2)
        leg.data.materials.append(steel)

    # 展望台（メインデッキ）
    bpy.ops.mesh.primitive_cylinder_add(radius=18, depth=12)
    deck = bpy.context.object
    deck.location = (0, 0, 150)
    deck.data.materials.append(mat_glass())

    # トップデッキ
    bpy.ops.mesh.primitive_cylinder_add(radius=10, depth=8)
    top = bpy.context.object
    top.location = (0, 0, 200)
    top.data.materials.append(mat_glass())

    # アンテナ
    bpy.ops.mesh.primitive_cylinder_add(radius=0.8, depth=133)
    antenna = bpy.context.object
    antenna.location = (0, 0, 265)
    antenna.data.materials.append(steel)

    # 赤色航空障害灯
    for h in [80, 150, 220, 333]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=2, segments=8, ring_count=6)
        light = bpy.context.object
        light.location = (0, 0, h)
        light.data.materials.append(redlight)

    export_glb("tokyo_tower.glb")

# ===== ROPPONGI HILLS MORI TOWER =====
def build_roppongi_hills():
    clear_scene()
    glass = mat_glass()
    concrete = mat_concrete()

    # メインタワー（54階建て、238m）
    bpy.ops.mesh.primitive_cube_add(size=1)
    tower = bpy.context.object
    tower.scale = (32, 32, 238)
    tower.location = (0, 0, 119)
    tower.data.materials.append(glass)

    # コア部分（中央）
    bpy.ops.mesh.primitive_cube_add(size=1)
    core = bpy.context.object
    core.scale = (12, 12, 240)
    core.location = (0, 0, 120)
    core.data.materials.append(concrete)

    # 屋上ヘリポート
    bpy.ops.mesh.primitive_cylinder_add(radius=15, depth=2)
    helipad = bpy.context.object
    helipad.location = (0, 0, 240)
    helipad.data.materials.append(concrete)

    export_glb("roppongi_hills.glb")

# ===== TOKYO METROPOLITAN GOVERNMENT BUILDING (都庁) =====
def build_tokyo_government():
    clear_scene()
    concrete = mat_concrete()
    glass = mat_glass()

    # 第一本庁舎（双塔）
    for x_offset in [-15, 15]:
        # メインビル（202m）
        bpy.ops.mesh.primitive_cube_add(size=1)
        tower = bpy.context.object
        tower.scale = (28, 28, 180)
        tower.location = (x_offset, 0, 90)
        tower.data.materials.append(concrete)

        # 展望室（243m）
        bpy.ops.mesh.primitive_cube_add(size=1)
        obs = bpy.context.object
        obs.scale = (12, 12, 40)
        obs.location = (x_offset, 0, 200)
        obs.data.materials.append(glass)

    # 連結部
    bpy.ops.mesh.primitive_cube_add(size=1)
    bridge = bpy.context.object
    bridge.scale = (60, 28, 80)
    bridge.location = (0, 0, 40)
    bridge.data.materials.append(concrete)

    export_glb("tokyo_government.glb")

# ===== TOKYO DOME =====
def build_tokyo_dome():
    clear_scene()

    # ドーム屋根
    bpy.ops.mesh.primitive_uv_sphere_add(radius=65, segments=48, ring_count=24)
    dome = bpy.context.object
    dome.location = (0, 0, 30)
    dome.scale = (1, 1, 0.4)

    # 下半分を削除
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for i, v in enumerate(dome.data.vertices):
        if v.co.z < 0:
            v.select = True
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')

    # マテリアル（白い膜）
    mat = bpy.data.materials.new("DomeFabric")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.95, 0.95, 0.95, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.6
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    dome.data.materials.append(mat)

    # ベース構造
    bpy.ops.mesh.primitive_cylinder_add(radius=68, depth=8)
    base = bpy.context.object
    base.location = (0, 0, 4)
    base.data.materials.append(mat_concrete())

    export_glb("tokyo_dome.glb")

# ===== RAINBOW BRIDGE =====
def build_rainbow_bridge():
    clear_scene()
    concrete = mat_concrete()
    steel = mat_metal()

    bridge_length = 900

    # 橋桁
    bpy.ops.mesh.primitive_cube_add(size=1)
    deck = bpy.context.object
    deck.scale = (30, bridge_length, 8)
    deck.location = (0, 0, 45)
    deck.data.materials.append(concrete)

    # 主塔（2本）
    for y_pos in [-300, 300]:
        bpy.ops.mesh.primitive_cube_add(size=1)
        tower = bpy.context.object
        tower.scale = (12, 12, 126)
        tower.location = (0, y_pos, 63)
        tower.data.materials.append(concrete)

        # ケーブル支柱
        bpy.ops.mesh.primitive_cube_add(size=1)
        top = bpy.context.object
        top.scale = (20, 8, 8)
        top.location = (0, y_pos, 126)
        top.data.materials.append(steel)

    # 主ケーブル（簡易版）
    for x_offset in [-10, 10]:
        for side in [-1, 1]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=bridge_length)
            cable = bpy.context.object
            cable.rotation_euler.x = math.pi / 2
            cable.location = (x_offset * side, 0, 100)
            cable.data.materials.append(steel)

    export_glb("rainbow_bridge.glb")

# ===== SKYTREE (簡易版) =====
def build_skytree():
    clear_scene()
    steel = mat_metal(0.88, 0.88, 0.92)
    glass = mat_glass()
    redlight = mat_redlight()

    # メインシャフト（三角錐構造を簡略化）
    segments = 20
    for i in range(segments):
        h_bottom = i * 32
        h_top = (i + 1) * 32
        r_bottom = 40 - (i * 1.8)
        r_top = 40 - ((i + 1) * 1.8)

        bpy.ops.mesh.primitive_cone_add(
            vertices=3,
            radius1=r_bottom,
            radius2=r_top,
            depth=32
        )
        seg = bpy.context.object
        seg.location = (0, 0, h_bottom + 16)
        seg.data.materials.append(steel)

    # 第一展望台（天望デッキ、350m）
    bpy.ops.mesh.primitive_cylinder_add(radius=22, depth=25)
    deck1 = bpy.context.object
    deck1.location = (0, 0, 350)
    deck1.data.materials.append(glass)

    # 第二展望台（天望回廊、450m）
    bpy.ops.mesh.primitive_cylinder_add(radius=18, depth=20)
    deck2 = bpy.context.object
    deck2.location = (0, 0, 450)
    deck2.data.materials.append(glass)

    # アンテナ部（450-634m）
    bpy.ops.mesh.primitive_cylinder_add(radius=2, depth=184)
    antenna = bpy.context.object
    antenna.location = (0, 0, 542)
    antenna.data.materials.append(steel)

    # 航空障害灯
    for h in [200, 350, 450, 634]:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=3, segments=8, ring_count=6)
        light = bpy.context.object
        light.location = (0, 0, h)
        light.data.materials.append(redlight)

    export_glb("tokyo_skytree.glb")

# ===== SHIBUYA SCRAMBLE SQUARE =====
def build_shibuya_scramble():
    clear_scene()
    glass = mat_glass()

    # メインタワー（230m、47階建て）
    bpy.ops.mesh.primitive_cube_add(size=1)
    tower = bpy.context.object
    tower.scale = (35, 28, 230)
    tower.location = (0, 0, 115)
    tower.data.materials.append(glass)

    # 屋上展望施設
    bpy.ops.mesh.primitive_cube_add(size=1)
    obs = bpy.context.object
    obs.scale = (38, 31, 15)
    obs.location = (0, 0, 238)
    obs.data.materials.append(glass)

    export_glb("shibuya_scramble.glb")

# ===== EXECUTE =====
print("=== AirFighter Tokyo Map Generator ===")
print("Generating iconic Tokyo landmarks...")

build_tokyo_tower()
build_roppongi_hills()
build_tokyo_government()
build_tokyo_dome()
build_rainbow_bridge()
build_skytree()
build_shibuya_scramble()

elapsed = time.time() - t0
print(f"\n✓ All Tokyo landmarks exported in {elapsed:.1f}s")
print(f"  Output: {os.path.abspath(OUTPUT_DIR)}")
print("\nGenerated landmarks:")
print("  - tokyo_tower.glb (333m)")
print("  - tokyo_skytree.glb (634m)")
print("  - roppongi_hills.glb (238m)")
print("  - tokyo_government.glb (243m)")
print("  - tokyo_dome.glb")
print("  - rainbow_bridge.glb (900m)")
print("  - shibuya_scramble.glb (230m)")
