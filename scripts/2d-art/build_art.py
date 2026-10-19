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
cells = grid_cells(SRC + 'sheet-heroes-v2.webp', 7, 1)
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
groups = {'normal': sheet('normals', 6, 5, 104), 'caster': sheet('casters', 5, 5, 104),
          'elite': sheet('elites', 5, 5, 136), 'boss': sheet('bosses', 5, 4, 200)}
summons = sheet('summons', 5, 2, 112)
items = [(f'{g}{i}', im) for g, lst in groups.items() for i, (im, f) in enumerate(lst)] + [(f'summon{i}', im) for i, (im, f) in enumerate(summons)]
atlas, pos = pack(items, 2048)
atlas.save(OUT + 'art/monsters.webp', quality=92, method=6)
sprites = {k: list(pos[k]) + [f] for g, lst in groups.items() for i, (im, f) in enumerate(lst) for k in [f'{g}{i}']}
sprites.update({f'summon{i}': list(pos[f'summon{i}']) + [f] for i, (im, f) in enumerate(summons)})
js = ('/* 自动生成：scripts/2d-art/build_art.py。英雄分层（身体 + 武器）与怪物/召唤物图集坐标。 */\n'
      'export const HERO_RIG=' + json.dumps(rig, separators=(',', ':')) + ';\n'
      '// [x,y,w,h,footX] in art/monsters.webp\n'
      'export const SPRITES=' + json.dumps(sprites, separators=(',', ':')) + ';\n')
open(OUT + 'sprite-data.js', 'w').write(js)
print('heroes', Image.open(OUT + 'art/heroes.webp').size, 'monsters', atlas.size, os.path.getsize(OUT + 'art/monsters.webp'))
