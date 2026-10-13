import {drawMage} from './mage-portrait.js';
import {drawAnimatedPixelMage} from './pixel-mage-demo.js';
import {drawEquipmentIcon} from './equipment-icons.js';
/**
 * 余烬纪事 · 2D 美术层
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
  const pulse=.93+Math.sin(performance.now()*.004+x)*.07;
  gradientSpot(ctx,0,-15,120*pulse,'#fca45242','#d7632000');
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
    const v=hash(x,y,501 ^ seed ^ ((region+1)*733)),tex=FRAME.floor[(v+region*2)%8];
    sprite(ctx,[tex[0],tex[1],16,16],x*S,y*S,S+1,S+1);
    // Keep pixel-art intact; irregular soot patches and scattered rubble are transparent overlays.
    if(v%15===0){ctx.fillStyle='#090d1180';ctx.fillRect(x*S+7,y*S+7,18,6);}
    if(v%21===0)sprite(ctx,FRAME.skull,x*S+12,y*S+12,25,25);
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
let prevHeroWalk=0;
export function enemy(ctx,e,tick,scale=.72){
  if(e.kind==='spider'){spiderEnemy(ctx,e,tick,scale);return;}
  const cfg=e.kind==='boss'?{type:'boss',width:136,height:154,off:-123}
    :e.kind==='brute'?{type:'brute',width:113,height:127,off:-100}
    :e.kind==='archer'?{type:'archer',width:64,height:93,off:-76}
    :e.kind==='cultist'?{type:'cultist',width:66,height:94,off:-76}
    :{type:'wretch',width:59,height:59,off:-47};
  ctx.save();ctx.translate(Math.round(e.x),Math.round(e.y));ctx.scale(scale,scale);
  if(e.kind==='boss')gradientSpot(ctx,0,-45,117,'#a64d8933','#983b8600');
  shadow(ctx,0,6,cfg.width*.36,12,.73);
  if(ready){
    const previous=prevEnemyPos.get(e.id);
    const dx=e.x-(previous?.x ?? e.x),dy=e.y-(previous?.y ?? e.y);
    const walking=Math.hypot(dx,dy)>.5;
    const frame=frameFor(cfg.type,walking,tick+e.phase*.1);
    // Boss eye line and oversized arms remain part of the source animation.
    sprite(ctx,frame,-cfg.width/2,cfg.off,cfg.width,cfg.height);
    if(e.slow>0){ctx.fillStyle='#93d9f027';ctx.fillRect(-cfg.width/2,cfg.off,cfg.width,cfg.height);}
  }else{ctx.fillStyle='#92665e';ctx.fillRect(-17,-37,34,37);}
  if(e.hp<e.maxHp){
    const barWidth=e.kind==='boss'?118:e.kind==='brute'?74:58;
    ctx.fillStyle='#160e12';ctx.fillRect(-barWidth/2,cfg.off-13,barWidth,6);
    ctx.fillStyle=e.kind==='boss'?'#c982bb':'#ca7364';ctx.fillRect(-barWidth/2,cfg.off-13,barWidth*Math.max(0,e.hp/e.maxHp),6);
  }
  if(e.slow>0){ctx.strokeStyle='#92dafa8c';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,7,cfg.width*.41,12,0,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
  prevEnemyPos.set(e.id,{x:e.x,y:e.y});
}
const prevEnemyPos=new Map();
function spiderEnemy(ctx,e,tick,scale=.72){
  ctx.save();ctx.translate(Math.round(e.x),Math.round(e.y));ctx.scale(scale,scale);
  const step=Math.sin(tick*17+e.phase)*7;
  ctx.fillStyle='#05070bb9';ctx.beginPath();ctx.ellipse(0,13,37,13,0,0,Math.PI*2);ctx.fill();
  ctx.lineWidth=5;ctx.strokeStyle='#483747';
  for(const side of [-1,1])for(let leg=0;leg<4;leg++){
    const angle=(leg-1.5)*.33, reach=22+leg*4;
    const x0=side*11,y0=-12+leg*4;
    ctx.beginPath();ctx.moveTo(x0,y0);
    ctx.lineTo(side*reach,-23+leg*7+step*(leg%2?1:-1));
    ctx.lineTo(side*(reach+20),-4+leg*9);ctx.stroke();
  }
  ctx.fillStyle='#48232d';ctx.beginPath();ctx.ellipse(0,-8,22,17,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#202127';ctx.beginPath();ctx.ellipse(0,-26,13,14,0,0,Math.PI*2);ctx.fill();
  for(const x of [-8,8]){ctx.fillStyle='#fc613d';ctx.beginPath();ctx.arc(x,-31,3,0,Math.PI*2);ctx.fill();}
  if(e.hp<e.maxHp){ctx.fillStyle='#160e12';ctx.fillRect(-25,-54,50,5);ctx.fillStyle='#e06e62';ctx.fillRect(-25,-54,50*Math.max(0,e.hp/e.maxHp),5);}
  ctx.restore();
}
export function loot(ctx,d,tick){
  const col=['#bcc6d0','#72c2f3','#f5bb69','#ee9566','#88d8a0'][d.item.rarity]||'#bfc4c5';
  const bob=Math.sin(tick*2.7+d.x*.01)*4;
  gradientSpot(ctx,d.x,d.y,57,col+'67',col+'00');
  ctx.globalAlpha=.44;ctx.fillStyle=col;ctx.fillRect(d.x-2,d.y-68,4,60);ctx.globalAlpha=1;
  const frames={
    weapon:FRAME.weapon,offhand:[323,10,10,21],head:[304,336,16,16],
    robe:[368,345,16,23],shoulders:[323,41,10,22],gloves:[307,39,10,24],
    belt:[288,408,16,24],pants:[368,369,16,23],boots:[304,352,16,16],
    amulet:[304,336,16,16],ring1:[289,370,13,12],ring2:[289,370,13,12],charm:[340,129,8,30]
  };
  const f=frames[d.item.slot]||FRAME.chest;
  const w=d.item.slot==='weapon'?22:36,h=d.item.slot==='weapon'?56:39;
  sprite(ctx,f,d.x-w/2,d.y-h+bob,w,h);
  ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(d.x,d.y+5,w/2,6,0,0,Math.PI*2);ctx.stroke();
}
export function drawItemIcon(canvas,item){return drawEquipmentIcon(canvas,item);}
export function preload(){return new Promise((res,rej)=>{if(ready)return res();if(failed)return rej(new Error('sprites failed'));atlas.addEventListener('load',res,{once:true});atlas.addEventListener('error',rej,{once:true});});}
