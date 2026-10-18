// Demo environment pass inspired by ruined-cathedral dungeon references.
// Overlay follows ACTUAL collidable masonry, not a fake non-colliding maze.
const mix=(x,y,s)=>((Math.imul(x+7187,73856093)^Math.imul(y+1921,19349663)^(s|0))>>>0);
export function drawDungeonDetail(ctx,dungeon,cam,vw,vh,tick,staticOnly=false){
 if(!dungeon)return;
 const seed=dungeon.seed|0;
 ctx.save();
 // The long nave has a readable central axis; randomly chipped flagstones.
 const startX=Math.floor(cam.x/96)-1,endX=Math.ceil((cam.x+vw)/96)+1;
 const startY=Math.floor(cam.y/96)-1,endY=Math.ceil((cam.y+vh)/96)+1;
 for(let y=startY;y<=endY;y++)for(let x=startX;x<=endX;x++){
   const h=mix(x,y,seed),wx=x*96,wy=y*96;
   if(h%11===0){
     ctx.strokeStyle='#c0ac7940';ctx.lineWidth=1.1;
     ctx.beginPath();ctx.moveTo(wx+15,wy+42);ctx.lineTo(wx+37,wy+28);ctx.lineTo(wx+42,wy+51);
     ctx.lineTo(wx+73,wy+57);ctx.stroke();
   }
   if(h%17===0){
     ctx.fillStyle='#0a1018b3';ctx.fillRect(wx+18,wy+39,15,4);ctx.fillRect(wx+54,wy+57,7,12);
     ctx.fillStyle='#8a77602e';ctx.fillRect(wx+13,wy+36,23,2);
   }
   if(h%47===0){ctx.fillStyle='#9a65583d';ctx.beginPath();ctx.ellipse(wx+42,wy+61,22,8,0,0,Math.PI*2);ctx.fill();}
 }
 // A stronger silhouette from actual collision structures.
 for(const wall of dungeon.blocks){
   if(wall.x+wall.w<cam.x-150||wall.x>cam.x+vw+150||wall.y+wall.h<cam.y-150||wall.y>cam.y+vh+150)continue;
   const {x,y,w,h}=wall;
   ctx.fillStyle='#02060ba6';ctx.fillRect(x+13,y+h-2,w+16,18);
   ctx.fillStyle='#081018a0';ctx.fillRect(x-5,y-8,w+10,h+16);
   if(wall.kind==='wall'){
     ctx.strokeStyle='#a791625f';ctx.lineWidth=3;ctx.strokeRect(x-4,y-7,w+8,h+9);
     ctx.strokeStyle='#75644966';ctx.lineWidth=1;
     for(let j=35;j<w;j+=43){ctx.beginPath();ctx.moveTo(x+j,y-6);ctx.lineTo(x+j+9,y+h+3);ctx.stroke();}
     ctx.fillStyle='#0d161a';ctx.fillRect(x+15,y-10,8,13);ctx.fillRect(x+w-25,y-10,8,13);
   }else{
     ctx.strokeStyle='#b19a724c';ctx.lineWidth=2;ctx.strokeRect(x-7,y-7,w+14,h+14);
     ctx.fillStyle='#c0ae7833';ctx.fillRect(x-4,y-4,5,h+8);ctx.fillRect(x+w-2,y-4,5,h+8);
   }
 }
 // Torch halos are local lights only; no giant full-screen bloom.
 // 静态模式（地面分块缓存）不画会闪烁的火把光晕，交给光照层。
 if(!staticOnly)for(const torch of dungeon.torches){
   if(torch.x<cam.x-140||torch.x>cam.x+vw+140||torch.y<cam.y-140||torch.y>cam.y+vh+140)continue;
   const pulse=1+Math.sin(tick*5+torch.x*.01)*.07;
   const g=ctx.createRadialGradient(torch.x,torch.y-14,4,torch.x,torch.y-14,110*pulse);
   g.addColorStop(0,'#ffc88539');g.addColorStop(.3,'#c9652630');g.addColorStop(1,'#bb491000');
   ctx.fillStyle=g;ctx.beginPath();ctx.arc(torch.x,torch.y-14,110*pulse,0,Math.PI*2);ctx.fill();
 }
 // Far north boss platform: worn edges, altar studs and ritual fissures.
 const centerX=1440,centerY=410;
 if(centerX>cam.x-260&&centerX<cam.x+vw+260&&centerY>cam.y-240&&centerY<cam.y+vh+240){
   ctx.save();ctx.translate(centerX,centerY);
   ctx.strokeStyle='#a8786269';ctx.lineWidth=5;
   ctx.beginPath();ctx.ellipse(0,0,158,114,0,0,Math.PI*2);ctx.stroke();
   ctx.strokeStyle='#be674355';ctx.lineWidth=2.2;
   for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(Math.cos(a)*122,Math.sin(a)*86);ctx.lineTo(Math.cos(a)*153,Math.sin(a)*109);ctx.stroke();}
   ctx.restore();
 }
 ctx.restore();
}
