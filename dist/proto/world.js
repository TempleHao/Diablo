/* 归墟 3D 小样 · 场景：月夜下的废墟祭坛庭院。全部几何体和材质由代码生成，没有任何模型和贴图文件。
 * 返回：碰撞体（圆 / 方块）、火盆位置、怪物出生门、每帧更新函数。 */
import * as THREE from '../vendor/three.module.js';
import {mergeGeometries} from '../vendor/utils/BufferGeometryUtils.js';
import {groundMaterial, stoneMaterial, ironMaterial} from './materials.js';

export const ARENA = 27;           // 庭院半宽（米）
let seed = 20261118;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();

/** 夜空环境图：给积水、湿石头、铁器提供反射（深蓝天顶、地平线一点远处火光、一轮冷月） */
function envMap(renderer) {
  const s = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({side: THREE.BackSide, depthWrite: false, uniforms: {},
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec3 vD; void main(){
      float y=vD.y; vec3 zen=vec3(.006,.009,.02), hor=vec3(.045,.05,.07);
      vec3 c=mix(hor,zen,smoothstep(0.,.6,y));
      c+=vec3(.12,.05,.02)*pow(max(0.,dot(normalize(vec3(vD.x,0.,vD.z)),normalize(vec3(.8,0.,.6)))),6.)*(1.-smoothstep(0.,.25,abs(y)));
      vec3 moon=normalize(vec3(-.45,.75,-.5)); float m=dot(vD,moon);
      c+=vec3(.6,.7,.95)*(smoothstep(.9985,.9992,m)*6.+pow(max(m,0.),60.)*.25);
      c=mix(c,vec3(.012,.01,.009),smoothstep(0.,-.2,y));
      gl_FragColor=vec4(c,1.); }`});
  s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, .02);
  pm.dispose();
  return rt.texture;
}

/** 让方盒的顶面参差不齐（断墙、断柱）：把顶部顶点随机压低 */
function ragged(geo, amount) {
  // 位置相同的顶点（方盒各面在棱上各有一份）必须移动得一样，否则面与面之间会裂开：随机数按原始位置取
  const p = geo.attributes.position, box = new THREE.Box3().setFromBufferAttribute(p), top = box.max.y, salt = rnd() * 1000;
  const hp = (x, y, z, k) => { const s = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 991) * 78.233 + Math.round(z * 983) * 37.719 + salt + k * 19.19) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ny = y > top - 1e-3 ? y - hp(x, y, z, 0) * amount : y;
    p.setXYZ(i, x + (hp(x, y, z, 1) - .5) * .05, ny, z + (hp(x, y, z, 2) - .5) * .05);
  }
  geo.computeVertexNormals();
  return geo;
}
/** 碎块：细分的方块，棱角按位置哈希随机削掉、表面起伏（同一位置的顶点移动一致，不会裂缝） */
function chunkGeo(size, boxy = false) {
  const g = boxy ? new THREE.BoxGeometry(1, 1, 1, 3, 3, 3) : new THREE.DodecahedronGeometry(1, 1);
  const p = g.attributes.position;
  const hv = (x, y, z, k) => { const s = Math.sin(Math.round(x * 97) * 12.9898 + Math.round(y * 89) * 78.233 + Math.round(z * 83) * 37.719 + k * 19.19) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (boxy) { const c = Math.abs(x) + Math.abs(y) + Math.abs(z); if (c > 1.05) { const k = 1 - (c - 1.05) * .22 * (.6 + hv(x, y, z, 1)); x *= k; y *= k; z *= k; } }
    const j = 1 + (hv(x, y, z, 2) - .5) * (boxy ? .1 : .3);
    p.setXYZ(i, x * j * size, y * j * size, z * j * size);
  }
  g.computeVertexNormals();
  return g;
}
const place = (g, x, y, z, ry = 0, rx = 0, rz = 0) => {
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(x, y, z)); return g;
};

export function buildWorld(scene, renderer, quality, TX = {}) {
  const colliders = {circles: [], boxes: []}, occ = [];
  const stoneG = [], pillarG = [], darkStoneG = [], ironG = [], woodG = [];
  scene.environment = envMap(renderer);
  scene.fog = new THREE.FogExp2(0x0a0d14, .02);
  scene.background = new THREE.Color(0x030406);

  // —— 围墙：四面断墙，中间留门（怪物从门外涌进来）——
  const gates = [];
  const T = 1.5, L = ARENA + .8;
  for (const side of [0, 1, 2, 3]) {
    let a = -L;
    while (a < L) {
      const len = Math.min(rr(1.8, 3.6), L - a);
      const mid = a + len / 2;
      if (Math.abs(mid) < 3.2) { a += len; continue; }     // 门洞
      const collapsed = rnd() < .18, h = collapsed ? rr(.6, 1.4) : rr(2.4, 4.8);
      const g = ragged(new THREE.BoxGeometry(len - .05, h, T + rr(-.15, .2), Math.max(1, Math.round(len * 2)), 3, 2), collapsed ? .5 : rr(.2, 1.4));
      g.translate(0, h / 2, 0);
      const [x, z, ry] = side === 0 ? [mid, -L, 0] : side === 1 ? [mid, L, 0] : side === 2 ? [-L, mid, Math.PI / 2] : [L, mid, Math.PI / 2];
      stoneG.push(place(g, x, 0, z, ry));
      const hx = side < 2 ? len / 2 : T / 2, hz = side < 2 ? T / 2 : len / 2;
      colliders.boxes.push({x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz});
      // 墙垛之间偶尔一根壁柱
      if (!collapsed && rnd() < .3) {
        const pg = new THREE.BoxGeometry(.9, h + rr(.4, 1.2), .9).translate(0, (h + .8) / 2, 0);
        stoneG.push(place(pg, x + (side < 2 ? rr(-len / 3, len / 3) : (side === 2 ? .6 : -.6)), 0, z + (side < 2 ? (side === 0 ? .6 : -.6) : rr(-len / 3, len / 3))));
      }
      a += len;
    }
    const gx = side === 0 ? [0, -L - 3] : side === 1 ? [0, L + 3] : side === 2 ? [-L - 3, 0] : [L + 3, 0];
    gates.push(new THREE.Vector3(gx[0], 0, gx[1]));
    // 门两侧的高门柱
    for (const s of [-1, 1]) {
      const [x, z] = side < 2 ? [s * 3.6, side === 0 ? -L : L] : [side === 2 ? -L : L, s * 3.6];
      const gp = ragged(new THREE.BoxGeometry(1.6, 6.2, 1.9), .5).translate(0, 3.1, 0);
      darkStoneG.push(place(gp, x, 0, z));
      colliders.boxes.push({x0: x - .8, x1: x + .8, z0: z - .95, z1: z + .95});
    }
  }
  for (const b of colliders.boxes) occ.push({x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, r: Math.max(b.x1 - b.x0, b.z1 - b.z0) * .55, k: .45});

  // —— 柱廊：围着法阵一圈高柱，有的断了 ——
  const pillar = (x, z, h, broken) => {
    const r = .55;
    const base = new THREE.BoxGeometry(1.5, .5, 1.5).translate(0, .25, 0);
    const shaft = new THREE.CylinderGeometry(r * .92, r, h, 12, Math.max(2, Math.round(h * 2)));
    shaft.translate(0, .5 + h / 2, 0);
    // 柱身的凹槽（沿圆周起伏）
    const p = shaft.attributes.position;
    for (let i = 0; i < p.count; i++) { const ax = p.getX(i), az = p.getZ(i), a = Math.atan2(az, ax), k = 1 - .06 * Math.max(0, Math.cos(a * 12)); p.setX(i, ax * k); p.setZ(i, az * k); }
    if (broken) ragged(shaft, h * .25); else shaft.computeVertexNormals();
    const parts = [base, shaft];
    if (!broken) parts.push(new THREE.BoxGeometry(1.4, .45, 1.4).translate(0, .5 + h + .22, 0));
    const g = mergeGeometries(parts.map(q => q.toNonIndexed()));
    pillarG.push(place(g, x, 0, z, rnd() * Math.PI));
    colliders.circles.push({x, z, r: .78});
    occ.push({x, z, r: 1.6, k: .55});
  };
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + .31;
    pillar(Math.cos(a) * 10.5, Math.sin(a) * 10.5, rr(3.5, 6), rnd() < .4);
  }
  for (const [x, z] of [[-20, -19], [20, -19], [-21, 18], [21, 19], [-13, 21], [14, -21]]) pillar(x, z, rr(2.5, 5.5), rnd() < .5);
  // 倒下的柱段
  for (const [x, z, a] of [[-15, 5, .4], [16, -6, 2.1], [5, 18, 1.2], [-6, -17, 2.8]]) {
    const len = rr(2.4, 3.8), g = new THREE.CylinderGeometry(.5, .55, len, 12, 3);
    ragged(g, .3);
    pillarG.push(place(g, x, .48, z, a, 0, Math.PI / 2));
    const dx = Math.cos(a) * len / 2, dz = -Math.sin(a) * len / 2;
    for (let k = -1; k <= 1; k++) colliders.circles.push({x: x + dx * k * .8, z: z + dz * k * .8, r: .6});
    occ.push({x, z, r: len * .6, k: .4});
  }

  // —— 北侧祭坛：三层台阶 + 方尖碑，碑顶一颗暗红晶石 ——
  const ax = 0, az = -19.5;
  for (let s = 0; s < 3; s++) {
    const w = 8 - s * 2, g = ragged(new THREE.BoxGeometry(w, .45, w * .7, 4, 1, 3), .05).translate(0, .225 + s * .45, 0);
    darkStoneG.push(place(g, ax, 0, az));
  }
  const ob = new THREE.CylinderGeometry(.35, .9, 5.5, 4, 4).translate(0, 1.35 + 2.75, 0);
  darkStoneG.push(place(ob, ax, 0, az, Math.PI / 4));
  colliders.boxes.push({x0: ax - 4, x1: ax + 4, z0: az - 2.8, z1: az + 2.8});
  occ.push({x: ax, z: az, r: 4.5, k: .4});
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(.55, 0), new THREE.MeshStandardMaterial({color: 0x220406, emissive: 0xff2a18, emissiveIntensity: 4, roughness: .15, metalness: .2}));
  crystal.position.set(ax, 7.6, az); crystal.scale.set(1, 1.8, 1); scene.add(crystal);
  const altarLight = new THREE.PointLight(0xff3020, 18, 18, 2); altarLight.position.set(ax, 6.8, az + 1); scene.add(altarLight);

  // —— 墓园：东南、西南角的墓碑和石棺 ——
  const grave = (x, z) => {
    const h = rr(.9, 1.6), w = rr(.6, .95);
    const g = ragged(new THREE.BoxGeometry(w, h, .22, 3, 3, 1), .25).translate(0, h / 2, 0);
    const tilt = (rnd() - .5) * .35;
    darkStoneG.push(place(g, x, -.05, z, rr(-.3, .3), tilt * .5, tilt));
    colliders.circles.push({x, z, r: .45});
    occ.push({x, z, r: .9, k: .35});
  };
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { grave(13 + i * 2.1 + rr(-.3, .3), 12 + j * 2.6 + rr(-.3, .3)); grave(-13 - i * 2.1 + rr(-.3, .3), 12 + j * 2.6 + rr(-.3, .3)); }
  for (const [x, z, a] of [[-20, 4, 0], [20, 3, .2]]) {
    const g = mergeGeometries([new THREE.BoxGeometry(1.4, .8, 2.6).translate(0, .4, 0).toNonIndexed(), ragged(new THREE.BoxGeometry(1.6, .3, 2.8), .08).translate(.15, .95, .1).toNonIndexed()]);
    darkStoneG.push(place(g, x, 0, z, a));
    colliders.boxes.push({x0: x - .9, x1: x + .9, z0: z - 1.5, z1: z + 1.5});
    occ.push({x, z, r: 2, k: .45});
  }

  // —— 枯树：随机分叉的树干，夜里只剩剪影 ——
  const branch = (out, x, y, z, dir, len, r, depth) => {
    const end = new THREE.Vector3(x, y, z).addScaledVector(dir, len);
    const g = new THREE.CylinderGeometry(r * .7, r, len, 6, 1);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(q).setPosition(x, y, z));
    out.push(g);
    if (depth <= 0) return;
    const n = depth > 2 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const d = dir.clone().add(new THREE.Vector3(rr(-.9, .9), rr(-.1, .5), rr(-.9, .9))).normalize();
      branch(out, end.x, end.y, end.z, d, len * rr(.55, .8), r * .62, depth - 1);
    }
  };
  for (const [x, z] of [[-23, -10], [23, 9], [-9, 23], [10, -23]]) {
    const parts = [];
    branch(parts, x, 0, z, new THREE.Vector3(rr(-.15, .15), 1, rr(-.15, .15)).normalize(), rr(2.6, 3.4), .38, 4);
    woodG.push(mergeGeometries(parts));
    colliders.circles.push({x, z, r: .5});
    occ.push({x, z, r: 1.2, k: .4});
  }

  // —— 火盆：铁碗 + 三条腿，碗里的炭块发光，上方一盏会闪烁的火光 ——
  const braziers = [];
  const bowlPts = [[0, 0], [.32, .02], [.55, .18], [.62, .42], [.58, .46]].map(([a, b]) => new THREE.Vector2(a, b));
  for (const [x, z] of [[-7, -13], [7, -13], [-15.5, 0], [15.5, 0], [-7, 13.5], [7, 13.5]]) {
    const bowl = new THREE.LatheGeometry(bowlPts, 14).translate(0, 1.05, 0);
    const legs = [0, 1, 2].map(k => { const a = k * 2.094; const g = new THREE.CylinderGeometry(.045, .05, 1.2, 5); g.translate(0, .55, 0); g.applyMatrix4(new THREE.Matrix4().makeRotationZ(.18)); g.applyMatrix4(new THREE.Matrix4().makeRotationY(a)); g.translate(Math.cos(a) * .25, 0, -Math.sin(a) * .25); return g.toNonIndexed(); });
    const ring = new THREE.TorusGeometry(.6, .035, 5, 18).rotateX(Math.PI / 2).translate(0, 1.5, 0);
    ironG.push(place(mergeGeometries([bowl.toNonIndexed(), ring.toNonIndexed(), ...legs]), x, 0, z));
    colliders.circles.push({x, z, r: .7});
    occ.push({x, z, r: 1.4, k: .35});
    const light = new THREE.PointLight(0xff9448, 13, 15, 2);
    light.position.set(x, 2.1, z);
    if (quality !== 'low' && braziers.length < 2) { light.castShadow = true; light.shadow.mapSize.set(512, 512); light.shadow.bias = -.004; light.shadow.radius = 4; }
    scene.add(light);
    braziers.push({pos: new THREE.Vector3(x, 1.45, z), light, base: 13, ph: rnd() * 10});
  }
  const coalMat = new THREE.MeshStandardMaterial({color: 0x110805, emissive: 0xff5010, emissiveIntensity: 3, roughness: .9});
  const coals = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.1, 0), coalMat, braziers.length * 9);
  let ci = 0; const m4 = new THREE.Matrix4();
  for (const b of braziers) for (let k = 0; k < 9; k++) { const a = rnd() * 6.28, r = rnd() * .4; m4.compose(new THREE.Vector3(b.pos.x + Math.cos(a) * r, 1.35 + rnd() * .08, b.pos.z + Math.sin(a) * r), new THREE.Quaternion().random(), new THREE.Vector3(1, .7, 1).multiplyScalar(rr(.7, 1.4))); coals.setMatrixAt(ci++, m4); }
  scene.add(coals);

  // —— 碎石和骨头：散落在墙根、柱脚 ——
  const rubbleN = quality === 'low' ? 220 : 520;
  const rubble = new THREE.InstancedMesh(chunkGeo(.18), stoneMaterial({moss: .6, masonry: 0, tex: TX.rubble, scale: 1}), rubbleN);
  rubble.castShadow = rubble.receiveShadow = true;
  const anchors = [...colliders.circles.map(c => [c.x, c.z, c.r + .6]), ...colliders.boxes.map(b => [(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, Math.max(b.x1 - b.x0, b.z1 - b.z0) * .6])];
  for (let i = 0; i < rubbleN; i++) {
    const [cx, cz, cr] = rnd() < .8 ? anchors[Math.floor(rnd() * anchors.length)] : [rr(-ARENA, ARENA), rr(-ARENA, ARENA), 0];
    const a = rnd() * 6.28, d = cr + rnd() * 1.6, s = rr(.35, 1.8) * (rnd() < .08 ? 2.2 : 1);
    m4.compose(new THREE.Vector3(cx + Math.cos(a) * d, s * .05, cz + Math.sin(a) * d), new THREE.Quaternion().random(), new THREE.Vector3(s, s * rr(.4, .8), s * rr(.7, 1.2)));
    rubble.setMatrixAt(i, m4);
  }
  scene.add(rubble);
  const boneMat = new THREE.MeshStandardMaterial({color: 0x9d9180, roughness: .7});
  const bones = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.035, .38, 2, 5), boneMat, 90);
  const skulls = new THREE.InstancedMesh(new THREE.SphereGeometry(.12, 8, 6), boneMat, 18);
  for (let i = 0; i < 90; i++) { const [cx, cz] = anchors[Math.floor(rnd() * anchors.length)]; m4.compose(new THREE.Vector3(cx + rr(-2, 2), .04, cz + rr(-2, 2)), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, rnd() * 6.28)), new THREE.Vector3(1, rr(.6, 1.3), 1)); bones.setMatrixAt(i, m4); }
  for (let i = 0; i < 18; i++) { const [cx, cz] = anchors[Math.floor(rnd() * anchors.length)]; m4.compose(new THREE.Vector3(cx + rr(-1.6, 1.6), .1, cz + rr(-1.6, 1.6)), new THREE.Quaternion().random(), new THREE.Vector3(1, .85, 1.15)); skulls.setMatrixAt(i, m4); }
  bones.castShadow = skulls.castShadow = true;
  scene.add(bones, skulls);

  // —— 合并几何体，每种材质一个绘制调用 ——
  const add = (list, mat) => { if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list.map(g => g.index ? g.toNonIndexed() : g)), mat); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  add(stoneG, stoneMaterial({moss: 1, tex: TX.wall}));
  add(pillarG, stoneMaterial({moss: .8, tex: TX.pillar}));
  add(darkStoneG, stoneMaterial({tint: 0x8a8580, moss: .5, scale: 1.3, tex: TX.pillar}));

  // —— 散落的砌块：墙根、柱脚、门洞边上的大块落石（真几何体，不是贴图）——
  const blockN = quality === 'low' ? 70 : 180;
  const blocks = new THREE.InstancedMesh(chunkGeo(.5, true), stoneMaterial({moss: .7, masonry: 0, tex: TX.wall || TX.rubble}), blockN);
  blocks.castShadow = blocks.receiveShadow = true;
  const wallAnch = colliders.boxes.filter(b => Math.max(Math.abs(b.x0 + b.x1), Math.abs(b.z0 + b.z1)) / 2 > ARENA - 3);
  for (let i = 0; i < blockN; i++) {
    const b = rnd() < .75 ? wallAnch[Math.floor(rnd() * wallAnch.length)] : null;
    let x, z;
    if (b) { const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, inward = -Math.sign(Math.abs(cx) > Math.abs(cz) ? cx : cz);
      x = Math.abs(cx) > Math.abs(cz) ? cx + inward * rr(.9, 2.6) : rr(b.x0, b.x1); z = Math.abs(cx) > Math.abs(cz) ? rr(b.z0, b.z1) : cz + inward * rr(.9, 2.6); }
    else { const c = colliders.circles[Math.floor(rnd() * colliders.circles.length)], a = rnd() * 6.28, d = c.r + rr(.3, 1.5); x = c.x + Math.cos(a) * d; z = c.z + Math.sin(a) * d; }
    const sx = rr(.5, 1.1), sy = rr(.35, .6), sz = rr(.45, .8);
    m4.compose(new THREE.Vector3(x, sy * .22, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-.3, .3), rnd() * 6.28, rr(-.3, .3))), new THREE.Vector3(sx, sy, sz));
    blocks.setMatrixAt(i, m4);
  }
  scene.add(blocks);
  add(ironG, ironMaterial());
  add(woodG, stoneMaterial({tint: 0x5a4636, moss: .3, scale: 3, wet: .3, masonry: 0}));

  // —— 地面 ——
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140, 1, 1).rotateX(-Math.PI / 2), groundMaterial(occ.slice(0, 96), TX));
  ground.receiveShadow = true;
  scene.add(ground);

  // —— 地面薄雾：贴地缓缓流动的冷雾 ——
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {uTime: {value: 0}},
    vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `#define FBM_OCT 4
      uniform float uTime; varying vec3 vW;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y); }
      float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.1; a*=.5; } return s; }
      void main(){ vec2 p=vW.xz*.09; float n=fbm(p+vec2(uTime*.025,uTime*.012)+fbm(p*1.7-uTime*.02));
        float a=smoothstep(.38,.85,n)*.22*(1.-smoothstep(20.,40.,length(vW.xz)));
        gl_FragColor=vec4(vec3(.11,.13,.17),a); }`
  }));
  mist.position.y = .18; mist.renderOrder = 2;
  scene.add(mist);

  // —— 光：冷月光（投影）+ 天光 ——
  const hemi = new THREE.HemisphereLight(0x34405a, 0x16100c, 1.05);
  const moon = new THREE.DirectionalLight(0xb4c2e2, 2.3);
  moon.castShadow = true;
  const sm = quality === 'low' ? 1024 : quality === 'medium' ? 2048 : 3072;
  moon.shadow.mapSize.set(sm, sm);
  Object.assign(moon.shadow.camera, {left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90});
  moon.shadow.bias = -.0006; moon.shadow.normalBias = .03; moon.shadow.radius = 3;
  scene.add(hemi, moon, moon.target);
  const moonDir = new THREE.Vector3(-.45, .75, -.5).normalize();

  return {
    colliders, gates, braziers, crystal, altarLight, mist, moon, ground,
    update(t, focus) {
      mist.material.uniforms.uTime.value = t;
      moon.position.copy(focus).addScaledVector(moonDir, 45);
      moon.target.position.copy(focus);
      for (const b of braziers) b.light.intensity = b.base * (.82 + .12 * Math.sin(t * 9 + b.ph) + .08 * Math.sin(t * 23.7 + b.ph * 2) + .05 * Math.sin(t * 41 + b.ph));
      crystal.rotation.y = t * .6; crystal.position.y = 7.6 + Math.sin(t * 1.3) * .12;
      altarLight.intensity = 15 + Math.sin(t * 1.7) * 5;
    }
  };
}
