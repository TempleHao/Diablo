import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SKILLS,CLASSES,CLASS_IDS,skillsOf,makeLoot,catalogEntry,AFFIXES,calculateStats,normalizeItem,catalogPool,attackMode} from '../dist/2d/systems.js';
import {freshSave,sanitizeSave,switchClass,upgradeSkill,gainXp,mulberry32,equip,pointsFor} from '../dist/2d/core.js';
import {WEAPON_TYPES} from '../dist/2d/classes.js';

const ARCH=new Set(['basic','melee','whirl','leap','charge','proj','nova','area','summon','turret','buff','aura','curse','heal','dash','corpse']);
test('seven classes; six new ones have 25 skills over three trees, mage keeps 31',()=>{
  assert.deepEqual(CLASS_IDS,['amazon','assassin','barbarian','druid','necro','paladin','mage']);
  for(const c of CLASS_IDS){
    const list=skillsOf(c),C=CLASSES[c];
    if(c==='mage'){assert.equal(list.length,31);continue;}
    assert.equal(list.length,25,c);
    for(const tree of Object.keys(C.trees))assert.ok(list.filter(k=>SKILLS[k].tree===tree).length>=7,c+' '+tree);
    for(const k of list){const s=SKILLS[k];assert.ok(ARCH.has(s.a),k);assert.ok(s.cooldown>0&&s.mana>=0&&s.unlocked>=1&&s.name&&s.icon,k);
      if(['melee','proj','nova'].includes(s.a))assert.ok(s.m>0,k+' damage multiplier');}
    assert.equal(C.defaults.length,10);for(const d of C.defaults)assert.equal(SKILLS[d].cls,c);
    assert.ok(list.filter(k=>SKILLS[k].unlocked<=2).length>=5,c+' playable at level 1-2');
  }
});
test('class switch keeps level and gear, separates loadouts and skill points',()=>{
  const p=freshSave();gainXp(p,5000);const lv=p.level;
  assert.equal(upgradeSkill(p,'fire'),true);assert.equal(upgradeSkill(p,'bar_bash'),false,'cannot rank another class skill');
  p.keybinds[0]='g';
  switchClass(p,'barbarian');
  assert.equal(p.level,lv);assert.equal(p.heroClass,'barbarian');
  assert.deepEqual(p.activeSkills,CLASSES.barbarian.defaults);assert.equal(p.keybinds[0],'1');
  assert.equal(p.skillPoints,lv-1,'fresh points for the new class');
  assert.equal(upgradeSkill(p,'bar_bash'),true);
  switchClass(p,'mage');assert.equal(p.keybinds[0],'g');assert.equal(p.skillPoints,lv-2);
  const again=sanitizeSave(JSON.parse(JSON.stringify(p)));
  assert.equal(again.skillRanks.bar_bash,1);assert.equal(again.skillRanks.fire,1);assert.equal(again.loadouts.barbarian.activeSkills[0],'bar_basic');
  assert.equal(pointsFor(again,'barbarian'),lv-2);
});
test('class stats differ; weapon type decides attack mode; proficiency bonus',()=>{
  const bar=freshSave();bar.heroClass='barbarian';const mage=freshSave();
  assert.ok(calculateStats(bar).hp>calculateStats(mage).hp);assert.ok(calculateStats(bar).armor>calculateStats(mage).armor);
  assert.equal(attackMode('amazon','长弓').mode,'bow');assert.equal(attackMode('barbarian','法杖').mode,'melee');assert.equal(attackMode('mage','法杖').mode,'spell');
  for(const [sub,w] of Object.entries(WEAPON_TYPES))assert.ok(w.speed>0&&['melee','bow','throw','spell'].includes(w.mode),sub);
  const axeEntry=catalogPool(1,'weapon').find(c=>c.sub==='双手斧');
  bar.inventory.push(normalizeItem({id:'axe',slot:'weapon',name:'x',cid:axeEntry.id,rarity:1,power:30,hp:0,mana:0,armor:0}));equip(bar,'axe');
  assert.equal(calculateStats(bar).proficient,true);
  mage.inventory.push({...bar.inventory[0]});equip(mage,'axe');assert.equal(calculateStats(mage).proficient,false);
});
test('loot leans to the current class and class-skill affixes only roll on that class gear',()=>{
  for(const c of CLASS_IDS){
    const r=mulberry32(11);let mine=0;const N=1500;
    for(let k=0;k<N;k++){
      const it=makeLoot(r,40,c+k,{cls:c}),e=catalogEntry(it);
      if(e.cls===CLASSES[c].catalog||e.cls==='全职业')mine++;
      for(const a of it.affixes){if(AFFIXES[a.key].cls)assert.equal(CLASSES[AFFIXES[a.key].cls].catalog,e.cls,'class skill affix on matching gear');
        if(a.key==='skillFire'||a.key==='skillCold')assert.equal(e.cls,'法师');}
    }
    assert.ok(mine/N>.45,c+' share '+mine/N);
  }
});
test('epic+ class gear usually carries its class skill affix',()=>{
  const r=mulberry32(5);let n=0,hit=0;
  for(let k=0;k<4000;k++){const it=makeLoot(r,50,'e'+k,{boss:true,cls:'necro'}),e=catalogEntry(it);
    if(it.rarity>=2&&e.cls==='死灵法师'&&AFFIXES.sk_necro.slots.includes(it.slot)){n++;if(it.affixes.some(a=>a.key==='sk_necro'))hit++;}}
  assert.ok(n>30&&hit/n>.9);
});
