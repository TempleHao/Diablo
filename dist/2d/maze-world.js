/**
 * Playable dungeon geometry for the room-graph maze.
 * Gridded collision + doors match the graph exactly; nothing is a teleporter.
 * This is a gameplay topology slice, NOT final A-direction environment art.
 */
import { generateMaze, discoverAround } from './maze.js';
import { mulberry32 } from './core.js';
export const CELL = 48, STRIDE = 8;
const XY=(world,x,y)=>y*world.cols+x;
export function createMazeWorld(seed,region=0){
  const layout=generateMaze(seed);
  const cols=layout.width*STRIDE, rows=layout.height*STRIDE;
  const world={seed,region,layout,cols,rows,width:cols*CELL,height:rows*CELL,
    cellSize:CELL, floorMask:new Uint8Array(cols*rows),blocks:[],torches:[],roomSpawns:[],explored:[],visible:[]};
  const fill=(x0,y0,x1,y1)=>{
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)
      if(x>=0&&x<cols&&y>=0&&y<rows)world.floorMask[XY(world,x,y)]=1;
  };
  for(const room of layout.rooms){
    const bx=room.x*STRIDE,by=room.y*STRIDE;
    fill(bx+1,by+1,bx+6,by+6);
    const center=roomCenter(world,room.id);
    world.roomSpawns.push({...center,roomId:room.id,kind:room.type});
    if(room.type==='ritual'||room.type==='shrine'||room.type==='boss'){
      world.torches.push({x:center.x-90,y:center.y-92},{x:center.x+95,y:center.y-92});
    }else if(room.id%3===0)world.torches.push({x:center.x-101,y:center.y-87});
  }
  for(const edge of layout.edges){
    const a=layout.rooms[edge.a],b=layout.rooms[edge.b];
    if(a.y===b.y){
      const left=a.x<b.x?a:b;
      const x=left.x*STRIDE+7,y=left.y*STRIDE+3;
      fill(x,y,x+1,y+1);
    }else{
      const top=a.y<b.y?a:b;
      const x=top.x*STRIDE+3,y=top.y*STRIDE+7;
      fill(x,y,x+1,y+1);
    }
  }
  const rng=mulberry32(seed^0xD411A);
  // Small environmental props, always off central passage/door aperture.
  for(const room of layout.rooms){
    if(['entrance','boss'].includes(room.type))continue;
    if(rng()>.60)continue;
    const cx=(room.x*STRIDE+2+(rng()>.5?0:4))*CELL;
    const cy=(room.y*STRIDE+2+(rng()>.5?0:4))*CELL;
    world.blocks.push({x:cx,y:cy,w:31,h:31,kind:'pillar',variant:Math.floor(rng()*3)});
  }
  const reveal=discoverAround(layout,[],layout.entrance);
  world.explored=reveal.visited;world.visible=reveal.visible;
  world.start=roomCenter(world,layout.entrance);
  return world;
}
export function roomCenter(world,id){
  const room=world.layout.rooms[id];
  if(!room)return null;
  return {x:(room.x*STRIDE+4)*CELL,y:(room.y*STRIDE+4)*CELL};
}
export function roomAt(world,x,y){
  const gx=Math.floor(x/CELL),gy=Math.floor(y/CELL);
  const cx=Math.floor(gx/STRIDE),cy=Math.floor(gy/STRIDE);
  return world.layout.rooms.find(r=>r.x===cx&&r.y===cy)?.id??null;
}
export function isFloor(world,x,y){
  const tx=Math.floor(x/CELL),ty=Math.floor(y/CELL);
  return tx>=0&&ty>=0&&tx<world.cols&&ty<world.rows&&!!world.floorMask[ty*world.cols+tx];
}
export function enterRoom(world,id){
  if(id===null||id===undefined||!world.layout.rooms.some(r=>r.id===id))return false;
  const before=world.explored.includes(id);
  const updated=discoverAround(world.layout,world.explored,id);
  world.explored=updated.visited;world.visible=updated.visible;
  return !before;
}
export function isDiscovered(world,id){return world.explored.includes(id);}
export function drawMazeWalls(ctx,world,cam,vw,vh){
  const {cols,rows,floorMask}=world;
  const x0=Math.max(0,Math.floor(cam.x/CELL)-2),x1=Math.min(cols-1,Math.ceil((cam.x+vw)/CELL)+2);
  const y0=Math.max(0,Math.floor(cam.y/CELL)-2),y1=Math.min(rows-1,Math.ceil((cam.y+vh)/CELL)+2);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(floorMask[y*cols+x])continue;
    const px=x*CELL,py=y*CELL;
    const adj=(x>0&&floorMask[y*cols+x-1])||(x+1<cols&&floorMask[y*cols+x+1])||
      (y>0&&floorMask[(y-1)*cols+x])||(y+1<rows&&floorMask[(y+1)*cols+x]);
    ctx.fillStyle=adj?'#303238':'#05080e';ctx.fillRect(px,py,CELL+1,CELL+1);
    if(adj){
      ctx.fillStyle='#69655a';ctx.fillRect(px+2,py+2,CELL-4,5);
      ctx.strokeStyle='#13171d';ctx.lineWidth=2;ctx.strokeRect(px+2,py+7,CELL-4,CELL-10);
      if((x+y)%2===0){ctx.strokeStyle='#454448';ctx.beginPath();ctx.moveTo(px+CELL/2,py+10);ctx.lineTo(px+CELL/2,py+CELL-4);ctx.stroke();}
    }
  }
  // Room boundaries are architectural gameplay walls rather than scattered boulders.
  for(const room of world.layout.rooms){
    const center=roomCenter(world,room.id);
    if(center.x<cam.x-400||center.y<cam.y-400||center.x>cam.x+vw+400||center.y>cam.y+vh+400)continue;
    if(room.type==='boss'||room.type==='elite'||room.type==='treasure'){
      const color=room.type==='boss'?'#a05459':room.type==='elite'?'#b89a65':'#b1a36b';
      ctx.strokeStyle=color+'99';ctx.lineWidth=2;ctx.strokeRect((room.x*STRIDE+1.15)*CELL,(room.y*STRIDE+1.15)*CELL,5.7*CELL,5.7*CELL);
      if(room.type==='boss'){
        ctx.strokeStyle='#ae593d4a';ctx.beginPath();ctx.arc(center.x,center.y,85,0,Math.PI*2);ctx.stroke();
      }
    }
  }
}
export function drawExplorationFog(ctx,world,cam,vw,vh){
  const visible=new Set(world.visible),visited=new Set(world.explored);
  for(const room of world.layout.rooms){
    const bx=room.x*STRIDE*CELL,by=room.y*STRIDE*CELL;
    if(bx+STRIDE*CELL<cam.x||by+STRIDE*CELL<cam.y||bx>cam.x+vw||by>cam.y+vh)continue;
    ctx.fillStyle=visited.has(room.id)?'#080b1300':visible.has(room.id)?'#04070c77':'#010308f5';
    ctx.fillRect(bx,by,STRIDE*CELL,STRIDE*CELL);
  }
}
