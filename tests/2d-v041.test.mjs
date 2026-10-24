import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SKILLS,SKILL_SCHOOLS,ACTIVE_LIMIT,DEFAULT_ACTIVE,DEFAULT_KEYS,bindableKey,keyLabel,catalogPool,normalizeItem,isBow,isQuiver,offhandAllowed,makeLoot,catalogEntry} from '../dist/2d/systems.js';
import {freshSave,sanitizeSave,rebindKey,sanitizeKeybinds,equip,mulberry32} from '../dist/2d/core.js';

test('31 skills across four schools, each with valid numbers',()=>{
  const list=Object.values(SKILLS).filter(s=>s.cls==='mage');
  assert.equal(list.length,31);
  for(const school of Object.keys(SKILL_SCHOOLS))assert.ok(list.filter(s=>s.school===school).length>=6,school);
  for(const s of list){assert.ok(s.cooldown>0&&s.mana>=0&&s.unlocked>=1&&s.unlocked<=60&&s.icon&&s.desc);assert.equal(s.key,undefined,'keys belong to bar slots, not skills');}
  assert.ok(list.filter(s=>s.unlocked<=1).length>=6,'plenty to play at level 1');
});
test('ten bar slots with default keys; keys are unique and never movement/menu keys',()=>{
  const p=freshSave();
  assert.equal(ACTIVE_LIMIT,10);assert.deepEqual(p.activeSkills,[...DEFAULT_ACTIVE]);assert.deepEqual(p.keybinds,[...DEFAULT_KEYS]);
  assert.equal(new Set(p.keybinds).size,10);
  for(const k of ['w','a','s','d','b','t','escape'])assert.equal(bindableKey(k),false);
  for(const k of ['1','q','g',' ','f5',';'])assert.equal(bindableKey(k),true);
  assert.equal(keyLabel(' '),'空格');assert.equal(keyLabel('q'),'Q');
});
test('rebinding swaps duplicates and rejects reserved keys; survives reload',()=>{
  const p=freshSave();
  assert.equal(rebindKey(p,0,'2'),true);
  assert.equal(p.keybinds[0],'2');assert.equal(p.keybinds[1],'1','old key handed to the other slot');
  assert.equal(rebindKey(p,3,'w'),false);assert.equal(p.keybinds[3],'4');
  assert.equal(rebindKey(p,4,'G'),true);assert.equal(p.keybinds[4],'g');
  const again=sanitizeSave(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(again.keybinds,p.keybinds);
  const bad=sanitizeKeybinds(['1','1','w',5,'<script>']);
  assert.equal(bad.length,10);assert.equal(new Set(bad).size,10);assert.ok(bad.every(k=>bindableKey(k)));
});
test('old 7-slot saves grow to 10 slots without losing their choices',()=>{
  const p=sanitizeSave({version:2,level:9,inventory:[],activeSkills:['storm','chain','ward','inferno','fire','blink','heal']});
  assert.equal(p.activeSkills.length,10);
  assert.deepEqual(p.activeSkills.slice(0,7),['storm','chain','ward','inferno','fire','blink','heal']);
  assert.equal(new Set(p.activeSkills).size,10);
  assert.deepEqual(p.keybinds,[...DEFAULT_KEYS]);
});
test('all weapon types drop; bows take a quiver, other two-handers block offhand',()=>{
  const r=mulberry32(7),subs=new Set();
  for(let k=0;k<3000;k++){const it=makeLoot(r,30,'w'+k);if(it.slot==='weapon'||it.slot==='offhand')subs.add(catalogEntry(it).sub);}
  for(const s of ['长剑','双手斧','长弓','重弩','法杖','箭囊','塔盾','法典'])assert.ok(subs.has(s),s);
  const mk=(id,slot,f)=>normalizeItem({id,slot,name:'x',cid:catalogPool(1,slot).find(f).id,rarity:1,power:5,hp:0,mana:0,armor:0});
  const bow=mk('bow','weapon',c=>c.sub==='长弓'),axe=mk('axe','weapon',c=>c.h===2&&['长枪','三叉戟','钩镰枪'].includes(c.sub)),quiver=mk('qv','offhand',c=>c.sub==='箭囊'),shield=mk('sh','offhand',c=>c.sub==='鸢盾');
  assert.ok(isBow(bow)&&isQuiver(quiver));
  assert.equal(offhandAllowed(bow,quiver),true);assert.equal(offhandAllowed(bow,shield),false);assert.equal(offhandAllowed(axe,quiver),false);
  const p=freshSave();p.heroClass='amazon';p.inventory.push(bow,axe,quiver,shield);   // v1.3：用亚马逊都会用的弓、长枪、箭袋、盾
  equip(p,'qv');equip(p,'bow');assert.equal(p.equipped.offhand,'qv');assert.equal(p.equipped.weapon,'bow');
  equip(p,'sh');assert.equal(p.equipped.weapon,null);assert.equal(p.equipped.offhand,'sh');
  equip(p,'axe');assert.equal(p.equipped.offhand,null);
  assert.ok(quiver.power>0&&quiver.armor===0&&quiver.mana===0);
});
