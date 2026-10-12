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
# The CC0 MakeHuman system skin follows the anatomical source UV layout.
# Keep the authored pore normal and roughness; do not project noise over the face.
skin_image = bpy.data.images.load(str(source / 'middleage_caucasian_male_diffuse.png'))
skin_image.pack()
next(n for n in skin.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image.name.endswith('-albedo')).image = skin_image
cloth = textured('Weathered charcoal linen', (.061,.055,.050), 'cloth')
red = textured('Oxblood wool', (.115,.032,.024), 'cloth')
leather = textured('Cracked umber leather', (.098,.060,.034), 'leather')
metal = textured('Patinated bronze', (.19,.145,.080), 'metal', .75)
hair = textured('Grey black hair', (.019,.017,.015), 'hair')
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
    if c[2]>1.60 or abs(c[0])>.435 and c[2]<1.37: visible.append(f)
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
    # The beard fades at the cheek rather than making a horizontal painted band.
    cheekline=1.757+.018*(abs(v.x)/.063)**.6
    stubble=max(0,min(1,(cheekline-v.z)/.021)) if v.y<-.045 and 1.69<v.z<1.795 else 0
    lip_clear=math.exp(-((v.z-1.734)/.007)**2)*math.exp(-(v.x/.023)**4)
    stubble*=1-lip_clear*.90
    stipple=.80+.20*math.sin(v.x*1867+math.sin(v.z*1121)*2.5)**2
    colors.data[loop.index].color=(1-stubble*.19*stipple,1-stubble*.23*stipple,1-stubble*.22*stipple,1)
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
def torso_front(x,z):
    t=(z-.985)/.714
    if z<1.54:rx=.217+.021*math.sin((z-.985)/.555*math.pi);ry=.143+.014*math.sin(t*math.pi)
    else:
        q=(z-1.54)/.159;rx=.235*(1-q)+.071*q;ry=.146*(1-q)+.066*q
    return -ry*math.sqrt(max(.04,1-(x/rx)**2))-.010
torso_rows=[]
for k in range(17):
    t=k/16;z=.985+t*.714
    if z<1.54:rx=.217+.021*math.sin((z-.985)/.555*math.pi);ry=.143+.014*math.sin(t*math.pi)
    else:
        q=(z-1.54)/.159;rx=.235*(1-q)+.071*q;ry=.146*(1-q)+.066*q
    row=[]
    for j in range(41):
        a=j/40*math.tau
        # Broad bias folds descend from the shoulder/armpit and gather at the belt.
        # Their amplitude is tied to garment tension, instead of uniform ripples.
        waist=math.exp(-((z-1.14)/.100)**2)
        chest=math.exp(-((z-1.44)/.17)**2)
        side_tension=abs(math.sin(a))**4
        front=max(0,math.cos(a))**2
        fold=.0020*math.sin(a*11+z*7)
        fold+=waist*(.0070*math.sin(a*9+z*16)+.0045*math.sin(a*15-z*7))
        fold+=chest*side_tension*.008*math.sin(a*6+z*27)
        fold+=front*.0035*math.sin(a*7-z*20)*chest
        neck_open=.027*max(0,math.cos(a))**3*math.exp(-((t-1)/.15)**2)
        row.append(((rx+fold)*math.sin(a),-(ry+fold)*math.cos(a),z+.002*waist*math.sin(a*9)-neck_open))
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
            a=j/24*math.tau
            elbow_fold=math.exp(-((t-.51)/.105)**2)*(.008*math.sin(t*58+a*1.4)+.003*math.sin(t*33-a*2))
            cuff_gather=math.exp(-((t-.92)/.085)**2)*.004*math.sin(a*8+t*29)
            r=radius+.0025*math.sin(a*7+t*4)+elbow_fold*(.40+.60*math.sin(a)**2)+cuff_gather
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
            fold=math.sin(a*9+t*.55)*(.005+t*.019)
            fold+=math.exp(-((t-.12)/.17)**2)*.007*math.sin(a*12+t*21)
            fold+=.004*math.sin(a*5-t*3.8)*math.sin(t*math.pi)
            row.append(((rx+fold)*math.sin(a),-(ry+fold)*math.cos(a),z+.028*math.sin(a*3)*t*t))
        rows.append(row)
    strip('Split coat tail '+str(side),rows,cloth)
    # Long wine lapel hangs independently and has sewn margins.
    rows=[]
    for k in range(30):
        t=k/29; z=1.62-t*1.20
        if z>=1.11:
            u=(1.62-z)/.51;x=side*(.085+.026*math.sin(u*math.pi))
            rows.append([(x+side*q*.020,torso_front(x+side*q*.020,z)-.006,z) for q in [-1,-.5,0,.5,1]])
        else:
            u=(1.11-z)/.74;rx=.225+u*.073;ry=.155+u*.08
            row=[]
            for q in [0,.25,.5,.75,1]:
                a=(.22+q*.15)*side;fold=math.sin(a*11+u*.55)*(.003+u*.014)
                row.append(((rx+fold)*math.sin(a),-(ry+fold)*math.cos(a)-.004,z+.028*math.sin(a*3)*u*u))
            rows.append(row)
    strip('Frayed oxblood facing '+str(side),rows,red)

# Soft mantle draped across back, leaving the neck/head silhouette readable.
rows=[]
for k in range(13):
    t=k/12; row=[]
    for j in range(31):
        a=-math.pi*.53+j/30*math.pi*1.06
        width=.31+math.sin(t*math.pi)*.02+t*.04
        sag=.021*math.sin(a*4+t*5)*math.sin(t*math.pi)
        row.append((math.sin(a)*(width+sag), .055+math.cos(a)*(.105+t*.075+sag),1.65-t*.38-.035*math.cos(a*5)*t))
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
band('Broad leather waist belt',(0,0,1.095),(.226,.157),.085,leather,'root')
collar_rows=[]
for k in range(5):
    row=[]
    for a in np.linspace(0,math.tau,48):
        front=max(0,math.cos(a))**3
        z=1.650+k/4*.059-.025*front
        row.append((.079*math.sin(a),-.008-.080*math.cos(a),z))
    collar_rows.append(row)
strip('Soft open front standing leather collar',collar_rows,leather,'neck01')
tube('Rounded rolled collar top',[(.079*math.sin(a),-.008-.080*math.cos(a),1.709-.025*max(0,math.cos(a))**3) for a in np.linspace(0,math.tau,49)],.0022,leather,'neck01',6)
for side in [-1,1]:
    # Anatomically curved leather shoulder yoke rather than spherical pauldrons.
    rows=[]
    for k in range(9):
        t=k/8;row=[]
        for j in range(17):
            u=j/16
            # Soft, anatomically seated leather yoke: no pointed floating pauldron.
            row.append((side*(.130+.145*t),-.082+u*.174,1.636-.086*t+.026*math.sin(u*math.pi)-.005*math.sin(t*math.pi*3)))
        rows.append(row)
    strip('Segmented leather shoulder yoke '+str(side),rows,leather,'shoulder01.'+('L' if side>0 else 'R'))
    for z in [.22,.29]:
        side_name='L' if side>0 else 'R';x=joint[rigdata['bones']['foot.'+side_name]['head']][0]
        rx,ry=(.062,.069) if z==.22 else (.066,.074)
        seam=[(x+(rx+.001)*math.sin(a),.008-(ry+.002)*math.cos(a),z) for a in np.linspace(-1.0,1.0,17)]
        tube('Close fitted boot quarter stitching',seam,.0012,metal,'foot.'+side_name,6)

# Diagonal, flat chest harness and a readable rectangular forged clasp.
rows=[]
for k in range(20):
    t=k/19;x=-.155+t*.30;z=1.56-t*.41
    rows.append([(x-.019,torso_front(x-.019,z-.014)-.010,z-.014),(x+.019,torso_front(x+.019,z+.014)-.010,z+.014)])
harness=strip('Flat fitted cross-body leather harness',rows,leather,'spine02')
harness.data.set_sharp_from_angle(angle=.75)
# Real garment construction reads through sewn edges and overlapping panels.
for side in [-1,1]:
    seam=[]
    for z in np.linspace(1.15,1.60,20):
        x=side*(.105+.018*math.sin((z-1.15)/.45*math.pi))
        seam.append((x,torso_front(x,z)-.012,z))
    tube('Raised sewn facing margin '+str(side),seam,.0017,red,None,6)
    seam=[]
    for t in np.linspace(0,1,14):
        x=side*(.130+.145*t);z=1.636-.086*t-.005*math.sin(t*math.pi*3)
        seam.append((x,-.084,z+.002))
    tube('Shoulder yoke rolled seam '+str(side),seam,.0020,leather,'shoulder01.'+('L' if side>0 else 'R'),6)
    # Interrupted stitches are seated in the yoke, rather than rivets or clutter.
    for t in np.linspace(.09,.92,11):
        x=side*(.130+.145*t);z=1.636-.086*t-.005*math.sin(t*math.pi*3)
        tube('Subdued yoke saddle stitch',[(x,-.082,z+.003),(x+side*.003,-.082,z+.002)],.0006,red,'shoulder01.'+('L' if side>0 else 'R'),4)
# Cross harness terminates beneath the standing collar and under the waist belt.
for k in [-1,1]:
    edge=[]
    for t in np.linspace(0,1,24):
        x=-.155+t*.30+k*.018;z=1.56-t*.41+k*.013
        edge.append((x,torso_front(x,z)-.016,z))
    tube('Rolled leather chest harness edge',edge,.0014,leather,'spine02',6)
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
if not eye_path.exists(): raise RuntimeError('Required anatomical eye source is missing')
if eye_path.exists():
    ev,eu,ef,eg=read_obj(eye_path)
    eye_mat=bpy.data.materials.new('Natural brown eyes');eye_mat.use_nodes=True
    ep=eye_mat.node_tree.nodes.get('Principled BSDF');ep.inputs['Roughness'].default_value=.25
    tex=eye_mat.node_tree.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(source/'brown_eye.png'));tex.image.pack()
    eye_mat.node_tree.links.new(tex.outputs['Color'],ep.inputs['Base Color'])
    # Official high-poly eyes include a transparent outer corneal shell. Its
    # UVs address the zero-alpha patch; treating it as opaque hides both eyes.
    alpha_clip=eye_mat.node_tree.nodes.new('ShaderNodeMath')
    alpha_clip.operation='GREATER_THAN';alpha_clip.inputs[1].default_value=.5
    eye_mat.node_tree.links.new(tex.outputs['Alpha'],alpha_clip.inputs[0])
    eye_mat.node_tree.links.new(alpha_clip.outputs[0],ep.inputs['Alpha'])
    eye_mat.surface_render_method='DITHERED'
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
def hairline(v):
    front=max(0,min(1,(-v[1]+.025)/.15))
    temple=math.exp(-((abs(v[0])-.066)/.026)**2)
    return v[2]-(1.775+.083*front+.020*temple*front+.0018*math.sin(v[0]*174)*front)
# Clip the existing cranial polygons against a continuous receding hairline.
# Interpolated boundary vertices remove the previous square, jagged edge.
hairverts=[];hairfaces=[];hairuv=[]
for f in bodyfaces:
    poly=[(coords[i].copy(),bodyuv[t].copy()) for i,t in f]
    clipped=[]
    for j,(a,au) in enumerate(poly):
        b,bu=poly[(j+1)%len(poly)];da=hairline(a);db=hairline(b)
        if da>=0:clipped.append((a,au))
        if (da>=0)!=(db>=0):
            t=da/(da-db);clipped.append((a+(b-a)*t,au+(bu-au)*t))
    if len(clipped)<3:continue
    first=len(hairverts);hairverts.extend(v for v,u in clipped)
    hairfaces.append(tuple(range(first,first+len(clipped))));hairuv.append([u for v,u in clipped])
scalp=make_mesh('Close cropped scalp and recession',hairverts,hairfaces,hair,hairuv,rigid='head')
# Weld shared clipped edges so vertex normals follow the cranium continuously.
bpy.context.view_layer.objects.active=scalp;scalp.select_set(True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.remove_doubles(threshold=.0001);bpy.ops.object.mode_set(mode='OBJECT')
for v in scalp.data.vertices:v.co+=v.normal*.0018
scalp.data.update()

# Original strand cards have a rooted, swept direction and lifted silhouette.
# The close crop above is only a dark underlayer: 136 overlapping tapered cards
# provide the broken hairline, crown volume, temple flow and soft nape edge.
# This atlas is authored procedurally, rather than a downloaded groom or game asset.
H,W=1024,512
hy,hx=np.mgrid[:H,:W];u=(hx+.5)/W;v=(hy+.5)/H
hair_alpha=np.zeros((H,W),dtype=np.float32)
hair_shade=np.zeros((H,W),dtype=np.float32)
for n in range(28):
    strand_center=(n+.55)/28 + .010*np.sin(v*5.1+n*.71)+.003*np.sin(v*19+n)
    root_width=.0035+((n*7)%11)*.00024
    taper=np.clip((1-v)/.21,0,1)**.55
    strand=np.exp(-((u-strand_center)/(root_width*taper+.0003))**4)
    strand*=np.clip(v/.023,0,1)*np.clip((1-v-.015*((n*13)%7))/ .065,0,1)
    hair_alpha=np.maximum(hair_alpha,strand)
    hair_shade=np.maximum(hair_shade,strand*(.40+.28*((n*11)%17)/17))
hair_rgba=np.zeros((H,W,4),np.float32)
hair_rgba[:,:,:3]=np.array([.060,.052,.044])[None,None,:]*(.68+hair_shade[:,:,None])
# A few silver fibres keep the mature character's grey hair subdued in light.
silver=(np.sin(u*28*math.tau+v*.8)>.97)&(hair_alpha>.4)
hair_rgba[:,:,:3]+=silver[:,:,None]*np.array([.032,.029,.025])
hair_rgba[:,:,3]=hair_alpha
hair_im=bpy.data.images.new('Original swept strand RGBA',width=W,height=H,alpha=True)
hair_im.pixels.foreach_set(hair_rgba.ravel());hair_im.filepath_raw=str(out/'Original swept strand RGBA.png');hair_im.file_format='PNG';hair_im.save();hair_im.pack()
strand_hair=bpy.data.materials.new('Original swept grey black hair MASK');strand_hair.use_nodes=True
hp=strand_hair.node_tree.nodes.get('Principled BSDF');hp.inputs['Roughness'].default_value=.71
ht=strand_hair.node_tree.nodes.new('ShaderNodeTexImage');ht.image=hair_im
strand_hair.node_tree.links.new(ht.outputs['Color'],hp.inputs['Base Color'])
hc=strand_hair.node_tree.nodes.new('ShaderNodeMath');hc.operation='GREATER_THAN';hc.inputs[1].default_value=.34
strand_hair.node_tree.links.new(ht.outputs['Alpha'],hc.inputs[0]);strand_hair.node_tree.links.new(hc.outputs[0],hp.inputs['Alpha'])
strand_hair.surface_render_method='DITHERED';strand_hair.use_backface_culling=False
def hair_card(name,path,width):
    verts=[];rows=[]
    for k,p in enumerate(path):
        p=np.asarray(p);t=k/(len(path)-1)
        tangent=np.asarray(path[min(k+1,len(path)-1)])-np.asarray(path[max(0,k-1)])
        normal=p-np.array([0,.013,1.804]);normal/=np.linalg.norm(normal)
        across=np.cross(tangent,normal);across/=np.linalg.norm(across)
        w=width*(.72+.28*math.sin(t*math.pi))*max(.08,min(1,(1-t)*6))
        rows.append([p-across*w*.5,p+across*w*.5])
    faces=[(k*2,k*2+1,k*2+3,k*2+2) for k in range(len(rows)-1)]
    uv=[[(0,k/(len(rows)-1)),(1,k/(len(rows)-1)),(1,(k+1)/(len(rows)-1)),(0,(k+1)/(len(rows)-1))] for k in range(len(rows)-1)]
    return make_mesh(name,[p for row in rows for p in row],faces,strand_hair,uv,rigid='head')
def crown_point(x,y,lift):
    z=1.803+.108*math.sqrt(max(.045,1-(x/.089)**2-((y-.014)/.109)**2))
    p=np.array([x,y,z]);normal=p-np.array([0,.014,1.803]);normal/=np.linalg.norm(normal)
    return p+normal*lift
for layer in range(3):
    for j in range(24):
        x=-.073+j/23*.146
        path=[]
        edge=math.sqrt(max(.10,1-(x/.089)**2))
        front_y=.014-.109*edge*.88
        back_y=.014+.109*edge*.74
        for k in range(9):
            t=k/8;y=front_y+layer*.0018+t*(back_y-front_y-layer*.006)
            sweep=.010*math.sin(t*math.pi)*(1-abs(x)/.095)
            path.append(crown_point(x+sweep,y,.003+layer*.003+.006*math.sin(t*math.pi)))
        hair_card('Swept crown strand card %d %d'%(layer,j),path,.0105)
# Eight readable, irregular forelocks bridge the frontal underlayer and crown.
# Their roots follow the recession and their lift is limited to normal hair volume.
for j in range(8):
    x=-.051+j/7*.102;edge=math.sqrt(1-(x/.089)**2);path=[]
    for k in range(10):
        t=k/9;y=.014-.109*edge*.94+t*.105
        p=crown_point(x+.014*math.sin(t*math.pi),y,.004+.012*math.sin(t*math.pi))
        p[2]+=.002*math.sin(j*2.3+t*4.7)*math.sin(t*math.pi)
        path.append(p)
    hair_card('Broken frontal forelock '+str(j),path,.014)
for side in [-1,1]:
    for j in range(22):
        a=-.75+j/21*1.5
        path=[]
        for k in range(8):
            t=k/7;ang=a+t*.38
            x=side*(.073+.013*math.sin(t*math.pi))*math.cos(ang*.48)
            y=.006+.075*math.sin(ang)-.009*(1-t)
            z=1.877-j%3*.006-t*(.055+.019*math.cos(a))
            path.append((x,y,z))
        hair_card('Combed temple and sideburn card %d %d'%(side,j),path,.010)
for j in range(20):
    a=-1.10+j/19*2.20;path=[]
    for k in range(8):
        t=k/7
        path.append((.078*math.sin(a),.013+.085*math.cos(a)+.004*math.sin(t*math.pi),1.873-t*.086-j%3*.002))
    hair_card('Tapered nape strand card %d'%j,path,.012)

# Small tapered brow ribbons follow the anatomical brow ridge. They remain
# flush to the face; separate raised cylinders would distort its silhouette.
brow=bpy.data.materials.new('Fine grey brown brow strands');brow.use_nodes=True
bp=brow.node_tree.nodes.get('Principled BSDF');bp.inputs['Base Color'].default_value=(.050,.036,.026,1);bp.inputs['Roughness'].default_value=.82
brow_y,brow_x=np.mgrid[:128,:512]
strand=np.maximum(0,np.sin(brow_x*.58+brow_y*.16+np.sin(brow_x*.061)))**5
envelope=np.exp(-((brow_y-64)/29)**2)*np.sin((brow_x+.5)/512*math.pi)**.35
alpha=np.clip((strand*.95+.10)*envelope,0,1)
brow_rgba=np.zeros((128,512,4),np.float32);brow_rgba[:,:,:3]=(.070,.055,.042);brow_rgba[:,:,3]=alpha
brow_im=bpy.data.images.new('Original fine brow alpha',width=512,height=128,alpha=True)
brow_im.pixels.foreach_set(brow_rgba.ravel());brow_im.filepath_raw=str(out/'Original fine brow alpha.png');brow_im.file_format='PNG';brow_im.save();brow_im.pack()
bt=brow.node_tree.nodes.new('ShaderNodeTexImage');bt.image=brow_im
cut=brow.node_tree.nodes.new('ShaderNodeMath');cut.operation='GREATER_THAN';cut.inputs[1].default_value=.24
brow.node_tree.links.new(bt.outputs['Alpha'],cut.inputs[0]);brow.node_tree.links.new(cut.outputs[0],bp.inputs['Alpha']);brow.surface_render_method='DITHERED'
for side in [-1,1]:
    rows=[]
    for k in range(25):
        t=k/24;x=side*(.014+t*.044);z=1.808+.003*math.sin(t*math.pi)-.004*t
        nearby=coords[(abs(coords[:,0]-x)<.009)&(abs(coords[:,2]-z)<.007)]
        y=nearby[:,1].min()-.0015
        width=.0008+.0023*math.sin(t*math.pi)**.65
        rows.append([(x,y,z-width),(x,y-.0007,z+width)])
    browuv=[[(k/24,0),(k/24,1),((k+1)/24,1),((k+1)/24,0)] for k in range(24)]
    make_mesh('Tapered natural brow '+str(side),[p for row in rows for p in row],[(k*2,k*2+1,k*2+3,k*2+2) for k in range(24)],brow,browuv,rigid='head')

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
bpy.context.view_layer.update()
# Orient the actual palm transverse axis along the staff. A fixed Euler wrist
# rotation had left the palm horizontal, with the shaft sitting on a finger shelf.
pb=rig.pose.bones['wrist.R'];m=pb.matrix.copy();pos=m.translation.copy()
across=(rig.pose.bones['finger2-1.R'].head-rig.pose.bones['finger5-1.R'].head).normalized()
longitudinal=(rig.pose.bones['finger3-1.R'].head-pb.tail)
longitudinal=(longitudinal-across*longitudinal.dot(across)).normalized()
palm_basis=Matrix((across,longitudinal,across.cross(longitudinal))).transposed()
grip_basis=Matrix((Vector((0,0,1)),Vector((0,-1,0)),Vector((1,0,0)))).transposed()
m=(grip_basis@palm_basis.inverted()).to_4x4()@m;m.translation=pos;pb.matrix=m
bpy.context.view_layer.update()
def curl_about_shaft(name,angle):
    pb=rig.pose.bones.get(name)
    if not pb:return
    m=pb.matrix.copy();p=m.translation.copy()
    m=Matrix.Rotation(angle,4,'Z')@m;m.translation=p;pb.matrix=m
    bpy.context.view_layer.update()
for finger in range(2,6):
    for knuckle,angle in [(1,.40),(2,1.02),(3,.90)]:
        curl_about_shaft('finger%d-%d.R'%(finger,knuckle),angle)
for knuckle,angle in [(1,-.30),(2,-.48),(3,-.35)]:
    curl_about_shaft('finger1-%d.R'%knuckle,angle)
bpy.context.view_layer.update()
staff_matrix=rig.pose.bones[staffbone].matrix @ rig.data.bones[staffbone].matrix_local.inverted()
staff_inverse=staff_matrix.inverted()
grip=rig.pose.bones['finger3-1.R'].head+Vector((.026,-.023,0))
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
            rot('upperarm01.L',0,-wave*.95);rot('lowerarm01.L',0,-wave*.48)
            rot('upperarm01.L',2,wave*.20);rot('wrist.L',2,-wave*.18)
            for finger in range(2,6):
                rot('finger%d-1.L'%finger,0,-wave*(.12+(finger-2)*.04))
            rot('spine02',0,-wave*.065);rot('spine02',1,wave*.09)
            rot('upperleg01.R',0,-wave*.045);rot('lowerleg01.R',0,wave*.075)
            rig.pose.bones['root'].location=Vector((-.008*wave,0,-.008*wave))
            rot('head',0,wave*.045);rot('head',1,-wave*.045)
        for bone in rig.pose.bones:
            if any(abs(x)>.00001 for x in bone.rotation_euler) or bone.name in ['root','head','spine02','upperleg01.L','upperleg01.R','lowerleg01.L','lowerleg01.R','upperarm01.L','upperarm01.R','lowerarm01.L','wrist.L','finger2-1.L','finger3-1.L','finger4-1.L','finger5-1.L']:
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
# Studio-only ground makes sole contact and cast shadows inspectable.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.013))
ground=bpy.context.object;ground.name='Studio-only neutral ground'
ground_mat=bpy.data.materials.new('Studio neutral ground');ground_mat.diffuse_color=(.055,.055,.055,1)
ground.data.materials.append(ground_mat)
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
stats={'name':'Ash Archivist / 灰烬典籍守望者','triangles':tris,'meshes':len(parts),'bones':len(rig.data.bones),'glbBytes':asset.stat().st_size,'sha256':hashlib.sha256(asset.read_bytes()).hexdigest(),'clips':['Idle','Walk','Cast'],'heightMeters':1.91,'baseLicense':'CC0 1.0','textures':'Original seeded procedural PBR plus CC0 MakeHuman brown eyes and middleage_caucasian_male skin','limitations':['No claim of AAA/D2R/D4 quality equivalence','Animation authored as a first pass, no motion capture','No true mobile GPU performance evidence']}
(out/'statistics.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2)+'\n')
print('ASH_ARCHIVIST_COMPLETE',json.dumps(stats,ensure_ascii=False))
