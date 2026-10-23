"""归墟标志抠图（v0.9.2）：assets-source/2d/ui/logo-guixu.png（黑底）→ 透明底。
做法：
- 亮度 / 饱和度给出软透明度；
- 再用「闭运算 + 小孔填充」得到实体形状：字体、金属框里的暗部裂纹保持不透明（不会被抠空、显得发灰），
  只有外部黑底和大块暗漩涡雾气变透明；
- 边缘 0.8px 羽化，缩小后做一次锐化；另做一个只含「归墟 + GUIXU」的横版，用在顶栏。
用法：python3 scripts/2d-ui/build_logo.py
"""
import numpy as np, cv2
from PIL import Image, ImageFilter
from scipy import ndimage
a = np.array(Image.open('assets-source/2d/ui/logo-guixu.png').convert('RGB')).astype(np.float32)
lum = a.max(axis=2); sat = a.max(axis=2) - a.min(axis=2)
soft = np.clip((lum - 22) / 50, 0, 1)
soft = np.maximum(soft, np.clip((sat - 28) / 55, 0, 1) * np.clip((lum - 14) / 36, 0, 1))
core = lum > 52
solid = cv2.morphologyEx(core.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))) > 0
lab, n = ndimage.label(~solid)
sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
small = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s < 900])   # 字里的裂纹、小缝 → 实心
solid = solid | small
al = np.maximum(soft, cv2.GaussianBlur(solid.astype(np.float32), (0, 0), .8))
rgb = np.clip(a / np.maximum(al[..., None], .35), 0, 255)
out = Image.fromarray(np.dstack([rgb.astype(np.uint8), (al * 255).astype(np.uint8)]))
out = out.crop(out.getbbox())
def finish(im, maxw, path, pct):
    im = im.copy(); im.thumbnail((maxw, maxw), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=1.1, percent=pct, threshold=2)); im.save(path, quality=93, method=6); return im
w, h = out.size
full = finish(out, 900, 'dist/2d/art/logo-guixu.webp', 85)
text = finish(out.crop((int(w * .2), int(h * .24), int(w * .83), int(h * .7))), 480, 'dist/2d/art/logo-guixu-text.webp', 110)
ic = out.crop((int(w * .3), int(h * .2), int(w * .7), int(h * .2) + int(w * .4))).resize((128, 128), Image.LANCZOS); ic.save('dist/2d/art/logo-guixu-icon.webp')
print(full.size, text.size)
