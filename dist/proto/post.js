/* 归墟 3D 小样 · 后期：HDR 渲染 → 泛光（逐级降采样 / 升采样）→ 电影调色（暗部偏冷、亮部偏暖）→ ACES 色调映射 → 暗角、色差、胶片颗粒、受伤红边。 */
import * as THREE from '../vendor/three.module.js';

const VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';

export const MAX_VL = 8;
export function createPost(renderer, {msaa = true, levels = 5, ao = true, vol = true, steps = 10} = {}) {
  const rtOpt = {type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false};
  const depthTex = new THREE.DepthTexture(4, 4); depthTex.type = THREE.UnsignedIntType;
  const main = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: msaa ? 4 : 0, depthTexture: depthTex});
  const half = {minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: THREE.HalfFloatType};
  const aoRT = new THREE.WebGLRenderTarget(4, 4, half), volRT = new THREE.WebGLRenderTarget(4, 4, half);
  const mips = Array.from({length: levels}, () => new THREE.WebGLRenderTarget(4, 4, rtOpt));
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false; scene.add(quad);
  const mk = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra});

  const pre = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; varying vec2 vUv;
    vec3 s(vec2 o){ return texture2D(tSrc,vUv+o*uTexel).rgb; }
    void main(){
      vec3 a=s(vec2(-1,-1)),b=s(vec2(1,-1)),c=s(vec2(-1,1)),d=s(vec2(1,1));
      // 按亮度加权平均（Karis），压住太阳 / 火星这种单点极亮像素造成的闪烁
      float wa=1./(1.+max(a.r,max(a.g,a.b))),wb=1./(1.+max(b.r,max(b.g,b.b))),wc=1./(1.+max(c.r,max(c.g,c.b))),wd=1./(1.+max(d.r,max(d.g,d.b)));
      vec3 col=(a*wa+b*wb+c*wc+d*wd)/(wa+wb+wc+wd);
      float br=max(col.r,max(col.g,col.b)), knee=uThresh*.6;
      float soft=clamp(br-uThresh+knee,0.,2.*knee); soft=soft*soft/(4.*knee+1e-4);
      float w=max(soft,br-uThresh)/max(br,1e-4);
      gl_FragColor=vec4(col*w,1.); }`, {tSrc: {value: null}, uTexel: {value: new THREE.Vector2()}, uThresh: {value: 1.5}});
  const down = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
    void main(){ vec3 c=texture2D(tSrc,vUv).rgb*.5;
      c+=texture2D(tSrc,vUv+uTexel*vec2(-1,-1)).rgb*.125+texture2D(tSrc,vUv+uTexel*vec2(1,-1)).rgb*.125+texture2D(tSrc,vUv+uTexel*vec2(-1,1)).rgb*.125+texture2D(tSrc,vUv+uTexel*vec2(1,1)).rgb*.125;
      gl_FragColor=vec4(c,1.); }`, {tSrc: {value: null}, uTexel: {value: new THREE.Vector2()}});
  const up = mk(`uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uW; varying vec2 vUv;
    void main(){ vec3 c=vec3(0.);
      c+=texture2D(tSrc,vUv+uTexel*vec2(-1,-1)).rgb; c+=texture2D(tSrc,vUv+uTexel*vec2(0,-1)).rgb*2.; c+=texture2D(tSrc,vUv+uTexel*vec2(1,-1)).rgb;
      c+=texture2D(tSrc,vUv+uTexel*vec2(-1,0)).rgb*2.; c+=texture2D(tSrc,vUv).rgb*4.; c+=texture2D(tSrc,vUv+uTexel*vec2(1,0)).rgb*2.;
      c+=texture2D(tSrc,vUv+uTexel*vec2(-1,1)).rgb; c+=texture2D(tSrc,vUv+uTexel*vec2(0,1)).rgb*2.; c+=texture2D(tSrc,vUv+uTexel*vec2(1,1)).rgb;
      gl_FragColor=vec4(c/16.*uW,1.); }`, {tSrc: {value: null}, uTexel: {value: new THREE.Vector2()}, uW: {value: 1}},
    {blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor});
  /* ── 屏幕空间环境光遮蔽（半分辨率）：墙根、柱脚、怪物脚下、石缝都会自然压暗 ── */
  const VIEWPOS = `uniform sampler2D tDepth; uniform mat4 uProjInv;
    vec3 vpos(vec2 uv){ float d=texture2D(tDepth,uv).r; vec4 p=uProjInv*vec4(uv*2.-1.,d*2.-1.,1.); return p.xyz/p.w; }`;
  const aoMat = mk(`${VIEWPOS} uniform vec2 uTexel; uniform float uR,uProjS,uTime; varying vec2 vUv;
    float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715)))); }
    void main(){
      vec3 P=vpos(vUv);
      if(-P.z>150.){ gl_FragColor=vec4(1.,-P.z,0.,1.); return; }
      vec3 px=vpos(vUv+vec2(uTexel.x,0.))-P, nx=P-vpos(vUv-vec2(uTexel.x,0.)), py=vpos(vUv+vec2(0.,uTexel.y))-P, ny=P-vpos(vUv-vec2(0.,uTexel.y));
      vec3 dx=abs(px.z)<abs(nx.z)?px:nx, dy=abs(py.z)<abs(ny.z)?py:ny;
      vec3 N=normalize(cross(dx,dy));
      float rad=uR*uProjS/(-P.z);                     // 世界半径投到屏幕上的像素半径
      float a0=ign(gl_FragCoord.xy+uTime*37.)*6.2832, sum=0.;
      const int S=12;
      for(int i=0;i<S;i++){
        float f=(float(i)+.5)/float(S), ang=a0+float(i)*2.4;
        vec2 o=vec2(cos(ang),sin(ang))*rad*f*uTexel*.5;
        vec3 v=vpos(vUv+o)-P; float vv=dot(v,v);
        sum+=max(0.,dot(v,N)-.02*-P.z)/(vv+.01)*(1.-smoothstep(uR*uR*.5,uR*uR*2.,vv));
      }
      float ao=clamp(1.-sum*(3.2/float(S)),0.,1.);
      gl_FragColor=vec4(ao*ao,-P.z,0.,1.); }`,
    {tDepth: {value: depthTex}, uProjInv: {value: new THREE.Matrix4()}, uTexel: {value: new THREE.Vector2()}, uR: {value: 1.3}, uProjS: {value: 500}, uTime: {value: 0}});

  /* ── 体积雾：沿视线步进，贴地的雾更浓、会缓慢流动；火盆、法术的点光在雾里散射出光晕 ── */
  const volMat = mk(`${VIEWPOS} uniform mat4 uCamW; uniform vec3 uCamPos; uniform float uTime,uDens,uScat;
    uniform vec4 uLP[${MAX_VL}]; uniform vec3 uLC[${MAX_VL}]; uniform int uLN; uniform vec3 uAmb; varying vec2 vUv;
    float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715)))); }
    float h3(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
    float n3(vec3 x){ vec3 i=floor(x),f=fract(x); f=f*f*(3.-2.*f);
      return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
    void main(){
      vec3 W=(uCamW*vec4(vpos(vUv),1.)).xyz, rd=W-uCamPos; float L=min(length(rd),70.); rd=normalize(rd);
      // 只在离地 0～6 米的雾层里积分
      float t0=rd.y<0.?max(0.,(6.-uCamPos.y)/rd.y):0.;
      t0=min(t0,L); float seg=L-t0;
      const int N=${steps}; float ds=seg/float(N), j=ign(gl_FragCoord.xy+fract(uTime*7.)*91.);
      vec3 acc=vec3(0.); float T=1.;
      for(int i=0;i<N;i++){
        vec3 p=uCamPos+rd*(t0+(float(i)+j)*ds);
        float hgt=max(p.y,0.);
        float d=uDens*exp(-hgt*.55)*(.35+1.1*n3(p*.22+vec3(uTime*.25,-uTime*.05,uTime*.12))*n3(p*.07-vec3(uTime*.03,0.,0.)));
        vec3 L=uAmb;
        for(int k=0;k<${MAX_VL};k++){ if(k>=uLN) break;
          vec3 dv=uLP[k].xyz-p; float r2=dot(dv,dv), rr=uLP[k].w;
          float win=clamp(1.-r2*r2/(rr*rr*rr*rr),0.,1.); L+=uLC[k]*win*win/(r2+.6); }
        float tr=exp(-d*ds);
        acc+=T*L*uScat*d*ds; T*=tr;
      }
      gl_FragColor=vec4(acc,T); }`,
    {tDepth: {value: depthTex}, uProjInv: {value: new THREE.Matrix4()}, uCamW: {value: new THREE.Matrix4()}, uCamPos: {value: new THREE.Vector3()},
      uTime: {value: 0}, uDens: {value: .06}, uScat: {value: .55}, uLP: {value: Array.from({length: MAX_VL}, () => new THREE.Vector4())},
      uLC: {value: Array.from({length: MAX_VL}, () => new THREE.Vector3())}, uLN: {value: 0}, uAmb: {value: new THREE.Vector3(.05, .065, .1)}});

  const final = mk(`uniform sampler2D tScene,tBloom,tAO,tVol,tDepth; uniform vec2 uRes,uHalfTexel; uniform float uTime,uExposure,uBloom,uHurt,uDesat,uFlash,uAOk,uVolOn,uDebug; uniform mat4 uProjInv;
    varying vec2 vUv;
    float lin(vec2 uv){ float d=texture2D(tDepth,uv).r; vec4 p=uProjInv*vec4(uv*2.-1.,d*2.-1.,1.); return -p.z/p.w; }
    // 半分辨率的遮蔽 / 雾：按深度相近程度加权取样，人物边缘不会糊出光晕
    void upsample(out float ao, out vec4 vol){
      float z=lin(vUv), ws=0.; ao=0.; vol=vec4(0.);
      for(int i=0;i<4;i++){ vec2 o=vec2(i==0||i==2?-1.:1.,i<2?-1.:1.)*uHalfTexel;
        vec2 a=texture2D(tAO,vUv+o).rg; float w=1./(.02+abs(a.g-z)/max(z,1.)*40.);
        ao+=a.r*w; vol+=texture2D(tVol,vUv+o)*w; ws+=w; }
      ao/=ws; vol/=ws; }
    vec3 aces(vec3 x){ const float a=2.51,b=.03,c=2.43,d=.59,e=.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
    vec3 srgb(vec3 c){ return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c)); }
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 d=vUv-.5; float r2=dot(d,d);
      float ca=.0012+uHurt*.006;
      vec3 col=vec3(texture2D(tScene,vUv-d*ca).r,texture2D(tScene,vUv).g,texture2D(tScene,vUv+d*ca).b);
      if(uVolOn>.5){ float ao; vec4 vol; upsample(ao,vol);
        float lum0=dot(col,vec3(.2126,.7152,.0722));
        col*=mix(1.,ao,uAOk*(1.-smoothstep(.8,3.,lum0)));
        col=col*vol.a+vol.rgb;
        if(uDebug>.5){ gl_FragColor=vec4(uDebug<1.5?vec3(ao):uDebug<2.5?vol.rgb*3.:vec3(vol.a),1.); return; } }
      col+=texture2D(tBloom,vUv).rgb*uBloom;
      col+=vec3(1.,.85,.7)*uFlash;
      col*=uExposure;
      float l=dot(col,vec3(.2126,.7152,.0722));
      col=mix(col,col*vec3(.82,.95,1.16),(1.-smoothstep(0.,.18,l))*.7);      // 暗部偏青蓝
      col=mix(col,col*vec3(1.1,.97,.84),smoothstep(.25,1.6,l)*.55);           // 亮部偏琥珀
      col=aces(col);
      float lum=dot(col,vec3(.299,.587,.114));
      col=mix(vec3(lum),col,.9-uDesat);
      col=(col-.45)*1.07+.45;
      col=max(col,vec3(.008,.011,.016));                                      // 提一点发青的黑位
      float vig=1.-smoothstep(.12,.62,r2*1.35);
      col*=mix(.28,1.,vig);
      col=mix(col,vec3(.3,0.,.01),uHurt*smoothstep(.1,.45,r2)*.8);
      col=srgb(clamp(col,0.,1.));
      float g=hash(vUv*uRes+fract(uTime*7.31)*91.);
      col+=(g-.5)*.03;
      gl_FragColor=vec4(col,1.); }`,
    {tScene: {value: null}, tBloom: {value: null}, tAO: {value: aoRT.texture}, tVol: {value: volRT.texture}, tDepth: {value: depthTex}, uHalfTexel: {value: new THREE.Vector2()},
      uAOk: {value: ao ? .85 : 0}, uDebug: {value: 0}, uVolOn: {value: ao || vol ? 1 : 0}, uProjInv: {value: new THREE.Matrix4()}, uRes: {value: new THREE.Vector2()}, uTime: {value: 0}, uExposure: {value: 1.05},
      uBloom: {value: .3}, uHurt: {value: 0}, uDesat: {value: 0}, uFlash: {value: 0}});

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(scene, cam); }
  let W = 4, H = 4;
  return {
    final: final.uniforms, vol: volMat.uniforms, ao: aoMat.uniforms,
    setSize(w, h) {
      W = w; H = h;
      main.setSize(w, h);
      const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1); aoRT.setSize(hw, hh); volRT.setSize(hw, hh);
      aoMat.uniforms.uTexel.value.set(1 / hw, 1 / hh); final.uniforms.uHalfTexel.value.set(1 / hw, 1 / hh);
      let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
      for (const m of mips) { m.setSize(mw, mh); mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); }
      final.uniforms.uRes.value.set(w, h);
    },
    render(sceneToDraw, camera, t) {
      renderer.setRenderTarget(main);
      renderer.render(sceneToDraw, camera);
      if (ao || vol) {
        camera.updateMatrixWorld();
        for (const u of [aoMat.uniforms, volMat.uniforms, final.uniforms]) u.uProjInv.value.copy(camera.projectionMatrixInverse);
        aoMat.uniforms.uProjS.value = H * .5 * camera.projectionMatrix.elements[5]; aoMat.uniforms.uTime.value = t;
        if (ao) pass(aoMat, aoRT); else { renderer.setRenderTarget(aoRT); renderer.setClearColor(0xffffff, 1); renderer.clear(); renderer.setClearColor(0x000000, 1); }
        volMat.uniforms.uCamW.value.copy(camera.matrixWorld); volMat.uniforms.uCamPos.value.copy(camera.position); volMat.uniforms.uTime.value = t;
        if (vol) pass(volMat, volRT); else { renderer.setRenderTarget(volRT); renderer.setClearColor(0x000000, 1); renderer.clear(); }
      }
      pre.uniforms.tSrc.value = main.texture; pre.uniforms.uTexel.value.set(1 / W, 1 / H);
      pass(pre, mips[0]);
      for (let i = 1; i < mips.length; i++) {
        down.uniforms.tSrc.value = mips[i - 1].texture; down.uniforms.uTexel.value.set(1 / mips[i - 1].width, 1 / mips[i - 1].height);
        pass(down, mips[i]);
      }
      for (let i = mips.length - 1; i > 0; i--) {
        up.uniforms.tSrc.value = mips[i].texture; up.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
        renderer.autoClear = false; pass(up, mips[i - 1]); renderer.autoClear = true;
      }
      final.uniforms.tScene.value = main.texture; final.uniforms.tBloom.value = mips[0].texture; final.uniforms.uTime.value = t;
      pass(final, null);
    }
  };
}
