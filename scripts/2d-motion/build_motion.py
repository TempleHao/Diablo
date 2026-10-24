#!/usr/bin/env python3
"""Build provisional 6x8 motion atlases for the 122 units listed in motion-manifest.json.
This tool transforms existing still sprite assets. It DOES NOT produce hand-animated limbs.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import json, math

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'dist/2d'
OUT=SOURCE/'art/motion'
F=8
ACTS=('idle','walk','attack','skill','hit','death')

def ease(t): return t*t*(3-2*t)

def frame(src,size,act,k,kind):
    t=k/(F-1)
    src=src.convert('RGBA')
    scale=min(size*.83/max(1,src.width),size*.83/max(1,src.height))
    img=src.resize((max(1,int(src.width*scale)),max(1,int(src.height*scale))),Image.Resampling.NEAREST)
    x=y=angle=0.0
    if act=='idle':
        y=-3*math.sin(t*2*math.pi)
    elif act=='walk':
        x=5*math.sin(2*t*math.pi);y=-6*abs(math.sin(t*2*math.pi));angle=2.0*math.sin(t*2*math.pi)
    elif act=='attack':
        wind=ease(min(1,t/.28))
        hit=ease(max(0,min(1,(t-.28)/.20)))
        recoil=ease(max(0,min(1,(t-.53)/.47)))
        x=-12*wind+30*hit-18*recoil
        angle=-7*wind+13*hit-6*recoil
    elif act=='skill':
        y=-8*math.sin(t*math.pi)
    elif act=='hit':
        x=-16*math.sin(t*math.pi);angle=-8*math.sin(t*math.pi)
    elif act=='death':
        q=ease(t);angle=-65*q;y=24*q
        a=img.getchannel('A').point(lambda v:int(v*(1-.75*q)))
        img.putalpha(a)
    if angle: img=img.rotate(angle,Image.Resampling.NEAREST,expand=True)
    result=Image.new('RGBA',(size,size))
    px=int((size-img.width)/2+x);py=int(size-img.height-8+y)
    # Pillow RGBA paste clips automatically, including negative margins.
    result.paste(img,(px,py),img)
    if act=='skill':
        ov=Image.new('RGBA',(size,size))
        d=ImageDraw.Draw(ov)
        r=int((.20+.27*math.sin(t*math.pi))*size)
        color=(110,220,155,130) if kind=='summon' else (117,155,255,130) if kind=='hero' else (249,110,67,125)
        d.ellipse((size//2-r,size//2-r,size//2+r,size//2+r),outline=color,width=2)
        result=Image.alpha_composite(result,ov)
    return result

def main():
    manifest=json.loads((SOURCE/'motion-manifest.json').read_text('utf-8'))
    assert len(manifest['entries'])==122
    atlases={}
    units=[]
    for item in manifest['entries']:
        origin=item['source']
        if origin not in atlases:atlases[origin]=Image.open(SOURCE/origin).convert('RGBA')
        ox,oy,ow,oh=item['rect']
        image=atlases[origin].crop((ox,oy,ox+ow,oy+oh))
        category=item['kind']
        size=192 if category=='hero' else 224 if item['id'].startswith('B') else 160 if category in ('follower','summon') or item['id'].startswith('E') else 128
        sheet=Image.new('RGBA',(size*F,size*6))
        for row,act in enumerate(ACTS):
            for col in range(F):
                sheet.alpha_composite(frame(image,size,act,col,category),(col*size,row*size))
        folder=OUT/category
        folder.mkdir(parents=True,exist_ok=True)
        target=folder/(item['id']+'.webp')
        sheet.save(target,format='WEBP',lossless=True,method=4)
        units.append(dict(id=item['id'],label=item['label'],kind=category,file=str(target.relative_to(OUT)),width=size,height=size,cols=F,rows=6,sourceGrade=item['animationGrade'],actions={a:{'row':i,'frames':F,'fps':(8,12,12,10,12,9)[i]} for i,a in enumerate(ACTS)}))
    (OUT/'manifest.json').write_text(json.dumps({'units':units,'total':122,'note':'PROCEDURAL PLACEHOLDER; not articulated 8-frame animation'},ensure_ascii=False,indent=2),'utf-8')
    assert len(list(OUT.glob('*/*.webp')))==122
    print('Generated',len(units),'motion atlases under',OUT)
if __name__=='__main__':main()
