"""
AirFighter Landmark Generator
==============================
Generates: dam.glb, city_building_01-05.glb, defense_bunker.glb, radar_base.glb
Run: blender --background --python gen_landmarks.py
"""
import bpy, bmesh, math, os, time, random

OUTPUT_DIR = "../public/models/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
t0 = time.time()

def clamp01(v): return max(0.0, min(1.0, v))
def lerp(a,b,t): return a+(b-a)*t

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)

def mat_concrete():
    mat = bpy.data.materials.new("Concrete")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.58, 0.56, 0.50, 1.0)
    bsdf.inputs['Roughness'].default_value  = 0.95
    bsdf.inputs['Metallic'].default_value   = 0.0
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def mat_metal(r=0.38, g=0.42, b=0.45):
    mat = bpy.data.materials.new("Metal")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value  = 0.45
    bsdf.inputs['Metallic'].default_value   = 0.88
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def mat_glass():
    mat = bpy.data.materials.new("Glass")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.7, 0.8, 0.9, 1.0)
    bsdf.inputs['Transmission'].default_value = 0.95
    bsdf.inputs['Roughness'].default_value  = 0.0
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def export_glb(name):
    path = os.path.join(OUTPUT_DIR, name)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB',
        export_lights=False, export_cameras=False
    )
    print(f"✓ Exported {name}")

# ===== DAM =====
def build_dam():
    clear_scene()
    conc = mat_concrete()

    # ダム本体（アーチ型）
    bpy.ops.mesh.primitive_cube_add(size=1)
    dam = bpy.context.object
    dam.scale = (90, 3, 35)
    dam.location = (0, 0, 17.5)

    # モディファイアでアーチ形状
    mod = dam.modifiers.new('Simple', 'SIMPLE_DEFORM')
    mod.deform_method = 'BEND'
    mod.angle = math.radians(20)
    mod.deform_axis = 'Z'

    dam.data.materials.append(conc)

    # 天板
    bpy.ops.mesh.primitive_cube_add(size=1)
    top = bpy.context.object
    top.scale = (94, 6, 2)
    top.location = (0, 0, 36)
    top.data.materials.append(conc)

    # 水門ゲート（鉄製）
    steel = mat_metal(0.3, 0.3, 0.35)
    for i in range(-2, 3):
        bpy.ops.mesh.primitive_cube_add(size=1)
        gate = bpy.context.object
        gate.scale = (8, 0.5, 15)
        gate.location = (i * 18, 2, 8)
        gate.data.materials.append(steel)

    export_glb("dam.glb")

# ===== CITY BUILDINGS =====
def build_city_buildings():
    # 5種類の都市ビルを生成
    building_configs = [
        {'w': 12, 'd': 12, 'h': 35, 'name': 'city_building_01.glb'},
        {'w': 18, 'd': 15, 'h': 52, 'name': 'city_building_02.glb'},
        {'w': 10, 'd': 10, 'h': 68, 'name': 'city_building_03.glb'},
        {'w': 22, 'd': 18, 'h': 42, 'name': 'city_building_04.glb'},
        {'w': 14, 'd': 14, 'h': 28, 'name': 'city_building_05.glb'},
    ]

    for cfg in building_configs:
        clear_scene()

        # ビル本体
        bpy.ops.mesh.primitive_cube_add(size=1)
        building = bpy.context.object
        building.scale = (cfg['w'], cfg['d'], cfg['h'])
        building.location = (0, 0, cfg['h'] / 2)

        # マテリアル（ベージュ〜グレー系）
        mat = bpy.data.materials.new("Building")
        mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')

        # ランダムな色味
        h = random.uniform(0.1, 0.15)
        s = random.uniform(0.1, 0.25)
        v = random.uniform(0.4, 0.6)
        # HSV to RGB簡易変換
        c = v * s
        x = c * (1 - abs((h * 6) % 2 - 1))
        m = v - c
        r, g, b = m + c, m + x, m

        bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
        bsdf.inputs['Roughness'].default_value = 0.7
        bsdf.inputs['Metallic'].default_value = 0.15
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        building.data.materials.append(mat)

        # 窓（黒いストライプ）
        glass = mat_glass()
        for floor in range(3, int(cfg['h']), 4):
            bpy.ops.mesh.primitive_cube_add(size=1)
            window = bpy.context.object
            window.scale = (cfg['w'] - 1, cfg['d'] - 1, 0.3)
            window.location = (0, 0, floor)
            window.data.materials.append(glass)

        # 屋上機械室
        bpy.ops.mesh.primitive_cube_add(size=1)
        mech = bpy.context.object
        mech.scale = (cfg['w'] * 0.3, cfg['d'] * 0.3, 3)
        mech.location = (0, 0, cfg['h'] + 1.5)
        mech.data.materials.append(mat_metal())

        export_glb(cfg['name'])

# ===== DEFENSE BUNKER =====
def build_defense_bunker():
    clear_scene()
    conc = mat_concrete()

    # 地下バンカー本体
    bpy.ops.mesh.primitive_cube_add(size=1)
    bunker = bpy.context.object
    bunker.scale = (14, 14, 4)
    bunker.location = (0, 0, 2)
    bunker.data.materials.append(conc)

    # 入口
    bpy.ops.mesh.primitive_cube_add(size=1)
    entrance = bpy.context.object
    entrance.scale = (3, 4, 2.5)
    entrance.location = (0, 8, 1.25)
    entrance.data.materials.append(conc)

    # 通気口
    steel = mat_metal()
    for i in [-4, 4]:
        for j in [-4, 4]:
            bpy.ops.mesh.primitive_cylinder_add(radius=0.8, depth=2)
            vent = bpy.context.object
            vent.location = (i, j, 4.5)
            vent.data.materials.append(steel)

    export_glb("defense_bunker.glb")

# ===== MOUNTAIN RADAR BASE =====
def build_radar_base():
    clear_scene()
    conc = mat_concrete()

    # プラットフォーム
    bpy.ops.mesh.primitive_cylinder_add(radius=22, depth=4)
    platform = bpy.context.object
    platform.location = (0, 0, 2)
    platform.data.materials.append(conc)

    # 中央ビル
    bpy.ops.mesh.primitive_cube_add(size=1)
    building = bpy.context.object
    building.scale = (16, 16, 14)
    building.location = (0, 0, 11)
    building.data.materials.append(conc)

    # レーダードーム
    bpy.ops.mesh.primitive_uv_sphere_add(radius=6, segments=24, ring_count=16)
    dome = bpy.context.object
    dome.location = (0, 0, 22)

    # ドームマテリアル（白）
    mat = bpy.data.materials.new("RadarDome")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.9, 0.9, 0.9, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.4
    bsdf.inputs['Metallic'].default_value = 0.2
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    dome.data.materials.append(mat)

    # アンテナタワー
    steel = mat_metal()
    for pos in [(-12, 10), (12, 10), (-12, -10), (12, -10)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.4, depth=12)
        tower = bpy.context.object
        tower.location = (pos[0], pos[1], 10)
        tower.data.materials.append(steel)

    export_glb("mountain_radar_base.glb")

# ===== EXECUTE =====
print("=== AirFighter Landmark Generator ===")
build_dam()
build_city_buildings()
build_defense_bunker()
build_radar_base()

elapsed = time.time() - t0
print(f"\n✓ All landmarks exported in {elapsed:.1f}s")
print(f"  Output: {os.path.abspath(OUTPUT_DIR)}")
