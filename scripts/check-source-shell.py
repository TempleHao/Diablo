"""Compare two actually generated source rigs and coat-tail deformation.

blender -b -t 1 --python scripts/check-source-shell.py -- baseline.blend current.blend report.json
"""
import hashlib
import json
import sys
from pathlib import Path

import bpy
import numpy as np

baseline, current, destination = [Path(p).resolve() for p in sys.argv[sys.argv.index('--')+1:]]


def collect(path):
    bpy.ops.wm.open_mainfile(filepath=str(path))
    rig = bpy.data.objects['AshArchivistRig']
    parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == rig]
    names = {g.index:g.name for o in parts for g in o.vertex_groups}
    snapshots = {}
    for obj in parts:
        groups = {g.index:g.name for g in obj.vertex_groups}
        snapshots[obj.name] = {
            'positions':np.array([v.co[:] for v in obj.data.vertices]),
            'weights':[{groups[g.group]:g.weight for g in v.groups} for v in obj.data.vertices],
            'polygons':[tuple(p.vertices) for p in obj.data.polygons],
            'uv':np.array([v.uv[:] for v in obj.data.uv_layers.active.data])
        }
    actions = {a.name:a for a in bpy.data.actions if a.name in ['Idle','Walk','Cast']}
    animation = {name:[(c.data_path,c.array_index,[(float(k.co.x),float(k.co.y)) for k in c.keyframe_points])
                       for c in action.fcurves] for name,action in actions.items()}
    bones = {b.name:np.array(b.matrix_local) for b in rig.data.bones}
    for track in rig.animation_data.nla_tracks:track.mute = True
    samples = []
    schedule = [('Idle',1),('Idle',37)]+[('Walk',f) for f in range(1,34)]+[('Cast',f) for f in (1,6,11,16,21,26,31)]
    for clip,frame in schedule:
        rig.animation_data.action = actions[clip]
        for bone in rig.pose.bones:bone.matrix_basis.identity()
        bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
        deps = bpy.context.evaluated_depsgraph_get()
        for obj in parts:
            if not obj.name.startswith('Split coat tail '):continue
            ev = obj.evaluated_get(deps);mesh = ev.to_mesh()
            points = np.array([ev.matrix_world@v.co for v in mesh.vertices]);ev.to_mesh_clear()
            count = len(points)//2
            gaps = np.linalg.norm(points[:count]-points[count:],axis=1)
            samples.append({'part':obj.name,'clip':clip,'frame':frame,'maxLayerDistanceMeters':float(gaps.max()),
                            'minLayerDistanceMeters':float(gaps.min()),'worstPairIndex':int(gaps.argmax())})
    return snapshots, animation, bones, samples


before, old_animation, old_bones, old_samples = collect(baseline)
after, new_animation, new_bones, new_samples = collect(current)
assert before.keys() == after.keys()
assert old_animation == new_animation, 'Source actions changed outside the coat skin correction'
assert old_bones.keys() == new_bones.keys()
bone_error = max(float(abs(old_bones[n]-new_bones[n]).max()) for n in old_bones)
assert bone_error < 1e-8, 'Source rest rig changed'
part_reports = []
for name,a in before.items():
    b = after[name]
    assert a['polygons'] == b['polygons'], 'Source topology changed: '+name
    assert a['positions'].shape == b['positions'].shape and a['uv'].shape == b['uv'].shape
    position_error = float(abs(a['positions']-b['positions']).max())
    uv_error = float(abs(a['uv']-b['uv']).max())
    assert position_error < 1e-7 and uv_error < 1e-8, 'Source rest geometry/UV changed: '+name
    limit = len(a['weights'])//2 if name.startswith('Split coat tail ') else len(a['weights'])
    weight_error = max((abs(x.get(k,0)-y.get(k,0)) for x,y in zip(a['weights'][:limit],b['weights'][:limit])
                        for k in x.keys()|y.keys()),default=0)
    assert weight_error < 1e-7, 'Outer coat or other source weights changed: '+name
    if name.startswith('Split coat tail '):
        count = len(b['weights'])//2
        paired_error = max(abs(x.get(k,0)-y.get(k,0)) for x,y in zip(b['weights'][:count],b['weights'][count:]) for k in x.keys()|y.keys())
        assert paired_error < 1e-7, 'Corrected source shell weights differ'
    part_reports.append({'part':name,'vertices':len(a['weights']),'maxPositionMeters':position_error,
                         'maxUvDifference':uv_error,'unchangedWeightVertices':limit,'maxUnchangedWeightDifference':weight_error})
worst_old = max(old_samples,key=lambda s:s['maxLayerDistanceMeters'])
worst_new = max(new_samples,key=lambda s:s['maxLayerDistanceMeters'])
assert worst_new['maxLayerDistanceMeters'] <= .006001, 'Corrected source shell still expands beyond 6 mm'
report = {'baselineBlendSha256':hashlib.sha256(baseline.read_bytes()).hexdigest(),
          'currentBlendSha256':hashlib.sha256(current.read_bytes()).hexdigest(),
          'parts':part_reports,'restBoneMatrixMaxDifference':bone_error,'sourceAnimationsUnchanged':True,
          'sourceGeometryUvOuterAndOtherWeightsUnchanged':True,
          'originalWorstLayerSample':worst_old,'correctedWorstLayerSample':worst_new,
          'originalLayerSamples':old_samples,'correctedLayerSamples':new_samples,
          'limitations':['Source-layer deformation validation is separate from final LOD render and commercial art acceptance']}
destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(json.dumps(report,indent=2)+'\n')
print('SOURCE_SHELL_CHECK_PASS',json.dumps({'parts':len(part_reports),'samplesPerSource':len(old_samples),
      'oldWorst':worst_old,'newWorst':worst_new}),flush=True)
