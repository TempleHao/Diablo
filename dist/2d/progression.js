/* 归墟 2D · 等级与难度（v0.7：等级上限 100）
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
  {id:1,name:'噩梦',area:[38,42,46,50,54,58,62,66,70],cap:75,hp:1.6,dmg:1.35,xp:1.15,unlockLevel:40},
  {id:2,name:'地狱',area:[68,72,76,80,84,88,92,95,98],cap:100,hp:2.5,dmg:1.75,xp:1.3,unlockLevel:70}
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
// v0.7.3：前期放慢（1→60 约 50 趟），60 级后每级 ×1.065 递增（60→100 约 200 趟）
export function expRequired(level){
  const base=(level*45+15)*2.3;
  return Math.round(level<60?base:base*Math.pow(1.065,level-59));
}
/* v0.7.3 怪物成长（见 docs/2D-BALANCE.md「难度曲线」）
 * 生命 = 基础 × 2.45 × (1 + 0.16(L−1)) × (1 + 0.0125(L−1)) × 难度（普通 1 / 噩梦 1.6 / 地狱 2.5）
 * 伤害 = 基础 × 1.5  × (1 + 0.085(L−1)) × (1 + 0.012(L−1)) × 难度（1 / 1.35 / 1.75）
 * 第二项让怪物成长跟上「角色等级 + 装备」的成长，不再越往后越好打；
 * 1–10 级有新手缓冲（生命、伤害从 6 成逐步升到满额）。 */
const ramp=L=>Math.min(1,.55+L*.045);
export function monsterHpMult(L,d=0){L=Math.max(1,L);return 2.45*(1+(L-1)*.16)*(1+(L-1)*.0125)*ramp(L)*(DIFFICULTIES[clampDifficulty(d)].hp);}
export function monsterDmgMult(L,d=0){L=Math.max(1,L);return 1.5*(1+(L-1)*.085)*(1+(L-1)*.012)*ramp(L)*(DIFFICULTIES[clampDifficulty(d)].dmg);}
/** 护甲减伤随怪物等级衰减（D2 同理）：同样的护甲，打高等级怪减伤更少。上限 75%。 */
export const armorDR=(armor,mlvl)=>Math.min(.75,Math.max(0,armor)/(Math.max(0,armor)+70+12*Math.max(1,mlvl)));
/** 经验系数：怪物等级低于角色 5 级以上开始递减。 */
export function xpFactor(clvl,mlvl){
  const gap=clvl-mlvl;
  return gap<=5?1:Math.max(.05,1-(gap-5)*.1);
}
