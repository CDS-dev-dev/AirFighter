"""
AirFighter Original MAP Colossal Skeleton Generator
===================================================
Generates: public/models/original_colossal_skeleton.glb
"""

import bpy
import math
import os
from mathutils import Vector


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(ROOT_DIR, "public", "models", "original_colossal_skeleton.glb")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)


def get_biome(x: float, z: float) -> str:
    if z < -1000:
        return "snow"
    if x > 1500:
        return "jungle"
    if z > 2000:
        return "desert"
    return "temperate"


def terrain_h(x: float, z: float) -> float:
    h = 300.0
    h += math.exp(-((x) ** 2 / 800000.0 + (z + 1200.0) ** 2 / 300000.0)) * 500.0
    h += math.exp(-((x + 300.0) ** 2 / 700000.0 + (z - 1000.0) ** 2 / 400000.0)) * 400.0
    h += math.exp(-((x - 1000.0) ** 2 / 400000.0 + (z - 200.0) ** 2 / 800000.0)) * 450.0
    h += math.exp(-((x + 1200.0) ** 2 / 500000.0 + (z + 400.0) ** 2 / 600000.0)) * 550.0

    dist_to_center = math.sqrt(x * x + z * z)
    if dist_to_center < 200.0:
        h += 600.0 * math.exp(-((dist_to_center / 120.0) ** 2))

    cross_x = abs(x)
    cross_z = abs(z)
    if cross_x < 200.0 and abs(z) > 250.0:
        h -= 700.0 * math.exp(-((cross_x / 100.0) ** 2))
    if cross_z < 200.0 and abs(x) > 250.0:
        h -= 700.0 * math.exp(-((cross_z / 100.0) ** 2))

    for i in range(4):
        angle = (i / 4.0) * math.pi * 2.0
        rot_x = x * math.cos(angle) + z * math.sin(angle)
        rot_z = (-x) * math.sin(angle) + z * math.cos(angle)
        dist = abs(rot_z)
        if dist < 100.0 and abs(rot_x) < 2000.0:
            h -= 400.0 * math.exp(-((dist / 60.0) ** 2))

    h += math.sin(x * 0.003) * math.cos(z * 0.004) * 250.0
    h += math.sin(x * 0.007) * math.sin(z * 0.006) * 180.0
    h += math.sin(x * 0.012) * math.cos(z * 0.010) * 120.0
    h += math.sin(x * 0.0025 + 2.3) * 150.0
    h += math.cos(z * 0.0032 + 1.7) * 130.0
    h += math.sin((x + z) * 0.0018) * 110.0

    plain_dist = math.hypot(x - 400.0, z - 200.0)
    if plain_dist < 600.0:
        flat_factor = math.cos((plain_dist / 600.0) * math.pi * 0.5)
        h *= 1.0 - flat_factor * 0.5
        h += 250.0 * flat_factor

    biome = get_biome(x, z)
    if biome == "snow":
        h += 400.0
        h += math.sin(x * 0.02) * math.cos(z * 0.02) * 200.0
    elif biome == "jungle":
        h *= 0.4
        h = max(20.0, h)
    elif biome == "desert":
        h *= 0.5
        h += math.sin(x * 0.01) * 50.0 + math.sin(z * 0.015) * 40.0
        h = max(10.0, h)

    return max(0.0, h)


def mat_fossil():
    mat = bpy.data.materials.new("FossilBone")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    bump = nt.nodes.new("ShaderNodeBump")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    noise.inputs["Scale"].default_value = 4.5
    noise.inputs["Detail"].default_value = 8.0
    ramp.color_ramp.elements[0].color = (0.72, 0.67, 0.57, 1.0)
    ramp.color_ramp.elements[1].color = (0.93, 0.89, 0.80, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.92
    bsdf.inputs["Specular IOR Level"].default_value = 0.18
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def mat_marrow():
    mat = bpy.data.materials.new("MarrowGlow")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    emit = nt.nodes.new("ShaderNodeEmission")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    fresnel = nt.nodes.new("ShaderNodeFresnel")
    emit.inputs["Color"].default_value = (0.98, 0.82, 0.62, 1.0)
    emit.inputs["Strength"].default_value = 1.1
    bsdf.inputs["Base Color"].default_value = (0.97, 0.92, 0.85, 1.0)
    bsdf.inputs["Transmission Weight"].default_value = 0.12
    bsdf.inputs["Roughness"].default_value = 0.35
    nt.links.new(fresnel.outputs["Fac"], mix.inputs["Fac"])
    nt.links.new(bsdf.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emit.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    return mat


def align_cylinder(obj, start: Vector, end: Vector):
    diff = end - start
    obj.location = (start + end) * 0.5
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = diff.to_track_quat("Z", "Y")


def add_segment(start: Vector, end: Vector, radius: float, mat):
    diff = end - start
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=diff.length, vertices=18)
    bone = bpy.context.object
    align_cylinder(bone, start, end)
    bone.data.materials.append(mat)
    for point in (start, end):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=radius * 0.92, segments=12, ring_count=8, location=point)
        cap = bpy.context.object
        cap.data.materials.append(mat)


def add_vertebra(point_a: Vector, point_b: Vector, radius: float, mat):
    tangent = (point_b - point_a).normalized()
    mid = point_a.lerp(point_b, 0.5)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius * 0.95,
        minor_radius=max(3.0, radius * 0.16),
        major_segments=28,
        minor_segments=10,
        location=mid
    )
    ring = bpy.context.object
    ring.rotation_mode = "QUATERNION"
    ring.rotation_quaternion = tangent.to_track_quat("Z", "Y")
    ring.data.materials.append(mat)


def build():
    clear_scene()
    fossil = mat_fossil()
    marrow = mat_marrow()

    spine_plan = [
        (-2600, -1100, 180),
        (-2000, -760, 240),
        (-1320, -360, 290),
        (-540, 120, 340),
        (220, 520, 360),
        (980, 900, 330),
        (1760, 1180, 290),
        (2460, 1460, 230),
    ]
    spine_points = [Vector((x, z, terrain_h(x, z) + lift)) for x, z, lift in spine_plan]

    for i in range(len(spine_points) - 1):
        start = spine_points[i]
        end = spine_points[i + 1]
        radius = 28.0 + (1.0 - abs(i - (len(spine_points) - 2) * 0.5) / len(spine_points)) * 10.0
        add_segment(start, end, radius, fossil)
        add_vertebra(start, end, radius, marrow)

    for i in range(1, len(spine_points) - 1):
        base = spine_points[i]
        prev = spine_points[i - 1]
        nxt = spine_points[i + 1]
        tangent = (nxt - prev).normalized()
        side = tangent.cross(Vector((0, 0, 1))).normalized()
        span = 280.0 + i * 22.0
        crown = 150.0 + abs(3 - i) * 18.0
        sway = (1 if i % 2 == 0 else -1) * 70.0

        for side_sign in (-1, 1):
            rib_end_x = base.x + side.x * span * side_sign + tangent.x * sway * side_sign * 0.35
            rib_end_y = base.y + side.y * span * side_sign + tangent.y * sway * side_sign * 0.35
            rib_end = Vector((rib_end_x, rib_end_y, terrain_h(rib_end_x, rib_end_y) + 34.0))
            arc_points = [
                base.copy(),
                base.copy() + side * (span * 0.28 * side_sign) + tangent * (sway * 0.22 * side_sign) + Vector((0, 0, crown * 0.35)),
                base.copy() + side * (span * 0.68 * side_sign) + tangent * (sway * 0.18 * side_sign) + Vector((0, 0, crown * 0.08)),
                rib_end,
            ]
            for j in range(len(arc_points) - 1):
                taper = 20.0 + (11.0 - 20.0) * (j / (len(arc_points) - 2))
                add_segment(arc_points[j], arc_points[j + 1], taper, fossil)

    sternum_center = spine_points[4].lerp(spine_points[5], 0.45) + Vector((0, 0, -70))
    bpy.ops.mesh.primitive_cylinder_add(radius=26.0, depth=220.0, vertices=16, location=sternum_center)
    sternum = bpy.context.object
    sternum.rotation_euler = (math.radians(86), 0, math.radians(5))
    sternum.data.materials.append(marrow)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_PATH,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_lights=False,
        export_cameras=False
    )
    print(f"Exported {OUTPUT_PATH}")


if __name__ == "__main__":
    build()
