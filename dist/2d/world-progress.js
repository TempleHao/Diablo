/** Persisted 2D maze expedition state. Pure rules, no DOM or 3D save access. */
const MAX_SEED=0xffffffff,MAX_ROOMS=64;
const ids=(raw)=>Array.isArray(raw)?[...new Set(raw.filter(id=>Number.isInteger(id)&&id>=0&&id<MAX_ROOMS))].slice(0,MAX_ROOMS):[];

export function sanitizeWorldStates(raw,regions){
  const result=Array(regions).fill(null);
  if(!Array.isArray(raw))return result;
  for(let i=0;i<regions;i++){
    const value=raw[i];
    if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(value.seed)||value.seed<0||value.seed>MAX_SEED)continue;
    result[i]={seed:value.seed,explored:ids(value.explored),enteredRooms:ids(value.enteredRooms),bossDefeated:value.bossDefeated===true};
  }
  return result;
}
export function ensureWorldState(profile,region,seed){
  if(!Array.isArray(profile.worldStates))throw new TypeError('worldStates missing');
  if(!Number.isInteger(region)||region<0||region>=profile.worldStates.length)throw new RangeError('invalid region');
  let state=profile.worldStates[region];
  if(!state){
    if(!Number.isSafeInteger(seed)||seed<0||seed>MAX_SEED)throw new RangeError('invalid seed');
    state={seed,explored:[],enteredRooms:[],bossDefeated:false};
    profile.worldStates[region]=state;
  }
  return state;
}
export function restoreWorldExploration(world,progress){
  const valid=new Set(world.layout.rooms.map(r=>r.id));
  const explored=ids(progress.explored).filter(id=>valid.has(id));
  if(!explored.includes(world.layout.entrance))explored.unshift(world.layout.entrance);
  world.explored=explored;
  const visible=new Set(explored);
  for(const edge of world.layout.edges){
    if(visible.has(edge.a)||visible.has(edge.b)){
      if(explored.includes(edge.a))visible.add(edge.b);
      if(explored.includes(edge.b))visible.add(edge.a);
    }
  }
  world.visible=[...visible];
}
export function rememberRoomProgress(progress,world,enteredRooms){
  progress.explored=ids(world.explored);
  progress.enteredRooms=ids([...enteredRooms]);
}
