/**
 * Six-pose blue-robed mage sprite adapter.
 * Expected authored sheet: art/mage-blue-six-pose.png, 3 columns × 2 rows.
 * Pose order: idle, walk-A, walk-B / cast, hurt, back.
 */
const sheet=typeof Image!=='undefined'?new Image():null;
let ready=false,failed=false;
if(sheet){
  sheet.decoding='async';
  sheet.onload=()=>{ready=true;};
  sheet.onerror=()=>{failed=true;};
  sheet.src=new URL('./art/mage-blue-six-pose.png',import.meta.url).href;
}
export const mageSpriteStatus=()=>({ready,failed});
function poseFor(p,tick){
  if(p.cast>0)return 3;
  if(p.invuln>0.35)return 4;
  if(Math.sin(p.angle||0)<-.42)return 5;
  if(p.moving)return 1+(Math.floor((p.walk||tick*8)*.42)&1);
  return 0;
}
const SKIN_FILTERS=['none','hue-rotate(140deg) saturate(1.22)','grayscale(.72) brightness(1.55) contrast(.92)','hue-rotate(58deg) saturate(1.28)','hue-rotate(255deg) saturate(1.08) brightness(.9)'];
export const MAGE_SKIN_NAMES=Object.freeze(['蓝晶术士','赤焰术士','圣辉术士','虚空术士','苍翠术士']);
export function drawMageSprite(ctx,p,tick,skin=0){
  if(!ready||!sheet)return false;
  const pose=poseFor(p,tick),col=pose%3,row=Math.floor(pose/3);
  const sw=sheet.naturalWidth/3,sh=sheet.naturalHeight/2;
  const w=82,h=92;
  ctx.save();
  ctx.translate(Math.round(p.x),Math.round(p.y));
  if(Math.cos(p.angle||0)<-.2&&pose!==5)ctx.scale(-1,1);
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#02040ab5';ctx.beginPath();ctx.ellipse(0,7,26,9,0,0,Math.PI*2);ctx.fill();
  ctx.filter=SKIN_FILTERS[Math.max(0,Math.min(4,Math.floor(skin)||0))];
  ctx.drawImage(sheet,col*sw,row*sh,sw,sh,-w/2,-h+7,w,h);
  ctx.filter='none';
  ctx.restore();
  return true;
}
