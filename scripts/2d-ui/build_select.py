"""v0.8 选角高清立绘：assets-source/2d/ui/select-heroes-hd.png（7 职业 × 4 个姿势）。
连通块按重心归到 7×4 网格里（能处理越过网格线的武器挥砍弧光）。
输出 dist/2d/art/select-heroes.webp 与 dist/2d/select-art.js：每个职业 4 帧 [x,y,w,h,脚底x]。
姿势：0 站立、1 戒备、2 攻击、3 施法。用法：python3 scripts/2d-ui/build_select.py
"""
import json, sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '2d-art'))
from sprites import foreground
SRC = 'assets-source/2d/ui/select-heroes-hd.png'
ORDER = ['amazon', 'assassin', 'barbarian', 'druid', 'necro', 'paladin', 'mage']
a, fg = foreground(SRC, 14)
H, W = fg.shape; cw, ch = W / 7, H / 4
lab, n = ndimage.label(ndimage.binary_dilation(fg, iterations=2))
cells = {}
for i, sl in enumerate(ndimage.find_objects(lab)):
    m = (lab[sl] == i + 1) & fg[sl]
    if m.sum() < 40: continue
    ys, xs = np.nonzero(m); cy, cx = ys.mean() + sl[0].start, xs.mean() + sl[1].start
    key = (min(3, int(cy // ch)), min(6, int(cx // cw)))
    cells.setdefault(key, []).append(i + 1)
frames, ims = {}, []
for r in range(4):
    for c in range(7):
        ids = cells.get((r, c), [])
        m = np.isin(lab, ids) & fg
        ys, xs = np.nonzero(m); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        rgba = np.dstack([a[y0:y1, x0:x1], m[y0:y1, x0:x1] * 255]).astype(np.uint8)
        hb = max(4, int((y1 - y0) * .06)); cols = np.nonzero(m[y1 - hb:y1, x0:x1])[1]
        ims.append(((r, c), Image.fromarray(rgba), int(np.median(cols)) if len(cols) else (x1 - x0) // 2))
# 打包
ims.sort(key=lambda t: -t[1].height)
x = y = shelf = 0; pos = {}; MW = 2048
for k, im, f in ims:
    if x + im.width > MW: x = 0; y += shelf + 2; shelf = 0
    pos[k] = (x, y, im.width, im.height, f); x += im.width + 2; shelf = max(shelf, im.height)
atlas = Image.new('RGBA', (MW, y + shelf))
for k, im, f in ims: atlas.paste(im, pos[k][:2])
atlas.save('dist/2d/art/select-heroes.webp', quality=90, method=6)
out = {cls: [list(pos[(r, c)]) for r in range(4)] for c, cls in enumerate(ORDER)}
open('dist/2d/select-art.js', 'w').write('/* 自动生成：scripts/2d-ui/build_select.py。选角高清立绘：每职业 4 个姿势 [x,y,w,h,脚底x]（站立、戒备、攻击、施法）。 */\nexport const SELECT_ART=' + json.dumps(out, separators=(',', ':')) + ';\n')
print(atlas.size, os.path.getsize('dist/2d/art/select-heroes.webp'), {k: [p[3] for p in v] for k, v in out.items()})
