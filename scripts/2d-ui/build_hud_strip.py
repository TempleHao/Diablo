"""v0.9 电脑版左下角生命/资源条：从示意图 assets-source/2d/ui/hud-strip-mockup.png 抠出边框。
去掉灰色背景；血球、法力球、两条槽挖空（游戏在下面画实时液面 / 条）；数值牌与等级圆牌抹成底色（游戏在上面写字）。
输出 dist/2d/art/hud-strip.webp 与 dist/2d/hud-strip-layout.js。用法：python3 scripts/2d-ui/build_hud_strip.py
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage
im = Image.open('assets-source/2d/ui/hud-strip-mockup.png').convert('RGBA'); a = np.array(im).astype(np.int16)
H, W = a.shape[:2]; bg = a[5, 5, :3]
near = np.abs(a[..., :3] - bg).max(axis=2) <= 12
lab, n = ndimage.label(near)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
outside = np.isin(lab, list(border))
alpha = np.where(outside, 0, 255).astype(np.uint8)
edge = ndimage.binary_dilation(outside, iterations=1) & ~outside & (np.abs(a[..., :3] - bg).max(axis=2) <= 26)
alpha[edge] = 110
yy, xx = np.ogrid[:H, :W]
def circ(cx, cy, r): return (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
def paint(mask, col=(14, 12, 13)): a[mask, :3] = col; alpha[mask] = 255
L = dict(orbL=(300, 355, 97), orbR=(1879, 363, 96), hpBar=(436, 327, 942, 392), mpBar=(1228, 327, 1737, 392),
         hpText=(490, 412, 846, 454), mpText=(1314, 412, 1686, 454), lv=(1086, 362, 66))
for k in ('orbL', 'orbR'): alpha[circ(*L[k])] = 0
for k in ('hpBar', 'mpBar'): x0, y0, x1, y1 = L[k]; alpha[y0:y1, x0:x1] = 0
for k in ('hpText', 'mpText'):
    x0, y0, x1, y1 = L[k]; m = np.zeros((H, W), bool); m[y0:y1, x0:x1] = True; paint(m)
paint(circ(*L['lv']))
img = Image.fromarray(np.dstack([np.clip(a[..., :3], 0, 255).astype(np.uint8), alpha]))
ys = np.nonzero(alpha.max(axis=1) > 0)[0]; xs = np.nonzero(alpha.max(axis=0) > 0)[0]
top, bot, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
img = img.crop((left, top, right, bot)); w, h = img.size
img.save('dist/2d/art/hud-strip.webp', quality=92, method=6)
pct = lambda x0, y0, x1, y1: [round((x0 - left) / w * 100, 3), round((y0 - top) / h * 100, 3), round((x1 - x0) / w * 100, 3), round((y1 - y0) / h * 100, 3)]
lay = {'w': w, 'h': h}
for k in ('hpBar', 'mpBar', 'hpText', 'mpText'): lay[k] = pct(*L[k])
for k in ('orbL', 'orbR', 'lv'): cx, cy, r = L[k]; lay[k] = pct(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2)
open('dist/2d/hud-strip-layout.js', 'w').write('/* 自动生成：scripts/2d-ui/build_hud_strip.py。左下生命条各部件位置（百分比 x, y, 宽, 高）。 */\nexport const HUD_STRIP=' + json.dumps(lay, separators=(',', ':')) + ';\n')
print(img.size, top, bot, left, right)
