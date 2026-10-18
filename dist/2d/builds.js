/* 余烬纪事 2D · 流派指南（Build）。每个职业两套推荐流派。
 * skills：推荐技能栏（10 格，顺序即格子）；weights：一键穿戴时的词条/属性权重；
 * weapons：推荐武器类型（会额外加分）；tips：玩法要点。 */
const W=(o)=>Object.freeze(o);
export const BUILDS=Object.freeze({
  mage:[
    {id:'mage_fire',name:'烈焰陨星',desc:'火球清怪、陨火和末日火雨打团，冰甲保命。',
      skills:['fireball','meteor','firenova','hydra','firewall','armageddon','armor','blink','ward','heal'],
      weights:W({power:3,fire:4,skillFire:30,crit:2,critDmg:1.2,haste:2,mana:.6,hp:.4,armor:.3,sk_mage:25,regen:2}),
      weapons:['法杖','晶杖','法典'],tips:['先放九头炎蛇和火墙，再陨火集火','法力不够时用法力涌动替换护盾','火焰增伤 > 法术强度 > 暴击']},
    {id:'mage_frost',name:'冰封控场',desc:'冰封球和冰暴领域持续控场，极寒冻结救急。',
      skills:['frozenorb','glacial','storm','blades','deepfreeze','nova','armor','blink','ward','manasurge'],
      weights:W({power:3,cold:4,skillCold:30,crit:1.5,critDmg:1,haste:2,mana:.8,hp:.5,armor:.4,sk_mage:25,regen:2.5}),
      weapons:['法杖','晶杖','法典'],tips:['冰封球穿过怪群伤害最高','被围时极寒冻结后闪现脱离','冰霜增伤 > 法术强度 > 法力回复']}
  ],
  amazon:[
    {id:'ama_bow',name:'多重射手',desc:'弓弩远程：多重射击清怪，引导箭打首领，女武神抗怪。',
      skills:['ama_multi','ama_guided','ama_freezearrow','ama_explode','ama_rain','ama_valkyrie','ama_decoy','ama_dodge','ama_critical','ama_dash'],
      weights:W({power:3,physical:3.5,crit:2.5,critDmg:1.5,haste:2.5,hp:.5,armor:.3,sk_amazon:25,lifesteal:3,move:2}),
      weapons:['长弓','反曲弓','骨弓','短弓','重弩','轻弩','箭囊'],tips:['弓弩可以配箭袋','女武神吸引火力后站远处输出','穿透 + 多重射击清怪最快']},
    {id:'ama_jav',name:'雷霆标枪',desc:'标枪与长矛：闪电之怒和瘟疫标枪的元素爆发。',
      skills:['ama_lightfury','ama_lightjav','ama_plague','ama_thunder','ama_jab','ama_fend','ama_charge','ama_valkyrie','ama_inner','ama_dodge'],
      weights:W({power:3,lightning:3.5,poison:2.5,crit:2,critDmg:1.2,haste:2,hp:.6,armor:.5,sk_amazon:25,lifesteal:2}),
      weapons:['投枪','长枪','短矛','三叉戟','钩镰枪','轻盾','鸢盾'],tips:['闪电之怒对密集怪群伤害极高','近身用横扫和连刺补伤害','雷电增伤 > 攻击力 > 暴击']}
  ],
  assassin:[
    {id:'asn_trap',name:'陷阱大师',desc:'站远放闪电和死亡哨兵，用心灵爆破控场。',
      skills:['asn_lightsentry','asn_deathsentry','asn_bladesentry','asn_firesentry','asn_shockweb','asn_mindblast','asn_shadowwarrior','asn_burst','asn_cloak','asn_shadowstep'],
      weights:W({power:3,lightning:3,fire:2.5,haste:2.5,crit:1.5,critDmg:1,hp:.6,armor:.5,sk_assassin:25,mana:.6,regen:2}),
      weapons:['投掷刀','短剑','轻盾'],tips:['哨兵最多 3 个，放在怪群路径上','死亡哨兵会引爆周围敌人','攻速词条也会加快陷阱放置']},
    {id:'asn_martial',name:'凤凰武僧',desc:'贴身爪刃：虎击蓄力、凤凰击三元素爆发。',
      skills:['asn_tiger','asn_phoenix','asn_dragonclaw','asn_dragontail','asn_bladefury','asn_dragonflight','asn_venom','asn_clawmastery','asn_burst','asn_shadowstep'],
      weights:W({power:3,physical:3,fire:1.5,crit:3,critDmg:2,haste:3,hp:.7,armor:.6,sk_assassin:25,lifesteal:3}),
      weapons:['短剑','弯刀','镰刀','单手剑','直剑'],tips:['虎击叠 3 层后接凤凰击','暗影步后下一击必暴击','暴击 > 攻速 > 攻击力']}
  ],
  barbarian:[
    {id:'bar_whirl',name:'旋风战神',desc:'双手大斧旋风斩穿梭怪群，战斗指令堆血。',
      skills:['bar_whirl','bar_frenzy','bar_leap','bar_charge','bar_warcry','bar_battleorders','bar_shout','bar_bloodlust','bar_mastery','bar_findpotion'],
      weights:W({power:3,physical:3.5,crit:2,critDmg:1.5,haste:2.5,hp:1,armor:.8,sk_barbarian:25,lifesteal:4,resistFire:.5,resistCold:.5}),
      weapons:['双手斧','双刃斧','战斧','重锤','长剑'],tips:['旋风斩时可以移动','先战斗指令和嗜血，再进场旋风','吸血 + 生命让你站得住']},
    {id:'bar_cry',name:'战吼领主',desc:'剑盾防守：战吼眩晕、嘲讽减伤、震地控场。',
      skills:['bar_warcry','bar_stomp','bar_bash','bar_taunt','bar_battlecry','bar_grimward','bar_ironskin','bar_battleorders','bar_shout','bar_leap'],
      weights:W({power:2,physical:2,hp:1.4,armor:1.2,resistFire:1,resistCold:1,resistDark:1,crit:1,haste:1.5,sk_barbarian:25,lifesteal:2}),
      weapons:['长剑','单手剑','钉锤','单手斧','战盾','铁盾','钉刺盾'],tips:['战吼和震地可以连续眩晕','恐惧图腾放在怪群中间','生命与护甲优先']}
  ],
  druid:[
    {id:'dru_elem',name:'风暴德鲁伊',desc:'龙卷风与飓风，旋风护甲保命，灵狼抗怪。',
      skills:['dru_tornado','dru_hurricane','dru_fissure','dru_volcano','dru_firestorm','dru_cyclone','dru_wolves','dru_oak','dru_storm','dru_ravens'],
      weights:W({power:3,cold:2.5,fire:2.5,haste:2,crit:1.2,critDmg:1,mana:.8,hp:.6,armor:.4,sk_druid:25,regen:2.5}),
      weapons:['自然法杖','法杖','符文书卷'],tips:['飓风持续 10 秒，开了就往怪堆走','橡木智者持续回血','元素增伤 > 法术强度']},
    {id:'dru_summon',name:'万兽之主',desc:'狼人 + 灰熊 + 狼群，自己变身近战补刀。',
      skills:['dru_grizzly','dru_direwolf','dru_wolves','dru_ravens','dru_heart','dru_werewolf','dru_fury','dru_hunger','dru_rabies','dru_oak'],
      weights:W({power:3,physical:3,poison:1.5,haste:2.5,crit:1.5,critDmg:1,hp:.9,armor:.7,sk_druid:25,lifesteal:3}),
      weapons:['棍棒','钉锤','自然法杖'],tips:['先召灰熊和狂狼，再变狼人','荆棘之心伤害周围敌人','狂犬病的毒会蔓延']}
  ],
  necro:[
    {id:'nec_summon',name:'骷髅大军',desc:'6 骷髅 + 4 法师 + 魔像，诅咒加深伤害，尸爆清场。',
      skills:['nec_skeleton','nec_skelmage','nec_golem','nec_revive','nec_amplify','nec_corpse','nec_bonearmor','nec_decrep','nec_terror','nec_teeth'],
      weights:W({power:3,shadow:1.5,haste:1.5,mana:.8,hp:.8,armor:.6,sk_necro:30,regen:2.5,resistDark:.5}),
      weapons:['骨杖','魔杖','骨盾','法典'],tips:['随从伤害跟法术强度和技能等级走','伤害加深 + 尸体爆炸是核心连招','恐惧能救命']},
    {id:'nec_bone',name:'骨矛术士',desc:'骨矛贯穿一列、骨魂追踪首领，骨墙骨牢控场。',
      skills:['nec_bonespear','nec_bonespirit','nec_teeth','nec_bonenova','nec_prison','nec_bonewall','nec_bonearmor','nec_poisonnova','nec_lowerres','nec_amplify'],
      weights:W({power:3.5,shadow:3.5,poison:1.5,crit:1.5,critDmg:1,haste:2,mana:.8,hp:.5,armor:.4,sk_necro:25,regen:2.5}),
      weapons:['骨杖','魔杖','法典'],tips:['骨矛沿直线贯穿，斜着站位最好','骨牢困住首领后用骨魂','暗影增伤 > 法术强度']}
  ],
  paladin:[
    {id:'pal_hammer',name:'祝福之锤',desc:'专注光环 + 螺旋战锤，站在原地转锤清怪。',
      skills:['pal_hammer','pal_concentration','pal_fist','pal_holybolt','pal_charge','pal_holyshield','pal_smite','pal_zeal','pal_redemption','pal_prayer'],
      weights:W({power:3.5,holy:4,crit:1.5,critDmg:1,haste:2,hp:.7,armor:.6,sk_paladin:25,mana:.6,regen:2}),
      weapons:['权杖','钉锤','骑士盾','塔盾'],tips:['战锤绕身螺旋飞出，贴近怪群放','光环同时只能开一个','神圣增伤 > 攻击力']},
    {id:'pal_zeal',name:'狂热圣战士',desc:'狂热光环 + 狂热连击，圣盾减伤，复仇三元素。',
      skills:['pal_zeal','pal_fanaticism','pal_vengeance','pal_smite','pal_charge','pal_holyshield','pal_sacrifice','pal_fist','pal_redemption','pal_might'],
      weights:W({power:3,physical:3,fire:1,cold:1,lightning:1,crit:2.5,critDmg:1.8,haste:3,hp:.8,armor:.8,sk_paladin:25,lifesteal:3}),
      weapons:['长剑','直剑','钉锤','链锤','骑士盾','鸢盾'],tips:['狂热四连击吃攻速','惩击必定眩晕，打首领前先用','攻速 > 暴击 > 攻击力']}
  ]
});
export const buildsOf=cls=>BUILDS[cls]||BUILDS.mage;
export const buildById=(cls,id)=>buildsOf(cls).find(b=>b.id===id)||buildsOf(cls)[0];
