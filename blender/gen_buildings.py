"""
AirFighter Building Generator
==============================
Generates: hangar.glb, control_tower.glb, radar_dish.glb, fuel_tank.glb, warehouse.glb
Run: blender --background --python gen_buildings.py
"""
import bpy, bmesh, math, os, time

OUTPUT_DIR = "/workspaces/AirFighter/public/models/"
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

def mat_milgreen():
    mat = bpy.data.materials.new("MilGreen")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.24, 0.30, 0.17, 1.0)
    bsdf.inputs['Roughness'].default_value  = 0.90
    bsdf.inputs['Metallic'].default_value   = 0.05
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def mat_glass():
    mat = bpy.data.materials.new("Glass")
    mat.use_nodes = True; nt = mat.node_tree; nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value  = (0.55, 0.75, 0.95, 1.0)
    bsdf.inputs['Roughness'].default_value   = 0.05
    bsdf.inputs['Metallic'].default_value    = 0.0
    bsdf.inputs['Alpha'].default_value       = 0.25
    bsdf.inputs['IOR'].default_value         = 1.45
    bsdf.inputs['Transmission'].default_value = 0.9
    mat.blend_method = 'BLEND'
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def add_box(bm, w, h, d, ox=0, oy=0, oz=0):
    """Add a box to bmesh and return the 8 verts"""
    hw, hh, hd = w/2, h/2, d/2
    coords = [
        (ox-hw, oy,    oz-hd), (ox+hw, oy,    oz-hd),
        (ox+hw, oy,    oz+hd), (ox-hw, oy,    oz+hd),
        (ox-hw, oy+h,  oz-hd), (ox+hw, oy+h,  oz-hd),
        (ox+hw, oy+h,  oz+hd), (ox-hw, oy+h,  oz+hd),
    ]
    vs = [bm.verts.new(c) for c in coords]
    faces = [(0,1,2,3),(4,5,6,7),(0,1,5,4),(2,3,7,6),(0,3,7,4),(1,2,6,5)]
    for f in faces: bm.faces.new([vs[i] for i in f])
    return vs

def make_cylinder_obj(name, r, h, seg=24, ox=0, oy=0, oz=0, mat=None):
    bm = bmesh.new()
    top_verts, bot_verts = [], []
    for i in range(seg):
        a = (i/seg)*math.pi*2
        bot_verts.append(bm.verts.new((ox+r*math.cos(a), oy, oz+r*math.sin(a))))
        top_verts.append(bm.verts.new((ox+r*math.cos(a), oy+h, oz+r*math.sin(a))))
    for i in range(seg):
        ni = (i+1)%seg
        bm.faces.new([bot_verts[i], bot_verts[ni], top_verts[ni], top_verts[i]])
    bc = bm.verts.new((ox, oy, oz))
    tc = bm.verts.new((ox, oy+h, oz))
    for i in range(seg):
        bm.faces.new([bot_verts[(i+1)%seg], bot_verts[i], bc])
        bm.faces.new([top_verts[i], top_verts[(i+1)%seg], tc])
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table(); bm.normal_update()
    mesh = bpy.data.meshes.new(name+"M")
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    for p in mesh.polygons: p.use_smooth = True
    return obj

def export_selected(name):
    path = OUTPUT_DIR + name + ".glb"
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB',
        use_selection=True, export_apply=True,
        export_colors=True, export_normals=True, export_yup=True,
        export_materials='EXPORT',
    )
    print(f"  → {path} ({os.path.getsize(path)//1024} KB)")

def select_all_obj(): bpy.ops.object.select_all(action='SELECT')

# ═══════════════════════════════════════════════════════════════════
#  1. AIRCRAFT HANGAR
#     Arched roof, front bay doors, side windows
# ═══════════════════════════════════════════════════════════════════
def gen_hangar():
    print("\n[1/5] Generating hangar...")
    clear_scene()
    mc = mat_concrete(); mm = mat_metal()

    W, D, H_WALL = 38.0, 28.0, 10.0  # width, depth, wall height
    ARCH_SEGS = 18
    arch_r = W / 2

    # Walls (4 sides, no roof)
    bm = bmesh.new()

    # Back wall
    vs = add_box(bm, W, H_WALL+arch_r*0.15, 1.2, oz=-D/2)
    # Side walls
    add_box(bm, 1.2, H_WALL, D, ox=-W/2)
    add_box(bm, 1.2, H_WALL, D, ox= W/2)

    bm.normal_update()
    mesh = bpy.data.meshes.new("HangarWalls")
    bm.to_mesh(mesh); bm.free()
    walls_obj = bpy.data.objects.new("HangarWalls", mesh)
    bpy.context.collection.objects.link(walls_obj)
    walls_obj.data.materials.append(mc)

    # Arched roof (cylinder segment)
    bm2 = bmesh.new()
    SEG = ARCH_SEGS
    step = D / SEG
    # Build arch as rows along depth
    arch_rows = []
    for si in range(SEG + 1):
        z = -D/2 + si * step
        row = []
        for ai in range(17):  # half-circle, 17 pts
            a = (ai / 16) * math.pi  # 0..π
            x = -math.cos(a) * arch_r
            y = H_WALL + math.sin(a) * arch_r * 0.55
            row.append(bm2.verts.new((x, y, z)))
        arch_rows.append(row)
    for si in range(SEG):
        for ai in range(16):
            bm2.faces.new([arch_rows[si][ai], arch_rows[si][ai+1],
                           arch_rows[si+1][ai+1], arch_rows[si+1][ai]])
    bm2.normal_update()
    mesh2 = bpy.data.meshes.new("HangarRoof")
    bm2.to_mesh(mesh2); bm2.free()
    roof_obj = bpy.data.objects.new("HangarRoof", mesh2)
    bpy.context.collection.objects.link(roof_obj)
    roof_obj.data.materials.append(mm)
    for p in mesh2.polygons: p.use_smooth = True

    # Floor slab
    bm3 = bmesh.new()
    add_box(bm3, W+2, 0.5, D+2, oy=-0.25)
    bm3.normal_update()
    mesh3 = bpy.data.meshes.new("HangarFloor")
    bm3.to_mesh(mesh3); bm3.free()
    floor_obj = bpy.data.objects.new("HangarFloor", mesh3)
    bpy.context.collection.objects.link(floor_obj)
    floor_obj.data.materials.append(mc)

    # Door frame (front opening frame)
    bm4 = bmesh.new()
    add_box(bm4, 2.0, H_WALL, 1.0, ox=-W/2+1, oz=D/2)
    add_box(bm4, 2.0, H_WALL, 1.0, ox= W/2-1, oz=D/2)
    add_box(bm4, W,   1.5,    1.0, oy=H_WALL-0.75, oz=D/2)
    bm4.normal_update()
    mesh4 = bpy.data.meshes.new("HangarFrame")
    bm4.to_mesh(mesh4); bm4.free()
    frame_obj = bpy.data.objects.new("HangarFrame", mesh4)
    bpy.context.collection.objects.link(frame_obj)
    frame_obj.data.materials.append(mm)

    select_all_obj()
    export_selected("hangar")

# ═══════════════════════════════════════════════════════════════════
#  2. CONTROL TOWER
#     Tapered base, glass cab, antenna array
# ═══════════════════════════════════════════════════════════════════
def gen_control_tower():
    print("\n[2/5] Generating control_tower...")
    clear_scene()
    mc = mat_concrete(); mm = mat_metal(); mg = mat_glass()

    H_BASE = 22.0; W_BASE_BOT = 7.0; W_BASE_TOP = 5.5
    H_CAB  = 5.0;  W_CAB = 8.0

    # Tapered base (frustum)
    bm = bmesh.new()
    hb = H_BASE
    wb, wt = W_BASE_BOT/2, W_BASE_TOP/2
    coords = [
        (-wb, 0,  -wb), (wb, 0,  -wb), (wb, 0,   wb), (-wb, 0,   wb),
        (-wt, hb, -wt), (wt, hb, -wt), (wt, hb,  wt), (-wt, hb,  wt),
    ]
    vs = [bm.verts.new(c) for c in coords]
    for f in [(0,1,2,3),(4,5,6,7),(0,1,5,4),(2,3,7,6),(0,3,7,4),(1,2,6,5)]:
        bm.faces.new([vs[i] for i in f])
    bm.normal_update()
    mesh = bpy.data.meshes.new("TowerBase"); bm.to_mesh(mesh); bm.free()
    base_obj = bpy.data.objects.new("TowerBase", mesh)
    bpy.context.collection.objects.link(base_obj); base_obj.data.materials.append(mc)

    # Glass cab (wider than base top, octagonal)
    bm2 = bmesh.new()
    wc = W_CAB/2
    bot, top = [], []
    for i in range(8):
        a = (i/8)*math.pi*2 + math.pi/8
        bot.append(bm2.verts.new((math.cos(a)*wc, H_BASE, math.sin(a)*wc)))
        top.append(bm2.verts.new((math.cos(a)*wc, H_BASE+H_CAB, math.sin(a)*wc)))
    for i in range(8):
        ni = (i+1)%8
        bm2.faces.new([bot[i], bot[ni], top[ni], top[i]])
    bc2 = bm2.verts.new((0, H_BASE, 0)); tc2 = bm2.verts.new((0, H_BASE+H_CAB, 0))
    for i in range(8):
        bm2.faces.new([bot[(i+1)%8], bot[i], bc2])
        bm2.faces.new([top[i], top[(i+1)%8], tc2])
    bm2.normal_update()
    mesh2 = bpy.data.meshes.new("TowerCab"); bm2.to_mesh(mesh2); bm2.free()
    cab_obj = bpy.data.objects.new("TowerCab", mesh2)
    bpy.context.collection.objects.link(cab_obj); cab_obj.data.materials.append(mg)
    for p in mesh2.polygons: p.use_smooth = True

    # Roof slab
    bm3 = bmesh.new()
    add_box(bm3, W_CAB+1, 0.8, W_CAB+1, oy=H_BASE+H_CAB)
    bm3.normal_update()
    mesh3 = bpy.data.meshes.new("TowerRoof"); bm3.to_mesh(mesh3); bm3.free()
    roof_obj = bpy.data.objects.new("TowerRoof", mesh3)
    bpy.context.collection.objects.link(roof_obj); roof_obj.data.materials.append(mm)

    # Antenna mast
    ant = make_cylinder_obj("Antenna", 0.2, 8.0, seg=8, oy=H_BASE+H_CAB+0.8, mat=mm)
    # Side struts
    bm4 = bmesh.new()
    for sx in [-1.5, 1.5]:
        add_box(bm4, 0.15, 5.0, 0.15, ox=sx, oy=H_BASE+H_CAB+3)
    bm4.normal_update()
    mesh4 = bpy.data.meshes.new("TowerAntennaStruts"); bm4.to_mesh(mesh4); bm4.free()
    struts_obj = bpy.data.objects.new("Struts", mesh4)
    bpy.context.collection.objects.link(struts_obj); struts_obj.data.materials.append(mm)

    select_all_obj()
    export_selected("control_tower")

# ═══════════════════════════════════════════════════════════════════
#  3. RADAR DISH
#     Rotating dish on a pedestal
# ═══════════════════════════════════════════════════════════════════
def gen_radar_dish():
    print("\n[3/5] Generating radar_dish...")
    clear_scene()
    mm = mat_metal(0.32, 0.36, 0.40)

    # Pedestal
    ped = make_cylinder_obj("Pedestal", 1.2, 4.0, seg=12, mat=mm)

    # Dish (parabolic arc, extruded along width)
    bm = bmesh.new()
    W_DISH = 10.0; D_DISH = 6.5
    SEGS = 20
    rows = []
    for di in range(SEGS + 1):
        dz = (di/SEGS - 0.5) * D_DISH
        row = []
        for wi in range(SEGS + 1):
            wx = (wi/SEGS - 0.5) * W_DISH
            # Parabolic depth
            t = (wx / (W_DISH/2))**2
            wy = 4.0 + t * 1.8 - 1.8  # parabola, open at front
            row.append(bm.verts.new((wx, wy, dz)))
        rows.append(row)

    for di in range(SEGS):
        for wi in range(SEGS):
            bm.faces.new([rows[di][wi], rows[di][wi+1], rows[di+1][wi+1], rows[di+1][wi]])

    # Rim
    for di in range(SEGS):
        dz0 = (di/SEGS - 0.5)*D_DISH
        dz1 = ((di+1)/SEGS - 0.5)*D_DISH
        for edge_x in [-W_DISH/2, W_DISH/2]:
            rim_y = 4.0
            bm.faces.new([
                bm.verts.new((edge_x, rim_y, dz0)),
                bm.verts.new((edge_x, rim_y-0.4, dz0)),
                bm.verts.new((edge_x, rim_y-0.4, dz1)),
                bm.verts.new((edge_x, rim_y, dz1)),
            ])

    bm.normal_update()
    mesh = bpy.data.meshes.new("DishMesh"); bm.to_mesh(mesh); bm.free()
    dish_obj = bpy.data.objects.new("RadarDish", mesh)
    bpy.context.collection.objects.link(dish_obj)
    dish_obj.data.materials.append(mm)
    dish_obj.location.y = 4.0  # on top of pedestal
    for p in mesh.polygons: p.use_smooth = True

    # Support arm
    arm = make_cylinder_obj("DishArm", 0.25, 3.5, seg=8, oy=4.0, oz=-D_DISH*0.35, mat=mm)

    select_all_obj()
    export_selected("radar_dish")

# ═══════════════════════════════════════════════════════════════════
#  4. FUEL TANK
#     Large horizontal cylinder on legs
# ═══════════════════════════════════════════════════════════════════
def gen_fuel_tank():
    print("\n[4/5] Generating fuel_tank...")
    clear_scene()
    mm = mat_metal(0.50, 0.48, 0.40)
    mc = mat_concrete()

    R = 4.5; L = 14.0; SEG = 24

    # Horizontal cylinder
    bm = bmesh.new()
    rows = []
    steps = 8
    for li in range(steps + 1):
        z = (li/steps - 0.5)*L
        row = []
        for ci in range(SEG):
            a = (ci/SEG)*math.pi*2
            row.append(bm.verts.new((R*math.cos(a), R + R, R*math.sin(a)*0.0 + z)))
        rows.append(row)

    # Rebuild properly: cylinder along Z axis
    bm.free(); bm = bmesh.new()
    rows = []
    for li in range(steps + 1):
        x = (li/steps - 0.5)*L
        row = []
        for ci in range(SEG):
            a = (ci/SEG)*math.pi*2
            row.append(bm.verts.new((x, R + R*math.cos(a), R*math.sin(a))))
        rows.append(row)

    for li in range(steps):
        for ci in range(SEG):
            ni = (ci+1)%SEG
            bm.faces.new([rows[li][ci], rows[li][ni], rows[li+1][ni], rows[li+1][ci]])

    # End caps
    for end_row in [rows[0], rows[-1]]:
        cx = end_row[0].co.x
        center = bm.verts.new((cx, R, 0))
        for ci in range(SEG):
            ni = (ci+1)%SEG
            if cx < 0:
                bm.faces.new([end_row[ni], end_row[ci], center])
            else:
                bm.faces.new([end_row[ci], end_row[ni], center])

    bm.normal_update()
    mesh = bpy.data.meshes.new("TankMesh"); bm.to_mesh(mesh); bm.free()
    tank_obj = bpy.data.objects.new("FuelTank", mesh)
    bpy.context.collection.objects.link(tank_obj)
    tank_obj.data.materials.append(mm)
    for p in mesh.polygons: p.use_smooth = True

    # Support legs (4 concrete posts)
    bm2 = bmesh.new()
    leg_h = R  # floor to bottom of tank
    for lx in [-L/2*0.6, L/2*0.6]:
        for lz in [-R*0.7, R*0.7]:
            add_box(bm2, 1.2, leg_h, 1.2, ox=lx, oy=0, oz=lz)
    # Horizontal pipe detail
    for px in [-L*0.25, 0, L*0.25]:
        bm2.verts.new((px, R*2+R*0.1, 0))  # dummy; pipe added separately

    mesh2 = bpy.data.meshes.new("TankLegs"); bm2.to_mesh(mesh2); bm2.free()
    legs_obj = bpy.data.objects.new("TankLegs", mesh2)
    bpy.context.collection.objects.link(legs_obj)
    legs_obj.data.materials.append(mc)

    # Pipe along top
    pipe = make_cylinder_obj("TankPipe", 0.22, L, seg=10, mat=mm)
    pipe.rotation_euler[2] = math.pi/2  # rotate to horizontal
    pipe.location = (0, R*2.05, 0)

    select_all_obj()
    export_selected("fuel_tank")

# ═══════════════════════════════════════════════════════════════════
#  5. WAREHOUSE / DEPOT
#     Flat-roofed industrial building with loading bay
# ═══════════════════════════════════════════════════════════════════
def gen_warehouse():
    print("\n[5/5] Generating warehouse...")
    clear_scene()
    mc = mat_concrete(); mm = mat_metal(0.30, 0.34, 0.38)

    W, D, H = 32.0, 20.0, 9.0

    bm = bmesh.new()
    # Main body
    add_box(bm, W, H, D)
    # Roof overhang
    add_box(bm, W+1.5, 0.6, D+1.5, oy=H)
    # Loading bay recess (front center)
    # Door frames
    for dx in [-8, 0, 8]:
        add_box(bm, 5.5, 7.0, 0.5, ox=dx, oz=D/2)   # door
        add_box(bm, 0.5, 7.0, 0.5, ox=dx-3, oz=D/2) # frame L
        add_box(bm, 0.5, 7.0, 0.5, ox=dx+3, oz=D/2) # frame R
        add_box(bm, 5.5, 0.5, 0.5, ox=dx, oy=7.5, oz=D/2) # lintel

    bm.normal_update()
    mesh = bpy.data.meshes.new("WH"); bm.to_mesh(mesh); bm.free()
    wh_obj = bpy.data.objects.new("Warehouse", mesh)
    bpy.context.collection.objects.link(wh_obj)
    wh_obj.data.materials.append(mc)

    # Metal roof detail strips
    bm2 = bmesh.new()
    for dz in range(-8, 9, 4):
        add_box(bm2, W+2, 0.4, 0.6, oy=H+0.5, oz=dz)
    mesh2 = bpy.data.meshes.new("WHRoof"); bm2.to_mesh(mesh2); bm2.free()
    roof_obj = bpy.data.objects.new("WHRoof", mesh2)
    bpy.context.collection.objects.link(roof_obj)
    roof_obj.data.materials.append(mm)

    select_all_obj()
    export_selected("warehouse")

# ─── Run all ────────────────────────────────────────────────────────
gen_hangar()
gen_control_tower()
gen_radar_dish()
gen_fuel_tank()
gen_warehouse()

print(f"\n=== Buildings done! ({time.time()-t0:.0f}s) ===")
