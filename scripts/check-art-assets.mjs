import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const project=new URL('../',import.meta.url);
for(const directory of ['assets-source/human-base/','assets-source/environment-pbr/']){
  const root=new URL(directory,project);
  const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
  assert.ok(manifest.license?.includes('CC0'),'Asset license declaration missing');
  assert.match(manifest.revision,/^[a-f0-9]{40}$/,'Upstream is not pinned');
  for(const entry of manifest.files){
    const bytes=readFileSync(new URL(entry.file,root));
    assert.equal(bytes.length,entry.bytes,`Source size changed: ${entry.file}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,`Source hash changed: ${entry.file}`);
  }
  console.log(`${directory}: ${manifest.files.length} pinned source files and hashes verified.`);
}

const bytes=readFileSync(new URL('dist/models/ember-mage-realism.glb',project));
assert.equal(bytes.readUInt32LE(0),0x46546c67,'Invalid realism GLB');
assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
const jsonLength=bytes.readUInt32LE(12);
const model=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binOffset=20+jsonLength;
assert.equal(bytes.readUInt32LE(binOffset+4),0x004e4942,'Embedded BIN missing');
const binary=bytes.subarray(binOffset+8,binOffset+8+bytes.readUInt32LE(binOffset));
for(const buffer of model.buffers)assert.equal(buffer.uri,undefined,'External model buffer');
for(const image of model.images||[]){
  assert.equal(image.uri,undefined,'External model image');
  assert.ok(model.bufferViews[image.bufferView],'Embedded image missing');
}
for(const name of ['Idle','Walk','Cast'])assert.ok(model.animations?.some(a=>a.name===name&&a.channels.length),`Missing ${name}`);
assert.ok(model.nodes.some(n=>n.name==='face_focus'),'Face viewer anchor missing');
let triangles=0,weightedVertices=0;
const sizes={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
function value(accessor,index,component){
  const view=model.bufferViews[accessor.bufferView],size=sizes[accessor.componentType];
  const offset=(view.byteOffset||0)+(accessor.byteOffset||0)+index*(view.byteStride||size*4)+component*size;
  assert.ok(offset+size<=binary.length,'Accessor outside BIN');
  switch(accessor.componentType){
    case 5121:return binary.readUInt8(offset)/(accessor.normalized?255:1);
    case 5123:return binary.readUInt16LE(offset)/(accessor.normalized?65535:1);
    case 5126:return binary.readFloatLE(offset);
    default:throw Error('Unsupported skin accessor component');
  }
}
for(const node of model.nodes){
  if(node.mesh===undefined)continue;
  for(const primitive of model.meshes[node.mesh].primitives){
    if(primitive.indices!==undefined)triangles+=model.accessors[primitive.indices].count/3;
    if(node.skin===undefined)continue;
    const skin=model.skins[node.skin],weights=model.accessors[primitive.attributes.WEIGHTS_0],joints=model.accessors[primitive.attributes.JOINTS_0];
    assert.ok(weights&&joints,'Skinned primitive has no joint weights');assert.equal(weights.count,joints.count);
    for(let i=0;i<weights.count;i++){
      let sum=0;
      for(let k=0;k<4;k++){
        const w=value(weights,i,k),joint=value(joints,i,k);assert.ok(Number.isFinite(w)&&w>=0&&w<=1.001,'Invalid skin weight');
        assert.ok(Number.isInteger(joint)&&joint>=0&&joint<skin.joints.length,'Invalid skin joint');sum+=w;
      }
      assert.ok(Math.abs(sum-1)<.025,'Skin weights do not sum to one');weightedVertices++;
    }
  }
}
assert.ok(weightedVertices>0&&triangles>0,'Character geometry missing');
console.log(JSON.stringify({realismModelBytes:bytes.length,triangles,weightedVertices,joints:model.skins[0].joints.length,materials:model.materials.length,images:model.images.length}));
