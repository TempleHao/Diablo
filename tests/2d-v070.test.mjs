import test from 'node:test';
import assert from 'node:assert/strict';
import {mulberry32,freshSave,sanitizeSave,equip,stats,gainXp,expRequired,rankCap,upgradeSkill,addParagon,paragonLeft,resetParagon,autoEquip} from '../dist/2d/core.js';
import {makeLoot,rollQuality,rollDrops,normalizeItem,catalogEntry,POOLS,SETS,CATALOG_BY_ID,DROP_RULES,itemPowers,requiredLevel,AFFIXES,MAX_LEVEL,CLASS_IDS,SKILLS,skillsOf,PARAGON} from '../dist/2d/systems.js';
import {CLASS_BASES,CLASS_LEGENDS,SET_PIECES} from '../dist/2d/class-catalog.js';
import {powersOf,describePower,skillLegend,emptyLegend,addPower} from '../dist/2d/legendary.js';
import {rollBossRewards,BOSS_POOLS} from '../dist/2d/boss-loot.js';
import {DIFFICULTIES,monsterLevel,difficultyUnlocked,xpFactor} from '../dist/2d/progression.js';
import {LocalStore,MemoryStorage,ROSTER_KEY,LEGACY_KEY,cleanName,STASH_SIZE} from '../dist/2d/storage.js';
import {SKILL_ICON} from '../dist/2d/skill-icons.js';
import {readFileSync,existsSync} from 'node:fs';

test('v0.7 catalog: 760 class bases + 291 class legendaries, unique names, valid slots, atlases on disk',()=>{
  assert.equal(CLASS_BASES.length,760);assert.equal(CLASS_LEGENDS.length,291);
  const names=new Set(CLASS_LEGENDS.map(l=>l.n));assert.equal(names.size,291,'legendary names are unique');
  for(const e of [...CLASS_BASES,...CLASS_LEGENDS]){
    assert.ok(['head','shoulders','robe','gloves','belt','boots','weapon','offhand','amulet','ring1'].includes(e.s),e.id);
    assert.ok(e.q>=1&&e.q<=100,e.id);assert.ok(existsSync(new URL('../dist/2d/art/equipment/'+e.a+'.webp',import.meta.url)),e.a);
  }
  for(const cls of CLASS_IDS)assert.ok(CLASS_LEGENDS.filter(l=>l.owner===cls).length>=36,cls);
  assert.equal(SET_PIECES.length,28);
  for(const p of SET_PIECES)assert.ok(CATALOG_BY_ID.get(p.base),p.base);
});
test('every skill has a cropped icon',()=>{
  for(const id of Object.keys(SKILLS))assert.ok(Number.isInteger(SKILL_ICON[id]),id);
  assert.ok(existsSync(new URL('../dist/2d/art/skills.webp',import.meta.url)));
});
test('drop rates: rarer qualities are rarer, sources and difficulty raise legendary chance, MF has diminishing returns',()=>{
  const count=(opts,N=60000)=>{const r=mulberry32(5),c=[0,0,0,0,0];let set=0;for(let k=0;k<N;k++){const q=rollQuality(r,opts);c[q.rarity]++;if(q.set)set++;}return {c:c.map(x=>x/N),set:set/N};};
  const n=count({ilvl:50,source:'normal'}),b=count({ilvl:50,source:'boss'}),h=count({ilvl:50,source:'normal',difficulty:2});
  assert.ok(n.c[0]>n.c[1]&&n.c[1]>n.c[2]&&n.c[2]>n.c[3],'white > magic > epic > legendary');
  assert.ok(n.c[3]>.005&&n.c[3]<.02,'legendary per normal item ~1%: '+n.c[3]);
  assert.ok(b.c[3]>n.c[3]*2.5,'boss items much more likely legendary');
  assert.ok(h.c[3]>n.c[3]*1.4,'hell raises legendary chance');
  const m0=count({ilvl:50,mf:0}),m300=count({ilvl:50,mf:300}),m900=count({ilvl:50,mf:900});
  const gain1=m300.c[3]/m0.c[3],gain2=m900.c[3]/m300.c[3];
  assert.ok(gain1>1.5,'MF helps');assert.ok(gain2<gain1,'diminishing returns');
  assert.equal(rollQuality(mulberry32(1),{min:2}).rarity>=2,true);
});
test('drops per kill: normal monsters rarely drop, elites often, bosses always three',()=>{
  const r=mulberry32(77);let n=0,e=0,b=0;const id=()=>'d'+Math.random();
  for(let k=0;k<5000;k++){n+=rollDrops(r,{source:'normal',level:30,newId:id}).length;e+=rollDrops(r,{source:'elite',level:30,newId:id}).length;}
  for(let k=0;k<200;k++)b+=rollDrops(r,{source:'boss',level:30,newId:id}).length;
  assert.ok(n/5000>.09&&n/5000<.16,'normal ~12%: '+n/5000);
  assert.ok(e/5000>.75&&e/5000<1.05,'elite ~0.9 items: '+e/5000);
  assert.equal(b,600);
});
test('item level gates bases and legendaries; requirement level follows quality level',()=>{
  const r=mulberry32(9);
  for(let k=0;k<3000;k++){
    const lv=1+k%100,it=makeLoot(r,lv,'g'+k,{source:k%3?'normal':'boss'}),e=catalogEntry(it);
    assert.ok(e,'catalog entry');
    if(!it.setId)assert.ok(e.q<=Math.max(lv,e.q<=4?4:lv),'q '+e.q+' <= ilvl '+lv);
    assert.ok(it.req>=1&&it.req<=MAX_LEVEL);
    if(it.rarity===3&&!it.setId)assert.ok(it.req>=e.q-3);
  }
  assert.equal(requiredLevel({q:90},3,95),87);
});
test('high-level affixes need item level: skillAll only from ilvl 60 epic+, cdr from 30',()=>{
  const r=mulberry32(4);let seenAll=false;
  for(let k=0;k<6000;k++){
    const lv=1+k%100,it=makeLoot(r,lv,'a'+k,{source:'boss'});
    for(const a of it.affixes){
      if(a.key==='skillAll'){seenAll=true;assert.ok(lv>=60&&it.rarity>=2);assert.ok(it.req>=60);}
      if(a.key==='cdr')assert.ok(lv>=30);
    }
  }
  assert.ok(seenAll,'+all skills exists at high level');
});
test('every legendary and unique has 1-2 deterministic powers with readable text',()=>{
  for(const e of [...POOLS.legend.weapon,...Object.values(POOLS.legend).flat(),...Object.values(POOLS.unique).flat()]){
    const p=powersOf(e,e.r);assert.ok(p.length>=1&&p.length<=2,e.id);
    assert.deepEqual(powersOf(e,e.r),p,'deterministic');
    for(const x of p){const t=describePower(x);assert.ok(t.length>4,e.id+' '+JSON.stringify(x));assert.ok(!/undefined|NaN/.test(t),t);}
  }
  // 职业传奇的技能特效引用的是本职业技能
  for(const e of CLASS_LEGENDS)for(const x of powersOf(e,3))if(x.skill)assert.equal(SKILLS[x.skill].cls,e.owner,e.id+' '+x.skill);
});
test('legendary powers feed combat modifiers (rank, damage, cooldown, cost, projectiles)',()=>{
  const L=emptyLegend();
  addPower(L,{k:'rank',skill:'nec_bonespear',n:2});addPower(L,{k:'sdmg',skill:'nec_bonespear',pct:50});
  addPower(L,{k:'tree',cls:'necro',tree:'bone',pct:20});addPower(L,{k:'treeRank',cls:'necro',tree:'bone',n:1});
  addPower(L,{k:'cdr',skill:'nec_bonespear',pct:25});addPower(L,{k:'cost',skill:'nec_bonespear',pct:20});addPower(L,{k:'proj',skill:'nec_bonespear',n:1});
  const s=skillLegend(L,'nec_bonespear');
  assert.equal(s.rank,3);assert.ok(Math.abs(s.dmg-1.7)<1e-9);assert.ok(Math.abs(s.cd-.75)<1e-9);assert.ok(Math.abs(s.cost-.8)<1e-9);assert.equal(s.proj,1);
  const other=skillLegend(L,'nec_skeleton');assert.equal(other.rank,0);assert.equal(other.dmg,1);
});
test('equipped legendary changes stats; under-level items are worn but give nothing',()=>{
  const p=freshSave();p.heroClass='necro';p.level=80;
  const r=mulberry32(12);let it=null;
  for(let k=0;k<400&&!it;k++){const x=makeLoot(r,80,'L'+k,{cls:'necro',force:'legendary'});if(catalogEntry(x).owner==='necro'&&x.slot==='amulet')it=x;}
  assert.ok(it,'found a necro amulet');
  p.inventory.push(it);assert.ok(equip(p,it.id));
  const s=stats(p);assert.ok(Object.keys(s.legend.treeRank).length+Object.keys(s.legend.tree).length>0);
  const low=freshSave();low.level=5;const big={...it,id:'big',req:90};low.inventory.push(normalizeItem(big));
  assert.equal(equip(low,'big'),false,'cannot equip above level');
});
test('class sets: 4 pieces, bonuses at 2/3/4, names follow set name',()=>{
  const p=freshSave();p.heroClass='mage';p.level=60;
  const pieces=SETS.set_mage.cids.map((cid,i)=>{const e=CATALOG_BY_ID.get(cid);return normalizeItem({id:'s'+i,slot:e.s,name:'x',rarity:4,setId:'set_mage',cid,ilvl:60,req:36,power:10,hp:0,mana:0,armor:0,affixes:[]});});
  assert.equal(pieces.length,4);
  for(const it of pieces){assert.equal(it.setId,'set_mage');assert.ok(it.name.startsWith('星穹大法师·'),it.name);}
  p.inventory.push(...pieces);
  const base=stats(p).classSkill;
  equip(p,pieces[0].id);equip(p,pieces[1].id);assert.equal(stats(p).classSkill,base+1,'2-piece +1 skill');
  equip(p,pieces[2].id);assert.ok(stats(p).mf>=30);
  equip(p,pieces[3].id);const s=stats(p);assert.ok(s.dmgPct>=30&&s.legend.cdrAll>=15);
});
test('boss rewards: pity forces a legendary after a dry streak, then resets',()=>{
  let n=0;const id=()=>'p'+(n++);
  const res=rollBossRewards(mulberry32(3),50,0,4,id,{pity:{legendary:DROP_RULES.pity.legendary-1,unique:0}});
  assert.equal(res.forced,'legendary');assert.ok(res.drops.some(d=>d.rarity===3&&d.name!==BOSS_POOLS[0].item));
  assert.equal(res.pity.legendary,0);
  const dry=rollBossRewards(()=>.999,50,0,4,id,{pity:{legendary:0,unique:0}});
  assert.equal(dry.pity.legendary,1);
});
test('level 100: XP curve steepens after 60, skill rank cap grows, paragon points from 61',()=>{
  assert.ok(expRequired(80)/expRequired(59)>4);
  const p=freshSave();gainXp(p,1e12);assert.equal(p.level,100);
  assert.equal(rankCap(60),8);assert.equal(rankCap(100),12);
  assert.equal(paragonLeft(p),40);
  assert.ok(addParagon(p,'dmg'));assert.equal(paragonLeft(p),39);
  assert.equal(stats(p).dmgPct,PARAGON.dmg.per);
  for(let k=0;k<20;k++)addParagon(p,'dmg');assert.equal(p.paragon.dmg,PARAGON.dmg.max);
  assert.equal(resetParagon(p),PARAGON.dmg.max);
  const saved=sanitizeSave({...p,paragon:{dmg:99,hp:3},level:62});assert.ok(saved.paragon.dmg+(saved.paragon.hp||0)<=2);
});
test('difficulties: area levels, player scaling cap, unlocks, resist penalty, XP penalty',()=>{
  const p=freshSave();p.level=1;p.region=8;assert.equal(monsterLevel(p),36);
  p.level=80;p.region=0;assert.equal(monsterLevel(p),45,'normal caps at 45');
  p.difficulty=2;assert.equal(monsterLevel(p),80);assert.equal(monsterLevel(p,true),82);
  const q=freshSave();assert.equal(difficultyUnlocked(q,1),false);q.level=40;assert.equal(difficultyUnlocked(q,1),true);
  const r=freshSave();r.bossKills[0][8]=1;assert.equal(difficultyUnlocked(r,1),true);assert.equal(difficultyUnlocked(r,2),false);
  q.difficulty=1;assert.equal(stats(q).resistFire,-20);
  assert.equal(xpFactor(60,58),1);assert.ok(xpFactor(80,45)<.2);
  const migrated=sanitizeSave({version:2,bossKills:[1,2,3],difficulty:2,level:10});
  assert.deepEqual(migrated.bossKills[0].slice(0,3),[1,2,3]);assert.equal(migrated.difficulty,0,'locked difficulty falls back');
});
test('roster storage: legacy save migrates once, characters are independent, stash is shared, names validated',()=>{
  const mem=new MemoryStorage();
  mem.setItem(LEGACY_KEY,JSON.stringify({version:2,level:33,heroClass:'paladin',inventory:[]}));
  const st=new LocalStore(mem);
  const id=st.migrateLegacy();assert.ok(id);assert.equal(st.migrateLegacy(),null,'only once');
  assert.equal(st.list()[0].cls,'paladin');assert.equal(st.list()[0].level,33);assert.equal(st.active(),id);
  assert.ok(mem.getItem(LEGACY_KEY),'legacy data kept');
  const b=st.create('暗影',  'assassin',{...freshSave(),heroClass:'assassin'});assert.ok(b.id);
  assert.equal(st.create('暗影','mage',freshSave()).error,'已有同名角色');
  assert.equal(st.create('   ','mage',freshSave()).error,'请输入角色名');
  const prof=st.load(b.id);prof.level=7;st.save(b.id,prof);
  assert.equal(st.list().find(c=>c.id===b.id).level,7);assert.equal(st.load(id).level,33,'other character untouched');
  st.saveStash([{id:'x'}]);assert.equal(st.stash().length,1);
  st.remove(b.id);assert.equal(st.list().length,1);assert.equal(st.stash().length,1,'stash survives deletion');
  assert.equal(cleanName('<b>名字很长很长很长很长很长很长</b>').length<=12,true);
  assert.equal(STASH_SIZE,40);
  assert.ok(mem.getItem(ROSTER_KEY));
});
test('auto-equip ignores items the character is too low level to wear',()=>{
  const p=freshSave();p.heroClass='barbarian';p.level=10;
  const r=mulberry32(8);for(let k=0;k<80;k++)p.inventory.push(makeLoot(r,1+k,'e'+k,{cls:'barbarian'}));
  autoEquip(p);
  for(const id of Object.values(p.equipped))if(id)assert.ok(p.inventory.find(i=>i.id===id).req<=10);
});
