"""v0.8 电脑版哥特式状态栏：从用户提供的示意图（assets-source/2d/ui/hud-mockup.png）做出可用的边框图。
- 背景（近黑纯色）从四周泛洪去掉 → 透明；
- 血球 / 法力球、两条血蓝条、13 个技能格的内部挖空（游戏在下面画实时内容）；
- 文字牌（生命/法力数值、等级、职业名）和格子下的按键牌抹成底色（游戏在上面写实时文字）；
- 右上角示意用的增益图标去掉。
输出 dist/2d/art/hud-frame.webp 和 dist/2d/hud-layout.js（各部件在图里的百分比位置）。
用法：python3 scripts/2d-ui/build_hud.py
"""
import json
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = 'assets-source/2d/ui/hud-mockup.png'
im = Image.open(SRC).convert('RGBA'); a = np.array(im).astype(np.int16)
H, W = a.shape[:2]
bg = np.array([19, 21, 24])
near = (np.abs(a[..., :3] - bg).max(axis=2) <= 10)
lab, n = ndimage.label(near)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
outside = np.isin(lab, list(border))
alpha = np.where(outside, 0, 255).astype(np.uint8)
# 边缘柔化：外部背景旁边、颜色也接近背景的像素半透明，避免黑边
edge = ndimage.binary_dilation(outside, iterations=1) & ~outside & (np.abs(a[..., :3] - bg).max(axis=2) <= 22)
alpha[edge] = 120

def hole_circle(cx, cy, r):
    yy, xx = np.ogrid[:H, :W]; alpha[(xx - cx) ** 2 + (yy - cy) ** 2 <= r * r] = 0
def hole_rect(x0, y0, x1, y1): alpha[y0:y1, x0:x1] = 0
def paint(x0, y0, x1, y1, col=(14, 13, 14)):
    a[y0:y1, x0:x1, :3] = col; alpha[y0:y1, x0:x1] = 255

L = dict(orbL=(203, 446, 87), orbR=(1471, 444, 87),
         hpBar=(321, 444, 690, 481), mpBar=(962, 444, 1342, 481),
         hpText=(330, 405, 686, 434), mpText=(967, 405, 1338, 434),
         lv=(768, 437, 913, 477), cls=(768, 499, 910, 527))
SLOTS = [(277, 340), (348, 411), (421, 484), (505, 575), (590, 660), (675, 745), (930, 995), (1007, 1072), (1082, 1147), (1157, 1222), (1242, 1295), (1300, 1352), (1358, 1410)]
SY0, SY1 = 523, 592
KEYS = [(432, 473), (520, 560), (604, 645), (690, 730), (944, 984), (1020, 1060), (1095, 1135), (1170, 1210)]
for k in ('orbL', 'orbR'): hole_circle(*L[k])
for k in ('hpBar', 'mpBar'): hole_rect(*L[k])
for k in ('hpText', 'mpText', 'lv', 'cls'): paint(*L[k])
for x0, x1 in SLOTS: hole_rect(x0 + 4, SY0 + 4, x1 - 3, SY1 - 3)
for x0, x1 in KEYS: paint(x0 + 2, 589, x1 - 2, 610)
alpha[300:372, 1175:1335] = 0  # 示意用的增益图标
out = np.dstack([np.clip(a[..., :3], 0, 255).astype(np.uint8), alpha])
img = Image.fromarray(out)
# 去掉上下多余的空白，只保留到锁链下沿
ys = np.nonzero(alpha.max(axis=1) > 0)[0]; xs = np.nonzero(alpha.max(axis=0) > 0)[0]
top, bot, left, right = ys.min(), min(ys.max() + 1, 672), xs.min(), xs.max() + 1
img = img.crop((left, top, right, bot)); w, h = img.size
img.save('dist/2d/art/hud-frame.webp', quality=92, method=6)
pct = lambda x0, y0, x1, y1: [round((x0 - left) / w * 100, 3), round((y0 - top) / h * 100, 3), round((x1 - x0) / w * 100, 3), round((y1 - y0) / h * 100, 3)]
lay = {'w': w, 'h': h}
for k in ('hpBar', 'mpBar', 'hpText', 'mpText', 'lv', 'cls'): lay[k] = pct(*L[k])
for k in ('orbL', 'orbR'): cx, cy, r = L[k]; lay[k] = pct(cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2)
lay['slots'] = [pct(x0 + 3, SY0 + 3, x1 - 2, SY1 - 2) for x0, x1 in SLOTS]
lay['keys'] = [pct(x0, 588, x1, 611) for x0, x1 in KEYS]
lay['buffs'] = pct(1150, 290, 1360, 372)
open('dist/2d/hud-layout.js', 'w').write('/* 自动生成：scripts/2d-ui/build_hud.py。电脑版状态栏各部件在 art/hud-frame.webp 中的位置（百分比：x, y, 宽, 高）。 */\nexport const HUD_LAYOUT=' + json.dumps(lay, separators=(',', ':')) + ';\n')
print('hud', img.size, 'crop', left, top, right, bot)
