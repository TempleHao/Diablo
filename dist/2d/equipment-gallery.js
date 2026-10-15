/**
 * Temporary 2D gallery contract. Entries are VISUAL PREVIEWS, not awarded items.
 * A future original/cleared-rights atlas replaces only the renderer, not the
 * underlying item.slot / type contract or real player saves.
 */
import {BASES,SLOTS} from './systems.js';
export const GALLERY_FILTERS=Object.freeze([
 {id:'all',label:'全部'}, {id:'weapon',label:'主手武器'},
 {id:'offhand',label:'副手'}, {id:'armor',label:'防具'}, {id:'jewelry',label:'饰品'}
]);
export const GALLERY_GROUPS=Object.freeze({
 weapon:['weapon'],offhand:['offhand'],
 armor:['head','shoulders','robe','gloves','belt','pants','boots'],
 jewelry:['amulet','ring1','ring2','charm']
});
export const TYPE_LABELS=Object.freeze({
 staff:'法杖',wand:'魔杖',sword:'长剑',dagger:'匕首',axe:'战斧',
 mace:'战锤',spear:'长矛',scythe:'镰刀',bow:'长弓',crossbow:'十字弩',claw:'利爪',
 shield:'盾牌',book:'魔典',orb:'法球',lantern:'提灯',helmet:'头盔',hood:'兜帽',
 circlet:'冠饰',shoulders:'肩甲',chest:'胸甲',gloves:'手套',
 belt:'腰带',pants:'护腿',boots:'靴子',ring:'戒指',amulet:'吊坠',relic:'遗物'
});
// Illustrate subtypes that do not yet drop: they are explicitly marked preview-only.
export const FUTURE_VISUAL_PREVIEWS=Object.freeze([
 ['weapon','苍狼战斧'],['weapon','审判重锤'],['weapon','寂夜镰刀'],
 ['weapon','血纹长矛'],['weapon','守望长弓'],['weapon','霜痕十字弩'],
 ['weapon','虚空利爪'],['offhand','晨星法球'],['offhand','遗民提灯']
]);
const groupFor=slot=>Object.entries(GALLERY_GROUPS).find(([,slots])=>slots.includes(slot))?.[0]||'jewelry';
export function buildEquipmentGallery(){
 const entries=[],seen=new Set();
 const add=(slot,name,rarity,previewOnly)=>{
  const key=slot+':'+name;
  if(seen.has(key))return;
  seen.add(key);
  entries.push({
   id:'catalog-'+entries.length,slot,name,rarity,
   power:0,hp:0,mana:0,armor:0,ilvl:1,affixes:[],
   group:groupFor(slot),previewOnly
  });
 };
 for(const [slot] of SLOTS){
  for(const [i,name] of (BASES[slot]||[]).entries()){
   add(slot,name,i%5,false);
  }
 }
 for(const [i,[slot,name]] of FUTURE_VISUAL_PREVIEWS.entries())add(slot,name,i%5,true);
 return entries;
}
export const EQUIPMENT_GALLERY=Object.freeze(buildEquipmentGallery().map(Object.freeze));
export function galleryItems(filter='all'){
 if(filter==='all')return EQUIPMENT_GALLERY;
 if(!Object.hasOwn(GALLERY_GROUPS,filter))return [];
 return EQUIPMENT_GALLERY.filter(item=>item.group===filter);
}
