/**
 * Ember Chronicles 2D — room/door graph for dungeon generation.
 * Pure deterministic gameplay logic, independent of sprites and browser DOM.
 *
 * This is the F1 topology foundation; it is NOT yet rendered as a maze.
 */
import { mulberry32 } from './core.js';

const neighbors=(x,y,w,h)=>[
  {x:x,y:y-1,dir:'N'}, {x:x+1,y:y,dir:'E'},
  {x:x,y:y+1,dir:'S'}, {x:x-1,y:y,dir:'W'}
].filter(p=>p.x>=0&&p.x<w&&p.y>=0&&p.y<h);
const key=(x,y)=>x+','+y;
const edgeKey=(a,b)=>[a,b].sort((x,y)=>x-y).join('-');
const RANGE={minRooms:16,maxRooms:24,width:8,height:7};
const roomTypes=['hall','cell','shrine','collapsed','prison','library','ritual','cavern'];

export function connectedIds(layout,roomId){
  const ids=[];
  for(const edge of layout.edges){
    if(edge.a===roomId)ids.push(edge.b);
    if(edge.b===roomId)ids.push(edge.a);
  }
  return ids.sort((a,b)=>a-b);
}
export function shortestRoomPath(layout,start=layout.entrance,boss=layout.boss){
  if(!layout.rooms.some(r=>r.id===start)||!layout.rooms.some(r=>r.id===boss))return [];
  const queue=[start],prev=new Map([[start,null]]);
  while(queue.length){
    const current=queue.shift();
    if(current===boss)break;
    for(const id of connectedIds(layout,current)){
      if(!prev.has(id)){prev.set(id,current);queue.push(id);}
    }
  }
  if(!prev.has(boss))return [];
  const route=[];
  for(let p=boss;p!==null;p=prev.get(p))route.push(p);
  return route.reverse();
}
export function cycleCount(layout){
  return layout.edges.length-layout.rooms.length+1;
}
export function deadEndIds(layout){
  return layout.rooms.filter(r=>connectedIds(layout,r.id).length===1).map(r=>r.id);
}
export function validateMaze(layout){
  const errors=[];
  if(!layout||!Array.isArray(layout.rooms)||!Array.isArray(layout.edges)||layout.rooms.length<16)return ['missing room graph'];
  const keys=new Set(),ids=new Set(),edges=new Set();
  for(const r of layout.rooms){
    if(!Number.isInteger(r.x)||!Number.isInteger(r.y)||r.x<0||r.x>=layout.width||r.y<0||r.y>=layout.height)errors.push('invalid grid cell');
    if(keys.has(key(r.x,r.y)))errors.push('overlapping rooms');
    if(ids.has(r.id))errors.push('duplicate room id');
    keys.add(key(r.x,r.y));ids.add(r.id);
  }
  for(const e of layout.edges){
    if(!ids.has(e.a)||!ids.has(e.b)||e.a===e.b)errors.push('orphan/invalid edge');
    if(edges.has(edgeKey(e.a,e.b)))errors.push('duplicate edge');
    edges.add(edgeKey(e.a,e.b));
    const a=layout.rooms.find(r=>r.id===e.a),b=layout.rooms.find(r=>r.id===e.b);
    if(a&&b&&Math.abs(a.x-b.x)+Math.abs(a.y-b.y)!==1)errors.push('non-adjacent connection');
  }
  if(!ids.has(layout.entrance)||!ids.has(layout.boss)||layout.entrance===layout.boss)errors.push('missing start or boss');
  const reached=new Set([layout.entrance]),frontier=[layout.entrance];
  while(frontier.length){
    for(const id of connectedIds(layout,frontier.shift()))if(!reached.has(id)){reached.add(id);frontier.push(id);}
  }
  if(reached.size!==layout.rooms.length)errors.push('inaccessible room(s)');
  if(shortestRoomPath(layout).length<5)errors.push('boss too close to entrance');
  if(cycleCount(layout)<1)errors.push('no alternate loop');
  if(deadEndIds(layout).length<2)errors.push('no real side branches / dead ends');
  if(!layout.rooms.some(r=>r.type==='treasure')||!layout.rooms.some(r=>r.type==='elite'))errors.push('missing discovery rewards');
  return errors;
}
function buildAttempt(seed,opts,attempt){
  const width=opts.width??RANGE.width,height=opts.height??RANGE.height;
  const rng=mulberry32((seed+Math.imul(attempt,111791))>>>0);
  const min=Math.max(16,Math.min(width*height-2,opts.minRooms??RANGE.minRooms));
  const max=Math.max(min,Math.min(width*height,opts.maxRooms??RANGE.maxRooms));
  const count=min+Math.floor(rng()*(max-min+1));
  const start={x:Math.floor(width/2),y:height-2};
  const rooms=[{id:0,...start,type:'entrance'}],cellIds=new Map([[key(start.x,start.y),0]]),edges=[];
  while(rooms.length<count){
    const possibilities=[];
    for(const room of rooms){
      for(const target of neighbors(room.x,room.y,width,height))
        if(!cellIds.has(key(target.x,target.y)))possibilities.push({from:room.id,target});
    }
    if(!possibilities.length)break;
    // Favor bounded exploratory growth instead of a single straight corridor.
    const index=Math.floor(rng()*possibilities.length),chosen=possibilities[index];
    const id=rooms.length;
    rooms.push({id,x:chosen.target.x,y:chosen.target.y,type:roomTypes[Math.floor(rng()*roomTypes.length)]});
    cellIds.set(key(chosen.target.x,chosen.target.y),id);
    edges.push({a:chosen.from,b:id,kind:'door'});
  }
  const existing=new Set(edges.map(e=>edgeKey(e.a,e.b)));
  const alternative=[];
  for(const room of rooms)for(const cell of neighbors(room.x,room.y,width,height)){
    const other=cellIds.get(key(cell.x,cell.y));
    if(other!==undefined&&other>room.id&&!existing.has(edgeKey(room.id,other)))
      alternative.push({a:room.id,b:other,kind:'archway'});
  }
  if(alternative.length){
    const loopEdges=Math.min(alternative.length,1+Math.floor(rng()*3));
    for(let i=0;i<loopEdges;i++){
      const index=Math.floor(rng()*alternative.length);
      edges.push(alternative.splice(index,1)[0]);
    }
  }
  const layout={seed,width,height,rooms,edges,entrance:0,boss:-1,treasure:-1,elite:-1};
  const distances=new Map([[0,0]]),queue=[0];
  while(queue.length){
    const current=queue.shift();
    for(const adjacent of connectedIds(layout,current))
      if(!distances.has(adjacent)){distances.set(adjacent,distances.get(current)+1);queue.push(adjacent);}
  }
  const candidates=rooms.filter(r=>r.id!==0).sort((a,b)=>distances.get(b.id)-distances.get(a.id)||a.id-b.id);
  layout.boss=candidates[0]?.id??-1;
  const endPoints=deadEndIds(layout).filter(id=>id!==0&&id!==layout.boss);
  layout.treasure=endPoints[0]??candidates.find(r=>r.id!==layout.boss)?.id??-1;
  layout.elite=endPoints[1]??candidates.find(r=>r.id!==layout.boss&&r.id!==layout.treasure)?.id??-1;
  for(const room of rooms){
    if(room.id===layout.boss)room.type='boss';
    else if(room.id===layout.treasure)room.type='treasure';
    else if(room.id===layout.elite)room.type='elite';
  }
  return layout;
}
export function generateMaze(seed=2026,options={}){
  if(!Number.isInteger(seed))throw new TypeError('seed must be integer');
  const width=options.width??RANGE.width,height=options.height??RANGE.height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<5||height<5||width>24||height>24)
    throw new RangeError('grid dimensions must be 5..24');
  for(let attempt=0;attempt<80;attempt++){
    const maze=buildAttempt(seed,{...options,width,height},attempt);
    if(validateMaze(maze).length===0)return maze;
  }
  throw new Error('unable to generate a valid room/door topology');
}
export function discoverAround(layout,visitedIds,currentRoom){
  if(!layout.rooms.some(r=>r.id===currentRoom))return {visited:[...visitedIds],visible:[...visitedIds]};
  const visited=new Set([...visitedIds,currentRoom]);
  const visible=new Set([...visited,...connectedIds(layout,currentRoom)]);
  return {visited:[...visited].sort((a,b)=>a-b),visible:[...visible].sort((a,b)=>a-b)};
}
export function dungeonSummary(layout){
  return {
    rooms:layout.rooms.length, corridors:layout.edges.length,
    loops:cycleCount(layout), deadEnds:deadEndIds(layout).length,
    bossDistance:shortestRoomPath(layout).length-1
  };
}
