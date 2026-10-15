// Hand-drawn, type-correct fantasy equipment silhouettes.
// Original Canvas vector art: no external sprites or third-party licensing.
const rarityColors=['#B7B7B7','#3293FF','#AF5CFF','#FF8928','#D8AA53'];
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
function axe(ctx){ctx.strokeStyle=colors.leather;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(16,43);ctx.lineTo(29,8);ctx.stroke();fill(ctx,[[27,8],[37,8],[43,15],[35,22],[27,19],[21,15]],colors.metal,colors.gold);}
function hammer(ctx){ctx.strokeStyle=colors.leather;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(18,43);ctx.lineTo(27,19);ctx.stroke();fill(ctx,[[13,8],[37,8],[41,18],[34,24],[13,22],[8,16]],colors.metal,colors.gold);}
function spear(ctx){ctx.strokeStyle='#7d5a43';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(11,43);ctx.lineTo(32,11);ctx.stroke();fill(ctx,[[31,12],[36,4],[41,8],[35,16]],colors.metal,colors.gold);}
function bow(ctx){ctx.strokeStyle=colors.gold;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(15,6);ctx.quadraticCurveTo(42,24,15,43);ctx.stroke();ctx.strokeStyle='#d9d1bd';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(15,6);ctx.lineTo(15,43);ctx.stroke();ctx.beginPath();ctx.moveTo(10,25);ctx.lineTo(38,22);ctx.stroke();fill(ctx,[[38,22],[31,18],[32,25]],colors.metal);}
function crossbow(ctx){ctx.strokeStyle=colors.leather;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(14,39);ctx.lineTo(31,15);ctx.stroke();ctx.strokeStyle=colors.gold;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(7,13);ctx.quadraticCurveTo(24,29,42,13);ctx.stroke();ctx.strokeStyle='#d9d1bd';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(8,13);ctx.lineTo(41,13);ctx.stroke();fill(ctx,[[40,13],[33,9],[34,17]],colors.metal);}
function quiver(ctx){fill(ctx,[[15,15],[34,12],[38,38],[20,43]],colors.leather,colors.gold);for(let i=0;i<4;i++){ctx.strokeStyle='#c8b28a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(18+i*5,8);ctx.lineTo(22+i*4,29);ctx.stroke();fill(ctx,[[16+i*5,8],[20+i*5,4],[21+i*5,9]],colors.metal,null);}}
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
 const n=String(item?.name||''),sub=String(item?.subtype||'');
 if(item?.slot==='weapon'){
   if(/弓/.test(sub)||(/弓/.test(n)&&!/弩/.test(n)))return 'bow';
   if(/弩/.test(sub)||/弩/.test(n))return 'crossbow';
   if(/斧/.test(sub)||/斧/.test(n))return 'axe';
   if(/锤|钉锤|链锤|棍棒/.test(sub)||/锤|狼牙棒/.test(n))return 'hammer';
   if(/枪|矛|戟/.test(sub)||/枪|矛|戟/.test(n))return 'spear';
   if(/匕|投掷刀/.test(sub)||/匕|飞刀|投刃/.test(n))return 'dagger';
   if(/剑|弯刀/.test(sub)||/剑|弯刀/.test(n))return 'sword';
   return 'staff';
 }
 if(item?.slot==='offhand'){
   if(/箭囊/.test(sub)||/箭囊/.test(n))return 'quiver';
   if(/盾/.test(sub)||/盾/.test(n))return 'shield';
   return 'book';
 }
 if(item?.slot?.startsWith('ring'))return 'ring';
 return {head:'helmet',shoulders:'shoulders',robe:'chest',gloves:'gloves',belt:'belt',pants:'pants',boots:'boots',amulet:'amulet',charm:'relic'}[item?.slot]||'relic';
}
const shapes={staff,sword,dagger,axe,hammer,spear,bow,crossbow,quiver,shield,book,helmet,shoulders,chest,gloves,belt,pants,boots,ring,amulet,relic};
export function iconType(item){return resolve(item);}
export function drawEquipmentIcon(canvas,item){
 const ctx=canvas.getContext('2d');canvas.width=48;canvas.height=48;
 const r=Math.max(0,Math.min(4,Math.floor(item?.rarity||0)));
 const border=rarityColors[r],grad=ctx.createLinearGradient(0,0,48,48);
 grad.addColorStop(0,'#38302d');grad.addColorStop(.5,'#131922');grad.addColorStop(1,'#080d15');
 ctx.fillStyle=grad;ctx.fillRect(0,0,48,48);
 ctx.strokeStyle=border;ctx.lineWidth=1.6;ctx.strokeRect(2,2,44,44);
 ctx.fillStyle=border+'22';ctx.fillRect(5,5,38,38);
 ctx.save();ctx.shadowColor=border;ctx.shadowBlur=r>=3?7:2;
 shapes[resolve(item)](ctx,String(item?.name||''));ctx.restore();
 ctx.strokeStyle='#ffffff20';ctx.strokeRect(6,6,36,36);
 return resolve(item);
}
