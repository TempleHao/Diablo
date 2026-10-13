"""Create two genuinely atlas-baked, pose-preserving character budgets.

blender -b raw-ash-archivist.blend --python scripts/refine-mage-budget.py -- /project
Run only after the full source rig has had its authored rest pose applied.
The project has not selected a license for its original code and artwork.
"""
import bpy
import bmesh
import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

cli = argparse.ArgumentParser(description=__doc__)
cli.add_argument('project')
cli.add_argument('--tail-ratio-l0', type=float, default=.80)
cli.add_argument('--tail-ratio-l1', type=float, default=.40)
cli.add_argument('--tail-error-l0', type=float, default=.012)
cli.add_argument('--tail-error-l1', type=float, default=.025)
cli.add_argument('--baseline-shell-report', type=Path)
cli.add_argument('--baseline-source-sha256')
cli.add_argument('--allow-incoherent-source', action='store_true',
                 help='Diagnostic only: disclose and repair an older source with mismatched shell-layer weights')
ARGS = cli.parse_args(sys.argv[sys.argv.index('--') + 1:])
ROOT = Path(ARGS.project).resolve()
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
REPORT = {'schema': 2, 'inputBlend': Path(SOURCE_FILE).name,
          'generator': {'file':Path(__file__).name,
                        'sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                        'settings':{k:str(v) if isinstance(v,Path) else v for k,v in vars(ARGS).items()}},
          'sourceBlendSha256': hashlib.sha256(Path(SOURCE_FILE).read_bytes()).hexdigest(),
          'sourceTriangles': sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in PARTS),
          'sourceBones': len(RIG.data.bones), 'atlasResolution': 2048,
          'limitations': ['No measured real-device GPU frame rate, memory, heat or battery evidence',
                          'Commercial D2R/D4 art quality is not established',
                          'Inactive face/toe helper channels are merged; separate facial animation requires the source rig']}
if ARGS.baseline_shell_report:
    assert ARGS.baseline_source_sha256 and re.fullmatch('[a-f0-9]{64}', ARGS.baseline_source_sha256)
    evidence_file = ARGS.baseline_shell_report.resolve()
    evidence_data = json.loads(evidence_file.read_text())
    baseline_samples = evidence_data['samples'] if isinstance(evidence_data,dict) else evidence_data
    REPORT['sourceShellBaseline'] = {
        'sourceBlendSha256':ARGS.baseline_source_sha256,
        'diagnosticFile':evidence_file.name, 'diagnosticSha256':hashlib.sha256(evidence_file.read_bytes()).hexdigest(),
        'originalPairSeparationMaxMeters':max(s['pairedShellSeparationMaxMeters'] for s in baseline_samples),
        'intentionalChange':'Source generator now shares corresponding tail-layer weights; original outside weighting is retained',
        'samples':baseline_samples}


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

# Tail validation uses every source vertex and both distance directions. The
# former every-third-vertex, five-frame screen missed large Walk creases.
TAILS = [o for o in PARTS if o.name.startswith('Split coat tail ')]
assert len(TAILS) == 2
TAIL_FRAMES = [('Walk', frame) for frame in range(int(CLIPS['Walk'].frame_range.x),
                                               int(CLIPS['Walk'].frame_range.y)+1)]
TAIL_FRAMES += [(clip, frame) for clip, frame in SAMPLES if clip != 'Walk']
TAIL_REFERENCE = {}
TAIL_SHARED_REFERENCE = {}
shared_tails = {}
for source in TAILS:
    copy = source.copy(); copy.data = source.data.copy(); copy.name = 'Shared-weight tail reference '+source.name
    bpy.context.collection.objects.link(copy); shared_tails[source.name] = copy
    count = len(copy.data.vertices)//2
    assert count*2 == len(copy.data.vertices)
    for i in range(count):
        outside_weights = [(g.group,g.weight) for g in copy.data.vertices[i].groups]
        for group in list(copy.data.vertices[i+count].groups): copy.vertex_groups[group.group].remove([i+count])
        for group,weight in outside_weights: copy.vertex_groups[group].add([i+count],weight,'REPLACE')
shell_correction = []
for clip, frame in TAIL_FRAMES:
    pose(clip, frame)
    TAIL_REFERENCE[(clip, frame)] = {o.name: points(o) for o in TAILS}
    TAIL_SHARED_REFERENCE[(clip, frame)] = {name:points(copy) for name,copy in shared_tails.items()}
    for source in TAILS:
        original = TAIL_REFERENCE[(clip,frame)][source.name]
        shared = TAIL_SHARED_REFERENCE[(clip,frame)][source.name]
        count = len(original)//2
        shell_correction.append({'part':source.name,'clip':clip,'frame':frame,
            'originalShellPairSeparationMaxMeters':float(np.linalg.norm(original[:count]-original[count:],axis=1).max()),
            'sharedWeightShellPairSeparationMaxMeters':float(np.linalg.norm(shared[:count]-shared[count:],axis=1).max()),
            'intentionalInnerVertexCorrectionMaxMeters':float(np.linalg.norm(shared[count:]-original[count:],axis=1).max()),
            'outsideVertexChangeMaxMeters':float(np.linalg.norm(shared[:count]-original[:count],axis=1).max())})
for copy in shared_tails.values(): bpy.data.objects.remove(copy,do_unlink=True)
REPORT['tailShellWeightCorrection'] = {
    'method':'Retain authored outside weights; share those weights with corresponding inside vertices',
    'reason':'Independent nearest-three-bone selection gives opposing layers different bone sets despite only 6mm separation',
    'inputBlendUnmodified':True,
    'referenceDisclosure':'Tail fidelity gate uses this explicit corrected high reference; frozen-original deformation differences are separately measured',
    'originalShellPairSeparationMaxMeters':max(s['originalShellPairSeparationMaxMeters'] for s in shell_correction),
    'sharedWeightShellPairSeparationMaxMeters':max(s['sharedWeightShellPairSeparationMaxMeters'] for s in shell_correction),
    'intentionalInnerVertexCorrectionMaxMeters':max(s['intentionalInnerVertexCorrectionMaxMeters'] for s in shell_correction),
    'outsideVertexChangeMaxMeters':max(s['outsideVertexChangeMaxMeters'] for s in shell_correction),
    'samples':shell_correction}
assert REPORT['tailShellWeightCorrection']['outsideVertexChangeMaxMeters'] < 1e-7
assert REPORT['tailShellWeightCorrection']['sharedWeightShellPairSeparationMaxMeters'] < .006001
REPORT['tailShellWeightCorrection']['sourceWasAlreadyCoherent'] = REPORT['tailShellWeightCorrection']['intentionalInnerVertexCorrectionMaxMeters'] < 1e-7
assert ARGS.allow_incoherent_source or REPORT['tailShellWeightCorrection']['sourceWasAlreadyCoherent'], \
    'Rebuild the source with corresponding tail-layer weights before producing release budgets'

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
# Preserve the authored high surface and its SourceUV shader sampling. The
# runtime material replacement below must not become the high bake source.
CLOTH_HIGH = {}
for obj in PARTS:
    material_names = {obj.data.materials[p.material_index].name for p in obj.data.polygons}
    if material_names <= {'Weathered charcoal linen', 'Oxblood wool'}:
        assert len(material_names) == 1
        obj['budgetClothMaterial'] = next(iter(material_names))
        high = obj.copy(); high.data = obj.data.copy(); high.name = 'Normal high '+obj.name
        bpy.context.collection.objects.link(high)
        for modifier in list(high.modifiers): high.modifiers.remove(modifier)
        high.data.set_sharp_from_angle(angle=math.radians(60))
        CLOTH_HIGH[obj.name] = high
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
        uv = nodes.new('ShaderNodeUVMap'); uv.uv_map = 'NormalUV' if channel == 'normal' else 'AtlasUV'
        links.new(uv.outputs['UV'], node.inputs['Vector'])
        if channel == 'basecolor':
            links.new(node.outputs['Color'], p.inputs['Base Color'])
            if mask:
                threshold = nodes.new('ShaderNodeMath'); threshold.operation = 'GREATER_THAN'; threshold.inputs[1].default_value = .5
                links.new(node.outputs['Alpha'], threshold.inputs[0]); links.new(threshold.outputs[0], p.inputs['Alpha'])
        elif channel == 'normal':
            n = nodes.new('ShaderNodeNormalMap'); n.uv_map = 'NormalUV'; n.inputs['Strength'].default_value = 1
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
                   'sourceNormalStrengthBaked': True,
                   'textureUv': {'basecolor': 0, 'orm': 0, 'emission': 0, 'normal': 1},
                   'normalMethod': 'LOD-specific final-triangle cloth high-to-low bake; other surfaces retain their authored atlas normal',
                   'normalScope': sorted(CLOTH_HIGH),
                   'unchangedMapUv': 'AtlasUV retains authored face, hair-card and other base/ORM/emission resolution'}


def is_body(obj): return 'face neck and articulated hands' in obj.name
def is_eye(obj): return 'eyeball' in obj.name
def protected(obj):
    name = obj.name.lower()
    return obj.get('budgetPreserveHairCards', False) or any(n in name for n in (
        'scalp', 'hair', 'strand', 'forelock', 'sideburn', 'brow', 'focus', 'ash staff'))


def reduce(obj, ratio, protection=None):
    if ratio >= .999 or triangles(obj) < 100: return
    active(obj)
    dec = obj.modifiers.new('Geometric budget collapse', 'DECIMATE')
    dec.ratio = max(.06, ratio); dec.use_collapse_triangulate = True
    if protection:
        dec.vertex_group = protection
        dec.vertex_group_factor = 12
    while obj.modifiers.find(dec.name) > 0:
        bpy.ops.object.modifier_move_up(modifier=dec.name)
    bpy.ops.object.modifier_apply(modifier=dec.name)
    # Collapse can interpolate two original four-weight vertices into more
    # influences. Make the intended runtime skin explicit before measuring it.
    normalize_weights(obj)


def normalize_weights(obj):
    retained = {g.index for g in obj.vertex_groups if g.name in KEEP}
    for vertex in obj.data.vertices:
        chosen = sorted(((g.group, g.weight) for g in vertex.groups if g.group in retained), key=lambda g: -g[1])[:4]
        total = sum(weight for group, weight in chosen)
        assert total > 0
        old_groups = [g.group for g in vertex.groups]
        for group in old_groups: obj.vertex_groups[group].remove([vertex.index])
        for group, weight in chosen: obj.vertex_groups[group].add([vertex.index], weight/total, 'REPLACE')


def reduce_tail(obj, ratio):
    """Collapse the authored outside only, then reproduce the thin shell.

    Source strip/Solidify topology has corresponding vertex halves. Verify that
    assumption rather than silently treating a different source as a strip.
    """
    count = len(obj.data.vertices)//2
    assert len(obj.data.vertices) == count*2
    outside = [p for p in obj.data.polygons if all(i < count for i in p.vertices)]
    inside = [p for p in obj.data.polygons if all(i >= count for i in p.vertices)]
    assert len(outside) == len(inside) == 384, 'Tail source shell topology changed'
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index >= count], context='VERTS')
    bm.to_mesh(obj.data); bm.free(); obj.data.update()
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    border = {v.index for e in bm.edges if e.is_boundary for v in e.verts}
    bm.free()
    protect = obj.vertex_groups.new(name='Budget tail border protection')
    protection_weights = {vertex:1.0 for vertex in border}
    # Mark high skin-weight gradients as well as the opening and hem. The group
    # is only a collapse cost and is removed before normal skin normalization.
    bone_groups = {g.index for g in obj.vertex_groups if g.name in KEEP}
    skin = [{g.group:g.weight for g in v.groups if g.group in bone_groups} for v in obj.data.vertices]
    for edge in obj.data.edges:
        a, b = edge.vertices
        gradient = sum(abs(skin[a].get(i, 0)-skin[b].get(i, 0)) for i in skin[a].keys()|skin[b].keys())
        if gradient > .16:
            for vertex in (a,b):
                protection_weights[vertex] = max(protection_weights.get(vertex,0), min(1,gradient*2))
    for vertex,weight in protection_weights.items(): protect.add([vertex],weight,'REPLACE')
    # The temporary group must not participate in the runtime skin weights.
    active(obj)
    dec = obj.modifiers.new('Outside-only weighted tail collapse', 'DECIMATE')
    dec.ratio = ratio; dec.use_collapse_triangulate = True
    protection_name = protect.name
    dec.vertex_group = protection_name; dec.invert_vertex_group = True; dec.vertex_group_factor = 1
    while obj.modifiers.find(dec.name) > 0: bpy.ops.object.modifier_move_up(modifier=dec.name)
    bpy.ops.object.modifier_apply(modifier=dec.name)
    remaining_protection = obj.vertex_groups.get(protection_name)
    if remaining_protection: obj.vertex_groups.remove(remaining_protection)
    normalize_weights(obj)
    shell = obj.modifiers.new('Final corresponding 6mm tail shell', 'SOLIDIFY')
    shell.thickness = .006; shell.offset = -1; shell.use_even_offset = False
    while obj.modifiers.find(shell.name) > 0: bpy.ops.object.modifier_move_up(modifier=shell.name)
    bpy.ops.object.modifier_apply(modifier=shell.name)
    obj.data.update()
    obj.data.set_sharp_from_angle(angle=math.radians(60))
    return {'method': 'outside-only collapse, boundary and skin-gradient costs, final corresponding shell',
            'outsideRatio': ratio, 'protectedOutsideVertices': len(border), 'thicknessMeters': .006,
            'shellWeights': 'Solidify duplicates final outside weights to corresponding inside/rim vertices'}


def finalize_triangles(obj):
    active(obj)
    tri = obj.modifiers.new('Frozen bake and export triangles', 'TRIANGULATE')
    tri.quad_method = 'FIXED'; tri.ngon_method = 'BEAUTY'; tri.keep_custom_normals = True
    while obj.modifiers.find(tri.name) > 0: bpy.ops.object.modifier_move_up(modifier=tri.name)
    bpy.ops.object.modifier_apply(modifier=tri.name)
    assert all(len(p.vertices) == 3 for p in obj.data.polygons)


def uv_raster_evidence(objects, rectangle, strict=True):
    """Verify triangle interiors at the actual tile pixel centers.

    This is a finite raster check, not a mathematical all-resolution claim.
    Smart Project packs the selected shells together before the affine tile
    placement; the raster check catches object-wise layouts accidentally stacked.
    """
    x, y, width, height = rectangle
    coverage = np.zeros((height, width), dtype=np.uint16)
    owners = np.full((height,width),-1,dtype=np.int32)
    face_labels = []
    overlaps = []
    areas = []
    for obj in objects:
        uv = obj.data.uv_layers['NormalUV']
        for polygon in obj.data.polygons:
            face_index = len(face_labels); face_labels.append((obj.name,polygon.index))
            a,b,c = [np.array(uv.data[i].uv)*2048-np.array((x,y)) for i in polygon.loop_indices]
            ab,ac = b-a,c-a
            determinant = ab[0]*ac[1]-ab[1]*ac[0]
            areas.append(abs(float(determinant))*.5)
            if abs(determinant) < 1e-10: continue
            low=np.maximum(0,np.floor(np.minimum(np.minimum(a,b),c)).astype(int))
            high=np.minimum((width-1,height-1),np.floor(np.maximum(np.maximum(a,b),c)).astype(int))
            if np.any(high < low): continue
            xx,yy=np.meshgrid(np.arange(low[0],high[0]+1)+.5,np.arange(low[1],high[1]+1)+.5)
            dx,dy=xx-a[0],yy-a[1]
            u=(dx*ac[1]-dy*ac[0])/determinant
            v=(ab[0]*dy-ab[1]*dx)/determinant
            interior=(u>1e-5)&(v>1e-5)&(u+v<1-1e-5)
            region = coverage[low[1]:high[1]+1,low[0]:high[0]+1]
            owner_region = owners[low[1]:high[1]+1,low[0]:high[0]+1]
            for previous in np.unique(owner_region[interior & (region>0)]):
                overlaps.append({'previous':face_labels[int(previous)],'current':face_labels[face_index]})
            owner_region[interior & (region==0)] = face_index
            coverage[low[1]:high[1]+1,low[0]:high[0]+1] += interior
    result={'triangles':len(areas),'minimumTriangleAreaPixels':min(areas),
            'coveredInteriorPixels':int(np.count_nonzero(coverage)),
            'overlappingInteriorPixels':int(np.count_nonzero(coverage>1)),
            'verification':'triangle interiors sampled at original 512px tile pixel centers'}
    assert result['minimumTriangleAreaPixels'] > 1e-7, 'Degenerate normal UV triangle'
    if result['overlappingInteriorPixels'] and strict:
        result['overlappingFaces'] = overlaps
        bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'normal-uv-failure.blend'))
    if overlaps: result['overlappingFaces'] = overlaps
    if strict: assert result['overlappingInteriorPixels'] == 0, 'Overlapping final cloth NormalUV interiors: '+json.dumps(result)
    return result, coverage > 0


def repair_projected_uv(group, rectangle):
    """Separate just the triangles whose projected islands fold onto themselves.

    Smart Project can preserve a small self-overlap within a folded thin-shell
    island. Island packing cannot cure that. Split the offending triangle UVs
    from their neighbors, then repack the complete material group.
    """
    x,y,width,height = rectangle
    separated = set()
    for attempt in range(8):
        evidence, mask = uv_raster_evidence(group,rectangle,strict=False)
        if not evidence['overlappingInteriorPixels']:
            evidence['separatedProjectedTriangles'] = len(separated)
            evidence['projectionRepairPasses'] = attempt
            return evidence,mask
        collisions = {tuple(pair[key]) for pair in evidence['overlappingFaces'] for key in ('previous','current')}
        by_name = {obj.name:obj for obj in group}
        for obj in group:
            for loop in obj.data.uv_layers['NormalUV'].data:
                loop.uv = ((loop.uv.x*2048-x-16)/(width-32),(loop.uv.y*2048-y-16)/(height-32))
        for index,(name,face) in enumerate(sorted(collisions)):
            obj = by_name[name]; separated.add((name,face))
            for loop_index in obj.data.polygons[face].loop_indices:
                obj.data.uv_layers['NormalUV'].data[loop_index].uv += Vector((.002*(index+1),.001*(index+1)))
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group:
            obj.select_set(True); obj.data.uv_layers.active = obj.data.uv_layers['NormalUV']
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(rotate=True, udim_source='ACTIVE_UDIM', margin_method='FRACTION', margin=8/(width-32),shape_method='CONCAVE')
        bpy.ops.object.mode_set(mode='OBJECT')
        for obj in group:
            for loop in obj.data.uv_layers['NormalUV'].data:
                loop.uv = ((x+16+loop.uv.x*(width-32))/2048,(y+16+loop.uv.y*(height-32))/2048)
    return uv_raster_evidence(group,rectangle,strict=True)


def unwrap_cloth(group, rectangle):
    x,y,width,height = rectangle
    for obj in group:
        obj.data.set_sharp_from_angle(angle=math.radians(60))
        bm = bmesh.new(); bm.from_mesh(obj.data)
        atlas = bm.loops.layers.uv['AtlasUV']
        signs = {}
        for face in bm.faces:
            uv = [loop[atlas].uv for loop in face.loops]
            determinant = sum(a.x*b.y-b.x*a.y for a,b in zip(uv,uv[1:]+uv[:1]))
            signs[face] = 0 if abs(determinant)<1e-10 else (1 if determinant>0 else -1)
        for edge in bm.edges:
            edge.seam = len(edge.link_faces)!=2
            if len(edge.link_faces)!=2: continue
            a,b = edge.link_faces
            coordinates = [{loop.vert.index:loop[atlas].uv.copy() for loop in face.loops} for face in (a,b)]
            discontinuity = any((coordinates[0][v.index]-coordinates[1][v.index]).length>1e-6 for v in edge.verts)
            edge.seam = discontinuity or signs[a]!=signs[b] or edge.calc_face_angle()>math.radians(60)
        bm.to_mesh(obj.data); bm.free()
        obj.data.uv_layers.active = obj.data.uv_layers['NormalUV']
    bpy.ops.object.select_all(action='DESELECT')
    for obj in group: obj.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.unwrap(method='ANGLE_BASED', margin=0, fill_holes=True, correct_aspect=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, udim_source='ACTIVE_UDIM', margin_method='FRACTION', margin=8/(width-32),shape_method='CONCAVE')
    bpy.ops.object.mode_set(mode='OBJECT')
    for obj in group:
        for loop in obj.data.uv_layers['NormalUV'].data:
            loop.uv = ((x+16+loop.uv.x*(width-32))/2048,(y+16+loop.uv.y*(height-32))/2048)
    return repair_projected_uv(group,rectangle)


def cloth_normal(lod, objects):
    # Preserve face/hair and all unaffected normal pixels. Only cloth rectangles
    # are repacked; base, ORM, emission and every AtlasUV coordinate stay intact.
    result = image('normal-'+lod.lower(), True)
    pixels = np.asarray(normal.pixels[:], dtype=np.float32).reshape(2048,2048,4)
    groups = {}
    atlas_before = {obj.name: np.array([tuple(loop.uv) for loop in obj.data.uv_layers['AtlasUV'].data]) for obj in objects}
    for obj in objects:
        layer = obj.data.uv_layers.new(name='NormalUV', do_init=False)
        atlas = obj.data.uv_layers['AtlasUV']
        for i in range(len(layer.data)): layer.data[i].uv = atlas.data[i].uv
        if obj.get('budgetClothMaterial'):
            groups.setdefault(obj['budgetClothMaterial'], []).append(obj)
    evidence = {}
    coverage_masks = {}
    for material_name, group in groups.items():
        x,y,width,height = ATLAS[material_name]['rectanglePixels']
        # A sentinel distinguishes an untouched texel from a legitimate neutral
        # baked normal. It is replaced only after coverage validation succeeds.
        pixels[y:y+height,x:x+width] = (.5,.5,0,1)
        raster,coverage_masks[material_name] = unwrap_cloth(group,[x,y,width,height])
        evidence[material_name] = {'rectanglePixels':[x,y,width,height], 'partCount':len(group),
                                  'unwrap':'AtlasUV discontinuity, orientation and 60-degree feature seams; Angle Based charts with equal surface texel density',
                                  'bakeMarginPixels':3, 'islandMarginPixels':8,
                                  **raster}
    result.pixels.foreach_set(pixels.ravel())
    target_nodes = {}
    for mat in (OPAQUE,MASK):
        target = mat.node_tree.nodes.new('ShaderNodeTexImage'); target.image = result
        mat.node_tree.nodes.active = target; target_nodes[mat.name] = target
    SCENE.render.bake.use_clear = False
    SCENE.render.bake.use_selected_to_active = True
    SCENE.render.bake.normal_space = 'TANGENT'
    SCENE.render.bake.normal_r = 'POS_X'; SCENE.render.bake.normal_g = 'POS_Y'; SCENE.render.bake.normal_b = 'POS_Z'
    SCENE.render.bake.margin = 3
    SCENE.render.bake.cage_extrusion = .016
    SCENE.render.bake.max_ray_distance = .032
    bake_parts = []
    for obj in objects:
        if not obj.get('budgetClothMaterial'): continue
        high = CLOTH_HIGH[obj['source_part']]
        active(obj); high.select_set(True)
        obj.data.uv_layers.active = obj.data.uv_layers['NormalUV']
        bpy.ops.object.bake(type='NORMAL', uv_layer='NormalUV', use_selected_to_active=True)
        bake_parts.append({'part':obj['source_part'], 'sourceTriangles':triangles(high),
                           'finalTriangles':triangles(obj), 'selectedSourceObjects':1})
        print('BUDGET_CLOTH_NORMAL', lod, obj['source_part'], flush=True)
    for mat in (OPAQUE,MASK):
        mat.node_tree.nodes.remove(target_nodes[mat.name])
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image == normal: node.image = result
            elif node.type == 'TEX_IMAGE' and node.image and node.image.name.startswith('Ash atlas normal-'):
                node.image = result
    for obj in objects:
        obj.data.uv_layers.active = obj.data.uv_layers['AtlasUV']
        obj.data.uv_layers['AtlasUV'].active_render = True
        assert [layer.name for layer in obj.data.uv_layers] == ['AtlasUV','NormalUV']
        assert np.array_equal(atlas_before[obj.name], np.array([tuple(loop.uv) for loop in obj.data.uv_layers['AtlasUV'].data]))
    values = np.asarray(result.pixels[:],dtype=np.float32).reshape(-1,4)
    value_image = values.reshape(2048,2048,4)
    for material_name,mask in coverage_masks.items():
        x,y,width,height = evidence[material_name]['rectanglePixels']
        encoded = value_image[y:y+height,x:x+width][mask,:3]
        vectors = encoded*2-1
        lengths = np.linalg.norm(vectors,axis=1)
        holes = np.count_nonzero(np.max(encoded,axis=1) < .01)
        unprojected = np.count_nonzero(np.all(abs(encoded-np.array((.5,.5,0))) < 1e-6,axis=1))
        evidence[material_name]['bakedInteriorPixels'] = len(encoded)
        evidence[material_name]['blackHolePixels'] = int(holes)
        evidence[material_name]['unprojectedInteriorPixels'] = int(unprojected)
        evidence[material_name]['backwardNormalPixels'] = int(np.count_nonzero(vectors[:,2] < -.01))
        evidence[material_name]['encodedNormalLengthMin'] = float(lengths.min())
        evidence[material_name]['encodedNormalLengthMax'] = float(lengths.max())
        assert holes == 0, 'Unprojected black normal pixels in cloth interiors'
        assert unprojected == 0, 'Untouched normal projection sentinel in cloth interiors'
        tile = value_image[y:y+height,x:x+width]
        background = np.all(abs(tile[:,:,:3]-np.array((.5,.5,0))) < 1e-6,axis=2)
        tile[background] = (.5,.5,1,1)
    result.pixels.foreach_set(values.ravel())
    result.save(); result.pack()
    file = Path(result.filepath_raw)
    return {'method':'selected authored high to final triangulated low; one source object per cloth bake',
            'uvLayer':'NormalUV', 'texCoord':1, 'uvTiles':evidence, 'parts':bake_parts,
            'cageExtrusionMeters':.016, 'maxRayDistanceMeters':.032,
            'useClear':False, 'file':file.name, 'bytes':file.stat().st_size,
            'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
            'channelMinLinear':values.min(axis=0).tolist(), 'channelMaxLinear':values.max(axis=0).tolist(),
            'limitations':['Part isolation does not itself prove absence of same-part shell ray crossover',
                           'Cycles tangent bake and Three derivative tangent reconstruction require native render inspection']}


def tail_errors(objects, limit):
    samples = []
    tails = {o['source_part']:o for o in objects if o['source_part'].startswith('Split coat tail ')}
    for clip, frame in TAIL_FRAMES:
        pose(clip, frame)
        for source in TAILS:
            obj = tails[source.name]
            coords = TAIL_SHARED_REFERENCE[(clip,frame)][source.name]
            frozen_original = TAIL_REFERENCE[(clip,frame)][source.name]
            bvh = tree(obj)
            forwards = [bvh.find_nearest(Vector(p))[3] for p in coords]
            original_forwards = [bvh.find_nearest(Vector(p))[3] for p in frozen_original]
            source_bvh = BVHTree.FromPolygons([Vector(p) for p in coords],
                [tuple(p.vertices) for p in source.data.polygons], all_triangles=False)
            low_coords = points(obj)
            backwards = [source_bvh.find_nearest(Vector(p))[3] for p in low_coords]
            worst = max(max(forwards),max(backwards))
            source_worst_index = int(np.argmax(forwards))
            low_worst_index = int(np.argmax(backwards))
            samples.append({'part':source.name,'clip':clip,'frame':frame,
                'sourceVertexSamples':len(forwards),'lowVertexSamples':len(backwards),
                'sourceToLowMaxMeters':float(max(forwards)), 'lowToSourceMaxMeters':float(max(backwards)),
                'frozenOriginalSourceToLowMaxMeters':float(max(original_forwards)),
                'finalShellPairSeparationMaxMeters':float(np.linalg.norm(low_coords[:len(low_coords)//2]-low_coords[len(low_coords)//2:],axis=1).max()),
                'bidirectionalMaxMeters':float(worst),
                'sourceWorstVertexIndex':source_worst_index,
                'sourceWorstVertexLayer':'outside' if source_worst_index < len(coords)//2 else 'inside',
                'sourceWorstVertexPosition':coords[source_worst_index].tolist(),
                'lowWorstVertexIndex':low_worst_index,
                'lowWorstVertexLayer':'outside' if low_worst_index < len(low_coords)//2 else 'inside',
                'lowWorstVertexPosition':low_coords[low_worst_index].tolist(),
                'sourceToLowRmsMeters':float(np.sqrt(np.mean(np.square(forwards)))),
                'lowToSourceRmsMeters':float(np.sqrt(np.mean(np.square(backwards))))})
    worst = max(samples,key=lambda row:row['bidirectionalMaxMeters'])
    print('BUDGET_TAIL_SURFACE', json.dumps(worst), flush=True)
    (OUT / ('tail-diagnostic-'+str(limit)+'.json')).write_text(json.dumps(samples,indent=2)+'\n')
    assert worst['bidirectionalMaxMeters'] <= limit, 'Tail surface gate missed: '+json.dumps(worst)
    assert max(s['finalShellPairSeparationMaxMeters'] for s in samples) < .006001
    return {'method':'all source and final low vertices against the opposite deformed triangle surface',
            'reference':'Explicit corresponding-layer shared-weight high reference; original outside weights and rest geometry retained',
            'walkCoverage':'every integer authored frame', 'limitMeters':limit,
            'frozenOriginalSourceToLowMaxMeters':max(s['frozenOriginalSourceToLowMaxMeters'] for s in samples),
            'finalShellPairSeparationMaxMeters':max(s['finalShellPairSeparationMaxMeters'] for s in samples),
            'maxMeters':worst['bidirectionalMaxMeters'], 'worstSample':worst,'samples':samples}


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
    tail_methods = {}
    for source in PARTS:
        obj = source.copy(); obj.data = source.data.copy(); obj.name = lod+' '+source.name
        bpy.context.collection.objects.link(obj); objects.append(obj)
        if source in TAILS:
            tail_methods[source.name] = reduce_tail(obj, ARGS.tail_ratio_l0 if lod == 'L0' else ARGS.tail_ratio_l1)
        if lod == 'L1':
            if is_body(source): reduce(obj, .46)
            elif is_eye(source): reduce(obj, .40)
    fixed = sum(triangles(o) for o, s in zip(objects, PARTS) if s in TAILS or is_body(s) or protected(s) or is_eye(s) or triangles(o) < 100)
    flexible = sum(triangles(o) for o, s in zip(objects, PARTS) if not (s in TAILS or is_body(s) or protected(s) or is_eye(s)) and triangles(o) >= 100)
    ratio = min(1, (target-fixed)/max(1, flexible))
    assert ratio > .06, 'Protected geometry leaves no viable clothing budget'
    reduction = []
    for obj, source in zip(objects, PARTS):
        before = triangles(source)
        if not (source in TAILS or is_body(source) or protected(source) or is_eye(source)):
            reduce(obj, ratio)
        if obj.get('budgetClothMaterial'): obj.data.set_sharp_from_angle(angle=math.radians(60))
        finalize_triangles(obj)
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
    measured_tails = tail_errors(objects, ARGS.tail_error_l0 if lod == 'L0' else ARGS.tail_error_l1)
    RIG.animation_data.action = None
    for bone in RIG.pose.bones: bone.matrix_basis.identity()
    SCENE.frame_set(1); bpy.context.view_layer.update()
    normal_evidence = cloth_normal(lod, objects)
    LODS[lod] = {'triangles': total, 'parts': reduction, 'samples': surface_errors,
                 'sampledBodySurfaceErrorMaxMeters': body_error,
                 'tailReduction':tail_methods, 'tailSurface':measured_tails,
                 'clothNormal':normal_evidence, 'flexibleCollapseRatio':ratio}
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
        export_skins=True, export_apply=False, export_tangents=False, export_image_format='AUTO')
    # The emitted GLB is the authority for actual joints/materials/images/tris.
    raw = asset.read_bytes(); json_length = int.from_bytes(raw[12:16], 'little')
    gltf = json.loads(raw[20:20+json_length])
    actual_triangles = sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives'])
    actual_joints = max(len(s['joints']) for s in gltf['skins'])
    assert actual_triangles == total and actual_joints == 60 and len(gltf['materials']) == 2 and len(gltf['images']) == 4
    primitives = [p for mesh in gltf['meshes'] for p in mesh['primitives']]
    assert all('TEXCOORD_0' in p['attributes'] and 'TEXCOORD_1' in p['attributes'] and 'TANGENT' not in p['attributes'] for p in primitives)
    assert {m.get('alphaMode', 'OPAQUE') for m in gltf['materials']} == {'OPAQUE', 'MASK'}
    assert all(m.get('alphaCutoff', .5) == .5 for m in gltf['materials'] if m.get('alphaMode') == 'MASK')
    for material in gltf['materials']:
        assert material['pbrMetallicRoughness'].get('baseColorTexture')
        assert material['pbrMetallicRoughness'].get('metallicRoughnessTexture')
        assert material.get('normalTexture') and material.get('emissiveTexture')
        assert material['normalTexture'].get('texCoord',0) == 1
        assert material['pbrMetallicRoughness']['baseColorTexture'].get('texCoord',0) == 0
        assert material['pbrMetallicRoughness']['metallicRoughnessTexture'].get('texCoord',0) == 0
        assert material['emissiveTexture'].get('texCoord',0) == 0
    assert {a['name'] for a in gltf['animations']} == {'Idle', 'Walk', 'Cast'}
    assert any(n.get('name') == 'face_focus' for n in gltf['nodes'])
    stats = {'name': 'Ash Archivist / 灰烬典籍守望者', 'lod': lod,
        'triangles': actual_triangles, 'meshes': len(gltf['meshes']), 'primitives': sum(len(m['primitives']) for m in gltf['meshes']),
        'bones': actual_joints, 'materials': len(gltf['materials']), 'images': len(gltf['images']),
        'glbBytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(),
        'clips': ['Idle', 'Walk', 'Cast'], 'heightMeters': 1.91, 'baseLicense': 'CC0 1.0',
        'textures': 'Actual baked PBR atlases: original authored/procedural maps and CC0 MakeHuman eyes/skin',
        'textureUv':REPORT['atlas']['textureUv'],
        'normalBake':'LOD-specific isolated authored cloth high-to-final-low; original normal elsewhere',
        'tailSurfaceErrorMaxMeters':measured_tails['maxMeters'],
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
