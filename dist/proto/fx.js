/* 归墟 3D 小样 · 特效：粒子（火焰、火星、烟、血、冰晶、灵魂火）、动态光源池、地面贴花（血迹、焦痕、冰霜）、冲击环、预警圈。
 * 光源池固定数量（不用时亮度为 0），避免光源数量变化导致着色器重新编译卡顿。 */
import * as THREE from '../vendor/three.module.js';

const PVERT = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying vec3 vC; varying float vA;
  void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=max(1.5,aSize*uScale/-mv.z); vC=aColor; vA=aAlpha; }`;

function makeSystem(n, additive) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const uniforms = {uScale: {value: 500}};
  const mat = new THREE.ShaderMaterial({uniforms, vertexShader: PVERT, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fragmentShader: additive
      ? 'varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-.5; float r=dot(d,d)*4.; float a=exp(-r*3.5)*vA; if(a<.003) discard; gl_FragColor=vec4(vC*a,1.); }'
      : 'varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-.5; float r=dot(d,d)*4.; float a=(1.-smoothstep(.2,1.,r))*vA; if(a<.004) discard; gl_FragColor=vec4(vC,a); }'});
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = additive ? 5 : 4;
  const st = Array.from({length: n}, () => ({life: 0}));
  return {pts, g, pos, col, size, alpha, st, uniforms, n, next: 0};
}

/* 用画布生成贴花图：血迹（溅射状）、焦痕（中心发黑、边缘碎裂）、冰霜（放射状冰纹）。 */
function decalTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), R = Math.random;
  if (kind === 'blood') {
    g.fillStyle = 'rgba(60,4,4,.92)';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(128 + (R() - .5) * 70, 128 + (R() - .5) * 70, 18 + R() * 34, 0, 7); g.fill(); }
    for (let i = 0; i < 40; i++) { const a = R() * 6.28, d = 50 + R() * 70, r = 2 + R() * 7; g.beginPath(); g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, r, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 25; i++) { g.beginPath(); g.arc(128 + (R() - .5) * 140, 128 + (R() - .5) * 140, 4 + R() * 10, 0, 7); g.fillStyle = `rgba(0,0,0,${.3 + R() * .5})`; g.fill(); }
  } else if (kind === 'scorch') {
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 125);
    gr.addColorStop(0, 'rgba(8,5,4,.98)'); gr.addColorStop(.55, 'rgba(14,9,6,.85)'); gr.addColorStop(1, 'rgba(14,9,6,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(0,0,0,.8)';
    for (let i = 0; i < 14; i++) { g.lineWidth = 1 + R() * 3; g.beginPath(); let x = 128, y = 128, a = R() * 6.28; g.moveTo(x, y); for (let k = 0; k < 8; k++) { a += (R() - .5) * .8; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); } g.stroke(); }
  } else {
    g.strokeStyle = 'rgba(200,230,255,.85)';
    for (let i = 0; i < 26; i++) { g.lineWidth = .8 + R() * 2.2; g.beginPath(); let x = 128, y = 128, a = i / 26 * 6.28; g.moveTo(x, y); for (let k = 0; k < 9; k++) { a += (R() - .5) * .5; x += Math.cos(a) * 13; y += Math.sin(a) * 13; g.lineTo(x, y); } g.stroke(); }
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(180,220,255,.55)'); gr.addColorStop(.6, 'rgba(160,210,255,.25)'); gr.addColorStop(1, 'rgba(160,210,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createFX(scene, quality) {
  const add = makeSystem(quality === 'low' ? 1600 : 3200, true);
  const alp = makeSystem(quality === 'low' ? 600 : 1200, false);
  scene.add(add.pts, alp.pts);

  // 光源池
  const lights = Array.from({length: quality === 'low' ? 4 : 6}, () => { const l = new THREE.PointLight(0xffffff, 0, 10, 2); l.position.y = -50; scene.add(l); return {l, life: 0, max: 1, base: 0, follow: null}; });
  function light(pos, color, intensity, dist, life, follow = null) {
    let best = lights[0];
    for (const x of lights) if (x.life <= 0) { best = x; break; } else if (x.life < best.life) best = x;
    best.l.color.set(color); best.l.distance = dist; best.base = intensity; best.life = best.max = life; best.follow = follow;
    best.l.position.copy(pos); best.l.intensity = intensity;
    return best;
  }

  // 贴花
  const texs = {blood: decalTex('blood'), scorch: decalTex('scorch'), frost: decalTex('frost')};
  const decals = [];
  const dGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function decal(kind, x, z, s, life) {
    const mat = new THREE.MeshStandardMaterial({map: texs[kind], transparent: true, alphaTest: .03, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
      roughness: kind === 'blood' ? .22 : kind === 'frost' ? .15 : .95, metalness: 0,
      emissive: kind === 'scorch' ? 0xff3300 : 0x000000, emissiveIntensity: kind === 'scorch' ? 1.4 : 0,
      emissiveMap: kind === 'scorch' ? texs.scorch : null});
    const m = new THREE.Mesh(dGeo, mat);
    m.position.set(x, .015 + decals.length * .0004, z); m.rotation.y = Math.random() * 6.28; m.scale.setScalar(s); m.receiveShadow = true; m.renderOrder = 1;
    scene.add(m);
    decals.push({m, life, max: life, kind});
    if (decals.length > 60) { const d = decals.shift(); scene.remove(d.m); d.m.material.dispose(); }
  }

  // 冲击环 / 预警圈
  const rings = [];
  const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  function ring(pos, color, r0, r1, life, {width = .25, kind = 0, follow = null} = {}) {
    const mat = new THREE.ShaderMaterial({transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {uC: {value: new THREE.Color(color)}, uP: {value: 0}, uW: {value: width}, uK: {value: kind}, uT: {value: 0}},
      vertexShader: 'varying vec2 vU; void main(){ vU=uv*2.-1.; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `uniform vec3 uC; uniform float uP,uW,uK,uT; varying vec2 vU;
        void main(){ float r=length(vU); float a;
          if(uK<.5){ float e=abs(r-.78); a=(1.-smoothstep(0.,uW*.6,e))*(1.-uP)*(1.-uP)*1.6; a+=(1.-smoothstep(.0,.78,r))*.14*(1.-uP); a*=1.-smoothstep(.9,1.,r); }
          else { // 预警圈：外圈细线 + 由内向外长的填充
            a=(1.-smoothstep(.0,.04,abs(r-.97)))*.9+step(r,uP)*.22*(.6+.4*sin(uT*18.))+(1.-smoothstep(0.,.05,abs(r-uP)))*.6*step(r,1.); a*=step(r,1.); }
          float ang=atan(vU.y,vU.x); a*=.8+.2*sin(ang*24.+uT*3.);
          gl_FragColor=vec4(uC*a,1.); }`});
    const m = new THREE.Mesh(ringGeo, mat); m.position.copy(pos); m.position.y = .05; m.renderOrder = 3;
    scene.add(m);
    const o = {m, life, max: life, r0, r1, kind, follow};
    rings.push(o);
    return o;
  }

  function emit(sys, p, v, life, c0, c1, s0, s1, a0, grav = 0, drag = 0) {
    const i = sys.next; sys.next = (sys.next + 1) % sys.n;
    const s = sys.st[i];
    s.x = p.x; s.y = p.y; s.z = p.z; s.vx = v.x; s.vy = v.y; s.vz = v.z; s.life = s.max = life;
    s.c0 = c0; s.c1 = c1; s.s0 = s0; s.s1 = s1; s.a0 = a0; s.grav = grav; s.drag = drag; s.wob = Math.random() * 6.28;
  }
  const V = (x, y, z) => ({x, y, z}), R = (a, b) => a + (b - a) * Math.random();
  const C = {fireHot: [6, 3.4, 1.2], fire: [4, 1.2, .2], ember: [5, 1.6, .3], smoke: [.03, .028, .026], blood: [.18, .01, .01], frost: [.45, 1.0, 1.9],
    soul: [2.2, .6, 5], soulEnd: [.4, .1, 1.2], dark: [0, 0, 0], gold: [5, 3.4, 1], heal: [2, .2, .25]};

  const api = {
    light, decal, ring, C,
    /** 火盆的火焰：每帧调用 */
    fire(p, k = 1) {
      for (let i = 0; i < 2 * k; i++) emit(add, V(p.x + R(-.25, .25), p.y + R(0, .1), p.z + R(-.25, .25)), V(R(-.2, .2), R(1.6, 2.6), R(-.2, .2)), R(.35, .7), [3, 1.5, .5], [1.6, .4, .06], R(.32, .5), .1, 1, .6, 1.5);
      if (Math.random() < .25 * k) emit(add, V(p.x, p.y + .4, p.z), V(R(-.6, .6), R(1.5, 3), R(-.6, .6)), R(1.5, 3), C.ember, C.fire, .07, .03, 1, -.2, .4);
      if (Math.random() < .3 * k) emit(alp, V(p.x + R(-.2, .2), p.y + .9, p.z + R(-.2, .2)), V(R(-.2, .2), R(.7, 1.2), R(-.2, .2)), R(1.5, 2.5), C.smoke, C.smoke, .6, 2.2, .35, 0, .3);
    },
    burst(p, kind, n = 20, spd = 4) {
      for (let i = 0; i < n; i++) {
        const a = R(0, 6.28), e = R(-.2, 1.2), s = spd * R(.3, 1);
        const v = V(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s);
        if (kind === 'fire') emit(add, p, v, R(.25, .6), C.fireHot, C.fire, R(.4, .9), .1, 1, -2, 2.5);
        else if (kind === 'spark') emit(add, p, V(v.x * 1.5, v.y * 1.5 + 2, v.z * 1.5), R(.3, .9), C.ember, C.fire, .06, .03, 1, -12, .5);
        else if (kind === 'frost') emit(add, p, v, R(.4, .9), C.frost, [.2, .5, 1.2], R(.15, .3), .05, 1, -3, 1.5);
        else if (kind === 'blood') emit(alp, p, V(v.x * .7, v.y * .6 + 1, v.z * .7), R(.4, .8), C.blood, [.08, 0, 0], R(.08, .16), .05, 1, -14, .5);
        else if (kind === 'soul') emit(add, p, V(v.x * .4, Math.abs(v.y) * .6 + .5, v.z * .4), R(.6, 1.2), C.soul, C.soulEnd, R(.25, .45), .05, 1, .5, 1);
        else if (kind === 'smoke') emit(alp, p, V(v.x * .4, Math.abs(v.y) * .3 + .4, v.z * .4), R(1, 2), C.smoke, C.smoke, .8, 2.6, .5, 0, 1.2);
        else if (kind === 'gold') emit(add, p, V(v.x * .3, Math.abs(v.y) * .5 + 1, v.z * .3), R(.5, 1), C.gold, [2, .9, .2], .1, .02, 1, -4, 1);
        else if (kind === 'heal') emit(add, p, V(v.x * .2, R(1, 2.5), v.z * .2), R(.6, 1.1), C.heal, [.6, .05, .05], .18, .04, 1, 0, 1);
      }
    },
    /** 法术飞行时的拖尾 */
    trail(p, kind) {
      if (kind === 'fire') {
        emit(add, V(p.x + R(-.1, .1), p.y + R(-.1, .1), p.z + R(-.1, .1)), V(R(-.3, .3), R(.2, .8), R(-.3, .3)), R(.2, .45), C.fireHot, C.fire, R(.45, .7), .05, 1, 1, 2);
        if (Math.random() < .5) emit(add, p, V(R(-1, 1), R(0, 1.5), R(-1, 1)), R(.4, .9), C.ember, C.fire, .06, .02, 1, -3, 1);
        if (Math.random() < .25) emit(alp, p, V(0, .5, 0), R(.6, 1), C.smoke, C.smoke, .3, 1, .25, 0, 1);
      } else if (kind === 'blood') {
        emit(add, p, V(R(-.2, .2), R(-.2, .2), R(-.2, .2)), R(.2, .4), [3, .15, .3], [.5, 0, .1], .35, .05, 1, 0, 2);
      } else if (kind === 'meteor') {
        for (let i = 0; i < 3; i++) emit(add, V(p.x + R(-.3, .3), p.y + R(-.3, .3), p.z + R(-.3, .3)), V(R(-1, 1), R(1, 3), R(-1, 1)), R(.3, .6), C.fireHot, C.fire, R(1, 1.6), .2, 1, 0, 2);
        emit(alp, p, V(R(-.5, .5), 1, R(-.5, .5)), R(1, 1.8), C.smoke, C.smoke, 1, 2.5, .5, 0, .8);
      }
    },
    /** 空中缓缓飘的灰烬（跟着镜头附近生成） */
    ash(center) {
      if (Math.random() < .5) emit(add, V(center.x + R(-18, 18), R(.5, 7), center.z + R(-14, 14)), V(R(-.2, .2), R(-.15, .25), R(-.2, .2)), R(4, 8), [1.6, .5, .12], [.3, .05, 0], .05, .03, .8, 0, 0);
    },
    update(dt, t, camera, renderer) {
      const sc = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
      for (const sys of [add, alp]) {
        sys.uniforms.uScale.value = sc;
        for (let i = 0; i < sys.n; i++) {
          const s = sys.st[i];
          if (s.life <= 0) { sys.alpha[i] = 0; continue; }
          s.life -= dt;
          const k = 1 - Math.max(0, s.life) / s.max;
          const dr = Math.exp(-s.drag * dt);
          s.vx *= dr; s.vy = s.vy * dr + s.grav * dt; s.vz *= dr;   // grav：正数向上浮（火焰），负数下落（火星、血）
          s.vx += Math.sin(t * 3 + s.wob) * .4 * dt;
          s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
          if (s.y < .03) { s.y = .03; s.vy *= -.3; s.vx *= .6; s.vz *= .6; }
          const j = i * 3;
          sys.pos[j] = s.x; sys.pos[j + 1] = s.y; sys.pos[j + 2] = s.z;
          sys.col[j] = s.c0[0] + (s.c1[0] - s.c0[0]) * k; sys.col[j + 1] = s.c0[1] + (s.c1[1] - s.c0[1]) * k; sys.col[j + 2] = s.c0[2] + (s.c1[2] - s.c0[2]) * k;
          sys.size[i] = s.s0 + (s.s1 - s.s0) * k;
          sys.alpha[i] = s.a0 * (k < .1 ? k / .1 : 1) * (1 - k * k);
        }
        for (const a of ['position', 'aColor', 'aSize', 'aAlpha']) sys.g.attributes[a].needsUpdate = true;
      }
      for (const x of lights) {
        if (x.life <= 0) { x.l.intensity = 0; continue; }
        x.life -= dt;
        if (x.follow) x.l.position.copy(x.follow);
        const k = Math.max(0, x.life / x.max);
        x.l.intensity = x.base * Math.min(1, k * 3);
      }
      for (let i = decals.length - 1; i >= 0; i--) {
        const d = decals[i]; d.life -= dt;
        const k = d.life / d.max;
        d.m.material.opacity = Math.min(1, k * 4);
        if (d.kind === 'scorch') d.m.material.emissiveIntensity = Math.max(0, (k - .55) * 3.2);
        if (d.life <= 0) { scene.remove(d.m); d.m.material.dispose(); decals.splice(i, 1); }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]; r.life -= dt;
        const k = 1 - Math.max(0, r.life) / r.max;
        const u = r.m.material.uniforms; u.uT.value = t;
        if (r.follow) r.m.position.set(r.follow.x, .05, r.follow.z);
        if (r.kind === 0) { const e = 1 - (1 - k) * (1 - k); r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * e); u.uP.value = k; }
        else { r.m.scale.setScalar(r.r1); u.uP.value = k; }
        if (r.life <= 0) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
      }
    }
  };
  return api;
}
