/* 归墟 2D · 职业与武器（纯数据，无 DOM 依赖）。 */

// 七个职业。catalog 对应装备图鉴里的“偏好职业”；weapons 为擅长的武器/副手类型（装备时有加成）。
export const CLASSES=Object.freeze({
  amazon:{name:'亚马逊',catalog:'亚马逊',title:'长矛与弓的猎手',resource:'法力',power:'攻击力',
    hp:115,hpLv:14,mana:90,regen:7,armor:8,crit:0,speed:262,caster:false,
    weapons:['长枪','投枪','钩镰枪','三叉戟','短矛','长弓','短弓','骨弓','反曲弓','轻弩','重弩','箭囊','轻盾','鸢盾'],
    trees:{bow:'弓与弩',spear:'标枪与长矛',passive:'被动与魔法'},
    defaults:['ama_basic','ama_multi','ama_lightjav','ama_firearrow','ama_dodge','ama_guided','ama_poisonjav','ama_valkyrie','ama_slow','ama_dash']},
  assassin:{name:'刺客',catalog:'刺客',title:'爪刃与陷阱',resource:'能量',power:'攻击力',
    hp:110,hpLv:13,mana:95,regen:8,armor:6,crit:5,speed:270,caster:false,
    weapons:['拳刃','短剑','弯刀','投掷刀','镰刀','单手剑','直剑','轻弩','轻盾','毒瓶'],
    trees:{martial:'武艺',shadow:'暗影修炼',trap:'陷阱'},
    defaults:['asn_basic','asn_dragonclaw','asn_bladesentry','asn_fireblast','asn_burst','asn_shadowstep','asn_phoenix','asn_bladeshield','asn_lightsentry','asn_shadowwarrior']},
  barbarian:{name:'野蛮人',catalog:'野蛮人',title:'战吼与重武器',resource:'怒气',power:'攻击力',
    hp:150,hpLv:18,mana:70,regen:6,armor:18,crit:0,speed:252,caster:false,
    weapons:['长剑','单手剑','单手斧','双手斧','战斧','双刃斧','钉锤','重锤','链锤','棍棒','战盾','铁盾','钉刺盾'],
    trees:{combat:'战斗技能',cry:'战吼',mastery:'武器精通'},
    defaults:['bar_basic','bar_bash','bar_leap','bar_warcry','bar_whirl','bar_shout','bar_charge','bar_battleorders','bar_frenzy','bar_findpotion']},
  druid:{name:'德鲁伊',catalog:'德鲁伊',title:'元素、变形与召唤',resource:'法力',power:'法术强度',
    hp:120,hpLv:15,mana:105,regen:8,armor:8,crit:0,speed:255,caster:true,
    weapons:['自然法杖','法杖','棍棒','钉锤','符文书卷','图腾'],
    trees:{elem:'元素',shape:'变形',summon:'召唤'},
    defaults:['dru_basic','dru_firestorm','dru_tornado','dru_wolves','dru_cyclone','dru_werewolf','dru_fissure','dru_oak','dru_hurricane','dru_ravens']},
  necro:{name:'死灵法师',catalog:'死灵法师',title:'骷髅、骨与诅咒',resource:'法力',power:'法术强度',
    hp:100,hpLv:12,mana:120,regen:9,armor:6,crit:0,speed:252,caster:true,
    weapons:['魔杖','骨杖','镰刀','短剑','骨盾','法典'],
    trees:{summon:'召唤',bone:'毒与骨',curse:'诅咒'},
    defaults:['nec_basic','nec_bonespear','nec_skeleton','nec_amplify','nec_corpse','nec_bonearmor','nec_poisonnova','nec_skelmage','nec_teeth','nec_golem']},
  paladin:{name:'圣骑士',catalog:'圣骑士',title:'圣光、光环与盾',resource:'信仰',power:'攻击力',
    hp:140,hpLv:17,mana:85,regen:7,armor:20,crit:0,speed:255,caster:false,
    weapons:['权杖','钉锤','重锤','链锤','直剑','长剑','骑士盾','塔盾','鸢盾','战盾'],
    trees:{combat:'战斗技能',offense:'攻击光环',defense:'防御光环'},
    defaults:['pal_basic','pal_zeal','pal_hammer','pal_smite','pal_might','pal_prayer','pal_charge','pal_holybolt','pal_holyshield','pal_fist']},
  mage:{name:'法师',catalog:'法师',title:'火、冰、雷与奥术',resource:'法力',power:'法术强度',
    hp:105,hpLv:13,mana:100,regen:7,armor:0,crit:0,speed:250,caster:true,
    weapons:['法杖','晶杖','魔杖','权杖','法典','符文书卷','法球'],
    trees:{fire:'火焰',cold:'冰霜',lightning:'雷电',arcane:'奥术'},
    defaults:['fire','shard','nova','meteor','chain','ward','heal','armor','storm','blink']}
});
export const CLASS_IDS=Object.keys(CLASSES);
export const CLASS_BY_CATALOG=Object.freeze(Object.fromEntries(CLASS_IDS.map(id=>[CLASSES[id].catalog,id])));

// 武器类型：mode 普攻方式（melee 近战 / bow 射箭 / throw 投掷 / spell 法术弹），speed 攻速倍率，reach 近战距离。
export const WEAPON_TYPES=Object.freeze({
  '拳刃':{mode:'melee',speed:1.3,reach:76},'短剑':{mode:'melee',speed:1.35,reach:72},'长剑':{mode:'melee',speed:1,reach:92},'单手剑':{mode:'melee',speed:1.1,reach:86},
  '直剑':{mode:'melee',speed:1.05,reach:88},'弯刀':{mode:'melee',speed:1.2,reach:82},'单手斧':{mode:'melee',speed:1.05,reach:82},
  '双手斧':{mode:'melee',speed:.8,reach:108},'战斧':{mode:'melee',speed:.9,reach:96},'双刃斧':{mode:'melee',speed:.78,reach:108},
  '钉锤':{mode:'melee',speed:1,reach:82},'重锤':{mode:'melee',speed:.75,reach:102},'链锤':{mode:'melee',speed:.9,reach:96},
  '棍棒':{mode:'melee',speed:1,reach:82},'长枪':{mode:'melee',speed:.85,reach:128},'钩镰枪':{mode:'melee',speed:.8,reach:126},
  '三叉戟':{mode:'melee',speed:.85,reach:122},'短矛':{mode:'melee',speed:1,reach:112},'镰刀':{mode:'melee',speed:.88,reach:112},
  '投枪':{mode:'throw',speed:1,reach:0},'投掷刀':{mode:'throw',speed:1.3,reach:0},
  '长弓':{mode:'bow',speed:.9,reach:0},'短弓':{mode:'bow',speed:1.2,reach:0},'骨弓':{mode:'bow',speed:1,reach:0},
  '反曲弓':{mode:'bow',speed:1.05,reach:0},'轻弩':{mode:'bow',speed:.9,reach:0},'重弩':{mode:'bow',speed:.7,reach:0},
  '法杖':{mode:'spell',speed:1,reach:96},'晶杖':{mode:'spell',speed:1,reach:96},'自然法杖':{mode:'spell',speed:1,reach:96},
  '骨杖':{mode:'spell',speed:1,reach:96},'魔杖':{mode:'spell',speed:1.25,reach:76},'权杖':{mode:'spell',speed:1.05,reach:86}
});
export const UNARMED=Object.freeze({mode:'melee',speed:1.1,reach:72});
/** 当前职业用这把武器时的普攻方式：法系武器对非施法职业算近战。 */
export function attackMode(cls,sub){
  const w=WEAPON_TYPES[sub]||UNARMED;
  if(w.mode==='spell'&&!CLASSES[cls]?.caster)return {...w,mode:'melee'};
  if(!sub&&CLASSES[cls]?.caster)return {mode:'spell',speed:1,reach:80};
  return w;
}
export const proficient=(cls,sub)=>!!sub&&(CLASSES[cls]?.weapons||[]).includes(sub);
