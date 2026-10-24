// v1.3 职业区隔：武器按职业会用的类型、带职业的传奇 / 暗金 / 套装专属、普通防具首饰通用；掉落偏向本职业；其他职业的装备穿不上
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeLoot,gambleItem,itemClasses,canUseItem,normalizeItem,catalogPool,SETS,CATALOG_BY_ID} from '../dist/2d/systems.js';
import {freshSave,sanitizeSave,equip,smartEquip,mulberry32} from '../dist/2d/core.js';
const mk=(id,rarity,slot,f,extra={})=>normalizeItem({id,slot,name:'x',rarity,ilvl:40,power:10,hp:0,mana:0,armor:5,affixes:[],cid:catalogPool(rarity,slot).find(f).id,...extra});
test('weapons are limited to classes that use the type; plain armor is shared',()=>{
  const axe=mk('axe',1,'weapon',c=>c.sub==='双手斧'),staff=mk('st',1,'weapon',c=>c.sub==='法杖'),helm=mk('h',2,'head',c=>!/^C2?-/.test(String(c.a||'')));
  assert.ok(canUseItem(axe,'barbarian'));assert.ok(!canUseItem(axe,'mage'));
  assert.ok(canUseItem(staff,'mage'));assert.ok(!canUseItem(staff,'barbarian'));
  assert.equal(itemClasses(helm),null);for(const c of ['mage','barbarian','assassin'])assert.ok(canUseItem(helm,c));
});
test('every item on a class equipment sheet (C-*) belongs to that class, armor and jewelry included',()=>{
  for(const [cls,name] of [['assassin','刺客'],['druid','德鲁伊'],['mage','法师']]){
    const ring=mk('r-'+cls,1,'ring1',c=>c.a==='C-'+cls),robe=mk('b-'+cls,1,'robe',c=>c.a==='C-'+cls);
    assert.deepEqual(itemClasses(ring),[cls]);assert.deepEqual(itemClasses(robe),[cls]);
    assert.ok(!canUseItem(robe,cls==='mage'?'barbarian':'mage'));
  }
});
test('class legendaries and class sets belong to that class only',()=>{
  const leg=mk('l',3,'head',c=>c.owner==='necro'||c.cls==='死灵法师');
  assert.deepEqual(itemClasses(leg),['necro']);assert.ok(!canUseItem(leg,'paladin'));
  const setId=Object.keys(SETS).find(k=>SETS[k].cls==='druid');
  const cid=SETS[setId].cids[0],piece=normalizeItem({id:'s',slot:CATALOG_BY_ID.get(cid).s,name:'x',rarity:4,ilvl:40,power:0,hp:0,mana:0,armor:9,affixes:[],setId,cid});
  assert.deepEqual(itemClasses(piece),['druid']);
});
test('cannot equip another class item; old saves drop it back into the bag',()=>{
  const p=freshSave();p.heroClass='mage';const axe=mk('axe',1,'weapon',c=>c.sub==='双手斧');p.inventory.push(axe);
  assert.equal(equip(p,'axe'),false);assert.equal(p.equipped.weapon??null,null);
  const forged=sanitizeSave({...p,equipped:{...p.equipped,weapon:'axe'}});
  assert.equal(forged.equipped.weapon,null);assert.ok(forged.inventory.some(i=>i.id==='axe'),'kept in bag');
  smartEquip(p);assert.notEqual(p.equipped.weapon,'axe');
});
test('drops lean hard to the current class; gambling only sells usable gear',()=>{
  const r=mulberry32(11);let w=0,wOk=0,named=0,namedOk=0;
  for(let k=0;k<6000;k++){const it=makeLoot(r,50,'d'+k,{cls:'barbarian',source:'boss',mf:300});
    if(it.slot==='weapon'||it.slot==='offhand'){w++;if(canUseItem(it,'barbarian'))wOk++;}
    if(it.rarity>=3){named++;if(canUseItem(it,'barbarian'))namedOk++;}}
  assert.ok(wOk/w>.9,'weapons usable '+wOk/w);assert.ok(namedOk/named>.8,'named usable '+namedOk/named);
  assert.ok(wOk<w,'a few other-class weapons still drop for alts');
  for(let k=0;k<300;k++){const it=gambleItem(r,50,'weapon','g'+k,'assassin');if(!it.setId)assert.ok(canUseItem(it,'assassin'));}
});
test('one-click equip can pick a non-bow two-hander (no offhand is a legal pair)',()=>{
  const p=freshSave();p.heroClass='barbarian';p.level=100;
  const axe=mk('axe2',3,'weapon',c=>c.sub==='双手斧');p.inventory.push(axe);
  smartEquip(p);assert.equal(p.equipped.weapon,'axe2');
});
