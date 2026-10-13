import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMazeWorld,roomCenter,roomAt,isFloor,enterRoom,isDiscovered} from '../dist/2d/maze-world.js';
import {walkable,moveWithCollision} from '../dist/2d/core.js';
import {connectedIds} from '../dist/2d/maze.js';

function reachableTiles(world){
  const cols=world.cols,rows=world.rows,mask=world.floorMask;
  const origin={x:Math.floor(world.start.x/world.cellSize),y:Math.floor(world.start.y/world.cellSize)};
  const first=origin.y*cols+origin.x,visited=new Set([first]),queue=[first];
  for(let n=0;n<queue.length;n++){
    const current=queue[n],x=current%cols,y=Math.floor(current/cols);
    for(const next of [x>0?current-1:-1,x<cols-1?current+1:-1,y>0?current-cols:-1,y<rows-1?current+cols:-1])
      if(next>=0&&mask[next]&&!visited.has(next)){visited.add(next);queue.push(next);}
  }
  return visited;
}
test('100 generated 2D maze worlds are physically connected across actual floor pixels',()=>{
  let variations=new Set();
  for(let seed=0;seed<100;seed++){
    const w=createMazeWorld(seed,seed%5),reachable=reachableTiles(w);
    assert.ok(isFloor(w,w.start.x,w.start.y),'entry missing '+seed);
    for(const room of w.layout.rooms){
      const pos=roomCenter(w,room.id);
      assert.ok(reachable.has(Math.floor(pos.y/w.cellSize)*w.cols+Math.floor(pos.x/w.cellSize)),
        'physically disconnected room '+room.id+' seed '+seed);
      assert.equal(roomAt(w,pos.x,pos.y),room.id);
      assert.ok(walkable(pos.x,pos.y,17,w),'room center has collision seed '+seed);
    }
    variations.add(w.layout.rooms.map(r=>r.x+','+r.y).join(':'));
  }
  assert.ok(variations.size>80);
});
test('graph doors connect physically at all vertical/horizontal room boundaries',()=>{
  const w=createMazeWorld(9611);
  for(const edge of w.layout.edges){
    const a=w.layout.rooms[edge.a],b=w.layout.rooms[edge.b];
    const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    if(a.x!==b.x){
      const x=(Math.min(a.x,b.x)*8+7.5)*w.cellSize;
      const y=(a.y*8+3.5)*w.cellSize;
      assert.ok(walkable(x,y,17,w),'east-west door collision '+edge.a+'-'+edge.b);
    }else{
      const x=(a.x*8+3.5)*w.cellSize;
      const y=(Math.min(a.y,b.y)*8+7.5)*w.cellSize;
      assert.ok(walkable(x,y,17,w),'north-south door collision '+edge.a+'-'+edge.b);
    }
  }
});
test('walls block movement at the boundary and no world edge escape',()=>{
  const w=createMazeWorld(417);
  const p={x:w.start.x,y:w.start.y};
  const old={...p};
  moveWithCollision(p,180,0,.1,w,17);
  assert.ok(walkable(p.x,p.y,17,w));
  assert.notEqual(p.x,old.x);
  assert.equal(walkable(-9,w.start.y,17,w),false);
  assert.equal(walkable(w.width+2,w.start.y,17,w),false);
  assert.equal(walkable(w.start.x,0,17,w),false);
});
test('fog can reveal explored chamber and neighbors but not the whole maze',()=>{
  const w=createMazeWorld(388);
  const neighbor=connectedIds(w.layout,w.layout.entrance)[0];
  assert.equal(w.explored.length,1);
  assert.ok(w.visible.includes(neighbor));
  assert.equal(isDiscovered(w,neighbor),false);
  assert.equal(enterRoom(w,neighbor),true);
  assert.equal(isDiscovered(w,neighbor),true);
  assert.equal(enterRoom(w,neighbor),false);
  assert.ok(w.visible.length<w.layout.rooms.length);
  const before=w.explored.length;
  assert.equal(enterRoom(w,99999),false);
  assert.equal(w.explored.length,before);
});
