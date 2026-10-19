import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mulberry32,freshSave,sanitizeSave} from '../dist/2d/core.js';
import {BOSS_POOLS,rollBossRewards} from '../dist/2d/boss-loot.js';
test('every regional boss first kill guarantees a collectible exclusive legendary',()=>{
 for(let region=0;region<BOSS_POOLS.length;region++){
   let n=0;const loot=rollBossRewards(mulberry32(800+region),12,region,0,()=>String(region)+'-'+(++n));
   assert.equal(loot.firstKill,true);
   assert.equal(loot.exclusive,true);
   assert.equal(loot.drops.length,4); // v0.7：3 次首领抽取 + 专属传奇
   assert.ok(loot.drops.some(x=>x.name===BOSS_POOLS[region].item&&x.rarity===3));
   assert.ok(loot.materials>=16);
 }
});
test('repeat boss kills do not guarantee exclusive but always grant an ordinary item',()=>{
 let without=0,withExclusive=0;
 for(let seed=0;seed<250;seed++){
   let n=0;const loot=rollBossRewards(mulberry32(seed+1000),15,0,8,()=>String(++n));
   assert.equal(loot.firstKill,false);
   assert.ok(loot.drops.length>=1);
   if(loot.exclusive)withExclusive++;else without++;
 }
 assert.ok(withExclusive>25&&without>80);
});
test('boss first kill flags and unclaimed loot survive save/reload without item duplication',()=>{
 const profile=freshSave();let n=0;
 const loot=rollBossRewards(mulberry32(155),5,2,profile.bossKills[0][2],()=>String(++n));
 profile.bossKills[0][2]++;
 for(const item of loot.drops)profile.pendingLoot.push({item,region:2});
 const restored=sanitizeSave(JSON.parse(JSON.stringify(profile)));
 assert.equal(restored.bossKills[0][2],1); // v0.7：按难度分开记录
 assert.equal(restored.pendingLoot.length,loot.drops.length);
 assert.ok(restored.pendingLoot.filter(x=>x.item.rarity===3).length>=1);
 const claimed=restored.pendingLoot[0].item;
 restored.inventory.push(claimed);
 const loaded=sanitizeSave(JSON.parse(JSON.stringify(restored)));
 assert.equal(loaded.pendingLoot.length,loot.drops.length-1);
 assert.ok(loaded.inventory.some(i=>i.id===claimed.id));
});
test('pending loot cannot be forged from malformed IDs or unrelated invalid regions',()=>{
 const p=sanitizeSave({version:2,inventory:[],pendingLoot:[
 {item:{id:'valid',slot:'weapon',name:'奖励',rarity:3,ilvl:5,power:30,hp:0,mana:0,armor:0,affixes:[]},region:0},
 {item:{id:'valid',slot:'weapon',name:'奖励',rarity:3,ilvl:5,power:30,hp:0,mana:0,armor:0,affixes:[]},region:0},
 {item:{id:'invalid',slot:'weapon',name:'坏奖励',rarity:3,ilvl:5,power:0,hp:0,mana:0,armor:0,affixes:[]},region:999}
 ],bossKills:[2,3,-100,Infinity]});
 assert.equal(p.pendingLoot.length,1);
 assert.equal(p.bossKills[0].length,BOSS_POOLS.length);
 assert.deepEqual(p.bossKills[0].slice(0,5),[2,3,0,0,0]);
});
