/**
 * Original procedural dungeon masonry for Ember Chronicles 2D.
 * Copyright (c) 2026 Ember Chronicles contributors. SPDX-License-Identifier: CC0-1.0
 * No third-party image, hotlink, font, texture or paid dependency.
 *
 * Pre-rendered at native 48px cells; north-facing vertical wall faces are
 * elevated 24px above their collision cell to provide consistent 2.5D depth.
 * This is an original environment-art iteration, not final A-direction art.
 */
export const MASONRY_LICENSE = 'CC0-1.0';
export const CELL_ART_SIZE = 48;
const cache = new Map();
export function masonryVariant(x, y, seed = 0) {
  let h = Math.imul((x | 0) ^ (seed | 0), 0x45d9f3b) ^ Math.imul(y | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h >>> 0) % 8;
}
function makeTile(kind, variant) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = CELL_ART_SIZE;
  canvas.height = kind === 'wall' ? 72 : 48;
  const g = canvas.getContext('2d');
  if (!g) return null;
  let seed = ((variant + 17) * 2654435761) >>> 0;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  const polygon = (points, fill, stroke) => {
    g.beginPath();g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
    g.closePath();g.fillStyle = fill;g.fill();
    if (stroke) { g.strokeStyle = stroke;g.lineWidth = 1.2;g.stroke(); }
  };
  if (kind === 'floor') {
    g.fillStyle = '#0b1014';g.fillRect(0, 0, 48, 48);
    const slabs = [[0,0,48,23],[0,24,48,24]];
    for (let i=0;i<slabs.length;i++) {
      const [x,y,w,h] = slabs[i], inset = 1 + rnd()*2;
      const surface = g.createLinearGradient(0,y,0,y+h);
      surface.addColorStop(0, i ? '#363a3c' : '#3a3d3e');
      surface.addColorStop(.48, '#292e31');
      surface.addColorStop(1, '#161d21');
      polygon([[x+inset,y+2],[x+w-2,y+1+rnd()*2],[x+w-1,y+h-2],
        [x+2,y+h-1],[x,y+6]],surface,'#101519');
      g.strokeStyle = '#72777929';g.lineWidth = .8;
      g.beginPath();g.moveTo(4,y+4);g.lineTo(41,y+3);g.stroke();
    }
    // Uneven joints, scratches, mineral inclusions and fractured corners.
    g.strokeStyle='#090e13a8';g.lineWidth=2;
    g.beginPath();g.moveTo(0,24);g.lineTo(48,23);g.stroke();
    for(let i=0;i<14;i++){
      const x=3+rnd()*41,y=4+rnd()*40;
      g.strokeStyle=i%3===0?'#a4a8a425':'#090d1299';
      g.lineWidth=i%3===0?.65:1;
      g.beginPath();g.moveTo(x,y);g.lineTo(x+2+rnd()*8,y-1+rnd()*3);g.stroke();
    }
    if(variant%3===0){
      g.strokeStyle='#080d11b5';g.lineWidth=1.6;
      g.beginPath();g.moveTo(47,8);g.lineTo(35,14);g.lineTo(31,20);g.stroke();
    }
    const soot=g.createLinearGradient(0,0,48,48);
    soot.addColorStop(0,'#b1a58c09');soot.addColorStop(1,'#05090d50');
    g.fillStyle=soot;g.fillRect(0,0,48,48);
  } else {
    g.fillStyle='#070a0e';g.fillRect(0,0,48,72);
    // A visible top plane and raised face: geometry, not a recolored tile.
    const top=g.createLinearGradient(0,2,0,23);
    top.addColorStop(0,'#74716a');top.addColorStop(.45,'#4c504f');top.addColorStop(1,'#222a2e');
    polygon([[1,14],[7,3],[42,2],[47,13],[43,23],[3,23]],top,'#11171b');
    g.fillStyle='#8d8b7b55';g.fillRect(8,5,32,2);
    const face=g.createLinearGradient(0,22,0,68);
    face.addColorStop(0,'#565a58');face.addColorStop(.33,'#3a4144');
    face.addColorStop(.8,'#262c32');face.addColorStop(1,'#11171c');
    polygon([[2,22],[44,22],[44,65],[2,66]],face,'#11161c');
    g.fillStyle='#10181f70';polygon([[44,22],[48,13],[48,60],[44,65]],'#141c22');
    for(let y=34;y<=61;y+=14){
      g.strokeStyle='#11181dc7';g.lineWidth=1.8;
      g.beginPath();g.moveTo(3,y);g.lineTo(43,y+(rnd()-.5)*2);g.stroke();
      for(let x=(y%28===6?12:25);x<45;x+=28){
        g.beginPath();g.moveTo(x,y);g.lineTo(x-2,y+13);g.stroke();
      }
      g.strokeStyle='#a9a99a22';g.lineWidth=.7;
      g.beginPath();g.moveTo(5,y-2);g.lineTo(42,y-2);g.stroke();
    }
    for(let i=0;i<10;i++){
      const x=6+rnd()*34,y=25+rnd()*37;
      g.strokeStyle=i%3?'#111b2280':'#a5a69c38';g.lineWidth=.8;
      g.beginPath();g.moveTo(x,y);g.lineTo(x+(rnd()-.5)*9,y+2+rnd()*6);g.stroke();
    }
    g.fillStyle='#03070c9e';g.fillRect(0,67,48,5);
  }
  return canvas;
}
function tile(kind, variant) {
  const key=kind+':'+variant;
  if(!cache.has(key)) cache.set(key,makeTile(kind,variant));
  return cache.get(key);
}
export function masonryAssetStats(){return {cached:cache.size,license:MASONRY_LICENSE};}
export function drawMasonryCell(ctx,x,y,kind,variant){
  const art=tile(kind,variant);
  if(art)ctx.drawImage(art,x,y-(kind==='wall'?24:0));
  else {ctx.fillStyle=kind==='wall'?'#343b40':'#292e32';ctx.fillRect(x,y,48,48);}
}
