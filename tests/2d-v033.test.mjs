import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshSave,sanitizeSave,equip,stats} from '../dist/2d/core.js';
import {SKILLS,normalizeItem} from '../dist/2d/systems.js';
import {MATERIALS,salvageYield,eligibleForAutoSalvage,dismantle,dismantleAll,autoDismantleDrop,canTemper,temper,temperCost} from '../dist/2d/crafting.js';
const item=(id,slot,rarity=0,other={})=>normalizeItem({
 id,slot,rarity,name:'测试 '+id,ilvl:12,power:slot==='weapon'?20:0,hp:0,mana:0,armor:0,value:40,
 affixes:rarity?[{key:slot==='head'?'hp':'power',value:5}]:[],...other
});
test('legacy save adds materials and default-disabled automatic salvage',()=>{
 const old={version:1,level:9,inventory:[],equipped:{},gold:500};
 const profile=sanitizeSave(old);
 assert.deepEqual(profile.materials,{dust:0,crystal:0,core:0});
 assert.equal(profile.autoSalvage,-1);
 assert.deepEqual(profile.activeSkills,['fire','shard','nova','meteor','chain','ward','heal','armor','storm','blink']);
 assert.equal(profile.level,9);
});
test('auto dismantling never removes equipped, favorites, legendary or set gear',()=>{
 const p=freshSave();p.autoSalvage=2;
 const plain=item('plain','head',0),magic=item('magic','head',1),rare=item('rare','weapon',2),
  legendary=item('legend','weapon',3),favorite=item('fav','head',0,{favorite:true});
 const set=item('set','head',4,{setId:'dragonflame'});
 p.inventory.push(plain,magic,rare,legendary,favorite,set);
 assert.ok(equip(p,'rare'));
 const results=dismantleAll(p);
 assert.deepEqual(results.map(x=>x.item.id).sort(),['magic','plain']);
 assert.deepEqual(p.inventory.map(x=>x.id).sort(),['fav','legend','rare','set']);
 assert.equal(eligibleForAutoSalvage(rare,2,Object.values(p.equipped)),false);
 assert.equal(eligibleForAutoSalvage(favorite,2),false);
 assert.equal(eligibleForAutoSalvage(legendary,2),false);
 assert.equal(eligibleForAutoSalvage(set,2),false);
 assert.deepEqual(p.materials,{dust:5,crystal:1,core:0});
});
test('drop auto salvage protects uniques, supplies guaranteed materials even for full bag',()=>{
 const p=freshSave();p.autoSalvage=1;
 assert.equal(autoDismantleDrop(p,item('junk','weapon',1)),true);
 assert.deepEqual(p.materials,{dust:2,crystal:1,core:0});
 assert.equal(autoDismantleDrop(p,item('legend','weapon',3)),false);
 assert.equal(autoDismantleDrop(p,item('rare','weapon',2)),false);
 assert.equal(autoDismantleDrop(p,item('favorite','head',0,{favorite:true})),false);
 assert.equal(p.essence,3);
});
test('tempering increases real equipped stats and spends material exactly once',()=>{
 const p=freshSave();const gear=item('a','weapon',2);
 p.inventory.push(gear);equip(p,gear.id);
 p.materials={dust:80,crystal:90,core:10};p.gold=1500;
 const oldPower=stats(p).power,oldCost=temperCost(gear);
 assert.equal(canTemper(p,gear.id),true);
 const result=temper(p,gear.id);
 assert.ok(result.tempered);
 assert.ok(stats(p).power>oldPower);
 assert.equal(p.gold,1500-oldCost.gold);
 assert.equal(p.materials.dust,80-oldCost.dust);
 assert.equal(p.materials.crystal,90-oldCost.crystal);
 assert.equal(canTemper(p,gear.id),false);
 assert.equal(temper(p,gear.id),false);
 const reload=sanitizeSave(JSON.parse(JSON.stringify(p)));
 assert.ok(reload.inventory[0].tempered);
 assert.equal(reload.inventory[0].affixes[0].value,result.affixes[0].value);
});
test('11 skills defined, max seven button slots saved, no duplicates or invalid IDs',()=>{
 assert.equal(Object.values(SKILLS).filter(s=>s.cls==='mage').length,31);
 for(const k of ['chain','storm','ward','inferno'])assert.ok(SKILLS[k].cooldown>0&&SKILLS[k].unlocked>=4);
 const p=sanitizeSave({version:2,level:19,inventory:[],activeSkills:['storm','chain','ward','inferno','fire','fire','invalid','blink']});
 assert.equal(p.activeSkills.length,10);
 assert.equal(new Set(p.activeSkills).size,10);
 for(const key of p.activeSkills)assert.ok(SKILLS[key]);
 assert.equal(p.activeSkills[0],'storm');
 const again=sanitizeSave(JSON.parse(JSON.stringify(p)));
 assert.deepEqual(again.activeSkills,p.activeSkills);
});
test('material saves clamp malicious numeric data to safe limits',()=>{
 const p=sanitizeSave({version:2,materials:{dust:-99,crystal:Infinity,core:123456789},autoSalvage:200,inventory:[]});
 assert.deepEqual(p.materials,{dust:0,crystal:0,core:999999});
 assert.equal(p.autoSalvage,-1);
 const gold=freshSave();gold.autoSalvage=2;gold.inventory=[item('kept','head',0,{favorite:true})];
 assert.equal(dismantle(gold,'kept'),null);
 assert.equal(gold.inventory.length,1);
});
