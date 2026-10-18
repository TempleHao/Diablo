import {ICON_SIZE} from './equipment-catalog.js';
import {catalogEntry} from './systems.js';
// Hand-drawn, type-correct fantasy equipment silhouettes.
// Original Canvas vector art: no external sprites or third-party licensing.
const rarityColors=['#c9c6bd','#5aa6ff','#b86cff','#ff8c2e','#dcb25e'];
const colors={metal:'#bdc4c6',edge:'#364048',gold:'#b88743',leather:'#70503a',cloth:'#763e42',ember:'#f4a65c',gem:'#63c9e7'};
const path=(ctx,pts,close=true)=>{ctx.beginPath();ctx.moveTo(...pts[0]);for(const p of pts.slice(1))ctx.lineTo(...p);if(close)ctx.closePath();};
const fill=(ctx,pts,color,stroke=colors.edge)=>{path(ctx,pts);ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.3;ctx.stroke();}};
const ellipse=(ctx,x,y,rx,ry,fillColor,stroke)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fillColor;ctx.fill();if(stroke){ctx.lineWidth=2;ctx.strokeStyle=stroke;ctx.stroke();}};
function staff(ctx,name){
  // Always a staff/wand silhouette: wooden shaft, metal crown, glowing gem.
  ctx.lineWidth=4;ctx.lineCap='round';ctx.strokeStyle='#3b2724';ctx.beginPath();ctx.moveTo(17,42);ctx.lineTo(28,10);ctx.stroke();
  ctx.strokeStyle='#9b7655';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(16,40);ctx.lineTo(27,11);ctx.stroke();
  fill(ctx,[[20,14],[17,6],[25,10],[31,4],[34,14],[29,18]],colors.gold);
  ellipse(ctx,27,13,4.5,6,name.includes('霜')?colors.gem:colors.ember,'#f4d09b');
}
function sword(ctx){fill(ctx,[[17,12],[25,4],[30,7],[22,27],[19,30],[16,26]],colors.metal);fill(ctx,[[12,27],[17,25],[27,29],[25,33]],colors.gold);fill(ctx,[[17,30],[21,31],[16,44],[12,43]],colors.leather);ellipse(ctx,14,43,2,2,colors.gold);}
function dagger(ctx){fill(ctx,[[20,19],[28,5],[31,8],[26,27]],colors.metal);fill(ctx,[[17,27],[27,27],[27,31],[17,31]],colors.gold);fill(ctx,[[20,31],[24,31],[22,43],[18,42]],colors.leather);}
function shield(ctx){fill(ctx,[[24,5],[40,11],[38,29],[24,43],[10,29],[8,11]],colors.metal,colors.gold);fill(ctx,[[24,12],[33,15],[32,28],[24,35],[16,28],[15,15]],'#5a5861');fill(ctx,[[21,14],[27,14],[27,22],[34,22],[34,27],[27,27],[27,34],[21,34],[21,27],[14,27],[14,22],[21,22]],colors.gold);}
function book(ctx){fill(ctx,[[9,12],[23,9],[39,12],[39,40],[24,37],[9,41]],'#654344',colors.gold);fill(ctx,[[12,14],[23,13],[23,35],[12,38]],'#8f7770');fill(ctx,[[25,13],[36,15],[36,36],[25,34]],'#8e6256');ellipse(ctx,30,24,4,5,colors.gem,colors.gold);}
function helmet(ctx){fill(ctx,[[8,29],[11,15],[17,8],[24,5],[31,8],[37,15],[40,29],[33,36],[14,36]],colors.metal,colors.gold);fill(ctx,[[15,25],[33,25],[30,33],[18,33]],'#121d24');fill(ctx,[[23,8],[26,8],[29,26],[23,24]],'#8b6748');}
function shoulders(ctx){fill(ctx,[[4,18],[9,10],[18,7],[22,14],[18,32],[8,35],[4,28]],colors.metal,colors.gold);fill(ctx,[[26,14],[30,7],[39,10],[44,18],[44,28],[40,35],[30,32]],colors.metal,colors.gold);fill(ctx,[[19,24],[29,24],[28,38],[20,38]],colors.leather);}
function chest(ctx){fill(ctx,[[13,6],[21,10],[27,10],[36,6],[42,19],[36,43],[12,43],[6,19]],'#8b8583',colors.gold);fill(ctx,[[18,13],[30,13],[33,29],[24,37],[15,29]],'#5f3333',colors.gold);fill(ctx,[[20,17],[28,17],[28,25],[20,25]],colors.metal);}
function gloves(ctx){fill(ctx,[[8,9],[15,8],[17,18],[19,9],[24,9],[26,23],[22,39],[11,39],[5,27]],colors.leather,colors.gold);fill(ctx,[[27,11],[35,8],[40,14],[43,28],[37,40],[27,38],[27,25]],colors.metal,colors.gold);}
function belt(ctx){fill(ctx,[[5,16],[43,16],[43,31],[5,31]],colors.leather,colors.gold);fill(ctx,[[17,14],[31,14],[31,33],[17,33]],colors.metal,colors.gold);fill(ctx,[[21,18],[27,18],[27,29],[21,29]],colors.edge);}
function pants(ctx){fill(ctx,[[13,7],[35,7],[39,20],[33,43],[24,43],[23,26],[20,43],[11,43],[9,20]],'#56555e',colors.gold);fill(ctx,[[13,10],[35,10],[35,16],[13,16]],colors.leather);}
function boots(ctx){fill(ctx,[[9,8],[22,8],[23,29],[28,35],[28,42],[5,42],[5,34],[10,28]],colors.leather,colors.gold);fill(ctx,[[27,8],[40,8],[41,28],[45,34],[44,42],[25,42],[25,32],[29,27]],'#81716b',colors.gold);}
function ring(ctx){ellipse(ctx,24,26,14,14,colors.gold,'#e8c77a');ellipse(ctx,24,26,8,8,'#1b1b26','#593f2b');fill(ctx,[[17,12],[24,5],[31,12],[29,19],[20,19]],colors.gem,colors.gold);}
function amulet(ctx){ctx.strokeStyle=colors.gold;ctx.lineWidth=3;ctx.beginPath();ctx.arc(24,15,16,.15,Math.PI-.15);ctx.stroke();fill(ctx,[[24,18],[34,27],[24,42],[14,27]],colors.gem,colors.gold);ellipse(ctx,24,28,3,5,'#e1e7db');}
function relic(ctx){fill(ctx,[[24,4],[34,16],[37,30],[24,44],[11,30],[14,16]],'#67565b',colors.gold);fill(ctx,[[24,11],[31,24],[24,36],[17,24]],colors.ember,colors.gold);}
function resolve(item){
 const n=String(item?.name||'');
 if(item?.slot==='weapon')return n.includes('剑')?'sword':n.includes('匕')?'dagger':'staff';
 if(item?.slot==='offhand')return n.includes('盾')?'shield':'book';
 if(item?.slot?.startsWith('ring'))return 'ring';
 return {head:'helmet',shoulders:'shoulders',robe:'chest',gloves:'gloves',belt:'belt',pants:'pants',boots:'boots',amulet:'amulet',charm:'relic'}[item?.slot]||'relic';
}
const shapes={staff,sword,dagger,shield,book,helmet,shoulders,chest,gloves,belt,pants,boots,ring,amulet,relic};
export function iconType(item){return resolve(item);}
// 旧版程序绘制图标：只用于旧存档里的腿甲/遗物（图鉴里没有对应图标）。
export function drawLegacyIcon(canvas,item){
 const ctx=canvas.getContext('2d');
 const size=80;canvas.width=size;canvas.height=size;
 const name=String(item?.name||''),tier=Math.max(0,Math.min(4,Math.floor(item?.rarity||0)));
 const frame=rarityColors[tier];
 const cold=/霜|冰|雪|寒|蓝/.test(name),fire=/火|焰|烬|炎/.test(name);
 const glow=cold?'#58caff':fire?'#fa7b3b':tier>=3?'#bd82f5':frame;
 ctx.clearRect(0,0,size,size);
 ctx.save();ctx.scale(size/48,size/48);
 const stone=ctx.createLinearGradient(0,0,48,48);
 stone.addColorStop(0,'#4c4540');stone.addColorStop(.23,'#1e252e');stone.addColorStop(.64,'#111824');stone.addColorStop(1,'#090b13');
 ctx.fillStyle=stone;ctx.fillRect(0,0,48,48);
 // Vignette, hammered metal, microscopic chisel chips — no repeated stock tiles.
 const halo=ctx.createRadialGradient(24,21,2,24,24,30);
 halo.addColorStop(0,glow+'42');halo.addColorStop(.55,glow+'0b');halo.addColorStop(1,'#080a1100');
 ctx.fillStyle=halo;ctx.fillRect(0,0,48,48);
 for(let n=0;n<27;n++){
   const x=(n*23+Math.floor(tier*9))%43+3,y=(n*17+11)%43+3;
   ctx.fillStyle=n%3===0?'#dedad314':'#0507093b';
   ctx.fillRect(x,y,(n%4)+.6,.6);
 }
 ctx.strokeStyle='#101116';ctx.lineWidth=4;ctx.strokeRect(2,2,44,44);
 ctx.strokeStyle=frame;ctx.lineWidth=1.5;ctx.strokeRect(2.7,2.7,42.6,42.6);
 ctx.strokeStyle='#f7e6c048';ctx.lineWidth=.7;ctx.strokeRect(5.1,5.1,37.8,37.8);
 // Nine-slot ornament: corner brackets and forged ornamental rivets.
 for(const [x,y] of [[4.5,4.5],[43.5,4.5],[4.5,43.5],[43.5,43.5]]){
   ctx.fillStyle=frame;ctx.beginPath();ctx.arc(x,y,1.5,0,7);ctx.fill();
 }
 ctx.save();ctx.shadowColor='#02040d';ctx.shadowOffsetX=2.2;ctx.shadowOffsetY=3.1;ctx.shadowBlur=2.4;
 const kind=resolve(item);
 shapes[kind](ctx,name);
 ctx.restore();
 // A physical specular highlight gives the curved gear silhouette volume.
 ctx.save();ctx.globalCompositeOperation='screen';
 const glint=ctx.createLinearGradient(0,3,40,34);
 glint.addColorStop(0,'#fcebd839');glint.addColorStop(.3,'#ffffff07');glint.addColorStop(1,'#00000000');
 ctx.fillStyle=glint;ctx.fillRect(7,7,34,34);
 ctx.restore();
 if(tier>=2){
  ctx.strokeStyle=glow+'b0';ctx.lineWidth=.8;
  ctx.beginPath();ctx.moveTo(8,8);ctx.lineTo(15,8);ctx.moveTo(33,40);ctx.lineTo(40,40);ctx.stroke();
 }
 ctx.restore();
 return resolve(item);
}

// v0.4：黑铁遗珍图鉴图标。每个品质一张 10 列图集（art/equipment/N|M|E|L|U.webp）。
const CODES='NMELU',atlases=[],pending=new Set();
function atlas(r){
  if(typeof Image==='undefined')return null;
  if(!atlases[r]){
    const img=new Image();img.decoding='async';
    img.onload=()=>{for(const job of [...pending])if(job.r===r){pending.delete(job);if(job.canvas.isConnected!==false)paint(job.canvas,job.item,img);}};
    img.src=new URL('./art/equipment/'+CODES[r]+'.webp',import.meta.url).href;
    atlases[r]=img;
  }
  return atlases[r];
}
export function iconSource(item){
  const entry=catalogEntry(item);if(!entry)return null;
  const img=atlas(entry.r);if(!img)return null;
  const {w,h,cols}=ICON_SIZE;
  return {img,sx:(entry.i%cols)*w,sy:Math.floor(entry.i/cols)*h,w,h,ready:img.complete&&img.naturalWidth>0};
}
function paint(canvas,item,img){
  const src=iconSource(item);if(!src)return;
  const ctx=canvas.getContext('2d'),S=canvas.width;
  const tier=Math.max(0,Math.min(4,item.rarity|0)),frame=rarityColors[tier];
  ctx.clearRect(0,0,S,S);
  ctx.fillStyle='#0b0e14';ctx.fillRect(0,0,S,S);
  const g=ctx.createRadialGradient(S/2,S*.52,2,S/2,S/2,S*.62);
  g.addColorStop(0,frame+(tier>=2?'40':'22'));g.addColorStop(1,'#0b0e1400');
  ctx.fillStyle=g;ctx.fillRect(0,0,S,S);
  const dw=S-6,dh=dw*src.h/src.w;
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,src.sx,src.sy,src.w,src.h,3,(S-dh)/2,dw,dh);
  ctx.strokeStyle='#05060a';ctx.lineWidth=3;ctx.strokeRect(1.5,1.5,S-3,S-3);
  ctx.strokeStyle=frame;ctx.lineWidth=tier>=3?2.5:1.5;ctx.strokeRect(2.5,2.5,S-5,S-5);
}
/** 画装备图标；图鉴图标未加载完时先画占位，加载完自动补画。返回图标类型。 */
export function drawEquipmentIcon(canvas,item){
  if(!item||item.legacy||!catalogEntry(item))return drawLegacyIcon(canvas,item);
  canvas.width=96;canvas.height=96;
  const src=iconSource(item);
  if(src.ready)paint(canvas,item,src.img);
  else{
    const ctx=canvas.getContext('2d');ctx.fillStyle='#0b0e14';ctx.fillRect(0,0,96,96);
    ctx.strokeStyle=rarityColors[item.rarity|0];ctx.strokeRect(2.5,2.5,91,91);
    pending.add({canvas,item,r:catalogEntry(item).r});
  }
  return 'catalog';
}
