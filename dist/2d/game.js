import * as Art from './art.js';
import {MATERIALS,sanitizeMaterials,dismantle,dismantleAll,autoDismantleDrop,canTemper,temper,temperCost} from './crafting.js';
import { BOSS_POOLS, rollBossRewards } from './boss-loot.js';
import {destinationOptions,pickRandomDestination,validateDestination} from './travel.js';
import {ENCOUNTER_COUNT,WAVE_SIZE,WAVE_COUNT,MAX_LIVE_ENEMIES,encounterWave,nextWaveForKills,shouldSummonBoss} from './encounters.js';
import {MONSTERS,TIER,REGION_MONSTERS,ELITE_MOD_NAMES,SCHOOL_COLOR,bossFor,waveMonsters} from './monsters.js';
import {emitVfx,tickVfx,paintVfx} from './spell-vfx.js';
import {buildsOf,buildById} from './builds.js';
import {heroRig} from './pixel-mage-demo.js';
import {SKILL_BAL} from './balance.js';
import {Lighting,drawGlow,drawEllipseGlow,shardSprite,addDecal,tickDecals,drawDecals,shakeOffset} from './fx.js';
import {drawDungeonDetail} from './dungeon-detail.js';
import { SLOTS, SLOT_IDS, MAX_ITEMS, MAX_LEVEL, AFFIXES, RARITIES, RARITY_COLORS, SET_COLOR, LEGACY_SLOTS, SKILLS, SKILL_SCHOOLS, ACTIVE_LIMIT, keyLabel, CLASSES, CLASS_IDS, skillsOf, SETS, REGION_DATA, formatAffixes, makeLoot, rollDrops, DROP_RULES, GAMBLE_SLOTS, gambleCost, gambleItem, starterKit, itemScore, itemPowers, catalogEntry, isBow, normalizeItem, PARAGON, paragonPoints } from './systems.js';
import {describePower,skillLegend,PROC_FX} from './legendary.js';
import {DIFFICULTIES,difficultyUnlocked,monsterLevel as areaMonsterLevel,xpFactor,monsterHpMult,monsterDmgMult,armorDR} from './progression.js';
import {LocalStore,STASH_SIZE} from './storage.js';
import {createHeroSelect,CLASS_INFO} from './hero-select.js';
import {skillIcon} from './ui-icons.js';
import {HUD_STRIP} from './hud-strip-layout.js';
import {stepMotion,steer} from './motion.js';
import {loreFor} from './naming.js';
import { TILE, WIDTH, HEIGHT, START, SAVE_KEY, clamp, distance, mulberry32, makeDungeon, walkable, moveWithCollision, freshSave, sanitizeSave, rebindKey, switchClass, respec, autoEquip, smartEquip, combatRating, blinkLanding, stats, expRequired, gainXp, createItem, equip, salvage, upgradeSkill, rankCap, paragonLeft, addParagon, resetParagon, sanitizeActive } from './core.js';
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d'), minimap = $('minimap').getContext('2d');
const ui = { hp: $('hp-num'), mana: $('mana-num'), level: $('level'), xp: $('xp-fill'), gold: $('gold'), essence: $('essence'),
  boss: $('boss-ui'), bossHp: $('boss-meter'), title: $('quest-title'), progress: $('quest-progress'), log: $('eventlog') };
const skillData = SKILLS;
const keys = new Set(), pointers = new Set(), joystick = { id:null, x:0, y:0 };
let vw = 0, vh = 0, dpr = 1, cam = {x:0,y:0}, profile, dungeon, rng, hero;
let enemies = [], missiles = [], drops = [], particles = [], texts = [], hazards = [], vfx = [], state = 'intro', tick = 0, last = 0;
let bladesBal = 1, thunderBal = 1, dying = [], decals = [], summons = [], allies = [], buffs = [], corpses = [], pending = [], statusOpen = false, hasteUntil = 0, bladesUntil = 0, bladesTimer = 0, thunderUntil = 0, thunderTimer = 0, heldSlots = new Set(), capturingSlot = null, hitStop = 0, hudTimer = 0, floorChunks = new Map(), floorKey = '';
const shake = {amount:0}, lighting = new Lighting();
let mouseScreen = null, kills = 0, total = ENCOUNTER_COUNT, boss = null, frameIndex = 0, nextId = 1, manualAim = null, messageTimes = new Map();

const cooldowns=Object.fromEntries(Object.keys(SKILLS).map(k=>[k,0]));
let armorUntil=0, wardHp=0, combo=0, bossDefeated=false, portal=null, selectedItemId=null, selectedRingSlot=null;
const palette = { stone:'#262d34', stoneEdge:'#11171e', gold:'#e5b777', ice:'#91dcfa', fire:'#ff9a57', rare:RARITY_COLORS };
// v0.7：多角色（storage.js）。每个角色职业固定；旧版单存档首次打开时迁移成第一个角色。
const store=new LocalStore();
store.migrateLegacy();
let charId=store.active();
profile=charId?sanitizeSave(store.load(charId)):freshSave();
/** 新角色的初始存档：职业固定，技能栏用该职业默认配置。 */
function freshProfile(cls){
  const p=freshSave();p.heroClass=cls;p.activeSkills=sanitizeActive(cls,null);
  // v0.7.2：新角色带一把本职业的普通武器和一件胸甲
  let k=0;for(const it of starterKit(cls,()=>'start-'+cls+'-'+(k++))){p.inventory.push(it);p.equipped[it.slot]=it.id;}
  return p;
}
// 仅本地 QA 用：原地切换职业（正式界面里职业随角色固定）。
function applyClass(cls,quiet=false){
  if(!switchClass(profile,cls))return;
  allies=[];buffs=[];hsCache=null;wardHp=0;
  Object.keys(cooldowns).forEach(k=>cooldowns[k]=0);
  if(hero){const s=heroStats();hero.cls=cls;hero.maxHp=s.hp;hero.maxMana=s.mana;hero.hp=Math.min(hero.hp,s.hp);hero.mana=Math.min(hero.mana,s.mana);}
  document.querySelector('.orb.energy small').textContent=CLASSES[cls].resource;
  persist();renderSkillBar();if(!$('inventory').hidden)renderInventory();renderStatus();
  if(!quiet)announce('职业切换：'+CLASSES[cls].name+' · '+CLASSES[cls].title,true);
}
document.querySelector('.orb.energy small').textContent=CLASSES[profile.heroClass].resource;

// 本趟是否已在地上掉过传奇以上 / 暗金（用于厄运保护按「趟」计）
let tripLoot={legend:false,unique:false};
// ───── 角色状态面板（C 键）与增益栏 ─────
function renderStatus(){
  const panel=$('status-panel');if(!panel||panel.hidden)return;
  const s=heroStats(),C=CLASSES[profile.heroClass],pct=v=>Math.round(v)+'%';
  const dps=Math.round(s.power*s.dmgMult*(1+s.crit/100*s.critDmg/100)*(s.attack.speed||1)*s.aspdMult/.5);
  const sections=[
    ['角色',[['名字',profile.name||'—'],['职业',C.name],['等级',profile.level+' / '+MAX_LEVEL],['经验',profile.level>=MAX_LEVEL?'已满级':profile.xp+' / '+expRequired(profile.level)],['难度',DIFFICULTIES[profile.difficulty|0].name],['怪物等级',monsterLevel()],['已净化',profile.clears],['金币',profile.gold],['技能点',profile.skillPoints],['巅峰点',paragonLeft(profile)+' / '+paragonPoints(profile.level)],['厄运保护','传奇 '+(profile.pity?.legendary|0)+'/'+DROP_RULES.pity.legendary+' · 暗金 '+(profile.pity?.unique|0)+'/'+DROP_RULES.pity.unique+' 趟']]],
    ['生存',[['生命',Math.ceil(hero?.hp??s.hp)+' / '+s.hp],[C.resource,Math.ceil(hero?.mana??s.mana)+' / '+s.mana],['每秒回复',s.regen.toFixed(1)],['护甲',s.armor],['护甲减伤',pct(armorDR(s.armor,monsterLevel())*100)],['额外减伤',pct(s.mods.dr*100)],['护盾',Math.ceil(wardHp)],['移动速度',pct(s.moveMult*100)]]],
    ['输出',[[C.power,s.power],['伤害加成',pct((s.dmgMult-1)*100)],['暴击率',pct(s.crit)],['暴击伤害',pct(s.critDmg)],['攻击/施法速度',pct(s.aspdMult*100)],['吸血',(s.lifesteal?s.lifesteal+'/击 ':'')+(s.mods.lifePct?pct(s.mods.lifePct*100):'')||'0'],['估算每秒伤害',dps],['技能等级加成','+'+s.classSkill],['冷却缩减',pct(s.cdr)],['寻宝几率',pct(s.mf)]]],
    ['武器',[['武器',s.weapon||'空手'],['攻击方式',{melee:'近战',bow:'射箭',throw:'投掷',spell:'法术弹'}[s.attack.mode]],['攻速倍率','×'+(s.attack.speed||1)],['擅长武器',s.weapon?(s.proficient?'是 · 伤害 +15%':'否'):'—'],['擅长副手',s.offProficient?'是':'—']]],
    ['元素加成',[['火焰',pct(s.fire)],['冰霜',pct(s.cold)],['雷电',pct(s.lightning)],['毒素',pct(s.poison)],['神圣',pct(s.holy)],['暗影',pct(s.shadow)],['物理',pct(s.physical)]]],
    ['抗性'+(s.resPenalty?'（难度 '+s.resPenalty+'%）':''),[['火焰抗性',pct(s.resistFire)],['冰霜抗性',pct(s.resistCold)],['暗影抗性',pct(s.resistDark)]]]
  ];
  panel.replaceChildren();
  const head=document.createElement('div');head.className='status-head';
  const title=document.createElement('strong');title.textContent=C.name+' · '+C.title;
  const close=document.createElement('button');close.type='button';close.textContent='✕';close.setAttribute('aria-label','关闭状态面板');close.onclick=()=>toggleStatus(false);
  head.append(title,close);panel.append(head);
  panel.style.setProperty('--cls',CLASS_INFO[profile.heroClass]?.color||'#d6a660');
  // v0.7.1：顶部四块关键数值
  const hpNow=Math.ceil(hero?.hp??s.hp),mpNow=Math.ceil(hero?.mana??s.mana);
  const tiles=document.createElement('div');tiles.className='status-tiles';
  for(const [k,v,cls,ratio] of [['生命',hpNow+' / '+s.hp,'t-hp',hpNow/s.hp],[C.resource,mpNow+' / '+s.mana,'t-mp',mpNow/s.mana],['战力',combatRating(profile),'t-dps',null],['每秒伤害(估)',dps,'t-arm',null]]){
    const t=document.createElement('div');t.className='status-tile '+cls;
    const b=document.createElement('b');b.textContent=v;const sm=document.createElement('small');sm.textContent=k;t.append(sm,b);
    if(ratio!=null){const bar=document.createElement('i');bar.style.width=Math.max(0,Math.min(100,ratio*100))+'%';t.append(bar);}
    tiles.append(t);
  }
  panel.append(tiles);
  const body=document.createElement('div');body.className='status-body';panel.append(body);
  for(const [name,rows] of sections){
    const sec=document.createElement('section');sec.className='status-sec';
    const h=document.createElement('h4');h.textContent=name;sec.append(h);
    const grid=document.createElement('dl');
    for(const [k,v] of rows){const dt=document.createElement('dt');dt.textContent=k;const dd=document.createElement('dd');dd.textContent=v;grid.append(dt,dd);}
    sec.append(grid);body.append(sec);
  }
  const active=buffs.filter(b=>b.until>tick);
  const bsec=document.createElement('section');bsec.className='status-sec status-wide';const h=document.createElement('h4');h.textContent='生效中的增益';bsec.append(h);body.append(bsec);
  const list=document.createElement('p');list.className='status-buffs';
  list.textContent=active.length?active.map(b=>(SKILLS[b.id]?.name||b.id.replace(/^hit_/,''))+(b.dur<59?' '+Math.ceil(b.until-tick)+'秒':'')).join(' · '):'无';
  bsec.append(list);
  const sets=Object.entries(s.sets||{}).filter(([,n])=>n>0);
  if(sets.length){const p=document.createElement('p');p.className='status-buffs';p.textContent='套装：'+sets.map(([id,n])=>SETS[id].name+' '+n+'/'+SETS[id].size).join(' · ');bsec.append(p);}
  const powers=[];for(const id of Object.values(profile.equipped)){const it=profile.inventory.find(i=>i.id===id);if(it&&(it.req||1)<=profile.level)for(const pw of itemPowers(it))powers.push(it.name+'：'+describePower(pw));}
  if(powers.length){const psec=document.createElement('section');psec.className='status-sec status-wide';const h2=document.createElement('h4');h2.textContent='传奇特效';psec.append(h2);const ul=document.createElement('ul');ul.className='status-powers';for(const t of powers){const li=document.createElement('li');li.textContent=t;ul.append(li);}psec.append(ul);body.append(psec);}
  if(allies.length){const p=document.createElement('p');p.className='status-buffs';p.textContent='随从/陷阱：'+allies.length+' 个';bsec.append(p);}
}
function toggleStatus(force){
  const panel=$('status-panel');panel.hidden=force===undefined?!panel.hidden:!force;
  if(!panel.hidden)renderStatus();
}
$('btn-status').onclick=()=>toggleStatus();
function renderBuffBar(){
  const bar=$('buffbar');if(!bar)return;
  const list=buffs.filter(b=>b.until>tick&&SKILLS[b.id]);
  if(wardHp>0)list.push({id:'__ward',label:'护盾',icon:'⬡',left:Math.ceil(wardHp)});
  if(armorUntil>tick)list.push({id:'__armor',label:'冰甲',icon:'◆',left:Math.ceil(armorUntil-tick)+'s'});
  if(hasted())list.push({id:'__haste',label:'迅捷',icon:'➶',left:Math.ceil(hasteUntil-tick)+'s'});
  const key=list.map(b=>b.id+':'+(b.left??Math.ceil(b.until-tick))).join('|');
  if(bar.dataset.key===key)return;bar.dataset.key=key;bar.replaceChildren();
  for(const b of list){const sk=SKILLS[b.id];const el=document.createElement('span');el.className='buff skill-'+(sk?.school||'arcane');
    const i=sk?skillIcon(b.id,0,'buff-ico'):document.createElement('b');if(!sk)i.textContent=b.icon;const t=document.createElement('small');
    t.textContent=b.left??(b.dur>=59?'∞':Math.ceil(b.until-tick)+'s');el.title=sk?.name||b.label;el.append(i,t);bar.append(el);}
}
function renderSkillBar(){
  const bar=$('abilitybar');bar.replaceChildren();
  profile.activeSkills.forEach((key,slot)=>{
    const meta=SKILLS[key];if(!meta)return;
    const button=document.createElement('button');button.type='button';button.dataset.skill=key;button.dataset.slot=String(slot);
    button.className='skill-'+meta.school;
    const kbd=document.createElement('kbd');kbd.className='slot-key';kbd.textContent=keyLabel(profile.keybinds[slot]||'')+(slot===0?' · 左键':slot===1?' · 右键':'');
    const icon=skillIcon(key,0,'ability-icon');
    const label=document.createElement('b');label.textContent=meta.name;
    const cost=document.createElement('small');cost.textContent=meta.mana?meta.mana+' '+CLASSES[profile.heroClass].resource:'无消耗';
    const cooldown=document.createElement('i');button.append(kbd,icon,label,cost,cooldown);bar.append(button);
  });
  layoutGhud();
  const tip=document.querySelector('.tip');
  if(tip)tip.textContent='WASD 移动 · 鼠标瞄准 · 左键/右键 = 第 1/2 格技能 · 技能键可在行囊（B）里自定义 · B 背包';
}
// 技能栏与按键设置：每格可换技能、可改按键（点按钮后按下新键；Esc 取消）。
function renderLoadout(){
  const box=$('skill-loadout');if(!box)return;box.replaceChildren();
  profile.activeSkills.forEach((key,slot)=>{
    const row=document.createElement('div');row.className='loadout-row';
    const num=document.createElement('span');num.className='loadout-num';num.textContent=(slot+1)+(slot===0?' · 左键':slot===1?' · 右键':'');
    const keyBtn=document.createElement('button');keyBtn.type='button';keyBtn.className='key-bind'+(capturingSlot===slot?' is-capturing':'');
    keyBtn.textContent=capturingSlot===slot?'按下新按键…':keyLabel(profile.keybinds[slot]);
    keyBtn.setAttribute('aria-label','第 '+(slot+1)+' 格按键：'+keyLabel(profile.keybinds[slot])+'，点击修改');
    keyBtn.onclick=()=>{capturingSlot=capturingSlot===slot?null:slot;renderLoadout();};
    const select=document.createElement('select');select.className='skill-slot';select.setAttribute('aria-label','第 '+(slot+1)+' 格技能');
    const C=CLASSES[profile.heroClass];
    for(const [tree,label] of Object.entries(C.trees)){
      const group=document.createElement('optgroup');group.label=label;
      for(const [id,sk] of Object.entries(SKILLS)){
        if(sk.cls!==profile.heroClass||sk.tree!==tree)continue;
        const opt=document.createElement('option');opt.value=id;
        const locked=profile.level<sk.unlocked;
        opt.textContent=sk.name+(locked?'（'+sk.unlocked+' 级）':'');opt.disabled=locked&&id!==key;
        group.append(opt);
      }
      select.append(group);
    }
    select.value=key;
    select.onchange=()=>{
      const id=select.value,prev=profile.activeSkills.indexOf(id);
      if(prev>=0&&prev!==slot)profile.activeSkills[prev]=profile.activeSkills[slot];
      profile.activeSkills[slot]=id;
      persist();renderSkillBar();renderLoadout();updateHud();announce(SKILLS[id].name+' 已放入第 '+(slot+1)+' 格',true);
    };
    row.append(num,keyBtn,skillIcon(key,0,'loadout-ico'),select);box.append(row);
  });
}
const AFFIX_LABEL=k=>({power:CLASSES[profile.heroClass].power,hp:'生命',mana:CLASSES[profile.heroClass].resource,armor:'护甲'})[k]||AFFIXES[k]?.name.replace(' %','')||k;
function renderBuildGuide(){
  const box=$('build-guide');if(!box)return;box.replaceChildren();
  const cls=profile.heroClass,list=buildsOf(cls),cur=buildById(cls,profile.builds?.[cls]);
  const tabs=document.createElement('div');tabs.className='build-tabs';
  for(const b of list){const t=document.createElement('button');t.type='button';t.textContent=b.name;t.className=b.id===cur.id?'is-active':'';
    t.onclick=()=>{profile.builds=profile.builds||{};profile.builds[cls]=b.id;persist();renderBuildGuide();};tabs.append(t);}
  const desc=document.createElement('p');desc.className='build-desc';desc.textContent=cur.desc;
  const skills=document.createElement('div');skills.className='build-skills';
  cur.skills.forEach((k,i)=>{const sk=SKILLS[k],el=document.createElement('span');el.className='skill-'+sk.school+(profile.level<sk.unlocked?' locked':'');
    el.title=sk.name+(profile.level<sk.unlocked?'（'+sk.unlocked+' 级解锁）':'');el.append(skillIcon(k,0,'build-ico'));const n=document.createElement('small');n.textContent=sk.name;el.append(n);skills.append(el);});
  const top=Object.entries(cur.weights).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k])=>AFFIX_LABEL(k));
  const aff=document.createElement('p');aff.className='build-line';aff.textContent='词条优先：'+top.join(' > ');
  const wpn=document.createElement('p');wpn.className='build-line';wpn.textContent='推荐武器：'+cur.weapons.join('、');
  const tips=document.createElement('ul');tips.className='build-tips';for(const t of cur.tips){const li=document.createElement('li');li.textContent=t;tips.append(li);}
  const actions=document.createElement('div');actions.className='build-actions';
  const eq=document.createElement('button');eq.type='button';eq.className='primary';eq.textContent='一键穿戴（按「'+cur.name+'」）';
  eq.onclick=()=>{profile.builds=profile.builds||{};profile.builds[profile.heroClass]=cur.id;runSmartEquip(cur.id);};
  const sk=document.createElement('button');sk.type='button';sk.textContent='套用推荐技能栏';
  sk.onclick=()=>{profile.activeSkills=[...cur.skills];persist();renderSkillBar();renderInventory();announce('技能栏已套用「'+cur.name+'」',true);};
  const spent=skillsOf(cls).reduce((n,k)=>n+(profile.skillRanks[k]||0),0);
  const rs=document.createElement('button');rs.type='button';rs.textContent='洗点（返还 '+spent+' 点）';rs.disabled=!spent;
  rs.onclick=()=>{if(!confirm('重置'+CLASSES[cls].name+'的全部技能点？测试版免费，其他职业不受影响。'))return;const n=respec(profile);persist();renderInventory();renderSkillBar();announce('洗点完成 · 返还 '+n+' 技能点',true);};
  actions.append(eq,sk,rs);
  box.append(tabs,desc,skills,aff,wpn,tips,actions);
}
function finishRebind(k){
  const slot=capturingSlot;capturingSlot=null;
  if(k==='escape'){renderLoadout();return;}
  if(rebindKey(profile,slot,k)){persist();renderSkillBar();announce('第 '+(slot+1)+' 格按键改为 '+keyLabel(k),true);}
  else announce('这个键不能用（WASD、B、T、Esc 等已被占用）',true);
  renderLoadout();
}
renderSkillBar();
const regionSelect=$('region-select');
REGION_DATA.forEach((region,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=region.name;regionSelect.append(option);});
regionSelect.value=String(profile.region);
const difficultySelect=$('difficulty-select');
DIFFICULTIES.forEach(D=>{const o=document.createElement('option');o.value=String(D.id);o.textContent=D.name;difficultySelect.append(o);});
/** 区域与难度下拉：显示区域等级，未解锁的难度不可选。 */
function refreshWorldPickers(){
  const D=DIFFICULTIES[profile.difficulty|0];
  [...regionSelect.options].forEach((o,i)=>{o.textContent=REGION_DATA[i].name+' · Lv '+D.area[i];});
  [...difficultySelect.options].forEach((o,i)=>{const ok=difficultyUnlocked(profile,i);o.disabled=!ok;o.textContent=DIFFICULTIES[i].name+(ok?'':'（'+DIFFICULTIES[i].unlockLevel+' 级）');});
  regionSelect.value=String(profile.region);difficultySelect.value=String(profile.difficulty|0);
}
difficultySelect.addEventListener('change',()=>{
  const next=Number(difficultySelect.value);
  if(next===(profile.difficulty|0))return;
  if(!difficultyUnlocked(profile,next)){refreshWorldPickers();announce('该难度尚未解锁',true);return;}
  if(state==='playing'&&!confirm('切换难度将重新开始当前远征。继续吗？')){refreshWorldPickers();return;}
  profile.difficulty=next;refreshWorldPickers();build();persist();if(state==='victory'||state==='death')state='intro';
  announce('难度：'+DIFFICULTIES[next].name+' · 怪物等级 '+monsterLevel(),true);
});
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

function persist() { if(!charId)return; if(!store.save(charId,profile))announce('浏览器无法保存。请在行囊内导出角色备份。', true); }
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
// v0.8：怪物成群分散在地图各处待命（D2 式营地），走近才会察觉；第 3 波从远处慢慢围拢。
function packCenter(minHero,used){
  for(let n=0;n<300;n++){
    const x=200+rng()*(WIDTH-400),y=200+rng()*(HEIGHT-400);
    if(distance({x,y},hero)<minHero||!walkable(x,y,40,dungeon))continue;
    if(used.some(c=>distance(c,{x,y})<360))continue;
    return {x,y};
  }
  return randomPoint(minHero);
}
function spawnWave(index,{hunters=index>=2}={}){
  const group=waveMonsters(profile.region,index,rng),used=enemies.filter(e=>e.home).map(e=>e.home);
  let packId=0;
  for(let i=0;i<group.length;){
    const size=3+Math.floor(rng()*4),center=hunters?packCenter(700,used):packCenter(560,used);used.push(center);packId++;
    for(let k=0;k<size&&i<group.length;k++,i++){
      if(enemies.length>=MAX_LIVE_ENEMIES)break;
      let p=null;
      for(let t=0;t<30&&!p;t++){const a=rng()*6.28,r=20+rng()*85,q={x:center.x+Math.cos(a)*r,y:center.y+Math.sin(a)*r};if(walkable(q.x,q.y,24,dungeon)&&!enemies.some(e=>distance(e,q)<40))p=q;}
      const e=spawn(group[i],p||center);
      e.home={x:e.x,y:e.y};e.pack=index*100+packId;e.aware=hunters;e.hunter=hunters;e.awareT=0;e.wanderT=rng()*3;
    }
  }
  if(index===2)announce('第 3 波 · 守门军团从远处逼近',true);
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
  enemies=[];missiles=[];drops=[];particles=[];texts=[];hazards=[];vfx=[];dying=[];decals=[];summons=[];allies=[];buffs=[];corpses=[];pending=[];hasteUntil=0;bladesUntil=0;thunderUntil=0;heldSlots.clear();hitStop=0;shake.amount=0;kills=0;tripLoot={legend:false,unique:false};boss=null;nextId=1;tick=0;manualAim=null;armorUntil=0;wardHp=0;combo=0;bossDefeated=false;portal=null;
  $('portal-panel').hidden=true;$('portal-open').hidden=true;
  for(const [i,pending] of profile.pendingLoot.entries())if(pending.region===profile.region)
    drops.push({x:START.x+40+(i%4)*38,y:START.y-50-Math.floor(i/4)*43,item:pending.item,age:0,persistent:true});
  $('region-select').value=String(profile.region);$('region-name').textContent=REGION_DATA[profile.region].name;
  Object.keys(cooldowns).forEach(k=>cooldowns[k]=0);
  spawnWave(0);spawnWave(1);
  ui.boss.hidden=true;
  ui.title.textContent='净化 · '+REGION_DATA[profile.region].name;$('map-label').textContent=REGION_DATA[profile.region].label;ui.progress.textContent='击败 '+total+' 名怪物（成群分布在地图各处），引出首领';
  updateHud();
}
// v0.7 怪物等级：由难度与区域决定（progression.js），在难度上限内随角色成长；各项属性随等级成长（见 docs/2D-BALANCE.md）
function monsterLevel(boss=false){return areaMonsterLevel(profile,boss);}
function monsterStats(mon){
  const T=TIER[mon.tier],boss=mon.tier==='boss',L=monsterLevel(boss),D=DIFFICULTIES[profile.difficulty|0];
  return {level:L,hp:Math.round(T.hp*mon.hp*monsterHpMult(L,profile.difficulty|0)),dmg:T.dmg*mon.dmg*monsterDmgMult(L,profile.difficulty|0),
    speed:T.speed*mon.spd*[1,1.05,1.1][profile.difficulty|0],radius:T.radius*(mon.ai==='tank'?1.2:mon.ai==='swarm'?.85:1),xp:Math.round(T.xp*(1+(L-1)*.04)*D.xp*xpFactor(profile.level,L))};
}
function spawn(kind,location=null) {
  const p=location||randomPoint();
  const id=kind==='boss'?bossFor(profile.region,profile.bossKills[profile.difficulty|0][profile.region]||0):MONSTERS[kind]?kind:REGION_MONSTERS[profile.region].normal[0];
  const mon=MONSTERS[id],st=monsterStats(mon),isBoss=mon.tier==='boss';
  const e={id:nextId++,x:p.x,y:p.y,kind:isBoss?'boss':id,mid:id,mon,tier:mon.tier,elite:mon.tier==='elite',level:st.level,hp:st.hp,maxHp:st.hp,dmg:st.dmg,xp:st.xp,
    speed:st.speed,radius:st.radius,attack:.6+rng()*1.2,slow:0,phase:rng()*6.28,windup:0,act:null,modT:2+rng()*2,moveT:2.5,moveI:0,spawnT:0};
  enemies.push(e);
  if(isBoss){boss=e;ui.boss.hidden=false;ui.boss.querySelector('span').textContent=mon.name;announce('地窟深处，'+mon.name+'已苏醒！',true);}
  return e;
}
function wakeEnemy(e){
  if(e.aware!==false)return;e.aware=true;e.awareT=0;e.wakeIn=null;e.attack=Math.max(e.attack,.6+rng()*.6);
  floatText(e.x,e.y-(e.tier==='elite'?70:54),'!','#ff7a5a');
  for(const o of enemies)if(o!==e&&o.aware===false&&o.wakeIn==null&&(o.pack===e.pack||distance(o,e)<240))o.wakeIn=.25+rng()*.9;
}
function begin() { hideModal(); build(); state='playing'; clearInput(); persist(); announce('第 1 波 · 地窟徘徊者',true); upgradeCheck(); }
function clearInput(){keys.clear();pointers.clear();heldSlots.clear();joystick.x=joystick.y=0;joystick.id=null;$('stick').style.transform='';}
function showModal(kind) {
  const previousState=state;
  clearInput();state=kind==='victory'?'victory':kind==='death'?'death':'paused';
  const title=$('modal').querySelector('h1'), lead=$('modal').querySelector('.lead'), paragraphs=$('modal').querySelectorAll('p');
  const main=$('modal-primary'), secondary=$('modal-secondary');
  $('scrim').hidden=false; secondary.hidden=true;title.classList.remove('logo-title');
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
    paragraphs[1].textContent='WASD 移动，技能自动锁定鼠标附近或最近的敌人；左键、右键分别施放技能栏第 1、2 格，其余格子按对应按键（默认 1-5、Q、E、R、F、空格），按住可连续施放。按 B 打开行囊，在“技能栏与按键”里换技能和改按键，60 级后在“巅峰天赋”里加点；按 C 打开角色状态面板。顶栏可切换难度（普通 / 噩梦 / 地狱）和区域，点“角色”回到角色选择。手机使用摇杆和技能按钮。靠近光柱自动拾取。';
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
// v0.7.1 手机顶栏：难度、区域、操作、暂停收进「更多」下拉，点外面或选完自动收起
const topbarEl=document.querySelector('.topbar');
function setTopMenu(open){topbarEl.classList.toggle('menu-open',open);$('btn-menu').setAttribute('aria-expanded',String(open));}
$('btn-menu').onclick=e=>{e.stopPropagation();setTopMenu(!topbarEl.classList.contains('menu-open'));};
$('top-more').addEventListener('click',e=>{if(e.target.closest('button'))setTopMenu(false);});
$('top-more').addEventListener('change',()=>setTopMenu(false));
document.addEventListener('pointerdown',e=>{if(topbarEl.classList.contains('menu-open')&&!e.target.closest('.topbar'))setTopMenu(false);},true);
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
// ───── v0.7.3 战力与一键换装 ─────
function runSmartEquip(buildId=null){
  let res=null;applyEquipmentChange(()=>{res=smartEquip(profile,buildId);});
  const gain=res.after-res.before,pctGain=res.before?Math.round(gain/res.before*100):0;
  const msg=res.changed.length?'换上 '+res.changed.length+' 个部位 · 战力 '+res.before+' → '+res.after+(pctGain?'（+'+pctGain+'%）':''):'已经是最强搭配 · 战力 '+res.after;
  announce(msg,true);const m=$('smart-msg');if(m)m.textContent=msg;
  upgradeCheck(true);return res;
}
$('btn-smart').onclick=()=>runSmartEquip();
$('upgrade-chip').onclick=()=>runSmartEquip();
// 拾取 / 赌博 / 取回后检查是否有更好的搭配（节流，避免每帧计算）
let upgradeTimer=0;
function upgradeCheck(now=false){
  clearTimeout(upgradeTimer);
  const run=()=>{
    if(!profile)return;
    const r=smartEquip(profile,null,{dry:true}),gain=r.after-r.before;
    const show=r.changed.length>0&&gain>=Math.max(3,r.before*.02);
    $('upgrade-chip').hidden=!show||state!=='playing';
    $('upgrade-gain').textContent='战力 +'+gain;
    $('btn-inventory').classList.toggle('has-upgrade',show);
  };
  if(now)run();else upgradeTimer=setTimeout(run,250);
}
// ───── 赌博（金币 → 指定部位随机装备） ─────
const GAMBLE_NAMES={weapon:'武器',offhand:'副手',head:'头盔',robe:'胸甲',gloves:'手套',boots:'靴子',belt:'腰带',ring1:'戒指',amulet:'项链'};
function refreshGamble(){
  const sel=$('gamble-slot');if(!sel)return;
  const cur=sel.value||'weapon';
  sel.replaceChildren(...GAMBLE_SLOTS.map(slot=>{const o=document.createElement('option');o.value=slot;o.textContent=GAMBLE_NAMES[slot]+' · '+gambleCost(profile.level,slot)+' 金币';return o;}));
  sel.value=cur;
  const cost=gambleCost(profile.level,sel.value);
  $('gamble-go').disabled=profile.gold<cost||profile.inventory.length>=MAX_ITEMS;
  $('gamble-go').textContent='赌一件（'+cost+' 金币）';
}
$('gamble-slot').onchange=refreshGamble;
$('gamble-go').onclick=()=>{
  const slot=$('gamble-slot').value,cost=gambleCost(profile.level,slot);
  if(profile.gold<cost||profile.inventory.length>=MAX_ITEMS)return;
  const item=gambleItem(rng,profile.level,slot,'gamble-'+Date.now()+'-'+(nextId++),profile.heroClass);
  if(!item)return;
  profile.gold-=cost;profile.inventory.push(item);
  if(item.rarity>=3&&profile.pity){profile.pity.legendary=0;if(item.rarity===4&&!item.setId)profile.pity.unique=0;}
  persist();
  $('gamble-msg').textContent='获得 '+RARITIES[item.rarity]+(item.setId?'（套装）':'')+'：'+item.name;
  $('gamble-msg').style.color=item.setId?SET_COLOR:RARITY_COLORS[item.rarity];
  selectedItemId=item.id;renderInventory();updateHud();upgradeCheck();
};
function refreshCraftingPanel(){
  refreshGamble();
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
  const title=document.createElement('h3');title.className='rarity-'+item.rarity+(item.setId?' rarity-set':'');title.textContent=item.name;
  const meta=document.createElement('small');meta.textContent=(item.setId?'套装':RARITIES[item.rarity])+' · 物品等级 '+item.ilvl+' · '+slotLabel(item);
  const tooLow=(item.req||1)>profile.level;
  const reqLine=document.createElement('small');reqLine.className='item-req'+(tooLow?' is-blocked':'');reqLine.textContent='需求等级 '+(item.req||1)+(tooLow?'（当前 '+profile.level+' 级，不能穿戴）':'');
  const preview=document.createElement('canvas');preview.className='item-preview';preview.setAttribute('aria-label',item.name+' 装备图标');Art.drawItemIcon(preview,item);
  panel.append(preview,title,meta,reqLine);
  if(item.tempered){const stamp=document.createElement('p');stamp.className='score-up';stamp.textContent='✦ 已淬炼强化';panel.append(stamp);}
  const list=document.createElement('ul');
  for(const line of formatAffixes(item)){const li=document.createElement('li');li.textContent=line;list.append(li);}
  if(!list.childElementCount){const li=document.createElement('li');li.textContent='基础装备 · 无额外词缀';list.append(li);}
  panel.append(list);
  const info=catalogEntry(item);
  const powers=itemPowers(item);
  if(powers.length){
    const fx=document.createElement('div');fx.className='item-effect rarity-'+item.rarity;
    const h=document.createElement('strong');h.textContent='✦ 传奇特效';fx.append(h);
    const ul=document.createElement('ul');for(const pw of powers){const li=document.createElement('li');li.textContent=describePower(pw);ul.append(li);}fx.append(ul);
    if(info?.owner&&info.owner!==profile.heroClass){const n=document.createElement('small');n.textContent='这是'+CLASSES[info.owner].name+'的传奇：技能相关特效只对该职业生效，可以放进共享仓库转给对应角色。';fx.append(n);}
    panel.append(fx);
  }
  if(info?.cls){const fit=document.createElement('small');fit.className='item-class';fit.textContent='偏好职业：'+info.cls+(info.h===2?' · 双手'+(isBow(item)?'（可配箭袋）':''):'');panel.append(fit);}
  if(info?.lore&&item.rarity===4){const lore=document.createElement('p');lore.className='item-lore';lore.textContent=loreFor(info,item.name);panel.append(lore);}
  if(item.legacy){const old=document.createElement('p');old.className='score-down';old.textContent='旧版装备槽已取消：不能穿戴，可以分解换材料。';panel.append(old);}
  if(item.setId){
    const set=SETS[item.setId],count=Object.values(profile.equipped).map(id=>profile.inventory.find(i=>i.id===id)).filter(i=>i?.setId===item.setId).length;
    const p=document.createElement('p');p.className='set-description';p.textContent=set.name+'（已装备 '+count+'/'+set.size+'）'+Object.entries(set.text).map(([n,t])=>' · '+n+' 件：'+t).join('');panel.append(p);
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
  // v0.7.3：用真实「战力」比较（试穿后整套重算，含套装、传奇特效、双手武器占副手）
  const crNow=combatRating(profile);let crTry=crNow;
  if(!tooLow&&!(worn&&worn.id===item.id)){const trial={...profile,equipped:{...profile.equipped}};if(equip(trial,item.id,target))crTry=combatRating(trial);}
  const delta=crTry-crNow;
  const compare=document.createElement('p');compare.className=delta>=0?'score-up':'score-down';
  compare.textContent=tooLow?'需求等级不足，穿上不生效':worn&&worn.id===item.id?'正在穿着 · 战力 '+crNow:'相对当前 '+SLOTS.find(x=>x[0]===target)?.[1]+' · 战力 '+(delta>0?'+':'')+delta+'（'+crNow+' → '+crTry+'）';
  panel.append(compare);
  if(worn&&worn.id!==item.id){
    const current=document.createElement('p');current.className='current-gear';
    current.textContent='目前装备：'+worn.name;panel.append(current);
  }
  // Show REAL character stat changes, not an ungrounded gear-score alone.
  const alternative={...profile,equipped:{...profile.equipped}};
  equip(alternative,item.id,target);
  const before=stats(profile),after=stats(alternative);
  const keys=[['power','法术强度'],['hp','生命'],['mana','法力'],['armor','护甲'],['crit','暴击率'],['haste','施法速度'],['fire','火焰增伤'],['cold','冰霜增伤'],['lightning','雷电增伤']];
  const differences=keys.filter(([key])=>before[key]!==after[key]);
  if(differences.length){
    const heading=document.createElement('h4');heading.textContent='穿戴后属性变化';panel.append(heading);
    const grid=document.createElement('div');grid.className='stat-diff-grid';
    for(const [key,label] of differences){
      const d=after[key]-before[key],line=document.createElement('span');
      line.className=d>=0?'score-up':'score-down';
      line.textContent=label+' '+(d>0?'+':'')+d+(key==='crit'||key==='haste'||key==='fire'||key==='cold'||key==='lightning'?'%':'');
      grid.append(line);
    }
    panel.append(grid);
  }
  const quick=$('inv-quick-equip');
  const wornHere=profile.equipped[target]===item.id;
  quick.disabled=!!item.legacy||tooLow&&!wornHere;
  quick.textContent=item.legacy?'旧版装备 · 只能分解':wornHere?'卸下 '+item.name:tooLow?'需要 '+item.req+' 级':'直接穿戴 '+item.name;
  if(item.legacy||tooLow&&!wornHere)$('mobile-equip').disabled=true;
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
// ───── 共享仓库（所有角色共用，storage.js） ─────
function depositStash(id){
  const item=profile.inventory.find(i=>i.id===id);if(!item||Object.values(profile.equipped).includes(id))return;
  const stash=store.stash();if(stash.length>=STASH_SIZE){announce('共享仓库已满（'+STASH_SIZE+' 格）',true);return;}
  stash.push(item);if(!store.saveStash(stash)){announce('仓库保存失败',true);return;}
  profile.inventory.splice(profile.inventory.indexOf(item),1);if(selectedItemId===id)selectedItemId=null;
  persist();renderInventory();announce('已存入共享仓库：'+item.name,true);
}
function withdrawStash(id){
  const stash=store.stash(),i=stash.findIndex(x=>x?.id===id);if(i<0)return;
  if(profile.inventory.length>=MAX_ITEMS){announce('背包已满',true);return;}
  const item=normalizeItem(stash[i]);stash.splice(i,1);
  if(item&&!profile.inventory.some(x=>x.id===item.id))profile.inventory.push(item);
  store.saveStash(stash);persist();renderInventory();if(item)announce('已取回：'+item.name,true);
}
function renderStash(){
  const box=$('stash-items');if(!box)return;box.replaceChildren();
  const stash=store.stash().map(normalizeItem).filter(Boolean);
  $('stash-count').textContent=stash.length+' / '+STASH_SIZE;
  if(!stash.length){const p=document.createElement('p');p.className='empty';p.textContent='仓库是空的。在背包里点「存仓」，其他角色就能取用。';box.append(p);return;}
  for(const item of stash){
    const b=document.createElement('button');b.type='button';b.className='stash-item';b.title=item.name+' · 点击取回';
    const img=document.createElement('canvas');img.className='item-thumbnail';Art.drawItemIcon(img,item);
    const n=document.createElement('small');n.className='rarity-'+item.rarity+(item.setId?' rarity-set':'');n.textContent=item.name;
    b.append(img,n);b.onclick=()=>withdrawStash(item.id);box.append(b);
  }
}
// ───── 巅峰天赋（60 级后每级 1 点） ─────
function renderParagon(){
  const box=$('paragon');if(!box)return;box.replaceChildren();
  const total=paragonPoints(profile.level),left=paragonLeft(profile);
  $('paragon-count').textContent=profile.level<=60?'61 级解锁':'剩余 '+left+' / '+total+' 点';
  for(const [k,P] of Object.entries(PARAGON)){
    const v=profile.paragon?.[k]||0,b=document.createElement('button');b.type='button';b.className='paragon-node'+(v?' has-points':'');
    b.disabled=left<1||v>=P.max;
    const name=document.createElement('strong');name.textContent=P.name+' '+v+'/'+P.max;
    const d=document.createElement('small');d.textContent=P.desc+' / 点'+(v?' · 当前 +'+v*P.per+(k==='dmg'||k==='hp'||k==='crit'||k==='critDmg'||k==='haste'||k==='cdr'||k==='res'||k==='armor'||k==='regen'||k==='move'||k==='mf'?'%':''):'');
    b.append(name,d);b.onclick=()=>{if(addParagon(profile,k)){hsCache=null;applyEquipmentChange(()=>{});}};box.append(b);
  }
  const reset=document.createElement('button');reset.type='button';reset.className='paragon-reset';reset.textContent='重置巅峰点';reset.disabled=!Object.keys(profile.paragon||{}).length;
  reset.onclick=()=>{if(confirm('返还全部巅峰点？')){resetParagon(profile);hsCache=null;applyEquipmentChange(()=>{});}};box.append(reset);
}
function renderInventory(){
  refreshCraftingPanel();
  $('cr-now').textContent=String(combatRating(profile));
  const statsNow=stats(profile),statFields=[
    ['等级',profile.level],['法术强度',statsNow.power],['生命',statsNow.hp],['法力',statsNow.mana],
    ['护甲',statsNow.armor],['暴击',statsNow.crit+'%'],['施法速度',statsNow.haste+'%'],
    ['火焰加成',statsNow.fire+'%'],['冰霜加成',statsNow.cold+'%'],['雷电加成',statsNow.lightning+'%'],
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
    const wpn=profile.inventory.find(i=>i.id===profile.equipped.weapon);
    const blocked=slot==='offhand'&&!item&&wpn?.hands===2&&!isBow(wpn);
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
    const desc=document.createElement('small');const low=(item.req||1)>profile.level;
    desc.textContent=(item.setId?'套装':RARITIES[item.rarity])+' · '+slotLabel(item)+' · '+(itemPowers(item).length?'传奇特效 · ':'')+(item.affixes?.length||0)+' 条词缀'+(low?' · 需 '+item.req+' 级':'');if(low)desc.classList.add('is-blocked');
    if(item.setId)title.classList.add('rarity-set');
    const img=document.createElement('canvas');img.className='item-thumbnail';img.setAttribute('aria-hidden','true');Art.drawItemIcon(img,item);
    const labels=document.createElement('span');labels.className='item-labels';labels.append(title,desc);
    detail.append(img,labels);detail.onclick=()=>selectEquipmentItem(item);
    detail.ondblclick=()=>{selectedItemId=item.id;applyEquipmentChange(()=>equip(profile,item.id,
      item.slot.startsWith('ring')?(!profile.equipped.ring1?'ring1':!profile.equipped.ring2?'ring2':item.slot):null));};
    const actions=document.createElement('div');actions.className='item-actions';
    const worn=Object.values(profile.equipped).includes(item.id);
    const use=document.createElement('button');use.textContent=worn?'已装备':item.legacy?'旧版':low?item.req+' 级':'装备';use.disabled=worn||!!item.legacy||low;
    use.onclick=()=>{selectedItemId=item.id;applyEquipmentChange(()=>equip(profile,item.id,
      item.slot.startsWith('ring')?(!profile.equipped.ring1?'ring1':!profile.equipped.ring2?'ring2':item.slot):null));};
    const favorite=document.createElement('button');favorite.textContent=item.favorite?'★ 保留':'☆ 收藏';
    favorite.setAttribute('aria-label',item.favorite?'取消保留 '+item.name:'保护 '+item.name);
    favorite.onclick=()=>{item.favorite=!item.favorite;persist();renderInventory();};
    const recycle=document.createElement('button');recycle.textContent='分解';recycle.disabled=worn||item.favorite;
    recycle.onclick=()=>{if(selectedItemId===item.id)selectedItemId=null;applyEquipmentChange(()=>dismantle(profile,item.id));};
    const toStash=document.createElement('button');toStash.textContent='存仓';toStash.disabled=worn;toStash.title='放进共享仓库（所有角色共用）';
    toStash.onclick=()=>depositStash(item.id);
    actions.append(use,favorite,toStash,recycle);node.append(detail,actions);bag.append(node);
  }
  inspectItem(profile.inventory.find(i=>i.id===selectedItemId)||null);
  renderStash();renderParagon();
  renderBuildGuide();
  renderLoadout();
  const skillPanel=$('skill-catalog');skillPanel.replaceChildren();
  const C=CLASSES[profile.heroClass];
  $('skill-catalog-title').textContent=C.name+'技能图鉴 · '+skillsOf(profile.heroClass).length+' 项';
  for(const [tree,label] of Object.entries(C.trees)){
    const head=document.createElement('h4');head.className='skill-school';head.textContent=label;skillPanel.append(head);
    for(const [key,skill] of Object.entries(SKILLS)){
      if(skill.cls!==profile.heroClass||skill.tree!==tree)continue;const school=skill.school;
      const btn=document.createElement('button');btn.type='button';
      const rank=profile.skillRanks[key]||0,locked=profile.level<skill.unlocked;
      btn.className='catalog-skill skill-'+school+(locked?' unavailable':'');
      const icon=skillIcon(key,0,'catalog-icon');
      const text=document.createElement('span');text.className='catalog-text';
      const cap=rankCap(profile.level),bonusRank=skillLegend(statsNow.legend,key).rank+statsNow.classSkill;
      const name=document.createElement('strong');name.textContent=skill.name+' · '+rank+'/'+cap+(bonusRank?'（+'+bonusRank+'）':'')+(profile.activeSkills.includes(key)?' · 第 '+(profile.activeSkills.indexOf(key)+1)+' 格':'');
      const desc=document.createElement('small');
      desc.textContent=skill.desc+' · '+(skill.mana?skill.mana+' '+CLASSES[profile.heroClass].resource:'无消耗')+' · 冷却 '+skill.cooldown+' 秒'+(locked?' · '+skill.unlocked+' 级解锁':profile.skillPoints>0&&rank<cap?' · 点击升级':'');
      text.append(name,desc);btn.append(icon,text);
      btn.disabled=locked||profile.skillPoints<=0||rank>=cap;
      btn.onclick=()=>{
        if(upgradeSkill(profile,key)){persist();renderInventory();announce(skill.name+' 已升至 '+profile.skillRanks[key]+' 级',true);}
      };
      skillPanel.append(btn);
    }
  }
}
$('export-save').onclick=()=>{
  const blob=new Blob([JSON.stringify(profile,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='guixu-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
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
// ───── v0.9 电脑版状态栏（左下 art/hud-strip.webp + hud-strip-layout.js，右下技能面板） ─────
function ghudOn(){return !window.matchMedia('(max-width:900px), (max-height:560px) and (pointer:coarse)').matches;}
function placeIn(el,r){el.style.left=r[0]+'%';el.style.top=r[1]+'%';el.style.width=r[2]+'%';el.style.height=r[3]+'%';}
// v0.9：生命 / 资源条在左下（art/hud-strip.webp），技能栏单独放在右下，互不挤压
function layoutGhud(){
  const on=ghudOn(),g=$('ghud');g.hidden=!on;document.body.classList.toggle('ghud-on',on);
  const bar=$('abilitybar'),buffs=$('buffbar'),slots=$('gh-slots');
  if(on){
    if(bar.parentElement!==slots)slots.append(bar);if(buffs.parentElement!==g.querySelector('.gh-right'))g.querySelector('.gh-right').prepend(buffs);
    const L=HUD_STRIP,left=g.querySelector('.gh-left');
    placeIn(left.querySelector('.gh-orb.hp'),L.orbL);placeIn(left.querySelector('.gh-orb.mp'),L.orbR);
    placeIn(left.querySelector('.gh-bar.hp'),L.hpBar);placeIn(left.querySelector('.gh-bar.mp'),L.mpBar);
    placeIn(left.querySelector('.gh-txt.hp'),L.hpText);placeIn(left.querySelector('.gh-txt.mp'),L.mpText);placeIn(left.querySelector('.gh-lv'),L.lv);
    [...bar.children].forEach((b,i)=>{b.style.left=b.style.top=b.style.width=b.style.height='';
      let k=b.querySelector('.gh-key');if(!k){k=document.createElement('span');k.className='gh-key';b.append(k);}
      k.textContent=keyLabel(profile?.keybinds?.[i]||'')+(i===0?'·L':i===1?'·R':'');});
  }else{
    const foot=document.querySelector('footer.hud');if(bar.parentElement!==foot)foot.insertBefore(bar,foot.querySelector('.resource'));
    if(buffs.parentElement!==document.body)document.body.insertBefore(buffs,g);
    bar.querySelectorAll('.gh-key').forEach(k=>k.remove());buffs.style.cssText='';
  }
}
window.matchMedia('(max-width:900px), (max-height:560px) and (pointer:coarse)').addEventListener?.('change',()=>layoutGhud());
for(const b of document.querySelectorAll('.gh-util'))b.onclick=()=>{const a=b.dataset.act;if(a==='status')toggleStatus();else if(a==='bag')$('btn-inventory').click();else showModal('help');};
function updateGhud(s){
  if(!ghudOn())return;
  const hpR=clamp(hero.hp/hero.maxHp,0,1),mpR=clamp(hero.mana/Math.max(1,hero.maxMana),0,1);
  $('gh-hp-fill').style.height=(hpR*100)+'%';$('gh-mp-fill').style.height=(mpR*100)+'%';
  $('gh-hp-bar').style.width=(hpR*100)+'%';$('gh-mp-bar').style.width=(mpR*100)+'%';
  $('gh-hp-now').textContent=Math.ceil(hero.hp);$('gh-hp-max').textContent=Math.ceil(hero.maxHp);
  $('gh-mp-now').textContent=Math.ceil(hero.mana);$('gh-mp-max').textContent=Math.ceil(hero.maxMana);
  $('gh-mp-label').textContent=CLASSES[profile.heroClass].resource;
  $('gh-lv').textContent=profile.level;$('gh-cls').textContent=(profile.name||'')+' · '+CLASSES[profile.heroClass].name;
  $('gh-xp').style.width=(profile.level>=MAX_LEVEL?100:profile.xp/expRequired(profile.level)*100)+'%';
  document.querySelector('.gh-orb.hp').classList.toggle('low',hpR<.3);
}
function updateHud(){
  if(!hero)return;
  updateGhud();
  const s=stats(profile), xpNeeded=expRequired(profile.level);
  ui.hp.textContent=Math.ceil(hero.hp);ui.mana.textContent=Math.ceil(hero.mana);
  ui.level.textContent='LV '+String(profile.level).padStart(2,'0');ui.gold.textContent=profile.gold;ui.essence.textContent=profile.essence;
  ui.xp.style.width=(profile.level>=MAX_LEVEL?100:profile.xp/xpNeeded*100)+'%';
  ui.progress.textContent=boss?'击败 '+(boss.mon?.name||BOSS_POOLS[profile.region].name)+'，收集专属战利品':bossDefeated?'首领已击败 · 继续拾取装备 / B 查看背包 / 暂停手动重刷':'徘徊者 '+Math.min(kills,total)+' / '+total+' · 靠近掉落自动拾取';
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
const DMG_COLOR={cold:'#bfe9ff',lightning:'#d6d2ff',poison:'#9fe58a',holy:'#ffe48a',shadow:'#d0a6ff',fire:'#ffb070',arcane:'#e0c8ff'};
const VFX_OF={fire:'fire',cold:'ice',lightning:'chain',arcane:'arcane',physical:'physical',poison:'poison',holy:'holy',shadow:'shadow'};
function healHero(n){if(n>0)hero.hp=Math.min(hero.maxHp,hero.hp+n);}
function applyPoison(e,dps,dur){e.poisonDps=Math.max(e.poisonUntil>tick?e.poisonDps:0,dps);e.poisonUntil=tick+dur;e.poisonTick=e.poisonTick||.5;}
// 角色实时属性 = 装备属性 + 增益/光环（每帧缓存一次）
let hsCache=null,hsTick=-1;
function heroStats(){
  if(hsCache&&hsTick===tick)return hsCache;
  const s={...stats(profile)};
  const m={dmg:0,speed:0,aspd:0,dr:0,crit:0,critDmg:0,armorPct:0,hpPct:0,lifePct:0,thorns:0,resist:0,regenPct:0,pierce:0,venom:0,absorbPct:0};
  for(const b of buffs)if(b.until>tick)for(const [k,v] of Object.entries(b.mods||{}))if(typeof v==='number')m[k]=(m[k]||0)+v;
  s.mods=m;s.armor=Math.round(s.armor*(1+m.armorPct));s.hp=Math.round(s.hp*(1+m.hpPct));
  s.crit=Math.min(95,s.crit+m.crit);s.critDmg+=m.critDmg;
  for(const k of ['resistFire','resistCold','resistDark'])s[k]=Math.min(75,s[k]+m.resist);
  s.regen=s.regen*(1+m.regenPct);s.moveMult=1+m.speed+s.move/100;s.aspdMult=1+m.aspd+s.haste/100;
  m.dr+=(s.legend?.dr||0)/100;
  s.dmgMult=(1+m.dmg+(s.dmgPct||0)/100)*(s.proficient?1.15:1);
  s.form=buffs.find(b=>b.until>tick&&b.mods?.form)?.mods.form||null;
  hsCache=s;hsTick=tick;return s;
}
function floatText(x,y,value,color='#f1ca90',big=false){texts.push({x,y,text:String(value),color,life:.85,big,vx:(Math.random()-.5)*30});if(texts.length>50)texts.shift();}
function injury(amount,src=null){
  if(hero.invuln>0||state!=='playing'||hero.leap)return;
  const defense=heroStats();
  if(src?.weakenUntil>tick)amount*=1-(src.weaken||0);
  if(src&&defense.mods.thorns&&enemies.includes(src))dealDamage(src,amount*defense.mods.thorns,'physical',{noCrit:true});
  const mitigated=Math.max(1,amount*(1-armorDR(defense.armor,src?.level||monsterLevel()))*(armorUntil>tick?.44:1)*(1-clamp(defense.mods.dr,-.5,.75)));
  const absorbed=Math.min(wardHp,mitigated);wardHp-=absorbed;
  const finalDamage=mitigated-absorbed;
  if(absorbed)floatText(hero.x,hero.y-39,'护盾吸收 '+Math.ceil(absorbed),'#add6ff');
  hero.hp=Math.max(0,hero.hp-finalDamage);hero.invuln=.6;
  for(const [i,pr] of defense.legend.procs.entries())if(pr.on==='hurt'&&(procReady[i]||0)<=tick&&rng()*100<pr.chance){procReady[i]=tick+.8;procCast(pr,{x:hero.x,y:hero.y});}
  puff(hero.x,hero.y,absorbed?'#85bae9':'#e46455',13,4,145);
  if(finalDamage)floatText(hero.x,hero.y-30,Math.round(finalDamage),'#ff9990');
  if(hero.hp<=0){persist();showModal('death');announce('持灯者倒下，但成长得以保留',true);}
}
const SCHOOL_STAT={fire:'fire',cold:'cold',lightning:'lightning',physical:'physical',poison:'poison',holy:'holy',shadow:'shadow'};
const ELEMENTAL=new Set(['fire','cold','lightning','poison']);
// ───── 传奇特效的触发技能 ─────
const procReady=[];
function procCast(pr,at){
  if(state!=='playing'||!hero)return;
  const sc=pr.school,P=heroStats().power*pr.mult,o={proc:true};
  const hit=(r,mult=1,extra=null)=>{for(const e of [...enemies])if(Math.hypot(e.x-at.x,e.y-at.y)<r+e.radius){if(extra)extra(e);dealDamage(e,P*mult,sc==='arcane'?'arcane':sc,o);}};
  floatText(at.x,at.y-52,PROC_FX[sc],FX_COLOR[sc]||'#fff');
  switch(sc){
    case 'lightning':{let last=at;const done=new Set();
      for(let k=0;k<5;k++){let best=null,bd=320;for(const e of enemies){if(done.has(e))continue;const d=Math.hypot(e.x-last.x,e.y-last.y);if(d<bd){bd=d;best=e;}}
        if(!best)break;done.add(best);hazards.push({x:last.x,y:last.y,x2:best.x,y2:best.y,type:'chain',r:0,max:1,life:.22});dealDamage(best,P*.8,'lightning',o);last={x:best.x,y:best.y};}
      break;}
    case 'poison':garea(at.x,at.y,{r:110,dur:3,tick:.5,m:pr.mult*.3,fx:'poison'},heroStats().power,1,'poison',0);break;
    default:{
      const r=sc==='physical'?130:150;
      hit(r,1,sc==='cold'?e=>freezeEnemy(e,.8):sc==='physical'?e=>{const d=Math.hypot(e.x-at.x,e.y-at.y)||1;if(e.kind!=='boss')for(let k=0;k<4;k++)moveWithCollision(e,(e.x-at.x)/d*600,(e.y-at.y)/d*600,1/60,dungeon,e.radius);}:null);
      hazards.push({x:at.x,y:at.y,r:0,max:r,life:.45,type:'gnova',fx:sc==='cold'?'ice':sc,color:FX_COLOR[sc]});
      if(sc==='fire')addDecal(decals,at.x,at.y,r*.7,'scorch',3);
      shake.amount=Math.max(shake.amount,2.5);
    }
  }
}
function dealDamage(e,damage,school='physical',opts={}){
  if(!enemies.includes(e))return;
  if(e.aware===false)wakeEnemy(e);
  const bonus=heroStats();
  const LGD=bonus.legend;
  const bonusDamage=(SCHOOL_STAT[school]?bonus[SCHOOL_STAT[school]]||0:0)+(LGD.elem[school]||0);
  damage*=1+bonusDamage/100;
  if(LGD.berserk&&hero.hp<hero.maxHp*.35)damage*=1+LGD.berserk/100;
  if(school==='fire')damage*=1+bonus.skillFire*.09;
  if(school==='cold')damage*=1+bonus.skillCold*.09;
  if(!opts.minion)damage*=bonus.dmgMult;
  if(e.ampUntil>tick)damage*=1+(e.amp||0);
  if(e.elemAmpUntil>tick&&ELEMENTAL.has(school))damage*=1+(e.elemAmp||0);
  if(hero.tiger&&opts.melee){damage*=1+hero.tiger*.25;hero.tiger=0;}
  const crit=!opts.noCrit&&rng()*100<bonus.crit;if(crit)damage*=1+bonus.critDmg/100;
  // 传奇触发：命中 / 暴击时几率释放元素特效（每个特效 0.5 秒内只触发一次；触发出的伤害不会再触发）
  if(!opts.dot&&!opts.proc&&!opts.minion&&LGD.procs.length){
    for(const [i,pr] of LGD.procs.entries()){
      if((pr.on==='hit'||pr.on==='crit'&&crit)&&(procReady[i]||0)<=tick&&rng()*100<pr.chance){procReady[i]=tick+.5;const at={x:e.x,y:e.y};pending.push({t:tick+.06,fn:()=>procCast(pr,at)});}
    }
  }
  if(LGD.leech&&!opts.dot)healHero(damage*LGD.leech/100);
  if(opts.melee&&bonus.mods.venom)applyPoison(e,bonus.power*bonus.mods.venom,3);
  if(opts.life)healHero(damage*opts.life);
  if(bonus.mods.lifePct&&!opts.dot)healHero(damage*bonus.mods.lifePct);
  if(e.lifeTapUntil>tick&&!opts.dot)healHero(damage*(e.lifeTap||0));
  if(school==='fire'&&bonus.sets.dragonflame>=3&&++combo%3===0)damage*=1.45;
  damage=Math.max(1,Math.round(damage));
  if(bonus.lifesteal&&!opts.dot)hero.hp=Math.min(hero.maxHp,hero.hp+bonus.lifesteal);
  e.hp-=damage;e.flash=.11;
  if(e.mon?.mods?.includes('reflect')&&!opts.dot&&!opts.minion)loseHp(Math.min(damage*.05,hero.maxHp*.02),'physical');
  if(crit||e.hp<=0)emitVfx(vfx,VFX_OF[school]||'arcane',e.x,e.y-20,{max:crit?12:7});
  if(crit){shake.amount=Math.max(shake.amount,2.5);}
  floatText(e.x,e.y-38,(crit?'✦ ':'')+damage,crit?'#ffe29b':DMG_COLOR[school]||'#f1ca90',crit);if(!opts.dot)puff(e.x,e.y-18,e.kind==='boss'?'#c88ae2':'#eaa161',4,3);
  if(e.hp>0)return;
  const i=enemies.indexOf(e);if(i>=0)enemies.splice(i,1);
  dying.push({e,t:0});if(dying.length>24)dying.shift();
  emitVfx(vfx,'death',e.x,e.y-18,{max:e.kind==='boss'?40:16});
  corpses.push({x:e.x,y:e.y,kind:e.kind,sprite:e.mon?.sprite,face:e.face||1,scale:e.drawScale||.6,life:14,t:0});if(corpses.length>30)corpses.shift();
  if(e.mon?.deathCloud)enemyPool(e.x,e.y,90,e.dmg*.5,e.mon.school||'poison',3.5);
  if(e.mon?.mods?.includes('explode'))enemyWarn(e.x,e.y,120,e.dmg*2.2,e.mon.school||'fire',.75);
  addDecal(decals,e.x,e.y+4,e.kind==='boss'?70:e.kind==='brute'?40:28,e.kind==='spider'||e.kind==='wretch'?'ash':'blood',6);
  if(e.kind==='boss'){shake.amount=14;hitStop=.12;}
  puff(e.x,e.y-14,e.kind==='boss'?'#e89bff':'#e8904b',12,5,200);
  const bossDied=e.kind==='boss';const advanced=gainXp(profile,e.xp||(bossDied?170:22));
  const goldLv=1+(e.level||1)/25;
  profile.gold+=Math.round((bossDied?150:2+Math.floor(rng()*6))*goldLv);
  const L=heroStats().legend;
  if(L.heal)healHero(hero.maxHp*L.heal/100);
  for(const pr of L.procs)if(pr.on==='kill'&&rng()*100<pr.chance)procCast(pr,e);
  if(advanced){const s=stats(profile);hero.maxHp=s.hp;hero.maxMana=s.mana;hero.hp=s.hp;hero.mana=s.mana;hsCache=null;
    announce('等级提升 · '+profile.level+'级！'+(profile.level>60?' · 获得巅峰点':''),true);refreshWorldPickers();}
  if(!bossDied)for(const item of rollDrops(rng,{source:e.elite?'elite':'normal',level:e.level||monsterLevel(),mf:heroStats().mf,cls:profile.heroClass,difficulty:profile.difficulty|0,newId:()=>'ember2d-'+Date.now()+'-'+nextId++})){if(item.rarity>=3)tripLoot.legend=true;if(item.rarity===4&&!item.setId)tripLoot.unique=true;dropItem(e.x+(rng()-.5)*30,e.y+(rng()-.5)*20,item);}
  if(bossDied){
    const region=profile.region,dif=profile.difficulty|0,previousKills=profile.bossKills[dif][region]||0;
    const reward=rollBossRewards(rng,e.level||monsterLevel(true),region,previousKills,()=> 'boss-'+Date.now()+'-'+(nextId++),{cls:profile.heroClass,mf:heroStats().mf,difficulty:dif,pity:profile.pity});
    profile.bossKills[dif][region]=previousKills+1;profile.pity=reward.pity;if(tripLoot.legend)profile.pity.legendary=0;if(tripLoot.unique)profile.pity.unique=0;
    if(region===8&&previousKills===0&&dif<2)announce(DIFFICULTIES[dif+1].name+'难度已解锁！',true);
    refreshWorldPickers();
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
    announce((reward.firstKill?'首杀奖励！':'首领战利品！')+' '+reward.drops.length+' 件装备 · '+reward.materials+' 精华'+(reward.exclusive?' · 专属传奇！':'')+(reward.forced?' · 保底触发':''),true);
    for(const item of reward.drops)if(item.rarity>=3&&!item.name.includes(BOSS_POOLS[region].item))announce((item.setId?'套装':RARITIES[item.rarity])+'掉落：'+item.name,true);
    ui.title.textContent='首领已击败 · 传送阵已开启';
    ui.progress.textContent='专属奖励已掉落 · 传送阵可选择下一图或随机远征';
  }else{
    kills++;
    const wave=nextWaveForKills(kills);
    if(wave>=2)spawnWave(wave);
    if(shouldSummonBoss(kills,boss))spawn('boss',findBossPoint());
    persist();
  }
}
function dropItem(x,y,item) {
  drops.push({x,y,item,age:0});floatText(x,y-38,item.name,item.setId?SET_COLOR:palette.rare[item.rarity],item.rarity>=3);
  if(item.rarity>=3){announce((item.setId?'套装':RARITIES[item.rarity])+'掉落：'+item.name,true);shake.amount=Math.max(shake.amount,3);}
}
// 瞄准规则（锁敌）：1 鼠标附近 140px 内有敌人 → 锁定它；2 否则锁定 650px 内最近的敌人；
// 3 附近没有敌人 → 朝鼠标方向；4 都没有 → 朝角色面向。鼠标位置每次施法时按当前镜头换算，不会过期。
function cursorWorld(){return mouseScreen?{x:mouseScreen.x+cam.x,y:mouseScreen.y+cam.y}:null;}
function pickTarget(){
  const cur=cursorWorld();
  let target=cur?nearestTo(cur,140):null;
  if(!target)target=nearest(650);
  let angle=hero.angle;
  if(target)angle=Math.atan2(target.y-hero.y,target.x-hero.x);
  else if(cur&&distance(hero,cur)>20)angle=Math.atan2(cur.y-hero.y,cur.x-hero.x);
  return {target,angle};
}
function nearest(range=800){let best=null,d=range;for(const e of enemies){const m=distance(hero,e);if(m<d){best=e;d=m;}}return best;}
// ---------- 施法 ----------
function shoot(o){missiles.push({friendly:true,hits:0,pierce:1,hitR:11,hitIds:new Set(),...o});}
function freezeEnemy(e,t){e.frozen=Math.max(e.frozen||0,e.kind==='boss'?t*.5:t);e.slow=Math.max(e.slow,t+.6);}
function blast(x,y,r,dmg,school,{freeze=0,slow=0}={}){
  for(const e of [...enemies])if(Math.hypot(e.x-x,e.y-y)<r+e.radius){if(freeze)freezeEnemy(e,freeze);if(slow)e.slow=Math.max(e.slow,slow);dealDamage(e,dmg,school);}
}
const hasted=()=>hasteUntil>tick;
const TRAIL={ember:'#ff8a3a',fireball:'#ff9a40',firebolt:'#ff8a3a',shard:'#a9e4ff',iceshard:'#bfeaff',spike:'#9fdcff',orb:'#cdf2ff',cbolt:'#d8d0ff',ball:'#bfc8ff',mm:'#c89cff',arc:'#a9a0ff'};
const AREA_TICK={storm:{every:.55,mult:.31,school:'cold',slow:1.05},inferno:{every:.55,mult:.42,school:'fire'},firewall:{every:.5,mult:.5,school:'fire'},blackhole:{every:.4,mult:.35,school:'arcane',slow:.6}};
function nearestTo(p,range){let best=null,d=range;for(const e of enemies){const m=Math.hypot(e.x-p.x,e.y-p.y);if(m<d){best=e;d=m;}}return best;}
function missileEnd(m){
  if(m.endBlast){blast(m.x,m.y,m.endBlast.r,m.endBlast.damage,m.school);hazards.push({x:m.x,y:m.y,r:0,max:m.endBlast.r,life:.4,type:'burst',fx:'fire'});emitVfx(vfx,'fire',m.x,m.y-12,{max:20,speed:1.8});addDecal(decals,m.x,m.y,m.endBlast.r*.8,'scorch',4);shake.amount=Math.max(shake.amount,5);}
  if(m.explode){
    const x=m.explode;blast(m.x,m.y,x.r,x.damage,m.school,{freeze:x.freeze||0});
    hazards.push({x:m.x,y:m.y,r:0,max:x.r,life:.35,type:'burst',fx:x.fx});
    emitVfx(vfx,x.fx==='ice'?'ice':'fire',m.x,m.y-16,{max:16,speed:1.6});
    addDecal(decals,m.x,m.y,x.r*.8,x.fx==='ice'?'frost':'scorch',3);shake.amount=Math.max(shake.amount,x.fx==='ice'?2:3);
  }
  if(m.burst)for(let k=0;k<m.burst;k++){const t=k/m.burst*Math.PI*2;shoot({x:m.x,y:m.y,vx:Math.cos(t)*460,vy:Math.sin(t)*460,life:.5,kind:'iceshard',school:'cold',damage:m.shardDamage*1.3,slow:1.4});}
}
function updateBuffsAndSummons(dt){
  for(let i=summons.length-1;i>=0;i--){
    const h=summons[i];h.life-=dt;
    if(h.life<=0){summons.splice(i,1);puff(h.x,h.y-20,'#ff8a3a',10,3);continue;}
    if((h.timer-=dt)<=0){
      const t=nearestTo(h,520);
      if(t){h.timer=.75;const a=Math.atan2(t.y-h.y,t.x-h.x);
        shoot({x:h.x+Math.cos(a)*14,y:h.y+Math.sin(a)*14,vx:Math.cos(a)*560,vy:Math.sin(a)*560,life:1,kind:'firebolt',school:'fire',damage:heroStats().power*(h.bal||1)*.38*(1+h.rank*.12)});}
      else h.timer=.2;
    }
  }
  if(bladesUntil>tick&&(bladesTimer-=dt)<=0){
    bladesTimer=.3;const r=1+(profile.skillRanks.blades||0)*.12;
    for(const e of [...enemies]){const d=distance(e,hero);if(d<115+e.radius&&d>20){e.slow=Math.max(e.slow,.8);dealDamage(e,heroStats().power*bladesBal*.45*r,'cold');}}
  }
  if(thunderUntil>tick&&(thunderTimer-=dt)<=0){
    const rank=profile.skillRanks.thunder||0;thunderTimer=Math.max(.6,1-rank*.04);
    const near=enemies.filter(e=>distance(e,hero)<480);
    if(near.length){const e=near[Math.floor(rng()*near.length)];
      hazards.push({x:e.x,y:e.y,type:'strike',r:0,max:1,life:.3});shake.amount=Math.max(shake.amount,2);
      dealDamage(e,heroStats().power*thunderBal*1.6*(1+rank*.12),'lightning');}
  }
}
function cast(skill){
  const rule=SKILLS[skill];
  if(!rule||state!=='playing'||!$('inventory').hidden||!$('portal-panel').hidden||cooldowns[skill]>0||profile.level<rule.unlocked)return;
  const bonus=heroStats(),LG=skillLegend(bonus.legend,skill),cost=Math.round(rule.mana*LG.cost);
  if(hero.mana<cost){announce(CLASSES[profile.heroClass].resource+'不足');return;}
  if(skill==='heal'&&hero.hp>=hero.maxHp)return;
  if(skill==='manasurge'&&hero.mana>=hero.maxMana)return;
  // 平衡系数（balance.js）：把技能伤害对齐到统一预算
  // 传奇特效（legendary.js）：额外技能等级、技能伤害、冷却、消耗、投射物；召唤物伤害与上限
  const minion=['summon','turret'].includes(rule.a)||skill==='hydra';
  const B=SKILL_BAL[skill]||1,rank=(profile.skillRanks[skill]||0)+bonus.classSkill+LG.rank,P=bonus.power*B*LG.dmg*(minion?1+bonus.legend.minionPct/100:1),R=1+rank*.12;
  const cdMult=LG.cd*(1-bonus.cdr/100);
  hero.mana-=cost;
  if(rule.cls!=='mage'){
    const {target,angle}=pickTarget();hero.angle=angle;hero.cast=.25;
    const cd=rule.a==='basic'?rule.cooldown/(bonus.attack.speed||1)/bonus.aspdMult
      :rule.cooldown*(1-Math.min(.16,rank*.02))/(rule.a==='melee'?bonus.aspdMult:1+bonus.haste/140)*(hasted()?.75:1)*cdMult;
    cooldowns[skill]=cd;
    let def=rule;
    if(LG.proj&&rule.a==='proj')def={...rule,n:(rule.n||1)+LG.proj,spread:rule.spread||.14};
    if(minion&&bonus.legend.minionMax&&rule.max)def={...def,max:rule.max+bonus.legend.minionMax};
    castGeneric(skill,def,{target,angle,P,R,rank,bonus,B});
    updateHud();return;
  }
  emitVfx(vfx,skill,hero.x,hero.y-40,{max:vw<=700?10:16,angle:hero.angle});
  cooldowns[skill]=rule.cooldown*(1-bonus.haste/140)*(1-Math.min(.16,rank*.02))*(hasted()?.75:1)*cdMult;
  hero.cast=.3;
  const {target,angle}=pickTarget();
  const dx=Math.cos(angle),dy=Math.sin(angle);hero.angle=angle;
  const hz0=hazards.length,sm0=summons.length;
  const ox=hero.x+dx*25,oy=hero.y+dy*25;
  const aimPoint=(range)=>target&&distance(hero,target)<range?{x:target.x,y:target.y}:{x:hero.x+dx*range*.55,y:hero.y+dy*range*.55};
  switch(skill){
  case 'fire':shoot({x:ox,y:oy,vx:dx*680,vy:dy*680,life:1.1,kind:'ember',school:'fire',damage:P*.66*(1+rank*.13)});break;
  case 'shard':shoot({x:ox,y:oy,vx:dx*570,vy:dy*570,life:1.2,kind:'shard',school:'cold',damage:P*.82*(1+rank*.13),pierce:2,slow:1.5});break;
  case 'fireball':shoot({x:ox,y:oy,vx:dx*520,vy:dy*520,life:1.15,kind:'fireball',school:'fire',damage:P*.9*R,hitR:16,explode:{r:85,damage:P*1.15*R,fx:'fire'}});break;
  case 'glacial':shoot({x:ox,y:oy,vx:dx*600,vy:dy*600,life:1.1,kind:'spike',school:'cold',damage:P*1.2*R,hitR:14,explode:{r:85,damage:P*.6*R,fx:'ice',freeze:1.2+rank*.1}});break;
  case 'frozenorb':shoot({x:ox,y:oy,vx:dx*240,vy:dy*240,life:1.6,kind:'orb',school:'cold',damage:0,pierce:Infinity,noHit:true,emit:.055,emitT:0,spin:0,shardDamage:P*.34*R,burst:14});break;
  case 'cbolt':for(let i=0;i<5;i++){const t=angle+(rng()-.5)*1.5,sp=280+rng()*170;shoot({x:ox,y:oy,vx:Math.cos(t)*sp,vy:Math.sin(t)*sp,life:.95,kind:'cbolt',school:'lightning',damage:P*.45*R,wobble:1});}break;
  case 'ballz':shoot({x:ox,y:oy,vx:dx*190,vy:dy*190,life:2.6,kind:'ball',school:'lightning',damage:P*.42*R,pierce:Infinity,tickHit:.3,hitR:46,hitMap:new Map()});break;
  case 'mmissile':for(let i=-1;i<=1;i++){const t=angle+i*.5;shoot({x:ox,y:oy,vx:Math.cos(t)*430,vy:Math.sin(t)*430,life:1.5,kind:'mm',school:'arcane',damage:P*.55*R,homing:7});}break;
  case 'barrage':for(let i=-3;i<=3;i++){const t=angle+i*.17;shoot({x:ox,y:oy,vx:Math.cos(t)*540,vy:Math.sin(t)*540,life:.9,kind:'arc',school:'arcane',damage:P*.6*R});}break;
  case 'nova':
    emitVfx(vfx,'nova',hero.x,hero.y,{max:28});
    hazards.push({x:hero.x,y:hero.y,r:0,max:196,life:.45,type:'nova'});addDecal(decals,hero.x,hero.y,190,'frost',2.5);shake.amount=Math.max(shake.amount,3);
    for(const e of [...enemies])if(distance(hero,e)<196){e.slow=3;dealDamage(e,P*(1.3+rank*.18),'cold');}
    break;
  case 'firenova':
    hazards.push({x:hero.x,y:hero.y,r:0,max:210,life:.5,type:'fnova'});addDecal(decals,hero.x,hero.y,170,'scorch',4);shake.amount=Math.max(shake.amount,4);
    emitVfx(vfx,'fire',hero.x,hero.y-10,{max:30,speed:2});blast(hero.x,hero.y,210,P*1.2*R,'fire');break;
  case 'lnova':
    hazards.push({x:hero.x,y:hero.y,r:0,max:200,life:.4,type:'lnova'});shake.amount=Math.max(shake.amount,3);
    emitVfx(vfx,'chain',hero.x,hero.y-20,{max:24,speed:2});blast(hero.x,hero.y,200,P*1.05*R,'lightning');break;
  case 'deepfreeze':
    hazards.push({x:hero.x,y:hero.y,r:0,max:260,life:.7,type:'freeze'});addDecal(decals,hero.x,hero.y,250,'frost',4);shake.amount=Math.max(shake.amount,6);hitStop=Math.max(hitStop,.05);
    blast(hero.x,hero.y,260,P*.8*R,'cold',{freeze:2+rank*.1});announce('极寒冻结！',true);break;
  case 'lightning':{
    const len=560,x2=hero.x+dx*len,y2=hero.y+dy*len;
    hazards.push({x:hero.x,y:hero.y,x2,y2,type:'beam',r:0,max:1,life:.25});
    for(const e of [...enemies]){const t=clamp(((e.x-hero.x)*dx+(e.y-hero.y)*dy)/len,0,1),px=hero.x+dx*len*t,py=hero.y+dy*len*t;if(Math.hypot(e.x-px,e.y-py)<e.radius+22&&t>0)dealDamage(e,P*1.3*R,'lightning');}
    break;}
  case 'armor':armorUntil=tick+7+rank*.5;announce('冰甲已激活',true);puff(hero.x,hero.y,'#8bcdf9',22,4,150);break;
  case 'meteor':{
    const dest=aimPoint(600);
    emitVfx(vfx,'meteor',dest.x,dest.y,{max:20});
    hazards.push({x:dest.x,y:dest.y,r:0,max:125,life:1.0,type:'meteor',triggered:false,rank,seed:Math.random()*6});
    break;}
  case 'armageddon':hazards.push({x:hero.x,y:hero.y,r:0,max:1,life:6,type:'rain',timer:0,rank});announce('末日火雨降临！',true);break;
  case 'blink':{
    // 闪现：瞬移，可以穿墙。目标 = 鼠标位置（射程内）或移动方向；落点在墙里时沿路线往回找最近的空地。
    const range=330+rank*40,v=movementVector(),mag=Math.hypot(v.x,v.y),cur=cursorWorld();
    let tx,ty;
    if(cur&&distance(hero,cur)>40&&!(mag>.05)){const d=Math.min(range,distance(hero,cur));const a=Math.atan2(cur.y-hero.y,cur.x-hero.x);tx=hero.x+Math.cos(a)*d;ty=hero.y+Math.sin(a)*d;}
    else{const bx=mag>.05?v.x/mag:dx,by=mag>.05?v.y/mag:dy;tx=hero.x+bx*range;ty=hero.y+by*range;}
    const from={x:hero.x,y:hero.y},dest=blinkLanding(from,{x:tx,y:ty},hero.radius,dungeon);
    hero.invuln=.4;puff(hero.x,hero.y-30,'#aa97ec',14,4,170);
    hero.x=dest.x;hero.y=dest.y;
    hazards.push({x:from.x,y:from.y,x2:hero.x,y2:hero.y,type:'blink',r:0,max:1,life:.35});
    emitVfx(vfx,'blink',hero.x,hero.y-34,{max:16});
    break;}
  case 'heal':hero.hp=Math.min(hero.maxHp,hero.hp+hero.maxHp*(.48+rank*.035));puff(hero.x,hero.y,'#b4eba0',24,5,130);floatText(hero.x,hero.y-25,'治愈','#b1edaf');break;
  case 'manasurge':hero.mana=Math.min(hero.maxMana,hero.mana+hero.maxMana*(.45+rank*.03));emitVfx(vfx,'ward',hero.x,hero.y-30,{max:20});floatText(hero.x,hero.y-25,'法力涌动','#9cc8ff');break;
  case 'haste':hasteUntil=tick+6+rank*.3;announce('迅捷 · 移速与冷却提升',true);break;
  case 'chain':{
    const candidates=enemies.map(e=>({e,dist:distance(hero,e)})).filter(x=>x.dist<600).sort((a,b)=>a.dist-b.dist);
    let last={x:hero.x,y:hero.y};const victims=[];
    for(const {e} of candidates){
      if(victims.length>=3+Math.floor(rank/3))break;
      if(distance(last,e)>390)continue;
      victims.push(e);hazards.push({x:last.x,y:last.y,x2:e.x,y2:e.y,type:'chain',r:0,max:1,life:.22});
      last={x:e.x,y:e.y};
    }
    for(const v of victims)emitVfx(vfx,'chain',v.x,v.y,{max:9});
    for(let n=0;n<victims.length;n++)dealDamage(victims[n],P*(1.2+rank*.12)*Math.pow(.8,n),'lightning');
    if(!victims.length){announce('附近没有连锁目标');puff(hero.x+dx*55,hero.y+dy*55,'#b29eff',14,4,100);}
    break;}
  case 'thunder':thunderBal=B;thunderUntil=tick+10;thunderTimer=.2;announce('雷暴环绕 · 10 秒',true);break;
  case 'storm':{
    const c=aimPoint(520);
    emitVfx(vfx,'storm',c.x,c.y,{max:24});
    hazards.push({x:c.x,y:c.y,r:120,max:120,life:4,type:'storm',rank,timer:0});addDecal(decals,c.x,c.y,130,'frost',4.4);
    break;}
  case 'blades':bladesBal=B;bladesUntil=tick+6;bladesTimer=0;announce('冰刃环绕',true);break;
  case 'ward':
    wardHp=Math.round(24+bonus.hp*(.20+rank*.045));
    emitVfx(vfx,'ward',hero.x,hero.y,{max:20});
    puff(hero.x,hero.y,'#b8d7ff',22,5,130);announce('奥术护盾 · 吸收 '+wardHp+' 伤害',true);break;
  case 'inferno':
    for(let n=1;n<=5;n++){
      const x=hero.x+dx*n*55,y=hero.y+dy*n*55;
      if(walkable(x,y,10,dungeon)){emitVfx(vfx,'fire',x,y,{max:6});hazards.push({x,y,r:43,max:43,life:4,type:'inferno',rank,timer:0,seed:n*1.7});addDecal(decals,x,y,46,'scorch',5);}
    }
    break;
  case 'firewall':{
    const cx=hero.x+dx*170,cy=hero.y+dy*170,px=-dy,py=dx;
    for(let n=-3;n<=3;n++){const x=cx+px*n*36,y=cy+py*n*36;
      if(walkable(x,y,8,dungeon)){hazards.push({x,y,r:36,max:36,life:5,type:'firewall',rank,timer:0,seed:n*2.3});addDecal(decals,x,y,40,'scorch',5.5);}}
    break;}
  case 'hydra':{
    summons.push({x:hero.x+dx*45,y:hero.y+dy*45,life:8,timer:.3,rank,seed:rng()*6});
    while(summons.length>2)summons.shift();
    emitVfx(vfx,'fire',hero.x+dx*45,hero.y+dy*45,{max:20});break;}
  case 'slowtime':hazards.push({x:hero.x,y:hero.y,r:0,max:230,life:5,type:'slowtime'});announce('时间减缓',true);break;
  case 'blackhole':{
    const c=aimPoint(480);
    hazards.push({x:c.x,y:c.y,r:0,max:170,life:3.5,type:'blackhole',rank,timer:0});shake.amount=Math.max(shake.amount,3);break;}
  }
  for(let k=hz0;k<hazards.length;k++)hazards[k].bal=B;
  for(let k=sm0;k<summons.length;k++)summons[k].bal=B;
  updateHud();
}

// ═════════ 通用职业技能引擎 ═════════
const UNIT={
  skeleton:{sprite:'wretch',tint:'#e8e0c8',melee:true,speed:150,reach:34,every:.9,scale:.62},
  skelmage:{sprite:'cultist',tint:'#a6c8ff',ranged:true,speed:120,every:1.1,shot:{kind:'bolt',school:'cold',speed:480},scale:.6},
  skelarcher:{sprite:'archer',tint:'#e8e0c8',ranged:true,speed:130,every:1,shot:{kind:'arrow',school:'physical',speed:640},scale:.6},
  revive:{sprite:null,tint:'#7dff9a',melee:true,speed:135,reach:38,every:1,scale:.68},
  claygolem:{sprite:'brute',tint:'#b08a5c',melee:true,speed:105,reach:44,every:1.2,slow:1.5,scale:.6},
  bloodgolem:{sprite:'brute',tint:'#ff4a4a',melee:true,speed:110,reach:44,every:1.1,lifeLink:.35,scale:.6},
  firegolem:{sprite:'brute',tint:'#ff8a2a',melee:true,speed:105,reach:44,every:1.1,school:'fire',burn:true,scale:.62},
  valkyrie:{sprite:'archer',tint:'#ffe08a',melee:true,speed:170,reach:48,every:.8,scale:.85},
  clone:{hero:'assassin',melee:true,speed:200,reach:40,every:.55,alpha:.55},
  wolf:{beast:'wolf',melee:true,speed:230,reach:34,every:.7,color:'#9fb4c8'},
  direwolf:{beast:'wolf',melee:true,speed:220,reach:38,every:.75,color:'#7a6a5a',big:1.3},
  grizzly:{beast:'bear',melee:true,speed:150,reach:46,every:1.2,color:'#6a4a32',big:1.6},
  raven:{beast:'raven',melee:true,speed:320,reach:26,every:.6,color:'#2a2a3a',fly:true,blind:true},
  decoy:{hero:'amazon',turret:true,alpha:.5},
  trap:{device:'trap',turret:true,color:'#c8c8d0'},
  totem:{device:'totem',turret:true,color:'#d8b080'},
  vine:{device:'vine',turret:true,color:'#7dff7a'},
  spirit:{device:'spirit',turret:true,color:'#9fd8ff'}
};
function addBuff(id,dur,mods,group=null,extra={}){
  if(group)buffs=buffs.filter(b=>b.group!==group||b.id===id);
  buffs=buffs.filter(b=>b.id!==id);
  buffs.push({id,until:tick+dur,dur,mods:mods||{},group,timer:0,...extra});
  hsCache=null;
}
function coneHit(angle,range,arc){
  const out=[];
  for(const e of enemies){const dx=e.x-hero.x,dy=e.y-hero.y,d=Math.hypot(dx,dy);if(d>range+e.radius)continue;
    let diff=Math.abs(((Math.atan2(dy,dx)-angle+Math.PI*3)%(Math.PI*2))-Math.PI);if(d<e.radius+24||diff<=arc/2)out.push(e);}
  return out;
}
function knockback(e,from,dist){const d=Math.max(1,Math.hypot(e.x-from.x,e.y-from.y));if(e.kind==='boss')dist*=.3;
  for(let i=0;i<6;i++)moveWithCollision(e,(e.x-from.x)/d*dist*10,(e.y-from.y)/d*dist*10,1/60,dungeon,e.radius);}
function onHitEffects(e,def,P,R,from=hero){
  if(def.stun)e.stun=Math.max(e.stun||0,e.kind==='boss'?def.stun*.4:def.stun);
  if(def.knock)knockback(e,from,def.knock);
  if(def.slow)e.slow=Math.max(e.slow,def.slow);
  if(def.freeze)freezeEnemy(e,def.freeze);
  if(def.poison)applyPoison(e,P*def.poison.dps*R,def.poison.dur);
}
const FX_COLOR={physical:'#e8e0d0',fire:'#ff7a2a',cold:'#7cc8ff',lightning:'#a9a6ff',poison:'#7dff6a',holy:'#ffd76a',shadow:'#b46cff',arcane:'#c89cff'};
function slashFx(angle,range,arc,school,x=hero.x,y=hero.y){hazards.push({type:'slash',x,y,ang:angle,range,arc,life:.18,color:FX_COLOR[school]||'#e8e0d0'});}
function doMelee(def,angle,P,R,school,dmgMult=1){
  const hits=def.hits||1,range=def.range||90,arc=def.arc||1.1;
  const delay=hero.strikeDelay||0;
  for(let i=0;i<hits;i++)pending.push({t:tick+delay+i*.09,fn:()=>{
    if(i>0)hero.swing={t0:tick-.32*.3,dur:.3,style:heroRig(profile.heroClass).style};
    slashFx(angle+(i%2?.25:-.25)*(hits>1?1:0),range,arc,school);
    const targets=coneHit(angle,range,arc);
    let m=def.m*(def.stack==='maul'?1+Math.min(5,hero.maul||0)*.15:1);
    for(const e of targets){
      if(def.elements){for(const sc of ['fire','cold','lightning'])dealDamage(e,P*m*R*dmgMult/3*1.3,sc,{melee:true});emitVfx(vfx,'fire',e.x,e.y-20,{max:6});}
      else dealDamage(e,P*m*R*dmgMult,school,{melee:true,life:def.life});
      onHitEffects(e,def,P,R);
      if(def.spread&&def.poison)for(const o of enemies)if(o!==e&&distance(o,e)<90)applyPoison(o,P*def.poison.dps*R*.6,def.poison.dur);
    }
    if(targets.length){
      shake.amount=Math.max(shake.amount,hits>2?1.5:2.5);
      if(def.splash){const t=targets[0];blast(t.x,t.y,def.splash.r,P*def.splash.m*R,def.splash.school||school);hazards.push({x:t.x,y:t.y,r:0,max:def.splash.r,life:.35,type:'burst',fx:def.splash.school==='fire'?'fire':'ice'});}
      if(def.strikes)for(const t of targets.slice(0,def.strikes)){hazards.push({x:t.x,y:t.y,type:'strike',r:0,max:1,life:.3});dealDamage(t,P*.8*R,'lightning');}
      if(def.onHitBuff)addBuff('hit_'+def.name,def.onHitBuff.dur,def.onHitBuff.mods);
      if(def.charge==='tiger')hero.tiger=Math.min(3,(hero.tiger||0)+1);
      if(def.stack==='maul')hero.maul=(hero.maul||0)+1;
    }
  }});
  if(def.selfDmg)hero.hp=Math.max(1,hero.hp-hero.maxHp*def.selfDmg);
}
const KIND_OF={amazon:'arrow',assassin:'knife',barbarian:'axe',druid:'flame',necro:'bolt',paladin:'holy'};
function fire(def,angle,P,R,school,ox=hero.x,oy=hero.y){
  const n=def.n||1,spread=def.spread||0,bonusPierce=heroStats().mods.pierce|0;
  for(let i=0;i<n;i++){
    const t=angle+(i-(n-1)/2)*spread,sp=def.speed||600;
    shoot({x:ox+Math.cos(t)*24,y:oy+Math.sin(t)*24,vx:Math.cos(t)*sp,vy:Math.sin(t)*sp,life:def.life||1.1,kind:def.kind||'bolt',school,
      damage:P*def.m*R,pierce:(def.pierce||1)+bonusPierce,hitR:def.kind==='boulder'?26:def.kind==='tornado'?22:12,
      explode:def.explode?{r:def.explode.r,damage:P*def.explode.m*R,fx:school==='cold'?'ice':'fire',freeze:def.explode.freeze||0}:null,
      endBlast:def.explodeEnd?{r:def.explodeEnd.r,damage:P*def.explodeEnd.m*R}:null,
      homing:def.homing||0,wobble:def.wobble||0,slow:def.slow||0,knock:def.knock||0,poison:def.poison?{dps:P*def.poison.dps*R,dur:def.poison.dur}:null,
      cloud:def.cloud?{r:def.cloud.r,dur:def.cloud.dur,m:def.cloud.m,R}:null,trailCloud:def.trailCloud?{...def.trailCloud,R,t:0}:null,
      split:def.split||0,spiral:def.spiral?{a:t,r:20,cx:hero.x,cy:hero.y}:null,color:FX_COLOR[school]});
  }
}
function garea(x,y,def,P,R,school,rank){
  hazards.push({type:'garea',x,y,r:def.r,max:def.r,life:def.dur,dur:def.dur,timer:0,tick:def.tick||.4,m:def.m,school,R,
    slow:def.slow||0,stun:def.stun||0,poison:def.poison||null,fx:def.fx||school,follow:!!def.follow,P});
}
function nova(def,P,R,school){
  hazards.push({x:hero.x,y:hero.y,r:0,max:def.r,life:.45,type:'gnova',fx:def.fx||school,color:FX_COLOR[school]});
  for(const e of [...enemies])if(distance(e,hero)<def.r+e.radius){dealDamage(e,P*def.m*R,school);onHitEffects(e,def,P,R);}
  shake.amount=Math.max(shake.amount,def.stun?5:3);
}
function curse(x,y,def){
  hazards.push({x,y,r:0,max:def.r,life:.6,type:'curse',color:def.amp||def.elemAmp?'#c04050':def.weaken?'#8090c0':def.slow?'#5a8ac0':'#9a50c0'});
  for(const e of enemies){if(Math.hypot(e.x-x,e.y-y)>def.r+e.radius)continue;
    const until=tick+def.dur;e.curseUntil=until;
    if(def.amp){e.amp=def.amp;e.ampUntil=until;}
    if(def.elemAmp){e.elemAmp=def.elemAmp;e.elemAmpUntil=until;}
    if(def.weaken){e.weaken=def.weaken;e.weakenUntil=until;}
    if(def.lifeTap){e.lifeTap=def.lifeTap;e.lifeTapUntil=until;}
    if(def.fear)e.fearUntil=until;
    if(def.slow)e.slow=Math.max(e.slow,def.dur*def.slow*1.5);
    if(def.stun)e.stun=Math.max(e.stun||0,e.kind==='boss'?def.stun*.3:def.stun);
  }
}
function spawnAlly(unit,x,y,def,P,R,extra={}){
  const U=UNIT[unit]||UNIT.skeleton;
  const hp=(40+profile.level*9)*(def.hp||1);
  const a={id:nextId++,unit,x,y,hp,maxHp:hp,life:def.dur,dur:def.dur,atkT:.3,m:def.m||0,R,P,school:U.school||def.shotSchool||'physical',
    radius:U.turret?14:U.big?22:15,phase:rng()*6,skill:def.name,...extra};
  if(U.turret){a.every=def.every;a.shot=def.shot;a.timer=.2;}
  allies.push(a);
  emitVfx(vfx,U.turret?'arcane':'death',x,y-20,{max:10});
  return a;
}
function castGeneric(id,def,{target,angle,P,R,rank,bonus,B=1}){
  const school=def.school||'physical';
  const aim=(range)=>target&&distance(hero,target)<range?{x:target.x,y:target.y}:{x:hero.x+Math.cos(angle)*range*.6,y:hero.y+Math.sin(angle)*range*.6};
  // 角色动作：近战类用职业武器动作（刺/劈/砸/爪），其余用举杖施法动作
  const rigStyle=heroRig(profile.heroClass).style,meleeLike=def.a==='melee'||def.a==='charge'||(def.a==='basic'&&bonus.attack.mode==='melee');
  const throwLike=(def.a==='proj'&&(school==='physical'||profile.heroClass==='amazon'))||(def.a==='basic'&&bonus.attack.mode!=='melee'&&bonus.attack.mode!=='spell');
  const swingDur=meleeLike?clamp(cooldowns[id]*.9,.24,.42):.34;
  hero.swing={t0:tick,dur:swingDur,style:meleeLike||throwLike?rigStyle:'staff'};
  hero.strikeDelay=meleeLike?swingDur*.36:0;
  if(!meleeLike)emitVfx(vfx,VFX_OF[school]||'arcane',hero.x+Math.cos(angle)*20,hero.y-40,{max:8,angle});
  switch(def.a){
  case 'basic':{
    const mode=bonus.attack.mode;
    if(mode==='bow')fire({m:1,kind:'arrow',speed:780},angle,P,R,'physical');
    else if(mode==='throw')fire({m:1.1,kind:bonus.weapon==='投枪'?'javelin':'knife',speed:700},angle,P,R,'physical');
    else if(mode==='spell')fire({m:.95,kind:'bolt',speed:620},angle,P,R,profile.heroClass==='necro'?'shadow':profile.heroClass==='druid'?'poison':'arcane');
    else doMelee({m:1,range:bonus.attack.reach||80,arc:1.2},angle,P,R,'physical');
    break;}
  case 'melee':doMelee(def,angle,P,R,school);break;
  case 'proj':fire(def,angle,P,R,school);break;
  case 'nova':nova(def,P,R,school);break;
  case 'area':{
    const c=aim(520);
    if(def.wall){const px=-Math.sin(angle),py=Math.cos(angle),cx=hero.x+Math.cos(angle)*150,cy=hero.y+Math.sin(angle)*150;
      for(let n=-3;n<=3;n++){const x=cx+px*n*34,y=cy+py*n*34;if(walkable(x,y,8,dungeon))garea(x,y,{...def,r:34},P,R,school,rank);}break;}
    if(def.instant){
      blast(c.x,c.y,def.r,P*def.m*R,school,{});for(const e of enemies)if(distance(e,c)<def.r+e.radius)onHitEffects(e,def,P,R,c);
      hazards.push({x:c.x,y:c.y,r:0,max:def.r,life:.45,type:'gnova',fx:def.fx||school,color:FX_COLOR[school]});
      if(def.strike){hazards.push({x:c.x,y:c.y,type:'strike',r:0,max:1,life:.35});shake.amount=Math.max(shake.amount,5);}
      if(def.bolts)for(let k=0;k<def.bolts;k++){const t=k/def.bolts*Math.PI*2;shoot({x:c.x,y:c.y,vx:Math.cos(t)*480,vy:Math.sin(t)*480,life:.6,kind:'holy',school:'holy',damage:P*.6*R,pierce:2,hitR:12,color:FX_COLOR.holy});}
      addDecal(decals,c.x,c.y,def.r*.8,school==='fire'?'scorch':school==='cold'?'frost':'arcane',3);
    }else garea(c.x,c.y,def,P,R,school,rank);
    break;}
  case 'chain':break;
  case 'whirl':hero.whirl={until:tick+def.dur,timer:0,tick:def.tick,r:def.r,m:def.m,P,R,school};break;
  case 'leap':{const c=aim(def.range);hero.leap={fx:hero.x,fy:hero.y,tx:c.x,ty:c.y,t:0,dur:.38,def,P,R,school};hero.invuln=.45;break;}
  case 'charge':hero.dash={vx:Math.cos(angle)*900,vy:Math.sin(angle)*900,left:def.dist/900,def,P,R,school,hit:new Set()};hero.invuln=.3;break;
  case 'dash':{
    const from={x:hero.x,y:hero.y};
    if(def.toTarget&&target){const a=Math.atan2(target.y-hero.y,target.x-hero.x);const tx=target.x+Math.cos(a)*40,ty=target.y+Math.sin(a)*40;
      if(walkable(tx,ty,hero.radius,dungeon)){hero.x=tx;hero.y=ty;}else{hero.x=target.x-Math.cos(a)*40;hero.y=target.y-Math.sin(a)*40;}}
    else{const v=movementVector(),mag=Math.hypot(v.x,v.y),bx=mag>.05?v.x/mag:Math.cos(angle),by=mag>.05?v.y/mag:Math.sin(angle);
      for(let t=0;t<14;t++)moveWithCollision(hero,bx*def.dist*60/14,by*def.dist*60/14,1/60,dungeon,hero.radius);}
    hazards.push({x:from.x,y:from.y,x2:hero.x,y2:hero.y,type:'blink',r:0,max:1,life:.3});
    if(def.mods)addBuff(id,def.buffDur||1.5,def.mods);
    hero.invuln=Math.max(hero.invuln,.25);break;}
  case 'buff':addBuff(id,def.dur,def.mods,def.group||null);floatText(hero.x,hero.y-70,def.name,FX_COLOR[school]);
    if(def.mods.absorbPct){wardHp=Math.max(wardHp,Math.round(heroStats().hp*def.mods.absorbPct*(1+rank*.06)));}
    emitVfx(vfx,VFX_OF[school]||'ward',hero.x,hero.y-30,{max:18});break;
  case 'aura':addBuff(id,def.dur,def.mods||{},def.group||null,{aura:def,R:R*B});floatText(hero.x,hero.y-70,def.name,FX_COLOR[school]);break;
  case 'curse':{const c=def.atTarget?aim(500):{x:hero.x,y:hero.y};curse(c.x,c.y,def);break;}
  case 'heal':healHero(heroStats().hp*(def.healHp||0));hero.mana=Math.min(hero.maxMana,hero.mana+hero.maxMana*(def.healMana||0));puff(hero.x,hero.y,'#b4eba0',20,5,130);floatText(hero.x,hero.y-30,def.name,'#b1edaf');break;
  case 'summon':{
    const group=def.group;if(group)allies=allies.filter(a=>a.group!==group);
    let spots=[];
    if(def.corpses){const near=corpses.filter(c=>distance(c,hero)<420).slice(0,def.n);if(!near.length){announce('附近没有尸体');cooldowns[id]=.5;hero.mana+=def.mana;return;}
      for(const c of near){spots.push({x:c.x,y:c.y,kind:c.kind});corpses.splice(corpses.indexOf(c),1);}}
    else for(let i=0;i<def.n;i++){const a=angle+(i-(def.n-1)/2)*.8;spots.push({x:hero.x+Math.cos(a)*50,y:hero.y+Math.sin(a)*50});}
    for(const [n,p] of spots.entries()){const unit=def.unit==='skeleton'&&n%2?'skelarcher':def.unit;const al=spawnAlly(unit,p.x,p.y,def,P,R,{group:group||null,reviveKind:p.kind});if(!walkable(al.x,al.y,12,dungeon)){al.x=hero.x;al.y=hero.y;}}
    const mine=allies.filter(a=>a.skill===def.name);while(mine.length>def.max){const o=mine.shift();allies.splice(allies.indexOf(o),1);}
    break;}
  case 'turret':{
    const c=aim(240);const al=spawnAlly(def.unit,c.x,c.y,def,P,R);if(!walkable(al.x,al.y,10,dungeon)){al.x=hero.x+Math.cos(angle)*40;al.y=hero.y+Math.sin(angle)*40;}
    const mine=allies.filter(a=>a.skill===def.name);while(mine.length>def.max){const o=mine.shift();allies.splice(allies.indexOf(o),1);}
    break;}
  case 'corpse':{
    const near=corpses.filter(c=>distance(c,hero)<def.r+380);
    if(!near.length){announce('附近没有尸体');cooldowns[id]=.5;hero.mana+=def.mana;return;}
    for(const c of near.slice(0,6)){
      if(def.redeem){healHero(hero.maxHp*.08);hero.mana=Math.min(hero.maxMana,hero.mana+hero.maxMana*.08);emitVfx(vfx,'holy',c.x,c.y-10,{max:10});}
      else{blast(c.x,c.y,def.r,P*def.m*R,'fire');hazards.push({x:c.x,y:c.y,r:0,max:def.r,life:.4,type:'burst',fx:'fire'});emitVfx(vfx,'death',c.x,c.y-10,{max:16,speed:1.8});addDecal(decals,c.x,c.y,60,'blood',5);}
      corpses.splice(corpses.indexOf(c),1);
    }
    if(!def.redeem)shake.amount=Math.max(shake.amount,6);
    break;}
  }
}
// ═════════ 怪物 AI ═════════
function enemyShot(e,ang,o={}){
  const sc=o.school||e.mon.school||'shadow',sp=o.speed||(e.tier==='boss'?330:360);
  missiles.push({x:e.x,y:e.y-30*(e.drawScale||.6)/.6,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,kind:'eshot',school:sc,color:SCHOOL_COLOR[sc],life:o.life||2.2,
    damage:(o.dmg||e.dmg)*(e.weakenUntil>tick?1-e.weaken:1),homeHero:o.homing||0,size:o.size||1});
}
function enemyWarn(x,y,r,dmg,school,delay=.8,src=null){hazards.push({type:'ewarn',x,y,r:0,max:r,life:delay,dur:delay,dmg,school,src});}
function enemyPool(x,y,r,dps,school,dur){hazards.push({type:'epool',x,y,r,max:r,life:dur,dur,dps,school,timer:0});}
function enemyLine(e,ang,len,dmg,delay){hazards.push({type:'eline',x:e.x,y:e.y,ang,len,life:delay,dur:delay,dmg,school:e.mon.school,src:e});}
function fireShot(e,ang){
  const shot=e.mon.shot||'single';
  if(shot==='spread')for(let k=-1;k<=1;k++)enemyShot(e,ang+k*.22,{dmg:e.dmg*.7});
  else if(shot==='orb')enemyShot(e,ang,{speed:190,homing:1.6,life:3.2,dmg:e.dmg*1.3,size:1.6});
  else if(shot==='lob'){const t=e.target||hero;enemyWarn(t.x+(rng()-.5)*40,t.y+(rng()-.5)*30,70,e.dmg*1.3,e.mon.school,.9,e);}
  else if(shot==='nova'){for(let k=0;k<10;k++)enemyShot(e,k/10*Math.PI*2+e.phase,{dmg:e.dmg*.6,speed:260});}
  else enemyShot(e,ang);
}
function eliteMod(e,mod,ang,d){
  const sc=e.mon.school||'physical';
  switch(mod){
    case 'charge':if(d<520&&d>120){e.act={type:'charge',t:0,wind:.55,ang,dur:.42,hit:false};return true;}break;
    case 'slam':if(d<200){e.act={type:'slam',t:0,wind:.75};enemyWarn(e.x,e.y,150,e.dmg*1.8,sc,.75,e);return true;}break;
    case 'burst':for(let k=0;k<12;k++)enemyShot(e,k/12*Math.PI*2,{dmg:e.dmg*.55,speed:280,school:sc});e.act={type:'cast',t:0,wind:.35};return true;
    case 'summon':{const pool=REGION_MONSTERS[profile.region].normal;let n=0;for(let k=0;k<2&&enemies.length<MAX_LIVE_ENEMIES;k++){const a=rng()*6.28,p={x:e.x+Math.cos(a)*70,y:e.y+Math.sin(a)*50};if(walkable(p.x,p.y,18,dungeon)){const m=spawn(pool[Math.floor(rng()*pool.length)],p);m.summoned=true;m.spawnT=.5;n++;}}
      if(n){e.act={type:'cast',t:0,wind:.4};return true;}break;}
    case 'heal':{let any=false;for(const o of enemies)if(o!==e&&o.hp<o.maxHp&&distance(o,e)<260){o.hp=Math.min(o.maxHp,o.hp+o.maxHp*.18);any=true;emitVfx(vfx,'heal',o.x,o.y-20,{max:6});}
      if(any){e.act={type:'cast',t:0,wind:.4};return true;}break;}
  }
  return false;
}
function bossMove(e,mv,ang,d){
  const sc=e.mon.school||'shadow',D=e.dmg;
  switch(mv){
    case 'charge':e.act={type:'charge',t:0,wind:.7,ang,dur:.55,hit:false};enemyLine(e,ang,420,D*1.6,.7);break;
    case 'slam':e.act={type:'slam',t:0,wind:.9};enemyWarn(e.x,e.y,200,D*2,sc,.9,e);break;
    case 'burst':for(let k=0;k<(e.enraged?20:14);k++)enemyShot(e,k/(e.enraged?20:14)*Math.PI*2,{dmg:D*.6,speed:300});e.act={type:'cast',t:0,wind:.4};break;
    case 'spread':for(let k=-3;k<=3;k++)enemyShot(e,ang+k*.16,{dmg:D*.7,speed:360});e.act={type:'cast',t:0,wind:.35};break;
    case 'spiral':e.spiral={t:0,dur:1.6,ang};e.act={type:'cast',t:0,wind:1.6};break;
    case 'rain':for(let k=0;k<(e.enraged?7:5);k++){const a=rng()*6.28,r=k?40+rng()*170:0;enemyWarn(hero.x+Math.cos(a)*r,hero.y+Math.sin(a)*r*.7,75,D*1.4,sc,.95+k*.12,e);}e.act={type:'cast',t:0,wind:.5};break;
    case 'summon':eliteMod(e,'summon',ang,d);eliteMod(e,'summon',ang,d);break;
    case 'trail':e.trailUntil=tick+4;e.act={type:'cast',t:0,wind:.3};break;
  }
}
function updateEnemies(dt,inSlow){
  for(const e of [...enemies]){
    if(e.flash>0)e.flash-=dt;
    e.spawnT=Math.max(0,(e.spawnT||0)-dt);
    stepMotion(e,dt,e.face||1,{stepLen:e.tier==='boss'?46:e.mon?.ai==='tank'?40:e.mon?.ai==='swarm'?22:30});
    if(e.poisonUntil>tick&&(e.poisonTick-=dt)<=0){e.poisonTick=.5;dealDamage(e,e.poisonDps*.5,'poison',{dot:true,noCrit:true});if(!enemies.includes(e))continue;}
    if(e.frozen>0){e.frozen-=dt;continue;}
    if(e.stun>0){e.stun-=dt;e.act=null;continue;}
    if(e.fearUntil>tick){const fx=e.x-hero.x,fy=e.y-hero.y,fd=Math.max(1,Math.hypot(fx,fy));moveWithCollision(e,fx/fd*e.speed*.8,fy/fd*e.speed*.8,dt,dungeon,e.radius);e.moving=true;continue;}
    const slowed=inSlow(e),tf=slowed?.35:1,M=e.mon;
    e.phase+=dt*3*tf;e.attack-=dt*tf;e.modT-=dt*tf;e.slow=Math.max(0,e.slow-dt);
    // v0.8 待命：没察觉到你之前在营地附近闲逛；走近（远程怪更远）或被打到才会醒，同伴随后陆续醒来
    if(e.aware===false){
      if(e.wakeIn!=null){if((e.wakeIn-=dt)<=0)wakeEnemy(e);}
      else if(distance(e,hero)<(M.ai==='ranged'||M.ai==='caster'?470:e.tier==='elite'?430:390))wakeEnemy(e);
      else if(allies.some(a=>distance(a,e)<240))wakeEnemy(e);
      if(e.aware===false){
        if((e.wanderT-=dt)<=0){e.wanderT=2+rng()*3;const a=rng()*6.28,r=rng()*70;e.wander={x:e.home.x+Math.cos(a)*r,y:e.home.y+Math.sin(a)*r};}
        const w=e.wander;let mvw=0;
        if(w){const wx=w.x-e.x,wy=w.y-e.y,wd=Math.hypot(wx,wy);if(wd>8){const [sx,sy]=steer(e,wx/wd*e.speed*.25,wy/wd*e.speed*.25,dt,5);moveWithCollision(e,sx,sy,dt,dungeon,e.radius);e.face=wx>=0?1:-1;mvw=1;}else e.wander=null;}
        e.moving=mvw>0;continue;
      }
    }
    e.awareT=(e.awareT||0)+dt;
    let foe=hero;
    if(allies.length){let best=Math.hypot(hero.x-e.x,hero.y-e.y)-40;for(const a of allies){if(UNIT[a.unit]?.turret||UNIT[a.unit]?.fly)continue;const da=Math.hypot(a.x-e.x,a.y-e.y);if(da<best&&da<260){best=da;foe=a;}}}
    e.target=foe;
    const dx=foe.x-e.x,dy=foe.y-e.y,d=Math.max(1,Math.hypot(dx,dy)),ang=Math.atan2(dy,dx);
    e.face=dx>=0?1:-1;
    // 被动：光环 / 焦土
    if(M.mods?.includes('aura')&&(e.auraT=(e.auraT||0)-dt)<=0){e.auraT=.5;if(distance(e,hero)<130)loseHp(e.dmg*.18,M.school);}
    if((M.mods?.includes('trail')||e.trailUntil>tick)&&e.moving&&(e.trailT=(e.trailT||0)-dt)<=0){e.trailT=.45;enemyPool(e.x,e.y,e.tier==='boss'?60:42,e.dmg*.45,M.school||'fire',2.6);}
    if(e.spiral){const sp=e.spiral;sp.t+=dt;if((sp.k=(sp.k||0)-dt)<=0){sp.k=.07;sp.ang+=.42;enemyShot(e,sp.ang,{dmg:e.dmg*.5,speed:280});enemyShot(e,sp.ang+Math.PI,{dmg:e.dmg*.5,speed:280});}if(sp.t>sp.dur)e.spiral=null;}
    // 进行中的动作（预警 → 出手）
    if(e.act){
      const A=e.act;A.t+=dt*tf;
      if(A.type==='melee'&&!A.done&&A.t>=A.wind){A.done=true;
        const t=A.target;if(t&&(t===hero||allies.includes(t))&&Math.hypot(t.x-e.x,t.y-e.y)<e.radius+(t.radius||17)+34){
          if(t===hero)injury(e.dmg,e);else{t.hp-=e.dmg*(e.weakenUntil>tick?1-e.weaken:1);puff(t.x,t.y-10,'#cfc6b0',5,2);}}
        hazards.push({type:'eslash',x:e.x,y:e.y,ang:A.ang,r:e.radius+40,life:.16,color:SCHOOL_COLOR[M.school]||'#ffdddd'});}
      if(A.type==='ranged'&&!A.done&&A.t>=A.wind){A.done=true;fireShot(e,Math.atan2(hero.y-e.y,hero.x-e.x));}
      if(A.type==='charge'&&A.t>=A.wind){const k=A.t-A.wind;if(k<A.dur){moveWithCollision(e,Math.cos(A.ang)*720,Math.sin(A.ang)*720,dt,dungeon,e.radius);e.moving=true;
          if(!A.hit&&distance(e,hero)<e.radius+hero.radius+10){A.hit=true;injury(e.dmg*1.5,e);shake.amount=Math.max(shake.amount,5);}}else e.act=null;}
      if(A.type==='slam'&&A.t>=A.wind){shake.amount=Math.max(shake.amount,6);e.act=null;}
      if(A&&e.act&&A.type!=='charge'&&A.t>=Math.max(A.wind,.01)+(A.type==='melee'?.22:.15))e.act=null;
      continue;
    }
    // 首领技能循环 / 精英词缀
    if(e.tier==='boss'){
      if(e.hp<e.maxHp*.5&&!e.enraged){e.enraged=true;announce(M.name+'进入狂暴！',true);eliteMod(e,'summon',ang,d);shake.amount=8;}
      if((e.moveT-=dt*tf*(e.enraged?1.4:1))<=0&&d<620){e.moveT=2.8;bossMove(e,M.moves[e.moveI++%M.moves.length],ang,d);continue;}
    }else if(M.mods&&e.modT<=0&&d<560){
      const opts=M.mods.filter(m=>['charge','slam','burst','summon','heal'].includes(m));
      if(opts.length&&eliteMod(e,opts[Math.floor(rng()*opts.length)],ang,d)){e.modT=5+rng()*2;continue;}
      e.modT=1;
    }
    // 移动
    const ranged=M.ai==='ranged'||M.ai==='caster';
    // 察觉后先慢慢逼近（约 3 秒加速到全速）；远处的第 3 波在 450 码外只用一半速度围拢
    const ramp=e.tier==='boss'?1:Math.min(1,.4+e.awareT*.2)*(e.hunter&&d>450?.55:1);
    const speed=e.speed*(e.slow? .38:1)*tf*(e.spawnT>0?0:1)*ramp;
    const reach=e.radius+(foe.radius||17)+18;
    let mv=0;
    // v0.7：移动先转向再加速（motion.js steer），起步、拐弯、停下都有过渡
    const go=(vx,vy)=>{const [sx,sy]=steer(e,vx,vy,dt,M.ai==='tank'?6:M.ai==='swarm'?12:9);moveWithCollision(e,sx,sy,dt,dungeon,e.radius);};
    if(ranged){
      if(d>330){go(dx/d*speed,dy/d*speed);mv=1;}
      else if(d<220){go(-dx/d*speed*.6,-dy/d*speed*.6);mv=1;}
      else{const sx=-dy/d,sy=dx/d,side=(e.id%2?1:-1);go(sx*speed*.35*side,sy*speed*.35*side);mv=.4;}
    }else if(d>reach-6){
      const wob=M.ai==='swarm'?Math.sin(e.phase*2.2)*.5:0;
      const vx=dx/d*Math.cos(wob)-dy/d*Math.sin(wob),vy=dy/d*Math.cos(wob)+dx/d*Math.sin(wob);
      go(vx*speed,vy*speed);mv=1;
      if(d>250&&e.tier==='boss'&&Math.abs(e.x-WIDTH/2)>800){e.x=clamp(e.x,hero.x-700,hero.x+700);}
    }else{const [sx,sy]=steer(e,0,0,dt,14);if(Math.hypot(sx,sy)>12)moveWithCollision(e,sx,sy,dt,dungeon,e.radius);}
    e.moving=mv>.5;
    // 普攻（带预警）
    if(e.attack<=0){
      const T=TIER[e.tier],AS=[1,.92,.84][profile.difficulty|0]; // 难度越高出手越快
      if(ranged&&d<560&&foe===hero){e.act={type:'ranged',t:0,wind:e.tier==='caster'?.55:.4};e.attack=T.attack*(.85+rng()*.3)*AS;}
      else if(!ranged&&d<reach+8){e.act={type:'melee',t:0,wind:M.ai==='tank'?.5:M.ai==='swarm'?.22:e.tier==='boss'?.45:.32,target:foe,ang};e.attack=T.attack*(M.ai==='swarm'?.7:M.ai==='tank'?1.35:1)*AS;}
    }
  }
}
// 敌方伤害（光环/地面）：不触发受击无敌，直接掉血
function resistMult(school){const s=heroStats();const r=school==='fire'?s.resistFire:school==='cold'?s.resistCold:school==='shadow'||school==='poison'?s.resistDark:0;return 1-r/100;}
function loseHp(n,school){
  if(state!=='playing'||hero.invuln>.3)return;
  const res=school==='fire'?heroStats().resistFire:school==='cold'?heroStats().resistCold:school==='shadow'||school==='poison'?heroStats().resistDark:0;
  hero.hp=Math.max(0,hero.hp-n*(1-res/100));if(hero.hp<=0){persist();showModal('death');announce('持灯者倒下，但成长得以保留',true);}
}
// 增益、光环、随从、英雄动作的逐帧更新
function updateClassSystems(dt){
  for(let i=pending.length-1;i>=0;i--)if(pending[i].t<=tick){const f=pending[i].fn;pending.splice(i,1);f();}
  for(let i=corpses.length-1;i>=0;i--){corpses[i].t+=dt;if((corpses[i].life-=dt)<=0)corpses.splice(i,1);}
  for(let i=dying.length-1;i>=0;i--)if((dying[i].t+=dt)>.6)dying.splice(i,1);
  const before=buffs.length;buffs=buffs.filter(b=>b.until>tick);if(buffs.length!==before)hsCache=null;
  const hs=heroStats();
  for(const b of buffs){
    const a=b.aura;if(!a||!a.every)continue;
    if((b.timer-=dt)>0)continue;b.timer=a.every;
    if(a.heal)healHero(hs.hp*a.heal);
    if(a.r)for(const e of [...enemies]){if(distance(e,hero)>a.r+e.radius)continue;
      if(a.curse){e.amp=a.curse.amp;e.ampUntil=tick+a.curse.dur;e.curseUntil=tick+a.curse.dur;}
      if(a.slow)e.slow=Math.max(e.slow,a.slow);
      if(a.m)dealDamage(e,hs.power*a.m*(b.R||1),a.school||'physical',{dot:true});}
    if(a.fx&&a.r)hazards.push({x:hero.x,y:hero.y,r:0,max:a.r,life:.4,type:'pulse',color:FX_COLOR[a.school||'holy']||'#ffd76a',fx:a.fx});
  }
  // 英雄动作
  if(hero.whirl){const w=hero.whirl;if(tick>w.until)hero.whirl=null;else if((w.timer-=dt)<=0){w.timer=w.tick;
    for(const e of [...enemies])if(distance(e,hero)<w.r+e.radius)dealDamage(e,w.P*w.m*w.R,w.school,{melee:true});}}
  if(hero.leap){const L=hero.leap;L.t+=dt;const k=Math.min(1,L.t/L.dur);
    const nx=L.fx+(L.tx-L.fx)*k,ny=L.fy+(L.ty-L.fy)*k;if(walkable(nx,ny,hero.radius,dungeon)){hero.x=nx;hero.y=ny;}
    hero.lift=Math.sin(k*Math.PI)*70;
    if(k>=1){hero.leap=null;hero.lift=0;const d=L.def;hero.swing={t0:tick-.13,dur:.36,style:heroRig(profile.heroClass).style};
      for(const e of [...enemies])if(distance(e,hero)<d.r+e.radius){dealDamage(e,L.P*d.m*L.R,L.school,{melee:true});onHitEffects(e,d,L.P,L.R);}
      hazards.push({x:hero.x,y:hero.y,r:0,max:d.r,life:.45,type:'gnova',fx:'earth',color:'#e8d0a0'});addDecal(decals,hero.x,hero.y,d.r*.7,'ash',4);
      shake.amount=Math.max(shake.amount,8);hitStop=Math.max(hitStop,.05);}}
  if(hero.dash){const D=hero.dash;const step=Math.min(dt,D.left);D.left-=step;
    const ox=hero.x,oy=hero.y;moveWithCollision(hero,D.vx,D.vy,step,dungeon,hero.radius);
    for(const e of [...enemies])if(!D.hit.has(e.id)&&distance(e,hero)<e.radius+30){D.hit.add(e.id);dealDamage(e,D.P*D.def.m*D.R,D.school,{melee:true});onHitEffects(e,D.def,D.P,D.R);}
    particles.push({x:hero.x,y:hero.y-30,vx:0,vy:0,life:.25,max:.25,color:'#e8d0a0',size:8});
    if(D.left<=0||(Math.abs(hero.x-ox)+Math.abs(hero.y-oy)<1))hero.dash=null;}
  // 随从
  for(let i=allies.length-1;i>=0;i--){
    const a=allies[i],U=UNIT[a.unit]||UNIT.skeleton;a.life-=dt;a.phase+=dt*6;if(a.atkAnim>0)a.atkAnim-=dt;
    stepMotion(a,dt,a.facingLeft?-1:1,{stepLen:U.big?38:26});
    if(a.life<=0||a.hp<=0){allies.splice(i,1);puff(a.x,a.y-10,'#cfc6b0',10,3);continue;}
    if(U.turret){
      if((a.timer-=dt)>0)continue;a.timer=a.every;const sh=a.shot||{};const t=nearestTo(a,460);
      if(sh.heal){healHero(hs.hp*sh.heal);emitVfx(vfx,'heal',hero.x,hero.y-30,{max:6});continue;}
      if(sh.nova){for(const e of [...enemies])if(distance(e,a)<sh.nova+e.radius){dealDamage(e,a.P*sh.m*a.R,sh.school||'physical',{dot:true});if(sh.slow)e.slow=Math.max(e.slow,sh.slow);if(sh.poison)applyPoison(e,a.P*sh.poison.dps*a.R,sh.poison.dur);}
        hazards.push({x:a.x,y:a.y,r:0,max:sh.nova,life:.4,type:'pulse',color:U.color,fx:'pulse'});continue;}
      if(!t)continue;
      if(sh.strike){hazards.push({x:t.x,y:t.y,type:'strike',r:0,max:1,life:.3});dealDamage(t,a.P*sh.m*a.R,'lightning');continue;}
      if(sh.beam){const ang=Math.atan2(t.y-a.y,t.x-a.x),len=460,x2=a.x+Math.cos(ang)*len,y2=a.y+Math.sin(ang)*len;
        hazards.push({x:a.x,y:a.y+20,x2,y2:y2+20,type:'beam',r:0,max:1,life:.22});
        for(const e of [...enemies]){const tt=clamp(((e.x-a.x)*Math.cos(ang)+(e.y-a.y)*Math.sin(ang))/len,0,1);if(Math.hypot(e.x-(a.x+Math.cos(ang)*len*tt),e.y-(a.y+Math.sin(ang)*len*tt))<e.radius+18)dealDamage(e,a.P*sh.m*a.R,'lightning');}continue;}
      const ang=Math.atan2(t.y-a.y,t.x-a.x),sp=sh.speed||600;
      shoot({x:a.x,y:a.y,vx:Math.cos(ang)*sp,vy:Math.sin(ang)*sp,life:1,kind:sh.kind||'bolt',school:a.school==='physical'&&sh.kind==='bomb'?'fire':a.school,damage:a.P*sh.m*a.R,pierce:sh.pierce||1,hitR:12,
        explode:sh.explode?{r:sh.explode.r,damage:a.P*sh.explode.m*a.R,fx:'fire'}:null,color:FX_COLOR[sh.kind==='bomb'?'fire':a.school]});
      continue;
    }
    const t=nearestTo(a,560);
    const goal=t||(distance(a,hero)>120?hero:null);
    if(goal){
      const d=Math.hypot(goal.x-a.x,goal.y-a.y),want=t?(U.ranged?220:(U.reach||34)+(t.radius||0)*.5):80;
      if(d>want){const sp=(U.speed||140),[sx,sy]=steer(a,(goal.x-a.x)/d*sp,(goal.y-a.y)/d*sp,dt,10);moveWithCollision(a,sx,sy,dt,dungeon,a.radius);a.moving=true;}else{steer(a,0,0,dt,14);a.moving=false;}
      if(t&&(a.atkT-=dt)<=0&&d<=want+12){a.atkT=U.every||1;a.atkAnim=.25;
        if(U.ranged){const ang=Math.atan2(t.y-a.y,t.x-a.x),sh=U.shot;shoot({x:a.x,y:a.y-10,vx:Math.cos(ang)*sh.speed,vy:Math.sin(ang)*sh.speed,life:1,kind:sh.kind,school:sh.school,damage:a.P*a.m*a.R,pierce:1,hitR:12,slow:1,color:FX_COLOR[sh.school]});}
        else{const dmg=a.P*a.m*a.R;dealDamage(t,dmg,U.school||'physical',{minion:true});
          if(U.slow)t.slow=Math.max(t.slow,U.slow);if(U.lifeLink)healHero(dmg*U.lifeLink);if(U.blind)t.slow=Math.max(t.slow,.8);
          hazards.push({type:'slash',x:a.x,y:a.y,ang:Math.atan2(t.y-a.y,t.x-a.x),range:(U.reach||34)+16,arc:1.2,life:.15,color:'#e8e0d0'});}
      }
    }else a.moving=false;
    if(U.burn&&(a.burnT=(a.burnT||0)-dt)<=0){a.burnT=.6;for(const e of [...enemies])if(distance(e,a)<90)dealDamage(e,a.P*.25*a.R,'fire',{dot:true,minion:true});}
  }
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
  hero.invuln=Math.max(0,hero.invuln-dt);hero.cast=Math.max(0,hero.cast-dt);hero.mana=Math.min(hero.maxMana,hero.mana+dt*heroStats().regen);
  const v=movementVector(), l=Math.hypot(v.x,v.y);
  const oldX=hero.x,oldY=hero.y;
  const hsNow=heroStats();
  if(hero.maxHp!==hsNow.hp){hero.maxHp=hsNow.hp;hero.hp=Math.min(hero.hp,hero.maxHp);}
  const speed=(CLASSES[profile.heroClass]?.speed||250)*(hasted()?1.35:1)*hsNow.moveMult*(hero.whirl?.8:1);
  if(l>.02&&!hero.leap&&!hero.dash){moveWithCollision(hero,v.x*speed,v.y*speed,dt,dungeon,hero.radius);
    hero.angle=Math.atan2(v.y,v.x);
  }
  hero.moving=l>.02&&Math.hypot(hero.x-oldX,hero.y-oldY)>.08;
  const hc=Math.cos(hero.angle);
  stepMotion(hero,dt,hc>.15?1:hc<-.15?-1:(hero._mo?.face||1),{stepLen:30});
  if(hero.moving){
    const previousStride=hero.walk;hero.walk=hero._mo.stride;
    if(hasted()&&rng()<.5)particles.push({x:hero.x+(rng()-.5)*14,y:hero.y-20-rng()*50,vx:-v.x*40,vy:-v.y*40,life:.3,max:.3,color:'#c6a8ff',size:4});
    // A small timed footstep is a visible animation cue, not a fake input event.
    if(Math.floor(previousStride/Math.PI)!==Math.floor(hero.walk/Math.PI)){
      const x=hero.x-Math.cos(hero.angle)*9,y=hero.y-Math.sin(hero.angle)*7;
      puff(x,y,'#7590b9',4,1.1,32);
    }
  }
  if(portal&&distance(hero,portal)<105&&!$('portal-panel').dataset.suppressed&&state==='playing'&&!boss){$('portal-open').hidden=false;}
  // 按住技能键 / 鼠标 / 触屏技能按钮：持续施放（受冷却限制）
  for(let i=0;i<profile.activeSkills.length;i++)if(heldSlots.has(i)||keys.has(profile.keybinds[i]))cast(profile.activeSkills[i]);
  const slowZones=hazards.filter(h=>h.type==='slowtime');
  const inSlow=o=>slowZones.some(h=>Math.hypot(o.x-h.x,o.y-h.y)<h.max);
  updateBuffsAndSummons(dt);
  updateClassSystems(dt);
  updateEnemies(dt,inSlow);
  for(let i=missiles.length-1;i>=0;i--){
    const m=missiles[i];if(!m)continue;
    const tf=!m.friendly&&inSlow(m)?.3:1;
    if(m.homing){const t=nearestTo(m,420);if(t){const want=Math.atan2(t.y-m.y,t.x-m.x),cur=Math.atan2(m.vy,m.vx),sp=Math.hypot(m.vx,m.vy);
      let diff=((want-cur+Math.PI*3)%(Math.PI*2))-Math.PI;const na=cur+clamp(diff,-m.homing*dt,m.homing*dt);m.vx=Math.cos(na)*sp;m.vy=Math.sin(na)*sp;}}
    if(m.wobble){const cur=Math.atan2(m.vy,m.vx)+(rng()-.5)*9*dt,sp=Math.hypot(m.vx,m.vy);m.vx=Math.cos(cur)*sp;m.vy=Math.sin(cur)*sp;}
    if(m.spiral){const sp=m.spiral;sp.a+=dt*4.2;sp.r+=dt*95;m.x=sp.cx+Math.cos(sp.a)*sp.r;m.y=sp.cy+Math.sin(sp.a)*sp.r*.7;m.life-=dt;}
    else{m.x+=m.vx*dt*tf;m.y+=m.vy*dt*tf;m.life-=dt*tf;}
    if(m.trailCloud&&(m.trailCloud.t-=dt)<=0){m.trailCloud.t=.18;hazards.push({type:'garea',x:m.x,y:m.y,r:m.trailCloud.r,max:m.trailCloud.r,life:m.trailCloud.dur,dur:m.trailCloud.dur,timer:0,tick:.4,m:m.trailCloud.m,school:m.school,R:m.trailCloud.R,fx:m.school,P:heroStats().power,small:true});}
    // 飞行拖尾：少量光晕粒子
    if((m.trail=(m.trail||0)-dt)<=0){m.trail=m.kind==='orb'||m.kind==='ball'?.04:.025;const c=TRAIL[m.kind]||'#b98cf0';
      particles.push({x:m.x-m.vx*.012+(rng()-.5)*6,y:m.y-28+(rng()-.5)*6,vx:-m.vx*.08,vy:(m.school==='fire'?-30:0)+(rng()-.5)*20,life:.32,max:.32,color:c,size:m.kind==='fireball'?7:m.kind==='ember'?5:4});}
    if(m.emit&&(m.emitT-=dt)<=0){m.emitT=m.emit;m.spin=(m.spin||0)+1.1;
      shoot({x:m.x,y:m.y,vx:Math.cos(m.spin)*430,vy:Math.sin(m.spin)*430,life:.55,kind:'iceshard',school:'cold',damage:m.shardDamage,slow:1.2});}
    const dead=m.life<=0||(!m.spiral&&!walkable(m.x,m.y,7,dungeon));
    if(dead){missileEnd(m);missiles.splice(i,1);continue;}
    if(!m.friendly){
      if(m.homeHero){const want=Math.atan2(hero.y-m.y,hero.x-m.x),cur=Math.atan2(m.vy,m.vx),sp=Math.hypot(m.vx,m.vy);let diff=((want-cur+Math.PI*3)%(Math.PI*2))-Math.PI;const na=cur+clamp(diff,-m.homeHero*dt,m.homeHero*dt);m.vx=Math.cos(na)*sp;m.vy=Math.sin(na)*sp;}
      if(distance(hero,m)<hero.radius+9*(m.size||1)){injury(m.damage*resistMult(m.school));puff(m.x,m.y,m.color||'#a28ae2',9,3);missiles.splice(i,1);}continue;}
    if(m.noHit)continue;
    if(m.tickHit){
      for(const e of [...enemies])if(distance(e,m)<e.radius+m.hitR&&(m.hitMap.get(e.id)||0)<=tick){m.hitMap.set(e.id,tick+m.tickHit);dealDamage(e,m.damage,m.school);}
      continue;
    }
    const e=enemies.find(q=>!m.hitIds.has(q.id)&&distance(q,m)<q.radius+m.hitR);
    if(e){
      dealDamage(e,m.damage,m.school);
      if(m.slow)e.slow=Math.max(e.slow,m.slow);
      if(m.knock)knockback(e,{x:m.x-m.vx*.05,y:m.y-m.vy*.05},m.knock);
      if(m.poison)applyPoison(e,m.poison.dps,m.poison.dur);
      if(m.cloud&&!m.cloudDone){m.cloudDone=true;hazards.push({type:'garea',x:e.x,y:e.y,r:m.cloud.r,max:m.cloud.r,life:m.cloud.dur,dur:m.cloud.dur,timer:0,tick:.4,m:m.cloud.m,school:m.school,R:m.cloud.R,fx:m.school,P:heroStats().power});}
      if(m.split&&!m.splitDone){m.splitDone=true;for(let k=0;k<m.split;k++){const t=k/m.split*Math.PI*2;shoot({x:e.x,y:e.y,vx:Math.cos(t)*520,vy:Math.sin(t)*520,life:.45,kind:'cbolt',school:'lightning',damage:m.damage*.45,pierce:1,hitR:10,color:'#a9a6ff'});}hazards.push({x:e.x,y:e.y,type:'strike',r:0,max:1,life:.25});}
      puff(m.x,m.y-20,TRAIL[m.kind]||'#ffba6e',6,3);
      m.hitIds.add(e.id);m.hits++;
      if(m.hits>=m.pierce){missileEnd(m);missiles.splice(i,1);}
    }
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
      puff(d.x,d.y,palette.rare[d.item.rarity],16,3,100);announce('拾取 · '+d.item.name,true);persist();upgradeCheck();
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
      for(const e of [...enemies])if(distance(e,h)<125)dealDamage(e,heroStats().power*(h.bal||1)*(2.8+(h.rank||0)*.36),'fire');
    }
    if(h.type==='ewarn'&&!h.done&&h.life<=.02){h.done=true;
      if(distance(h,hero)<h.max+hero.radius){injury(h.dmg*resistMult(h.school),h.src&&enemies.includes(h.src)?h.src:null);}
      for(const a of allies)if(distance(h,a)<h.max)a.hp-=h.dmg*.6;
      hazards.push({x:h.x,y:h.y,r:0,max:h.max,life:.4,type:'gnova',fx:'pulse',color:SCHOOL_COLOR[h.school]||'#ff6a4a'});shake.amount=Math.max(shake.amount,3);}
    if(h.type==='eline'&&!h.done&&h.life<=.02)h.done=true;
    if(h.type==='epool'&&h.life>0&&(h.timer-=dt)<=0){h.timer=.5;if(distance(h,hero)<h.max+hero.radius*.5)loseHp(h.dps*.5,h.school);}
    if(h.type==='garea'&&h.life>0&&(h.timer-=dt)<=0){h.timer=h.tick;
      for(const e of [...enemies]){if(distance(e,h)>h.max+e.radius)continue;
        if(h.slow)e.slow=Math.max(e.slow,h.slow);if(h.stun&&!h.stunned)e.stun=Math.max(e.stun||0,h.stun);
        if(h.poison)applyPoison(e,h.P*h.poison.dps*h.R,h.poison.dur);
        if(h.m)dealDamage(e,h.P*h.m*h.R,h.school,{dot:true});}
      if(h.stun)h.stunned=true;}
    const tickRule=AREA_TICK[h.type];
    if(tickRule&&h.life>0){
      if(h.type==='blackhole')for(const e of enemies){const ddx=h.x-e.x,ddy=h.y-e.y,dd=Math.hypot(ddx,ddy);if(dd<280&&dd>12&&e.kind!=='boss')moveWithCollision(e,ddx/dd*190,ddy/dd*190,dt,dungeon,e.radius);}
      h.timer-=dt;
      if(h.timer<=0){
        h.timer=tickRule.every;
        for(const e of [...enemies]){
          if(distance(e,h)>h.max+e.radius)continue;
          if(tickRule.slow)e.slow=Math.max(e.slow,tickRule.slow);
          dealDamage(e,heroStats().power*(h.bal||1)*(h.m??tickRule.mult)*(1+(h.rank||0)*.12),h.school||tickRule.school,{dot:true});
        }
      }
    }
    if(h.type==='rain'&&h.life>0&&(h.timer-=dt)<=0){
      h.timer=.3;
      const near=enemies.filter(e=>distance(e,hero)<440);
      const t=near.length&&rng()<.75?near[Math.floor(rng()*near.length)]:{x:hero.x+(rng()-.5)*640,y:hero.y+(rng()-.5)*420};
      hazards.push({x:t.x+(rng()-.5)*30,y:t.y+(rng()-.5)*20,r:0,max:62,life:.5,type:'minimet',triggered:false,rank:h.rank,bal:h.bal,seed:rng()*6});
    }
    if(h.type==='minimet'&&!h.triggered&&h.life<.12){
      h.triggered=true;blast(h.x,h.y,62,heroStats().power*(h.bal||1)*1.1*(1+(h.rank||0)*.12),'fire');
      emitVfx(vfx,'fire',h.x,h.y-8,{max:12,speed:1.5});addDecal(decals,h.x,h.y,50,'scorch',3);shake.amount=Math.max(shake.amount,2.5);
    }
    if(h.life<=0)hazards.splice(hazards.indexOf(h),1);
  }
  // HUD 是 DOM：限制到约 12 次/秒，避免每帧改 DOM 造成卡顿。
  if((hudTimer-=dt)<=0){hudTimer=.08;updateHud();renderBuffBar();if(frameIndex%6===0)renderStatus();}
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
function enemyDraw(e){ Art.enemy(ctx,e,tick,monsterScale()/.7); }
function heroDraw(){
  const worn={};for(const [slot,id] of Object.entries(profile.equipped))worn[slot]=profile.inventory.find(x=>x.id===id)||null;
  hero.cls=profile.heroClass;
  const k=characterScale()*(heroStats().form==='bear'?1.18:1);
  const auraBuff=buffs.find(b=>b.group==='aura'&&b.until>tick);
  if(auraBuff){const sk=SKILLS[auraBuff.id],col=FX_COLOR[sk?.school]||'#ffd76a';ctx.save();ctx.globalCompositeOperation='lighter';
    drawEllipseGlow(ctx,hero.x,hero.y,auraBuff.aura?.r||120,(auraBuff.aura?.r||120)*.55,col,.16);
    ctx.globalAlpha=.5;ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.setLineDash([6,10]);ctx.lineDashOffset=-tick*25;ctx.beginPath();ctx.ellipse(hero.x,hero.y,62,24,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore();}
  const form=heroStats().form;
  if(form){ctx.save();ctx.globalCompositeOperation='lighter';drawEllipseGlow(ctx,hero.x,hero.y-50*k,42*k,70*k,form==='wolf'?'#9fb4ff':'#c08a4a',.22);ctx.restore();}
  if(armorUntil>tick){
    // 冰甲：三片冰晶环绕
    ctx.save();ctx.globalCompositeOperation='lighter';
    drawEllipseGlow(ctx,hero.x,hero.y-40*k,46*k,62*k,'#6fc4ff',.22);
    const s=shardSprite('#bfefff');
    for(let i=0;i<3;i++){const a=tick*2.4+i*2.094,x=hero.x+Math.cos(a)*38*k,y=hero.y-44*k+Math.sin(a)*16*k;
      ctx.globalAlpha=.85;if(s)ctx.drawImage(s,x-5,y-11,10,22);}
    ctx.restore();
  }
  if(hero.lift){ctx.save();ctx.globalAlpha=.4;ellipse(hero.x,hero.y+2,26,8,'#000');ctx.restore();}
  Art.hero(ctx,hero,tick,worn,k);
  if(hero.whirl){ctx.save();ctx.globalCompositeOperation='lighter';
    for(let i=0;i<3;i++){const a0=tick*16+i*2.09;ctx.globalAlpha=.6;ctx.strokeStyle='#e8e0d0';ctx.lineWidth=5;ctx.lineCap='round';
      ctx.beginPath();ctx.ellipse(hero.x,hero.y-30,hero.whirl.r*.8,hero.whirl.r*.45,0,a0,a0+1.1);ctx.stroke();}
    drawEllipseGlow(ctx,hero.x,hero.y-20,hero.whirl.r,hero.whirl.r*.55,'#e8e0d0',.14);ctx.restore();}
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
const GENERIC_KINDS=new Set(['arrow','javelin','knife','axe','bomb','blade','orb','tooth','bone','skull','holy','hammer','flame','boulder','tornado','bolt']);
function drawGenericMissile(m,x,y,ang){
  const c=m.color||FX_COLOR[m.school]||'#e8e0d0';
  switch(m.kind){
  case 'arrow':case 'javelin':case 'bone':case 'tooth':{
    const len=m.kind==='javelin'?34:m.kind==='bone'?40:m.kind==='tooth'?12:26;
    drawGlow(ctx,x,y,len*.7,c,m.school==='physical'?.25:.5);
    ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    ctx.strokeStyle=m.kind==='bone'||m.kind==='tooth'?'#efe6d0':'#8a6a48';ctx.lineWidth=m.kind==='bone'?5:2.4;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-len,0);ctx.lineTo(len*.3,0);ctx.stroke();
    ctx.fillStyle=m.kind==='bone'||m.kind==='tooth'?'#fffaf0':m.school==='physical'?'#d8dce0':c;
    ctx.beginPath();ctx.moveTo(len*.55,0);ctx.lineTo(len*.2,-4);ctx.lineTo(len*.2,4);ctx.closePath();ctx.fill();
    if(m.kind==='arrow'){ctx.fillStyle='#d0c0a0';ctx.fillRect(-len,-3,6,2);ctx.fillRect(-len,1,6,2);}
    ctx.restore();break;}
  case 'knife':case 'axe':case 'blade':case 'hammer':{
    drawGlow(ctx,x,y,20,c,.45);
    ctx.save();ctx.translate(x,y);ctx.rotate(tick*18);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    ctx.fillStyle=m.kind==='hammer'?'#ffd76a':m.kind==='axe'?'#b8bcc0':'#dfe4ea';
    if(m.kind==='blade'||m.kind==='knife'){for(let i=0;i<(m.kind==='blade'?3:2);i++){ctx.rotate(Math.PI*2/(m.kind==='blade'?3:2));ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(13,-3);ctx.lineTo(15,0);ctx.lineTo(13,3);ctx.closePath();ctx.fill();}}
    else{ctx.fillRect(-2,-11,4,22);ctx.fillRect(-9,-12,18,8);}
    ctx.restore();break;}
  case 'boulder':drawGlow(ctx,x,y,34,'#ff6a1f',.5);ctx.save();ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.fillStyle='#3a2a22';ctx.beginPath();ctx.arc(x,y+8,17,0,7);ctx.fill();
    ctx.strokeStyle='#ff9a40';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y+8,12,tick*6,tick*6+2);ctx.stroke();ctx.restore();break;
  case 'tornado':for(let i=0;i<5;i++){const r=6+i*4;drawEllipseGlow(ctx,x+Math.sin(tick*14+i)*4,y+12-i*9,r,r*.4,'#cfd6dc',.35);}break;
  case 'flame':drawGlow(ctx,x,y+10,20,'#ff5a1a',.7);drawGlow(ctx,x,y+2,9,'#ffd27a',.9,true);break;
  case 'skull':drawGlow(ctx,x,y,30,'#b46cff',.6);drawGlow(ctx,x,y,12,'#f0e0ff',1,true);break;
  case 'holy':drawGlow(ctx,x,y,24,'#ffd76a',.6);drawGlow(ctx,x,y,9,'#fffbe8',1,true);break;
  case 'bomb':drawGlow(ctx,x,y,22,'#ff6a1f',.6);drawGlow(ctx,x,y,8,'#ffe0a0',1,true);break;
  case 'orb':drawGlow(ctx,x,y,26,c,.6);drawGlow(ctx,x,y,10,'#ffffff',.9,true);break;
  default:drawGlow(ctx,x,y,20,c,.65);drawGlow(ctx,x,y,7,'#ffffff',.9,true);
  }
}
function missileDraw(m){
  const ang=Math.atan2(m.vy,m.vx),lift=28;
  // 地面投影
  ctx.globalAlpha=.35;ellipse(m.x,m.y,9,3,'#000');ctx.globalAlpha=1;
  ctx.save();ctx.globalCompositeOperation='lighter';
  const x=m.x,y=m.y-lift;
  if(m.kind==='eshot'){const z=m.size||1;drawGlow(ctx,x,y,22*z,m.color,.7);drawGlow(ctx,x,y,8*z,'#ffffff',.95,true);
    for(let i=1;i<=3;i++)drawGlow(ctx,x-Math.cos(ang)*i*7*z,y-Math.sin(ang)*i*7*z,(9-i*2)*z,m.color,.5-i*.12);}
  else if(GENERIC_KINDS.has(m.kind)){drawGenericMissile(m,x,y,ang);}
  else if(m.kind==='fireball'){
    drawGlow(ctx,x,y,44,'#ff5a14',.55);drawGlow(ctx,x,y,20,'#ffd27a',1,true);
    for(let i=1;i<=5;i++)drawGlow(ctx,x-Math.cos(ang)*i*10,y-Math.sin(ang)*i*10+Math.sin(tick*18+i)*3,16-i*2.2,'#ff7a2a',.65-i*.1);
  }else if(m.kind==='firebolt'){
    drawGlow(ctx,x,y,18,'#ff6a1f',.6);drawGlow(ctx,x,y,8,'#ffe0a0',1,true);
  }else if(m.kind==='iceshard'){
    const sp=shardSprite('#cff4ff');ctx.translate(x,y);ctx.rotate(ang+Math.PI/2);ctx.globalAlpha=1;if(sp)ctx.drawImage(sp,-3,-8,6,16);
  }else if(m.kind==='spike'){
    drawGlow(ctx,x,y,30,'#4fb0ff',.55);
    ctx.translate(x,y);ctx.rotate(ang);ctx.globalAlpha=1;
    ctx.fillStyle='#8fd8ff';ctx.beginPath();ctx.moveTo(24,0);ctx.lineTo(-6,-10);ctx.lineTo(-20,0);ctx.lineTo(-6,10);ctx.closePath();ctx.fill();
    ctx.fillStyle='#f2fdff';ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(-3,-4);ctx.lineTo(-13,0);ctx.lineTo(-3,4);ctx.closePath();ctx.fill();
  }else if(m.kind==='orb'){
    drawGlow(ctx,x,y,40,'#5ab8ff',.6);drawGlow(ctx,x,y,16,'#e8fbff',1,true);
    const sp=shardSprite('#dff7ff');for(let i=0;i<4;i++){const a=tick*7+i*Math.PI/2;ctx.save();ctx.translate(x+Math.cos(a)*14,y+Math.sin(a)*14);ctx.rotate(a);ctx.globalAlpha=.9;if(sp)ctx.drawImage(sp,-3,-7,6,14);ctx.restore();}
  }else if(m.kind==='cbolt'){
    drawGlow(ctx,x,y,16,'#8f8cff',.7);drawGlow(ctx,x,y,6,'#ffffff',1,true);
    ctx.globalAlpha=.9;ctx.strokeStyle='#e8e4ff';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(x-6,y);for(let i=0;i<3;i++)ctx.lineTo(x+(Math.random()-.5)*16,y+(Math.random()-.5)*16);ctx.stroke();
  }else if(m.kind==='ball'){
    drawGlow(ctx,x,y,48,'#6f7cff',.55);drawGlow(ctx,x,y,18,'#f2f0ff',1,true);
    ctx.globalAlpha=.85;ctx.strokeStyle='#dcd8ff';ctx.lineWidth=1.4;
    for(let k=0;k<3;k++){ctx.beginPath();ctx.moveTo(x,y);let px=x,py=y;const a=Math.random()*6.28;for(let j=1;j<=3;j++){px=x+Math.cos(a)*j*11+(Math.random()-.5)*8;py=y+Math.sin(a)*j*11+(Math.random()-.5)*8;ctx.lineTo(px,py);}ctx.stroke();}
  }else if(m.kind==='mm'||m.kind==='arc'){
    drawGlow(ctx,x,y,22,m.kind==='mm'?'#b46cff':'#7f86ff',.65);drawGlow(ctx,x,y,8,'#f4ecff',1,true);
    for(let i=1;i<=3;i++)drawGlow(ctx,x-Math.cos(ang)*i*8,y-Math.sin(ang)*i*8,8-i*1.8,m.kind==='mm'?'#c89cff':'#a9a0ff',.5-i*.12);
  }else if(m.kind==='ember'){
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
  if(T==='fnova'||T==='lnova'||T==='freeze'||T==='burst'){
    const dur=T==='fnova'?.5:T==='freeze'?.7:T==='burst'?.35:.4,p=1-clamp(h.life/dur,0,1),r=h.max*Math.sqrt(p),a=1-p;
    const col=T==='fnova'?'#ff6a1f':T==='lnova'?'#8f8cff':T==='freeze'||h.fx==='ice'?'#59b6ff':'#ff7a2a';
    const edge=T==='fnova'||(T==='burst'&&h.fx!=='ice')?'#ffd8a0':T==='lnova'?'#efeaff':'#d6f4ff';
    drawEllipseGlow(ctx,h.x,h.y,r*1.1,r*.65,col,.4*a);
    ctx.globalAlpha=a;ctx.strokeStyle=edge;ctx.lineWidth=2+7*a;
    if(T==='lnova'){ctx.beginPath();for(let i=0;i<=40;i++){const t=i/40*Math.PI*2,rr=r+(Math.random()-.5)*16;const x=h.x+Math.cos(t)*rr,y=h.y+Math.sin(t)*rr*.58;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();
      for(let i=0;i<6;i++){const t=Math.random()*6.28;ctx.lineWidth=1.5;bolt(h.x,h.y-20,h.x+Math.cos(t)*r,h.y+Math.sin(t)*r*.58,18,5);ctx.stroke();}}
    else{ctx.beginPath();ctx.ellipse(h.x,h.y,Math.max(2,r),Math.max(2,r*.58),0,0,Math.PI*2);ctx.stroke();}
    if(T==='freeze'){ctx.fillStyle='#effcff';ctx.beginPath();for(let i=0;i<32;i++){const t=i/32*Math.PI*2,cx=h.x+Math.cos(t)*r*.9,cy=h.y+Math.sin(t)*r*.52,len=14+10*((i*5)%3);ctx.moveTo(cx-5,cy);ctx.lineTo(cx,cy-len);ctx.lineTo(cx+5,cy);}ctx.fill();}
    if(T==='fnova')for(let i=0;i<14;i++){const t=i/14*Math.PI*2+tick;drawGlow(ctx,h.x+Math.cos(t)*r,h.y+Math.sin(t)*r*.58-8,12*a+4,'#ff9a40',a*.8);}
    return;
  }
  if(T==='beam'||T==='strike'){
    const a=clamp(h.life/(T==='beam'?.25:.3),0,1);
    const x1=T==='beam'?h.x:h.x+(Math.random()-.5)*20,y1=T==='beam'?h.y-40:h.y-420,x2=T==='beam'?h.x2:h.x,y2=T==='beam'?h.y2-40:h.y-10;
    ctx.globalAlpha=.45*a;ctx.strokeStyle='#8f8cff';ctx.lineWidth=12;bolt(x1,y1,x2,y2,30,T==='beam'?14:9);ctx.stroke();
    ctx.globalAlpha=a;ctx.strokeStyle='#f6f4ff';ctx.lineWidth=3;bolt(x1,y1,x2,y2,24,T==='beam'?14:9);ctx.stroke();
    drawGlow(ctx,x2,y2,T==='strike'?70:40,'#bfc0ff',a*.9,true);
    return;
  }
  if(T==='firewall'){
    const a=clamp(h.life,0,1);
    drawEllipseGlow(ctx,h.x,h.y,42,22,'#ff4a12',.45*a);
    for(let i=0;i<6;i++){const ph=tick*3.4+h.seed+i*1.1,rise=ph%1,x=h.x+Math.sin(i*1.9+h.seed)*14,y=h.y-rise*70;
      drawGlow(ctx,x+Math.sin(ph*5)*3,y,(20-rise*12),rise<.35?'#ffd27a':'#ff5a1a',a*(1-rise),rise<.2);}
    return;
  }
  if(T==='minimet'){
    if(!h.triggered){const p=clamp((.5-h.life)/.38,0,1),sx=h.x+110*(1-p),sy=h.y-300*(1-p)-10;
      drawEllipseGlow(ctx,h.x,h.y,40*p+10,22*p+6,'#ff5a1a',.35*p);
      for(let i=3;i>=0;i--)drawGlow(ctx,sx+i*9,sy-i*22,15-i*3,i<1?'#ffd27a':'#ff6a1f',.8-i*.15,i===0);}
    else{const a=clamp(h.life/.12,0,1);drawGlow(ctx,h.x,h.y-10,90*(1.3-a*.3),'#ff7a2a',.8*a,true);}
    return;
  }
  if(T==='slowtime'){
    const a=clamp(h.life,0,1),R=h.max,p=clamp((5-h.life)/.3,0,1);
    drawEllipseGlow(ctx,h.x,h.y-20,R*p,R*.62*p,'#9b8cff',.18*a);
    ctx.globalAlpha=.5*a;ctx.strokeStyle='#cfc4ff';ctx.lineWidth=2;ctx.setLineDash([14,10]);ctx.lineDashOffset=tick*20;
    ctx.beginPath();ctx.ellipse(h.x,h.y,R*p,R*.58*p,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    for(let i=0;i<8;i++){const t=tick*.4+i*.785;drawGlow(ctx,h.x+Math.cos(t)*R*.8,h.y+Math.sin(t)*R*.46-10,5,'#e6e0ff',.6*a);}
    return;
  }
  if(T==='blackhole'){
    const a=clamp(h.life*2,0,1),R=h.max;
    drawEllipseGlow(ctx,h.x,h.y,R*1.1,R*.66,'#6a2fa8',.35*a);
    for(let i=0;i<16;i++){const k=((tick*.9+i/16)%1),t=i*2.4+tick*3,rr=R*(1-k);
      drawGlow(ctx,h.x+Math.cos(t)*rr,h.y+Math.sin(t)*rr*.58-10,4+3*(1-k),'#c89cff',a*k);}
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=.9*a;ctx.fillStyle='#05020a';
    ctx.beginPath();ctx.ellipse(h.x,h.y-10,26,18,0,0,Math.PI*2);ctx.fill();
    ctx.globalCompositeOperation='lighter';ctx.globalAlpha=a;ctx.strokeStyle='#d6a8ff';ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(h.x,h.y-10,28+Math.sin(tick*9)*2,20,0,0,Math.PI*2);ctx.stroke();
    return;
  }
  if(T==='ewarn'){
    const k=1-clamp(h.life/h.dur,0,1),col=SCHOOL_COLOR[h.school]||'#ff4a3a';
    ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=.22+.18*k;ctx.fillStyle=col;ctx.beginPath();ctx.ellipse(h.x,h.y,h.max*k,h.max*.58*k,0,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.85;ctx.strokeStyle=col;ctx.lineWidth=2.5;ctx.beginPath();ctx.ellipse(h.x,h.y,h.max,h.max*.58,0,0,Math.PI*2);ctx.stroke();
    ctx.globalCompositeOperation='lighter';drawEllipseGlow(ctx,h.x,h.y,h.max,h.max*.58,col,.15+.25*k);
    return;
  }
  if(T==='eline'){
    const k=1-clamp(h.life/h.dur,0,1),col=SCHOOL_COLOR[h.school]||'#ff4a3a';
    ctx.save();ctx.translate(h.x,h.y);ctx.rotate(h.ang);ctx.globalCompositeOperation='source-over';
    ctx.globalAlpha=.25+.25*k;ctx.fillStyle=col;ctx.fillRect(0,-26,h.len*k,52);
    ctx.globalAlpha=.8;ctx.strokeStyle=col;ctx.lineWidth=2;ctx.strokeRect(0,-26,h.len,52);ctx.restore();
    return;
  }
  if(T==='epool'){
    const a=clamp(h.life/Math.min(1,h.dur),0,1),col=SCHOOL_COLOR[h.school]||'#7dff6a';
    drawEllipseGlow(ctx,h.x,h.y,h.max*1.1,h.max*.66,col,.4*a);
    for(let i=0;i<3;i++){const f=((tick*1.3+i/3+h.x*.01)%1);drawGlow(ctx,h.x+Math.sin(i*2.1+h.y)*h.max*.4,h.y-f*24,6+4*(1-f),col,a*(1-f)*.8);}
    return;
  }
  if(T==='eslash'){
    const a=clamp(h.life/.16,0,1);ctx.globalAlpha=.8*a;ctx.strokeStyle=h.color;ctx.lineWidth=7*a+2;ctx.lineCap='round';
    ctx.beginPath();ctx.ellipse(h.x,h.y-20,h.r,h.r*.6,0,h.ang-.9,h.ang+.9);ctx.stroke();return;
  }
  if(T==='slash'){
    const a=clamp(h.life/.18,0,1),r=h.range;
    ctx.globalAlpha=.75*a;ctx.strokeStyle=h.color;ctx.lineWidth=10*a+2;ctx.lineCap='round';
    ctx.beginPath();ctx.ellipse(h.x,h.y-24,r*.85,r*.55,0,h.ang-h.arc/2*(1.2-a*.4),h.ang+h.arc/2*(1.2-a*.4));ctx.stroke();
    ctx.globalAlpha=a;ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(h.x,h.y-24,r*.85,r*.55,0,h.ang-h.arc/2*.9,h.ang+h.arc/2*.9);ctx.stroke();
    return;
  }
  if(T==='gnova'||T==='pulse'||T==='curse'){
    const dur=T==='pulse'?.4:T==='curse'?.6:.45,p=1-clamp(h.life/dur,0,1),r=h.max*Math.sqrt(p),a=1-p,col=h.color||'#ffffff';
    drawEllipseGlow(ctx,h.x,h.y,r*1.1,r*.65,col,(T==='pulse'?.18:.35)*a);
    ctx.globalAlpha=(T==='pulse'?.5:.9)*a;ctx.strokeStyle=col;ctx.lineWidth=T==='pulse'?2:3+6*a;
    ctx.beginPath();ctx.ellipse(h.x,h.y,Math.max(2,r),Math.max(2,r*.58),0,0,Math.PI*2);ctx.stroke();
    if(h.fx==='bone'||h.fx==='earth'){ctx.fillStyle=h.fx==='bone'?'#efe6d0':'#c8a878';ctx.globalAlpha=a;ctx.beginPath();
      for(let i=0;i<22;i++){const t=i/22*Math.PI*2,cx=h.x+Math.cos(t)*r*.9,cy=h.y+Math.sin(t)*r*.52,len=12+8*((i*7)%3);ctx.moveTo(cx-4,cy);ctx.lineTo(cx,cy-len);ctx.lineTo(cx+4,cy);}ctx.fill();}
    if(T==='curse'){ctx.globalAlpha=a;ctx.fillStyle=col;for(let i=0;i<6;i++){const t=i/6*Math.PI*2+tick;drawGlow(ctx,h.x+Math.cos(t)*r*.7,h.y+Math.sin(t)*r*.4-20,6,col,a);}}
    return;
  }
  if(T==='garea'){
    const a=clamp(h.life/Math.min(1,h.dur),0,1),R=h.max,col=FX_COLOR[h.school]||'#ffffff';
    drawEllipseGlow(ctx,h.x,h.y,R*1.1,R*.66,col,(h.small?.28:.3)*a);
    if(h.small)return;
    ctx.globalAlpha=.4*a;ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(h.x,h.y,R,R*.58,0,0,Math.PI*2);ctx.stroke();
    const n=h.fx==='arrows'?10:8;
    for(let i=0;i<n;i++){
      const cyc=tick*2.4+i*.37,f=cyc%1,seed=Math.floor(cyc)*31+i*17;
      const gx=h.x+(((seed*73)%200)/100-1)*R*.8,gy=h.y+(((seed*41)%200)/100-1)*R*.45;
      if(h.fx==='arrows'){const x=gx+20*(1-f),y=gy-160*(1-f);ctx.globalAlpha=a;ctx.strokeStyle='#d8d0c0';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-5,y-18);ctx.stroke();if(f>.85)drawGlow(ctx,gx,gy,10,'#ffffff',a);}
      else if(h.fx==='poison'){drawGlow(ctx,gx,gy-f*40,10+f*8,'#6aff5a',a*(1-f)*.6);}
      else if(h.fx==='web'||h.school==='lightning'){if(Math.random()<.4){ctx.globalAlpha=a;ctx.strokeStyle='#d8d4ff';ctx.lineWidth=1.3;bolt(gx,gy,gx+(Math.random()-.5)*80,gy+(Math.random()-.5)*40,10,4);ctx.stroke();}}
      else if(h.fx==='bone'){ctx.globalAlpha=a;ctx.fillStyle='#efe6d0';ctx.beginPath();ctx.moveTo(gx-5,gy);ctx.lineTo(gx,gy-22);ctx.lineTo(gx+5,gy);ctx.fill();}
      else if(h.fx==='shadow'){drawGlow(ctx,gx,gy-10,14,'#7a3ad0',a*.6);}
      else drawGlow(ctx,gx,gy-f*50,14-f*8,f<.4?'#ffd27a':col,a*(1-f));
    }
    return;
  }
  if(T==='rain')return;
  // void 等其它：紫色冲击圈
  const a=clamp(h.life/.6,0,1);
  drawEllipseGlow(ctx,h.x,h.y,h.r*1.1,h.r*.66,'#a05ae0',.35*a);
  ctx.globalAlpha=.8*a;ctx.strokeStyle='#d6a8ff';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(h.x,h.y,Math.max(2,h.r),Math.max(2,h.r*.58),0,0,Math.PI*2);ctx.stroke();
}
const GROUND_FX=new Set(['ewarn','epool','eline','storm','inferno','nova','meteor','firewall','slowtime','blackhole','fnova','freeze','garea','curse','pulse']);
function drawSummons(){
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const h of summons){
    const a=clamp(h.life,0,1);
    drawEllipseGlow(ctx,h.x,h.y,34,18,'#ff4a12',.45*a);
    for(let i=0;i<3;i++){const t=tick*2+h.seed+i*2.1,hx=h.x+Math.cos(i*2.1-1.6)*12,hy=h.y-28-Math.sin(t)*4-i*3;
      drawGlow(ctx,hx,hy,14,'#ff7a2a',.8*a);drawGlow(ctx,hx,hy,6,'#ffe0a0',a,true);}
    for(let i=0;i<3;i++){const rise=((tick*1.5+i/3+h.seed)%1);drawGlow(ctx,h.x+(i-1)*8,h.y-rise*40,8-rise*5,'#ff9a40',a*(1-rise));}
  }
  // 冰刃环绕
  if(bladesUntil>tick){
    const sp=shardSprite('#d6f5ff'),k=characterScale();
    drawEllipseGlow(ctx,hero.x,hero.y,110,64,'#5ab8ff',.12);
    for(let i=0;i<5;i++){const a=tick*5+i*1.2566,x=hero.x+Math.cos(a)*88,y=hero.y-18+Math.sin(a)*48;
      ctx.save();ctx.translate(x,y);ctx.rotate(a+Math.PI/2);ctx.globalAlpha=.95;if(sp)ctx.drawImage(sp,-5,-14,10,28);ctx.restore();drawGlow(ctx,x,y,12,'#9fdcff',.5);}
  }
  // 雷暴：头顶电光
  if(thunderUntil>tick){const k=characterScale();drawGlow(ctx,hero.x,hero.y-120*k,30+Math.random()*6,'#8f8cff',.45);
    if(Math.random()<.3){ctx.globalAlpha=.8;ctx.strokeStyle='#e8e4ff';ctx.lineWidth=1.3;bolt(hero.x-10,hero.y-125*k,hero.x+(Math.random()-.5)*40,hero.y-80*k,10,4);ctx.stroke();}}
  ctx.restore();
}
const AMBIENT=[.74,.76,.77,.78,.77,.78,.74,.76,.77];
function lightPass(){
  lighting.begin(vw,vh,cam,AMBIENT[profile.region]??.66);
  lighting.light(hero.x,hero.y-30,mobileMode()?280:330,1);
  lighting.light(hero.x,hero.y-30,150,.6);
  for(const t of dungeon.torches)lighting.light(t.x,t.y-10,230+Math.sin(tick*7+t.x)*10,.9);
  for(const m of missiles)if(m.friendly||m.kind)lighting.light(m.x,m.y-20,m.kind==='fireball'||m.kind==='orb'||m.kind==='ball'?150:m.kind==='iceshard'?40:100,.7);
  for(const h of summons)lighting.light(h.x,h.y-20,140,.75);
  for(const a of allies)lighting.light(a.x,a.y-20,UNIT[a.unit]?.turret?120:90,.55);
  for(const h of hazards){
    if(h.type==='meteor')lighting.light(h.x,h.y,h.triggered?320:150,h.triggered?1:.5);
    else if(h.type==='storm')lighting.light(h.x,h.y,200,.55);
    else if(h.type==='inferno')lighting.light(h.x,h.y-10,120,.6);
    else if(h.type==='nova')lighting.light(h.x,h.y,260,.7*clamp(h.life/.45,0,1));
    else if(h.type==='chain')lighting.light(h.x2,h.y2-30,130,.8);
    else if(h.type==='firewall')lighting.light(h.x,h.y-20,110,.6);
    else if(h.type==='fnova'||h.type==='lnova'||h.type==='freeze'||h.type==='burst')lighting.light(h.x,h.y,h.max*1.3,.8*clamp(h.life*2,0,1));
    else if(h.type==='beam')lighting.light((h.x+h.x2)/2,(h.y+h.y2)/2,300,.8);
    else if(h.type==='strike')lighting.light(h.x,h.y,200,.9);
    else if(h.type==='minimet')lighting.light(h.x,h.y,h.triggered?160:70,.7);
    else if(h.type==='blackhole'||h.type==='slowtime')lighting.light(h.x,h.y,h.max,.35);
    else if(h.type==='ewarn')lighting.light(h.x,h.y,h.max*1.2,.4);
    else if(h.type==='garea'&&!h.small)lighting.light(h.x,h.y,h.max*1.2,.5);
    else if(h.type==='gnova')lighting.light(h.x,h.y,h.max*1.3,.7*clamp(h.life*2,0,1));
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
  for(const c of corpses)if(c.x>cam.x-80&&c.x<cam.x+vw+80&&c.y>cam.y-80&&c.y<cam.y+vh+80&&c.t>.55)Art.corpse(ctx,c,monsterScale()/.7);
  Art.scenery(ctx,cam,vw,vh,WIDTH,HEIGHT,tick,profile.region,dungeon.seed);
  // 地面法术（冰暴、火径、预警圈）画在角色下面
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const h of hazards)if(GROUND_FX.has(h.type)&&!h.triggered){ctx.globalAlpha=1;drawHazard(h);}
  drawSummons();
  ctx.restore();
  // Painter's order: stonework and props occlude actors when they stand behind them.
  const layers=[];
  for(const b of dungeon.blocks)if(b.x+b.w>cam.x-160&&b.x<cam.x+vw+160&&b.y+b.h>cam.y-150&&b.y<cam.y+vh+160)
    layers.push({y:b.y+b.h+9,render:()=>stoneDraw(b)});
  for(const t of dungeon.torches)if(t.x>cam.x-160&&t.x<cam.x+vw+160&&t.y>cam.y-160&&t.y<cam.y+vh+160)
    layers.push({y:t.y+13,render:()=>torchDraw(t)});
  for(const d of drops)if(d.x>cam.x-80&&d.x<cam.x+vw+80&&d.y>cam.y-80&&d.y<cam.y+vh+120)layers.push({y:d.y+7,render:()=>Art.loot(ctx,d,tick)});
  if(portal)layers.push({y:portal.y+12,render:()=>drawPortal(portal)});
  for(const d of dying)layers.push({y:d.e.y+9,render:()=>Art.enemyDeath(ctx,d.e,d.t,monsterScale()/.7)});
  for(const e of enemies)if(e.x>cam.x-140&&e.x<cam.x+vw+140&&e.y>cam.y-60&&e.y<cam.y+vh+200)layers.push({y:e.y+10,render:()=>enemyDraw(e)});
  for(const a of allies){const U=UNIT[a.unit]||UNIT.skeleton;if(a.x>cam.x-120&&a.x<cam.x+vw+120&&a.y>cam.y-60&&a.y<cam.y+vh+160)layers.push({y:a.y+(U.fly?40:8),render:()=>{a.facingLeft=(nearestTo(a,560)||hero).x<a.x;Art.ally(ctx,a,U,tick,monsterScale());}});}
  layers.push({y:hero.y+10,render:heroDraw});
  layers.sort((a,b)=>a.y-b.y);
  for(const layer of layers)layer.render();
  for(const m of missiles)missileDraw(m);
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const h of hazards)if(!(GROUND_FX.has(h.type)&&!h.triggered)){ctx.globalAlpha=1;drawHazard(h);}
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
  for(const e of enemies){minimap.fillStyle=e.kind==='boss'?'#ef8ec7':e.elite?'#f0c060':'#bb695e';minimap.fillRect(e.x*sx-1,e.y*sy-1,e.kind==='boss'?5:3,e.kind==='boss'?5:3);}
  minimap.fillStyle='#fff2a9';minimap.beginPath();minimap.arc(hero.x*sx,hero.y*sy,3,0,7);minimap.fill();
  minimap.strokeStyle='#bd9457';minimap.strokeRect(cam.x*sx,cam.y*sy,vw*sx,vh*sy);
}
function loop(now){
  const dt=Math.min(.04,(now-last)/1000 || .016);last=now;
  if(state==='playing'&&$('inventory').hidden&&$('portal-panel').hidden){
    if(hitStop>0){hitStop-=dt;tickVfx(vfx,dt*.25);}else update(dt);
  }
  if(!heroSelect?.open)render();requestAnimationFrame(loop);
}
function aimAt(clientX,clientY) {
  mouseScreen={x:clientX,y:clientY};
}
canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&hero)aimAt(e.clientX,e.clientY);});
canvas.addEventListener('pointerleave',()=>{mouseScreen=null;});
canvas.addEventListener('pointerdown',e=>{
  if(state!=='playing'||e.pointerType!=='mouse'||(e.button!==0&&e.button!==2))return;
  aimAt(e.clientX,e.clientY);const slot=e.button===0?0:1;
  heldSlots.add(slot);mouseSlots.set(e.button,slot);cast(profile.activeSkills[slot]);
});
const mouseSlots=new Map();
window.addEventListener('mouseup',e=>{if(mouseSlots.has(e.button)){heldSlots.delete(mouseSlots.get(e.button));mouseSlots.delete(e.button);}});
window.addEventListener('pointerup',e=>pointers.delete(e.pointerId));
window.addEventListener('pointercancel',e=>pointers.delete(e.pointerId));
$('abilitybar').addEventListener('pointerdown',e=>{
  const button=e.target.closest('button[data-skill]');
  if(!button||state!=='playing')return;
  e.preventDefault();
  const slot=Number(button.dataset.slot);button.setPointerCapture(e.pointerId);
  if(e.pointerType!=='mouse')mouseScreen=null; // 触屏：自动锁定最近的敌人
  heldSlots.add(slot);touchSlots.set(e.pointerId,slot);
  cast(profile.activeSkills[slot]);
});
const touchSlots=new Map();
function releaseTouch(e){if(touchSlots.has(e.pointerId)){heldSlots.delete(touchSlots.get(e.pointerId));touchSlots.delete(e.pointerId);}}
$('abilitybar').addEventListener('pointerup',releaseTouch);
$('abilitybar').addEventListener('pointercancel',releaseTouch);
window.addEventListener('keydown',e=>{
  const tag=document.activeElement?.tagName;
  if(['INPUT','TEXTAREA'].includes(tag)||e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key.toLowerCase();
  if(capturingSlot!==null){e.preventDefault();finishRebind(k);return;}
  if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)||/^f\d+$/.test(k)||k==="'"||k==='/')e.preventDefault();
  if(k==='escape'){if(!$('portal-panel').hidden)closePortalMenu();else if(!$('inventory').hidden)closeInventory();else onPause();return;}
  if(k==='b'){if(!$('inventory').hidden)closeInventory();else showInventory();return;}
  if(k==='t'){openPortalMenu();return;}
  if(k==='c'){toggleStatus();return;}
  if(state!=='playing'||!$('inventory').hidden)return;
  keys.add(k);
  if(!e.repeat){
    const slot=profile.keybinds.indexOf(k);
    if(slot>=0)cast(profile.activeSkills[slot]);
  }
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{clearInput();heldSlots.clear();});
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
    aggroInfo:()=>{const d=enemies.map(e=>Math.round(distance(e,hero)));return {alive:enemies.length,aware:enemies.filter(e=>e.aware!==false).length,near400:d.filter(x=>x<400).length,minDist:Math.min(...d)};},
    encounterInfo:()=>({kills,total,alive:enemies.length,elite:enemies.filter(e=>e.elite).length,waves:WAVE_COUNT,cls:profile.heroClass,effects:vfx.length,allies:allies.length,buffs:buffs.length}),
    setClass:(cls)=>{applyClass(cls,true);return profile.heroClass;},
    clearEnemies:()=>{enemies.length=0;missiles.length=0;hazards.length=0;return true;},
    spawnAt:(id,dx,dy,opts={})=>{const e=spawn(id,{x:hero.x+dx,y:hero.y+dy});Object.assign(e,opts);return e.id;},
    god:()=>{hero.maxHp=1e6;hero.hp=1e6;return true;},
    setLevel:(n)=>{profile.level=Math.max(1,Math.min(MAX_LEVEL,n|0));profile.skillPoints=Math.max(0,profile.level-1);hsCache=null;refreshWorldPickers();persist();return profile.level;},
    giveLoot:(opts={})=>{const it=makeLoot(rng,opts.level||profile.level,'qa-'+(nextId++),{cls:profile.heroClass,...opts});profile.inventory.push(it);persist();return it;},
    procTest:(school='fire')=>{procCast({school,mult:1},{x:hero.x+80,y:hero.y});return hazards.length;},
    info:()=>({name:profile.name,cls:profile.heroClass,level:profile.level,difficulty:profile.difficulty,mlvl:monsterLevel(),charId,chars:store.list().length}),
    castPreview:(key)=>{if(!SKILLS[key])throw new Error('invalid skill');hero.mana=1000;cooldowns[key]=0;cast(key);return {count:vfx.length,skill:key};},
    bossTest:()=>{
      if(state!=='playing')throw new Error('start game first');
      enemies.length=0;kills=total;
      const e=spawn('boss',{x:hero.x+180,y:hero.y-20});
      e.hp=1;dealDamage(e,10000,'fire');
      return {state,bossDefeated,drops:drops.map(d=>({name:d.item.name,rarity:d.item.rarity,persistent:!!d.persistent})),
        pending:profile.pendingLoot.length,bossKills:profile.bossKills[profile.difficulty|0][profile.region],pity:{...profile.pity}};
    }
  };
}
// ───── 角色选择（hero-select.js） ─────
let heroSelect=null;
function enterCharacter(id,difficulty=0){
  const raw=store.load(id);if(!raw){announce('角色存档读取失败',true);heroSelect.show('list');return;}
  charId=id;profile=sanitizeSave(raw);$('upgrade-chip').hidden=true;
  if(!profile.name)profile.name=store.list().find(c=>c.id===id)?.name||'持灯者';
  if(difficultyUnlocked(profile,difficulty))profile.difficulty=difficulty;
  allies=[];buffs=[];hsCache=null;wardHp=0;selectedItemId=null;capturingSlot=null;Object.keys(cooldowns).forEach(k=>cooldowns[k]=0);
  document.querySelector('.orb.energy small').textContent=CLASSES[profile.heroClass].resource;
  $('inv-heading').textContent=profile.name+' 的行囊';
  refreshWorldPickers();renderSkillBar();
  begin();
  announce(profile.name+' · '+CLASSES[profile.heroClass].name+' · '+DIFFICULTIES[profile.difficulty|0].name+'难度 · 怪物等级 '+monsterLevel(),true);
}
function openHeroSelect(){
  if(charId)persist();
  state='intro';clearInput();$('scrim').hidden=true;$('inventory').hidden=true;$('portal-panel').hidden=true;$('status-panel').hidden=true;
  heroSelect.show('list');
}
heroSelect=createHeroSelect({root:$('hero-select'),store,fresh:freshProfile,onEnter:enterCharacter});
$('btn-heroes').onclick=()=>{if(state==='playing'&&!confirm('返回角色选择？当前这一趟远征会结束（装备、经验已保存）。'))return;openHeroSelect();};
refreshWorldPickers();
build();state='intro';heroSelect.show();requestAnimationFrame(loop);
