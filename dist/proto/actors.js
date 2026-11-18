/* 归墟 3D 小样 · 纯代码建模的骨骼角色
 * 骨架和动作数据借自 KayKit Character Pack: Skeletons（CC0，models/rig/humanoid.glb，模型和贴图已剥掉），
 * 先把骨长改成写实比例，再在骨头上用代码"捏"出身体、衣服、武器，蒙皮后直接用那套动作。
 * 所有角色朝 +Z，左手在 +X。 */
import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {clone as skClone} from '../vendor/utils/SkeletonUtils.js';
import {mergeGeometries} from '../vendor/utils/BufferGeometryUtils.js';
import {NOISE} from './glsl.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const C = (r, g, b) => new THREE.Color(r, g, b);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ───────── JS 端噪声（几何起伏、颜色斑驳用） ───────── */
const fr = x => x - Math.floor(x);
const h3 = (x, y, z) => fr(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
function vn(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(ix, iy, iz), h3(ix + 1, iy, iz), fx), L(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), fx), fy),
    L(L(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), fx), L(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
const fbm = (p, f = 1) => vn(p.x * f, p.y * f, p.z * f) * .5 + vn(p.x * f * 2.1 + 5, p.y * f * 2.1, p.z * f * 2.1) * .3 + vn(p.x * f * 4.3, p.y * f * 4.3 + 9, p.z * f * 4.3) * .2;

/* ───────── 材质（全部共享；每个实例在 char.js 里克隆一份用于受击闪白、冰冻变色） ───────── */
const MAT_GLSL = {
  cloth: `float f=fbm3(vOP*vec3(14.,3.,14.)); col*=.78+.4*fbm3(vOP*5.); col*=1.-smoothstep(.55,.8,fbm3(vOP*2.3+3.))*.35;
          hgt=f*.008+vnoise3(vOP*90.)*.0008; rgh=.9;`,
  bone: `float g=fbm3(vOP*7.); col*=.72+.42*g; col=mix(col,col*vec3(.55,.45,.32),smoothstep(.5,.8,fbm3(vOP*3.+7.))*.7);
         hgt=g*.003-smoothstep(.62,.66,vnoise3(vOP*24.))*.002; rgh=.48+.3*g;`,
  skin: `float g=fbm3(vOP*6.); col*=.8+.35*g; col=mix(col,col*vec3(.55,.35,.38),smoothstep(.55,.75,fbm3(vOP*3.5+11.))*.6);
         col=mix(col,vec3(.18,.02,.015),smoothstep(.7,.78,fbm3(vOP*4.+21.))*.8);
         hgt=g*.004+vnoise3(vOP*60.)*.0012; rgh=.55+.2*g;`,
  leather: `float g=fbm3(vOP*12.); col*=.75+.45*g; hgt=vnoise3(vOP*70.)*.0015; rgh=.62+.2*g;`,
  metal: `float rs=smoothstep(.42,.7,fbm3(vOP*6.+2.)); col=mix(col,vec3(.16,.07,.03),rs); mtl=mix(.9,.25,rs);
          hgt=rs*vnoise3(vOP*80.)*.002; rgh=mix(.32,.85,rs);`,
  gold: `float g=fbm3(vOP*9.); col*=.8+.3*g; col=mix(col,col*.35,smoothstep(.6,.8,fbm3(vOP*5.))*.6); mtl=.95; rgh=.28+.25*g; hgt=0.;`,
  wood: `float g=vnoise3(vOP*vec3(70.,5.,70.)); col*=.65+.5*g; hgt=g*.002; rgh=.75;`,
  hair: `float g=vnoise3(vOP*vec3(120.,30.,120.)); col*=.7+.5*g; hgt=g*.002; rgh=.55;`,
};
let MATS = null;
function makeMats() {
  const mk = (kind, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, ...extra});
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP=position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
#define FBM_OCT 3
varying vec3 vOP;
${NOISE}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 col=diffuseColor.rgb; float hgt=0., rgh=.8, mtl=0.;
  ${MAT_GLSL[kind]}
  diffuseColor.rgb=col;`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor=rgh;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor=mtl;')
        .replace('#include <normal_fragment_maps>', 'normal=bumpN(normal,hgt,-vViewPosition);')
        // 轮廓光：夜里角色从背景里跳出来（暗黑 4 的人物都有一圈冷色边光）
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  float rim=pow(1.-clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.),3.);\n  totalEmissiveRadiance+=vec3(.32,.4,.62)*rim*.45*(.4+.6*diffuseColor.g);');
    };
    m.customProgramCacheKey = () => 'actor-' + kind;
    m.name = kind;
    return m;
  };
  MATS = {};
  for (const k of Object.keys(MAT_GLSL)) MATS[k] = mk(k);
  MATS.glow = new THREE.MeshBasicMaterial({vertexColors: true, color: new THREE.Color(4, 4, 4), toneMapped: false, name: 'glow'});
  return MATS;
}

/* ───────── 几何体（都直接生成在模型空间，即绑定姿态下的世界坐标） ───────── */
function basis(dir, ref) {
  const r = ref || (Math.abs(dir.y) < .92 ? V(0, 1, 0) : V(0, 0, 1));
  const p1 = new THREE.Vector3().crossVectors(dir, r).normalize(), p2 = new THREE.Vector3().crossVectors(p1, dir).normalize();
  return [p1, p2];
}
/** 两点之间的管子：r0→r1，prof(t) 再乘一个轮廓（骨节、肌肉），sx/sz 压扁，noise 表面起伏 */
function tube(a, b, r0, r1, {seg = 10, rings = 6, prof = null, sx = 1, sz = 1, ref = null, noise = 0, nf = 9, open = false} = {}) {
  const g = new THREE.CylinderGeometry(1, 1, 1, seg, rings, open);
  const dir = b.clone().sub(a), len = dir.length(); dir.normalize();
  const [p1, p2] = basis(dir, ref), p = g.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = y + .5;
    const r = lerp(r0, r1, t) * (prof ? prof(t) : 1);
    v.copy(a).addScaledVector(dir, t * len).addScaledVector(p1, x * r * sx).addScaledVector(p2, z * r * sz);
    if (noise) { const k = 1 + (fbm(v, nf) - .5) * noise; v.sub(a).sub(dir.clone().multiplyScalar(t * len)).multiplyScalar(k).add(a).addScaledVector(dir, t * len); }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
/** 椭球：可旋转（q），可起伏 */
function ell(c, rx, ry, rz, {seg = 14, q = null, noise = 0, nf = 8, cut = null} = {}) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg * .7 | 0));
  const p = g.attributes.position, v = V();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) * rx, p.getY(i) * ry, p.getZ(i) * rz);
    if (cut) cut(v);
    if (q) v.applyQuaternion(q);
    if (noise) v.multiplyScalar(1 + (fbm(v.clone().add(c), nf) - .5) * noise);
    v.add(c); p.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
function box(c, sx, sy, sz, {q = null, div = 1, noise = 0} = {}) {
  const g = new THREE.BoxGeometry(sx, sy, sz, div, div, div);
  if (noise) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = (h3(p.getX(i) * 31, p.getY(i) * 37, p.getZ(i) * 41) - .5) * noise; p.setXYZ(i, p.getX(i) * (1 + k), p.getY(i) * (1 + k), p.getZ(i) * (1 + k)); } }
  if (q) g.applyQuaternion(q);
  g.translate(c.x, c.y, c.z);
  return g;
}
/** 围着竖轴转出来的衣服：袍身、裙摆、斗篷。rfn(t,ang) 给半径，t=0 在 y0，ang=0 朝前（+Z） */
function lathe(cx, cz, y0, y1, rfn, {seg = 28, rings = 12, a0 = 0, a1 = Math.PI * 2, zk = .82, dy = null} = {}) {
  const pos = [], idx = [], full = Math.abs(a1 - a0 - Math.PI * 2) < 1e-3;
  const cols = full ? seg : seg + 1;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    for (let j = 0; j < cols; j++) {
      const ang = a0 + (a1 - a0) * j / seg, r = rfn(t, ang);
      pos.push(cx + Math.sin(ang) * r, lerp(y0, y1, t) + (dy ? dy(t, ang) : 0), cz + Math.cos(ang) * r * zk);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * cols + j, b = i * cols + (j + 1) % cols, c = a + cols, d = b + cols;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}
/** 沿折线的细管（肋骨、王冠尖刺用） */
function curveTube(pts, r, {seg = 12, rad = 6, taper = 1} = {}) {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rad, false);
  if (taper !== 1) {
    const p = g.attributes.position, uv = g.attributes.uv, curve = new THREE.CatmullRomCurve3(pts);
    for (let i = 0; i < p.count; i++) { const t = uv.getX(i), c = curve.getPointAt(t), v = V(p.getX(i), p.getY(i), p.getZ(i)); v.sub(c).multiplyScalar(lerp(1, taper, t)).add(c); p.setXYZ(i, v.x, v.y, v.z); }
  }
  return g;
}

/* ───────── 捏人：骨架改比例 → 往骨头上挂零件 → 合成一个蒙皮网格 ───────── */
const HUMAN = {hip: .93, hipX: .095, spine: .13, chest: .22, neck: .26, shX: .175, shY: .2, upperArm: .29, foreArm: .26, wrist: .05, thigh: .44, shin: .42, foot: .13};

class Build {
  constructor(rig, P, scale) {
    this.root = skClone(rig.scene);
    this.root.traverse(o => { if (o.name) o.userData.bone = true; });
    const b = n => this.root.getObjectByName(n);
    const S = k => P[k] * scale;
    const setLen = (n, len) => b(n).position.setLength(len);
    b('hips').position.set(0, S('hip'), 0);
    setLen('spine', S('spine')); setLen('chest', S('chest')); setLen('head', S('neck'));
    for (const s of ['l', 'r']) {
      const sx = s === 'l' ? 1 : -1;
      b('upperarm' + s).position.set(sx * S('shX'), S('shY'), 0);
      setLen('lowerarm' + s, S('upperArm')); setLen('wrist' + s, S('foreArm')); setLen('hand' + s, S('wrist'));
      b('handslot' + s).position.multiplyScalar(scale);
      b('upperleg' + s).position.set(sx * S('hipX'), 0, 0);
      setLen('lowerleg' + s, S('thigh')); setLen('foot' + s, S('shin')); setLen('toes' + s, S('foot'));
    }
    this.hipK = S('hip') / .406;
    this.root.updateMatrixWorld(true);
    this.bones = []; this.bi = {};
    this.root.traverse(o => { if (o !== this.root && o.userData.bone && o.parent && o.parent !== this.root) { this.bi[o.name] = this.bones.length; this.bones.push(o); } });
    this.parts = {};
  }
  p(n) { return new THREE.Vector3().setFromMatrixPosition(this.root.getObjectByName(n).matrixWorld); }
  m(n) { return this.root.getObjectByName(n).matrixWorld.clone(); }
  /** 挂零件：w 是骨头名（刚性），或 (pos)=>[[骨头, 权重],…]；col 是颜色或 (pos)=>Color */
  add(g, mat, w, col) {
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.computeVertexNormals();
    const p = g.attributes.position, n = p.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), cl = new Float32Array(n * 3);
    const v = V(), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(p, i);
      let ws = typeof w === 'string' ? [[w, 1]] : w(v);
      ws = ws.filter(x => x[1] > .001).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const tot = ws.reduce((s, x) => s + x[1], 0) || 1;
      ws.forEach(([bn, ww], k) => { const id = this.bi[bn]; if (id === undefined) throw new Error('no bone ' + bn); si[i * 4 + k] = id; sw[i * 4 + k] = ww / tot; });
      if (typeof col === 'function') c.copy(col(v)); else c.copy(col);
      cl[i * 3] = c.r; cl[i * 3 + 1] = c.g; cl[i * 3 + 2] = c.b;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    (this.parts[mat] ||= []).push(g);
  }
  /** 在某根骨头的局部坐标里建零件（武器挂在手上用） */
  addLocal(g, mat, bone, col) { g.applyMatrix4(this.m(bone)); this.add(g, mat, bone, col); }
  finish(mats) {
    const geos = [], ms = [];
    for (const [k, list] of Object.entries(this.parts)) { geos.push(mergeGeometries(list)); ms.push(mats[k]); }
    const geo = mergeGeometries(geos, true);
    const mesh = new THREE.SkinnedMesh(geo, ms);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.root.add(mesh);
    this.root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    return mesh;
  }
}

/* 两段之间的平滑权重：按点在 a→b 线段上的投影位置，从骨头 A 过渡到 B */
function blendAlong(a, b, nA, nB, soft = .35) {
  const d = b.clone().sub(a), L2 = d.lengthSq();
  return v => { const t = v.clone().sub(a).dot(d) / L2; const k = sstep(.5 - soft, .5 + soft, t); return [[nA, 1 - k], [nB, k]]; };
}
/* 躯干：髋→腰→胸 按高度过渡 */
function torsoW(B) {
  const yh = B.p('hips').y, ys = B.p('spine').y, yc = B.p('chest').y;
  return v => {
    if (v.y < ys) { const k = sstep(yh - .02, ys + .03, v.y); return [['hips', 1 - k], ['spine', k]]; }
    const k = sstep(ys, yc + .04, v.y); return [['spine', 1 - k], ['chest', k]];
  };
}
/* 长袍下摆：越往下越跟着腿走，左右按 x 分 */
function skirtW(B, y0, y1) {
  return v => {
    const t = Math.min(1, Math.max(0, (y0 - v.y) / (y0 - y1)));
    const side = sstep(-.06, .06, v.x);                // 1 = 左腿（+X）
    const hipW = 1 - sstep(0, .5, t) * .9, legW = 1 - hipW, low = sstep(.5, .95, t);
    return [['hips', hipW], ['upperlegl', legW * side * (1 - low)], ['upperlegr', legW * (1 - side) * (1 - low)], ['lowerlegl', legW * side * low], ['lowerlegr', legW * (1 - side) * low]];
  };
}
const knob = (a = .6, w = 14) => t => 1 + a * (Math.exp(-t * w) + Math.exp(-(1 - t) * w));

/* ───────── 部件：人类的头、手、脚 ───────── */
function humanHead(B, s, skin, {hair = null, jawOpen = 0, eyes = C(.02, .015, .012), glowEyes = null, beardless = true} = {}) {
  const h = B.p('head');
  B.add(tube(B.p('chest').add(V(0, .12 * s, -.01 * s)), h.clone().add(V(0, .06 * s, 0)), .055 * s, .05 * s, {seg: 8, rings: 2}), 'skin', 'head', skin);
  B.add(ell(h.clone().add(V(0, .135 * s, .005 * s)), .088 * s, .112 * s, .1 * s, {seg: 16, noise: .04}), 'skin', 'head', skin);
  B.add(ell(h.clone().add(V(0, (.07 - jawOpen) * s, .035 * s)), .066 * s, .055 * s, .07 * s, {seg: 12}), 'skin', 'head', skin);  // 下巴
  B.add(ell(h.clone().add(V(0, .125 * s, .1 * s)), .016 * s, .028 * s, .02 * s, {seg: 8}), 'skin', 'head', skin);                // 鼻梁
  for (const sx of [-1, 1]) {
    B.add(ell(h.clone().add(V(sx * .036 * s, .145 * s, .088 * s)), .017 * s, .011 * s, .01 * s, {seg: 8}), glowEyes ? 'glow' : 'skin', 'head', glowEyes || eyes);
    B.add(ell(h.clone().add(V(sx * .09 * s, .13 * s, 0)), .012 * s, .026 * s, .016 * s, {seg: 8}), 'skin', 'head', skin);       // 耳朵
  }
  if (hair) B.add(ell(h.clone().add(V(0, .165 * s, -.018 * s)), .097 * s, .1 * s, .11 * s, {seg: 16, noise: .12, nf: 14,
    cut: v => { if (v.z > .03 * s && v.y < .02 * s) v.z = .03 * s + (v.z - .03 * s) * .2; }}), 'hair', 'head', hair);
}
function hands(B, s, col, mat = 'skin', claw = 0) {
  for (const sd of ['l', 'r']) {
    const a = B.p('hand' + sd), dir = B.p('handslot' + sd).sub(a).normalize();
    B.add(ell(a.clone().addScaledVector(dir, .045 * s), .028 * s, .05 * s, .045 * s, {seg: 10, q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), B.p('hand' + sd).sub(B.p('wrist' + sd)).normalize())}), mat, 'hand' + sd, col);
    if (claw) for (let k = -1; k <= 1; k++) {
      const b0 = a.clone().addScaledVector(B.p('hand' + sd).sub(B.p('wrist' + sd)).normalize(), .08 * s).add(V(0, 0, k * .022 * s));
      const b1 = b0.clone().addScaledVector(B.p('hand' + sd).sub(B.p('wrist' + sd)).normalize(), claw * s).add(V(0, -.03 * s, 0));
      B.add(tube(b0, b1, .009 * s, .001, {seg: 5, rings: 2}), 'bone', 'hand' + sd, C(.5, .44, .34));
    }
  }
}
function feet(B, s, col, mat = 'leather', bootTop = .32) {
  for (const sd of ['l', 'r']) {
    const f = B.p('foot' + sd), t = B.p('toes' + sd);
    const fw = t.clone().sub(f).setY(0).normalize();
    B.add(tube(f.clone().addScaledVector(fw, -.04 * s).setY(f.y), t.clone().addScaledVector(fw, .05 * s).setY(.035 * s), .05 * s, .042 * s, {seg: 10, sx: 1, sz: .7, ref: V(0, 1, 0)}), mat, 'foot' + sd, col);
    if (bootTop) B.add(tube(f.clone().setY(.02 * s), B.p('lowerleg' + sd).lerp(f, 1 - bootTop), .056 * s, .05 * s, {seg: 10, rings: 3}), mat, 'lowerleg' + sd, col);
  }
}
function limbs(B, s, {arm = [.05, .042, .045, .033], leg = [.075, .06, .055, .042], armMat = 'skin', legMat = 'skin', armCol, legCol, noise = 0} = {}) {
  for (const sd of ['l', 'r']) {
    B.add(tube(B.p('upperarm' + sd), B.p('lowerarm' + sd), arm[0] * s, arm[1] * s, {seg: 10, noise, prof: t => 1 + .15 * Math.sin(t * Math.PI)}), armMat, 'upperarm' + sd, armCol);
    B.add(ell(B.p('lowerarm' + sd), arm[1] * s * 1.05, arm[1] * s * 1.05, arm[1] * s * 1.05, {seg: 10}), armMat, 'lowerarm' + sd, armCol);
    B.add(tube(B.p('lowerarm' + sd), B.p('hand' + sd), arm[2] * s, arm[3] * s, {seg: 10, noise}), armMat, 'lowerarm' + sd, armCol);
    B.add(tube(B.p('upperleg' + sd).add(V(0, .04 * s, 0)), B.p('lowerleg' + sd), leg[0] * s, leg[1] * s, {seg: 12, noise, prof: t => 1 + .1 * Math.sin(t * Math.PI)}), legMat, 'upperleg' + sd, legCol);
    B.add(ell(B.p('lowerleg' + sd), leg[1] * s * 1.05, leg[1] * s * 1.1, leg[1] * s * 1.05, {seg: 10}), legMat, 'lowerleg' + sd, legCol);
    B.add(tube(B.p('lowerleg' + sd), B.p('foot' + sd), leg[2] * s, leg[3] * s, {seg: 10, noise, prof: t => 1 + .18 * Math.exp(-((t - .25) ** 2) * 30)}), legMat, 'lowerleg' + sd, legCol);
  }
}

/* ───────── 角色 ───────── */
const DEFS = {};

/* 主角：白袍年轻法师 */
DEFS.mage = {scale: 1, height: 1.82, runSpeed: 5.2, build(B, s) {
  const skin = C(.62, .45, .36), robe = C(.78, .76, .7), trim = C(.75, .55, .22), dark = C(.16, .12, .09);
  humanHead(B, s, skin, {hair: C(.07, .05, .035)});
  limbs(B, s, {armCol: skin, legCol: C(.25, .22, .2), legMat: 'cloth'});
  hands(B, s, skin);
  feet(B, s, dark, 'leather', .45);
  const hy = B.p('hips').y, cy = B.p('chest').y, waist = hy + .06 * s;
  // 上身袍子
  B.add(lathe(0, -.005 * s, waist - .02 * s, cy + .21 * s, (t, a) => lerp(.15, .19, sstep(0, .6, t)) * (1 - sstep(.78, 1, t) * .62) * s * (1 + .03 * Math.cos(a * 2)), {seg: 26, rings: 12, zk: .7}),
    'cloth', torsoW(B), robe);
  // 下摆：越往下越宽，下沿一圈金边、沾泥
  const y1 = .05 * s;
  B.add(lathe(0, 0, waist, y1, (t, a) => (lerp(.17, .34, t ** 1.3) + (vn(a * 3, t * 4, 1) - .5) * .02 * t) * s, {seg: 34, rings: 16, zk: .78}),
    'cloth', skirtW(B, waist, y1), v => v.y < y1 + .06 * s ? trim : robe.clone().multiplyScalar(lerp(.55, 1, sstep(.04, .45, v.y / s))));
  // 腰带 + 金扣
  B.add(tube(V(0, waist + .015 * s, 0), V(0, waist + .065 * s, 0), .178 * s, .178 * s, {seg: 26, rings: 1, sz: .74, open: true}), 'leather', 'hips', C(.2, .13, .08));
  B.add(box(V(0, waist + .04 * s, .135 * s), .06 * s, .055 * s, .02 * s), 'gold', 'hips', trim);
  // 披肩 + 背后斗篷
  B.add(lathe(0, -.01 * s, cy + .24 * s, cy + .02 * s, t => lerp(.11, .26, t ** .8) * s, {seg: 28, rings: 6, zk: .78}), 'cloth', 'chest', v => v.y < cy + .045 * s ? trim : robe);
  B.add(lathe(0, -.04 * s, cy + .18 * s, .42 * s, (t, a) => lerp(.2, .36, t) * s + (vn(a * 4, t * 6, 3) - .5) * .02 * s, {seg: 18, rings: 14, a0: Math.PI * .62, a1: Math.PI * 1.38, zk: .75}),
    'cloth', v => v.y > B.p('spine').y ? torsoW(B)(v) : [['hips', .7], ['spine', .3]], v => v.y < .5 * s ? robe.clone().multiplyScalar(.75) : robe);
  // 宽袖
  for (const sd of ['l', 'r']) {
    B.add(tube(B.p('upperarm' + sd).lerp(B.p('chest'), .1), B.p('lowerarm' + sd), .072 * s, .07 * s, {seg: 12}), 'cloth', 'upperarm' + sd, robe);
    B.add(tube(B.p('lowerarm' + sd), B.p('wrist' + sd).lerp(B.p('hand' + sd), .3), .072 * s, .12 * s, {seg: 14, open: true}), 'cloth', 'lowerarm' + sd,
      v => v.distanceTo(B.p('wrist' + sd)) < .05 * s ? trim : robe);
    B.add(ell(B.p('upperarm' + sd), .074 * s, .07 * s, .074 * s, {seg: 12}), 'cloth', blendAlong(B.p('chest'), B.p('lowerarm' + sd), 'chest', 'upperarm' + sd, .3), robe);
  }
  // 法杖：右手，深色木杖，杖头金属爪托着发光的水晶
  const st = new THREE.Group();
  const addS = (g, mat, col) => { B.addLocal(g, mat, 'handslotr', col); };
  addS(tube(V(0, -.85 * s, 0), V(0, .82 * s, 0), .018 * s, .022 * s, {seg: 8, rings: 12, noise: .15, nf: 30}), 'wood', C(.2, .12, .07));
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; addS(curveTube([V(0, .8 * s, 0), V(Math.cos(a) * .05 * s, .9 * s, Math.sin(a) * .05 * s), V(Math.cos(a) * .03 * s, 1.0 * s, Math.sin(a) * .03 * s)], .007 * s, {taper: .3}), 'gold', trim); }
  addS(ell(V(0, .93 * s, 0), .035 * s, .065 * s, .035 * s, {seg: 6}), 'glow', C(.55, .8, 1.3));
  addS(tube(V(0, .76 * s, 0), V(0, .82 * s, 0), .026 * s, .03 * s, {seg: 8, rings: 1}), 'gold', trim);
  st.clear();
}, clips: {idle: 'Idle', run: 'Running_A', walk: 'Walking_A', cast: 'Spellcast_Shoot', cast2: 'Spellcast_Raise', hit: 'Hit_A', die: 'Death_A'}};

/* 骷髅：真骨头——头骨、脊椎、肋骨、骨盆、四肢长骨，生锈的剑和破木盾，眼窝里一点鬼火 */
function skeletonBody(B, s, {boneCol = C(.66, .6, .48), eye = C(1.4, .45, .1), thick = 1} = {}) {
  const bc = boneCol, th = thick;
  const h = B.p('head');
  // 头骨：颅顶 + 面骨 + 下颌，眼窝和鼻孔是暗色凹坑
  B.add(ell(h.clone().add(V(0, .15 * s, -.01 * s)), .088 * s, .095 * s, .105 * s, {seg: 16, noise: .05}), 'bone', 'head', bc);
  B.add(ell(h.clone().add(V(0, .095 * s, .045 * s)), .066 * s, .06 * s, .06 * s, {seg: 12}), 'bone', 'head', bc);
  B.add(box(h.clone().add(V(0, .045 * s, .045 * s)), .1 * s, .03 * s, .085 * s, {div: 2, noise: .1}), 'bone', 'head', bc);
  for (const sx of [-1, 1]) {
    B.add(ell(h.clone().add(V(sx * .035 * s, .13 * s, .085 * s)), .026 * s, .022 * s, .016 * s, {seg: 8}), 'bone', 'head', C(.03, .025, .02));
    B.add(ell(h.clone().add(V(sx * .035 * s, .13 * s, .09 * s)), .009 * s, .009 * s, .006 * s, {seg: 6}), 'glow', 'head', eye);
  }
  B.add(ell(h.clone().add(V(0, .095 * s, .1 * s)), .012 * s, .016 * s, .008 * s, {seg: 6}), 'bone', 'head', C(.03, .025, .02));
  for (let k = -3; k <= 3; k++) B.add(box(h.clone().add(V(k * .012 * s, .07 * s, .098 * s)), .009 * s, .016 * s, .008 * s), 'bone', 'head', bc.clone().multiplyScalar(1.1));
  // 脊椎：一节节椎骨
  const pts = [B.p('hips'), B.p('spine'), B.p('chest'), B.p('head')];
  const tw = torsoW(B);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 6; k++) {
    const c = pts[i].clone().lerp(pts[i + 1], k / 6).add(V(0, 0, -.05 * s));
    B.add(ell(c, .024 * s * th, .016 * s, .022 * s * th, {seg: 8}), 'bone', i === 2 ? 'chest' : v => tw(v), bc);
  }
  // 肋骨：从脊椎向两侧绕到胸前，越往下越短
  const cy = B.p('chest').y;
  for (let r = 0; r < 6; r++) {
    const y = cy + (.13 - r * .04) * s, w = (.13 - Math.abs(r - 1.5) * .008 - r * .006) * s, fz = (.1 - r * .008) * s;
    for (const sx of [-1, 1]) {
      const p = [V(sx * .02 * s, y, -.06 * s), V(sx * w * .9, y - .01 * s, -.04 * s), V(sx * w, y - .03 * s, .02 * s), V(sx * w * .7, y - .05 * s, fz * .85), V(sx * .03 * s, y - .06 * s, fz)];
      B.add(curveTube(r > 3 ? p.slice(0, 4) : p, .011 * s * th, {seg: 14, rad: 5}), 'bone', 'chest', bc);
    }
  }
  B.add(box(V(0, cy + .03 * s, .1 * s), .035 * s, .2 * s, .02 * s, {div: 2}), 'bone', 'chest', bc);   // 胸骨
  for (const sx of [-1, 1]) B.add(curveTube([V(sx * .02 * s, cy + .17 * s, .07 * s), V(sx * .1 * s, cy + .19 * s, .04 * s), B.p(sx > 0 ? 'upperarml' : 'upperarmr')], .012 * s * th, {seg: 8, rad: 5}), 'bone', 'chest', bc);  // 锁骨
  // 骨盆
  const hp = B.p('hips');
  for (const sx of [-1, 1]) B.add(ell(hp.clone().add(V(sx * .085 * s, .02 * s, 0)), .07 * s * th, .065 * s, .05 * s * th, {seg: 10, noise: .1, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sx * .5))}), 'bone', 'hips', bc);
  B.add(ell(hp.clone().add(V(0, .0, -.05 * s)), .045 * s, .07 * s, .03 * s, {seg: 8}), 'bone', 'hips', bc);
  // 四肢长骨：两头膨大的骨节
  for (const sd of ['l', 'r']) {
    B.add(tube(B.p('upperarm' + sd), B.p('lowerarm' + sd), .02 * s * th, .018 * s * th, {seg: 8, rings: 8, prof: knob(.9, 12)}), 'bone', 'upperarm' + sd, bc);
    for (const o of [-.012, .012]) B.add(tube(B.p('lowerarm' + sd).add(V(0, 0, o * s)), B.p('wrist' + sd).add(V(0, 0, o * s)), .011 * s * th, .01 * s * th, {seg: 6, rings: 6, prof: knob(.6, 14)}), 'bone', 'lowerarm' + sd, bc);
    B.add(ell(B.p('upperarm' + sd), .035 * s * th, .035 * s, .035 * s * th, {seg: 10}), 'bone', 'upperarm' + sd, bc);
    B.add(tube(B.p('upperleg' + sd), B.p('lowerleg' + sd), .026 * s * th, .022 * s * th, {seg: 8, rings: 8, prof: knob(.9, 12)}), 'bone', 'upperleg' + sd, bc);
    B.add(tube(B.p('lowerleg' + sd), B.p('foot' + sd), .022 * s * th, .016 * s * th, {seg: 8, rings: 8, prof: knob(.8, 12)}), 'bone', 'lowerleg' + sd, bc);
    B.add(ell(B.p('lowerleg' + sd), .032 * s * th, .03 * s, .03 * s * th, {seg: 8}), 'bone', 'lowerleg' + sd, bc);   // 膝盖骨
    // 手骨、脚骨：几根细骨
    const hd = B.p('hand' + sd), dirH = hd.clone().sub(B.p('wrist' + sd)).normalize();
    for (let k = -1.5; k <= 1.5; k++) B.add(tube(hd.clone().add(V(0, 0, k * .013 * s)), hd.clone().addScaledVector(dirH, .085 * s).add(V(0, -.012 * s, k * .016 * s)), .006 * s, .004 * s, {seg: 5, rings: 3, prof: knob(.6, 10)}), 'bone', 'hand' + sd, bc);
    const f = B.p('foot' + sd), t = B.p('toes' + sd), fw = t.clone().sub(f).setY(0).normalize();
    for (let k = -1.5; k <= 1.5; k++) B.add(tube(f.clone().setY(.03 * s).add(V(k * .012 * s, 0, 0)), t.clone().addScaledVector(fw, .05 * s).setY(.012 * s).add(V(k * .016 * s, 0, 0)), .009 * s, .006 * s, {seg: 5, rings: 3, prof: knob(.5, 10)}), 'bone', 'foot' + sd, bc);
  }
}
function loincloth(B, s, col) {
  const hy = B.p('hips').y;
  for (const fz of [1, -1]) {
    const g = lathe(0, 0, hy + .02 * s, hy - .38 * s, (t, a) => (.13 + t * .05) * s, {seg: 8, rings: 8, a0: fz > 0 ? -.55 : Math.PI - .55, a1: fz > 0 ? .55 : Math.PI + .55, zk: 1,
      dy: (t, a) => t > .6 ? (vn(a * 9, 1, fz * 4) - .3) * .12 * s * (t - .6) / .4 : 0});
    B.add(g, 'cloth', skirtW(B, hy, hy - .4 * s), col);
  }
  B.add(tube(V(0, hy + .0 * s, 0), V(0, hy + .04 * s, 0), .14 * s, .14 * s, {seg: 18, rings: 1, open: true, sz: .8}), 'leather', 'hips', C(.18, .12, .08));
}
function sword(B, s, {len = .75, w = .055, two = false} = {}) {
  const steel = C(.5, .5, .52), grip = C(.15, .09, .05);
  B.addLocal(box(V(0, (.12 + len / 2) * s, 0), w * s, len * s, .012 * s, {div: 3, noise: .05}), 'metal', 'handslotr', steel);
  B.addLocal(box(V(0, .1 * s, 0), (two ? .32 : .2) * s, .03 * s, .04 * s), 'metal', 'handslotr', C(.35, .3, .26));
  B.addLocal(tube(V(0, -.1 * s * (two ? 2 : 1), 0), V(0, .09 * s, 0), .018 * s, .018 * s, {seg: 6, rings: 3}), 'leather', 'handslotr', grip);
  B.addLocal(ell(V(0, -.11 * s * (two ? 2 : 1), 0), .03 * s, .03 * s, .03 * s, {seg: 8}), 'metal', 'handslotr', C(.35, .3, .26));
}
function shield(B, s) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  B.addLocal(tube(V(-.04 * s, 0, 0), V(.0, 0, 0), .27 * s, .27 * s, {seg: 22, rings: 1, ref: V(0, 1, 0), noise: .04, nf: 6}).applyQuaternion(new THREE.Quaternion()), 'wood', 'handslotl', C(.28, .17, .09));
  B.addLocal(tube(V(.002 * s, 0, 0), V(.012 * s, 0, 0), .275 * s, .275 * s, {seg: 22, rings: 1, open: true, ref: V(0, 1, 0)}), 'metal', 'handslotl', C(.32, .3, .28));
  B.addLocal(ell(V(.01 * s, 0, 0), .025 * s, .07 * s, .07 * s, {seg: 10}), 'metal', 'handslotl', C(.4, .36, .3));
  q.identity();
}
DEFS.skeleton = {scale: 1, height: 1.78, runSpeed: 3.2, build(B, s) {
  skeletonBody(B, s);
  loincloth(B, s, C(.32, .05, .04));
  sword(B, s);
  shield(B, s);
  // 左肩一块锈铁护肩
  const sh = B.p('upperarml');
  B.add(ell(sh.clone().add(V(.02 * s, .03 * s, 0)), .08 * s, .05 * s, .085 * s, {seg: 12, cut: v => { if (v.y < 0) v.y *= .15; }}), 'metal', 'upperarml', C(.32, .28, .24));
}, clips: {idle: 'Idle_Combat', run: 'Walking_D_Skeletons', walk: 'Walking_D_Skeletons', attack: '1H_Melee_Attack_Chop', hit: 'Hit_B', die: 'Death_C_Skeletons', spawn: 'Spawn_Ground_Skeletons'}};

/* 首领：冥河领主——巨大的骸骨王，锈金王冠、破烂长披风、双手巨剑，胸腔里烧着冥火 */
DEFS.lord = {scale: 1.85, height: 3.3, runSpeed: 3.2, build(B, s) {
  skeletonBody(B, s, {boneCol: C(.55, .52, .46), eye: C(.3, 1.2, 1.6), thick: 1.25});
  const h = B.p('head'), gold = C(.7, .5, .2), cy = B.p('chest').y;
  B.add(tube(h.clone().add(V(0, .19 * s, -.01 * s)), h.clone().add(V(0, .23 * s, -.01 * s)), .1 * s, .105 * s, {seg: 20, rings: 1, open: true, sz: 1.1}), 'gold', 'head', gold);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, r = .1 * s; B.add(tube(h.clone().add(V(Math.sin(a) * r, .22 * s, Math.cos(a) * r * 1.1 - .01 * s)), h.clone().add(V(Math.sin(a) * r * 1.1, (.3 + (k % 2) * .05) * s, Math.cos(a) * r * 1.2 - .01 * s)), .014 * s, .002 * s, {seg: 5, rings: 2}), 'gold', 'head', gold); }
  B.add(ell(V(0, cy + .03 * s, .0), .07 * s, .09 * s, .05 * s, {seg: 10}), 'glow', 'chest', C(.25, .9, 1.2));      // 胸腔冥火
  for (const sd of ['l', 'r']) {
    const sh = B.p('upperarm' + sd), sx = sd === 'l' ? 1 : -1;
    for (let k = 0; k < 3; k++) B.add(ell(sh.clone().add(V(sx * .02 * s, (.05 - k * .035) * s, 0)), (.11 - k * .015) * s, .045 * s, .11 * s, {seg: 12, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sx * (.35 + k * .1))), cut: v => { if (v.y < 0) v.y *= .2; }}), 'metal', 'upperarm' + sd, C(.22, .2, .2));
  }
  // 长披风：从肩后垂到地面，下沿撕裂
  B.add(lathe(0, -.06 * s, cy + .2 * s, .02 * s, (t, a) => lerp(.18, .42, t) * s, {seg: 22, rings: 16, a0: Math.PI * .55, a1: Math.PI * 1.45, zk: .8,
    dy: (t, a) => t > .75 ? vn(a * 7, 2, 5) * .25 * s * (t - .75) / .25 : 0}), 'cloth', v => v.y > B.p('spine').y ? torsoW(B)(v) : [['hips', .8], ['spine', .2]], v => C(.1, .05, .09).multiplyScalar(lerp(.6, 1, sstep(0, .8, v.y / s))));
  loincloth(B, s, C(.12, .05, .1));
  sword(B, s, {len: 1.15, w: .09, two: true});
}, clips: {idle: '2H_Melee_Idle', run: 'Walking_D_Skeletons', walk: 'Walking_D_Skeletons', attack: '2H_Melee_Attack_Chop', cast2: '2H_Melee_Attack_Spin', hit: 'Hit_B', die: 'Death_C_Skeletons', spawn: 'Skeletons_Awaken_Floor'}};

/* 腐尸：佝偻、肚子鼓胀、破衣烂衫，双臂前伸 */
function fleshBody(B, s, {skin, fat = 1, pants = C(.18, .14, .1), shirt = null, jaw = .02} = {}) {
  const torsoR = (t, a) => {
    const belly = Math.exp(-((t - .35) ** 2) * 14) * .06 * fat * (Math.cos(a) * .5 + .6);
    return (lerp(.15, .18, sstep(0, .6, t)) * (1 + (fat - 1) * .6) + belly) * (1 - sstep(.8, 1, t) * .68) * s;
  };
  humanHead(B, s, skin, {jawOpen: jaw, eyes: C(.6, .55, .3), hair: null});
  limbs(B, s, {arm: [.05, .04, .042, .032], leg: [.08 * fat, .062, .058, .044], armCol: skin, legMat: 'cloth', legCol: pants, noise: .15});
  hands(B, s, skin);
  const hy = B.p('hips').y, cy = B.p('chest').y;
  B.add(lathe(0, .0, hy - .05 * s, cy + .21 * s, (t, a) => torsoR(t, a) * (1 + (vn(a * 3, t * 5, 7) - .5) * .12), {seg: 26, rings: 14, zk: .75}), shirt ? 'cloth' : 'skin', torsoW(B), v => shirt && v.y > hy + .12 * s && vn(v.x * 30, v.y * 30, v.z * 30) > .3 ? shirt : skin);
  B.add(lathe(0, 0, hy + .06 * s, hy - .14 * s, t => lerp(.16, .17, t) * s * (1 + (fat - 1) * .5), {seg: 24, rings: 4, zk: .8}), 'cloth', skirtW(B, hy + .06 * s, hy - .3 * s), pants);
  for (const sd of ['l', 'r']) B.add(ell(B.p('upperarm' + sd), .065 * s, .06 * s, .065 * s, {seg: 10}), 'skin', blendAlong(B.p('chest'), B.p('lowerarm' + sd), 'chest', 'upperarm' + sd, .3), skin);
  feet(B, s, skin.clone().multiplyScalar(.7), 'skin', 0);
  return {torsoR, y0: hy - .05 * s, y1: cy + .21 * s};
}
DEFS.zombie = {scale: 1.02, height: 1.85, runSpeed: 2.4, pose: [['spine', -.22], ['head', -.15], ['upperarml', 1.15], ['upperarmr', 1.0]], build(B, s) {
  fleshBody(B, s, {skin: C(.42, .45, .36), shirt: C(.22, .2, .16), jaw: .03});
}, clips: {idle: 'Unarmed_Idle', run: 'Walking_C', walk: 'Walking_C', attack: 'Unarmed_Melee_Attack_Punch_A', hit: 'Hit_A', die: 'Death_B'}};

/* 食尸鬼：瘦长、四肢过长、驼背前探，长爪 */
DEFS.ghoul = {scale: 1, P: {upperArm: .34, foreArm: .33, spine: .12, chest: .2}, height: 1.75, runSpeed: 4.4, armTarget: [.3, -.9, .3], pose: [['spine', -.3], ['chest', -.1], ['head', .3]], build(B, s) {
  const skin = C(.36, .33, .36);
  humanHead(B, s, skin, {jawOpen: .03, glowEyes: C(1.2, .9, .2)});
  limbs(B, s, {arm: [.035, .028, .03, .022], leg: [.05, .04, .038, .03], armCol: skin, legCol: skin, noise: .25});
  hands(B, s, skin, 'skin', .07);
  const hy = B.p('hips').y, cy = B.p('chest').y;
  B.add(lathe(0, 0, hy - .04 * s, cy + .2 * s, (t, a) => lerp(.11, .15, sstep(.2, .8, t)) * s * (1 - sstep(.8, 1, t) * .6) * (1 + Math.max(0, Math.cos(a * 2 + Math.PI)) * .08 * Math.sin(t * 40)), {seg: 22, rings: 16, zk: .7}), 'skin', torsoW(B), skin);
  loincloth(B, s, C(.15, .12, .1));
  feet(B, s, skin.clone().multiplyScalar(.75), 'skin', 0);
}, clips: {idle: 'Idle', run: 'Running_B', walk: 'Walking_B', attack: 'Unarmed_Melee_Attack_Punch_A', hit: 'Hit_B', die: 'Death_A'}};

/* 血祭司：暗红长袍、兜帽遮脸，只露出两点红光 */
DEFS.cultist = {scale: 1.03, height: 1.86, runSpeed: 2.8, build(B, s) {
  const robe = C(.26, .04, .04), trim = C(.45, .32, .12), skin = C(.4, .32, .3);
  const h = B.p('head');
  B.add(ell(h.clone().add(V(0, .13 * s, 0)), .085 * s, .11 * s, .095 * s, {seg: 12}), 'skin', 'head', C(.02, .015, .015));
  for (const sx of [-1, 1]) B.add(ell(h.clone().add(V(sx * .033 * s, .14 * s, .085 * s)), .013 * s, .007 * s, .006 * s, {seg: 6}), 'glow', 'head', C(1.6, .2, .1));
  B.add(ell(h.clone().add(V(0, .16 * s, -.03 * s)), .125 * s, .15 * s, .14 * s, {seg: 18, noise: .05, cut: v => { if (v.z > .05 * s && v.y < .08 * s) v.z = .05 * s; if (v.z > .09 * s) v.z = .09 * s; }}), 'cloth', 'head', robe);
  limbs(B, s, {armCol: skin, legCol: robe, legMat: 'cloth'});
  hands(B, s, skin);
  feet(B, s, C(.08, .06, .05), 'leather', .4);
  const hy = B.p('hips').y, cy = B.p('chest').y, waist = hy + .06 * s;
  B.add(lathe(0, 0, waist - .02 * s, cy + .22 * s, t => lerp(.15, .19, sstep(0, .6, t)) * (1 - sstep(.78, 1, t) * .6) * s, {seg: 24, rings: 12, zk: .72}), 'cloth', torsoW(B), robe);
  B.add(lathe(0, 0, waist, .03 * s, (t, a) => (lerp(.17, .31, t ** 1.2) + (vn(a * 4, t * 3, 9) - .5) * .03 * t) * s, {seg: 30, rings: 14, zk: .8,
    dy: (t, a) => t > .85 ? (vn(a * 8, 3, 2) - .5) * .05 * s : 0}), 'cloth', skirtW(B, waist, .03 * s), v => v.y < .12 * s ? robe.clone().multiplyScalar(.5) : robe);
  B.add(tube(V(0, waist + .01 * s, 0), V(0, waist + .05 * s, 0), .175 * s, .175 * s, {seg: 24, rings: 1, open: true, sz: .76}), 'gold', 'hips', trim);
  for (const sd of ['l', 'r']) {
    B.add(tube(B.p('upperarm' + sd).lerp(B.p('chest'), .1), B.p('lowerarm' + sd), .07 * s, .068 * s, {seg: 12}), 'cloth', 'upperarm' + sd, robe);
    B.add(tube(B.p('lowerarm' + sd), B.p('wrist' + sd).lerp(B.p('hand' + sd), .3), .07 * s, .11 * s, {seg: 12, open: true}), 'cloth', 'lowerarm' + sd, robe);
    B.add(ell(B.p('upperarm' + sd), .085 * s, .08 * s, .085 * s, {seg: 12}), 'cloth', blendAlong(B.p('chest'), B.p('lowerarm' + sd), 'chest', 'upperarm' + sd, .3), robe);
  }
  // 祭祀匕首
  B.addLocal(box(V(0, .2 * s, 0), .035 * s, .22 * s, .008 * s), 'metal', 'handslotr', C(.45, .42, .42));
  B.addLocal(tube(V(0, -.04 * s, 0), V(0, .09 * s, 0), .014 * s, .014 * s, {seg: 6, rings: 2}), 'gold', 'handslotr', trim);
}, clips: {idle: 'Idle', run: 'Walking_B', walk: 'Walking_B', attack: 'Spellcast_Shoot', cast: 'Spellcast_Shoot', hit: 'Hit_A', die: 'Death_A', spawn: 'Spellcast_Summon'}};

/* 屠夫：庞大臃肿、皮围裙、巨型剁肉刀 */
DEFS.butcher = {scale: 1.45, P: {hipX: .12, shX: .21}, height: 2.6, runSpeed: 3.4, pose: [['spine', -.15], ['head', .1]], build(B, s) {
  const skin = C(.55, .4, .36);
  const body = fleshBody(B, s, {skin, fat: 1.5, pants: C(.12, .09, .07), jaw: .01});
  const hy = B.p('hips').y, cy = B.p('chest').y, ya = cy + .08 * s, yb = hy - .45 * s;
  // 皮围裙：贴着肚子往下，过了腰就垂直落下
  B.add(lathe(0, 0, ya, yb, (t, a) => { const y = lerp(ya, yb, t), tt = (y - body.y0) / (body.y1 - body.y0); return (tt > 0 ? body.torsoR(Math.min(1, tt), a) : body.torsoR(0, a) + (-tt) * .05 * s) + .012 * s; }, {seg: 16, rings: 16, a0: -1.05, a1: 1.05, zk: .75}),
    'leather', v => v.y > hy ? torsoW(B)(v) : skirtW(B, hy, hy - .5 * s)(v), v => C(.2, .12, .07).lerp(C(.3, .03, .02), sstep(.55, .75, vn(v.x * 14, v.y * 14, v.z * 14))));
  B.addLocal(box(V(.12 * s, .38 * s, 0), .32 * s, .42 * s, .02 * s, {div: 3, noise: .03}), 'metal', 'handslotr', C(.42, .4, .38));
  B.addLocal(tube(V(0, -.12 * s, 0), V(0, .18 * s, 0), .025 * s, .025 * s, {seg: 6, rings: 2}), 'wood', 'handslotr', C(.2, .12, .07));
}, clips: {idle: 'Unarmed_Idle', run: 'Walking_C', walk: 'Walking_C', attack: '2H_Melee_Attack_Chop', hit: 'Hit_B', die: 'Death_B'}};

/* ───────── 动作：改了骨长以后，只保留旋转；髋部位移按身高缩放 ───────── */
function retarget(clips, hipK) {
  const out = {};
  for (const c of clips) {
    const tracks = [];
    for (const t of c.tracks) {
      const [node, prop] = t.name.split('.');
      if (prop === 'quaternion') tracks.push(t.clone());
      else if (prop === 'position' && node === 'hips') { const n = t.clone(); n.values = n.values.map(v => v * hipK); tracks.push(n); }
    }
    out[c.name] = new THREE.AnimationClip(c.name, c.duration, tracks);
  }
  return out;
}

function calibrateArms(root, idle, target = [.2, -.97, .1]) {
  if (!idle) return null;
  const saved = [];
  root.traverse(o => { if (o.userData.bone) saved.push([o, o.position.clone(), o.quaternion.clone()]); });
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(idle).play(); mixer.update(0); root.updateMatrixWorld(true);
  const fix = {}, q = new THREE.Quaternion();
  for (const sd of ['l', 'r']) {
    const ua = root.getObjectByName('upperarm' + sd), la = root.getObjectByName('lowerarm' + sd);
    const d = V().setFromMatrixPosition(la.matrixWorld).sub(V().setFromMatrixPosition(ua.matrixWorld)).normalize();
    ua.parent.getWorldQuaternion(q); q.invert();
    const t = V(sd === 'l' ? target[0] : -target[0], target[1], target[2]).normalize();
    fix[sd] = new THREE.Quaternion().setFromUnitVectors(d.applyQuaternion(q), t.applyQuaternion(q));
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  for (const [o, p, r] of saved) { o.position.copy(p); o.quaternion.copy(r); }
  root.updateMatrixWorld(true);
  return fix;
}

let RIG = null;
export async function loadActors(types, quality) {
  RIG ||= await new GLTFLoader().loadAsync(new URL('./models/rig/humanoid.glb', import.meta.url).href);
  const mats = MATS || makeMats();
  const protos = {};
  for (const id of types) {
    const D = DEFS[id]; if (!D) continue;
    const B = new Build(RIG, {...HUMAN, ...(D.P || {})}, D.scale);
    D.build(B, D.scale);
    B.finish(mats);
    if (quality === 'low') B.root.traverse(o => { if (o.isMesh && id !== 'mage' && id !== 'lord') o.castShadow = false; });
    const all = retarget(RIG.animations, B.hipK), clips = {};
    for (const [role, name] of Object.entries(D.clips)) if (all[name]) clips[role] = all[name];
    const holder = new THREE.Group(); holder.add(B.root);
    // KayKit 的动作是给 Q 版大身子做的，双臂外张、手肘往后。用待机动作标定一个修正旋转（在胸腔坐标里），
    // 让写实比例下的上臂自然垂在身侧；其它动作的摆臂幅度原样保留
    const armFix = calibrateArms(B.root, clips.idle, D.armTarget);
    protos[id] = {def: {runSpeed: D.runSpeed, pose: D.pose || [], armFix, procedural: true}, model: holder, clips, height: D.height};
  }
  return protos;
}
export const ACTOR_TYPES = Object.keys(DEFS);
export {skClone};
