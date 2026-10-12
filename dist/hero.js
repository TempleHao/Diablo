import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone} from './vendor/utils/SkeletonUtils.js';
import {createReflectionEnvironment} from './lighting.js';

export async function loadMage(parent) {
  const asset = await new GLTFLoader().loadAsync(new URL('./models/ember-mage.glb', import.meta.url).href);
  const model = asset.scene;
  model.name = 'EmberMage';
  model.scale.setScalar(1.22);
  model.traverse(o => {
    if (o.isMesh) {o.castShadow=true;o.receiveShadow=true;}
  });
  parent.add(model);
  const mixer = new T.AnimationMixer(model);
  const actions = Object.fromEntries(asset.animations.map(c=>[c.name,mixer.clipAction(c)]));
  // Blender track names are preserved as Idle, Walk, Cast.
  let current = actions.Idle || Object.values(actions)[0];
  current?.play();
  let casting = 0;
  return {
    model, clips: asset.animations,
    update(dt, moving) {
      mixer.update(dt);casting=Math.max(0,casting-dt);
      const next=actions[moving?'Walk':'Idle'];
      if(next && next!==current){current?.fadeOut(.12);next.reset().fadeIn(.12).play();current=next;}
      if(casting===0 && actions.Cast?.isRunning())actions.Cast.fadeOut(.1);
    },
    cast() {
      if(!actions.Cast)return;
      casting=.32;
      actions.Cast.reset().setLoop(T.LoopOnce,1).setDuration(.32).setEffectiveWeight(.8).fadeIn(.04).play();
    },
    preview(canvas) {
      const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true});
      renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
      renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
      renderer.setClearColor(0x151310);
      renderer.outputColorSpace=T.SRGBColorSpace;
      renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
      const scene=new T.Scene();
      scene.add(new T.HemisphereLight(0xe3e0d8,0x29221b,.65));
      const light=new T.DirectionalLight(0xffe4bd,3.2);light.position.set(-2,4,3);scene.add(light);
      const rim=new T.DirectionalLight(0xadc1d0,1.75);rim.position.set(2,2,-2);scene.add(rim);
      const reflection=createReflectionEnvironment(renderer);scene.environment=reflection.texture;scene.environmentIntensity=.55;
      const copy=clone(model);copy.scale.setScalar(1);copy.rotation.y=-.18;scene.add(copy);
      const bounds=new T.Box3().setFromObject(copy),height=bounds.max.y-bounds.min.y;
      const pedestal=new T.Mesh(new T.CylinderGeometry(.65,.74,.08,64),new T.MeshStandardMaterial({color:0x25211c,metalness:.12,roughness:.84}));pedestal.position.y=-.05;scene.add(pedestal);
      const camera=new T.PerspectiveCamera(32,canvas.clientWidth/canvas.clientHeight,.05,20);
      const mixer=new T.AnimationMixer(copy);const idle=asset.animations.find(c=>c.name==='Idle');if(idle)mixer.clipAction(idle).play();
      let active=true,previous=performance.now(),view='full',zoom=1,pinch=null;
      const pointers=new Map(),abort=new AbortController(),options={signal:abort.signal};
      function frame(){
        const face=view==='face',targetY=face?height*.85:height*.5;
        const frameHeight=face?0.62:height*1.12;
        const distance=frameHeight/(2*Math.tan(T.MathUtils.degToRad(16)))*zoom;
        camera.position.set(.07,targetY+(face?0.02:0.08),distance);
        camera.lookAt(0,targetY,0);
      }
      function setView(mode){view=mode==='face'?'face':'full';zoom=1;copy.rotation.y=view==='face'?0:-.18;frame();
        for(const id of ['model-view-full','model-view-face'])document.getElementById(id)?.setAttribute('aria-pressed',String(id===`model-view-${view}`));}
      canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);pinch=null;},options);
      canvas.addEventListener('pointermove',e=>{
        const last=pointers.get(e.pointerId);if(!last)return;
        pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(pointers.size===1){copy.rotation.y+=(e.clientX-last.x)*.008;}
        else if(pointers.size===2){const [a,b]=[...pointers.values()];const distance=Math.hypot(a.x-b.x,a.y-b.y);if(pinch&&distance>0){zoom=T.MathUtils.clamp(zoom*pinch/distance,.72,1.5);frame();}pinch=distance;}
      },options);
      const release=e=>{pointers.delete(e.pointerId);pinch=null;};
      for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release,options);
      canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom*Math.exp(e.deltaY*.001),.72,1.5);frame();},{...options,passive:false});
      document.getElementById('model-view-full')?.addEventListener('click',()=>setView('full'),options);
      document.getElementById('model-view-face')?.addEventListener('click',()=>setView('face'),options);
      const resizeObserver=new ResizeObserver(()=>{if(!active)return;renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix();frame();});resizeObserver.observe(canvas);
      setView('full');
      function render(now){if(!active)return;const dt=Math.min((now-previous)/1000,.05);previous=now;mixer.update(dt);renderer.render(scene,camera);requestAnimationFrame(render);}
      requestAnimationFrame(render);
      return ()=>{active=false;abort.abort();resizeObserver.disconnect();pointers.clear();mixer.stopAllAction();reflection.dispose();renderer.dispose();pedestal.geometry.dispose();pedestal.material.dispose();};
    }
  };
}
