import * as Art from './art.js';
import { TILE, WIDTH, HEIGHT, START, SAVE_KEY, clamp, distance, mulberry32, makeDungeon, walkable, moveWithCollision, freshSave, sanitizeSave, stats, expRequired, gainXp, createItem, equip, salvage } from './core.js';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d'), minimap = $('minimap').getContext('2d');
const ui = { hp: $('hp-num'), mana: $('mana-num'), level: $('level'), xp: $('xp-fill'), gold: $('gold'), essence: $('essence'),
  boss: $('boss-ui'), bossHp: $('boss-meter'), title: $('quest-title'), progress: $('quest-progress'), log: $('eventlog') };
const skillData = { fire: {cooldown:.25}, ice:{cooldown:5}, blink:{cooldown:3.6}, heal:{cooldown:14} };
const keys = new Set(), pointers = new Set(), joystick = { id:null, x:0, y:0 };
let vw = 0, vh = 0, dpr = 1, cam = {x:0,y:0}, profile, dungeon, rng, hero;
let enemies = [], missiles = [], drops = [], particles = [], texts = [], hazards = [], state = 'intro', tick = 0, last = 0;
let kills = 0, total = 12, boss = null, frameIndex = 0, nextId = 1, manualAim = null, messageTimes = new Map();
const cooldowns = {fire:0,ice:0,blink:0,heal:0};
const palette = { stone:'#262d34', stoneEdge:'#11171e', gold:'#e5b777', ice:'#91dcfa', fire:'#ff9a57', rare:['#c0c5c4','#74bdf0','#ffc16f','#d9a0f0'] };
try { profile = sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch { profile = freshSave(); }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch { announce('浏览器无法保存。请在行囊内导出角色备份。', true); } }
function resize() { vw = window.innerWidth; vh = window.innerHeight; dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(vw*dpr); canvas.height = Math.round(vh*dpr); }
window.addEventListener('resize', resize); resize();
function announce(message, urgent=false) {
  const now = performance.now(), lastSeen = messageTimes.get(message) || -Infinity;
  if (!urgent && now-lastSeen < 2500) return;
  messageTimes.set(message,now);
  const line = document.createElement('div'); line.textContent=message; ui.log.prepend(line);
  while(ui.log.childElementCount>4)ui.log.lastElementChild.remove();
  window.setTimeout(()=>line.remove(),4300);
}
function randomPoint(minDist=260) {
  for(let n=0;n<450;n++){
    const x=150+rng()*(WIDTH-300), y=150+rng()*(HEIGHT-300);
    if(distance({x,y},hero)<minDist || !walkable(x,y,28,dungeon))continue;
    return {x,y};
  }
  return {x:WIDTH/2,y:HEIGHT*.2};
}
function encounterPoint(i) {
  // Near the starting chamber so the first screen includes an actual encounter.
  const angles=[-0.45,-2.75,-1.35,-2.15];
  const distanceFromHero=[330,320,370,415];
  const a=angles[i%angles.length],radius=distanceFromHero[i%distanceFromHero.length];
  const candidate={x:hero.x+Math.cos(a)*radius,y:hero.y+Math.sin(a)*radius};
  if(walkable(candidate.x,candidate.y,28,dungeon))return candidate;
  for(let n=0;n<96;n++) {
    const angle=rng()*Math.PI*2,dist=255+rng()*250;
    const p={x:hero.x+Math.cos(angle)*dist,y:hero.y+Math.sin(angle)*dist};
    if(walkable(p.x,p.y,28,dungeon))return p;
  }
  return randomPoint();
}
function build() {
  const seed = 20261013 + profile.clears*19;
  rng=mulberry32(seed); dungeon=makeDungeon(seed);
  const s=stats(profile);
  hero={x:START.x,y:START.y, radius:17,hp:s.hp,mana:s.mana,maxHp:s.hp,maxMana:s.mana,angle:-Math.PI/2,invuln:0,cast:0,walk:0};
  enemies=[];missiles=[];drops=[];particles=[];texts=[];hazards=[];kills=0;boss=null;nextId=1;tick=0;manualAim=null;
  Object.keys(cooldowns).forEach(k=>cooldowns[k]=0);
  const kinds=['wretch','wretch','archer','wretch','brute','archer','wretch','wretch','brute','archer','wretch','brute'];
  kinds.forEach((kind,i)=>spawn(kind,i<4?encounterPoint(i):null));
  ui.boss.hidden=true;
  ui.title.textContent='净化灰烬边境';ui.progress.textContent='击败 12 名徘徊者以唤醒失名者';
  updateHud();
}
function spawn(kind,location=null) {
  const p=location||randomPoint();
  const run=profile.clears, lv=profile.level;
  const b=kind==='boss', brute=kind==='brute', archer=kind==='archer';
  const maxHp=(b?550:brute?95:archer?50:64)*(1+run*.22+Math.max(0,lv-1)*.055);
  const e={id:nextId++,x:p.x,y:p.y,kind,hp:maxHp,maxHp,speed:b?105:brute?84:archer?112:130,
    radius:b?39:brute?24:17,attack:rng()*1.5,slow:0,phase:rng()*6.28,blink:0,windup:0};
  enemies.push(e); if(b){boss=e;ui.boss.hidden=false;announce('地窟深处，失名者已经苏醒！',true);}
  return e;
}
function begin() { hideModal(); build(); state='playing'; clearInput(); persist(); }
function clearInput(){keys.clear();pointers.clear();joystick.x=joystick.y=0;joystick.id=null;$('stick').style.transform='';}
function showModal(kind) {
  const previousState=state;
  clearInput();state=kind==='victory'?'victory':kind==='death'?'death':'paused';
  const title=$('modal').querySelector('h1'), lead=$('modal').querySelector('.lead'), paragraphs=$('modal').querySelectorAll('p');
  const main=$('modal-primary'), secondary=$('modal-secondary');
  $('scrim').hidden=false; secondary.hidden=true;
  if(kind==='victory') {
    title.innerHTML='炉心<span>重燃</span>';lead.textContent='灰烬地窟重归寂静。';
    paragraphs[1].textContent='你已战胜空潮领主，金币、装备与经验会随下一次远征保留。新的轮回将带来更强大的敌人。';
    main.textContent='再度深入地窟 →'; main.onclick=begin;
  } else if(kind==='death') {
    title.innerHTML='余烬<span>未熄</span>';lead.textContent='持灯者倒下，火种仍在。';
    paragraphs[1].textContent='角色等级和已拾取的装备将被保留。尝试霜环控制怪群，闪现脱离包围，适时使用药水。';
    main.textContent='重新整备 →';main.onclick=begin;
  } else if(kind==='help') {
    title.innerHTML='操作<span>指南</span>';lead.textContent='移动、瞄准、拾取，开始你的远征。';
    paragraphs[1].textContent='电脑 WASD / 方向键移动，鼠标瞄准，长按左键或数字 1 连发；2 霜环，空格闪现，3 药水，B 打开行囊。手机用左侧摇杆与右侧技能键。靠近光柱自动拾取装备。';
    main.textContent='返回游戏 →';main.onclick=()=>{if(previousState==='intro'){location.reload();return;}if(['victory','death'].includes(previousState)){showModal(previousState);return;}if(previousState==='paused'){showModal('pause');return;}hideModal();state='playing';}; 
  } else {
    title.innerHTML='旅程<span>暂停</span>';lead.textContent='火种不灭，旅途未完。';
    paragraphs[1].textContent='当前角色将自动保存。装备与经验在失败后保留，你可以在行囊中导出备份。';
    main.textContent='继续探险 →';main.onclick=()=>{hideModal();state='playing';};
    secondary.textContent='重新进入地窟';secondary.hidden=false;secondary.onclick=begin;
  }
}
function hideModal(){$('scrim').hidden=true;}
function onPause(){ if(!$('inventory').hidden)return; if(state==='playing')showModal('pause');else if(state==='paused'){hideModal();state='playing';} }
$('modal-primary').onclick=begin;
$('btn-pause').onclick=onPause;
$('btn-help').onclick=()=>showModal('help');
function showInventory() {
  if(state==='intro'||state==='victory'||state==='death')return;
  $('inventory').hidden=false;clearInput();renderInventory();
}
$('btn-inventory').onclick=showInventory;
function closeInventory(){$('inventory').hidden=true;clearInput();}
$('inv-close').onclick=closeInventory;
$('inventory').addEventListener('pointerdown',e=>{if(e.target===$('inventory'))closeInventory();});
function renderInventory(){
  const s=stats(profile);
  $('character-stats').innerHTML='<span>等级 <strong>'+profile.level+'</strong></span><span>法术攻击 <strong>'+s.power+'</strong></span><span>生命 <strong>'+s.hp+'</strong></span><span>法力 <strong>'+s.mana+'</strong></span><span>已净化 <strong>'+profile.clears+'</strong></span>';
  const equipment=$('equipment');equipment.replaceChildren();
  for(const [slot,name] of [['weapon','武器'],['robe','法袍'],['charm','护符']]){
    const el=document.createElement('div');el.className='slot';
    const item=profile.inventory.find(i=>i.id===profile.equipped[slot]);
    const a=document.createElement('small'),b=document.createElement('b');a.textContent=name;b.textContent=item?.name||'尚未装备';if(item)b.classList.add('rarity-'+item.rarity);el.append(a,b);equipment.append(el);
  }
  $('bag-count').textContent=profile.inventory.length+' / 30';
  const bag=$('inventory-items');bag.replaceChildren();
  if(!profile.inventory.length){const p=document.createElement('p');p.className='empty';p.textContent='行囊空空。击败怪物，靠近掉落的光芒即可拾取。';bag.append(p);}
  for(const item of [...profile.inventory].sort((a,b)=>b.rarity-a.rarity||b.power-a.power)){
    const el=document.createElement('div');el.className='item';
    const detail=document.createElement('div'),name=document.createElement('strong'),info=document.createElement('small');
    name.className='rarity-'+item.rarity;name.textContent=item.name;
    info.textContent=[item.power?'攻击 +'+item.power:'',item.hp?'生命 +'+item.hp:'',item.mana?'法力 +'+item.mana:''].filter(Boolean).join(' · ');detail.append(name,info);
    const actions=document.createElement('div');actions.className='item-actions';
    const use=document.createElement('button');const worn=profile.equipped[item.slot]===item.id;
    use.textContent=worn?'已装备':'装备';use.disabled=worn;
    use.onclick=()=>{const old=stats(profile);equip(profile,item.id);const now=stats(profile);if(hero){hero.maxHp=now.hp;hero.maxMana=now.mana;hero.hp=clamp(hero.hp+now.hp-old.hp,1,now.hp);hero.mana=clamp(hero.mana+now.mana-old.mana,0,now.mana);}persist();renderInventory();};
    const recycle=document.createElement('button');recycle.textContent='分解';recycle.disabled=worn;
    recycle.onclick=()=>{salvage(profile,item.id);persist();renderInventory();};
    actions.append(use,recycle);el.append(detail,actions);bag.append(el);
  }
}
$('export-save').onclick=()=>{
  const blob=new Blob([JSON.stringify(profile,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ember-chronicles-2d-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
};
$('import-save').onclick=()=>$('save-file').click();
$('save-file').onchange=async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>500000){alert('文件过大，无法导入。');return;}
  try{
    const raw=JSON.parse(await file.text());
    if(raw?.version!==1 || !Array.isArray(raw.inventory)){alert('存档版本或结构不兼容。');return;}
    const candidate=sanitizeSave(raw);
    if(!confirm('确认导入并覆盖当前 2D 角色？此操作无法撤销，建议先导出原存档。'))return;
    profile=candidate;persist();build();state='playing';closeInventory();announce('角色存档已导入');
  }catch{alert('存档文件解析失败，原存档未被修改。');}
};
function updateHud(){
  if(!hero)return;
  const s=stats(profile), xpNeeded=expRequired(profile.level);
  ui.hp.textContent=Math.ceil(hero.hp);ui.mana.textContent=Math.ceil(hero.mana);
  ui.level.textContent='LV '+String(profile.level).padStart(2,'0');ui.gold.textContent=profile.gold;ui.essence.textContent=profile.essence;
  ui.xp.style.width=(profile.level===60?100:profile.xp/xpNeeded*100)+'%';
  ui.progress.textContent=boss?'击败失名者，夺回余烬炉心': '徘徊者 '+Math.min(kills,total)+' / '+total+' · 靠近掉落自动拾取';
  if(boss){ui.bossHp.style.width=(clamp(boss.hp/boss.maxHp,0,1)*100)+'%';}
  for(const [key,rule] of Object.entries(skillData)){
    const el=document.querySelector('[data-skill="'+key+'"]');
    const ratio=clamp(cooldowns[key]/rule.cooldown,0,1);
    el.querySelector('i').style.height=(ratio*100)+'%';el.setAttribute('aria-label',el.querySelector('b').textContent+(ratio>0?' 冷却 '+cooldowns[key].toFixed(1)+' 秒':' 可用'));
  }
}
function puff(x,y,color,count=9,radius=3,speed=150){
  for(let i=0;i<count;i++){const a=rng()*Math.PI*2, v=(.25+rng()*.75)*speed;
    particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.25+rng()*.48,max:.73,color,size:radius*(.5+rng())});}
  if(particles.length>270)particles.splice(0,particles.length-270);
}
function floatText(x,y,value,color='#f1ca90'){texts.push({x,y,text:String(value),color,life:.85});if(texts.length>50)texts.shift();}
function injury(amount){
  if(hero.invuln>0||state!=='playing')return;
  hero.hp=Math.max(0,hero.hp-amount);hero.invuln=.6;puff(hero.x,hero.y,'#e46455',13,4,145);floatText(hero.x,hero.y-30,Math.round(amount),'#ff9990');
  if(hero.hp<=0){persist();showModal('death');announce('持灯者倒下，但成长得以保留',true);}
}
function dealDamage(e,damage){
  e.hp-=damage;floatText(e.x,e.y-35,Math.round(damage));puff(e.x,e.y,e.kind==='boss'?'#c88ae2':'#eaa161',6,3);
  if(e.hp>0)return;
  const i=enemies.indexOf(e);if(i>=0)enemies.splice(i,1);
  puff(e.x,e.y,e.kind==='boss'?'#e89bff':'#e8904b',22,7,240);
  const bossDied=e.kind==='boss';const advanced=gainXp(profile,bossDied?170:22);
  profile.gold+=bossDied?150:3+Math.floor(rng()*9);
  if(advanced){const s=stats(profile);hero.maxHp=s.hp;hero.maxMana=s.mana;hero.hp=s.hp;hero.mana=s.mana;announce('等级提升 · '+profile.level+'级！',true);}
  if(bossDied||rng()<.42)dropItem(e.x,e.y,bossDied);
  if(bossDied){
    boss=null;ui.boss.hidden=true;profile.clears++;persist();
    announce('炉心重燃，地窟净化完成！',true);showModal('victory');
  }else{
    kills++;if(kills>=total&&!boss)spawn('boss',{x:hero.x,y:clamp(hero.y-310,TILE*4,HEIGHT-TILE*3)});
    persist();
  }
}
function dropItem(x,y,rare=false) {
  const item=createItem(rng,profile.level,'ember2d-'+Date.now()+'-'+nextId++);
  if(rare){item.rarity=Math.max(item.rarity,2);item.name=({'weapon':'余烬权杖','robe':'烬纹长袍','charm':'炉心秘印'})[item.slot];}
  drops.push({x,y,item,age:0});floatText(x,y-38,item.name,palette.rare[item.rarity]);
}
function nearest(range=800){let best=null,d=range;for(const e of enemies){const m=distance(hero,e);if(m<d){best=e;d=m;}}return best;}
function cast(skill){
  if(state!=='playing'||!$('inventory').hidden||cooldowns[skill]>0)return;
  if(skill==='fire'){
    let dx=Math.cos(hero.angle),dy=Math.sin(hero.angle);
    if(manualAim && distance(hero,manualAim)>20){
      const a=Math.atan2(manualAim.y-hero.y,manualAim.x-hero.x);dx=Math.cos(a);dy=Math.sin(a);
    }else{const e=nearest();if(e){const a=Math.atan2(e.y-hero.y,e.x-hero.x);dx=Math.cos(a);dy=Math.sin(a);}}
    hero.angle=Math.atan2(dy,dx);hero.cast=.2;cooldowns.fire=.25;
    missiles.push({x:hero.x+dx*24,y:hero.y+dy*24,vx:dx*680,vy:dy*680,life:1.1,kind:'ember',damage:stats(profile).power});
    puff(hero.x+dx*27,hero.y+dy*27,'#fdb073',4,2,90);
  }
  if(skill==='ice'){
    if(hero.mana<30){announce('法力不足');return;}
    hero.mana-=30;cooldowns.ice=5;hero.cast=.35;
    hazards.push({x:hero.x,y:hero.y,r:0,max:190,life:.45,type:'nova'});
    for(const e of [...enemies])if(distance(hero,e)<190){e.slow=3;dealDamage(e,stats(profile).power*1.65);}
    puff(hero.x,hero.y,'#8de4ff',27,4,270);
  }
  if(skill==='blink'){
    if(hero.mana<20){announce('法力不足');return;}
    hero.mana-=20;cooldowns.blink=3.6;hero.invuln=.4;
    const vector=movementVector(), m=Math.hypot(vector.x,vector.y);
    const dx=m>.05?vector.x/m:Math.cos(hero.angle),dy=m>.05?vector.y/m:Math.sin(hero.angle);
    puff(hero.x,hero.y,'#a995ff',22,4,170);
    for(let t=0;t<18;t++)moveWithCollision(hero,dx*950,dy*950,1/60,dungeon,hero.radius);
    puff(hero.x,hero.y,'#c1adff',22,4,170);
  }
  if(skill==='heal'){
    if(hero.hp>=hero.maxHp)return;
    hero.hp=Math.min(hero.maxHp,hero.hp+hero.maxHp*.48);cooldowns.heal=14;
    puff(hero.x,hero.y,'#a6e4aa',22,5,130);floatText(hero.x,hero.y-25,'治愈','#b1edaf');
  }
  updateHud();
}
function movementVector() {
  let x=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+joystick.x;
  let y=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+joystick.y;
  const l=Math.hypot(x,y);return l>1?{x:x/l,y:y/l}:{x,y};
}
function update(dt){
  tick+=dt;
  for(const key in cooldowns)cooldowns[key]=Math.max(0,cooldowns[key]-dt);
  hero.invuln=Math.max(0,hero.invuln-dt);hero.cast=Math.max(0,hero.cast-dt);hero.mana=Math.min(hero.maxMana,hero.mana+dt*7);
  const v=movementVector(), l=Math.hypot(v.x,v.y);
  if(l>.02){moveWithCollision(hero,v.x*250,v.y*250,dt,dungeon,hero.radius);hero.walk+=dt*12;if(!manualAim)hero.angle=Math.atan2(v.y,v.x);}
  if(pointers.size || keys.has('1'))cast('fire');
  for(const e of [...enemies]){
    e.phase+=dt*3;e.attack-=dt;e.slow=Math.max(0,e.slow-dt);
    const dx=hero.x-e.x,dy=hero.y-e.y,d=Math.max(1,Math.hypot(dx,dy));
    const speed=e.speed*(e.slow? .38:1);
    const isRanged=e.kind==='archer', isBoss=e.kind==='boss';
    if(d>(isRanged?310:isBoss?72:34)){
      const vx=dx/d*speed,vy=dy/d*speed;
      moveWithCollision(e,vx,vy,dt,dungeon,e.radius);
      // 避免随机石柱导致怪物长期卡住。
      if(d>250&&e.kind==='boss'&&Math.abs(e.x-WIDTH/2)>800){e.x=clamp(e.x,hero.x-700,hero.x+700);}
    }else if(isRanged&&d<230)moveWithCollision(e,-dx/d*speed*.5,-dy/d*speed*.5,dt,dungeon,e.radius);
    if(e.attack<=0){
      if(isRanged&&d<550){const vx=dx/d*355,vy=dy/d*355;missiles.push({x:e.x,y:e.y,vx,vy,kind:'shadow',life:2.1,damage:9+profile.clears*2});e.attack=2.3+rng()*.5;}
      else if(isBoss&&d<520){
        const a=Math.atan2(dy,dx);
        for(let k=-2;k<=2;k++){const t=a+k*.19;missiles.push({x:e.x,y:e.y,vx:Math.cos(t)*330,vy:Math.sin(t)*330,kind:'void',life:2.0,damage:13+profile.clears*3});}
        hazards.push({x:e.x,y:e.y,r:0,max:90,life:.6,type:'void'});e.attack=2.3;
      }else if(!isRanged&&!isBoss&&d<e.radius+hero.radius+17){injury(e.kind==='brute'?16+profile.clears*2:8+profile.clears*2);e.attack=e.kind==='brute'?1.45:1.0;}
      else if(isBoss&&d<90){injury(19+profile.clears*3);e.attack=1.35;}
    }
  }
  for(const m of [...missiles]){
    m.x+=m.vx*dt;m.y+=m.vy*dt;m.life-=dt;
    if(m.life<=0||!walkable(m.x,m.y,7,dungeon)){missiles.splice(missiles.indexOf(m),1);continue;}
    if(m.kind==='ember'){
      const e=enemies.find(q=>distance(q,m)<q.radius+11);
      if(e){dealDamage(e,m.damage);puff(m.x,m.y,'#ffba6e',10,3);missiles.splice(missiles.indexOf(m),1);}
    }else if(distance(hero,m)<hero.radius+9){injury(m.damage);puff(m.x,m.y,'#a28ae2',9,3);missiles.splice(missiles.indexOf(m),1);}
  }
  for(const d of [...drops]){
    d.age+=dt;
    if(distance(hero,d)<58){
      if(profile.inventory.length>=30){if(d.age<dt*2)announce('背包已满，请在行囊分解装备');continue;}
      profile.inventory.push(d.item);drops.splice(drops.indexOf(d),1);
      puff(d.x,d.y,palette.rare[d.item.rarity],16,3,100);announce('拾取 · '+d.item.name,true);persist();
    }
  }
  for(const p of [...particles]){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-dt*2;p.vy*=1-dt*2;p.life-=dt;if(p.life<=0)particles.splice(particles.indexOf(p),1);}
  for(const f of [...texts]){f.y-=dt*36;f.life-=dt;if(f.life<=0)texts.splice(texts.indexOf(f),1);}
  for(const h of [...hazards]){h.life-=dt;h.r+=(h.max-h.r)*dt*13;if(h.life<=0)hazards.splice(hazards.indexOf(h),1);}
  updateHud();
}
function floorDraw(){ Art.floor(ctx,cam,vw,vh,WIDTH,HEIGHT,tick); }
function stoneDraw(b){ Art.pillar(ctx,b); }
function torchDraw(t){ Art.torch(ctx,t); }
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function enemyDraw(e){ Art.enemy(ctx,e,tick); }
function heroDraw(){ Art.hero(ctx,hero,tick); }
function missileDraw(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(Math.atan2(m.vy,m.vx));
  if(m.kind==='ember'){
    const g=ctx.createRadialGradient(0,0,2,0,0,25);g.addColorStop(0,'#fff3c9');g.addColorStop(.3,'#ffb65a');g.addColorStop(1,'#ef5f1800');
    ellipse(-12,0,25,13,'#e65d1840');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,25,0,7);ctx.fill();ellipse(0,0,7,5,'#ffead2');
  }else{ellipse(0,0,m.kind==='void'?12:9,7,m.kind==='void'?'#d88bef':'#978dcc');ellipse(-8,0,12,4,'#8c66b388');}
  ctx.restore();
}
function render(){
  if(!hero){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#121b22';ctx.fillRect(0,0,vw,vh);return;}
  cam.x=clamp(hero.x-vw/2,0,Math.max(0,WIDTH-vw));
  cam.y=clamp(hero.y-vh/2,0,Math.max(0,HEIGHT-vh));
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,vw,vh);
  ctx.save();ctx.translate(-cam.x,-cam.y);
  floorDraw();
  Art.scenery(ctx,cam,vw,vh,WIDTH,HEIGHT,tick);
  // Painter's order: stonework and props occlude actors when they stand behind them.
  const layers=[];
  for(const b of dungeon.blocks)if(b.x+b.w>cam.x-160&&b.x<cam.x+vw+160&&b.y+b.h>cam.y-150&&b.y<cam.y+vh+160)
    layers.push({y:b.y+b.h+9,render:()=>stoneDraw(b)});
  for(const t of dungeon.torches)if(t.x>cam.x-160&&t.x<cam.x+vw+160&&t.y>cam.y-160&&t.y<cam.y+vh+160)
    layers.push({y:t.y+13,render:()=>torchDraw(t)});
  for(const d of drops)layers.push({y:d.y+7,render:()=>Art.loot(ctx,d,tick)});
  for(const e of enemies)layers.push({y:e.y+10,render:()=>enemyDraw(e)});
  layers.push({y:hero.y+10,render:heroDraw});
  layers.sort((a,b)=>a.y-b.y);
  for(const layer of layers)layer.render();
  for(const m of missiles)missileDraw(m);
  for(const h of hazards){ctx.strokeStyle=h.type==='nova'?'#9bdffcaa':'#ad72d18c';ctx.lineWidth=h.type==='nova'?9:4;ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,7);ctx.stroke();}
  for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ellipse(p.x,p.y,p.size,p.size,p.color);}ctx.globalAlpha=1;
  ctx.font='bold 15px system-ui';ctx.textAlign='center';for(const f of texts){ctx.globalAlpha=clamp(f.life,0,1);ctx.fillStyle='#000b';ctx.fillText(f.text,f.x+1,f.y+2);ctx.fillStyle=f.color;ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;ctx.restore();
  // 环境暗角在 Canvas 内绘制，移动端同样清晰。
  const vign=ctx.createRadialGradient(vw/2,vh/2,Math.min(vw,vh)*.15,vw/2,vh/2,Math.max(vw,vh)*.75);
  vign.addColorStop(0,'#080c1100');vign.addColorStop(1,'#04050988');ctx.fillStyle=vign;ctx.fillRect(0,0,vw,vh);
  if(++frameIndex%5===0)drawMinimap();
}
function drawMinimap(){
  const w=150,h=112;minimap.clearRect(0,0,w,h);minimap.fillStyle='#101921';minimap.fillRect(0,0,w,h);
  const sx=w/WIDTH,sy=h/HEIGHT;minimap.fillStyle='#58636a';
  for(const b of dungeon.blocks)minimap.fillRect(b.x*sx,b.y*sy,Math.max(1,b.w*sx),Math.max(1,b.h*sy));
  for(const e of enemies){minimap.fillStyle=e.kind==='boss'?'#ef8ec7':'#bb695e';minimap.fillRect(e.x*sx-1,e.y*sy-1,e.kind==='boss'?5:3,e.kind==='boss'?5:3);}
  minimap.fillStyle='#fff2a9';minimap.beginPath();minimap.arc(hero.x*sx,hero.y*sy,3,0,7);minimap.fill();
  minimap.strokeStyle='#bd9457';minimap.strokeRect(cam.x*sx,cam.y*sy,vw*sx,vh*sy);
}
function loop(now){
  const dt=Math.min(.04,(now-last)/1000 || .016);last=now;
  if(state==='playing'&&$('inventory').hidden)update(dt);
  render();requestAnimationFrame(loop);
}
function aimAt(clientX,clientY) {
  manualAim={x:clientX+cam.x,y:clientY+cam.y};
  hero.angle=Math.atan2(manualAim.y-hero.y,manualAim.x-hero.x);
}
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&hero)aimAt(e.clientX,e.clientY);});
canvas.addEventListener('pointerdown',e=>{if(state!=='playing'||e.pointerType!=='mouse'||e.button!==0)return;aimAt(e.clientX,e.clientY);pointers.add(e.pointerId);cast('fire');});
window.addEventListener('pointerup',e=>pointers.delete(e.pointerId));
window.addEventListener('pointercancel',e=>pointers.delete(e.pointerId));
for(const button of document.querySelectorAll('[data-skill]')){
  const skill=button.dataset.skill;
  button.addEventListener('pointerdown',e=>{
    e.preventDefault();if(state!=='playing')return;
    button.setPointerCapture(e.pointerId);
    if(skill==='fire'){manualAim=null;pointers.add(e.pointerId);}
    cast(skill);
  });
  const release=e=>pointers.delete(e.pointerId);
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);
}
window.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;
  if(['INPUT','TEXTAREA'].includes(tag)||e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
  if(k==='escape'){if(!$('inventory').hidden)closeInventory();else onPause();return;}
  if(k==='b'){if(!$('inventory').hidden)closeInventory();else showInventory();return;}
  if(state!=='playing'||!$('inventory').hidden)return;
  keys.add(k);
  if(!e.repeat){if(k==='1'){manualAim=null;cast('fire');}if(k==='2')cast('ice');if(k==='3')cast('heal');if(k===' ')cast('blink');}
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(state==='playing'&&$('inventory').hidden)showModal('pause');}});
const base=$('joystick'),stick=$('stick');
function joyMove(e){
  if(joystick.id!==e.pointerId)return;
  const r=base.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  const dx=e.clientX-cx,dy=e.clientY-cy,dist=Math.hypot(dx,dy)||1;
  const radius=(r.width-42)/2,factor=Math.min(1,dist/radius);
  joystick.x=dx/dist*factor;joystick.y=dy/dist*factor;
  stick.style.transform='translate('+joystick.x*radius+'px,'+joystick.y*radius+'px)';
}
base.addEventListener('pointerdown',e=>{if(state!=='playing'||joystick.id!==null)return;e.preventDefault();joystick.id=e.pointerId;base.setPointerCapture(e.pointerId);joyMove(e);});
base.addEventListener('pointermove',joyMove);
function joyEnd(e){if(e.pointerId!==joystick.id)return;joystick.id=null;joystick.x=joystick.y=0;stick.style.transform='';}
base.addEventListener('pointerup',joyEnd);base.addEventListener('pointercancel',joyEnd);
window.addEventListener('contextmenu',e=>{if(e.target===canvas)e.preventDefault();});
build();state='intro';requestAnimationFrame(loop);
