/* 归墟 3D 小样 · 照片扫描材质
 * 每个槽位按顺序找第一个可用的材质：用户的 Poly Haven 材质 → 离线烘焙的替身。都没有就退回纯程序材质。
 * size 是一张贴图在世界里铺多少米（Poly Haven 的大多是 2～3 米见方）。 */
import * as THREE from '../vendor/three.module.js';

export const SLOTS = {
  floor: {use: ['monastery_stone_floor', 'baked-floor'], size: 3.2},
  floor2: {use: ['mossy_cobblestone'], size: 2.6},
  mud: {use: ['mud_forest', 'gravel_floor_02', 'baked-mud'], size: 3},
  wall: {use: ['medieval_blocks_02', 'castle_brick_broken_06', 'baked-rock'], size: 2.6},
  pillar: {use: ['castle_wall_slates', 'medieval_blocks_02', 'baked-rock'], size: 2.2},
  rubble: {use: ['castle_brick_broken_06', 'baked-rock'], size: 1.6},
};

/* 个别材质的实际尺寸（米），优先于槽位默认值 */
export const SLUG_SIZE = {'baked-floor': 4.6, 'baked-mud': 3, 'baked-rock': 2.4};

const loader = new THREE.TextureLoader();
const load = (url, srgb, aniso) => loader.loadAsync(url).then(t => {
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
});

/** 读 tex/index.json，按画质加载每个槽位。返回 {floor:{d,n,r,size,slug,baked}, ...}，缺的槽位为 null。 */
export async function loadPBR(quality, renderer) {
  let index = {};
  try { index = await fetch('./tex/index.json', {cache: 'no-cache'}).then(r => r.ok ? r.json() : {}); } catch {}
  const aniso = Math.min(quality === 'high' ? 8 : 4, renderer.capabilities.getMaxAnisotropy());
  const cache = {}, out = {};
  const get = slug => cache[slug] ||= (() => {
    const lo = quality !== 'high' && index[slug]?.lo ? '1k/' : '';
    const b = `./tex/${slug}/${lo}`;
    return Promise.all([load(b + 'diff.jpg', true, aniso), load(b + 'nor.jpg', false, aniso), load(b + 'rah.jpg', false, aniso)])
      .then(([d, n, r]) => ({d, n, r}));
  })();
  await Promise.all(Object.entries(SLOTS).map(async ([k, s]) => {
    const slug = s.use.find(u => index[u]);
    if (!slug) { out[k] = null; return; }
    try { out[k] = {...await get(slug), size: SLUG_SIZE[slug] || s.size, slug, baked: slug.startsWith('baked-')}; }
    catch (e) { console.warn('材质加载失败', slug, e); out[k] = null; }
  }));
  return out;
}

/* GLSL：防重复平铺（两次错位旋转取样、按高度过渡）、三向投影（白化混合法线） */
export const PBR_GLSL = `
struct PS{ vec3 a; vec3 n; vec3 r; };            // a=颜色  n=切线空间法线  r=粗糙度/AO/高度
vec3 unpackN(vec4 t){ return t.xyz*2.-1.; }
PS pbrTile(sampler2D d, sampler2D n, sampler2D r, vec2 uv, float m){
  const mat2 R=mat2(.8,-.6,.6,.8), RT=mat2(.8,.6,-.6,.8);
  vec2 uv2=R*uv*.93+vec2(.37,.71);
  vec3 r1=texture2D(r,uv).rgb, r2=texture2D(r,uv2).rgb;
  float w=clamp((r2.b-r1.b)*3.+(m-.5)*5.+.5,0.,1.);
  PS o;
  o.a=mix(texture2D(d,uv).rgb,texture2D(d,uv2).rgb,w);
  vec3 n1=unpackN(texture2D(n,uv)), n2=unpackN(texture2D(n,uv2)); n2.xy=RT*n2.xy;
  o.n=normalize(mix(n1,n2,w)); o.r=mix(r1,r2,w);
  return o; }
// 三向投影：返回世界空间法线
PS pbrTri(sampler2D d, sampler2D n, sampler2D r, vec3 wp, vec3 wn, float sc, float ns){
  vec3 bw=pow(abs(wn),vec3(4.)); bw/=bw.x+bw.y+bw.z;
  vec2 ux=wp.zy/sc, uy=wp.xz/sc, uz=wp.xy/sc;
  PS o;
  o.a=texture2D(d,ux).rgb*bw.x+texture2D(d,uy).rgb*bw.y+texture2D(d,uz).rgb*bw.z;
  o.r=texture2D(r,ux).rgb*bw.x+texture2D(r,uy).rgb*bw.y+texture2D(r,uz).rgb*bw.z;
  vec3 tx=unpackN(texture2D(n,ux)), ty=unpackN(texture2D(n,uy)), tz=unpackN(texture2D(n,uz));
  tx.xy*=ns; ty.xy*=ns; tz.xy*=ns;
  vec3 sn=sign(wn);
  tx=vec3(tx.xy+wn.zy,abs(tx.z)*wn.x);
  ty=vec3(ty.xy+wn.xz,abs(ty.z)*wn.y);
  tz=vec3(tz.xy+wn.xy,abs(tz.z)*wn.z);
  o.n=normalize(tx.zyx*bw.x+ty.xzy*bw.y+tz.xyz*bw.z);
  return o; }`;
