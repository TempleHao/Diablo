"""Create two genuinely atlas-baked, pose-preserving character budgets.

blender -b raw-ash-archivist.blend --python scripts/refine-mage-budget.py -- /project
Run only after the full source rig has had its authored rest pose applied.
The project has not selected a license for its original code and artwork.
"""
import bpy
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
OUT = ROOT / 'assets-source/ash-archivist'
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'dist/models').mkdir(parents=True, exist_ok=True)
SCENE = bpy.context.scene
RIG = bpy.data.objects.get('AshArchivistRig')
assert RIG and RIG.type == 'ARMATURE', 'Open the fully authored raw character .blend first'
PARTS = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == RIG]
FOCUS = bpy.data.objects.get('face_focus')
assert PARTS and FOCUS
SOURCE_FILE = bpy.data.filepath
REPORT = {'schema': 1, 'inputBlend': Path(SOURCE_FILE).name,
          'sourceBlendSha256': hashlib.sha256(Path(SOURCE_FILE).read_bytes()).hexdigest(),
          'sourceTriangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in PARTS),
          'sourceBones': len(RIG.data.bones), 'atlasResolution': 2048,
          'limitations': ['No measured real-device GPU frame rate, memory, heat or battery evidence',
                          'Commercial D2R/D4 art quality is not established',
                          'Inactive face/toe helper channels are merged; separate facial animation requires the source rig']}


def triangles(obj):
    return sum(len(p.vertices)-2 for p in obj.data.polygons)


def active(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


TRACK_MUTES = [(t, t.mute) for t in RIG.animation_data.nla_tracks]
for track, old in TRACK_MUTES:
    track.mute = True
CLIPS = {a.name: a for a in bpy.data.actions if a.name in ('Idle', 'Walk', 'Cast')}
assert set(CLIPS) == {'Idle', 'Walk', 'Cast'}
SAMPLES = [(name, int(round(a.frame_range.x+(a.frame_range.y-a.frame_range.x)*t)))
           for name, a in CLIPS.items() for t in (0, .25, .5, .75, 1)]


def pose(name, frame):
    RIG.animation_data.action = CLIPS[name]
    for bone in RIG.pose.bones:
        bone.matrix_basis.identity()
    SCENE.frame_set(frame)
    bpy.context.view_layer.update()


def points(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(deps)
    mesh = evaluated.to_mesh()
    result = np.array([evaluated.matrix_world @ v.co for v in mesh.vertices])
    evaluated.to_mesh_clear()
    return result


def bounds(coords):
    return np.array([coords.min(axis=0), coords.max(axis=0)])


# Save actual deformed source positions before transferring or deleting bones.
REFERENCE = {}
for clip, frame in SAMPLES:
    pose(clip, frame)
    REFERENCE[(clip, frame)] = {'parts': {o.name: points(o) for o in PARTS},
                                'focus': np.array(FOCUS.matrix_world),
                                'staff': np.array(RIG.pose.bones['wrist.R'].matrix)}

KEEP = {'root', 'spine01', 'spine02', 'spine03', 'spine04', 'spine05', 'neck01', 'head'}
for side in ('L', 'R'):
    KEEP.update(n+'.'+side for n in ('shoulder01', 'upperarm01', 'upperarm02',
        'lowerarm01', 'lowerarm02', 'wrist', 'upperleg01', 'upperleg02',
        'lowerleg01', 'lowerleg02', 'foot'))
    KEEP.update(f'finger{finger}-{joint}.{side}' for finger in range(1, 6) for joint in range(1, 4))
assert len(KEEP) == 60 and KEEP <= set(RIG.data.bones.keys())
DRIVERS = set()
for action in CLIPS.values():
    for curve in action.fcurves:
        match = re.match(r'pose\.bones\["([^"]+)"\]', curve.data_path)
        if match and any(abs(k.co.y) > 1e-6 for k in curve.keyframe_points):
            DRIVERS.add(match.group(1))
assert DRIVERS <= KEEP, 'New active animation bones must be retained: '+str(DRIVERS-KEEP)
MERGES = {}
for bone in RIG.data.bones:
    parent = bone
    while parent and parent.name not in KEEP:
        parent = parent.parent
    assert parent, 'Bone has no retained ancestor: '+bone.name
    MERGES[bone.name] = parent.name

for obj in PARTS:
    original = {g.index: g.name for g in obj.vertex_groups}
    entries = []
    for vertex in obj.data.vertices:
        weights = {}
        for group in vertex.groups:
            name = original[group.group]
            if name in MERGES:
                target = MERGES[name]
                weights[target] = weights.get(target, 0.0)+group.weight
        chosen = sorted(weights.items(), key=lambda entry: -entry[1])[:4]
        total = sum(w for n, w in chosen)
        assert total > 0, 'Unweighted source vertex in '+obj.name
        entries.append([(n, w/total) for n, w in chosen])
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    groups = {name: obj.vertex_groups.new(name=name) for name in KEEP}
    for i, chosen in enumerate(entries):
        for name, weight in chosen:
            groups[name].add([i], weight, 'REPLACE')

pose('Idle', 1)
RIG.animation_data.action = None
for bone in RIG.pose.bones:
    bone.matrix_basis.identity()
bpy.context.view_layer.update()
active(RIG)
bpy.ops.object.mode_set(mode='EDIT')
rest = {b.name: (b.matrix.copy(), b.length) for b in RIG.data.edit_bones if b.name in KEEP}
for bone in RIG.data.edit_bones:
    if bone.name in KEEP:
        parent = bone.parent
        while parent and parent.name not in KEEP:
            parent = parent.parent
        bone.use_connect = False
        bone.parent = parent
for bone in list(RIG.data.edit_bones):
    if bone.name not in KEEP:
        RIG.data.edit_bones.remove(bone)
for name, (matrix, length) in rest.items():
    RIG.data.edit_bones[name].matrix = matrix
    RIG.data.edit_bones[name].length = length
bpy.ops.object.mode_set(mode='OBJECT')

rig_errors = []
for clip, frame in SAMPLES:
    pose(clip, frame)
    ref = REFERENCE[(clip, frame)]
    distances = np.concatenate([np.linalg.norm(points(o)-ref['parts'][o.name], axis=1) for o in PARTS])
    current_bounds = bounds(np.concatenate([points(o) for o in PARTS]))
    original_bounds = bounds(np.concatenate(list(ref['parts'].values())))
    rig_errors.append({'clip': clip, 'frame': frame, 'maxVertexMeters': float(distances.max()),
        'rmsVertexMeters': float(np.sqrt(np.mean(distances**2))),
        'maxBoundsMeters': float(abs(current_bounds-original_bounds).max()),
        'faceFocusMatrixMaxError': float(abs(np.array(FOCUS.matrix_world)-ref['focus']).max()),
        'wristStaffMatrixMaxError': float(abs(np.array(RIG.pose.bones['wrist.R'].matrix)-ref['staff']).max())})
assert max(r['maxVertexMeters'] for r in rig_errors) < .0005, 'Rig merge changes authored deformation'
assert max(r['faceFocusMatrixMaxError'] for r in rig_errors) < 1e-5
assert max(r['wristStaffMatrixMaxError'] for r in rig_errors) < 1e-5
REPORT['rig'] = {'retainedBones': sorted(KEEP), 'count': len(RIG.data.bones),
                 'activeDrivers': sorted(DRIVERS), 'mergedBones': {n: a for n, a in MERGES.items() if n != a},
                 'samples': rig_errors, 'maxInfluences': 4, 'weights': 'sum ancestor weights, four greatest, renormalize'}
print('BUDGET_RIG_VERIFIED', json.dumps(REPORT['rig']['samples']))

# The original UV range is retained in SourceUV. Atlas UVs are a positive
# affine transform: no wrap discontinuity, rotated tangent basis or tile leak.
RIG.animation_data.action = None
for bone in RIG.pose.bones:
    bone.matrix_basis.identity()
SCENE.frame_set(1)
bpy.context.view_layer.update()
MATERIALS = list(dict.fromkeys(m for obj in PARTS for m in obj.data.materials))
assert len(MATERIALS) <= 10, 'Add an explicit atlas slot for new source material'
slots = [(0, 0, 1024, 1024), (0, 1024, 1024, 1024)] + [
    (x, y, 512, 512) for y in (0, 512, 1024, 1536) for x in (1024, 1536)]


def priority(mat):
    name = mat.name.lower()
    if 'skin' in name: return 0
    if ('strand' in name or 'hair mask' in name) and 'brow' not in name: return 1
    return 2


MATERIALS.sort(key=priority)
ATLAS = {}
alpha_sources = []
for mat, rect in zip(MATERIALS, slots):
    source_uv = []
    atlas_uv_values = []
    for obj in PARTS:
        for polygon in obj.data.polygons:
            if obj.data.materials[polygon.material_index] == mat:
                source_uv.extend(tuple(obj.data.uv_layers.active.data[i].uv) for i in polygon.loop_indices)
    original = np.array(source_uv)
    uv_min, uv_max = original.min(axis=0), original.max(axis=0)
    extent = np.maximum(uv_max-uv_min, .001)
    x, y, width, height = rect
    padding = 16
    ATLAS[mat.name] = {'rectanglePixels': list(rect), 'paddingPixels': padding,
                      'sourceUvMin': uv_min.tolist(), 'sourceUvMax': uv_max.tolist()}
    for obj in PARTS:
        if not obj.data.uv_layers.get('SourceUV'):
            obj.data.uv_layers.active.name = 'SourceUV'
            obj.data.uv_layers.new(name='AtlasUV', do_init=True)
        source = obj.data.uv_layers['SourceUV']
        target = obj.data.uv_layers['AtlasUV']
        for polygon in obj.data.polygons:
            if obj.data.materials[polygon.material_index] == mat:
                for loop in polygon.loop_indices:
                    fraction = (np.array(source.data[loop].uv)-uv_min)/extent
                    target.data[loop].uv = ((x+padding+fraction[0]*(width-2*padding))/2048,
                                           (y+padding+fraction[1]*(height-2*padding))/2048)
                    atlas_uv_values.append(tuple(target.data[loop].uv))
        obj.data.uv_layers.active = target
        target.active_render = True
    atlas_uv_values = np.asarray(atlas_uv_values)
    expected_min = np.asarray((x+padding, y+padding))/2048
    expected_max = np.asarray((x+width-padding, y+height-padding))/2048
    assert np.all(atlas_uv_values >= expected_min-1e-7) and np.all(atlas_uv_values <= expected_max+1e-7)
    ATLAS[mat.name]['actualAtlasUvMin'] = atlas_uv_values.min(axis=0).tolist()
    ATLAS[mat.name]['actualAtlasUvMax'] = atlas_uv_values.max(axis=0).tolist()
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    uvnode = nodes.new('ShaderNodeUVMap'); uvnode.uv_map = 'SourceUV'
    for node in nodes:
        if node.type == 'TEX_IMAGE' and not node.inputs['Vector'].is_linked:
            links.new(uvnode.outputs['UV'], node.inputs['Vector'])
        if node.type == 'NORMAL_MAP':
            node.uv_map = 'SourceUV'
    principled = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    if principled.inputs['Alpha'].is_linked:
        source_node = principled.inputs['Alpha'].links[0].from_node
        cutoff = source_node.inputs[1].default_value if source_node.type == 'MATH' and source_node.operation == 'GREATER_THAN' else None
        alpha_sources.append({'material': mat.name, 'sourceThreshold': cutoff,
                              'sourceExpressionBaked': True, 'destinationThreshold': .5})

for obj in PARTS:
    obj['source_part'] = obj.name
    for modifier in list(obj.modifiers):
        if modifier.type != 'ARMATURE':
            active(obj); bpy.ops.object.modifier_apply(modifier=modifier.name)
# Baking the union avoids one bake per material/object. The source rig and
# objects remain available until geometry reduction has been checked.
duplicates = []
for obj in PARTS:
    duplicate = obj.copy(); duplicate.data = obj.data.copy()
    bpy.context.collection.objects.link(duplicate)
    for modifier in list(duplicate.modifiers): duplicate.modifiers.remove(modifier)
    duplicates.append(duplicate)
bpy.ops.object.select_all(action='DESELECT')
for obj in duplicates: obj.select_set(True)
bpy.context.view_layer.objects.active = duplicates[0]
bpy.ops.object.join()
BAKE = bpy.context.object; BAKE.name = 'Atlas bake surface'
SCENE.render.engine = 'CYCLES'; SCENE.cycles.samples = 1
SCENE.render.bake.use_selected_to_active = False
SCENE.render.bake.use_clear = True; SCENE.render.bake.margin = 12
SCENE.render.bake.margin_type = 'EXTEND'
IMAGES = {}
outputs = {}
surface_links = {}
emission_nodes = {}
targets = {}
for mat in MATERIALS:
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    output = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
    outputs[mat.name] = output
    surface_links[mat.name] = output.inputs['Surface'].links[0].from_socket
    emission_nodes[mat.name] = nodes.new('ShaderNodeEmission')
    targets[mat.name] = nodes.new('ShaderNodeTexImage')


def image(name, noncolor=False):
    img = bpy.data.images.new('Ash atlas '+name, width=2048, height=2048, alpha=True)
    img.colorspace_settings.name = 'Non-Color' if noncolor else 'sRGB'
    img.file_format = 'PNG'; img.filepath_raw = str(OUT / ('atlas-'+name+'.png'))
    IMAGES[name] = img
    return img


def source_socket(mat, name):
    node = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    socket = node.inputs[name]
    return socket.links[0].from_socket if socket.is_linked else None, socket.default_value


def bake_channel(channel, socket_name, noncolor=False):
    img = image(channel, noncolor)
    for mat in MATERIALS:
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        emission = emission_nodes[mat.name]
        if emission.inputs['Color'].is_linked:
            links.remove(emission.inputs['Color'].links[0])
        source, default = source_socket(mat, socket_name)
        if source:
            links.new(source, emission.inputs['Color'])
        else:
            value = (default, default, default, 1) if isinstance(default, (float, int)) else default
            emission.inputs['Color'].default_value = value
        emission.inputs['Strength'].default_value = 1
        if channel == 'emission':
            strength_socket, strength_value = source_socket(mat, 'Emission Strength')
            assert strength_socket is None, 'Emission strength texture needs explicit multiplication'
            emission.inputs['Strength'].default_value = strength_value
        links.new(emission.outputs[0], outputs[mat.name].inputs['Surface'])
        targets[mat.name].image = img
        nodes.active = targets[mat.name]
    active(BAKE)
    bpy.ops.object.bake(type='EMIT')
    print('BUDGET_BAKE_CHANNEL', channel, flush=True)
    return img


base = bake_channel('basecolor', 'Base Color')
alpha = bake_channel('alpha', 'Alpha', True)
rough = bake_channel('roughness', 'Roughness', True)
metal = bake_channel('metallic', 'Metallic', True)
emission = bake_channel('emission', 'Emission Color')
normal = image('normal', True)
for mat in MATERIALS:
    mat.node_tree.links.new(surface_links[mat.name], outputs[mat.name].inputs['Surface'])
    targets[mat.name].image = normal
    mat.node_tree.nodes.active = targets[mat.name]
active(BAKE)
bpy.ops.object.bake(type='NORMAL')
print('BUDGET_BAKE_CHANNEL normal', flush=True)
basepixels = np.asarray(base.pixels[:], dtype=np.float32).reshape(-1, 4)
alphapixels = np.asarray(alpha.pixels[:], dtype=np.float32).reshape(-1, 4)
basepixels[:, 3] = alphapixels[:, 0]
base.pixels.foreach_set(basepixels.ravel())
orm = image('orm', True)
ormpixels = np.ones_like(basepixels)
ormpixels[:, 1] = np.asarray(rough.pixels[:], dtype=np.float32).reshape(-1, 4)[:, 0]
ormpixels[:, 2] = np.asarray(metal.pixels[:], dtype=np.float32).reshape(-1, 4)[:, 0]
orm.pixels.foreach_set(ormpixels.ravel())
for name in ('basecolor', 'normal', 'orm', 'emission'):
    IMAGES[name].save(); IMAGES[name].pack()
MAP_EVIDENCE = {}
for name in ('basecolor', 'normal', 'orm', 'emission'):
    path = Path(IMAGES[name].filepath_raw)
    pixels = np.asarray(IMAGES[name].pixels[:], dtype=np.float32).reshape(-1, 4)
    MAP_EVIDENCE[name] = {'file': path.name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                          'bytes': path.stat().st_size, 'channelMinLinear': pixels.min(axis=0).tolist(),
                          'channelMaxLinear': pixels.max(axis=0).tolist()}


def atlas_material(name, mask):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    p = nodes.get('Principled BSDF')
    for channel in ('basecolor', 'normal', 'orm', 'emission'):
        node = nodes.new('ShaderNodeTexImage'); node.image = IMAGES[channel]
        node.extension = 'EXTEND'
        if channel == 'basecolor':
            links.new(node.outputs['Color'], p.inputs['Base Color'])
            if mask:
                threshold = nodes.new('ShaderNodeMath'); threshold.operation = 'GREATER_THAN'; threshold.inputs[1].default_value = .5
                links.new(node.outputs['Alpha'], threshold.inputs[0]); links.new(threshold.outputs[0], p.inputs['Alpha'])
        elif channel == 'normal':
            n = nodes.new('ShaderNodeNormalMap'); n.uv_map = 'AtlasUV'; n.inputs['Strength'].default_value = 1
            links.new(node.outputs['Color'], n.inputs['Color']); links.new(n.outputs['Normal'], p.inputs['Normal'])
        elif channel == 'orm':
            split = nodes.new('ShaderNodeSeparateColor')
            links.new(node.outputs['Color'], split.inputs['Color'])
            links.new(split.outputs['Green'], p.inputs['Roughness']); links.new(split.outputs['Blue'], p.inputs['Metallic'])
        else:
            links.new(node.outputs['Color'], p.inputs['Emission Color']); p.inputs['Emission Strength'].default_value = 1
    if mask: mat.surface_render_method = 'DITHERED'
    return mat


OPAQUE = atlas_material('Ash atlas opaque', False)
MASK = atlas_material('Ash atlas cutout', True)
alpha_names = {m['material'] for m in alpha_sources}
for obj in PARTS:
    obj['budgetPreserveHairCards'] = any('hair mask' in material.name.lower() for material in obj.data.materials)
    destinations = [1 if obj.data.materials[p.material_index].name in alpha_names else 0 for p in obj.data.polygons]
    obj.data.materials.clear(); obj.data.materials.append(OPAQUE); obj.data.materials.append(MASK)
    for polygon, index in zip(obj.data.polygons, destinations): polygon.material_index = index
    obj.data.uv_layers.remove(obj.data.uv_layers['SourceUV'])
    obj.data.uv_layers['AtlasUV'].active_render = True
bpy.data.objects.remove(BAKE, do_unlink=True)
REPORT['atlas'] = {'method': 'Cycles emission channel and tangent normal bake; source UV explicitly retained during bake',
                   'sourceMaterials': ATLAS, 'alpha': alpha_sources, 'materials': 2,
                   'maps': ['basecolor RGBA', 'tangent normal RGB', 'ORM roughness G metallic B', 'emission RGB'],
                   'mapEvidence': MAP_EVIDENCE,
                   'repeatHandling': 'Entire original UV range baked, positive affine transform, no wrapped polygon or cross-tile UV',
                   'sourceNormalStrengthBaked': True}


def is_body(obj): return 'face neck and articulated hands' in obj.name
def is_eye(obj): return 'eyeball' in obj.name
def protected(obj):
    name = obj.name.lower()
    return obj.get('budgetPreserveHairCards', False) or any(n in name for n in (
        'scalp', 'hair', 'strand', 'forelock', 'sideburn', 'brow', 'focus', 'ash staff'))


def reduce(obj, ratio):
    if ratio >= .999 or triangles(obj) < 100: return
    active(obj)
    dec = obj.modifiers.new('Geometric budget collapse', 'DECIMATE')
    dec.ratio = max(.06, ratio); dec.use_collapse_triangulate = True
    while obj.modifiers.find(dec.name) > 0:
        bpy.ops.object.modifier_move_up(modifier=dec.name)
    bpy.ops.object.modifier_apply(modifier=dec.name)
    # Collapse can interpolate two original four-weight vertices into more
    # influences. Make the intended runtime skin explicit before measuring it.
    for vertex in obj.data.vertices:
        chosen = sorted(((g.group, g.weight) for g in vertex.groups), key=lambda g: -g[1])[:4]
        total = sum(weight for group, weight in chosen)
        assert total > 0
        old_groups = [g.group for g in vertex.groups]
        for group in old_groups: obj.vertex_groups[group].remove([vertex.index])
        for group, weight in chosen: obj.vertex_groups[group].add([vertex.index], weight/total, 'REPLACE')


def tree(obj):
    deps = bpy.context.evaluated_depsgraph_get(); ev = obj.evaluated_get(deps); mesh = ev.to_mesh()
    coords = [ev.matrix_world @ v.co for v in mesh.vertices]
    polys = [tuple(p.vertices) for p in mesh.polygons]
    result = BVHTree.FromPolygons(coords, polys, all_triangles=False)
    ev.to_mesh_clear()
    return result


LODS = {}
for lod, target in (('L0', 34500), ('L1', 14750)):
    objects = []
    for source in PARTS:
        obj = source.copy(); obj.data = source.data.copy(); obj.name = lod+' '+source.name
        bpy.context.collection.objects.link(obj); objects.append(obj)
        if lod == 'L1':
            if is_body(source): reduce(obj, .46)
            elif is_eye(source): reduce(obj, .40)
    fixed = sum(triangles(o) for o, s in zip(objects, PARTS) if is_body(s) or protected(s) or is_eye(s) or triangles(o) < 100)
    flexible = sum(triangles(o) for o, s in zip(objects, PARTS) if not (is_body(s) or protected(s) or is_eye(s)) and triangles(o) >= 100)
    ratio = min(1, (target-fixed)/max(1, flexible))
    assert ratio > .06, 'Protected geometry leaves no viable clothing budget'
    reduction = []
    for obj, source in zip(objects, PARTS):
        before = triangles(source)
        if not (is_body(source) or protected(source) or is_eye(source)):
            reduce(obj, ratio)
        reduction.append({'part': source.name, 'sourceTriangles': before, 'triangles': triangles(obj)})
    surface_errors = []
    for clip, frame in SAMPLES:
        pose(clip, frame)
        ref = REFERENCE[(clip, frame)]
        current = np.concatenate([points(o) for o in objects])
        source_points = np.concatenate(list(ref['parts'].values()))
        detail = {}
        for obj, source in zip(objects, PARTS):
            bvh = tree(obj)
            coords = ref['parts'][source.name]
            errors = [bvh.find_nearest(Vector(p))[3] for p in coords[::3]]
            detail[source.name] = {'samples': len(errors), 'maxMeters': float(max(errors)),
                                   'rmsMeters': float(np.sqrt(np.mean(np.square(errors)))),
                                   'unchangedGeometry': protected(source)}
        surface_errors.append({'clip': clip, 'frame': frame, 'details': detail,
            'maxBoundsMeters': float(abs(bounds(current)-bounds(source_points)).max()),
            'boundsMeters': bounds(current).tolist(),
            'faceFocusMatrixMaxError': float(abs(np.array(FOCUS.matrix_world)-ref['focus']).max()),
            'wristStaffMatrixMaxError': float(abs(np.array(RIG.pose.bones['wrist.R'].matrix)-ref['staff']).max())})
    total = sum(triangles(o) for o in objects)
    assert total <= (35000 if lod == 'L0' else 15000), 'Triangle limit missed: '+str(total)
    body_error = max(d['maxMeters'] for r in surface_errors for n, d in r['details'].items() if 'face neck' in n)
    assert body_error < .004, 'Face/hand reduction exceeds 4 mm sampled surface error: '+str(body_error)
    assert max(r['maxBoundsMeters'] for r in surface_errors) < .005, 'LOD changes grounding or silhouette bounds by more than 5 mm'
    unchanged_error = max(d['maxMeters'] for r in surface_errors for d in r['details'].values() if d['unchangedGeometry'])
    assert unchanged_error < .0005, 'Protected hair, brow, staff or focus geometry changed'
    LODS[lod] = {'triangles': total, 'parts': reduction, 'samples': surface_errors,
                 'sampledBodySurfaceErrorMaxMeters': body_error}
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    mesh = bpy.context.object; mesh.name = 'Ash Archivist '+lod
    # Remove duplicate joined slots so there are actually just two primitives.
    slots_old = list(mesh.data.materials)
    indices = [0 if slots_old[p.material_index] == OPAQUE else 1 for p in mesh.data.polygons]
    mesh.data.materials.clear(); mesh.data.materials.append(OPAQUE); mesh.data.materials.append(MASK)
    for polygon, index in zip(mesh.data.polygons, indices): polygon.material_index = index
    RIG.animation_data.action = None
    for track, old in TRACK_MUTES: track.mute = old
    for bone in RIG.pose.bones: bone.matrix_basis.identity()
    SCENE.frame_set(1); bpy.context.view_layer.update()
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True); RIG.select_set(True); FOCUS.select_set(True)
    bpy.context.view_layer.objects.active = RIG
    filename = 'ember-mage-realism.glb' if lod == 'L0' else 'ember-mage-combat.glb'
    asset = ROOT / 'dist/models' / filename
    bpy.ops.export_scene.gltf(filepath=str(asset), export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_skins=True, export_apply=False, export_image_format='AUTO')
    # The emitted GLB is the authority for actual joints/materials/images/tris.
    raw = asset.read_bytes(); json_length = int.from_bytes(raw[12:16], 'little')
    gltf = json.loads(raw[20:20+json_length])
    actual_triangles = sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
    actual_joints = max(len(s['joints']) for s in gltf['skins'])
    assert actual_triangles == total and actual_joints == 60 and len(gltf['materials']) == 2
    assert {m.get('alphaMode', 'OPAQUE') for m in gltf['materials']} == {'OPAQUE', 'MASK'}
    assert all(m.get('alphaCutoff', .5) == .5 for m in gltf['materials'] if m.get('alphaMode') == 'MASK')
    for material in gltf['materials']:
        assert material['pbrMetallicRoughness'].get('baseColorTexture')
        assert material['pbrMetallicRoughness'].get('metallicRoughnessTexture')
        assert material.get('normalTexture') and material.get('emissiveTexture')
    assert {a['name'] for a in gltf['animations']} == {'Idle', 'Walk', 'Cast'}
    assert any(n.get('name') == 'face_focus' for n in gltf['nodes'])
    stats = {'name': 'Ash Archivist / 灰烬典籍守望者', 'lod': lod,
        'triangles': actual_triangles, 'meshes': len(gltf['meshes']), 'primitives': sum(len(m['primitives']) for m in gltf['meshes']),
        'bones': actual_joints, 'materials': len(gltf['materials']), 'images': len(gltf['images']),
        'glbBytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
        'clips': ['Idle', 'Walk', 'Cast'], 'heightMeters': 1.91, 'baseLicense': 'CC0 1.0',
        'textures': 'Actual baked PBR atlases: original authored/procedural maps and CC0 MakeHuman eyes/skin',
        'limitations': REPORT['limitations']}
    LODS[lod]['actualExport'] = stats
    (OUT / ('statistics.json' if lod == 'L0' else 'combat-statistics.json')).write_text(json.dumps(stats, ensure_ascii=False, indent=2)+'\n')
    for track, old in TRACK_MUTES: track.mute = True
    bpy.data.objects.remove(mesh, do_unlink=True)
    print('BUDGET_LOD_EXPORTED', json.dumps(stats, ensure_ascii=False), flush=True)

REPORT['lods'] = LODS
(OUT / 'budget-report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2)+'\n')
for track, old in TRACK_MUTES: track.mute = old
RIG.animation_data.action = None
SCENE.frame_set(1)
print('BUDGET_COMPLETE', json.dumps({k: v['actualExport'] for k, v in LODS.items()}, ensure_ascii=False), flush=True)
