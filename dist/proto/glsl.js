/* 归墟 3D 小样 · 共用 GLSL：哈希、值噪声、分形噪声、Voronoi、用高度求法线（屏幕导数，不需要法线贴图）。
 * 所有表面细节都是按世界坐标实时算出来的，不用任何贴图：凑多近都不会糊，也不会看出平铺的重复。 */
export const NOISE = /* glsl */`
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
vec2  h22(vec2 p){ float n=h21(p); return vec2(n,h21(p+n+17.31)); }
float h31(vec3 p){ p=fract(p*vec3(.1031,.1030,.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float vnoise(vec2 p){ vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y); }
float vnoise3(vec3 p){ vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),u.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),u.x),u.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),u.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),u.x),u.y),u.z); }
float fbm(vec2 p){ float a=.5,s=0.; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<FBM_OCT;i++){ s+=a*vnoise(p); p=m*p; a*=.5; } return s/(1.-pow(.5,float(FBM_OCT))); }
float fbm3(vec3 p){ float a=.5,s=0.; for(int i=0;i<FBM_OCT;i++){ s+=a*vnoise3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s/(1.-pow(.5,float(FBM_OCT))); }
// x = 到最近点的距离，y = 到次近点的距离；y-x 近似到裂缝（胞边界）的距离
vec2 voro(vec2 p){ vec2 i=floor(p),f=fract(p); float d1=8.,d2=8.;
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){ vec2 g=vec2(x,y),r=g+h22(i+g)-f; float d=dot(r,r);
    if(d<d1){d2=d1;d1=d;} else if(d<d2) d2=d; }
  return vec2(sqrt(d1),sqrt(d2)); }
// 高度（米）→ 视空间法线：用屏幕导数做凹凸，距离单位就是米，所以凹凸大小是真实尺度
vec3 bumpN(vec3 n, float h, vec3 viewPos){
  vec3 sx=dFdx(viewPos), sy=dFdy(viewPos);
  vec3 r1=cross(sy,n), r2=cross(n,sx); float det=dot(sx,r1);
  vec2 dh=vec2(dFdx(h),dFdy(h));
  vec3 grad=sign(det)*(dh.x*r1+dh.y*r2);
  return normalize(abs(det)*n-grad);
}
`;
