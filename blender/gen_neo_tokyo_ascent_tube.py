"""
AirFighter NEO Tokyo Ascent Tube Generator
==========================================
Generates: public/models/neo_tokyo_ascent_tube.glb
"""

import bpy
import os
import math
from mathutils import Vector


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(ROOT_DIR, "public", "models", "neo_tokyo_ascent_tube.glb")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)


def mat(name, color, emission=None, strength=0.0, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.blend_method = "BLEND" if alpha < 1.0 else "OPAQUE"
    material.use_screen_refraction = alpha < 1.0
    nt = material.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Alpha"].default_value = alpha
    bsdf.inputs["Metallic"].default_value = 0.45
    bsdf.inputs["Roughness"].default_value = 0.34
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return material


def game_vec(x, y, z):
    return Vector((x, z, y))


def add_curve_tube(name, points, bevel_depth, material, resolution=4):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = resolution
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 8
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for p, co in zip(spline.points, points):
        p.co = (co.x, co.y, co.z, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def add_ring(name, center, tangent, radius, tube_radius, material):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=tube_radius, major_segments=56, minor_segments=8, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = tangent.to_track_quat("Z", "Y")
    obj.data.materials.append(material)
    return obj


def add_box_between(name, a, b, radius, material):
    diff = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=diff.length, vertices=8, location=(a + b) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = diff.to_track_quat("Z", "Y")
    obj.data.materials.append(material)
    return obj


def build():
    clear_scene()
    shell = mat("AscentTubeVisibleShell", (0.12, 0.23, 0.34, 1.0), (0.03, 0.22, 0.35, 1.0), 0.42, 0.58)
    cyan = mat("AscentTubeCyanRails", (0.24, 0.85, 1.0, 1.0), (0.05, 0.85, 1.0, 1.0), 2.0)
    amber = mat("AscentTubeAmberMarkers", (1.0, 0.56, 0.20, 1.0), (1.0, 0.32, 0.05, 1.0), 1.5)
    inner = mat("AscentTubeInnerGuide", (0.18, 0.35, 0.46, 1.0), (0.02, 0.26, 0.40, 1.0), 0.65, 0.42)

    game_points = [
        (1560, 340, 1450),
        (1320, 660, 1160),
        (980, 980, 760),
        (620, 1320, 360),
        (520, 1680, -160),
    ]
    points = [game_vec(x, y, z) for x, y, z in game_points]
    outer_radius = 230.0
    inner_radius = 170.0

    add_curve_tube("ascent_tube_outer_visible_shell", points, outer_radius, shell)
    add_curve_tube("ascent_tube_centerline_guide", points, inner_radius * 0.08, inner)

    for i in range(len(points) - 1):
        a = points[i]
        b = points[i + 1]
        tangent = (b - a).normalized()
        side = tangent.cross(Vector((0, 0, 1)))
        if side.length < 0.001:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(tangent).normalized()
        for offset, material, radius in (
            (side * outer_radius * 0.74, cyan, 7),
            (-side * outer_radius * 0.74, cyan, 7),
            (up * outer_radius * 0.74, amber, 6),
        ):
            add_box_between("ascent_tube_longitudinal_rail", a + offset, b + offset, radius, material)

    for i, p in enumerate(points):
        if i == 0 or i == len(points) - 1:
            ring_radius = outer_radius + 24
            ring_material = amber
        else:
            ring_radius = outer_radius
            ring_material = cyan if i % 2 == 0 else amber
        prev_p = points[max(0, i - 1)]
        next_p = points[min(len(points) - 1, i + 1)]
        tangent = (next_p - prev_p).normalized()
        add_ring("ascent_tube_structural_rib", p, tangent, ring_radius, 9, ring_material)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_lights=False,
        export_cameras=False,
    )
    print(f"Exported {OUTPUT_PATH}")


if __name__ == "__main__":
    build()
