// v0.8：每趟 54 只（3 波 × 18），开局两波已经分散在地图各处成群待命，第三波从远处慢慢围过来。
// Deterministic for save-free wave progress; no endless automatic respawning.
export const ENCOUNTER_COUNT=54;
export const WAVE_SIZE=18;
export const WAVE_COUNT=ENCOUNTER_COUNT/WAVE_SIZE;
export const MAX_LIVE_ENEMIES=60;
/** 每趟的怪物构成（给掉落 / 经验模拟用）：普通 + 远程 48，精英 6，首领 1。 */
export const TRIP=Object.freeze({normal:48,elite:6,boss:1});
/** 每波哪几个位置是精英：第 1 波 1 只，第 2 波 2 只，第 3 波 3 只。 */
export const ELITE_SLOTS=Object.freeze([[9],[4,13],[3,9,15]]);
export function encounterWave(types,index){
  if(!Array.isArray(types)||types.length<4)throw new Error('4+ enemy archetypes required');
  if(!Number.isInteger(index)||index<0||index>=WAVE_COUNT)return [];
  const result=[];
  for(let i=0;i<WAVE_SIZE;i++){
    const n=(i+index*3+(Math.floor(i/4)*2))%types.length;
    result.push({kind:types[n],elite:ELITE_SLOTS[index]?.includes(i)||false});
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
