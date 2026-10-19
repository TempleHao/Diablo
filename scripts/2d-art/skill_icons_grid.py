"""技能图标表的格子：每个职业两行。按列方向的暗缝找出每个图标框（宽度 ≥ 45 像素的亮段）。"""
import sys
import numpy as np
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from grid_icons import split, lum
COUNTS = [16, 11, 16, 11, 16, 10, 16, 11, 16, 9, 16, 11, 19, 16]
CLASSES = ['amazon', 'assassin', 'barbarian', 'druid', 'necro', 'paladin', 'mage']
def boxes(path):
    a = lum(path)
    rows = split(a, COUNTS, top=0, thr=60, box=(150, 0, 1448, 1086))
    out = {c: [] for c in CLASSES}
    for ri, row in enumerate(rows):
        ys = sorted(b[1] for b in row); ye = sorted(b[1] + b[3] for b in row)
        y0, y1 = ys[len(ys) // 2], ye[len(ye) // 2]
        band = a[y0:y1, 150:]
        gaps = np.percentile(band, 97, axis=0) < 45
        runs = []; s = None
        for x, g in enumerate(list(gaps) + [True]):
            if not g and s is None: s = x
            elif g and s is not None:
                if x - s >= 45: runs.append((s + 150, x + 150))
                s = None
        pass
        for (x0, x1) in runs:
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; side = int(x1 - x0) + 4
            out[CLASSES[ri // 2]].append((int(cx - side / 2), int(cy - side / 2), side, side))
    return out
