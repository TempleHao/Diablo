"""Build the original Ash Archivist from a CC0 anatomical base.

blender -b --python scripts/build-mage-realism.py -- /absolute/project/path
The source and generated maps remain editable; no commercial game assets are used.
"""
import bpy, json, math, sys, hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion

root = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
source = root / 'assets-source/human-base'
out = root / 'assets-source/ash-archivist'
out.mkdir(parents=True, exist_ok=True)
(root / 'dist/models').mkdir(parents=True, exist_ok=True)
np.random.seed(214)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.fps = 24
scene.world.color = (.025, .025, .025)
parts = []

def read_obj(path):
    verts, uvs, faces, groups = [], [], [], {}
    group = 'body'
    for line in path.read_text().splitlines():
        p = line.split()
        if not p: continue
        if p[0] == 'v': verts.append([float(v) for v in p[1:4]])
        elif p[0] == 'vt': uvs.append([float(v) for v in p[1:3]])
        elif p[0] == 'g': group = ' '.join(p[1:])
        elif p[0] == 'f':
            f = [(int(q.split('/')[0])-1, int(q.split('/')[1])-1 if '/' in q else 0) for q in p[1:]]
            faces.append((group, f)); groups.setdefault(group, set()).update(v for v, _ in f)
    return np.asarray(verts), np.asarray(uvs), faces, groups

raw, bodyuv, rawfaces, groups = read_obj(source / 'base.obj')
for filename, factor in [('caucasian-male-young.target', .58), ('caucasian-male-old.target', .42), ('universal-male-young-averagemuscle-averageweight.target', .8), ('head-age-incr.target', .25)]:
    for line in (source / filename).read_text().splitlines():
        p = line.split()
        if len(p) == 4 and not line.startswith('#'):
            raw[int(p[0])] += np.asarray([float(x) for x in p[1:]]) * factor
bodyids = np.asarray(sorted(groups['body']))
floor = raw[bodyids, 1].min()
scale = 1.91 / (raw[bodyids, 1].max() - floor)
def convert(v): return np.asarray([v[0]*scale, -v[2]*scale, (v[1]-floor)*scale])
coords = np.asarray([convert(v) for v in raw])
rigdata = json.loads((source / 'default.mhskel').read_text())
weights = json.loads((source / 'default_weights.mhw').read_text())['weights']
joint = {name: coords[ids].mean(axis=0) for name, ids in rigdata['joints'].items()}

def image(name, rgb):
    if rgb.ndim == 2: rgb = np.repeat(rgb[:, :, None], 3, axis=2)
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((*rgb.shape[:2], 1))], axis=2).astype(np.float32)
    im = bpy.data.images.new(name, width=rgb.shape[1], height=rgb.shape[0], alpha=False)
    im.pixels.foreach_set(rgba.ravel())
    im.filepath_raw = str(out / (name+'.png')); im.file_format = 'PNG'; im.save(); im.pack()
    return im

N = 512
yy, xx = np.mgrid[:N, :N]
grain = np.random.normal(0, 1, (N, N))
stain = np.zeros((N, N))
for size, amplitude in [(16,.55), (32,.30), (64,.15)]:
    noise = np.repeat(np.repeat(np.random.random((size,size)), N//size, 0), N//size, 1)
    for _ in range(8): noise = (noise + np.roll(noise,1,0)+np.roll(noise,-1,0)+np.roll(noise,1,1)+np.roll(noise,-1,1))/5
    stain += noise * amplitude

def textured(name, color, kind, metallic=0):
    if kind == 'cloth':
        weave = (np.sin(xx*math.pi*.75)*np.sin(yy*math.pi*.75))*.015
        height = weave + grain*.006
        shade = .76 + stain*.32 + grain*.015
        rough = .86 + grain*.035
    elif kind == 'leather':
        height = grain*.018 + np.sin(xx*.08+np.sin(yy*.013)*8)*.006
        shade = .65+stain*.55+grain*.022
        scar = (np.sin(xx*.059+np.sin(yy*.002)*16)>.994) & (stain>.5)
        shade += scar*.14
        rough = .64+stain*.18+grain*.025
    elif kind == 'skin':
        height = grain*.005
        shade = .94+stain*.10+grain*.007
        rough = .62+grain*.025
    elif kind == 'hair':
        height = np.sin(xx*.26+np.sin(yy*.012))* .03 + grain*.008
        shade = .60+stain*.30+np.sin(xx*.26)*.1
        rough = .69 + grain*.03
    else:
        height = grain*.02
        shade = .65+stain*.5+grain*.045
        rough = .55 + stain*.22
    color_map = np.asarray(color)[None,None,:]*shade[:,:,None]
    dx, dy = np.gradient(height)
    normal = np.stack([-dy*3, -dx*3, np.ones_like(height)], 2)
    normal /= np.linalg.norm(normal, axis=2)[:,:,None]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nodes = m.node_tree.nodes; links = m.node_tree.links
    p = nodes.get('Principled BSDF')
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = .75
    for mapname, data, socket, noncolor in [('albedo',color_map,'Base Color',False), ('roughness',rough,'Roughness',True), ('normal',normal*.5+.5,'Normal',True)]:
        tex = nodes.new('ShaderNodeTexImage'); tex.image = image(name+'-'+mapname, data)
        if noncolor: tex.image.colorspace_settings.name = 'Non-Color'
        if socket == 'Normal':
            n = nodes.new('ShaderNodeNormalMap'); n.inputs['Strength'].default_value = .35 if kind=='skin' else .55
            links.new(tex.outputs['Color'],n.inputs['Color']); links.new(n.outputs['Normal'],p.inputs['Normal'])
        else: links.new(tex.outputs['Color'],p.inputs[socket])
    return m

skin = textured('Skin pores', (.48,.285,.19), 'skin')
cloth = textured('Weathered charcoal linen', (.061,.055,.050), 'cloth')
red = textured('Oxblood wool', (.115,.032,.024), 'cloth')
leather = textured('Cracked umber leather', (.098,.060,.034), 'leather')
metal = textured('Patinated bronze', (.19,.145,.080), 'metal', .75)
hair = textured('Grey black hair', (.044,.039,.035), 'hair')
dark = bpy.data.materials.new('Eye wet dark'); dark.use_nodes=True
dark.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.095,.065,.036,1)
dark.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=.24

def make_mesh(name, vertices, faces, mat, uv=None, original=None, rigid=None):
    me = bpy.data.meshes.new(name); me.from_pydata(vertices, [], faces); me.update()
    obj = bpy.data.objects.new(name,me); bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in me.polygons: poly.use_smooth=True
    layer = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for j,li in enumerate(poly.loop_indices):
            if uv: layer.data[li].uv = uv[poly.index][j]
            else:
                v = me.vertices[me.loops[li].vertex_index].co
                layer.data[li].uv=(v.x*2.3+v.y*.17, v.z*2.3)
    parts.append((obj, original, rigid))
    return obj

bodyfaces=[f for group,f in rawfaces if group=='body']
# Keep the continuous anatomical surface. Covered torso/legs are removed below the
# clothing, so the visible face and hands retain the source's actual topology.
visible=[]
for f in bodyfaces:
    c=coords[[i for i,_ in f]].mean(axis=0)
    if c[2]>1.67 or abs(c[0])>.435 and c[2]<1.37: visible.append(f)
def source_mesh(name, face_list, mat, expansion=0):
    ids=sorted({i for f in face_list for i,_ in f}); lookup={v:i for i,v in enumerate(ids)}
    pts=coords[ids].copy()
    obj=make_mesh(name,pts,[[lookup[i] for i,_ in f] for f in face_list],mat,[[bodyuv[t] for _,t in f] for f in face_list],ids)
    if expansion:
        for v in obj.data.vertices:
            v.co+=v.normal*expansion
        obj.data.update()
    return obj
body=source_mesh('Continuous mature face neck and articulated hands',visible,skin)
# Subtle stubble uses the continuous facial mesh's vertex colours, rather than
# another cone or floating beard. Eyelids and lips remain anatomical geometry.
colors=body.data.color_attributes.new(name='SkinTint',type='BYTE_COLOR',domain='CORNER')
for loop in body.data.loops:
    v=body.data.vertices[loop.vertex_index].co
    stubble=max(0,min(1,(1.785-v.z)/.055)) if v.y<-.045 and v.z>1.67 else 0
    colors.data[loop.index].color=(1-stubble*.23,1-stubble*.27,1-stubble*.27,1)
snodes=skin.node_tree.nodes;slinks=skin.node_tree.links;sp=snodes.get('Principled BSDF')
oldlink=next(l for l in slinks if l.to_node==sp and l.to_socket==sp.inputs['Base Color'])
baseout=oldlink.from_socket;slinks.remove(oldlink)
attr=snodes.new('ShaderNodeVertexColor');attr.layer_name='SkinTint'
mix=snodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
slinks.new(baseout,mix.inputs[1]);slinks.new(attr.outputs['Color'],mix.inputs[2]);slinks.new(mix.outputs['Color'],sp.inputs['Base Color'])
pantsfaces=[]
for f in bodyfaces:
    c=coords[[i for i,_ in f]].mean(axis=0)
    if .20<c[2]<=1.01: pantsfaces.append(f)
pants=source_mesh('Wool trousers',pantsfaces,cloth,.016)

def strip(name, rows, material, bone=None):
    verts=[p for row in rows for p in row]; width=len(rows[0]); faces=[]
    for k in range(len(rows)-1):
        for j in range(width-1): faces.append((k*width+j,k*width+j+1,(k+1)*width+j+1,(k+1)*width+j))
    uv=[[(j/(width-1),k/(len(rows)-1)),((j+1)/(width-1),k/(len(rows)-1)),((j+1)/(width-1),(k+1)/(len(rows)-1)),(j/(width-1),(k+1)/(len(rows)-1))] for k in range(len(rows)-1) for j in range(width-1)]
    obj=make_mesh(name,verts,faces,material,uv,rigid=bone)
    sol=obj.modifiers.new('Cloth and leather thickness','SOLIDIFY');sol.thickness=.006
    bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=sol.name)
    return obj

# Tailored torso: a closed ring surface with actual cloth ease, rather than an
# offset of the naked chest. It avoids copied muscles/breasts in the garment.
torso_rows=[]
for k in range(17):
    t=k/16;z=.985+t*.714
    if z<1.54:rx=.217+.021*math.sin((z-.985)/.555*math.pi);ry=.143+.014*math.sin(t*math.pi)
    else:
        q=(z-1.54)/.159;rx=.235*(1-q)+.071*q;ry=.146*(1-q)+.066*q
    row=[]
    for j in range(41):
        a=j/40*math.tau
        fold=.0025*math.sin(a*13+z*7)+.002*math.sin(a*7-z*6)
        row.append(((rx+fold)*math.sin(a),-(ry+fold)*math.cos(a),z))
    torso_rows.append(row)
strip('Tailored continuous linen torso',torso_rows,cloth)
for side,sgn in [('L',1),('R',-1)]:
    defs=rigdata['bones'];shoulder=joint[defs['upperarm01.'+side]['head']]
    elbow=joint[defs['lowerarm01.'+side]['head']]
    wrist=joint[defs['wrist.'+side]['head']]
    rows=[]
    for k in range(17):
        t=k/16
        if t<.50: p=shoulder*(1-t*2)+elbow*(t*2)
        else:p=elbow*(2-t*2)+wrist*(t*2-1)
        direction=(wrist-shoulder);direction/=np.linalg.norm(direction)
        axis=np.cross(direction,np.array([0,1,0]));axis/=np.linalg.norm(axis)
        other=np.cross(direction,axis)
        radius=.088*(1-t)+.055*t+.008*math.sin(t*math.pi)
        row=[]
        for j in range(25):
            a=j/24*math.tau;r=radius+.0028*math.sin(a*7+t*4)+.002*math.sin(t*30)*math.sin(a)**2
            row.append(p+r*(axis*math.cos(a)+other*math.sin(a)))
        rows.append(row)
    strip('Continuous full length linen sleeve '+side,rows,cloth)
    # Rounded boot quarters and a broad toe box hide individual toes entirely.
    ankle=joint[defs['foot.'+side]['head']]
    rows=[]
    for z,rx,ry,cy in [(.018,.069,.16,-.050),(.035,.073,.17,-.050),(.09,.074,.15,-.047),(.155,.065,.092,-.012),(.22,.062,.069,.008),(.29,.066,.074,.008),(.325,.066,.074,.008)]:
        rows.append([(ankle[0]+rx*math.sin(j/32*math.tau),cy-ry*math.cos(j/32*math.tau),z) for j in range(33)])
    strip('Continuous leather boot toe box '+side,rows,leather,'foot.'+side)
    strip('Thick stitched boot sole '+side,rows[:2],cloth,'foot.'+side)

# Open front and back coat tails: distinct cloth panels, folds and asymmetric hems.
for side in [-1,1]:
    rows=[]
    for k in range(17):
        t=k/16;z=1.11-t*.74
        row=[]
        for j in range(25):
            a=(.22+j/24*(math.pi-.42))*side
            rx=.225+t*.073; ry=.155+t*.08
            fold=math.sin(a*11+t*.55)*(.003+t*.014)
            row.append(((rx+fold)*math.sin(a),-(ry+fold)*math.cos(a),z+.028*math.sin(a*3)*t*t))
        rows.append(row)
    strip('Split coat tail '+str(side),rows,cloth)
    # Long wine lapel hangs independently and has sewn margins.
    rows=[]
    for k in range(30):
        t=k/29; z=1.62-t*1.20
        x=side*(.12+.028*math.sin(t*math.pi)+.055*t)
        y=-(.137+.045*math.sin(t*math.pi)+.08*max(0,t-.4))
        rows.append([(x+side*q*.050,y-.004*math.sin(t*20+q*2),z) for q in [-1,-.5,0,.5,1]])
    strip('Frayed oxblood facing '+str(side),rows,red)

# Soft mantle draped across back, leaving the neck/head silhouette readable.
rows=[]
for k in range(13):
    t=k/12; row=[]
    for j in range(31):
        a=-math.pi*.53+j/30*math.pi*1.06
        width=.31+math.sin(t*math.pi)*.02+t*.04
        row.append((math.sin(a)*width, .055+math.cos(a)*(.105+t*.075),1.65-t*.38-.035*math.cos(a*5)*t))
    rows.append(row)
strip('Shoulder mantle with gravity folds',rows,red,'spine01')

def tube(name, points, radius, mat, bone=None, segments=8):
    verts=[]
    for k,p in enumerate(points):
        p=Vector(p); direction=Vector(points[min(k+1,len(points)-1)])-Vector(points[max(k-1,0)])
        direction.normalize(); axis=direction.cross(Vector((0,0,1)))
        if axis.length<.01:axis=direction.cross(Vector((0,1,0)))
        axis.normalize(); other=direction.cross(axis).normalized()
        for j in range(segments):verts.append(p+radius*(axis*math.cos(j/segments*math.tau)+other*math.sin(j/segments*math.tau)))
    faces=[]
    for k in range(len(points)-1):
        for j in range(segments):faces.append((k*segments+j,k*segments+(j+1)%segments,(k+1)*segments+(j+1)%segments,(k+1)*segments+j))
    return make_mesh(name,verts,faces,mat,rigid=bone)

def band(name, center, radii, height, mat, bone, count=64):
    rows=[]
    for k in range(3):
        z=center[2]+(k/2-.5)*height
        rows.append([(center[0]+radii[0]*math.sin(j/(count-1)*math.tau),center[1]-radii[1]*math.cos(j/(count-1)*math.tau),z) for j in range(count)])
    return strip(name,rows,mat,bone)
band('Broad leather waist belt',(0,-.017,1.095),(.227,.164),.085,leather,'root')
band('Raised standing collar',(0,-.013,1.681),(.080,.072),.082,leather,'neck01',40)
for side in [-1,1]:
    # Anatomically curved leather shoulder yoke rather than spherical pauldrons.
    rows=[]
    for k in range(9):
        t=k/8;row=[]
        for j in range(17):
            u=j/16
            row.append((side*(.145+.205*t),-.082+u*.185,1.62-.060*t+.038*math.sin(u*math.pi)))
        rows.append(row)
    strip('Segmented leather shoulder yoke '+str(side),rows,leather,'shoulder01.'+('L' if side>0 else 'R'))
    for z in [.22,.29]:
        x=side*.185
        tube('Boot welt and stitching',[(x-.065,-.095,z),(x+.065,-.095,z)],.0028,metal,'foot.'+('L' if side>0 else 'R'))

# Diagonal, flat chest harness and a readable rectangular forged clasp.
rows=[]
for k in range(20):
    t=k/19; x=-.18+t*.37;z=1.58-t*.43;y=-.168-.015*math.sin(t*math.pi)
    rows.append([(x-.025,y,z-.020),(x+.025,y,z+.020)])
strip('Cross-body leather harness',rows,leather,'spine02')
def cube(name,loc,scale,mat,bone):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);obj=bpy.context.object;obj.name=name;obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat);bevel=obj.modifiers.new('Worn edge radius','BEVEL');bevel.width=.004;bevel.segments=2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    parts.append((obj,None,bone));return obj
for x,z,sx,sz in [(-.033,1.095,.012,.063),(.033,1.095,.012,.063),(0,1.126,.075,.010),(0,1.064,.075,.010)]:
    cube('Hollow forged belt clasp',(x,-.188,z),(sx,.012,sz),metal,'root')
cube('Leather grimoire',( .26,.01,.99),(.080,.11,.19),leather,'root')
cube('Exposed parchment edge',( .262,-.047,.991),(.067,.012,.166),cloth,'root')
cube('Grimoire spine',(.223,-.009,.99),(.014,.122,.198),metal,'root')

# Import the proper anatomical eyeballs at their original UV coordinates.
eye_path=source/'high-poly.obj'
if eye_path.exists():
    ev,eu,ef,eg=read_obj(eye_path)
    eye_mat=bpy.data.materials.new('Natural brown eyes');eye_mat.use_nodes=True
    ep=eye_mat.node_tree.nodes.get('Principled BSDF');ep.inputs['Roughness'].default_value=.25
    tex=eye_mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(source/'brown_eye.png'));tex.image.pack()
    eye_mat.node_tree.links.new(tex.outputs['Color'],ep.inputs['Base Color'])
    # Reconstruct the official eye proxy from the morphed basemesh, using its
    # barycentric attachment and axis scale, rather than its exported OBJ frame.
    mapping=(source/'high-poly.mhclo').read_text().splitlines()
    axis_scale=np.ones(3)
    for line in mapping:
        p=line.split()
        if p and p[0] in ['x_scale','y_scale','z_scale']:
            axis='xyz'.index(p[0][0]);axis_scale[axis]=abs(raw[int(p[1]),axis]-raw[int(p[2]),axis])/float(p[3])
    proxy=[];in_verts=False
    for line in mapping:
        p=line.split()
        if p and p[0]=='verts':in_verts=True;continue
        if in_verts and len(p)==9 and p[0][0].isdigit():
            ids=list(map(int,p[:3]));w=np.asarray(list(map(float,p[3:6])));offset=np.asarray(list(map(float,p[6:9])))
            proxy.append(convert((raw[ids]*w[:,None]).sum(0)+offset*axis_scale))
    if len(proxy)!=len(ev):raise RuntimeError('Eye proxy vertex count mismatch')
    verts=np.asarray(proxy)
    make_mesh('Proper recessed brown eyeballs',verts,[[i for i,_ in f] for _,f in ef],eye_mat,[[eu[t] for _,t in f] for _,f in ef],rigid='head')

# Scalp is a contiguous shell following the actual cranium. Hairline recedes
# at the temples; combed strips provide strand flow without sausage-like locks.
headfaces=[]
for f in bodyfaces:
    c=coords[[i for i,_ in f]].mean(0)
    if c[2]>1.855 or c[2]>1.765 and c[1]>-.023: headfaces.append(f)
scalp=source_mesh('Close cropped scalp and recession',headfaces,hair,.003)

# Staff: restrained aged wood, asymmetric bronze cage, small amber focus.
staffbone='wrist.R'
if staffbone not in rigdata['bones']:staffbone='lowerarm02.R'
staffx=-.49
tube('Carved ash staff',[(staffx+.014*math.sin(z*3),-.115,z) for z in np.linspace(.055,1.95,33)],.019,leather,staffbone,10)
for z in [.13,.93,1.08,1.78]:band('Staff leather and bronze binding',(staffx,-.115,z),(.023,.023),.028,metal,staffbone,16)
for side in [-1,1]:
    tube('Bent bronze focus cage',[(staffx+side*.028,-.115,1.79),(staffx+side*.068,-.115,1.92),(staffx+side*.020,-.115,2.03)],.010,metal,staffbone,7)
amber=bpy.data.materials.new('Muted amber spell focus');amber.use_nodes=True
ap=amber.node_tree.nodes.get('Principled BSDF');ap.inputs['Base Color'].default_value=(.27,.105,.018,1);ap.inputs['Metallic'].default_value=.25;ap.inputs['Roughness'].default_value=.30
ap.inputs['Emission Color'].default_value=(.7,.20,.018,1);ap.inputs['Emission Strength'].default_value=.6
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.041,location=(staffx,-.115,1.94));obj=bpy.context.object;obj.name='Small amber focus';obj.scale=(.6,.6,1.55);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);obj.data.materials.append(amber);parts.append((obj,None,staffbone))

# Build the complete anatomical rig and preserve the supplied smooth weights.
bpy.ops.object.armature_add();rig=bpy.context.object;rig.name='AshArchivistRig'
bpy.ops.object.mode_set(mode='EDIT');rig.data.edit_bones.remove(rig.data.edit_bones[0])
for name,b in rigdata['bones'].items():
    bone=rig.data.edit_bones.new(name);bone.head=joint[b['head']];bone.tail=joint[b['tail']]
    if (bone.tail-bone.head).length<.00001:bone.tail.z+=.005
for name,b in rigdata['bones'].items():
    if b['parent']:rig.data.edit_bones[name].parent=rig.data.edit_bones[b['parent']]
bpy.ops.object.mode_set(mode='OBJECT')
vertex_weights={i:[] for i in range(len(coords))}
for name,entries in weights.items():
    if name in rig.data.bones:
        for idx,w in entries:vertex_weights[idx].append((name,w))
def segment_weights(v):
    v=Vector(v);candidates=[]
    names=['root','spine05','spine04','spine03','spine02','spine01','neck01','head']
    for s in ['L','R']:names += ['upperarm01.'+s,'upperarm02.'+s,'lowerarm01.'+s,'lowerarm02.'+s,'upperleg01.'+s,'upperleg02.'+s,'lowerleg01.'+s,'lowerleg02.'+s,'foot.'+s]
    for n in names:
        if n not in rig.data.bones:continue
        b=rig.data.bones[n];a=b.head_local;d=b.tail_local-a;t=max(0,min(1,(v-a).dot(d)/d.length_squared));dist=(v-a-d*t).length
        candidates.append((dist,n))
    candidates=sorted(candidates)[:3];total=sum(math.exp(-d*26) for d,n in candidates)
    return [(n,math.exp(-d*26)/total) for d,n in candidates]
for obj,original,rigid in parts:
    obj.parent=rig
    groups_by_name={}
    for v in obj.data.vertices:
        # Solidify duplicates correspond to the same anatomical source index.
        ws=[(rigid,1)] if rigid else vertex_weights[original[v.index%len(original)]] if original else segment_weights(v.co)
        if not ws:ws=[('root',1)]
        ws=sorted(ws,key=lambda p:-p[1])[:4];total=sum(w for _,w in ws)
        for name,w in ws:
            if name not in groups_by_name:groups_by_name[name]=obj.vertex_groups.new(name=name)
            groups_by_name[name].add([v.index],w/total,'REPLACE')
    mod=obj.modifiers.new('Smooth anatomical skinning','ARMATURE');mod.object=rig

# Relax the A-pose into a natural resting stance and bake it as the rest pose.
for side,sign in [('L',1),('R',-1)]:
    pb=rig.pose.bones.get('upperarm01.'+side)
    if pb:
        m=pb.matrix.copy();pos=m.translation.copy();m=Matrix.Rotation(.40*sign,4,'Y')@m;m.translation=pos;pb.matrix=m
for finger in range(2,6):
    for knuckle,angle in [(1,-.38),(2,-.76),(3,-.65)]:
        pb=rig.pose.bones.get('finger%d-%d.R'%(finger,knuckle))
        if pb:pb.rotation_mode='XYZ';pb.rotation_euler.x=angle
bpy.context.view_layer.update()
staff_matrix=rig.pose.bones[staffbone].matrix @ rig.data.bones[staffbone].matrix_local.inverted()
staff_inverse=staff_matrix.inverted()
grip=rig.pose.bones['wrist.R'].head+Vector((-.014,-.031,-.025))
staff_shift=Vector((grip.x-staffx,grip.y+.115,0))
deps=bpy.context.evaluated_depsgraph_get()
for obj,_,_ in parts:
    evaluated=obj.evaluated_get(deps);new=bpy.data.meshes.new_from_object(evaluated,depsgraph=deps)
    if obj.name.startswith(('Carved ash staff','Bent bronze focus cage','Staff leather and bronze binding','Small amber focus')):
        inverse_world=obj.matrix_world.inverted()
        for v in new.vertices:v.co=inverse_world@(staff_inverse@(obj.matrix_world@v.co)+staff_shift)
    old=obj.data;obj.data=new
    for mod in list(obj.modifiers):obj.modifiers.remove(mod)
    mod=obj.modifiers.new('Smooth anatomical skinning','ARMATURE');mod.object=rig
bpy.context.view_layer.objects.active=rig;bpy.ops.object.mode_set(mode='POSE');bpy.ops.pose.armature_apply(selected=False);bpy.ops.object.mode_set(mode='OBJECT')

rig.animation_data_create()
for clip,length in [('Idle',72),('Walk',32),('Cast',30)]:
    action=bpy.data.actions.new(clip);rig.animation_data.action=action;action.use_fake_user=True
    for frame in range(1,length+2):
        phase=(frame-1)/length*math.tau
        for bone in rig.pose.bones:bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
        def rot(name,axis,value):
            if name in rig.pose.bones:rig.pose.bones[name].rotation_euler[axis]=value
        if clip=='Idle':
            rot('spine02',0,math.sin(phase)*.012);rot('head',1,math.sin(phase*.5)*.018)
        elif clip=='Walk':
            for side,sign in [('L',1),('R',-1)]:
                rot('upperleg01.'+side,0,math.sin(phase)*.28*sign)
                rot('lowerleg01.'+side,0,max(0,-math.sin(phase)*sign)*.35)
                rot('upperarm01.'+side,0,-math.sin(phase)*.10*sign)
            rig.pose.bones['root'].location.z=abs(math.sin(phase))*.012
            rot('spine02',1,math.sin(phase)*.018)
        else:
            wave=math.sin((frame-1)/length*math.pi)
            rot('upperarm01.L',0,-wave*.78);rot('lowerarm01.L',0,-wave*.42)
            rot('spine02',0,-wave*.035);rot('head',0,wave*.025)
        for bone in rig.pose.bones:
            if any(abs(x)>.00001 for x in bone.rotation_euler) or bone.name in ['root','head','spine02','upperleg01.L','upperleg01.R','lowerleg01.L','lowerleg01.R','upperarm01.L','upperarm01.R','lowerarm01.L']:
                bone.keyframe_insert(data_path='rotation_euler',frame=frame);bone.keyframe_insert(data_path='location',frame=frame)
    rig.animation_data.action=None
    track=rig.animation_data.nla_tracks.new();track.name=clip;track.strips.new(clip,1,action)
scene.frame_set(1)
focus=bpy.data.objects.new('face_focus',None);bpy.context.collection.objects.link(focus)
focus.empty_display_type='SPHERE';focus.empty_display_size=.018
focus.parent=rig;focus.parent_type='BONE';focus.parent_bone='head'
bpy.context.view_layer.update();focus.matrix_world=Matrix.Translation(Vector((0,-.133,1.794)))
focus['purpose']='Original anatomical face framing anchor; glTF Y is approximately 1.794 m'

# Neutral studio evidence renders, excluded from the glTF asset.
def light(name,loc,energy,color,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape='DISK';data.size=size
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1.25))-o.location).to_track_quat('-Z','Y').to_euler()
light('Warm neutral key',(-3,-4,5),500,(1,.84,.67),4)
light('Cool restrained rim',(2,2,3),400,(.61,.68,.76),3)
light('Soft face fill',(1,-4,2.6),160,(.9,.89,.85),3)
bpy.ops.object.camera_add(location=(2.1,-4.5,2.45));camera=bpy.context.object;camera.name='Studio evidence camera';camera.data.lens=66;camera.rotation_euler=(Vector((0,0,1.04))-camera.location).to_track_quat('-Z','Y').to_euler();scene.camera=camera
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=False;scene.render.resolution_x=900;scene.render.resolution_y=1100;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(out/'character-studio.png')
bpy.ops.render.render(write_still=True)
camera.location=(.75,-2.30,1.87);camera.rotation_euler=(Vector((0,-.03,1.74))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.lens=92
scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.filepath=str(out/'face-studio.png');bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action='DESELECT')
for obj,_,_ in parts:obj.select_set(True)
rig.select_set(True);focus.select_set(True);bpy.context.view_layer.objects.active=rig
asset=root/'dist/models/ember-mage-realism.glb'
bpy.ops.export_scene.gltf(filepath=str(asset),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,export_skins=True,export_apply=False,export_image_format='AUTO')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'ash-archivist.blend'))
tris=sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o,_,_ in parts)
stats={'name':'Ash Archivist / 灰烬典籍守望者','triangles':tris,'meshes':len(parts),'bones':len(rig.data.bones),'glbBytes':asset.stat().st_size,'sha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'clips':['Idle','Walk','Cast'],'heightMeters':1.91,'baseLicense':'CC0 1.0','textures':'Original seeded procedural PBR plus CC0 MakeHuman brown eye image','limitations':['No claim of AAA/D2R/D4 quality equivalence','Animation authored as a first pass, no motion capture','No true mobile GPU performance evidence']}
(out/'statistics.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n')
print('ASH_ARCHIVIST_COMPLETE',json.dumps(stats,ensure_ascii=False))
