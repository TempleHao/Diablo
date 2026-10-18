/* 余烬纪事：装备、词缀与职业构筑（纯规则，无 DOM 依赖）。 */
import {CATALOG} from './equipment-catalog.js';
import {CLASSES,CLASS_IDS,CLASS_BY_CATALOG,proficient,attackMode} from './classes.js';
import {CLASS_SKILLS} from './class-skills.js';
export {CLASSES,CLASS_IDS,proficient,attackMode};
// v0.4：装备槽与「黑铁遗珍」装备库对齐（11 槽）。v0.4.1 起全部 500 件装备都可穿戴。
// 双手武器占用副手；弓弩例外，可以配箭袋。
export const SLOTS = Object.freeze([
  ['head','头盔','⛑'],['shoulders','肩甲','♜'],['robe','胸甲','♟'],
  ['gloves','手套','♧'],['belt','腰带','▤'],['boots','靴子','♢'],
  ['weapon','武器','⚔'],['offhand','副手','◈'],
  ['amulet','项链','❖'],['ring1','戒指 I','◇'],['ring2','戒指 II','◇']
]);
export const SLOT_IDS=SLOTS.map(x=>x[0]);
// 旧版存档里的腿甲/遗物：保留在背包里可以分解，但不能再穿戴。
export const LEGACY_SLOTS=Object.freeze({pants:'腿甲（旧版）',charm:'遗物（旧版）'});
export const MAX_ITEMS=80;
export const RARITIES=['普通','魔法','史诗','传奇','暗金'];
export const RARITY_COLORS=Object.freeze(['#c9c6bd','#5aa6ff','#b86cff','#ff8c2e','#dcb25e']);
export const CATALOG_BY_ID=new Map(CATALOG.map(c=>[c.id,c]));
const slotGroup=slot=>slot==='ring2'?'ring1':slot;
// POOL[品质][装备槽] -> 目录记录
const POOL=[0,1,2,3,4].map(r=>{const m={};for(const c of CATALOG)if(c.r===r)(m[c.s]||=[]).push(c);return m;});
export const catalogPool=(rarity,slot)=>POOL[rarity]?.[slotGroup(slot)]||[];
export const catalogEntry=item=>CATALOG_BY_ID.get(item?.cid)||null;
const BOWS=new Set(['长弓','短弓','骨弓','反曲弓','轻弩','重弩']);
export const isBow=item=>BOWS.has(catalogEntry(item)?.sub);
export const isQuiver=item=>catalogEntry(item)?.sub==='箭囊';
/** 副手能否与当前武器同时装备。 */
export function offhandAllowed(weapon,offhand){
  if(!weapon||weapon.hands!==2)return true;
  return isBow(weapon)&&(!offhand||isQuiver(offhand));
}
const hashId=str=>{let h=2166136261;for(const ch of String(str)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
// 首领专属装备：名称固定，图标取同类型传奇图标。
export const BOSS_ITEM_ICONS=Object.freeze({
  '炉誓秘杖':'EQ-L-034','典守之狱衣':'EQ-L-062','血印誓约护符':'EQ-L-091','渊丝禁忌秘典':'EQ-L-099',
  '失名者的最后祷言':'EQ-L-100','守魂者的夜行头冠':'EQ-L-050','朽化荆棘战靴':'EQ-L-080',
  '永霜寒玉戒':'EQ-L-090','黑曜焚世长杖':'EQ-L-036'
});
export const BASES=Object.freeze(Object.fromEntries(SLOT_IDS.map(s=>[s,catalogPool(0,s).map(c=>c.sub)])));
export const AFFIXES={
  power:{name:'法术强度',min:2,max:11,slots:['weapon','offhand','amulet','ring1','ring2','gloves']},
  hp:{name:'最大生命',min:8,max:36,slots:['head','shoulders','robe','gloves','belt','boots','amulet','ring1','ring2']},
  mana:{name:'最大法力',min:6,max:24,slots:['head','robe','offhand','belt','amulet','ring1','ring2']},
  armor:{name:'护甲',min:3,max:18,slots:['head','shoulders','robe','gloves','belt','boots','offhand']},
  crit:{name:'暴击率 %',min:1,max:5,slots:['weapon','gloves','amulet','ring1','ring2']},
  critDmg:{name:'暴击伤害 %',min:5,max:17,slots:['weapon','gloves','amulet','ring1','ring2']},
  haste:{name:'攻击/施法速度 %',min:2,max:9,slots:['weapon','gloves','offhand','amulet','ring1','ring2']},
  fire:{name:'火焰增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2']},
  cold:{name:'冰霜增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2']},
  lightning:{name:'雷电增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2']},
  physical:{name:'物理增伤 %',min:3,max:13,slots:['weapon','gloves','amulet','ring1','ring2']},
  poison:{name:'毒素增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2']},
  holy:{name:'神圣增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2']},
  shadow:{name:'暗影增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2']},
  move:{name:'移动速度 %',min:2,max:8,slots:['boots']},
  sk_amazon:{name:'亚马逊技能等级',min:1,max:1,cls:'amazon',slots:['weapon','offhand','amulet','head']},
  sk_assassin:{name:'刺客技能等级',min:1,max:1,cls:'assassin',slots:['weapon','offhand','amulet','head']},
  sk_barbarian:{name:'野蛮人技能等级',min:1,max:1,cls:'barbarian',slots:['weapon','offhand','amulet','head']},
  sk_druid:{name:'德鲁伊技能等级',min:1,max:1,cls:'druid',slots:['weapon','offhand','amulet','head']},
  sk_necro:{name:'死灵法师技能等级',min:1,max:1,cls:'necro',slots:['weapon','offhand','amulet','head']},
  sk_paladin:{name:'圣骑士技能等级',min:1,max:1,cls:'paladin',slots:['weapon','offhand','amulet','head']},
  sk_mage:{name:'法师技能等级',min:1,max:1,cls:'mage',slots:['weapon','offhand','amulet','head']},
  resistFire:{name:'火焰抗性 %',min:3,max:12,slots:['head','robe','shoulders','belt','boots','ring1','ring2']},
  resistCold:{name:'冰霜抗性 %',min:3,max:12,slots:['head','robe','shoulders','belt','boots','ring1','ring2']},
  resistDark:{name:'暗影抗性 %',min:3,max:12,slots:['head','robe','shoulders','belt','boots','ring1','ring2']},
  regen:{name:'每秒法力恢复',min:1,max:5,slots:['offhand','amulet','ring1','ring2']},
  lifesteal:{name:'击中回复生命',min:1,max:4,slots:['weapon','gloves','ring1','ring2']},
  skillFire:{name:'火系技能等级',min:1,max:1,slots:['weapon','amulet','offhand']},
  skillCold:{name:'冰系技能等级',min:1,max:1,slots:['weapon','amulet','offhand']}
};
export const SETS={
  dragonflame:{name:'龙焰法衣',slots:['head','robe','gloves'],two:'火焰增伤 +15%',three:'每第三次火系命中附加爆炎',special:{fire:15}},
  warden:{name:'监牢审判',slots:['weapon','offhand','belt'],two:'护甲 +25',three:'生命 +70 与暴击率 +5%',special:{armor:25}}
};
// v0.4.1：31 个技能，分火、冰、雷、奥术四系。按键不再绑死在技能上，由技能栏的格子决定。
export const SKILL_SCHOOLS=Object.freeze({fire:'火焰',cold:'冰霜',lightning:'雷电',arcane:'奥术'});
export const SKILLS={
  // 火焰
  fire:{name:'余烬箭',school:'fire',icon:'✹',mana:0,cooldown:.28,unlocked:1,desc:'射出灼热火弹，基础攻击'},
  fireball:{name:'火球',school:'fire',icon:'☀',mana:10,cooldown:.7,unlocked:2,desc:'命中或飞尽时爆炸，范围火焰伤害'},
  meteor:{name:'陨火',school:'fire',icon:'☄',mana:42,cooldown:8,unlocked:3,desc:'预警后陨石坠落，大范围重击'},
  firenova:{name:'烈焰新星',school:'fire',icon:'✺',mana:26,cooldown:5,unlocked:5,desc:'以自身为中心爆发火环并点燃地面'},
  hydra:{name:'九头炎蛇',school:'fire',icon:'♆',mana:30,cooldown:9,unlocked:9,desc:'召唤炎蛇 8 秒，自动向附近敌人喷火（最多 2 条）'},
  inferno:{name:'烈焰地径',school:'fire',icon:'♨',mana:30,cooldown:7,unlocked:10,desc:'面前铺开火线，持续灼烧接近的敌人'},
  firewall:{name:'火墙',school:'fire',icon:'▥',mana:34,cooldown:8,unlocked:12,desc:'在前方横向升起一道火墙，阻挡并灼烧敌群'},
  armageddon:{name:'末日火雨',school:'fire',icon:'☢',mana:60,cooldown:20,unlocked:18,desc:'6 秒内火雨不断砸向你周围的敌人'},
  // 冰霜
  shard:{name:'冰晶箭',school:'cold',icon:'✧',mana:12,cooldown:.9,unlocked:1,desc:'穿透两名敌人的冰晶，减速'},
  nova:{name:'霜环',school:'cold',icon:'❄',mana:28,cooldown:4.8,unlocked:1,desc:'冰刺环向外扩散，伤害并减速周围敌人'},
  armor:{name:'冰甲',school:'cold',icon:'◆',mana:24,cooldown:14,unlocked:2,desc:'短时间大幅减免受到的伤害'},
  glacial:{name:'冰川尖刺',school:'cold',icon:'⟡',mana:16,cooldown:2.4,unlocked:4,desc:'命中后炸开，冻结小范围敌人'},
  storm:{name:'冰暴领域',school:'cold',icon:'❅',mana:34,cooldown:9,unlocked:6,desc:'持续 4 秒的冰暴，减速并持续伤害'},
  frozenorb:{name:'冰封球',school:'cold',icon:'✻',mana:32,cooldown:4,unlocked:7,desc:'缓慢飞行，沿途向四周喷射冰片，末端爆裂'},
  blades:{name:'冰刃环绕',school:'cold',icon:'⚝',mana:28,cooldown:12,unlocked:11,desc:'6 秒内冰刃绕身旋转，切割贴近的敌人'},
  deepfreeze:{name:'极寒冻结',school:'cold',icon:'❆',mana:45,cooldown:16,unlocked:16,desc:'冻结周围所有敌人 2 秒（首领时间减半）'},
  // 雷电
  cbolt:{name:'电荷弹',school:'lightning',icon:'⁂',mana:8,cooldown:.55,unlocked:1,desc:'射出 5 颗乱窜的电球，近身时很强'},
  lightning:{name:'闪电',school:'lightning',icon:'⚡',mana:14,cooldown:1.1,unlocked:3,desc:'一道直线闪电，贯穿路径上所有敌人'},
  chain:{name:'连锁闪电',school:'lightning',icon:'Ϟ',mana:20,cooldown:2.2,unlocked:4,desc:'在多个敌人间跳跃；强化后跳得更多'},
  lnova:{name:'雷霆新星',school:'lightning',icon:'✴',mana:24,cooldown:4,unlocked:6,desc:'雷电向四周炸开，伤害周围敌人'},
  ballz:{name:'球状闪电',school:'lightning',icon:'◉',mana:22,cooldown:3,unlocked:10,desc:'缓慢的雷球穿过敌群，反复电击沿途敌人'},
  thunder:{name:'雷暴',school:'lightning',icon:'☈',mana:40,cooldown:18,unlocked:14,desc:'10 秒内每秒落雷劈向附近的敌人'},
  // 奥术
  mmissile:{name:'奥术飞弹',school:'arcane',icon:'✦',mana:9,cooldown:.65,unlocked:1,desc:'3 枚自动追踪的飞弹'},
  blink:{name:'闪现',school:'arcane',icon:'ϟ',mana:20,cooldown:3.6,unlocked:1,desc:'短距离位移，并短暂无敌'},
  heal:{name:'恢复药剂',school:'arcane',icon:'✚',mana:0,cooldown:14,unlocked:1,desc:'恢复 48% 最大生命'},
  haste:{name:'迅捷',school:'arcane',icon:'➶',mana:20,cooldown:15,unlocked:5,desc:'6 秒内移动速度 +35%、技能冷却加快'},
  manasurge:{name:'法力涌动',school:'arcane',icon:'❂',mana:0,cooldown:25,unlocked:7,desc:'立即恢复 45% 最大法力'},
  ward:{name:'奥术护盾',school:'arcane',icon:'⬡',mana:28,cooldown:16,unlocked:8,desc:'生成吸收伤害的护盾，技能等级提高容量'},
  barrage:{name:'奥术弹幕',school:'arcane',icon:'⁜',mana:18,cooldown:1.6,unlocked:8,desc:'扇形射出 7 枚奥术弹'},
  slowtime:{name:'时间减缓',school:'arcane',icon:'⌛',mana:36,cooldown:14,unlocked:13,desc:'5 秒的时间泡：敌人和敌方弹道大幅变慢'},
  blackhole:{name:'黑洞',school:'arcane',icon:'●',mana:44,cooldown:12,unlocked:15,desc:'把附近敌人吸向中心并持续伤害'}
};
for(const s of Object.values(SKILLS)){s.cls='mage';s.tree=s.school;}
Object.assign(SKILLS,CLASS_SKILLS);
export const skillsOf=cls=>Object.keys(SKILLS).filter(k=>SKILLS[k].cls===cls);
export const ACTIVE_LIMIT=10;
export const DEFAULT_ACTIVE=Object.freeze(['fire','shard','nova','meteor','chain','ward','heal','armor','storm','blink']);
export const defaultActive=cls=>[...(CLASSES[cls]||CLASSES.mage).defaults];
export const DEFAULT_KEYS=Object.freeze(['1','2','3','4','5','q','e','r','f',' ']);
export const RESERVED_KEYS=Object.freeze(['w','a','s','d','b','t','c','escape','arrowup','arrowdown','arrowleft','arrowright','tab','enter','meta','control','alt','shift']);
/** 允许绑定的按键：数字、字母（除保留键）、空格、常见符号与 F1-F12。 */
export function bindableKey(k){
  if(typeof k!=='string')return false;k=k.toLowerCase();
  if(RESERVED_KEYS.includes(k))return false;
  return /^[a-z0-9 `\-=\[\];',./\\]$/.test(k)||/^f([1-9]|1[0-2])$/.test(k);
}
export function keyLabel(k){
  if(k===' ')return '空格';
  if(/^f\d+$/.test(k))return k.toUpperCase();
  return k.length===1?k.toUpperCase():k;
}

export const REGION_DATA=[
  {id:'entrance',name:'断昼前庭',label:'破败石厅',color:'#d48d55',types:['wretch','archer','wretch','brute']},
  {id:'prison',name:'遗弃监牢',label:'铁栏与锁链',color:'#b9a37b',types:['archer','wretch','brute','cultist']},
  {id:'ritual',name:'余烬祭坛',label:'血色符文',color:'#c95540',types:['cultist','archer','spider','brute']},
  {id:'cavern',name:'渊底裂隙',label:'地下洞窟',color:'#719ca8',types:['spider','spider','wretch','brute']},
  {id:'sanctum',name:'失名者圣所',label:'燃尽的炉心',color:'#98618d',types:['cultist','brute','spider','archer']},
  {id:'tomb',name:'古墓甬道',label:'幽暗墓穴',color:'#8a918c',types:['wretch','archer','cultist','spider']},
  {id:'courtyard',name:'腐化庭院',label:'枯萎圣树',color:'#72885a',types:['spider','brute','wretch','cultist']},
  {id:'crypt',name:'寒霜陵寝',label:'永冻石棺',color:'#73a5be',types:['archer','cultist','spider','brute']},
  {id:'obsidian',name:'黑曜王座',label:'火与黑曜石',color:'#c57550',types:['brute','cultist','brute','archer']}
];
const safeNum=(x,max=9999)=>Math.max(0,Math.min(max,Math.floor(Number.isFinite(x)?x:0)));
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=100;
export function normalizeItem(item) {
  if(!item||typeof item!=='object'||!validId(item.id))return null;
  const legacy=Object.hasOwn(LEGACY_SLOTS,item.slot);
  if(!legacy&&!SLOT_IDS.includes(item.slot))return null;
  if(typeof item.name!=='string'||item.name.length>64)return null;
  if(['power','hp','mana','armor','value'].some(k=>!Number.isFinite(item[k]??0)))return null;
  const rarity=Number.isInteger(item.rarity)?Math.max(0,Math.min(4,item.rarity)):0;
  const seen=new Set(),affixes=[];
  if(Array.isArray(item.affixes))for(const entry of item.affixes.slice(0,12)){
    if(entry&&Object.hasOwn(AFFIXES,entry.key)&&(legacy||AFFIXES[entry.key].slots.includes(item.slot))&&!seen.has(entry.key)){
      affixes.push({key:entry.key,value:safeNum(entry.value,1000)});seen.add(entry.key);
    }
  }
  const setId=!legacy&&rarity===4&&Object.hasOwn(SETS,item.setId)&&SETS[item.setId].slots.includes(item.slot)?item.setId:null;
  // 图鉴记录：必须与装备槽一致；缺失时（旧存档）按 ID 稳定挑选同槽同品质记录并改用其名称。
  let name=item.name,entry=null;
  if(!legacy){
    const given=CATALOG_BY_ID.get(item.cid);
    const boss=CATALOG_BY_ID.get(BOSS_ITEM_ICONS[name]);
    if(given&&given.s===slotGroup(item.slot))entry=given;
    else if(boss&&boss.s===slotGroup(item.slot))entry=boss;
    else{
      const pool=catalogPool(rarity,item.slot);
      entry=pool[hashId(item.id)%pool.length];
      name=entry.n;
    }
  }
  return {
    id:item.id,slot:item.slot,name,rarity,ilvl:safeNum(item.ilvl||1,60),
    power:safeNum(item.power),hp:safeNum(item.hp),mana:safeNum(item.mana),
    armor:safeNum(item.armor),value:safeNum(item.value,99999),affixes,setId,
    cid:entry?.id||null,hands:entry?.h===2?2:1,legacy,
    favorite:item.favorite===true,tempered:item.tempered===true
  };
}
export function getSlotForItem(item,target){
  if(!item||item.legacy||!SLOT_IDS.includes(item.slot))return null;
  if(['ring1','ring2'].includes(item.slot))return ['ring1','ring2'].includes(target)?target:item.slot;
  return item.slot===target||target==null?item.slot:null;
}
const ELEMENT={火:'fire',炎:'fire',霜:'cold',冰:'cold',雷:'lightning',毒:'poison',光:'holy',暗影:'shadow',血:'lifesteal',岩:'armor',风:'haste'};
export function makeLoot(rng,level,id,{boss=false,cls=null}={}){
  const n=Math.max(1,Math.min(60,level));
  const roll=rng();
  const rarity=boss&&roll<.10?4:roll<.035?3:roll<.20?2:roll<.56?1:0;
  const setId=rarity===4&&rng()<.5?(rng()<.5?'dragonflame':'warden'):null;
  const groups=SLOT_IDS.filter(s=>s!=='ring2');
  const slot=setId?SETS[setId].slots[Math.floor(rng()*3)]:groups[Math.floor(rng()*groups.length)];
  let pool=catalogPool(rarity,slot);
  // 掉落偏向当前职业：60% 只在“偏好职业”为当前职业或全职业的装备里挑
  if(cls&&CLASSES[cls]&&rng()<.6){const mine=pool.filter(c=>c.cls===CLASSES[cls].catalog||c.cls==='全职业');if(mine.length)pool=mine;}
  const entry=pool[Math.floor(rng()*pool.length)],owner=CLASS_BY_CATALOG[entry.cls];
  const affixMax=[0,2,4,5,5][rarity],affixMin=[0,1,2,3,setId?2:4][rarity];
  const count=affixMax?Math.max(affixMin,Math.min(affixMax,Math.floor(rng()*affixMax)+1)):0;
  // 职业技能词条只出现在该职业偏好的装备上；元素等级词条只出现在法师装备上
  const choices=Object.keys(AFFIXES).filter(k=>AFFIXES[k].slots.includes(slot)&&(!AFFIXES[k].cls||AFFIXES[k].cls===owner)&&(!k.startsWith('skill')||owner==='mage'));
  if(owner&&rarity>=2&&choices.includes('sk_'+owner)){choices.splice(choices.indexOf('sk_'+owner),1);choices.unshift('sk_'+owner);}
  // 图鉴元素倾向（火/霜）优先出对应增伤词缀，让名字、图标和属性一致。
  const lean=ELEMENT[entry.aff];
  if(lean&&choices.includes(lean)){choices.splice(choices.indexOf(lean),1);choices.splice(choices[0]?.startsWith('sk_')?1:0,0,lean);}
  const affixes=[];
  for(let i=0;i<count&&choices.length;i++){
    const index=(choices[0]?.startsWith('sk_')||choices[0]===lean)&&i<2?0:Math.floor(rng()*choices.length);
    const key=choices.splice(index,1)[0],rule=AFFIXES[key];
    const scaling=1+Math.floor(n/7)*.23;
    affixes.push({key,value:Math.max(1,Math.round((rule.min+rng()*(rule.max-rule.min))*scaling))});
  }
  const quiver=entry.sub==='箭囊';
  const armorSlot=['head','shoulders','robe','gloves','belt','boots','offhand'].includes(slot)&&!quiver;
  const weaponSlot=slot==='weapon',twoHand=entry.h===2;
  return normalizeItem({
    id,slot,rarity,ilvl:n,name:entry.n,cid:entry.id,
    power:weaponSlot?Math.round((6+n*2.5)*(1+rarity*.27)*(twoHand?1.4:1)):quiver?Math.round((3+n*.9)*(1+rarity*.2)):0,
    hp:slot==='robe'?Math.round(10+n*2.6):0,
    mana:slot==='offhand'&&!quiver?Math.round(10+n*1.4):0,
    armor:armorSlot?Math.round((7+n*1.1)*(1+rarity*.19)):0,
    value:10+n*5+rarity*22,affixes,setId
  });
}
export function emptyEquipment(){return Object.fromEntries(SLOT_IDS.map(s=>[s,null]));}
export function equipmentBonus(profile) {
  const extra={},totals={}; const itemById=new Map(profile.inventory.map(i=>[i.id,i]));
  for(const slot of SLOT_IDS){
    const item=itemById.get(profile.equipped[slot]);
    if(!item||getSlotForItem(item,slot)!==slot)continue;
    if(slot==='offhand'&&!offhandAllowed(itemById.get(profile.equipped.weapon),item))continue;
    for(const key of ['power','hp','mana','armor'])extra[key]=(extra[key]||0)+(item[key]||0);
    for(const affix of item.affixes||[])extra[affix.key]=(extra[affix.key]||0)+affix.value;
    if(item.setId)totals[item.setId]=(totals[item.setId]||0)+1;
  }
  for(const [id,count] of Object.entries(totals)){
    if(count>=2)for(const [key,value] of Object.entries(SETS[id].special))extra[key]=(extra[key]||0)+value;
    if(count>=3&&id==='warden'){extra.hp=(extra.hp||0)+70;extra.crit=(extra.crit||0)+5;}
  }
  return {extra,sets:totals};
}
export function calculateStats(profile){
  const {extra,sets}=equipmentBonus(profile);
  const value=(k,d=0)=>(extra[k]||0)+d;
  const cls=CLASSES[profile.heroClass]?profile.heroClass:'mage',C=CLASSES[cls];
  const weapon=profile.inventory.find(i=>i.id===profile.equipped?.weapon),wsub=catalogEntry(weapon)?.sub||null;
  const off=profile.inventory.find(i=>i.id===profile.equipped?.offhand),osub=catalogEntry(off)?.sub||null;
  return {cls,power:17+profile.level*3+value('power'),hp:C.hp+(profile.level-1)*C.hpLv+value('hp'),
    mana:C.mana+value('mana'),armor:C.armor+value('armor'),
    crit:Math.min(70,5+C.crit+value('crit')),critDmg:50+value('critDmg'),
    weapon:wsub,attack:attackMode(cls,wsub),proficient:proficient(cls,wsub),offProficient:proficient(cls,osub),
    physical:value('physical'),poison:value('poison'),holy:value('holy'),shadow:value('shadow'),
    move:Math.min(40,value('move')),classSkill:value('sk_'+cls),
    haste:Math.min(70,value('haste')),fire:value('fire'),cold:value('cold'),lightning:value('lightning'),
    resistFire:Math.min(75,value('resistFire')),resistCold:Math.min(75,value('resistCold')),
    resistDark:Math.min(75,value('resistDark')),regen:C.regen+value('regen'),
    lifesteal:value('lifesteal'),skillFire:value('skillFire'),skillCold:value('skillCold'),sets};
}
export function formatAffixes(item){
  const entries=[];
  for(const key of ['power','hp','mana','armor'])if(item[key])entries.push('+'+item[key]+' '+({power:'法术强度',hp:'最大生命',mana:'法力',armor:'护甲'})[key]);
  for(const a of item.affixes||[])entries.push('+'+a.value+(a.key.startsWith('skill')?' 级 ':' ')+AFFIXES[a.key].name);
  if(item.setId)entries.push('套装：'+SETS[item.setId].name);
  return entries;
}
export function itemScore(i) {
  return i.power*2+i.hp*.22+i.mana*.17+i.armor*.33+(i.affixes||[]).reduce((sum,a)=>sum+a.value*(a.key==='power'?2:a.key.startsWith('skill')?12:.75),0);
}
