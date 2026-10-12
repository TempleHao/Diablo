import * as T from './vendor/three.module.js';
import {clone} from './vendor/utils/SkeletonUtils.js';
import {createReflectionEnvironment} from './lighting.js';

// One viewer/context per character canvas, retained for the page lifetime.
// Closing pauses it; reopening reuses both geometry and uploaded textures.
export function createMagePreview(combatAsset,canvas,requestDetail) {
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.setClearColor(0x151310);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  const scene=new T.Scene();
  scene.add(new T.HemisphereLight(0xe3e0d8,0x29221b,.85));
  const light=new T.DirectionalLight(0xfff1dd,5);light.position.set(-2,4,3);scene.add(light);
  const fill=new T.DirectionalLight(0xc2c9cd,1.8);fill.position.set(2,2,3);scene.add(fill);
  const rim=new T.DirectionalLight(0xadc1d0,1.75);rim.position.set(2,2,-2);scene.add(rim);
  const reflection=createReflectionEnvironment(renderer);scene.environment=reflection.texture;scene.environmentIntensity=.75;
  const pedestal=new T.Mesh(new T.CylinderGeometry(.65,.74,.08,64),new T.MeshStandardMaterial({color:0x25211c,metalness:.12,roughness:.84}));pedestal.position.y=-.05;scene.add(pedestal);
  const camera=new T.PerspectiveCamera(32,1,.05,20),facePosition=new T.Vector3();
  const pointers=new Map();
  let copy,mixer,bounds,height,quality='combat',active=false,session=0,raf=0;
  let previous=0,view='full',zoom=1,pinch=null,abort,resizeObserver;
  const status=document.getElementById('model-status'),retry=document.getElementById('retry-model');

  function adopt(asset) {
    const rotation=copy?.rotation.y??(view==='face'?0:-.18);
    if(copy){mixer.stopAllAction();mixer.uncacheRoot(copy);scene.remove(copy);
      copy.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.boneTexture?.dispose();});}
    copy=clone(asset.scene);copy.scale.setScalar(1);copy.rotation.y=rotation;scene.add(copy);
    mixer=new T.AnimationMixer(copy);
    const idle=asset.animations.find(c=>c.name==='Idle');if(idle)mixer.clipAction(idle).play();mixer.update(0);
    copy.updateMatrixWorld(true);
    copy.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();o.computeBoundingBox();}});
    bounds=new T.Box3().setFromObject(copy);height=T.MathUtils.clamp(bounds.max.y-bounds.min.y,1.6,2.5);
    frame();
  }
  function refreshFacePosition() {
    copy.updateMatrixWorld(true);
    const faceAnchor=copy.getObjectByName('face_focus'),headBone=copy.getObjectByName('head')||copy.getObjectByName('Head');
    if(faceAnchor)faceAnchor.getWorldPosition(facePosition);
    else if(headBone){headBone.getWorldPosition(facePosition);facePosition.y+=.20;}
    else facePosition.set(0,1.78,0);
  }
  function frame() {
    refreshFacePosition();
    const face=view==='face',targetY=face?facePosition.y:height*.5;
    const frameHeight=face?.62:height*1.12;
    const distance=frameHeight/(2*Math.tan(T.MathUtils.degToRad(16)))*zoom;
    camera.position.set(.07,targetY+(face?.02:.08),distance+(face?facePosition.z:0));
    camera.lookAt(0,targetY,face?facePosition.z:0);
  }
  function setView(mode) {
    view=mode==='face'?'face':'full';zoom=1;copy.rotation.y=view==='face'?0:-.18;frame();
    for(const id of ['model-view-full','model-view-face'])document.getElementById(id)?.setAttribute('aria-pressed',String(id===`model-view-${view}`));
  }
  function showStatus(message,failed=false) {
    if(status){status.textContent=message;status.hidden=!message;}
    if(retry)retry.hidden=!failed;
  }
  function loadDetail(token) {
    if(quality==='detail'){showStatus('');return;}
    showStatus('正在加载角色细节…');
    requestDetail().then(asset=>{
      // A request may finish after close or after another open. Cache it in
      // the loader, but only the current visible session may attach/render it.
      if(!active||token!==session)return;
      if(quality!=='detail'){adopt(asset);quality='detail';}
      showStatus('');
    }).catch(()=>{
      if(active&&token===session)showStatus('角色细节暂时加载失败，可重试。',true);
    });
  }
  function resize() {
    if(!active)return;
    const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
    renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();frame();
  }
  function render(now) {
    if(!active)return;
    const dt=Math.max(0,Math.min((now-previous)/1000,.05));previous=now;
    mixer.update(dt);renderer.render(scene,camera);raf=requestAnimationFrame(render);
  }
  function close() {
    active=false;session++;cancelAnimationFrame(raf);abort?.abort();resizeObserver?.disconnect();
    for(const id of pointers.keys())if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
    pointers.clear();pinch=null;
  }
  adopt(combatAsset);
  return {
    open() {
      if(active)close();active=true;const token=++session;
      abort=new AbortController();const options={signal:abort.signal};
      canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);pinch=null;},options);
      canvas.addEventListener('pointermove',e=>{
        const last=pointers.get(e.pointerId);if(!last)return;
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.size===1)copy.rotation.y+=(e.clientX-last.x)*.008;
        else if(pointers.size===2){const [a,b]=[...pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch&&distance>0){zoom=T.MathUtils.clamp(zoom*pinch/distance,.72,1.5);frame();}pinch=distance;}
      },options);
      const release=e=>{pointers.delete(e.pointerId);pinch=null;};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release,options);
      canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(e.deltaY*.001),.72,1.5);frame();},{...options,passive:false});
      document.getElementById('model-view-full')?.addEventListener('click',()=>setView('full'),options);
      document.getElementById('model-view-face')?.addEventListener('click',()=>setView('face'),options);
      retry?.addEventListener('click',()=>loadDetail(token),options);
      resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);
      setView('full');resize();previous=performance.now();raf=requestAnimationFrame(render);loadDetail(token);
      return ()=>{if(token===session)close();};
    }
  };
}
