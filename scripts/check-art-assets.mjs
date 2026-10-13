import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import assert from 'node:assert/strict';

// Inspect the exported bytes as well as Blender's float report. Byte PNGs
// quantize 0.5 to 128/255, which makes an exact float-sentinel comparison unsafe.
function readNormalPng(bytes){
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let width,height,channels;const data=[];
  for(let offset=8;offset<bytes.length;){
    const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8);
    const chunk=bytes.subarray(offset+8,offset+8+length);
    if(type==='IHDR'){
      width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);
      assert.equal(chunk[8],8,'Expected 8-bit normal PNG');
      assert.ok(chunk[9]===6||chunk[9]===2,'Expected RGB/RGBA normal PNG');
      channels=chunk[9]===6?4:3;
      assert.equal(chunk[10],0);assert.equal(chunk[11],0);assert.equal(chunk[12],0,'Interlaced normal PNG unsupported');
    }else if(type==='IDAT')data.push(chunk);
    offset+=length+12;
  }
  assert.equal(width,2048);assert.equal(height,2048);
  const stride=width*channels,raw=inflateSync(Buffer.concat(data)),pixels=Buffer.alloc(stride*height);
  assert.equal(raw.length,(stride+1)*height);
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)];assert.ok(filter<=4,'Invalid PNG row filter');
    for(let x=0;x<stride;x++){
      const at=y*stride+x,a=x>=channels?pixels[at-channels]:0,b=y?pixels[at-stride]:0,c=y&&x>=channels?pixels[at-stride-channels]:0;
      const prediction=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];
      pixels[at]=(raw[y*(stride+1)+1+x]+prediction)&255;
    }
  }
  return {width,height,channels,pixels};
}

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

function checkCharacter(filename,statsFile,triangleLimit){
const bytes=readFileSync(new URL(`dist/models/${filename}`,project));
const statistics=JSON.parse(readFileSync(new URL(`assets-source/ash-archivist/${statsFile}`,project)));
assert.equal(createHash('sha256').update(bytes).digest('hex'),statistics.sha256,'Model and generated statistics are from different builds');
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
  const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[accessor.type];
  assert.ok(components,'Unsupported accessor shape');
  const offset=(view.byteOffset||0)+(accessor.byteOffset||0)+index*(view.byteStride||size*components)+component*size;
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
const primitives=model.meshes.flatMap(m=>m.primitives);
const normalImageHashes=new Set();
let normalPng;
for(const primitive of primitives){
  const positions=model.accessors[primitive.attributes.POSITION];
  for(const name of ['TEXCOORD_0','TEXCOORD_1']){
    const uv=model.accessors[primitive.attributes[name]];
    assert.ok(uv,`Missing ${name} for dual-UV surface`);assert.equal(uv.count,positions.count);assert.equal(uv.type,'VEC2');
    for(let i=0;i<uv.count;i++)for(let k=0;k<2;k++){
      const coordinate=value(uv,i,k);assert.ok(Number.isFinite(coordinate)&&coordinate>=-1e-6&&coordinate<=1.000001,'Invalid atlas UV');
    }
  }
  assert.equal(primitive.attributes.TANGENT,undefined,'Use derivative tangent reconstruction for dedicated normal UV');
}
assert.ok(triangles<=triangleLimit,`Triangle budget exceeded: ${filename}`);
assert.equal(model.meshes.length,1,'Character must be joined into one skinned mesh');
assert.equal(primitives.length,2,'Character must use exactly two atlas primitives');
assert.equal(model.materials.length,2);assert.equal(model.images.length,4);
for(const skin of model.skins)assert.equal(skin.joints.length,60,'Rig budget changed');
assert.deepEqual(new Set(model.materials.map(m=>m.alphaMode||'OPAQUE')),new Set(['OPAQUE','MASK']));
for(const material of model.materials){
  assert.ok(material.pbrMetallicRoughness?.baseColorTexture,'Missing baked base color');
  assert.ok(material.pbrMetallicRoughness?.metallicRoughnessTexture,'Missing baked roughness/metalness');
  assert.ok(material.normalTexture&&material.emissiveTexture,'Missing baked normal/emission');
  assert.equal(material.normalTexture.texCoord??0,1,'Cloth normal map must use dedicated UV1');
  const normalImage=model.images[model.textures[material.normalTexture.index].source];
  const normalView=model.bufferViews[normalImage.bufferView];
  assert.equal(normalImage.mimeType,'image/png','Normal image must retain lossless bake encoding');
  const normalBytes=binary.subarray(normalView.byteOffset||0,(normalView.byteOffset||0)+normalView.byteLength);
  normalImageHashes.add(createHash('sha256').update(normalBytes).digest('hex'));
  normalPng??=readNormalPng(normalBytes);
  for(const texture of [material.pbrMetallicRoughness.baseColorTexture,material.pbrMetallicRoughness.metallicRoughnessTexture,material.emissiveTexture])assert.equal(texture.texCoord??0,0,'Authored color/roughness/emission UV changed');
  if(material.alphaMode==='MASK')assert.equal(material.alphaCutoff??.5,.5);
}
assert.equal(statistics.triangles,triangles);assert.equal(statistics.glbBytes,bytes.length);
assert.equal(statistics.bones,60);assert.equal(statistics.materials,2);
assert.equal(statistics.primitives,primitives.length);assert.equal(statistics.images,model.images.length);
const clipTimes=model.animations.map(a=>({name:a.name,times:a.samplers.map(s=>{
  const input=model.accessors[s.input];return {count:input.count,min:input.min,max:input.max};
})}));
const jointNames=model.skins[0].joints.map(i=>model.nodes[i].name);
console.log(JSON.stringify({filename,modelBytes:bytes.length,triangles,weightedVertices,joints:jointNames.length,materials:model.materials.length,images:model.images.length}));
assert.equal(normalImageHashes.size,1,'Both material primitives must share the same normal atlas');
return {statistics,jointNames,clipTimes,normalImageSha256:[...normalImageHashes][0],normalPng};
}
const detail=checkCharacter('ember-mage-realism.glb','statistics.json',35000);
const combat=checkCharacter('ember-mage-combat.glb','combat-statistics.json',15000);
assert.deepEqual(combat.jointNames,detail.jointNames,'LOD rig order differs');
assert.deepEqual(combat.clipTimes,detail.clipTimes,'LOD animation sampling differs');
const report=JSON.parse(readFileSync(new URL('assets-source/ash-archivist/budget-report.json',project)));
const sourceReceipt=JSON.parse(readFileSync(new URL('assets-source/ash-archivist/source-build-receipt.json',project)));
assert.equal(sourceReceipt.sourceBlendSha256,report.sourceBlendSha256,'Budget uses a different source build');
assert.equal(report.tailShellWeightCorrection.sourceWasAlreadyCoherent,true,'Release source has incoherent coat layers');
assert.ok(report.tailShellWeightCorrection.sharedWeightShellPairSeparationMaxMeters<=.006001,'Source coat layers exceed 6 mm');
assert.equal(report.lods.L0.actualExport.sha256,detail.statistics.sha256);
assert.equal(report.lods.L1.actualExport.sha256,combat.statistics.sha256);
assert.ok(report.rig.samples.length===15,'Expected three clips at five pose samples');
assert.ok(report.rig.samples.every(s=>s.maxVertexMeters<.0001),'Rig transfer error exceeds 0.1 mm');
for(const lod of ['L0','L1']){
  assert.ok(report.lods[lod].samples.length===15);
  assert.ok(report.lods[lod].sampledBodySurfaceErrorMaxMeters<.004,'Face/hand sampled LOD error exceeds 4 mm');
  assert.ok(report.lods[lod].samples.every(s=>s.maxBoundsMeters<.005),'LOD grounding/bounds error exceeds 5 mm');
  const tail=report.lods[lod].tailSurface;
  assert.ok(tail&&tail.walkCoverage==='every integer authored frame','Missing full-cycle tail surface measurement');
  const limit=lod==='L0'?.012:.025;
  assert.equal(tail.limitMeters,limit);assert.ok(tail.maxMeters<=limit,'Tail surface error exceeds fixed target');
  assert.ok(tail.samples.length>=86,'Tail sweep must include full Walk and Idle/Cast samples for both panels');
  const normal=report.lods[lod].clothNormal;
  assert.equal(normal.texCoord,1);assert.equal(normal.uvLayer,'NormalUV');assert.match(normal.sha256,/^[a-f0-9]{64}$/);
  assert.equal(normal.sha256,(lod==='L0'?detail:combat).normalImageSha256,'Embedded normal image differs from bake evidence');
  assert.ok(normal.parts.length>0,'Missing isolated high-to-low bake evidence');
  const tiles=Object.values(normal.uvTiles);
  assert.ok(tiles.length>0,'Missing normal UV occupancy evidence');
  assert.ok(tiles.every(t=>t.overlappingInteriorPixels===0),'Normal UV interiors overlap');
  for(const tile of tiles){
    const [left,bottom,width,height]=tile.rectanglePixels;
    const png=(lod==='L0'?detail:combat).normalPng;
    // Include margins and background: tiny triangles and texture filtering can
    // sample texels outside the pixel-center interior mask used by the baker.
    let backwardBytes=0,invalidLengths=0;
    for(let y=png.height-bottom-height;y<png.height-bottom;y++)for(let x=left;x<left+width;x++){
      const offset=(y*png.width+x)*png.channels;
      const r=png.pixels[offset]/255*2-1,g=png.pixels[offset+1]/255*2-1,b=png.pixels[offset+2]/255*2-1;
      if(b<-.01)backwardBytes++;
      const length=Math.hypot(r,g,b);if(length<.85||length>1.02)invalidLengths++;
    }
    assert.equal(backwardBytes,0,'Actual exported normal tile contains reverse normals, including margins/background');
    assert.equal(invalidLengths,0,'Actual exported normal tile contains invalid encoded vectors');
    assert.ok(tile.coveredInteriorPixels>=width*height*.15,'Cloth normal chart interiors occupy less than 15% of their tile');
    assert.equal(tile.bakedInteriorPixels,tile.coveredInteriorPixels,'Baked coverage differs from actual UV interiors');
    assert.equal(tile.blackHolePixels,0,'Cloth normal interior contains a black projection hole');
    assert.equal(tile.unprojectedInteriorPixels,0,'Cloth normal interior contains untouched projection sentinel');
    assert.equal(tile.backwardNormalPixels,0,'Cloth normal interior points behind its low surface');
    assert.ok(tile.encodedNormalLengthMin>=.85&&tile.encodedNormalLengthMax<=1.02,'Encoded cloth normal has invalid length');
  }
}
