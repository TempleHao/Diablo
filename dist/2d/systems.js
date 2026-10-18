/* 余烬纪事：装备、词缀与职业构筑（纯规则，无 DOM 依赖）。 */
import {CATALOG} from './equipment-catalog.js';
// v0.4：装备槽与「黑铁遗珍」装备库对齐（法师可用 11 槽）。双手法杖占用副手。
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
  haste:{name:'施法速度 %',min:2,max:9,slots:['weapon','gloves','offhand','amulet','ring1','ring2']},
  fire:{name:'火焰增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2']},
  cold:{name:'冰霜增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2']},
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
export const SKILLS={
  fire:{name:'余烬箭',key:'1',school:'fire',icon:'✹',mana:0,cooldown:.28,unlocked:1,desc:'射出灼热火弹；装备火系词缀可强化伤害'},
  nova:{name:'霜环',key:'2',school:'cold',icon:'❄',mana:28,cooldown:4.8,unlocked:1,desc:'对周围敌人造成伤害并减速'},
  shard:{name:'冰晶箭',key:'3',school:'cold',icon:'✧',mana:12,cooldown:.9,unlocked:1,desc:'一束穿刺冰晶；远程减速'},
  armor:{name:'冰甲',key:'4',school:'cold',icon:'◆',mana:24,cooldown:14,unlocked:2,desc:'短时间减免受到的伤害'},
  meteor:{name:'陨火',key:'q',school:'fire',icon:'☄',mana:42,cooldown:8,unlocked:3,desc:'在敌群位置引爆陨火范围伤害'},
  blink:{name:'闪现',key:'空格',school:'arcane',icon:'ϟ',mana:20,cooldown:3.6,unlocked:1,desc:'短距离位移，并短暂无敌'},
  heal:{name:'恢复药剂',key:'e',school:'arcane',icon:'✚',mana:0,cooldown:14,unlocked:1,desc:'恢复 48% 最大生命'},
  chain:{name:'连锁闪电',key:'5',school:'arcane',icon:'Ϟ',mana:20,cooldown:2.2,unlocked:4,desc:'在最多 3 个敌人间跳跃；强化后跳跃更多'},
  storm:{name:'冰暴领域',key:'6',school:'cold',icon:'❅',mana:34,cooldown:9,unlocked:6,desc:'持续四秒的冰暴领域；冻结减速并持续造成伤害'},
  ward:{name:'奥术护盾',key:'z',school:'arcane',icon:'⬡',mana:28,cooldown:16,unlocked:8,desc:'生成吸收伤害的护盾，技能等级提高容量'},
  inferno:{name:'烈焰地径',key:'x',school:'fire',icon:'♨',mana:30,cooldown:7,unlocked:10,desc:'面前铺开灼烧火线，持续四秒使接近的敌人受伤'}
};
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
const ELEMENT={火:'fire',炎:'fire',霜:'cold',冰:'cold'};
export function makeLoot(rng,level,id,{boss=false}={}){
  const n=Math.max(1,Math.min(60,level));
  const roll=rng();
  const rarity=boss&&roll<.10?4:roll<.035?3:roll<.20?2:roll<.56?1:0;
  const setId=rarity===4&&rng()<.5?(rng()<.5?'dragonflame':'warden'):null;
  const groups=SLOT_IDS.filter(s=>s!=='ring2');
  const slot=setId?SETS[setId].slots[Math.floor(rng()*3)]:groups[Math.floor(rng()*groups.length)];
  const pool=catalogPool(rarity,slot),entry=pool[Math.floor(rng()*pool.length)];
  const affixMax=[0,2,4,5,5][rarity],affixMin=[0,1,2,3,setId?2:4][rarity];
  const count=affixMax?Math.max(affixMin,Math.min(affixMax,Math.floor(rng()*affixMax)+1)):0;
  const choices=Object.keys(AFFIXES).filter(k=>AFFIXES[k].slots.includes(slot));
  // 图鉴元素倾向（火/霜）优先出对应增伤词缀，让名字、图标和属性一致。
  const lean=ELEMENT[entry.aff];
  if(lean&&choices.includes(lean)){choices.splice(choices.indexOf(lean),1);choices.unshift(lean);}
  const affixes=[];
  for(let i=0;i<count&&choices.length;i++){
    const index=i===0&&lean&&choices[0]===lean?0:Math.floor(rng()*choices.length);
    const key=choices.splice(index,1)[0],rule=AFFIXES[key];
    const scaling=1+Math.floor(n/7)*.23;
    affixes.push({key,value:Math.max(1,Math.round((rule.min+rng()*(rule.max-rule.min))*scaling))});
  }
  const armorSlot=['head','shoulders','robe','gloves','belt','boots','offhand'].includes(slot);
  const weaponSlot=slot==='weapon',twoHand=entry.h===2;
  return normalizeItem({
    id,slot,rarity,ilvl:n,name:entry.n,cid:entry.id,
    power:weaponSlot?Math.round((6+n*2.5)*(1+rarity*.27)*(twoHand?1.4:1)):0,
    hp:slot==='robe'?Math.round(10+n*2.6):0,
    mana:slot==='offhand'?Math.round(10+n*1.4):0,
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
    if(slot==='offhand'&&itemById.get(profile.equipped.weapon)?.hands===2)continue;
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
  return {power:17+profile.level*3+value('power'),hp:105+(profile.level-1)*13+value('hp'),
    mana:100+value('mana'),armor:value('armor'),
    crit:Math.min(70,5+value('crit')),critDmg:50+value('critDmg'),
    haste:Math.min(70,value('haste')),fire:value('fire'),cold:value('cold'),
    resistFire:Math.min(75,value('resistFire')),resistCold:Math.min(75,value('resistCold')),
    resistDark:Math.min(75,value('resistDark')),regen:7+value('regen'),
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
