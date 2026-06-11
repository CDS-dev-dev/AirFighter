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
    # ===== 極限地形MAP（4方向山脈＋十字峡谷＋フラクタル）=====
    # Three.js の terrainH (eca6a28版) と完全一致
    h = 300.0  # 基準高度300m（全域に高低差）

    # 4方向の大山脈
    h += math.exp(-((x)**2     / 800000 + (z+1200)**2 / 300000)) * 500  # 北部
    h += math.exp(-((x+300)**2 / 700000 + (z-1000)**2 / 400000)) * 400  # 南部
    h += math.exp(-((x-1000)**2/ 400000 + (z-200)**2  / 800000)) * 450  # 東部
    h += math.exp(-((x+1200)**2/ 500000 + (z+400)**2  / 600000)) * 550  # 西部（最高峰）

    # 中央巨大岩山（高さ600m、直径400m）
    dist_to_center = math.sqrt(x**2 + z**2)
    if dist_to_center < 200:
        h += 600 * math.exp(-((dist_to_center / 120) ** 2))

    # 十字峡谷（MAP中央を横断、深さ600m級）
    cross_x = abs(x)
    cross_z = abs(z)
    if cross_x < 200 and abs(z) > 250:
        h -= 500 * math.exp(-((cross_x / 100) ** 2))
    if cross_z < 200 and abs(x) > 250:
        h -= 500 * math.exp(-((cross_z / 100) ** 2))

    # 放射峡谷（中央から4方向、深さ400m）
    for i in range(4):
        angle = (i / 4) * math.pi * 2
        rot_x = x * math.cos(angle) + z * math.sin(angle)
        rot_z = -x * math.sin(angle) + z * math.cos(angle)
        dist = abs(rot_z)
        if dist < 100 and abs(rot_x) < 2000:
            h -= 400 * math.exp(-((dist / 60) ** 2))

    # 全域に激しい起伏（フラクタル地形）
    h += math.sin(x * 0.003) * math.cos(z * 0.004) * 250
    h += math.sin(x * 0.007) * math.sin(z * 0.006) * 180
    h += math.sin(x * 0.012) * math.cos(z * 0.010) * 120

    # 中規模波状地形
    h += math.sin(x * 0.0025 + 2.3) * 150
    h += math.cos(z * 0.0032 + 1.7) * 130
    h += math.sin((x + z) * 0.0018) * 110

    # 戦闘エリア確保（中央東部に平地）
    plain_dist = math.sqrt((x - 400)**2 + (z - 200)**2)
    if plain_dist < 600:
        flat_factor = math.cos((plain_dist / 600) * math.pi * 0.5)
        h *= (1 - flat_factor * 0.5)
        h += 250 * flat_factor

    return max(0.0, h)

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

    # 高度別ベースカラー（基準300m、峽谷0m、峰~1200m）
    if y < WATER_LEVEL + 2.5:
        r, g, b = 0.58+freckles, 0.52+freckles*0.6, 0.34  # 砂浜
    elif y < 80:
        r, g, b = 0.44+freckles, 0.68+freckles, 0.28       # 低地（峡谷底）
    elif y < 220:
        r, g, b = 0.32+freckles, 0.62+freckles, 0.24       # 草地
    elif y < 420:
        r, g, b = 0.36+freckles, 0.54+freckles*0.8, 0.22  # 中腹
    elif y < 680:
        r, g, b = 0.50+freckles, 0.46+freckles, 0.30       # 高地
    else:
        r, g, b = 0.72+freckles*0.5, 0.64+freckles*0.5, 0.52  # 岩峰

    # 岩肌ブレンド
    rock = clamp01(slope * 1.45 + smoothstep(480, 900, y) * 0.5)
    r = lerp(r, 0.48+freckles, rock)
    g = lerp(g, 0.43+freckles, rock)
    b = lerp(b, 0.37+freckles, rock)

    # 雪（高峰のみ）
    snow = smoothstep(950, 1200, y)
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
