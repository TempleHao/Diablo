#!/usr/bin/env python3
"""Create verifiable visual contact sheet and representative GIFs from motion atlases."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json
ROOT=Path(__file__).resolve().parents[2]/'dist/2d/art/motion'
M=json.loads((ROOT/'manifest.json').read_text())
P=ROOT/'previews';P.mkdir(exist_ok=True,parents=True)
U=M['units']
font=ImageFont.load_default()
CONTACT=Image.new('RGB',(12*130,11*149),(13,13,18))
draw=ImageDraw.Draw(CONTACT)
for n,u in enumerate(U):
    sheet=Image.open(ROOT/u['file']).convert('RGBA')
    w=u['width'];x=n%12*130;y=n//12*149
    cell=sheet.crop((0,0,w,w))
    box=cell.getbbox()
    if box:cell=cell.crop(box)
    cell.thumbnail((118,115),Image.Resampling.NEAREST)
    CONTACT.paste(cell,(x+(130-cell.width)//2,y+116-cell.height),cell)
    draw.text((x+5,y+124),u['id'][:18],font=font,fill=(220,191,145))
CONTACT.save(P/'122-units-contact.png',optimize=True)
for key in ('amazon','mage','N001','E001','C001','B001','summon00','guard'):
    record=next((u for u in U if u['id']==key),None)
    if not record:continue
    a=Image.open(ROOT/record['file']).convert('RGBA');s=record['width']
    frames=[]
    for r in range(6):
        for c in range(8):
            img=a.crop((s*c,s*r,s*(c+1),s*(r+1)))
            f=Image.new('RGBA',(280,300),(12,11,16,255))
            img.thumbnail((240,240),Image.Resampling.NEAREST)
            f.alpha_composite(img,((280-img.width)//2,24+(240-img.height)))
            ImageDraw.Draw(f).text((8,277),key+' / '+('idle','walk','attack','skill','hit','death')[r],font=font,fill=(241,205,156))
            frames.append(f.convert('P',palette=Image.Palette.ADAPTIVE,colors=96))
    frames[0].save(P/(key+'.gif'),save_all=True,append_images=frames[1:],duration=90,loop=0,optimize=True,disposal=2)
print('Previews ready: ',len(list(P.iterdir())))
