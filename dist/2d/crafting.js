/**
 * 2D crafting loop. Deliberately pure so save migration, dismantling and
 * reinforcing can be tested independently of browser UI.
 */
import {normalizeItem,AFFIXES} from './systems.js';
export const MATERIALS=Object.freeze({
 dust:{label:'灰烬粉尘',description:'用于普通装备强化与初级锻造'},
 crystal:{label:'奥术结晶',description:'用于精炼魔法、稀有装备'},
 core:{label:'传奇余烬',description:'用于传奇与套装的高级淬炼'}
});
export const freshMaterials=()=>({dust:0,crystal:0,core:0});
const amount=(v)=>Number.isFinite(v)?Math.min(999999,Math.max(0,Math.floor(v))):0;
export function sanitizeMaterials(raw){return Object.fromEntries(Object.keys(MATERIALS).map(k=>[k,amount(raw?.[k])]));}
export function salvageYield(item){
 const rarity=Math.min(4,Math.max(0,item?.rarity|0));
 if(rarity===0)return {dust:3,crystal:0,core:0};
 if(rarity===1)return {dust:2,crystal:1,core:0};
 if(rarity===2)return {dust:1,crystal:3,core:0};
 if(rarity===3)return {dust:0,crystal:4,core:1};
 return {dust:0,crystal:3,core:2};
}
export function eligibleForAutoSalvage(item,threshold,equippedIds=[]){
 return Number.isInteger(threshold)&&threshold>=0&&threshold<=2&&
   !!item&&item.rarity<=threshold&&item.rarity<3&&!item.setId&&
   !equippedIds.includes(item.id)&&!item.favorite;
}
export function dismantle(profile,id,{auto=false}={}){
 const item=profile.inventory.find(i=>i.id===id);
 if(!item||Object.values(profile.equipped).includes(id)||item.favorite)return null;
 if(auto&&!eligibleForAutoSalvage(item,profile.autoSalvage,Object.values(profile.equipped)))return null;
 const yields=salvageYield(item);
 profile.materials=sanitizeMaterials(profile.materials);
 for(const k of Object.keys(yields))profile.materials[k]+=yields[k];
 profile.essence+=1+item.rarity*2; // Preserve legacy essence economy.
 profile.inventory.splice(profile.inventory.indexOf(item),1);
 return {item,yields};
}
export function dismantleAll(profile){
 const result=[];
 // Snapshot: never mutate array under active traversal.
 for(const item of [...profile.inventory]){
   const entry=dismantle(profile,item.id,{auto:true});
   if(entry)result.push(entry);
 }
 return result;
}
export function autoDismantleDrop(profile,item){
 if(!eligibleForAutoSalvage(item,profile.autoSalvage,Object.values(profile.equipped)))return false;
 const yields=salvageYield(item);
 profile.materials=sanitizeMaterials(profile.materials);
 for(const k of Object.keys(yields))profile.materials[k]+=yields[k];
 profile.essence+=1+item.rarity*2;
 return true;
}
export function temperCost(item){
 const r=item.rarity;
 if(r<=1)return {dust:8,crystal:1,core:0,gold:80};
 if(r===2)return {dust:5,crystal:6,core:0,gold:170};
 return {dust:4,crystal:8,core:2,gold:400};
}
export function canTemper(profile,id){
 const item=profile.inventory.find(i=>i.id===id);
 if(!item||item.tempered||!item.affixes?.length)return false;
 const cost=temperCost(item),m=sanitizeMaterials(profile.materials);
 return Object.keys(MATERIALS).every(k=>m[k]>=cost[k])&&profile.gold>=cost.gold;
}
export function temper(profile,id){
 if(!canTemper(profile,id))return false;
 const item=profile.inventory.find(i=>i.id===id),cost=temperCost(item);
 const next={...item,affixes:item.affixes.map(a=>({...a}))};
 // Raise the first rolled affix to give a deterministic, visible benefit.
 const a=next.affixes[0],rule=AFFIXES[a.key];
 if(!rule)return false;
 a.value=Math.min(1000,a.value+Math.max(1,Math.ceil(rule.max*.35)));
 next.tempered=true;
 const valid=normalizeItem(next);
 if(!valid)return false;
 profile.materials=sanitizeMaterials(profile.materials);
 for(const k of Object.keys(MATERIALS))profile.materials[k]-=cost[k];
 profile.gold-=cost.gold;
 profile.inventory[profile.inventory.indexOf(item)]=valid;
 return valid;
}
