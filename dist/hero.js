import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {clone} from './vendor/utils/SkeletonUtils.js';

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
      renderer.setClearColor(0x0e1723);
      const scene=new T.Scene();
      scene.add(new T.HemisphereLight(0xd7ecff,0x515064,2.4));
      const light=new T.DirectionalLight(0xffdab0,3);light.position.set(2,4,3);scene.add(light);
      const rim=new T.DirectionalLight(0x68b6ff,2);rim.position.set(-3,2,-2);scene.add(rim);
      const copy=clone(model);copy.scale.setScalar(1);scene.add(copy);
      const pedestal=new T.Mesh(new T.CylinderGeometry(.65,.74,.15,40),new T.MeshStandardMaterial({color:0x313c46,metalness:.4,roughness:.55}));pedestal.position.y=-.08;scene.add(pedestal);
      const camera=new T.PerspectiveCamera(34,canvas.clientWidth/canvas.clientHeight,.1,20);camera.position.set(.5,1.55,4.4);camera.lookAt(0,1.07,0);
      const mixer=new T.AnimationMixer(copy);const idle=asset.animations.find(c=>c.name==='Idle');if(idle)mixer.clipAction(idle).play();
      let active=true,previous=performance.now(),drag=null;
      canvas.onpointerdown=e=>{drag=e.clientX;canvas.setPointerCapture(e.pointerId);};
      canvas.onpointermove=e=>{if(drag!==null){copy.rotation.y+=(e.clientX-drag)*.012;drag=e.clientX;}};
      canvas.onpointerup=canvas.onpointercancel=()=>drag=null;
      function render(now){if(!active)return;const dt=Math.min((now-previous)/1000,.05);previous=now;mixer.update(dt);if(drag===null)copy.rotation.y+=dt*.13;renderer.render(scene,camera);requestAnimationFrame(render);}
      requestAnimationFrame(render);
      return ()=>{active=false;mixer.stopAllAction();renderer.dispose();pedestal.geometry.dispose();pedestal.material.dispose();canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=null;};
    }
  };
}
