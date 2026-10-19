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
test('walking (v0.7): stride follows phase, feet alternate, small grounded bob, blends in from idle',()=>{
  const actor={x:450,y:490,moving:true,walk:0,cast:0,invuln:0,angle:0};
  const poses=[0,1,2,3].map(k=>animationPose({...actor,walk:k*Math.PI/2+Math.PI/4},1));
  assert.ok(poses.every(p=>p.mode==='run'));
  assert.ok(poses[0].stride>1&&poses[2].stride< -1,'feet alternate');
  assert.ok(poses[0].lift>0&&poses[2].lift<0,'left/right foot lift alternates');
  assert.ok(poses.every(p=>Math.abs(p.bob)<=2),'no floating');
  // 运动状态：速度低时步伐权重小（起步/停下有过渡）
  const slow=animationPose({...actor,_mo:{speed:30,stride:Math.PI/2,lean:0,idle:0}},1);
  const fast=animationPose({...actor,_mo:{speed:200,stride:Math.PI/2,lean:0,idle:0}},1);
  assert.ok(Math.abs(slow.stride)<Math.abs(fast.stride));
  assert.equal(actor.x,450);assert.equal(actor.y,490);
});
test('cast and hit animations have priority over running and return to idle',()=>{
  const moving={moving:true,walk:5,invuln:0,cast:.12};
  assert.equal(animationPose(moving,3).mode,'cast');
  assert.equal(animationPose({...moving,invuln:.45},3).mode,'hurt');
  assert.equal(animationPose({...moving,moving:false,cast:0},3).mode,'idle');
});
