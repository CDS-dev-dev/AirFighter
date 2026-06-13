"""
AirFighter NEO Tokyo Flight Gate Generator
==========================================
Generates: public/models/neo_tokyo_flight_gate.glb
"""

import bpy
import os
import math


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_PATH = os.path.join(ROOT_DIR, "public", "models", "neo_tokyo_flight_gate.glb")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)


def material_principled(name, color, emission=None, strength=0.0, metallic=0.2, roughness=0.55):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def add_box(name, location, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        mod = obj.modifiers.new("soft bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    obj.data.materials.append(mat)
    return obj


def add_hex_core(name, x, y, z, height, radius, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=radius, depth=height, location=(x, y, z + height / 2))
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler[2] = math.radians(30)
    obj.data.materials.append(mat)
    obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def build():
    clear_scene()
    hull = material_principled("GateDarkHull", (0.035, 0.055, 0.085, 1.0), (0.02, 0.12, 0.22, 1.0), 0.25, 0.68, 0.38)
    core = material_principled("GateGraphiteCore", (0.10, 0.15, 0.21, 1.0), (0.04, 0.18, 0.30, 1.0), 0.35, 0.75, 0.32)
    cyan = material_principled("CyanRunwayEdge", (0.22, 0.78, 1.0, 1.0), (0.05, 0.85, 1.0, 1.0), 2.4, 0.1, 0.22)
    magenta = material_principled("MagentaRunwayEdge", (1.0, 0.18, 0.62, 1.0), (1.0, 0.06, 0.45, 1.0), 1.6, 0.1, 0.26)
    amber = material_principled("AmberEntryMarker", (1.0, 0.58, 0.22, 1.0), (1.0, 0.34, 0.06, 1.0), 1.5, 0.1, 0.28)

    width = 760.0
    height = 900.0
    depth = 230.0
    pylon_w = 176.0

    for side in (-1, 1):
        x = side * width / 2
        add_box("gate_side_pylon", (x, 0, height / 2), (pylon_w, depth, height), hull, 8)
        add_hex_core("gate_outer_hex_core", side * (width / 2 + 126), 0, 0, height * 0.94, 92, core)
        add_box("gate_inner_light_band", (side * (width / 2 - 92), -depth * 0.52, height * 0.5), (14, 18, height * 0.66), cyan if side > 0 else magenta, 2)
        add_box("gate_outer_anchor", (side * (width / 2 + 228), 0, height * 0.18), (82, depth * 0.8, height * 0.36), core, 6)

    add_box("gate_top_deck", (0, 0, height), (width + 360, depth, 96), hull, 8)
    add_box("gate_top_crown", (0, 0, height + 78), (width + 180, depth * 0.78, 52), core, 6)
    add_box("gate_entry_lip_cyan", (0, -depth * 0.56, height + 58), (width + 160, 22, 16), cyan, 2)
    add_box("gate_entry_lip_amber", (0, depth * 0.56, height + 62), (width + 100, 18, 14), amber, 2)

    for x in (-width * 0.32, 0, width * 0.32):
        add_box("gate_top_underside_marker", (x, -depth * 0.54, height - 72), (36, 18, 36), amber, 2)

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
