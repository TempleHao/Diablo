// Browser-only ART-02 diagnostics. No production files or save state are changed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const ART_URL=process.env.ART_QA_URL||'http://127.0.0.1:5173';
const OUTPUT=process.env.ART_QA_OUTPUT?path.resolve(process.env.ART_QA_OUTPUT):fs.mkdtempSync(path.join(os.tmpdir(),'ember-mage-art-qa-'));
fs.mkdirSync(OUTPUT,{recursive:true});
const {chromium}=require(process.env.ART_PLAYWRIGHT_MODULE||'playwright-core');
const launch=()=>chromium.launch({executablePath:process.env.ART_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
function inject(relative,text){
 if(relative==='hero.js')return text.replace('model, clips: asset.animations,',`model, clips: asset.animations,
qaSnapshot:()=>({current:current?.getClip().name,mixerTime:mixer.time,casting,actions:Object.fromEntries(Object.entries(actions).map(([name,a])=>[name,{running:a.isRunning(),time:a.time,weight:a.getEffectiveWeight(),enabled:a.enabled}])),bones:model.getObjectsByProperty('isBone',true).map(b=>({name:b.name,q:b.quaternion.toArray()}))}),`);
 if(relative==='mage-preview.js')return text.replace('  adopt(combatAsset);',`  adopt(combatAsset);
window.__artPreview={snapshot:()=>({height,facePosition:facePosition.toArray(),camera:camera.position.toArray(),view,zoom,rotation:copy.rotation.y,boundsMin:bounds.min.toArray(),boundsMax:bounds.max.toArray(),mixerTime:mixer.time,pointers:pointers.size,active,session,raf,quality,render:{...renderer.info.render},memory:{...renderer.info.memory},clips:combatAsset.animations.map(c=>c.name),model:(()=>{const meshes=[],materials=new Set(),bones=new Set(),geometries=new Set();copy.traverse(o=>{if(o.isBone)bones.add(o.uuid);if(o.isMesh){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>materials.add(m.uuid));geometries.add(o.geometry.uuid);meshes.push({name:o.name,skinned:!!o.isSkinnedMesh,vertices:o.geometry.attributes.position.count,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3});}});return {meshes,meshCount:meshes.length,geometryCount:geometries.size,materialCount:materials.size,boneCount:bones.size};})()})};`);
 if(relative==='world-renderer.js')return text.replace('renderer.render(world,camera);renderer.setRenderTarget(null);renderer.render(scene,outputCamera);',"renderer.render(world,camera);window.__qaWorldPass={...renderer.info.render};renderer.setRenderTarget(null);renderer.render(scene,outputCamera);window.__qaWorldQuad={...renderer.info.render};");
 if(relative==='game.js')return text+`\nwindow.__artQA={snapshot:()=>({loaded:!!mage,clips:mage?.clips.map(c=>c.name),animation:mage?.qaSnapshot(),position:player.position.toArray(),camera:camera.position.toArray(),running,elapsed,hp,mana,fireHeld,firePointerIds:[...firePointers],shots:shots.length,shotDetails:shots.map(s=>({age:s.age,position:s.g.position.toArray()})),effects:effects.length,cd:{...cd},keys:[...keys],joy:{...joy},hdr:worldRenderer.hdr,environment:environment?.artStats,renderer:{...renderer.info.render},worldPass:window.__qaWorldPass,worldQuad:window.__qaWorldQuad,data:JSON.parse(JSON.stringify(data))}),model:()=>{if(!mage)return null;const meshes=[],geometries=new Set(),materials=new Set(),bones=new Set(),skins=[];mage.model.traverse(o=>{if(o.isBone)bones.add(o.uuid);if(o.isMesh){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>materials.add(m.uuid));geometries.add(o.geometry.uuid);meshes.push({name:o.name,skinned:!!o.isSkinnedMesh,vertices:o.geometry.attributes.position.count,triangles:(o.geometry.index?.count||o.geometry.attributes.position.count)/3,groups:o.geometry.groups.length,materialCount:mats.length});if(o.isSkinnedMesh)skins.push({name:o.name,joints:o.skeleton.bones.length});}});mage.model.updateMatrixWorld(true);mage.model.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});const b=new T.Box3().setFromObject(mage.model);const anchor=mage.model.getObjectByName('face_focus'),face=new T.Vector3();anchor?.getWorldPosition(face);return {meshes,meshCount:meshes.length,geometryCount:geometries.size,materialCount:materials.size,boneCount:bones.size,skins,scale:mage.model.scale.toArray(),bounds:{min:b.min.toArray(),max:b.max.toArray()},faceAnchor:anchor?face.toArray():null};}};`;
 return text;
}
async function installGpu(context){return context.addInitScript(()=>{
 const contexts=new WeakMap();let next=0;
 const state={contexts:[],calls:[]};window.__qaGpu=state;
 const getContext=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(type,...args){
  const gl=getContext.call(this,type,...args);
  if(gl&&/^webgl/.test(type)&&!contexts.has(gl)){const item={id:++next,canvasId:this.id,type,bufferData:0,bufferBytes:0,texImage2D:0,texImage3D:0,deleteBuffer:0,deleteTexture:0};contexts.set(gl,item);state.contexts.push(item);}
  return gl;
 };
 for(const C of [globalThis.WebGLRenderingContext,globalThis.WebGL2RenderingContext].filter(Boolean)){
  for(const method of ['bufferData','texImage2D','texImage3D','deleteBuffer','deleteTexture']){
   const original=C.prototype[method];if(!original)continue;
   C.prototype[method]=function(...args){const item=contexts.get(this);if(item){item[method]++;if(method==='bufferData')item.bufferBytes+=typeof args[1]==='number'?args[1]:args[1]?.byteLength||0;}return original.apply(this,args);};
  }
 }
});

}

async function installModules(page,info,options={}){
 info.hashes??={};info.detailRequests??=0;
 await page.route('**/*.js',async route=>{const response=await route.fetch();const source=await response.text();const relative=new URL(route.request().url()).pathname.split('/').pop();info.hashes[relative]=crypto.createHash('sha256').update(source).digest('hex');await route.fulfill({response,body:inject(relative,source)});});
 await page.route('**/ember-mage-realism.glb',async route=>{info.detailRequests++;if(options.detailRequest)await options.detailRequest(route,info.detailRequests);if(options.failFirstDetail&&info.detailRequests===1){await route.fulfill({status:503,body:'QA injected detail failure'});return;}await route.continue();});
}
function runStandalone(run){(async()=>{const browser=await launch();try{await run(browser);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={ART_URL,OUTPUT,installModules,installGpu,launch,runStandalone};
