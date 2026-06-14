"""
AirFighter Space Gravity Spine Generator
========================================
Generates: public/models/space_gravity_spine.glb
"""

import bpy
import os
from mathutils import Vector


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(ROOT_DIR, "public", "models", "space_gravity_spine.glb")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)


def game_vec(x, y, z):
    return Vector((x, z, y))


def material(name, color, emission=None, strength=0.0, metallic=0.55, roughness=0.4, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.blend_method = "BLEND" if alpha < 1.0 else "OPAQUE"
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Alpha"].default_value = alpha
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def add_cylinder_between(name, a, b, radius, mat, vertices=10):
    diff = b - a
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=diff.length, vertices=vertices, location=(a + b) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = diff.to_track_quat("Z", "Y")
    obj.data.materials.append(mat)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def add_gate(name, center, tangent, radius_x, radius_y, mat, glow_mat):
    group = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(group)
    q = tangent.to_track_quat("Z", "Y")
    bpy.ops.mesh.primitive_torus_add(major_radius=radius_x, minor_radius=8, major_segments=64, minor_segments=8, location=center)
    outer = bpy.context.object
    outer.name = name + "_outer_ring"
    outer.scale.y = radius_y / max(1.0, radius_x)
    outer.rotation_mode = "QUATERNION"
    outer.rotation_quaternion = q
    outer.parent = group
    outer.data.materials.append(mat)

    bpy.ops.mesh.primitive_torus_add(major_radius=radius_x * 0.72, minor_radius=3, major_segments=48, minor_segments=6, location=center)
    inner = bpy.context.object
    inner.name = name + "_inner_guide"
    inner.scale.y = radius_y / max(1.0, radius_x)
    inner.rotation_mode = "QUATERNION"
    inner.rotation_quaternion = q
    inner.parent = group
    inner.data.materials.append(glow_mat)
    return group


def build_route(points, name, gate_radius, hull, glow):
    for i in range(len(points) - 1):
        a = points[i]
        b = points[i + 1]
        tangent = (b - a).normalized()
        side = tangent.cross(Vector((0, 0, 1)))
        if side.length < 0.001:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(tangent).normalized()
        add_cylinder_between(f"{name}_left_rail", a + side * gate_radius * 0.85, b + side * gate_radius * 0.85, 5, glow)
        add_cylinder_between(f"{name}_right_rail", a - side * gate_radius * 0.85, b - side * gate_radius * 0.85, 5, glow)
        add_cylinder_between(f"{name}_upper_rib", a + up * gate_radius * 0.72, b + up * gate_radius * 0.72, 4, hull)

    for i, point in enumerate(points):
        if i == 0 or i == len(points) - 1:
            continue
        prev_p = points[i - 1]
        next_p = points[i + 1]
        tangent = (next_p - prev_p).normalized()
        add_gate(f"{name}_flight_gate_{i}", point, tangent, gate_radius, gate_radius * 0.72, hull, glow)


def build():
    clear_scene()
    hull = material("SpaceGravitySpineHull", (0.34, 0.42, 0.54, 1), (0.05, 0.12, 0.24, 1), 0.55, 0.72, 0.36)
    cyan = material("SpaceGravitySpineCyan", (0.26, 0.88, 1.0, 1), (0.05, 0.86, 1.0, 1), 2.2, 0.2, 0.24)
    violet = material("SpaceGravitySpineViolet", (0.58, 0.34, 1.0, 1), (0.52, 0.18, 1.0, 1), 1.7, 0.2, 0.28)

    build_route([
        game_vec(0, 80, 0),
        game_vec(260, -120, -860),
        game_vec(620, -520, -1880),
        game_vec(900, -980, -3200),
    ], "fortress_descent", 120, hull, cyan)

    build_route([
        game_vec(0, 100, 0),
        game_vec(-160, 360, -760),
        game_vec(-420, 900, -1600),
        game_vec(-620, 1460, -2220),
    ], "orbital_ascent", 140, hull, violet)

    build_route([
        game_vec(0, 70, 0),
        game_vec(520, 170, 520),
        game_vec(1320, 360, 1280),
        game_vec(2200, 690, 2050),
    ], "graveyard_canyon", 155, hull, cyan)

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
