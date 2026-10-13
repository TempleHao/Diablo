/**
 * Ember Chronicles 2D - a compact, original dark-fantasy mage renderer.
 * Foot-anchored silhouette designed for 0.55-0.67x display scale.
 * Source vectors are deliberately high resolution for small screens.
 * Interim game artwork; not the final realistic A-direction animated sprite.
 */
export function drawMage(ctx,actor,time,gear={}){
  ctx.save();
  ctx.translate(actor.x,actor.y);
  if(Math.cos(actor.angle||0)<-.2)ctx.scale(-1,1);
  const step=Math.sin(actor.walk||time*2)*1.8,cast=(actor.cast||0)>0;
  const legendary=gear.head?.rarity>=3||gear.robe?.rarity>=3;
  const cloak=gear.robe?.rarity>=3?'#493038':'#242b35';
  const metal=gear.head?.rarity>=3?'#b08a5c':'#849099';
  const magic=gear.weapon?.rarity>=3?'#e7a56c':'#89bad9';
  function shape(pts,fill,edge='#101721',width=1.1){
    ctx.beginPath();ctx.moveTo(...pts[0]);for(const pt of pts.slice(1))ctx.lineTo(...pt);
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();
    if(edge){ctx.strokeStyle=edge;ctx.lineWidth=width;ctx.stroke();}
  }
  function roundedLine(points,color,width=2){
    ctx.beginPath();ctx.moveTo(...points[0]);for(const pt of points.slice(1))ctx.lineTo(...pt);
    ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=color;ctx.stroke();
  }
  const fade=(colors,y1=-90,y2=0)=>{
    const gradient=ctx.createLinearGradient(0,y1,0,y2);
    for(const [at,color] of colors)gradient.addColorStop(at,color);
    return gradient;
  };
  // Soft contact shadow avoids the enlarged, flat cartoon halo of the prior version.
  ctx.fillStyle='#05060aa0';ctx.beginPath();ctx.ellipse(0,3,21,6,0,0,Math.PI*2);ctx.fill();
  // The two boots are animated subtly, and remain anatomically attached to the hem.
  shape([[-11,-19],[-2,-19],[-3,-3],[-15,-3],[-16,-9]],'#2b3036','#0f1115');
  shape([[2,-19],[11,-19],[15,-10],[14,-3],[3,-3]],'#303238','#0f1115');
  roundedLine([[-14,-5],[-4,-5]],'#73706b',1.5);
  roundedLine([[4,-5],[14,-5]],'#73706b',1.5);
  // Narrow flowing cape, shadow-side fold, and red textile accent.
  const hemSwing=step;
  shape([[-12,-72],[-23,-53],[-27+hemSwing,-12],[-23,-4],[-9,-16],[1,-7],
    [12,-18],[23+hemSwing,-5],[25,-14],[20,-60],[12,-74]],
    fade([[0,'#47414a'],[.3,cloak],[1,'#161b23']]),'#14151a',1.5);
  shape([[-10,-60],[-14,-26],[-18,-10],[-8,-23],[-2,-17],[-2,-55]],'#2e222a',null);
  shape([[5,-63],[9,-29],[20,-11],[13,-18],[5,-47]],'#24252c',null);
  roundedLine([[-21,-17],[-15,-25],[-10,-46]],'#846e5f80',1.5);
  // Body is long and thin rather than chibi-sized; waist has functional layered armor.
  shape([[-15,-74],[14,-74],[19,-59],[13,-37],[-14,-37],[-19,-58]],
    fade([[0,'#5b5f65'],[.6,'#343a43'],[1,'#222831']]),'#0e141b',1.6);
  shape([[-9,-67],[0,-63],[10,-68],[12,-45],[0,-42],[-12,-46]],
    '#4a4547','#a79377',1.3);
  shape([[-6,-61],[0,-58],[8,-61],[6,-52],[0,-48],[-7,-53]],
    '#343d45','#7a8287',.8);
  shape([[-17,-42],[18,-42],[16,-33],[-15,-33]],'#554133','#151820',1.2);
  shape([[-5,-42],[5,-42],[5,-32],[-5,-32]],'#a0845d','#1e1d1e',.9);
  ctx.fillStyle='#ddd3b3';ctx.fillRect(-1.2,-39,2.4,3);
  // Shoulders: small faceted pauldrons, not oversized square cartoon plates.
  shape([[-17,-76],[-24,-67],[-23,-60],[-17,-57],[-11,-64],[-12,-73]],metal,'#1c242a',1.1);
  shape([[13,-75],[23,-68],[24,-60],[18,-58],[11,-65]],metal,'#1c242a',1.1);
  roundedLine([[-23,-67],[-18,-70],[-13,-68]],'#ead2a36e',1.1);
  roundedLine([[14,-68],[19,-70],[23,-66]],'#ead2a36e',1.1);
  // Slim forearms and enclosed gloves. Caster arm raises only while casting.
  shape([[-17,-63],[-22,-52],[-17,-35],[-10,-34],[-10,-52]],'#4c4a50','#16191e');
  shape([[16,-63],[22,-54],[19,-38],[12,-38],[10,-54]],'#515159','#16191e');
  shape([[-18,-42],[-12,-42],[-13,-31],[-20,-32]],'#554035','#1c2024');
  if(cast)shape([[12,-46],[24,-67],[29,-62],[23,-46],[18,-36]],'#847b74','#263037');
  else shape([[12,-41],[19,-42],[19,-32],[12,-31]],'#67534a','#21232a');
  // Hood has a sharper crown and narrower facial opening (no oversized elderly face).
  shape([[-15,-76],[-17,-91],[-12,-105],[0,-111],[12,-105],[17,-91],[15,-76],
      [9,-73],[-9,-73]],
    fade([[0,'#444850'],[.5,'#292e38'],[1,'#181d25']]), '#11141c',1.6);
  shape([[-11,-93],[-5,-102],[3,-103],[12,-94],[10,-79],[-9,-79]],
    '#1a2028','#0a1118',1.2);
  // Suggest a masked face with two narrow highlights, leaving the face mysterious.
  shape([[-6,-82],[5,-82],[2,-77],[-4,-77]],'#715a52',null);
  roundedLine([[-8,-88],[-2,-89]],'#bb9a7c',1);
  roundedLine([[2,-89],[8,-88]],'#bb9a7c',1);
  roundedLine([[-13,-96],[-5,-105],[2,-107],[11,-97]],legendary?'#c9a572':'#84848a',1.3);
  if(legendary){
    ctx.fillStyle='#ce875625';ctx.beginPath();ctx.arc(0,-91,18,0,Math.PI*2);ctx.fill();
    roundedLine([[-7,-98],[0,-103],[7,-98]],'#bc8a56',1);
  }
  // Staff and socket silhouette is slender and legible; magical highlight is subdued.
  roundedLine([[27,-7],[33,-103]],'#241d21',5);
  roundedLine([[27.5,-8],[33.5,-102]],'#9f8364',2.1);
  shape([[34,-117],[25,-105],[28,-97],[33,-101],[38,-97],[42,-106]],
    '#686f74','#1a2630',1.2);
  ctx.save();ctx.shadowBlur=11;ctx.shadowColor=magic;ctx.fillStyle=magic;
  ctx.beginPath();ctx.ellipse(33,-108,4.3,6.8,0,0,Math.PI*2);ctx.fill();ctx.restore();
  roundedLine([[30,-111],[33,-115],[36,-110]],'#e6dcc6',1);
  if(cast){
    const glow=ctx.createRadialGradient(27,-57,0,27,-57,23);
    glow.addColorStop(0,'#ffffffb0');glow.addColorStop(.35,magic+'aa');glow.addColorStop(1,'#00000000');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(27,-57,23,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
