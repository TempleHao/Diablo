"""v1.2 选角立绘：每个职业一张独立的高清透明立绘（assets-source/2d/ui/select-v2/<职业>.png）。
- 清边：原图人物本身不透明度只有 252、边缘一圈半透明像素带红 / 黄杂色（抠图残留）。人物内部补成完全不透明；
  边缘的颜色换成向内最近的实心像素颜色，透明度收紧一点，去掉杂边；
- 裁掉四周透明边，高度超过 1100 像素的缩到 1100（手机 3 倍屏也够清楚），导出 dist/2d/art/select/<职业>.webp；
- 记录宽高和脚底中心（最下面 4% 不透明像素的水平中心），写入 dist/2d/select-art.js 的 SELECT_HD。
以后有更清晰的图：同名替换 select-v2 里的 PNG，再运行 python3 scripts/2d-ui/build_select_hd.py。
"""
import json, os
import numpy as np, cv2
from PIL import Image
from scipy import ndimage
MAX_H = 1100
ORDER = ['barbarian', 'amazon', 'assassin', 'paladin', 'necro', 'druid', 'mage']
out = {}
for c in ORDER:
    im = Image.open(f'assets-source/2d/ui/select-v2/{c}.png').convert('RGBA')
    arr = np.array(im).astype(np.float32); al = arr[..., 3]
    al = np.clip((al - 50) / (235 - 50), 0, 1)                       # 收紧边缘、内部补满
    solid = al > .97
    _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
    rgb = arr[..., :3]; edge = (al > 0) & ~solid
    rgb[edge] = rgb[iy[edge], ix[edge]]                               # 杂边换成最近实心像素的颜色
    al = cv2.GaussianBlur(al, (0, 0), .6) * (al > 0)
    im = Image.fromarray(np.dstack([rgb, al * 255]).astype(np.uint8))
    a = np.array(im)[..., 3]; ys, xs = np.nonzero(a > 12)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)); a = np.array(im)[..., 3]
    if im.height > MAX_H: im = im.resize((round(im.width * MAX_H / im.height), MAX_H), Image.LANCZOS); a = np.array(im)[..., 3]
    h, w = a.shape; band = a[int(h * .96):] > 40; fx = float(np.nonzero(band)[1].mean()) if band.any() else w / 2
    im.save(f'dist/2d/art/select/{c}.webp', quality=90, method=6)
    out[c] = [w, h, round(fx / w, 3)]
    print(c, w, h, round(fx / w, 3), os.path.getsize(f'dist/2d/art/select/{c}.webp'))
js = ('/* 自动生成：scripts/2d-ui/build_select_hd.py。选角高清立绘：[宽, 高, 脚底中心占宽度的比例]。 */\n'
      'export const SELECT_HD=Object.freeze(' + json.dumps(out, separators=(',', ':')) + ');\n')
open('dist/2d/select-art.js', 'w').write(js)
