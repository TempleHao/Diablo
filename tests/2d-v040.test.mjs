import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,statSync} from 'node:fs';
import {CATALOG,ICON_SIZE} from '../dist/2d/equipment-catalog.js';
import {makeLoot,normalizeItem,catalogEntry,catalogPool,BOSS_ITEM_ICONS,SLOT_IDS,RARITIES} from '../dist/2d/systems.js';
import {mulberry32,freshSave,sanitizeSave,equip,stats} from '../dist/2d/core.js';
import {rollBossRewards,BOSS_POOLS} from '../dist/2d/boss-loot.js';
import {emitVfx,tickVfx} from '../dist/2d/spell-vfx.js';
import {addDecal,tickDecals,shakeOffset} from '../dist/2d/fx.js';


test('catalog ships all 500 items (100 per rarity) with valid atlas cells',()=>{
  assert.equal(CATALOG.length,500);
  assert.equal(new Set(CATALOG.map(c=>c.id)).size,500);
  assert.deepEqual(RARITIES,['普通','魔法','史诗','传奇','暗金']);
  for(let r=0;r<5;r++){
    const tier=CATALOG.filter(c=>c.r===r);
    assert.equal(tier.length,100);
    assert.deepEqual(tier.map(c=>c.i).sort((a,b)=>a-b),[...Array(100).keys()]);
    const file=new URL('../dist/2d/art/equipment/'+'NMELU'[r]+'.webp',import.meta.url);
    assert.ok(existsSync(file)&&statSync(file).size>20000,'atlas '+r);
  }
  for(const c of CATALOG){
    assert.ok(SLOT_IDS.includes(c.s),c.id);
    assert.ok(c.h===1||c.h===2);
  }
  assert.ok(ICON_SIZE.w>0&&ICON_SIZE.cols===10);
});
test('every slot and rarity has a catalog pool',()=>{
  for(let r=0;r<5;r++)for(const s of SLOT_IDS)assert.ok(catalogPool(r,s).length>=3,r+' '+s);
});
test('two-hand weapon blocks the offhand both ways',()=>{
  const p=freshSave();
  const staff=normalizeItem({id:'st',slot:'weapon',name:'x',cid:catalogPool(0,'weapon').find(c=>c.h===2).id,rarity:0,power:40,hp:0,mana:0,armor:0});
  const book=normalizeItem({id:'bk',slot:'offhand',name:'x',cid:catalogPool(0,'offhand')[0].id,rarity:0,power:0,hp:0,mana:20,armor:5});
  assert.equal(staff.hands,2);
  p.inventory.push(staff,book);
  equip(p,'bk');equip(p,'st');
  assert.equal(p.equipped.weapon,'st');assert.equal(p.equipped.offhand,null);
  equip(p,'bk');
  assert.equal(p.equipped.offhand,'bk');assert.equal(p.equipped.weapon,null);
  // a forged save with both equipped is repaired, and stats never count both
  const forged=sanitizeSave({...p,equipped:{...p.equipped,weapon:'st',offhand:'bk'}});
  assert.equal(forged.equipped.offhand,null);
  assert.equal(stats({...p,equipped:{...p.equipped,weapon:'st',offhand:'bk'}}).mana,100);
});
test('legacy saves: items get catalog names and icons, legs/relic stay in bag unequippable',()=>{
  const save=sanitizeSave({version:2,level:20,inventory:[
    {id:'a',slot:'pants',name:'褐布护腿',rarity:1,power:0,hp:0,mana:0,armor:9,affixes:[{key:'hp',value:12}]},
    {id:'b',slot:'charm',name:'炉心遗物',rarity:2,power:0,hp:0,mana:0,armor:0},
    {id:'c',slot:'weapon',name:'白骨长剑',rarity:2,power:66,hp:0,mana:0},
    {id:'d',slot:'amulet',name:'血印誓约护符',rarity:3,power:23,hp:0,mana:18}
  ],equipped:{pants:'a',charm:'b',weapon:'c'}});
  assert.equal(save.inventory.length,4,'nothing is lost');
  const [legs,relic,weapon,boss]=save.inventory;
  assert.ok(legs.legacy&&relic.legacy);assert.equal(legs.affixes.length,1);
  assert.equal(save.equipped.weapon,'c');
  assert.equal(Object.hasOwn(save.equipped,'pants'),false);
  assert.ok(catalogEntry(weapon));assert.notEqual(weapon.name,'白骨长剑','old placeholder names are replaced');assert.equal(weapon.power,66);
  assert.equal(boss.name,'血印誓约护符');assert.equal(boss.cid,BOSS_ITEM_ICONS['血印誓约护符']);
  assert.equal(equip(save,'a'),false);
  // stable across reloads
  assert.equal(sanitizeSave(JSON.parse(JSON.stringify(save))).inventory[2].name,weapon.name);
});
test('boss exclusives keep their names with a matching legendary icon',()=>{
  for(let region=0;region<9;region++){
    let seed=region*1000,res;do{res=rollBossRewards(mulberry32(seed++),20,region,0,(()=>{let i=0;return()=>'b'+(++i)})());}while(!res.exclusive);
    const drop=res.drops.at(-1);
    assert.equal(drop.name,BOSS_POOLS[region].item);
    const entry=catalogEntry(drop);
    assert.ok(entry&&entry.r===3);
    assert.equal(entry.s,drop.slot==='ring2'?'ring1':drop.slot);
  }
});
test('unique items roll 4+ affixes; element-leaning names favour that element',()=>{
  const r=mulberry32(91);let uniques=0,lean=0,leanHit=0;
  for(let k=0;k<3000;k++){
    const it=makeLoot(r,60,'x'+k,{boss:true,force:k%5===0?'unique':null}),e=catalogEntry(it);
    if(it.rarity===4&&!it.setId){uniques++;assert.ok(it.affixes.length>=4);}
    if(it.rarity>=1&&(e.aff==='火'||e.aff==='霜')&&['weapon','offhand','amulet','ring1'].includes(it.slot)){
      lean++;if(it.affixes.some(a=>a.key===(e.aff==='火'?'fire':'cold')))leanHit++;
    }
  }
  assert.ok(uniques>20);assert.ok(leanHit/lean>.9);
});
test('effects stay bounded: vfx pool, decals and screen shake decay',()=>{
  const fx=[];for(let i=0;i<120;i++)emitVfx(fx,'meteor',i,i,{max:80,speed:2});
  assert.ok(fx.length<=44&&fx.every(e=>e.particles.length<=44));
  for(let i=0;i<60;i++)tickVfx(fx,.02);assert.equal(fx.length,0);
  const decals=[];for(let i=0;i<100;i++)addDecal(decals,i,i,30,'scorch',1);
  assert.ok(decals.length<=48);tickDecals(decals,2);assert.equal(decals.length,0);
  const s={amount:12};for(let i=0;i<60;i++)shakeOffset(s,1/60);assert.equal(s.amount,0);
});
