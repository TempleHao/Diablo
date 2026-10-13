/**
 * TEST ONLY. Small pixel-art character from user-provided visual reference.
 * This asset is never a substitute for the final dark/realistic 2.5D art track.
 * Programmatic secondary animation makes walking/casting responsive without
 * pretending that a single illustration is a true hand-drawn walk cycle.
 */
const mage=typeof Image==='undefined'?null:new Image();
let ready=false,failed=false;
export const SKIN_LABELS=Object.freeze({arcane:'奥术 · 星辉蓝',flame:'烈焰 · 赤红',light:'圣辉 · 象牙白',shadow:'暗影 · 紫晶',nature:'自然 · 翠绿'});
const skinCanvases=new Map();
function skinCanvas(skin){
  if(!ready||!mage)return null;
  if(!SKIN_LABELS[skin])skin='arcane';
  if(skin==='arcane')return mage;
  if(skinCanvases.has(skin))return skinCanvases.get(skin);
  const canvas=document.createElement('canvas');canvas.width=mage.naturalWidth;canvas.height=mage.naturalHeight;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(mage,0,0);
  const image=context.getImageData(0,0,canvas.width,canvas.height),a=image.data;
  for(let i=0;i<a.length;i+=4){
    const [r,g,b]=[a[i],a[i+1],a[i+2]];
    if(a[i+3]<12)continue;
    const blue=(b>r*1.16&&b>g*1.05&&b>56),highlight=(b>110&&b>r*1.07&&g>70);
    if(!blue)continue;
    if(skin==='flame'){a[i]=Math.min(255,Math.round(b*.88+25));a[i+1]=Math.round(g*.51);a[i+2]=Math.round(r*.55);}
    if(skin==='light'){const gray=Math.round(r*.16+g*.34+b*.5);a[i]=Math.min(255,gray+50);a[i+1]=Math.min(255,gray+47);a[i+2]=Math.min(255,gray+40);}
    if(skin==='shadow'){a[i]=Math.round(b*.7);a[i+1]=Math.round(g*.5);a[i+2]=Math.min(255,Math.round(b*.88+15));}
    if(skin==='nature'){a[i]=Math.round(r*.64);a[i+1]=Math.min(255,Math.round(b*.8+13));a[i+2]=Math.round(g*.66);}
    if(highlight&&skin==='flame'){a[i]=Math.min(255,a[i]+20);a[i+1]=Math.min(255,a[i+1]+10);}
  }
  context.putImageData(image,0,0);skinCanvases.set(skin,canvas);return canvas;
}

if(mage){
  mage.decoding='async';
  mage.addEventListener('load',()=>{ready=true;});
  mage.addEventListener('error',()=>{failed=true;});
  mage.src=new URL('./art/ember-mage-test-blue.webp',import.meta.url).href;
}
export const status=()=>({ready,failed,width:mage?.naturalWidth??0,height:mage?.naturalHeight??0});
export const animationPose=(actor,tick)=>{
  const moving=!!actor.moving;
  const phase=Number.isFinite(actor.walk)?actor.walk:0;
  const stride=moving?Math.sin(phase)*1.7:0;
  return {
    mode:(actor.invuln>0.3)?'hurt':actor.cast>0?'cast':moving?'run':'idle',
    moving,
    bob:moving?-1.8*Math.abs(Math.sin(phase)):-.65*Math.sin(tick*2),
    lean:moving?Math.sin(phase)*.055:Math.sin(tick*1.7)*.013,
    stride,phase
  };
};
export function drawAnimatedPixelMage(ctx,actor,tick,gear,scale=1,fallback){
  if(!ready){
    if(fallback)fallback(ctx,actor,tick,gear,scale);
    return 'fallback';
  }
  const pose=animationPose(actor,tick),picture=skinCanvas(actor.skin||'arcane');
  ctx.save();ctx.translate(actor.x,actor.y);ctx.scale(scale,scale);
  ctx.fillStyle='#04071099';ctx.beginPath();ctx.ellipse(0,4,29,8,0,0,Math.PI*2);ctx.fill();
  // Readable orientation from existing angle; back view is a temporary mirror,
  // the final art track requires genuine multi-direction sprites.
  const facingLeft=Math.cos(actor.angle)<-.15;
  if(facingLeft)ctx.scale(-1,1);
  ctx.rotate(pose.lean);
  const imageW=88,imageH=120;
  const draw=(dx,dy,alpha=1,filter='none')=>{
    ctx.save();ctx.globalAlpha=alpha;ctx.filter=filter;
    ctx.imageSmoothingEnabled=false;
    const bottom=imageH-33;
    if(pose.moving){
      // Real, separately transformed lower-body layer: alternating foot travel,
      // not simply translating an unchanging still picture.
      ctx.drawImage(picture,0,0,imageW,bottom,dx-imageW/2,dy-imageH+3,imageW,bottom);
      ctx.save();ctx.translate(pose.stride*1.8,Math.abs(pose.stride)*-.65);
      ctx.drawImage(picture,0,bottom,imageW,33,dx-imageW/2,dy-imageH+3+bottom,imageW,33);
      ctx.restore();
    }else ctx.drawImage(picture,0,0,imageW,imageH,dx-imageW/2,dy-imageH+3,imageW,imageH);
    ctx.restore();
  };
  // Rapid caster lean + short-lived trail, independent of the world collider.
  if(pose.moving){
    const stride=pose.stride;
    ctx.save();ctx.translate(-stride*2,-1.5);
    draw(-3,-pose.bob,0.16,'brightness(1.4) saturate(1.5)');
    ctx.restore();
  }
  ctx.save();
  ctx.translate(pose.moving?pose.stride*.8:0,pose.bob);
  if(pose.mode==='cast')ctx.rotate(-.10);
  if(pose.mode==='hurt'){ctx.globalAlpha=.60+.35*Math.sin(tick*35)**2;}
  if(pose.moving)ctx.scale(1+Math.sin(pose.phase)*.025,1-Math.abs(Math.sin(pose.phase))*.028);
  draw(0,0,1);
  ctx.restore();
  if(pose.mode==='cast'){
    const phase=tick*9,radius=19+Math.sin(phase)*3;
    const x=-27,y=-53;
    ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='#78dcffb9';ctx.lineWidth=2.2;
    ctx.shadowBlur=15;ctx.shadowColor='#7b8eff';
    ctx.beginPath();ctx.arc(x,y,radius,-1.2,.7);ctx.stroke();
    for(let i=0;i<4;i++){
      const a=tick*4+i*Math.PI/2;
      ctx.fillStyle=i%2?'#d9faff':'#8f8aff';
      ctx.fillRect(x+Math.cos(a)*(radius+7),y+Math.sin(a)*(radius+7),3,3);
    }
    ctx.restore();
  }
  // Small footstep glints tick with real walking input.
  if(pose.moving){
    const pulse=Math.abs(Math.sin(pose.phase));
    ctx.fillStyle='#a6d5ef'+Math.round(pulse*80).toString(16).padStart(2,'0');
    ctx.beginPath();ctx.ellipse(-pose.stride*.45,0,5+pulse*4,1.8,0,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();return pose.mode;
}
