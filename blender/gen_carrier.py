"""
AirFighter Floating Carrier Generator
=======================================
A massive flying aircraft carrier — armored hull, flight deck,
island superstructure, anti-air guns, engine pods.
Run: blender --background --python gen_carrier.py
"""
import bpy, bmesh, math, os, time

OUTPUT_DIR = "/workspaces/AirFighter/public/models/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
t0 = time.time()

def clamp01(v): return max(0.0, min(1.0, v))
def lerp(a, b, t): return a + (b-a)*t

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)

clear_scene()

# ─── Materials ─────────────────────────────────────────────────────
def make_mat(name, r, g, b, roughness=0.7, metalness=0.6):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value  = roughness
    bsdf.inputs['Metallic'].default_value   = metalness
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

mat_hull     = make_mat("Hull",    0.28, 0.30, 0.32, 0.65, 0.75)
mat_deck     = make_mat("Deck",    0.35, 0.35, 0.33, 0.88, 0.10)
mat_island   = make_mat("Island",  0.32, 0.35, 0.30, 0.72, 0.40)
mat_engine   = make_mat("Engine",  0.20, 0.22, 0.24, 0.40, 0.92)
mat_exhaust  = make_mat("Exhaust", 0.80, 0.35, 0.10, 0.30, 0.60)
mat_gun      = make_mat("Gun",     0.25, 0.28, 0.25, 0.50, 0.85)
mat_stripe   = make_mat("Stripe",  0.90, 0.88, 0.10, 0.90, 0.05)
mat_window   = make_mat("Window",  0.40, 0.70, 0.95, 0.05, 0.00)

def box_mesh(w, h, d):
    hw, hh, hd = w/2, h/2, d/2
    verts = [(-hw,-hh,-hd),(hw,-hh,-hd),(hw,-hh,hd),(-hw,-hh,hd),
             (-hw, hh,-hd),(hw, hh,-hd),(hw, hh,hd),(-hw, hh,hd)]
    faces = [(0,1,2,3),(7,6,5,4),(0,1,5,4),(3,2,6,7),(0,3,7,4),(1,2,6,5)]
    m = bpy.data.meshes.new("BoxM")
    m.from_pydata(verts, [], faces)
    m.validate(); m.calc_normals_split()
    return m

def add_obj(name, mesh, mat, x=0, y=0, z=0, rx=0, ry=0, rz=0, sx=1, sy=1, sz=1):
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, y, z)
    obj.rotation_euler = (rx, ry, rz)
    obj.scale = (sx, sy, sz)
    if mat: obj.data.materials.append(mat)
    return obj

def cyl_obj(name, r, h, seg=16, mat=None, x=0, y=0, z=0, rx=0, ry=0, rz=0):
    bm = bmesh.new()
    bot, top = [], []
    for i in range(seg):
        a = (i/seg)*math.pi*2
        bot.append(bm.verts.new((r*math.cos(a), 0, r*math.sin(a))))
        top.append(bm.verts.new((r*math.cos(a), h, r*math.sin(a))))
    for i in range(seg):
        ni = (i+1)%seg
        bm.faces.new([bot[i], bot[ni], top[ni], top[i]])
    bc = bm.verts.new((0,0,0)); tc = bm.verts.new((0,h,0))
    for i in range(seg):
        bm.faces.new([bot[(i+1)%seg], bot[i], bc])
        bm.faces.new([top[i], top[(i+1)%seg], tc])
    bm.normal_update()
    mesh = bpy.data.meshes.new(name+"M"); bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = (x, y, z)
    obj.rotation_euler = (rx, ry, rz)
    if mat: obj.data.materials.append(mat)
    for p in mesh.polygons: p.use_smooth = True
    return obj

# ═══════════════════════════════════════════════════════════════════
#  HULL (main body) — tapered bow and stern, armored plates
# ═══════════════════════════════════════════════════════════════════
print("Building hull...")

HULL_L = 180.0  # total length (Z axis = forward)
HULL_W = 42.0   # max width
HULL_H = 14.0   # height of main hull

# Build hull as subdivided box with tapered bow/stern
bm = bmesh.new()
SEG_L = 24; SEG_W = 8; SEG_H = 4

def taper(z_norm):
    """Returns width multiplier. Bow/stern taper to ~0.4x"""
    # z_norm: -1 (stern) → +1 (bow)
    t = abs(z_norm)
    if t > 0.6:
        tt = (t - 0.6) / 0.4
        return 1.0 - tt*tt*0.6
    return 1.0

def bow_lift(z_norm):
    """Bow curves up slightly"""
    if z_norm > 0.5:
        t = (z_norm - 0.5) / 0.5
        return t * HULL_H * 0.18
    return 0.0

hull_verts = []
for li in range(SEG_L + 1):
    z_n = (li / SEG_L) * 2 - 1  # -1..+1
    z   = z_n * HULL_L / 2
    w   = (HULL_W / 2) * taper(z_n)
    row = []
    # Bottom face verts
    for wi in range(SEG_W + 1):
        x_n = wi / SEG_W * 2 - 1
        x   = x_n * w
        # Slight V-keel on bottom
        y_bot = -HULL_H/2 + abs(x_n)*HULL_H*0.12
        y_top = HULL_H/2 + bow_lift(z_n)
        # Only outer ring: bottom and top
        row.append((
            bm.verts.new((x, y_bot, z)),
            bm.verts.new((x, y_top, z))
        ))
    hull_verts.append(row)

# Build faces between rows
for li in range(SEG_L):
    for wi in range(SEG_W):
        # Bottom face
        b00, t00 = hull_verts[li][wi]
        b10, t10 = hull_verts[li][wi+1]
        b01, t01 = hull_verts[li+1][wi]
        b11, t11 = hull_verts[li+1][wi+1]
        bm.faces.new([b00, b10, b11, b01])  # bottom
        bm.faces.new([t00, t01, t11, t10])  # top (deck)
        if wi == 0:         bm.faces.new([b00, b01, t01, t00])  # port side
        if wi == SEG_W-1:   bm.faces.new([b10, t10, t11, b11])  # starboard

# Bow face
for wi in range(SEG_W):
    hb0, ht0 = hull_verts[SEG_L][wi]
    hb1, ht1 = hull_verts[SEG_L][wi+1]
    bm.faces.new([hb0, ht0, ht1, hb1])
# Stern face
for wi in range(SEG_W):
    hb0, ht0 = hull_verts[0][wi]
    hb1, ht1 = hull_verts[0][wi+1]
    bm.faces.new([hb0, hb1, ht1, ht0])

bm.normal_update()
hull_mesh = bpy.data.meshes.new("HullMesh")
bm.to_mesh(hull_mesh); bm.free()
hull_obj = bpy.data.objects.new("Hull", hull_mesh)
bpy.context.collection.objects.link(hull_obj)
hull_obj.data.materials.append(mat_hull)

# ═══════════════════════════════════════════════════════════════════
#  FLIGHT DECK — wide flat surface on top of hull
# ═══════════════════════════════════════════════════════════════════
print("Building flight deck...")

bm_deck = bmesh.new()
DK_W = HULL_W * 1.12; DK_L = HULL_L * 0.96; DK_H = 1.2
DK_Y = HULL_H / 2 + DK_H / 2

deck_verts_b = [
    (-DK_W/2, DK_Y-DK_H/2, -DK_L/2), (DK_W/2, DK_Y-DK_H/2, -DK_L/2),
    (DK_W/2,  DK_Y-DK_H/2,  DK_L/2), (-DK_W/2, DK_Y-DK_H/2,  DK_L/2),
]
deck_verts_t = [
    (-DK_W/2, DK_Y+DK_H/2, -DK_L/2), (DK_W/2, DK_Y+DK_H/2, -DK_L/2),
    (DK_W/2,  DK_Y+DK_H/2,  DK_L/2), (-DK_W/2, DK_Y+DK_H/2,  DK_L/2),
]
all_dverts = [bm_deck.verts.new(c) for c in deck_verts_b + deck_verts_t]
bm_deck.faces.new([all_dverts[4], all_dverts[5], all_dverts[6], all_dverts[7]])  # top
for f in [(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(0,3,2,1)]:
    bm_deck.faces.new([all_dverts[i] for i in f])
bm_deck.normal_update()
deck_mesh = bpy.data.meshes.new("DeckMesh"); bm_deck.to_mesh(deck_mesh); bm_deck.free()
deck_obj = bpy.data.objects.new("Deck", deck_mesh)
bpy.context.collection.objects.link(deck_obj); deck_obj.data.materials.append(mat_deck)

# Runway stripe (yellow centerline)
bm_stripe = bmesh.new()
STRIPE_W = 3.0; STRIPE_Y = DK_Y + DK_H/2 + 0.05
for si in range(8):
    z0 = -DK_L/2 + si*(DK_L/8)
    z1 = z0 + DK_L/8 * 0.55
    vs = [bm_stripe.verts.new(c) for c in [
        (-STRIPE_W/2, STRIPE_Y, z0), (STRIPE_W/2, STRIPE_Y, z0),
        (STRIPE_W/2, STRIPE_Y, z1), (-STRIPE_W/2, STRIPE_Y, z1)]]
    bm_stripe.faces.new(vs)
bm_stripe.normal_update()
stripe_mesh = bpy.data.meshes.new("Stripe"); bm_stripe.to_mesh(stripe_mesh); bm_stripe.free()
stripe_obj = bpy.data.objects.new("Stripe", stripe_mesh)
bpy.context.collection.objects.link(stripe_obj); stripe_obj.data.materials.append(mat_stripe)

# ═══════════════════════════════════════════════════════════════════
#  ISLAND SUPERSTRUCTURE (starboard side, mid-ship)
# ═══════════════════════════════════════════════════════════════════
print("Building island superstructure...")

ISLAND_X = DK_W/2 - 5.0; ISLAND_Y = DK_Y + DK_H/2; ISLAND_Z = 10.0
ISLAND_W = 10.0; ISLAND_D = 28.0; ISLAND_H = 22.0

bm_is = bmesh.new()
# Main block
def box_at(bm, w, h, d, x, y, z):
    hw, hh, hd = w/2, h/2, d/2
    coords = [(x+dx, y+dy, z+dz)
              for dx in (-hw, hw) for dy in (-hh, hh) for dz in (-hd, hd)]
    vs = [bm.verts.new(c) for c in coords]
    # Cube faces
    idx = [(0,2,3,1),(4,5,7,6),(0,1,5,4),(2,6,7,3),(0,4,6,2),(1,3,7,5)]
    for f in idx: bm.faces.new([vs[i] for i in f])

box_at(bm_is, ISLAND_W, ISLAND_H, ISLAND_D,
       ISLAND_X + ISLAND_W/2,
       ISLAND_Y + ISLAND_H/2,
       ISLAND_Z)
# Bridge wings
box_at(bm_is, ISLAND_W*1.6, 2.5, ISLAND_D*0.4,
       ISLAND_X + ISLAND_W/2,
       ISLAND_Y + ISLAND_H*0.75,
       ISLAND_Z)
# Radar mast
box_at(bm_is, 1.2, 14.0, 1.2,
       ISLAND_X + ISLAND_W/2,
       ISLAND_Y + ISLAND_H + 7.0,
       ISLAND_Z)

bm_is.normal_update()
island_mesh = bpy.data.meshes.new("IslandMesh"); bm_is.to_mesh(island_mesh); bm_is.free()
island_obj = bpy.data.objects.new("Island", island_mesh)
bpy.context.collection.objects.link(island_obj); island_obj.data.materials.append(mat_island)

# Windows on island
bm_win = bmesh.new()
WIN_Y_BASE = ISLAND_Y + ISLAND_H * 0.55
for wz in [-8, -2, 4, 10]:
    vs = [bm_win.verts.new(c) for c in [
        (ISLAND_X - 0.1, WIN_Y_BASE,      wz - 1.0),
        (ISLAND_X - 0.1, WIN_Y_BASE,      wz + 1.0),
        (ISLAND_X - 0.1, WIN_Y_BASE + 2.0, wz + 1.0),
        (ISLAND_X - 0.1, WIN_Y_BASE + 2.0, wz - 1.0),
    ]]
    bm_win.faces.new(vs)
bm_win.normal_update()
win_mesh = bpy.data.meshes.new("WinMesh"); bm_win.to_mesh(win_mesh); bm_win.free()
win_obj = bpy.data.objects.new("Windows", win_mesh)
bpy.context.collection.objects.link(win_obj); win_obj.data.materials.append(mat_window)

# ═══════════════════════════════════════════════════════════════════
#  ANTI-AIR TURRETS (4 corners + mid)
# ═══════════════════════════════════════════════════════════════════
print("Building turrets...")

TURRET_POSITIONS = [
    (-DK_W/2 + 6, DK_Y+DK_H/2, -DK_L/2 + 12),
    ( DK_W/2 - 6, DK_Y+DK_H/2, -DK_L/2 + 12),
    (-DK_W/2 + 6, DK_Y+DK_H/2,  DK_L/2 - 12),
    ( DK_W/2 - 6, DK_Y+DK_H/2,  DK_L/2 - 12),
    (-DK_W/2 + 8, DK_Y+DK_H/2,  0),
]

for ti, (tx, ty, tz) in enumerate(TURRET_POSITIONS):
    # Base ring
    cyl_obj(f"TurretBase{ti}", 3.5, 2.0, seg=12, mat=mat_gun, x=tx, y=ty, z=tz)
    # Rotating drum
    cyl_obj(f"TurretDrum{ti}", 2.8, 1.8, seg=10, mat=mat_gun, x=tx, y=ty+2.0, z=tz)
    # Twin barrels
    bm_t = bmesh.new()
    for bx in (-1.2, 1.2):
        length = 7.0; r = 0.38; BSEG = 12
        bot_row = []; top_row = []
        for bi in range(BSEG):
            a = (bi/BSEG)*math.pi*2
            bot_row.append(bm_t.verts.new((tx+bx+r*math.cos(a), ty+3.8+r*math.sin(a), tz-length/2)))
            top_row.append(bm_t.verts.new((tx+bx+r*math.cos(a), ty+3.8+r*math.sin(a), tz+length/2)))
        for bi in range(BSEG):
            ni = (bi+1)%BSEG
            bm_t.faces.new([bot_row[bi], bot_row[ni], top_row[ni], top_row[bi]])
    bm_t.normal_update()
    barrel_mesh = bpy.data.meshes.new(f"Barrels{ti}"); bm_t.to_mesh(barrel_mesh); bm_t.free()
    barrel_obj = bpy.data.objects.new(f"Barrels{ti}", barrel_mesh)
    bpy.context.collection.objects.link(barrel_obj); barrel_obj.data.materials.append(mat_gun)

# ═══════════════════════════════════════════════════════════════════
#  ENGINE PODS (4 large thruster pods under hull)
# ═══════════════════════════════════════════════════════════════════
print("Building engine pods...")

POD_POSITIONS = [
    (-HULL_W*0.38, -HULL_H*0.6, -HULL_L*0.3),
    ( HULL_W*0.38, -HULL_H*0.6, -HULL_L*0.3),
    (-HULL_W*0.38, -HULL_H*0.6,  HULL_L*0.3),
    ( HULL_W*0.38, -HULL_H*0.6,  HULL_L*0.3),
]

for pi, (px, py, pz) in enumerate(POD_POSITIONS):
    # Pod body
    bm_pod = bmesh.new()
    SEG = 16; POD_R = 5.5; POD_L = 28.0
    rows_pod = []
    for li2 in range(18):
        t = li2 / 17
        z_pod = pz - POD_L/2 + t*POD_L
        # Taper ends
        r = POD_R * (1 - (abs(t*2-1)**2)*0.45)
        row = []
        for ci in range(SEG):
            a = (ci/SEG)*math.pi*2
            row.append(bm_pod.verts.new((px+r*math.cos(a), py+r*math.sin(a), z_pod)))
        rows_pod.append(row)
    for li2 in range(17):
        for ci in range(SEG):
            ni = (ci+1)%SEG
            bm_pod.faces.new([rows_pod[li2][ci], rows_pod[li2][ni],
                               rows_pod[li2+1][ni], rows_pod[li2+1][ci]])
    # End caps
    for end_r in [rows_pod[0], rows_pod[-1]]:
        cx = sum(v.co.x for v in end_r)/SEG
        cy = sum(v.co.y for v in end_r)/SEG
        cz = sum(v.co.z for v in end_r)/SEG
        center = bm_pod.verts.new((cx,cy,cz))
        for ci in range(SEG):
            ni = (ci+1)%SEG
            bm_pod.faces.new([end_r[ni], end_r[ci], center] if end_r is rows_pod[0]
                              else [end_r[ci], end_r[ni], center])
    bm_pod.normal_update()
    pod_mesh = bpy.data.meshes.new(f"Pod{pi}"); bm_pod.to_mesh(pod_mesh); bm_pod.free()
    pod_obj = bpy.data.objects.new(f"EnginePod{pi}", pod_mesh)
    bpy.context.collection.objects.link(pod_obj)
    pod_obj.data.materials.append(mat_engine)
    for p in pod_mesh.polygons: p.use_smooth = True

    # Exhaust ring (glowing)
    for ez in [pz + POD_L/2]:
        cyl_obj(f"Exhaust{pi}", POD_R*0.72, 1.8, seg=14,
                mat=mat_exhaust, x=px, y=py, z=ez)

    # Strut connecting pod to hull
    bm_strut = bmesh.new()
    sx, sy0, sz = px*0.5, py + POD_R, pz
    sy1 = -HULL_H/2
    vs = [bm_strut.verts.new(c) for c in [
        (sx-1.5, sy0, sz-1.5), (sx+1.5, sy0, sz-1.5),
        (sx+1.5, sy0, sz+1.5), (sx-1.5, sy0, sz+1.5),
        (sx-1.0, sy1, sz-1.0), (sx+1.0, sy1, sz-1.0),
        (sx+1.0, sy1, sz+1.0), (sx-1.0, sy1, sz+1.0),
    ]]
    for f in [(0,1,2,3),(4,5,6,7),(0,1,5,4),(2,3,7,6),(0,3,7,4),(1,2,6,5)]:
        bm_strut.faces.new([vs[i] for i in f])
    bm_strut.normal_update()
    strut_mesh = bpy.data.meshes.new(f"Strut{pi}"); bm_strut.to_mesh(strut_mesh); bm_strut.free()
    strut_obj = bpy.data.objects.new(f"Strut{pi}", strut_mesh)
    bpy.context.collection.objects.link(strut_obj)
    strut_obj.data.materials.append(mat_hull)

# ─── Export ─────────────────────────────────────────────────────────
print("\nExporting carrier.glb...")
bpy.ops.object.select_all(action='SELECT')
path = OUTPUT_DIR + "carrier.glb"
bpy.ops.export_scene.gltf(
    filepath=path, export_format='GLB',
    use_selection=True, export_apply=True,
    export_colors=True, export_normals=True, export_yup=True,
    export_materials='EXPORT',
)
elapsed = time.time() - t0
fsize = os.path.getsize(path)/1024
print(f"\n=== Done! ({elapsed:.0f}s) ===")
print(f"Output: {path} ({fsize:.0f} KB)")
