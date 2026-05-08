"""
AirFighter Terrain Generator for Blender
=========================================
使い方:
  1. Blender を開く
  2. 上部タブ「Scripting」をクリック
  3. 右上「Open」でこのファイルを開く（またはテキストを全選択してペースト）
  4. 「Run Script」ボタン（▶）をクリック
  5. 完了後: File > Export > glTF 2.0 (.glb)
     - Format: glTF Binary (.glb)
     - Include > Data > Vertex Colors: ON
     - Transform: +Y Up (デフォルトのまま)
     - Mesh > Apply Modifiers: ON
  6. 出力先: AirFighter/public/terrain.glb

所要時間: 約3〜8分（PCスペックによる）
"""

import bpy
import bmesh
import math
import time

# ─────────────────────────────────────────────
# パラメータ
# ─────────────────────────────────────────────
GRID = 256        # セグメント数（257×257頂点）。重い場合は128に下げてOK
SIZE = 9000       # Three.js側と同じ 9000 units
WATER_LEVEL = 1.8

# ─────────────────────────────────────────────
# ノイズ & 地形関数（Three.js の terrainH と完全一致）
# ─────────────────────────────────────────────

def hash2(x, z):
    n = math.sin(x * 127.1 + z * 311.7) * 43758.5453123
    return n - math.floor(n)

def lerp(a, b, t):
    return a + (b - a) * t

def value_noise(x, z):
    ix, iz = math.floor(x), math.floor(z)
    fx, fz = x - ix, z - iz
    ux = fx * fx * (3 - 2 * fx)
    uz = fz * fz * (3 - 2 * fz)
    return lerp(
        lerp(hash2(ix, iz),     hash2(ix+1, iz),   ux),
        lerp(hash2(ix, iz+1),   hash2(ix+1, iz+1), ux),
        uz
    )

def fbm(x, z, octaves=4):
    total, amp, freq, norm = 0.0, 0.5, 1.0, 0.0
    for _ in range(octaves):
        total += value_noise(x * freq, z * freq) * amp
        norm  += amp
        amp   *= 0.5
        freq  *= 2.03
    return total / norm

def clamp01(v):
    return max(0.0, min(1.0, v))

def smoothstep(e0, e1, v):
    t = clamp01((v - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)

def gauss2d(x, z, ax, az, rx, rz, ht):
    return ht * math.exp(-((x-ax)**2)/(rx*rx) - ((z-az)**2)/(rz*rz))

def terrain_h(x, z):
    # ── ベース起伏 (平野 ≈ 40-200m) ──
    h = 75.0
    h += math.sin(x * 0.00055 + 0.8) * 45
    h += math.sin(z * 0.00070 + 0.3) * 38
    h += math.sin((x - z) * 0.00042 + 1.1) * 27
    h += math.sin((x + z * 0.6) * 0.00028) * 18

    # ── 北部山脈 (z≈-1400, 深さ780m) ──
    mdt = (z + 1400) / 680
    h += max(0, 1 - mdt*mdt) * (780 + math.sin(x*0.0022+0.7)*215 + math.sin(x*0.006)*115)

    # ── 主要峰 ──
    h += gauss2d(x, z,   200, -1820, 340, 360, 1150)  # Peak A ~1400m
    h += gauss2d(x, z,  -720, -1570, 310, 320, 1000)  # Peak B ~1200m
    h += gauss2d(x, z,   980, -1350, 280, 295,  800)  # Peak C ~1000m
    h += gauss2d(x, z,    60, -1060, 255, 245,  550)  # Peak D ~700m

    # ── 中央孤立スパイア（ランドマーク）──
    h += gauss2d(x, z,    80,   -30, 160, 160, 560)

    # ── メサ（平頂山）──
    h += min(gauss2d(x, z, -480, 280, 280, 260, 420), 320)

    # ── 中央〜南部丘陵 ──
    h += gauss2d(x, z,  -180,  -640, 900, 520, 380)
    h += gauss2d(x, z,   620,  -520, 440, 400, 265)
    h += gauss2d(x, z,  -720,   480, 520, 440, 340)
    h += gauss2d(x, z,   380,   580, 360, 320, 235)
    h += gauss2d(x, z,  -160,   920, 320, 280, 190)
    h += gauss2d(x, z,  1100,  -380, 680, 520, 235)
    h += gauss2d(x, z, -1080,  -720, 480, 560, 270)
    h += gauss2d(x, z,  -580,   720, 580, 490, 220)

    # ── 西部海食柱 ──
    h += gauss2d(x, z, -1900,  200,  60,  55, 180)
    h += gauss2d(x, z, -1750, -100,  45,  40, 150)

    # ── 東西横断峡谷 (深さ ~350m) ──
    ewZ = -220 + math.sin(x*0.00085)*150 + math.sin(x*0.0022+0.6)*65
    ewD = abs(z - ewZ)
    ewA = clamp01((x+900)/350) * clamp01((900-x)/350)
    h -= math.exp(-(ewD/80)**2) * 440 * ewA
    h += math.exp(-((ewD-170)/55)**2) * 110 * ewA

    # ── 中央南北渓谷 (深さ ~280m) ──
    nsX = -350 + math.sin(z*0.0007)*140 + math.sin(z*0.0019+1.2)*55
    nsD = abs(x - nsX)
    nsA = clamp01((z+1100)/400) * clamp01((1100-z)/400)
    h -= math.exp(-(nsD/70)**2) * 300 * nsA

    # ── 東部大峡谷 (深さ ~400m) ──
    cxC = 920 + math.sin(z*0.0008)*120 + math.sin(z*0.002+0.5)*48
    cxD = abs(x - cxC)
    cxA = clamp01((x-350)/320) * clamp01((z+700)/380) * clamp01(1-(z-700)/380)
    cxW = max(0, cxD - 130)
    h -= math.exp(-(cxW/62)**2) * 445 * cxA
    h += math.exp(-((cxD-205)/65)**2) * 120 * cxA

    # ── 斜行渓谷 ──
    diagT = ((x - z) + 400) / 160
    diagA = (clamp01((x+700)/500) * clamp01((300-x)/500)
           * clamp01((z-100)/300) * clamp01((900-z)/300))
    h -= math.exp(-(diagT**2)) * 260 * diagA

    # ── 河川 ──
    rvX = 120 + math.sin(z*0.0009)*175 + math.sin(z*0.0025+1)*55
    rvD = abs(x - rvX)
    rvA = clamp01((z+1300)/350) * clamp01(1-(z-1400)/350)
    h -= math.exp(-(rvD/105)**2) * 165 * rvA

    # ── 西部断崖 ──
    if x < -1100:
        cliffX = -1650 + math.sin(z*0.0006)*185 + math.sin(z*0.0018)*65
        h -= clamp01(-(x-cliffX)/360) * 720

    # ── 南部湾 ──
    h -= math.exp(-(x/660)**2) * clamp01((z-660)/340) * clamp01(1-(z-1700)/320) * 220

    # ── 南部半島 ──
    h += math.exp(-(x/155)**2) * clamp01((z-860)/260) * clamp01(1-(z-1720)/340) * 240

    # ── 孤島群 ──
    h += gauss2d(x, z, -2180, -150, 145, 130, 145)
    h += gauss2d(x, z, -2480,  320, 120, 108, 125)
    h += gauss2d(x, z, -2090, -640,  95,  88, 115)
    h += gauss2d(x, z, -2700,  100, 100,  92,  75)

    # ── テクスチャノイズ ──
    h += (fbm(x*0.006+5.1, z*0.006-3.8, 4) - 0.5) * 105

    return h

def terrain_color(x, z, y, h_cache, ix, iz, n):
    """頂点カラーを計算（スロープ考慮）"""
    freckles = (fbm(x*0.018+7, z*0.018-11, 3) - 0.5) * 0.12
    v = math.sin(x*0.042 + z*0.063)*0.06 + math.sin(x*0.11 - z*0.09)*0.04

    # スロープ（隣接頂点の高さから近似）
    hL = h_cache[iz][max(ix-1,0)]
    hR = h_cache[iz][min(ix+1,n-1)]
    hD = h_cache[max(iz-1,0)][ix]
    hU = h_cache[min(iz+1,n-1)][ix]
    step = SIZE / GRID
    gradX = (hR - hL) / (2 * step)
    gradZ = (hU - hD) / (2 * step)
    slope = clamp01(math.hypot(gradX, gradZ) / 3.0)

    # 高度別ベースカラー (高度範囲 -400〜+1400m)
    if y < WATER_LEVEL + 2.5:
        r, g, b = 0.58+freckles, 0.52+freckles*0.6, 0.34
    elif y < 60:
        r, g, b = 0.44+freckles, 0.68+freckles, 0.28
    elif y < 165:
        r, g, b = 0.28+freckles, 0.58+freckles, 0.22
    elif y < 345:
        r, g, b = 0.34+freckles, 0.50+freckles*0.8, 0.22
    elif y < 600:
        r, g, b = 0.50+freckles, 0.46+freckles, 0.30
    else:
        r, g, b = 0.72+freckles*0.5, 0.64+freckles*0.5, 0.52

    # 岩肌ブレンド
    rock = clamp01(slope * 1.45 + smoothstep(390, 780, y) * 0.5)
    r = lerp(r, 0.48+freckles, rock)
    g = lerp(g, 0.43+freckles, rock)
    b = lerp(b, 0.37+freckles, rock)

    # 雪
    snow = smoothstep(900, 1200, y)
    r = clamp01(lerp(r, 0.93, snow) + v)
    g = clamp01(lerp(g, 0.94, snow) + v)
    b = clamp01(lerp(b, 0.97, snow) + v)

    return (r, g, b, 1.0)

# ─────────────────────────────────────────────
# メッシュ生成
# ─────────────────────────────────────────────
t0 = time.time()
n  = GRID + 1
print(f"\n=== AirFighter Terrain Generator ===")
print(f"Grid: {GRID}x{GRID} ({n}x{n} = {n*n:,} vertices)")
print(f"Size: {SIZE}x{SIZE} units")

# 既存オブジェクトを削除
for obj_name in ["Terrain", "TerrainMesh"]:
    if obj_name in bpy.data.objects:
        bpy.data.objects[obj_name].select_set(True)
bpy.ops.object.delete(use_global=False)

# ── Step 1: 高さキャッシュ（slope計算を高速化）──
print(f"\n[1/4] Pre-computing height cache...")
h_cache = []
for iz in range(n):
    row = []
    z_world = (iz / GRID - 0.5) * SIZE
    for ix in range(n):
        x_world = (ix / GRID - 0.5) * SIZE
        row.append(terrain_h(x_world, z_world))
    h_cache.append(row)
    if iz % 32 == 0:
        elapsed = time.time() - t0
        print(f"  {iz}/{GRID} rows  ({elapsed:.0f}s elapsed)")

# ── Step 2: 頂点生成 ──
print(f"\n[2/4] Creating vertices...")
mesh = bpy.data.meshes.new("TerrainMesh")
obj  = bpy.data.objects.new("Terrain", mesh)
bpy.context.collection.objects.link(obj)
bm   = bmesh.new()

vert_list = []
for iz in range(n):
    z_world = (iz / GRID - 0.5) * SIZE
    for ix in range(n):
        x_world = (ix / GRID - 0.5) * SIZE
        y       = h_cache[iz][ix]
        # Blender座標: X=East, Y=South（Three.jsのZ反転）, Z=Up（高さ）
        vert_list.append(bm.verts.new((x_world, -z_world, y)))
    if iz % 32 == 0:
        print(f"  {iz}/{GRID} rows")

bm.verts.ensure_lookup_table()

# ── Step 3: 面生成 ──
print(f"\n[3/4] Creating faces...")
for iz in range(GRID):
    for ix in range(GRID):
        v0 = vert_list[ iz    * n + ix    ]
        v1 = vert_list[ iz    * n + ix + 1]
        v2 = vert_list[(iz+1) * n + ix + 1]
        v3 = vert_list[(iz+1) * n + ix    ]
        bm.faces.new([v0, v1, v2, v3])
    if iz % 32 == 0:
        print(f"  {iz}/{GRID} rows")

bm.faces.ensure_lookup_table()

# ── Step 4: 頂点カラー ──
print(f"\n[4/4] Painting vertex colors...")
color_layer = bm.loops.layers.color.new("Col")

fi = 0
for iz in range(GRID):
    z_world = ((iz + 0.5) / GRID - 0.5) * SIZE
    for ix in range(GRID):
        x_world = ((ix + 0.5) / GRID - 0.5) * SIZE
        y_face  = (h_cache[iz][ix] + h_cache[iz][ix+1] +
                   h_cache[iz+1][ix] + h_cache[iz+1][ix+1]) / 4
        col = terrain_color(x_world, z_world, y_face, h_cache, ix, iz, n)
        for loop in bm.faces[fi].loops:
            loop[color_layer] = col
        fi += 1
    if iz % 32 == 0:
        print(f"  {iz}/{GRID} rows  ({time.time()-t0:.0f}s elapsed)")

# ── メッシュ確定 ──
bm.to_mesh(mesh)
bm.free()
mesh.calc_normals_split()

# ── マテリアル設定（Principled BSDF + Vertex Color）──
mat = bpy.data.materials.new("TerrainMat")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

out   = nodes.new('ShaderNodeOutputMaterial')
bsdf  = nodes.new('ShaderNodeBsdfPrincipled')
vcol  = nodes.new('ShaderNodeVertexColor')
vcol.layer_name = "Col"

bsdf.inputs['Roughness'].default_value = 0.88
bsdf.inputs['Metallic'].default_value  = 0.0
links.new(vcol.outputs['Color'],  bsdf.inputs['Base Color'])
links.new(bsdf.outputs['BSDF'],   out.inputs['Surface'])
obj.data.materials.append(mat)

bpy.context.view_layer.objects.active = obj
obj.select_set(True)

# ── GLB エクスポート ──
import os
OUT_PATH = "/workspaces/AirFighter/public/terrain.glb"
os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

print(f"\nExporting GLB to: {OUT_PATH}")
bpy.ops.export_scene.gltf(
    filepath=OUT_PATH,
    export_format='GLB',
    use_selection=True,
    export_colors=True,          # 頂点カラー
    export_normals=True,
    export_apply=True,           # Apply Modifiers
    export_yup=True,             # +Y Up (Three.js と同じ)
    export_materials='EXPORT',
)

elapsed = time.time() - t0
fsize = os.path.getsize(OUT_PATH) / 1024 / 1024
print(f"\n=== 完了！ ({elapsed:.0f}秒) ===")
print(f"頂点数: {n*n:,}  面数: {GRID*GRID:,}")
print(f"出力: {OUT_PATH}  ({fsize:.1f} MB)")
