/* 归墟 2D · 技能平衡模型（v0.6）
 *
 * 所有伤害都以「攻击力/法术强度 P」为单位估算，技能等级 0、无装备加成。
 * 单次施放的目标伤害（对单个敌人）：
 *   冷却 ≤ 1.2 秒（主力连发技能）：每秒 3.0P，即单次 3.0 × 冷却（冷却至少按 0.35 秒算）
 *   冷却 > 1.2 秒（爆发技能）：单次 3.6 + 1.0 × (冷却 − 1.2)，与主力技能叠加使用，所以折算每秒更低
 *   再乘范围系数；以控制为主的技能（眩晕、冻结、强击退、恐惧）再 × 0.5
 *   范围系数：单体 1.0 / 穿透或小范围 0.85 / 中范围 0.7 / 大范围 0.6 —— 打得越多人，单人伤害越低。
 *   普通攻击：每秒 2.2P（无消耗，按武器攻速变化）。
 *   召唤：满编时随从合计每秒 1.8P（单只大型随从 1.3P）；陷阱/图腾：满编合计每秒 2.0P；
 *   伤害光环：对范围内每个敌人每秒 0.8P。
 * 每个技能按原始设计数值估算后，乘以系数 bal 对齐预算。系数在加载时计算，同一份模型生成 docs/2D-BALANCE.md。
 */
import {SKILLS} from './systems.js';
// 法师技能写在 game.js 里，这里用同样的数值描述它们（伤害倍率 m 为原始设计值）
export const MAGE_DESC={
  fire:{a:'basic'},
  shard:{a:'proj',m:.82,pierce:2},
  fireball:{a:'proj',m:.9,explode:1.15},
  glacial:{a:'proj',m:1.2,explode:.6},
  frozenorb:{a:'orb',m:.34,hits:4,burst:1.3},
  cbolt:{a:'proj',m:.45,n:5,spread:.3},
  ballz:{a:'dot',m:.42,ticks:3.3,aoe:'mid'},
  mmissile:{a:'proj',m:.55,n:3,homing:true},
  barrage:{a:'proj',m:.6,n:7,spread:.17},
  nova:{a:'nova',m:1.3},firenova:{a:'nova',m:1.2},lnova:{a:'nova',m:1.05},deepfreeze:{a:'nova',m:.8,cc:true,freeze:2},
  lightning:{a:'line',m:1.3},meteor:{a:'nova',m:2.8},chain:{a:'chain',m:1.2},
  armageddon:{a:'dot',m:1.1,ticks:4,aoe:'big'},thunder:{a:'dot',m:1.6,ticks:10,aoe:'single'},
  storm:{a:'dot',m:.31,ticks:7.3,aoe:'big'},blades:{a:'dot',m:.45,ticks:20,aoe:'big'},
  inferno:{a:'dot',m:.42,ticks:7.3,aoe:'big'},firewall:{a:'dot',m:.5,ticks:10,aoe:'big'},
  hydra:{a:'turret',m:.38,every:.75,dur:8,max:2},blackhole:{a:'dot',m:.35,ticks:8.7,aoe:'big'},
  armor:{a:'buff'},blink:{a:'buff'},heal:{a:'buff'},haste:{a:'buff'},manasurge:{a:'buff'},ward:{a:'buff'},slowtime:{a:'buff'}
};
// 召唤物攻击间隔（与 game.js 的 UNIT 表一致）
const EVERY={skeleton:.9,skelmage:1.1,revive:1,claygolem:1.2,bloodgolem:1.1,firegolem:1.1,valkyrie:.8,clone:.55,wolf:.7,direwolf:.75,grizzly:1.2,raven:.6};
const AOE={single:1,pierce:.85,mid:.7,big:.6};
export const budget=(cd,aoe,cc=false)=>{const c=Math.max(.35,cd);return (c<=1.2?3*c:3.6+(c-1.2))*(AOE[aoe]??1)*(cc?.5:1);};
const isCC=d=>!!(d.cc||d.stun>=1.2||(d.freeze&&d.freeze>=1.5)||d.knock>=100||d.fear||d.wall);
/** 估算：返回 {type, value, target, aoe}。type = burst（单次伤害）/ army（随从每秒）/ aura（光环每秒）/ basic / none。 */
export function estimate(id){
  const s=SKILLS[id],d=s.cls==='mage'?{...MAGE_DESC[id]}:s,a=d.a,cd=s.cooldown;
  if(a==='basic')return {type:'basic',value:2.2,target:2.2,aoe:'single'};
  if(['buff','curse','heal','dash'].includes(a)||d.cc&&false)return {type:'none',value:0,target:0,aoe:'single'};
  if(a==='summon'){
    const one=(d.m||0)/(EVERY[d.unit]||1),value=one*(d.max||d.n||1);
    return {type:'army',value,target:(d.max||1)>1?1.8:1.3,aoe:'single'};
  }
  if(a==='turret'){
    const sh=d.shot||{},per=((sh.m||d.m||0)+(sh.explode?.m||0))/(d.every||1)*(sh.nova?1:1);
    if(sh.heal)return {type:'none',value:0,target:0,aoe:'single'};
    return {type:'army',value:per*(d.max||1),target:2.0,aoe:sh.nova?'big':'single'};
  }
  if(a==='aura'){if(!d.every||!d.m)return {type:'none',value:0,target:0,aoe:'big'};return {type:'aura',value:d.m/d.every,target:.8,aoe:'big'};}
  let v=0,aoe='single';
  switch(a){
    case 'melee':{
      v=(d.m||0)*(d.hits||1)*(d.elements?1.3:1)+(d.splash?.m||0)+(d.strikes?.8:0)+(d.poison?d.poison.dps*d.poison.dur:0);
      aoe=d.arc>=2?'mid':d.arc>=1.1||d.range>150?'pierce':'single';break;}
    case 'proj':{
      const n=d.n||1,hitN=n>1?(d.homing?n:Math.min(n,1+n*.3)):1;
      v=(d.m||0)*hitN+(d.explode?.m??d.explode??0)+(d.explodeEnd?.m||0)+(d.cloud?d.cloud.m*d.cloud.dur/.4*.5:0)+(d.trailCloud?d.trailCloud.m*2:0)+(d.split?d.m*.45*1.5:0)+(d.poison?d.poison.dps*d.poison.dur:0);
      aoe=d.explode||d.explodeEnd||d.cloud||n>3?'mid':(d.pierce||1)>1?'pierce':'single';break;}
    case 'orb':v=d.m*d.hits+d.burst*d.m;aoe='big';break;
    case 'nova':v=(d.m||0)+(d.poison?d.poison.dps*d.poison.dur:0);aoe='big';break;
    case 'line':v=d.m;aoe='mid';break;
    case 'chain':v=d.m;aoe='mid';break;
    case 'dot':v=d.m*d.ticks;aoe=d.aoe||'big';break;
    case 'area':v=d.instant?(d.m||0)+(d.bolts?.6*2:0)+(d.strike?.8:0):(d.m||0)*(d.dur/(d.tick||.4))+(d.poison?d.poison.dps*d.poison.dur:0);aoe=d.wall?'mid':'big';break;
    case 'whirl':v=d.m*(d.dur/d.tick)*.5;aoe='big';break;
    case 'leap':v=d.m;aoe='big';break;
    case 'charge':v=d.m;aoe='mid';break;
    case 'corpse':v=d.redeem?0:d.m*1.5;aoe='big';if(d.redeem)return {type:'none',value:0,target:0,aoe};break;
  }
  if(!v)return {type:'none',value:0,target:0,aoe};
  return {type:'burst',value:v,target:budget(cd,aoe,isCC(d)),aoe};
}
const clampBal=x=>Math.max(.3,Math.min(4,x));
export const SKILL_BAL=Object.freeze(Object.fromEntries(Object.keys(SKILLS).map(id=>{
  const e=estimate(id);return [id,e.value&&e.target?Math.round(clampBal(e.target/e.value)*100)/100:1];
})));
/** 平衡后的单次伤害 / 每秒伤害（P 单位），用于文档与测试。 */
export function report(){
  return Object.keys(SKILLS).map(id=>{const s=SKILLS[id],e=estimate(id),b=SKILL_BAL[id];
    const tuned=e.value*b,dps=e.type==='burst'?tuned/Math.max(.3,s.cooldown):tuned;
    return {id,cls:s.cls,name:s.name,type:e.type,aoe:e.aoe,cd:s.cooldown,mana:s.mana,raw:+e.value.toFixed(2),bal:b,perCast:+tuned.toFixed(2),dps:+dps.toFixed(2),target:+e.target.toFixed(2)};});
}
