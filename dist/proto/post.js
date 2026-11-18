/* 归墟 3D 小样 · 后期：HDR 渲染 → 泛光（逐级降采样 / 升采样）→ 电影调色（暗部偏冷、亮部偏暖）→ ACES 色调映射 → 暗角、色差、胶片颗粒、受伤红边。 */
import * as THREE from '../vendor/three.module.js';

const VERT = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }';

export function createPost(renderer, {msaa = true, levels = 5} = {}) {
  const rtOpt = {type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false};
  const main = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: msaa ? 4 : 0});
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
  const final = mk(`uniform sampler2D tScene,tBloom; uniform vec2 uRes; uniform float uTime,uExposure,uBloom,uHurt,uDesat,uFlash;
    varying vec2 vUv;
    vec3 aces(vec3 x){ const float a=2.51,b=.03,c=2.43,d=.59,e=.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.,1.); }
    vec3 srgb(vec3 c){ return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c)); }
    float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 d=vUv-.5; float r2=dot(d,d);
      float ca=.0012+uHurt*.006;
      vec3 col=vec3(texture2D(tScene,vUv-d*ca).r,texture2D(tScene,vUv).g,texture2D(tScene,vUv+d*ca).b);
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
    {tScene: {value: null}, tBloom: {value: null}, uRes: {value: new THREE.Vector2()}, uTime: {value: 0}, uExposure: {value: 1.05},
      uBloom: {value: .3}, uHurt: {value: 0}, uDesat: {value: 0}, uFlash: {value: 0}});

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(scene, cam); }
  let W = 4, H = 4;
  return {
    final: final.uniforms,
    setSize(w, h) {
      W = w; H = h;
      main.setSize(w, h);
      let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
      for (const m of mips) { m.setSize(mw, mh); mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); }
      final.uniforms.uRes.value.set(w, h);
    },
    render(sceneToDraw, camera, t) {
      renderer.setRenderTarget(main);
      renderer.render(sceneToDraw, camera);
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
