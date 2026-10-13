import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateMaze,validateMaze,cycleCount,deadEndIds,shortestRoomPath,connectedIds,discoverAround,dungeonSummary} from '../dist/2d/maze.js';

test('100 deterministic dungeon seeds have connected entrance, side branches, loops and reachable boss',()=>{
  const fingerprints=new Set();
  for(let seed=0;seed<100;seed++){
    const m=generateMaze(seed);
    assert.deepEqual(validateMaze(m),[],'maze invalid seed '+seed);
    assert.ok(m.rooms.length>=16);
    assert.ok(cycleCount(m)>=1,'no loop '+seed);
    assert.ok(deadEndIds(m).length>=2,'no deadends '+seed);
    assert.ok(shortestRoomPath(m).length>=5,'boss adjacent seed '+seed);
    assert.ok(m.rooms.some(r=>r.type==='elite')&&m.rooms.some(r=>r.type==='treasure'));
    fingerprints.add(m.rooms.map(r=>r.x+':'+r.y).join('|'));
    assert.deepEqual(m,generateMaze(seed),'determinism failure for '+seed);
  }
  assert.ok(fingerprints.size>80,'random seeds should actually vary map topology');
});
test('every door connects two physically adjacent room cells',()=>{
  for(let seed=500;seed<540;seed++){
    const m=generateMaze(seed);
    for(const e of m.edges){
      const a=m.rooms.find(r=>r.id===e.a),b=m.rooms.find(r=>r.id===e.b);
      assert.equal(Math.abs(a.x-b.x)+Math.abs(a.y-b.y),1);
    }
  }
});
test('player fog of war only reveals current room and immediate neighbors',()=>{
  const m=generateMaze(2412);
  const reveal=discoverAround(m,[],m.entrance);
  assert.deepEqual(reveal.visited,[m.entrance]);
  assert.deepEqual(reveal.visible,[...new Set([m.entrance,...connectedIds(m,m.entrance)])].sort((a,b)=>a-b));
  const next=connectedIds(m,m.entrance)[0],reveal2=discoverAround(m,reveal.visited,next);
  assert.ok(reveal2.visited.includes(m.entrance)&&reveal2.visited.includes(next));
  assert.ok(reveal2.visible.length<m.rooms.length);
});
test('mutated disconnected graph cannot pass validation',()=>{
  const m=generateMaze(9);m.edges=[];
  const errors=validateMaze(m);
  assert.ok(errors.some(x=>x.includes('inaccessible')));
});
test('no accidental boss overlap and no negative cycle complexity',()=>{
  for(let i=0;i<30;i++){
    const m=generateMaze(i*41+2),summary=dungeonSummary(m);
    assert.notEqual(m.entrance,m.boss);
    assert.notEqual(m.boss,m.treasure);
    assert.notEqual(m.elite,m.treasure);
    assert.ok(summary.loops>=1&&summary.deadEnds>=2&&summary.bossDistance>=4);
  }
});
test('invalid seed or dimensions fail with a meaningful error',()=>{
  assert.throws(()=>generateMaze(Infinity),/seed/);
  assert.throws(()=>generateMaze(42,{width:0}),/grid dimensions/);
});
