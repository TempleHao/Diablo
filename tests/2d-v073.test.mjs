import test from 'node:test';
import assert from 'node:assert/strict';
import {mulberry32,freshSave,smartEquip,combatRating,autoEquip,equip} from '../dist/2d/core.js';
import {makeLoot,catalogEntry} from '../dist/2d/systems.js';
import {monsterHpMult,monsterDmgMult,armorDR,expRequired,DIFFICULTIES} from '../dist/2d/progression.js';
import {TIER} from '../dist/2d/monsters.js';

test('XP pacing: 1→60 takes about 50 trips (54 monsters per trip since v0.8)',()=>{
  const xpRun=L=>{const D=DIFFICULTIES[L<40?0:L<70?1:2];return (48*(TIER.normal.xp*.8+TIER.caster.xp*.2)+6*TIER.elite.xp+TIER.boss.xp)*(1+(L-1)*.04)*D.xp;};
  let a=0,b=0;for(let L=1;L<100;L++){const r=expRequired(L)/xpRun(L);if(L<60)a+=r;else b+=r;}
  assert.ok(a>42&&a<58,'1→60 trips: '+a);assert.ok(b>150&&b<260,'60→100 trips: '+b);
  assert.ok(expRequired(60)>expRequired(59),'curve stays monotonic at 60');
});
test('monster growth: hell is much tougher than normal at the same level, and growth outpaces linear',()=>{
  assert.ok(monsterHpMult(60,2)/monsterHpMult(60,0)>=2.4);
  assert.ok(monsterDmgMult(60,2)/monsterDmgMult(60,0)>=1.7);
  assert.ok(monsterHpMult(90,0)/monsterHpMult(30,0)>3.5);
  assert.ok(monsterHpMult(1,0)<monsterHpMult(10,0)*.3,'newbie ramp');
  assert.equal(TIER.boss.hp/TIER.normal.hp>35,true);
});
test('armor reduction decays with monster level and is capped',()=>{
  assert.ok(armorDR(500,10)>armorDR(500,80));
  assert.ok(armorDR(1e9,1)<=.75);
  assert.equal(armorDR(0,50),0);
});
test('high-level legendaries are not weaker than epics of the same item level',()=>{
  const r=mulberry32(3);let e=0,l=0,ea=0,la=0;
  for(let k=0;k<300;k++){const x=makeLoot(r,85,'e'+k,{slot:'weapon',force:'epic'});const y=makeLoot(r,85,'l'+k,{slot:'weapon',force:'legendary'});e+=x.power;l+=y.power;ea+=x.affixes.length;la+=y.affixes.length;}
  assert.ok(l>=e*.95,'legendary power '+l/300+' vs epic '+e/300);
  assert.ok(la>=ea*.95,'legendary affix count '+la/300+' vs epic '+ea/300);
});
test('smart equip: never lowers combat rating, is idempotent, respects level requirement',()=>{
  for(const cls of ['barbarian','mage','amazon','necro']){
    const p=freshSave();p.heroClass=cls;p.level=45;const r=mulberry32(cls.length*7);
    for(let i=0;i<60;i++)p.inventory.push(makeLoot(r,30+i%25,'s'+i,{cls,min:1}));
    autoEquip(p);const base=combatRating(p);
    const dry=smartEquip(p,null,{dry:true});assert.equal(combatRating(p),base,'dry run does not change gear');
    const res=smartEquip(p);
    assert.ok(res.after>=res.before&&res.after>=base,cls);assert.equal(combatRating(p),res.after);
    assert.equal(dry.after,res.after);
    assert.equal(smartEquip(p).changed.length,0,'second run finds nothing');
    for(const id of Object.values(p.equipped))if(id){const it=p.inventory.find(i=>i.id===id);assert.ok((it.req||1)<=p.level);}
  }
});
test('combat rating rises when a strictly better weapon is equipped',()=>{
  const p=freshSave();p.heroClass='barbarian';p.level=50;const r=mulberry32(4);
  const weak=makeLoot(r,5,'w1',{cls:'barbarian',slot:'weapon',force:'normal'}),strong=makeLoot(r,50,'w2',{cls:'barbarian',slot:'weapon',force:'epic'});
  p.inventory.push(weak,strong);equip(p,'w1');const a=combatRating(p);equip(p,'w2');const b=combatRating(p);
  assert.ok(b>a,a+' → '+b);
});
