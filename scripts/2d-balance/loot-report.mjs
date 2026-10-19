// 生成 docs/2D-LOOT.md 里的模拟数字：每趟远征（36 只怪 + 首领）的掉落期望、各品质出现频率、升级耗时。
// 用法：node scripts/2d-balance/loot-report.mjs  （输出 Markdown 表格到标准输出）
import {mulberry32} from '../../dist/2d/core.js';
import {rollDrops,DROP_RULES,POOLS,SETS} from '../../dist/2d/systems.js';
import {rollBossRewards,BOSS_POOLS} from '../../dist/2d/boss-loot.js';
import {DIFFICULTIES,expRequired} from '../../dist/2d/progression.js';
import {TIER} from '../../dist/2d/monsters.js';

const RUNS=4000;
function simulate({level,difficulty=0,mf=0,cls='mage'}){
  const rng=mulberry32(level*7+difficulty*131+mf);
  let n=0,pity={legendary:0,unique:0};const newId=()=>'s'+(n++);
  const c={items:0,magic:0,epic:0,legendary:0,unique:0,set:0,own:0,forced:0};
  for(let r=0;r<RUNS;r++){
    const drops=[];
    for(let k=0;k<30;k++)drops.push(...rollDrops(rng,{source:'normal',level,mf,cls,difficulty,newId}));
    for(let k=0;k<6;k++)drops.push(...rollDrops(rng,{source:'elite',level,mf,cls,difficulty,newId}));
    const boss=rollBossRewards(rng,Math.min(100,level+2),r%9,5,newId,{cls,mf,difficulty,pity});
    pity=boss.pity;if(boss.forced)c.forced++;
    // 首领专属传奇（首杀必掉、之后 26%）单独计，不算进随机传奇
    drops.push(...boss.drops.filter(d=>d.name!==BOSS_POOLS[r%9].item));
    for(const d of drops){
      c.items++;
      if(d.setId)c.set++;else if(d.rarity===4)c.unique++;else if(d.rarity===3)c.legendary++;else if(d.rarity===2)c.epic++;else if(d.rarity===1)c.magic++;
    }
  }
  for(const k in c)c[k]=c[k]/RUNS;
  return c;
}
const rows=[];
for(const [label,opt] of [['普通 · 怪物 20 级',{level:20}],['普通 · 怪物 45 级',{level:45}],['噩梦 · 怪物 60 级',{level:60,difficulty:1}],['地狱 · 怪物 85 级',{level:85,difficulty:2}],['地狱 · 怪物 85 级 · 寻宝 +150%',{level:85,difficulty:2,mf:150}]]){
  const c=simulate(opt);
  rows.push(`| ${label} | ${c.items.toFixed(1)} | ${c.magic.toFixed(1)} | ${c.epic.toFixed(2)} | ${c.legendary.toFixed(2)} | ${c.set.toFixed(3)} | ${c.unique.toFixed(3)} | ${(1/Math.max(1e-9,c.legendary+c.unique+c.set)).toFixed(1)} |`);
}
console.log('| 场景 | 装备/趟 | 魔法 | 史诗 | 传奇 | 套装 | 暗金 | 平均几趟出一件橙/绿/金 |');
console.log('|---|---|---|---|---|---|---|---|');
console.log(rows.join('\n'));
// 升级耗时：每趟 30 普通 + 6 精英 + 1 首领的经验
const xpRun=L=>{const D=DIFFICULTIES[L<40?0:L<70?1:2];const m=1+(L-1)*.04;return (30*(TIER.normal.xp*.8+TIER.caster.xp*.2)+6*TIER.elite.xp+TIER.boss.xp)*m*D.xp;};
let a=0,b=0;for(let L=1;L<100;L++){const r=expRequired(L)/xpRun(L);if(L<60)a+=r;else b+=r;}
console.log(`\n升级：1→60 约 ${a.toFixed(0)} 趟，60→100 约 ${b.toFixed(0)} 趟（按每趟清完 36 只怪 + 首领、在当前难度的怪物等级 ≈ 角色等级估算）。`);
console.log(`图鉴：基底 ${Object.values(POOLS.base).flat().length} 件，传奇 ${Object.values(POOLS.legend).flat().length} 件，暗金 ${Object.values(POOLS.unique).flat().length} 件，套装 ${Object.keys(SETS).length} 套。`);
console.log(`掉率参数：${JSON.stringify(DROP_RULES.base)}，保底 ${JSON.stringify(DROP_RULES.pity)}`);
