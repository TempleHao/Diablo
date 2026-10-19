"""v0.7：七职业装备库（每职业 100+ 件基底 + 36-48 件职业传奇）。

输入：assets-source/2d/v07/items-<cls>.webp、leg-<cls>.webp（黑底图鉴，用户提供）。
输出：dist/2d/art/equipment/C-<cls>.webp（基底图集 96×96，10 列）、K-<cls>.webp（传奇图集 112×112，8 列）、
     dist/2d/class-catalog.js（基底与传奇记录，名字、部位、类型、品级 q、所属天赋树）。
用法：python3 scripts/2d-equipment/build_class_items.py
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '2d-art'))
from grid_icons import split, lum

SRC = 'assets-source/2d/v07/'
OUT = 'dist/2d'
BW = 96   # 基底图标
LW = 112  # 传奇图标

# ───────── 行 → (部位, 类型, 名词)。类型决定攻击方式与擅长判定；名词用于基底名 ─────────
H = ('head', None)
ROWS = {
 'amazon': [('weapon', '长枪', '长枪'), ('weapon', '长弓', '长弓'), ('offhand', '箭囊', '箭袋'), ('offhand', '鸢盾', '圆盾'),
            ('head', '头盔', '战盔'), ('robe', '胸甲', '胸甲'), ('gloves', '手套', '护手'), ('boots', '靴子', '战靴'),
            ('belt', '腰带', '腰带'), ('ring1', '戒指', '指环'), ('amulet', '项链', '项坠')],
 'assassin': [('weapon', '拳刃', '拳刃'), ('weapon', '短剑', '匕首'), ('weapon', '投掷刀', '暗器'), ('offhand', '毒瓶', '毒瓶'),
              ('head', '头盔', '兜帽'), ('robe', '胸甲', '软甲'), ('gloves', '手套', '手甲'), ('boots', '靴子', '短靴'),
              ('belt', '腰带', '腰带'), ('ring1', '戒指', '指环'), ('amulet', '项链', '项坠')],
 'barbarian': [('weapon', '双手斧', '巨斧'), ('weapon', '长剑', '大剑'), ('offhand', '战盾', '战盾'), ('head', '头盔', '角盔'),
               ('robe', '胸甲', '兽甲'), ('gloves', '手套', '护手'), ('boots', '靴子', '战靴'), ('belt', '腰带', '腰带'),
               ('ring1', '戒指', '指环'), ('amulet', '项链', '项坠')],
 'druid': [('weapon', '自然法杖', '木杖'), ('weapon', '自然法杖', '藤杖'), ('offhand', '图腾', '图腾'), ('offhand', '符文书卷', '书卷'),
           ('head', '头盔', '兽首'), ('robe', '胸甲', '毛皮甲'), ('gloves', '手套', '兽爪'), ('boots', '靴子', '毛靴'),
           ('belt', '腰带', '腰带'), ('ring1', '戒指', '指环'), ('amulet', '项链', '项坠')],
 'necro': [('weapon', '骨杖', '骨杖'), ('weapon', '短剑', '祭刃'), ('offhand', '法典', '死灵书'), ('head', '头盔', '骨冠'),
           ('robe', '胸甲', '葬衣'), ('gloves', '手套', '骨手'), ('boots', '靴子', '葬靴'), ('belt', '腰带', '骨带'),
           ('ring1', '戒指', '指环'), ('amulet', '项链', '护符')],
 'paladin': [('weapon', '钉锤', '战锤'), ('weapon', '权杖', '权杖'), ('offhand', '骑士盾', '圣盾'), ('head', '头盔', '战盔'),
             ('robe', '胸甲', '圣铠'), ('gloves', '手套', '护手'), ('boots', '靴子', '战靴'), ('belt', '腰带', '腰带'),
             ('ring1', '戒指', '圣戒'), ('amulet', '项链', '圣坠')],
 'mage': [('weapon', '法杖', '法杖'), ('weapon', '魔杖', '魔杖'), ('offhand', '法球', '法球'), ('offhand', '法典', '法典'),
          ('head', '头盔', '法冠'), ('robe', '胸甲', '法袍'), ('gloves', '手套', '手套'), ('boots', '靴子', '法靴'),
          ('belt', '腰带', '腰封'), ('ring1', '戒指', '法戒'), ('amulet', '项链', '项坠')],
}
# 单格例外：(行, 列) → (类型, 名词)
CELL = {
 'amazon': {(0, 1): ('三叉戟', '三叉戟')},
 'assassin': {(2, 8): ('轻弩', '手弩'), (2, 9): ('轻弩', '手弩')},
 'barbarian': {(0, 6): ('钉锤', '狼牙棒'), (0, 9): ('钉锤', '狼牙棒'), (1, 4): ('战斧', '战斧'), (1, 5): ('钉锤', '狼牙棒'),
               (1, 6): ('战斧', '战斧'), (1, 7): ('战斧', '战斧'), (1, 8): ('链锤', '链锤'), (1, 9): ('战斧', '战斧')},
 'necro': {(0, 2): ('镰刀', '骨镰'), (0, 9): ('镰刀', '骨镰')},
 'paladin': {(0, 0): ('重锤', '圣锤')},
}
SHEET_COUNTS = {'assassin': [12] * 11, 'paladin': [10] * 10, 'druid': [10] * 10 + [12], 'barbarian': [10] * 10,
                'necro': [10] * 9 + [12], 'mage': [10] * 11}
# 品阶用词：从低到高，列序即品级（D2 的普通 / 扩展 / 精英）
TIER = {
 'amazon': ['粗木', '鹿皮', '猎手', '青铜', '羽饰', '月纹', '鹰翼', '星辉', '女武神', '天穹'],
 'assassin': ['粗麻', '夜行', '黑革', '血纹', '影缝', '毒牙', '鸦羽', '无声', '缚魂', '猩月', '冥刃', '永夜'],
 'barbarian': ['粗铁', '兽骨', '部落', '血斧', '狂战', '裂颅', '战嚎', '先祖', '巨人', '战神'],
 'druid': ['枯枝', '苔藓', '橡木', '鹿角', '月叶', '翠玉', '荆棘', '古树', '林王', '世界树'],
 'necro': ['朽骨', '墓土', '苍白', '骸纹', '咒文', '亡语', '冥火', '尸王', '死寂', '永劫'],
 'paladin': ['见习', '铁卫', '银光', '誓约', '圣徒', '光耀', '十字军', '天使', '神谕', '天堂'],
 'mage': ['学徒', '见习', '秘纹', '星辉', '咒印', '奥术', '月影', '虚空', '大法师', '星穹'],
}
CNAME = {'amazon': '亚马逊', 'assassin': '刺客', 'barbarian': '野蛮人', 'druid': '德鲁伊', 'necro': '死灵法师', 'paladin': '圣骑士', 'mage': '法师'}
TWO_HAND = {'双手斧', '长枪', '三叉戟', '长弓', '骨杖', '法杖', '自然法杖', '重锤', '镰刀'}

# ───────── 职业传奇：每行 [名字, 天赋树] ；部位按行 ─────────
L = lambda *xs: list(xs)
LEG = {
 'mage': {'rows': [6] * 6, 'slots': [('weapon', '法杖'), ('offhand', '法球'), ('offhand', '法典'), ('robe', '胸甲'), ('gloves', '手套'),
                                      [('boots', '靴子'), ('belt', '腰带'), ('ring1', '戒指'), ('ring1', '戒指'), ('amulet', '项链'), ('amulet', '项链')]],
   'items': [('星轨', 'arcane'), ('焚天', 'fire'), ('虚旋', 'arcane'), ('凛冬之枝', 'cold'), ('晨星', 'lightning'), ('望月', 'cold'),
             ('星环', 'arcane'), ('日核', 'fire'), ('紫魇之眼', 'arcane'), ('霜冕', 'cold'), ('月蚀', 'cold'), ('暗星', 'arcane'),
             ('日轮典', 'fire'), ('炎之书', 'fire'), ('窥渊之书', 'arcane'), ('冰棱法典', 'cold'), ('月之书', 'cold'), ('赤星禁典', 'lightning'),
             ('白昼法衣', 'arcane'), ('灰烬斗篷', 'fire'), ('紫晶长袍', 'arcane'), ('霜羽长袍', 'cold'), ('星夜法袍', 'lightning'), ('猩红魔袍', 'fire'),
             ('天光之握', 'lightning'), ('焚指', 'fire'), ('梦魇之触', 'arcane'), ('冰爪', 'cold'), ('月眼手甲', 'cold'), ('虚空之触', 'arcane'),
             ('羽步', 'arcane'), ('银月束腰', 'cold'), ('冰晶之誓', 'cold'), ('炎心', 'fire'), ('雷星', 'lightning'), ('暗之星', 'arcane')]},
 'necro': {'rows': [6] * 7, 'slots': [('weapon', '骨杖'), ('offhand', '法典'), ('head', '头盔'), ('robe', '胸甲'), ('gloves', '手套'), ('boots', '靴子'),
                                       [('belt', '腰带'), ('ring1', '戒指'), ('ring1', '戒指'), ('ring1', '戒指'), ('amulet', '项链'), ('amulet', '项链')]],
   'cell': {(0, 1): '镰刀', (0, 5): '镰刀'},
   'items': [('亡语', 'summon'), ('夜镰', 'bone'), ('招魂', 'summon'), ('寂灭之星', 'curse'), ('魂灯', 'summon'), ('霜冥之镰', 'bone'),
             ('骸骨之书', 'bone'), ('月下禁典', 'curse'), ('棘骨典', 'bone'), ('五芒禁书', 'curse'), ('牛颅之书', 'summon'), ('新月秘典', 'curse'),
             ('角颅', 'bone'), ('骸冠', 'summon'), ('送葬者', 'curse'), ('棘王冠', 'bone'), ('夜之冠冕', 'curse'), ('月蚀兜帽', 'curse'),
             ('墓主之袍', 'summon'), ('冥骨胸甲', 'bone'), ('锁魂外袍', 'curse'), ('角魔法衣', 'summon'), ('白骨长衣', 'bone'), ('月影葬衣', 'curse'),
             ('紫焰骨手', 'bone'), ('咒缚之手', 'curse'), ('冥火骨爪', 'summon'), ('月魇之手', 'curse'), ('霜冥利爪', 'bone'), ('凋零之握', 'curse'),
             ('骸步', 'summon'), ('新月之履', 'curse'), ('送葬人之靴', 'bone'), ('骨翼之靴', 'summon'), ('苍月之履', 'curse'), ('尸行者', 'summon'),
             ('颅链', 'summon'), ('紫月之环', 'curse'), ('骷髅戒', 'bone'), ('蓝焰之戒', 'bone'), ('冥月', 'curse'), ('亡者之心', 'summon')]},
 'paladin': {'rows': [6] * 7, 'slots': [('weapon', '权杖'), ('offhand', '骑士盾'), ('head', '头盔'), ('robe', '胸甲'), ('gloves', '手套'),
                                         [('boots', '靴子')] * 4 + [('belt', '腰带')] * 2, [('ring1', '戒指')] * 5 + [('amulet', '项链')]],
   'cell': {(0, 0): '重锤', (0, 2): '链锤'},
   'items': [('天罚之锤', 'combat'), ('日冕权杖', 'offense'), ('锁罪', 'combat'), ('天使之翼', 'defense'), ('天球', 'offense'), ('圣焰', 'offense'),
             ('羽翼圣盾', 'defense'), ('狮心日轮', 'offense'), ('十字壁垒', 'defense'), ('辉光誓盾', 'defense'), ('狮王之盾', 'combat'), ('圣光十字', 'defense'),
             ('光环战盔', 'defense'), ('日冕之盔', 'offense'), ('天使之盔', 'defense'), ('十字军之盔', 'combat'), ('狮鬃', 'combat'), ('白衣修士', 'defense'),
             ('圣徒胸甲', 'defense'), ('狮心', 'combat'), ('天翼铠', 'defense'), ('金辉', 'offense'), ('白袍誓约', 'defense'), ('审判者', 'offense'),
             ('光辉之拳', 'combat'), ('赦罪之手', 'defense'), ('天翼护手', 'combat'), ('日轮护手', 'offense'), ('光环之握', 'offense'), ('圣誓护手', 'combat'),
             ('羽步战靴', 'defense'), ('狮行者', 'combat'), ('天使之步', 'defense'), ('十字行军', 'combat'), ('狮王腰带', 'offense'), ('圣典束带', 'defense'),
             ('日耀', 'offense'), ('狮环', 'combat'), ('天翼之环', 'defense'), ('冠冕之戒', 'offense'), ('十字誓环', 'defense'), ('晨辉', 'offense')]},
 'druid': {'rows': [6] * 6 + [7], 'slots': [('weapon', '自然法杖'), [('offhand', '符文书卷')] * 5 + [('offhand', '图腾')], ('head', '头盔'), ('robe', '胸甲'),
                                             ('gloves', '手套'), [('boots', '靴子')] * 4 + [('belt', '腰带')] * 2, [('ring1', '戒指')] * 3 + [('amulet', '项链')] * 4],
   'items': [('翠晶之杖', 'elem'), ('新月鹿角', 'summon'), ('鹿王之灵', 'shape'), ('日芒', 'elem'), ('藤环', 'summon'), ('古树之心', 'elem'),
             ('世界树典', 'summon'), ('月叶之书', 'elem'), ('鹿王之书', 'shape'), ('漩涡之书', 'elem'), ('金枝典', 'summon'), ('林之眼', 'summon'),
             ('苔藓兜帽', 'summon'), ('鹿王头骨', 'shape'), ('林冠', 'summon'), ('鹿角翠冠', 'elem'), ('叶羽之冠', 'elem'), ('兽面', 'shape'),
             ('羽皮法衣', 'elem'), ('林甲', 'summon'), ('鹿颅外衣', 'shape'), ('月叶长袍', 'elem'), ('白羽披风', 'shape'), ('金秋之衣', 'summon'),
             ('翠爪', 'shape'), ('林叶之握', 'summon'), ('野兽之爪', 'shape'), ('漩纹之手', 'elem'), ('毒藤之握', 'summon'), ('碧玉之爪', 'shape'),
             ('苔行者', 'summon'), ('雪豹之靴', 'shape'), ('林行者', 'elem'), ('熊踪', 'shape'), ('鹿骨腰带', 'shape'), ('月羽束带', 'elem'),
             ('翠心', 'elem'), ('月藤之环', 'elem'), ('花冠之戒', 'summon'), ('漩叶护符', 'elem'), ('鹿王之魂', 'shape'), ('新月之坠', 'summon'), ('世界之树', 'summon')]},
 'barbarian': {'rows': [6] * 7, 'slots': [('weapon', '双手斧'), ('offhand', '战盾'), ('head', '头盔'), ('robe', '胸甲'), ('gloves', '手套'),
                                           [('boots', '靴子')] * 4 + [('belt', '腰带')] * 2, [('ring1', '戒指')] * 2 + [('amulet', '项链')] * 4],
   'cell': {(0, 2): '长剑', (0, 3): '重锤', (0, 4): '链锤'},
   'items': [('颅斧', 'combat'), ('碎颅者', 'combat'), ('血符巨剑', 'mastery'), ('棘锤', 'combat'), ('陨星链锤', 'mastery'), ('斩首', 'combat'),
             ('角颅壁垒', 'cry'), ('血星之盾', 'cry'), ('龙首圆盾', 'combat'), ('角魔之盾', 'cry'), ('刃星之盾', 'mastery'), ('公羊颅盾', 'cry'),
             ('血角', 'cry'), ('狂战之盔', 'combat'), ('龙颅之盔', 'cry'), ('战王之冠', 'cry'), ('钢角', 'mastery'), ('公羊颅', 'cry'),
             ('骸骨战衣', 'mastery'), ('裂甲', 'combat'), ('狼毛胸甲', 'mastery'), ('血棘', 'combat'), ('颅铠', 'cry'), ('巨兽之胸', 'mastery'),
             ('棘拳', 'combat'), ('血拳', 'combat'), ('骸爪', 'mastery'), ('钉刺护手', 'combat'), ('战嚎之握', 'cry'), ('铁颅之拳', 'mastery'),
             ('颅行者', 'combat'), ('血踏', 'combat'), ('兽皮战靴', 'mastery'), ('角颅之靴', 'cry'), ('骷髅腰带', 'cry'), ('血链束腰', 'mastery'),
             ('颅戒', 'combat'), ('血棘之戒', 'mastery'), ('角颅护符', 'cry'), ('血符之星', 'mastery'), ('战嚎', 'cry'), ('血之符文', 'combat')]},
 'assassin': {'rows': [6] * 5 + [8], 'cc': {5: [12, 170, 316, 472, 683, 850, 1000, 1128, 1225]}, 'slots': [[('weapon', '拳刃')] * 3 + [('weapon', '短剑')] * 2 + [('weapon', '投掷刀')],
                                                [('weapon', '短剑')] * 3 + [('weapon', '投掷刀')] * 3, ('head', '头盔'), ('robe', '胸甲'), ('gloves', '手套'),
                                                [('boots', '靴子')] * 3 + [('belt', '腰带')] + [('ring1', '戒指')] * 2 + [('amulet', '项链')] * 2],
   'items': [('血爪', 'martial'), ('猩红之爪', 'martial'), ('魇爪', 'shadow'), ('血链', 'martial'), ('刃舞', 'martial'), ('血轮', 'trap'),
             ('红刃', 'martial'), ('影噬', 'shadow'), ('双子刃', 'martial'), ('旋刃', 'trap'), ('星刃', 'trap'), ('飞刃', 'trap'),
             ('猩红兜帽', 'martial'), ('魇影兜帽', 'shadow'), ('血泪面具', 'shadow'), ('鸦面', 'trap'), ('紫角面具', 'shadow'), ('赤夜', 'martial'),
             ('血纹皮甲', 'martial'), ('暗影斗篷', 'shadow'), ('夜刃软甲', 'martial'), ('鸦羽甲', 'trap'), ('紫魇之衣', 'shadow'), ('骸纹皮甲', 'trap'),
             ('血刃手甲', 'martial'), ('影爪', 'shadow'), ('骸指', 'trap'), ('红星之握', 'martial'), ('暗握', 'shadow'), ('猩红之握', 'trap'),
             ('血行者', 'martial'), ('魇步', 'shadow'), ('红绳靴', 'trap'), ('颅链腰带', 'trap'), ('血钻', 'martial'), ('紫魇之戒', 'shadow'),
             ('残月', 'shadow'), ('血星坠', 'trap')]},
 'amazon': {'rows': [6] * 8, 'slots': [('weapon', '长枪'), ('weapon', '长弓'), ('offhand', '箭囊'), ('offhand', '鸢盾'), ('head', '头盔'),
                                        ('gloves', '手套'), ('boots', '靴子'), ('belt', '腰带')],
   'items': [('日芒之枪', 'spear'), ('月影之矛', 'spear'), ('金枪', 'spear'), ('雷羽', 'spear'), ('日轮之矛', 'spear'), ('颅枪', 'spear'),
             ('天穹之弓', 'bow'), ('新月之弓', 'bow'), ('白羽', 'bow'), ('花藤之弓', 'bow'), ('日冕之弓', 'bow'), ('骨脊之弓', 'bow'),
             ('蓝羽箭袋', 'bow'), ('月羽箭袋', 'bow'), ('日轮箭袋', 'bow'), ('林中箭袋', 'bow'), ('颅骨箭袋', 'bow'), ('血羽箭袋', 'bow'),
             ('金日', 'passive'), ('银月', 'passive'), ('狼王', 'spear'), ('女武神', 'passive'), ('星芒', 'spear'), ('公牛颅盾', 'spear'),
             ('蓝鬃', 'spear'), ('月冠', 'bow'), ('鹰首', 'bow'), ('鹿角花冠', 'passive'), ('双角', 'spear'), ('狼首', 'passive'),
             ('羽翼之握', 'bow'), ('月爪', 'bow'), ('金羽之爪', 'spear'), ('花藤之握', 'passive'), ('颅爪', 'spear'), ('赤羽之握', 'bow'),
             ('羽翼之靴', 'passive'), ('新月之靴', 'passive'), ('白羽之靴', 'bow'), ('林踪', 'passive'), ('颅饰之靴', 'spear'), ('雪狐之靴', 'passive'),
             ('日轮束带', 'spear'), ('月羽腰带', 'bow'), ('狼首腰带', 'passive'), ('花藤束带', 'passive'), ('星芒束带', 'bow'), ('颅骨腰带', 'spear')]},
}
# 职业套装：4 件，取基底图鉴里最高品阶那一列（行号）
SETS = {
 'amazon': ('天穹女武神', [0, 4, 5, 6]), 'assassin': ('永夜影舞', [0, 4, 5, 7]), 'barbarian': ('先祖战魂', [0, 3, 4, 5]),
 'druid': ('世界树之誓', [0, 4, 5, 10]), 'necro': ('永劫骸王', [0, 3, 4, 9]), 'paladin': ('天堂审判', [1, 2, 3, 4]), 'mage': ('星穹大法师', [0, 4, 5, 10]),
}


def crop_icon(sheet, box, size):
    x, y, w, h = box
    cell = sheet.crop((x - 2, y - 2, x + w + 2, y + h + 2))
    s = min((size - 4) / cell.width, (size - 4) / cell.height)
    cell = cell.resize((max(1, round(cell.width * s)), max(1, round(cell.height * s))), Image.LANCZOS)
    out = Image.new('RGB', (size, size), (0, 0, 0))
    out.paste(cell, ((size - cell.width) // 2, (size - cell.height) // 2))
    return out


def amazon_rows(a):
    rows = split(a, [10] * 10)
    last = rows[9]; r9, r10 = [], []
    for c, b in enumerate(last):
        if c < 4:
            x, y, w, h = b; col = a[y:y + h, x:x + w] > 40; prof = col.sum(axis=1); mid = h // 4 + int(np.argmin(prof[h // 4:3 * h // 4]))
            for y0, y1, dst in [(0, mid, r9), (mid, h, r10)]:
                ys, xs = np.nonzero(col[y0:y1])
                dst.append((x + int(xs.min()), y + y0 + int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)))
        else:
            r9.append(b)
    return rows[:9] + [r9[:4] + r10, r9[4:]]


def main():
    os.makedirs(OUT + '/art/equipment', exist_ok=True)
    bases, legs, sets, names = [], [], [], set()
    for cls in ['amazon', 'assassin', 'barbarian', 'druid', 'necro', 'paladin', 'mage']:
        path = SRC + 'items-' + cls + '.webp'
        a = lum(path); sheet = Image.open(path).convert('RGB')
        rows = amazon_rows(a) if cls == 'amazon' else split(a, SHEET_COUNTS[cls])
        assert len(rows) == len(ROWS[cls]), (cls, len(rows))
        icons = []
        for r, row in enumerate(rows):
            slot, sub, noun = ROWS[cls][r]
            n = len(row)
            for c, box in enumerate(row):
                assert box, (cls, r, c)
                s2, n2 = CELL.get(cls, {}).get((r, c), (sub, noun))
                tiers = TIER[cls]
                ti = round(c * (len(tiers) - 1) / max(1, n - 1))
                q = max(1, round(1 + c * 95 / max(1, n - 1)))
                name = tiers[ti] + n2
                if name in names:  # 同名时（例如 12 列的戒指）加序号字
                    name = tiers[ti] + '·' + n2 + '贰'
                names.add(name)
                bid = f'CB-{cls}-{r:02d}{c:02d}'
                bases.append({'id': bid, 'n': name, 's': slot, 'sub': s2, 'h': 2 if s2 in TWO_HAND else 1, 'cls': CNAME[cls],
                              'a': 'C-' + cls, 'i': len(icons), 'q': q, 'row': r})
                icons.append(crop_icon(sheet, box, BW))
            # 套装：取该行最后一列
            if r in SETS[cls][1]:
                sets.append({'set': cls, 'base': f'CB-{cls}-{r:02d}{n - 1:02d}'})
        cols = 10
        atlas = Image.new('RGB', (BW * cols, BW * ((len(icons) + cols - 1) // cols)), (0, 0, 0))
        for i, im in enumerate(icons):
            atlas.paste(im, ((i % cols) * BW, (i // cols) * BW))
        atlas.save(f'{OUT}/art/equipment/C-{cls}.webp', quality=86, method=6)
        # 传奇
        spec = LEG[cls]; path = SRC + 'leg-' + cls + '.webp'
        a = lum(path); sheet = Image.open(path).convert('RGB')
        rows = split(a, spec['rows'], cc_rows=spec.get('cc'))
        icons = []; k = 0
        for r, row in enumerate(rows):
            sl = spec['slots'][r]
            for c, box in enumerate(row):
                slot, sub = sl[c] if isinstance(sl, list) else sl
                sub = spec.get('cell', {}).get((r, c), sub)
                name, tree = spec['items'][k]; k += 1
                assert name not in names, ('duplicate name', name)
                names.add(name)
                n = len(row)
                q = max(6, min(96, round(8 + c * 88 / max(1, n - 1) + (r * 7 % 9) - 4)))
                legs.append({'id': f'CL-{cls}-{r:02d}{c:02d}', 'n': name, 's': slot, 'sub': sub, 'h': 2 if sub in TWO_HAND else 1,
                             'cls': CNAME[cls], 'a': 'K-' + cls, 'i': len(icons), 'q': q, 'tree': tree, 'owner': cls})
                icons.append(crop_icon(sheet, box, LW))
        assert k == len(spec['items']), (cls, k, len(spec['items']))
        cols = 8
        atlas = Image.new('RGB', (LW * cols, LW * ((len(icons) + cols - 1) // cols)), (0, 0, 0))
        for i, im in enumerate(icons):
            atlas.paste(im, ((i % cols) * LW, (i // cols) * LW))
        atlas.save(f'{OUT}/art/equipment/K-{cls}.webp', quality=88, method=6)
        print(cls, 'bases', sum(1 for b in bases if b['a'] == 'C-' + cls), 'legendaries', len(icons))
    js = ('/* 自动生成：scripts/2d-equipment/build_class_items.py（v0.7 七职业装备库）。\n'
          ' * BASES：职业基底（白/蓝/黄装的底子），q 为品级（掉落需要怪物等级 ≥ q），row 为图鉴行。\n'
          ' * LEGENDS：职业传奇，tree 为传奇特效关联的天赋树。SET_PIECES：职业套装用到的基底。\n'
          ' * a 图集（art/equipment/<a>.webp），i 图集序号；C-* 为 96×96 10 列，K-* 为 112×112 8 列。 */\n'
          'export const CLASS_BASES=Object.freeze(' + json.dumps(bases, ensure_ascii=False, separators=(',', ':')) + '.map(Object.freeze));\n'
          'export const CLASS_LEGENDS=Object.freeze(' + json.dumps(legs, ensure_ascii=False, separators=(',', ':')) + '.map(Object.freeze));\n'
          'export const SET_PIECES=Object.freeze(' + json.dumps(sets, ensure_ascii=False, separators=(',', ':')) + ');\n'
          'export const CLASS_SET_NAMES=Object.freeze(' + json.dumps({k: v[0] for k, v in SETS.items()}, ensure_ascii=False) + ');\n')
    open(OUT + '/class-catalog.js', 'w').write(js)
    print('bases', len(bases), 'legendaries', len(legs), 'set pieces', len(sets), 'js', len(js.encode()))


if __name__ == '__main__':
    main()
