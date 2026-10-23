/* 归墟 2D · 运动平滑（v0.7）
 *
 * 英雄、怪物、召唤物共用一份「运动状态」o._mo，每帧在逻辑更新里推进：
 *   速度：用实际位移算出瞬时速度，再指数平滑，起步/停下有过渡，不会一帧内从 0 跳到全速；
 *   步伐：步伐相位按「走过的距离」推进（不是按时间），被墙挡住时脚步自然停下，不会原地踏步；
 *   转身：朝向改变时做 0.14 秒的「翻面」缓动（横向先收窄再展开），不再瞬间镜像；
 *   前倾：按水平速度前倾，急停时回正。
 * 画面层（art.js / pixel-mage-demo.js）读取 walkWeight / stride / turnScale / lean 来组合姿势。
 */
const TAU=Math.PI*2;
export function stepMotion(o,dt,face,{stepLen=34}={}){
  let m=o._mo;
  if(!m)m=o._mo={px:o.x,py:o.y,vx:0,vy:0,speed:0,stride:Math.random()*TAU,face:face||1,turnT:1,lean:0,idle:Math.random()*TAU};
  if(dt<=0)return m;
  let ix=(o.x-m.px)/dt,iy=(o.y-m.py)/dt;
  if(Math.hypot(o.x-m.px,o.y-m.py)>160){ix=0;iy=0;} // 传送 / 闪现：不算速度
  m.px=o.x;m.py=o.y;
  const k=1-Math.exp(-dt*11);
  m.vx+=(ix-m.vx)*k;m.vy+=(iy-m.vy)*k;
  m.speed=Math.hypot(m.vx,m.vy);
  m.stride=(m.stride+Math.min(m.speed,900)*dt/stepLen*Math.PI)%(TAU*64);
  m.idle+=dt;
  if(face&&face!==m.face){m.face=face;m.turnT=0;}
  m.turnT=Math.min(1,m.turnT+dt/.14);
  const targetLean=Math.max(-.12,Math.min(.12,m.vx/260*.09));
  m.lean+=(targetLean-m.lean)*(1-Math.exp(-dt*9));
  return m;
}
/** 0..1：走路姿势的权重（速度越快越接近完整步伐），让站立与行走之间平滑过渡。 */
export const walkWeight=(m,full=90)=>m?Math.max(0,Math.min(1,(m.speed-8)/full)):0;
/** 翻面缓动：横向比例（带正负号）。翻面瞬间收窄到 0.2，再展开到 1。 */
export const turnScale=m=>{if(!m)return 1;const t=m.turnT,e=1-(1-t)*(1-t);return m.face*(.2+.8*e);};
/** 朝目标速度转向（指数平滑），用于怪物与召唤物的移动：起步与转弯不再瞬间完成。 */
export function steer(o,vx,vy,dt,rate=9){
  const k=1-Math.exp(-dt*rate);
  o.svx=(o.svx||0)+(vx-(o.svx||0))*k;o.svy=(o.svy||0)+(vy-(o.svy||0))*k;
  return [o.svx,o.svy];
}
