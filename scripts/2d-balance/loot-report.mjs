// 生成 docs/2D-LOOT.md 里的模拟数字（v0.7.2）。
// 一趟 = 48 只普通 / 远程怪 + 6 只精英 + 1 个首领（v0.8：3 波 × 18 只，精英 1 / 2 / 3）。
// 厄运保护按「趟」计：整趟任何地方掉到传奇以上 / 暗金都会清零。
// 用法：node scripts/2d-balance/loot-report.mjs
import {mulberry32} from '../../dist/2d/core.js';
import {rollDrops,DROP_RULES,POOLS,SETS,gambleCost} from '../../dist/2d/systems.js';
import {rollBossRewards,BOSS_POOLS} from '../../dist/2d/boss-loot.js';
import {DIFFICULTIES,expRequired} from '../../dist/2d/progression.js';
import {TIER} from '../../dist/2d/monsters.js';

const RUNS=+(process.env.RUNS||20000);
export function simulate({level,difficulty=0,mf=0,cls='mage',runs=RUNS,seed=1}){
  const rng=mulberry32(level*7+difficulty*131+mf+seed);
  let n=0,pity={legendary:0,unique:0};const newId=()=>'s'+(n++);
  const c={items:0,normal:0,magic:0,epic:0,legendary:0,unique:0,set:0,exclusive:0,forced:0};
  for(let r=0;r<runs;r++){
    const field=[];
    for(let k=0;k<48;k++)field.push(...rollDrops(rng,{source:'normal',level,mf,cls,difficulty,newId}));
    for(let k=0;k<6;k++)field.push(...rollDrops(rng,{source:'elite',level,mf,cls,difficulty,newId}));
    const boss=rollBossRewards(rng,Math.min(100,level+2),r%9,5,newId,{cls,mf,difficulty,pity});
    pity=boss.pity;
    if(field.some(d=>d.rarity>=3))pity.legendary=0;
    if(field.some(d=>d.rarity===4&&!d.setId))pity.unique=0;
    if(boss.forced)c.forced++;
    if(boss.exclusive)c.exclusive++;
    const drops=[...field,...boss.drops.filter(d=>d.name!==BOSS_POOLS[r%9].item)];
    for(const d of drops){
      c.items++;
      if(d.setId)c.set++;else if(d.rarity===4)c.unique++;else if(d.rarity===3)c.legendary++;else if(d.rarity===2)c.epic++;else if(d.rarity===1)c.magic++;else c.normal++;
    }
  }
  for(const k in c)c[k]=c[k]/runs;
  return c;
}
const per=x=>x>0?(1/x).toFixed(x>=1?2:0).replace(/\.00$/,''):'—';
const scenarios=[['普通 · 10 级',{level:10}],['普通 · 25 级',{level:25}],['普通 · 40 级',{level:40}],['噩梦 · 60 级',{level:60,difficulty:1}],['地狱 · 85 级',{level:85,difficulty:2}],['地狱 · 85 级 · 寻宝 +100%',{level:85,difficulty:2,mf:100}],['地狱 · 95 级 · 寻宝 +300%',{level:95,difficulty:2,mf:300}]];
const lines=['| 场景 | 装备/趟 | 白 | 蓝 | 黄（史诗） | 橙（传奇） | 绿（套装） | 金（暗金） | 首领专属 | 保底触发 |','|---|---|---|---|---|---|---|---|---|---|'];
for(const [label,opt] of scenarios){
  const c=simulate(opt);
  lines.push(`| ${label} | ${c.items.toFixed(1)} | ${c.normal.toFixed(1)} | ${c.magic.toFixed(1)} | ${c.epic.toFixed(2)} | 每 ${per(c.legendary)} 趟 | 每 ${per(c.set)} 趟 | 每 ${per(c.unique)} 趟 | 每 ${per(c.exclusive)} 趟 | ${(c.forced*100).toFixed(1)}% |`);
}
console.log(lines.join('\n'));
const xpRun=L=>{const D=DIFFICULTIES[L<40?0:L<70?1:2];const m=1+(L-1)*.04;return (48*(TIER.normal.xp*.8+TIER.caster.xp*.2)+6*TIER.elite.xp+TIER.boss.xp)*m*D.xp;};
let a=0,b=0;for(let L=1;L<100;L++){const r=expRequired(L)/xpRun(L);if(L<60)a+=r;else b+=r;}
const goldRun=L=>Math.round((54*4.5+150)*(1+L/25));
console.log(`\n升级：1→60 约 ${a.toFixed(0)} 趟，60→100 约 ${b.toFixed(0)} 趟。`);
console.log(`金币：每趟约 ${goldRun(10)}（10 级）/ ${goldRun(40)}（40 级）/ ${goldRun(85)}（85 级）；赌一件武器 ${gambleCost(10,'weapon')} / ${gambleCost(40,'weapon')} / ${gambleCost(85,'weapon')}。`);
console.log(`图鉴：基底 ${Object.values(POOLS.base).flat().length}，传奇 ${Object.values(POOLS.legend).flat().length}，暗金 ${Object.values(POOLS.unique).flat().length}，套装 ${Object.keys(SETS).length} 套。`);
