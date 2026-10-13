/**
 * Original procedural high-resolution hooded mage for small camera zoom.
 * Crisp vector silhouette at any device DPR. This is a readable interim sprite,
 * NOT the approved realistic 2.5D animated character deliverable.
 */
export function drawMage(ctx,p,tick,gear={}){
  ctx.save();ctx.translate(Math.round(p.x),Math.round(p.y));
  const isLeft=Math.cos(p.angle)<-.2,walking=Math.abs(p.walk??0)>.01;
  if(isLeft)ctx.scale(-1,1);
  const t=Math.sin((p.walk||tick*2))*2;
  const cast=p.cast>0;
  const cape=gear.robe?.rarity>=3?'#702b33':'#443f4a';
  const metal=gear.head?.rarity>=3?'#bf9862':'#77808d';
  const gleam=gear.weapon?.rarity>=3?'#ff9f4c':'#77bcf2';
  const poly=(pts,color,edge='#11151e',lw=2)=>{ctx.beginPath();ctx.moveTo(...pts[0]);for(const xy of pts.slice(1))ctx.lineTo(...xy);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle=edge;ctx.lineWidth=lw;ctx.stroke();};
  // Contact shadow.
  ctx.fillStyle='#02040ab5';ctx.beginPath();ctx.ellipse(0,6,26,10,0,0,Math.PI*2);ctx.fill();
  // Cloak tail, upper body proportions, split hem showing boots.
  poly([[-17,-51],[-30,-8],[-19,-8],[-9,-13],[0,-6],[12,-14],[26,-8],[16,-52]],cape);
  poly([[-13,-42],[-11,-10],[-3,-9],[0,-33]],'#36343e');
  poly([[1,-33],[5,-9],[16,-10],[13,-43]],'#3a333b');
  poly([[-16,-11],[-4,-11],[-1,2],[-15,2]],'#322b2f','#0d1016');
  poly([[4,-11],[16,-11],[18,2],[2,2]],'#302d36','#0d1016');
  // Chest armor, shoulders and belt.
  poly([[-20,-64],[-13,-74],[12,-74],[19,-64],[15,-31],[-15,-31]],'#33353d');
  poly([[-14,-69],[0,-61],[14,-69],[12,-44],[0,-40],[-13,-44]],'#5b5356','#b99b73');
  poly([[-22,-66],[-11,-73],[-8,-61],[-18,-56],[-24,-60]],metal);
  poly([[11,-73],[23,-66],[25,-60],[18,-56],[8,-61]],metal);
  poly([[-17,-38],[17,-38],[16,-30],[-17,-30]],'#644a35','#be966a');
  poly([[-5,-39],[5,-39],[5,-29],[-5,-29]],'#a88553');
  ctx.fillStyle='#e5b475';ctx.fillRect(-2,-36,4,5);
  // Folded hood with shadowed young-looking face (no enlarged elder-man bitmap).
  poly([[-21,-74],[-23,-89],[-17,-104],[0,-110],[17,-102],[22,-89],[20,-75],[13,-68],[-14,-68]],'#282a36','#0e111c',2.2);
  poly([[-14,-92],[-4,-102],[7,-101],[15,-88],[13,-76],[-9,-77]],'#9b7765','#25242a');
  poly([[-14,-91],[-6,-106],[0,-111],[9,-104],[19,-90],[11,-85],[5,-95],[-5,-94]],'#46434a','#bab2ad',1.3);
  poly([[-13,-85],[-6,-93],[6,-94],[12,-86],[9,-78],[-10,-78]],'#182028','#0b1018');
  ctx.fillStyle='#d8ab88';ctx.beginPath();ctx.moveTo(-4,-79);ctx.lineTo(0,-76);ctx.lineTo(3,-79);ctx.fill();
  ctx.fillStyle='#f0af75';ctx.fillRect(-9,-85,5,1.5);ctx.fillRect(4,-85,5,1.5);
  // Arms bend through cast pose.
  poly([[-17,-62],[-23,-54],[-19,-37],[-12,-37],[-11,-55]],'#66525a');
  poly([[15,-62],[23,-55],[19,-38],[12,-39],[11,-55]],'#66525a');
  if(cast){
    poly([[12,-53],[24,-68],[35,-60],[25,-46],[19,-39]],'#85736b',metal);
    const g=ctx.createRadialGradient(32,-64,0,32,-64,22);
    g.addColorStop(0,'#fff4b8');g.addColorStop(.36,gleam);g.addColorStop(1,'#fb8b3000');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(32,-64,22,0,Math.PI*2);ctx.fill();
  }else{
    poly([[12,-53],[21,-42],[15,-31],[9,-35]],'#837064');
  }
  // Realizable weapon silhouette; staff set vertically in front.
  ctx.strokeStyle='#271c21';ctx.lineWidth=5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(27,-6);ctx.lineTo(33,-99);ctx.stroke();
  ctx.strokeStyle='#b48c56';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(28,-6);ctx.lineTo(34,-96);ctx.stroke();
  poly([[33,-116],[24,-99],[29,-94],[33,-101],[37,-94],[42,-99]],metal);
  const orb=ctx.createRadialGradient(33,-103,0,33,-103,13);
  orb.addColorStop(0,'#fff3dc');orb.addColorStop(.3,gleam);orb.addColorStop(1,'#ee742600');
  ctx.fillStyle=orb;ctx.beginPath();ctx.arc(33,-103,13,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=gear.weapon?.rarity>=3?'#e0bc72':'#73818b';
  ctx.lineWidth=1.6;ctx.beginPath();ctx.arc(33,-103,6.5,0,Math.PI*2);ctx.stroke();
  ctx.restore();
}
