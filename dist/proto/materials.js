/* 归墟 3D 小样 · 程序材质：地面（石板、缝隙、裂纹、苔藓、积水、符文法阵）、岩石（风化、苔藓、雨痕）、铁器。
 * 都基于 MeshStandardMaterial，只替换颜色 / 粗糙度 / 法线 / 自发光几段，所以照样吃三维光照、阴影、雾和环境反射。 */
import * as THREE from '../vendor/three.module.js';
import {NOISE} from './glsl.js';
import {PBR_GLSL} from './pbr.js';

const shared = {uTime: {value: 0}, uFocus: {value: new THREE.Vector3()}};
export const tickMaterials = (t, focus) => { shared.uTime.value = t; if (focus) shared.uFocus.value.copy(focus); };
/* 挡在镜头和玩家之间的柱子、墙：按网点图案镂空（暗黑 4 的做法），玩家永远看得见；投影不受影响。 */
const SEE_THROUGH = `
  { vec3 cp=cameraPosition, fp=uFocus+vec3(0.,1.1,0.), ab=fp-cp; float t=dot(vW-cp,ab)/dot(ab,ab);
    float dl=length(vW-(cp+ab*clamp(t,0.,1.)));
    if(t<.96 && vW.y>1.){ float th=1.02-smoothstep(1.3,2.1,dl)*1.04; vec2 q=mod(floor(gl_FragCoord.xy),4.);
      float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
      if((m[int(q.x)+int(q.y)*4]+.5)/16.<th) discard; } }`;
let OCT = 5;
export const setDetail = q => { OCT = q === 'low' ? 3 : q === 'medium' ? 4 : 5; };

function addWorldVaryings(shader) {
  // InstancedMesh（碎石、骨头）的世界坐标要再乘实例矩阵
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vWN;')
    .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vW=(modelMatrix*instanceMatrix*vec4(transformed,1.)).xyz; vWN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*objectNormal);
#else
  vW=(modelMatrix*vec4(transformed,1.)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);
#endif
`);
}

/* ───────── 地面 ───────── */
/* 法阵：刻在石板里的符文环，缝里透出暗红的光；有残缺，不是贴上去的图案 */
const RUNE = `
vec3 runeEmit(vec2 p, inout vec3 alb, inout float h){
  float rr=length(p), ang=atan(p.y,p.x), er=smoothstep(.25,.55,vnoise(p*2.3+7.));   // er：被磨掉、被泥盖住的地方
  float ring1=1.-smoothstep(.012,.04,abs(rr-5.6)), ring2=1.-smoothstep(.008,.03,abs(rr-4.7));
  float seg=step(.35,fract(ang*9.549))*step(fract(ang*9.549),.85);
  float glyph=(1.-smoothstep(.03,.07,abs(rr-5.15)))*step(.5,h21(vec2(floor(ang*9.549*3.),1.)))*seg;
  float pent=0.; for(int k=0;k<5;k++){ float a1=float(k)*1.2566+1.5708, a2=float(k+2)*1.2566+1.5708;
    vec2 A=4.7*vec2(cos(a1),sin(a1)), B=4.7*vec2(cos(a2),sin(a2)), ba=B-A, pa=p-A;
    float t=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); pent=max(pent,(1.-smoothstep(.006,.022,length(pa-ba*t)))*.4); }
  float rune=max(max(ring1,ring2),max(glyph,pent))*step(rr,6.)*er;
  float pulse=.65+.35*sin(uTime*1.7)+.15*sin(uTime*5.3+rr);
  alb=mix(alb,vec3(.025,.008,.006),rune); h-=rune*.008;
  return vec3(1.,.11,.03)*rune*pulse*uRune*(.3+.7*vnoise(p*3.+uTime*.6))*.8; }`;
/* 积水：比地面低的地方是镜面水坑，边上一圈湿透、再往外一圈潮 */
const PUDDLE = `
float puddle(vec2 p, float h, inout vec3 alb, inout float rough){
  float big=fbm(p*.085+21.);
  float pl=smoothstep(.5,.72,big)*.055-.012+(vnoise(p*.9)-.5)*.006;
  float dep=pl-h, water=smoothstep(-.002,.004,dep);
  float soak=smoothstep(-.012,0.,dep)*(1.-water), damp=smoothstep(-.035,-.01,dep)*(1.-water)*(1.-soak);
  alb*=1.-soak*.45-damp*.22;
  alb=mix(alb,alb*.22+vec3(.003,.004,.006),water*smoothstep(0.,.02,dep)+water*.4);
  rough=mix(rough,rough*.75,damp); rough=mix(rough,.2,soak); rough=mix(rough,.1,water);
  return water; }`;

export function groundMaterial(occluders, T = {}) {
  const mat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 1});
  const N = occluders.length;
  const occ = occluders.map(o => new THREE.Vector4(o.x, o.z, o.r, o.k));
  const usePBR = !!T.floor, two = !!(T.floor && T.mud), three = !!(T.floor2);
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uOcc = {value: occ};
    shader.uniforms.uRune = {value: 1};
    if (usePBR) for (const [k, slot] of [['A', T.floor], ['B', T.mud], ['C', T.floor2]]) if (slot) {
      shader.uniforms['t' + k + 'd'] = {value: slot.d}; shader.uniforms['t' + k + 'n'] = {value: slot.n}; shader.uniforms['t' + k + 'r'] = {value: slot.r};
      shader.uniforms['uS' + k] = {value: slot.size};
    }
    mat.userData.shader = shader;
    addWorldVaryings(shader);
    const head = `#include <common>
#define FBM_OCT ${OCT}
#define OCC_N ${N}
uniform float uTime; uniform float uRune; uniform vec4 uOcc[OCC_N];
varying vec3 vW; varying vec3 vWN;
${NOISE}
${RUNE}
${PUDDLE}
struct GS{ vec3 alb; float rough; float h; float ao; vec3 emit; vec3 nw; };
float occAO(vec2 p){ float ao=1.; for(int i=0;i<OCC_N;i++){ vec4 o=uOcc[i]; float d=length(p-o.xy); ao*=1.-o.w*(1.-smoothstep(o.z*.6,o.z*1.6,d)); } return ao; }`;
    const pbrHead = `
${PBR_GLSL}
uniform sampler2D tAd,tAn,tAr; uniform float uSA;
${two ? 'uniform sampler2D tBd,tBn,tBr; uniform float uSB;' : ''}
${three ? 'uniform sampler2D tCd,tCn,tCr; uniform float uSC;' : ''}
GS ground(vec2 p){
  GS g;
  float m=vnoise(p*.13+3.);
  PS A=pbrTile(tAd,tAn,tAr,vec2(p.x,-p.y)/uSA,m);
  vec3 alb=A.a; vec3 n=A.n; vec3 r=A.r; float h=A.r.b;
  float rr=length(p), edge=max(abs(p.x),abs(p.y));
  ${three ? `
  // 外圈换成长苔的碎石路，越往墙边越多
  float mc=smoothstep(.15,.6,smoothstep(12.,19.,rr)*.8+(fbm(p*.11+40.)-.5)*.9);
  PS C=pbrTile(tCd,tCn,tCr,vec2(p.x,-p.y)/uSC,m);
  float wc=smoothstep(-.06,.06,mc*2.-1.+(C.r.b-h)*.7);
  alb=mix(alb,C.a,wc); n=normalize(mix(n,C.n,wc)); r=mix(r,C.r,wc); h=mix(h,C.r.b,wc);` : ''}
  ${two ? `
  // 泥地：石板缺失、低洼、墙根的地方露出泥和碎砾；法阵中心保持干净
  float mb=smoothstep(.48,.78,fbm(p*.1+5.))*.9+smoothstep(21.,27.,edge)*.7;
  mb*=smoothstep(6.5,9.,rr);
  PS B=pbrTile(tBd,tBn,tBr,vec2(p.x,-p.y)/uSB,1.-m);
  float wb=smoothstep(-.07,.07,mb*2.-1.+(B.r.b*.6-h)*.9);
  alb=mix(alb,B.a,wb); n=normalize(mix(n,B.n,wb)); r=mix(r,B.r,wb); h=mix(h,B.r.b*.5,wb);` : ''}
  // 大尺度明暗：避免整片地面一个色调
  alb*=.78+.4*fbm(p*.07+11.);
  alb=mix(alb,alb*vec3(.85,.95,.7),smoothstep(.6,.85,fbm(p*.3+40.))*.35);
  float rough=r.r, hh=h*.045;
  vec3 emit=runeEmit(p,alb,hh);
  float water=puddle(p,hh,alb,rough);
  n.xy*=1.25;
  vec3 nw=normalize(vec3(n.x,n.z,-n.y));
  nw=normalize(mix(nw,vec3((vnoise(p*5.+uTime*.35)-.5)*.02,1.,(vnoise(p*5.3-uTime*.21)-.5)*.02),water));
  g.alb=alb; g.rough=rough; g.h=hh; g.ao=r.g*occAO(p); g.emit=emit; g.nw=nw;
  return g; }`;
    const procHead = `
GS ground(vec2 p){
  GS g;
  float rowH=1.15, r=floor(p.y/rowH), fy=p.y-r*rowH;
  float w=1.25+h21(vec2(r,3.1))*0.95, xo=p.x+h21(vec2(r,7.7))*5., c=floor(xo/w), fx=xo-c*w;
  vec2 id=vec2(c,r);
  float wob=(vnoise(p*4.3)-.5)*.06;
  float e=min(min(fx,w-fx),min(fy,rowH-fy))+wob;
  float stone=smoothstep(.012,.05,e);
  float sh=h21(id);
  vec2 tilt=(h22(id+3.)-.5)*.035;
  float hs=.03+dot(tilt,vec2(fx-w*.5,fy-rowH*.5))+(fbm(p*5.+id)-.5)*.014;
  hs-=(1.-smoothstep(.03,.16,e))*.014;
  float chip=step(.8,h21(id+5.))*(1.-smoothstep(.1,.32,length(vec2(min(fx,w-fx),min(fy,rowH-fy)))+(vnoise(p*9.)-.5)*.12));
  hs-=chip*.022;
  vec2 v=voro(p*1.25+id*7.13);
  float crack=(1.-smoothstep(0.,.028+.02*vnoise(p*3.),v.y-v.x))*step(.55,h21(id+11.))*stone*(1.-chip);
  vec3 sCol=mix(vec3(.13,.12,.105),vec3(.27,.24,.2),sh);
  sCol*=.68+.64*fbm(p*1.9+id*1.7);
  sCol*=mix(vec3(1.),vec3(1.06,.97,.9),step(.7,h21(id+21.)));
  sCol=mix(sCol,vec3(.085,.066,.048),smoothstep(.42,.78,fbm(p*.23+9.))*.75);
  sCol=mix(sCol,vec3(.06,.07,.035),smoothstep(.62,.85,fbm(p*.4+40.))*.6);
  sCol=mix(sCol,sCol*1.35,(1.-smoothstep(.02,.09,e))*stone*.6);
  vec3 gapCol=mix(vec3(.028,.024,.02),vec3(.035,.05,.018),smoothstep(.48,.78,fbm(p*.55+3.)));
  vec3 alb=mix(gapCol,sCol,stone);
  alb=mix(alb,alb*.3,crack); alb=mix(alb,gapCol*1.4,chip*.7);
  float h=stone*hs-crack*.012-(1.-stone)*.01;
  float rough=mix(.95,.74+.12*vnoise(p*6.),stone);
  vec3 emit=runeEmit(p,alb,h);
  float water=puddle(p,h,alb,rough);
  h=mix(h,h+(vnoise(p*5.+vec2(uTime*.35,uTime*.21))-.5)*.0012,water);
  g.alb=alb; g.rough=rough; g.h=h; g.ao=mix(.5,1.,stone)*(1.-crack*.4)*occAO(p); g.emit=emit; g.nw=vec3(0.);
  return g; }`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', head + (usePBR ? pbrHead : procHead))
      .replace('#include <map_fragment>', 'GS gs=ground(vW.xz); diffuseColor.rgb=gs.alb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor=gs.rough;')
      .replace('#include <normal_fragment_maps>', usePBR ? 'normal=normalize((viewMatrix*vec4(gs.nw,0.)).xyz);' : 'normal=bumpN(normal,gs.h,-vViewPosition);')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance+=gs.emit;')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse*=gs.ao; reflectedLight.indirectSpecular*=gs.ao; reflectedLight.directDiffuse*=mix(1.,gs.ao,.6);');
  };
  mat.customProgramCacheKey = () => 'ground' + OCT + N + usePBR + two + three;
  return mat;
}

/* ───────── 岩石（柱子、墙、墓碑、碎石）───────── */
/* tex：照片材质槽位（三向投影）；没有就用程序噪声。seams：在立面上画砌缝（用不带砌缝的岩石贴图时才需要） */
export function stoneMaterial({tint = 0xffffff, moss = 1, scale = 1, wet = 1, masonry = 1, tex = null} = {}) {
  const mat = new THREE.MeshStandardMaterial({color: tint, roughness: 1, metalness: 0});
  const seams = tex ? (tex.baked ? masonry : 0) : masonry;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime; shader.uniforms.uFocus = shared.uFocus;
    if (tex) Object.assign(shader.uniforms, {tSd: {value: tex.d}, tSn: {value: tex.n}, tSr: {value: tex.r}, uSS: {value: tex.size / scale}});
    addWorldVaryings(shader);
    const base = tex ? `
  PS S=pbrTri(tSd,tSn,tSr,vW,normalize(vWN),uSS,1.3);
  vec3 col=S.a*(.8+.4*fbm3(vW*.35));
  float n2=vnoise3(vW*7.), pits=0., n1=S.r.b;
  vec3 snw=S.n;` : `
  vec3 wp=vW*${scale.toFixed(2)};
  float n1=fbm3(wp*1.3), n2=vnoise3(wp*7.), n3=vnoise3(wp*23.);
  float pits=smoothstep(.55,.75,vnoise3(wp*3.1))*.6;
  vec3 col=mix(vec3(.2,.19,.18),vec3(.42,.39,.35),n1)*(.85+.3*n2);
  col*=1.-pits*.35;`;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
#define FBM_OCT ${Math.min(OCT, 4)}
uniform float uTime; uniform vec3 uFocus; varying vec3 vW; varying vec3 vWN;
${NOISE}
${tex ? PBR_GLSL + '\nuniform sampler2D tSd,tSn,tSr; uniform float uSS;' : ''}`)
      .replace('#include <map_fragment>', `${SEE_THROUGH}
  ${base}
  // 雨水顺着立面冲刷出的竖向条纹
  float streak=vnoise(vec2(vW.x*5.+vW.z*5.,vW.y*.35))*smoothstep(.2,.9,abs(vWN.x)+abs(vWN.z));
  col*=.85+.3*streak;
  // 顶面长苔藓，越往下越少；墙根也有
  float up=clamp(vWN.y,0.,1.);
  float mossM=smoothstep(.45,.95,up)*smoothstep(.38,.62,fbm3(vW*.9+4.))*${moss.toFixed(2)};
  mossM=max(mossM,smoothstep(.55,.8,fbm3(vW*1.7))*(1.-smoothstep(0.,.6,vW.y))*.8*${moss.toFixed(2)});
  col=mix(col,vec3(.045,.065,.022)*(.8+.4*n2),mossM);
  float foot=1.-smoothstep(0.,1.1,vW.y);
  col*=1.-foot*.45;
  // 砌缝
  float vert=1.-up;
  float uu=abs(vWN.x)>abs(vWN.z)?vW.z:vW.x, rowI=floor(vW.y/.62);
  float bx=fract((uu+mod(rowI,2.)*.55)/1.1), by=fract(vW.y/.62);
  float joint=min(min(bx,1.-bx)*1.1,min(by,1.-by)*.62)+(vnoise3(vW*6.)-.5)*.02;
  float seam=(1.-smoothstep(.01,.035,joint))*step(.5,vert)*${seams.toFixed(2)};
  col=mix(col,col*.35,seam);
  col*=1.+(h31(vec3(floor((uu+mod(rowI,2.)*.55)/1.1),rowI,3.))-.5)*.25*step(.5,vert)*${seams.toFixed(2)};
  diffuseColor.rgb=col*diffuseColor.rgb;
  float sh=n1*.06+n2*.015-pits*.035-seam*.03;`)
      .replace('#include <roughnessmap_fragment>', tex
        ? `float roughnessFactor=mix(S.r.r,S.r.r*.6,foot*${wet.toFixed(2)})-mossM*.05;`
        : `float roughnessFactor=mix(.88,.55,foot*${wet.toFixed(2)})-mossM*.05;`)
      .replace('#include <normal_fragment_maps>', tex
        ? 'normal=normalize((viewMatrix*vec4(snw,0.)).xyz); normal=bumpN(normal,-seam*.03,-vViewPosition);'
        : 'normal=bumpN(normal,sh,-vViewPosition);')
      .replace('#include <aomap_fragment>', tex
        ? 'float sao=S.r.g; reflectedLight.indirectDiffuse*=sao*(1.-foot*.5); reflectedLight.indirectSpecular*=sao; reflectedLight.directDiffuse*=mix(1.,sao,.5)*(1.-foot*.25);'
        : 'reflectedLight.indirectDiffuse*=1.-foot*.5; reflectedLight.directDiffuse*=1.-foot*.25;');
  };
  mat.customProgramCacheKey = () => 'stone' + OCT + moss + scale + wet + masonry + (tex ? tex.slug : '');
  return mat;
}

/* ───────── 锻铁（火盆、铁链、栅栏）───────── */
export function ironMaterial() {
  const mat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: .6, metalness: .85});
  mat.onBeforeCompile = shader => {
    shader.uniforms.uFocus = shared.uFocus;
    addWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
#define FBM_OCT 3
uniform vec3 uFocus; varying vec3 vW; varying vec3 vWN;
${NOISE}`)
      .replace('#include <map_fragment>', `${SEE_THROUGH}
  float rust=smoothstep(.45,.7,fbm3(vW*3.))*(.6+.4*vnoise3(vW*25.));
  vec3 col=mix(vec3(.05,.05,.055),vec3(.16,.07,.03),rust);
  diffuseColor.rgb=col;
  float ih=vnoise3(vW*40.)*.0015+rust*.002;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor=mix(.45,.95,rust);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor=mix(.9,.15,rust);')
      .replace('#include <normal_fragment_maps>', 'normal=bumpN(normal,ih,-vViewPosition);');
  };
  mat.customProgramCacheKey = () => 'iron';
  return mat;
}

/* ───────── 人物 / 怪物立绘：立在地上、面向镜头的贴片，照样被火光照亮；顶点着色器做呼吸、前倾、迈步 ───────── */
export function spriteMaterial(tex) {
  const u = {uLean: {value: 0}, uLegs: {value: 0}, uBreath: {value: 0}, uH: {value: 1}};
  const mat = new THREE.MeshStandardMaterial({map: tex, alphaTest: .42, side: THREE.DoubleSide, roughness: .82, metalness: 0,
    emissive: 0x000000, envMapIntensity: .6});
  mat.userData.u = u;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uLean,uLegs,uBreath,uH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  float yy=clamp(position.y/uH,0.,1.);
  transformed.x+=uLean*uH*pow(yy,1.5)+(yy<.34?uLegs*(.34-yy)/.34:0.);
  transformed.y*=1.+uBreath*smoothstep(.4,1.,yy);`);
    // 立绘本身没有法线信息：给一点「从下往上」的弧形法线，让脚下的火光和头顶的月光分别照到下半身和上半身
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  normal=normalize(normal+vec3(0.,(vMapUv.y-.5)*.9,0.));`);
  };
  mat.customProgramCacheKey = () => 'sprite';
  return mat;
}
