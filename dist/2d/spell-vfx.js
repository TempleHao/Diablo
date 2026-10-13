// Layered, impact-responsive magical effects for the playable 2D demo.
// World-space physics is elsewhere. This module is visual only.
const COLORS={
 fire:['#fff1b7','#ffad48','#ff5e24','#ae2632'],inferno:['#ffe5a0','#fd7b35','#b8341c'],
 ice:['#f3ffff','#b0eaff','#6abdf3','#538be8'],nova:['#e9ffff','#99e6ff','#4aa7ee'],
 storm:['#e1ffff','#83c8ff','#6881ff'],ward:['#f4ffff','#88c6ff','#6e8bdd'],
 chain:['#f9f4ff','#c8a0ff','#9669ed'],arcane:['#e2cfff','#9d77f1','#7144cb'],
 meteor:['#ffecb5','#ff842a','#bc2e18'],blink:['#f8daff','#aa7af7','#5f54c9'],
 heal:['#f2ffd9','#b7ec9a','#68cb82'],armor:['#d8faff','#8ccbea','#6196d4'],
 shard:['#e3ffff','#a9e1ff','#71bcfa']
};
let counter=0;
export function emitVfx(target,type,x,y,{max=18,angle=0}={}){
 const key=COLORS[type]?type:type==='flame'?'fire':'arcane';
 max=Math.max(3,Math.min(44,max|0));
 const particles=[];
 for(let i=0;i<max;i++){
   const seed=++counter*97+i*181,the=seed*2.3999632297+angle;
   const radius=11+(i%6)*4,speed=25+(seed%95),life=.38+(i%7)*.065;
   particles.push({dx:Math.cos(the)*radius,dy:Math.sin(the)*radius,
     vx:Math.cos(the)*speed,vy:Math.sin(the)*speed-(key==='fire'||key==='meteor'?35:8),
     life,max:life,size:1.2+(i%4)*.8,idx:i%COLORS[key].length});
 }
 target.push({type:key,x,y,age:0,life:.75,particles});
 // Cap particle work on mid-tier phones, even with 36 living enemies.
 while(target.length>44)target.shift();
}
export function tickVfx(fx,dt){
 for(let n=fx.length-1;n>=0;n--){
   const e=fx[n];e.age+=dt;e.life-=dt;
   for(const p of e.particles){p.life-=dt;p.dx+=p.vx*dt;p.dy+=p.vy*dt;p.vy+=dt*(e.type==='meteor'?100:21);}
   if(e.life<=0)fx.splice(n,1);
 }
}
export function paintVfx(ctx,fx,tick){
 if(!fx.length)return;
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(const e of fx){
   const palette=COLORS[e.type],progress=Math.max(0,Math.min(1,e.age/.65)),ring=e.type==='nova'||e.type==='storm'||e.type==='ward'||e.type==='meteor'||e.type==='chain';
   if(ring){
     const radius=(e.type==='nova'?185:e.type==='storm'?116:e.type==='meteor'?118:54)*Math.sqrt(progress);
     ctx.globalAlpha=Math.max(0,1-progress)*.8;
     ctx.strokeStyle=palette[1]||palette[0];ctx.lineWidth=(1-progress)*10+1.5;
     ctx.shadowBlur=16;ctx.shadowColor=palette[1];
     ctx.beginPath();ctx.ellipse(e.x,e.y,Math.max(2,radius),Math.max(2,radius)*.55,0,0,Math.PI*2);ctx.stroke();
     ctx.shadowBlur=0;
   }
   ctx.save();ctx.translate(e.x,e.y);
   for(const p of e.particles){
     if(p.life<=0)continue;
     const alpha=Math.max(0,Math.min(1,p.life/p.max)),size=p.size*(.65+alpha);
     ctx.globalAlpha=alpha*.86;ctx.fillStyle=palette[p.idx];
     if(e.type==='ice'||e.type==='shard'||e.type==='nova'||e.type==='storm'){
       ctx.save();ctx.translate(p.dx,p.dy);ctx.rotate(tick*(p.idx%2?1:-1)+p.idx);
       ctx.fillRect(-size*.4,-size*2.5,size*.8,size*5);ctx.fillRect(-size*2.5,-size*.4,size*5,size*.8);ctx.restore();
     }else{
       ctx.beginPath();ctx.ellipse(p.dx,p.dy,size,size*(e.type==='fire'?2.3:1.1),0,0,Math.PI*2);ctx.fill();
     }
   }
   ctx.restore();
 }
 ctx.restore();
}
