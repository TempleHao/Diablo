/* 归墟 VORAGH · 3D 画面小样
 * 一张地图（月夜废墟祭坛）、一个职业（白袍法师）、五种怪 + 精英 + 首领。
 * 目的：验证「纯代码三维渲染 + 现有二维立绘」能把画面提到什么程度（程序材质、动态光、软阴影、积水反射、体积雾、泛光、电影调色）。
 * 操作：电脑 WASD 移动、鼠标瞄准；左键 火球，右键 陨石，Q 冰霜新星，空格 闪现。手机：左手摇杆，右手技能（自动瞄准最近的敌人）。 */
import * as THREE from '../vendor/three.module.js';
import {buildWorld, ARENA} from './world.js';
import {createPost, MAX_VL} from './post.js';
import {createFX} from './fx.js';
import {spriteMaterial, tickMaterials, setDetail} from './materials.js';
import {loadRig, makeRigActor} from './char.js';
import {loadPBR} from './pbr.js';
import {SPRITES} from '../2d/sprite-data.js';
import {SKILL_ICON} from '../2d/skill-icons.js';
import {NAMING} from '../2d/naming-data.js';

const $ = id => document.getElementById(id);
const touch = matchMedia('(pointer:coarse)').matches;
const QKEY = 'voragh3d.quality';
let quality = (() => { try { return localStorage.getItem(QKEY) || (touch ? 'low' : 'high'); } catch { return touch ? 'low' : 'high'; } })();
setDetail(quality);

/* ───────── 渲染器 ───────── */
const canvas = $('view');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance', stencil: false});
  if (!renderer.capabilities.isWebGL2) throw new Error('需要 WebGL2');
} catch (e) {
  $('boot').innerHTML = '<p class="boot-err">这台设备的浏览器不支持 WebGL2，无法运行三维小样。<br>请换用较新的 Chrome / Safari / Edge。</p>';
  throw e;
}
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = quality === 'low' ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, .5, 160);
let world;
const fx = createFX(scene, quality);
const post = createPost(renderer, {msaa: quality !== 'low', levels: quality === 'low' ? 4 : 6, ao: quality !== 'low', vol: quality !== 'low', steps: quality === 'high' ? 12 : 7});
const ov = $('ov'), og = ov.getContext('2d');

let dpr = 1;
const perf = {t: 0, n: 0, scale: 1};
function resize() {
  const w = innerWidth, h = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1.2) * perf.scale;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  post.setSize(Math.round(w * dpr), Math.round(h * dpr));
  camera.aspect = w / h; camera.updateProjectionMatrix();
  ov.width = Math.round(w * Math.min(devicePixelRatio || 1, 2)); ov.height = Math.round(h * Math.min(devicePixelRatio || 1, 2));
  layoutHud();
}

/* ───────── 立绘贴图：从图集里裁出每个怪物（单独一张贴图，缩小时不会串色）───────── */
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
function cropTex(img, x, y, w, h) {
  const c = document.createElement('canvas'), pad = 4;
  c.width = w + pad * 2; c.height = h + pad * 2;
  c.getContext('2d').drawImage(img, x, y, w, h, pad, pad, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return {tex: t, w: w + pad * 2, h: h + pad * 2};
}
const blobTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(.55, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const blobGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({map: blobTex, transparent: true, depthWrite: false, color: 0x000000});

function makeActor(art, height, footFrac) {
  const H = height, W = height * art.w / art.h;
  const geo = new THREE.PlaneGeometry(W, H, 1, 10).translate(W * (.5 - footFrac), H / 2, 0);
  const mat = spriteMaterial(art.tex); mat.userData.u.uH.value = H;
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = true;
  body.customDepthMaterial = new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking, map: art.tex, alphaTest: .42, side: THREE.DoubleSide});
  body.customDistanceMaterial = new THREE.MeshDistanceMaterial({map: art.tex, alphaTest: .42, side: THREE.DoubleSide});
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = .02; blob.scale.setScalar(Math.max(.45, W * .32)); blob.renderOrder = 1;
  const root = new THREE.Group(); root.add(body, blob); scene.add(root);
  return {root, body, mat, u: mat.userData.u, W, H};
}

/* ───────── 怪物表 ───────── */
const TYPES = {
  skeleton: {sprite: 'normal0', h: 1.85, hp: 70, speed: 3.1, dmg: 14, range: 1.55, r: .45, name: '骸骨士兵'},
  ghoul: {sprite: 'normal1', h: 1.8, hp: 55, speed: 4.3, dmg: 11, range: 1.45, r: .45, name: '食尸鬼'},
  zombie: {sprite: 'normal3', h: 1.95, hp: 115, speed: 2.3, dmg: 19, range: 1.55, r: .5, name: '腐尸'},
  hound: {sprite: 'normal6', h: 1.4, hp: 45, speed: 5.9, dmg: 9, range: 1.35, r: .55, name: '地狱猎犬'},
  cultist: {sprite: 'caster0', h: 1.95, hp: 62, speed: 2.8, dmg: 17, range: 10, r: .45, ranged: true, name: '血祭司'},
  butcher: {sprite: 'elite0', h: 2.8, hp: 560, speed: 3.4, dmg: 34, range: 2.2, r: .8, elite: true, name: '屠夫·精英'},
  lord: {sprite: 'boss2', h: 4.1, hp: 2800, speed: 3.0, dmg: 46, range: 3, r: 1.15, boss: true, name: '冥河领主'},
};
const KILL_GOAL = 40;
const art = {};

/* ───────── 状态 ───────── */
const P = {pos: new THREE.Vector3(0, 0, 3), vel: new THREE.Vector3(), yaw: Math.PI, yawT: Math.PI, holdYaw: 0, hp: 420, maxHp: 420, mp: 220, maxMp: 220, face: 1, cast: 0, castDir: 1, walk: 0, hurt: 0, alive: true, gold: 0, loot: 0, cd: {}};
let player, hero = null, enemies = [], shots = [], drops = [], nums = [], kills = 0, bossOn = null, phase = 'intro', clock = 0, spawnT = 0, shake = 0, flash = 0;
const aim = new THREE.Vector3(0, 0, 0), keys = new Set();
let mouseX = innerWidth / 2, mouseY = innerHeight / 2, mouseDown = false, mouseIn = false;
const SK = {
  fireball: {key: 'LMB', name: '火球', icon: 'fireball', cd: .32, mp: 0},
  nova: {key: 'Q', name: '冰霜新星', icon: 'nova', cd: 4, mp: 30},
  meteor: {key: 'RMB', name: '陨石', icon: 'meteor', cd: 5.5, mp: 45},
  blink: {key: '空格', name: '闪现', icon: 'blink', cd: 2.5, mp: 15},
};

/* ───────── 碰撞 ───────── */
function collide(p, r, bound) {
  for (const c of world.colliders.circles) {
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
    if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
  }
  for (const b of world.colliders.boxes) {
    const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
    const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
    if (d < r) {
      if (d > 1e-4) { p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
      else { const ox = Math.min(p.x - b.x0, b.x1 - p.x), oz = Math.min(p.z - b.z0, b.z1 - p.z); if (ox < oz) p.x = p.x - b.x0 < b.x1 - p.x ? b.x0 - r : b.x1 + r; else p.z = p.z - b.z0 < b.z1 - p.z ? b.z0 - r : b.z1 + r; }
    }
  }
  p.x = Math.max(-bound, Math.min(bound, p.x)); p.z = Math.max(-bound, Math.min(bound, p.z));
}
const blocked = p => world.colliders.circles.some(c => Math.hypot(p.x - c.x, p.z - c.z) < c.r) || world.colliders.boxes.some(b => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1) || Math.abs(p.x) > ARENA + .3 || Math.abs(p.z) > ARENA + .3;

/* ───────── 生成怪物 ───────── */
function spawn(type, pos, {rise = false} = {}) {
  const T = TYPES[type], a = art[type];
  const act = makeActor(a, T.h, a.foot);
  const e = {type, T, ...act, pos: pos.clone(), hp: T.hp, maxHp: T.hp, face: 1, walk: Math.random() * 6, atk: 0, atkCd: 1 + Math.random(), state: rise ? 'rise' : 'chase', st: 0, frozen: 0, flash: 0, slam: 6, summoned: false, kb: new THREE.Vector3()};
  if (T.elite || T.boss) {
    e.aura = fx.ring(e.pos, T.boss ? 0x9a1030 : 0xff3a10, 1, T.r * 2.2, 1e9, {kind: 1, width: .1, follow: e.pos});
    e.aura.m.material.uniforms.uP.value = 0;
  }
  e.root.position.copy(e.pos);
  enemies.push(e);
  if (rise) { fx.burst(new THREE.Vector3(pos.x, .2, pos.z), 'soul', 26, 3); fx.burst(new THREE.Vector3(pos.x, .2, pos.z), 'smoke', 8, 2); fx.decal('scorch', pos.x, pos.z, 1.8, 6); fx.light(new THREE.Vector3(pos.x, 1, pos.z), 0x9a50ff, 14, 7, .8); }
  return e;
}
function spawnWave() {
  const alive = enemies.filter(e => e.state !== 'dead').length;
  const cap = (touch ? 11 : 16) + Math.min(6, kills / 8 | 0);
  if (alive >= cap || kills + alive >= KILL_GOAL + 4) return;
  const roll = Math.random();
  const type = kills > 12 && roll < .05 && !enemies.some(e => e.T.elite && e.state !== 'dead') ? 'butcher'
    : roll < .26 ? 'skeleton' : roll < .46 ? 'ghoul' : roll < .62 ? 'zombie' : roll < .82 ? 'hound' : 'cultist';
  if (Math.random() < .55) {
    const g = world.gates[Math.floor(Math.random() * 4)];
    const n = type === 'hound' ? 3 : 1;
    for (let i = 0; i < n; i++) spawn(type, g.clone().add(new THREE.Vector3((Math.random() - .5) * 3, 0, (Math.random() - .5) * 3)));
  } else {
    for (let tries = 0; tries < 12; tries++) {
      const p = new THREE.Vector3((Math.random() - .5) * ARENA * 1.8, 0, (Math.random() - .5) * ARENA * 1.8);
      if (p.distanceTo(P.pos) > 9 && p.distanceTo(P.pos) < 22 && !blocked(p)) { spawn(type, p, {rise: true}); break; }
    }
  }
}

/* ───────── 伤害 ───────── */
function addNum(pos, text, color, big = false) { nums.push({p: pos.clone().add(new THREE.Vector3((Math.random() - .5) * .6, 0, 0)), text, color, t: 0, big}); }
function hurtEnemy(e, dmg, from, {freeze = 0, knock = 0} = {}) {
  if (e.state === 'dead' || e.state === 'rise') return;
  const crit = Math.random() < .15;
  dmg = Math.round(dmg * (crit ? 1.8 : 1) * (.9 + Math.random() * .2));
  e.hp -= dmg; e.flash = .09;
  addNum(e.pos.clone().setY(e.H * .9), crit ? dmg + '!' : '' + dmg, crit ? '#ffd27a' : freeze ? '#9fd8ff' : '#f2e6d0', crit);
  if (freeze) e.frozen = Math.max(e.frozen, freeze * (e.T.boss ? .35 : 1));
  if (knock && from && !e.T.boss) { const d = e.pos.clone().sub(from).setY(0).normalize(); e.kb.addScaledVector(d, knock * (e.T.elite ? .3 : 1)); }
  fx.burst(e.pos.clone().setY(e.H * .55), 'blood', crit ? 10 : 5, 3);
  if (e.hp <= 0) kill(e);
}
function kill(e) {
  e.state = 'dead'; e.st = 0; e.mat.transparent = true;
  fx.burst(e.pos.clone().setY(e.H * .5), 'blood', 18, 4);
  fx.burst(e.pos.clone().setY(e.H * .6), 'soul', 8, 1.5);
  fx.decal('blood', e.pos.x + (Math.random() - .5), e.pos.z + (Math.random() - .5), e.W * .9 + .6, 50);
  if (e.aura) { e.aura.life = .3; }
  if (e.T.boss) { victory(); return; }
  kills++;
  const n = e.T.elite ? 3 : Math.random() < .09 ? 1 : 0;
  for (let i = 0; i < n; i++) dropItem(e.pos, e.T.elite);
  if (Math.random() < .35) dropGold(e.pos, e.T.elite ? 60 : 5 + Math.random() * 12 | 0);
  if (Math.random() < .14) dropOrb(e.pos);
  if (kills >= KILL_GOAL && !bossOn) summonBoss();
  updateObjective();
}

/* ───────── 掉落：金币、血球、装备光柱（名字来自游戏的东土 / 西境命名系统）───────── */
const RAR = [{n: '魔法', c: 0x4f8dff, css: '#6aa8ff'}, {n: '史诗', c: 0xb066ff, css: '#c08cff'}, {n: '传奇', c: 0xff7a1a, css: '#ff9a3e'}, {n: '暗金', c: 0xd8a640, css: '#e6c27a'}];
const named = Object.values(NAMING.NAMED).map(v => v[0]);
const kindWords = Object.values(NAMING.KIND_WORD);
function itemName(r) {
  if (r >= 2) return named[Math.random() * named.length | 0];
  const east = Math.random() < .5, kw = kindWords[Math.random() * kindWords.length | 0][east ? 0 : 1];
  const w = kw[Math.random() * kw.length | 0];
  if (r === 1) { const E = east ? NAMING.EPIC_E : NAMING.EPIC_W; return E[Math.random() * E.length | 0] + w; }
  const pre = Object.values(east ? NAMING.PREFIX_E : NAMING.PREFIX_W), suf = Object.values(east ? NAMING.SUFFIX_E : NAMING.SUFFIX_W);
  return pre[Math.random() * pre.length | 0][0] + w + '·' + suf[Math.random() * suf.length | 0][0];
}
const beamGeo = new THREE.CylinderGeometry(.06, .22, 7, 8, 1, true).translate(0, 3.5, 0);
const gemGeo = new THREE.OctahedronGeometry(.18, 0);
function dropItem(at, good) {
  const roll = Math.random(), r = good ? (roll < .3 ? 3 : roll < .7 ? 2 : 1) : (roll < .04 ? 3 : roll < .14 ? 2 : roll < .45 ? 1 : 0);
  const R = RAR[r], pos = at.clone().add(new THREE.Vector3((Math.random() - .5) * 2, 0, (Math.random() - .5) * 2));
  collide(pos, .3, ARENA);
  const g = new THREE.Group(); g.position.copy(pos);
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({color: new THREE.Color(R.c).multiplyScalar(r >= 2 ? 2.4 : 1.4), transparent: true, opacity: r >= 2 ? .55 : .3, blending: THREE.AdditiveBlending, depthWrite: false}));
  beam.scale.y = r >= 2 ? 1 : .55;
  const gem = new THREE.Mesh(gemGeo, new THREE.MeshStandardMaterial({color: 0x111111, emissive: R.c, emissiveIntensity: 3, roughness: .2, metalness: .5}));
  gem.position.y = .35; g.add(beam, gem); scene.add(g);
  if (r >= 2) fx.light(pos.clone().setY(1.2), R.c, 10, 6, 1e9, null);
  drops.push({kind: 'item', g, gem, pos, r, name: itemName(r), t: 0});
  if (r >= 2) toast(`<b style="color:${R.css}">${R.n}装备掉落！</b>`);
}
function dropGold(at, n) {
  const pos = at.clone().add(new THREE.Vector3((Math.random() - .5) * 1.5, 0, (Math.random() - .5) * 1.5)); collide(pos, .3, ARENA);
  const g = new THREE.Group(); g.position.copy(pos);
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .025, 10), new THREE.MeshStandardMaterial({color: 0xd4a640, metalness: 1, roughness: .3, emissive: 0x5a3a08, emissiveIntensity: .8}));
  for (let i = 0; i < 6; i++) { const c = coin.clone(); c.position.set((Math.random() - .5) * .35, .02 + i * .012, (Math.random() - .5) * .35); c.rotation.set(Math.random() * .4, 0, Math.random() * .4); g.add(c); }
  scene.add(g);
  drops.push({kind: 'gold', g, pos, n, t: 0});
}
function dropOrb(at) {
  const pos = at.clone(); const g = new THREE.Group(); g.position.copy(pos);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(.2, 14, 10), new THREE.MeshStandardMaterial({color: 0x300000, emissive: 0xff2030, emissiveIntensity: 2.6, roughness: .1}));
  orb.position.y = .5; g.add(orb); scene.add(g);
  drops.push({kind: 'orb', g, gem: orb, pos, t: 0});
}

/* ───────── 首领 ───────── */
function summonBoss() {
  bossOn = 'coming';
  toast('<b style="color:#ff6a5a">法阵在燃烧……冥河领主苏醒了</b>', 3.5);
  setTimeout(() => {
    if (phase !== 'play') return;
    const e = spawn('lord', new THREE.Vector3(0, 0, 0), {rise: true});
    bossOn = e;
    fx.ring(new THREE.Vector3(0, 0, 0), 0xff2a20, 1, 12, 1.4, {width: .3});
    fx.burst(new THREE.Vector3(0, .5, 0), 'fire', 60, 7); fx.burst(new THREE.Vector3(0, .5, 0), 'smoke', 20, 3);
    fx.light(new THREE.Vector3(0, 3, 0), 0xff3010, 120, 30, 1.5);
    shake = .6; flash = .35;
    $('boss').hidden = false;
    updateObjective();
  }, 2600);
}

/* ───────── 技能 ───────── */
function aimDir() {
  if (touch) {
    let best = null, bd = 16;
    for (const e of enemies) { if (e.state === 'dead' || e.state === 'rise') continue; const d = e.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = e; } }
    if (best) return {dir: best.pos.clone().sub(P.pos).setY(0).normalize(), point: best.pos.clone(), target: best};
    return {dir: new THREE.Vector3(P.face, 0, 0), point: P.pos.clone().add(new THREE.Vector3(P.face * 6, 0, 0))};
  }
  const d = aim.clone().sub(P.pos).setY(0); if (d.lengthSq() < .01) d.set(P.face, 0, 0);
  return {dir: d.normalize(), point: aim.clone()};
}
function ready(k) { return (P.cd[k] || 0) <= 0 && P.mp >= SK[k].mp && P.alive && phase === 'play'; }
function use(k) {
  if (!ready(k)) { if (P.alive && phase === 'play' && P.mp < SK[k].mp && (P.cd[k] || 0) <= 0) toast('法力不足', 1); return; }
  P.cd[k] = SK[k].cd; P.mp -= SK[k].mp; P.cast = .28;
  const A = aimDir(); P.castDir = A.dir.x >= 0 ? 1 : -1; P.face = P.castDir;
  P.yawT = Math.atan2(A.dir.x, A.dir.z); P.holdYaw = .45;
  if (hero) hero.fire(k === 'nova' || k === 'meteor' ? 'cast2' : 'cast');
  const hand = P.pos.clone().add(new THREE.Vector3(A.dir.x * .5, 1.45, A.dir.z * .5));
  if (k === 'fireball') {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8), new THREE.MeshBasicMaterial({color: new THREE.Color(7, 3.2, .8)}));
    mesh.position.copy(hand); scene.add(mesh);
    const s = {kind: 'fire', mesh, pos: mesh.position, vel: A.dir.clone().multiplyScalar(19), life: 1.1, dmg: 30, r: .45};
    s.light = fx.light(hand, 0xff8a30, 9, 7, 1.1, s.pos);
    shots.push(s);
  } else if (k === 'nova') {
    const c = P.pos.clone();
    fx.ring(c, 0x7fc8ff, .5, 8.6, .55, {width: .12});
    fx.ring(c, 0xcfe8ff, .3, 7, .4, {width: .2});
    fx.decal('frost', c.x, c.z, 13, 5);
    fx.burst(c.clone().setY(.6), 'frost', 45, 9);
    fx.light(c.clone().setY(1.5), 0x8fd0ff, 22, 13, .6);
    for (const e of enemies) if (e.state !== 'dead' && e.pos.distanceTo(c) < 6.8 + e.T.r) hurtEnemy(e, 42, c, {freeze: 2.6, knock: 2});
    flash = .03;
  } else if (k === 'meteor') {
    const target = A.point.clone().setY(0);
    const off = target.clone().sub(P.pos); if (off.length() > 15) target.copy(P.pos).addScaledVector(off.normalize(), 15);
    fx.ring(target, 0xff4020, 1, 3.6, .95, {kind: 1, width: .08});
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 1), new THREE.MeshBasicMaterial({color: new THREE.Color(8, 3, .6)}));
    const from = target.clone().add(new THREE.Vector3(-7, 24, -5)); mesh.position.copy(from); scene.add(mesh);
    const s = {kind: 'meteor', mesh, pos: mesh.position, from, target, life: .95, max: .95};
    s.light = fx.light(from, 0xff6a20, 40, 16, 1, s.pos);
    shots.push(s);
  } else if (k === 'blink') {
    const from = P.pos.clone(), step = A.dir.clone().multiplyScalar(.25), p = from.clone();
    for (let i = 0; i < 34; i++) { const q = p.clone().add(step); if (blocked(q)) break; p.copy(q); }
    fx.burst(from.clone().setY(1), 'soul', 30, 3); fx.light(from.clone().setY(1.2), 0xa060ff, 20, 8, .4);
    P.pos.copy(p); collide(P.pos, .45, ARENA + .2);
    fx.burst(P.pos.clone().setY(1), 'soul', 30, 3); fx.light(P.pos.clone().setY(1.2), 0xa060ff, 20, 8, .5);
  }
}
function explode(at, r, dmg, kind) {
  for (const e of enemies) if (e.state !== 'dead' && Math.hypot(e.pos.x - at.x, e.pos.z - at.z) < r + e.T.r) hurtEnemy(e, dmg, at.clone().setY(0), {knock: kind === 'meteor' ? 5 : 1.2});
  if (kind === 'meteor') {
    fx.burst(at.clone().setY(.4), 'fire', 90, 9); fx.burst(at.clone().setY(.4), 'spark', 70, 9); fx.burst(at.clone().setY(.4), 'smoke', 30, 4);
    fx.ring(at, 0xff6a20, .5, 7, .6, {width: .25});
    fx.decal('scorch', at.x, at.z, 7.5, 14);
    fx.light(at.clone().setY(1.5), 0xff7020, 70, 20, .9);
    shake = Math.max(shake, .45); flash = .08;
  } else {
    fx.burst(at, 'fire', 22, 4); fx.burst(at, 'spark', 14, 5); fx.burst(at, 'smoke', 4, 1.5);
    fx.light(at, 0xff8030, 22, 8, .3);
    fx.decal('scorch', at.x, at.z, 1.3, 6);
  }
}
function hurtPlayer(dmg, from) {
  if (!P.alive || phase !== 'play') return;
  P.hp -= dmg; P.hurt = 1;
  if (hero && P.hp > 0 && dmg >= 10) hero.fire('hit');
  addNum(P.pos.clone().setY(2.2), '' + dmg, '#ff5a4a');
  fx.burst(P.pos.clone().setY(1.2), 'blood', 6, 2.5);
  shake = Math.max(shake, .12);
  if (P.hp <= 0) { P.hp = 0; P.alive = false; if (hero) hero.fire('die'); defeat(); }
}

/* ───────── 每帧 ───────── */
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), camTarget = new THREE.Vector3(0, 0, 3);
let camDist = 1;
function frameCamera(dt) {
  const portrait = innerHeight > innerWidth;
  const D = (portrait ? 25 : 19) * camDist;
  camTarget.lerp(P.pos, 1 - Math.exp(-dt * 6));
  const off = new THREE.Vector3(0, .82, .57).normalize().multiplyScalar(D);
  camera.position.copy(camTarget).add(off);
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * 1.2; camera.position.y += (Math.random() - .5) * shake * 1.2; shake = Math.max(0, shake - dt * 1.4); }
  camera.lookAt(camTarget.x, 1, camTarget.z - 1.4);   // 玩家略偏画面下方，前方留出更多视野
}
function animActor(a, dt, moving, speed) {
  a.walk += dt * (moving ? 7 + speed : 1.6);
  const ww = moving ? 1 : 0;
  a.u.uLegs.value = Math.sin(a.walk) * .16 * ww;
  a.u.uBreath.value = Math.sin(a.walk * .35) * .02 * (1 - ww);
  return Math.abs(Math.sin(a.walk)) * .05 * ww;
}
function update(dt) {
  clock += dt;
  // —— 玩家移动 ——
  const mv = new THREE.Vector3();
  if (keys.has('w') || keys.has('arrowup')) mv.z -= 1;
  if (keys.has('s') || keys.has('arrowdown')) mv.z += 1;
  if (keys.has('a') || keys.has('arrowleft')) mv.x -= 1;
  if (keys.has('d') || keys.has('arrowright')) mv.x += 1;
  if (joy.on) { mv.x += joy.x; mv.z += joy.y; }
  const moving = mv.lengthSq() > .02 && P.alive && phase === 'play';
  if (moving) { if (mv.length() > 1) mv.normalize(); P.pos.addScaledVector(mv, 5.4 * dt); if (Math.abs(mv.x) > .2 && P.cast <= 0) P.face = mv.x > 0 ? 1 : -1; }
  collide(P.pos, .45, ARENA + .2);
  // 瞄准点：鼠标在地面上的投影
  if (!touch && mouseIn) {
    ray.setFromCamera(new THREE.Vector2(mouseX / innerWidth * 2 - 1, -(mouseY / innerHeight) * 2 + 1), camera);
    ray.ray.intersectPlane(groundPlane, aim);
    if (P.cast <= 0 && !moving) P.face = aim.x >= P.pos.x ? 1 : -1;
  }
  for (const k in P.cd) P.cd[k] = Math.max(0, P.cd[k] - dt);
  P.mp = Math.min(P.maxMp, P.mp + 14 * dt); P.hp = Math.min(P.maxHp, P.hp + (P.alive ? 2.5 * dt : 0));
  P.cast = Math.max(0, P.cast - dt); P.hurt = Math.max(0, P.hurt - dt * 2.5);
  if (phase === 'play') {
    if (mouseDown) use('fireball');
    if (fireHeld) use('fireball');
  }
  // 玩家立绘：走路迈步、施法先后仰再前倾
  const bob = animActor(player, dt, moving, 3);
  const c = P.cast / .28;
  player.u.uLean.value = (moving ? .05 : 0) + (c > .6 ? -.06 * (1 - c) / .4 : .12 * c) ;
  player.root.position.set(P.pos.x, bob, P.pos.z);
  player.body.scale.x = P.face;
  player.body.quaternion.copy(camera.quaternion);
  if (!P.alive) { player.body.rotateZ(-P.face * 1.3); player.root.position.y = -.2; }
  heroLight.position.set(P.pos.x, 3, P.pos.z + 2.2);
  // 三维骨骼主角：朝移动方向转身，施法时转向目标；跑步动作的步幅按实际速度对齐
  if (hero) {
    P.holdYaw = Math.max(0, P.holdYaw - dt);
    if (moving && P.holdYaw <= 0) P.yawT = Math.atan2(mv.x, mv.z);
    else if (!moving && P.holdYaw <= 0 && !touch && mouseIn && P.alive) P.yawT = Math.atan2(aim.x - P.pos.x, aim.z - P.pos.z);
    let dy = P.yawT - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    if (P.alive) P.yaw += dy * (1 - Math.exp(-dt * 16));
    hero.root.position.set(P.pos.x, 0, P.pos.z); hero.root.rotation.y = P.yaw;
    hero.update(dt, moving ? 5.4 * Math.min(1, mv.length()) : 0);
    player.root.visible = false;
  }

  // —— 生成 ——
  if (phase === 'play' && !bossOn) { spawnT -= dt; if (spawnT <= 0) { spawnWave(); spawnT = Math.max(.55, 1.6 - kills * .025); } }

  // —— 怪物 ——
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], T = e.T;
    e.flash = Math.max(0, e.flash - dt);
    e.mat.emissive.setRGB(e.flash > 0 ? 1.4 : e.frozen > 0 ? .05 : 0, e.flash > 0 ? 1.3 : e.frozen > 0 ? .15 : 0, e.flash > 0 ? 1.2 : e.frozen > 0 ? .35 : 0);
    e.mat.color.setRGB(e.frozen > 0 ? .6 : 1, e.frozen > 0 ? .8 : 1, 1);
    e.body.quaternion.copy(camera.quaternion);
    if (e.state === 'dead') {
      e.st += dt;
      const k = Math.min(1, e.st * 3);
      e.body.rotateZ(-e.face * k * 1.35);
      e.root.position.y = -k * .15;
      e.mat.opacity = 1 - Math.max(0, (e.st - 1.6) / .8);
      e.root.children[1].visible = e.st < 1;
      if (e.st > 2.4) { scene.remove(e.root); e.mat.dispose(); enemies.splice(i, 1); }
      continue;
    }
    if (e.state === 'rise') {
      e.st += dt; const k = Math.min(1, e.st / .9);
      e.root.position.set(e.pos.x, -(1 - k) * e.H, e.pos.z);
      e.body.scale.x = e.face;
      if (Math.random() < .5) fx.burst(e.pos.clone().setY(.1), 'smoke', 1, 1);
      if (k >= 1) { e.state = 'chase'; e.root.position.y = 0; }
      continue;
    }
    if (e.frozen > 0) { e.frozen -= dt; e.root.position.set(e.pos.x, 0, e.pos.z); continue; }
    // 还在墙外（刚从门外进来）：先走向最近的门洞，进了院子再追玩家
    let goal = P.pos;
    if (Math.abs(e.pos.x) > ARENA - .6 || Math.abs(e.pos.z) > ARENA - .6) {
      let g = world.gates[0], gd = 1e9; for (const q of world.gates) { const dd = q.distanceTo(e.pos); if (dd < gd) { gd = dd; g = q; } }
      goal = tmp2.copy(g).multiplyScalar((ARENA - 3) / g.length());
    }
    const to = goal.clone().sub(e.pos).setY(0); to.normalize();
    const d = Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
    let moving2 = false;
    e.atkCd -= dt;
    if (e.atk > 0) {
      // 攻击：先蓄力后仰（身体泛红），再前扑出手
      const wind = T.ranged ? .6 : T.boss ? .7 : .42;
      const prev = e.atk; e.atk += dt;
      const t = e.atk;
      if (t < wind) { e.u.uLean.value = -.16 * (t / wind) ** 2; e.mat.emissive.r += .4 * (t / wind); }
      else { const q = Math.min(1, (t - wind) / .25); e.u.uLean.value = .3 * (q < .3 ? q / .3 : 1 - (q - .3) / .7); }
      if (prev < wind && t >= wind && P.alive) {
        if (T.ranged) {
          const mesh = new THREE.Mesh(new THREE.SphereGeometry(.16, 10, 6), new THREE.MeshBasicMaterial({color: new THREE.Color(4, .3, .8)}));
          mesh.position.copy(e.pos).setY(1.4); scene.add(mesh);
          const s = {kind: 'bolt', mesh, pos: mesh.position, vel: P.pos.clone().setY(1.2).sub(mesh.position).normalize().multiplyScalar(10), life: 2.2, dmg: T.dmg, r: .5};
          s.light = fx.light(mesh.position, 0xff2060, 5, 5, 2.2, s.pos);
          shots.push(s);
        } else if (d < T.range + .7) hurtPlayer(T.dmg, e.pos);
      }
      if (t > wind + .45) { e.atk = 0; e.atkCd = T.ranged ? 2.4 : T.boss ? 1.4 : 1.1; e.u.uLean.value = 0; }
    } else if (T.boss && (e.slam -= dt) <= 0 && d < 9) {
      // 首领：重踏，地面先出预警圈，1.2 秒后爆发
      e.slam = 7; e.slamAt = e.pos.clone(); e.slamT = 1.2;
      fx.ring(e.slamAt, 0xff2a20, 1, 5, 1.2, {kind: 1, width: .08});
      toast('<b style="color:#ff6a5a">躲开红圈！</b>', 1);
    } else if (d > T.range * (T.ranged ? .75 : .9)) {
      const sp = T.speed * (e.hp < e.maxHp * .4 && T.elite ? 1.4 : 1);
      if (T.ranged && d < 7) { e.pos.addScaledVector(to, -sp * dt * .6); moving2 = true; }
      else if (!(T.ranged && d < T.range)) { e.pos.addScaledVector(to, sp * dt); moving2 = true; }
      if (T.ranged && d < T.range && e.atkCd <= 0) e.atk = .0001;
    } else if (e.atkCd <= 0) e.atk = .0001;
    if (e.slamT > 0) {
      e.slamT -= dt;
      if (e.slamT <= 0) {
        if (P.pos.distanceTo(e.slamAt) < 5) hurtPlayer(70, e.slamAt);
        fx.ring(e.slamAt, 0xff5020, .5, 7, .6, {width: .3}); fx.burst(e.slamAt.clone().setY(.3), 'spark', 50, 8); fx.burst(e.slamAt.clone().setY(.3), 'smoke', 20, 4);
        fx.decal('scorch', e.slamAt.x, e.slamAt.z, 6, 10); fx.light(e.slamAt.clone().setY(1.5), 0xff4010, 80, 16, .6); shake = .5;
      }
    }
    if (T.boss && !e.summoned && e.hp < e.maxHp * .5) {
      e.summoned = true; toast('<b style="color:#c08cff">冥河领主召唤了亡者</b>', 2);
      for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; const p = e.pos.clone().add(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4)); if (!blocked(p)) spawn(k % 2 ? 'skeleton' : 'ghoul', p, {rise: true}); }
    }
    // 互相推开、击退、碰撞
    for (const o of enemies) { if (o === e || o.state === 'dead') continue; tmp.copy(e.pos).sub(o.pos).setY(0); const m = T.r + o.T.r, dd = tmp.length(); if (dd < m && dd > 1e-3) e.pos.addScaledVector(tmp, (m - dd) / dd * .5); }
    if (d < T.r + .45) { tmp.copy(e.pos).sub(P.pos).setY(0).normalize(); e.pos.addScaledVector(tmp, T.r + .45 - d); }
    e.pos.addScaledVector(e.kb, dt * 8); e.kb.multiplyScalar(Math.exp(-dt * 8));
    collide(e.pos, T.r, ARENA + 6);
    if (Math.abs(to.x) > .15) e.face = to.x > 0 ? 1 : -1;
    const b = animActor(e, dt, moving2, T.speed * .5);
    if (e.atk <= 0) e.u.uLean.value = moving2 ? .06 : 0;
    e.root.position.set(e.pos.x, b, e.pos.z);
    e.body.scale.x = e.face;
  }

  // —— 法术飞行 ——
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]; s.life -= dt;
    let hit = false;
    if (s.kind === 'meteor') {
      const k = 1 - s.life / s.max;
      s.pos.lerpVectors(s.from, s.target, k * k);
      fx.trail(s.pos, 'meteor');
      if (s.life <= 0) { explode(s.target, 3.6, 150, 'meteor'); hit = true; }
    } else {
      s.pos.addScaledVector(s.vel, dt);
      fx.trail(s.pos, s.kind === 'fire' ? 'fire' : 'blood');
      if (s.kind === 'fire') {
        for (const e of enemies) if (e.state !== 'dead' && e.state !== 'rise' && Math.hypot(e.pos.x - s.pos.x, e.pos.z - s.pos.z) < e.T.r + s.r) { hit = true; break; }
        if (hit || blocked(s.pos) || s.life <= 0) { explode(s.pos.clone(), 1.9, s.dmg, 'fire'); hit = true; }
      } else {
        if (Math.hypot(P.pos.x - s.pos.x, P.pos.z - s.pos.z) < .5 + s.r) { hurtPlayer(s.dmg, s.pos); fx.burst(s.pos, 'soul', 10, 2); hit = true; }
        else if (blocked(s.pos) || s.life <= 0) { fx.burst(s.pos, 'soul', 6, 1.5); hit = true; }
      }
    }
    if (hit) { scene.remove(s.mesh); s.mesh.geometry.dispose(); if (s.light) s.light.life = Math.min(s.light.life, .12); shots.splice(i, 1); }
  }

  // —— 掉落物 ——
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i]; d.t += dt;
    if (d.gem) { d.gem.rotation.y += dt * 2; d.gem.position.y = (d.kind === 'orb' ? .5 : .35) + Math.sin(d.t * 3) * .08; }
    if (d.kind === 'item' && d.r >= 2 && Math.random() < .2) fx.burst(d.pos.clone().setY(.3), 'gold', 1, .5);
    const dist = Math.hypot(P.pos.x - d.pos.x, P.pos.z - d.pos.z);
    if (P.alive && dist < (d.kind === 'gold' ? 2.2 : 1.3)) {
      if (d.kind === 'gold') { P.gold += d.n; fx.burst(d.pos.clone().setY(.3), 'gold', 10, 1.5); addNum(d.pos.clone().setY(1), '+' + d.n + ' 金', '#e6c27a'); }
      else if (d.kind === 'orb') { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * .2); fx.burst(P.pos.clone().setY(.3), 'heal', 24, 1); }
      else { P.loot++; toast(`拾取 <b style="color:${RAR[d.r].css}">${d.name}</b>`); fx.burst(d.pos.clone().setY(.4), 'gold', 16, 2); }
      scene.remove(d.g); drops.splice(i, 1);
    }
  }

  // —— 环境 ——
  for (const b of world.braziers) fx.fire(b.pos, quality === 'low' ? .6 : 1);
  if (quality !== 'low') fx.ash(P.pos);
  world.update(clock, P.pos);
  const gs = world.ground.material.userData.shader;
  if (gs) gs.uniforms.uRune.value = bossOn ? 2.4 : 1;
  tickMaterials(clock, P.pos);
  fx.update(dt, clock, camera, renderer);
  frameCamera(dt);
  flash = Math.max(0, flash - dt * 1.6);
  post.final.uHurt.value = Math.max(P.hurt * .7, P.alive ? Math.max(0, .35 - P.hp / P.maxHp) * 1.6 : .9);
  post.final.uDesat.value = P.alive ? 0 : .7;
  post.final.uFlash.value = flash;
  feedVolLights();
}
/* 体积雾里的点光：每帧挑离镜头焦点最近、正在亮的几盏 */
let vLights = [];
const _lc = new THREE.Color();
function feedVolLights() {
  if (quality === 'low') return;
  const u = post.vol, cand = [];
  for (const l of vLights) if (l.intensity > .05 && l.position.y > -10) cand.push([l.position.distanceToSquared(camTarget), l]);
  cand.sort((a, b) => a[0] - b[0]);
  const n = Math.min(MAX_VL, cand.length);
  for (let i = 0; i < n; i++) {
    const l = cand[i][1], k = (l === heroLight ? .12 : 1) * Math.min(1, 16 / l.intensity);   // 爆炸这种瞬间强光在雾里封顶，不然整屏发白
    u.uLP.value[i].set(l.position.x, l.position.y, l.position.z, l.distance || 20);
    _lc.copy(l.color).multiplyScalar(l.intensity * k); u.uLC.value[i].set(_lc.r, _lc.g, _lc.b);
  }
  u.uLN.value = n;
}

/* ───────── 画面上的血条、伤害数字、装备名 ───────── */
const ray = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function toScreen(v) { tmp.copy(v).project(camera); return [(tmp.x * .5 + .5) * ov.width, (-tmp.y * .5 + .5) * ov.height, tmp.z]; }
function drawOverlay(dt) {
  const k = ov.width / innerWidth;
  og.clearRect(0, 0, ov.width, ov.height);
  og.textAlign = 'center'; og.textBaseline = 'middle';
  for (const e of enemies) {
    if (e.state === 'dead' || e.state === 'rise' || e.T.boss || (e.hp >= e.maxHp && !e.T.elite)) continue;
    const [x, y, z] = toScreen(tmp.set(e.pos.x, e.H + .25, e.pos.z)); if (z > 1) continue;
    const w = (e.T.elite ? 70 : 44) * k, h = 4 * k;
    og.fillStyle = 'rgba(0,0,0,.65)'; og.fillRect(x - w / 2 - k, y - k, w + 2 * k, h + 2 * k);
    og.fillStyle = e.T.elite ? '#d96a1e' : '#b0221c'; og.fillRect(x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), h);
    if (e.T.elite) { og.font = `600 ${12 * k}px "Noto Serif SC",serif`; og.fillStyle = '#ffb36a'; og.fillText(e.T.name, x, y - 9 * k); }
  }
  for (const d of drops) {
    if (d.kind !== 'item') continue;
    const [x, y, z] = toScreen(tmp.set(d.pos.x, .9, d.pos.z)); if (z > 1) continue;
    og.font = `600 ${12 * k}px "Noto Serif SC",serif`;
    const tw = og.measureText(d.name).width + 12 * k;
    og.fillStyle = 'rgba(6,6,8,.78)'; og.fillRect(x - tw / 2, y - 9 * k, tw, 18 * k);
    og.fillStyle = RAR[d.r].css; og.fillText(d.name, x, y);
  }
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i]; n.t += dt;
    if (n.t > 1) { nums.splice(i, 1); continue; }
    const [x, y, z] = toScreen(tmp.set(n.p.x, n.p.y + n.t * 1.2, n.p.z)); if (z > 1) continue;
    const s = (n.big ? 22 : 15) * k * (n.t < .12 ? 1 + (1 - n.t / .12) * .6 : 1);
    og.globalAlpha = Math.min(1, (1 - n.t) * 2.5);
    og.font = `700 ${s}px "Cinzel","Noto Serif SC",serif`;
    og.lineWidth = 3 * k; og.strokeStyle = 'rgba(0,0,0,.85)'; og.strokeText(n.text, x, y); og.fillStyle = n.color; og.fillText(n.text, x, y);
    og.globalAlpha = 1;
  }
}

/* ───────── 界面 ───────── */
const heroLight = new THREE.PointLight(0xffd9b0, 30, 13, 2); scene.add(heroLight);
let toastT = 0;
function toast(html, t = 2.2) { const el = $('toast'); el.innerHTML = html; el.classList.add('on'); toastT = t; }
function updateObjective() {
  $('obj').innerHTML = bossOn && bossOn !== 'coming' ? '击败 <b>冥河领主</b>' : bossOn ? '法阵正在燃烧……' : `清剿亡魂 <b>${Math.min(kills, KILL_GOAL)}</b> / ${KILL_GOAL}`;
}
function buildSkills() {
  const bar = $('skills'); bar.innerHTML = '';
  const order = touch ? ['blink', 'nova', 'meteor', 'fireball'] : ['fireball', 'meteor', 'nova', 'blink'];
  for (const k of order) {
    const s = SK[k], i = SKILL_ICON[s.icon] ?? 0;
    const b = document.createElement('button'); b.className = 'sk sk-' + k; b.dataset.k = k;
    b.innerHTML = `<i class="ic" style="--ix:${i % 16};--iy:${i / 16 | 0}"></i><i class="cdm"></i>${touch ? '' : `<kbd>${s.key}</kbd>`}<span class="nm">${s.name}</span>`;
    bar.append(b);
    if (touch) {
      b.addEventListener('touchstart', ev => { ev.preventDefault(); ev.stopPropagation(); if (k === 'fireball') fireHeld = true; use(k); }, {passive: false});
      b.addEventListener('touchend', ev => { ev.preventDefault(); if (k === 'fireball') fireHeld = false; }, {passive: false});
    } else b.addEventListener('mousedown', ev => { ev.stopPropagation(); use(k); });
  }
}
function updateHud(dt) {
  $('hp-fill').style.setProperty('--r', (P.hp / P.maxHp * 100).toFixed(1) + '%');
  $('mp-fill').style.setProperty('--r', (P.mp / P.maxMp * 100).toFixed(1) + '%');
  $('hp-n').textContent = Math.ceil(P.hp); $('mp-n').textContent = Math.floor(P.mp);
  $('gold').textContent = P.gold; $('loot').textContent = P.loot;
  for (const b of document.querySelectorAll('.sk')) {
    const k = b.dataset.k, s = SK[k], cd = P.cd[k] || 0;
    b.querySelector('.cdm').style.setProperty('--p', (cd / s.cd * 100).toFixed(1) + '%');
    b.classList.toggle('nomp', P.mp < s.mp);
  }
  if (bossOn && bossOn !== 'coming') $('boss-fill').style.width = Math.max(0, bossOn.hp / bossOn.maxHp * 100) + '%';
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('on');
}
function layoutHud() {
  document.body.classList.toggle('touch', touch);
  document.body.classList.toggle('portrait', innerHeight > innerWidth);
}

/* ───────── 输入 ───────── */
let fireHeld = false;
const joy = {on: false, id: null, cx: 0, cy: 0, x: 0, y: 0};
addEventListener('keydown', e => {
  const k = e.key.toLowerCase(); keys.add(k);
  if (phase !== 'play') return;
  if (k === 'q' || k === '3') use('nova');
  if (k === ' ' || k === '4' || k === 'e') { e.preventDefault(); use('blink'); }
  if (k === '2' || k === 'r') use('meteor');
  if (k === 'escape') togglePause();
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => { keys.clear(); mouseDown = false; fireHeld = false; });
canvas.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; mouseIn = true; });
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouseDown = true; if (e.button === 2) use('meteor'); });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { camDist = Math.max(.75, Math.min(1.3, camDist + Math.sign(e.deltaY) * .05)); }, {passive: true});
if (touch) {
  const zone = $('joyzone'), knob = $('joy'), stick = knob.firstElementChild;
  zone.addEventListener('touchstart', e => {
    e.preventDefault(); const t = e.changedTouches[0];
    Object.assign(joy, {on: true, id: t.identifier, cx: t.clientX, cy: t.clientY, x: 0, y: 0});
    knob.style.left = t.clientX + 'px'; knob.style.top = t.clientY + 'px'; knob.classList.add('on');
  }, {passive: false});
  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joy.id) {
      let dx = t.clientX - joy.cx, dy = t.clientY - joy.cy; const d = Math.hypot(dx, dy), m = 52;
      if (d > m) { dx *= m / d; dy *= m / d; }
      joy.x = dx / m; joy.y = dy / m; stick.style.transform = `translate(${dx}px,${dy}px)`;
    }
  }, {passive: false});
  const end = e => { for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.on = false; joy.x = joy.y = 0; knob.classList.remove('on'); stick.style.transform = ''; } };
  zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
}

/* ───────── 流程：开始、暂停、胜负、重来 ───────── */
function reset() {
  for (const e of enemies) scene.remove(e.root); enemies = [];
  for (const s of shots) scene.remove(s.mesh); shots = [];
  for (const d of drops) scene.remove(d.g); drops = [];
  nums = []; kills = 0; bossOn = null; spawnT = 1.5;
  Object.assign(P, {hp: P.maxHp, mp: P.maxMp, alive: true, cd: {}, gold: 0, loot: 0, hurt: 0});
  P.pos.set(0, 0, 3); camTarget.copy(P.pos); P.yaw = P.yawT = Math.PI;
  if (hero) hero.revive();
  $('boss').hidden = true; $('end').hidden = true;
  updateObjective();
}
function start() { reset(); phase = 'play'; $('start').hidden = true; }
function togglePause() { if (phase === 'play') { phase = 'pause'; $('pause').hidden = false; } else if (phase === 'pause') { phase = 'play'; $('pause').hidden = true; } }
function victory() {
  phase = 'end'; bossOn = null; $('boss').hidden = true;
  setTimeout(() => { $('end-title').textContent = '试炼完成'; $('end-sub').innerHTML = `击败冥河领主 · 击杀 ${kills} · 金币 ${P.gold} · 装备 ${P.loot} 件`; $('end').hidden = false; }, 1600);
  fx.light(new THREE.Vector3(0, 3, 0), 0xffd0a0, 80, 30, 2); flash = .5;
}
function defeat() { phase = 'end'; setTimeout(() => { $('end-title').textContent = '你倒下了'; $('end-sub').innerHTML = `击杀 ${kills} · 金币 ${P.gold}`; $('end').hidden = false; }, 1400); }
$('btn-start').onclick = start;
$('btn-again').onclick = start;
$('btn-resume').onclick = togglePause;
$('btn-pause').onclick = togglePause;
for (const b of document.querySelectorAll('[data-q]')) {
  b.classList.toggle('on', b.dataset.q === quality);
  b.onclick = () => { try { localStorage.setItem(QKEY, b.dataset.q); } catch {} location.reload(); };
}
document.addEventListener('visibilitychange', () => { if (document.hidden && phase === 'play') togglePause(); });
$('help-keys').hidden = touch; $('help-touch').hidden = !touch;

/* ───────── 启动 ───────── */
(async () => {
  try {
    world = buildWorld(scene, renderer, quality, /[?&]tex=0/.test(location.search) ? {} : await loadPBR(quality, renderer));
    if (quality !== 'low') scene.fog.density = .009;
    const [mons, mage] = await Promise.all([loadImg('../2d/art/monsters.webp'), loadImg('../2d/art/select/mage.webp')]);
    for (const [k, T] of Object.entries(TYPES)) { const f = SPRITES[T.sprite]; const c = cropTex(mons, f[0], f[1], f[2], f[3]); art[k] = {...c, foot: (f[4] + 4) / c.w}; }
    const mc = cropTex(mage, 0, 0, mage.width, mage.height); mc.tex.anisotropy = 8;
    player = makeActor(mc, 2.35, (mage.width * .646 + 4) / mc.w);
    player.walk = 0;
  } catch (e) { $('boot').innerHTML = '<p class="boot-err">素材加载失败，请刷新重试。</p>'; throw e; }
  // 三维骨骼主角：优先用 models/mage（混元3D + Mixamo 的正式模型），没有就用临时人偶；?hero=card 退回立绘
  if (!/[?&]hero=card/.test(location.search)) {
    let ids = ['standin'];
    try { ids = (await fetch('./models/index.json', {cache: 'no-cache'}).then(r => r.json())).hero || ids; } catch {}
    for (const id of ids) {
      try {
        const proto = await loadRig(`./models/${id}/`);
        hero = makeRigActor(proto);
        if (proto.def.standin) hero.mats.forEach(m => { if (/joint/i.test(m.name)) { m.color.set(0x8a6a34); m.metalness = .8; m.roughness = .35; } else { m.color.set(0xd9d2c2); m.roughness = .7; m.metalness = 0; } });
        const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = .02; blob.scale.setScalar(.55); blob.renderOrder = 1; hero.root.add(blob);
        scene.add(hero.root);
        break;
      } catch (err) { console.warn('3D 主角加载失败', id, err); }
    }
  }
  buildSkills(); resize(); updateObjective();
  if (/[?&]qa=1/.test(location.search) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__p3 = {scene, P, get hero() { return hero; }, post, setCam(v) { camDist = v; }, camera, renderer, get enemies() { return enemies; }, spawn, use, start, sim(n) { for (let i = 0; i < n; i++) update(1 / 30); }, fx, aim, keys, THREE, setPhase(x) { phase = x; }, kill(n) { kills += n; updateObjective(); if (kills >= KILL_GOAL && !bossOn) summonBoss(); }};
  addEventListener('resize', resize);
  // 先渲染一帧让着色器编译好，再撤掉加载画面
  scene.traverse(o => { if (o.isPointLight) vLights.push(o); });
  renderer.compile(scene, camera);
  $('boot').classList.add('done');
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    const raw = (now - last) / 1000, dt = Math.min(.05, raw); last = now;
    // 自动降分辨率：连续 2 秒平均低于约 40 帧，就把渲染分辨率降一档（最低 0.6 倍），保证手机上流畅
    perf.t += raw; perf.n++;
    if (perf.t > 2 && !/[?&]fixed=1/.test(location.search)) { const avg = perf.t / perf.n; perf.t = perf.n = 0;
      if (avg > .025 && perf.scale > .6) { perf.scale = Math.max(.6, perf.scale - .15); resize(); }
      else if (avg < .012 && perf.scale < 1) { perf.scale = Math.min(1, perf.scale + .1); resize(); } }
    if (phase === 'play' || phase === 'end' || phase === 'intro') update(phase === 'intro' ? dt * .6 : dt);
    post.render(scene, camera, clock);
    drawOverlay(phase === 'pause' ? 0 : dt);
    updateHud(dt);
  });
})();
