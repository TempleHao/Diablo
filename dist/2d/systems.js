/* 归墟：装备、词缀与职业构筑（纯规则，无 DOM 依赖）。
 * v0.7：装备库扩到 1551 件图鉴（旧 500 + 七职业基底 760 + 职业传奇 291），D2 式掉落（见 docs/2D-LOOT.md）、
 *       物品等级到 100、需求等级、寻宝几率、传奇特效（legendary.js）、职业套装。 */
import {CATALOG} from './equipment-catalog.js';
import {CLASS_BASES,CLASS_LEGENDS,SET_PIECES,CLASS_SET_NAMES} from './class-catalog.js';
import {CLASSES,CLASS_IDS,CLASS_BY_CATALOG,proficient,attackMode,WEAPON_TYPES} from './classes.js';
import {CLASS_SKILLS} from './class-skills.js';
import {nameItem,BASES as NAME_BASES,baseIndex} from './naming.js';
import {powersOf,emptyLegend,addPower} from './legendary.js';
export {CLASSES,CLASS_IDS,proficient,attackMode};
// v0.4：装备槽与「黑铁遗珍」装备库对齐（11 槽）。双手武器占用副手；弓弩例外，可以配箭袋。
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
export const MAX_LEVEL=100;
export const RARITIES=['普通','魔法','史诗','传奇','暗金'];
export const RARITY_COLORS=Object.freeze(['#c9c6bd','#5aa6ff','#b86cff','#ff8c2e','#dcb25e']);
export const SET_COLOR='#5fd36b';
// 旧图鉴：品质决定图集（N/M/E/L/U）。v0.7 职业图鉴自带图集 a（C-职业 基底，K-职业 传奇）。
const OLD=CATALOG.map(c=>({...c,a:'NMELU'[c.r]}));
const LEGENDS=CLASS_LEGENDS.map(c=>({...c,r:3}));
const ALL=[...OLD,...CLASS_BASES.map(c=>({...c,r:-1})),...LEGENDS].map(Object.freeze);
export const CATALOG_BY_ID=new Map(ALL.map(c=>[c.id,c]));
export const slotGroup=slot=>slot==='ring2'?'ring1':slot;
const bySlot=list=>{const m={};for(const c of list)(m[c.s]||=[]).push(c);for(const k in m)m[k].sort((a,b)=>a.q-b.q);return m;};
// 掉落池：基底（白/蓝/黄装）、传奇、暗金
export const POOLS=Object.freeze({
  base:bySlot(ALL.filter(c=>c.r<=2)),
  legend:bySlot(ALL.filter(c=>c.r===3)),
  unique:bySlot(ALL.filter(c=>c.r===4))
});
/** 兼容旧接口：品质 0-2 返回基底池，3 传奇池，4 暗金池。 */
export const catalogPool=(rarity,slot)=>(rarity>=4?POOLS.unique:rarity===3?POOLS.legend:POOLS.base)[slotGroup(slot)]||[];
export const catalogEntry=item=>CATALOG_BY_ID.get(item?.cid)||null;
// ───── v1.3 职业区隔（参照 D2：武器按职业会用的类型、带职业的传奇 / 暗金 / 套装专属，普通防具首饰通用）─────
// 某种武器 / 副手类型由哪些职业使用（来自 classes.js 各职业的武器表）；不在任何表里的类型（如圆盾）通用
const TYPE_USERS=new Map();
for(const c of CLASS_IDS)for(const sub of CLASSES[c].weapons||[]){if(!TYPE_USERS.has(sub))TYPE_USERS.set(sub,new Set());TYPE_USERS.get(sub).add(c);}
const typeOk=(e,cls)=>!(e.s==='weapon'||e.s==='offhand')||!TYPE_USERS.has(e.sub)||TYPE_USERS.get(e.sub).has(cls);
/** 能穿这件装备的职业：null 表示全职业通用，否则返回职业 id 数组。
 *  1) 职业套装 → 只限该职业；2) 传奇 / 暗金带归属职业 → 只限该职业；3) 武器 / 副手 → 会用这种类型的职业；4) 其余（普通到史诗的防具、首饰）通用。 */
export function itemClasses(item){
  const e=catalogEntry(item);if(!e||item?.legacy)return null;
  const set=item.setId&&SETS[item.setId];
  if(set?.cls)return [set.cls];
  if(item.rarity>=3&&!item.setId){const o=e.owner||CLASS_BY_CATALOG[e.cls];if(o&&CLASSES[o])return [o];}
  if((e.s==='weapon'||e.s==='offhand')&&TYPE_USERS.has(e.sub))return [...TYPE_USERS.get(e.sub)];
  return null;
}
export const canUseItem=(item,cls)=>{const u=itemClasses(item);return !u||u.includes(cls||'mage');};
/** 给界面用：「野蛮人 / 圣骑士 专属」或「通用」。 */
export const itemClassLabel=item=>{const u=itemClasses(item);return u?u.map(c=>CLASSES[c].name).join(' / ')+' 专属':'全职业通用';};
const BOWS=new Set(['长弓','短弓','骨弓','反曲弓','轻弩','重弩']);
export const isBow=item=>BOWS.has(catalogEntry(item)?.sub);
export const isQuiver=item=>catalogEntry(item)?.sub==='箭囊';
/** 副手能否与当前武器同时装备。 */
export function offhandAllowed(weapon,offhand){
  if(!weapon||weapon.hands!==2||!offhand)return true;   // v1.3.1 修正：双手武器不带副手本来就合法（之前判成不合法，一键换装永远不会选双手武器）
  return isBow(weapon)&&isQuiver(offhand);
}
const hashId=str=>{let h=2166136261;for(const ch of String(str)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
// 首领专属装备：名称固定，图标取同类型传奇图标。
export const BOSS_ITEM_ICONS=Object.freeze({
  '炉誓秘杖':'EQ-L-034','典守之狱衣':'EQ-L-062','血印誓约护符':'EQ-L-091','渊丝禁忌秘典':'EQ-L-099',
  '失名者的最后祷言':'EQ-L-100','守魂者的夜行头冠':'EQ-L-050','朽化荆棘战靴':'EQ-L-080',
  '永霜寒玉戒':'EQ-L-090','黑曜焚世长杖':'EQ-L-036'
});
export const BASES=Object.freeze(Object.fromEntries(SLOT_IDS.map(s=>[s,catalogPool(0,s).map(c=>c.sub)])));
const JEWEL=['amulet','ring1','ring2'];
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
  skillCold:{name:'冰系技能等级',min:1,max:1,slots:['weapon','amulet','offhand']},
  // v0.7 新词缀：寻宝、冷却、全抗、全技能（高等级才会出现）
  mf:{name:'寻宝几率 %',min:4,max:14,slots:['head','gloves','boots','amulet','ring1','ring2']},
  allRes:{name:'全部抗性 %',min:2,max:7,minIlvl:20,slots:['robe','offhand','amulet','ring1','ring2','shoulders']},
  cdr:{name:'冷却缩减 %',min:2,max:5,minIlvl:30,slots:['head','offhand','amulet']},
  skillAll:{name:'全部技能等级',min:1,max:1,minIlvl:60,minRarity:2,slots:['amulet','head','weapon']}
};
// 套装：旧版两套（按部位）+ v0.7 七职业套装（按图鉴编号，4 件）
const piecesOf=cls=>SET_PIECES.filter(p=>p.set===cls).map(p=>p.base);
export const SETS={
  dragonflame:{name:'龙焰法衣',q:8,slots:['head','robe','gloves'],size:3,
    bonus:{2:{fire:15},3:{}},text:{2:'火焰增伤 +15%',3:'每第三次火系命中附加爆炎'}},
  warden:{name:'监牢审判',q:14,slots:['weapon','offhand','belt'],size:3,
    bonus:{2:{armor:25},3:{hp:70,crit:5}},text:{2:'护甲 +25',3:'生命 +70 与暴击率 +5%'}}
};
for(const cls of CLASS_IDS){
  SETS['set_'+cls]={name:CLASS_SET_NAMES[cls],q:36,cls,cids:piecesOf(cls),size:4,
    bonus:{2:{['sk_'+cls]:1,hp:60},3:{allRes:12,mf:30},4:{powers:[{k:'dmg',pct:30},{k:'cdrAll',pct:15},{k:'allSkill',n:1}]}},
    text:{2:'+1 '+CLASSES[cls].name+'技能等级，生命 +60',3:'全部抗性 +12%，寻宝几率 +30%',4:'伤害 +30%，全部技能冷却 -15%，+1 全部技能等级'}};
}
const SET_PIECE_WORD={weapon:'武装',offhand:'圣物',head:'冠冕',robe:'战衣',gloves:'之握',boots:'足迹',belt:'束带',amulet:'护符',ring1:'指环',shoulders:'肩铠'};
export const setFits=(setId,entry,slot)=>{const s=SETS[setId];if(!s||!entry)return false;return s.cids?s.cids.includes(entry.id):s.slots.includes(slot);};
// v0.4.1：31 个技能，分火、冰、雷、奥术四系。按键不再绑死在技能上，由技能栏的格子决定。
export const SKILL_SCHOOLS=Object.freeze({fire:'火焰',cold:'冰霜',lightning:'雷电',arcane:'奥术'});
export const SKILLS={
  // 火焰
  fire:{name:'余烬箭',school:'fire',icon:'✹',mana:0,cooldown:.3,unlocked:1,desc:'射出灼热火弹，基础攻击'},
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
export const RESERVED_KEYS=Object.freeze(['w','a','s','d','b','t','c','p','escape','arrowup','arrowdown','arrowleft','arrowright','tab','enter','meta','control','alt','shift']);
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
/** 需求等级：基底品级 × 0.85；魔法/史诗还看物品等级；传奇/暗金 = 品级 − 3；套装 = 套装品级；全技能词缀至少 60 级。 */
export function requiredLevel(entry,rarity,ilvl,affixes=[],setId=null){
  let req=Math.round((entry?.q||1)*.85);
  if(rarity===1)req=Math.max(req,Math.round(ilvl*.4));
  if(rarity===2)req=Math.max(req,Math.round(ilvl*.6));
  if(rarity>=3&&!setId)req=Math.max(req,(entry?.q||1)-3);
  if(setId)req=Math.max(SETS[setId]?.q||1,Math.round(ilvl*.5));
  if(affixes.some(a=>a.key==='skillAll'))req=Math.max(req,60);
  return Math.max(1,Math.min(MAX_LEVEL,req));
}
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
  const setId=!legacy&&rarity===4&&Object.hasOwn(SETS,item.setId)&&setFits(item.setId,entry,slotGroup(item.slot))?item.setId:null;
  const ilvl=safeNum(item.ilvl||1,MAX_LEVEL)||1;
  // 命名（naming.js）：首领专属保留原名；套装 =「套装名·部位」；职业传奇用图鉴专名；其余按品质规则生成
  if(entry&&!BOSS_ITEM_ICONS[name]){
    if(setId)name=SETS[setId].name+'·'+(SETS[setId].cids?SET_PIECE_WORD[slotGroup(item.slot)]:NAME_BASES[baseIndex(entry.id)]?.n||entry.n);
    else{
      const maxes=Object.fromEntries(Object.keys(AFFIXES).map(k=>[k,affixMax(k,ilvl,rarity)]));
      name=nameItem({id:item.id,cid:entry.id,ilvl,affixes},rarity,maxes,entry);
    }
  }
  const req=Number.isFinite(item.req)?Math.max(1,Math.min(MAX_LEVEL,Math.floor(item.req))):1;
  return {
    id:item.id,slot:item.slot,name,rarity,ilvl,req,
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
// 词缀成长：固定数值类（生命、法力、护甲、强度、回复、吸血）随物品等级线性成长；
// 百分比类（暴击、增伤、抗性、攻速、移速、寻宝）成长平缓，避免高等级时百分比堆爆；品质再给小幅加成。
const PCT_AFFIX=new Set(['crit','critDmg','haste','fire','cold','lightning','physical','poison','holy','shadow','resistFire','resistCold','resistDark','move','mf','allRes','cdr']);
export const RARITY_AFFIX_MULT=Object.freeze([1,1,1.08,1.22,1.32]);
export const affixScale=(key,ilvl)=>AFFIXES[key].max===1?1:PCT_AFFIX.has(key)?1+Math.min(MAX_LEVEL,Math.max(1,ilvl))/60*.7:1+(Math.min(MAX_LEVEL,Math.max(1,ilvl))-1)*.055;
export const affixMax=(key,ilvl,rarity)=>Math.round(AFFIXES[key].max*affixScale(key,ilvl)*RARITY_AFFIX_MULT[rarity|0])+(key.startsWith('sk_')&&ilvl>=70?1:0);
const ELEMENT={火:'fire',炎:'fire',霜:'cold',冰:'cold',雷:'lightning',毒:'poison',光:'holy',暗影:'shadow',血:'lifesteal',岩:'armor',风:'haste'};

// ───────── 掉落规则（v0.7.2，向《暗黑破坏神 2》看齐，见 docs/2D-LOOT.md） ─────────
// 思路：大部分击杀不掉东西；掉下来的大多是白/蓝；黄（史诗）是前中期的主力升级；
// 橙（传奇）、绿（套装）、金（暗金）是稀有事件，普通难度要刷十几到几十趟，地狱快得多。
// 用「看得见的厄运保护」+「金币赌博」+「白蓝黄靠物品等级持续变强」来缓解长期刷不到的挫败感。
export const DROP_RULES=Object.freeze({
  // 每只怪的「抽取」：每次抽取掉装备的概率（其余为空 / 只有金币）
  // v0.8：每趟怪物从 36 只增加到 54 只，单只掉率按比例下调，每趟总掉落不变
  picks:{normal:[.11],elite:[.36,.15],boss:[1,1,.5]},
  // 每件装备的品质基础几率（从高到低依次判定）
  base:{unique:.0009,set:.0014,legendary:.0036,epic:.032,magic:.24},
  // 寻宝几率递减（与 D2 相同的常数）：有效 = MF × K ÷ (MF + K)；魔法品质吃满额
  mfK:{epic:600,set:500,legendary:400,unique:250},
  // 来源倍率：精英、首领更容易出好东西（D2 的冠军 / 头目加成）
  source:{normal:1,elite:1.6,boss:2.5},
  // 难度倍率：hi 作用于传奇/套装/暗金，lo 作用于史诗/魔法
  difficulty:{hi:[1,1.7,2.8],lo:[1,1.15,1.3]},
  slotWeight:{weapon:3,offhand:1.5,head:1,shoulders:.6,robe:1,gloves:1,belt:1,boots:1,amulet:.7,ring1:1.2},
  // 职业区隔：武器 / 副手 90% 只出当前职业会用的类型；防具首饰 70% 偏本职业风格；传奇 / 暗金 / 套装 85% 出本职业或通用的
  // （剩下的给共享仓库里的其他角色，和 D2 一样能捡到别的职业的好东西）
  ownWeapon:.9,ownClass:.7,ownNamed:.85,
  // 厄运保护（按趟计）：连续 N 趟没见到传奇以上 / 暗金，下一个首领必掉
  pity:{legendary:20,unique:80},
  // 首领专属传奇：每次击杀的几率（普通 / 噩梦 / 地狱）；首杀不再必掉，改为首杀第一件至少史诗
  bossExclusive:[.08,.11,.15],
  // 赌博（D2 式）：花金币买一件指定部位的未鉴定装备，品质几率如下
  gamble:{unique:.003,set:.005,legendary:.015,epic:.12}
});
const effMf=(mf,k)=>k?mf*k/(mf+k):mf;
/** 品质判定：返回 {rarity, set}。min 为保底品质。force：unique/set/legendary/epic/magic/normal。 */
export function rollQuality(rng,{ilvl=1,mf=0,source='normal',difficulty=0,min=0,force=null}={}){
  const R=DROP_RULES,lv=1+Math.min(MAX_LEVEL,ilvl)/250,src=R.source[source]||1,mfv=Math.max(0,mf);
  const hi=R.difficulty.hi[difficulty]||1,lo=R.difficulty.lo[difficulty]||1;
  const chance=(key,base)=>base*lv*src*(['legendary','set','unique'].includes(key)?hi:lo)*(1+effMf(mfv,R.mfK[key])/100);
  if(force==='unique')return {rarity:4,set:false};
  if(force==='set')return {rarity:4,set:true};
  if(force==='legendary')return {rarity:3,set:false};
  if(force==='epic')return {rarity:2,set:false};
  if(force==='magic')return {rarity:1,set:false};
  if(force==='normal')return {rarity:0,set:false};
  if(rng()<chance('unique',R.base.unique))return {rarity:4,set:false};
  if(rng()<chance('set',R.base.set))return {rarity:4,set:true};
  if(rng()<chance('legendary',R.base.legendary))return {rarity:3,set:false};
  if(min>=3)return {rarity:3,set:false};
  if(min>=2||rng()<chance('epic',R.base.epic))return {rarity:2,set:false};
  if(min>=1||rng()<chance('magic',R.base.magic))return {rarity:1,set:false};
  return {rarity:0,set:false};
}
const ownsEntry=(entry,cls)=>!!cls&&(entry.owner===cls||entry.cls===CLASSES[cls]?.catalog);
function weightedPick(rng,list,w){let t=0;for(const x of list)t+=w(x);let r=rng()*t;for(const x of list){r-=w(x);if(r<=0)return x;}return list[list.length-1];}
/** 选基底：品级 ≤ 物品等级；越接近物品等级的基底越常见；50% 偏向当前职业。 */
export function pickBase(rng,slot,ilvl,cls=null,strict=false){
  let pool=(POOLS.base[slotGroup(slot)]||[]).filter(c=>c.q<=Math.max(ilvl,1));
  if(!pool.length)pool=[...(POOLS.base[slotGroup(slot)]||[])].sort((a,b)=>a.q-b.q).slice(0,4);
  const g=slotGroup(slot);
  if(cls&&(g==='weapon'||g==='offhand')&&(strict||rng()<DROP_RULES.ownWeapon)){const ok=pool.filter(c=>typeOk(c,cls));if(ok.length)pool=ok;}
  if(cls&&(strict||rng()<DROP_RULES.ownClass)){const mine=pool.filter(c=>ownsEntry(c,cls)||c.cls==='全职业');if(mine.length)pool=mine;}
  return weightedPick(rng,pool,c=>.06+3*(c.q/Math.max(ilvl,1))**3);
}
function pickNamed(rng,kind,slot,ilvl,cls,strict=false){
  const src=POOLS[kind];
  let pool=slot?(src[slotGroup(slot)]||[]):Object.values(src).flat();
  pool=pool.filter(c=>c.q<=ilvl);
  if(cls&&(strict||rng()<DROP_RULES.ownNamed)){const mine=pool.filter(c=>(ownsEntry(c,cls)||c.cls==='全职业')&&typeOk(c,cls));if(mine.length)pool=mine;}
  // v0.7.3：越接近物品等级的传奇 / 暗金越常见（地狱多出高品级的，低品级的仍偶尔出现）
  return pool.length?weightedPick(rng,pool,c=>.12+2*(c.q/Math.max(ilvl,1))**3):null;
}
/** 掉落装备。opts：source normal/elite/boss，cls 当前职业，mf 寻宝几率，difficulty 难度，min 保底品质，force 强制品质。
 *  兼容旧调用：{boss:true} 等同 source:'boss'。 */
export function makeLoot(rng,level,id,{boss=false,cls=null,mf=0,source=null,difficulty=0,min=0,force=null,slot:wantSlot=null,entry:forceEntry=null,strict=false}={}){
  const n=Math.max(1,Math.min(MAX_LEVEL,Math.floor(level)||1));
  source=source||(boss?'boss':'normal');
  let {rarity,set}=rollQuality(rng,{ilvl:n,mf,source,difficulty,min,force});
  let entry=forceEntry,setId=null;
  if(set&&!entry){
    const sets=Object.keys(SETS).filter(k=>SETS[k].q<=n&&(!wantSlot||(SETS[k].cids?SETS[k].cids.some(c=>CATALOG_BY_ID.get(c)?.s===slotGroup(wantSlot)):SETS[k].slots.includes(slotGroup(wantSlot)))));
    const mine=sets.filter(k=>SETS[k].cls===cls);
    const usePool=mine.length&&(strict||rng()<DROP_RULES.ownNamed)?mine:sets;
    setId=usePool.length?usePool[Math.floor(rng()*usePool.length)]:null;
    if(setId){
      const S=SETS[setId];
      const cids=S.cids&&wantSlot?S.cids.filter(c=>CATALOG_BY_ID.get(c)?.s===slotGroup(wantSlot)):S.cids;
      if(S.cids)entry=CATALOG_BY_ID.get(cids[Math.floor(rng()*cids.length)]);
      else{const slot=wantSlot?slotGroup(wantSlot):S.slots[Math.floor(rng()*S.slots.length)];entry=pickBase(rng,slot,n,cls,strict);}
    }else rarity=3;
  }
  // 与 D2 相同：没有物品等级够得上的传奇/暗金时，降为史诗
  if(!entry&&rarity>=3){entry=pickNamed(rng,rarity===4?'unique':'legend',wantSlot,n,cls,strict);if(!entry)rarity=2;}
  if(!entry){
    // 只在有符合物品等级基底的部位里抽（比如护肩最低品级 5，1-4 级不出护肩）
    const slots=Object.keys(DROP_RULES.slotWeight).filter(s=>(POOLS.base[slotGroup(s)]||[]).some(c=>c.q<=n));
    const slot=wantSlot&&(POOLS.base[slotGroup(wantSlot)]||[]).length?slotGroup(wantSlot):weightedPick(rng,slots,s=>DROP_RULES.slotWeight[s]);
    entry=pickBase(rng,slot,n,cls,strict);
  }
  const slot=entry.s;
  const owner=entry.owner||CLASS_BY_CATALOG[entry.cls];
  // v0.7.3：传奇 / 暗金的词缀数不少于史诗，再加上传奇特效，保证「橙金」确实比「黄」好
  const hi=n>=60?1:0;
  const count=setId?3+Math.floor(rng()*2):rarity===4?4+hi+Math.floor(rng()*2):rarity===3?3+hi+Math.floor(rng()*2)
    :rarity===2?3+hi+Math.floor(rng()*2):rarity===1?1+Math.floor(rng()*2):0;
  // 职业技能词条只出现在该职业偏好的装备上；元素等级词条只出现在法师装备上；高级词缀有物品等级与品质门槛
  const choices=Object.keys(AFFIXES).filter(k=>{const A=AFFIXES[k];return A.slots.includes(slot)&&(!A.cls||A.cls===owner)&&(!k.startsWith('skill')||k==='skillAll'||owner==='mage')
    &&(!A.minIlvl||n>=A.minIlvl)&&(!A.minRarity||rarity>=A.minRarity);});
  if(owner&&rarity>=2&&choices.includes('sk_'+owner)){choices.splice(choices.indexOf('sk_'+owner),1);choices.unshift('sk_'+owner);}
  // 图鉴元素倾向（火/霜）优先出对应增伤词缀，让名字、图标和属性一致。
  const lean=ELEMENT[entry.aff];
  if(lean&&choices.includes(lean)){choices.splice(choices.indexOf(lean),1);choices.splice(choices[0]?.startsWith('sk_')?1:0,0,lean);}
  // 传奇/暗金：词缀种类由图鉴决定（同一件装备词缀种类固定，数值随机）
  const fixedOrder=rarity>=3&&!setId?[...choices].sort((a,b)=>(b===lean)-(a===lean)||hashId(entry.id+a)-hashId(entry.id+b)):null;
  const affixes=[];
  for(let i=0;i<count&&choices.length;i++){
    let key;
    if(fixedOrder)key=fixedOrder[i];
    else{const index=(choices[0]?.startsWith('sk_')||choices[0]===lean)&&i<2?0:Math.floor(rng()*choices.length);key=choices.splice(index,1)[0];}
    if(!key)break;
    const rule=AFFIXES[key];
    let value=Math.max(1,Math.round((rule.min+rng()*(rule.max-rule.min))*affixScale(key,n)*RARITY_AFFIX_MULT[rarity]));
    if(key.startsWith('sk_'))value=1+(n>=70&&rng()<.25?1:0);
    affixes.push({key,value});
  }
  const quiver=entry.sub==='箭囊';
  const armorSlot=['head','shoulders','robe','gloves','belt','boots','offhand'].includes(slot)&&!quiver&&!['法球','图腾','毒瓶','法典','符文书卷'].includes(entry.sub)||['骑士盾','鸢盾','战盾','塔盾','铁盾','钉刺盾','骨盾','轻盾','圆盾'].includes(entry.sub);
  const weaponSlot=slot==='weapon',twoHand=entry.h===2;
  // 基底强度：品级为主、物品等级为辅
  // 传奇 / 暗金 / 套装的基础强度不低于物品等级的 85%：高难度掉的橙金一定够用
  const qb=Math.max(1,Math.round((entry.q||n)*.75+n*.25),rarity>=3?Math.round(n*.85):0);
  const rmul=[1,1.2,1.4,1.65,1.85][rarity]*(setId?.95:1);
  return normalizeItem({
    id,slot,rarity,ilvl:n,name:entry.n,cid:entry.id,setId,
    req:requiredLevel(entry,rarity,n,affixes,setId),
    // 武器强度按攻速归一：慢武器单次更痛、快武器出手更多（÷√攻速），双手 ×1.4
    power:weaponSlot?Math.round((6+qb*2.5)*rmul*(twoHand?1.4:1)/Math.sqrt(WEAPON_TYPES[entry.sub]?.speed||1)):quiver?Math.round((3+qb*.9)*(1+rarity*.2)):0,
    hp:slot==='robe'?Math.round(10+qb*2.6):0,
    mana:slot==='offhand'&&!quiver&&!armorSlot?Math.round(10+qb*1.4):0,
    armor:armorSlot?Math.round((7+qb*1.1)*(1+rarity*.19)):0,
    value:10+n*5+rarity*22,affixes
  });
}
/** 一次击杀掉落的全部装备（不含金币）。pityHit：首领保底触发时强制一件传奇。 */
export function rollDrops(rng,{source='normal',level=1,mf=0,cls=null,difficulty=0,newId,force=null,firstMin=null}){
  const out=[];
  for(const [i,p] of (DROP_RULES.picks[source]||DROP_RULES.picks.normal).entries()){
    if(rng()>=p)continue;
    // 首领第一件至少魔法（首杀时至少史诗，由 boss-loot 传入 firstMin）
    const min=i===0?(firstMin??(source==='boss'?1:0)):0;
    out.push(makeLoot(rng,level,newId(),{source,cls,mf,difficulty,min,force:i===0?force:null}));
  }
  return out;
}
// ───────── 赌博（D2 式金币消耗）：选部位，花金币买一件随机品质装备 ─────────
export const GAMBLE_SLOTS=Object.freeze(['weapon','offhand','head','robe','gloves','boots','belt','ring1','amulet']);
/** 价格随角色等级上涨；戒指、项链贵一倍（与 D2 一样，首饰最贵）。 */
export const gambleCost=(level,slot)=>Math.round((150+Math.max(1,Math.min(MAX_LEVEL,level|0))*28)*(slot==='ring1'||slot==='amulet'?2:1));
export function gambleQuality(rng){
  const G=DROP_RULES.gamble,r=rng();
  if(r<G.unique)return 'unique';
  if(r<G.unique+G.set)return 'set';
  if(r<G.unique+G.set+G.legendary)return 'legendary';
  if(r<G.unique+G.set+G.legendary+G.epic)return 'epic';
  return 'magic';
}
/** 赌一件：物品等级 = 角色等级 −5 ~ +4（D2 赌博同样有物品等级浮动）。返回装备或 null。 */
export function gambleItem(rng,level,slot,id,cls=null){
  if(!GAMBLE_SLOTS.includes(slot))return null;
  const ilvl=Math.max(1,Math.min(MAX_LEVEL,(level|0)-5+Math.floor(rng()*10)));
  return makeLoot(rng,ilvl,id,{cls,slot,force:gambleQuality(rng),strict:!!cls});   // 赌博买的一定是自己能用的
}
/** 新角色起始装备：本职业最低品级的武器（普通品质）+ 一件胸甲，开局不用空手。 */
export function starterKit(cls,newId){
  const own=g=>(POOLS.base[g]||[]).filter(c=>ownsEntry(c,cls)).sort((a,b)=>a.q-b.q);
  const pickFirst=(g,pred=()=>true)=>own(g).find(pred)||(POOLS.base[g]||[]).slice().sort((a,b)=>a.q-b.q)[0];
  const weapons=CLASSES[cls]?.weapons||[];
  const w=pickFirst('weapon',c=>weapons.includes(c.sub)&&c.sub!=='箭囊');
  const r=pickFirst('robe');
  const one=()=>0;
  const out=[];
  for(const [g,e] of [['weapon',w],['robe',r]]){
    if(!e)continue;
    out.push(makeLoot(one,Math.max(1,e.q|0),newId(),{cls,slot:g,force:'normal',entry:e}));
  }
  return out.filter(Boolean);
}
export function emptyEquipment(){return Object.fromEntries(SLOT_IDS.map(s=>[s,null]));}
/** 装备带来的属性：基础值 + 词缀 + 套装加成；同时汇总传奇特效（legend）。 */
export function equipmentBonus(profile) {
  const extra={},totals={},legend=emptyLegend(); const itemById=new Map(profile.inventory.map(i=>[i.id,i]));
  for(const slot of SLOT_IDS){
    const item=itemById.get(profile.equipped[slot]);
    if(!item||getSlotForItem(item,slot)!==slot)continue;
    if(slot==='offhand'&&!offhandAllowed(itemById.get(profile.equipped.weapon),item))continue;
    if((item.req||1)>(profile.level||1))continue; // 需求等级不足：穿着但不生效
    for(const key of ['power','hp','mana','armor'])extra[key]=(extra[key]||0)+(item[key]||0);
    for(const affix of item.affixes||[])extra[affix.key]=(extra[affix.key]||0)+affix.value;
    if(item.setId)totals[item.setId]=(totals[item.setId]||0)+1;
    else for(const p of powersOf(catalogEntry(item),item.rarity))addPower(legend,p);
  }
  for(const [id,count] of Object.entries(totals))for(const [need,b] of Object.entries(SETS[id].bonus)){
    if(count<+need)continue;
    for(const [key,value] of Object.entries(b))if(key==='powers')for(const p of value)addPower(legend,p);else extra[key]=(extra[key]||0)+value;
  }
  return {extra,sets:totals,legend};
}
// 巅峰天赋（60 级后每级 1 点）：每项每点的效果
export const PARAGON=Object.freeze({
  dmg:{name:'力量',desc:'伤害 +3%',per:3,max:8},
  hp:{name:'坚韧',desc:'最大生命 +4%',per:4,max:8},
  crit:{name:'精准',desc:'暴击率 +1%',per:1,max:6},
  critDmg:{name:'残忍',desc:'暴击伤害 +6%',per:6,max:6},
  haste:{name:'迅捷',desc:'攻击/施法速度 +2%',per:2,max:6},
  cdr:{name:'专注',desc:'冷却缩减 +2%',per:2,max:5},
  res:{name:'庇护',desc:'全部抗性 +3%',per:3,max:6},
  armor:{name:'铁壁',desc:'护甲 +6%',per:6,max:6},
  regen:{name:'源泉',desc:'资源回复 +6%',per:6,max:5},
  move:{name:'疾行',desc:'移动速度 +2%',per:2,max:5},
  mf:{name:'寻宝',desc:'寻宝几率 +8%',per:8,max:6}
});
export const paragonPoints=level=>Math.max(0,Math.min(MAX_LEVEL,level|0)-60);
export function sanitizeParagon(raw,level){
  const out={};let left=paragonPoints(level);
  for(const k of Object.keys(PARAGON)){const v=Math.max(0,Math.min(PARAGON[k].max,Math.floor(Number(raw?.[k])||0),left));if(v){out[k]=v;left-=v;}}
  return out;
}
export const DIFFICULTY_RES_PENALTY=Object.freeze([0,-20,-40]);
export function calculateStats(profile){
  const {extra,sets,legend}=equipmentBonus(profile);
  const value=(k,d=0)=>(extra[k]||0)+d;
  const cls=CLASSES[profile.heroClass]?profile.heroClass:'mage',C=CLASSES[cls];
  const pg=k=>(profile.paragon?.[k]||0)*PARAGON[k].per;
  const weapon=profile.inventory.find(i=>i.id===profile.equipped?.weapon),wsub=(weapon?.req||1)<=profile.level?catalogEntry(weapon)?.sub||null:null;
  const off=profile.inventory.find(i=>i.id===profile.equipped?.offhand),osub=catalogEntry(off)?.sub||null;
  const pen=DIFFICULTY_RES_PENALTY[profile.difficulty|0]||0,allRes=value('allRes')+pg('res');
  const res=k=>Math.min(75,value(k)+allRes+pen);
  return {cls,power:17+profile.level*3+value('power'),hp:Math.round((C.hp+(profile.level-1)*C.hpLv+value('hp'))*(1+pg('hp')/100)),
    mana:C.mana+value('mana'),armor:Math.round((C.armor+value('armor'))*(1+pg('armor')/100)),
    crit:Math.min(70,5+C.crit+value('crit')+pg('crit')+legend.crit),critDmg:50+value('critDmg')+pg('critDmg'),
    weapon:wsub,attack:attackMode(cls,wsub),proficient:proficient(cls,wsub),offProficient:proficient(cls,osub),
    physical:value('physical'),poison:value('poison'),holy:value('holy'),shadow:value('shadow'),
    move:Math.min(50,value('move')+pg('move')+legend.speed),classSkill:value('sk_'+cls)+value('skillAll')+legend.allSkill,
    haste:Math.min(80,value('haste')+pg('haste')),fire:value('fire'),cold:value('cold'),lightning:value('lightning'),
    resistFire:res('resistFire'),resistCold:res('resistCold'),resistDark:res('resistDark'),resPenalty:pen,
    regen:C.regen*(1+pg('regen')/100)+value('regen'),
    lifesteal:value('lifesteal'),skillFire:value('skillFire'),skillCold:value('skillCold'),
    mf:value('mf')+pg('mf')+legend.mf,cdr:Math.min(40,value('cdr')+pg('cdr')),dmgPct:pg('dmg')+legend.dmg,
    legend,sets};
}
export function formatAffixes(item){
  const entries=[];
  for(const key of ['power','hp','mana','armor'])if(item[key])entries.push('+'+item[key]+' '+({power:'法术强度',hp:'最大生命',mana:'法力',armor:'护甲'})[key]);
  for(const a of item.affixes||[])entries.push('+'+a.value+(a.key.startsWith('skill')||a.key.startsWith('sk_')?' 级 ':' ')+AFFIXES[a.key].name.replace(/等级$/,''));
  if(item.setId)entries.push('套装：'+SETS[item.setId].name);
  return entries;
}
/** 传奇/暗金特效（只对非套装的传奇与暗金生效）。 */
export const itemPowers=item=>item&&!item.setId?powersOf(catalogEntry(item),item.rarity):[];
export function itemScore(i) {
  const legend=itemPowers(i).length*25;
  return legend+i.power*2+i.hp*.22+i.mana*.17+i.armor*.33+(i.affixes||[]).reduce((sum,a)=>sum+a.value*(a.key==='power'?2:a.key.startsWith('skill')||a.key.startsWith('sk_')?12:.75),0);
}
