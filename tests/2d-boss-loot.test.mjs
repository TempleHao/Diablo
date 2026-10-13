import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rollBossRewards,BOSS_POOLS} from '../dist/2d/boss-loot.js';
import {mulberry32,freshSave,sanitizeSave} from '../dist/2d/core.js';
test('each regional boss guarantees its own legendary on first kill',()=>{
  for(let region=0;region<BOSS_POOLS.length;region++){
    let n=0;
    const loot=rollBossRewards(mulberry32(4242+region),24,region,0,()=>String(++n));
    assert.equal(loot.boss,BOSS_POOLS[region].name);
    assert.equal(loot.firstKill,true);assert.equal(loot.exclusive,true);
    assert.equal(loot.materials,16);
    assert.equal(loot.drops.length,2);
    assert.equal(loot.drops[1].name,BOSS_POOLS[region].item);
    assert.equal(loot.drops[1].rarity,3);
    assert.equal(loot.drops[1].slot,BOSS_POOLS[region].slot);
    assert.equal(new Set(loot.drops.map(i=>i.id)).size,2);
    assert.ok(loot.drops[1].affixes.length>=2);
  }
});
test('repeat kills have a real but not guaranteed exclusive loot chance',()=>{
  const rng=mulberry32(84704),counts=[];
  let lootSerial=0;
  for(let region=0;region<5;region++){
    let rare=0;const names=new Set();
    for(let n=0;n<600;n++){
      const result=rollBossRewards(rng,36,region,n+1,()=>String(region)+'-'+String(n)+'-'+String(++lootSerial));
      assert.equal(result.firstKill,false);
      assert.ok(result.materials>=4&&result.materials<=10);
      assert.ok(result.drops.length>=1&&result.drops.length<=2);
      if(result.exclusive){rare++;names.add(result.drops[1].name);}
    }
    assert.ok(rare>=110&&rare<=210,'exclusive chance too extreme for region '+region);
    assert.deepEqual([...names],[BOSS_POOLS[region].item]);counts.push(rare);
  }
  assert.ok(new Set(counts).size>1,'RNG should not output fixed rarity count every boss');
});
test('regional boss kill counts are saved, bounded and migrated from old saves',()=>{
  const p=freshSave();assert.deepEqual(p.bossKills,{});
  const old=sanitizeSave({version:1,level:13,inventory:[]});assert.deepEqual(old.bossKills,{});
  const newer=sanitizeSave({version:2,level:40,inventory:[],bossKills:{"0":5,"1":-15,"2":Infinity,"3":1e12,hello:400}});
  assert.equal(newer.bossKills[0],5);
  assert.equal(newer.bossKills[1],0);
  assert.equal(newer.bossKills[3],100000);
  assert.equal(newer.bossKills.hello,undefined);
});
test('boss reward rejects invalid region or unavailable factory',()=>{
  assert.throws(()=>rollBossRewards(mulberry32(1),10,-1,0,()=>1),/region/);
  assert.throws(()=>rollBossRewards(mulberry32(1),10,5,0,()=>1),/region/);
  assert.throws(()=>rollBossRewards(null,10,0,0,()=>1),/RNG/);
});
