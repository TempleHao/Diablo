// ART-02 D1 native fixed-pose material ablations. No production files or save state are changed.
// Standard ART_QA_* runtime settings apply; optional ART_QA_FROZEN_DIST serves an explicit frozen dist.
// Default: six fixed clip times, front/back, normal/normalScale=0/neutral-gray. --quick: Idle frame zero only.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {ART_URL,OUTPUT,runStandalone}=require('./runtime.cjs');
const BASE=new URL(ART_URL.endsWith('/')?ART_URL:ART_URL+'/');
const DIST=process.env.ART_QA_FROZEN_DIST?path.resolve(process.env.ART_QA_FROZEN_DIST):null;
const OUT=path.join(OUTPUT,'surface');
fs.mkdirSync(OUT,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const result={stage:'ART-02 D1 fixed native production-preview cloth ablation',url:ART_URL,hashes:{},errors:[],samples:[],limitations:['Single Chromium with ANGLE SwiftShader software WebGL.','Production mage-preview.js is altered only in the intercepted browser response. Frozen-dist routing is optional.','Normal ablation affects the shared opaque atlas material, including cloth and other opaque body surfaces.','Neutral-gray ablation removes opaque PBR maps and vertex colors; cutout hair retains its base map to preserve alpha silhouette.','Fixed sampled poses and screenshots do not establish real-device performance or art acceptance.']};
function inject(src){
 src=src.replace("let copy,mixer,bounds,height,quality='combat',active=false,session=0,raf=0;","let copy,mixer,bounds,height,quality='combat',active=false,session=0,raf=0;\nlet qaFreeze=false,qaAsset=combatAsset,qaMode='normal',qaPose=null,qaOriginals=[];");
 src=src.replace('    copy=clone(asset.scene);',`    qaAsset=asset;qaOriginals=[];
    copy=clone(asset.scene);`);
 src=src.replace('    frame();\n  }\n  function refreshFacePosition()',`    copy.traverse(o=>{if(o.isMesh)qaOriginals.push({mesh:o,material:o.material});});
    frame();
  }
  function refreshFacePosition()`);
 src=src.replace('    mixer.update(dt);renderer.render(scene,camera);','    if(!qaFreeze)mixer.update(dt);renderer.render(scene,camera);');
 src=src.replace('  adopt(combatAsset);',`  adopt(combatAsset);
  const qaSnapshots=()=>({quality,mode:qaMode,pose:qaPose,mixerTime:mixer.time,camera:camera.position.toArray(),cameraQuaternion:camera.quaternion.toArray(),rotation:copy.rotation.y,view,zoom,height,lights:scene.children.filter(o=>o.isLight).map(o=>({type:o.type,color:o.color.toArray(),intensity:o.intensity,position:o.position.toArray()})),render:{...renderer.info.render},clips:qaAsset.animations.map(c=>({name:c.name,duration:c.duration})),materials:qaOriginals.map(o=>({mesh:o.mesh.name,material:(Array.isArray(o.mesh.material)?o.mesh.material:[o.mesh.material]).map(m=>({name:m.name,normal:!!m.normalMap,normalScale:m.normalScale.toArray(),map:!!m.map,vertexColors:m.vertexColors,roughness:m.roughness,side:m.side}))}))});
  window.__surfaceQA={snapshot:qaSnapshots,
   pose(clip,time,rotation=-Math.PI){qaFreeze=true;mixer.stopAllAction();const c=qaAsset.animations.find(c=>c.name===clip);if(!c)throw Error('No clip '+clip);const action=mixer.clipAction(c).setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.reset().play();mixer.setTime(time);copy.rotation.y=rotation;copy.updateMatrixWorld(true);copy.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});qaPose={clip,time,duration:c.duration};frame();renderer.render(scene,camera);return qaSnapshots();},
   mode(mode){qaMode=mode;for(const o of qaOriginals){const original=Array.isArray(o.material)?o.material:[o.material];const mats=original.map(m=>{if(mode==='normal')return m;const n=m.clone();if(mode==='zero')n.normalScale.set(0,0);else if(mode==='neutral'){n.normalMap=null;n.normalScale.set(0,0);if(!n.alphaTest){n.map=null;n.roughnessMap=null;n.metalnessMap=null;n.emissiveMap=null;n.aoMap=null;n.vertexColors=false;n.color.setRGB(.5,.5,.5);n.emissive.setRGB(0,0,0);n.emissiveIntensity=0;n.roughness=.85;n.metalness=0;}}else throw Error('Unknown mode '+mode);n.needsUpdate=true;return n;});o.mesh.material=Array.isArray(o.material)?mats:mats[0];}renderer.render(scene,camera);return qaSnapshots();},
   close(){close();},render(){renderer.render(scene,camera);return qaSnapshots();}
  };`);
 return src;
}
exports.run=async browser=>{
const context=await browser.newContext({viewport:{width:700,height:720},deviceScaleFactor:1});const page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>result.errors.push(e.message));
try{
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.endsWith('/qa-surface.html'))return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#151310"><canvas id="model-preview" style="display:block;width:640px;height:640px"></canvas><p id="model-status" hidden></p><button id="retry-model" hidden></button><button id="model-view-full" hidden></button><button id="model-view-face" hidden></button></body></html>'});
  const relative=decodeURIComponent(u.pathname.startsWith(BASE.pathname)?u.pathname.slice(BASE.pathname.length):u.pathname.replace(/^\//,''));
  const file=DIST?path.resolve(DIST,relative):null;
  if(file&&file.startsWith(DIST+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()){
   let body=fs.readFileSync(file);result.hashes[relative]=sha(body);
   if(relative==='mage-preview.js')body=Buffer.from(inject(body.toString()));
   return route.fulfill({status:200,contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.glb')?'model/gltf-binary':undefined,body});
  }
  if(/\.(js|glb)$/.test(relative)){
   const response=await route.fetch();let body=await response.body();result.hashes[relative]=sha(body);
   if(relative==='mage-preview.js')body=Buffer.from(inject(body.toString()));
   return route.fulfill({response,body});
  }
  return route.continue();
 });
 await page.goto(new URL('qa-surface.html',BASE).href);await page.evaluate(async()=>{const T=await import('./vendor/three.module.js'),{loadMage}=await import('./hero.js');window.__surfaceActor=await loadMage(new T.Group());window.__surfaceStop=window.__surfaceActor.preview(document.getElementById('model-preview'));});
 await page.waitForFunction(()=>window.__surfaceQA?.snapshot().quality==='detail');await page.evaluate(()=>window.__surfaceQA.close());
 result.gpu=await page.evaluate(()=>{const gl=document.getElementById('model-preview').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return {vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};});
 const full=!process.argv.includes('--quick');const configs=full?[['Idle',0],['Idle',.5],['Walk',.25],['Walk',.5],['Cast',.15],['Cast',.3]]:[['Idle',0]];
 for(const [clip,fraction] of configs){const duration=await page.evaluate(clip=>window.__surfaceQA.snapshot().clips.find(c=>c.name===clip).duration,clip);for(const [view,rotation] of [['back',Math.PI],['front',-.18]]){const fixed=await page.evaluate(({clip,time,rotation})=>window.__surfaceQA.pose(clip,time,rotation),{clip,time:duration*fraction,rotation});for(const mode of ['normal','zero','neutral']){const state=await page.evaluate(mode=>window.__surfaceQA.mode(mode),mode);assert.deepEqual(state.camera,fixed.camera);assert.deepEqual(state.cameraQuaternion,fixed.cameraQuaternion);assert.equal(state.mixerTime,fixed.mixerTime);assert.deepEqual(state.pose,fixed.pose);const filename=[clip,'t'+fraction,view,mode].join('-')+'.png';await page.locator('#model-preview').screenshot({path:path.join(OUT,filename)});result.samples.push({filename,...state});}}}
 assert.equal(result.errors.length,0);result.pass=true;fs.writeFileSync(path.join(OUT,'art2-surface.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({pass:result.pass,samples:result.samples.length,gpu:result.gpu,errors:result.errors,out:OUT,hashes:result.hashes},null,2));
}catch(e){result.errors.push(e.stack);fs.writeFileSync(path.join(OUT,'art2-surface-failure.json'),JSON.stringify(result,null,2));throw e;}finally{await context.close();}
};
if(require.main===module)runStandalone(exports.run);
