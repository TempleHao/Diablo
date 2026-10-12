"""Render read-only ART-02 pose/contact evidence from the editable raw source.

blender -b assets-source/ash-archivist/ash-archivist.blend --python scripts/render-mage-inspection.py -- /absolute/project/path
"""
import bpy,sys
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
root=Path(args[0]).resolve()
out=root/'assets-source/ash-archivist'
scene=bpy.context.scene;camera=scene.camera
label=''
if '--asset' in args:
    asset=Path(args[args.index('--asset')+1]).resolve()
    label=args[args.index('--label')+1]+'-' if '--label' in args else 'imported-'
    # Keep the identical neutral studio and inspect the actual exported file.
    for obj in list(bpy.data.objects):
        if obj.type in {'ARMATURE','EMPTY'} or obj.type=='MESH' and obj.name!='Studio-only neutral ground':
            bpy.data.objects.remove(obj,do_unlink=True)
    for action in list(bpy.data.actions):bpy.data.actions.remove(action)
    bpy.ops.import_scene.gltf(filepath=str(asset))
rig=next(obj for obj in bpy.data.objects if obj.type=='ARMATURE')
scene.cycles.samples=32;scene.cycles.use_denoising=False
scene.render.resolution_x=900;scene.render.resolution_y=900
for track in rig.animation_data.nla_tracks:track.mute=True
def action_for(clip):
    # glTF importer names actions with their rig/slot suffix, unlike raw source.
    action=next((strip.action for track in rig.animation_data.nla_tracks for strip in track.strips if clip in track.name or clip in strip.name or clip in strip.action.name),None)
    action=action or next((a for a in bpy.data.actions if clip in a.name),None)
    if action is None:raise RuntimeError('Missing required inspection action '+clip)
    print('ART2_ACTION',clip,action.name,flush=True)
    return action
rig.animation_data.action=action_for('Idle');scene.frame_set(1)
if label:
    camera.location=(.75,-2.30,1.87);camera.rotation_euler=(Vector((0,-.03,1.74))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=92
    scene.render.filepath=str(out/(label+'face-studio.png'));bpy.ops.render.render(write_still=True)
# Enough of the cuff, palm and shaft is visible to inspect contact and grip.
grip=rig.matrix_world@(rig.pose.bones['finger3-1.R'].head+rig.pose.bones['finger3-3.R'].tail)*.5
camera.location=grip+Vector((-.38,-.82,.27));camera.rotation_euler=(grip-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=90
scene.render.filepath=str(out/(label+'grip-studio.png'));bpy.ops.render.render(write_still=True)
rig.animation_data.action=action_for('Cast');scene.frame_set(16)
camera.location=(2.1,-4.5,2.45);camera.rotation_euler=(Vector((0,0,1.04))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=66
scene.render.resolution_y=1100
scene.render.filepath=str(out/(label+'cast-studio.png'));bpy.ops.render.render(write_still=True)
if label:
    rig.animation_data.action=action_for('Walk');scene.frame_set(9)
    scene.render.filepath=str(out/(label+'walk-studio.png'));bpy.ops.render.render(write_still=True)
print('ART2_POSE_EVIDENCE_COMPLETE')
