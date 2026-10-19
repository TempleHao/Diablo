"""Split black-background icon sheets into cells with known row/column counts.
Cuts are placed at profile minima near a uniform guess. Returns list of rows of boxes (x,y,w,h)."""
import numpy as np
from PIL import Image
from scipy import ndimage
def lum(path):return np.asarray(Image.open(path).convert('RGB')).astype(int).max(axis=2)
def cuts(profile,lo,hi,n,win):
    prof=ndimage.uniform_filter1d(profile.astype(float),5)
    # 先找真正的低谷（明显低于中位数的局部最小值），按深度挑 n-1 个且间距足够
    if n>1:
        seg=prof[lo:hi];med=np.median(seg[seg>0]) if (seg>0).any() else 1
        spacing=(hi-lo)/n;cand=[]
        for i in range(lo+2,hi-2):
            if prof[i]<=prof[i-1] and prof[i]<=prof[i+1] and prof[i]<med*.2:cand.append((prof[i],i))
        cand.sort();chosen=[]
        for v,i in cand:
            if all(abs(i-j)>spacing*.55 for j in chosen) and i-lo>spacing*.45 and hi-i>spacing*.45:chosen.append(i)
            if len(chosen)==n-1:break
        if len(chosen)==n-1:return [lo]+sorted(chosen)+[hi]
    out=[lo]
    for k in range(1,n):
        g=int(lo+k*(hi-lo)/n);a=max(lo+1,g-win);b=min(hi-1,g+win)
        out.append(a+int(np.argmin(prof[a:b])))
    out.append(hi);return out
def cc_cuts(band,n):
    '''按连通块切列：块按横向间隙合并到 n 个，切在相邻块之间。'''
    lab,k=ndimage.label(ndimage.binary_dilation(band,iterations=4))
    spans=sorted([(sl[1].start,sl[1].stop) for sl in ndimage.find_objects(lab)])
    while len(spans)>n:
        gaps=[spans[i+1][0]-spans[i][1] for i in range(len(spans)-1)]
        i=int(np.argmin(gaps));spans[i:i+2]=[(spans[i][0],max(spans[i][1],spans[i+1][1]))]
    out=[spans[0][0]]+[(spans[i][1]+spans[i+1][0])//2 for i in range(len(spans)-1)]+[spans[-1][1]]
    return out
def extent(profile,minv=2):
    idx=np.nonzero(profile>minv)[0];return int(idx[0]),int(idx[-1])+1
def split(a,counts,top=82,bottom=None,thr=60,box=None,cc_rows=None):
    m=a>thr;m[:top]=False
    if bottom:m[bottom:]=False
    if box: x0,y0,x1,y1=box;mm=np.zeros_like(m);mm[y0:y1,x0:x1]=m[y0:y1,x0:x1];m=mm
    ys=extent(m.sum(axis=1));rc=cuts(m.sum(axis=1),ys[0],ys[1],len(counts),40)
    rows=[]
    for r,n in enumerate(counts):
        y0,y1=rc[r],rc[r+1];band=m[y0:y1]
        xs=extent(band.sum(axis=0),0);cc=cuts(band.sum(axis=0),xs[0],xs[1],n,int((xs[1]-xs[0])/n*.35))
        if cc_rows and r in cc_rows:cc=cc_rows[r] if isinstance(cc_rows,dict) else cc_cuts(band,n)
        row=[]
        for c in range(n):
            x0,x1=cc[c],cc[c+1];cell=a[y0:y1,x0:x1]>40
            # biggest object + nearby pixels
            lab,k=ndimage.label(ndimage.binary_dilation(cell,iterations=3))
            if k==0:row.append(None);continue
            sizes=ndimage.sum(cell,lab,range(1,k+1));keep=np.zeros_like(cell)
            for i,s in enumerate(sizes):
                if s>=max(25,sizes.max()*.04):keep|=lab==i+1
            yy,xx=np.nonzero(keep&cell)
            row.append((x0+int(xx.min()),y0+int(yy.min()),int(xx.max()-xx.min()+1),int(yy.max()-yy.min()+1)))
        rows.append(row)
    return rows
