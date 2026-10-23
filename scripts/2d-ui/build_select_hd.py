"""v1.2 选角立绘：每个职业一张独立的高清透明立绘（assets-source/2d/ui/select-v2/<职业>.png）。
- 裁掉四周透明边，原始分辨率导出 dist/2d/art/select/<职业>.webp（不放大）；
- 记录宽高和脚底中心（最下面 4% 不透明像素的水平中心），写入 dist/2d/select-art.js 的 SELECT_HD。
以后有更清晰的图：同名替换 select-v2 里的 PNG，再运行 python3 scripts/2d-ui/build_select_hd.py。
"""
import json, os
import numpy as np
from PIL import Image
ORDER = ['barbarian', 'amazon', 'assassin', 'paladin', 'necro', 'druid', 'mage']
out = {}
for c in ORDER:
    im = Image.open(f'assets-source/2d/ui/select-v2/{c}.png').convert('RGBA')
    a = np.array(im)[..., 3]; ys, xs = np.nonzero(a > 12)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)); a = np.array(im)[..., 3]
    h, w = a.shape; band = a[int(h * .96):] > 40; fx = float(np.nonzero(band)[1].mean()) if band.any() else w / 2
    im.save(f'dist/2d/art/select/{c}.webp', quality=92, method=6, exact=True)
    out[c] = [w, h, round(fx / w, 3)]
    print(c, w, h, round(fx / w, 3), os.path.getsize(f'dist/2d/art/select/{c}.webp'))
js = ('/* 自动生成：scripts/2d-ui/build_select_hd.py。选角高清立绘：[宽, 高, 脚底中心占宽度的比例]。 */\n'
      'export const SELECT_HD=Object.freeze(' + json.dumps(out, separators=(',', ':')) + ');\n')
open('dist/2d/select-art.js', 'w').write(js)
