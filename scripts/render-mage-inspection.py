"""Render read-only ART-02 pose/contact evidence from the editable raw source.

blender -b assets-source/ash-archivist/ash-archivist.blend --python scripts/render-mage-inspection.py -- /absolute/project/path
"""
import bpy,sys
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]).resolve()
out=root/'assets-source/ash-archivist'
scene=bpy.context.scene;camera=scene.camera;rig=bpy.data.objects['AshArchivistRig']
scene.cycles.samples=32;scene.cycles.use_denoising=False
scene.render.resolution_x=900;scene.render.resolution_y=900
for track in rig.animation_data.nla_tracks:track.mute=True
rig.animation_data.action=bpy.data.actions.get('Idle');scene.frame_set(1)
# Enough of the cuff, palm and shaft is visible to inspect contact and grip.
grip=rig.matrix_world@(rig.pose.bones['finger3-1.R'].head+rig.pose.bones['finger3-3.R'].tail)*.5
camera.location=grip+Vector((-.38,-.82,.27));camera.rotation_euler=(grip-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=90
scene.render.filepath=str(out/'grip-studio.png');bpy.ops.render.render(write_still=True)
rig.animation_data.action=bpy.data.actions.get('Cast');scene.frame_set(16)
camera.location=(2.1,-4.5,2.45);camera.rotation_euler=(Vector((0,0,1.04))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=66
scene.render.resolution_y=1100
scene.render.filepath=str(out/'cast-studio.png');bpy.ops.render.render(write_still=True)
print('ART2_POSE_EVIDENCE_COMPLETE')
