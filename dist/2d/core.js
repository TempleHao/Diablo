import { SLOTS, SLOT_IDS, MAX_ITEMS, emptyEquipment, normalizeItem, makeLoot, calculateStats, getSlotForItem, SKILLS, REGION_DATA } from './systems.js';
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
  const maxW=dungeon?.width??WIDTH,maxH=dungeon?.height??HEIGHT;
  if (x < radius || y < radius || x > maxW-radius || y > maxH-radius) return false;
  if (dungeon?.floorMask){
    // Entity disk must fit wholly inside traversable floors, including corner clipping.
    const grid=dungeon.floorMask,cols=dungeon.cols,S=dungeon.cellSize;
    for(const [px,py] of [[x-radius,y],[x+radius,y],[x,y-radius],[x,y+radius],
      [x-radius*.71,y-radius*.71],[x+radius*.71,y-radius*.71],
      [x-radius*.71,y+radius*.71],[x+radius*.71,y+radius*.71]]){
      const c=Math.floor(px/S),r=Math.floor(py/S);
      if(c<0||r<0||c>=cols||r>=dungeon.rows||!grid[r*cols+c])return false;
    }
  }else if (x < radius + TILE || y < radius + TILE || x > WIDTH - radius - TILE || y > HEIGHT - radius - TILE)return false;
  return !dungeon.blocks.some(b => hitsRect(x, y, radius, b));
}
export function moveWithCollision(entity, vx, vy, dt, dungeon, radius = 17) {
  // 逐轴滑墙，快速闪现用分段调用避免穿墙。
  const nx = entity.x + vx * dt, ny = entity.y + vy * dt;
  if (walkable(nx, entity.y, radius, dungeon)) entity.x = nx;
  if (walkable(entity.x, ny, radius, dungeon)) entity.y = ny;
}
export function freshSave(){
  return {version:2,level:1,xp:0,gold:0,essence:0,clears:0,inventory:[],equipped:emptyEquipment(),skillPoints:0,skillRanks:{},region:0,bossKills:Array(REGION_DATA.length).fill(0),pendingLoot:[],regionVisits:Array(REGION_DATA.length).fill(0),materials:freshMaterials(),autoSalvage:-1,activeSkills:['fire','nova','shard','armor','meteor','blink','heal']};
}
export function sanitizeSave(raw){
  const p=freshSave();
  if(!raw||typeof raw!=='object'||![1,2].includes(raw.version))return p;
  for(const k of ['level','xp','gold','essence','clears','skillPoints','region']){
    const n=Number(raw[k]);const cap=k==='level'?60:k==='region'?REGION_DATA.length-1:100000000;
    p[k]=clamp(Number.isFinite(n)?Math.floor(n):0,k==='level'?1:0,cap);
  }
  p.materials=sanitizeMaterials(raw.materials);
  p.autoSalvage=Number.isInteger(raw.autoSalvage)&&raw.autoSalvage>=-1&&raw.autoSalvage<=2?raw.autoSalvage:-1;
  if(Array.isArray(raw.activeSkills)){
    const chosen=[...new Set(raw.activeSkills.filter(k=>typeof k==='string'&&Object.hasOwn(SKILLS,k)))].slice(0,7);
    p.activeSkills=[...chosen,...Object.keys(SKILLS).filter(k=>!chosen.includes(k))].slice(0,7);
  }
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
  let pointsSpent=0;
  if(raw.skillRanks&&typeof raw.skillRanks==='object'){
    for(const key of Object.keys(SKILLS)){
      const candidate=Math.min(8,Math.max(0,Math.floor(Number(raw.skillRanks[key])||0)));
      const permitted=Math.min(candidate,Math.max(0,p.level-1-pointsSpent));
      if(permitted&&p.level>=SKILLS[key].unlocked){p.skillRanks[key]=permitted;pointsSpent+=permitted;}
    }
  }
  p.skillPoints=Math.max(0,p.level-1-pointsSpent);
  const used=new Set();
  for(const slot of SLOT_IDS){
    const id=raw.equipped?.[slot];
    const item=p.inventory.find(i=>i.id===id);
    if(item&&getSlotForItem(item,slot)===slot&&!used.has(id)){p.equipped[slot]=id;used.add(id);}
  }
  return p;
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
  p.equipped[slot]=id;return true;
}
export function upgradeSkill(p,key){
  if(!Object.hasOwn(SKILLS,key)||p.level<SKILLS[key].unlocked||p.skillPoints<1)return false;
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
