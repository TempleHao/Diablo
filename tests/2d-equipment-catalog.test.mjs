import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_SIZE,CATALOG_TIER_SIZE,CATALOG_QUALITY_NAMES,CATALOG_QUALITY_COLORS,
  catalogEntry,allCatalogEntries,rarityWeights,rollCatalogRarity,pickCatalogEntry
} from '../dist/2d/equipment-catalog.js';
import {SLOT_IDS,makeLoot,normalizeItem,calculateStats} from '../dist/2d/systems.js';
import {HIGH_TIER_EFFECTS,highTierEffectFor} from '../dist/2d/equipment-effects.js';
import {iconType} from '../dist/2d/equipment-icons.js';
import {baseEffectName,effectNumbers,equippedEffectItems,strongestEffect,effectPercent,isRuntimeEffectSupported} from '../dist/2d/equipment-effect-runtime.js';
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


test('all 200 high-tier effects are stable and unique items carry authored drawbacks',()=>{
  assert.equal(HIGH_TIER_EFFECTS.length,200);
  assert.equal(new Set(HIGH_TIER_EFFECTS.map(x=>x[0])).size,200);
  assert.equal(highTierEffectFor('EQ-L-001').name,'裂界余响');
  assert.equal(highTierEffectFor('EQ-U-100').name,'古王·秘文回响');
  assert.equal(highTierEffectFor('EQ-U-100').drawback,'主动技能法力消耗增加8%');
  assert.equal(highTierEffectFor('EQ-N-001'),null);
});

test('catalog identity is verified before an authored effect can attach',()=>{
  const t=catalogEntry(4,0);
  const valid=normalizeItem({id:'u1',catalogId:t.catalogId,slot:t.slot,name:t.name,rarity:t.rarity,ilvl:100,power:9999,hp:9999,mana:9999,armor:9999,value:99999,affixes:[]});
  assert.equal(valid.catalogId,'EQ-U-001');
  assert.equal(valid.effectName,'古王·破绽追猎');
  assert.equal(valid.drawback,'最大生命降低6%');
  assert.equal(valid.power,t.attack,'catalog attack must be restored from authored data');
  assert.equal(valid.hp,t.hp,'catalog life must be restored from authored data');
  const forged=normalizeItem({...valid,id:'fake',catalogId:'EQ-U-100'});
  assert.equal(forged.catalogId,null,'mismatched catalog identity must be stripped');
  assert.equal(forged.effectName,'');
  assert.equal(forged.drawback,'');
});

test('unique tradeoffs and ancient resonance affect live character statistics',()=>{
  const p={level:100,inventory:[],equipped:Object.fromEntries(SLOT_IDS.map(s=>[s,null]))};
  const make=(rarity,index,id)=>{
    const t=catalogEntry(rarity,index);
    return normalizeItem({id,catalogId:t.catalogId,slot:t.slot,name:t.name,rarity:t.rarity,ilvl:t.requiredLevel,power:t.attack,hp:t.hp,mana:t.mana,armor:t.armor,value:t.score,affixes:[]});
  };
  const base=calculateStats(p);
  const hpCost=make(4,0,'hp-cost');
  p.inventory.push(hpCost);p.equipped[hpCost.slot]=hpCost.id;
  const afterHp=calculateStats(p);
  assert.ok(afterHp.hp<base.hp+hpCost.hp,'6% unique life penalty must reduce final life');
  const fireUnique=make(4,99,'mana-cost');
  p.inventory.push(fireUnique);p.equipped[fireUnique.slot]=fireUnique.id;
  const afterFire=calculateStats(p);
  assert.equal(afterFire.skillFire,1,'fire-themed ancient resonance must add a fire skill rank');
  assert.equal(afterFire.manaCost,108,'active-skill mana drawback must be live');
});

test('fallback equipment renderer follows catalog weapon subtype instead of drawing everything as a staff',()=>{
  const examples=[
    [catalogEntry(0,5),'axe'],[catalogEntry(0,7),'hammer'],[catalogEntry(0,9),'spear'],
    [catalogEntry(0,20),'bow'],[catalogEntry(0,24),'crossbow'],[catalogEntry(0,26),'quiver'],
    [catalogEntry(0,0),'sword'],[catalogEntry(0,30),'staff']
  ];
  for(const [item,type] of examples)assert.equal(iconType(item),type,item.catalogId);
});


test('effect runtime reads equipped authored effects without double-counting two-slot references',()=>{
  const p={level:100,inventory:[],equipped:Object.fromEntries(SLOT_IDS.map(s=>[s,null]))};
  const make=(index,id)=>{
    const t=catalogEntry(4,index);
    return normalizeItem({id,catalogId:t.catalogId,slot:t.slot,name:t.name,rarity:t.rarity,ilvl:t.requiredLevel,power:t.attack,hp:t.hp,mana:t.mana,armor:t.armor,value:t.score,affixes:[]});
  };
  const echo=make(99,'echo');
  p.inventory.push(echo);p.equipped.offhand='echo';
  assert.equal(baseEffectName(echo),'秘文回响');
  assert.deepEqual(effectNumbers(echo),[42]);
  assert.equal(equippedEffectItems(p).length,1);
  assert.equal(strongestEffect(p,'秘文回响').item.id,'echo');
  assert.equal(effectPercent(p,'秘文回响'),42);
  assert.equal(isRuntimeEffectSupported(echo),true);
  const dataOnly=make(62,'shoulder');
  p.inventory.push(dataOnly);p.equipped.shoulders='shoulder';
  assert.equal(isRuntimeEffectSupported(dataOnly),false);
});
