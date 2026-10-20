import test from 'node:test';
import assert from 'node:assert/strict';
import {mulberry32,freshSave} from '../dist/2d/core.js';
import {rollDrops,DROP_RULES,POOLS,GAMBLE_SLOTS,gambleCost,gambleItem,gambleQuality,starterKit,CLASS_IDS,CLASSES,catalogEntry,slotGroup} from '../dist/2d/systems.js';
import {rollBossRewards,BOSS_POOLS} from '../dist/2d/boss-loot.js';
import {LocalStore,MemoryStorage,ROSTER_KEY,LEGACY_KEY,EPOCH_KEY,DATA_EPOCH} from '../dist/2d/storage.js';

test('data epoch: first open after the reset wipes every 2D key once, leaves other games alone',()=>{
  const mem=new MemoryStorage();
  mem.setItem(LEGACY_KEY,'{"version":2,"level":40}');mem.setItem(ROSTER_KEY,'{"chars":[]}');mem.setItem(ROSTER_KEY+':abc','{}');mem.setItem('ember-mage-save-v2','3d');
  const a=new LocalStore(mem);
  assert.equal(a.wiped,true);
  assert.equal(mem.getItem(LEGACY_KEY),null);assert.equal(mem.getItem(ROSTER_KEY+':abc'),null);
  assert.equal(mem.getItem('ember-mage-save-v2'),'3d','3D save untouched');
  assert.equal(mem.getItem(EPOCH_KEY),DATA_EPOCH);
  assert.equal(a.list().length,0);
  const id=a.create('测试','mage',freshSave()).id;assert.ok(id);
  const b=new LocalStore(mem);assert.equal(b.wiped,false,'only once');assert.equal(b.list().length,1);
});

// 一趟 = 30 普通 + 6 精英 + 首领；按趟统计橙/绿/金
function trips({level,difficulty=0,mf=0,runs=3000}){
  const rng=mulberry32(level*13+difficulty);let n=0;const id=()=>'t'+(n++);
  let leg=0,set=0,uni=0,ex=0,pity={legendary:0,unique:0};
  for(let r=0;r<runs;r++){
    const d=[];
    for(let k=0;k<48;k++)d.push(...rollDrops(rng,{source:'normal',level,mf,difficulty,newId:id}));
    for(let k=0;k<6;k++)d.push(...rollDrops(rng,{source:'elite',level,mf,difficulty,newId:id}));
    const b=rollBossRewards(rng,level+2,r%9,3,id,{mf,difficulty,pity});pity=b.pity;if(b.exclusive)ex++;
    for(const it of [...d,...b.drops.filter(x=>x.name!==BOSS_POOLS[r%9].item)]){if(it.setId)set++;else if(it.rarity===4)uni++;else if(it.rarity===3)leg++;}
  }
  return {leg:leg/runs,set:set/runs,uni:uni/runs,ex:ex/runs};
}
test('loot pacing (D2-like): normal difficulty is stingy, hell and MF are clearly better',()=>{
  const nrm=trips({level:25}),hell=trips({level:85,difficulty:2}),mf=trips({level:85,difficulty:2,mf:300});
  assert.ok(nrm.leg>1/18&&nrm.leg<1/8,'normal: one legendary per ~12 trips, got 1/'+(1/nrm.leg).toFixed(1));
  assert.ok(nrm.uni<1/25,'normal: unique rarer than 1 per 25 trips, got 1/'+(1/nrm.uni).toFixed(1));
  assert.ok(nrm.set<1/20,'normal: set rarer than 1 per 20 trips');
  assert.ok(nrm.ex>.05&&nrm.ex<.12,'boss exclusive ~8%');
  assert.ok(hell.leg>nrm.leg*1.9&&hell.uni>nrm.uni*2,'hell clearly better '+JSON.stringify([nrm,hell]));
  assert.ok(mf.leg>hell.leg*1.5&&mf.uni>hell.uni*1.5,'MF helps');
});
test('no uniques below the lowest unique quality level, and unique pity does not count there',()=>{
  const minQ=Math.min(...Object.values(POOLS.unique).flat().map(c=>c.q));
  assert.ok(minQ>1);
  let n=0;const id=()=>'u'+(n++);
  const r=rollBossRewards(mulberry32(1),minQ-3,0,3,id,{pity:{legendary:0,unique:DROP_RULES.pity.unique-1}});
  assert.notEqual(r.forced,'unique');assert.equal(r.pity.unique,0);
  assert.ok(!r.drops.some(d=>d.rarity===4&&!d.setId));
  const rr=mulberry32(2);for(let k=0;k<4000;k++)for(const d of rollDrops(rr,{source:'boss',level:minQ-1,newId:id}))assert.ok(!(d.rarity===4&&!d.setId));
});
test('boss first kill: first item at least epic; repeat kills: at least magic',()=>{
  let n=0;const id=()=>'f'+(n++);
  for(let s=0;s<200;s++){
    assert.ok(rollBossRewards(mulberry32(s),30,s%9,0,id).drops[0].rarity>=2);
    assert.ok(rollBossRewards(mulberry32(s),30,s%9,4,id).drops[0].rarity>=1);
  }
});
test('gambling: price grows with level, jewelry costs double, item is the chosen slot, odds match the table',()=>{
  assert.ok(gambleCost(60,'weapon')>gambleCost(10,'weapon'));
  assert.equal(gambleCost(30,'ring1'),gambleCost(30,'weapon')*2);
  const r=mulberry32(8);
  for(const slot of GAMBLE_SLOTS)for(let k=0;k<30;k++){const it=gambleItem(r,40,slot,slot+k,'mage');assert.ok(it);assert.equal(slotGroup(it.slot),slotGroup(slot));assert.ok(it.ilvl>=35&&it.ilvl<=44);}
  const c={};const q=mulberry32(9);for(let k=0;k<100000;k++){const x=gambleQuality(q);c[x]=(c[x]||0)+1;}
  assert.ok(Math.abs(c.legendary/1e5-DROP_RULES.gamble.legendary)<.003);
  assert.ok(Math.abs(c.epic/1e5-DROP_RULES.gamble.epic)<.006);
  assert.ok(c.magic>c.epic&&c.epic>c.legendary&&c.legendary>c.set&&c.set>c.unique);
});
test('new characters start with a class weapon and a chest piece',()=>{
  let n=0;
  for(const cls of CLASS_IDS){
    const kit=starterKit(cls,()=>'k'+(n++));
    const w=kit.find(i=>i.slot==='weapon'),r=kit.find(i=>i.slot==='robe');
    assert.ok(w&&r,cls);assert.equal(w.rarity,0);assert.equal(w.req,1);
    assert.ok(CLASSES[cls].weapons.includes(catalogEntry(w).sub),cls+' '+catalogEntry(w).sub);
    assert.ok(w.power>0&&r.armor>0);
  }
});
