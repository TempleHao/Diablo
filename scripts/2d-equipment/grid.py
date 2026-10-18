from PIL import Image;import numpy as np
def clusters(peaks):
    out=[];cur=[peaks[0]]
    for p in peaks[1:]:
        if p-cur[-1]<=3:cur.append(p)
        else:out.append((cur[0],cur[-1]));cur=[p]
    out.append((cur[0],cur[-1]));return out
def cells_from(frac,thr=0.8,minw=55):
    n=len(frac)
    peaks=[i for i in range(1,n-1) if frac[i]>thr and frac[i]>=frac[i-1] and frac[i]>=frac[i+1]]
    cl=clusters(peaks)
    segs=[]
    for a,b in zip(cl,cl[1:]):
        s,e=a[1]+1,b[0]-1
        if e-s>=minw:segs.append((s,e))
    return segs
def grid(path):
    im=np.array(Image.open(path).convert('RGB')).astype(int);lum=im.max(axis=2)
    isline=(lum>35)&(lum<115)
    # columns from several row bands, rows from several col bands; take consensus by first good
    cols=None
    for y0 in range(60,1200,100):
        c=cells_from(isline[y0:y0+70,:].mean(axis=0))
        if len(c)==10:cols=c;break
    rows=None
    for x0 in range(20,1200,124):
        r=cells_from(isline[:,x0:x0+90].mean(axis=1),minw=50)
        if len(r)==12:rows=r;break
    return cols,rows
if __name__=='__main__':
    import sys
    for f in sys.argv[1:]:
        c,r=grid(f);print(f.split('/')[-1],c and len(c),r and len(r));print(c);print(r)
