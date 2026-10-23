"""登录页背景：用选角背景（城堡夜景，横版 3.1:1）做一张上沿渐隐的版本。
登录页把它贴在屏幕下方，上面是和标志同色系的星空渐变；上沿渐隐后两者之间没有接缝。
用法：python3 scripts/2d-ui/build_login_bg.py
"""
import numpy as np
from PIL import Image
im = Image.open('dist/2d/art/select-bg.webp').convert('RGBA')
a = np.array(im).astype(np.float32); h = a.shape[0]
t = np.clip(np.arange(h, dtype=np.float32) / (h * .42), 0, 1); t = t * t * (3 - 2 * t)
a[..., 3] *= t[:, None]
Image.fromarray(a.astype(np.uint8)).save('dist/2d/art/login-bg.webp', quality=88, method=6)
print(im.size)
