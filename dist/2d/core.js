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
export function makeDungeon(seed = 2026) {
  const rng = mulberry32(seed), blocks = [], torches = [];
  for (let y = 2; y < ROWS - 2; y += 2) {
    for (let x = 2; x < COLS - 2; x += 2) {
      // 中央行进轴线、出生区和 BOSS 场地始终可走。
      if (Math.abs(x - COLS / 2) < 4 || Math.hypot(x - COLS / 2, y - ROWS * .76) < 6) continue;
      if (Math.hypot(x - COLS / 2, y - 7) < 5) continue;
      if (rng() < .44) {
        const w = rng() < .24 ? 57 : 38, h = rng() < .27 ? 56 : 38;
        blocks.push({ x: x * TILE - w / 2, y: y * TILE - h / 2, w, h, variant: Math.floor(rng() * 3) });
        if (rng() < .24) torches.push({ x: x * TILE + 24, y: y * TILE - 24 });
      }
    }
  }
  for (let y = 4; y < ROWS - 3; y += 6) {
    torches.push({ x: 3 * TILE, y: y * TILE }, { x: (COLS - 3) * TILE, y: y * TILE });
  }
  return { blocks, torches, seed };
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
export function freshSave() {
  return { version: 1, level: 1, xp: 0, gold: 0, essence: 0, clears: 0, inventory: [], equipped: { weapon: null, robe: null, charm: null } };
}
const validItem = i => i && typeof i.id === 'string' && i.id.length < 100 && ['weapon','robe','charm'].includes(i.slot) &&
  typeof i.name === 'string' && i.name.length <= 64 && Number.isFinite(i.power) && Number.isFinite(i.hp) &&
  Number.isFinite(i.mana) && [0,1,2,3].includes(i.rarity);
export function sanitizeSave(raw) {
  const p = freshSave();
  if (!raw || raw.version !== 1 || typeof raw !== 'object') return p;
  for (const key of ['level','xp','gold','essence','clears']) {
    const max = key === 'level' ? 60 : 100000000;
    p[key] = clamp(Math.floor(Number(raw[key]) || 0), key === 'level' ? 1 : 0, max);
  }
  if (Array.isArray(raw.inventory)) {
    const ids = new Set();
    p.inventory = raw.inventory.filter(i => validItem(i) && !ids.has(i.id) && ids.add(i.id)).slice(0, 30)
      .map(i => ({ id: i.id, slot: i.slot, name: i.name, rarity: i.rarity,
        power: clamp(Math.floor(i.power), 0, 9999), hp: clamp(Math.floor(i.hp), 0, 9999),
        mana: clamp(Math.floor(i.mana), 0, 9999), value: clamp(Math.floor(i.value || 0), 0, 99999) }));
  }
  for (const slot of ['weapon','robe','charm']) {
    const id = raw.equipped?.[slot];
    if (p.inventory.some(i => i.id === id && i.slot === slot)) p.equipped[slot] = id;
  }
  return p;
}
export function stats(p) {
  let power = 17 + p.level * 3, hp = 105 + (p.level - 1) * 13, mana = 100;
  for (const id of Object.values(p.equipped)) {
    const i = p.inventory.find(item => item.id === id);
    if (i) { power += i.power; hp += i.hp; mana += i.mana; }
  }
  return { power, hp, mana };
}
export function expRequired(level) { return level * 45 + 15; }
export function gainXp(p, amount) {
  p.xp += Math.max(0, Math.floor(amount));
  let advanced = 0;
  while (p.level < 60 && p.xp >= expRequired(p.level)) {
    p.xp -= expRequired(p.level);
    p.level++; advanced++;
  }
  if (p.level === 60) p.xp = 0;
  return advanced;
}
export function createItem(rng, level, id) {
  const rarity = rng() < .035 ? 3 : rng() < .15 ? 2 : rng() < .48 ? 1 : 0;
  const slot = ['weapon','robe','charm'][Math.floor(rng() * 3)];
  const names = {
    weapon: ['焦木法杖','寒潮长杖','余烬权杖','断昼星杖'],
    robe: ['行旅布袍','旧日秘袍','烬纹长袍','星坠法衣'],
    charm: ['风化护符','霜石坠饰','炉心秘印','断昼徽记']
  };
  const bonus = rarity + 1, n = Math.max(1, level);
  return {
    id, slot, rarity, name: names[slot][rarity],
    power: slot === 'weapon' ? Math.round((4 + n * 2.2) * bonus * (.8 + rng() * .5)) : slot === 'charm' ? Math.round(bonus * (1 + n * .42)) : 0,
    hp: slot === 'robe' ? Math.round((11 + n * 3) * bonus * (.8 + rng() * .4)) : 0,
    mana: slot === 'charm' ? Math.round((5 + n) * bonus) : 0,
    value: 4 + n * 2 + rarity * 7
  };
}
export function equip(p, id) {
  const item = p.inventory.find(i => i.id === id);
  if (!item) return false;
  p.equipped[item.slot] = item.id; return true;
}
export function salvage(p, id) {
  if (Object.values(p.equipped).includes(id)) return false;
  const index = p.inventory.findIndex(i => i.id === id);
  if (index < 0) return false;
  p.essence += 1 + p.inventory[index].rarity * 2;
  p.inventory.splice(index, 1);
  return true;
}
