import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ENCOUNTER_COUNT,WAVE_SIZE,WAVE_COUNT,MAX_LIVE_ENEMIES,encounterWave,nextWaveForKills,shouldSummonBoss} from '../dist/2d/encounters.js';
import {SKIN_LABELS,animationPose} from '../dist/2d/pixel-mage-demo.js';
import {freshSave,sanitizeSave} from '../dist/2d/core.js';
import {REGION_DATA} from '../dist/2d/systems.js';
import {emitVfx,tickVfx} from '../dist/2d/spell-vfx.js';
test('all 9 regions now use 3x the previous 12-monster total with 3 distinct encounters',()=>{
 assert.equal(ENCOUNTER_COUNT,36);assert.equal(WAVE_COUNT,3);assert.equal(WAVE_SIZE,12);
 assert.ok(MAX_LIVE_ENEMIES>=WAVE_SIZE);
 for(const region of REGION_DATA){
  const waves=Array.from({length:WAVE_COUNT},(_,i)=>encounterWave(region.types,i));
  assert.equal(waves.flat().length,36);
  assert.ok(waves[1].filter(x=>x.elite).length>=2);
  assert.ok(waves[2].filter(x=>x.elite).length>=2);
  assert.ok(waves.flat().every(x=>region.types.includes(x.kind)));
 }
});
test('reinforcements trigger only at 12 and 24 kills, boss only at 36',()=>{
 assert.equal(nextWaveForKills(0),-1);
 assert.equal(nextWaveForKills(12),1);
 assert.equal(nextWaveForKills(24),2);
 assert.equal(nextWaveForKills(36),-1);
 for(const i of [1,4,8,11,13,23,25,35])assert.equal(nextWaveForKills(i),-1);
 assert.equal(shouldSummonBoss(35,null),false);
 assert.equal(shouldSummonBoss(36,null),true);
 assert.equal(shouldSummonBoss(36,{}),false);
});
test('five mage appearances persist without changing old save format',()=>{
 assert.deepEqual(Object.keys(SKIN_LABELS),['arcane','flame','light','shadow','nature']);
 assert.equal(freshSave().heroSkin,'arcane');
 for(const heroSkin of Object.keys(SKIN_LABELS)){
  const p=freshSave();p.heroSkin=heroSkin;
  assert.equal(sanitizeSave(JSON.parse(JSON.stringify(p))).heroSkin,heroSkin);
 }
 assert.equal(sanitizeSave({version:2,heroSkin:'<script>alert(1)</script>'}).heroSkin,'arcane');
});
test('visual effect pool is bounded and expires without runaway particle costs',()=>{
 const fx=[];
 for(let i=0;i<200;i++)emitVfx(fx,i%2?'ice':'fire',100+i,150,{max:100});
 assert.ok(fx.length<=44);
 assert.ok(fx.every(e=>e.particles.length<=44));
 for(let i=0;i<50;i++)tickVfx(fx,.025);
 assert.equal(fx.length,0);
});
test('moving actor retains real stride and position independent from equipped palette',()=>{
 for(const skin of Object.keys(SKIN_LABELS)){
  const actor={moving:true,skin,walk:Math.PI/2,invuln:0,cast:0,x:200,y:150};
  const pose=animationPose(actor,1);
  assert.equal(pose.mode,'run');
  assert.equal(actor.x,200);assert.equal(actor.y,150);
 }
});
