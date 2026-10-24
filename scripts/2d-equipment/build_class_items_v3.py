"""v1.7：第三批职业装备图（中国风，assets-source/2d/equipment-v3/<职业>.png）= 东土遗物。
输出：
- dist/2d/art/equipment/C3-<职业>.webp（96×96，10 列）
- dist/2d/class-catalog-v3.js：
    CLASS_BASES_V3  东土基底（普通 / 魔法 / 史诗），只属于该职业；
    EAST_NAMED      东土传奇 / 暗金：每一件西境传奇 / 暗金都对应一件东土的（同品质、品级、天赋树），换成中国风图标，
                    名字由 scripts/2d-naming/build_names.py 取东土名器或古代英雄。这样每个职业的传奇暗金东西各半。
用法：python3 scripts/2d-equipment/build_class_items_v3.py [检查图输出目录]"""
import json, os, re, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '2d-art'))
from grid_icons import lum
from grid_v3 import split_rows
from build_class_items import crop_icon, CNAME

SRC = 'assets-source/2d/equipment-v3/'
BW = 96
W = lambda sub: ('weapon', sub)
O = lambda sub: ('offhand', sub)
ARM = [('head', '头盔'), ('robe', '胸甲'), ('gloves', '手套'), ('boots', '靴子'), ('belt', '腰带')]
JEW = 'jewel'   # 首饰行：前 5 个戒指，其余项链
SPEC = {
 'paladin': ([12, 12, 13, 11, 12, 12, 12, 12, 10, 14], [W('长剑'), O('骑士盾'), O('宝灯'), O('经卷')] + ARM + [JEW],
             {(0, c): W('权杖') for c in (5, 7, 8, 9, 10, 11)}),
 'assassin': ([12, 10, 12, 12, 11, 12, 12, 10, 14], [W('短剑'), W('镰刀'), W('投掷刀')] + ARM + [JEW],
              {**{(0, c): W('拳刃') for c in (4, 6, 7)}, **{(1, c): W('铁扇') for c in (1, 4, 9)}, (1, 3): W('拳刃'), (1, 7): W('投掷刀'),
               (2, 7): O('毒瓶'), (2, 8): O('毒瓶'), (2, 9): O('毒瓶'), (2, 10): W('铁扇')}),
 'druid': ([12, 10, 10, 10, 10, 10, 11, 10, 13], [W('自然法杖'), O('图腾'), O('符文书卷')] + ARM + [JEW], {}),
 'barbarian': ([11, 12, 12, 11, 11, 11, 11, 10, 14], [W('双手斧'), W('重锤'), ('head', '头盔'), ('shoulders', '护肩'),
               ('robe', '胸甲'), ('gloves', '手套'), ('boots', '靴子'), ('belt', '腰带'), JEW],
               {(0, c): W('大刀') for c in (0, 1, 2, 3)}),
 'necro': ([12, 13, 12, 12, 10, 12, 12, 10, 13], [W('骨杖'), O('魂灯'), O('法典')] + ARM + [JEW], {(0, c): W('镰刀') for c in (4, 8, 9)}),
 'mage': ([12, 10, 12, 12, 10, 10, 12, 10, 10, 14], [W('法杖'), O('羽扇'), O('法球'), O('法典')] + ARM + [JEW], {}),
 'amazon': ([12, 11, 11, 12, 12, 11, 12, 12, 10, 15], [W('长枪'), W('长弓'), O('箭囊'), O('轻盾')] + ARM + [JEW], {}),
}
TWO = {'大刀', '双手斧', '重锤', '长枪', '长弓', '骨杖', '法杖', '自然法杖', '镰刀'}
BY_CN = {v: k for k, v in CNAME.items()}


def load(path, var):
    s = open(path, encoding='utf-8').read()
    return json.loads(re.search(var + r'=Object\.freeze\((\[.*?\])(?:\.map\(Object\.freeze\))?\);', s, re.S).group(1))


def main():
    check = sys.argv[1] if len(sys.argv) > 1 else None
    bases, icons_by = [], {}
    for cls, (counts, rows_spec, cell) in SPEC.items():
        path = SRC + cls + '.png'; img = Image.open(path).convert('RGB')
        rows = split_rows(lum(path), counts)
        icons = []
        for r, row in enumerate(rows):
            for c, box in enumerate(row):
                if rows_spec[r] == JEW: slot, sub = ('ring1', '戒指') if c < 5 else ('amulet', '项链')
                else: slot, sub = cell.get((r, c), rows_spec[r])
                q = max(1, round(1 + c * 95 / max(1, len(row) - 1)))
                e = {'id': f'CB3-{cls}-{r:02d}{c:02d}', 's': slot, 'sub': sub, 'h': 2 if sub in TWO else 1, 'cls': CNAME[cls],
                     'a': 'C3-' + cls, 'i': len(icons), 'q': q, 'row': r, 'o': 'e'}
                bases.append(e); icons_by.setdefault(cls, []).append(e)
                icons.append(crop_icon(img, box, BW))
        cols = 10
        atlas = Image.new('RGB', (BW * cols, BW * ((len(icons) + cols - 1) // cols)), (0, 0, 0))
        for i, im in enumerate(icons): atlas.paste(im, ((i % cols) * BW, (i // cols) * BW))
        atlas.save(f'dist/2d/art/equipment/C3-{cls}.webp', quality=86, method=6)
        if check:
            d = ImageDraw.Draw(atlas); f = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 13)
            for e in icons_by[cls]: d.text(((e['i'] % cols) * BW + 2, (e['i'] // cols) * BW + 80), e['sub'], fill='yellow', font=f)
            atlas.save(f'{check}/C3-{cls}.png')
        print(cls, len(icons))
    # 东土传奇 / 暗金：逐件对应西境传奇 / 暗金
    old = load('dist/2d/equipment-catalog.js', 'CATALOG'); legs = load('dist/2d/class-catalog.js', 'CLASS_LEGENDS')
    west = [e for e in old if e['r'] >= 3] + [dict(e, r=3) for e in legs]
    used = {}
    east = []
    for w in west:
        cls = w.get('owner') or BY_CN.get(w.get('cls'))
        pool_cls = cls or ['amazon', 'assassin', 'barbarian', 'druid', 'necro', 'paladin', 'mage'][len(east) % 7]
        cand = [b for b in icons_by[pool_cls] if b['s'] == w['s']]
        if not cand:   # 这个职业的中国风图里没有这个部位（如野蛮人的盾）：换成图里件数最多、用得最少的部位
            slots = {}
            for b in icons_by[pool_cls]: slots.setdefault(b['s'], []).append(b)
            s = min(slots, key=lambda k: (sum(used.get(b['id'], 0) for b in slots[k]) / len(slots[k])))
            cand = slots[s]
        b = min(cand, key=lambda b: (used.get(b['id'], 0), b['i']))
        used[b['id']] = used.get(b['id'], 0) + 1
        e = {k: v for k, v in w.items() if k not in ('n', 'desc', 'lore', 'eff', 'cost', 'i', 'a')}
        e.update({'id': 'CE-' + w['id'], 's': b['s'], 'sub': b['sub'], 'h': b['h'], 'a': b['a'], 'i': b['i'], 'o': 'e', 'twin': w['id']})
        east.append(e)
    js = ('/* 自动生成：scripts/2d-equipment/build_class_items_v3.py（第三批中国风职业装备图 = 东土遗物）。o:"e" 东土。 */\n'
          'export const CLASS_BASES_V3=Object.freeze(' + json.dumps(bases, ensure_ascii=False, separators=(',', ':')) + '.map(Object.freeze));\n'
          'export const EAST_NAMED=Object.freeze(' + json.dumps(east, ensure_ascii=False, separators=(',', ':')) + '.map(Object.freeze));\n')
    open('dist/2d/class-catalog-v3.js', 'w', encoding='utf-8').write(js)
    print('bases', len(bases), 'east named', len(east))


if __name__ == '__main__':
    main()
