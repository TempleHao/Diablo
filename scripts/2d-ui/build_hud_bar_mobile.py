"""手机状态条（v1.1.2）：用户给的效果图 assets-source/2d/ui/hud-bar-mobile.png（红球 + 生命条 + Lv 徽章 + 法力条 + 蓝球）。
输出：
- dist/2d/art/hud-bar-m.webp       框架（背景抠透明，两条槽涂暗，Lv 圆心抹掉文字）
- dist/2d/hud-bar-layout.js        各部件在框架里的位置（百分比）和两条的外形（多边形，填充用 CSS 渐变画）
用法：python3 scripts/2d-ui/build_hud_bar_mobile.py
"""
import json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage
src = np.array(Image.open('assets-source/2d/ui/hud-bar-mobile.png').convert('RGB'))
a = src.astype(int); r, g, b = a[..., 0], a[..., 1], a[..., 2]; lum = a.max(2)
X0, Y0, X1, Y1 = 26, 292, 1648, 612            # 画面范围（四周留一点给尖刺的光）
W, H = X1 - X0, Y1 - Y0

def bar_mask(col, x0, x1):
    m = np.zeros(lum.shape, bool); m[:, x0:x1] = col[:, x0:x1]
    m = ndimage.binary_closing(m, iterations=4); m = ndimage.binary_fill_holes(m)
    lab, n = ndimage.label(m); sizes = ndimage.sum(m, lab, range(1, n + 1)); m = lab == (1 + int(np.argmax(sizes)))
    # 条是规则的长六边形（一端尖），按外接框画多边形，数字一起包进来
    ys, xs = np.where(m); x0, x1, y0, y1 = xs.min() - 2, xs.max() + 2, ys.min() - 2, ys.max() + 2
    return (x0, y0, x1, y1)
def shape(box, pts):
    x0, y0, x1, y1 = box; w, h = x1 - x0, y1 - y0
    P = np.array([[x0 + px / 100 * w, y0 + py / 100 * h] for px, py in pts], np.int32)
    out = np.zeros(lum.shape, np.uint8); cv2.fillPoly(out, [P], 1)
    return ndimage.binary_dilation(out > 0, iterations=2)
HP_PTS = [[1.5, 0], [94, 0], [100, 50], [94, 100], [1.5, 100], [0, 50]]
MP_PTS = [[6, 0], [98.5, 0], [100, 50], [98.5, 100], [6, 100], [0, 50]]
red = (r > 90) & (r > g * 1.8) & (r > b * 1.8)
blue = (b > 90) & (b > r * 1.6)
hpB, mpB = bar_mask(red, 290, 745), bar_mask(blue, 925, 1385)
hpM, mpM = shape(hpB, HP_PTS), shape(mpB, MP_PTS)

def box_pct(bx):
    x0, y0, x1, y1 = bx
    return dict(l=(x0 - X0) / W * 100, t=(y0 - Y0) / H * 100, w=(x1 - x0) / W * 100, h=(y1 - y0) / H * 100)
hpBox, mpBox, hpPoly, mpPoly = box_pct(hpB), box_pct(mpB), HP_PTS, MP_PTS
L = {'hp': hpBox, 'mp': mpBox}
# 框架：槽涂成暗色，Lv 圆心抹平
fr = src.copy().astype(np.float32)
for m, top, bot in [(hpM, (40, 10, 10), (12, 3, 3)), (mpM, (10, 14, 40), (3, 4, 12))]:
    ys, xs = np.where(m); t = ((np.arange(fr.shape[0]) - ys.min()) / max(1, ys.max() - ys.min())).clip(0, 1)[:, None]
    col = np.array(top)[None, :] * (1 - t) + np.array(bot)[None, :] * t
    fr[m] = col[np.where(m)[0]]
cx, cy, rr = 835, 458, 57
yy, xx = np.mgrid[:fr.shape[0], :fr.shape[1]]; d = np.hypot(xx - cx, yy - cy)
disc = d < rr
fr[disc] = (np.array([20, 16, 12]) * (1 - (d[disc] / rr) * .5)[:, None])
# 背景抠透明：与边缘相连的暗像素
bg = lum < 34
lab, n = ndimage.label(bg); edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bgm = np.isin(lab, list(edge))
# 两条槽和金属轨之间的暗缝会从尖端连到外面，强制把整段条身保持不透明
bgm[hpB[1] - 20:hpB[3] + 20, hpB[0] - 18:mpB[2] + 18] = False
alpha = cv2.GaussianBlur((~bgm).astype(np.float32), (0, 0), .8)
out = np.dstack([np.clip(fr, 0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])[Y0:Y1, X0:X1]
Image.fromarray(out).save('dist/2d/art/hud-bar-m.webp', quality=90, method=6)
L['lv'] = dict(l=(cx - rr - X0) / W * 100, t=(cy - rr - Y0) / H * 100, w=2 * rr / W * 100, h=2 * rr / H * 100)
L['aspect'] = W / H
L = {k: ({kk: round(float(vv), 3) for kk, vv in v.items()} if isinstance(v, dict) else round(float(v), 4)) for k, v in L.items()}
L['hpPoly'], L['mpPoly'] = hpPoly, mpPoly
open('dist/2d/hud-bar-layout.js', 'w').write('/* 自动生成：scripts/2d-ui/build_hud_bar_mobile.py。手机状态条各部件位置（占框架的百分比）。 */\nexport const HUD_BAR_M=Object.freeze(' + json.dumps(L, separators=(',', ':')) + ');\n')
print(L)
