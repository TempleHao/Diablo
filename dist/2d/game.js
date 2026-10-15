import * as Art from './art.js';
import {createMazeWorld,roomAt,roomCenter,enterRoom,drawMazeWalls,drawExplorationFog} from './maze-world.js';
import {MATERIALS,sanitizeMaterials,dismantle,dismantleAll,autoDismantleDrop,canTemper,temper,temperCost} from './crafting.js';
import { BOSS_POOLS, rollBossRewards } from './boss-loot.js';
import {ensureWorldState,restoreWorldExploration,rememberRoomProgress} from './world-progress.js';
import {destinationOptions,pickRandomDestination,validateDestination,startDestinationExpedition} from './travel.js';
import { SLOTS, SLOT_IDS, MAX_ITEMS, AFFIXES, RARITIES, SKILLS, SETS, REGION_DATA, formatAffixes, makeLoot, itemScore } from './systems.js';
import { TILE, WIDTH, HEIGHT, START, SAVE_KEY, clamp, distance, mulberry32, makeDungeon, walkable, moveWithCollision, freshSave, sanitizeSave, stats, expRequired, gainXp, createItem, equip, salvage, upgradeSkill } from './core.js';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d'), minimap = $('minimap').getContext('2d');
const ui = { hp: $('hp-num'), mana: $('mana-num'), level: $('level'), xp: $('xp-fill'), gold: $('gold'), essence: $('essence'),
  boss: $('boss-ui'), bossHp: $('boss-meter'), title: $('quest-title'), progress: $('quest-progress'), log: $('eventlog') };
const skillData = SKILLS;
const ACTIVE_LIMIT=7;
const keys = new Set(), pointers = new Set(), joystick = { id:null, x:0, y:0 };
let vw = 0, vh = 0, dpr = 1, cam = {x:0,y:0}, profile, dungeon, rng, hero;
let enemies = [], missiles = [], drops = [], particles = [], texts = [], hazards = [], state = 'intro', tick = 0, last = 0;
let kills = 0, total = 12, boss = null, frameIndex = 0, nextId = 1, manualAim = null, messageTimes = new Map();
const enemyWaves=(region)=> {
  const types=REGION_DATA[region].types;
  return [types,types.slice().reverse(),[types[2],types[0],types[3],types[1]]];
};
const cooldowns=Object.fromEntries(Object.keys(SKILLS).map(k=>[k,0]));
let armorUntil=0, wardHp=0, combo=0, bossDefeated=false, portal=null, selectedItemId=null;
let currentRoom=null,enteredRooms=new Set(),expedition=null;
const worldWidth=()=>dungeon?.width??WIDTH,worldHeight=()=>dungeon?.height??HEIGHT;
const palette = { stone:'#262d34', stoneEdge:'#11171e', gold:'#e5b777', ice:'#91dcfa', fire:'#ff9a57', rare:['#B7B7B7','#3293FF','#AF5CFF','#FF8928','#D8AA53'] };
try { profile = sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch { profile = freshSave(); }
function renderSkillBar(){
  const bar=$('abilitybar');bar.replaceChildren();
  for(const key of profile.activeSkills){
    const meta=SKILLS[key];if(!meta)continue;
    const button=document.createElement('button');button.type='button';button.dataset.skill=key;
    button.className='skill-'+meta.school;
    const icon=document.createElement('span');icon.className='ability-icon';icon.textContent=meta.icon;
    const label=document.createElement('b');label.textContent=meta.name;
    const shortcut=document.createElement('small');shortcut.textContent=meta.key+' · '+(meta.mana?meta.mana+' 法力':'即时');
    const cooldown=document.createElement('i');button.append(icon,label,shortcut,cooldown);bar.append(button);
  }
}
renderSkillBar();
const regionSelect=$('region-select');
REGION_DATA.forEach((region,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=region.name;regionSelect.append(option);});
regionSelect.value=String(profile.region);
regionSelect.addEventListener('change',()=>{
  const next=Number(regionSelect.value);
  if(next===profile.region)return;
  if(state==='playing'&&!confirm('切换区域将重新开始当前远征。角色装备与进度不会丢失，继续吗？')){
    regionSelect.value=String(profile.region);return;
  }
  startDestinationExpedition(profile,next);build();persist();if(state==='victory'||state==='death')state='intro';
  announce('已进入 '+REGION_DATA[next].name+' · 新远征已生成',true);
});

const portalOptions=$('portal-destination');
for(const {index,name} of destinationOptions(profile.region).destinations){
  const option=document.createElement('option');option.value=String(index);option.textContent=name;portalOptions.append(option);
}
function openPortalMenu(){
  if(!bossDefeated||!portal||state!=='playing')return false;
  clearInput();$('portal-panel').hidden=false;$('portal-open').hidden=true;
  $('portal-destination').value=String(destinationOptions(profile.region).next);
  return true;
}
function closePortalMenu(){$('portal-panel').hidden=true;$('portal-open').hidden=!bossDefeated;clearInput();}
function travelTo(region){
  if(!bossDefeated||!validateDestination(region))return false;
  closePortalMenu();
  startDestinationExpedition(profile,region);
  build();persist();announce('传送抵达 '+REGION_DATA[region].name+' · 新的远征开始',true);
  return true;
}
$('portal-open').onclick=openPortalMenu;
$('portal-stay').onclick=closePortalMenu;
$('portal-next').onclick=()=>travelTo(Number($('portal-destination').value));
$('portal-random').onclick=()=>travelTo(pickRandomDestination(rng,profile.region));

function updateTownSummary(){
  $('town-region').textContent=REGION_DATA[profile.region].name;
  $('town-visits').textContent=String(profile.regionVisits[profile.region]||0);
  $('town-loot').textContent=String(profile.pendingLoot.length);
  $('town-boss-kills').textContent=String(profile.bossKills[profile.region]||0);
}
function enterTown(){
  if(!hero||state==='intro'||state==='death')return false;
  $('inventory').hidden=true;$('portal-panel').hidden=true;$('portal-open').hidden=true;
  clearInput();persist();updateTownSummary();$('town-panel').hidden=false;state='town';
  announce('已返回余烬营地 · 当前远征已保存',true);
  return true;
}
function resumeFromTown(){
  if($('town-panel').hidden)return false;
  $('town-panel').hidden=true;state='playing';$('portal-open').hidden=!bossDefeated;clearInput();
  announce('继续 '+REGION_DATA[profile.region].name+' 的远征',true);
  return true;
}
function refarmFromTown(){
  if($('town-panel').hidden)return false;
  startDestinationExpedition(profile,profile.region);
  $('town-panel').hidden=true;build();persist();state='playing';clearInput();
  announce(REGION_DATA[profile.region].name+' · 新迷宫已生成',true);
  return true;
}
$('btn-town').onclick=enterTown;
$('portal-town').onclick=enterTown;
$('town-resume').onclick=resumeFromTown;
$('town-refarm').onclick=refarmFromTown;
$('portal-panel').addEventListener('pointerdown',e=>{if(e.target===$('portal-panel'))closePortalMenu();});

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
function randomPoint(minDist=260){
  for(let n=0;n<250;n++){
    const sample=dungeon.roomSpawns[Math.floor(rng()*dungeon.roomSpawns.length)];
    if(sample.roomId===dungeon.layout.entrance||sample.roomId===dungeon.layout.boss)continue;
    const x=sample.x+(rng()-.5)*190,y=sample.y+(rng()-.5)*190;
    if(distance({x,y},hero)<minDist||!walkable(x,y,28,dungeon))continue;
    return {x,y};
  }
  const sample=dungeon.roomSpawns.find(p=>p.roomId!==dungeon.layout.entrance)||dungeon.roomSpawns[0];
  return {x:sample.x,y:sample.y};
}
function enterChamber(id){
  if(id===null||id===currentRoom)return;
  currentRoom=id;enterRoom(dungeon,id);
  const chamber=dungeon.layout.rooms.find(r=>r.id===id);
  if(!chamber)return;
  ui.progress.textContent='已探索 '+dungeon.explored.length+' / '+dungeon.layout.rooms.length+' 间房 · 寻找灰烬司祭';
  const wasEntered=enteredRooms.has(id);
  enteredRooms.add(id);
  rememberRoomProgress(expedition,dungeon,enteredRooms);
  persist();
  const c=roomCenter(dungeon,id);
  if(chamber.type==='boss'){
    // A mid-fight reload must not leave an unspawned, unwinnable Boss room.
    if(!bossDefeated&&!boss)spawn('boss',{x:c.x,y:c.y-55});
    return;
  }
  if(wasEntered||chamber.type==='entrance')return;
  if(chamber.type==='treasure'){
    dropItem(c.x+46,c.y-20,true);
    announce('发现封存的战利品密室',true);
  }
  const types=REGION_DATA[profile.region].types;
  const count=chamber.type==='elite'?3:chamber.type==='treasure'?1:2+Math.floor(rng()*2);
  for(let n=0;n<count;n++){
    const kind=chamber.type==='elite'&&n===0?'brute':types[Math.floor(rng()*types.length)];
    const candidate={x:c.x+(n%2?-90:90),y:c.y+(Math.floor(n/2)?75:-75)};
    const point=walkable(candidate.x,candidate.y,32,dungeon)?candidate:{x:c.x,y:c.y};
    const e=spawn(kind,point);
    if(chamber.type==='elite'&&n===0){e.maxHp*=1.7;e.hp=e.maxHp;e.speed*=1.12;e.elite=true;}
  }
  if(chamber.type==='elite')announce('精英密室 · 警惕重型守卫',true);
}
function build() {
  ui.log.replaceChildren();messageTimes.clear();
  const proposedSeed=(20261013+profile.clears*19+profile.region*7919+(profile.regionVisits[profile.region]||0)*104729)>>>0;
  expedition=ensureWorldState(profile,profile.region,proposedSeed);
  const seed=expedition.seed;
  rng=mulberry32(seed);dungeon=createMazeWorld(seed,profile.region);
  restoreWorldExploration(dungeon,expedition);
  const s=stats(profile);
  hero={x:dungeon.start.x,y:dungeon.start.y,radius:17,hp:s.hp,mana:s.mana,maxHp:s.hp,maxMana:s.mana,angle:-Math.PI/2,invuln:0,cast:0,walk:0};
  enemies=[];missiles=[];drops=[];particles=[];texts=[];hazards=[];kills=0;boss=null;nextId=1;tick=0;manualAim=null;
  armorUntil=0;wardHp=0;combo=0;bossDefeated=expedition.bossDefeated;
  portal=bossDefeated?roomCenter(dungeon,dungeon.layout.boss):null;
  currentRoom=null;enteredRooms=new Set(expedition.enteredRooms);
  $('portal-panel').hidden=true;$('portal-open').hidden=!bossDefeated;
  for(const [i,pending] of profile.pendingLoot.entries())if(pending.region===profile.region){
    const fallback={x:dungeon.start.x+(i%3-1)*38,y:dungeon.start.y-45-Math.floor(i/3)*36};
    const saved=Number.isFinite(pending.x)&&Number.isFinite(pending.y)?{x:pending.x,y:pending.y}:fallback;
    const pos=walkable(saved.x,saved.y,17,dungeon)?saved:(walkable(fallback.x,fallback.y,17,dungeon)?fallback:dungeon.start);
    drops.push({...pos,item:pending.item,age:0,persistent:true});
  }
  $('region-select').value=String(profile.region);$('region-name').textContent=REGION_DATA[profile.region].name;
  Object.keys(cooldowns).forEach(k=>cooldowns[k]=0);
  enterChamber(dungeon.layout.entrance);
  ui.boss.hidden=true;
  ui.title.textContent='净化 · '+REGION_DATA[profile.region].name;
  $('map-label').textContent=REGION_DATA[profile.region].label;
  ui.progress.textContent='探索 '+dungeon.layout.rooms.length+' 间房 · 寻找首领圣所';
  updateHud();
}
function spawn(kind,location=null) {
  const p=location||randomPoint();
  const run=profile.clears, lv=profile.level;
  const b=kind==='boss', brute=kind==='brute', archer=['archer','cultist'].includes(kind);
  const maxHp=(b?550:brute?95:archer?50:kind==='spider'?42:64)*(1+run*.22+Math.max(0,lv-1)*.055);
  const e={id:nextId++,x:p.x,y:p.y,kind,hp:maxHp,maxHp,speed:b?105:brute?84:archer?112:kind==='spider'?172:130,
    radius:b?39:brute?24:17,attack:rng()*1.5,slow:0,phase:rng()*6.28,blink:0,windup:0};
  enemies.push(e); if(b){boss=e;ui.boss.hidden=false;ui.boss.querySelector('span').textContent=BOSS_POOLS[profile.region].name;announce('地窟深处，'+BOSS_POOLS[profile.region].name+'已苏醒！',true);}
  return e;
}
function begin() { hideModal(); build(); state='playing'; clearInput(); persist(); announce('第 1 波 · 地窟徘徊者',true); }
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
    paragraphs[1].textContent='WASD 移动，鼠标瞄准，左键或数字 1 余烬箭；2 霜环、3 冰晶箭、4 冰甲、Q 陨火、空格闪现、E 恢复药剂。B 打开 13 槽装备与词缀背包。手机使用摇杆和技能按钮。靠近光柱自动拾取。';
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
  if(state==='intro'||state==='victory'||state==='death'||state==='town'||!$('portal-panel').hidden)return;
  $('inventory').hidden=false;$('portal-open').hidden=true;clearInput();renderInventory();
}
$('btn-inventory').onclick=showInventory;
function closeInventory(){$('inventory').hidden=true;$('portal-open').hidden=!bossDefeated;clearInput();}
$('inv-close').onclick=closeInventory;
$('inventory').addEventListener('pointerdown',e=>{if(e.target===$('inventory'))closeInventory();});
function applyEquipmentChange(operate){
  const old=stats(profile);operate();const now=stats(profile);
  if(hero){
    hero.maxHp=now.hp;hero.maxMana=now.mana;
    hero.hp=clamp(hero.hp+now.hp-old.hp,1,now.hp);
    hero.mana=clamp(hero.mana+now.mana-old.mana,0,now.mana);
  }
  persist();renderInventory();updateHud();
}
function refreshCraftingPanel(){
  const sel=$('auto-salvage');
  sel.value=String(profile.autoSalvage);
  const wallet=$('material-wallet');wallet.replaceChildren();
  for(const [key,meta] of Object.entries(MATERIALS)){
    const label=document.createElement('div');
    label.className='material-token '+key;
    const name=document.createElement('span');name.textContent=meta.label;
    const count=document.createElement('strong');count.textContent=String(profile.materials[key]||0);
    label.append(name,count);wallet.append(label);
  }
}
$('auto-salvage').onchange=()=>{
  profile.autoSalvage=Number($('auto-salvage').value);
  persist();renderInventory();
  announce(profile.autoSalvage<0?'自动分解已关闭':'自动分解已开启：仅自动回收选择的低品质装备',true);
};
$('salvage-bag').onclick=()=>{
  if(profile.autoSalvage<0){announce('请先选择自动分解品质范围',true);return;}
  const eligible=profile.inventory.filter(i=>i.rarity<=profile.autoSalvage&&!i.favorite&&!i.setId&&!Object.values(profile.equipped).includes(i.id));
  if(!eligible.length){announce('没有符合自动分解规则的物品',true);return;}
  if(!confirm('确认分解 '+eligible.length+' 件低品质装备？已装备、已收藏、传奇、暗金遗珍与套装标签装备会保留。'))return;
  const results=dismantleAll(profile);
  if(results.some(x=>x.item.id===selectedItemId))selectedItemId=null;
  persist();renderInventory();
  announce('批量分解完成 · '+results.length+' 件，结晶已入材料袋',true);
};
$('inv-temper').onclick=()=>{
  if(!selectedItemId||!canTemper(profile,selectedItemId))return;
  const item=profile.inventory.find(x=>x.id===selectedItemId),cost=temperCost(item);
  const ok=confirm('花费 '+cost.gold+' 金币 / '+cost.dust+' 粉尘 / '+cost.crystal+' 结晶 / '+cost.core+' 传奇余烬，永久提高 '+item.name+' 的第一条词缀？');
  if(!ok)return;
  if(temper(profile,selectedItemId)){
    persist();renderInventory();announce('装备淬炼成功 · 词缀获得强化',true);
  }
};
function inspectItem(item){
  const panel=$('item-inspect');panel.replaceChildren();
  if(!item){panel.textContent='选择装备可查看详细属性、套装效果与实际穿戴增减。';$('inv-quick-equip').disabled=true;$('inv-quick-equip').textContent='选择装备后点击穿戴';$('inv-temper').disabled=true;$('temper-cost').textContent='低品质物品分解后可在这里使用材料淬炼装备。';return;}
  const title=document.createElement('h3');title.className='rarity-'+item.rarity;title.textContent=item.name;
  const meta=document.createElement('small');meta.textContent=RARITIES[item.rarity]+' · 需求等级 '+(item.requiredLevel||item.ilvl)+' · '+(item.part||SLOTS.find(s=>s[0]===item.slot)?.[1])+(item.subtype?' / '+item.subtype:'')+(item.catalogId?' · '+item.catalogId:'');
  const preview=document.createElement('canvas');preview.className='item-preview';preview.setAttribute('aria-label',item.name+' 装备图标');Art.drawItemIcon(preview,item);
  panel.append(preview,title,meta);
  if(item.preferredClass||item.theme){const origin=document.createElement('small');origin.className='catalog-meta';origin.textContent=(item.preferredClass?'偏好 '+item.preferredClass:'')+(item.theme?' · '+item.theme+'系':'');panel.append(origin);}
  if(item.tempered){const stamp=document.createElement('p');stamp.className='score-up';stamp.textContent='✦ 已淬炼强化';panel.append(stamp);}
  if(item.effectName){
    const effect=document.createElement('section');effect.className='item-effect';
    const effectTitle=document.createElement('strong');effectTitle.textContent='✦ '+item.effectName;
    const effectText=document.createElement('p');effectText.textContent=item.effectDescription;
    effect.append(effectTitle,effectText);
    if(item.drawback){const drawback=document.createElement('p');drawback.className='item-drawback';drawback.textContent='代价 · '+item.drawback;effect.append(drawback);}
    panel.append(effect);
  }
  const list=document.createElement('ul');
  for(const line of formatAffixes(item)){const li=document.createElement('li');li.textContent=line;list.append(li);}
  if(!list.childElementCount){const li=document.createElement('li');li.textContent='基础装备 · 无额外词缀';list.append(li);}
  panel.append(list);
  if(item.setId){
    const set=SETS[item.setId],count=Object.values(profile.equipped).map(id=>profile.inventory.find(i=>i.id===id)).filter(i=>i?.setId===item.setId).length;
    const p=document.createElement('p');p.className='set-description';p.textContent=set.name+'（已装备 '+count+'/3） · 2 件：'+set.two+' · 3 件：'+set.three;panel.append(p);
  }
  const target=item.slot.startsWith('ring')?(profile.equipped.ring1?'ring2':'ring1'):item.slot;
  const worn=profile.inventory.find(i=>i.id===profile.equipped[target]);
  const delta=Math.round(itemScore(item)-itemScore(worn||{power:0,hp:0,mana:0,armor:0,affixes:[]}));
  const compare=document.createElement('p');compare.className=delta>=0?'score-up':'score-down';
  compare.textContent='相对当前 '+SLOTS.find(x=>x[0]===target)?.[1]+' · 评分变化 '+(delta>0?'+':'')+delta;
  panel.append(compare);
  if(worn&&worn.id!==item.id){
    const current=document.createElement('p');current.className='current-gear';
    current.textContent='目前装备：'+worn.name;panel.append(current);
  }
  // Show REAL character stat changes, not an ungrounded gear-score alone.
  const alternative={...profile,equipped:{...profile.equipped}};
  equip(alternative,item.id,target);
  const before=stats(profile),after=stats(alternative);
  const keys=[['power','法术强度'],['hp','生命'],['mana','法力'],['armor','护甲'],['crit','暴击率'],['haste','施法速度'],['fire','火焰增伤'],['cold','冰霜增伤']];
  const differences=keys.filter(([key])=>before[key]!==after[key]);
  if(differences.length){
    const heading=document.createElement('h4');heading.textContent='穿戴后属性变化';panel.append(heading);
    const grid=document.createElement('div');grid.className='stat-diff-grid';
    for(const [key,label] of differences){
      const d=after[key]-before[key],line=document.createElement('span');
      line.className=d>=0?'score-up':'score-down';
      line.textContent=label+' '+(d>0?'+':'')+d+(key==='crit'||key==='haste'||key==='fire'||key==='cold'?'%':'');
      grid.append(line);
    }
    panel.append(grid);
  }
  const quick=$('inv-quick-equip');
  const wornHere=Object.values(profile.equipped).includes(item.id);
  quick.disabled=false;
  quick.textContent=wornHere?'卸下 '+item.name:'直接穿戴 '+item.name;
  const cost=temperCost(item);
  $('inv-temper').disabled=!canTemper(profile,item.id);
  $('inv-temper').textContent=item.tempered?'该装备已淬炼':canTemper(profile,item.id)?'用材料淬炼第一条词缀':'材料不足 / 无可淬炼词缀';
  $('temper-cost').textContent='淬炼花费：'+cost.gold+' 金币 + '+cost.dust+' 粉尘 + '+cost.crystal+' 结晶 + '+cost.core+' 传奇余烬（每件仅可淬炼一次）';
  quick.onclick=()=>{
    selectedItemId=item.id;
    applyEquipmentChange(()=>{if(wornHere){
      for(const slot of SLOT_IDS)if(profile.equipped[slot]===item.id)profile.equipped[slot]=null;
    }else equip(profile,item.id,target);});
  };
}
$('inv-filter').onchange=()=>renderInventory();
$('inv-sort').onchange=()=>renderInventory();
function renderInventory(){
  refreshCraftingPanel();
  const statsNow=stats(profile),statFields=[
    ['等级',profile.level],['法术强度',statsNow.power],['生命',statsNow.hp],['法力',statsNow.mana],
    ['护甲',statsNow.armor],['暴击',statsNow.crit+'%'],['施法速度',statsNow.haste+'%'],
    ['火焰加成',statsNow.fire+'%'],['冰霜加成',statsNow.cold+'%'],
    ['火抗',statsNow.resistFire+'%'],['冰抗',statsNow.resistCold+'%'],
    ['未分配技能点',profile.skillPoints],['已净化',profile.clears]
  ];
  const char=$('character-stats');char.replaceChildren();
  for(const [k,v] of statFields){const node=document.createElement('span');const b=document.createElement('strong');node.textContent=k+' ';b.textContent=v;node.append(b);char.append(node);}
  const equipment=$('equipment');equipment.replaceChildren();
  for(const [slot,label,glyph] of SLOTS){
    const node=document.createElement('button');node.type='button';node.className='slot equipment-slot';
    const name=document.createElement('small');name.textContent=glyph+' '+label;const title=document.createElement('b');
    const item=profile.inventory.find(i=>i.id===profile.equipped[slot]);
    title.textContent=item?.name||'空位';if(item)title.classList.add('rarity-'+item.rarity);
    if(item){const icon=document.createElement('canvas');icon.className='equipment-icon';icon.setAttribute('aria-hidden','true');Art.drawItemIcon(icon,item);node.append(icon);}
    node.append(name,title);
    node.onclick=()=>{selectedItemId=item?.id||null;inspectItem(item);};
    node.ondblclick=()=>{if(item){selectedItemId=item.id;applyEquipmentChange(()=>profile.equipped[slot]=null);}};
    equipment.append(node);
  }
  $('bag-count').textContent=profile.inventory.length+' / '+MAX_ITEMS;
  const bag=$('inventory-items');bag.replaceChildren();
  if(!profile.inventory.length){const p=document.createElement('p');p.className='empty';p.textContent='行囊空空。击败怪物并靠近掉落光柱，可获得随机装备和词缀。';bag.append(p);}
  const category=$('inv-filter').value,sort=$('inv-sort').value;
  const visible=profile.inventory.filter(item=>category==='all'||
    (category==='weapon'&&['weapon','offhand'].includes(item.slot))||
    (category==='armor'&&['head','shoulders','robe','gloves','belt','pants','boots'].includes(item.slot))||
    (category==='accessory'&&['amulet','ring1','ring2','charm'].includes(item.slot)));
  visible.sort(sort==='score'?(a,b)=>itemScore(b)-itemScore(a):
    sort==='level'?(a,b)=>b.ilvl-a.ilvl:(a,b)=>0);
  if(sort==='rarity')visible.sort((a,b)=>b.rarity-a.rarity||b.ilvl-a.ilvl);
  for(const item of visible){
    const node=document.createElement('div');node.className='item'+(selectedItemId===item.id?' is-selected':'');
    const detail=document.createElement('button');detail.type='button';detail.className='item-detail';
    const title=document.createElement('strong');title.className='rarity-'+item.rarity;title.textContent=item.name;
    const desc=document.createElement('small');desc.textContent=RARITIES[item.rarity]+' · '+SLOTS.find(s=>s[0]===item.slot)?.[1]+' · '+(item.affixes?.length||0)+' 条词缀';
    const img=document.createElement('canvas');img.className='item-thumbnail';img.setAttribute('aria-hidden','true');Art.drawItemIcon(img,item);
    const labels=document.createElement('span');labels.className='item-labels';labels.append(title,desc);
    detail.append(img,labels);detail.onclick=()=>{selectedItemId=item.id;renderInventory();};
    detail.ondblclick=()=>{selectedItemId=item.id;applyEquipmentChange(()=>equip(profile,item.id,
      item.slot.startsWith('ring')?(!profile.equipped.ring1?'ring1':!profile.equipped.ring2?'ring2':item.slot):null));};
    const actions=document.createElement('div');actions.className='item-actions';
    const worn=Object.values(profile.equipped).includes(item.id);
    const use=document.createElement('button');use.textContent=worn?'已装备':'装备';use.disabled=worn;
    use.onclick=()=>{selectedItemId=item.id;applyEquipmentChange(()=>equip(profile,item.id,
      item.slot.startsWith('ring')?(!profile.equipped.ring1?'ring1':!profile.equipped.ring2?'ring2':item.slot):null));};
    const favorite=document.createElement('button');favorite.textContent=item.favorite?'★ 保留':'☆ 收藏';
    favorite.setAttribute('aria-label',item.favorite?'取消保留 '+item.name:'保护 '+item.name);
    favorite.onclick=()=>{item.favorite=!item.favorite;persist();renderInventory();};
    const recycle=document.createElement('button');recycle.textContent='分解';recycle.disabled=worn||item.favorite;
    recycle.onclick=()=>{if(selectedItemId===item.id)selectedItemId=null;applyEquipmentChange(()=>dismantle(profile,item.id));};
    actions.append(use,favorite,recycle);node.append(detail,actions);bag.append(node);
  }
  inspectItem(profile.inventory.find(i=>i.id===selectedItemId)||null);
  const skillPanel=$('skill-catalog');skillPanel.replaceChildren();
  for(const [key,skill] of Object.entries(SKILLS)){
    const btn=document.createElement('button');btn.type='button';
    const rank=profile.skillRanks[key]||0,locked=profile.level<skill.unlocked;
    btn.className='catalog-skill '+(locked?'unavailable':'');
    btn.textContent=skill.icon+' '+skill.name+' · 等级 '+rank+'/8 · '+skill.desc+
      (locked?'（'+skill.unlocked+' 级解锁）':profile.skillPoints>0&&rank<8?' · 点击升级':'');
    btn.disabled=locked||profile.skillPoints<=0||rank>=8;
    btn.onclick=()=>{
      if(upgradeSkill(profile,key)){persist();renderInventory();announce(skill.name+' 已升至 '+profile.skillRanks[key]+' 级',true);}
    };
    const slot=document.createElement('select');slot.className='skill-slot';
    slot.setAttribute('aria-label',skill.name+' 装入快捷栏位置');
    for(let i=0;i<ACTIVE_LIMIT;i++){const opt=document.createElement('option');opt.value=String(i);opt.textContent=(i+1)+' 号位 · '+SKILLS[profile.activeSkills[i]].name;slot.append(opt);}
    if(!profile.activeSkills.includes(key)){
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='加入快捷栏…';
      slot.prepend(placeholder);slot.value='';
    }else slot.value=String(profile.activeSkills.indexOf(key));
    slot.disabled=locked;
    slot.onchange=()=>{
      if(profile.level<skill.unlocked)return;
      if(slot.value==='')return;
      const idx=Number(slot.value),prev=profile.activeSkills.indexOf(key),displaced=profile.activeSkills[idx];
      profile.activeSkills[idx]=key;
      if(prev>=0&&prev!==idx)profile.activeSkills[prev]=displaced;
      persist();renderSkillBar();renderInventory();updateHud();
      announce(skill.name+' 已加入快捷栏',true);
    };
    const cell=document.createElement('div');cell.className='skill-catalog-entry';cell.append(btn,slot);
    skillPanel.append(cell);
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
    if(![1,2].includes(raw?.version) || !Array.isArray(raw.inventory)){alert('存档版本或结构不兼容。');return;}
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
  ui.progress.textContent=boss?'击败 '+BOSS_POOLS[profile.region].name+'，收集专属战利品':bossDefeated?'首领已击败 · 继续拾取装备 / B 查看背包 / 暂停手动重刷':'已探索 '+dungeon.explored.length+'/'+dungeon.layout.rooms.length+' 房 · 寻找首领圣所';
  if(boss){ui.bossHp.style.width=(clamp(boss.hp/boss.maxHp,0,1)*100)+'%';}
  for(const [key,rule] of Object.entries(skillData)){
    const el=document.querySelector('[data-skill="'+key+'"]');
    const ratio=clamp(cooldowns[key]/rule.cooldown,0,1);
    if(!el)continue;
    el.querySelector('i').style.height=(ratio*100)+'%';el.classList.toggle('locked',profile.level<rule.unlocked);el.setAttribute('aria-label',rule.name+(profile.level<rule.unlocked?' '+rule.unlocked+' 级解锁':ratio>0?' 冷却 '+cooldowns[key].toFixed(1)+' 秒':' 可用'));
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
  const defense=stats(profile);
  const mitigated=Math.max(1,amount*(1-Math.min(.6,defense.armor/(defense.armor+200)))*(armorUntil>tick?.44:1));
  const absorbed=Math.min(wardHp,mitigated);wardHp-=absorbed;
  const finalDamage=mitigated-absorbed;
  if(absorbed)floatText(hero.x,hero.y-39,'护盾吸收 '+Math.ceil(absorbed),'#add6ff');
  hero.hp=Math.max(0,hero.hp-finalDamage);hero.invuln=.6;
  puff(hero.x,hero.y,absorbed?'#85bae9':'#e46455',13,4,145);
  if(finalDamage)floatText(hero.x,hero.y-30,Math.round(finalDamage),'#ff9990');
  if(hero.hp<=0){persist();showModal('death');announce('持灯者倒下，但成长得以保留',true);}
}
function dealDamage(e,damage,school='physical'){
  if(!enemies.includes(e))return;
  const bonus=stats(profile);
  const bonusDamage=school==='fire'?bonus.fire:school==='cold'?bonus.cold:0;
  damage*=1+bonusDamage/100;
  if(school==='fire')damage*=1+bonus.skillFire*.09;
  if(school==='cold')damage*=1+bonus.skillCold*.09;
  const crit=rng()*100<bonus.crit;if(crit)damage*=1+bonus.critDmg/100;
  if(school==='fire'&&bonus.sets.dragonflame>=3&&++combo%3===0)damage*=1.45;
  damage=Math.max(1,Math.round(damage));
  if(bonus.lifesteal)hero.hp=Math.min(hero.maxHp,hero.hp+bonus.lifesteal);
  e.hp-=damage;floatText(e.x,e.y-35,(crit?'✦ ':'')+damage,crit?'#ffe29b':'#f1ca90');puff(e.x,e.y,e.kind==='boss'?'#c88ae2':'#eaa161',6,3);
  if(e.hp>0)return;
  const i=enemies.indexOf(e);if(i>=0)enemies.splice(i,1);
  puff(e.x,e.y,e.kind==='boss'?'#e89bff':'#e8904b',22,7,240);
  const bossDied=e.kind==='boss';const advanced=gainXp(profile,bossDied?170:22);
  profile.gold+=bossDied?150:3+Math.floor(rng()*9);
  if(advanced){const s=stats(profile);hero.maxHp=s.hp;hero.maxMana=s.mana;hero.hp=s.hp;hero.mana=s.mana;announce('等级提升 · '+profile.level+'级！',true);}
  if(!bossDied&&rng()<.42)dropItem(e.x,e.y,false);
  if(bossDied){
    const region=profile.region,previousKills=profile.bossKills[region]||0;
    const reward=rollBossRewards(rng,profile.level,region,previousKills,()=> 'boss-'+Date.now()+'-'+(nextId++));
    profile.bossKills[region]=previousKills+1;
    profile.essence+=reward.materials;profile.clears++;
    boss=null;bossDefeated=true;expedition.bossDefeated=true;
    portal={x:e.x,y:e.y};ui.boss.hidden=true;$('portal-open').hidden=false;
    for(const [index,item] of reward.drops.entries()){
      const angle=index*2.4,rad=60+index*15;
      const x=e.x+Math.cos(angle)*rad,y=e.y+Math.sin(angle)*rad;
      const point=walkable(x,y,17,dungeon)?{x,y}:{x:e.x,y:e.y};
      drops.push({...point,item,age:0,persistent:true});
      profile.pendingLoot.push({item,region,x:point.x,y:point.y});
      puff(point.x,point.y,palette.rare[item.rarity],23,5,170);
    }
    persist();
    announce((reward.firstKill?'首杀奖励！':'首领战利品！')+' '+reward.drops.length+' 件装备 · '+reward.materials+' 精华'+(reward.exclusive?' · 专属传奇！':''),true);
    ui.title.textContent='首领已击败 · 传送阵已开启';
    ui.progress.textContent='专属奖励已掉落 · 传送阵可选择下一图或随机远征';
  }else{
    kills++;
    // Boss and encounters are triggered by room exploration, not kill quota.
    persist();
  }
}
function dropItem(x,y,rare=false) {
  const item=makeLoot(rng,profile.level,'ember2d-'+Date.now()+'-'+nextId++,{boss:rare});
  drops.push({x,y,item,age:0});floatText(x,y-38,item.name,palette.rare[item.rarity]);
}
function nearest(range=800){let best=null,d=range;for(const e of enemies){const m=distance(hero,e);if(m<d){best=e;d=m;}}return best;}
function cast(skill){
  const rule=SKILLS[skill];
  if(!rule||state!=='playing'||!$('inventory').hidden||!$('portal-panel').hidden||cooldowns[skill]>0||profile.level<rule.unlocked)return;
  if(hero.mana<rule.mana){announce('法力不足');return;}
  if(skill==='heal'&&hero.hp>=hero.maxHp)return;
  const bonus=stats(profile),rank=profile.skillRanks[skill]||0;
  hero.mana-=rule.mana;
  cooldowns[skill]=rule.cooldown*(1-bonus.haste/140)*(1-Math.min(.16,rank*.02));
  hero.cast=.3;
  const target=nearest(),angle=manualAim&&distance(hero,manualAim)>20?
    Math.atan2(manualAim.y-hero.y,manualAim.x-hero.x):target?
    Math.atan2(target.y-hero.y,target.x-hero.x):hero.angle;
  const dx=Math.cos(angle),dy=Math.sin(angle);hero.angle=angle;
  if(skill==='fire'||skill==='shard'){
    const frost=skill==='shard',speed=frost?570:680;
    missiles.push({x:hero.x+dx*25,y:hero.y+dy*25,vx:dx*speed,vy:dy*speed,life:frost?1.2:1.1,
      kind:frost?'shard':'ember',damage:bonus.power*(frost?.82:1)*(1+rank*.13),hits:0,hitIds:new Set()});
    puff(hero.x+dx*27,hero.y+dy*27,frost?'#9bdcf2':'#ffad6e',6,3,100);
  }
  if(skill==='nova'){
    hazards.push({x:hero.x,y:hero.y,r:0,max:196,life:.45,type:'nova'});
    for(const e of [...enemies])if(distance(hero,e)<196){e.slow=3;dealDamage(e,bonus.power*(1.3+rank*.18),'cold');}
    puff(hero.x,hero.y,'#91deff',27,4,270);
  }
  if(skill==='armor'){armorUntil=tick+7+rank*.5;announce('冰甲已激活',true);puff(hero.x,hero.y,'#8bcdf9',22,4,150);}
  if(skill==='meteor'){
    const dest=target||{x:hero.x+dx*220,y:hero.y+dy*220};
    hazards.push({x:dest.x,y:dest.y,r:0,max:125,life:1.0,type:'meteor',triggered:false,rank});
    announce('陨火坠落！',true);
  }
  if(skill==='blink'){
    const v=movementVector(),mag=Math.hypot(v.x,v.y);
    const bx=mag>.05?v.x/mag:dx,by=mag>.05?v.y/mag:dy;
    hero.invuln=.4;puff(hero.x,hero.y,'#aa97ec',21,4,170);
    for(let t=0;t<18;t++)moveWithCollision(hero,bx*(950+rank*85),by*(950+rank*85),1/60,dungeon,hero.radius);
    puff(hero.x,hero.y,'#c8b1fe',21,4,170);
  }
  if(skill==='heal'){hero.hp=Math.min(hero.maxHp,hero.hp+hero.maxHp*(.48+rank*.035));puff(hero.x,hero.y,'#b4eba0',24,5,130);floatText(hero.x,hero.y-25,'治愈','#b1edaf');}
  if(skill==='chain'){
    const candidates=enemies.map(e=>({e,dist:distance(hero,e)})).filter(x=>x.dist<600).sort((a,b)=>a.dist-b.dist);
    let last={x:hero.x,y:hero.y};
    const victims=[];
    for(const {e} of candidates){
      if(victims.length>=3+Math.floor(rank/3))break;
      if(distance(last,e)>390)continue;
      victims.push(e);hazards.push({x:last.x,y:last.y,x2:e.x,y2:e.y,type:'chain',r:0,max:1,life:.22});
      last={x:e.x,y:e.y};
    }
    for(let n=0;n<victims.length;n++)dealDamage(victims[n],bonus.power*(1.2+rank*.12)*Math.pow(.8,n),'arcane');
    if(!victims.length){announce('附近没有连锁目标');puff(hero.x+dx*55,hero.y+dy*55,'#b29eff',14,4,100);}
  }
  if(skill==='storm'){
    const center=target&&distance(hero,target)<520?target:{x:hero.x+dx*190,y:hero.y+dy*190};
    hazards.push({x:center.x,y:center.y,r:120,max:120,life:4,kind:'storm',type:'storm',rank,timer:0});
    announce('冰暴领域已展开',true);
  }
  if(skill==='ward'){
    wardHp=Math.round(24+bonus.hp*(.20+rank*.045));
    puff(hero.x,hero.y,'#b8d7ff',22,5,130);announce('奥术护盾 · 吸收 '+wardHp+' 伤害',true);
  }
  if(skill==='inferno'){
    for(let n=1;n<=5;n++){
      const x=hero.x+dx*n*55,y=hero.y+dy*n*55;
      if(walkable(x,y,10,dungeon))hazards.push({x,y,r:43,max:43,life:4,type:'inferno',rank,timer:0});
    }
    announce('烈焰地径已铺开',true);
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
  hero.invuln=Math.max(0,hero.invuln-dt);hero.cast=Math.max(0,hero.cast-dt);hero.mana=Math.min(hero.maxMana,hero.mana+dt*stats(profile).regen);
  const v=movementVector(), l=Math.hypot(v.x,v.y);
  if(l>.02){moveWithCollision(hero,v.x*250,v.y*250,dt,dungeon,hero.radius);hero.walk+=dt*12;if(!manualAim)hero.angle=Math.atan2(v.y,v.x);}
  enterChamber(roomAt(dungeon,hero.x,hero.y));
  if(portal&&distance(hero,portal)<105&&!$('portal-panel').dataset.suppressed&&state==='playing'&&!boss){$('portal-open').hidden=false;}
  if(pointers.size || keys.has('1'))cast('fire');
  for(const e of [...enemies]){
    e.phase+=dt*3;e.attack-=dt;e.slow=Math.max(0,e.slow-dt);
    const dx=hero.x-e.x,dy=hero.y-e.y,d=Math.max(1,Math.hypot(dx,dy));
    const speed=e.speed*(e.slow? .38:1);
    const isRanged=['archer','cultist'].includes(e.kind), isBoss=e.kind==='boss';
    if(d>(isRanged?310:isBoss?72:34)){
      const vx=dx/d*speed,vy=dy/d*speed;
      moveWithCollision(e,vx,vy,dt,dungeon,e.radius);
      // 避免随机石柱导致怪物长期卡住。
      if(d>250&&e.kind==='boss'&&Math.abs(e.x-WIDTH/2)>800){e.x=clamp(e.x,hero.x-700,hero.x+700);}
    }else if(isRanged&&d<230)moveWithCollision(e,-dx/d*speed*.5,-dy/d*speed*.5,dt,dungeon,e.radius);
    if(e.attack<=0){
      if(isRanged&&d<550){const vx=dx/d*355,vy=dy/d*355;missiles.push({x:e.x,y:e.y,vx,vy,kind:e.kind==='cultist'?'void':'shadow',life:2.1,damage:9+profile.clears*2});e.attack=2.3+rng()*.5;}
      else if(isBoss&&d<520){
        const a=Math.atan2(dy,dx);
        if(e.hp<e.maxHp*.52&&!e.enraged){e.enraged=true;spawn('cultist',randomPoint(160));spawn('spider',randomPoint(160));announce(BOSS_POOLS[profile.region].name+'进入第二阶段！',true);}
        for(let k=e.enraged?-3:-2;k<=(e.enraged?3:2);k++){const t=a+k*.19;missiles.push({x:e.x,y:e.y,vx:Math.cos(t)*330,vy:Math.sin(t)*330,kind:'void',life:2.0,damage:13+profile.clears*3});}
        hazards.push({x:e.x,y:e.y,r:0,max:90,life:.6,type:'void'});e.attack=2.3;
      }else if(!isRanged&&!isBoss&&d<e.radius+hero.radius+17){injury(e.kind==='brute'?16+profile.clears*2:e.kind==='spider'?6+profile.clears*2:8+profile.clears*2);e.attack=e.kind==='brute'?1.45:e.kind==='spider'?.72:1.0;}
      else if(isBoss&&d<90){injury(19+profile.clears*3);e.attack=1.35;}
    }
  }
  for(const m of [...missiles]){
    m.x+=m.vx*dt;m.y+=m.vy*dt;m.life-=dt;
    if(m.life<=0||!walkable(m.x,m.y,7,dungeon)){missiles.splice(missiles.indexOf(m),1);continue;}
    if(m.kind==='ember'||m.kind==='shard'){
      const e=enemies.find(q=>!m.hitIds?.has(q.id)&&distance(q,m)<q.radius+11);
      if(e){
        dealDamage(e,m.damage,m.kind==='shard'?'cold':'fire');
        if(m.kind==='shard')e.slow=Math.max(e.slow,1.5);
        puff(m.x,m.y,m.kind==='shard'?'#b4e9ff':'#ffba6e',10,3);
        m.hitIds?.add(e.id);m.hits=(m.hits||0)+1;
        if(m.kind==='ember'||m.hits>=2)missiles.splice(missiles.indexOf(m),1);
      }
    }else if(distance(hero,m)<hero.radius+9){injury(m.damage);puff(m.x,m.y,'#a28ae2',9,3);missiles.splice(missiles.indexOf(m),1);}
  }
  for(const d of [...drops]){
    d.age+=dt;
    if(distance(hero,d)<58){
      if(!d.persistent&&autoDismantleDrop(profile,d.item)){
        drops.splice(drops.indexOf(d),1);puff(d.x,d.y,'#b7a3db',12,3,90);
        announce('自动分解 · '+d.item.name+' → 粉尘/结晶',true);persist();continue;
      }
      if(profile.inventory.length>=MAX_ITEMS){if(d.age<dt*2)announce('背包已满，请在行囊分解装备');continue;}
      profile.inventory.push(d.item);drops.splice(drops.indexOf(d),1);
      if(d.persistent)profile.pendingLoot=profile.pendingLoot.filter(p=>p.item.id!==d.item.id);
      puff(d.x,d.y,palette.rare[d.item.rarity],16,3,100);announce('拾取 · '+d.item.name,true);persist();
    }
  }
  for(const p of [...particles]){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-dt*2;p.vy*=1-dt*2;p.life-=dt;if(p.life<=0)particles.splice(particles.indexOf(p),1);}
  for(const f of [...texts]){f.y-=dt*36;f.life-=dt;if(f.life<=0)texts.splice(texts.indexOf(f),1);}
  for(const h of [...hazards]){
    h.life-=dt;h.r+=(h.max-h.r)*dt*13;
    if(h.type==='meteor'&&!h.triggered&&h.life<.25){
      h.triggered=true;puff(h.x,h.y,'#ff9146',50,8,280);
      for(const e of [...enemies])if(distance(e,h)<125)dealDamage(e,stats(profile).power*(2.8+(h.rank||0)*.36),'fire');
    }
    if((h.type==='storm'||h.type==='inferno')&&h.life>0){
      h.timer-=dt;
      if(h.timer<=0){
        h.timer=.55;
        for(const e of [...enemies]){
          if(distance(e,h)>h.max+e.radius)continue;
          if(h.type==='storm')e.slow=Math.max(e.slow,1.05);
          dealDamage(e,stats(profile).power*(h.type==='storm'?.31:.42)*(1+(h.rank||0)*.12),h.type==='storm'?'cold':'fire');
        }
      }
    }
    if(h.life<=0)hazards.splice(hazards.indexOf(h),1);
  }
  updateHud();
}
function floorDraw(){ Art.floor(ctx,cam,vw,vh,worldWidth(),worldHeight(),tick,profile.region,dungeon.seed); }
function stoneDraw(b){ Art.pillar(ctx,b); }
function torchDraw(t){ Art.torch(ctx,t); }
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function enemyDraw(e){ Art.enemy(ctx,e,tick); }
function heroDraw(){
  const worn={};for(const [slot,id] of Object.entries(profile.equipped))worn[slot]=profile.inventory.find(x=>x.id===id)||null;
  Art.hero(ctx,hero,tick,worn);
  if(wardHp>0){ctx.strokeStyle='#93cdffb5';ctx.lineWidth=3;ctx.shadowBlur=12;ctx.shadowColor='#a2d5ff';ctx.beginPath();ctx.ellipse(hero.x,hero.y-49,32,60,0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
}
function missileDraw(m){
  ctx.save();ctx.translate(m.x,m.y);ctx.rotate(Math.atan2(m.vy,m.vx));
  if(m.kind==='ember'||m.kind==='shard'){
    const ice=m.kind==='shard';
    const g=ctx.createRadialGradient(0,0,2,0,0,25);g.addColorStop(0,'#f6f5ff');g.addColorStop(.3,ice?'#8de2fc':'#ffb65a');g.addColorStop(1,ice?'#2d6d9c00':'#ef5f1800');
    ellipse(-12,0,25,13,'#e65d1840');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,25,0,7);ctx.fill();ellipse(0,0,7,5,'#ffead2');
  }else{ellipse(0,0,m.kind==='void'?12:9,7,m.kind==='void'?'#d88bef':'#978dcc');ellipse(-8,0,12,4,'#8c66b388');}
  ctx.restore();
}
function drawPortal(p){
  const pulse=Math.sin(tick*2.7)*4;
  ctx.save();ctx.translate(p.x,p.y);
  ctx.shadowBlur=22;ctx.shadowColor='#8bc4f4';
  ctx.strokeStyle='#85bceaaa';ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(0,8,78+pulse,31+pulse/3,0,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#f2c88bd5';ctx.lineWidth=2;
  for(let n=0;n<8;n++){const a=n*Math.PI/4+tick*.14;ctx.beginPath();ctx.moveTo(Math.cos(a)*56,8+Math.sin(a)*23);ctx.lineTo(Math.cos(a)*70,8+Math.sin(a)*29);ctx.stroke();}
  ctx.fillStyle='#70bdf132';ctx.beginPath();ctx.ellipse(0,7,64,23,0,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;ctx.textAlign='center';ctx.font='bold 16px system-ui';ctx.strokeStyle='#07111ce8';ctx.lineWidth=4;ctx.strokeText('✦ 地图传送阵 ✦',0,-65);ctx.fillStyle='#f4d19b';ctx.fillText('✦ 地图传送阵 ✦',0,-65);ctx.restore();
}
function render(){
  if(!hero){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#121b22';ctx.fillRect(0,0,vw,vh);return;}
  cam.x=clamp(hero.x-vw/2,0,Math.max(0,worldWidth()-vw));
  cam.y=clamp(hero.y-vh/2,0,Math.max(0,worldHeight()-vh));
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,vw,vh);
  ctx.save();ctx.translate(-cam.x,-cam.y);
  floorDraw();
  drawMazeWalls(ctx,dungeon,cam,vw,vh);
  Art.scenery(ctx,cam,vw,vh,worldWidth(),worldHeight(),tick,profile.region,dungeon.seed);
  // Painter's order: stonework and props occlude actors when they stand behind them.
  const layers=[];
  for(const b of dungeon.blocks)if(b.x+b.w>cam.x-160&&b.x<cam.x+vw+160&&b.y+b.h>cam.y-150&&b.y<cam.y+vh+160)
    layers.push({y:b.y+b.h+9,render:()=>stoneDraw(b)});
  for(const t of dungeon.torches)if(t.x>cam.x-160&&t.x<cam.x+vw+160&&t.y>cam.y-160&&t.y<cam.y+vh+160)
    layers.push({y:t.y+13,render:()=>torchDraw(t)});
  for(const d of drops)layers.push({y:d.y+7,render:()=>Art.loot(ctx,d,tick)});
  if(portal)layers.push({y:portal.y+12,render:()=>drawPortal(portal)});
  for(const e of enemies)layers.push({y:e.y+10,render:()=>enemyDraw(e)});
  layers.push({y:hero.y+10,render:heroDraw});
  layers.sort((a,b)=>a.y-b.y);
  for(const layer of layers)layer.render();
  for(const m of missiles)missileDraw(m);
  for(const h of hazards){
    ctx.save();
    ctx.globalAlpha=clamp(h.life/(h.type==='nova'?.45:h.type==='chain'?.22:h.type==='meteor'?1:4),0,1)*.78;
    if(h.type==='chain'){
      ctx.strokeStyle='#c4a4ff';ctx.shadowColor='#ba9eff';ctx.shadowBlur=20;ctx.lineWidth=6;
      ctx.beginPath();ctx.moveTo(h.x,h.y-48);ctx.lineTo((h.x+h.x2)/2-14,(h.y+h.y2)/2-53);
      ctx.lineTo((h.x+h.x2)/2+10,(h.y+h.y2)/2-45);ctx.lineTo(h.x2,h.y2-48);ctx.stroke();
    }else{
      const fire=h.type==='meteor'||h.type==='inferno',ice=h.type==='nova'||h.type==='storm';
      ctx.strokeStyle=ice?'#8ee5ff':fire?'#ff663b':'#bf80e8';
      ctx.shadowColor=ice?'#8acde5':fire?'#e17c37':'#9e77c7';ctx.shadowBlur=15;
      ctx.lineWidth=h.type==='nova'?5:4;ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,Math.PI*2);ctx.stroke();
      if(h.type==='storm'||h.type==='inferno'){ctx.fillStyle=fire?'#ff6a241e':'#75c8f51c';ctx.fill();}
    }
    ctx.restore();
  }
  for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ellipse(p.x,p.y,p.size,p.size,p.color);}ctx.globalAlpha=1;
  drawExplorationFog(ctx,dungeon,cam,vw,vh);
  // Labels stay above loot until it is physically picked up.
  ctx.textAlign='center';ctx.font='bold 13px system-ui';
  for(const drop of drops){
    if(drop.x<cam.x-120||drop.x>cam.x+vw+120||drop.y<cam.y-120||drop.y>cam.y+vh+120)continue;
    const label=drop.item.name,y=drop.y-74;
    ctx.lineWidth=4;ctx.strokeStyle='#090b10ed';ctx.strokeText(label,drop.x,y);
    ctx.fillStyle=palette.rare[drop.item.rarity];ctx.fillText(label,drop.x,y);
  }
  ctx.font='bold 15px system-ui';ctx.textAlign='center';for(const f of texts){ctx.globalAlpha=clamp(f.life,0,1);ctx.fillStyle='#000b';ctx.fillText(f.text,f.x+1,f.y+2);ctx.fillStyle=f.color;ctx.fillText(f.text,f.x,f.y);}ctx.globalAlpha=1;ctx.restore();
  // 环境暗角在 Canvas 内绘制，移动端同样清晰。
  const vign=ctx.createRadialGradient(vw/2,vh/2,Math.min(vw,vh)*.15,vw/2,vh/2,Math.max(vw,vh)*.75);
  vign.addColorStop(0,'#080c1100');vign.addColorStop(1,'#04050988');ctx.fillStyle=vign;ctx.fillRect(0,0,vw,vh);
  if(++frameIndex%5===0)drawMinimap();
}
function drawMinimap(){
  const w=150,h=112;
  minimap.clearRect(0,0,w,h);minimap.fillStyle='#090d16';minimap.fillRect(0,0,w,h);
  const cells=dungeon.layout.rooms,known=new Set(dungeon.explored),near=new Set(dungeon.visible);
  const fx=w/worldWidth(),fy=h/worldHeight(),step=dungeon.cellSize*8;
  for(const edge of dungeon.layout.edges){
    if(!known.has(edge.a)&&!known.has(edge.b))continue;
    const a=roomCenter(dungeon,edge.a),b=roomCenter(dungeon,edge.b);
    minimap.strokeStyle='#908273';minimap.lineWidth=3;minimap.beginPath();minimap.moveTo(a.x*fx,a.y*fy);minimap.lineTo(b.x*fx,b.y*fy);minimap.stroke();
  }
  for(const room of cells){
    if(!known.has(room.id)&&!near.has(room.id))continue;
    const x=(room.x*step+48)*fx,y=(room.y*step+48)*fy;
    minimap.fillStyle=room.id===dungeon.layout.boss&&known.has(room.id)?'#985e66':known.has(room.id)?'#a09078':'#363e46';
    minimap.fillRect(x,y,step*fx*.75,step*fy*.75);
  }
  for(const e of enemies)if(known.has(roomAt(dungeon,e.x,e.y))){minimap.fillStyle=e.kind==='boss'?'#ef8ec7':'#bb695e';minimap.fillRect(e.x*fx-1.5,e.y*fy-1.5,3,3);}
  minimap.fillStyle='#fff2a9';minimap.beginPath();minimap.arc(hero.x*fx,hero.y*fy,3,0,7);minimap.fill();
  minimap.strokeStyle='#b28c59';minimap.strokeRect(cam.x*fx,cam.y*fy,vw*fx,vh*fy);
}
function loop(now){
  const dt=Math.min(.04,(now-last)/1000 || .016);last=now;
  if(state==='playing'&&$('inventory').hidden&&$('portal-panel').hidden)update(dt);
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
$('abilitybar').addEventListener('pointerdown',e=>{
  const button=e.target.closest('button[data-skill]');
  if(!button||state!=='playing')return;
  e.preventDefault();
  const skill=button.dataset.skill;button.setPointerCapture(e.pointerId);
  if(skill==='fire'){manualAim=null;pointers.add(e.pointerId);}
  cast(skill);
});
$('abilitybar').addEventListener('pointerup',e=>pointers.delete(e.pointerId));
$('abilitybar').addEventListener('pointercancel',e=>pointers.delete(e.pointerId));
window.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;
  if(['INPUT','TEXTAREA'].includes(tag)||e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key.toLowerCase();
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();
  if(k==='escape'){if(!$('town-panel').hidden)resumeFromTown();else if(!$('portal-panel').hidden)closePortalMenu();else if(!$('inventory').hidden)closeInventory();else onPause();return;}
  if(k==='b'){if(!$('inventory').hidden)closeInventory();else showInventory();return;}
  if(k==='t'){openPortalMenu();return;}
  if(state!=='playing'||!$('inventory').hidden)return;
  keys.add(k);
  if(!e.repeat){
    const byKey=Object.fromEntries(profile.activeSkills.map(id=>[SKILLS[id].key==='空格'?' ':SKILLS[id].key.toLowerCase(),id]));
    if(byKey[k]){if(k==='1')manualAim=null;cast(byKey[k]);}
  }
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
document.addEventListener('dblclick',e=>e.preventDefault(),{passive:false});
document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
document.addEventListener('gestureend',e=>e.preventDefault(),{passive:false});
// Dedicated local QA hook: never active on the public GitHub Pages game.
if(location.hostname==='127.0.0.1' && new URLSearchParams(location.search).has('qa')){
  window.__ember2dQA={
    mazeInfo:()=>({rooms:dungeon.layout.rooms.length,explored:dungeon.explored.length,bossRoom:dungeon.layout.boss,hasMask:!!dungeon.floorMask,seed:dungeon.seed,bossDefeated,portalReady:!!portal}),
    bossTest:()=>{
      if(state!=='playing')throw new Error('start game first');
      enemies.length=0;
      const bossRoom=dungeon.layout.boss,c=roomCenter(dungeon,bossRoom);
      hero.x=c.x;hero.y=c.y;currentRoom=null;enteredRooms.delete(bossRoom);
      enterChamber(bossRoom);
      const e=boss;if(!e)throw new Error('boss chamber did not spawn its guardian');
      e.hp=1;dealDamage(e,10000,'fire');
      return {state,bossDefeated,drops:drops.map(d=>({id:d.item.id,name:d.item.name,rarity:d.item.rarity,persistent:!!d.persistent,x:d.x,y:d.y})),
        pending:profile.pendingLoot.length,bossKills:profile.bossKills[profile.region]};
    }
  };
}
build();state='intro';requestAnimationFrame(loop);
