"""装备图标样品（v1.4 试作）：程序化像素画，48×48 逻辑像素，放大 2 倍到 96×96，风格对齐现有图集（黑底、发光、像素描边）。
用法：python3 scripts/2d-art/draw_icon_samples.py 输出目录"""
import sys, math
import numpy as np
from PIL import Image, ImageFilter
S = 48

class Px:
    def __init__(s): s.a = np.zeros((S, S, 4), np.float32); s.glow = np.zeros((S, S, 3), np.float32)
    def put(s, x, y, c, a=1.0):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < S and 0 <= y < S: s.a[y, x, :3] = c; s.a[y, x, 3] = a
    def line(s, x0, y0, x1, y1, c, w=1):
        n = int(max(abs(x1 - x0), abs(y1 - y0)) * 2) + 1
        for i in range(n + 1):
            t = i / n; x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for dx in range(-(w // 2), w - w // 2):
                for dy in range(-(w // 2), w - w // 2): s.put(x + dx, y + dy, c)
    def disc(s, cx, cy, r, c, shade=None):
        for y in range(S):
            for x in range(S):
                d = math.hypot(x - cx, y - cy)
                if d <= r:
                    col = np.array(c, np.float32)
                    if shade is not None:      # 左上亮、右下暗的球体明暗
                        k = ((x - cx) * -.6 + (y - cy) * -.8) / max(r, 1); col = np.clip(col * (1 + .45 * k), 0, 255)
                    s.put(x, y, col)
    def ring(s, cx, cy, r, c, th=1.0):
        for y in range(S):
            for x in range(S):
                if abs(math.hypot(x - cx, y - cy) - r) <= th / 2 + .25: s.put(x, y, c)
    def poly(s, pts, c):
        from matplotlib.path import Path
        p = Path(pts); yy, xx = np.mgrid[:S, :S]; m = p.contains_points(np.c_[xx.ravel() + .5, yy.ravel() + .5]).reshape(S, S)
        s.a[m, :3] = c; s.a[m, 3] = 1
    def light(s, x, y, c, r=6, k=1.0):
        yy, xx = np.mgrid[:S, :S]; g = np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * r * r)) * k
        s.glow += g[..., None] * np.array(c, np.float32)[None, None, :]
    def outline(s, c=(10, 8, 6)):
        al = s.a[..., 3] > 0; grow = np.zeros_like(al)
        for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]: grow |= np.roll(np.roll(al, dy, 0), dx, 1)
        edge = grow & ~al; s.a[edge, :3] = c; s.a[edge, 3] = 1
    def sparkle(s, x, y, c):
        s.put(x, y, (255, 255, 255)); [s.put(x + dx, y + dy, c) for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]]
    def render(s, scale=2):
        img = np.zeros((S, S, 3), np.float32)
        img += s.glow * .55
        a = s.a[..., 3:4]; img = img * (1 - a) + s.a[..., :3] * a
        big = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).resize((S * scale, S * scale), Image.NEAREST)
        # 柔光：亮部再加一层模糊辉光
        glow = Image.fromarray(np.clip(s.glow, 0, 255).astype(np.uint8)).resize((S * scale, S * scale), Image.BILINEAR).filter(ImageFilter.GaussianBlur(5))
        out = np.clip(np.array(big, np.float32) + np.array(glow, np.float32) * .55, 0, 255).astype(np.uint8)
        return Image.fromarray(out)

GOLD, GOLD_D, WOOD, WOOD_D, BONE, BONE_D = (226, 178, 92), (140, 96, 42), (128, 84, 46), (78, 48, 26), (232, 222, 196), (150, 136, 110)

def shaft(p, x0, y0, x1, y1, c, cd):
    p.line(x0, y0, x1, y1, cd, 3); p.line(x0 - .6, y0 - .6, x1 - .6, y1 - .6, c, 1)

def arcane_staff():   # 法师 · 星辉晶杖
    p = Px(); shaft(p, 10, 44, 30, 18, GOLD, GOLD_D)
    for t in (.25, .5, .75): x, y = 10 + 20 * t, 44 - 26 * t; p.disc(x, y, 1.6, GOLD)
    p.ring(33, 13, 7.5, GOLD, 1.2); p.poly([(33, 3), (38, 13), (33, 24), (28, 13)], (90, 150, 255))
    p.poly([(33, 5), (35.5, 13), (33, 13)], (200, 230, 255)); p.light(33, 13, (80, 140, 255), 7, 1.4)
    for x, y in [(42, 6), (24, 5), (44, 20)]: p.sparkle(x, y, (140, 190, 255))
    p.outline(); return p

def bone_staff():     # 死灵 · 骸首骨杖
    p = Px(); shaft(p, 12, 45, 30, 19, BONE, BONE_D)
    for t in (.2, .45, .7): x, y = 12 + 18 * t, 45 - 26 * t; p.line(x - 2, y - 1, x + 2, y + 1, BONE_D, 1)
    p.disc(32, 13, 7, BONE, shade=True); p.poly([(27, 15), (37, 15), (35, 21), (29, 21)], BONE)
    p.disc(29.3, 12.8, 2.1, (30, 8, 44)); p.disc(34.7, 12.8, 2.1, (30, 8, 44)); p.put(29.3, 12.8, (220, 120, 255)); p.put(34.7, 12.8, (220, 120, 255))
    p.put(32, 16, (60, 40, 40)); p.put(32, 17, (60, 40, 40))
    for x in (29, 31, 33, 35): p.put(x, 19, (60, 46, 40)); p.put(x, 20, BONE_D)
    p.line(26, 9, 29, 7, (255, 250, 236), 1)
    p.line(25, 9, 21, 3, BONE_D, 2); p.line(39, 9, 43, 3, BONE_D, 2)
    p.light(32, 13, (150, 60, 255), 9, 1.2)
    for x, y in [(20, 14), (42, 18), (38, 27)]: p.put(x, y, (190, 110, 255))
    p.outline(); return p

def orb():            # 法师 · 奥术法球
    p = Px(); p.ring(24, 24, 15, GOLD_D, 1.4); p.ring(24, 24, 15, GOLD, .6)
    p.disc(24, 24, 11, (120, 70, 230), shade=True)
    for k in range(60):
        t = k / 60; a = t * 5.2; r = 2 + t * 8; p.put(24 + math.cos(a) * r, 24 + math.sin(a) * r, (70, 30, 160) if k % 2 else (175, 120, 255))
    p.disc(20, 19, 2.6, (225, 205, 255)); p.put(19, 18, (255, 255, 255))
    for k in range(8):
        a = k * math.pi / 4; x, y = 24 + math.cos(a) * 15, 24 + math.sin(a) * 15; p.disc(x, y, 1.4, GOLD)
    p.light(24, 24, (150, 90, 255), 12, 1.0)
    for x, y in [(8, 8), (40, 9), (41, 40)]: p.sparkle(x, y, (180, 150, 255))
    p.outline(); return p

def nature_staff():   # 德鲁伊 · 古藤自然杖
    p = Px(); shaft(p, 14, 45, 26, 16, WOOD, WOOD_D)
    for k in range(9):
        t = k / 8; x, y = 14 + 12 * t + math.sin(t * 9) * 2.2, 45 - 29 * t; p.put(x, y, (70, 150, 60))
    p.ring(28, 11, 6.5, WOOD, 1.6); p.poly([(28, 5), (31.5, 11), (28, 17), (24.5, 11)], (60, 220, 110)); p.put(27, 9, (210, 255, 220))
    for x, y, r in [(20, 6, 2.6), (36, 6, 2.4), (37, 16, 2.2), (19, 16, 2.0), (28, 2.5, 2.0)]: p.disc(x, y, r, (70, 160, 60), shade=True)
    p.light(28, 11, (60, 230, 110), 7, 1.3)
    for x, y in [(42, 10), (14, 9)]: p.sparkle(x, y, (140, 255, 160))
    p.outline(); return p

def scythe():         # 死灵 · 噬魂镰刀
    p = Px(); shaft(p, 13, 45, 33, 6, (60, 52, 66), (30, 24, 34))
    pts = [(33, 6), (24, 5), (14, 9), (8, 16), (13, 13), (21, 11), (31, 11)]
    p.poly(pts, (150, 156, 176)); p.poly([(33, 6), (24, 5), (14, 9), (8, 16), (14, 11), (23, 8), (31, 8)], (205, 210, 226)); p.line(15, 9.2, 31, 6.8, (250, 252, 255), 1)
    p.line(9, 15, 15, 11, (130, 70, 200), 1)
    p.disc(33, 8, 2.2, (150, 70, 230)); p.light(33, 8, (160, 70, 255), 6, 1.2); p.light(18, 10, (120, 140, 200), 8, .5)
    for x, y in [(40, 14), (6, 24)]: p.sparkle(x, y, (190, 140, 255))
    p.outline(); return p

def totem():          # 德鲁伊 · 兽骨图腾
    p = Px(); p.poly([(19, 14), (29, 14), (30, 42), (18, 42)], WOOD); p.line(19, 15, 19, 41, (160, 110, 64), 1)
    for y in (22, 30, 37): p.line(18, y, 30, y, WOOD_D, 1)
    for y in (33, 39): p.line(21, y, 27, y, (190, 140, 80), 1)
    p.poly([(20, 17), (28, 17), (26, 20), (22, 20)], (110, 70, 40))
    p.disc(24, 11, 6.5, BONE, shade=True); p.disc(21.6, 10.8, 1.8, (20, 16, 10)); p.disc(26.4, 10.8, 1.8, (20, 16, 10))
    p.put(21.6, 10.8, (90, 255, 150)); p.put(26.4, 10.8, (90, 255, 150)); p.line(24, 13, 24, 15, BONE_D, 1)
    p.line(18, 7, 12, 1, BONE_D, 2); p.line(30, 7, 36, 1, BONE_D, 2); p.line(14, 3, 11, 6, BONE_D, 1); p.line(34, 3, 37, 6, BONE_D, 1)
    for x, y in [(17, 25), (31, 25)]: p.line(x, y, x + (-5 if x < 24 else 5), y + 6, (190, 60, 50), 1)
    p.disc(24, 26, 2.2, (60, 220, 120)); p.light(24, 26, (60, 230, 120), 7, 1.0); p.light(24, 11, (120, 220, 140), 9, .4)
    p.outline(); return p

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    items = [('法杖 · 星辉晶杖', arcane_staff), ('骨杖 · 骸首骨杖', bone_staff), ('法球 · 奥术法球', orb),
             ('自然法杖 · 古藤杖', nature_staff), ('镰刀 · 噬魂镰刀', scythe), ('图腾 · 兽骨图腾', totem)]
    for i, (name, f) in enumerate(items):
        f().render().save(f'{out}/sample-{i + 1}.png')
    print('ok', len(items))
