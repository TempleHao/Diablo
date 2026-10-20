/* 余烬纪事 2D · 怪物图鉴（v0.6）：普通 30、远程 25、精英 25、首领 20，共 100 种。
 * sprite：art/monsters.webp 中的贴图键；face：原画朝向（1 右、-1 左、0 正面不翻转）。
 * hp/dmg/spd：相对基准的倍率（基准随怪物等级成长，见 game.js monsterStats）。
 * ai：melee 近战 / ranged 远程 / fly 飞行近战 / caster 法师 / tank 慢速重击 / swarm 快速成群。
 * school：远程弹道或技能属性；shot：弹道模式 single 单发 / spread 三连 / orb 慢速追踪 / lob 抛射落地爆炸 / nova 自身环形。
 * mods（精英）：charge 冲锋 / slam 震地 / aura 伤害光环 / summon 召唤 / heal 治疗同伴 / trail 留下地面伤害 / burst 环形弹幕 / explode 死亡爆炸 / reflect 反伤。
 */
const N=(name,o)=>({tier:'normal',hp:1,dmg:1,spd:1,ai:'melee',face:0,...o,name});
export const MONSTERS={
  // ───── 普通怪（30）─────
  n_skel:N('骸骨卫兵',{sprite:'normal0',face:-1}),
  n_ghoul:N('剥皮食尸鬼',{sprite:'normal1',spd:1.15}),
  n_skelmage:N('紫焰骸术士',{sprite:'normal2',ai:'ranged',school:'shadow',shot:'single',hp:.75}),
  n_zombie:N('腐行者',{sprite:'normal3',face:-1,spd:.75,hp:1.25}),
  n_bat:N('嗜血蝠',{sprite:'normal4',ai:'fly',hp:.55,spd:1.5,dmg:.7}),
  n_spider:N('墓穴织网者',{sprite:'normal5',ai:'swarm',hp:.6,spd:1.45,dmg:.7}),
  n_hound:N('腐骨猎犬',{sprite:'normal6',face:1,ai:'swarm',hp:.75,spd:1.5,dmg:.85}),
  n_cutthroat:N('红兜割喉者',{sprite:'normal7',spd:1.2,dmg:1.15}),
  n_bloat:N('胀尸苦工',{sprite:'normal8',ai:'tank',hp:1.8,spd:.65,dmg:1.4}),
  n_imp:N('火烬小鬼',{sprite:'normal9',face:1,ai:'ranged',school:'fire',shot:'single',hp:.7,spd:1.2}),
  n_slime:N('骸泥软怪',{sprite:'normal10',ai:'tank',hp:1.6,spd:.55,dmg:.9,school:'poison',deathCloud:true}),
  n_archer:N('骸骨弓手',{sprite:'normal11',face:1,ai:'ranged',school:'physical',shot:'single',hp:.7}),
  n_goatman:N('山羊斧兵',{sprite:'normal12',face:-1,dmg:1.15}),
  n_bonespider:N('骨甲蛛',{sprite:'normal13',ai:'swarm',hp:.8,spd:1.35}),
  n_plaguedoc:N('提灯瘟医',{sprite:'normal14',ai:'ranged',school:'poison',shot:'lob',hp:.8}),
  n_wraith:N('紫雾游魂',{sprite:'normal15',ai:'fly',hp:.7,spd:1.2,school:'shadow'}),
  n_minotaur:N('牛首屠夫',{sprite:'normal16',ai:'tank',hp:1.6,spd:.85,dmg:1.5}),
  n_assassin:N('暗巷刺客',{sprite:'normal17',spd:1.35,hp:.8,dmg:1.2}),
  n_priest:N('骸骨司祭',{sprite:'normal18',ai:'ranged',school:'holy',shot:'single',hp:.9}),
  n_worm:N('腐土蠕虫',{sprite:'normal19',face:1,ai:'tank',hp:1.5,spd:.7,dmg:1.2}),
  n_treant:N('枯枝树精',{sprite:'normal20',ai:'tank',hp:1.4,spd:.75,dmg:1.1}),
  n_crawler:N('爬行尸鬼',{sprite:'normal21',face:1,ai:'swarm',hp:.7,spd:1.55}),
  n_knight:N('骸骨枪卫',{sprite:'normal22',face:1,hp:1.3,dmg:1.1}),
  n_eye:N('触须魔眼',{sprite:'normal23',ai:'ranged',school:'arcane',shot:'orb',hp:.8,fly:true}),
  n_brute:N('骸甲重拳',{sprite:'normal24',ai:'tank',hp:1.7,spd:.8,dmg:1.35}),
  n_banshee:N('碧魂女妖',{sprite:'normal25',ai:'fly',hp:.75,spd:1.25,school:'cold'}),
  n_rat:N('瘟疫巨鼠',{sprite:'normal26',face:1,ai:'swarm',hp:.5,spd:1.6,dmg:.6}),
  n_shroom:N('孢子菇群',{sprite:'normal27',ai:'tank',hp:1.1,spd:.6,school:'poison',deathCloud:true}),
  n_shaman:N('羊角萨满',{sprite:'normal28',ai:'ranged',school:'fire',shot:'spread',hp:.85}),
  n_blight:N('绿瘿树魔',{sprite:'normal29',ai:'tank',hp:1.5,spd:.75,dmg:1.15,school:'poison'}),
  // ───── 远程法师（25）─────
  c_bloodseer:N('血角先知',{tier:'caster',sprite:'caster0',ai:'caster',school:'fire',shot:'spread'}),
  c_frostwidow:N('霜魂寡妇',{tier:'caster',sprite:'caster1',ai:'caster',school:'cold',shot:'orb'}),
  c_plaguebeak:N('鸦喙瘟巫',{tier:'caster',sprite:'caster2',ai:'caster',school:'poison',shot:'lob'}),
  c_tomereader:N('禁典诵者',{tier:'caster',sprite:'caster3',ai:'caster',school:'shadow',shot:'spread'}),
  c_sunpriestess:N('日冕女祭司',{tier:'caster',sprite:'caster4',ai:'caster',school:'holy',shot:'single'}),
  c_icequeen:N('凛冬侍女',{tier:'caster',sprite:'caster5',ai:'caster',school:'cold',shot:'spread'}),
  c_succubus:N('炎翼魅魔',{tier:'caster',sprite:'caster6',ai:'caster',school:'fire',shot:'orb',fly:true}),
  c_greenwitch:N('鹿角蛊女',{tier:'caster',sprite:'caster7',ai:'caster',school:'poison',shot:'spread'}),
  c_voidcaller:N('虚环唤者',{tier:'caster',sprite:'caster8',ai:'caster',school:'shadow',shot:'orb'}),
  c_pyromancer:N('灰烬焚师',{tier:'caster',sprite:'caster9',ai:'caster',school:'fire',shot:'lob'}),
  c_skullking:N('魂火骨王',{tier:'caster',sprite:'caster10',ai:'caster',school:'cold',shot:'nova',hp:1.2}),
  c_bloodmonk:N('血印苦修士',{tier:'caster',sprite:'caster11',ai:'caster',school:'fire',shot:'single'}),
  c_shardcore:N('碎晶核',{tier:'caster',sprite:'caster12',ai:'caster',school:'lightning',shot:'nova',hp:1.3,spd:.5}),
  c_bloodnun:N('血刃修女',{tier:'caster',sprite:'caster13',ai:'caster',school:'holy',shot:'spread'}),
  c_stormhood:N('雷暴兜帽',{tier:'caster',sprite:'caster14',ai:'caster',school:'lightning',shot:'single'}),
  c_moonsage:N('月藤贤者',{tier:'caster',sprite:'caster15',ai:'caster',school:'poison',shot:'orb'}),
  c_shade:N('紫雾怨灵',{tier:'caster',sprite:'caster16',ai:'caster',school:'shadow',shot:'single',fly:true}),
  c_bonewarlock:N('冰颅术士',{tier:'caster',sprite:'caster17',ai:'caster',school:'cold',shot:'single'}),
  c_censer:N('焚香修女',{tier:'caster',sprite:'caster18',ai:'caster',school:'fire',shot:'nova'}),
  c_watcher:N('百眼窥者',{tier:'caster',sprite:'caster19',ai:'caster',school:'arcane',shot:'orb'}),
  c_alchemist:N('毒瓶炼金师',{tier:'caster',sprite:'caster20',ai:'caster',school:'poison',shot:'lob'}),
  c_crystallich:N('紫晶巫妖',{tier:'caster',sprite:'caster21',ai:'caster',school:'arcane',shot:'spread'}),
  c_bloodbride:N('血纱新娘',{tier:'caster',sprite:'caster22',ai:'caster',school:'shadow',shot:'spread'}),
  c_stagseer:N('鹿颅魂火师',{tier:'caster',sprite:'caster23',ai:'caster',school:'cold',shot:'orb'}),
  c_orbmaster:N('星轨占卜者',{tier:'caster',sprite:'caster24',ai:'caster',school:'arcane',shot:'lob'}),
  // ───── 精英（25）─────
  e_bloodknight:N('血棘骑士',{tier:'elite',sprite:'elite0',face:-1,mods:['charge','reflect']}),
  e_frostlord:N('霜铠督军',{tier:'elite',sprite:'elite1',mods:['aura','burst'],school:'cold'}),
  e_plagueogre:N('瘟疫屠夫',{tier:'elite',sprite:'elite2',ai:'tank',mods:['trail','slam'],school:'poison'}),
  e_demon:N('炎狱刑官',{tier:'elite',sprite:'elite3',mods:['burst','explode'],school:'fire'}),
  e_shaman:N('骨角巫医',{tier:'elite',sprite:'elite4',ai:'caster',mods:['summon','heal'],school:'poison',shot:'spread'}),
  e_lich:N('魂灯巫妖',{tier:'elite',sprite:'elite5',ai:'caster',mods:['burst','summon'],school:'shadow',shot:'orb'}),
  e_ironhulk:N('铁棺巨像',{tier:'elite',sprite:'elite6',ai:'tank',mods:['slam','reflect'],hp:1.3,spd:.8}),
  e_bonereaver:N('骨镰掠食者',{tier:'elite',sprite:'elite7',ai:'swarm',mods:['charge'],spd:1.3}),
  e_lantern:N('双灯引魂人',{tier:'elite',sprite:'elite8',ai:'caster',mods:['heal','burst'],school:'fire',shot:'lob'}),
  e_frostreaper:N('冰镰收魂者',{tier:'elite',sprite:'elite9',face:-1,mods:['charge','aura'],school:'cold'}),
  e_minotaur:N('角魔战将',{tier:'elite',sprite:'elite10',ai:'tank',mods:['charge','slam']}),
  e_rotwood:N('腐林骸树',{tier:'elite',sprite:'elite11',ai:'tank',mods:['summon','trail'],school:'poison'}),
  e_spearlord:N('猩红枪主',{tier:'elite',sprite:'elite12',mods:['charge','burst'],school:'fire'}),
  e_horror:N('千口孽种',{tier:'elite',sprite:'elite13',ai:'tank',mods:['explode','aura'],school:'poison'}),
  e_paladin:N('堕落圣卫',{tier:'elite',sprite:'elite14',mods:['reflect','slam'],school:'holy'}),
  e_whipdemon:N('火鞭魔姬',{tier:'elite',sprite:'elite15',face:-1,mods:['burst','charge'],school:'fire'}),
  e_deathrider:N('冥火骑手',{tier:'elite',sprite:'elite16',face:1,mods:['charge','trail'],school:'cold',spd:1.35}),
  e_werewolf:N('狂月狼人',{tier:'elite',sprite:'elite17',face:1,ai:'swarm',mods:['charge'],spd:1.4}),
  e_plaguereaper:N('瘟钟收割者',{tier:'elite',sprite:'elite18',mods:['aura','summon'],school:'poison'}),
  e_flailer:N('链锤狂徒',{tier:'elite',sprite:'elite19',mods:['slam','charge']}),
  e_naga:N('蛇发妖巫',{tier:'elite',sprite:'elite20',ai:'caster',mods:['burst','heal'],school:'shadow',shot:'spread'}),
  e_magma:N('熔岩傀儡',{tier:'elite',sprite:'elite21',ai:'tank',mods:['trail','explode'],school:'fire'}),
  e_boneprelate:N('白骨大主祭',{tier:'elite',sprite:'elite22',ai:'caster',mods:['summon','burst'],school:'shadow',shot:'orb'}),
  e_mossgolem:N('苔碑守卫',{tier:'elite',sprite:'elite23',ai:'tank',mods:['slam','reflect'],hp:1.3}),
  e_fallen:N('断翼审判者',{tier:'elite',sprite:'elite24',mods:['burst','aura'],school:'holy'}),
  // ───── 首领（20）─────
  b_pitlord:N('炎狱魔王',{tier:'boss',sprite:'boss0',school:'fire',moves:['charge','burst','rain']}),
  b_frostking:N('霜铠骸王',{tier:'boss',sprite:'boss1',school:'cold',moves:['spiral','slam','summon']}),
  b_broodmother:N('裂隙蛛母',{tier:'boss',sprite:'boss2',school:'poison',moves:['summon','spread','trail']}),
  b_butcher:N('瘟腐屠夫',{tier:'boss',sprite:'boss3',school:'poison',moves:['charge','slam','trail']}),
  b_reaperjudge:N('骨镰判官',{tier:'boss',sprite:'boss4',school:'shadow',moves:['spread','summon','charge']}),
  b_minotaur:N('角魔督战',{tier:'boss',sprite:'boss5',school:'physical',moves:['charge','slam','spread']}),
  b_stagpriest:N('枯林鹿祭司',{tier:'boss',sprite:'boss6',school:'poison',moves:['rain','summon','spiral']}),
  b_fallenangel:N('堕光天使',{tier:'boss',sprite:'boss7',school:'holy',moves:['spiral','rain','charge']}),
  b_colossus:N('殿堂巨像',{tier:'boss',sprite:'boss8',school:'holy',moves:['slam','burst','spread'],hp:1.25,spd:.75}),
  b_emberwitch:N('余烬女巫',{tier:'boss',sprite:'boss9',school:'fire',moves:['rain','spiral','spread']}),
  b_worm:N('噬地巨虫',{tier:'boss',sprite:'boss10',face:1,school:'poison',moves:['slam','spread','summon']}),
  b_dragon:N('熔心古龙',{tier:'boss',sprite:'boss11',face:1,school:'fire',moves:['spiral','rain','charge'],hp:1.2}),
  b_bonethrone:N('白骨王座',{tier:'boss',sprite:'boss12',school:'shadow',moves:['summon','spiral','burst'],spd:.7}),
  b_bloodqueen:N('血月女王',{tier:'boss',sprite:'boss13',school:'fire',moves:['spiral','spread','summon']}),
  b_warden:N('铁狱典守',{tier:'boss',sprite:'boss14',school:'physical',moves:['slam','charge','summon']}),
  b_netherreaper:N('冥渊收割者',{tier:'boss',sprite:'boss15',school:'cold',moves:['charge','spiral','spread']}),
  b_lanternwood:N('腐化灯林',{tier:'boss',sprite:'boss16',school:'fire',moves:['summon','rain','trail'],spd:.7}),
  b_fleshmaw:N('万口血肉',{tier:'boss',sprite:'boss17',school:'poison',moves:['burst','summon','slam']}),
  b_hellhounds:N('三首狱犬',{tier:'boss',sprite:'boss18',face:1,school:'fire',moves:['charge','spread','burst'],spd:1.25}),
  b_voideye:N('虚空之眼',{tier:'boss',sprite:'boss19',school:'shadow',moves:['spiral','burst','rain'],spd:.6})
};
// 四档基础属性（再乘每种怪物自己的倍率）
export const TIER=Object.freeze({
  normal:{hp:60,dmg:9,speed:125,radius:17,attack:1.1,xp:22,scale:.62},
  caster:{hp:52,dmg:11,speed:110,radius:16,attack:2.2,xp:26,scale:.64},
  elite:{hp:380,dmg:17,speed:118,radius:24,attack:1.25,xp:80,scale:.78},
  boss:{hp:2300,dmg:24,speed:100,radius:42,attack:2.1,xp:260,scale:.92}
});
// 九个区域的怪物池：普通、远程、精英、首领（首领按击杀次数轮换）
export const REGION_MONSTERS=Object.freeze([
  {normal:['n_skel','n_zombie','n_rat','n_archer','n_cutthroat','n_bat'],caster:['c_tomereader','c_bloodmonk'],elite:['e_bloodknight','e_flailer','e_lantern'],boss:['b_emberwitch','b_reaperjudge']},
  {normal:['n_skel','n_brute','n_knight','n_archer','n_assassin','n_rat'],caster:['c_bonewarlock','c_stormhood'],elite:['e_ironhulk','e_flailer','e_spearlord'],boss:['b_warden','b_butcher']},
  {normal:['n_goatman','n_imp','n_cutthroat','n_hound','n_minotaur','n_shaman'],caster:['c_bloodseer','c_censer','c_bloodnun'],elite:['e_demon','e_minotaur','e_whipdemon'],boss:['b_bloodqueen','b_minotaur']},
  {normal:['n_spider','n_bonespider','n_worm','n_bat','n_crawler','n_eye'],caster:['c_shardcore','c_watcher'],elite:['e_bonereaver','e_horror','e_werewolf'],boss:['b_broodmother','b_worm']},
  {normal:['n_wraith','n_skelmage','n_eye','n_assassin','n_banshee','n_knight'],caster:['c_voidcaller','c_crystallich','c_orbmaster'],elite:['e_lich','e_naga','e_fallen'],boss:['b_voideye','b_fallenangel','b_colossus']},
  {normal:['n_skel','n_zombie','n_wraith','n_priest','n_ghoul','n_knight'],caster:['c_skullking','c_shade','c_bonewarlock'],elite:['e_boneprelate','e_lich','e_bonereaver'],boss:['b_netherreaper','b_bonethrone']},
  {normal:['n_treant','n_shroom','n_blight','n_slime','n_plaguedoc','n_rat'],caster:['c_greenwitch','c_moonsage','c_alchemist','c_plaguebeak'],elite:['e_rotwood','e_plagueogre','e_plaguereaper','e_mossgolem'],boss:['b_lanternwood','b_stagpriest']},
  {normal:['n_skel','n_banshee','n_ghoul','n_knight','n_wraith','n_archer'],caster:['c_frostwidow','c_icequeen','c_stagseer'],elite:['e_frostlord','e_frostreaper','e_deathrider'],boss:['b_frostking','b_fleshmaw']},
  {normal:['n_imp','n_minotaur','n_hound','n_bloat','n_goatman','n_shaman'],caster:['c_pyromancer','c_succubus','c_bloodbride'],elite:['e_magma','e_demon','e_whipdemon','e_paladin'],boss:['b_dragon','b_pitlord','b_hellhounds']}
]);
export const ELITE_MOD_NAMES=Object.freeze({charge:'冲锋',slam:'震地',aura:'灼伤光环',summon:'召唤',heal:'治疗',trail:'焦土',burst:'弹幕',explode:'亡爆',reflect:'反伤'});
export const SCHOOL_COLOR=Object.freeze({fire:'#ff7a2a',cold:'#7cc8ff',lightning:'#a9a6ff',poison:'#7dff6a',holy:'#ffd76a',shadow:'#b46cff',arcane:'#c89cff',physical:'#e8e0d0'});
export const bossFor=(region,kills)=>{const list=REGION_MONSTERS[region]?.boss||REGION_MONSTERS[0].boss;return list[(kills|0)%list.length];};
/** 第 index 波的怪物列表：12 只，前两波以普通+远程为主，精英从第 2 波起出现。 */
export function waveMonsters(region,index,rng){
  const pool=REGION_MONSTERS[region]||REGION_MONSTERS[0],out=[];
  const pick=list=>list[Math.floor(rng()*list.length)];
  for(let i=0;i<12;i++){
    if(index>0&&(i===3||i===9))out.push(pick(pool.elite));
    else if(i%4===2)out.push(pick(pool.caster));
    else out.push(pick(pool.normal));
  }
  return out;
}
