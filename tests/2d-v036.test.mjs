import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ENCOUNTER_COUNT,WAVE_SIZE,WAVE_COUNT,MAX_LIVE_ENEMIES,encounterWave,nextWaveForKills,shouldSummonBoss} from '../dist/2d/encounters.js';
import {HERO_ART,animationPose} from '../dist/2d/pixel-mage-demo.js';
import {freshSave,sanitizeSave} from '../dist/2d/core.js';
import {REGION_DATA} from '../dist/2d/systems.js';
import {emitVfx,tickVfx} from '../dist/2d/spell-vfx.js';
test('v0.8: 54 monsters per run in 3 waves of 18, elites 1/2/3 per wave',()=>{
 assert.equal(ENCOUNTER_COUNT,54);assert.equal(WAVE_COUNT,3);assert.equal(WAVE_SIZE,18);
 assert.ok(MAX_LIVE_ENEMIES>=WAVE_SIZE*3);
 for(const region of REGION_DATA){
  const waves=Array.from({length:WAVE_COUNT},(_,i)=>encounterWave(region.types,i));
  assert.equal(waves.flat().length,54);
  assert.deepEqual(waves.map(w=>w.filter(x=>x.elite).length),[1,2,3]);
  assert.ok(waves.flat().every(x=>region.types.includes(x.kind)));
 }
});
test('third wave arrives at 36 kills (waves 1–2 are placed at start), boss at 54',()=>{
 assert.equal(nextWaveForKills(0),-1);
 assert.equal(nextWaveForKills(18),1);
 assert.equal(nextWaveForKills(36),2);
 assert.equal(nextWaveForKills(54),-1);
 for(const i of [1,4,17,19,35,37,53])assert.equal(nextWaveForKills(i),-1);
 assert.equal(shouldSummonBoss(53,null),false);
 assert.equal(shouldSummonBoss(54,null),true);
 assert.equal(shouldSummonBoss(54,{}),false);
});
test('seven class choices persist and reject invalid values',()=>{
 assert.deepEqual(Object.keys(HERO_ART).sort(),['amazon','assassin','barbarian','druid','mage','necro','paladin']);
 assert.equal(freshSave().heroClass,'mage');
 for(const heroClass of Object.keys(HERO_ART)){
  const p=freshSave();p.heroClass=heroClass;
  assert.equal(sanitizeSave(JSON.parse(JSON.stringify(p))).heroClass,heroClass);
 }
 assert.equal(sanitizeSave({version:2,heroClass:'<script>alert(1)</script>'}).heroClass,'mage');
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
 for(const cls of Object.keys(HERO_ART)){
  const actor={moving:true,cls,walk:Math.PI/2,invuln:0,cast:0,x:200,y:150};
  const pose=animationPose(actor,1);
  assert.equal(pose.mode,'run');
  assert.equal(actor.x,200);assert.equal(actor.y,150);
 }
});
