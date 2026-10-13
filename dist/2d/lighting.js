/**
 * 余烬纪事 2D · 地下城照明通道
 * No external artwork: layered procedural light and atmosphere applied to the
 * actual canvas game render (never a mock screenshot).
 *
 * Uses a half-resolution mask to keep mobile fill rate manageable.
 */
const HALF=0.5;
let lightCanvas=null, mask=null;
function ensure(w,h){
  const cw=Math.max(1,Math.ceil(w*HALF)),ch=Math.max(1,Math.ceil(h*HALF));
  if(!lightCanvas){
    lightCanvas=document.createElement('canvas');
    mask=lightCanvas.getContext('2d',{alpha:true});
  }
  if(lightCanvas.width!==cw||lightCanvas.height!==ch){
    lightCanvas.width=cw;lightCanvas.height=ch;
  }
}
function illuminated(x,y,r,intensity=1){
  const gx=x*HALF,gy=y*HALF,gr=r*HALF;
  const g=mask.createRadialGradient(gx,gy,Math.max(1,gr*.055),gx,gy,gr);
  g.addColorStop(0,'rgba(0,0,0,'+Math.min(.98,.91*intensity)+')');
  g.addColorStop(.3,'rgba(0,0,0,'+Math.min(.92,.84*intensity)+')');
  g.addColorStop(.7,'rgba(0,0,0,'+Math.min(.50,.45*intensity)+')');
  g.addColorStop(1,'rgba(0,0,0,0)');
  mask.fillStyle=g;mask.beginPath();mask.arc(gx,gy,gr,0,Math.PI*2);mask.fill();
}
function colored(ctx,x,y,r,color){
  const g=ctx.createRadialGradient(x,y,2,x,y,r);
  g.addColorStop(0,color);
  g.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
}
export function drawAtmosphere(ctx,{w,h,cam,hero,torches=[],missiles=[],enemies=[],tick,region=0}){
  if(!hero||!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1)return;
  ensure(w,h);
  const darkness=[.54,.63,.46,.67,.59][region]??.56;
  mask.setTransform(1,0,0,1,0,0);
  mask.clearRect(0,0,lightCanvas.width,lightCanvas.height);
  mask.fillStyle='rgba(7,10,19,'+darkness+')';
  mask.fillRect(0,0,lightCanvas.width,lightCanvas.height);
  mask.globalCompositeOperation='destination-out';
  const hx=hero.x-cam.x,hy=hero.y-cam.y-38;
  const blink=hero.cast>0?38:0;
  illuminated(hx,hy,260+blink+Math.sin(tick*2)*5,1.03);
  const onScreen=(x,y,r=150)=>x>=-r&&x<=w+r&&y>=-r&&y<=h+r;
  const visibleTorches=[];
  for(const t of torches){
    const x=t.x-cam.x,y=t.y-cam.y-14;
    if(!onScreen(x,y))continue;
    const pulse=1+.06*Math.sin(tick*6+t.x*.004+t.y*.008);
    illuminated(x,y,160*pulse,.94);
    visibleTorches.push({x,y,pulse});
  }
  const spellLights=[];
  for(const m of missiles){
    if(m.kind!=='ember'&&m.kind!=='shard')continue;
    const x=m.x-cam.x,y=m.y-cam.y;
    if(!onScreen(x,y,80))continue;
    illuminated(x,y,65,.95);spellLights.push({x,y,kind:m.kind});
  }
  const boss=enemies.find(e=>e.kind==='boss');
  if(boss)illuminated(boss.x-cam.x,boss.y-cam.y-45,105,.48);
  mask.globalCompositeOperation='source-over';
  ctx.save();
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(lightCanvas,0,0,lightCanvas.width,lightCanvas.height,0,0,w,h);
  ctx.globalCompositeOperation='screen';
  for(const t of visibleTorches)colored(ctx,t.x,t.y,95*t.pulse,'rgba(177,71,14,.13)');
  colored(ctx,hx,hy,90,'rgba(196,110,30,.07)');
  for(const m of spellLights)colored(ctx,m.x,m.y,55,m.kind==='ember'?'rgba(235,91,21,.21)':'rgba(59,133,226,.22)');
  if(boss)colored(ctx,boss.x-cam.x,boss.y-cam.y-45,75,'rgba(132,38,107,.13)');
  ctx.restore();
}
