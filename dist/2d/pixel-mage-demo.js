/**
 * 职业角色贴图：art/heroes.webp，7 格（亚马逊、刺客、野蛮人、德鲁伊、死灵法师、圣骑士、法师），
 * 每格 190×200，脚底中心在格子正中下方。都是用户提供的原画。
 * 一张静态原画配合程序化动画（落地步伐、呼吸、施法发光），不是逐帧动作。
 */
const sheet=typeof Image==='undefined'?null:new Image();
let ready=false,failed=false;
const CELL={w:190,h:200,footX:95};
// face：原画朝向（-1 朝左，1 朝右）；glow：武器发光点（格内坐标）；color：施法光色
export const HERO_ART=Object.freeze({
  amazon:{index:0,face:1,glow:[57,8],color:'#ffe2a0'},
  assassin:{index:1,face:-1,glow:[160,100],color:'#ff5a4a'},
  barbarian:{index:2,face:1,glow:[132,32],color:'#ff9a5a'},
  druid:{index:3,face:1,glow:[136,26],color:'#7dff7a'},
  necro:{index:4,face:1,glow:[131,22],color:'#c06cff'},
  paladin:{index:5,face:1,glow:[26,22],color:'#ffd77a'},
  mage:{index:6,face:-1,glow:[148,42],color:'#ffe9a8'}
});
const DRAW_H=124,K=DRAW_H/CELL.h;
if(sheet){
  sheet.decoding='async';
  sheet.addEventListener('load',()=>{ready=true;});
  sheet.addEventListener('error',()=>{failed=true;});
  sheet.src=new URL('./art/heroes.webp',import.meta.url).href;
}
export const status=()=>({ready,failed,width:sheet?.naturalWidth??0,height:sheet?.naturalHeight??0});
export const heroArt=cls=>HERO_ART[cls]||HERO_ART.mage;
// 走路用分步节奏（每步 4 个关键姿势，约 8 帧/秒）而不是连续正弦：
// 落地帧身体下沉、迈出的脚在前；过渡帧另一只脚抬起。没有上下漂浮和左右摇摆。
export const animationPose=(actor,tick)=>{
  const moving=!!actor.moving;
  const phase=Number.isFinite(actor.walk)?actor.walk:0;
  const step=moving?((Math.floor(phase/(Math.PI/2))%4)+4)%4:0;
  const stride=moving?[2.6,0,-2.6,0][step]:0;
  return {
    mode:(actor.invuln>0.3)?'hurt':actor.cast>0?'cast':moving?'run':'idle',
    moving,step,
    bob:moving?[1.6,-.6,1.6,-.6][step]:-.6*Math.sin(tick*2.2),
    lift:moving?[0,1,0,-1][step]:0, // 1=右脚抬起，-1=左脚抬起
    lean:moving?stride*.004:0,
    stride,phase
  };
};
/** 把法师画到 ctx；x/y 为脚底。返回当前动作名。 */
export function drawHero(ctx,actor,tick,gear,scale=1,fallback){
  if(!ready){
    if(fallback)fallback(ctx,actor,tick,gear,scale);
    return 'fallback';
  }
  const art=heroArt(actor.cls);
  const sx=art.index*CELL.w,pose=animationPose(actor,tick);
  ctx.save();ctx.translate(actor.x,actor.y);ctx.scale(scale,scale);
  // 接地阴影
  ctx.fillStyle='rgba(2,4,10,.55)';ctx.beginPath();ctx.ellipse(0,3,30,8,0,0,Math.PI*2);ctx.fill();
  // 按原画朝向与移动方向决定是否水平翻转
  const facing=Math.cos(actor.angle||0)>.15?1:Math.cos(actor.angle||0)<-.15?-1:art.face;
  if(facing!==art.face)ctx.scale(-1,1);
  ctx.rotate(pose.mode==='cast'?-.05:0);
  ctx.translate(0,Math.round(pose.bob));
  if(pose.mode==='hurt')ctx.globalAlpha=.55+.45*Math.abs(Math.sin(tick*30));
  const w=CELL.w*K,h=DRAW_H,left=-CELL.footX*K;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='medium';
  if(pose.moving){
    // 上半身整体；下摆与靴子按脚底中线分成左右两半，分别前后/抬起。
    const split=Math.round(CELL.h*.8),lowH=CELL.h-split,midX=CELL.footX;
    ctx.drawImage(sheet,sx,0,CELL.w,split,left,-h,w,split*K);
    const y0=-h+split*K;
    const legL={dx:pose.stride*1.2,dy:pose.lift<0?-2.2:0},legR={dx:-pose.stride*1.2,dy:pose.lift>0?-2.2:0};
    ctx.drawImage(sheet,sx,split,midX,lowH,left+legL.dx,y0+legL.dy,midX*K,lowH*K);
    ctx.drawImage(sheet,sx+midX,split,CELL.w-midX,lowH,left+midX*K+legR.dx,y0+legR.dy,(CELL.w-midX)*K,lowH*K);
  }else{
    ctx.drawImage(sheet,sx,0,CELL.w,CELL.h,left,-h,w,h);
  }
  ctx.globalAlpha=1;
  // 法杖宝石：施法时亮起
  const gx=(art.glow[0]-CELL.footX)*K,gy=-(CELL.h-art.glow[1])*K;
  const glow=art.color;
  const cast=pose.mode==='cast'?Math.min(1,(actor.cast||0)/.3):0;
  const pulse=.35+.15*Math.sin(tick*4)+cast*.65;
  ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=pulse;
  const r=10+cast*16;
  const g=ctx.createRadialGradient(gx,gy,0,gx,gy,r);
  g.addColorStop(0,'#ffffff');g.addColorStop(.25,glow);g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.fillRect(gx-r,gy-r,r*2,r*2);
  ctx.restore();
  return pose.mode;
}

export const drawAnimatedPixelMage=drawHero;
