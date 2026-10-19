/**
 * 职业角色渲染（v0.6）。
 * 六个近战/施法职业使用分层原画：身体一层、武器一层（art/heroes.webp，坐标见 sprite-data.js 的 HERO_RIG）。
 * 攻击时武器层围绕握点真实旋转/推刺，身体配合后仰蓄力、前冲、落地压缩，并带武器残影和命中闪光。
 * 法师保留 v0.5 的白法师原画与施法发光。
 */
import {HERO_RIG} from './sprite-data.js';
const sheet=typeof Image==='undefined'?null:new Image();
let ready=false,failed=false;
export const HERO_ART=Object.freeze({
  amazon:{color:'#ffe2a0'},assassin:{color:'#ff5a4a'},barbarian:{color:'#ffb27a'},
  druid:{color:'#7dff7a'},necro:{color:'#c06cff'},paladin:{color:'#ffd77a'},mage:{color:'#ffe9a8',glow:[148,42]}
});
const K=124/200;
if(sheet){
  sheet.decoding='async';
  sheet.addEventListener('load',()=>{ready=true;});
  sheet.addEventListener('error',()=>{failed=true;});
  sheet.src=new URL('./art/heroes.webp',import.meta.url).href;
}
export const status=()=>({ready,failed,width:sheet?.naturalWidth??0,height:sheet?.naturalHeight??0});
export const heroArt=cls=>HERO_ART[cls]||HERO_ART.mage;
export const heroRig=cls=>HERO_RIG[cls]||HERO_RIG.mage;
// v0.7 走路：连续步伐（按走过的距离推进，见 motion.js），站立↔行走按速度平滑混合；
// 每步落地下沉、离地抬升，左右脚交替抬起，身体随速度前倾。没有漂浮和逐帧跳变。
import {walkWeight,turnScale} from './motion.js';
export const animationPose=(actor,tick)=>{
  const mo=actor._mo;
  const ww=mo?walkWeight(mo,120):actor.moving?1:0;
  const moving=ww>.05;
  const phase=mo?mo.stride:Number.isFinite(actor.walk)?actor.walk:0;
  const sn=Math.sin(phase),step=((Math.floor(phase/(Math.PI/2))%4)+4)%4;
  const breath=Math.sin((mo?mo.idle:tick)*2.2);
  return {
    mode:(actor.invuln>0.3)?'hurt':actor.cast>0?'cast':moving?'run':'idle',
    moving,step,ww,
    bob:(Math.abs(sn)*2.2-.6)*ww-.6*breath*(1-ww),
    lift:sn*ww,                         // >0 左脚抬起，<0 右脚抬起（连续值）
    lean:(mo?mo.lean:0)+(moving?.02*ww:0),
    stride:sn*2.6*ww,phase,breath
  };
};
const ease=t=>t<0?0:t>1?1:t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;
/**
 * 攻击动作曲线。p = 0..1 的动作进度。返回武器角度（度，正值 = 朝面向方向下劈/前指）、
 * 武器沿面向的推出量、身体前冲、身体倾角、纵向压缩，以及是否处于出手瞬间。
 * 三段：蓄力（0–0.32）→ 出手（0.32–0.52，最快）→ 收招（0.52–1）。
 */
export function swingPose(style,p){
  const a=ease(p/.32),b=ease((p-.32)/.2),c=ease((p-.52)/.48);
  const phase=p<.32?0:p<.52?1:2;
  const pick=(wind,strike,rest=0)=>phase===0?lerp(rest,wind,a):phase===1?lerp(wind,strike,b):lerp(strike,rest,c);
  switch(style){
    case 'thrust': return {ang:pick(62,84,0),push:pick(-12,26,0),lunge:pick(-4,12,0),tilt:pick(-.06,.08,0),squash:phase===1?1-.05*Math.sin(b*Math.PI):1,hit:phase===1};
    case 'chop':   return {ang:pick(-70,105,0),push:0,lunge:pick(-5,10,0),tilt:pick(-.12,.12,0),squash:phase===1?1-.08*Math.sin(b*Math.PI):1,hit:phase===1};
    case 'smash':  return {ang:pick(-80,110,0),push:0,lunge:pick(-4,9,0),tilt:pick(-.1,.11,0),squash:phase===1?1-.09*Math.sin(b*Math.PI):1,hit:phase===1};
    case 'claws':  return {ang:pick(-45,75,0),push:pick(-4,10,0),lunge:pick(-3,14,0),tilt:pick(-.05,.1,0),squash:1,hit:phase===1};
    case 'staff':  return {ang:pick(-38,42,0),push:pick(-4,10,0),lunge:pick(-5,7,0),tilt:pick(-.09,.07,0),squash:phase===0?1+.04*a:phase===1?1-.05*Math.sin(b*Math.PI):1,hit:phase===1,raise:pick(-16,-6,0)};
    default:       return {ang:0,push:0,lunge:0,tilt:0,squash:1,hit:false};
  }
}
function drawLayer(ctx,rect,dx,dy){ctx.drawImage(sheet,rect[0],rect[1],rect[2],rect[3],dx,dy,rect[2],rect[3]);}
/** 画角色；x/y 为脚底。actor.swing = {t0,dur,style?} 时播放攻击动作。返回动作名。 */
export function drawHero(ctx,actor,tick,gear,scale=1,fallback){
  if(!ready){if(fallback)fallback(ctx,actor,tick,gear,scale);return 'fallback';}
  const cls=HERO_RIG[actor.cls]?actor.cls:'mage',rig=HERO_RIG[cls],art=heroArt(cls);
  const pose=animationPose(actor,tick);
  ctx.save();ctx.translate(actor.x,actor.y);ctx.scale(scale,scale);
  ctx.fillStyle='rgba(2,4,10,.55)';ctx.beginPath();ctx.ellipse(0,3,30,8,0,0,Math.PI*2);ctx.fill();
  ctx.translate(0,-(actor.lift||0)/scale);
  if(cls==='mage'){drawMage(ctx,actor,tick,pose,rig,art);ctx.restore();return pose.mode;}
  // 朝向：攻击时朝目标，否则朝移动方向；转身时做翻面缓动（motion.js）
  const c=Math.cos(actor.angle||0);
  let facing=c>.15?1:c<-.15?-1:(actor.lastFacing||rig.face);
  const whirl=actor.whirl;
  if(whirl)facing=Math.floor(tick/.07)%2?1:-1;
  actor.lastFacing=facing;
  ctx.scale(K,K);
  if(actor._mo&&!whirl){const tz=Math.abs(turnScale(actor._mo));ctx.scale(tz,1);}
  if(facing!==rig.face)ctx.scale(-1,1);
  // 动作
  const sw0=actor.swing,style=rig.style,sw=sw0&&tick>=sw0.t0?sw0:null;
  let sp={ang:0,push:0,lunge:0,tilt:0,squash:1,hit:false,raise:0},p=1;
  if(sw&&tick-sw.t0<sw.dur){p=(tick-sw.t0)/sw.dur;sp={raise:0,...swingPose(sw.style||style,p)};}
  if(whirl)sp={ang:(tick*1100)%360,push:0,lunge:0,tilt:.06,squash:1,hit:true,raise:0};
  if(actor.leap)sp={ang:-75,push:0,lunge:0,tilt:-.18,squash:1.06,hit:false,raise:0};
  const left=-rig.foot,top=-rig.h;
  const hurt=pose.mode==='hurt'?Math.min(1,(actor.invuln-.3)/.3):0;
  ctx.translate((sp.lunge-hurt*6)*rig.face,pose.bob/K);
  ctx.rotate((sp.tilt+pose.lean*1.2-hurt*.14)*rig.face);
  const breathe=1+(pose.breath||0)*.012*(1-(pose.ww||0));
  ctx.scale((1+(1-sp.squash)*.6)/breathe,sp.squash*breathe);
  if(pose.mode==='hurt')ctx.globalAlpha=.6+.4*Math.abs(Math.sin(tick*30));
  ctx.imageSmoothingEnabled=false;
  // 身体（行走时下摆左右分开迈步）
  const b=rig.body;
  if(pose.moving&&!sw?.active){
    const split=Math.round(b[3]*.8),midX=rig.foot;
    ctx.drawImage(sheet,b[0],b[1],b[2],split,left,top,b[2],split);
    const lowH=b[3]-split,ly=top+split;
    ctx.drawImage(sheet,b[0],b[1]+split,midX,lowH,left+pose.stride*2,ly-Math.max(0,-pose.lift)*4,midX,lowH);
    ctx.drawImage(sheet,b[0]+midX,b[1]+split,b[2]-midX,lowH,left+midX-pose.stride*2,ly-Math.max(0,pose.lift)*4,b[2]-midX,lowH);
  }else drawLayer(ctx,b,left,top);
  // 武器：围绕握点旋转（rig.face 方向为“前”）
  const drawWeapon=(rect,px,py,ang,push,alpha=1,mirror=1)=>{
    ctx.save();ctx.globalAlpha*=alpha;
    const gx=left+px,gy=top+py+(sp.raise||0);
    ctx.translate(gx+push*rig.face,gy);ctx.rotate(ang*Math.PI/180*rig.face*mirror);
    ctx.drawImage(sheet,rect[0],rect[1],rect[2],rect[3],-px,-py,rect[2],rect[3]);
    ctx.restore();
  };
  // 出手阶段的武器残影
  if(sw&&sp.hit&&!whirl){
    ctx.save();ctx.globalCompositeOperation='lighter';
    for(let k=1;k<=3;k++){
      const q=Math.max(0,p-k*.035),g={raise:0,...swingPose(sw.style||style,q)};
      drawWeapon(rig.weapon,rig.px,rig.py,g.ang,g.push,.28/k);
      if(rig.weapon2)drawWeapon(rig.weapon2,rig.px2,rig.py2,-swingPose('claws',Math.max(0,q-.12)).ang*.8,0,.22/k,-1);
    }
    ctx.restore();
  }
  if(whirl){ctx.save();ctx.globalCompositeOperation='lighter';for(let k=1;k<=4;k++)drawWeapon(rig.weapon,rig.px,rig.py,sp.ang-k*28,0,.22/k);ctx.restore();}
  if(rig.weapon2){
    // 刺客左爪：比右爪慢一拍，形成交替双爪
    const q=sw&&tick-sw.t0<sw.dur?swingPose('claws',Math.max(0,p-.14)):{ang:0,push:0};
    drawWeapon(rig.weapon2,rig.px2,rig.py2,-q.ang*.8,-q.push*.5,1,-1);
  }
  drawWeapon(rig.weapon,rig.px,rig.py,sp.ang,sp.push);
  // 出手瞬间：武器尖端闪光
  if(sw&&sp.hit&&rig.tx!=null){
    const ang=sp.ang*Math.PI/180*rig.face,dx=rig.tx-rig.px,dy=rig.ty-rig.py;
    const tx=left+rig.px+sp.push*rig.face+dx*Math.cos(ang)-dy*Math.sin(ang),ty=top+rig.py+(sp.raise||0)+dx*Math.sin(ang)+dy*Math.cos(ang);
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.85;
    const g=ctx.createRadialGradient(tx,ty,0,tx,ty,26);g.addColorStop(0,'#ffffff');g.addColorStop(.3,art.color);g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.fillRect(tx-26,ty-26,52,52);
  }
  // 施法职业：法杖顶端常亮，施法时更亮
  if(style==='staff'&&rig.tx!=null){
    const ang=sp.ang*Math.PI/180*rig.face,dx=rig.tx-rig.px,dy=rig.ty-rig.py;
    const tx=left+rig.px+dx*Math.cos(ang)-dy*Math.sin(ang),ty=top+rig.py+(sp.raise||0)+dx*Math.sin(ang)+dy*Math.cos(ang)+14;
    const cast=sw&&tick-sw.t0<sw.dur?Math.sin(Math.PI*p):0,r=18+cast*26;
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.35+.15*Math.sin(tick*4)+cast*.6;
    const g=ctx.createRadialGradient(tx,ty,0,tx,ty,r);g.addColorStop(0,'#ffffff');g.addColorStop(.25,art.color);g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.fillRect(tx-r,ty-r,r*2,r*2);
  }
  ctx.restore();
  return sw&&tick-sw.t0<sw.dur?'attack':pose.mode;
}
// 法师：v0.5 的白法师原画 + 施法发光
function drawMage(ctx,actor,tick,pose,rig,art){
  const c=Math.cos(actor.angle||0),facing=c>.15?1:c<-.15?-1:(actor.lastFacing||rig.face);actor.lastFacing=facing;
  if(actor._mo){ctx.scale(Math.abs(turnScale(actor._mo)),1);}
  if(facing!==rig.face)ctx.scale(-1,1);
  // 施法：先后仰抬手（0–40%），再前倾释放；身体轻微拉伸
  const cp=pose.mode==='cast'?1-Math.min(1,(actor.cast||0)/.3):0,wind=cp<.4?cp/.4:1,rel=cp<.4?0:Math.sin((cp-.4)/.6*Math.PI);
  ctx.rotate((pose.mode==='cast'?-.08*wind+.1*rel:0)*rig.face+(pose.lean||0)*rig.face);
  ctx.translate(0,pose.bob);
  if(pose.mode==='cast')ctx.scale(1-.03*wind+.02*rel,1+.04*wind-.03*rel);
  else ctx.scale(1/(1+(pose.breath||0)*.012*(1-(pose.ww||0))),1+(pose.breath||0)*.012*(1-(pose.ww||0)));
  if(pose.mode==='hurt')ctx.globalAlpha=.55+.45*Math.abs(Math.sin(tick*30));
  const b=rig.body,w=b[2]*K,h=b[3]*K,left=-rig.foot*K;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='medium';
  if(pose.moving){
    const split=Math.round(b[3]*.8),lowH=b[3]-split,midX=rig.foot;
    ctx.drawImage(sheet,b[0],b[1],b[2],split,left,-h,w,split*K);
    const y0=-h+split*K;
    ctx.drawImage(sheet,b[0],b[1]+split,midX,lowH,left+pose.stride*1.2,y0-Math.max(0,-pose.lift)*2.4,midX*K,lowH*K);
    ctx.drawImage(sheet,b[0]+midX,b[1]+split,b[2]-midX,lowH,left+midX*K-pose.stride*1.2,y0-Math.max(0,pose.lift)*2.4,(b[2]-midX)*K,lowH*K);
  }else ctx.drawImage(sheet,b[0],b[1],b[2],b[3],left,-h,w,h);
  ctx.globalAlpha=1;
  const gx=(art.glow[0]-rig.foot)*K,gy=-(b[3]-art.glow[1])*K;
  const cast=pose.mode==='cast'?Math.min(1,(actor.cast||0)/.3):0;
  ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.35+.15*Math.sin(tick*4)+cast*.65;
  const r=10+cast*16,g=ctx.createRadialGradient(gx,gy,0,gx,gy,r);
  g.addColorStop(0,'#ffffff');g.addColorStop(.25,art.color);g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(gx-r,gy-r,r*2,r*2);
}
export const drawAnimatedPixelMage=drawHero;
