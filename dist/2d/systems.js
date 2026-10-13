/* 余烬纪事：装备、词缀与职业构筑（纯规则，无 DOM 依赖）。 */
export const SLOTS = Object.freeze([
  ['head','头盔','⛑'],['shoulders','肩甲','♜'],['robe','胸甲','♟'],
  ['gloves','手套','♧'],['belt','腰带','▤'],['pants','腿甲','♙'],
  ['boots','靴子','♢'],['weapon','主手','⚔'],['offhand','副手','◈'],
  ['amulet','护符','❖'],['ring1','戒指 I','◇'],['ring2','戒指 II','◇'],['charm','遗物','✦']
]);
export const SLOT_IDS=SLOTS.map(x=>x[0]);
export const MAX_ITEMS=80;
export const RARITIES=['普通','魔法','稀有','传奇','套装'];
export const BASES={
  head:['旧皮兜帽','夜行头冠','灰烬面罩','凋零战盔','圣痕面甲','寒铁王冠'],shoulders:['旅者披肩','铜棘护肩','监牢铁肩','守夜肩甲','风暴披肩','兽骨护肩'],
  robe:['行旅布袍','锁链法衣','刻印重甲','暗纹战袍','铁壁胸铠','秘银护胸'],gloves:['粗革手套','幽影指套','烬纹手甲','符咒护手','骑士护腕','蚀骨指套'],
  belt:['破旧皮带','符文腰封','守卫束带','猎魔腰带','锁环革带','隐秘腰封'],pants:['褐布护腿','疾行裹腿','守誓腿甲','夜行腿铠','魂铁长裤','荆刺护腿'],
  boots:['磨损长靴','暗影足具','灰烬战靴','铁制战靴','秘银行靴','雾隐短靴'],
  weapon:['焦木法杖','灼魂魔杖','仪式秘杖','白骨长剑','凶魂匕首','远古战剑','月蚀法杖','缚魂魔杖','誓约长剑','碎星仪杖'],
  offhand:['裂纹秘典','黑铁圆盾','古旧法器','灾厄魔典','骑士之盾','镶金法典'],amulet:['石制护符','霜痕吊坠','断昼徽章','荆棘项链','曜石护符','月银吊坠'],
  ring1:['无名铜戒','烬火戒指','银色指环','誓火宝戒','寒玉戒','骸骨法戒'],ring2:['无名铜戒','烬火戒指','银色指环','誓火宝戒','寒玉戒','骸骨法戒'],
  charm:['破碎圣印','先知之眼','炉心遗物','黑曜宝珠','永燃符石','噩梦刻印']
};
export const AFFIXES={
  power:{name:'法术强度',min:2,max:11,slots:['weapon','offhand','amulet','ring1','ring2','charm','gloves']},
  hp:{name:'最大生命',min:8,max:36,slots:['head','shoulders','robe','gloves','belt','pants','boots','amulet','ring1','ring2','charm']},
  mana:{name:'最大法力',min:6,max:24,slots:['head','robe','offhand','belt','amulet','ring1','ring2','charm']},
  armor:{name:'护甲',min:3,max:18,slots:['head','shoulders','robe','gloves','belt','pants','boots','offhand']},
  crit:{name:'暴击率 %',min:1,max:5,slots:['weapon','gloves','amulet','ring1','ring2','charm']},
  critDmg:{name:'暴击伤害 %',min:5,max:17,slots:['weapon','gloves','amulet','ring1','ring2','charm']},
  haste:{name:'施法速度 %',min:2,max:9,slots:['weapon','gloves','offhand','amulet','ring1','ring2']},
  fire:{name:'火焰增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2','charm']},
  cold:{name:'冰霜增伤 %',min:3,max:13,slots:['weapon','offhand','amulet','ring1','ring2','charm']},
  resistFire:{name:'火焰抗性 %',min:3,max:12,slots:['head','robe','shoulders','belt','boots','ring1','ring2']},
  resistCold:{name:'冰霜抗性 %',min:3,max:12,slots:['head','robe','shoulders','belt','boots','ring1','ring2']},
  resistDark:{name:'暗影抗性 %',min:3,max:12,slots:['head','robe','shoulders','belt','boots','ring1','ring2']},
  regen:{name:'每秒法力恢复',min:1,max:5,slots:['offhand','amulet','ring1','ring2','charm']},
  lifesteal:{name:'击中回复生命',min:1,max:4,slots:['weapon','gloves','ring1','ring2','charm']},
  skillFire:{name:'火系技能等级',min:1,max:1,slots:['weapon','amulet','charm']},
  skillCold:{name:'冰系技能等级',min:1,max:1,slots:['weapon','amulet','charm']}
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
  heal:{name:'恢复药剂',key:'e',school:'arcane',icon:'✚',mana:0,cooldown:14,unlocked:1,desc:'恢复 48% 最大生命'}
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
  if(!item||typeof item!=='object'||!validId(item.id)||!SLOT_IDS.includes(item.slot))return null;
  if(typeof item.name!=='string'||item.name.length>64)return null;
  if(['power','hp','mana','armor','value'].some(k=>!Number.isFinite(item[k]??0)))return null;
  const rarity=Number.isInteger(item.rarity)?Math.max(0,Math.min(4,item.rarity)):0;
  const seen=new Set(),affixes=[];
  if(Array.isArray(item.affixes))for(const entry of item.affixes.slice(0,12)){
    if(entry&&Object.hasOwn(AFFIXES,entry.key)&&AFFIXES[entry.key].slots.includes(item.slot)&&!seen.has(entry.key)){
      affixes.push({key:entry.key,value:safeNum(entry.value,1000)});seen.add(entry.key);
    }
  }
  const setId=rarity===4&&Object.hasOwn(SETS,item.setId)&&SETS[item.setId].slots.includes(item.slot)?item.setId:null;
  return {
    id:item.id,slot:item.slot,name:item.name,rarity,ilvl:safeNum(item.ilvl||1,60),
    power:safeNum(item.power),hp:safeNum(item.hp),mana:safeNum(item.mana),
    armor:safeNum(item.armor),value:safeNum(item.value,99999),affixes,setId
  };
}
export function getSlotForItem(item,target){
  if(!item)return null;
  if(['ring1','ring2'].includes(item.slot))return ['ring1','ring2'].includes(target)?target:item.slot;
  return item.slot===target||target==null?item.slot:null;
}
export function makeLoot(rng,level,id,{boss=false}={}){
  const n=Math.max(1,Math.min(60,level));
  const roll=rng();
  const rarity=boss&&roll<.10?4:roll<.035?3:roll<.20?2:roll<.56?1:0;
  const setId=rarity===4?(rng()<.5?'dragonflame':'warden'):null;
  const slot=setId?SETS[setId].slots[Math.floor(rng()*3)]:SLOT_IDS[Math.floor(rng()*SLOT_IDS.length)];
  const base=BASES[slot];
  const name=base[Math.floor(rng()*base.length)];
  const affixMax=rarity===0?0:rarity===1?2:rarity===2?4:5;
  const count=affixMax? Math.max(1,Math.min(affixMax,Math.floor(rng()*affixMax)+1)):0;
  const choices=Object.keys(AFFIXES).filter(k=>AFFIXES[k].slots.includes(slot));
  const affixes=[];
  for(let i=0;i<count&&choices.length;i++){
    const index=Math.floor(rng()*choices.length);
    const key=choices.splice(index,1)[0],rule=AFFIXES[key];
    const scaling=1+Math.floor(n/7)*.23;
    affixes.push({key,value:Math.max(1,Math.round((rule.min+rng()*(rule.max-rule.min))*scaling))});
  }
  const armorSlot=['head','shoulders','robe','gloves','belt','pants','boots','offhand'].includes(slot);
  const weaponSlot=slot==='weapon';
  return normalizeItem({
    id,slot,rarity,ilvl:n,name:(setId?SETS[setId].name+' · ':rarity===3?'远古 · ':'')+name,
    power:weaponSlot?Math.round((6+n*2.5)*(1+rarity*.27)):0,
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
