import {test} from 'node:test';
import assert from 'node:assert/strict';
import {animationPose,status} from '../dist/2d/pixel-mage-demo.js';

test('sprite atlas can be imported without requiring DOM in Node rules tests',()=>{
  assert.equal(status().ready,false);
  assert.equal(status().failed,false);
});
test('idle animation floats gently instead of being one rigid still image',()=>{
  const char={moving:false,walk:0,cast:0,invuln:0,angle:0};
  const a=animationPose(char,.5),b=animationPose(char,1.2);
  assert.equal(a.mode,'idle');assert.equal(b.mode,'idle');
  assert.notEqual(a.bob,b.bob);
});
test('walking creates alternating stride, squash and lean without changing physics position',()=>{
  const actor={x:450,y:490,moving:true,walk:0,cast:0,invuln:0,angle:0};
  const left=animationPose({...actor,walk:Math.PI/2},1);
  const right=animationPose({...actor,walk:Math.PI*1.5},1);
  assert.equal(left.mode,'run');assert.equal(right.mode,'run');
  assert.ok(left.stride>1);assert.ok(right.stride< -1);
  assert.ok(left.lean>0&&right.lean<0);
  assert.equal(actor.x,450);assert.equal(actor.y,490);
});
test('cast and hit animations have priority over running and return to idle',()=>{
  const moving={moving:true,walk:5,invuln:0,cast:.12};
  assert.equal(animationPose(moving,3).mode,'cast');
  assert.equal(animationPose({...moving,invuln:.45},3).mode,'hurt');
  assert.equal(animationPose({...moving,moving:false,cast:0},3).mode,'idle');
});
