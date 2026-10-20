"""Build hero rig, monster and summon atlases from the source sheets in assets-source/2d/.
Run from repo root:  python3 scripts/2d-art/build_art.py
"""
import os, sys, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from sprites import grid_cells

SRC = 'assets-source/2d/'
OUT = 'dist/2d/'

def pack(items, max_w=2048):
    """Shelf pack list of (key, Image) -> atlas Image, {key:(x,y,w,h)}"""
    items = sorted(items, key=lambda t: -t[1].height)
    x = y = shelf = 0; pos = {}
    for k, im in items:
        if x + im.width > max_w:
            x = 0; y += shelf + 2; shelf = 0
        pos[k] = (x, y, im.width, im.height); x += im.width + 2; shelf = max(shelf, im.height)
    atlas = Image.new('RGBA', (max_w, y + shelf))
    for k, im in items: atlas.paste(im, pos[k][:2])
    return atlas, pos

# ───── heroes: body + weapon layers ─────
HERO_ORDER = ['amazon', 'assassin', 'barbarian', 'druid', 'necro', 'paladin']
RIG = {  # source-pixel rects (x0,y0,x1,y1) on the cut sprite, grip pivot, swing style, art facing
    'amazon':    dict(rects=[(178, 0, 238, 212)], pivot=(198, 206), style='thrust', face=1),
    'assassin':  dict(rects=[(176, 158, 248, 252)], rects2=[(0, 158, 76, 270)], pivot=(184, 172), pivot2=(66, 172), style='claws', face=1),
    'barbarian': dict(rects=[(168, 16, 280, 322)], pivot=(196, 168), style='chop', face=1),
    'druid':     dict(rects=[(198, 14, 292, 300), (232, 300, 292, 402)], pivot=(215, 215), style='staff', face=1),
    'necro':     dict(rects=[(168, 0, 257, 240), (186, 240, 218, 412)], pivot=(200, 225), style='staff', face=1),
    'paladin':   dict(rects=[(0, 0, 104, 206)], pivot=(62, 178), style='smash', face=-1),
}
cells0 = grid_cells(SRC + 'sheet-heroes-v2.webp', 7, 1)
# v0.7.1：放宽裁切窗口，收回越过网格线的部分（野蛮人左臂、德鲁伊和死灵法师的边缘）。
# RIG 里的坐标按旧裁切写的，这里按新旧原点差平移。
cells = grid_cells(SRC + 'sheet-heroes-v2.webp', 7, 1, grow=60)
for i, cls in enumerate(HERO_ORDER):
    dx = cells0[i][0].info['ox'] - cells[i][0].info['ox']; dy = cells0[i][0].info['oy'] - cells[i][0].info['oy']
    r = RIG[cls]
    for key in ('rects', 'rects2'):
        if key in r: r[key] = [(x0 + dx, y0 + dy, x1 + dx, y1 + dy) for x0, y0, x1, y1 in r[key]]
    for key in ('pivot', 'pivot2'):
        if key in r: r[key] = (r[key][0] + dx, r[key][1] + dy)
    print(cls, 'shift', dx, dy)
H = max(cells[i][0].height for i in range(6))
S = 200 / H
bodies, weapons, rig = [], [], {}
def mask_of(im, rects):
    m = np.zeros((im.height, im.width), bool)
    for x0, y0, x1, y1 in rects: m[y0:y1, x0:x1] = True
    return m & (np.array(im)[..., 3] > 0)
for i, cls in enumerate(HERO_ORDER):
    im, foot = cells[i]; r = RIG[cls]
    a = np.array(im)
    m1 = mask_of(im, r['rects']); m2 = mask_of(im, r.get('rects2', []))
    body = a.copy(); body[m1 | m2, 3] = 0
    w1 = a.copy(); w1[~m1, 3] = 0
    w2 = a.copy(); w2[~m2, 3] = 0
    size = (max(1, round(im.width * S)), max(1, round(im.height * S)))
    sc = lambda arr: Image.fromarray(arr).resize(size, Image.NEAREST)
    bodies.append((cls, sc(body))); weapons.append((cls, sc(w1)))
    if m2.any(): weapons.append((cls + '_2', sc(w2)))
    rig[cls] = dict(w=size[0], h=size[1], foot=round(foot * S), px=round(r['pivot'][0] * S), py=round(r['pivot'][1] * S),
                    style=r['style'], face=r['face'])
    if 'pivot2' in r: rig[cls].update(px2=round(r['pivot2'][0] * S), py2=round(r['pivot2'][1] * S))
    # weapon tip: opaque weapon pixel farthest from the grip (used for impact flashes and trails)
    ys, xs = np.nonzero(m1)
    if len(xs):
        d = (xs - r['pivot'][0]) ** 2 + (ys - r['pivot'][1]) ** 2; k = int(np.argmax(d))
        rig[cls].update(tx=round(xs[k] * S), ty=round(ys[k] * S))
# mage keeps the previous white mage cell
old = Image.open(OUT + 'art/heroes.webp') if os.path.exists(OUT + 'art/heroes-mage.webp') is False else None
mage = Image.open(OUT + 'art/heroes-mage.webp') if os.path.exists(OUT + 'art/heroes-mage.webp') else old.crop((6 * 190, 0, 7 * 190, 200))
mage.save(OUT + 'art/heroes-mage.webp', lossless=True)
bodies.append(('mage', mage)); rig['mage'] = dict(w=190, h=200, foot=95, px=0, py=0, style='mage', face=-1)
atlas, pos = pack(bodies + [('w_' + k, v) for k, v in weapons], 1024)
atlas.save(OUT + 'art/heroes.webp', lossless=True)
for cls in rig:
    rig[cls]['body'] = pos[cls]
    if 'w_' + cls in pos: rig[cls]['weapon'] = pos['w_' + cls]
    if 'w_' + cls + '_2' in pos: rig[cls]['weapon2'] = pos['w_' + cls + '_2']

# ───── monsters & summons ─────
def sheet(name, cols, rows, height):
    out = []
    for c in grid_cells(SRC + 'sheet-' + name + '.webp', cols, rows):
        im, foot = c; s = height / im.height
        out.append((im.resize((max(1, round(im.width * s)), height), Image.LANCZOS), round(foot * s)))
    return out
# v0.8：怪物改用用户动效包里的原画裁切（assets-source/2d/monsters-v08，比旧图集清晰得多）。
# 同一档位按统一比例缩放（保留体型差：蝙蝠、老鼠比骷髅小），去掉相邻怪物残留的小碎块。
from scipy import ndimage
def clean(im):
    a = np.array(im.convert('RGBA')); m = a[..., 3] > 20
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=3))
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1)); keep = np.zeros_like(m)
        big = int(np.argmax(sizes)) + 1; bottom = np.nonzero(lab == big)[0].max()
        for i, sz in enumerate(sizes):
            ys = np.nonzero(lab == i + 1)[0]
            if ys.min() >= bottom - 4 and i + 1 != big: continue  # 主体脚下的碎块（相邻格子残留）
            if sz >= sizes.max() * .06: keep |= lab == i + 1
        a[~keep, 3] = 0
    im = Image.fromarray(a); bb = im.getbbox(); return im.crop(bb)
def foot_of(im):
    a = np.array(im)[..., 3] > 20; h = a.shape[0]; hb = max(4, int(h * .08))
    cols = np.nonzero(a[h - hb:])[1]; return int(np.median(cols)) if len(cols) else im.width // 2
MV = SRC + 'monsters-v08/'
man = json.load(open(MV + 'manifest.json'))['monsters']
CAT = {'普通怪': ('normal', 6, 128), '魔法怪': ('caster', 5, 128), '精英怪': ('elite', 5, 160), 'Boss': ('boss', 5, 240)}
groups = {g: [None] * 30 for g, _, _ in CAT.values()}
raw = {}
for m in man:
    g, cols, target = CAT[m['category']]
    raw.setdefault(g, []).append((m['grid'][1] * cols + m['grid'][0], m['id'], clean(Image.open(MV + m['id'] + '.webp'))))
PID = {}
for g, lst in raw.items():
    target = next(t for gg, _, t in CAT.values() if gg == g)
    med = float(np.median([im.height for _, _, im in lst])); s = target / med
    for idx, pid, im in lst:
        im2 = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        groups[g][idx] = (im2, foot_of(im2)); PID[f'{g}{idx}'] = pid
for g in groups: groups[g] = [x for x in groups[g] if x]
summons = sheet('summons', 5, 2, 140)
items = [(f'{g}{i}', im) for g, lst in groups.items() for i, (im, f) in enumerate(lst)] + [(f'summon{i}', im) for i, (im, f) in enumerate(summons)]
atlas, pos = pack(items, 2048)
atlas.save(OUT + 'art/monsters.webp', quality=85, method=6)
sprites = {k: list(pos[k]) + [f] for g, lst in groups.items() for i, (im, f) in enumerate(lst) for k in [f'{g}{i}']}
sprites.update({f'summon{i}': list(pos[f'summon{i}']) + [f] for i, (im, f) in enumerate(summons)})
js = ('/* 自动生成：scripts/2d-art/build_art.py。英雄分层（身体 + 武器）与怪物/召唤物图集坐标。 */\n'
      'export const HERO_RIG=' + json.dumps(rig, separators=(',', ':')) + ';\n'
      '// [x,y,w,h,footX] in art/monsters.webp\n'
      'export const SPRITES=' + json.dumps(sprites, separators=(',', ':')) + ';\n'
      '// 贴图键 → 动效包怪物编号（N001…B020），以后换成逐帧动作表时按这个编号对应\n'
      'export const MONSTER_PID=' + json.dumps(PID, separators=(',', ':')) + ';\n')
open(OUT + 'sprite-data.js', 'w').write(js)
print('heroes', Image.open(OUT + 'art/heroes.webp').size, 'monsters', atlas.size, os.path.getsize(OUT + 'art/monsters.webp'))
