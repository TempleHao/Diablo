/**
 * Code-native pixel mage renderer.
 * Five selectable appearances share six gameplay poses without external binary assets.
 */
export const MAGE_SKIN_NAMES=Object.freeze(['蓝晶术士','赤焰术士','圣辉术士','虚空术士','苍翠术士']);
const PALETTES=[
  {robe:'#173a78',trim:'#e5b85f',gem:'#4ad8ff',dark:'#0b1734',cloth:'#24529b'},
  {robe:'#7c241f',trim:'#e5a34f',gem:'#ff682f',dark:'#2e0d0d',cloth:'#a43b2d'},
  {robe:'#d9d6c9',trim:'#d6a844',gem:'#73c9ff',dark:'#55545b',cloth:'#f2efe5'},
  {robe:'#38206e',trim:'#a86cff',gem:'#a446ff',dark:'#160d2f',cloth:'#57369b'},
  {robe:'#315332',trim:'#c29d5a',gem:'#52df65',dark:'#152718',cloth:'#456f43'}
];
export const mageSpriteStatus=()=>({ready:true,failed:false,mode:'procedural'});

const rect=(ctx,x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
function pixelMage(ctx,pose,skin,t){
  const p=PALETTES[Math.max(0,Math.min(4,skin|0))]||PALETTES[0];
  const walking=pose===1||pose===2,cast=pose===3,hurt=pose===4,back=pose===5;
  const bob=walking?(pose===1?-1:1):0;
  ctx.save();ctx.translate(0,bob);
  // cloak / legs
  rect(ctx,-11,-18,22,18,p.dark);
  rect(ctx,-14,-16,7,14,p.robe);rect(ctx,7,-16,7,14,p.robe);
  rect(ctx,-9,-4,6,5,'#443129');rect(ctx,3,-4,6,5,'#443129');
  // torso and gold trim
  rect(ctx,-12,-31,24,15,p.robe);rect(ctx,-12,-19,24,3,p.trim);
  rect(ctx,-2,-30,4,13,p.cloth);
  // shoulders / arms, cast arm extends outward
  rect(ctx,-16,-29,5,12,p.cloth);
  if(cast){rect(ctx,11,-29,8,5,p.cloth);rect(ctx,18,-31,5,5,'#d7a27d');}
  else rect(ctx,11,-29,5,12,p.cloth);
  // hood and face
  rect(ctx,-11,-43,22,13,p.robe);rect(ctx,-8,-48,16,7,p.robe);
  if(back){rect(ctx,-8,-41,16,10,p.dark);}
  else{
    rect(ctx,-7,-40,14,8,'#b98265');
    rect(ctx,-7,-40,14,4,p.dark);
    rect(ctx,-4,-35,3,1,'#f6cf9f');rect(ctx,2,-35,3,1,'#f6cf9f');
  }
  // staff
  rect(ctx,14,-44,3,41,'#6b452d');
  rect(ctx,11,-47,9,5,p.trim);rect(ctx,13,-51,5,5,p.gem);
  if(cast){
    ctx.globalAlpha=.35+.2*Math.sin(t*12);
    rect(ctx,21,-34,7,7,p.gem);rect(ctx,24,-37,2,13,p.gem);rect(ctx,19,-32,13,2,p.gem);
    ctx.globalAlpha=1;
  }
  if(hurt){ctx.globalAlpha=.42;rect(ctx,-17,-51,38,50,'#ff6b5c');ctx.globalAlpha=1;}
  ctx.restore();
}
function poseFor(p,tick){
  if(p.cast>0)return 3;
  if(p.invuln>0.35)return 4;
  if(Math.sin(p.angle||0)<-.42)return 5;
  const moving=p.moving||Math.abs(p.walk||0)>.01;
  if(moving)return 1+(Math.floor((p.walk||tick*8)*.42)&1);
  return 0;
}
export function drawMageSprite(ctx,p,tick,skin=0){
  const pose=poseFor(p,tick);
  ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y));
  if(Math.cos(p.angle||0)<-.2&&pose!==5)ctx.scale(-1,1);
  ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#02040ab5';ctx.beginPath();ctx.ellipse(0,7,27,9,0,0,Math.PI*2);ctx.fill();
  // Draw at a low logical resolution then scale up for a deliberately pixelated silhouette.
  ctx.scale(1.72,1.72);ctx.translate(0,-2);
  pixelMage(ctx,pose,skin,tick);
  ctx.restore();
  return true;
}
