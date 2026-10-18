import { SLOTS, SLOT_IDS, MAX_ITEMS, emptyEquipment, normalizeItem, makeLoot, calculateStats, getSlotForItem, offhandAllowed, SKILLS, REGION_DATA, ACTIVE_LIMIT, DEFAULT_ACTIVE, DEFAULT_KEYS, bindableKey, CLASSES, CLASS_IDS, defaultActive, skillsOf, catalogEntry, proficient } from './systems.js';
import {buildById} from './builds.js';
import {freshMaterials,sanitizeMaterials} from './crafting.js';
// 余烬纪事 · 2D 规则内核。无 DOM 依赖，方便 Node 回归。
export const TILE = 72;
export const COLS = 40;
export const ROWS = 30;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;
export const SAVE_KEY = 'ember-chronicles-2d-v1';
export const START = Object.freeze({ x: WIDTH / 2, y: HEIGHT * .76 });
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = Math.imul(s ^ (s >>> 15), 1 | s); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function makeDungeon(seed = 2026, region = 0) {
  const rng = mulberry32(seed), blocks = [], torches = [];
  const chapter=clamp(Math.floor(region),0,REGION_DATA.length-1);
  const density=[.38,.49,.31,.43,.54,.42,.33,.45,.57][chapter];
  for (let y = 2; y < ROWS - 2; y += 2) {
    for (let x = 2; x < COLS - 2; x += 2) {
      // 中央行进轴线、出生区和 BOSS 场地始终可走。
      if (Math.abs(x - COLS / 2) < 4 || Math.hypot(x - COLS / 2, y - ROWS * .76) < 6) continue;
      if (Math.hypot(x - COLS / 2, y - 7) < 5) continue;
      if (rng() < density) {
        // 将少量散点石柱组织成断裂墙面，形成有方向感的地牢空间。
        const brokenWall = rng() < [.24,.47,.14,.22,.39,.52,.18,.33,.56][chapter];
        const w = brokenWall ? (rng() < .5 ? 111 : 146) : rng() < .24 ? 57 : 38;
        const h = brokenWall ? 33 : rng() < .27 ? 56 : 38;
        blocks.push({ x: x * TILE - w / 2, y: y * TILE - h / 2, w, h,
          kind: brokenWall ? 'wall' : 'pillar', variant: Math.floor(rng() * 3) });
        if (rng() < [.36,.17,.47,.11,.23,.12,.32,.13,.45][chapter]) torches.push({ x: x * TILE + 24, y: y * TILE - 24 });
      }
    }
  }
  for (let y = 4; y < ROWS - 3; y += 6) {
    torches.push({ x: 3 * TILE, y: y * TILE }, { x: (COLS - 3) * TILE, y: y * TILE });
  }
  return { blocks, torches, seed, region:chapter };
}
export function hitsRect(x, y, radius, box) {
  const cx = clamp(x, box.x, box.x + box.w), cy = clamp(y, box.y, box.y + box.h);
  return (x - cx) ** 2 + (y - cy) ** 2 < radius ** 2;
}
export function walkable(x, y, radius, dungeon) {
  if (x < radius + TILE || y < radius + TILE || x > WIDTH - radius - TILE || y > HEIGHT - radius - TILE) return false;
  return !dungeon.blocks.some(b => hitsRect(x, y, radius, b));
}
export function moveWithCollision(entity, vx, vy, dt, dungeon, radius = 17) {
  // 逐轴滑墙，快速闪现用分段调用避免穿墙。
  const nx = entity.x + vx * dt, ny = entity.y + vy * dt;
  if (walkable(nx, entity.y, radius, dungeon)) entity.x = nx;
  if (walkable(entity.x, ny, radius, dungeon)) entity.y = ny;
}
export function freshSave(){
  return {version:2,level:1,xp:0,gold:0,essence:0,clears:0,inventory:[],equipped:emptyEquipment(),skillPoints:0,skillRanks:{},region:0,bossKills:Array(REGION_DATA.length).fill(0),pendingLoot:[],regionVisits:Array(REGION_DATA.length).fill(0),materials:freshMaterials(),autoSalvage:-1,heroClass:'mage',activeSkills:[...DEFAULT_ACTIVE],keybinds:[...DEFAULT_KEYS],loadouts:{},builds:{}};
}
export function sanitizeSave(raw){
  const p=freshSave();
  if(!raw||typeof raw!=='object'||![1,2].includes(raw.version))return p;
  for(const k of ['level','xp','gold','essence','clears','skillPoints','region']){
    const n=Number(raw[k]);const cap=k==='level'?60:k==='region'?REGION_DATA.length-1:100000000;
    p[k]=clamp(Number.isFinite(n)?Math.floor(n):0,k==='level'?1:0,cap);
  }
  p.heroClass=CLASS_IDS.includes(raw.heroClass)?raw.heroClass:'mage';
  if(raw.builds&&typeof raw.builds==='object')for(const c of CLASS_IDS)if(typeof raw.builds[c]==='string'&&buildById(c,raw.builds[c]).id===raw.builds[c])p.builds[c]=raw.builds[c];
  p.materials=sanitizeMaterials(raw.materials);
  p.autoSalvage=Number.isInteger(raw.autoSalvage)&&raw.autoSalvage>=-1&&raw.autoSalvage<=2?raw.autoSalvage:-1;
  // 每个职业各自的技能栏与按键；顶层 activeSkills/keybinds 是当前职业的。
  if(raw.loadouts&&typeof raw.loadouts==='object')for(const c of CLASS_IDS){
    const l=raw.loadouts[c];if(l&&typeof l==='object')p.loadouts[c]={activeSkills:sanitizeActive(c,l.activeSkills),keybinds:sanitizeKeybinds(l.keybinds)};
  }
  p.activeSkills=sanitizeActive(p.heroClass,raw.activeSkills);
  p.keybinds=sanitizeKeybinds(raw.keybinds);
  // Keep Boss progression and unclaimed, already-generated drops across reloads.
  if(Array.isArray(raw.bossKills))p.bossKills=Array.from({length:REGION_DATA.length},(_,i)=>clamp(Number.isFinite(raw.bossKills[i])?Math.floor(raw.bossKills[i]):0,0,1000000));
  if(Array.isArray(raw.regionVisits))p.regionVisits=Array.from({length:REGION_DATA.length},(_,i)=>clamp(Number.isFinite(raw.regionVisits[i])?Math.floor(raw.regionVisits[i]):0,0,1000000));
  const pendingIds=new Set();
  if(Array.isArray(raw.pendingLoot))for(const entry of raw.pendingLoot.slice(0,MAX_ITEMS*2)){
    const item=normalizeItem(entry?.item);
    if(!item||pendingIds.has(item.id)||!Number.isInteger(entry?.region)||entry.region<0||entry.region>=REGION_DATA.length)continue;
    pendingIds.add(item.id);
    if(p.pendingLoot.length<MAX_ITEMS)p.pendingLoot.push({item,region:entry.region});
  }
  if(Array.isArray(raw.inventory)){
    const ids=new Set();
    for(const value of raw.inventory.slice(0,MAX_ITEMS*5)){
      const item=normalizeItem(value);
      if(item&&!ids.has(item.id)){ids.add(item.id);p.inventory.push(item);}
      if(p.inventory.length>=MAX_ITEMS)break;
    }
  }
  p.pendingLoot=p.pendingLoot.filter(d=>!p.inventory.some(i=>i.id===d.item.id));
  // 技能点按职业分别计算：每个职业都有 (等级-1) 点。
  if(raw.skillRanks&&typeof raw.skillRanks==='object')for(const c of CLASS_IDS){
    let spent=0;
    for(const key of skillsOf(c)){
      const candidate=Math.min(8,Math.max(0,Math.floor(Number(raw.skillRanks[key])||0)));
      const permitted=Math.min(candidate,Math.max(0,p.level-1-spent));
      if(permitted&&p.level>=SKILLS[key].unlocked){p.skillRanks[key]=permitted;spent+=permitted;}
    }
  }
  p.skillPoints=pointsFor(p,p.heroClass);
  const used=new Set();
  for(const slot of SLOT_IDS){
    const id=raw.equipped?.[slot];
    const item=p.inventory.find(i=>i.id===id);
    if(item&&getSlotForItem(item,slot)===slot&&!used.has(id)){p.equipped[slot]=id;used.add(id);}
  }
  if(!offhandAllowed(p.inventory.find(i=>i.id===p.equipped.weapon),p.inventory.find(i=>i.id===p.equipped.offhand)))p.equipped.offhand=null;
  return p;
}
/** 技能栏按键：每格一个、不可重复、不可占用移动/菜单键；无效时回到默认。 */
export function sanitizeKeybinds(raw){
  const out=[...DEFAULT_KEYS];
  if(!Array.isArray(raw))return out;
  const used=new Set();
  for(let i=0;i<ACTIVE_LIMIT;i++){
    const k=typeof raw[i]==='string'?raw[i].toLowerCase():null;
    if(k&&bindableKey(k)&&!used.has(k)){out[i]=k;used.add(k);}else out[i]=null;
  }
  for(let i=0;i<ACTIVE_LIMIT;i++)if(out[i]===null){out[i]=DEFAULT_KEYS.find(k=>!used.has(k))||'';if(out[i])used.add(out[i]);}
  return out;
}
/** 把第 slot 格改成按键 key；若别的格已用该键则互换。 */
export function rebindKey(p,slot,key){
  key=String(key||'').toLowerCase();
  if(!Number.isInteger(slot)||slot<0||slot>=ACTIVE_LIMIT||!bindableKey(key))return false;
  const other=p.keybinds.indexOf(key);
  if(other>=0&&other!==slot)p.keybinds[other]=p.keybinds[slot];
  p.keybinds[slot]=key;return true;
}
export function sanitizeActive(cls,raw){
  const own=new Set(skillsOf(cls));
  const chosen=Array.isArray(raw)?[...new Set(raw.filter(k=>typeof k==='string'&&own.has(k)))].slice(0,ACTIVE_LIMIT):[];
  const fill=[...defaultActive(cls),...own].filter((k,i,a)=>a.indexOf(k)===i&&!chosen.includes(k));
  return [...chosen,...fill].slice(0,ACTIVE_LIMIT);
}
export function pointsFor(p,cls){
  let spent=0;for(const k of skillsOf(cls))spent+=p.skillRanks?.[k]||0;
  return Math.max(0,p.level-1-spent);
}
/** 切换职业：等级、装备共用；技能栏、按键、技能点各职业分开。 */
export function switchClass(p,cls){
  if(!CLASS_IDS.includes(cls))return false;
  if(cls===p.heroClass)return true;
  p.loadouts=p.loadouts||{};
  p.loadouts[p.heroClass]={activeSkills:[...p.activeSkills],keybinds:[...p.keybinds]};
  p.heroClass=cls;
  const l=p.loadouts[cls];
  p.activeSkills=sanitizeActive(cls,l?.activeSkills);
  p.keybinds=sanitizeKeybinds(l?.keybinds);
  p.skillPoints=pointsFor(p,cls);
  return true;
}
/** 洗点：返还当前职业全部技能点（测试版免费）。返回返还点数。 */
export function respec(p,cls=p.heroClass){
  let refunded=0;
  for(const k of skillsOf(cls)){refunded+=p.skillRanks[k]||0;delete p.skillRanks[k];}
  if(cls===p.heroClass)p.skillPoints=pointsFor(p,cls);
  return refunded;
}
/** 按流派权重给装备打分：基础属性 + 词条 × 权重，擅长武器/推荐武器额外加分。 */
export function buildScore(item,cls,build){
  if(!item||item.legacy)return -1;
  const w=build.weights,e=catalogEntry(item);
  let s=(item.power||0)*(w.power||1)+(item.hp||0)*.22*(w.hp||1)+(item.mana||0)*.17*(w.mana||1)+(item.armor||0)*.33*(w.armor||1);
  for(const a of item.affixes||[])s+=a.value*(w[a.key]??.3);
  if(e){
    if(item.slot==='weapon'||item.slot==='offhand'){
      if(build.weapons.includes(e.sub))s*=1.35;else if(proficient(cls,e.sub))s*=1.15;else s*=.75;
    }
    if(e.cls===CLASSES[cls]?.catalog)s*=1.08;
  }
  return s;
}
/** 一键穿戴：每个部位穿上流派评分最高的装备；武器副手按组合比较（双手 / 弓 + 箭袋 / 单手 + 副手）。 */
export function autoEquip(p,buildId){
  const cls=p.heroClass,build=buildById(cls,buildId||p.builds?.[cls]);
  const usable=p.inventory.filter(i=>!i.legacy);
  const best=(slot)=>usable.filter(i=>getSlotForItem(i,slot)===slot||(slot.startsWith('ring')&&i.slot.startsWith('ring'))).sort((a,b)=>buildScore(b,cls,build)-buildScore(a,cls,build));
  const next=emptyEquipment();
  for(const slot of ['head','shoulders','robe','gloves','belt','boots','amulet']){const it=best(slot)[0];if(it)next[slot]=it.id;}
  const rings=best('ring1');if(rings[0])next.ring1=rings[0].id;if(rings[1])next.ring2=rings[1].id;
  const weapons=best('weapon'),offs=best('offhand');
  let top={score:-1,w:null,o:null};
  for(const w of [null,...weapons.slice(0,12)])for(const o of [null,...offs.slice(0,12)]){
    if(!offhandAllowed(w,o))continue;
    const sc=(w?buildScore(w,cls,build):0)+(o?buildScore(o,cls,build):0);
    if(sc>top.score)top={score:sc,w,o};
  }
  next.weapon=top.w?.id||null;next.offhand=top.o?.id||null;
  const changed=SLOT_IDS.filter(s=>p.equipped[s]!==next[s]).length;
  p.equipped=next;p.builds=p.builds||{};p.builds[cls]=build.id;
  return changed;
}
export function stats(p){return calculateStats(p);}
export function expRequired(level){return level*45+15;}
export function gainXp(p,amount){
  p.xp+=Math.max(0,Math.floor(amount));let advanced=0;
  while(p.level<60&&p.xp>=expRequired(p.level)){p.xp-=expRequired(p.level);p.level++;advanced++;p.skillPoints=(p.skillPoints||0)+1;}
  if(p.level===60)p.xp=0;return advanced;
}
export function createItem(rng,level,id){return makeLoot(rng,level,id);}
export function equip(p,id,target=null){
  const item=p.inventory.find(i=>i.id===id);if(!item)return false;
  const slot=getSlotForItem(item,target);if(!slot)return false;
  for(const k of SLOT_IDS)if(p.equipped[k]===id)p.equipped[k]=null;
  p.equipped[slot]=id;
  // 双手武器占用副手（弓弩可配箭袋）：穿上新的那件，卸下冲突的另一件。
  const weapon=p.inventory.find(i=>i.id===p.equipped.weapon),off=p.inventory.find(i=>i.id===p.equipped.offhand);
  if(!offhandAllowed(weapon,off)){if(slot==='weapon')p.equipped.offhand=null;else p.equipped.weapon=null;}
  return true;
}
export function upgradeSkill(p,key){
  if(!Object.hasOwn(SKILLS,key)||SKILLS[key].cls!==(p.heroClass||'mage')||p.level<SKILLS[key].unlocked||p.skillPoints<1)return false;
  const rank=p.skillRanks[key]||0;
  if(rank>=8)return false;
  p.skillRanks[key]=rank+1;p.skillPoints--;return true;
}
export function salvage(p,id){
  if(Object.values(p.equipped).includes(id))return false;
  const index=p.inventory.findIndex(i=>i.id===id);
  if(index<0)return false;
  p.essence+=1+p.inventory[index].rarity*2;
  p.inventory.splice(index,1);return true;
}
