"""归墟 VORAGH 标志（v1.1）：assets-source/2d/ui/logo-voragh.png（黑底横版，蓝紫星空风）→ 透明底。
- 黑底 → 透明：亮度 + 饱和度给出软透明度，星云边缘自然渐隐；
- 字体、金属框和亮部保持实心（闭运算 + 小孔填充），不会被抠空发灰；
- 四周纯黑留白裁掉；大图给选角 / 登录 / 开场，另导出顶栏小图（字和 VORAGH 为主，裁掉两侧星云）与圆形图标。
用法：python3 scripts/2d-ui/build_logo.py
"""
import numpy as np, cv2
from PIL import Image, ImageFilter, ImageDraw
from scipy import ndimage
a = np.array(Image.open('assets-source/2d/ui/logo-voragh.png').convert('RGB')).astype(np.float32)
H, W = a.shape[:2]
lum = a.max(axis=2); sat = a.max(axis=2) - a.min(axis=2)
soft = np.clip((lum - 14) / 60, 0, 1) ** .9
soft = np.maximum(soft, np.clip((sat - 24) / 70, 0, 1) * np.clip((lum - 10) / 40, 0, 1))
core = lum > 70
solid = cv2.morphologyEx(core.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) > 0
lab, n = ndimage.label(~solid); sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
solid |= np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s < 700])
al = np.maximum(soft, cv2.GaussianBlur(solid.astype(np.float32), (0, 0), .8))
rgb = np.clip(a / np.maximum(al[..., None], .3), 0, 255)
full = Image.fromarray(np.dstack([rgb.astype(np.uint8), (al * 255).astype(np.uint8)]))
bb = Image.fromarray(((al > .06) * 255).astype(np.uint8)).getbbox(); full = full.crop(bb)
def finish(im, maxw, path, pct=90):
    im = im.copy(); im.thumbnail((maxw, maxw), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=pct, threshold=2)); im.save(path, quality=93, method=6); return im
w, h = full.size
big = finish(full, 1200, 'dist/2d/art/logo-voragh.webp')
# 顶栏：只留中间「归墟 + VORAGH」，星云压暗、只留亮部，缩小后不会糊成一块
soft2 = np.clip((lum - 55) / 70, 0, 1)
al2 = np.maximum(soft2 * .9, cv2.GaussianBlur(solid.astype(np.float32), (0, 0), .8))
rgb2 = np.clip(a / np.maximum(al2[..., None], .3), 0, 255)
lite = Image.fromarray(np.dstack([rgb2.astype(np.uint8), (al2 * 255).astype(np.uint8)])).crop(bb)
mid = lite.crop((int(w * .2), 0, int(w * .8), h)); mid = mid.crop(Image.fromarray((np.array(mid)[..., 3] > 40).astype(np.uint8) * 255).getbbox())
sm = finish(mid, 340, 'dist/2d/art/logo-voragh-sm.webp', 120)
# 图标：中间的「归墟」两字区域做成圆形
ic = full.crop((int(w * .32), int(h * .02), int(w * .68), int(h * .02) + int(w * .36))).resize((128, 128), Image.LANCZOS)
bg = Image.new('RGBA', (128, 128), (10, 8, 22, 255)); bg.alpha_composite(ic)
m = Image.new('L', (128, 128), 0); ImageDraw.Draw(m).ellipse((0, 0, 127, 127), fill=255); bg.putalpha(m); bg.save('dist/2d/art/logo-voragh-icon.webp')
print('big', big.size, 'small', sm.size)
