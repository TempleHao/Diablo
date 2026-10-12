import * as T from './vendor/three.module.js';

// One HDR colour pass and one eight-sample contact-occlusion / output pass.
// There is no depth-of-field blur over combat, and this is not a performance claim.
export function createWorldRenderer(renderer,camera) {
  const hdr = renderer.extensions.has('EXT_color_buffer_float');
  const target = new T.WebGLRenderTarget(1,1,{
    type:hdr?T.HalfFloatType:T.UnsignedByteType,
    minFilter:T.LinearFilter,magFilter:T.LinearFilter,depthBuffer:true
  });
  target.depthTexture = new T.DepthTexture(1,1,T.UnsignedIntType);
  const uniforms = {
    colour:{value:target.texture},depth:{value:target.depthTexture},
    inverseProjection:{value:camera.projectionMatrixInverse},projection:{value:camera.projectionMatrix},
    pixelSize:{value:new T.Vector2(1,1)},exposure:{value:1.12},aoStrength:{value:0.32}
  };
  const material = new T.ShaderMaterial({
    uniforms,depthTest:false,depthWrite:false,toneMapped:false,
    vertexShader:`varying vec2 uvScreen;
      void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`precision highp float;
      varying vec2 uvScreen;
      uniform sampler2D colour,depth;
      uniform mat4 inverseProjection,projection;
      uniform vec2 pixelSize;
      uniform float exposure,aoStrength;
      vec3 viewPosition(vec2 uv,float d){
        vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);
        return p.xyz/p.w;
      }
      vec3 film(vec3 c){return clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);}
      vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
      void main(){
        vec3 c=texture2D(colour,uvScreen).rgb;
        float d=texture2D(depth,uvScreen).x;
        if(d<.99999){
          vec3 p=viewPosition(uvScreen,d);
          vec3 n=normalize(cross(dFdx(p),dFdy(p)));
          if(n.z<0.)n=-n;
          float angle=6.2831853*fract(sin(dot(floor(uvScreen/pixelSize),vec2(12.9898,78.233)))*43758.5453);
          vec3 randomDirection=vec3(cos(angle),sin(angle),0.);
          vec3 tangent=normalize(randomDirection-n*dot(randomDirection,n));
          mat3 basis=mat3(tangent,cross(n,tangent),n);
          float blocked=0.;
          for(int i=0;i<8;i++){
            float a=float(i)*2.39996323;
            float s=(float(i)+.5)/8.;
            vec3 k=vec3(cos(a)*sqrt(s),sin(a)*sqrt(s),sqrt(1.-s));
            vec3 samplePosition=p+basis*k*(.25+.60*s);
            vec4 projected=projection*vec4(samplePosition,1.);
            vec2 uv=projected.xy/projected.w*.5+.5;
            if(uv.x>=0.&&uv.y>=0.&&uv.x<=1.&&uv.y<=1.){
              float sd=texture2D(depth,uv).x;
              vec3 surface=viewPosition(uv,sd);
              float range=smoothstep(0.,1.,.85/max(abs(p.z-surface.z),.001));
              blocked+=step(samplePosition.z+.035,surface.z)*range*step(sd,.99999);
            }
          }
          c*=1.-aoStrength*blocked/8.;
        }
        c=film(c*exposure*vec3(1.025,1.,.975));
        gl_FragColor=vec4(srgb(c),1.);
      }`
  });
  const scene = new T.Scene();
  const quad = new T.Mesh(new T.PlaneGeometry(2,2),material);scene.add(quad);
  const outputCamera = new T.OrthographicCamera(-1,1,1,-1,0,1);
  const size = new T.Vector2();
  return {
    hdr,
    resize(){renderer.getDrawingBufferSize(size);target.setSize(size.x,size.y);uniforms.pixelSize.value.set(1/size.x,1/size.y);},
    render(world){renderer.setRenderTarget(target);renderer.render(world,camera);renderer.setRenderTarget(null);renderer.render(scene,outputCamera);},
    dispose(){target.dispose();quad.geometry.dispose();material.dispose();}
  };
}
