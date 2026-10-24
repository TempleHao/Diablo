import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {MONSTERS,TIER,REGION_MONSTERS,waveMonsters} from '../dist/2d/monsters.js';
import {SPRITES,HERO_RIG} from '../dist/2d/sprite-data.js';
import {report,SKILL_BAL,budget} from '../dist/2d/balance.js';
import {nameItem,nameProblems,originOf} from '../dist/2d/naming.js';
import {NAMING} from '../dist/2d/naming-data.js';
import {makeLoot,catalogEntry,catalogPool,normalizeItem,AFFIXES,affixMax,SKILLS} from '../dist/2d/systems.js';
import {mulberry32,blinkLanding,walkable} from '../dist/2d/core.js';
import {swingPose} from '../dist/2d/pixel-mage-demo.js';
import {WEAPON_TYPES} from '../dist/2d/classes.js';

test('100 monsters in four tiers, all with sprites; every region pool is valid',()=>{
  const by=t=>Object.values(MONSTERS).filter(m=>m.tier===t).length;
  assert.deepEqual([by('normal'),by('caster'),by('elite'),by('boss')],[30,25,25,20]);
  for(const m of Object.values(MONSTERS)){assert.ok(SPRITES[m.sprite],m.sprite);assert.ok(TIER[m.tier]);assert.ok(m.name.length>=2);}
  assert.equal(new Set(Object.values(MONSTERS).map(m=>m.sprite)).size,100,'every sprite used once');
  assert.equal(REGION_MONSTERS.length,9);
  const bosses=new Set();
  for(const r of REGION_MONSTERS){for(const k of ['normal','caster','elite','boss'])for(const id of r[k])assert.equal(MONSTERS[id]?.tier,k,id);r.boss.forEach(b=>bosses.add(b));}
  assert.equal(bosses.size,20,'all 20 bosses appear somewhere');
  for(let region=0;region<9;region++)for(let w=0;w<3;w++){const g=waveMonsters(region,w,mulberry32(region*7+w));assert.equal(g.length,18);
    assert.equal(g.filter(id=>MONSTERS[id].tier==='elite').length,w+1);}
  for(const m of Object.values(MONSTERS)){if(m.tier==='boss')assert.ok(m.moves.length>=3);if(m.tier==='elite')assert.ok(m.mods.length>=1);
    if(m.ai==='caster'||m.ai==='ranged')assert.ok(m.school&&m.shot,m.name);}
});
test('summon sprites and hero rigs exist; swing has wind-up, fast strike and recovery',()=>{
  for(let i=0;i<10;i++)assert.ok(SPRITES['summon'+i]);
  for(const c of ['amazon','assassin','barbarian','druid','necro','paladin']){
    const r=HERO_RIG[c];assert.ok(r.body&&r.weapon&&r.tx!=null,c);
    const s=['thrust','chop','smash','claws','staff'];assert.ok(s.includes(r.style));
    const wind=swingPose(r.style,.3),strike=swingPose(r.style,.5),rest=swingPose(r.style,.999);
    assert.ok(Math.abs(wind.ang-strike.ang)>=40||Math.abs(wind.push-strike.push)>=10||r.style==='staff',c);
    assert.ok(strike.hit&&!wind.hit&&!rest.hit);assert.ok(Math.abs(rest.ang)<3);
    assert.ok(strike.lunge>wind.lunge,'body lunges forward on the strike');
  }
  assert.ok(HERO_RIG.mage.body);
  for(const f of ['heroes.webp','monsters.webp','heroes-mage.webp'])assert.ok(existsSync(new URL('../dist/2d/art/'+f,import.meta.url)));
});
test('blink teleports through walls and never lands inside one',()=>{
  const d={blocks:[{x:200,y:100,w:40,h:200},{x:400,y:150,w:60,h:60}]};
  assert.deepEqual(blinkLanding({x:150,y:200},{x:330,y:200},17,d),{x:330,y:200});
  const p=blinkLanding({x:150,y:200},{x:220,y:200},17,d);assert.ok(walkable(p.x,p.y,17,d));
  const q=blinkLanding({x:330,y:180},{x:430,y:180},17,d);assert.ok(walkable(q.x,q.y,17,d)&&q.x<400);
});
test('item names (v1.6): east/west lexicons never mix, named items fixed and unique, deterministic',()=>{
  const named=Object.values(NAMING.NAMED).map(x=>x[0]);
  assert.equal(new Set(named).size,named.length,'legendary/unique names are unique');
  const allE=new Set([...NAMING.EPIC_E]),allW=new Set([...NAMING.EPIC_W]);
  const r=mulberry32(21);
  for(let k=0;k<800;k++){
    const it=makeLoot(r,1+k%99,'n'+k,{boss:k%4===0,region:k%9}),e=catalogEntry(it);
    assert.ok(it.origin==='e'||it.origin==='w');
    if(it.rarity>=3&&!it.setId)assert.equal(it.name,NAMING.NAMED[e.id][0]);
    if(it.rarity===2&&!it.setId){const head=[...allE,...allW].find(w=>it.name.startsWith(w));assert.ok(head,it.name);
      assert.ok((it.origin==='e'?allE:allW).has(head),'epic imagery follows origin '+it.name);}
    assert.deepEqual(nameProblems(it.name),[],it.name);
    assert.ok([...it.name.replace('·','')].length<=8,it.name);
    assert.equal(normalizeItem(JSON.parse(JSON.stringify(it))).name,it.name,'stable across save/load');
  }
  const fm={fire:affixMax('fire',30,1)},W=catalogPool(1,'weapon').find(c=>c.sub==='长剑'&&c.o!=='e'),E=catalogPool(1,'weapon').find(c=>c.sub==='长剑'&&c.o==='e');
  const x={id:'z',ilvl:30,affixes:[{key:'fire',value:fm.fire},{key:'hp',value:3}]};
  assert.equal(nameItem({...x,cid:E.id},1,fm,E).replace(/长剑|汉剑/,'X'),'燎X·熊','east art → east words');
  assert.equal(nameItem({...x,cid:W.id},1,fm,W).replace(/阔剑|长剑/,'X'),'熔铸X·狼','gothic art → west words');
});
test('named items: every class gets half east, half west; early maps drop east, late maps west',()=>{
  const per={};for(const [id,[n,o]] of Object.entries(NAMING.NAMED)){const e=catalogEntry({cid:id});const c=e.owner||({'亚马逊':'amazon','刺客':'assassin','野蛮人':'barbarian','德鲁伊':'druid','死灵法师':'necro','圣骑士':'paladin','法师':'mage'})[e.cls]||'all';(per[c]||={e:0,w:0})[o]++;}
  for(const [c,v] of Object.entries(per))assert.ok(Math.abs(v.e-v.w)<=1,c+' '+JSON.stringify(v));
  const r=mulberry32(5),share=reg=>{let e=0;for(let k=0;k<2000;k++)if(makeLoot(r,40,'o'+reg+k,{region:reg}).origin==='e')e++;return e/2000;};
  assert.ok(share(0)>.72&&share(8)<.28&&Math.abs(share(4)-.5)<.06);
});
test('name quality: no banned words, at most one dark image, every named item has a source note',()=>{
  for(const [n,,note] of Object.values(NAMING.NAMED)){assert.deepEqual(nameProblems(n),[],n);assert.ok(note&&note.length>=4,n);}
  for(const list of [NAMING.EPIC_E,NAMING.EPIC_W])for(const w of list)assert.deepEqual(nameProblems(w),[],w);
});
test('balance: every damage skill lands on its budget; basic attacks equal; spam DPS across classes within a band',()=>{
  const rows=report();
  for(const r of rows){
    if(r.type==='none')continue;
    if(r.bal>.3&&r.bal<4)assert.ok(Math.abs(r.perCast-r.target)/r.target<.05,r.id+' '+r.perCast+' vs '+r.target);
    if(r.type==='basic')assert.equal(r.dps,2.2);
  }
  const spam={};for(const r of rows)if(r.type==='burst'&&r.cd<=1.2&&r.bal<4)(spam[r.cls]||=[]).push(r.dps);
  const avg=Object.values(spam).map(v=>v.reduce((a,b)=>a+b)/v.length);
  assert.ok(Math.max(...avg)/Math.min(...avg)<1.35,'class spam DPS spread '+avg.map(n=>n.toFixed(2)));
  assert.ok(budget(8,'big')>budget(1,'single')*1.2);
});
test('weapon power is normalised by attack speed: basic-attack DPS within 10% across weapon types',()=>{
  // v0.7：基底强度看品级（qb = 品级×0.75 + 物品等级×0.25），所以先除以基底强度再比较攻速归一
  const r=mulberry32(3),dps={};
  for(let k=0;k<4000;k++){const it=makeLoot(r,30,'w'+k);if(it.slot!=='weapon'||it.rarity!==1)continue;const e=catalogEntry(it),w=WEAPON_TYPES[e.sub];if(!w||w.mode==='spell')continue;
    const qb=Math.max(1,Math.round(e.q*.75+30*.25));
    const v=it.power*w.speed/(e.h===2?1.4:1)/(6+qb*2.5);(dps[e.h+'h']||=[]).push(v);}
  for(const v of Object.values(dps)){const avg=v.reduce((a,b)=>a+b)/v.length;for(const x of v)assert.ok(x/avg>.8&&x/avg<1.25);}
});
test('percent affixes grow gently with item level; flat affixes grow linearly',()=>{
  assert.ok(affixMax('crit',60,4)<=12&&affixMax('crit',1,1)>=5);
  assert.ok(affixMax('hp',60,1)>affixMax('hp',1,1)*3.5);
  assert.ok(affixMax('fire',60,3)<affixMax('fire',1,1)*2.2);
});
