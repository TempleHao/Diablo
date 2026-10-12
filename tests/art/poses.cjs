// Two GLBs × Idle/Walk/Cast × five sample times: 30 native WebGL poses.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {ART_URL,OUTPUT,installModules,runStandalone}=require('./runtime.cjs');
exports.run=async browser=>{
 const result={stage:'Native GLTFLoader/AnimationMixer five sample times per clip, high and combat',errors:[],samples:[],limitations:['Fixed sampled animation poses and native WebGL render, not long-session animation or hardware performance evidence.']};
 const context=await browser.newContext({viewport:{width:960,height:720},deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>result.errors.push(e.message));const info={};await installModules(page,info);await page.route('**/qa-inspection.html',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#151310"><canvas id="inspection" width="960" height="720"></canvas></body></html>'}));
 try{
  await page.goto(new URL('qa-inspection.html',ART_URL.endsWith('/')?ART_URL:ART_URL+'/').href);
  result.samples=await page.evaluate(async()=>{
   const T=await import('./vendor/three.module.js'),{GLTFLoader}=await import('./vendor/GLTFLoader.js');
   const loader=new GLTFLoader(),renderer=new T.WebGLRenderer({canvas:document.getElementById('inspection'),antialias:true});renderer.setSize(960,720);renderer.setClearColor(0x151310);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
   const scene=new T.Scene();scene.add(new T.HemisphereLight(0xe3e0d8,0x29221b,1));const sun=new T.DirectionalLight(0xfff1dd,4);sun.position.set(-2,4,3);scene.add(sun);const camera=new T.PerspectiveCamera(32,960/720,.05,20);camera.position.set(0,1.1,4);camera.lookAt(0,1.0,0);
   const models=[];
   for(const file of ['ember-mage-realism.glb','ember-mage-combat.glb']){
    const asset=await loader.loadAsync(new URL('./models/'+file,location.href).href),model=asset.scene;scene.add(model);const mixer=new T.AnimationMixer(model);const bones=model.getObjectsByProperty('isBone',true);const records=[];
    for(const clip of asset.animations){
     const action=mixer.clipAction(clip).setLoop(T.LoopOnce,1);action.clampWhenFinished=true;
     for(const fraction of [0,.25,.5,.75,.99]){
      mixer.stopAllAction();action.reset().play();mixer.setTime(clip.duration*fraction);model.updateMatrixWorld(true);model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});const bounds=new T.Box3().setFromObject(model),anchor=model.getObjectByName('face_focus'),face=new T.Vector3();anchor?.getWorldPosition(face);renderer.render(scene,camera);
      const footBounds=[];model.traverse(o=>{if(o.isSkinnedMesh&&/Boot|Foot|Body/i.test(o.name)){const b=new T.Box3().setFromObject(o);footBounds.push({name:o.name,min:b.min.toArray(),max:b.max.toArray()});}});
      records.push({clip:clip.name,time:clip.duration*fraction,duration:clip.duration,fraction,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},face:face.toArray(),bones:bones.map(b=>({name:b.name,q:b.quaternion.toArray(),p:b.position.toArray()})),footBounds,render:{...renderer.info.render}});
     }
    }
    models.push({file,boneCount:bones.length,clips:asset.animations.map(c=>c.name),records});mixer.stopAllAction();scene.remove(model);
   }
   renderer.dispose();return models;
  });
  for(const model of result.samples){assert.equal(model.boneCount,60);assert.equal(model.records.length,15);assert.deepEqual(model.clips.sort(),['Cast','Idle','Walk']);for(const s of model.records){assert(s.bounds.min.every(Number.isFinite)&&s.bounds.max.every(Number.isFinite));assert(s.bounds.min[1]>-.04&&s.bounds.min[1]<.05);assert(s.face[1]>1.5&&s.face[1]<2.2);assert.equal(s.render.calls,2);}}
  const high=result.samples[0],combat=result.samples[1];for(let i=0;i<15;i++){const h=high.records[i],c=combat.records[i];assert.equal(h.clip,c.clip);assert.deepEqual(h.bones,c.bones);assert.deepEqual(h.face,c.face);for(const axis of [0,1,2]){assert(Math.abs(h.bounds.min[axis]-c.bounds.min[axis])<.065);assert(Math.abs(h.bounds.max[axis]-c.bounds.max[axis])<.065);}}
  result.pass=true;console.log('PASS native-high-combat-three-clips-five-times-pose-parity',{samples:30,bones:60,drawCallsPerCharacter:2});
 }catch(e){result.errors.push(e.stack);throw e;}finally{await context.close();fs.writeFileSync(path.join(OUTPUT,'art2-native-poses.json'),JSON.stringify(result,null,2));}
};

if(require.main===module)runStandalone(exports.run);
