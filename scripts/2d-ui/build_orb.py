"""v0.9.5 手机端「一体血球」边框：把血条示意图（assets-source/2d/ui/hud-strip-mockup.png）里
左边血球（左侧石像鬼、红色环）的左半和右边法力球（右侧石像鬼、蓝色环）的右半拼成一个对称的球框，
中间挖空，游戏在里面画左红右蓝两半液面。输出 dist/2d/art/hud-orb.webp 与 hud-orb-layout.js。"""
import json, numpy as np
from PIL import Image
from scipy import ndimage
im = Image.open('assets-source/2d/ui/hud-strip-mockup.png').convert('RGBA'); a = np.array(im).astype(np.int16)
H, W = a.shape[:2]; bg = a[5, 5, :3]
near = np.abs(a[..., :3] - bg).max(axis=2) <= 12
lab, n = ndimage.label(near)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
alpha = np.where(np.isin(lab, list(border)), 0, 255).astype(np.uint8)
rgba = np.dstack([np.clip(a[..., :3], 0, 255).astype(np.uint8), alpha])
LC, RC, R, HALF, TOP, BOT = (300, 355), (1879, 363), 97, 270, 175, 210   # 球心、内径、半宽、向上/向下范围
left = rgba[LC[1] - TOP:LC[1] + BOT, LC[0] - HALF:LC[0]]
right = rgba[RC[1] - TOP:RC[1] + BOT, RC[0]:RC[0] + HALF]
out = np.concatenate([left, right], axis=1).copy()
h, w = out.shape[:2]; cx, cy = HALF, TOP
yy, xx = np.ogrid[:h, :w]
d = np.hypot(xx - cx, yy - cy)
out[d <= R + 2, 3] = 0                                   # 挖空球心
# 原图球框外侧连着血条的横梁：在球框外、两侧中段的横梁去掉，只留石像鬼和环
beam = (d > R + 34) & (np.abs(yy - cy) < 60) & (np.abs(xx - cx) > R + 34) & (np.abs(xx - cx) < R + 95)
# (不去横梁：半宽 270 内只有石像鬼和环)
lab2, n2 = ndimage.label(out[..., 3] > 0)
sizes = ndimage.sum(np.ones_like(lab2), lab2, range(1, n2 + 1))
out[~np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s > 400]), 3] = 0
img = Image.fromarray(out); bb = img.getbbox(); img = img.crop(bb)
img.save('dist/2d/art/hud-orb.webp', quality=92, method=6)
w2, h2 = img.size; ox, oy = cx - bb[0], cy - bb[1]
lay = {'w': w2, 'h': h2, 'orb': [round((ox - R - 3) / w2 * 100, 3), round((oy - R - 3) / h2 * 100, 3), round((2 * R + 6) / w2 * 100, 3), round((2 * R + 6) / h2 * 100, 3)]}
open('dist/2d/hud-orb-layout.js', 'w').write('/* 自动生成：scripts/2d-ui/build_orb.py */\nexport const HUD_ORB=' + json.dumps(lay) + ';\n')
print(img.size, lay)
