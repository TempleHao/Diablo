import * as Art from './art.js';
import {MATERIALS,sanitizeMaterials,dismantle,dismantleAll,autoDismantleDrop,canTemper,temper,temperCost} from './crafting.js';
import { BOSS_POOLS, rollBossRewards } from './boss-loot.js';
import {destinationOptions,pickRandomDestination,validateDestination} from './travel.js';
import {ENCOUNTER_COUNT,WAVE_SIZE,WAVE_COUNT,MAX_LIVE_ENEMIES,encounterWave,nextWaveForKills,shouldSummonBoss} from './encounters.js';
import {emitVfx,tickVfx,paintVfx} from './spell-vfx.js';
import {Lighting,drawGlow,drawEllipseGlow,shardSprite,addDecal,tickDecals,drawDecals,shakeOffset} from './fx.js';
import {drawDungeonDetail} from './dungeon-detail.js';
import { SLOTS, SLOT_IDS, MAX_ITEMS, AFFIXES, RARITIES, RARITY_COLORS, LEGACY_SLOTS, SKILLS, SETS, REGION_DATA, formatAffixes, makeLoot, itemScore, catalogEntry } from './systems.js';
import { TILE, WIDTH, HEIGHT, START, SAVE_KEY, clamp, distance, mulberry32, makeDungeon, walkable, moveWithCollision, freshSave, sanitizeSave, stats, expRequired, gainXp, createItem, equip, salvage, upgradeSkill } from './core.js';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d'), minimap = $('minimap').getContext('2d');
const ui = { hp: $('hp-num'), mana: $('mana-num'), level: $('level'), xp: $('xp-fill'), gold: $('gold'), essence: $('essence'),
  boss: $('boss-ui'), bossHp: $('boss-meter'), title: $('quest-title'), progress: $('quest-progress'), log: $('eventlog') };
const skillData = SKILLS;
const ACTIVE_LIMIT=7;
const keys = new Set(), pointers = new Set(), joystick = { id:null, x:0, y:0 };
let vw = 0, vh = 0, dpr = 1, cam = {x:0,y:0}, profile, dungeon, rng, hero;
let enemies = [], missiles = [], drops = [], particles = [], texts = [], hazards = [], vfx = [], state = 'intro', tick = 0, last = 0;
let decals = [], hitStop = 0, hudTimer = 0, floorChunks = new Map(), floorKey = '';
const shake = {amount:0}, lighting = new Lighting();
let kills = 0, total = ENCOUNTER_COUNT, boss = null, frameIndex = 0, nextId = 1, manualAim = null, messageTimes = new Map();

const cooldowns=Object.fromEntries(Object.keys(SKILLS).map(k=>[k,0]));
let armorUntil=0, wardHp=0, combo=0, bossDefeated=false, portal=null, selectedItemId=null, selectedRingSlot=null;
const palette = { stone:'#262d34', stoneEdge:'#11171e', gold:'#e5b777', ice:'#91dcfa', fire:'#ff9a57', rare:RARITY_COLORS };
try { profile = sanitizeSave(JSON.parse(localStorage.getItem(SAVE_KEY))); } catch { profile = freshSave(); }
for(const id of ['mage-skin-start','mage-skin-inventory']){
  const select=$(id);
  select.value=profile.heroSkin;
  select.addEventListener('change',()=>{
    profile.heroSkin=select.value;
    for(const other of ['mage-skin-start','mage-skin-inventory'])$(other).value=profile.heroSkin;
    hero&&(hero.skin=profile.heroSkin);
    persist();
    announce('法师形象已切换：'+select.options[select.selectedIndex].text,true);
  });
}

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
  profile.region=next;build();persist();if(state==='victory'||state==='death')state='intro';
  announce('已进入 '+REGION_DATA[next].name,true);
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
  closePortalMenu();profile.region=region;
  profile.regionVisits[region]=(profile.regionVisits[region]||0)+1;
  build();persist();announce('传送抵达 '+REGION_DATA[region].name+' · 新的远征开始',true);
  return true;
}
$('portal-open').onclick=openPortalMenu;
$('portal-stay').onclick=closePortalMenu;
$('portal-next').onclick=()=>travelTo(Number($('portal-destination').value));
$('portal-random').onclick=()=>travelTo(pickRandomDestination(rng,profile.region));
$('portal-panel').addEventListener('pointerdown',e=>{if(e.target===$('portal-panel'))closePortalMenu();});

function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(profile)); } catch { announce('浏览器无法保存。请在行囊内导出角色备份。', true); } }
function resize() { vw = window.innerWidth; vh = window.innerHeight; dpr = Math.min(devicePixelRatio || 1, vw<=760||vh<=550 ? 1.5 : 2); canvas.width = Math.round(vw*dpr); canvas.height = Math.round(vh*dpr); }
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
function wavePoint(i,index){
  // All 12 do not stack on four identical spawn pixels.
  for(let n=0;n<90;n++){
    const a=(i/12)*Math.PI*2+index*.85+(rng()-.5)*.35;
    const radius=270+Math.floor(i/4)*110+rng()*105;
    const p={x:hero.x+Math.cos(a)*radius,y:hero.y+Math.sin(a)*radius};
    if(!walkable(p.x,p.y,24,dungeon))continue;
    if(enemies.some(e=>distance(e,p)<48))continue;
    return p;
  }
  return randomPoint(250);
}
function spawnWave(index){
  const group=encounterWave(REGION_DATA[profile.region].types,index);
  for(const [i,enemy] of group.entries()){
    if(enemies.length>=MAX_LIVE_ENEMIES)break;
    const e=spawn(enemy.kind,wavePoint(i,index));e.elite=enemy.elite;
    if(e.elite){e.maxHp=Math.round(e.maxHp*1.9);e.hp=e.maxHp;e.speed*=.92;}
  }
  if(index>0)announce('第 '+(index+1)+' 波 · '+['黑潮初现','精英增援','守门军团'][index],true);
}
function findBossPoint(){
  // A short, reachable walk down the central aisle instead of spawning inside masonry.
  for(const delta of [310,390,240,-280,460]){
    const p={x:hero.x,y:clamp(hero.y-delta,TILE*3,HEIGHT-TILE*3)};
    if(walkable(p.x,p.y,45,dungeon))return p;
  }
  return {x:WIDTH/2,y:TILE*5.7};
}
function build() {
  ui.log.replaceChildren();messageTimes.clear();
  const seed = 20261013 + profile.clears*19+profile.region*7919;
  rng=mulberry32(seed); dungeon=makeDungeon(seed,profile.region);
  const s=stats(profile);
  hero={x:START.x,y:START.y, radius:17,hp:s.hp,mana:s.mana,maxHp:s.hp,maxMana:s.mana,angle:-Math.PI/2,invuln:0,cast:0,walk:0,moving:false};
  enemies=[];missiles=[];drops=[];particles=[];texts=[];hazards=[];vfx=[];decals=[];hitStop=0;shake.amount=0;kills=0;boss=null;nextId=1;tick=0;manualAim=null;armorUntil=0;wardHp=0;combo=0;bossDefeated=false;portal=null;
  $('portal-panel').hidden=true;$('portal-open').hidden=true;
  for(const [i,pending] of profile.pendingLoot.entries())if(pending.region===profile.region)
    drops.push({x:START.x+40+(i%4)*38,y:START.y-50-Math.floor(i/4)*43,item:pending.item,age:0,persistent:true});
  $('region-select').value=String(profile.region);$('region-name').textContent=REGION_DATA[profile.region].name;
  Object.keys(cooldowns).forEach(k=>cooldowns[k]=0);
  spawnWave(0);
  ui.boss.hidden=true;
  ui.title.textContent='净化 · '+REGION_DATA[profile.region].name;$('map-label').textContent=REGION_DATA[profile.region].label;ui.progress.textContent='击败 '+total+' 名怪物，穿过三波守卫迎战首领';
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
const mobileMode=()=>window.matchMedia('(max-width:700px), (max-height:550px) and (pointer:coarse)').matches;
function setMobileInventoryView(view){
  if(!['bag','gear','compare'].includes(view))return;
  $('inventory').dataset.mobileView=view;
  for(const tab of $('mobile-inv-tabs').querySelectorAll('button[data-view]')){
    const active=tab.dataset.view===view;tab.classList.toggle('is-active',active);tab.setAttribute('aria-pressed',String(active));
  }
  const panel=$('inventory').querySelector('.inventory-panel');panel.scrollTop=0;
}
for(const tab of $('mobile-inv-tabs').querySelectorAll('button[data-view]'))tab.onclick=()=>setMobileInventoryView(tab.dataset.view);
$('mobile-back-to-bag').onclick=()=>setMobileInventoryView('bag');
$('mobile-equip').onclick=()=>$('inv-quick-equip').click();
$('ring-target').onchange=()=>{
  selectedRingSlot=$('ring-target').value;
  const item=profile.inventory.find(i=>i.id===selectedItemId);inspectItem(item||null);
};
function selectEquipmentItem(item){
  selectedItemId=item?.id||null;selectedRingSlot=item?.slot?.startsWith('ring')?Object.keys(profile.equipped).find(k=>k.startsWith('ring')&&profile.equipped[k]===item.id)||null:null;
  renderInventory();if(item&&mobileMode())setMobileInventoryView('compare');
}
function showInventory() {
  if(state==='intro'||state==='victory'||state==='death'||!$('portal-panel').hidden)return;
  $('inventory').hidden=false;$('portal-open').hidden=true;clearInput();renderInventory();
  if(mobileMode())setMobileInventoryView('bag');
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
  if(!confirm('确认分解 '+eligible.length+' 件低品质装备？已装备、已收藏、传奇与套装会保留。'))return;
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
function slotLabel(item){
  if(item.legacy)return LEGACY_SLOTS[item.slot];
  const info=catalogEntry(item),base=SLOTS.find(s=>s[0]===item.slot)?.[1]||'';
  return info?(info.h===2?'双手 · ':'')+info.sub:base;
}
function inspectItem(item){
  const panel=$('item-inspect');panel.replaceChildren();
  if(!item){panel.textContent='选择装备可查看详细属性、套装效果与实际穿戴增减。';$('compare-pair').replaceChildren();$('ring-choice').hidden=true;$('mobile-item-name').textContent='点选背包中的装备';$('mobile-equip').disabled=true;$('inv-quick-equip').disabled=true;$('inv-quick-equip').textContent='选择装备后点击穿戴';$('inv-temper').disabled=true;$('temper-cost').textContent='低品质物品分解后可在这里使用材料淬炼装备。';return;}
  const title=document.createElement('h3');title.className='rarity-'+item.rarity;title.textContent=item.name;
  const meta=document.createElement('small');meta.textContent=RARITIES[item.rarity]+' · 物品等级 '+item.ilvl+' · '+slotLabel(item);
  const preview=document.createElement('canvas');preview.className='item-preview';preview.setAttribute('aria-label',item.name+' 装备图标');Art.drawItemIcon(preview,item);
  panel.append(preview,title,meta);
  if(item.tempered){const stamp=document.createElement('p');stamp.className='score-up';stamp.textContent='✦ 已淬炼强化';panel.append(stamp);}
  const list=document.createElement('ul');
  for(const line of formatAffixes(item)){const li=document.createElement('li');li.textContent=line;list.append(li);}
  if(!list.childElementCount){const li=document.createElement('li');li.textContent='基础装备 · 无额外词缀';list.append(li);}
  panel.append(list);
  const info=catalogEntry(item);
  if(info?.eff){
    const fx=document.createElement('div');fx.className='item-effect rarity-'+item.rarity;
    const h=document.createElement('strong');h.textContent='✦ '+info.eff;
    const d=document.createElement('p');d.textContent=info.desc;
    const note=document.createElement('small');note.textContent='特效为图鉴设定，暂未接入战斗；当前生效的是上方词缀。';
    fx.append(h,d);
    if(info.cost){const c=document.createElement('p');c.className='item-drawback';c.textContent='代价：'+info.cost;fx.append(c);}
    fx.append(note);panel.append(fx);
  }
  if(info?.lore){const lore=document.createElement('p');lore.className='item-lore';lore.textContent=info.lore;panel.append(lore);}
  if(item.legacy){const old=document.createElement('p');old.className='score-down';old.textContent='旧版装备槽已取消：不能穿戴，可以分解换材料。';panel.append(old);}
  if(item.setId){
    const set=SETS[item.setId],count=Object.values(profile.equipped).map(id=>profile.inventory.find(i=>i.id===id)).filter(i=>i?.setId===item.setId).length;
    const p=document.createElement('p');p.className='set-description';p.textContent=set.name+'（已装备 '+count+'/3） · 2 件：'+set.two+' · 3 件：'+set.three;panel.append(p);
  }
  const isRing=item.slot.startsWith('ring');
  const target=isRing?(selectedRingSlot||Object.keys(profile.equipped).find(k=>k.startsWith('ring')&&profile.equipped[k]===item.id)||(!profile.equipped.ring1?'ring1':'ring2')):item.slot;
  $('ring-choice').hidden=!isRing;
  if(isRing)$('ring-target').value=target;
  $('mobile-item-name').textContent=item.name;
  $('mobile-equip').disabled=false;
  const worn=profile.inventory.find(i=>i.id===profile.equipped[target]);
  const pair=$('compare-pair');pair.replaceChildren();
  for(const [gear,label] of [[worn,'当前装备'],[item,'候选装备']]){
    const card=document.createElement('div');card.className='compare-gear '+(label==='候选装备'?'new-gear':'worn-gear');
    const caption=document.createElement('small');caption.textContent=label;
    const pic=document.createElement('canvas');pic.className='compare-icon';pic.setAttribute('aria-hidden','true');
    if(gear)Art.drawItemIcon(pic,gear);
    const name=document.createElement('strong');name.textContent=gear?.name||'空槽位';
    if(gear)name.className='rarity-'+gear.rarity;
    card.append(caption,pic,name);pair.append(card);
  }
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
  const wornHere=profile.equipped[target]===item.id;
  quick.disabled=!!item.legacy;
  quick.textContent=item.legacy?'旧版装备 · 只能分解':wornHere?'卸下 '+item.name:'直接穿戴 '+item.name;
  if(item.legacy)$('mobile-equip').disabled=true;
  $('mobile-equip').textContent=wornHere?'卸下装备':'穿戴 / 替换';
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
    const node=document.createElement('button');node.type='button';node.className='slot equipment-slot'+(profile.equipped[slot]===selectedItemId?' is-selected':'');
    const name=document.createElement('small');name.textContent=glyph+' '+label;const title=document.createElement('b');
    const item=profile.inventory.find(i=>i.id===profile.equipped[slot]);
    const blocked=slot==='offhand'&&!item&&profile.inventory.find(i=>i.id===profile.equipped.weapon)?.hands===2;
    title.textContent=item?.name||(blocked?'双手武器占用':'空位');if(item)title.classList.add('rarity-'+item.rarity);
    if(item){const icon=document.createElement('canvas');icon.className='equipment-icon';icon.setAttribute('aria-hidden','true');Art.drawItemIcon(icon,item);node.append(icon);}
    node.append(name,title);
    node.onclick=()=>selectEquipmentItem(item);
    node.ondblclick=()=>{if(item){selectedItemId=item.id;applyEquipmentChange(()=>profile.equipped[slot]=null);}};
    equipment.append(node);
  }
  $('bag-count').textContent=profile.inventory.length+' / '+MAX_ITEMS;
  const bag=$('inventory-items');bag.replaceChildren();
  if(!profile.inventory.length){const p=document.createElement('p');p.className='empty';p.textContent='行囊空空。击败怪物并靠近掉落光柱，可获得随机装备和词缀。';bag.append(p);}
  const category=$('inv-filter').value,sort=$('inv-sort').value;
  const visible=profile.inventory.filter(item=>category==='all'||
    (category==='weapon'&&['weapon','offhand'].includes(item.slot))||
    (category==='armor'&&['head','shoulders','robe','gloves','belt','boots'].includes(item.slot))||
    (category==='accessory'&&['amulet','ring1','ring2'].includes(item.slot))||
    (category==='legacy'&&item.legacy));
  visible.sort(sort==='score'?(a,b)=>itemScore(b)-itemScore(a):
    sort==='level'?(a,b)=>b.ilvl-a.ilvl:(a,b)=>0);
  if(sort==='rarity')visible.sort((a,b)=>b.rarity-a.rarity||b.ilvl-a.ilvl);
  for(const item of visible){
    const node=document.createElement('div');node.className='item'+(selectedItemId===item.id?' is-selected':'');
    const detail=document.createElement('button');detail.type='button';detail.className='item-detail';
    const title=document.createElement('strong');title.className='rarity-'+item.rarity;title.textContent=item.name;
    const desc=document.createElement('small');desc.textContent=RARITIES[item.rarity]+' · '+slotLabel(item)+' · '+(item.affixes?.length||0)+' 条词缀';
    const img=document.createElement('canvas');img.className='item-thumbnail';img.setAttribute('aria-hidden','true');Art.drawItemIcon(img,item);
    const labels=document.createElement('span');labels.className='item-labels';labels.append(title,desc);
    detail.append(img,labels);detail.onclick=()=>selectEquipmentItem(item);
    detail.ondblclick=()=>{selectedItemId=item.id;applyEquipmentChange(()=>equip(profile,item.id,
      item.slot.startsWith('ring')?(!profile.equipped.ring1?'ring1':!profile.equipped.ring2?'ring2':item.slot):null));};
    const actions=document.createElement('div');actions.className='item-actions';
    const worn=Object.values(profile.equipped).includes(item.id);
    const use=document.createElement('button');use.textContent=worn?'已装备':item.legacy?'旧版':'装备';use.disabled=worn||!!item.legacy;
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
  ui.progress.textContent=boss?'击败 '+BOSS_POOLS[profile.region].name+'，收集专属战利品':bossDefeated?'首领已击败 · 继续拾取装备 / B 查看背包 / 暂停手动重刷':'徘徊者 '+Math.min(kills,total)+' / '+total+' · 靠近掉落自动拾取';
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
function floatText(x,y,value,color='#f1ca90',big=false){texts.push({x,y,text:String(value),color,life:.85,big,vx:(Math.random()-.5)*30});if(texts.length>50)texts.shift();}
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
  e.hp-=damage;e.flash=.11;
  if(crit||e.hp<=0)emitVfx(vfx,school==='fire'?'fire':school==='cold'?'ice':'arcane',e.x,e.y-20,{max:crit?12:7});
  if(crit){shake.amount=Math.max(shake.amount,2.5);}
  floatText(e.x,e.y-38,(crit?'✦ ':'')+damage,crit?'#ffe29b':school==='cold'?'#bfe9ff':'#f1ca90',crit);puff(e.x,e.y-18,e.kind==='boss'?'#c88ae2':'#eaa161',4,3);
  if(e.hp>0)return;
  const i=enemies.indexOf(e);if(i>=0)enemies.splice(i,1);
  emitVfx(vfx,'death',e.x,e.y-18,{max:e.kind==='boss'?40:16});
  addDecal(decals,e.x,e.y+4,e.kind==='boss'?70:e.kind==='brute'?40:28,e.kind==='spider'||e.kind==='wretch'?'ash':'blood',6);
  if(e.kind==='boss'){shake.amount=14;hitStop=.12;}
  puff(e.x,e.y-14,e.kind==='boss'?'#e89bff':'#e8904b',12,5,200);
  const bossDied=e.kind==='boss';const advanced=gainXp(profile,bossDied?170:22);
  profile.gold+=bossDied?150:3+Math.floor(rng()*9);
  if(advanced){const s=stats(profile);hero.maxHp=s.hp;hero.maxMana=s.mana;hero.hp=s.hp;hero.mana=s.mana;announce('等级提升 · '+profile.level+'级！',true);}
  if(!bossDied&&rng()<(e.elite?.74:.42))dropItem(e.x,e.y,!!e.elite);
  if(bossDied){
    const region=profile.region,previousKills=profile.bossKills[region]||0;
    const reward=rollBossRewards(rng,profile.level,region,previousKills,()=> 'boss-'+Date.now()+'-'+(nextId++));
    profile.bossKills[region]=previousKills+1;
    profile.essence+=reward.materials;profile.clears++;
    boss=null;bossDefeated=true;portal={x:e.x,y:e.y};ui.boss.hidden=true;$('portal-open').hidden=false;
    for(const [index,item] of reward.drops.entries()){
      const angle=index*2.4,rad=60+index*15;
      const x=e.x+Math.cos(angle)*rad,y=e.y+Math.sin(angle)*rad;
      const point=walkable(x,y,17,dungeon)?{x,y}:{x:e.x,y:e.y};
      drops.push({...point,item,age:0,persistent:true});
      profile.pendingLoot.push({item,region});
      puff(point.x,point.y,palette.rare[item.rarity],23,5,170);
    }
    persist();
    announce((reward.firstKill?'首杀奖励！':'首领战利品！')+' '+reward.drops.length+' 件装备 · '+reward.materials+' 精华'+(reward.exclusive?' · 专属传奇！':''),true);
    ui.title.textContent='首领已击败 · 传送阵已开启';
    ui.progress.textContent='专属奖励已掉落 · 传送阵可选择下一图或随机远征';
  }else{
    kills++;
    const wave=nextWaveForKills(kills);
    if(wave>=0)spawnWave(wave);
    if(shouldSummonBoss(kills,boss))spawn('boss',findBossPoint());
    persist();
  }
}
function dropItem(x,y,rare=false) {
  const item=makeLoot(rng,profile.level,'ember2d-'+Date.now()+'-'+nextId++,{boss:rare});
  if(rare&&item.rarity<2){item.rarity=2;item.name='司祭战利品 · '+item.name;}
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
  emitVfx(vfx,skill,hero.x,hero.y-40,{max:vw<=700?12:20,angle:hero.angle});
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
    emitVfx(vfx,'nova',hero.x,hero.y,{max:32});
    hazards.push({x:hero.x,y:hero.y,r:0,max:196,life:.45,type:'nova'});addDecal(decals,hero.x,hero.y,190,'frost',2.5);shake.amount=Math.max(shake.amount,3);
    for(const e of [...enemies])if(distance(hero,e)<196){e.slow=3;dealDamage(e,bonus.power*(1.3+rank*.18),'cold');}
    puff(hero.x,hero.y,'#91deff',27,4,270);
  }
  if(skill==='armor'){armorUntil=tick+7+rank*.5;announce('冰甲已激活',true);puff(hero.x,hero.y,'#8bcdf9',22,4,150);}
  if(skill==='meteor'){
    const dest=target||{x:hero.x+dx*220,y:hero.y+dy*220};
    emitVfx(vfx,'meteor',dest.x,dest.y,{max:32});
    hazards.push({x:dest.x,y:dest.y,r:0,max:125,life:1.0,type:'meteor',triggered:false,rank,seed:Math.random()*6});
    announce('陨火坠落！',true);
  }
  if(skill==='blink'){
    const v=movementVector(),mag=Math.hypot(v.x,v.y);
    const bx=mag>.05?v.x/mag:dx,by=mag>.05?v.y/mag:dy;
    hero.invuln=.4;puff(hero.x,hero.y-30,'#aa97ec',14,4,170);
    const from={x:hero.x,y:hero.y};
    for(let t=0;t<18;t++)moveWithCollision(hero,bx*(950+rank*85),by*(950+rank*85),1/60,dungeon,hero.radius);
    hazards.push({x:from.x,y:from.y,x2:hero.x,y2:hero.y,type:'blink',r:0,max:1,life:.35});
    emitVfx(vfx,'blink',hero.x,hero.y-34,{max:16});
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
    for(const v of victims)emitVfx(vfx,'chain',v.x,v.y,{max:9});
    for(let n=0;n<victims.length;n++)dealDamage(victims[n],bonus.power*(1.2+rank*.12)*Math.pow(.8,n),'arcane');
    if(!victims.length){announce('附近没有连锁目标');puff(hero.x+dx*55,hero.y+dy*55,'#b29eff',14,4,100);}
  }
  if(skill==='storm'){
    const center=target&&distance(hero,target)<520?target:{x:hero.x+dx*190,y:hero.y+dy*190};
    emitVfx(vfx,'storm',center.x,center.y,{max:32});
    hazards.push({x:center.x,y:center.y,r:120,max:120,life:4,kind:'storm',type:'storm',rank,timer:0});addDecal(decals,center.x,center.y,130,'frost',4.4);
    announce('冰暴领域已展开',true);
  }
  if(skill==='ward'){
    wardHp=Math.round(24+bonus.hp*(.20+rank*.045));
    emitVfx(vfx,'ward',hero.x,hero.y,{max:24});
    puff(hero.x,hero.y,'#b8d7ff',22,5,130);announce('奥术护盾 · 吸收 '+wardHp+' 伤害',true);
  }
  if(skill==='inferno'){
    for(let n=1;n<=5;n++){
      const x=hero.x+dx*n*55,y=hero.y+dy*n*55;
      if(walkable(x,y,10,dungeon)){emitVfx(vfx,'fire',x,y,{max:6});hazards.push({x,y,r:43,max:43,life:4,type:'inferno',rank,timer:0,seed:n*1.7});addDecal(decals,x,y,46,'scorch',5);}
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
  tickVfx(vfx,dt);tickDecals(decals,dt);
  for(const key in cooldowns)cooldowns[key]=Math.max(0,cooldowns[key]-dt);
  hero.invuln=Math.max(0,hero.invuln-dt);hero.cast=Math.max(0,hero.cast-dt);hero.mana=Math.min(hero.maxMana,hero.mana+dt*stats(profile).regen);
  const v=movementVector(), l=Math.hypot(v.x,v.y);
  const oldX=hero.x,oldY=hero.y;
  if(l>.02){moveWithCollision(hero,v.x*250,v.y*250,dt,dungeon,hero.radius);
    if(!manualAim)hero.angle=Math.atan2(v.y,v.x);
  }
  hero.moving=l>.02&&Math.hypot(hero.x-oldX,hero.y-oldY)>.08;
  if(hero.moving){
    const previousStride=hero.walk;hero.walk+=dt*13;
    // A small timed footstep is a visible animation cue, not a fake input event.
    if(Math.floor(previousStride/Math.PI)!==Math.floor(hero.walk/Math.PI)){
      const x=hero.x-Math.cos(hero.angle)*9,y=hero.y-Math.sin(hero.angle)*7;
      puff(x,y,'#7590b9',4,1.1,32);
    }
  }
  if(portal&&distance(hero,portal)<105&&!$('portal-panel').dataset.suppressed&&state==='playing'&&!boss){$('portal-open').hidden=false;}
  if(pointers.size || keys.has('1'))cast('fire');
  for(const e of [...enemies]){
    e.phase+=dt*3;e.attack-=dt;e.slow=Math.max(0,e.slow-dt);if(e.flash>0)e.flash-=dt;
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
    // 飞行拖尾：少量光晕粒子
    if((m.trail=(m.trail||0)-dt)<=0){m.trail=.025;const c=m.kind==='ember'?(rng()<.5?'#ff8a3a':'#ffd27a'):m.kind==='shard'?'#a9e4ff':'#b98cf0';
      particles.push({x:m.x-m.vx*.012+(rng()-.5)*6,y:m.y-28+(rng()-.5)*6,vx:-m.vx*.08,vy:(m.kind==='ember'?-30:0)+(rng()-.5)*20,life:.32,max:.32,color:c,size:m.kind==='ember'?5:4});}
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
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=1-dt*2;p.vy*=1-dt*2;p.life-=dt;if(p.life<=0)particles.splice(i,1);}
  for(let i=texts.length-1;i>=0;i--){const f=texts[i];f.y-=dt*(f.big?48:36);f.x+=f.vx*dt;f.life-=dt;if(f.life<=0)texts.splice(i,1);}
  for(const h of [...hazards]){
    h.life-=dt;h.r+=(h.max-h.r)*dt*13;
    if(h.type==='meteor'&&!h.triggered&&h.life<.25){
      h.triggered=true;puff(h.x,h.y,'#ff9146',30,7,320);
      emitVfx(vfx,'meteor',h.x,h.y-10,{max:40,speed:2.2});addDecal(decals,h.x,h.y,120,'scorch',6);
      shake.amount=Math.max(shake.amount,10);hitStop=Math.max(hitStop,.06);
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
  // HUD 是 DOM：限制到约 12 次/秒，避免每帧改 DOM 造成卡顿。
  if((hudTimer-=dt)<=0){hudTimer=.08;updateHud();}
}
// ---------- 地面：按 512px 分块预渲染缓存，每帧只贴几张图 ----------
const CHUNK=512;
function floorDraw(){
  if(!Art.artStatus().ready){Art.floor(ctx,cam,vw,vh,WIDTH,HEIGHT,tick,profile.region,dungeon.seed);drawDungeonDetail(ctx,dungeon,cam,vw,vh,tick,true);return;}
  const key=profile.region+':'+dungeon.seed;
  if(key!==floorKey){floorChunks.clear();floorKey=key;}
  const x0=Math.floor(cam.x/CHUNK),x1=Math.floor((cam.x+vw)/CHUNK),y0=Math.floor(cam.y/CHUNK),y1=Math.floor((cam.y+vh)/CHUNK);
  let built=0;
  for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++){
    const id=cx+','+cy;let chunk=floorChunks.get(id);
    if(!chunk&&built<4){chunk=buildChunk(cx,cy);floorChunks.set(id,chunk);built++;}
    if(chunk)ctx.drawImage(chunk,cx*CHUNK,cy*CHUNK);
  }
}
function buildChunk(cx,cy){
  const c=document.createElement('canvas');c.width=c.height=CHUNK;
  const g=c.getContext('2d');g.imageSmoothingEnabled=false;
  const view={x:cx*CHUNK,y:cy*CHUNK};
  g.translate(-view.x,-view.y);
  Art.floor(g,view,CHUNK,CHUNK,WIDTH,HEIGHT,0,profile.region,dungeon.seed);
  drawDungeonDetail(g,dungeon,view,CHUNK,CHUNK,0,true);
  // 压低地砖对比度与亮度：让角色、怪物、法术从背景里跳出来。
  g.setTransform(1,0,0,1,0,0);
  g.globalCompositeOperation='saturation';g.fillStyle='rgba(128,128,128,.18)';g.fillRect(0,0,CHUNK,CHUNK);
  g.globalCompositeOperation='source-over';g.fillStyle='rgba(10,12,17,.30)';g.fillRect(0,0,CHUNK,CHUNK);
  return c;
}
function stoneDraw(b){ Art.pillar(ctx,b); }
function torchDraw(t){ Art.torch(ctx,t); }
function ellipse(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
const characterScale=()=>mobileMode()?.56:.66;
const monsterScale=()=>mobileMode()?.57:.70;
function enemyDraw(e){ Art.enemy(ctx,e,tick,monsterScale()*(e.kind==='boss'?1.08:1)); }
function heroDraw(){
  const worn={};for(const [slot,id] of Object.entries(profile.equipped))worn[slot]=profile.inventory.find(x=>x.id===id)||null;
  hero.skin=profile.heroSkin;
  const k=characterScale();
  if(armorUntil>tick){
    // 冰甲：三片冰晶环绕
    ctx.save();ctx.globalCompositeOperation='lighter';
    drawEllipseGlow(ctx,hero.x,hero.y-40*k,46*k,62*k,'#6fc4ff',.22);
    const s=shardSprite('#bfefff');
    for(let i=0;i<3;i++){const a=tick*2.4+i*2.094,x=hero.x+Math.cos(a)*38*k,y=hero.y-44*k+Math.sin(a)*16*k;
      ctx.globalAlpha=.85;if(s)ctx.drawImage(s,x-5,y-11,10,22);}
    ctx.restore();
  }
  Art.hero(ctx,hero,tick,worn,k);
  if(wardHp>0){
    ctx.save();ctx.globalCompositeOperation='lighter';
    const pulse=.5+.15*Math.sin(tick*5);
    drawEllipseGlow(ctx,hero.x,hero.y-50*k,40*k,70*k,'#7fb6ff',.18*pulse+.1);
    ctx.globalAlpha=.55;ctx.strokeStyle='#a9d4ff';ctx.lineWidth=1.5;
    ctx.beginPath();
    for(let i=0;i<=6;i++){const a=i*Math.PI/3+tick*.8,x=hero.x+Math.cos(a)*34*k,y=hero.y-50*k+Math.sin(a)*58*k;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.stroke();ctx.restore();
  }
}
function missileDraw(m){
  const ang=Math.atan2(m.vy,m.vx),lift=28;
  // 地面投影
  ctx.globalAlpha=.35;ellipse(m.x,m.y,9,3,'#000');ctx.globalAlpha=1;
  ctx.save();ctx.globalCompositeOperation='lighter';
  const x=m.x,y=m.y-lift;
  if(m.kind==='ember'){
    drawGlow(ctx,x,y,30,'#ff6a1f',.55);
    drawGlow(ctx,x,y,14,'#ffd27a',1,true);
    for(let i=1;i<=4;i++)drawGlow(ctx,x-Math.cos(ang)*i*9,y-Math.sin(ang)*i*9+Math.sin(tick*20+i)*2,11-i*1.6,'#ff7a2a',.6-i*.1);
  }else if(m.kind==='shard'){
    drawGlow(ctx,x,y,24,'#58b8ff',.5);
    ctx.translate(x,y);ctx.rotate(ang);ctx.globalAlpha=1;
    ctx.fillStyle='#9fe3ff';ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-4,-7);ctx.lineTo(-16,0);ctx.lineTo(-4,7);ctx.closePath();ctx.fill();
    ctx.fillStyle='#effcff';ctx.beginPath();ctx.moveTo(15,0);ctx.lineTo(-2,-3);ctx.lineTo(-10,0);ctx.lineTo(-2,3);ctx.closePath();ctx.fill();
  }else{
    const v=m.kind==='void';
    drawGlow(ctx,x,y,v?28:22,v?'#b45cf0':'#8f7fd0',.6);
    drawGlow(ctx,x,y,v?12:9,v?'#f0c8ff':'#d8d0ff',1,true);
  }
  ctx.restore();
}
function drawPortal(p){
  const pulse=Math.sin(tick*2.7)*4;
  ctx.save();ctx.translate(p.x,p.y);
  ctx.globalCompositeOperation='lighter';
  drawEllipseGlow(ctx,0,8,96+pulse,40+pulse/2,'#6fb6f4',.45);
  ctx.globalAlpha=.8;ctx.strokeStyle='#9fd0f5';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(0,8,74+pulse,29+pulse/3,0,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#f2c88b';ctx.lineWidth=2;
  for(let n=0;n<8;n++){const a=n*Math.PI/4+tick*.4;ctx.beginPath();ctx.moveTo(Math.cos(a)*56,8+Math.sin(a)*23);ctx.lineTo(Math.cos(a)*70,8+Math.sin(a)*29);ctx.stroke();}
  for(let n=0;n<6;n++){const a=tick*1.3+n;drawGlow(ctx,Math.cos(a)*50,8+Math.sin(a)*20-((tick*40+n*20)%60),5,'#bfe4ff',.7);}
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
  ctx.textAlign='center';ctx.font='bold 16px system-ui';ctx.strokeStyle='#07111ce8';ctx.lineWidth=4;ctx.strokeText('✦ 地图传送阵 ✦',0,-65);ctx.fillStyle='#f4d19b';ctx.fillText('✦ 地图传送阵 ✦',0,-65);ctx.restore();
}
// 闪电折线：每帧重新随机，形成跳动感
function bolt(x1,y1,x2,y2,jitter,segments){
  ctx.beginPath();ctx.moveTo(x1,y1);
  for(let i=1;i<segments;i++){const t=i/segments,nx=-(y2-y1),ny=x2-x1,l=Math.hypot(nx,ny)||1,o=(Math.random()-.5)*jitter;
    ctx.lineTo(x1+(x2-x1)*t+nx/l*o,y1+(y2-y1)*t+ny/l*o);}
  ctx.lineTo(x2,y2);
}
function drawHazard(h){
  const T=h.type;
  if(T==='chain'){
    const a=clamp(h.life/.22,0,1),x1=h.x,y1=h.y-46,x2=h.x2,y2=h.y2-40;
    ctx.globalAlpha=.45*a;ctx.strokeStyle='#9d77f1';ctx.lineWidth=9;bolt(x1,y1,x2,y2,26,9);ctx.stroke();
    ctx.globalAlpha=a;ctx.strokeStyle='#efe6ff';ctx.lineWidth=2.4;bolt(x1,y1,x2,y2,22,9);ctx.stroke();
    if(Math.random()<.6){const t=.3+Math.random()*.4,mx=x1+(x2-x1)*t,my=y1+(y2-y1)*t;ctx.lineWidth=1.4;bolt(mx,my,mx+(Math.random()-.5)*70,my+(Math.random()-.2)*60,14,4);ctx.stroke();}
    drawGlow(ctx,x2,y2,34,'#c8a0ff',a*.8,true);
    return;
  }
  if(T==='blink'){
    const a=clamp(h.life/.35,0,1);
    ctx.globalAlpha=.5*a;ctx.strokeStyle='#b48cff';ctx.lineWidth=14*a;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(h.x,h.y-36);ctx.lineTo(h.x2,h.y2-36);ctx.stroke();
    drawEllipseGlow(ctx,h.x,h.y-36,30,50,'#a77bff',a*.7);
    return;
  }
  if(T==='nova'){
    const p=1-clamp(h.life/.45,0,1),r=h.max*Math.sqrt(p),a=1-p;
    drawEllipseGlow(ctx,h.x,h.y,r*1.05,r*.6,'#59b6ff',.25*a);
    ctx.globalAlpha=.9*a;ctx.strokeStyle='#c8f2ff';ctx.lineWidth=3+6*a;
    ctx.beginPath();ctx.ellipse(h.x,h.y,Math.max(2,r),Math.max(2,r*.58),0,0,Math.PI*2);ctx.stroke();
    // 冰刺
    ctx.fillStyle='#e6fbff';ctx.globalAlpha=a;ctx.beginPath();
    for(let i=0;i<26;i++){const t=i/26*Math.PI*2,cx=h.x+Math.cos(t)*r,cy=h.y+Math.sin(t)*r*.58,len=10+8*((i*7)%3);
      ctx.moveTo(cx-4,cy);ctx.lineTo(cx+Math.cos(t)*2,cy-len);ctx.lineTo(cx+4,cy);}
    ctx.fill();
    return;
  }
  if(T==='meteor'){
    if(!h.triggered){
      // 预警圈 + 从天而降的陨火
      const p=clamp((1-h.life)/.75,0,1);
      drawEllipseGlow(ctx,h.x,h.y,125*p+20,72*p+12,'#ff5a1a',.25+.2*p);
      ctx.globalAlpha=.7;ctx.strokeStyle='#ff9a50';ctx.lineWidth=2;ctx.setLineDash([10,8]);ctx.lineDashOffset=-tick*40;
      ctx.beginPath();ctx.ellipse(h.x,h.y,125,72,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      const sx=h.x+260*(1-p),sy=h.y-560*(1-p)-20;
      for(let i=6;i>=0;i--)drawGlow(ctx,sx+i*14,sy-i*30,26-i*2.6,i<2?'#ffd27a':'#ff6a1f',.75-i*.09,i===0);
      drawGlow(ctx,sx,sy,58,'#ff7a2a',.5);
    }else{
      const p=clamp((.25-h.life)/.25,0,1),a=1-p;
      drawGlow(ctx,h.x,h.y-20,190*(.6+p*.5),'#ff7a2a',.85*a,true);
      ctx.globalAlpha=a;ctx.strokeStyle='#ffd8a0';ctx.lineWidth=6*a+1;
      ctx.beginPath();ctx.ellipse(h.x,h.y,40+150*p,(40+150*p)*.58,0,0,Math.PI*2);ctx.stroke();
    }
    return;
  }
  if(T==='storm'){
    const a=clamp(h.life,0,1),R=h.max;
    drawEllipseGlow(ctx,h.x,h.y,R*1.1,R*.66,'#4d9fff',.28*a);
    ctx.globalAlpha=.35*a;ctx.strokeStyle='#bfe8ff';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(h.x,h.y,R,R*.58,0,0,Math.PI*2);ctx.stroke();
    const s=shardSprite('#d9f6ff');
    for(let i=0;i<14;i++){
      // 旋转的雪片
      const ang=tick*(1.2+(i%3)*.5)+i*2.4,rr=R*(.25+((i*37)%70)/100);
      drawGlow(ctx,h.x+Math.cos(ang)*rr,h.y+Math.sin(ang)*rr*.58-12-(i%4)*6,3.5,'#e8fbff',.8*a);
    }
    for(let i=0;i<7;i++){
      // 斜落的冰锥，落地闪一下
      const cyc=tick*2.2+i*.37,f=cyc%1,seed=Math.floor(cyc)*31+i*17;
      const gx=h.x+(((seed*73)%200)/100-1)*R*.8,gy=h.y+(((seed*41)%200)/100-1)*R*.45;
      const x=gx+60*(1-f),y=gy-150*(1-f);
      if(s){ctx.globalAlpha=a;ctx.save();ctx.translate(x,y);ctx.rotate(-.38);ctx.drawImage(s,-4,-16,8,32);ctx.restore();}
      if(f>.85)drawGlow(ctx,gx,gy,16,'#bdeaff',a*(f-.85)*6,true);
    }
    return;
  }
  if(T==='inferno'){
    const a=clamp(h.life,0,1);
    drawEllipseGlow(ctx,h.x,h.y,48,26,'#ff4a12',.4*a);
    for(let i=0;i<5;i++){
      const ph=tick*3+h.seed+i*1.3,rise=(ph%1),x=h.x+Math.sin(i*2.1+h.seed)*18,y=h.y-rise*46;
      drawGlow(ctx,x+Math.sin(ph*4)*3,y,(16-rise*9),rise<.4?'#ffd27a':'#ff6a1f',a*(1-rise)*.95,rise<.25);
    }
    return;
  }
  // void 等其它：紫色冲击圈
  const a=clamp(h.life/.6,0,1);
  drawEllipseGlow(ctx,h.x,h.y,h.r*1.1,h.r*.66,'#a05ae0',.35*a);
  ctx.globalAlpha=.8*a;ctx.strokeStyle='#d6a8ff';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(h.x,h.y,Math.max(2,h.r),Math.max(2,h.r*.58),0,0,Math.PI*2);ctx.stroke();
}
const AMBIENT=[.74,.76,.77,.78,.77,.78,.74,.76,.77];
function lightPass(){
  lighting.begin(vw,vh,cam,AMBIENT[profile.region]??.66);
  lighting.light(hero.x,hero.y-30,mobileMode()?280:330,1);
  lighting.light(hero.x,hero.y-30,150,.6);
  for(const t of dungeon.torches)lighting.light(t.x,t.y-10,230+Math.sin(tick*7+t.x)*10,.9);
  for(const m of missiles)lighting.light(m.x,m.y-20,m.kind==='ember'?120:90,.7);
  for(const h of hazards){
    if(h.type==='meteor')lighting.light(h.x,h.y,h.triggered?320:150,h.triggered?1:.5);
    else if(h.type==='storm')lighting.light(h.x,h.y,200,.55);
    else if(h.type==='inferno')lighting.light(h.x,h.y-10,120,.6);
    else if(h.type==='nova')lighting.light(h.x,h.y,260,.7*clamp(h.life/.45,0,1));
    else if(h.type==='chain')lighting.light(h.x2,h.y2-30,130,.8);
  }
  for(const e of vfx)if(e.age<.3)lighting.light(e.x,e.y,110,.6*(1-e.age/.3));
  for(const d of drops)lighting.light(d.x,d.y-10,60+(d.item.rarity|0)*14,.7);
  if(portal)lighting.light(portal.x,portal.y,230,.9);
  lighting.end(ctx);
}
function render(){
  if(!hero){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#121b22';ctx.fillRect(0,0,vw,vh);return;}
  const dt=Math.min(.05,(performance.now()-(render.last||performance.now()))/1000);render.last=performance.now();
  const off=shakeOffset(shake,dt);
  cam.x=clamp(hero.x-vw/2,0,Math.max(0,WIDTH-vw))+off.x;
  cam.y=clamp(hero.y-vh/2,0,Math.max(0,HEIGHT-vh))+off.y;
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;ctx.fillStyle='#07090d';ctx.fillRect(0,0,vw,vh);
  ctx.save();ctx.translate(-Math.round(cam.x),-Math.round(cam.y));
  floorDraw();
  drawDecals(ctx,decals,cam,vw,vh);
  Art.scenery(ctx,cam,vw,vh,WIDTH,HEIGHT,tick,profile.region,dungeon.seed);
  // 地面法术（冰暴、火径、预警圈）画在角色下面
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const h of hazards)if(h.type==='storm'||h.type==='inferno'||h.type==='nova'||(h.type==='meteor'&&!h.triggered)){ctx.globalAlpha=1;drawHazard(h);}
  ctx.restore();
  // Painter's order: stonework and props occlude actors when they stand behind them.
  const layers=[];
  for(const b of dungeon.blocks)if(b.x+b.w>cam.x-160&&b.x<cam.x+vw+160&&b.y+b.h>cam.y-150&&b.y<cam.y+vh+160)
    layers.push({y:b.y+b.h+9,render:()=>stoneDraw(b)});
  for(const t of dungeon.torches)if(t.x>cam.x-160&&t.x<cam.x+vw+160&&t.y>cam.y-160&&t.y<cam.y+vh+160)
    layers.push({y:t.y+13,render:()=>torchDraw(t)});
  for(const d of drops)if(d.x>cam.x-80&&d.x<cam.x+vw+80&&d.y>cam.y-80&&d.y<cam.y+vh+120)layers.push({y:d.y+7,render:()=>Art.loot(ctx,d,tick)});
  if(portal)layers.push({y:portal.y+12,render:()=>drawPortal(portal)});
  for(const e of enemies)if(e.x>cam.x-140&&e.x<cam.x+vw+140&&e.y>cam.y-60&&e.y<cam.y+vh+200)layers.push({y:e.y+10,render:()=>enemyDraw(e)});
  layers.push({y:hero.y+10,render:heroDraw});
  layers.sort((a,b)=>a.y-b.y);
  for(const layer of layers)layer.render();
  for(const m of missiles)missileDraw(m);
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const h of hazards)if(!(h.type==='storm'||h.type==='inferno'||h.type==='nova'||(h.type==='meteor'&&!h.triggered))){ctx.globalAlpha=1;drawHazard(h);}
  ctx.restore();
  paintVfx(ctx,vfx,tick);
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const p of particles)drawGlow(ctx,p.x,p.y,p.size*1.8,p.color,clamp(p.life/p.max,0,1)*.9);
  ctx.restore();ctx.globalAlpha=1;
  ctx.restore();
  // 光照：黑暗遮罩 + 光源挖洞
  lightPass();
  ctx.save();ctx.translate(-Math.round(cam.x),-Math.round(cam.y));
  // Labels stay above loot until it is physically picked up.
  ctx.textAlign='center';ctx.font='bold 13px system-ui';
  for(const drop of drops){
    if(drop.x<cam.x-120||drop.x>cam.x+vw+120||drop.y<cam.y-120||drop.y>cam.y+vh+120)continue;
    const label=drop.item.name,y=drop.y-78-(drop.item.rarity|0)*4;
    ctx.lineWidth=4;ctx.strokeStyle='#090b10ed';ctx.strokeText(label,drop.x,y);
    ctx.fillStyle=palette.rare[drop.item.rarity];ctx.fillText(label,drop.x,y);
  }
  for(const big of [false,true]){
    ctx.font=big?'900 21px system-ui':'bold 15px system-ui';
    for(const f of texts){
      if(!!f.big!==big)continue;
      const age=.85-f.life,pop=big&&age<.12?1+(.12-age)*4:1;
      ctx.globalAlpha=clamp(f.life*1.6,0,1);
      ctx.save();ctx.translate(f.x,f.y);ctx.scale(pop,pop);
      ctx.lineWidth=3;ctx.strokeStyle='#000c';ctx.strokeText(f.text,0,0);ctx.fillStyle=f.color;ctx.fillText(f.text,0,0);
      ctx.restore();
    }
  }
  ctx.globalAlpha=1;ctx.restore();
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
  if(state==='playing'&&$('inventory').hidden&&$('portal-panel').hidden){
    if(hitStop>0){hitStop-=dt;tickVfx(vfx,dt*.25);}else update(dt);
  }
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
  if(k==='escape'){if(!$('portal-panel').hidden)closePortalMenu();else if(!$('inventory').hidden)closeInventory();else onPause();return;}
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
    encounterInfo:()=>({kills,total,alive:enemies.length,elite:enemies.filter(e=>e.elite).length,waves:WAVE_COUNT,skin:profile.heroSkin,effects:vfx.length}),
    castPreview:(key)=>{if(!SKILLS[key])throw new Error('invalid skill');hero.mana=1000;cooldowns[key]=0;cast(key);return {count:vfx.length,skill:key};},
    bossTest:()=>{
      if(state!=='playing')throw new Error('start game first');
      enemies.length=0;kills=total;
      const e=spawn('boss',{x:hero.x+180,y:hero.y-20});
      e.hp=1;dealDamage(e,10000,'fire');
      return {state,bossDefeated,drops:drops.map(d=>({name:d.item.name,rarity:d.item.rarity,persistent:!!d.persistent})),
        pending:profile.pendingLoot.length,bossKills:profile.bossKills[profile.region]};
    }
  };
}
build();state='intro';requestAnimationFrame(loop);
