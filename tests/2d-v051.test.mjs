import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BUILDS} from '../dist/2d/builds.js';
import {SKILLS,AFFIXES,CLASS_IDS,makeLoot,catalogEntry,offhandAllowed} from '../dist/2d/systems.js';
import {freshSave,sanitizeSave,respec,autoEquip,buildScore,upgradeSkill,gainXp,mulberry32,switchClass,pointsFor} from '../dist/2d/core.js';

test('every class has two valid builds',()=>{
  for(const c of CLASS_IDS){
    assert.equal(BUILDS[c].length,2,c);
    for(const b of BUILDS[c]){
      assert.equal(new Set(b.skills).size,10);for(const k of b.skills)assert.equal(SKILLS[k]?.cls,c,b.id+' '+k);
      for(const k of Object.keys(b.weights))assert.ok(AFFIXES[k]||['power','hp','mana','armor'].includes(k),k);
      assert.ok(b.weapons.length&&b.tips.length&&b.desc);
    }
  }
});
test('respec refunds only the current class and survives reload',()=>{
  const p=freshSave();gainXp(p,4000);const lv=p.level;
  upgradeSkill(p,'fire');upgradeSkill(p,'fire');switchClass(p,'necro');upgradeSkill(p,'nec_teeth');
  assert.equal(respec(p),1);assert.equal(p.skillPoints,lv-1);assert.equal(p.skillRanks.fire,2);
  const q=sanitizeSave(JSON.parse(JSON.stringify(p)));assert.equal(q.skillPoints,lv-1);assert.equal(pointsFor(q,'mage'),lv-3);
});
test('auto-equip fills slots, respects weapon/offhand rules, never wears legacy items, and is idempotent',()=>{
  for(const c of CLASS_IDS)for(const b of BUILDS[c]){
    const p=freshSave();p.level=30;p.heroClass=c;const r=mulberry32(c.length*7+b.id.length);
    for(let i=0;i<70;i++)p.inventory.push(makeLoot(r,30,b.id+i,{cls:c}));
    p.inventory.push({id:'old',slot:'pants',name:'旧护腿',rarity:1,legacy:true,affixes:[],power:0,hp:0,mana:0,armor:99});
    autoEquip(p,b.id);
    const worn=Object.values(p.equipped).filter(Boolean);
    assert.ok(worn.length>=9,b.id+' worn '+worn.length);assert.ok(!worn.includes('old'));assert.equal(new Set(worn).size,worn.length,'no duplicates');
    const w=p.inventory.find(i=>i.id===p.equipped.weapon),o=p.inventory.find(i=>i.id===p.equipped.offhand);
    assert.ok(offhandAllowed(w,o));
    for(const [slot,id] of Object.entries(p.equipped))if(id){const it=p.inventory.find(i=>i.id===id);assert.ok(slot.startsWith('ring')?it.slot.startsWith('ring'):it.slot===slot);}
    assert.equal(autoEquip(p,b.id),0,'second run changes nothing');
    assert.equal(p.builds[c],b.id);
  }
});
test('build weights steer choices: fire build prefers fire gear',()=>{
  const p=freshSave();p.level=30;const r=mulberry32(4);
  for(let i=0;i<300;i++)p.inventory.push(makeLoot(r,30,'m'+i,{cls:'mage',min:1}));
  const fire=BUILDS.mage[0],frost=BUILDS.mage[1];
  const sum=(key)=>Object.values(p.equipped).filter(Boolean).map(id=>p.inventory.find(i=>i.id===id)).reduce((n,it)=>n+(it.affixes.find(a=>a.key===key)?.value||0),0);
  autoEquip(p,fire.id);const f1=sum('fire'),c1=sum('cold');
  autoEquip(p,frost.id);const f2=sum('fire'),c2=sum('cold');
  assert.ok(f1>=f2&&c2>=c1&&(f1>f2||c2>c1));
  assert.ok(buildScore(p.inventory[0],'mage',fire)>=0);
});
