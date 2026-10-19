import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE, WIDTH, HEIGHT, START, makeDungeon, walkable, moveWithCollision, hitsRect, mulberry32, freshSave, sanitizeSave, stats, expRequired, gainXp, createItem, equip, salvage } from '../dist/2d/core.js';
test('dungeon is reproducible with seed',()=>{
  const a=makeDungeon(123),b=makeDungeon(123),c=makeDungeon(456);
  assert.deepEqual(a,b);assert.notDeepEqual(a.blocks,c.blocks);
  assert.ok(a.torches.length>5 && a.blocks.length>10);
});
test('initial spawn and center route are always walkable',()=>{
  for(const seed of [1,2,3,777,20261013]){
    const d=makeDungeon(seed);
    assert.ok(walkable(START.x,START.y,18,d));
    for(let y=4*TILE;y<=24*TILE;y+=TILE)assert.ok(walkable(WIDTH/2,y,18,d),'central corridor blocked');
  }
});
test('outer boundaries prevent escaping',()=>{
  const d=makeDungeon(12);
  assert.equal(walkable(-4,100,16,d),false);
  assert.equal(walkable(WIDTH-5,100,16,d),false);
  assert.equal(walkable(START.x,START.y,16,d),true);
});
test('rectangular obstacle collision includes edge and corner',()=>{
  const b={x:100,y:100,w:50,h:50};
  assert.equal(hitsRect(96,125,10,b),true);
  assert.equal(hitsRect(80,80,10,b),false);
  assert.equal(hitsRect(125,125,1,b),true);
});
test('axis-separated movement prevents walking through a wall',()=>{
  const d={blocks:[{x:200,y:100,w:30,h:100}]};
  const p={x:170,y:150};
  moveWithCollision(p,100,0,.2,d,18);assert.equal(p.x,170);
  moveWithCollision(p,0,100,.2,d,18);assert.equal(p.y,170);
});
test('seeded loot generator produces valid gear across slots',()=>{
  const r=mulberry32(4),slots=new Set(),rarities=new Set();
  for(let k=0;k<200;k++){const item=createItem(r,9,String(k));slots.add(item.slot);rarities.add(item.rarity);assert.ok(item.power>=0&&item.hp>=0&&item.mana>=0);}
  assert.equal(slots.size,10,'all equipment slots (rings share one drop type) should receive random drops');assert.ok(rarities.size>=3);
});
test('equipping and salvaging gear respects equipped state',()=>{
  const p=freshSave(),item={id:'item-1',slot:'weapon',name:'测试法杖',rarity:2,power:30,hp:0,mana:0,value:10};
  p.inventory.push(item);assert.equal(equip(p,item.id),true);
  assert.equal(stats(p).power,17+3+30);
  assert.equal(salvage(p,item.id),false);
  p.equipped.weapon=null;assert.equal(salvage(p,item.id),true);
  assert.equal(p.essence,5);assert.equal(p.inventory.length,0);
});
test('XP gain levels repeatedly and stops at 100 (v0.7)',()=>{
  const p=freshSave();
  assert.equal(expRequired(1),60);
  assert.equal(gainXp(p,60),1);assert.equal(p.level,2);
  gainXp(p,1e9);assert.equal(p.level,100);assert.equal(p.xp,0);
});
test('old or absent data does not crash current 2D save',()=>{
  assert.deepEqual(sanitizeSave(null),freshSave());
  assert.equal(sanitizeSave({version:2,level:999}).level,100);
  assert.deepEqual(sanitizeSave({version:3,level:99}),freshSave());
});
test('saved equipment referencing missing item is cleared',()=>{
  const p=sanitizeSave({version:1,level:12,xp:0,inventory:[],equipped:{weapon:'absent'}});
  assert.equal(p.level,12);assert.equal(p.equipped.weapon,null);
});
test('save is bounded and removes duplicate item IDs',()=>{
  const items=Array.from({length:33},(_,j)=>({id:j<2?'duplicate':'item'+j,slot:'robe',name:'法袍',rarity:0,power:0,hp:5,mana:0,value:0}));
  const p=sanitizeSave({version:1,level:999,gold:-100,inventory:items,equipped:{robe:'duplicate'}});
  assert.equal(p.level,100);assert.equal(p.gold,0);assert.equal(p.inventory.length,32);
  assert.equal(p.equipped.robe,'duplicate');
});
test('invalid item data cannot inject arbitrary object fields or inflated stats',()=>{
  const p=sanitizeSave({version:1,inventory:[
    {id:'a',slot:'weapon',name:'a',rarity:0,power:Infinity,hp:0,mana:0},
    {id:'b',slot:'weapon',name:'a',rarity:1,power:1e9,hp:0,mana:0,unknown:'x'}
  ],equipped:{weapon:'b'}});
  assert.equal(p.inventory.length,1);
  assert.equal(p.inventory[0].power,9999);
  assert.equal(p.inventory[0].unknown,undefined);
});
