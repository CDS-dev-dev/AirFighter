"""
AirFighter Aircraft Generator
==============================
Generates: fighter.glb, heli.glb, bomber.glb
Axis convention: -Z = nose (forward), +Y = up

Run: blender --background --python blender/gen_aircraft.py
"""
import bpy, bmesh, math, os, time

OUTPUT_DIR = "/workspaces/AirFighter/public/models/"
os.makedirs(OUTPUT_DIR, exist_ok=True)
t_start = time.time()

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)

def select_all_obj():
    bpy.ops.object.select_all(action='SELECT')

def export_glb(name):
    path = OUTPUT_DIR + name + ".glb"
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB',
        use_selection=True, export_apply=True,
        export_normals=True, export_yup=True,
        export_materials='EXPORT',
    )
    print(f"  -> {path} ({os.path.getsize(path)//1024} KB)")

def new_mat_pbr(name, r, g, b, roughness=0.35, metallic=0.88):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value  = roughness
    bsdf.inputs['Metallic'].default_value   = metallic
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def new_mat_glass(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.5, 0.75, 0.95, 1.0)
    bsdf.inputs['Roughness'].default_value  = 0.05
    bsdf.inputs['Alpha'].default_value      = 0.22
    bsdf.inputs['IOR'].default_value        = 1.45
    bsdf.inputs['Transmission'].default_value = 0.9
    mat.blend_method = 'BLEND'
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def new_mat_emissive(name, r, g, b, strength=8.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em  = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value    = (r, g, b, 1.0)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat

def add_bm_obj(name, bm, mat=None, smooth=True):
    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    mesh = bpy.data.meshes.new(name + "_M")
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    if smooth:
        for p in mesh.polygons: p.use_smooth = True
    return obj

def tube_ring(bm, cx, cy, cz, rx, ry, seg):
    """Return list of bmesh verts forming an elliptical ring."""
    row = []
    for i in range(seg):
        a = (i/seg)*math.pi*2
        row.append(bm.verts.new((cx + rx*math.cos(a), cy + ry*math.sin(a), cz)))
    return row

def bridge_rings(bm, r1, r2):
    """Connect two rings of equal segment count with quads."""
    seg = len(r1)
    for i in range(seg):
        ni = (i+1)%seg
        bm.faces.new([r1[i], r1[ni], r2[ni], r2[i]])

def cap_ring(bm, ring, cx, cy, cz, inward=False):
    """Cap a ring with triangles to a center vertex."""
    c = bm.verts.new((cx, cy, cz))
    seg = len(ring)
    for i in range(seg):
        ni = (i+1)%seg
        if inward:
            bm.faces.new([ring[ni], ring[i], c])
        else:
            bm.faces.new([ring[i], ring[ni], c])

def wing_panel(bm, verts_bot, verts_top, flip=False):
    """Build faces for a wing section from 4-vert bottom and top lists."""
    n = len(verts_bot)
    if not flip:
        bm.faces.new(verts_bot)
        bm.faces.new(list(reversed(verts_top)))
        for i in range(n-1):
            bm.faces.new([verts_bot[i], verts_bot[i+1], verts_top[i+1], verts_top[i]])
        bm.faces.new([verts_bot[-1], verts_bot[0], verts_top[0], verts_top[-1]])
    else:
        bm.faces.new(list(reversed(verts_bot)))
        bm.faces.new(verts_top)
        for i in range(n-1):
            bm.faces.new([verts_top[i], verts_top[i+1], verts_bot[i+1], verts_bot[i]])
        bm.faces.new([verts_top[-1], verts_top[0], verts_bot[0], verts_bot[-1]])

# ═══════════════════════════════════════════════════════════════════
#  1. FIGHTER JET  (~12m long, 9m span, twin engine)
#     -Z = nose, +Z = tail, +Y = up
# ═══════════════════════════════════════════════════════════════════
def gen_fighter():
    print("\n[1/3] Generating fighter...")
    clear_scene()

    m_body = new_mat_pbr("FBody",  0.22, 0.25, 0.30, 0.28, 0.90)
    m_dark = new_mat_pbr("FDark",  0.12, 0.14, 0.18, 0.40, 0.85)
    m_glass= new_mat_glass("FGlass")
    m_noz  = new_mat_emissive("FNoz", 1.0, 0.42, 0.08)

    # ── Fuselage (elliptical cross-section lofted along Z) ──
    SEG = 14
    # (z, rx, ry, cy_offset)
    stations = [
        (-6.0, 0.04, 0.04, 0.00),  # nose tip
        (-5.2, 0.18, 0.15, 0.00),  # nose
        (-3.8, 0.34, 0.28, 0.02),  # forward
        (-2.2, 0.44, 0.36, 0.04),  # cockpit
        (-0.5, 0.46, 0.38, 0.03),  # intake
        ( 1.0, 0.44, 0.36, 0.00),  # engine front
        ( 2.8, 0.42, 0.34, 0.00),  # engine mid
        ( 4.2, 0.38, 0.30, 0.00),  # engine rear
        ( 5.2, 0.30, 0.25, 0.00),  # nozzle
        ( 5.8, 0.22, 0.20, 0.00),  # tail
    ]
    bm = bmesh.new()
    rings = [tube_ring(bm, 0, cy, z, rx, ry, SEG) for (z, rx, ry, cy) in stations]
    for i in range(len(rings)-1): bridge_rings(bm, rings[i], rings[i+1])
    cap_ring(bm, rings[0],  0, 0, -6.0, inward=True)
    cap_ring(bm, rings[-1], 0, 0,  5.8, inward=False)
    add_bm_obj("Fuselage", bm, m_body)

    # ── Delta wings ──
    SEG_W = 4  # span-wise divisions
    bm = bmesh.new()
    for side in [-1, 1]:
        s = side
        # Root chord: z=-1.8 to z=+3.8, tip: z=+0.5 to z=+3.0
        pts_le = [(s*0.46, -1.8), (s*4.6, 0.8)]   # leading edge: (x,z)
        pts_te = [(s*0.46,  3.8), (s*4.6, 3.0)]   # trailing edge
        T = 0.07  # half-thickness
        bot = []
        top = []
        for ti in range(SEG_W+1):
            t = ti/SEG_W
            x_le = pts_le[0][0] + t*(pts_le[1][0]-pts_le[0][0])
            z_le = pts_le[0][1] + t*(pts_le[1][1]-pts_le[0][1])
            x_te = pts_te[0][0] + t*(pts_te[1][0]-pts_te[0][0])
            z_te = pts_te[0][1] + t*(pts_te[1][1]-pts_te[0][1])
            # two verts per span station: LE and TE
            bot.append(bm.verts.new((x_le, -T, z_le)))
            bot.append(bm.verts.new((x_te, -T, z_te)))
            top.append(bm.verts.new((x_le,  T, z_le)))
            top.append(bm.verts.new((x_te,  T, z_te)))
        # Faces between span stations
        for ti in range(SEG_W):
            i = ti*2
            if s == 1:
                bm.faces.new([bot[i], bot[i+1], bot[i+3], bot[i+2]])
                bm.faces.new([top[i+2], top[i+3], top[i+1], top[i]])
                bm.faces.new([bot[i], top[i], top[i+2], bot[i+2]])    # LE face
                bm.faces.new([bot[i+1], bot[i+3], top[i+3], top[i+1]])  # TE face
            else:
                bm.faces.new([bot[i+2], bot[i+3], bot[i+1], bot[i]])
                bm.faces.new([top[i], top[i+1], top[i+3], top[i+2]])
                bm.faces.new([bot[i+2], bot[i], top[i], top[i+2]])
                bm.faces.new([bot[i+3], bot[i+1], top[i+1], top[i+3]])
        # Wing tip
        tip_i = SEG_W*2
        if s == 1:
            bm.faces.new([bot[tip_i], top[tip_i], top[tip_i+1], bot[tip_i+1]])
        else:
            bm.faces.new([bot[tip_i+1], top[tip_i+1], top[tip_i], bot[tip_i]])
    add_bm_obj("Wings", bm, m_body)

    # ── Horizontal stabilizers ──
    bm = bmesh.new()
    T = 0.055
    for side in [-1, 1]:
        s = side
        pts = [(s*0.44, 3.0, -T), (s*2.4, 4.0, -T), (s*2.4, 5.2, -T), (s*0.44, 4.9, -T)]
        bot = [bm.verts.new(p) for p in pts]
        top = [bm.verts.new((p[0], p[1], T)) for p in pts]
        if s == 1:
            bm.faces.new(bot)
            bm.faces.new(list(reversed(top)))
            for i in range(4):
                bm.faces.new([bot[i], top[i], top[(i+1)%4], bot[(i+1)%4]])
        else:
            bm.faces.new(list(reversed(bot)))
            bm.faces.new(top)
            for i in range(4):
                bm.faces.new([bot[(i+1)%4], top[(i+1)%4], top[i], bot[i]])
    add_bm_obj("HStab", bm, m_dark)

    # ── Twin V-tail fins (canted outward 15°) ──
    bm = bmesh.new()
    cant_ang = math.radians(15)
    for side in [-1, 1]:
        s = side
        cant = s * math.sin(cant_ang)
        up   = math.cos(cant_ang)
        # Base corners at z=2.5, top corners at z=4.8
        z0, z1 = 2.8, 5.0
        H = 2.0
        pts = [
            (s*0.44 + cant*0,  0,           z0),
            (s*0.44 + cant*H,  up*H,        z0),
            (s*0.44 + cant*H,  up*H,        z1),
            (s*0.44 + cant*0,  0,           z1),
        ]
        T = 0.06
        normal_x = -s * up   # outward normal component
        normal_y =  s * cant
        bot = [bm.verts.new(p) for p in pts]
        top = [bm.verts.new((p[0]+normal_x*T, p[1]+normal_y*T, p[2])) for p in pts]
        if s == 1:
            bm.faces.new(bot)
            bm.faces.new(list(reversed(top)))
            for i in range(4):
                bm.faces.new([bot[i], top[i], top[(i+1)%4], bot[(i+1)%4]])
        else:
            bm.faces.new(list(reversed(bot)))
            bm.faces.new(top)
            for i in range(4):
                bm.faces.new([bot[(i+1)%4], top[(i+1)%4], top[i], bot[i]])
    add_bm_obj("VTail", bm, m_body)

    # ── Cockpit canopy (dome) ──
    bm = bmesh.new()
    CSEG = 12  # circumference segments
    CSTEP = 6  # length steps
    z_start, z_end = -3.8, -1.4
    for ri in range(CSTEP):
        t = ri/(CSTEP-1)
        cz = z_start + t*(z_end - z_start)
        h = 0.38 * math.sin(t * math.pi)  # height profile
        for i in range(CSEG):
            a = (i/CSEG) * math.pi  # half circle (top)
            x = 0.26 * math.cos(a)
            y = 0.40 + h * 0.7 * math.sin(a)
            bm.verts.new((x, y, cz))
    bm.verts.ensure_lookup_table()
    for ri in range(CSTEP-1):
        for ci in range(CSEG-1):
            idx = ri*CSEG + ci
            bm.faces.new([bm.verts[idx], bm.verts[idx+1],
                           bm.verts[idx+CSEG+1], bm.verts[idx+CSEG]])
    add_bm_obj("Canopy", bm, m_glass)

    # ── Engine intakes (twin, cheek-mounted) ──
    bm = bmesh.new()
    ISEG = 12
    for side in [-1, 1]:
        s = side
        ox, oy = s*0.35, -0.12
        prev = None
        for zi, (z, rx, ry) in enumerate([(-0.2, 0.24, 0.20), (2.8, 0.22, 0.18), (4.4, 0.20, 0.16)]):
            row = tube_ring(bm, ox, oy, z, rx, ry, ISEG)
            if prev:
                bridge_rings(bm, prev, row)
            else:
                cap_ring(bm, row, ox, oy, z, inward=True)
            prev = row
    add_bm_obj("Intakes", bm, m_dark)

    # ── Engine nozzles (twin, glowing) ──
    bm = bmesh.new()
    NSEG = 12
    for side in [-1, 1]:
        s = side
        ox, oy = s*0.35, -0.12
        rows = []
        for (z, rx, ry) in [(4.6, 0.22, 0.18), (5.2, 0.20, 0.16), (5.6, 0.18, 0.15)]:
            rows.append(tube_ring(bm, ox, oy, z, rx, ry, NSEG))
        for i in range(len(rows)-1): bridge_rings(bm, rows[i], rows[i+1])
        cap_ring(bm, rows[-1], ox, oy, 5.6, inward=False)
    add_bm_obj("Nozzles", bm, m_noz)

    # ── Wing pylons + missiles ──
    bm = bmesh.new()
    for span in [-3.2, -1.6, 1.6, 3.2]:
        # Missile: simple cylinder
        MSEG = 8
        mz0, mz1 = -0.8, 0.8
        prow, crow = None, None
        for mz in [mz0, mz1]:
            row = tube_ring(bm, span, -0.48, mz, 0.065, 0.065, MSEG)
            if prow: bridge_rings(bm, prow, row)
            else:    cap_ring(bm, row, span, -0.48, mz0, inward=True)
            prow = row
        cap_ring(bm, prow, span, -0.48, mz1, inward=False)
    add_bm_obj("Missiles", bm, new_mat_pbr("Msl", 0.75, 0.75, 0.72, 0.28, 0.70))

    select_all_obj()
    export_glb("fighter")

# ═══════════════════════════════════════════════════════════════════
#  2. MILITARY HELICOPTER  (~10m long)
#     -X = nose, +X = tail, +Y = up (rotated to match in Three.js)
#     Actually keep same convention: -Z = nose
# ═══════════════════════════════════════════════════════════════════
def gen_heli():
    print("\n[2/3] Generating helicopter...")
    clear_scene()

    m_body  = new_mat_pbr("HBody",  0.25, 0.30, 0.22, 0.78, 0.08)  # olive drab
    m_dark  = new_mat_pbr("HDark",  0.15, 0.18, 0.14, 0.82, 0.05)
    m_glass = new_mat_glass("HGlass")
    m_blade = new_mat_pbr("HBlade", 0.18, 0.20, 0.18, 0.60, 0.70)

    # ── Main body (ellipsoid-like, nose at -Z) ──
    SEG = 14
    # (z, rx, ry, cy) -- nose at -5, tail connection at +3
    stations = [
        (-5.0, 0.30, 0.38, 0.00),  # nose
        (-3.5, 0.80, 0.95, 0.10),  # cockpit
        (-1.5, 1.00, 1.10, 0.12),  # cabin front
        ( 0.5, 1.00, 1.05, 0.10),  # cabin mid
        ( 2.5, 0.80, 0.82, 0.05),  # cabin rear
        ( 3.8, 0.38, 0.42, 0.00),  # boom start
    ]
    bm = bmesh.new()
    rings = [tube_ring(bm, 0, cy, z, rx, ry, SEG) for (z, rx, ry, cy) in stations]
    for i in range(len(rings)-1): bridge_rings(bm, rings[i], rings[i+1])
    cap_ring(bm, rings[0],  0, 0, -5.0, inward=True)
    cap_ring(bm, rings[-1], 0, 0,  3.8, inward=False)
    add_bm_obj("HBody", bm, m_body)

    # ── Cockpit glass ──
    bm = bmesh.new()
    CSEG = 10; CSTEP = 5
    for ri in range(CSTEP):
        t = ri/(CSTEP-1)
        cz = -5.0 + t * 3.2
        cr = 0.8 * math.sin(t * math.pi * 0.85 + 0.15)
        for i in range(CSEG):
            a = (i/CSEG)*math.pi  # top half
            bm.verts.new((cr*1.1*math.cos(a), 0.12 + cr*0.9*math.sin(a), cz))
    bm.verts.ensure_lookup_table()
    for ri in range(CSTEP-1):
        for ci in range(CSEG-1):
            idx = ri*CSEG + ci
            bm.faces.new([bm.verts[idx], bm.verts[idx+1],
                           bm.verts[idx+CSEG+1], bm.verts[idx+CSEG]])
    add_bm_obj("HCockpit", bm, m_glass)

    # ── Tail boom ──
    bm = bmesh.new()
    TSEG = 10
    boom_stations = [(z, 0.36*(1-i*0.06)) for i, z in enumerate([3.8,4.5,5.2,6.0,6.8,7.5,8.2])]
    prev = None
    for (z, r) in boom_stations:
        row = tube_ring(bm, 0, 0, z, r, r*0.9, TSEG)
        if prev: bridge_rings(bm, prev, row)
        prev = row
    add_bm_obj("TailBoom", bm, m_body)

    # ── Tail fin (vertical) ──
    bm = bmesh.new()
    T = 0.10
    tail_pts = [(-0.1,0,7.5),(0.1,0,7.5),(0.1,0,8.8),(-0.1,2.2,7.8),(-0.1,2.2,8.8)]
    fin_pts = [
        (0, 0.0, 7.5), (0, 0.0, 8.8),
        (0, 2.2, 8.8), (0, 2.2, 7.8),
    ]
    bot = [bm.verts.new(p) for p in fin_pts]
    top = [bm.verts.new((p[0]+T, p[1], p[2])) for p in fin_pts]
    bm.faces.new(bot)
    bm.faces.new(list(reversed(top)))
    for i in range(4): bm.faces.new([bot[i], top[i], top[(i+1)%4], bot[(i+1)%4]])
    add_bm_obj("TailFin", bm, m_body)

    # ── Tail rotor ──
    bm = bmesh.new()
    TRSEG = 8
    # Hub
    hub_r = tube_ring(bm, 0, 0, 8.6, 0.18, 0.18, TRSEG)
    cap_ring(bm, hub_r, 0, 0, 8.6, inward=True)
    # 2 blades (in Y-Z plane)
    for bi in range(2):
        angle = bi * math.pi
        cy, cz = math.cos(angle), math.sin(angle)
        for span in [0.2, 1.6]:
            bm.verts.new((-0.06, span*cy - 0.09*cz, 8.6 + span*cz + 0.09*cy))
            bm.verts.new(( 0.06, span*cy - 0.09*cz, 8.6 + span*cz + 0.09*cy))
    bm.verts.ensure_lookup_table()
    base = TRSEG + 1
    for bi in range(2):
        i = base + bi*4
        bm.faces.new([bm.verts[i], bm.verts[i+1], bm.verts[i+3], bm.verts[i+2]])
    add_bm_obj("TailRotor", bm, m_blade)

    # ── Rotor shaft ──
    bm = bmesh.new()
    SSEG = 10
    prev = None
    for (z, r) in [(-0.3, 0.18), (0.5, 0.18), (1.2, 0.22)]:
        row = tube_ring(bm, 0, 1.12, -z, r, r, SSEG)  # z is actually Y here — oops
        # Let me just use Y-axis for the shaft (pointing up)
    # Redo: shaft goes up from top of body
    bm2 = bmesh.new()
    prev2 = None
    for (y, r) in [(1.12, 0.20), (1.50, 0.18), (1.80, 0.22)]:
        row2 = []
        for i in range(SSEG):
            a = (i/SSEG)*math.pi*2
            row2.append(bm2.verts.new((r*math.cos(a), y, r*math.sin(a))))
        if prev2: bridge_rings(bm2, prev2, row2)
        prev2 = row2
    add_bm_obj("RotorShaft", bm2, m_dark)
    bm.free()

    # ── Main rotor (4 blades) ──
    bm = bmesh.new()
    Y_ROTOR = 1.82
    for bi in range(4):
        angle = bi * math.pi/2
        ca, sa = math.cos(angle), math.sin(angle)
        for span in [0.3, 4.8]:
            chord = 0.38 * (1 - (span-0.3)/(4.8-0.3) * 0.3)
            px = span*ca
            pz = span*sa
            # Leading edge
            bm.verts.new((px - chord/2*sa, Y_ROTOR + 0.02, pz + chord/2*ca))
            # Trailing edge
            bm.verts.new((px + chord/2*sa, Y_ROTOR - 0.02, pz - chord/2*ca))
    bm.verts.ensure_lookup_table()
    for bi in range(4):
        idx = bi*4
        bm.faces.new([bm.verts[idx], bm.verts[idx+1], bm.verts[idx+3], bm.verts[idx+2]])
    add_bm_obj("MainRotor", bm, m_blade)

    # ── Landing skids ──
    bm = bmesh.new()
    for side in [-0.9, 0.9]:
        s = side
        # Horizontal skid bar
        vs = [
            bm.verts.new((-3.5, -1.15, s-0.07)), bm.verts.new(( 2.8, -1.15, s-0.07)),
            bm.verts.new(( 2.8, -1.15, s+0.07)), bm.verts.new((-3.5, -1.15, s+0.07)),
            bm.verts.new((-3.5, -1.05, s-0.07)), bm.verts.new(( 2.8, -1.05, s-0.07)),
            bm.verts.new(( 2.8, -1.05, s+0.07)), bm.verts.new((-3.5, -1.05, s+0.07)),
        ]
        for f in [(0,1,2,3),(4,5,6,7),(0,1,5,4),(2,3,7,6),(0,3,7,4),(1,2,6,5)]:
            bm.faces.new([vs[i] for i in f])
        # Struts (2 per side)
        for sx in [-1.5, 1.5]:
            sv = [
                bm.verts.new((sx-0.08,-1.15,s-0.07)), bm.verts.new((sx+0.08,-1.15,s-0.07)),
                bm.verts.new((sx+0.08,-1.15,s+0.07)), bm.verts.new((sx-0.08,-1.15,s+0.07)),
                bm.verts.new((sx-0.08,-0.55,s-0.07)), bm.verts.new((sx+0.08,-0.55,s-0.07)),
                bm.verts.new((sx+0.08,-0.55,s+0.07)), bm.verts.new((sx-0.08,-0.55,s+0.07)),
            ]
            for f in [(0,1,2,3),(4,5,6,7),(0,1,5,4),(2,3,7,6),(0,3,7,4),(1,2,6,5)]:
                bm.faces.new([sv[i] for i in f])
    add_bm_obj("Skids", bm, m_dark, smooth=False)

    select_all_obj()
    export_glb("heli")

# ═══════════════════════════════════════════════════════════════════
#  3. STRATEGIC BOMBER  (~28m long, 34m span)
# ═══════════════════════════════════════════════════════════════════
def gen_bomber():
    print("\n[3/3] Generating bomber...")
    clear_scene()

    m_body = new_mat_pbr("BBody",  0.54, 0.56, 0.52, 0.52, 0.28)  # light gray
    m_dark = new_mat_pbr("BDark",  0.32, 0.34, 0.32, 0.58, 0.48)
    m_noz  = new_mat_emissive("BNoz", 1.0, 0.48, 0.08)
    m_glass= new_mat_glass("BGlass")

    # ── Fuselage ──
    SEG = 16
    stations = [
        (-14.0, 0.35, 0.38, 0),  # nose
        (-11.0, 1.60, 1.80, 0),
        ( -7.0, 2.40, 2.60, 0),
        ( -3.0, 2.70, 2.90, 0),
        (  0.0, 2.80, 3.00, 0),  # max width
        (  4.0, 2.70, 2.85, 0),
        (  8.0, 2.30, 2.50, 0),
        ( 11.0, 1.70, 1.90, 0),
        ( 13.0, 0.90, 1.00, 0),
        ( 14.0, 0.30, 0.32, 0),  # tail
    ]
    bm = bmesh.new()
    rings = [tube_ring(bm, 0, cy, z, rx, ry, SEG) for (z, rx, ry, cy) in stations]
    for i in range(len(rings)-1): bridge_rings(bm, rings[i], rings[i+1])
    cap_ring(bm, rings[0],  0, 0, -14.0, inward=True)
    cap_ring(bm, rings[-1], 0, 0,  14.0, inward=False)
    add_bm_obj("BFuselage", bm, m_body)

    # ── Wings (large swept) ──
    SEG_W = 5
    bm = bmesh.new()
    T = 0.45  # wing half-thickness at root, tapers to tip
    for side in [-1, 1]:
        s = side
        # Wing: root at x=2.5, tip at x=17, swept back
        root_z_le, root_z_te = -8.0,  5.0
        tip_z_le,  tip_z_te  =  1.5,  9.0
        root_x = s * 2.5
        tip_x  = s * 17.0
        bot_pts = []
        top_pts = []
        for ti in range(SEG_W+1):
            t = ti/SEG_W
            x   = root_x + t*(tip_x - root_x)
            z_le = root_z_le + t*(tip_z_le - root_z_le)
            z_te = root_z_te + t*(tip_z_te - root_z_te)
            thick = T * (1 - t*0.7)
            bot_pts.append((x, -thick, z_le))
            bot_pts.append((x, -thick, z_te))
            top_pts.append((x,  thick, z_le))
            top_pts.append((x,  thick, z_te))
        for ti in range(SEG_W):
            i = ti*2
            if s == 1:
                bm.faces.new([bm.verts.new(bot_pts[i]), bm.verts.new(bot_pts[i+2]),
                               bm.verts.new(bot_pts[i+3]), bm.verts.new(bot_pts[i+1])])
                bm.faces.new([bm.verts.new(top_pts[i+1]), bm.verts.new(top_pts[i+3]),
                               bm.verts.new(top_pts[i+2]), bm.verts.new(top_pts[i])])
            else:
                bm.faces.new([bm.verts.new(bot_pts[i+1]), bm.verts.new(bot_pts[i+3]),
                               bm.verts.new(bot_pts[i+2]), bm.verts.new(bot_pts[i])])
                bm.faces.new([bm.verts.new(top_pts[i]), bm.verts.new(top_pts[i+2]),
                               bm.verts.new(top_pts[i+3]), bm.verts.new(top_pts[i+1])])
    add_bm_obj("BWings", bm, m_body)

    # ── Horizontal tail ──
    bm = bmesh.new()
    T2 = 0.22
    for side in [-1, 1]:
        s = side
        pts = [
            (s*2.2, -T2, 10.0), (s*9.0, -T2, 12.5), (s*9.0, -T2, 14.0), (s*2.2, -T2, 13.5),
            (s*2.2,  T2, 10.0), (s*9.0,  T2, 12.5), (s*9.0,  T2, 14.0), (s*2.2,  T2, 13.5),
        ]
        bot = [bm.verts.new(p[:3]) for p in pts[:4]]
        top = [bm.verts.new(p[:3]) for p in pts[4:]]
        if s == 1:
            bm.faces.new(bot)
            bm.faces.new(list(reversed(top)))
            for i in range(4): bm.faces.new([bot[i], top[i], top[(i+1)%4], bot[(i+1)%4]])
        else:
            bm.faces.new(list(reversed(bot)))
            bm.faces.new(top)
            for i in range(4): bm.faces.new([bot[(i+1)%4], top[(i+1)%4], top[i], bot[i]])
    add_bm_obj("BHTail", bm, m_body)

    # ── Vertical tail (tall, single) ──
    bm = bmesh.new()
    T3 = 0.30
    pts = [(0, 0, 9.0), (0, 5.5, 11.0), (0, 5.5, 13.8), (0, 0.3, 13.5)]
    bot = [bm.verts.new(p) for p in pts]
    top = [bm.verts.new((p[0]+T3, p[1], p[2])) for p in pts]
    bm.faces.new(bot)
    bm.faces.new(list(reversed(top)))
    for i in range(4): bm.faces.new([bot[i], top[i], top[(i+1)%4], bot[(i+1)%4]])
    add_bm_obj("BVTail", bm, m_body)

    # ── Engine pods (4 under wings, twin nacelles) ──
    bm = bmesh.new()
    PSEG = 12
    pod_specs = [
        (-1, 5.5), (-1, 10.0), (1, 5.5), (1, 10.0)
    ]  # (side, span)
    for (side, span) in pod_specs:
        px = side * span
        py = -3.2
        prev = None
        for (pz, pr) in [(-5.5,0.55),(-3.0,0.62),(0.0,0.65),(2.5,0.62),(4.5,0.55)]:
            row = tube_ring(bm, px, py, pz, pr, pr*0.85, PSEG)
            if prev: bridge_rings(bm, prev, row)
            else:    cap_ring(bm, row, px, py, -5.5, inward=True)
            prev = row
    add_bm_obj("Engines", bm, m_dark)

    # ── Nozzles ──
    bm = bmesh.new()
    NSEG = 12
    for (side, span) in pod_specs:
        px = side * span
        py = -3.2
        row = tube_ring(bm, px, py, 4.5, 0.52, 0.44, NSEG)
        cap_ring(bm, row, px, py, 5.0, inward=False)
    add_bm_obj("BNozzles", bm, m_noz)

    # ── Cockpit windows ──
    bm = bmesh.new()
    for side in [-1, 1]:
        s = side
        bm.faces.new([
            bm.verts.new((s*0.8, 0.9, -13.5)),
            bm.verts.new((s*1.4, 1.0, -11.5)),
            bm.verts.new((s*1.6, 2.2, -11.0)),
            bm.verts.new((s*0.9, 2.4, -13.0)),
        ])
    add_bm_obj("BCockpit", bm, m_glass, smooth=False)

    select_all_obj()
    export_glb("bomber")

# ─── Run ─────────────────────────────────────────────────────────
gen_fighter()
gen_heli()
gen_bomber()

print(f"\n=== Aircraft done! ({time.time()-t_start:.0f}s) ===")
