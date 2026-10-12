import * as T from './vendor/three.module.js';

// The Cinder Archive: original open-roof limestone architecture. Surfaces use
// original seeded procedural maps plus documented CC0 ambientCG stone maps.
// The route/collision contract is the same as the first playable crypt.
export function createEnvironment(scene) {
  const group = new T.Group();
  group.name = 'The Cinder Archive';
  scene.add(group);
  const obstacles = [];
  const batches = new Map();
  const animatedFlames = [];
  const animatedLights = [];
  const portalSparks = [];
  const roomBands = [
    { min: -21, max: -7, door: -14 },
    { min: -5, max: 7, door: 1 },
    { min: 9, max: 21, door: 15 }
  ];
  const transform = new T.Object3D();
  let seed = 17391;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const textureLoader = new T.TextureLoader();
  const surfaceMaps = new Map();
  function texture(file, color = false) {
    const result = textureLoader.load(new URL(`./textures/environment-${file}`, import.meta.url).href);
    result.wrapS = result.wrapT = T.RepeatWrapping;
    result.anisotropy = 4;
    if (color) result.colorSpace = T.SRGBColorSpace;
    return result;
  }
  for (const name of ['stone', 'floor']) surfaceMaps.set(name, {
    map: texture(`${name}-basecolor.jpg`, true), normalMap: texture(`${name}-normal.jpg`),
    roughnessMap: texture(`${name}-roughness.jpg`)
  });
  const stone = (color = 0xbcb5a5, extra = {}) => new T.MeshStandardMaterial({
    color, roughness: 1, metalness: 0, ...surfaceMaps.get('stone'),
    normalScale: new T.Vector2(.42, .42), ...extra
  });
  const standard = (color, extra = {}) => new T.MeshStandardMaterial({ color, roughness: .89, metalness: 0, ...extra });
  const materials = {
    foundation: stone(0x544e40, { ...surfaceMaps.get('floor'), normalScale: new T.Vector2(.35, .35) }),
    stone: stone(),
    stoneLight: stone(0xc7c0ad),
    stoneDark: stone(0x8e8778),
    mortar: standard(0x302d27),
    carved: stone(0xb4b1a4),
    bronze: standard(0x685035, { roughness: .63, metalness: .74 }),
    iron: standard(0x272723, { roughness: .67, metalness: .69 }),
    wood: standard(0x473b35),
    woodEdge: standard(0x675246),
    bone: standard(0x8e8875),
    ash: stone(0x61584a, { ...surfaceMaps.get('floor') }),
    runeGold: standard(0x826845, { roughness: .56, metalness: .65, emissive: 0x251306, emissiveIntensity: .15 }),
    runeBlue: standard(0x668b91, { emissive: 0x28626f, emissiveIntensity: .72, roughness: .55 }),
    ember: new T.MeshBasicMaterial({ color: 0xffaf53 }),
    flameCore: new T.MeshBasicMaterial({ color: 0xffe9ac }),
    flameEdge: new T.MeshBasicMaterial({ color: 0xf36b27, transparent: true, opacity: .85 }),
    blueGlow: new T.MeshBasicMaterial({ color: 0x72a2a4, transparent: true, opacity: .45 }),
    redGlow: new T.MeshBasicMaterial({ color: 0xa66139, transparent: true, opacity: .25 })
  };
  const floorMaterials = [0xb7b09e, 0xaaa58f, 0xc0b8a5, 0xa6a18f].map(c => stone(c, {
    ...surfaceMaps.get('floor'), normalScale: new T.Vector2(.50, .50)
  }));
  // CC0 ambientCG Bricks076A maps, distributed through the pinned PlayCanvas
  // test asset mirror. The UV crop samples one actual stone, not an entire wall
  // repeated on each brick. Exact provenance is in docs/ART-ENVIRONMENT.md.
  const masonryMaps = {
    map:texture('masonry-color.webp',true), normalMap:texture('masonry-normal.webp'),
    roughnessMap:texture('masonry-roughness.webp'), aoMap:texture('masonry-ao.webp')
  };
  const wallMaterials = [0xbcb7aa, 0xc8c0ad, 0xb1b0a4, 0xc1b7a4].map(c => stone(c, {
    ...masonryMaps, normalScale:new T.Vector2(.74,.74), aoMapIntensity:.8
  }));
  const books = [0x526d75, 0x806452, 0x654d59, 0x69735b, 0x8b7352, 0x3d5362].map(c => standard(c));

  // Chamfered, chipped corners give masonry a real edge silhouette instead of
  // sharp toy cubes. Six reusable variants keep stone damage deterministic.
  // Each face receives its own UVs; bevels have a lower vertex albedo to read as
  // accumulated grime, independently of the scene's directional light.
  function dressedStone(width, height, depth, variant = 0) {
    const bevel = Math.min(width, height, depth) * .13;
    const rings = [];
    const positions = [], normals = [], uvs = [], colors = [];
    const index = [];
    // A true clipped-corner footprint, with small original imperfections.
    const outline = [[-1,-.77],[-.78,-1],[.77,-1],[1,-.76],[1,.78],[.75,1],[-.78,1],[-1,.75]];
    for (let layer = 0; layer < 4; layer++) {
      const inset = layer === 0 || layer === 3 ? bevel : 0;
      const y = [-height/2, -height/2+bevel, height/2-bevel, height/2][layer];
      rings.push(outline.map(([x,z], i) => {
        const damage = Math.sin((i + 1) * 2.731 + variant * 3.177) * .018;
        return new T.Vector3(x * (width/2-inset) + damage * width,
          y + (layer === 3 ? Math.sin(i * 4.1 + variant) * height * .026 : 0),
          z * (depth/2-inset) + Math.cos(i * 3.93 + variant) * depth * .012);
      }));
    }
    function face(points, color, uv) {
      const start = positions.length / 3;
      const normal = new T.Vector3().subVectors(points[1], points[0]).cross(new T.Vector3().subVectors(points[2], points[0])).normalize();
      points.forEach((p, i) => { positions.push(p.x,p.y,p.z); normals.push(normal.x,normal.y,normal.z); uvs.push(...uv[i]); colors.push(color,color,color); });
      for (let i = 1; i < points.length-1; i++) index.push(start,start+i,start+i+1);
    }
    for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 8; i++) {
      const j = (i+1)%8;
      face([rings[layer][i],rings[layer+1][i],rings[layer+1][j],rings[layer][j]], layer===1 ? .93 : .78,
        [[0,0],[0,1],[1,1],[1,0]]);
    }
    face([...rings[0]], .62, outline.map(([x,z]) => [(x+1)/2,(z+1)/2]));
    face([...rings[3]].reverse(), 1, [...outline].reverse().map(([x,z]) => [(x+1)/2,(z+1)/2]));
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs,2));
    geometry.setAttribute('color', new T.Float32BufferAttribute(colors,3));
    geometry.setIndex(index); geometry.computeBoundingSphere();
    return geometry;
  }
  for (const material of [...floorMaterials, ...wallMaterials, materials.stone, materials.stoneLight,
    materials.stoneDark, materials.carved, materials.foundation]) material.vertexColors = true;
  const paving = Array.from({length: 4}, (_,i) => dressedStone(1,.19,1,i));
  const masonry = Array.from({length: 4}, (_,i) => dressedStone(1.42,.57,.54,i));
  const stoneCrops = [[.035,.024,.191,.108],[.10,.152,.345,.226],[.069,.275,.277,.341],[.224,.388,.471,.46]];
  masonry.forEach((geometry,i) => {
    const uv = geometry.getAttribute('uv');
    const [u0,v0,u1,v1] = stoneCrops[i];
    for (let n=0;n<uv.count;n++) uv.setXY(n,u0+uv.getX(n)*(u1-u0),1-(v0+uv.getY(n)*(v1-v0)));
    geometry.setAttribute('uv1',uv.clone());
  });
  const geometries = {
    tile: paving[0], brick: masonry[0],
    block: dressedStone(1,1,1,3),
    simpleBlock:new T.BoxGeometry(1,1,1),
    column: new T.CylinderGeometry(.49, .58, 3.95, 24, 1),
    columnRib:new T.CylinderGeometry(.49,.58,3.95,10,1),
    columnBase: new T.CylinderGeometry(.83, .94, .32, 24),
    collar: new T.CylinderGeometry(.66, .66, .16, 24),
    flute: new T.CylinderGeometry(.035, .035, 3.58, 5),
    archStone: dressedStone(.66,.61,1.08,2),
    tomb: dressedStone(1.15,.73,2.16,1),
    tombLid: dressedStone(1.32,.17,2.34,2),
    tombTrim: dressedStone(1.38,.12,2.4,0),
    book: new T.BoxGeometry(.48, .63, .18),
    candle: new T.CylinderGeometry(.065, .071, .34, 6),
    candleFlame: new T.ConeGeometry(.053, .19, 5),
    rubble: new T.DodecahedronGeometry(.31, 0),
    rune: new T.BoxGeometry(.065, .025, .38),
    smallBone: new T.CylinderGeometry(.034, .043, .38, 5)
  };

  function mesh(geometry, material, x, y, z, rotation = null, parent = group) {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    if (rotation) object.rotation.set(...rotation);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(x, y, z, w, h, d, material = materials.stone, parent = group) {
    const geometry = !material.vertexColors || Math.min(w,h,d)<.08 ? geometries.simpleBlock : geometries.block;
    const object = mesh(geometry, material, x, y, z, null, parent);
    object.scale.set(w, h, d);
    return object;
  }
  function instance(name, geometry, material, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    // Book ribbons / iron nails don't need the sixty triangles of a stone.
    if (geometry===geometries.block && (!material.vertexColors || Math.min(sx,sy,sz)<.08)) geometry=geometries.simpleBlock;
    if (!batches.has(name)) batches.set(name, { geometry, material, matrices: [] });
    transform.position.set(x, y, z);
    transform.rotation.set(rx, ry, rz);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    batches.get(name).matrices.push(transform.matrix.clone());
  }
  function collision(x, z, r) { obstacles.push({ x, z, r }); }
  function ring(radius, tube, material, x, y, z, segments = 80) {
    return mesh(new T.TorusGeometry(radius, tube, 6, segments), material, x, y, z, [-Math.PI / 2, 0, 0]);
  }
  function beam(x1, y1, z1, x2, y2, z2, radius, material = materials.iron) {
    const start = new T.Vector3(x1, y1, z1), end = new T.Vector3(x2, y2, z2);
    const delta = end.clone().sub(start);
    const object = mesh(new T.CylinderGeometry(radius, radius, delta.length(), 6), material,
      (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return object;
  }

  // Ash-filled mortar underneath irregular, hand-laid flagstones. Paving courses
  // use different widths, staggered joints and worn edges rather than a chessboard.
  box(0, -.34, 0, 20, .4, 46, materials.foundation);
  for (const side of [-1, 1]) for (const room of roomBands)
    box(side * 16.5, -.34, (room.min + room.max) / 2, 13, .4, room.max - room.min, materials.foundation);
  function pave(x0, x1, z0, z1) {
    let row = 0;
    for (let z = z0; z < z1-.15;) {
      const course = Math.min(z1-z, [1.53,1.27,1.79,1.43][row%4]);
      let x = x0;
      while (x < x1-.15) {
        let width = Math.min(x1-x, (row%2===0 && x===x0 ? 1.23 : 1.74 + random()*1.23));
        if (x1-x-width < .50) width = x1-x;
        const variant = Math.floor(random()*4), tone = Math.floor(random()*4);
        instance(`flagstone-${variant}-${tone}`, paving[variant], floorMaterials[tone],
          x+width/2, -.083 + random()*.006, z+course/2, width-.035, 1, course-.032,
          0, 0, 0);
        x += width;
      }
      z += course; row++;
    }
  }
  pave(-9.85,9.85,-22.85,22.85);
  for (const side of [-1,1]) for (const room of roomBands)
    pave(side===-1?-22.8:10.05, side===-1?-10.05:22.8, room.min+.10, room.max-.10);

  // Worn limestone aisle edging, without bright repeated metallic floor joints.
  for (const side of [-1, 1]) {
    for (let z=-22.2; z<22.7; z+=1.81) {
      instance('nave-border', geometries.block, materials.stoneDark, side*9.66, .045, z, .23,.11,1.76);
      instance('worn-aisle-border', geometries.block, materials.stoneLight, side*3.15,.016,z,.14,.029,1.76);
    }
  }

  const grimeMaterial = new T.MeshStandardMaterial({
    map: texture('grime.png', true), transparent:true, opacity:.57, roughness:.94,
    metalness:0, depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2,
    side:T.DoubleSide
  });
  const wetMaterial = new T.MeshStandardMaterial({
    map:grimeMaterial.map, color:0x716d5b, transparent:true, opacity:.27,
    roughness:.29, metalness:.02, depthWrite:false, polygonOffset:true,
    polygonOffsetFactor:-2, side:T.DoubleSide
  });
  const stainGeometry = new T.PlaneGeometry(1,1);
  const flameTexture = texture('flame.png',true);
  const flameCardMaterial = new T.MeshBasicMaterial({map:flameTexture,transparent:true,
    depthWrite:false,side:T.DoubleSide,opacity:.91,blending:T.AdditiveBlending});
  const flameCard = new T.BufferGeometry();
  flameCard.setAttribute('position',new T.Float32BufferAttribute([
    -.20,-.445,0,.20,-.445,0,.20,.445,0,-.20,.445,0,
    0,-.445,-.20,0,-.445,.20,0,.445,.20,0,.445,-.20],3));
  flameCard.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1],2));
  flameCard.setIndex([0,1,2,0,2,3,4,5,6,4,6,7]);
  flameCard.computeVertexNormals();
  for (let i=0; i<42; i++) {
    const side = i%2?-1:1, z = -21.8 + random()*43.2;
    const x = side*(5.65 + random()*3.35);
    instance(i%5===0?'damp-floor':'footing-ash', stainGeometry, i%5===0?wetMaterial:grimeMaterial,
      x,.033,z,2.5+random()*3.3,1.1+random()*1.9,1,-Math.PI/2,0,random()*Math.PI*2);
  }

  // Masonry cores plus staggered face stones. Front edges are low cutaway walls.
  function wall(x1, z1, x2, z2, height) {
    const length = Math.hypot(x2 - x1, z2 - z1), angle = Math.atan2(z2 - z1, x2 - x1);
    const core = box((x1 + x2) / 2, height / 2 - .08, (z1 + z2) / 2, length, height, .53, materials.mortar);
    core.rotation.y = -angle;
    const rows = Math.max(1, Math.floor(height / .62));
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? .58 : 0;
      for (let p = -.20; p < length;) {
        const unit = 1.13 + random()*.69;
        const begin = Math.max(0, p - offset), end = Math.min(length, p - offset + unit-.055);
        p += unit;
        if (end - begin < .12) continue;
        const t = (begin + end) / 2 / length;
        const color = Math.floor(random() * wallMaterials.length);
        const variant = Math.floor(random()*4);
        instance(`wall-${color}-${variant}`, masonry[variant], wallMaterials[color],
          x1 + (x2 - x1) * t, .25 + row * .62, z1 + (z2 - z1) * t,
          (end - begin) / 1.42, .94+random()*.075, 1+random()*.075, 0, -angle);
      }
    }
    const footing = box((x1 + x2) / 2, .19, (z1 + z2) / 2, length, .34, .83, materials.stoneDark);
    footing.rotation.y = -angle;
    for (let p=0;p<length;p+=1.61) {
      const span = Math.min(1.57,length-p), t=(p+span/2)/length;
      instance('chipped-wall-cap', geometries.block, materials.carved,
        x1+(x2-x1)*t,height-.015+(random()-.5)*.022,z1+(z2-z1)*t,
        span,.19,.76,0,-angle);
    }
  }
  wall(-10, -23, 10, -23, 5.1);
  wall(-10, 23, 10, 23, .88);
  const naveSegments = [[-23, -16.5], [-11.5, -1.5], [3.5, 12.5], [17.5, 23]];
  for (const side of [-1, 1]) {
    for (const [a, b] of naveSegments) wall(side * 10, a, side * 10, b, a >= 17 ? 2.05 : 3.85);
    for (const room of roomBands) {
      wall(side * 10.2, room.min, side * 23, room.min, 3.8);
      wall(side * 10.2, room.max, side * 23, room.max, 1.0);
      wall(side * 23, room.min, side * 23, room.max, 4.15);
      const door = room.door;
      for (const dz of [-2.52, 2.52]) {
        box(side * 10, 2.14, door + dz, .94, 4.34, .62, materials.carved);
        box(side * 10, .3, door + dz, 1.15, .3, .85, materials.stoneLight);
        box(side * 10, 3.82, door + dz, 1.05, .22, .82, materials.stoneLight);
      }
      // Dressed, staggered lintel stones leave the original five-metre route open.
      for (let i=0;i<7;i++) instance('door-lintel',geometries.archStone,materials.carved,
        side*10,4.31,door+(i-3)*.77,1.2,.82,.69);
      box(side*10,4.38,door,.92,.66,.58,materials.stoneLight);
      for (const dz of [-1.72,1.72])
        instance('door-frieze',geometries.block,materials.stoneDark,side*10,4.51,door+dz,.9,.055,.22);
    }
  }

  // Burned ceremonial cloth provides a soft material and irregular silhouette
  // among the stone courses. The hanging is folded geometry, not a flat poster.
  const clothMaterial = new T.MeshStandardMaterial({
    map:texture('banner-basecolor.jpg',true),normalMap:texture('banner-normal.jpg'),
    normalScale:new T.Vector2(.17,.17),roughness:.98,metalness:0,side:T.DoubleSide
  });
  function hangingCloth() {
    const p=[],uv=[],idx=[];const columns=12,rows=22;
    for(let row=0;row<=rows;row++) for(let column=0;column<=columns;column++) {
      const u=column/columns,v=row/rows;
      let y=1.64-v*3.28;
      if(row===rows) y+=.07+Math.sin(column*2.61)*.085+(column===4?.18:0)+(column===9?.26:0);
      p.push((u-.5)*1.40,y,(Math.sin(u*Math.PI*5.4)*.067+Math.sin(v*6+u*4)*.019)*(v*.18+.82));
      uv.push(u,1-v);
    }
    for(let row=0;row<rows;row++) for(let col=0;col<columns;col++) {
      const a=row*(columns+1)+col,b=a+columns+1;idx.push(a,b,a+1,a+1,b,b+1);
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(p,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(idx);geometry.computeVertexNormals();return geometry;
  }
  const hangingGeometry=hangingCloth();
  for(const side of [-1,1]) for(const z of [-5.3,7.6]) {
    instance('burned-funerary-cloth',hangingGeometry,clothMaterial,side*9.64,2.04,z,1,1,1,0,side===1?-Math.PI/2:Math.PI/2);
    beam(side*9.66,3.72,z-.82,side*9.66,3.72,z+.82,.033,materials.iron);
  }

  // Fluted nave piers and stone voussoirs are instanced across both arcades.
  for (const side of [-1, 1]) for (const z of [-20, -10, 0, 10, 20]) {
    const x = side * 8.25;
    collision(x, z, .88);
    instance('column-plinth', geometries.block, materials.stoneDark, x, .24, z, 1.68, .38, 1.68);
    instance('column-base', geometries.columnBase, materials.stoneLight, x, .57, z);
    instance('column-shaft', geometries.column, materials.carved, x, 2.7, z);
    instance('column-neck', geometries.collar, materials.stoneLight, x, 4.72, z);
    instance('column-neck', geometries.collar, materials.stoneLight, x, 1.04, z);
    instance('column-capital', geometries.block, materials.stoneLight, x, 5.02, z, 1.37, .37, 1.37);
    instance('column-capital-top', geometries.block, materials.carved, x, 5.29, z, 1.64, .17, 1.64);
    for (let i=0;i<8;i++) {
      const angle=i/8*Math.PI*2;
      instance('column-rib',geometries.columnRib,materials.stoneLight,
        x+Math.cos(angle)*.51,2.66,z+Math.sin(angle)*.51,.18,.95,.18);
    }
    for (const dx of [-.48, .48]) for (const dz of [-.48, .48])
      instance('capital-carving', geometries.block, materials.stoneDark, x + dx, 4.99, z + dz, .15, .18, .15, 0, Math.PI / 4);
  }
  // Continuous pointed ribs replace the row of fifteen obvious box segments.
  // The outer dressed stone and fine parallel mouldings share the same path.
  function gothicPath(start=0,end=1) {
    const path = new T.CurvePath();
    path.add(new T.CubicBezierCurve3(new T.Vector3(0,5.28,-4.94),new T.Vector3(0,7.32,-4.94),
      new T.Vector3(0,8.72,-2.31),new T.Vector3(0,9.39,0)));
    path.add(new T.CubicBezierCurve3(new T.Vector3(0,9.39,0),new T.Vector3(0,8.72,2.31),
      new T.Vector3(0,7.32,4.94),new T.Vector3(0,5.28,4.94)));
    if (start===0 && end===1) return path;
    return new T.CatmullRomCurve3(Array.from({length:25},(_,i)=>path.getPoint(start+(end-start)*i/24)));
  }
  const archSection = new T.Shape();
  [[-.30,-.21],[-.25,-.26],[.25,-.26],[.30,-.21],[.30,.21],[.25,.26],[-.25,.26],[-.30,.21]].forEach(([x,y],i)=>
    i===0?archSection.moveTo(x,y):archSection.lineTo(x,y));
  archSection.closePath();
  const ribGeometry = new T.ExtrudeGeometry(archSection,{steps:40,bevelEnabled:false,extrudePath:gothicPath()});
  const ribMoulding = new T.TubeGeometry(gothicPath(),30,.065,6,false);
  const brokenRibA = new T.ExtrudeGeometry(archSection,{steps:16,bevelEnabled:false,extrudePath:gothicPath(0,.37)});
  const brokenRibB = new T.ExtrudeGeometry(archSection,{steps:17,bevelEnabled:false,extrudePath:gothicPath(.61,1)});
  for (const side of [-1, 1]) for (const center of [-15, -5, 5, 15]) {
    const broken = side===1 && center===5;
    if (broken) {
      instance('broken-rib-a',brokenRibA,materials.carved,side*8.25,0,center);
      instance('broken-rib-b',brokenRibB,materials.carved,side*8.25,0,center);
    } else {
      instance('gothic-rib',ribGeometry,materials.carved,side*8.25,0,center);
      for (const offset of [-.32,.32])
        instance('gothic-moulding',ribMoulding,materials.stoneDark,side*8.25+offset,0,center);
    }
    if (!broken) instance('arcade-keystone',geometries.block,materials.stoneLight,side*8.25,9.43,center,.83,.54,.68);
  }

  // A recessed northern apse: stone relief, bronze sun, and extinguished braziers.
  box(0, 2.65, -22.61, 8.2, 4.85, .17, materials.stoneDark);
  for (const x of [-4.35, 4.35]) {
    box(x, 2.52, -22.15, .47, 4.91, .75, materials.stoneLight);
    box(x, 4.93, -22.15, .8, .21, 1.01, materials.carved);
  }
  const reliefMaterial = new T.MeshStandardMaterial({
    map:texture('relief-basecolor.jpg',true),normalMap:texture('relief-normal.jpg'),
    color:0xc9c0aa,normalScale:new T.Vector2(.65,.65),roughness:.95,metalness:0,
    polygonOffset:true,polygonOffsetFactor:-1
  });
  const relief = mesh(new T.PlaneGeometry(3.82,4.23),reliefMaterial,0,2.76,-22.50);
  relief.name='Defaced solar funerary relief';
  // The defaced symbol is stone, not a floating golden sun. Broken relief
  // corners and fallen fragments describe the desecration of the archive.
  for (const x of [-2.17,2.16]) for (const y of [.67,4.76])
    instance('relief-broken-corner',geometries.archStone,materials.stoneDark,x,y,-22.39,.48,.48,.35,0,0,.24);
  for (const x of [-5.85, 5.85]) {
    mesh(new T.CylinderGeometry(.72, .5, .45, 8), materials.iron, x, .55, -20.9);
    instance('apse-brazier-feet', geometries.block, materials.stoneDark, x, .19, -20.9, 1.3, .32, 1.3);
    collision(x, -20.9, .72);
  }

  // Six rooms retain broad clear approaches from their doors.
  function tomb(x, z, rotation = 0) {
    const tombGroup = new T.Group();
    tombGroup.position.set(x, 0, z);
    tombGroup.rotation.y = rotation;
    group.add(tombGroup);
    mesh(geometries.tomb, materials.stoneDark, 0, .43, 0, null, tombGroup);
    mesh(geometries.tombTrim, materials.carved, 0, .1, 0, null, tombGroup);
    mesh(geometries.tombLid, materials.stoneLight, 0, .91, 0, null, tombGroup);
    box(0, 1.016, 0, .095, .017, 1.4, materials.bronze, tombGroup);
    box(0, 1.018, -.15, .63, .019, .085, materials.bronze, tombGroup);
    const head = mesh(new T.CylinderGeometry(.46, .46, .19, 12), materials.carved, 0, 1.25, -.88, [Math.PI / 2, 0, 0], tombGroup);
    box(0, 1.02, -.88, .92, .61, .2, materials.carved, tombGroup);
    box(0, 1.32, -1.001, .052, .31, .018, materials.bronze, tombGroup);
    box(0, 1.34, -1.002, .25, .05, .019, materials.bronze, tombGroup);
    for (const s of [-1, 1]) box(s * .586, .51, 0, .025, .07, 1.68, materials.bronze, tombGroup);
    collision(x, z, 1.15);
    return head;
  }
  tomb(-15.2, -18.25); tomb(-20.1, -17.6); tomb(-18.2, -9.3, Math.PI / 2);
  tomb(-15.5, 18); tomb(-20.1, 13.2, Math.PI / 2); tomb(19.5, 18.4);

  function altar(x, z, cold = false) {
    box(x, .22, z, 3.8, .43, 2.3, materials.stoneDark);
    box(x, .75, z, 3.13, .7, 1.7, materials.stone);
    box(x, 1.17, z, 3.65, .2, 2.11, materials.carved);
    for (const sign of [-1, 1]) {
      box(x + sign * 1.4, .78, z + .87, .12, .58, .045, materials.bronze);
      for (const dz of [-.65, .65]) {
        instance('altar-candles', geometries.candle, materials.bone, x + sign * 1.34, 1.47, z + dz);
        instance('altar-candle-flames', geometries.candleFlame, materials.flameCore, x + sign * 1.34, 1.71, z + dz);
      }
    }
    mesh(new T.OctahedronGeometry(.38), cold ? materials.runeBlue : materials.runeGold, x, 1.62, z);
    ring(.53, .035, materials.bronze, x, 1.28, z, 40);
    collision(x, z, 1.93);
  }
  altar(18.5, -18.2, false);
  // A folded, hooded limestone saint. Dense silhouette folds and an actual hood
  // opening replace the placeholder cone-body / sphere-head stack.
  box(18.5, .43, -20.16, 1.88, .75, 1.31, materials.stoneDark);
  function foldedRobe() {
    const vertices=[],uv=[],indices=[];
    const sides=48, rows=22;
    for (let row=0;row<=rows;row++) {
      const t=row/rows, y=t*2.22;
      const radius=.76*(1-t)+.37*t+.20*Math.exp(-Math.pow((t-.79)*7,2));
      for (let i=0;i<=sides;i++) {
        const a=i/sides*Math.PI*2;
        const fold=(Math.cos(a*13+t*.65)*.035+Math.cos(a*7-t*.5)*.032)*(1-t*.48);
        vertices.push(Math.sin(a)*(radius+fold),y+Math.cos(a*7)*.015*(1-t),Math.cos(a)*(radius+fold)*.69);
        uv.push(i/sides,t);
      }
    }
    for (let row=0;row<rows;row++) for (let i=0;i<sides;i++) {
      const a=row*(sides+1)+i,b=a+sides+1;
      indices.push(a,a+1,b,a+1,b+1,b);
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
  mesh(foldedRobe(),materials.carved,18.5,.77,-20.16);
  const hood = mesh(new T.SphereGeometry(.48,28,18,Math.PI*.12,Math.PI*1.76,0,Math.PI*.83),
    materials.carved,18.5,3.08,-20.23,[.05,Math.PI,0]);
  hood.scale.set(1,1.19,.84);
  const hoodVoid=mesh(new T.SphereGeometry(.29,20,14),materials.mortar,18.5,3.08,-19.99);
  hoodVoid.scale.set(.88,1.2,.28);
  for (const sign of [-1, 1]) {
    const arm=mesh(new T.CapsuleGeometry(.20,.68,4,12),materials.carved,18.5+sign*.50,2.32,-20.0);
    arm.rotation.z=sign*.53;
    mesh(new T.SphereGeometry(.12,12,8),materials.stoneLight,18.5+sign*.21,1.98,-19.64);
  }

  // Archive shelves: six book-material batches, with bands and uneven spines.
  function bookshelf(x, z, length) {
    box(x - .15, 1.91, z, .76, 3.68, length, materials.wood);
    box(x + .27, 1.91, z, .045, 3.38, length - .21, materials.stoneDark);
    for (let row = 0; row < 5; row++) {
      const y = .28 + row * .73;
      box(x + .23, y, z, 1.07, .115, length + .1, materials.woodEdge);
      if (row === 4) continue;
      for (let p = -length / 2 + .22; p < length / 2 - .17; p += .22) {
        const c = Math.floor(random() * books.length), h = .74 + random() * .28;
        instance(`books-${c}`, geometries.book, books[c], x + .43, y + .38 * h, z + p, 1, h, .8 + random() * .2);
        instance('book-spine-bands', geometries.block, materials.bronze, x + .674, y + .17, z + p, .012, .029, .145);
        instance('book-spine-bands', geometries.block, materials.bronze, x + .674, y + .49 * h, z + p, .012, .029, .145);
      }
    }
    for (const end of [-length / 2, length / 2]) {
      box(x + .2, 1.9, z + end, 1.03, 3.84, .15, materials.woodEdge);
      box(x + .73, 1.94, z + end, .03, 2.62, .065, materials.bronze);
    }
    for (let p = -length / 2 + .45; p < length / 2; p += 1.1) collision(x + .28, z + p, .72);
  }
  bookshelf(-21.8, 1, 9.5);
  // Reading lectern and an open, ivory-paged grimoire.
  box(-17.7, .19, 4.7, 1.36, .3, 1.2, materials.stoneDark);
  box(-17.7, .82, 4.7, .58, 1.06, .63, materials.wood);
  const desk = box(-17.7, 1.4, 4.7, 1.65, .15, 1.28, materials.woodEdge);
  desk.rotation.x = -.2;
  for (const side of [-1, 1]) {
    const page = box(-17.7 + side * .34, 1.52, 4.7, .65, .06, .88, materials.bone);
    page.rotation.z = side * -.1;
    page.rotation.x = -.2;
    for (let row = 0; row < 5; row++)
      instance('grimoire-ink', geometries.block, materials.stoneDark, -17.7 + side * .35, 1.57 - row * .031, 4.45 + row * .13, .41, .009, .014);
  }
  collision(-17.7, 4.7, 1.0);

  altar(18.65, 4.65, true);
  for (const z of [-3.5, -1.7, .1]) {
    box(21.62, .44, z, 1.28, .84, 1.25, materials.wood);
    for (const dz of [-.51, .51]) box(21.62, .47, z + dz, 1.33, .92, .045, materials.iron);
    for (const x of [21.12, 22.12]) box(x, .47, z, .045, .92, 1.31, materials.iron);
    collision(21.62, z, .83);
  }
  // Southern memorial chamber: a carved obelisk and low votive plinth.
  box(16.1, .19, 11.5, 2.05, .36, 1.88, materials.stoneDark);
  mesh(new T.CylinderGeometry(.48, .66, 2.28, 4), materials.carved, 16.1, 1.48, 11.5, [0, Math.PI / 4, 0]);
  mesh(new T.ConeGeometry(.68, .62, 4), materials.stoneLight, 16.1, 2.95, 11.5, [0, Math.PI / 4, 0]);
  box(16.1, 1.42, 12.08, .09, .74, .02, materials.bronze);
  box(16.1, 1.54, 12.09, .42, .07, .02, materials.bronze);
  collision(16.1, 11.5, 1.01);
  box(-18.4, .17, 20.07, 3.6, .27, 1.15, materials.stone);
  for (let i = 0; i < 9; i++) {
    const x = -19.83 + i * .36;
    instance('votive-candles', geometries.candle, materials.bone, x, .47, 20.05, 1, .7 + random() * .8, 1);
    instance('votive-flames', geometries.candleFlame, materials.flameCore, x, .73, 20.05);
  }
  collision(-18.4, 20.07, 1.7);

  // Four real lights; the remaining fire and candle details use emissive geometry.
  function torch(x, z, direction, lit) {
    const towardX = Math.cos(direction), towardZ = Math.sin(direction);
    box(x, 2.16, z, .26, .7, .23, materials.iron);
    beam(x, 2.05, z, x + towardX * .4, 2.41, z + towardZ * .4, .071);
    const fx = x + towardX * .43, fz = z + towardZ * .43;
    mesh(new T.CylinderGeometry(.17, .13, .35, 7), materials.iron, fx, 2.53, fz);
    const flame = new T.Group();
    flame.position.set(fx, 2.91, fz);
    group.add(flame);
    const outer=mesh(flameCard,flameCardMaterial,0,.065,0,null,flame);
    outer.castShadow=false;
    animatedFlames.push({ object: flame, phase: random() * 6.28 });
    if (lit) {
      const light = new T.PointLight(0xffb66b, 13, 17, 2);
      light.position.set(fx, 3.05, fz);
      group.add(light);
      animatedLights.push({ object: light, phase: random() * 6.28 });
    }
  }
  for (const side of [-1, 1]) {
    torch(side * 9.58, -9.8, side === -1 ? 0 : Math.PI, true);
    torch(side * 9.58, 9.9, side === -1 ? 0 : Math.PI, true);
    torch(side * 22.57, -13.7, side === -1 ? 0 : Math.PI, false);
    torch(side * 22.57, 1, side === -1 ? 0 : Math.PI, false);
    torch(side * 22.57, 15.2, side === -1 ? 0 : Math.PI, false);
  }

  // Low ritual rings keep the playable nave clear and make both landmarks legible.
  const bossSigil = new T.Group();
  bossSigil.position.set(0, 0, -15);
  group.add(bossSigil);
  mesh(new T.CylinderGeometry(3.4, 3.4, .07, 64), materials.ash, 0, .027, 0, null, bossSigil);
  function localRing(radius, material, thickness, parent, y = .081) {
    return mesh(new T.TorusGeometry(radius, thickness, 6, 80), material, 0, y, 0, [-Math.PI / 2, 0, 0], parent);
  }
  localRing(3.31, materials.bronze, .034, bossSigil);
  localRing(2.86, materials.redGlow, .021, bossSigil);
  localRing(2.64, materials.bronze, .02, bossSigil);
  const bossInner = localRing(1.48, materials.redGlow, .016, bossSigil, .088);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * Math.PI * 2;
    const glyph = box(Math.sin(angle) * 3.07, .083, -15 + Math.cos(angle) * 3.07, .13, .018, .23, materials.runeGold);
    glyph.rotation.y = angle;
    const cross = box(Math.sin(angle) * 3.07, .084, -15 + Math.cos(angle) * 3.07, .23, .018, .055, materials.runeGold);
    cross.rotation.y = angle;
  }
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, b = ((i + 2) % 5) / 5 * Math.PI * 2;
    beam(Math.sin(a) * 2.35, .085, -15 + Math.cos(a) * 2.35,
      Math.sin(b) * 2.35, .085, -15 + Math.cos(b) * 2.35, .018, materials.runeGold);
  }
  for (const side of [-1, 1]) for (const dz of [-1.8, 1.8]) {
    instance('ritual-candles', geometries.candle, materials.bone, side * 3.75, .25, -15 + dz);
    instance('ritual-flames', geometries.candleFlame, materials.flameCore, side * 3.75, .51, -15 + dz);
  }

  const portal = new T.Group();
  portal.position.set(0, 0, 7);
  group.add(portal);
  mesh(new T.CylinderGeometry(1.95, 2.03, .08, 64), materials.stoneDark, 0, .032, 0, null, portal);
  localRing(1.92, materials.bronze, .052, portal);
  localRing(1.72, materials.runeBlue, .026, portal, .091);
  const portalInner = localRing(1.27, materials.blueGlow, .026, portal, .101);
  localRing(.43, materials.bronze, .025, portal, .092);
  const mistMaterial = new T.MeshBasicMaterial({ color: 0x579eac, transparent: true, opacity: .047, depthWrite: false, side: T.DoubleSide });
  const mist = mesh(new T.CircleGeometry(1.6, 64), mistMaterial, 0, .09, 0, [-Math.PI / 2, 0, 0], portal);
  mist.castShadow = false;
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    const glyph = mesh(geometries.rune, materials.runeBlue, Math.sin(a) * 1.51, .098, Math.cos(a) * 1.51, [0, a + .35, 0], portal);
    const cross = mesh(geometries.rune, materials.runeBlue, Math.sin(a) * 1.51, .099, Math.cos(a) * 1.51, [0, a + 1.4, 0], portal);
    cross.scale.z = .48;
    const spark = mesh(new T.OctahedronGeometry(.035), materials.blueGlow, Math.sin(a) * 1.69, .2 + i * .06, Math.cos(a) * 1.69, null, portal);
    spark.castShadow = false;
    portalSparks.push({ object: spark, angle: a, phase: i / 10 });
  }

  // Debris remains against walls and outside the principal combat route.
  for (let i = 0; i < 72; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (6.7 + random() * 2.35), z = -22 + random() * 44;
    if (obstacles.some(o => Math.hypot(x - o.x, z - o.z) < o.r + .35)) continue;
    instance('nave-rubble', geometries.rubble, materials.stoneDark, x, .105, z,
      .35 + random() * .6, .25 + random() * .35, .4 + random() * .6,
      random() * .8, random() * 6.28, random() * .7);
  }
  for (const side of [-1, 1]) for (const room of roomBands) for (let i = 0; i < 7; i++) {
    const x = side * (13.1 + random() * 8.9), z = room.min + .65 + random() * 1.0;
    instance('room-rubble', geometries.rubble, materials.stone, x, .12, z,
      .5 + random(), .34 + random() * .3, .5 + random(), random(), random() * 6.28, random());
    if (i % 2 === 0)
      instance('scattered-bones', geometries.smallBone, materials.bone, x + .35, .045, z + .3, 1, 1, 1, Math.PI / 2, random() * 6.28);
  }

  // Small architectural details share the same unit geometries as well. Bake
  // their parent transforms into instances instead of issuing a draw per cornice.
  group.updateMatrixWorld(true);
  const inverseRoot = group.matrixWorld.clone().invert();
  const sharedGeometries = new Set(Object.values(geometries));
  const bake = [];
  group.traverse(object => {
    if (object.isMesh && sharedGeometries.has(object.geometry)) bake.push(object);
  });
  for (const object of bake) {
    const name = `detail-${object.geometry.uuid}-${object.material.uuid}`;
    if (!batches.has(name)) batches.set(name, { geometry: object.geometry, material: object.material, matrices: [] });
    batches.get(name).matrices.push(object.matrixWorld.clone().premultiply(inverseRoot));
    object.removeFromParent();
  }
  for (const [name, batch] of batches) {
    const object = new T.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
    object.name = name;
    batch.matrices.forEach((matrix, i) => object.setMatrixAt(i, matrix));
    object.castShadow = !batch.material.transparent && !name.includes('floor') && !name.includes('flagstone') && !name.includes('inlay') && !name.includes('flame');
    object.receiveShadow = true;
    object.instanceMatrix.needsUpdate = true;
    object.computeBoundingSphere();
    group.add(object);
  }

  // This includes a 0.4 player-radius margin around the masonry, but leaves
  // object collisions to the returned obstacle circles used by the game.
  function walkable(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) >= 22.3 || Math.abs(z) >= 22.3) return false;
    const ax = Math.abs(x);
    if (ax < 9.25) return true;
    for (const room of roomBands) {
      if (ax < 11.15 && Math.abs(z - room.door) < 1.97) return true;
      if (ax > 10.75 && z > room.min + .72 && z < room.max - .72) return true;
    }
    return false;
  }
  function update(dt, time, playerPosition) {
    const t = Number.isFinite(time) ? time : 0;
    for (const item of animatedFlames) {
      const flicker = Math.sin(t * 13 + item.phase) * .055 + Math.sin(t * 21 + item.phase * 2) * .035;
      item.object.scale.set(1 + flicker, 1 + flicker * 1.8, 1 - flicker);
      item.object.rotation.z = Math.sin(t * 7 + item.phase) * .055;
    }
    for (const item of animatedLights) {
      item.object.intensity=12.7+Math.sin(t*9+item.phase)*.7+Math.sin(t*17+item.phase)*.3;
      // Shader light count stays fixed; out-of-reach lights cost no fragments.
      // Do not toggle visibility per frame (it would change shader defines).
      if (playerPosition && item.object.position.distanceTo(playerPosition)>34) item.object.intensity=0;
    }
    portalInner.rotation.z = t * .1;
    bossInner.rotation.z = -t * .025;
    materials.blueGlow.opacity = .28 + Math.sin(t * 1.8) * .045;
    materials.redGlow.opacity = .20 + Math.sin(t * 1.4) * .035;
    mistMaterial.opacity = .041 + Math.sin(t * 1.9) * .009;
    for (const spark of portalSparks) {
      const a = spark.angle + t * .14;
      spark.object.position.set(Math.sin(a) * 1.69, .16 + ((t * .17 + spark.phase) % 1) * .78, Math.cos(a) * 1.69);
      spark.object.rotation.y = t * .7 + spark.angle;
    }
    // The open roof and low southern wall are fixed cutaways, so camera movement
    // never changes collisions or hides the player with a solid foreground wall.
    void dt;
    void playerPosition;
  }

  update(0, 0, null);
  // Structural budget; renderer.info gives the actual visible pass budget.
  let triangles=0, meshCount=0, instanceCount=0;
  group.traverse(object=>{
    if (!object.isMesh) return;
    meshCount++;
    const count=object.isInstancedMesh?object.count:1;
    instanceCount+=count;
    triangles+=(object.geometry.index?object.geometry.index.count:object.geometry.attributes.position.count)/3*count;
  });
  const artStats=Object.freeze({triangles,meshCount,instanceCount,pointLights:animatedLights.length,
    textureFiles:16,textureResolution:1024});
  return { group, obstacles, walkable, update, artStats };
}
