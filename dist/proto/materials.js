/* 归墟 3D 小样 · 程序材质：地面（石板、缝隙、裂纹、苔藓、积水、符文法阵）、岩石（风化、苔藓、雨痕）、铁器。
 * 都基于 MeshStandardMaterial，只替换颜色 / 粗糙度 / 法线 / 自发光几段，所以照样吃三维光照、阴影、雾和环境反射。 */
import * as THREE from '../vendor/three.module.js';
import {NOISE} from './glsl.js';

const shared = {uTime: {value: 0}, uFocus: {value: new THREE.Vector3()}};
export const tickMaterials = (t, focus) => { shared.uTime.value = t; if (focus) shared.uFocus.value.copy(focus); };
/* 挡在镜头和玩家之间的柱子、墙：按网点图案镂空（暗黑 4 的做法），玩家永远看得见；投影不受影响。 */
const SEE_THROUGH = `
  { vec3 cp=cameraPosition, fp=uFocus+vec3(0.,1.1,0.), ab=fp-cp; float t=dot(vW-cp,ab)/dot(ab,ab);
    float dl=length(vW-(cp+ab*clamp(t,0.,1.)));
    if(t<.96 && vW.y>.35){ float th=(1.-smoothstep(1.1,2.6,dl))*.94; vec2 q=mod(floor(gl_FragCoord.xy),4.);
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
export function groundMaterial(occluders) {
  const mat = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 1});
  const N = occluders.length;
  const occ = occluders.map(o => new THREE.Vector4(o.x, o.z, o.r, o.k));
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uOcc = {value: occ};
    shader.uniforms.uRune = {value: 1};
    mat.userData.shader = shader;
    addWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
#define FBM_OCT ${OCT}
#define OCC_N ${N}
uniform float uTime; uniform float uRune; uniform vec4 uOcc[OCC_N];
varying vec3 vW; varying vec3 vWN;
${NOISE}
struct GS{ vec3 alb; float rough; float h; float ao; vec3 emit; };
GS ground(vec2 p){
  GS g;
  // —— 石板：错缝铺设，每排宽度、错位随机，边缘带一点手工凿出来的不规整 ——
  float rowH=1.15, r=floor(p.y/rowH), fy=p.y-r*rowH;
  float w=1.25+h21(vec2(r,3.1))*0.95, xo=p.x+h21(vec2(r,7.7))*5., c=floor(xo/w), fx=xo-c*w;
  vec2 id=vec2(c,r);
  float wob=(vnoise(p*4.3)-.5)*.06;
  float e=min(min(fx,w-fx),min(fy,rowH-fy))+wob;
  float stone=smoothstep(.012,.05,e);
  float sh=h21(id);
  vec2 tilt=(h22(id+3.)-.5)*.035;                       // 每块石板略有沉降、倾斜
  float hs=.03+dot(tilt,vec2(fx-w*.5,fy-rowH*.5))+(fbm(p*5.+id)-.5)*.014;
  hs-=(1.-smoothstep(.03,.16,e))*.014;                  // 边缘磨圆
  // 缺角：少数石板的角被敲掉
  float chip=step(.8,h21(id+5.))*(1.-smoothstep(.1,.32,length(vec2(min(fx,w-fx),min(fy,rowH-fy)))+(vnoise(p*9.)-.5)*.12));
  hs-=chip*.022;
  // 裂纹
  vec2 v=voro(p*1.25+id*7.13);
  float cracked=step(.55,h21(id+11.));
  float crack=(1.-smoothstep(0.,.028+.02*vnoise(p*3.),v.y-v.x))*cracked*stone*(1.-chip);
  // —— 颜色 ——
  vec3 sCol=mix(vec3(.13,.12,.105),vec3(.27,.24,.2),sh);
  sCol*=.68+.64*fbm(p*1.9+id*1.7);
  sCol*=mix(vec3(1.),vec3(1.06,.97,.9),step(.7,h21(id+21.)));                 // 偶尔一块偏暖的石头
  float dirt=smoothstep(.42,.78,fbm(p*.23+9.));
  sCol=mix(sCol,vec3(.085,.066,.048),dirt*.75);
  sCol=mix(sCol,vec3(.06,.07,.035),smoothstep(.62,.85,fbm(p*.4+40.))*.6);   // 大片的苔藓地
  sCol=mix(sCol,sCol*1.35,(1.-smoothstep(.02,.09,e))*stone*.6);               // 边缘被踩亮
  float mossA=smoothstep(.48,.78,fbm(p*.55+3.));
  vec3 gapCol=mix(vec3(.028,.024,.02),vec3(.035,.05,.018),mossA);
  vec3 alb=mix(gapCol,sCol,stone);
  alb=mix(alb,alb*.3,crack); alb=mix(alb,gapCol*1.4,chip*.7);
  float h=stone*hs-crack*.012-(1.-stone)*.01;
  float rough=mix(.95,.74+.12*vnoise(p*6.),stone);
  // —— 积水：水位高于地面的地方是镜面水坑，水坑边有一圈湿透、再往外一圈潮 ——
  float big=fbm(p*.085+21.);
  float pl=smoothstep(.5,.72,big)*.055-.012+(vnoise(p*.9)-.5)*.006;
  float dep=pl-h;
  float water=smoothstep(-.002,.004,dep);
  float soak=smoothstep(-.012,0.,dep)*(1.-water);
  float damp=smoothstep(-.035,-.01,dep)*(1.-water)*(1.-soak);
  alb*=1.-soak*.45-damp*.22;
  alb=mix(alb,alb*.22+vec3(.003,.004,.006),water*smoothstep(0.,.02,dep)+water*.4);
  rough=mix(rough,.5,damp); rough=mix(rough,.18,soak); rough=mix(rough,.035,water);
  // 水面细小波纹
  float rip=(vnoise(p*5.+vec2(uTime*.35,uTime*.21))-.5)*.0012;
  h=mix(h,pl+rip,water);
  // —— 遮蔽：缝里更暗；柱子、墙脚、火盆周围有一圈接触阴影 ——
  float ao=mix(.5,1.,stone)*(1.-crack*.4);
  for(int i=0;i<OCC_N;i++){ vec4 o=uOcc[i]; float d=length(p-o.xy); ao*=1.-o.w*(1.-smoothstep(o.z*.6,o.z*1.6,d)); }
  // —— 中央献祭法阵：刻在地上的符文环，缝里透出暗红的光 ——
  vec3 emit=vec3(0.);
  float rr=length(p), ang=atan(p.y,p.x);
  float ring1=1.-smoothstep(.015,.05,abs(rr-5.6)), ring2=1.-smoothstep(.01,.04,abs(rr-4.7));
  float seg=step(.35,fract(ang*9.549))*step(fract(ang*9.549),.85);
  float glyph=(1.-smoothstep(.03,.08,abs(rr-5.15)))*step(.5,h21(vec2(floor(ang*9.549*3.),1.)))*seg;
  float pent=0.; for(int k=0;k<5;k++){ float a1=float(k)*1.2566+1.5708, a2=float(k+2)*1.2566+1.5708;
    vec2 A=4.7*vec2(cos(a1),sin(a1)), B=4.7*vec2(cos(a2),sin(a2)), ba=B-A, pa=p-A;
    float t=clamp(dot(pa,ba)/dot(ba,ba),0.,1.); pent=max(pent,(1.-smoothstep(.01,.035,length(pa-ba*t)))*.55); }
  float rune=max(max(ring1,ring2),max(glyph,pent))*step(rr,6.);
  float pulse=.65+.35*sin(uTime*1.7)+.15*sin(uTime*5.3+rr);
  emit=vec3(1.1,.12,.03)*rune*pulse*uRune*(.35+.65*vnoise(p*3.+uTime*.6));
  alb=mix(alb,vec3(.03,.01,.008),rune);
  h-=rune*.008;
  g.alb=alb; g.rough=rough; g.h=h; g.ao=ao; g.emit=emit;
  return g;
}`)
      .replace('#include <map_fragment>', 'GS gs=ground(vW.xz); diffuseColor.rgb=gs.alb;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor=gs.rough;')
      .replace('#include <normal_fragment_maps>', 'normal=bumpN(normal,gs.h,-vViewPosition);')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance+=gs.emit;')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse*=gs.ao; reflectedLight.indirectSpecular*=gs.ao; reflectedLight.directDiffuse*=mix(1.,gs.ao,.6);');
  };
  mat.customProgramCacheKey = () => 'ground' + OCT + N;
  return mat;
}

/* ───────── 岩石（柱子、墙、墓碑、碎石）───────── */
export function stoneMaterial({tint = 0xffffff, moss = 1, scale = 1, wet = 1, masonry = 1} = {}) {
  const mat = new THREE.MeshStandardMaterial({color: tint, roughness: 1, metalness: 0});
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = shared.uTime; shader.uniforms.uFocus = shared.uFocus;
    addWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
#define FBM_OCT ${Math.min(OCT, 4)}
uniform float uTime; uniform vec3 uFocus; varying vec3 vW; varying vec3 vWN;
${NOISE}`)
      .replace('#include <map_fragment>', `${SEE_THROUGH}
  vec3 wp=vW*${scale.toFixed(2)};
  float n1=fbm3(wp*1.3), n2=vnoise3(wp*7.), n3=vnoise3(wp*23.);
  // 块面风化：大块的凹坑 + 细碎的颗粒
  float pits=smoothstep(.55,.75,vnoise3(wp*3.1))*.6;
  vec3 col=mix(vec3(.2,.19,.18),vec3(.42,.39,.35),n1)*(.85+.3*n2);
  col*=1.-pits*.35;
  // 雨水顺着立面冲刷出的竖向条纹
  float streak=vnoise(vec2(wp.x*5.+wp.z*5.,wp.y*.35))*smoothstep(.2,.9,abs(vWN.x)+abs(vWN.z));
  col*=.85+.3*streak;
  // 顶面长苔藓，越往下越少
  float up=clamp(vWN.y,0.,1.);
  float mossM=smoothstep(.45,.95,up)*smoothstep(.38,.62,fbm3(wp*.9+4.))*${moss.toFixed(2)};
  mossM=max(mossM,smoothstep(.55,.8,fbm3(wp*1.7))*(1.-smoothstep(0.,.6,vW.y))*.8*${moss.toFixed(2)});   // 墙根也有
  col=mix(col,vec3(.045,.065,.022)*(.8+.4*n2),mossM);
  // 贴地处更暗、更湿
  float foot=1.-smoothstep(0.,1.1,vW.y);
  col*=1.-foot*.45;
  // 砌石：立面上错缝的石块，缝里更暗、更凹
  float vert=1.-up;
  float uu=abs(vWN.x)>abs(vWN.z)?vW.z:vW.x, rowI=floor(vW.y/.62);
  float bx=fract((uu+mod(rowI,2.)*.55)/1.1), by=fract(vW.y/.62);
  float joint=min(min(bx,1.-bx)*1.1,min(by,1.-by)*.62)+(vnoise3(vW*6.)-.5)*.02;
  float seam=(1.-smoothstep(.01,.035,joint))*step(.5,vert)*${masonry.toFixed(2)};
  col=mix(col,col*.35,seam);
  col*=1.+(h31(vec3(floor((uu+mod(rowI,2.)*.55)/1.1),rowI,3.))-.5)*.25*step(.5,vert)*${masonry.toFixed(2)};
  diffuseColor.rgb=col*diffuseColor.rgb;
  float sh=n1*.06+n2*.015+n3*.003-pits*.035-seam*.03;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor=mix(.88,.55,foot*${wet.toFixed(2)})-mossM*.05;`)
      .replace('#include <normal_fragment_maps>', 'normal=bumpN(normal,sh,-vViewPosition);')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse*=1.-foot*.5; reflectedLight.directDiffuse*=1.-foot*.25;');
  };
  mat.customProgramCacheKey = () => 'stone' + OCT + moss + scale + wet + masonry;
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
