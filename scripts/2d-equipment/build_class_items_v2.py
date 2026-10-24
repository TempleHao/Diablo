"""v1.6：第二批七职业装备图（assets-source/2d/equipment-v2/<职业>.png，用户提供）。
切成 dist/2d/art/equipment/C2-<职业>.webp（96×96，10 列），记录写入 dist/2d/class-catalog-v2.js。
每一件都只属于该职业（和第一批 C-* 一样）。名字由 naming.js 按东土 / 西境词库生成，这里只给类型和部位。
用法：python3 scripts/2d-equipment/build_class_items_v2.py [--sheet 输出检查图]"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '2d-art'))
from grid_icons import split, lum
sys.path.insert(0, os.path.dirname(__file__))
from build_class_items import crop_icon, CNAME, TWO_HAND
SRC = 'assets-source/2d/equipment-v2/'
BW = 96
G = lambda slot, sub: (slot, sub)
ARM = [G('head', '头盔'), G('robe', '胸甲'), G('gloves', '手套'), G('boots', '靴子'), G('belt', '腰带'), G('ring1', '戒指'), G('amulet', '项链')]
SPEC = {
 'assassin': ([12] * 11, [G('weapon', '拳刃'), G('weapon', '短剑'), G('weapon', '投掷刀'), G('offhand', '毒瓶')] + ARM),
 'paladin': ([11, 11, 10, 10, 10, 10, 10, 10, 10, 11], [G('weapon', '钉锤'), G('weapon', '长剑'), G('offhand', '骑士盾')] + ARM),
 'druid': ([10, 10, 10, 10, 10, 11, 11, 10, 12, 12], [G('weapon', '自然法杖'), G('weapon', '自然法杖'), G('offhand', '符文书卷')] + ARM),
 'barbarian': ([12] * 10, [G('weapon', '双手斧'), G('weapon', '长剑'), G('offhand', '战盾')] + ARM),
 'amazon': ([11, 11, 10, 10, 10, 10, 10, 10, 10, 10, 11], [G('weapon', '长枪'), G('weapon', '长弓'), G('offhand', '箭囊'), G('offhand', '鸢盾')] + ARM),
 'necro': ([12] * 11, [G('weapon', '骨杖'), G('weapon', '短剑'), G('offhand', '法典'), G('head', '头盔')] + ARM),
 'mage': ([10] * 11, [G('weapon', '法杖'), G('weapon', '魔杖'), G('offhand', '法典'), G('offhand', '法球')] + ARM),
}
# 单格例外（行, 列）→ 类型
CELL = {
 'assassin': {(2, 8): '轻弩', (2, 9): '轻弩', (2, 10): '轻弩'},
 'paladin': {(0, 0): '重锤', (0, 2): '重锤', (0, 4): '重锤', (0, 6): '重锤', (0, 7): '链锤', (0, 9): '链锤', (0, 10): '链锤'},
 'barbarian': {(0, 2): '重锤', (0, 8): '重锤', (1, 9): '重锤', (1, 10): '战斧'},
 'necro': {(0, 4): '镰刀', (0, 6): '镰刀', (0, 9): '镰刀', (0, 11): '镰刀'},
}

def main():
    sheet_out = '--sheet' in sys.argv
    items = []
    for cls, (counts, rows_spec) in SPEC.items():
        path = SRC + cls + '.png'
        a = lum(path); img = Image.open(path).convert('RGB')
        rows = split(a, counts, top=64)
        assert len(rows) == len(rows_spec), (cls, len(rows), len(rows_spec))
        icons = []
        for r, row in enumerate(rows):
            slot, sub = rows_spec[r]
            n = len(row)
            for c, box in enumerate(row):
                assert box, (cls, r, c)
                s2 = CELL.get(cls, {}).get((r, c), sub)
                q = max(1, round(1 + c * 95 / max(1, n - 1)))
                items.append({'id': f'CB2-{cls}-{r:02d}{c:02d}', 's': slot, 'sub': s2, 'h': 2 if s2 in TWO_HAND else 1, 'cls': CNAME[cls],
                              'a': 'C2-' + cls, 'i': len(icons), 'q': q, 'row': r})
                icons.append(crop_icon(img, box, BW))
        cols = 10
        atlas = Image.new('RGB', (BW * cols, BW * ((len(icons) + cols - 1) // cols)), (0, 0, 0))
        for i, im in enumerate(icons): atlas.paste(im, ((i % cols) * BW, (i // cols) * BW))
        atlas.save(f'dist/2d/art/equipment/C2-{cls}.webp', quality=86, method=6)
        if sheet_out:
            d = ImageDraw.Draw(atlas); f = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 13)
            for it in [x for x in items if x['a'] == 'C2-' + cls]:
                i = it['i']; d.text(((i % cols) * BW + 2, (i // cols) * BW + 80), it['sub'], fill='yellow', font=f)
            atlas.save(f'{sys.argv[-1]}/C2-{cls}.png')
        print(cls, len(icons))
    js = ('/* 自动生成：scripts/2d-equipment/build_class_items_v2.py（第二批职业装备图）。字段同 class-catalog.js 的 CLASS_BASES，名字由 naming.js 生成。 */\n'
          'export const CLASS_BASES_V2=Object.freeze(' + json.dumps(items, ensure_ascii=False, separators=(',', ':')) + '.map(Object.freeze));\n')
    open('dist/2d/class-catalog-v2.js', 'w').write(js)
    print('total', len(items))

if __name__ == '__main__':
    main()
