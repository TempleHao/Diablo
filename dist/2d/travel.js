import {REGION_DATA} from './systems.js';

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
