"""Generic sprite extraction from black-background sheets via connected components."""
from PIL import Image; import numpy as np
from scipy import ndimage
def foreground(path,thr=14):
    a=np.array(Image.open(path).convert('RGB')).astype(int);lum=a.max(axis=2)
    dark=lum<=thr
    lab,n=ndimage.label(dark);sizes=ndimage.sum(dark,lab,range(1,n+1))
    border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
    bg=np.isin(lab,list(border|{i+1 for i,s in enumerate(sizes) if s>=300}))
    fg=~bg
    fg&=~((lum<=22)&ndimage.binary_dilation(bg,iterations=1))
    return a,fg
def blobs(fg,min_area=1500,merge=18):
    # merge nearby components by dilating, then label
    big=ndimage.binary_dilation(fg,iterations=merge)
    lab,n=ndimage.label(big)
    out=[]
    for i,sl in enumerate(ndimage.find_objects(lab)):
        m=(lab[sl]==i+1)&fg[sl]
        if m.sum()<min_area:continue
        ys,xs=np.where(m)
        y0,y1,x0,x1=sl[0].start+ys.min(),sl[0].start+ys.max()+1,sl[1].start+xs.min(),sl[1].start+xs.max()+1
        out.append((y0,y1,x0,x1,i+1))
    return out,lab
def extract(a,fg,lab,b):
    y0,y1,x0,x1,li=b
    m=fg[y0:y1,x0:x1]&(lab[y0:y1,x0:x1]==li)
    rgba=np.dstack([a[y0:y1,x0:x1],m*255]).astype(np.uint8)
    hb=max(4,int((y1-y0)*.06));cols=np.where(m[-hb:])[1]
    foot=int(np.median(cols)) if len(cols) else (x1-x0)//2
    return Image.fromarray(rgba),foot
def grid_cells(path,cols,rows,thr=14,pad=0):
    a,fg=foreground(path,thr)
    H,W=fg.shape;cw,ch=W/cols,H/rows
    out=[]
    for r in range(rows):
        for c in range(cols):
            x0,x1,y0,y1=int(c*cw),int((c+1)*cw),int(r*ch),int((r+1)*ch)
            sub=fg[y0:y1,x0:x1]
            big=ndimage.binary_dilation(sub,iterations=4)
            lab,n=ndimage.label(big)
            if n==0:out.append(None);continue
            sizes=ndimage.sum(sub,lab,range(1,n+1))
            # drop components touching the cell edge that are mostly outside (neighbour bleed)
            keep=np.zeros_like(sub)
            mx=sizes.max()
            for i,s in enumerate(sizes):
                if s<max(60,mx*.02):continue
                m=lab==i+1
                ys,xs=np.where(m)
                edge=(xs.min()<=1 or xs.max()>=sub.shape[1]-2 or ys.min()<=1 or ys.max()>=sub.shape[0]-2)
                if edge and s<mx*.3:continue
                keep|=m&sub
            ys,xs=np.where(keep)
            if not len(ys):out.append(None);continue
            yy0,yy1,xx0,xx1=ys.min(),ys.max()+1,xs.min(),xs.max()+1
            rgba=np.dstack([a[y0+yy0:y0+yy1,x0+xx0:x0+xx1],keep[yy0:yy1,xx0:xx1]*255]).astype(np.uint8)
            hb=max(4,int((yy1-yy0)*.08));cols_=np.where(keep[yy1-hb:yy1,xx0:xx1])[1]
            foot=int(np.median(cols_)) if len(cols_) else (xx1-xx0)//2
            out.append((Image.fromarray(rgba),foot))
    return out
def preview(items,path,cell=160,cols=10,bg=(60,70,80,255)):
    rows=(len(items)+cols-1)//cols
    sheet=Image.new('RGBA',(cols*cell,rows*cell),bg)
    from PIL import ImageDraw
    d=ImageDraw.Draw(sheet)
    for i,it in enumerate(items):
        if not it:continue
        im,foot=it;s=min((cell-10)/im.width,(cell-18)/im.height)
        t=im.resize((max(1,int(im.width*s)),max(1,int(im.height*s))),Image.NEAREST)
        x=(i%cols)*cell+(cell-t.width)//2;y=(i//cols)*cell+cell-6-t.height
        sheet.alpha_composite(t,(x,y));d.text(((i%cols)*cell+3,(i//cols)*cell+2),str(i),fill=(255,255,0,255))
    sheet.save(path)
