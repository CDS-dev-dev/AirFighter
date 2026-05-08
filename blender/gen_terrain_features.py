"""
AirFighter Terrain Feature Generator
=====================================
Rock pillars, natural arches, and boulders with realistic surfaces.
Run: blender --background --python gen_terrain_features.py
"""
import bpy, bmesh, math, os, time

OUTPUT_DIR = "/workspaces/AirFighter/public/models/"
os.makedirs(OUTPUT_DIR, exist_ok=True)

t0 = time.time()

# ─── Math helpers ───────────────────────────────────────────────────
def hash3(x, y, z):
    n = math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
    return n - math.floor(n)

def value3(x, y, z):
    ix, iy, iz = int(math.floor(x)), int(math.floor(y)), int(math.floor(z))
    fx, fy, fz = x-ix, y-iy, z-iz
    ux = fx*fx*(3-2*fx); uy = fy*fy*(3-2*fy); uz = fz*fz*(3-2*fz)
    def h(a,b,c): return hash3(a,b,c)
    return (h(ix,iy,iz)*(1-ux)*(1-uy)*(1-uz) + h(ix+1,iy,iz)*ux*(1-uy)*(1-uz) +
            h(ix,iy+1,iz)*(1-ux)*uy*(1-uz)   + h(ix+1,iy+1,iz)*ux*uy*(1-uz) +
            h(ix,iy,iz+1)*(1-ux)*(1-uy)*uz   + h(ix+1,iy,iz+1)*ux*(1-uy)*uz +
            h(ix,iy+1,iz+1)*(1-ux)*uy*uz     + h(ix+1,iy+1,iz+1)*ux*uy*uz)

def fbm3(x, y, z, oct=5):
    t, a, f, n = 0.0, 0.5, 1.0, 0.0
    for _ in range(oct):
        t += value3(x*f, y*f, z*f)*a; n+=a; a*=0.5; f*=2.07
    return t/n

def clamp01(v): return max(0.0, min(1.0, v))
def lerp(a,b,t): return a+(b-a)*t

# ─── Scene helpers ───────────────────────────────────────────────────
def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for m in list(bpy.data.meshes): bpy.data.meshes.remove(m)
    for m in list(bpy.data.materials): bpy.data.materials.remove(m)
    for t in list(bpy.data.textures): bpy.data.textures.remove(t)

def apply_smooth(obj):
    for p in obj.data.polygons: p.use_smooth = True
    obj.data.calc_normals_split()

def make_rock_mat(obj, name="Rock"):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear()
    out  = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    vcol = nt.nodes.new('ShaderNodeVertexColor'); vcol.layer_name = "Col"
    bsdf.inputs['Roughness'].default_value = 0.94
    bsdf.inputs['Metallic'].default_value  = 0.0
    nt.links.new(vcol.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(bsdf.outputs['BSDF'],  out.inputs['Surface'])
    obj.data.materials.append(mat)

def export_glb(name, obj):
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    path = OUTPUT_DIR + name + ".glb"
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB',
        use_selection=True, export_apply=True,
        export_colors=True, export_normals=True, export_yup=True,
        export_materials='EXPORT',
    )
    size = os.path.getsize(path)/1024
    print(f"  → {path} ({size:.0f} KB)")

# ═══════════════════════════════════════════════════════════════════
#  1. ROCK PILLAR
#     Tall spire with multi-layered noise erosion + vertex color
# ═══════════════════════════════════════════════════════════════════
def gen_rock_pillar():
    print("\n[1/3] Generating rock_pillar...")
    clear_scene()
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    SEG  = 24   # around circumference
    VSTEP = 36  # vertical steps
    H    = 1.0  # normalized height (scaled in Three.js)
    BASE_R = 0.26
    TOP_R  = 0.048

    vgrid = []
    for j in range(VSTEP + 1):
        t = j / VSTEP
        y = t * H
        # Profile: wide base, slight belly, narrow top
        profile = BASE_R*(1-t) + TOP_R*t
        profile *= (1.0
            + 0.14 * math.sin(t*math.pi*1.0)        # single bulge
            + 0.08 * math.sin(t*math.pi*3.5 + 0.4)  # mid waist
            + 0.04 * math.sin(t*math.pi*8.1 - 0.7)) # small ribs
        row = []
        for i in range(SEG):
            a = (i / SEG) * math.pi * 2
            # Large erosion grooves
            groove = 1.0 + 0.18*math.sin(a*3 + t*5.2) + 0.10*math.sin(a*5 - t*3.7)
            # Fine surface texture
            px = profile*groove*math.cos(a)
            pz = profile*groove*math.sin(a)
            fine = fbm3(px*8 + 2.1, y*12 + 1.5, pz*8 - 0.9, 4) * 0.03
            v = bm.verts.new((px + fine*math.cos(a), y, pz + fine*math.sin(a)))
            row.append(v)
        vgrid.append(row)

    # Side faces
    for j in range(VSTEP):
        for i in range(SEG):
            ni = (i+1) % SEG
            bm.faces.new([vgrid[j][i], vgrid[j][ni], vgrid[j+1][ni], vgrid[j+1][i]])

    # Bottom cap
    cb = bm.verts.new((0, 0, 0))
    for i in range(SEG):
        bm.faces.new([vgrid[0][(i+1)%SEG], vgrid[0][i], cb])
    # Top cap
    ct = bm.verts.new((0, H, 0))
    for i in range(SEG):
        bm.faces.new([vgrid[-1][i], vgrid[-1][(i+1)%SEG], ct])

    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    # Vertex colors
    for face in bm.faces:
        for loop in face.loops:
            v = loop.vert
            t = v.co.y / H
            # Rock: dark base → lighter mid → slight snow top
            r = lerp(0.30, 0.52, t) + fbm3(v.co.x*6, v.co.y*4, v.co.z*6)*0.12
            g = lerp(0.25, 0.46, t) + fbm3(v.co.x*6+3, v.co.y*4, v.co.z*6)*0.10
            b = lerp(0.20, 0.38, t)
            # Groove darkening
            slope = math.sqrt(v.co.x**2 + v.co.z**2) / max(BASE_R, 0.001)
            r *= (0.85 + 0.15*slope); g *= (0.85 + 0.15*slope)
            loop[col_layer] = (clamp01(r), clamp01(g), clamp01(b), 1.0)

    mesh = bpy.data.meshes.new("PillarMesh")
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new("RockPillar", mesh)
    bpy.context.collection.objects.link(obj)

    # Subdivision for smoother surface
    sub = obj.modifiers.new("Sub", 'SUBSURF')
    sub.levels = 2; sub.render_levels = 2

    apply_smooth(obj)
    make_rock_mat(obj)
    export_glb("rock_pillar", obj)

# ═══════════════════════════════════════════════════════════════════
#  2. NATURAL ARCH
#     Stone arch: two legs + curved crown, all with surface erosion
# ═══════════════════════════════════════════════════════════════════
def gen_rock_arch():
    print("\n[2/3] Generating rock_arch...")
    clear_scene()
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    SPAN    = 1.0   # half-span each side (unit scale)
    HEIGHT  = 0.62  # keystone height
    THICK   = 0.18  # cross-section radius
    PSEG    = 28    # path segments (semicircle)
    CSEG    = 14    # cross-section segments

    # Build arch as swept tube along semicircular path
    all_rings = []
    for pi in range(PSEG + 1):
        t = pi / PSEG
        a = t * math.pi  # 0 → π
        # Path center
        px = -math.cos(a) * SPAN
        py = math.sin(a) * HEIGHT
        pz = 0.0

        # Path tangent (d/dt of path)
        tang = (-math.sin(a)*(-1)*SPAN, math.cos(a)*HEIGHT, 0.0)
        tlen = math.sqrt(tang[0]**2 + tang[1]**2)
        tang = (tang[0]/tlen, tang[1]/tlen, 0.0)

        # Binormal (cross product of tangent and Z)
        binorm = (-tang[1], tang[0], 0.0)  # rotate 90° in XY

        # Cross-section radius varies: thicker at legs, slimmer at keystone
        r = THICK * (0.78 + 0.32*(1 - math.sin(a)))

        ring = []
        for ci in range(CSEG):
            ca = (ci / CSEG) * math.pi * 2
            # Local cross-section point
            ln = math.cos(ca)  # along binormal
            lz = math.sin(ca)  # along Z

            # Noise erosion
            noise = fbm3(px*4+ln*2, py*4+lz*2, t*6, 4)*r*0.22

            wx = px + binorm[0]*ln*r + 0 + math.cos(ca)*noise*0.5
            wy = py + binorm[1]*ln*r + 0
            wz = pz + lz*r + math.sin(ca)*noise*0.5

            v = bm.verts.new((wx, wy, wz))
            ring.append(v)
        all_rings.append(ring)

    # Side faces of arch tube
    for pi in range(PSEG):
        for ci in range(CSEG):
            nci = (ci+1)%CSEG
            bm.faces.new([all_rings[pi][ci], all_rings[pi][nci],
                          all_rings[pi+1][nci], all_rings[pi+1][ci]])

    # End caps
    def cap_ring(ring):
        cx = sum(v.co.x for v in ring)/len(ring)
        cy = sum(v.co.y for v in ring)/len(ring)
        cz = sum(v.co.z for v in ring)/len(ring)
        center = bm.verts.new((cx, cy, cz))
        for ci in range(CSEG):
            bm.faces.new([ring[(ci+1)%CSEG], ring[ci], center])
    cap_ring(all_rings[0])
    cap_ring(all_rings[-1])

    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    # Vertex colors
    for face in bm.faces:
        for loop in face.loops:
            v = loop.vert
            t = clamp01(v.co.y / HEIGHT)
            r = lerp(0.35, 0.55, t) + fbm3(v.co.x*5, v.co.y*5, v.co.z*5)*0.14
            g = lerp(0.29, 0.47, t) + fbm3(v.co.x*5+2, v.co.y*5, v.co.z*5)*0.10
            b = lerp(0.22, 0.38, t)
            loop[col_layer] = (clamp01(r), clamp01(g), clamp01(b), 1.0)

    mesh = bpy.data.meshes.new("ArchMesh")
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new("RockArch", mesh)
    bpy.context.collection.objects.link(obj)

    sub = obj.modifiers.new("Sub", 'SUBSURF')
    sub.levels = 2; sub.render_levels = 2

    apply_smooth(obj)
    make_rock_mat(obj, "ArchRock")
    export_glb("rock_arch", obj)

# ═══════════════════════════════════════════════════════════════════
#  3. BOULDER CLUSTER
#     3-5 irregular boulders in a group
# ═══════════════════════════════════════════════════════════════════
def gen_boulder():
    print("\n[3/3] Generating boulder...")
    clear_scene()
    bm = bmesh.new()
    col_layer = bm.loops.layers.color.new("Col")

    BOULDERS = [
        (0.0,  0.0,  0.0, 0.38),
        (0.55, 0.0,  0.2, 0.26),
        (-0.4, 0.0, -0.3, 0.22),
        (0.1,  0.0,  0.55, 0.18),
        (-0.15, 0.0, 0.28, 0.14),
    ]

    all_verts = []
    for bx, by, bz, br in BOULDERS:
        SEGU, SEGV = 16, 12
        bverts = []
        for vi in range(SEGV + 1):
            phi = (vi / SEGV) * math.pi  # 0..π
            row = []
            for ui in range(SEGU):
                theta = (ui / SEGU) * math.pi * 2
                # Base sphere
                x = math.sin(phi)*math.cos(theta)
                y = math.cos(phi)
                z = math.sin(phi)*math.sin(theta)
                # Squash slightly
                y *= 0.7
                # Noise displacement for organic boulder shape
                noise = fbm3((bx+x)*5, (by+y)*5 + br*10, (bz+z)*5, 4)*0.28
                r = 1.0 + noise
                vx = bx + x*r*br*(0.9 + 0.2*math.cos(theta*2.3+0.7))
                vy = by + max(0, y*r*br)  # keep above ground
                vz = bz + z*r*br*(0.85 + 0.2*math.sin(theta*1.9-0.5))
                v = bm.verts.new((vx, vy, vz))
                row.append(v)
            bverts.append(row)

        for vi in range(SEGV):
            for ui in range(SEGU):
                nui = (ui+1)%SEGU
                if vi == 0:
                    bm.faces.new([bverts[vi][ui], bverts[vi][nui], bverts[vi+1][nui]])
                elif vi == SEGV-1:
                    bm.faces.new([bverts[vi][ui], bverts[vi+1][0], bverts[vi][nui]])
                else:
                    bm.faces.new([bverts[vi][ui], bverts[vi][nui],
                                  bverts[vi+1][nui], bverts[vi+1][ui]])
        all_verts.extend(bverts)

    bm.verts.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    bm.normal_update()

    for face in bm.faces:
        for loop in face.loops:
            v = loop.vert
            noise = fbm3(v.co.x*6, v.co.y*6+1.1, v.co.z*6, 4)
            r = 0.40 + noise*0.18
            g = 0.34 + noise*0.14
            b = 0.28 + noise*0.08
            loop[col_layer] = (clamp01(r), clamp01(g), clamp01(b), 1.0)

    mesh = bpy.data.meshes.new("BoulderMesh")
    bm.to_mesh(mesh); bm.free()
    obj = bpy.data.objects.new("Boulder", mesh)
    bpy.context.collection.objects.link(obj)

    sub = obj.modifiers.new("Sub", 'SUBSURF')
    sub.levels = 2; sub.render_levels = 2

    apply_smooth(obj)
    make_rock_mat(obj, "BoulderRock")
    export_glb("boulder", obj)

# ─── Run all ────────────────────────────────────────────────────────
gen_rock_pillar()
gen_rock_arch()
gen_boulder()

print(f"\n=== Done! ({time.time()-t0:.0f}s) ===")
