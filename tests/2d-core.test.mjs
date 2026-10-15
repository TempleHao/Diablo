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
test('seeded loot generator produces level-legal catalog gear',()=>{
  const r=mulberry32(4),slots=new Set(),rarities=new Set();
  for(let k=0;k<300;k++){
    const level=1+k%100,item=createItem(r,level,String(k));
    slots.add(item.slot);rarities.add(item.rarity);
    assert.match(item.catalogId,/^EQ-[NMELU]-\d{3}$/);
    assert.ok(item.requiredLevel<=level,'drop exceeded character level');
    assert.equal(item.ilvl,item.requiredLevel);
    assert.ok(item.power>=0&&item.hp>=0&&item.mana>=0);
  }
  assert.ok(slots.size>=9,'catalog should exercise the major equipment locations');
  assert.ok(rarities.size>=4);
});
test('equipping and salvaging gear respects equipped state',()=>{
  const p=freshSave(),item={id:'item-1',slot:'weapon',name:'测试法杖',rarity:2,power:30,hp:0,mana:0,value:10};
  p.inventory.push(item);assert.equal(equip(p,item.id),true);
  assert.equal(stats(p).power,17+3+30);
  assert.equal(salvage(p,item.id),false);
  p.equipped.weapon=null;assert.equal(salvage(p,item.id),true);
  assert.equal(p.essence,5);assert.equal(p.inventory.length,0);
});
test('XP gain levels repeatedly and stops at 100',()=>{
  const p=freshSave();
  assert.equal(expRequired(1),60);
  assert.equal(gainXp(p,60),1);assert.equal(p.level,2);
  gainXp(p,10000000);assert.equal(p.level,100);assert.equal(p.xp,0);
});
test('old or absent data does not crash current 2D save',()=>{
  assert.deepEqual(sanitizeSave(null),freshSave());
  assert.equal(sanitizeSave({version:2,level:99}).level,99);
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

import {ensureWorldState,restoreWorldExploration,rememberRoomProgress} from '../dist/2d/world-progress.js';
import {createMazeWorld,enterRoom} from '../dist/2d/maze-world.js';

test('legacy 2D saves acquire empty per-region expeditions without changing equipment',()=>{
  for(const version of [1,2]){
    const save=sanitizeSave({version,region:2,clears:9,inventory:[],equipped:{},worldStates:undefined});
    assert.equal(save.region,2);assert.equal(save.clears,9);
    assert.equal(save.worldStates.length,9);
    assert.equal(save.worldStates.every(v=>v===null),true);
  }
});
test('expedition seed, visited rooms and Boss defeat survive a real save serialization cycle',()=>{
  const profile=freshSave(),state=ensureWorldState(profile,0,20261015);
  const world=createMazeWorld(state.seed,0),neighbor=world.layout.edges.find(e=>e.a===world.layout.entrance||e.b===world.layout.entrance);
  assert.ok(neighbor);
  const second=neighbor.a===world.layout.entrance?neighbor.b:neighbor.a;
  enterRoom(world,second);
  rememberRoomProgress(state,world,new Set([world.layout.entrance,second]));
  state.bossDefeated=true;profile.clears++;
  const revived=sanitizeSave(JSON.parse(JSON.stringify(profile)));
  const restored=ensureWorldState(revived,0,42);
  assert.equal(restored.seed,20261015,'clears must not change active expedition seed');
  assert.equal(restored.bossDefeated,true);
  const rebuilt=createMazeWorld(restored.seed,0);
  restoreWorldExploration(rebuilt,restored);
  assert.deepEqual(new Set(rebuilt.explored),new Set(world.explored));
  assert.ok(restored.enteredRooms.includes(second));
});
test('untrusted expedition metadata cannot inject malformed seeds or room IDs',()=>{
  const save=sanitizeSave({version:2,worldStates:[
    {seed:0,explored:[0,0,1,-1,999,'2'],enteredRooms:[0,0,3],bossDefeated:'true'},
    {seed:-1,bossDefeated:true}, {seed:0x100000000,bossDefeated:true},
    {seed:42,explored:Array.from({length:100},(_,i)=>i),bossDefeated:true}
  ]});
  assert.deepEqual(save.worldStates[0],{seed:0,explored:[0,1],enteredRooms:[0,3],bossDefeated:false});
  assert.equal(save.worldStates[1],null);assert.equal(save.worldStates[2],null);
  assert.equal(save.worldStates[3].explored.length,64);
  assert.equal(save.worldStates[3].bossDefeated,true);
});


import {destinationOptions,pickRandomDestination,startDestinationExpedition} from '../dist/2d/travel.js';

test('portal travel preserves character progression while creating a fresh destination expedition',()=>{
  const p=freshSave();
  p.level=14;p.xp=37;p.gold=912;p.essence=44;p.clears=3;p.skillRanks={fire:2};
  p.worldStates[0]={seed:111,explored:[0,1],enteredRooms:[0,1],bossDefeated:true};
  p.worldStates[1]={seed:222,explored:[0,2],enteredRooms:[0,2],bossDefeated:true};
  p.pendingLoot=[
    {region:0,x:450,y:620,item:{id:'old-a',slot:'weapon',name:'旧图A',rarity:3,ilvl:10,power:20,hp:0,mana:0,armor:0,value:10,affixes:[]}},
    {region:1,x:880,y:930,item:{id:'old-b',slot:'head',name:'旧图B',rarity:3,ilvl:10,power:0,hp:5,mana:0,armor:5,value:10,affixes:[]}}
  ];
  const before={level:p.level,xp:p.xp,gold:p.gold,essence:p.essence,clears:p.clears,skillRanks:{...p.skillRanks}};
  const moved=startDestinationExpedition(p,1);
  assert.deepEqual(moved,{from:0,to:1,visit:1});
  assert.equal(p.region,1);
  assert.equal(p.worldStates[1],null,'destination maze must be regenerated');
  assert.equal(p.worldStates[0].bossDefeated,true,'source expedition history must remain intact');
  assert.deepEqual({level:p.level,xp:p.xp,gold:p.gold,essence:p.essence,clears:p.clears,skillRanks:p.skillRanks},before);
  assert.deepEqual(p.pendingLoot.find(x=>x.region===0)?.x,450,'other-region loot coordinates must remain untouched');
  const recovered=p.pendingLoot.find(x=>x.region===1);
  assert.equal('x' in recovered,false,'old destination coordinates must not leak into a fresh maze');
  assert.equal('y' in recovered,false);
  const revived=sanitizeSave(JSON.parse(JSON.stringify(p)));
  assert.equal(revived.region,1);
  assert.equal(revived.pendingLoot.length,2);
});

test('travel destination selection wraps and random travel never picks the current region',()=>{
  const p=freshSave();p.region=8;
  assert.equal(destinationOptions(8).next,0);
  assert.equal(pickRandomDestination(()=>0,4),0);
  assert.equal(pickRandomDestination(()=>.999999,4),8);
  for(const value of [0,.1,.25,.5,.75,.999999]){
    assert.notEqual(pickRandomDestination(()=>value,4),4);
  }
});
