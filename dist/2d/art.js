import {drawMage} from './mage-portrait.js';
import {drawAnimatedPixelMage,drawHero} from './pixel-mage-demo.js';
import {drawEquipmentIcon,iconSource} from './equipment-icons.js';
import {RARITY_COLORS,SET_COLOR} from './systems.js';
import {walkWeight,turnScale} from './motion.js';
import {SPRITES} from './sprite-data.js';
import {TIER,ELITE_MOD_NAMES,SCHOOL_COLOR} from './monsters.js';
import {drawGlow,drawEllipseGlow} from './fx.js';
/**
 * 归墟 · 2D 美术层
 * Sprite art: 0x72 DungeonTileset II v1.7 (CC0 1.0).
 * Original: https://0x72.itch.io/dungeontileset-ii
 * Sheet is checked into art/ (no hotlink, CDN, or runtime network dependency).
 * Original atlas 512x512, frame coordinates from the author's tile_list_v1.7.
 */
const atlas = new Image();
let ready = false, failed = false;
atlas.decoding = 'async';
atlas.onload = () => { ready = true; };
atlas.onerror = () => { failed = true; };
atlas.src = new URL('./art/0x72-dungeon-atlas.png', import.meta.url).href;
export const artStatus = () => ({ready, failed});
const FRAME = {
  floor: [[16,64],[32,64],[48,64],[16,80],[32,80],[48,80],[16,96],[32,96]],
  wall: [[16,0],[32,0],[48,0]], wallFace: [[16,16],[32,16],[48,16]],
  column: [80,80,16,48], skull: [288,432,16,16], crate: [288,408,16,24],
  chest: [304,416,16,16],
  mageIdle:[128,164,16,28], mageRun:[192,164,16,28], mageHit:[256,164,16,28],
  wretchIdle:[368,88,16,16], wretchRun:[432,88,16,16],
  archerIdle:[368,153,16,23], archerRun:[432,153,16,23],
  cultistIdle:[368,225,16,23], cultistRun:[432,225,16,23],
  bruteIdle:[16,380,32,36], bruteRun:[144,380,32,36],
  bossIdle:[16,428,32,36], bossRun:[144,428,32,36],
  torch:[288,336,16,16], weapon:[324,129,8,30], coin:[289,385,6,7],
  fountain:[64,16,16,16], banner:[16,32,16,16]
};
const hash=(x,y,seed=0)=>Math.imul((x*73856093 ^ y*19349663 ^ seed*2654435761)>>>0,1597334677)>>>0;
const inView=(x,y,cam,vw,vh,margin=100)=>x>cam.x-margin&&x<cam.x+vw+margin&&y>cam.y-margin&&y<cam.y+vh+margin;
function sprite(ctx, frame, x, y, w, h) {
  if(!ready)return;
  ctx.drawImage(atlas,frame[0],frame[1],frame[2]||16,frame[3]||16,
    Math.round(x),Math.round(y),Math.round(w),Math.round(h));
}
function gradientSpot(ctx,x,y,r,inner,outer='transparent'){
  const g=ctx.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,inner);g.addColorStop(1,outer);
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
}
function fixture(ctx,x,y,r=1){
  ctx.save();ctx.translate(x,y);
  const now=performance.now()*.001,pulse=.9+Math.sin(now*9+x)*.06+Math.sin(now*23+y)*.04;
  ctx.globalCompositeOperation='lighter';
  drawEllipseGlow(ctx,0,-6,120*pulse,80*pulse,'#ff8a3a',.28);
  drawGlow(ctx,0,-15,26*pulse,'#ffb35a',.7);
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.fillStyle='#1d1b1c';ctx.fillRect(-3,-4,6,19);
  ctx.fillStyle='#f9a447';ctx.beginPath();ctx.ellipse(0,-15,5,10*pulse,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff3bb';ctx.beginPath();ctx.ellipse(0,-12,2,4*pulse,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
export function floor(ctx,cam,vw,vh,worldW,worldH,tick,region=0,seed=0){
  ctx.fillStyle='#0a1015';ctx.fillRect(0,0,worldW,worldH);
  if(!ready)return;
  const S=48, left=Math.max(0,Math.floor(cam.x/S)-1),right=Math.min(Math.ceil(worldW/S),Math.ceil((cam.x+vw)/S)+1);
  const top=Math.max(0,Math.floor(cam.y/S)-1),bottom=Math.min(Math.ceil(worldH/S),Math.ceil((cam.y+vh)/S)+1);
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    const v=hash(x,y,501 ^ seed ^ ((region+1)*733)),pick=v%100;
    // 大部分用干净石板，少量裂纹石板，避免满屏高对比裂纹
    const tex=FRAME.floor[pick<68?0:pick<80?2:pick<88?4:pick<93?1:pick<97?3:5+(v>>8)%3];
    sprite(ctx,[tex[0],tex[1],16,16],x*S,y*S,S+1,S+1);
    // Keep pixel-art intact; irregular soot patches and scattered rubble are transparent overlays.
    if(v%15===0){ctx.fillStyle='#090d1180';ctx.fillRect(x*S+7,y*S+7,18,6);}
    if(v%67===0)sprite(ctx,FRAME.skull,x*S+12,y*S+12,25,25);
    if(v%9===0){ctx.fillStyle='#10131855';ctx.fillRect(x*S+6,y*S+3,6,17);}
  }
  const tints=['#18100b25','#18190e48','#380f102d','#0b364238','#29112e3c','#1c232b52','#24381e4b','#13324850','#401a104f'];
  ctx.fillStyle=tints[region]||tints[0];ctx.fillRect(cam.x,cam.y,vw,vh);
  // One visual identity per region: gates, ritual stains, cave fractures, or corrupted ground.
  const S2=96;
  for(let y=Math.floor(cam.y/S2);y<=Math.ceil((cam.y+vh)/S2);y++)
    for(let x=Math.floor(cam.x/S2);x<=Math.ceil((cam.x+vw)/S2);x++){
      const v=hash(x,y,1213+region*101),ox=x*S2,oy=y*S2;
      if(region===2&&v%13===0){
        ctx.strokeStyle='#832c2466';ctx.lineWidth=3;ctx.beginPath();ctx.arc(ox+44,oy+40,26,0,Math.PI*2);ctx.stroke();
        for(let n=0;n<5;n++){const a=n*2*Math.PI/5;ctx.beginPath();ctx.moveTo(ox+44,oy+40);ctx.lineTo(ox+44+Math.cos(a)*25,oy+40+Math.sin(a)*25);ctx.stroke();}
      }
      if(region===3&&v%8===0){ctx.strokeStyle='#7398a35c';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(ox+12,oy+72);ctx.lineTo(ox+44,oy+28);ctx.lineTo(ox+69,oy+46);ctx.stroke();}
      if(region===4&&v%11===0){ctx.fillStyle='#6c3d7844';ctx.beginPath();ctx.arc(ox+31,oy+65,20,0,Math.PI*2);ctx.fill();}
      if(region===5&&v%6===0){ctx.strokeStyle='#8d9e9266';ctx.beginPath();ctx.arc(ox+48,oy+46,24,0,Math.PI*2);ctx.stroke();}
      if(region===6&&v%10===0){ctx.fillStyle='#536e3360';ctx.fillRect(ox+5,oy+19,53,11);}
      if(region===7&&v%8===0){ctx.strokeStyle='#b5dff275';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(ox+12,oy+76);ctx.lineTo(ox+31,oy+27);ctx.lineTo(ox+60,oy+49);ctx.stroke();}
      if(region===8&&v%10===0){ctx.fillStyle='#9a3a254e';ctx.beginPath();ctx.moveTo(ox+15,oy+70);ctx.lineTo(ox+40,oy+18);ctx.lineTo(ox+70,oy+74);ctx.fill();}
      if(region===1&&v%9===0){ctx.fillStyle='#151a1acc';ctx.fillRect(ox+20,oy+15,62,9);ctx.strokeStyle='#8d785866';ctx.strokeRect(ox+20,oy+15,62,9);}
    }
  // Carved northern ritual circle, deliberately placed beneath characters.
  const cx=worldW/2,cy=5.7*72;
  gradientSpot(ctx,cx,cy,170,'#bb422743','#6c362200');
  ctx.strokeStyle='#ba774745';ctx.lineWidth=4;
  for(const r of [66,101]){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();}
  ctx.save();ctx.translate(cx,cy);ctx.strokeStyle='#bd876d8a';ctx.lineWidth=3;
  for(let i=0;i<8;i++){ctx.rotate(Math.PI/4);ctx.beginPath();ctx.moveTo(0,72);ctx.lineTo(-8,89);ctx.lineTo(8,89);ctx.closePath();ctx.stroke();}ctx.restore();
  // Layered masonry wall at the outer perimeter.
  const col0=Math.max(0,Math.floor(cam.x/S)-1),col1=Math.min(Math.ceil(worldW/S),Math.ceil((cam.x+vw)/S)+1);
  for(let x=col0;x<col1;x++){
    const xx=x*S;const f=x%3;
    sprite(ctx,[FRAME.wall[f][0],FRAME.wall[f][1],16,16],xx,0,S,S);
    sprite(ctx,[FRAME.wallFace[f][0],FRAME.wallFace[f][1],16,16],xx,S-3,S,S);
    sprite(ctx,[FRAME.wall[f][0],FRAME.wall[f][1],16,16],xx,worldH-S*2,S,S);
    sprite(ctx,[FRAME.wallFace[f][0],FRAME.wallFace[f][1],16,16],xx,worldH-S,S,S);
  }
  const row0=Math.max(0,Math.floor(cam.y/S)-1),row1=Math.min(Math.ceil(worldH/S),Math.ceil((cam.y+vh)/S)+1);
  for(let y=row0;y<row1;y++){
    sprite(ctx,[32,16,16,16],0,y*S,S,S);
    sprite(ctx,[32,16,16,16],worldW-S,y*S,S,S);
  }
}
export function pillar(ctx,b){
  const center=b.x+b.w/2, foot=b.y+b.h;
  ctx.fillStyle='#03060b9a';ctx.beginPath();ctx.ellipse(center+9,foot+7,Math.max(31,b.w*.56),14,-.12,0,Math.PI*2);ctx.fill();
  if(b.kind==='wall'){
    // Proper tileable ruined masonry instead of a stretched 16px-wide pillar.
    const segment=36, elevation=64;
    for(let x=b.x;x<b.x+b.w;x+=segment){
      const width=Math.min(segment,b.x+b.w-x);
      const n=Math.floor((x-b.x)/segment),variant=(n+b.variant)%3;
      if(ready){
        sprite(ctx,[FRAME.wall[variant][0],FRAME.wall[variant][1],16,16],x,b.y-elevation,width,elevation);
        sprite(ctx,[FRAME.wallFace[variant][0],FRAME.wallFace[variant][1],16,16],x,b.y,width,50);
      }else{
        ctx.fillStyle='#49505a';ctx.fillRect(x,b.y-elevation,width,elevation+50);
      }
      ctx.strokeStyle='#17171bb0';ctx.lineWidth=1;ctx.beginPath();
      ctx.moveTo(x,b.y-elevation+1);ctx.lineTo(x,b.y+49);ctx.stroke();
    }
    ctx.fillStyle='#0c0e12a6';ctx.fillRect(b.x,foot+13,b.w,5);
    if(b.variant===1){sprite(ctx,FRAME.skull,center-12,b.y+3,23,23);}
    return;
  }
  const w=b.w>45?65:49,h=b.w>45?143:112;
  if(ready){
    sprite(ctx,FRAME.column,center-w/2,foot-h+13,w,h);
    sprite(ctx,[32,16,16,16],b.x,foot-11,b.w,16);
  }else{ctx.fillStyle='#3e4648';ctx.fillRect(b.x,b.y,b.w,b.h);}
  if(hash(Math.floor(center),Math.floor(foot))%5===0){
    ctx.fillStyle='#211e1b5c';ctx.fillRect(center-w/4,foot-h*.53,w/2,9);
  }
}
export function torch(ctx,t){fixture(ctx,t.x,t.y);}
export function scenery(ctx,cam,vw,vh,worldW,worldH,tick,region=0,seed=0){
  if(!ready)return;
  // A few non-interactive set dressing objects, deterministic by tile position.
  const S=48,x0=Math.max(2,Math.floor(cam.x/S)),x1=Math.min(Math.floor(worldW/S)-2,Math.ceil((cam.x+vw)/S));
  const y0=Math.max(3,Math.floor(cam.y/S)),y1=Math.min(Math.floor(worldH/S)-3,Math.ceil((cam.y+vh)/S));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const h=hash(x,y,933 ^ seed ^ ((region+1)*1193));
    if(h%[101,83,155,117,92,89,123,111,72][region]===0)sprite(ctx,FRAME.crate,x*S+3,y*S-12,37,55);
    if(h%[281,91,137,304,99,193,81,185,73][region]===0)sprite(ctx,FRAME.banner,x*S+10,y*S-8,30,31);
    if(h%[193,163,67,107,79,65,131,101,67][region]===0)sprite(ctx,FRAME.skull,x*S+19,y*S+15,26,26);
  }
}
function frameFor(kind,walking,elapsed){
  const row=FRAME[kind+(walking?'Run':'Idle')];
  const f=Math.floor(elapsed*(walking?9:5))%4;
  return [row[0]+f*row[2],row[1],row[2],row[3]];
}
function shadow(ctx,x,y,rx,ry,alpha=.65){
  ctx.fillStyle='rgba(0,0,0,'+alpha+')';ctx.beginPath();ctx.ellipse(x,y+2,rx,ry,0,0,Math.PI*2);ctx.fill();
}
export function hero(ctx,p,tick,gear,scale=.65){
  // v0.3.5 TEST ONLY: switch to animated pixel sprite.
  // Preserve the old vector fallback if image loading fails.
  return drawAnimatedPixelMage(ctx,p,tick,gear,scale,(c,actor,time,worn,k)=>{
    c.save();c.translate(actor.x,actor.y);c.scale(k,k);
    drawMage(c,{...actor,x:0,y:0},time,worn);
    c.restore();
  });
}
// 掉落物：图鉴图标裁成柔和椭圆（去掉方形深色底），按图鉴编号缓存。
const groundIcons=new Map();
function groundIcon(item){
  const src=iconSource(item);if(!src?.ready)return null;
  const key=item.cid;let c=groundIcons.get(key);if(c)return c;
  c=document.createElement('canvas');c.width=src.w;c.height=src.h;
  const g=c.getContext('2d');g.drawImage(src.img,src.sx,src.sy,src.w,src.h,0,0,src.w,src.h);
  g.globalCompositeOperation='destination-in';
  const m=g.createRadialGradient(src.w/2,src.h/2,src.h*.3,src.w/2,src.h/2,src.h*.56);
  m.addColorStop(0,'#000');m.addColorStop(1,'rgba(0,0,0,0)');
  g.save();g.translate(src.w/2,src.h/2);g.scale(src.w/src.h,1);g.translate(-src.w/2,-src.h/2);g.fillStyle=m;g.fillRect(0,0,src.w,src.h);g.restore();
  groundIcons.set(key,c);return c;
}
export function loot(ctx,d,tick){
  const col=d.item.setId?SET_COLOR:RARITY_COLORS[d.item.rarity]||'#bfc4c5',tier=d.item.rarity|0;
  const bob=Math.sin(tick*2.7+d.x*.01)*3;
  ctx.save();ctx.globalCompositeOperation='lighter';drawEllipseGlow(ctx,d.x,d.y,44+tier*6,24+tier*3,col,.35+tier*.06);ctx.restore();
  // 光柱：品质越高越亮越高
  // 传奇 / 暗金 / 套装：高光柱 + 脉动，远处就能看见（D2 式「出货」提示）
  const big=tier>=3,beamH=big?150+Math.sin(tick*3+d.x)*12:46+tier*12;
  const beam=ctx.createLinearGradient(0,d.y-beamH,0,d.y);
  beam.addColorStop(0,col+'00');beam.addColorStop(1,col+(tier>=2?'88':'55'));
  ctx.fillStyle=beam;ctx.fillRect(d.x-(big?4:2),d.y-beamH,big?8:4,beamH);
  if(big){ctx.save();ctx.globalCompositeOperation='lighter';drawEllipseGlow(ctx,d.x,d.y-beamH*.5,16,beamH*.5,col,.18+.08*Math.sin(tick*4));ctx.restore();}
  ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(d.x,d.y+4,20,6,0,0,Math.PI*2);ctx.stroke();
  const icon=groundIcon(d.item);
  if(icon){
    const w=50,h=w*icon.height/icon.width;
    ctx.save();ctx.imageSmoothingEnabled=true;
    ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(d.x,d.y+3,16,5,0,0,Math.PI*2);ctx.fill();
    ctx.drawImage(icon,d.x-w/2,d.y-h+4+bob,w,h);
    ctx.restore();
    return;
  }
  const frames={
    weapon:FRAME.weapon,offhand:[323,10,10,21],head:[304,336,16,16],
    robe:[368,345,16,23],shoulders:[323,41,10,22],gloves:[307,39,10,24],
    belt:[288,408,16,24],pants:[368,369,16,23],boots:[304,352,16,16],
    amulet:[304,336,16,16],ring1:[289,370,13,12],ring2:[289,370,13,12],charm:[340,129,8,30]
  };
  const f=frames[d.item.slot]||FRAME.chest;
  const w=d.item.slot==='weapon'?22:36,h=d.item.slot==='weapon'?56:39;
  sprite(ctx,f,d.x-w/2,d.y-h+bob,w,h);
}
export function drawItemIcon(canvas,item){return drawEquipmentIcon(canvas,item);}
export function preload(){return new Promise((res,rej)=>{if(ready)return res();if(failed)return rej(new Error('sprites failed'));atlas.addEventListener('load',res,{once:true});atlas.addEventListener('error',rej,{once:true});});}


// ═════════ 怪物与召唤物（v0.6，art/monsters.webp） ═════════
const mons=typeof Image==='undefined'?null:new Image();let monsReady=false;
if(mons){mons.decoding='async';mons.onload=()=>{monsReady=true;};mons.src=new URL('./art/monsters.webp',import.meta.url).href;}
export const monsterArtStatus=()=>({ready:monsReady});
const tintCache=new Map();
/** 某张怪物贴图的纯色剪影（用于受击闪白、冻结、属性蓄力发光）。 */
function silhouette(key,color){
  const id=key+color;let c=tintCache.get(id);if(c)return c;if(!monsReady)return null;
  const f=SPRITES[key];c=document.createElement('canvas');c.width=f[2];c.height=f[3];
  const g=c.getContext('2d');g.drawImage(mons,f[0],f[1],f[2],f[3],0,0,f[2],f[3]);
  g.globalCompositeOperation='source-in';g.fillStyle=color;g.fillRect(0,0,f[2],f[3]);
  tintCache.set(id,c);return c;
}
function spriteAt(ctx,key,alpha=1,bend=null){const f=SPRITES[key];if(!f||!monsReady)return;ctx.globalAlpha=alpha;if(bend)return bentDraw(ctx,mons,f[0],f[1],f[2],f[3],f[4],bend);ctx.drawImage(mons,f[0],f[1],f[2],f[3],-f[4],-f[3],f[2],f[3]);}
function silAt(ctx,key,color,alpha,bend=null){const c=silhouette(key,color),f=SPRITES[key];if(!c)return;ctx.globalAlpha=alpha;if(bend)return bentDraw(ctx,c,0,0,f[2],f[3],f[4],bend);ctx.drawImage(c,-f[4],-f[3]);}
/**
 * v0.8「分段弯曲」：把一张静态贴图横切成若干条，每条按高度给不同的位移——
 *   lean：上半身前倾 / 后仰（越往上偏得越多，像脊柱弯曲，而不是整张图旋转）；
 *   legs：脚下几条左右错开（迈步），髋部以上不动；
 *   breath：胸口以上纵向伸缩（呼吸 / 蓄力挺身）；
 *   sway：头部一点滞后摆动。
 * 单张原画也能做出「身体在动、脚在走」的效果；以后换成逐帧动作表时直接不用这个。
 */
function bentDraw(ctx,img,sx,sy,w,h,foot,b){
  const n=h>180?12:h>120?10:8,lean=b.lean||0,legs=b.legs||0,breath=b.breath||0,sway=b.sway||0;
  for(let i=0;i<n;i++){
    const y0=Math.floor(h*i/n),y1=Math.floor(h*(i+1)/n),v=1-((y0+y1)/2)/h; // v：0 脚底 → 1 头顶
    let dx=lean*h*Math.pow(v,1.5)+(v<.34?legs*(.34-v)/.34:0)+(v>.72?sway*(v-.72)/.28:0);
    const dy=-breath*h*Math.max(0,v-.42)*1.2;
    ctx.drawImage(img,sx,sy+y0,w,y1-y0+1,Math.round(-foot+dx),Math.round(-h+y0+dy),w,y1-y0+1);
  }
}
const easeOut=t=>1-(1-t)*(1-t);
/**
 * 怪物：待机呼吸；行走按 AI 类型（跳步、重踏、疾走、悬浮扑翼）；
 * 普攻先后仰蓄力（身体泛起属性色），再前冲出手；法师蓄力时手上聚光；受击闪白抖动；冻结/眩晕叠加效果。
 */
export function enemy(ctx,e,tick,k=1){
  const M=e.mon;if(!M)return;
  const T=TIER[M.tier],key=M.sprite,f=SPRITES[key];if(!f)return;
  const sc=T.scale*k*(M.tier==='boss'?1:.9);e.drawScale=sc;
  const ai=M.ai,fly=ai==='fly'||M.fly,ph=e.phase||0,frozen=e.frozen>0,col=SCHOOL_COLOR[M.school]||'#ff5a4a';
  ctx.save();ctx.translate(Math.round(e.x),Math.round(e.y));
  // 地面阴影与精英/首领光环
  const shw=f[2]*sc*.42;
  if(M.tier==='elite'||M.tier==='boss'){ctx.globalCompositeOperation='lighter';drawEllipseGlow(ctx,0,2,shw*1.5,shw*.5,M.tier==='boss'?'#c0306a':col,.35+.1*Math.sin(tick*4));ctx.globalCompositeOperation='source-over';}
  ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.ellipse(0,3,shw,shw*.28,0,0,Math.PI*2);ctx.fill();
  if(e.spawnT>0){ctx.globalCompositeOperation='lighter';drawEllipseGlow(ctx,0,0,shw*1.6,shw*.6,'#b46cff',e.spawnT*1.4);ctx.globalCompositeOperation='source-over';}
  // 动作参数（v0.8：分段弯曲——上半身前倾 / 后仰、脚下迈步、胸口呼吸；整体只做很小的位移和压缩）
  let bob=0,tilt=0,sx=1,sy=1,lunge=0,charge=0,lean=0,legs=0,breath=0,sway=0;
  const A=e.act,mo=e._mo,ww=frozen?0:walkWeight(mo,ai==='tank'?60:80),st=mo?mo.stride:ph*2.4,idle=mo?mo.idle*1.6+ph:ph*1.6;
  const heavy=ai==='tank'||M.tier==='boss',small=ai==='swarm';
  if(fly){const fp=(mo?mo.idle:ph)*2.2;bob=-14-Math.sin(fp)*5;sy=1+Math.sin(fp*3.2)*.06;sx=1-Math.sin(fp*3.2)*.04;lean=(mo?.lean||0)*.8+.05*ww;breath=Math.sin(fp*3.2)*.03;}
  else{
    // 站立：呼吸 + 头部轻微摆动；越重的怪呼吸越慢越沉
    const br=Math.sin(idle*(heavy?.7:1));breath=br*(heavy?.02:.028)*(1-ww);sway=Math.sin(idle*.53)*2*(1-ww);
    lean=Math.sin(idle*.5)*.012*(1-ww);
    // 行走：脚下左右迈步、身体前倾、每步落地下沉；重型怪步子大落地压扁，小怪碎步
    const step=Math.abs(Math.sin(st)),land=1-step;
    const amp=heavy?3:small?2.2:3.6;
    bob=-step*amp*ww;legs=Math.sin(st)*(heavy?7:small?4:6)*ww;
    lean+=(.07+(mo?.lean||0)*.6)*ww;sway+=Math.sin(st+.8)*2.5*ww;
    sy*=1-land*(heavy?.05:.03)*ww;sx*=1+land*(heavy?.04:.02)*ww;
  }
  if(A&&!frozen){
    const w=A.wind||.3,t=A.t||0,isCast=A.type==='ranged'||A.type==='cast';
    if(t<w){
      // 蓄力：先慢后快地后仰（施法则挺身抬手），身体泛起属性色
      charge=t/w;const c2=charge*charge;
      if(isCast){breath+=.05*c2;lean-=.06*c2;}else{lean-=.2*c2;breath+=.03*c2;lunge=-5*c2;legs-=4*c2;}
    }else{
      // 出手：上半身猛地前扑（带过冲），然后回弹
      const q=Math.min(1,(t-w)/.24),hit=q<.3?easeOut(q/.3):1-easeOut((q-.3)/.7);
      if(isCast){lean+=.12*hit;breath-=.03*hit;}
      else{lean+=.34*hit;lunge=hit*15;legs+=6*hit;sy*=1-.06*hit;sx*=1+.05*hit;}
    }
    if(A.type==='charge'&&t>=w){lunge=0;lean=.28;legs=Math.sin(tick*22)*7;sx*=1.04;sy*=.96;}
  }
  // 受击：上半身被打得后仰、闪白
  const dir=mo?mo.face:(e.face||1),artFace=M.face||0;
  if(e.flash>0){const h=Math.min(1,e.flash*9);lean-=.22*h;lunge-=3*h;sway-=4*h;}
  // 出生：从地面长出
  if(e.spawnT>0){const g=1-Math.min(1,e.spawnT/.5);sy*=.35+.65*easeOut(g);}
  // 原画朝左的怪，弯曲方向要跟着翻（ctx 已镜像，所以 lean 始终是「朝面向方向」）
  // 贴图空间里的「前方」：原画朝向（正面原画则用当前面向）；ctx 镜像后屏幕上始终朝面向方向弯
  const flipArt=artFace&&artFace!==dir?-1:1,fwd=artFace||dir,bend={lean:lean*fwd,legs,breath,sway:sway*fwd};
  ctx.translate(lunge*dir,bob);
  ctx.rotate(tilt*dir);
  const flip=mo?Math.abs(turnScale(mo)):1;
  ctx.scale(sx*sc*flip*flipArt,sy*sc);
  // 本体（分段弯曲）
  spriteAt(ctx,key,e.spawnT>0?1-e.spawnT:1,bend);
  ctx.globalCompositeOperation='lighter';
  if(charge>0&&A?.type!=='ranged')silAt(ctx,key,col,.35*charge+.12*Math.sin(tick*30)*charge,bend);
  if(e.flash>0)silAt(ctx,key,'#ffffff',Math.min(.85,e.flash*8),bend);
  if(frozen)silAt(ctx,key,'#5ab8ff',.45,bend);
  else if(e.slow>0)silAt(ctx,key,'#5ab8ff',.14,bend);
  if(e.poisonUntil>tick)silAt(ctx,key,'#5aff4a',.14+.06*Math.sin(tick*8),bend);
  if(e.ampUntil>tick||e.curseUntil>tick)silAt(ctx,key,'#c04060',.12,bend);
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.restore();
  // 法师/远程蓄力：手上聚光
  const H=f[3]*sc;
  if(A&&(A.type==='ranged'||A.type==='cast')&&A.t<(A.wind||.4)){
    const q=A.t/(A.wind||.4);ctx.save();ctx.globalCompositeOperation='lighter';
    drawGlow(ctx,e.x+dir*f[2]*sc*.28,e.y-H*.62+bob,10+q*20,col,.4+q*.6,true);ctx.restore();
  }
  if(frozen){ctx.save();ctx.fillStyle='#cfefffcc';ctx.beginPath();ctx.ellipse(e.x,e.y+2,shw*1.1,shw*.4,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  if(e.stun>0){ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<3;i++){const a=tick*5+i*2.1;drawGlow(ctx,e.x+Math.cos(a)*16,e.y-H-6+Math.sin(a)*5,5,'#ffe08a',.9);}ctx.restore();}
  // 血条与名字
  const top=e.y-H+bob-10;
  if(M.tier==='elite'||M.tier==='boss'||e.hp<e.maxHp){
    const bw=M.tier==='boss'?110:M.tier==='elite'?72:46;
    ctx.fillStyle='#160e12';ctx.fillRect(e.x-bw/2,top,bw,5);
    ctx.fillStyle=M.tier==='boss'?'#c982bb':M.tier==='elite'?'#e8b04a':'#ca7364';ctx.fillRect(e.x-bw/2,top,bw*Math.max(0,e.hp/e.maxHp),5);
  }
  if(M.tier==='elite'){
    ctx.save();ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#000c';
    const label=M.name+' · '+M.mods.map(m=>ELITE_MOD_NAMES[m]).join('/');
    ctx.strokeText(label,e.x,top-5);ctx.fillStyle='#f0c060';ctx.fillText(label,e.x,top-5);ctx.restore();
  }
}
/** 死亡：倒地（朝受击反方向旋转压扁）、褪色、溶解成火星。 */
export function enemyDeath(ctx,e,t,k=1){
  const M=e.mon;if(!M||!monsReady)return;const f=SPRITES[M.sprite];
  const sc=TIER[M.tier].scale*k*(M.tier==='boss'?1:.9),q=Math.min(1,t/.45),dir=e.face||1,artFace=M.face||0;
  ctx.save();ctx.translate(e.x,e.y);ctx.rotate(-dir*Math.PI/2*easeOut(q)*(M.ai==='fly'||M.fly?.3:.85));
  ctx.scale(sc*(artFace&&artFace!==dir?-1:1),sc*(1-q*.25));
  // 先被打得上身后折，再整个倒下
  const fwd=artFace||dir,bend={lean:-.3*Math.min(1,t/.12)*(1-q*.6)*fwd,legs:3*q,breath:-.04*q,sway:0};
  spriteAt(ctx,M.sprite,1-q*.35,bend);
  ctx.globalCompositeOperation='lighter';silAt(ctx,M.sprite,'#ff8a4a',(1-q)*.5,bend);
  ctx.restore();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}
/** 尸体：倒卧的暗色剪影，逐渐淡出（死灵法师可以利用）。 */
export function corpse(ctx,c,k=1){
  if(!monsReady||!c.sprite||!SPRITES[c.sprite])return;
  const tier=c.sprite.replace(/\d+$/,''),sc=(TIER[tier]?.scale||.62)*k*.9;
  ctx.save();ctx.translate(c.x,c.y);ctx.rotate(-(c.face||1)*Math.PI/2*.85);ctx.scale(sc,sc*.75);
  spriteAt(ctx,c.sprite,Math.min(.6,c.life/3));
  ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=.55*Math.min(1,c.life/3);ctx.fillStyle='#10060a';const f=SPRITES[c.sprite];ctx.fillRect(-f[4],-f[3],f[2],f[3]);
  ctx.restore();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
}
// ───── 召唤物 ─────
const ALLY_ART={skeleton:'summon0',skelarcher:'summon1',skelmage:'summon2',claygolem:'summon3',bloodgolem:'summon3',firegolem:'summon3',
  revive:'summon4',wolf:'summon5',direwolf:'summon6',raven:'summon7',spirit_oak:'summon8',grizzly:'summon9'};
const ALLY_TINT={claygolem:'#b08a5c',bloodgolem:'#ff3a3a',firegolem:'#ff8a2a',revive:'#7dff9a'};
// v0.8：召唤物与人物一样高（约 124 像素），魔像、树人、灰熊比人物略大（图集高 140）
const ALLY_SCALE={skeleton:.9,skelarcher:.9,skelmage:.92,claygolem:1.08,bloodgolem:1.08,firegolem:1.08,revive:.95,wolf:.8,direwolf:.92,raven:.62,spirit_oak:1.08,grizzly:1.1,valkyrie:.6};
/** 召唤物：从地面浮现、行走起伏、攻击前冲、乌鸦扑翼、怨灵漂浮、到期淡出。 */
export function ally(ctx,a,U,tick,k=1){
  const key=ALLY_ART[a.unit]||(a.unit==='spirit'&&a.skill==='橡木智者'?'summon8':null);
  if(!key||!monsReady)return legacyAlly(ctx,a,U,tick,k);
  const f=SPRITES[key],sc=(ALLY_SCALE[a.unit]||ALLY_SCALE.spirit_oak)*k,age=a.dur-a.life,born=Math.min(1,age/.45),fade=Math.min(1,a.life/.8);
  const dir=a._mo?a._mo.face:(a.facingLeft?-1:1),artFace={summon0:-1,summon1:1,summon4:1,summon5:1,summon6:1,summon7:1,summon9:1}[key]||1;
  const fly=a.unit==='raven'||a.unit==='revive',ph=a.phase||0;
  let bob=0,tilt=0,sx=1,sy=1,lunge=0;
  const mo=a._mo,ww=walkWeight(mo,70),stp=mo?mo.stride:ph*2.2;
  if(a.unit==='raven'){bob=-46-Math.sin(ph*1.5)*6;const flap=Math.sin(ph*4);sy=.8+Math.abs(flap)*.3;sx=1+flap*.05;tilt=(mo?.lean||0)*2;}
  else if(a.unit==='revive'){bob=-10-Math.sin(ph*1.2)*5;sx=1+Math.sin(ph*1.7)*.04;tilt=(mo?.lean||0)*1.5;}
  else{
    const br=Math.sin(ph*.7);sy=1+br*.025*(1-ww);
    const step=Math.abs(Math.sin(stp)),land=1-step,big=a.unit==='grizzly'||a.unit==='claygolem'||a.unit==='bloodgolem'||a.unit==='firegolem';
    bob=-step*(big?3:4)*ww;tilt=(Math.sin(stp)*(big?.035:.06)+(mo?.lean||0))*ww;sy*=1-land*.04*ww;sx*=1+land*.03*ww;
  }
  // v0.8：地面单位也用分段弯曲（迈步、前倾、攻击前扑）
  const ground=!fly,bend={lean:0,legs:0,breath:0,sway:0};
  if(ground){const br=Math.sin(ph*.7);bend.breath=br*.025*(1-ww);bend.legs=Math.sin(stp)*5*ww;bend.lean=.07*ww;bend.sway=Math.sin(stp+.8)*2*ww;tilt*=.3;}
  if(a.atkAnim>0){const q=1-a.atkAnim/.25,wind=q<.3?q/.3:0,hit=q>=.3?Math.sin((q-.3)/.7*Math.PI):0;
    lunge=-4*wind*wind+hit*14;if(ground){bend.lean+=-.16*wind*wind+.3*hit;bend.legs+=5*hit;}else tilt+=-.1*wind*wind+.14*hit;sy*=1+.04*wind-.05*hit;}
  bend.lean*=artFace;bend.sway*=artFace;
  ctx.save();ctx.translate(Math.round(a.x),Math.round(a.y));
  ctx.globalCompositeOperation='lighter';drawEllipseGlow(ctx,0,2,26,10,U.color||U.tint||'#7dff9a',.3*fade);ctx.globalCompositeOperation='source-over';
  if(!fly){ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.ellipse(0,3,f[2]*sc*.35,f[2]*sc*.1,0,0,Math.PI*2);ctx.fill();}
  ctx.translate(lunge*dir,bob*(fly?1:born));ctx.rotate(tilt*dir);
  ctx.scale(sx*sc*(a._mo?Math.abs(turnScale(a._mo)):1)*(artFace!==dir?-1:1),sy*sc);
  // 出场：自下而上浮现
  if(born<1){ctx.save();ctx.beginPath();ctx.rect(-f[4]-4,-f[3]*born,f[2]+8,f[3]*born+4);ctx.clip();}
  spriteAt(ctx,key,fade*(a.unit==='revive'?.82:1),ground?bend:null);
  if(born<1)ctx.restore();
  ctx.globalCompositeOperation='lighter';
  if(ALLY_TINT[a.unit])silAt(ctx,key,ALLY_TINT[a.unit],.28,ground?bend:null);
  if(born<1)silAt(ctx,key,'#d8b0ff',(1-born)*.7,ground?bend:null);
  ctx.restore();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  if(a.hp<a.maxHp&&!U.turret){const top=a.y-f[3]*sc+bob-6;ctx.fillStyle='#0d1410';ctx.fillRect(a.x-20,top,40,4);ctx.fillStyle='#6fdc7a';ctx.fillRect(a.x-20,top,40*Math.max(0,a.hp/a.maxHp),4);}
}
// 没有专属贴图的随从（女武神、影分身、诱饵、陷阱、图腾、灵体）
function legacyAlly(ctx,a,U,tick,scale){
  const fade=Math.min(1,a.life/1.2);
  ctx.save();ctx.translate(Math.round(a.x),Math.round(a.y));
  ctx.globalCompositeOperation='lighter';drawEllipseGlow(ctx,0,2,26,10,U.color||U.tint||'#7dff9a',.35*fade);ctx.globalCompositeOperation='source-over';
  ctx.globalAlpha=fade*(U.alpha||1);
  if(U.hero){ctx.restore();ctx.save();ctx.globalAlpha=fade*(U.alpha||.55);drawHero(ctx,{x:a.x,y:a.y,cls:U.hero,angle:a.facingLeft?Math.PI:0,moving:a.moving,walk:a.phase,cast:0,invuln:0,swing:a.atkAnim>0?{t0:tick-(.25-a.atkAnim),dur:.25}:null},tick,{},scale*.62);ctx.restore();return;}
  if(a.unit==='valkyrie'&&monsReady){ctx.restore();ctx.save();ctx.globalAlpha=fade*.85;drawHero(ctx,{x:a.x,y:a.y,cls:'amazon',angle:a.facingLeft?Math.PI:0,moving:a.moving,walk:a.phase,cast:0,invuln:0,swing:a.atkAnim>0?{t0:tick-(.25-a.atkAnim),dur:.25}:null},tick,{},scale*.7);
    ctx.globalCompositeOperation='lighter';drawGlow(ctx,a.x,a.y-60,30,'#ffe08a',.35);ctx.restore();return;}
  const c=U.color||'#9fd8ff',pulse=.6+.4*Math.sin(tick*6+(a.phase||0));
  ctx.globalCompositeOperation='lighter';
  if(U.device==='spirit'){drawGlow(ctx,0,-40,26,c,.6*pulse);drawGlow(ctx,0,-40,10,'#ffffff',.9,true);for(let i=0;i<3;i++){const t=tick*2+i*2.1;drawGlow(ctx,Math.cos(t)*16,-40+Math.sin(t)*8,4,c,.8);}}
  else if(U.device==='vine'){for(let i=0;i<5;i++){const t=i*1.26+Math.sin(tick*2+i)*.2;drawGlow(ctx,Math.cos(t)*14,-6-Math.abs(Math.sin(t))*18,6,c,.6*pulse);}drawGlow(ctx,0,-14,14,c,.4);}
  else{ctx.globalCompositeOperation='source-over';ctx.fillStyle='#2a2c34';ctx.fillRect(-8,-26,16,26);ctx.fillStyle=U.device==='totem'?'#8a6a48':'#5a5e68';ctx.fillRect(-6,-34,12,10);
    ctx.globalCompositeOperation='lighter';drawGlow(ctx,0,-30,16,c,.7*pulse);}
  ctx.restore();
}
