import * as T from './vendor/three.module.js';

// A small, original reflection studio. The actual crypt still supplies its own
// directional light, shadows and local torch lights; this is only the IBL source.
export function createReflectionEnvironment(renderer) {
  const studio = new T.Scene();
  studio.background = new T.Color(0.055, 0.052, 0.046);
  const cards = [
    {p:[-4,5,2],size:[5,5],c:[2.1,1.86,1.55]},
    {p:[4,2,-3],size:[3,5],c:[0.53,0.65,0.76]},
    {p:[0,7,0],size:[5,4],c:[0.72,0.68,0.60]}
  ];
  for(const card of cards) {
    const material = new T.MeshBasicMaterial({color:new T.Color(...card.c),side:T.DoubleSide});
    const mesh = new T.Mesh(new T.PlaneGeometry(...card.size),material);
    mesh.position.set(...card.p);mesh.lookAt(0,1,0);studio.add(mesh);
  }
  const generator = new T.PMREMGenerator(renderer);
  const target = generator.fromScene(studio,0.03,0.1,30);
  generator.dispose();
  studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  return target;
}
