"""Detect icons on black-background sheets (v0.7 class equipment). Prints rows of boxes as JSON."""
import sys,json
import numpy as np
from PIL import Image
from scipy import ndimage
def detect(path,top=95,thr=40,grow=7,minarea=900):
    im=np.asarray(Image.open(path).convert('RGB')).astype(int)
    lum=im.max(axis=2)
    mask=lum>thr
    mask[:top]=False
    big=ndimage.binary_dilation(mask,iterations=grow)
    lab,n=ndimage.label(big)
    boxes=[]
    for sl in ndimage.find_objects(lab):
        ys,xs=sl
        sub=mask[sl]
        if sub.sum()<minarea:continue
        boxes.append([xs.start,ys.start,xs.stop-xs.start,ys.stop-ys.start])
    # cluster rows by y center
    boxes.sort(key=lambda b:b[1]+b[3]/2)
    rows=[]
    for b in boxes:
        cy=b[1]+b[3]/2
        if rows and abs(cy-rows[-1]['cy'])<45:
            rows[-1]['b'].append(b);rows[-1]['cy']=(rows[-1]['cy']*(len(rows[-1]['b'])-1)+cy)/len(rows[-1]['b'])
        else: rows.append({'cy':cy,'b':[b]})
    return [sorted(r['b'],key=lambda b:b[0]) for r in rows]
if __name__=='__main__':
    for p in sys.argv[1:]:
        rows=detect(p)
        print(p.split('/')[-1],[len(r) for r in rows],'total',sum(map(len,rows)))
