import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_SIZE,CATALOG_TIER_SIZE,CATALOG_QUALITY_NAMES,CATALOG_QUALITY_COLORS,
  catalogEntry,allCatalogEntries,rarityWeights,rollCatalogRarity,pickCatalogEntry
} from '../dist/2d/equipment-catalog.js';
import {SLOT_IDS,makeLoot} from '../dist/2d/systems.js';
import {mulberry32} from '../dist/2d/core.js';

test('Black-Iron catalog contains exactly 500 uniquely identified items',()=>{
  const all=allCatalogEntries();
  assert.equal(CATALOG_SIZE,500);assert.equal(CATALOG_TIER_SIZE,100);assert.equal(all.length,500);
  assert.equal(new Set(all.map(x=>x.catalogId)).size,500);
  assert.deepEqual(CATALOG_QUALITY_NAMES,['普通','魔法','史诗','传奇','暗金遗珍']);
  assert.deepEqual(CATALOG_QUALITY_COLORS,['#B7B7B7','#3293FF','#AF5CFF','#FF8928','#D8AA53']);
  for(let rarity=0;rarity<5;rarity++)assert.equal(all.filter(x=>x.rarity===rarity).length,100);
});

test('catalog anchors match the authored workbook',()=>{
  const first=catalogEntry(0,0),last=catalogEntry(4,99);
  assert.equal(first.catalogId,'EQ-N-001');assert.equal(first.name,'缺口短剑');
  assert.equal(first.subtype,'短剑');assert.equal(first.iconRow,1);assert.equal(first.iconCol,1);
  assert.equal(last.catalogId,'EQ-U-100');assert.equal(last.name,'末日回响·赤焰符卷');
  assert.equal(last.subtype,'符文书卷');assert.equal(last.requiredLevel,87);
  assert.equal(last.iconRow,12);assert.equal(last.iconCol,10);
});

test('all catalog entries map to legal runtime slots and level/icon bounds',()=>{
  for(const item of allCatalogEntries()){
    assert.ok(SLOT_IDS.includes(item.slot),item.catalogId+' has invalid slot');
    assert.ok(item.requiredLevel>=1&&item.requiredLevel<=100);
    assert.ok(item.iconRow>=1&&item.iconRow<=12&&item.iconCol>=1&&item.iconCol<=10);
    assert.ok(item.sockets>=0&&item.sockets<=4);
  }
});

test('rarity weights exactly follow the workbook level bands',()=>{
  assert.deepEqual(rarityWeights(1),[82,18,0,0,0]);
  assert.deepEqual(rarityWeights(10),[64,33,3,0,0]);
  assert.deepEqual(rarityWeights(25),[48,38,12,2,0]);
  assert.deepEqual(rarityWeights(45),[33,39,22,5.7,.3]);
  assert.deepEqual(rarityWeights(65),[26,36,28,9.3,.7]);
  assert.deepEqual(rarityWeights(100),[20,32,32,15,1]);
});

test('rarity roll boundaries and catalog picks never exceed character level',()=>{
  assert.equal(rollCatalogRarity(()=>0,100),0);
  assert.equal(rollCatalogRarity(()=>.20,100),1);
  assert.equal(rollCatalogRarity(()=>.52,100),2);
  assert.equal(rollCatalogRarity(()=>.84,100),3);
  assert.equal(rollCatalogRarity(()=>.995,100),4);
  const rng=mulberry32(991);
  for(let level=1;level<=100;level++){
    for(let j=0;j<8;j++)assert.ok(pickCatalogEntry(rng,level).requiredLevel<=level);
  }
});

test('live loot keeps runtime IDs separate from authored catalog IDs',()=>{
  const rng=mulberry32(7788),seen=new Set();
  for(let i=0;i<250;i++){
    const level=1+i%100,item=makeLoot(rng,level,'runtime-'+i,{boss:i%17===0});
    assert.equal(item.id,'runtime-'+i);assert.match(item.catalogId,/^EQ-[NMELU]-\d{3}$/);
    assert.ok(item.requiredLevel<=level);seen.add(item.catalogId);
  }
  assert.ok(seen.size>100);
});
