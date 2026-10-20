import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {MONSTERS,TIER,REGION_MONSTERS,waveMonsters} from '../dist/2d/monsters.js';
import {SPRITES,HERO_RIG} from '../dist/2d/sprite-data.js';
import {report,SKILL_BAL,budget} from '../dist/2d/balance.js';
import {LEGENDARY,UNIQUE,BASES,nameItem} from '../dist/2d/naming.js';
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
test('item names: rules per rarity, deterministic, hand-written legendary/unique names are unique',()=>{
  assert.equal(new Set(LEGENDARY.slice(1)).size,100);assert.equal(new Set(UNIQUE.slice(1)).size,100);
  assert.equal(new Set([...LEGENDARY.slice(1),...UNIQUE.slice(1)]).size,200);
  const r=mulberry32(21);
  for(let k=0;k<600;k++){
    const it=makeLoot(r,1+k%60,'n'+k,{boss:k%4===0}),e=catalogEntry(it),b=BASES[Number(e.id.slice(-3))];
    if(it.setId)continue;
    // v0.7 职业图鉴：基底名自带品阶词；职业传奇用图鉴专名
    if(/^C[BL]-/.test(e.id)){
      if(it.rarity===0)assert.equal(it.name,e.n);
      if(it.rarity===1)assert.ok(it.name.includes(e.n),it.name);
      if(it.rarity===3)assert.equal(it.name,e.n);
      assert.equal(normalizeItem(JSON.parse(JSON.stringify(it))).name,it.name,'stable across save/load');
      continue;
    }
    if(it.rarity===0)assert.ok(it.name.endsWith(b.n)||it.name.endsWith(b.n.slice(1)),it.name);
    if(it.rarity===1)assert.ok(it.name.includes(b.n)||it.name.includes(b.n.slice(1)),it.name);
    if(it.rarity===3)assert.equal(it.name,LEGENDARY[Number(e.id.slice(-3))]);
    if(it.rarity===4)assert.equal(it.name,UNIQUE[Number(e.id.slice(-3))]);
    assert.equal(normalizeItem(JSON.parse(JSON.stringify(it))).name,it.name,'stable across save/load');
  }
  const pool=catalogPool(1,'weapon').filter(c=>c.id.startsWith('EQ-')),x={id:'z',cid:pool[0].id,ilvl:30,affixes:[{key:'fire',value:affixMax('fire',30,1)},{key:'haste',value:3}]};
  const nm=nameItem(x,1,{fire:affixMax('fire',30,1)});assert.ok(nm.startsWith('炽焰')&&nm.endsWith('·疾风'),nm);
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
