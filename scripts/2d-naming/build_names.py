"""生成 dist/2d/naming-data.js：词库 + 每件传奇 / 暗金的专名（东土 / 西境，每个职业各占一半）。
传奇和暗金先用真实名器（按兵器类型匹配），不够时用古代英雄或先知的名字「某某之X」。
用法：python3 scripts/2d-naming/build_names.py"""
import json, re, os, sys, zlib
sys.path.insert(0, os.path.dirname(__file__))
from lexicon import *

CN = {'亚马逊': 'amazon', '刺客': 'assassin', '野蛮人': 'barbarian', '德鲁伊': 'druid', '死灵法师': 'necro', '圣骑士': 'paladin', '法师': 'mage', '全职业': 'all'}

def load(path, var):
    s = open(path, encoding='utf-8').read()
    m = re.search(var + r'=Object\.freeze\((\[.*?\])(?:\.map\(Object\.freeze\))?\);', s, re.S)
    return json.loads(m.group(1))

def kind(e):
    return KIND_OF.get(e['sub']) or SLOT_KIND.get(e['s'], 'amulet')

def main():
    old = load('dist/2d/equipment-catalog.js', 'CATALOG')
    legs = load('dist/2d/class-catalog.js', 'CLASS_LEGENDS')
    named = [e for e in old if e['r'] == 4] + legs + [e for e in old if e['r'] == 3]
    used, names, out = set(), set(), {}
    count = {}            # (职业, 东/西) → 件数
    hero_i = {}
    relic_by = {}
    for r in RELICS:
        relic_by.setdefault((r[1], r[2]), []).append(r)
    stats = {'relic': 0, 'hero': 0}
    for e in named:
        cls = e.get('owner') or CN.get(e.get('cls'), 'all')
        k = kind(e)
        ce, cw = count.get((cls, 'e'), 0), count.get((cls, 'w'), 0)
        if ce != cw: o = 'e' if ce < cw else 'w'
        else: o = 'e' if zlib.crc32(e['id'].encode()) % 2 else 'w'
        rel = [r for r in relic_by.get((o, k), []) if r[0] not in used]
        if rel:
            n, _, _, note = rel[0]; used.add(n); stats['relic'] += 1
        else:
            pool = HEROES.get(cls, HEROES['all'])[0 if o == 'e' else 1]
            word = HERO_WORD[k][0 if o == 'e' else 1]
            i = hero_i.get((cls, o), 0)
            for t in range(len(pool) * 3):
                hn, hnote = pool[(i + t) % len(pool)]
                n = hn + '之' + word
                if n not in names: break
            else:
                raise SystemExit('ran out of hero names for ' + cls + o + k)
            hero_i[(cls, o)] = i + t + 1
            note = '相传为' + hn + '所用。' + hn + '：' + hnote + '。'
            stats['hero'] += 1
        assert n not in names, n
        names.add(n)
        count[(cls, o)] = count.get((cls, o), 0) + 1
        out[e['id']] = [n, o, note]
    data = {
        'BASE': BASE, 'CLASS_BASE': {f'{c}|{s}': v for (c, s), v in CLASS_BASE.items()}, 'GRADE': GRADE,
        'PREFIX_E': PREFIX_E, 'PREFIX_W': PREFIX_W, 'SUFFIX_E': SUFFIX_E, 'SUFFIX_W': SUFFIX_W,
        'EPIC_E': EPIC_E, 'EPIC_W': EPIC_W, 'KIND_WORD': KIND_WORD, 'KIND_OF': KIND_OF, 'SLOT_KIND': SLOT_KIND,
        'NAMED': out, 'SET_NAMES': {k: v[0] for k, v in SET_NAMES.items()}, 'SET_PIECE': SET_PIECE, 'BANNED': BANNED, 'DARK': DARK,
    }
    js = ('/* 自动生成：scripts/2d-naming/build_names.py（词库见 scripts/2d-naming/lexicon.py，规则见 docs/2D-NAMING.md）。 */\n'
          'export const NAMING=Object.freeze(' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ');\n')
    open('dist/2d/naming-data.js', 'w', encoding='utf-8').write(js)
    per = {}
    for (c, o), v in count.items(): per.setdefault(c, {})[o] = v
    print('named', len(out), stats, per)

if __name__ == '__main__':
    main()
