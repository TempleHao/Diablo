// 技能粒子爆发（施法起手、命中、死亡）。纯视觉，不影响伤害判定。
// v0.4：粒子全部用预渲染光晕/冰晶贴图绘制，不再逐个画路径和 shadowBlur。
import {drawGlow,shardSprite} from './fx.js';
const COLORS={
 fire:['#fff1b7','#ffad48','#ff5e24','#ae2632'],inferno:['#ffe5a0','#fd7b35','#b8341c'],
 ice:['#f3ffff','#b0eaff','#6abdf3','#538be8'],nova:['#e9ffff','#99e6ff','#4aa7ee'],
 storm:['#e1ffff','#83c8ff','#6881ff'],ward:['#f4ffff','#88c6ff','#6e8bdd'],
 chain:['#f9f4ff','#c8a0ff','#9669ed'],arcane:['#e2cfff','#9d77f1','#7144cb'],
 meteor:['#ffecb5','#ff842a','#bc2e18'],blink:['#f8daff','#aa7af7','#5f54c9'],
 heal:['#f2ffd9','#b7ec9a','#68cb82'],armor:['#d8faff','#8ccbea','#6196d4'],
 shard:['#e3ffff','#a9e1ff','#71bcfa'],death:['#ffd0a0','#c4553a','#5a1a1a'],
 void:['#f0c8ff','#b46cf0','#6a2fa8'],
 physical:['#ffffff','#e8e0d0','#a89c88'],poison:['#e0ffd0','#7dff6a','#3a9a3a'],
 holy:['#fffbe8','#ffd76a','#c8962a'],shadow:['#f0e0ff','#a56cf0','#4a2a7a']
};
const ICY=new Set(['ice','shard','nova','storm','armor']);
const RISE=new Set(['fire','meteor','inferno','heal','death']);
let counter=0;
export function emitVfx(target,type,x,y,{max=18,angle=0,speed=1}={}){
 const key=COLORS[type]?type:type==='flame'?'fire':'arcane';
 max=Math.max(3,Math.min(44,max|0));
 const particles=[];
 for(let i=0;i<max;i++){
   const seed=++counter*97+i*181,the=seed*2.3999632297+angle;
   const radius=6+(i%6)*3,v=(40+(seed%120))*speed,life=.32+(i%7)*.06;
   particles.push({dx:Math.cos(the)*radius,dy:Math.sin(the)*radius*.7,
     vx:Math.cos(the)*v,vy:Math.sin(the)*v*.7-(RISE.has(key)?50:6),
     life,max:life,size:3+(i%4)*1.6,idx:i%COLORS[key].length,rot:the});
 }
 target.push({type:key,x,y,age:0,life:.8,particles});
 // 手机上同屏 36 个敌人时也要控制粒子数量。
 while(target.length>44)target.shift();
}
export function tickVfx(fx,dt){
 for(let n=fx.length-1;n>=0;n--){
   const e=fx[n];e.age+=dt;e.life-=dt;
   const drag=Math.exp(-dt*3.2),grav=e.type==='meteor'?90:RISE.has(e.type)?-30:18;
   for(const p of e.particles){p.life-=dt;p.dx+=p.vx*dt;p.dy+=p.vy*dt;p.vx*=drag;p.vy=p.vy*drag+grav*dt;}
   if(e.life<=0)fx.splice(n,1);
 }
}
export function paintVfx(ctx,fx){
 if(!fx.length)return;
 ctx.save();ctx.globalCompositeOperation='lighter';
 for(const e of fx){
   const palette=COLORS[e.type];
   // 起手/命中瞬间的闪光
   if(e.age<.12)drawGlow(ctx,e.x,e.y,26+e.age*260,palette[1],(1-e.age/.12)*.55,true);
   const icy=ICY.has(e.type);
   for(const p of e.particles){
     if(p.life<=0)continue;
     const k=p.life/p.max,x=e.x+p.dx,y=e.y+p.dy;
     if(icy){
       const s=shardSprite(palette[p.idx%palette.length]);if(!s)continue;
       const size=p.size*(1.1+k);
       ctx.globalAlpha=k;ctx.save();ctx.translate(x,y);ctx.rotate(p.rot+e.age*3);
       ctx.drawImage(s,-size*.5,-size,size,size*2);ctx.restore();
     }else drawGlow(ctx,x,y,p.size*(1.4+k*1.6),palette[p.idx],k*.9,p.idx===0);
   }
 }
 ctx.restore();
}
