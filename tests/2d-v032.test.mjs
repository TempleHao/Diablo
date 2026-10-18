import {test} from 'node:test';
import assert from 'node:assert/strict';
import {REGION_DATA, BASES, makeLoot, catalogEntry} from '../dist/2d/systems.js';
import {BOSS_POOLS,rollBossRewards} from '../dist/2d/boss-loot.js';
import {freshSave,sanitizeSave,makeDungeon,mulberry32} from '../dist/2d/core.js';
import {pickRandomDestination,destinationOptions,validateDestination} from '../dist/2d/travel.js';
import {iconType} from '../dist/2d/equipment-icons.js';

test('nine areas have unique labels and boss-specific first-kill rewards',()=>{
 assert.equal(REGION_DATA.length,9);assert.equal(BOSS_POOLS.length,9);
 assert.equal(new Set(REGION_DATA.map(r=>r.id)).size,9);
 assert.equal(new Set(BOSS_POOLS.map(r=>r.item)).size,9);
 for(let region=0;region<9;region++){
  const rewards=rollBossRewards(mulberry32(100+region),18,region,0,(()=>{let i=0;return()=>String(++i)})());
  assert.equal(rewards.exclusive,true);
  assert.equal(rewards.drops.filter(item=>item.name===BOSS_POOLS[region].item).length,1);
  assert.equal(makeDungeon(101,region).region,region);
 }
});
test('selection, next and random portal never emit invalid region',()=>{
 for(let from=0;from<REGION_DATA.length;from++){
  const options=destinationOptions(from);
  assert.equal(options.next,(from+1)%REGION_DATA.length);
  assert.equal(options.destinations.length,9);
  for(let k=0;k<100;k++){
   const to=pickRandomDestination(mulberry32(100*from+k),from);
   assert.ok(validateDestination(to));assert.notEqual(to,from);
  }
 }
 assert.equal(validateDestination(9),false);
 assert.throws(()=>pickRandomDestination(()=>.5,9),RangeError);
});
test('legacy save keeps owned items, boss victories and expands map slots',()=>{
 const old=freshSave();
 old.region=4;old.bossKills=[5,2,3,0,1];old.regionVisits=[2,2,1,1,4];
 old.inventory=[{id:'test',slot:'weapon',name:'测试法杖',rarity:3,power:36,hp:0,mana:0,armor:0,ilvl:10,affixes:[]}];
 old.equipped.weapon='test';
 const restored=sanitizeSave(JSON.parse(JSON.stringify(old)));
 assert.equal(restored.bossKills.length,9);
 assert.equal(restored.regionVisits.length,9);
 assert.equal(restored.region,4);
 assert.equal(restored.equipped.weapon,'test');
 assert.equal(restored.bossKills[4],1);
 assert.deepEqual(restored.bossKills.slice(5),[0,0,0,0]);
});
test('weapons and jewelry icons always match their functional silhouette',()=>{
 const sample=(slot,name)=>({slot,name,rarity:3});
 assert.equal(iconType(sample('head','夜行头冠')),'helmet');
 assert.equal(iconType(sample('weapon','焦木法杖')),'staff');
 assert.equal(iconType(sample('weapon','白骨长剑')),'sword');
 assert.equal(iconType(sample('weapon','凶魂匕首')),'dagger');
 assert.equal(iconType(sample('offhand','黑铁圆盾')),'shield');
 assert.equal(iconType(sample('offhand','灾厄魔典')),'book');
 assert.equal(iconType(sample('ring1','誓火宝戒')),'ring');
 assert.equal(iconType(sample('ring2','寒玉戒')),'ring');
 assert.equal(iconType(sample('amulet','霜痕吊坠')),'amulet');
 assert.equal(iconType(sample('robe','刻印重甲')),'chest');
});
test('equipment names come from the 350-entry caster catalog and stay slot-correct',()=>{
 const r=mulberry32(2026),names=new Set();
 for(let k=0;k<400;k++){
  const item=makeLoot(r,15,'u-'+k),entry=catalogEntry(item);
  assert.ok(entry,'every drop references a catalog record');
  assert.equal(entry.n,item.name);assert.equal(entry.r,item.rarity);
  assert.equal(entry.s,item.slot==='ring2'?'ring1':item.slot);
  names.add(item.name);
 }
 assert.ok(names.size>=150,'drops should be rich, got '+names.size);
 assert.ok(Object.values(BASES).every(list=>list.length>=3));
});
