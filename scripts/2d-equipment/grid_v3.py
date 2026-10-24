"""第三批（中国风）装备图切图：先按行切（行间暗缝），每行用列投影找图标之间的空隙；
空隙多于图标数就合并最窄的空隙，少于就在最宽的块里按最低点再切。返回每行的 (x, y, w, h)。"""
import numpy as np
from scipy import ndimage
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '2d-art'))
from grid_icons import cuts, extent

def runs_of(occ):
    out, s = [], None
    for x, v in enumerate(list(occ) + [False]):
        if v and s is None: s = x
        elif not v and s is not None: out.append([s, x]); s = None
    return out

def split_rows(a, counts, top=70, thr=60):
    m = a > thr; m[:top] = False
    ys = extent(m.sum(axis=1)); rc = cuts(m.sum(axis=1), ys[0], ys[1], len(counts), 40)
    rows = []
    for r, n in enumerate(counts):
        y0, y1 = rc[r], rc[r + 1]; band = m[y0:y1]
        prof = ndimage.uniform_filter1d(band.sum(axis=0).astype(float), 3)
        runs = [q for q in runs_of(prof > 1.5) if q[1] - q[0] > 6]
        while len(runs) > n:
            g = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]; i = int(np.argmin(g))
            runs[i:i + 2] = [[runs[i][0], runs[i + 1][1]]]
        while len(runs) < n:
            i = int(np.argmax([q[1] - q[0] for q in runs])); s, e = runs[i]; w = e - s
            mid = s + w // 4 + int(np.argmin(prof[s + w // 4:e - w // 4]))
            runs[i:i + 1] = [[s, mid], [mid, e]]
        row = []
        for s, e in runs:
            cell = a[y0:y1, s:e] > 40; yy, xx = np.nonzero(cell)
            row.append((s + int(xx.min()), y0 + int(yy.min()), int(xx.max() - xx.min() + 1), int(yy.max() - yy.min() + 1)))
        rows.append(row)
    return rows
