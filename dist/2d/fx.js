/**
 * 归墟 2D · 渲染辅助：光晕贴图缓存、光照遮罩、地面印记、震屏。
 * 目标是"好看但不卡"：不用 shadowBlur / ctx.filter，所有发光都是预渲染贴图 + drawImage。
 */
const hasDom=typeof document!=='undefined';
const sprites=new Map();
function make(size){const c=document.createElement('canvas');c.width=c.height=size;return c;}
/** 彩色光晕：hot=true 时中心发白（火、闪电），否则纯色柔光。 */
export function glowSprite(color,hot=false){
  const key=color+(hot?'#h':'#s');
  let c=sprites.get(key);
  if(c||!hasDom)return c;
  c=make(64);const g=c.getContext('2d'),grad=g.createRadialGradient(32,32,0,32,32,32);
  if(hot){grad.addColorStop(0,'rgba(255,255,255,1)');grad.addColorStop(.18,color);grad.addColorStop(.5,color+'55');}
  else{grad.addColorStop(0,color);grad.addColorStop(.45,color+'66');}
  grad.addColorStop(1,color+'00');
  g.fillStyle=grad;g.fillRect(0,0,64,64);sprites.set(key,c);return c;
}
/** 冰晶小碎片（菱形），用于冰系粒子。 */
export function shardSprite(color){
  const key='shard'+color;let c=sprites.get(key);if(c||!hasDom)return c;
  c=make(24);const g=c.getContext('2d');
  g.fillStyle=color;g.beginPath();g.moveTo(12,0);g.lineTo(17,12);g.lineTo(12,24);g.lineTo(7,12);g.closePath();g.fill();
  g.fillStyle='rgba(255,255,255,.85)';g.beginPath();g.moveTo(12,3);g.lineTo(14,12);g.lineTo(12,20);g.lineTo(10.5,12);g.closePath();g.fill();
  sprites.set(key,c);return c;
}
/** 在 (x,y) 画半径 r 的光晕。调用方负责设置混合模式。 */
export function drawGlow(ctx,x,y,r,color,alpha=1,hot=false){
  const s=glowSprite(color,hot);if(!s||alpha<=0.01||r<=0)return;
  ctx.globalAlpha=Math.min(1,alpha);ctx.drawImage(s,x-r,y-r,r*2,r*2);
}
export function drawEllipseGlow(ctx,x,y,rx,ry,color,alpha=1,hot=false){
  const s=glowSprite(color,hot);if(!s||alpha<=0.01)return;
  ctx.globalAlpha=Math.min(1,alpha);ctx.drawImage(s,x-rx,y-ry,rx*2,ry*2);
}

/**
 * 光照遮罩：半分辨率画布先铺满黑暗，再在光源处"挖洞"，最后整体盖到画面上。
 * 每帧代价 = 一次填充 + 每个光源一次 drawImage + 一次缩放贴图。
 */
export class Lighting{
  constructor(){this.canvas=hasDom?make(16):null;this.ctx=this.canvas?.getContext('2d');this.scale=.5;this.hole=null;}
  begin(vw,vh,cam,ambient,tint='4,6,12'){
    if(!this.ctx)return;
    const w=Math.ceil(vw*this.scale),h=Math.ceil(vh*this.scale);
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    if(!this.hole){
      this.hole=make(128);const g=this.hole.getContext('2d'),grad=g.createRadialGradient(64,64,0,64,64,64);
      grad.addColorStop(0,'rgba(0,0,0,1)');grad.addColorStop(.35,'rgba(0,0,0,.85)');grad.addColorStop(.7,'rgba(0,0,0,.35)');grad.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle=grad;g.fillRect(0,0,128,128);
    }
    this.cam=cam;this.vw=vw;this.vh=vh;
    const c=this.ctx;c.globalCompositeOperation='source-over';c.globalAlpha=1;
    c.clearRect(0,0,w,h);c.fillStyle='rgba('+tint+','+ambient+')';c.fillRect(0,0,w,h);
    c.globalCompositeOperation='destination-out';
  }
  /** 世界坐标光源；strength 0..1，ry 默认按俯视角压扁。 */
  light(x,y,r,strength=1,flat=.72){
    if(!this.ctx)return;
    const s=this.scale,sx=(x-this.cam.x)*s,sy=(y-this.cam.y)*s,rx=r*s,ry=r*s*flat;
    if(sx+rx<0||sy+ry<0||sx-rx>this.canvas.width||sy-ry>this.canvas.height)return;
    this.ctx.globalAlpha=Math.min(1,strength);
    this.ctx.drawImage(this.hole,sx-rx,sy-ry,rx*2,ry*2);
  }
  end(ctx){
    if(!this.ctx)return;
    this.ctx.globalAlpha=1;this.ctx.globalCompositeOperation='source-over';
    ctx.save();ctx.imageSmoothingEnabled=true;ctx.drawImage(this.canvas,0,0,this.vw,this.vh);ctx.restore();
  }
}

/** 地面印记（焦痕、冰霜、血迹），画在角色下面，有上限。 */
export function addDecal(list,x,y,r,type,life=4){
  list.push({x,y,r,type,life,max:life,rot:(x*13+y*7)%6.28});
  if(list.length>48)list.shift();
}
export function tickDecals(list,dt){for(let i=list.length-1;i>=0;i--){list[i].life-=dt;if(list[i].life<=0)list.splice(i,1);}}
const DECAL={scorch:['#120806',.72],frost:['#9fdcff',.22],blood:['#2a0608',.55],ash:['#1a1714',.5],arcane:['#8e6dff',.16]};
export function drawDecals(ctx,list,cam,vw,vh){
  for(const d of list){
    if(d.x+d.r<cam.x||d.x-d.r>cam.x+vw||d.y+d.r<cam.y||d.y-d.r>cam.y+vh)continue;
    const [color,alpha]=DECAL[d.type]||DECAL.ash,fade=Math.min(1,d.life/Math.min(1.2,d.max));
    ctx.globalCompositeOperation=d.type==='frost'||d.type==='arcane'?'lighter':'source-over';
    drawEllipseGlow(ctx,d.x,d.y,d.r,d.r*.6,color,alpha*fade);
  }
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
}

/** 震屏：返回本帧镜头偏移。amount 自然衰减。 */
export function shakeOffset(state,dt){
  if(state.amount<.2){state.amount=0;return {x:0,y:0};}
  state.amount*=Math.exp(-dt*14);
  const a=state.amount;return {x:(Math.random()-.5)*a*2,y:(Math.random()-.5)*a*1.4};
}
