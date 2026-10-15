/**
 * Runtime helpers for authored legendary/unique effects.
 * Keeps text parsing deterministic so gameplay and UI read the same workbook-authored values.
 */
const BASE_PREFIX='古王·';
export const LIVE_EFFECTS=Object.freeze(['裂魂猛袭','裂界余响','破绽追猎','魔痕收割','秘文回响','灵魂冕冠','回魂指环','快刃残影','奥术缚指','血路行者','王权共鸣']);
export function baseEffectName(item){return String(item?.effectName||'').replace(BASE_PREFIX,'');}
export function effectNumbers(item){
  return [...String(item?.effectDescription||'').matchAll(/(\d+(?:\.\d+)?)%/g)].map(m=>Number(m[1]));
}
export function equippedEffectItems(profile){
  if(!profile||!Array.isArray(profile.inventory)||!profile.equipped)return [];
  const byId=new Map(profile.inventory.map(item=>[item.id,item])),seen=new Set(),result=[];
  for(const id of Object.values(profile.equipped)){
    if(!id||seen.has(id))continue;seen.add(id);
    const item=byId.get(id);if(item?.effectName)result.push(item);
  }
  return result;
}
export function strongestEffect(profile,name){
  const matches=equippedEffectItems(profile).filter(item=>baseEffectName(item)===name);
  if(!matches.length)return null;
  return matches.map(item=>({item,numbers:effectNumbers(item)}))
    .sort((a,b)=>Math.max(0,...b.numbers)-Math.max(0,...a.numbers))[0];
}
export function effectPercent(profile,name,index=0){
  return strongestEffect(profile,name)?.numbers?.[index]||0;
}
export function hasEffect(profile,name){return !!strongestEffect(profile,name);}

export function isRuntimeEffectSupported(item){return LIVE_EFFECTS.includes(baseEffectName(item));}
