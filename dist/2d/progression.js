/* 余烬纪事 2D · 等级与难度（v0.7：等级上限 100）
 *
 * 难度（同《暗黑破坏神 2》）：普通 → 噩梦 → 地狱。每个难度九个区域各有「区域等级」，怪物等级 =
 *   max(区域等级, min(角色等级, 难度上限))，首领再 +2。所以低等级去高区域会很难，高等级回低区域也不会碾压到没收益。
 * 解锁：噩梦 = 击败普通难度第 9 区首领，或角色 40 级；地狱 = 击败噩梦第 9 区首领，或 70 级。
 * 难度加成：怪物生命/伤害、全部抗性惩罚（-20 / -40）、传奇以上掉率（×1.3 / ×1.6）、经验（×1.15 / ×1.3）。
 * 经验：1-59 级沿用 45L+15；60 级起每级再 ×1.08 递增（60→100 约 130 次通关，见 docs/2D-LOOT.md）。
 * 怪物等级比角色低 5 级以上时经验递减（每级 -10%，最低 5%）。
 */
export const MAX_LEVEL=100;
export const DIFFICULTIES=Object.freeze([
  {id:0,name:'普通',area:[1,4,8,12,16,20,25,30,36],cap:45,hp:1,dmg:1,xp:1,unlockLevel:1},
  {id:1,name:'噩梦',area:[38,42,46,50,54,58,62,66,70],cap:75,hp:1.2,dmg:1.15,xp:1.15,unlockLevel:40},
  {id:2,name:'地狱',area:[68,72,76,80,84,88,92,95,98],cap:100,hp:1.45,dmg:1.3,xp:1.3,unlockLevel:70}
]);
export const clampDifficulty=d=>Number.isInteger(d)&&d>=0&&d<DIFFICULTIES.length?d:0;
/** 难度是否已解锁：等级达到要求，或上一难度的最终首领（第 9 区）已击败。 */
export function difficultyUnlocked(p,d){
  if(d<=0)return true;
  const D=DIFFICULTIES[d];if(!D)return false;
  return (p.level|0)>=D.unlockLevel||((p.bossKills?.[d-1]?.[8])|0)>0;
}
export function monsterLevel(p,boss=false){
  const D=DIFFICULTIES[clampDifficulty(p.difficulty)],area=D.area[Math.max(0,Math.min(8,p.region|0))];
  return Math.min(MAX_LEVEL,Math.max(area,Math.min(p.level|0,D.cap))+(boss?2:0));
}
export function expRequired(level){
  const base=level*45+15;
  return level<60?base:Math.round(base*Math.pow(1.08,level-59));
}
/** 经验系数：怪物等级低于角色 5 级以上开始递减。 */
export function xpFactor(clvl,mlvl){
  const gap=clvl-mlvl;
  return gap<=5?1:Math.max(.05,1-(gap-5)*.1);
}
