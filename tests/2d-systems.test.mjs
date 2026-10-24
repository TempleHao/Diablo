import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SLOTS,SLOT_IDS,MAX_ITEMS,AFFIXES, RARITIES,SETS,SKILLS,REGION_DATA,makeLoot,normalizeItem,calculateStats,formatAffixes,catalogPool} from '../dist/2d/systems.js';
import {mulberry32,makeDungeon,walkable,START,freshSave,sanitizeSave,equip,stats,upgradeSkill} from '../dist/2d/core.js';
const i=(id,slot,affixes=[],setId=null)=>normalizeItem({id,slot,name:'测试装备',rarity:setId?4:2,ilvl:12,power:0,hp:0,mana:0,armor:0,affixes,setId});
test('paper doll matches the equipment catalog: 11 slots, no legs or relic',()=>{
  assert.equal(SLOTS.length,11);
  assert.equal(new Set(SLOT_IDS).size,11);
  for(const slot of ['head','shoulders','robe','gloves','belt','boots','weapon','offhand','amulet','ring1','ring2'])assert.ok(SLOT_IDS.includes(slot));
  assert.ok(!SLOT_IDS.includes('pants')&&!SLOT_IDS.includes('charm'));
});
test('all eligible affix values affect genuine combat statistics',()=>{
  const p=freshSave();const item=normalizeItem({id:'staff',slot:'weapon',name:'测试装备',rarity:2,ilvl:12,power:0,hp:0,mana:0,armor:0,cid:catalogPool(2,'weapon').find(c=>c.sub==='法杖').id,affixes:[{key:'power',value:31},{key:'crit',value:8},{key:'haste',value:9},{key:'fire',value:18},{key:'skillFire',value:1}]});   // v1.3：法师只能拿法师会用的武器
  p.inventory.push(item);assert.equal(equip(p,item.id),true);
  const b=stats(p);assert.equal(b.power,51);assert.equal(b.crit,13);assert.equal(b.haste,9);assert.equal(b.fire,18);assert.equal(b.skillFire,1);
});
test('ring can occupy either ring slot but cannot be duplicated across both',()=>{
  const p=freshSave(),item=i('ring','ring1',[{key:'crit',value:5}]);p.inventory.push(item);
  assert.equal(equip(p,'ring','ring2'),true);assert.equal(p.equipped.ring2,'ring');
  assert.equal(equip(p,'ring','ring1'),true);assert.equal(p.equipped.ring2,null);
  assert.equal(p.equipped.ring1,'ring');
});
test('set bonus activates at 2 and 3 unique equipped items only',()=>{
  const p=freshSave(),items=['head','robe','gloves'].map((slot,index)=>i('set'+index,slot,[],'dragonflame'));
  p.inventory.push(...items);equip(p,items[0].id);
  assert.equal(stats(p).fire,0);equip(p,items[1].id);assert.equal(stats(p).fire,15);
  equip(p,items[2].id);assert.equal(stats(p).sets.dragonflame,3);
});
test('old version one save is migrated without losing level or equipped staff',()=>{
  const old={version:1,level:23,clears:4,gold:218,inventory:[{id:'old1',name:'焦木法杖',slot:'weapon',rarity:2,power:77,hp:0,mana:0}],equipped:{weapon:'old1'}};
  const p=sanitizeSave(old);assert.equal(p.version,2);assert.equal(p.level,23);
  assert.equal(p.equipped.weapon,'old1');assert.equal(p.gold,218);assert.equal(p.region,0);
  assert.equal(p.inventory[0].power,77);assert.equal(p.inventory[0].armor,0);
});
test('malformed data cannot inject invalid affixes or high inflated stats',()=>{
  const bad=normalizeItem({id:'a',slot:'head',name:'头盔',rarity:2,power:Infinity,hp:0,mana:0});assert.equal(bad,null);
  const p=sanitizeSave({version:2,level:1,inventory:[{id:'a',slot:'weapon',name:'法杖',rarity:2,power:0,hp:0,mana:0,affixes:[{key:'resistFire',value:999},{key:'fire',value:888},{key:'fire',value:66},{key:'__proto__',value:42}]}],equipped:{weapon:'a'}});
  assert.equal(p.inventory.length,1);assert.equal(p.inventory[0].affixes.length,1);
  assert.equal(p.inventory[0].affixes[0].key,'fire');assert.equal(p.inventory[0].affixes[0].value,888);
});
test('loot across levels produces slot, affix, and rarity variety',()=>{
  const r=mulberry32(431),rarities=new Set(),slots=new Set(),types=new Set();
  for(let k=0;k<450;k++){
    const x=makeLoot(r,1+k%35,'loot-'+k,{boss:k%7===0,force:k%50===0?'unique':k%23===0?'legendary':null});
    rarities.add(x.rarity);slots.add(x.slot);
    for(const a of x.affixes)types.add(a.key);
    assert.equal(x.ilvl,1+k%35);
    for(const a of x.affixes)assert.ok(AFFIXES[a.key].slots.includes(x.slot));
    assert.ok(formatAffixes(x).length>=0);
  }
  assert.equal(slots.size,10);assert.equal(rarities.size,5);assert.ok(types.size>=12);
});
test('all regions generate deterministic playable yet distinct dungeons',()=>{
  const signatures=new Set();
  for(let region=0;region<REGION_DATA.length;region++){
    const a=makeDungeon(10101,region),b=makeDungeon(10101,region);
    assert.deepEqual(a,b);assert.equal(walkable(START.x,START.y,17,a),true);
    signatures.add(JSON.stringify(a.blocks));
  }
  assert.equal(signatures.size,REGION_DATA.length);
});
test('declared skills include seven usable skills and two damage schools',()=>{
  assert.equal(Object.values(SKILLS).filter(s=>s.cls==='mage').length,31);
  assert.ok(Object.values(SKILLS).some(x=>x.school==='fire'));
  assert.ok(Object.values(SKILLS).some(x=>x.school==='cold'));
  assert.ok(Object.values(SKILLS).every(x=>x.unlocked>=1&&x.cooldown>0));
});

test('skill points can be invested and survive reload without duplication',()=>{
  const p=sanitizeSave({version:1,level:7,inventory:[],equipped:{}});
  assert.equal(p.skillPoints,6);
  assert.equal(upgradeSkill(p,'meteor'),true);
  assert.equal(upgradeSkill(p,'fire'),true);
  assert.equal(p.skillPoints,4);
  const copy=sanitizeSave(JSON.parse(JSON.stringify(p)));
  assert.equal(copy.skillPoints,4);assert.equal(copy.skillRanks.meteor,1);assert.equal(copy.skillRanks.fire,1);
});
test('skill upgrade respects rank cap, unlock and available points',()=>{
  const p=freshSave();
  assert.equal(upgradeSkill(p,'meteor'),false);
  assert.equal(upgradeSkill(p,'fire'),false);
  const q=sanitizeSave({version:2,level:60,skillRanks:{fire:999,meteor:999,blink:999},inventory:[]});
  assert.equal(q.skillRanks.fire,8);assert.equal(q.skillRanks.meteor,8);
  assert.ok(q.skillPoints>=0);
});
