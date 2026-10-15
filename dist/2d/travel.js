import {REGION_DATA,MAX_ITEMS} from './systems.js';

export function destinationOptions(from) {
 const next=(from+1)%REGION_DATA.length;
 return {
   next,
   destinations:REGION_DATA.map((region,i)=>({index:i,name:region.name,selected:i===next}))
 };
}
export function pickRandomDestination(rng,from){
 if(typeof rng!=='function')throw new TypeError('rng required');
 if(!Number.isInteger(from)||from<0||from>=REGION_DATA.length)throw new RangeError('invalid current region');
 const count=REGION_DATA.length-1;
 const index=Math.min(count-1,Math.floor(Math.max(0,Math.min(.9999999,rng()))*count));
 return index>=from?index+1:index;
}
export function validateDestination(index){
 return Number.isInteger(index)&&index>=0&&index<REGION_DATA.length;
}

/**
 * Atomically begin a fresh expedition in a destination region.
 * Character progression stays on the profile; only the destination world's
 * room/Boss state is reset. Unclaimed persistent loot for that destination
 * loses its obsolete maze coordinates and is recovered beside the new entrance.
 */
export function startDestinationExpedition(profile,index){
 if(!profile||typeof profile!=='object')throw new TypeError('profile required');
 if(!validateDestination(index))throw new RangeError('invalid destination');
 if(!Array.isArray(profile.worldStates)||profile.worldStates.length!==REGION_DATA.length)throw new TypeError('worldStates missing');
 if(!Array.isArray(profile.regionVisits)||profile.regionVisits.length!==REGION_DATA.length)throw new TypeError('regionVisits missing');
 if(!Array.isArray(profile.pendingLoot))throw new TypeError('pendingLoot missing');
 const from=profile.region;
 profile.region=index;
 profile.regionVisits[index]=(Number.isInteger(profile.regionVisits[index])?profile.regionVisits[index]:0)+1;
 profile.worldStates[index]=null;
 profile.pendingLoot=profile.pendingLoot.map(entry=>{
   if(entry?.region!==index)return entry;
   const {x,y,...rest}=entry;
   return rest;
 });
 return {from,to:index,visit:profile.regionVisits[index]};
}


/**
 * Move as much persisted expedition loot as possible into the character bag.
 * This is intentionally explicit (camp recovery) so a full bag never deletes
 * rewards. Returns counts for UI feedback.
 */
export function recoverPendingLoot(profile){
 if(!profile||typeof profile!=='object')throw new TypeError('profile required');
 if(!Array.isArray(profile.inventory)||!Array.isArray(profile.pendingLoot))throw new TypeError('loot collections missing');
 const room=Math.max(0,MAX_ITEMS-profile.inventory.length);
 if(room===0)return {recovered:0,remaining:profile.pendingLoot.length};
 const owned=new Set(profile.inventory.map(item=>item?.id).filter(Boolean));
 const recovered=[];
 const keep=[];
 for(const entry of profile.pendingLoot){
   const id=entry?.item?.id;
   if(!id||owned.has(id))continue;
   if(recovered.length<room){recovered.push(entry.item);owned.add(id);}
   else keep.push(entry);
 }
 profile.inventory.push(...recovered);
 profile.pendingLoot=keep;
 return {recovered:recovered.length,remaining:keep.length};
}
