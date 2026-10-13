// v0.3.6 demo: 3x enemy population, spread across three substantial groups.
// Deterministic for save-free wave progress; no endless automatic respawning.
export const ENCOUNTER_COUNT=36;
export const WAVE_SIZE=12;
export const WAVE_COUNT=ENCOUNTER_COUNT/WAVE_SIZE;
export const MAX_LIVE_ENEMIES=24;
export function encounterWave(types,index){
  if(!Array.isArray(types)||types.length<4)throw new Error('4+ enemy archetypes required');
  if(!Number.isInteger(index)||index<0||index>=WAVE_COUNT)return [];
  const result=[];
  for(let i=0;i<WAVE_SIZE;i++){
    const n=(i+index*3+(Math.floor(i/4)*2))%types.length;
    result.push({kind:types[n],elite:index>0&&(i===3||i===9)});
  }
  return result;
}
export function nextWaveForKills(kills){
  if(!Number.isInteger(kills)||kills<0||kills>=ENCOUNTER_COUNT)return -1;
  if(kills>0&&kills%WAVE_SIZE===0)return kills/WAVE_SIZE<WAVE_COUNT?kills/WAVE_SIZE:-1;
  return -1;
}
export function shouldSummonBoss(kills,existingBoss){
  return kills>=ENCOUNTER_COUNT&&!existingBoss;
}
