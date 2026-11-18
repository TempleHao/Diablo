/* 归墟 3D 小样 · 骨骼角色
 * 读 models/<id>/rig.json：{files:[第一个带蒙皮，其余是动作], height, runSpeed, clips:{角色:文件名}}
 * 支持 Mixamo 导出的 FBX（With Skin / Without Skin）和 GLB。动作按文件名自动认：idle / run / walk / cast / cast2 / hit / die / attack。
 * 缺的单次动作（施法、受击、死亡）用程序化骨骼姿态补位，等真动作到了自动让位。 */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {FBXLoader} from '../vendor/FBXLoader.js';

const ROLE = [
  ['die', /dying|death|die\b/i], ['hit', /react|hit|impact/i], ['cast2', /2h|area|power ?up|spell ?cast/i],
  ['attack', /zombie attack|swip|punch|slash|bite/i], ['cast', /1h|magic|cast|attack/i],
  ['run', /run/i], ['walk', /walk/i], ['idle', /idle/i],
];
const roleOf = name => (ROLE.find(([, re]) => re.test(name)) || [null])[0];
const LOOP = new Set(['idle', 'run', 'walk']);

const gltf = new GLTFLoader(), fbx = new FBXLoader();
const loadOne = url => /\.fbx$/i.test(url)
  ? fbx.loadAsync(url).then(o => ({scene: o, clips: o.animations}))
  : gltf.loadAsync(url).then(g => ({scene: g.scene, clips: g.animations}));

/* Mixamo 的 FBX 是 Phong 材质，换成 PBR 才吃得到环境光和火光的高光 */
function toStandard(m) {
  if (m.isMeshStandardMaterial) { m.envMapIntensity = .8; return m; }
  const s = new THREE.MeshStandardMaterial({map: m.map || null, normalMap: m.normalMap || null, color: m.color || 0xffffff,
    emissiveMap: m.emissiveMap || null, emissive: m.emissive || 0x000000, roughness: .72, metalness: 0, transparent: !!m.transparent && m.opacity < 1, opacity: m.opacity ?? 1,
    alphaTest: m.alphaTest || 0, side: m.side});
  if (s.map) s.map.colorSpace = THREE.SRGBColorSpace;
  s.name = m.name;
  return s;
}

/* 原地动作：把髋骨的水平位移钉住（Mixamo 没勾 In Place 也不会滑步） */
function pinHips(clip) {
  for (const t of clip.tracks) {
    if (!/hips\.position$/i.test(t.name)) continue;
    const v = t.values, x0 = v[0], z0 = v[2];
    for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
  }
  return clip;
}

export async function loadRig(base) {
  const def = await fetch(base + 'rig.json', {cache: 'no-cache'}).then(r => { if (!r.ok) throw new Error('no rig'); return r.json(); });
  const parts = await Promise.all(def.files.map(f => loadOne(base + f)));
  const model = parts[0].scene;
  const clips = {};
  parts.forEach((p, i) => p.clips.forEach((c, j) => {
    const label = !c.name || /mixamo\.com|^take ?\d*$/i.test(c.name) ? def.files[i].replace(/\.\w+$/, '') : c.name;
    const role = Object.entries(def.clips || {}).find(([, v]) => v === label)?.[0] || roleOf(label);
    if (role && !clips[role]) clips[role] = LOOP.has(role) ? pinHips(c) : c;
  }));

  // 统一尺寸：按绑定姿态的包围盒把身高缩到 def.height，脚底放到地面
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true), h = box.max.y - box.min.y || 1;
  const k = (def.height || 1.85) / h;
  const holder = new THREE.Group(); holder.add(model);
  model.scale.multiplyScalar(k); model.position.y -= box.min.y * k;
  model.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
    o.material = Array.isArray(o.material) ? o.material.map(toStandard) : toStandard(o.material);
  });
  const bones = {};
  model.traverse(o => { if (o.isBone) bones[o.name.replace(/^mixamorig\d*:?/i, '').toLowerCase()] = o; });
  return {def, model: holder, clips, bones, height: def.height || 1.85};
}

/* 每个实例一份：动作混合 + 程序化补位 */
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
export function makeRigActor(proto, cloneFn) {
  const root = new THREE.Group();
  const inst = cloneFn ? cloneFn(proto.model) : proto.model;
  root.add(inst);
  const bones = {};
  inst.traverse(o => { if (o.isBone) bones[o.name.replace(/^mixamorig\d*:?/i, '').toLowerCase()] = o; });
  const mixer = new THREE.AnimationMixer(inst);
  const acts = {};
  for (const [r, c] of Object.entries(proto.clips)) {
    const a = mixer.clipAction(c); acts[r] = a;
    if (!LOOP.has(r)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
  }
  const mats = [];
  inst.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.push(m)); } });
  let loop = null, once = null, onceT = 0, proc = null, dead = false;
  const runSpeed = proto.def.runSpeed || 4.6;

  function play(role, fade = .18) {
    const a = acts[role] || (role === 'run' ? acts.walk : null) || acts.idle;
    if (!a || loop === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (loop) loop.fadeOut(fade);
    loop = a;
  }
  play('idle', 0);

  /* 在世界坐标里转一根骨头（只叠加在动画姿态之上，下一帧动画会重新覆盖） */
  function turn(bone, axisW, ang) {
    if (!bone || !ang) return;
    bone.parent.updateWorldMatrix(true, false);
    _q2.setFromRotationMatrix(_m.extractRotation(bone.parent.matrixWorld));
    _v.copy(axisW).applyQuaternion(_q2.clone().invert());
    _q.setFromAxisAngle(_v.normalize(), ang);
    bone.quaternion.premultiply(_q);
    bone.updateMatrixWorld(true);
  }
  const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
  function procPose(dt) {
    if (!proc) return;
    proc.t += dt;
    const t = proc.t, f = _v2.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y)), right = new THREE.Vector3(-f.z, 0, f.x);
    // right 是角色的右手方向；绕它转正角 = 身体后仰、下垂的手臂往前抬
    if (proc.kind === 'cast') {
      const k = t < .1 ? ease(t / .1) : 1 - ease((t - .25) / .25);
      turn(bones.spine1, right, -.12 * k);
      turn(bones.rightarm, right, 1.35 * k); turn(bones.rightforearm, right, .25 * k);
      if (t > .5) proc = null;
    } else if (proc.kind === 'cast2') {
      const up = t < .25 ? ease(t / .25) : t < .38 ? 1 : 0, slam = t < .25 ? 0 : t < .38 ? ease((t - .25) / .13) : 1 - ease((t - .5) / .3);
      turn(bones.spine1, right, .25 * up - .35 * slam);
      for (const b of [bones.rightarm, bones.leftarm]) turn(b, right, 2.7 * up + 1.2 * slam);
      if (t > .8) proc = null;
    } else if (proc.kind === 'hit') {
      const k = t < .06 ? t / .06 : 1 - ease((t - .06) / .3);
      turn(bones.spine, right, .32 * k); turn(bones.head, right, .25 * k);
      if (t > .4) proc = null;
    } else if (proc.kind === 'die') {
      const k = ease(t / .7);
      inst.rotation.x = -1.5 * k; inst.position.y = .12 * Math.sin(k * Math.PI) - .05 * k;
      turn(bones.spine, right, .3 * k);
    }
  }

  return {
    root, mats, bones, acts, height: proto.height,
    has: r => !!acts[r],
    /* 每帧：speed 是当前水平速度（米/秒），用来对上跑步动作的步幅，脚不打滑 */
    update(dt, speed = 0) {
      if (!dead) {
        if (speed > .3) { play('run'); if (loop === acts.run || loop === acts.walk) loop.timeScale = Math.max(.6, speed / runSpeed); }
        else play('idle');
      }
      if (once && (onceT += dt) > once.getClip().duration * .92 && !dead) { once.fadeOut(.2); once = null; }
      mixer.update(dt);
      inst.updateMatrixWorld(true);
      procPose(dt);
    },
    fire(role) {
      if (dead) return;
      if (role === 'die') dead = true;
      const a = acts[role] || (role === 'attack' ? acts.cast : null);
      if (a) {
        if (once && once !== a) once.fadeOut(.08);
        a.reset().setEffectiveWeight(1).fadeIn(.08).play(); once = a; onceT = 0;
        if (dead && loop) loop.fadeOut(.2);
      } else proc = {kind: role === 'attack' ? 'cast' : role, t: 0};
    },
    revive() {
      dead = false; proc = null; inst.rotation.x = 0; inst.position.y = 0;
      if (once) { once.stop(); once = null; }
      loop = null; for (const a of Object.values(acts)) a.stop(); play('idle', 0);
    },
    get dead() { return dead; },
  };
}
