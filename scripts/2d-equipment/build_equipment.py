"""Build 2D equipment atlases + catalog module from the 黑铁遗珍 package.

Icons are re-cropped from the five original 1254x1254 sheets (the package's
pre-cut PNGs are offset by a row-fraction and clip item bottoms). All 500 records are shipped (100 per rarity).
"""
import json, os, sys
from PIL import Image
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from grid import cells_from

UP = os.environ.get('SHEETS_DIR', 'assets-source/2d/')  # 五张 1254x1254 原始图鉴：<名称>.webp
SHEETS = {'N': 'common', 'M': 'magic', 'E': 'epic', 'L': 'legendary', 'U': 'unique'}
OUT = os.environ.get('OUT_DIR', 'dist/2d')
CAT = json.load(open(os.environ.get('CATALOG_JSON', 'assets-source/2d/equipment_catalog_500.json')))['items']
CASTER = {'魔杖', '权杖', '法杖', '晶杖', '自然法杖', '骨杖'}
SLOT = {'头部': 'head', '肩部': 'shoulders', '胸部': 'robe', '手部': 'gloves', '腰部': 'belt', '脚部': 'boots',
        '主手': 'weapon', '双手': 'weapon', '副手': 'offhand', '箭袋': 'offhand', '项链': 'amulet', '戒指': 'ring1'}
RAR = 'NMELU'
ICON_W, ICON_H, COLS = 104, 88, 10


def usable(i):
    # v0.4.1：全部装备都可穿戴（为以后接入其他职业）
    return True


def detect(path):
    im = np.array(Image.open(path).convert('RGB')).astype(int)
    lum = im.max(axis=2)
    isline = (lum > 35) & (lum < 115)
    cols = None
    for y0 in range(60, 1200, 100):
        c = cells_from(isline[y0:y0 + 70, :].mean(axis=0))
        if len(c) == 10:
            cols = c
            break
    best = None
    for x0 in range(20, 1200, 124):
        r = cells_from(isline[:, x0:x0 + 90].mean(axis=1), thr=0.6, minw=50)
        if best is None or len(r) > len(best):
            best = r
    return cols, best


def row_boxes(code, rows):
    rows = list(rows)
    if code == 'E':  # 13 visual rows, the last two without frames
        rows = rows[:10] + [(1062, 1112), (1112, 1196), (1196, 1253)]
    return rows


# Special cell maps for rows where E/L/U sheets deviate from the catalog's
# 12-row assumption.  (row, col) are 1-based on the *visual* sheet.
def special(code):
    if code == 'E':
        return {'belt': [(11, c) for c in range(1, 8)], 'ring': [(12, 7), (12, 8), (12, 10)],
                'amulet': [(12, c) for c in range(1, 7)] + [(13, 1), (13, 2)],
                '法典': [(13, 7)], '符文书卷': [(13, 9)]}
    if code == 'L':
        b = [(10, c) for c in (7, 8, 9, 10)]
        return {'belt': b + b[:3], 'ring': [(11, 1), (11, 2), (11, 4)],
                'amulet': [(11, c) for c in range(6, 11)] + [(12, 1), (12, 2), (12, 3)],
                '法典': [(12, 5)], '符文书卷': [(12, 8)]}
    if code == 'U':
        return {'belt': [(11, c) for c in range(1, 8)], 'ring': [(12, 1), (12, 4), (12, 5)],
                'amulet': [(12, c) for c in range(6, 11)] + [(13, 1), (13, 2), (13, 3)],
                '法典': [(13, 8)], '符文书卷': [(13, 9)]}
    return {}


def fit(cell, bg):
    w, h = cell.size
    s = min(ICON_W / w, ICON_H / h, 1.25)
    cell = cell.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    out = Image.new('RGB', (ICON_W, ICON_H), bg)
    out.paste(cell, ((ICON_W - cell.width) // 2, (ICON_H - cell.height) // 2))
    return out


records = []
os.makedirs(OUT + '/art/equipment', exist_ok=True)
for ri, code in enumerate(RAR):
    path = UP + SHEETS[code] + '.webp'
    sheet = Image.open(path).convert('RGB')
    cols, rows = detect(path)
    rows = row_boxes(code, rows)
    assert len(cols) == 10 and len(rows) >= 12, (code, len(cols), len(rows))
    spec = special(code)
    counters = {}
    items = [i for i in CAT if i['rarity_code'] == code and usable(i)]
    items.sort(key=lambda i: (i['atlas_row'], i['atlas_col']))
    atlas = Image.new('RGB', (ICON_W * COLS, ICON_H * ((len(items) + COLS - 1) // COLS)), (10, 13, 19))
    for n, it in enumerate(items):
        key = 'belt' if it['slot'] == '腰部' else 'ring' if it['slot'] == '戒指' else 'amulet' if it['slot'] == '项链' else it['subtype'] if it['subtype'] in ('法典', '符文书卷') else None
        if key and key in spec:
            k = counters.get(key, 0)
            counters[key] = k + 1
            r, c = spec[key][k]
        else:
            r, c = it['atlas_row'], it['atlas_col']
        (x0, x1), (y0, y1) = cols[c - 1], rows[r - 1]
        cell = sheet.crop((x0 + 2, y0 + 2, x1 - 1, y1 - 1))
        bg = tuple(int(v) for v in np.median(np.array(cell)[:4].reshape(-1, 3), axis=0))
        atlas.paste(fit(cell, bg), ((n % COLS) * ICON_W, (n // COLS) * ICON_H))
        records.append({
            'id': it['id'], 'n': it['name'], 'r': ri, 's': SLOT[it['slot']], 'sub': it['subtype'],
            'h': 2 if it['slot'] == '双手' else 1, 'aff': it['affinity'], 'cls': it['preferred_class'],
            'eff': it['effect_name'] or '', 'desc': it['effect_description'] or '', 'cost': it['drawback'] or '',
            'lore': it['lore'] if code == 'U' else '', 'i': n,
        })
    atlas.save(f'{OUT}/art/equipment/{code}.webp', quality=88, method=6)
    print(code, len(items), atlas.size, os.path.getsize(f'{OUT}/art/equipment/{code}.webp'))

js = ('/* 自动生成：scripts/2d-equipment/build_equipment.py。黑铁遗珍装备库全部装备（每品质 100 件，共 500 件）。\n'
      ' * 字段：id 编号, n 名称, r 品质(0普通 1魔法 2史诗 3传奇 4暗金), s 装备槽, sub 类型, h 手数, aff 元素倾向, cls 偏好职业,\n'
      ' * eff/desc 传奇与暗金特效（设定文本）, cost 代价, lore 暗金传记, i 图集序号（art/equipment/<品质>.webp，10 列，104×88）。 */\n'
      'export const ICON_SIZE=Object.freeze({w:%d,h:%d,cols:%d});\n' % (ICON_W, ICON_H, COLS) +
      'export const CATALOG=Object.freeze(' + json.dumps(records, ensure_ascii=False, separators=(',', ':')) + '.map(Object.freeze));\n')
open(OUT + '/equipment-catalog.js', 'w').write(js)
print('records', len(records), 'js bytes', len(js.encode()))
