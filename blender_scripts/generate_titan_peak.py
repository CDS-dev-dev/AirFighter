"""
Titan Peak (タイタンピーク) - 圧倒的スケールの巨大奇岩
高さ1200m、Original MAP中央のランドマーク
"""

import bpy
import math
import sys

# 既存オブジェクトをクリア
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# UV球を作成（ベース）
bpy.ops.mesh.primitive_uv_sphere_add(
    segments=64,
    ring_count=32,
    radius=150,
    location=(0, 0, 600)  # 高さ1200mの半分を中心に
)
peak = bpy.context.active_object
peak.name = "TitanPeak"

# Z軸方向に引き伸ばし
peak.scale = (1.0, 1.0, 4.0)  # 高さを4倍に
bpy.ops.object.transform_apply(scale=True)

# Displacement Modifier（複雑な形状）
disp1 = peak.modifiers.new(name='Displacement1', type='DISPLACE')
tex1 = bpy.data.textures.new(name='DisplaceTex1', type='MUSGRAVE')
tex1.musgrave_type = 'RIDGED_MULTIFRACTAL'
tex1.noise_scale = 0.8
tex1.noise_intensity = 1.5
disp1.texture = tex1
disp1.strength = 80.0
disp1.mid_level = 0.5

# 2つ目のDisplacement（細部）
disp2 = peak.modifiers.new(name='Displacement2', type='DISPLACE')
tex2 = bpy.data.textures.new(name='DisplaceTex2', type='VORONOI')
tex2.noise_scale = 3.0
disp2.texture = tex2
disp2.strength = 30.0
disp2.mid_level = 0.5

# Subdivision Surface（滑らかに）
subsurf = peak.modifiers.new(name='Subdivision', type='SUBSURF')
subsurf.levels = 2
subsurf.render_levels = 3

# マテリアル作成（PBR）
mat = bpy.data.materials.new(name="TitanPeakMaterial")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links

# 既存ノードをクリア
nodes.clear()

# Principled BSDF
bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf.location = (0, 0)
bsdf.inputs['Base Color'].default_value = (0.25, 0.23, 0.21, 1.0)  # ダークグレー
bsdf.inputs['Roughness'].default_value = 0.9
bsdf.inputs['Metallic'].default_value = 0.1

# Noise Texture（表面ディテール）
noise_tex = nodes.new(type='ShaderNodeTexNoise')
noise_tex.location = (-600, 0)
noise_tex.inputs['Scale'].default_value = 15.0
noise_tex.inputs['Detail'].default_value = 8.0

# ColorRamp（コントラスト調整）
color_ramp = nodes.new(type='ShaderNodeValToRGB')
color_ramp.location = (-400, 0)
color_ramp.color_ramp.elements[0].color = (0.15, 0.14, 0.13, 1.0)  # 暗部
color_ramp.color_ramp.elements[1].color = (0.35, 0.32, 0.30, 1.0)  # 明部

# Normal Map（凹凸感）
bump = nodes.new(type='ShaderNodeBump')
bump.location = (-200, -200)
bump.inputs['Strength'].default_value = 0.8

# Material Output
output = nodes.new(type='ShaderNodeOutputMaterial')
output.location = (300, 0)

# 接続
links.new(noise_tex.outputs['Fac'], color_ramp.inputs['Fac'])
links.new(color_ramp.outputs['Color'], bsdf.inputs['Base Color'])
links.new(noise_tex.outputs['Fac'], bump.inputs['Height'])
links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

# マテリアル適用
peak.data.materials.append(mat)

# 頂上マーカー（コレクティブル配置用）
bpy.ops.mesh.primitive_uv_sphere_add(radius=10, location=(0, 0, 1200))
marker = bpy.context.active_object
marker.name = "SummitMarker"

# マーカーマテリアル（発光）
marker_mat = bpy.data.materials.new(name="SummitMarkerMaterial")
marker_mat.use_nodes = True
marker_nodes = marker_mat.node_tree.nodes
marker_links = marker_mat.node_tree.links
marker_nodes.clear()

emission = marker_nodes.new(type='ShaderNodeEmission')
emission.inputs['Color'].default_value = (1.0, 0.8, 0.3, 1.0)  # ゴールド
emission.inputs['Strength'].default_value = 5.0

marker_output = marker_nodes.new(type='ShaderNodeOutputMaterial')
marker_links.new(emission.outputs['Emission'], marker_output.inputs['Surface'])

marker.data.materials.append(marker_mat)

# GLBエクスポート
output_path = "/home/vscode/AirFighter/public/models/landmark_titan_peak.glb"
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    export_materials='EXPORT',
    export_colors=True,
    export_normals=True,
    export_texcoords=True,
    export_yup=True,
)

print(f"✅ Titan Peak exported: {output_path}")
