"""Build the original Ember Mage with a deformable armature and three glTF clips.
Run: blender -b --python scripts/build-mage.py -- /absolute/project/path
"""
import bpy, math, sys, random
from mathutils import Vector
from pathlib import Path
random.seed(41)
root=Path(sys.argv[sys.argv.index('--')+1])
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color,metal=0,rough=.6,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 if emit:p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=emit
 return m
navy=material('Midnight woven robe',(.045,.105,.19));blue=material('Blue embroidered panels',(.075,.23,.32));gold=material('Antique gold',(.57,.36,.12),.75,.32);leather=material('Worn leather',(.085,.055,.035));skin=material('Warm skin',(.62,.40,.27),0,.65);hair=material('Silver hair',(.55,.57,.53));eye=material('Deep eyes',(.025,.075,.10));white=material('Eye white',(.83,.77,.63));crystal=material('Aether crystal',(.15,.78,.90),.2,.23,2.2);dark=material('Brows and facial creases',(.12,.12,.10));gem=material('Turquoise ornaments',(.12,.49,.53),.4,.3)
parts=[]
def finish(o,name,mat,bone='Root'):
 o.name=name;o.data.materials.append(mat);parts.append((o,bone))
 for p in o.data.polygons:p.use_smooth=True
 return o
def ellipsoid(name,loc,scale,mat,bone='Root',segments=16,rings=10):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc);o=bpy.context.object;o.scale=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);return finish(o,name,mat,bone)
def cone(name,loc,r1,r2,depth,mat,bone='Root',vertices=24):
 bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r1,radius2=r2,depth=depth,location=loc);return finish(bpy.context.object,name,mat,bone)
def between(name,a,b,r,mat,bone='Root',r2=None):
 a,b=Vector(a),Vector(b);o=cone(name,(a+b)*.5,r,r if r2 is None else r2,(b-a).length,mat,bone,16);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def torus(name,loc,major,minor,mat,bone='Root',rotate=None):
 bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,location=loc,major_radius=major,minor_radius=minor);o=bpy.context.object
 if rotate:o.rotation_euler=rotate
 return finish(o,name,mat,bone)
def panel(name,verts,faces,mat,bone='Root'):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);finish(o,name,mat,bone);solid=o.modifiers.new('Fabric thickness','SOLIDIFY');solid.thickness=.015
 bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=solid.name);return o
# Silhouette: split floor-length coat, visible legs, broad shoulders, bare head.
ellipsoid('Robe torso',(0,0,1.28),(.31,.19,.40),navy,'Spine')
cone('Lower split robe',(0,.02,.68),.43,.24,.80,navy,'Root',32)
# Cutouts are suggested by distinct front fabric panels and boots rather than a cone silhouette.
for sign in [-1,1]:
 x=sign*.15
 between('Boot leg', (x,0,.20),(x,0,.60),.105,leather,'Leg.L' if sign<0 else 'Leg.R')
 ellipsoid('Toe boot',(x,-.10,.115),(.12,.21,.11),leather,'Leg.L' if sign<0 else 'Leg.R')
 torus('Boot rim',(x,0,.45),.109,.018,gold,'Leg.L' if sign<0 else 'Leg.R')
 for band in [.38,.46]:between('Boot clasp',(x-.06,-.108,band),(x+.06,-.108,band),.012,gold,'Leg.L' if sign<0 else 'Leg.R')
 # Long embroidered lapel panels with tapered boundaries.
 panel('Gold edged blue front panel',[(sign*.06,-.198,1.60),(sign*.22,-.16,1.59),(sign*.32,-.32,.31),(sign*.08,-.42,.28)],[(0,1,2,3)],blue,'Root')
 between('Front panel gold trim',(sign*.08,-.44,.29),(sign*.065,-.205,1.55),.012,gold)
 for z in [.55,.82,1.10]:ellipsoid('Runic panel inlay',(sign*.15,-(.4 if z<.8 else .23),z),(.035,.012,.05),gold)
# Sash, buckles, belt pouch.
cone('Leather waist sash',(0,-.012,1.03),.26,.25,.11,leather,'Root');torus('Upper belt trim',(0,-.012,1.085),.255,.014,gold);torus('Lower belt trim',(0,-.012,.98),.26,.014,gold)
ellipsoid('Gold buckle',(0,-.27,1.035),(.072,.025,.065),gold);ellipsoid('Buckle stone',(0,-.295,1.035),(.032,.015,.035),gem)
ellipsoid('Scroll satchel',(-.31,.04,.92),(.115,.09,.17),leather);between('Potion vial',(.29,-.12,.92),(.29,-.12,1.04),.042,gem);cone('Vial cork',(.29,-.12,1.06),.025,.025,.03,gold)
# Shoulders and arm segments, each fully weighted to one armature bone.
for sign,suffix in [(-1,'L'),(1,'R')]:
 shoulder=(sign*.34,0,1.52);elbow=(sign*.48,-.015,1.17);hand=(sign*.56,-.11,.96)
 ellipsoid('Shoulder armor',shoulder,(.22,.21,.12),gold,'Arm.'+suffix)
 ellipsoid('Shoulder inset',(sign*.34,-.018,1.56),(.18,.18,.09),blue,'Arm.'+suffix)
 between('Upper sleeve',shoulder,elbow,.15,navy,'Arm.'+suffix,r2=.125)
 between('Bell sleeve',elbow,hand,.15,blue,'Forearm.'+suffix,r2=.10)
 between('Sleeve gold cuff',(sign*.55,-.10,.99),(sign*.565,-.113,.95),.155,gold,'Forearm.'+suffix)
 ellipsoid('Hand',hand,(.077,.06,.095),skin,'Forearm.'+suffix)
 for i in range(3):ellipsoid('Finger',(sign*(.53+i*.022),-.16,.945),(.015,.035,.048),skin,'Forearm.'+suffix,12,8)
# Cloth mantle, back folds and chain.
for i in range(9):
 x=(i-4)*.078
 panel('Mantle folded fabric',[(x-.045,.18,1.62),(x+.045,.18,1.62),(x*1.3+.045,.34,.51),(x*1.3-.045,.34,.51)],[(0,1,2,3)],blue if i%2==0 else navy,'Spine')
for sign in [-1,1]:between('Mantle gold seam',(sign*.33,.19,1.62),(sign*.40,.34,.50),.013,gold,'Spine')
between('Mantle front clasp',(-.22,-.20,1.55),(.22,-.20,1.55),.016,gold,'Spine');ellipsoid('Clasp gem',(0,-.217,1.55),(.04,.02,.045),gem,'Spine')
# Human face and ears, flowing silver hair, pointed beard.
between('Neck',(0,0,1.55),(0,0,1.79),.10,skin,'Head')
ellipsoid('Head',(0,-.013,1.87),(.155,.138,.205),skin,'Head',24,16)
ellipsoid('Nose',(0,-.157,1.87),(.030,.050,.044),skin,'Head')
for sign in [-1,1]:
 ellipsoid('Ear',(sign*.156,-.01,1.88),(.035,.029,.068),skin,'Head')
 ellipsoid('Eye white',(sign*.065,-.141,1.92),(.037,.014,.017),white,'Head')
 ellipsoid('Iris',(sign*.065,-.154,1.921),(.012,.007,.013),eye,'Head')
 brow=between('Silver brow',(sign*.035,-.148,1.955),(sign*.103,-.13,1.959),.012,hair,'Head')
 between('Mustache',(sign*.012,-.159,1.805),(sign*.081,-.12,1.79),.012,hair,'Head')
 # Individual thick hair locks.
 for j in range(4):
  y=.0+j*.042
  ellipsoid('Side hair lock',(sign*(.135+j*.008),y,1.86),(.035,.046,.19+j*.006),hair,'Head')
ellipsoid('Hair crown',(0,.025,2.02),(.161,.14,.072),hair,'Head')
for j in range(5):ellipsoid('Back hair lock',((j-2)*.065,.119,1.865),(.045,.04,.20),hair,'Head')
cone('Beard tip',(0,-.097,1.73),.015,.092,.17,hair,'Head',16)
between('Mouth',(-.04,-.15,1.802),(.04,-.15,1.802),.006,dark,'Head')
# Staff and crystal, held in right hand and weighted to forearm.
between('Staff shaft',(.62,-.09,.18),(.62,-.09,1.99),.029,leather,'Forearm.R')
for z in [.28,.8,1.2,1.87]:torus('Staff gold binding',(.62,-.09,z),.034,.013,gold,'Forearm.R')
for sign in [-1,1]:between('Crystal prong',(.62+sign*.07,-.09,1.80),(.62+sign*.14,-.09,2.02),.025,gold,'Forearm.R')
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.14,location=(.62,-.09,2.08));o=bpy.context.object;o.scale=(.6,.6,1.45);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);finish(o,'Aether crystal',crystal,'Forearm.R')
# Armature with rigid mesh weights: suitable for editing in Blender and animation in glTF.
bpy.ops.object.armature_add(location=(0,0,0));rig=bpy.context.object;rig.name='EmberMageRig';bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
bone_defs={'Root':((0,0,.82),(0,0,1.06),None),'Spine':((0,0,1.04),(0,0,1.59),'Root'),'Head':((0,0,1.60),(0,0,2.12),'Spine'),'Leg.L':((-.15,0,.60),(-.15,0,.12),'Root'),'Leg.R':((.15,0,.60),(.15,0,.12),'Root'),'Arm.L':((-.34,0,1.52),(-.48,-.015,1.17),'Spine'),'Arm.R':((.34,0,1.52),(.48,-.015,1.17),'Spine'),'Forearm.L':((-.48,-.015,1.17),(-.56,-.11,.96),'Arm.L'),'Forearm.R':((.48,-.015,1.17),(.56,-.11,.96),'Arm.R')}
for name,(a,b,parent) in bone_defs.items():
 bone=rig.data.edit_bones.new(name);bone.head=a;bone.tail=b
 if parent:bone.parent=rig.data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
for obj,bone in parts:
 group=obj.vertex_groups.new(name=bone);group.add(list(range(len(obj.data.vertices))),1,'REPLACE');mod=obj.modifiers.new('Mage skin','ARMATURE');mod.object=rig;obj.parent=rig
rig.animation_data_create();bpy.context.scene.render.fps=24
for clip,length in [('Idle',48),('Walk',24),('Cast',16)]:
 action=bpy.data.actions.new(clip);rig.animation_data.action=action;action.use_fake_user=True
 for frame in range(1,length+2):
  phase=(frame-1)/length*math.tau
  for bone in rig.pose.bones:bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
  if clip=='Idle':
   rig.pose.bones['Spine'].rotation_euler.x=math.sin(phase)*.025;rig.pose.bones['Head'].rotation_euler.z=math.sin(phase)*.025
  if clip=='Walk':
   for suffix,sgn in [('L',1),('R',-1)]:
    rig.pose.bones['Leg.'+suffix].rotation_euler.x=math.sin(phase)*.36*sgn;rig.pose.bones['Arm.'+suffix].rotation_euler.x=-math.sin(phase)*.18*sgn
   rig.pose.bones['Root'].location.z=abs(math.sin(phase))*.03;rig.pose.bones['Spine'].rotation_euler.z=math.sin(phase)*.035
  if clip=='Cast':
   wave=math.sin((frame-1)/length*math.pi)
   rig.pose.bones['Arm.L'].rotation_euler.x=-wave*1.0;rig.pose.bones['Forearm.L'].rotation_euler.x=-wave*.8;rig.pose.bones['Arm.R'].rotation_euler.x=-wave*.35;rig.pose.bones['Spine'].rotation_euler.x=-wave*.09
  for bone in rig.pose.bones:bone.keyframe_insert(data_path='rotation_euler',frame=frame);bone.keyframe_insert(data_path='location',frame=frame)
rig.animation_data.action=None
# Stash actions in distinct named NLA tracks to make clips reliably exportable.
for action in [a for a in bpy.data.actions if a.name in ['Idle','Walk','Cast']]:
 track=rig.animation_data.nla_tracks.new();track.name=action.name;track.strips.new(action.name,1,action)
bpy.context.scene.frame_set(1)
# Keep a native edit source with a readable studio scene; export only the model.
bpy.ops.object.select_all(action='DESELECT')
for o,_ in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0][0]
bpy.ops.object.join();assembled=bpy.context.object;assembled.name='EmberMageBody'
rig.select_set(True);bpy.context.view_layer.objects.active=rig
(root/'dist/models').mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(root/'dist/models/ember-mage.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,export_apply=False)
(root/'assets-source').mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets-source/ember-mage.blend'))
print('EMBER_MODEL_COMPLETE',len(parts),'meshes',len(rig.data.bones),'bones')
