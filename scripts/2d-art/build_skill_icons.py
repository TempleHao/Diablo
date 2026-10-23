"""v0.7 技能图标：从 assets-source/2d/v07/skill-icons.webp 裁出 181 个技能图标。
输出 dist/2d/art/skills.webp（64×64，16 列）与 dist/2d/skill-icons.js（技能 → 图集序号）。
映射按图标含义手工指定；少数技能借用同职业相近图标并做色相偏移（第三个参数）。
v1.1.2：图标改为 96×96，裁掉每格自带的方框（技能按钮自己有边框，手机上是圆形），放大时用锐化代替浏览器的模糊插值；
映射允许跨职业借图（写成 ('职业', 序号[, 色相])），修正名不副实的图标（如闪现、恢复药剂、迅捷、九头炎蛇、雷暴）。"""
import json, sys, os, colorsys
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from skill_icons_grid import boxes

MAP = {
 'amazon': dict(ama_basic=0, ama_magicarrow=1, ama_firearrow=6, ama_multi=2, ama_coldarrow=4, ama_guided=20, ama_explode=7,
                ama_rain=8, ama_freezearrow=10, ama_jab=19, ama_lightjav=27, ama_poisonjav=5, ama_charge=11, ama_lightfury=26,
                ama_plague=23, ama_thunder=('druid', 13), ama_fend=17, ama_dodge=('assassin', 17), ama_inner=12, ama_slow=13, ama_dash=14, ama_pierce=9,
                ama_decoy=24, ama_critical=18, ama_valkyrie=28),
 'assassin': dict(asn_basic=0, asn_tiger=6, asn_dragonclaw=2, asn_dragontail=1, asn_cobra=5, asn_phoenix=19, asn_dragonflight=4,
                  asn_bladefury=7, asn_clawmastery=3, asn_burst=17, asn_psychic=13, asn_shadowstep=11, asn_cloak=24, asn_venom=15,
                  asn_bladeshield=21, asn_mindblast=10, asn_shadowwarrior=20, asn_fireblast=('amazon', 18), asn_bladesentry=9, asn_shockweb=('amazon', 13, .58),
                  asn_lightsentry=23, asn_firesentry=26, asn_bladestorm=16, asn_deathsentry=14, asn_wakeinferno=8),
 'barbarian': dict(bar_basic=0, bar_bash=3, bar_double=6, bar_leap=13, bar_frenzy=1, bar_charge=19, bar_whirl=2, bar_berserk=11,
                   bar_stomp=8, bar_concentrate=5, bar_howl=4, bar_findpotion=18, bar_taunt=15, bar_shout=7, bar_warcry=16,
                   bar_battleorders=20, bar_battlecry=17, bar_grimward=22, bar_ironskin=24, bar_mastery=23, bar_increasedspeed=('amazon', 14),
                   bar_bloodlust=25, bar_throw=21, bar_resist=9, bar_rage=10),
 'druid': dict(dru_basic=17, dru_firestorm=12, dru_boulder=20, dru_arctic=14, dru_fissure=28, dru_cyclone=21, dru_tornado=6,
               dru_hurricane=('mage', 24), dru_volcano=7, dru_werewolf=22, dru_werebear=27, dru_feral=5, dru_maul=1, dru_rabies=11, dru_shockwave=24,
               dru_fury=19, dru_hunger=26, dru_ravens=2, dru_vine=10, dru_wolves=0, dru_oak=9, dru_direwolf=23, dru_heart=3,
               dru_grizzly=16, dru_storm=13),
 'necro': dict(nec_basic=18, nec_skeleton=4, nec_skelmage=1, nec_clay=5, nec_golem=10, nec_firegolem=15, nec_revive=7, nec_bonearmor=0,
               nec_corpse=20, nec_teeth=9, nec_bonespear=2, nec_poisondagger=19, nec_bonewall=16, nec_poisonnova=8, nec_prison=22,
               nec_bonespirit=24, nec_poisonexplode=11, nec_bonenova=21, nec_amplify=13, nec_weaken=6, nec_terror=12, nec_lifetap=17,
               nec_decrep=14, nec_lowerres=23, nec_confuse=3),
 'paladin': dict(pal_basic=20, pal_zeal=17, pal_smite=3, pal_holybolt=0, pal_charge=18, pal_hammer=1, pal_vengeance=23, pal_fist=13,
                 pal_sacrifice=26, pal_might=2, pal_holyfire=25, pal_thorns=24, pal_holyfreeze=22, pal_holyshock=7, pal_concentration=16,
                 pal_fanaticism=10, pal_conviction=12, pal_prayer=14, pal_defiance=15, pal_cleansing=5, pal_vigor=8, pal_meditation=6,
                 pal_salvation=11, pal_holyshield=9, pal_redemption=27),
 'mage': dict(fire=4, fireball=0, meteor=1, firenova=3, hydra=('assassin', 5, .07), inferno=('barbarian', 25), firewall=2, armageddon=31,
              shard=5, nova=7, armor=14, glacial=6, storm=8, frozenorb=13, blades=22, deepfreeze=34,
              cbolt=20, lightning=10, chain=11, lnova=('amazon', 15, .58), ballz=21, thunder=('druid', 13),
              mmissile=('amazon', 1, .76), blink=('assassin', 11), heal=('druid', 26, .0), haste=('assassin', 4), manasurge=17, ward=('paladin', 9, .72), barrage=('amazon', 2, .76), slowtime=26, blackhole=15),
}
S, COLS = 96, 16


def hue_to(im, target):
    """把图标整体色相转到 target（0-1），保留明暗与饱和度。"""
    a = np.asarray(im).astype(float) / 255
    out = np.empty_like(a)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            r, g, b = a[y, x]
            h, l, s = colorsys.rgb_to_hls(r, g, b)
            if s > .25 and l > .08:
                h = target
            out[y, x] = colorsys.hls_to_rgb(h, l, s)
    return Image.fromarray((out * 255).astype('uint8'))


def main():
    src = 'assets-source/2d/v07/skill-icons.webp'
    B = boxes(src); sheet = Image.open(src).convert('RGB')
    order, icons = {}, []
    for cls, m in MAP.items():
        for sid, ref in m.items():
            if isinstance(ref, int): src_cls, idx, hue = cls, ref, None
            elif isinstance(ref[0], str): src_cls, idx, hue = ref[0], ref[1], (ref[2] if len(ref) > 2 else None)
            else: src_cls, (idx, hue) = cls, ref
            x, y, w, h = B[src_cls][idx]
            k = max(7, round(w * .135))  # 裁掉方框（约 13%）
            im = sheet.crop((x + k, y + k, x + w - k, y + h - k)).resize((S, S), Image.LANCZOS)
            im = im.filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=2))
            if hue is not None:
                im = hue_to(im, hue)
            order[sid] = len(icons); icons.append(im)
    atlas = Image.new('RGB', (S * COLS, S * ((len(icons) + COLS - 1) // COLS)))
    for i, im in enumerate(icons):
        atlas.paste(im, ((i % COLS) * S, (i // COLS) * S))
    atlas.save('dist/2d/art/skills.webp', quality=86, method=6)
    js = ('/* 自动生成：scripts/2d-art/build_skill_icons.py。技能 → art/skills.webp 图集序号（96×96，16 列）。 */\n'
          'export const SKILL_ICON_SIZE=%d,SKILL_ICON_COLS=%d;\n' % (S, COLS) +
          'export const SKILL_ICON=Object.freeze(' + json.dumps(order, separators=(',', ':')) + ');\n')
    open('dist/2d/skill-icons.js', 'w').write(js)
    print(len(icons), atlas.size, os.path.getsize('dist/2d/art/skills.webp'))


if __name__ == '__main__':
    main()
