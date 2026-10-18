/**
 * 法师角色贴图：使用用户提供的五色法师原画（art/mage-skins.webp）。
 * 五个外观是五张独立原画，不再靠程序换色。
 * 一张静态原画配合程序化次级动画（呼吸、步伐、施法前倾），测试版够用；
 * 真正的逐帧行走/施法序列需要另外绘制。
 */
const sheet=typeof Image==='undefined'?null:new Image();
let ready=false,failed=false;
export const SKIN_LABELS=Object.freeze({arcane:'奥术 · 星辉蓝',flame:'烈焰 · 赤红',light:'圣辉 · 象牙白',shadow:'暗影 · 紫晶',nature:'自然 · 翠绿'});
const SKINS=['arcane','flame','light','shadow','nature'];
// 贴图格：173×200，脚底中心在 x=92、y=200；法杖宝石大约在 (145,42)。
const CELL={w:173,h:200,footX:92,gemX:145,gemY:42};
export const SKIN_GLOW=Object.freeze({arcane:'#6cb8ff',flame:'#ff8a3d',light:'#ffd77a',shadow:'#b46cff',nature:'#6fe07a'});
const DRAW_H=124,K=DRAW_H/CELL.h;
if(sheet){
  sheet.decoding='async';
  sheet.addEventListener('load',()=>{ready=true;});
  sheet.addEventListener('error',()=>{failed=true;});
  sheet.src=new URL('./art/mage-skins.webp',import.meta.url).href;
}
export const status=()=>({ready,failed,width:sheet?.naturalWidth??0,height:sheet?.naturalHeight??0});
export const skinIndex=skin=>Math.max(0,SKINS.indexOf(skin));
export const animationPose=(actor,tick)=>{
  const moving=!!actor.moving;
  const phase=Number.isFinite(actor.walk)?actor.walk:0;
  const stride=moving?Math.sin(phase)*1.7:0;
  return {
    mode:(actor.invuln>0.3)?'hurt':actor.cast>0?'cast':moving?'run':'idle',
    moving,
    bob:moving?-2.2*Math.abs(Math.sin(phase)):-.8*Math.sin(tick*2.2),
    lean:moving?Math.sin(phase)*.045:Math.sin(tick*1.7)*.012,
    stride,phase
  };
};
/** 把法师画到 ctx；x/y 为脚底。返回当前动作名。 */
export function drawAnimatedPixelMage(ctx,actor,tick,gear,scale=1,fallback){
  if(!ready){
    if(fallback)fallback(ctx,actor,tick,gear,scale);
    return 'fallback';
  }
  const skin=SKINS.includes(actor.skin)?actor.skin:'arcane';
  const sx=skinIndex(skin)*CELL.w,pose=animationPose(actor,tick);
  ctx.save();ctx.translate(actor.x,actor.y);ctx.scale(scale,scale);
  // 接地阴影
  ctx.fillStyle='rgba(2,4,10,.55)';ctx.beginPath();ctx.ellipse(0,3,30,8,0,0,Math.PI*2);ctx.fill();
  // 原画朝左；向右移动时水平翻转。
  if(Math.cos(actor.angle||0)>.15)ctx.scale(-1,1);
  ctx.rotate(pose.lean+(pose.mode==='cast'?-.06:0));
  ctx.translate(0,pose.bob);
  if(pose.mode==='hurt')ctx.globalAlpha=.55+.45*Math.abs(Math.sin(tick*30));
  const w=CELL.w*K,h=DRAW_H,left=-CELL.footX*K;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='medium';
  if(pose.moving){
    // 上半身固定，下摆（约底部 22%）单独左右摆动，形成步伐感。
    const split=Math.round(CELL.h*.78);
    const squash=1-Math.abs(Math.sin(pose.phase))*.025;
    ctx.save();ctx.scale(1,squash);
    ctx.drawImage(sheet,sx,0,CELL.w,split,left,-h,w,split*K);
    ctx.restore();
    ctx.drawImage(sheet,sx,split,CELL.w,CELL.h-split,left+pose.stride*1.6,-h+split*K*squash,w,(CELL.h-split)*K);
  }else{
    ctx.drawImage(sheet,sx,0,CELL.w,CELL.h,left,-h,w,h);
  }
  ctx.globalAlpha=1;
  // 法杖宝石：施法时亮起
  const gx=(CELL.gemX-CELL.footX)*K,gy=-(CELL.h-CELL.gemY)*K;
  const glow=SKIN_GLOW[skin];
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
