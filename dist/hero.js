import * as T from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {createMagePreview} from './mage-preview.js';

export async function loadMage(parent) {
  const loader = new GLTFLoader();
  const asset = await loader.loadAsync(new URL('./models/ember-mage-combat.glb', import.meta.url).href);
  const model = asset.scene;
  model.name = 'EmberMage';
  model.scale.setScalar(1.12);
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
  let detailAsset, detailRequest;
  const viewers = new WeakMap();
  function requestDetail() {
    if(detailAsset)return Promise.resolve(detailAsset);
    if(!detailRequest)detailRequest=loader.loadAsync(new URL('./models/ember-mage-realism.glb', import.meta.url).href)
      .then(result=>{detailAsset=result;return result;})
      .finally(()=>{detailRequest=null;});
    return detailRequest;
  }
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
      let viewer=viewers.get(canvas);
      if(!viewer){viewer=createMagePreview(asset,canvas,requestDetail);viewers.set(canvas,viewer);}
      return viewer.open();
    }
  };
}
