/* 归墟 2D · 传奇特效（v0.7）
 *
 * 每件传奇/暗金都有固定的「传奇特效」，由图鉴记录确定性生成（同一件装备永远是同样的特效）：
 *   职业传奇（291 件）：特效绑定所属职业的一条天赋树，部位决定特效类型——
 *     武器  +N 级某技能 & 该技能伤害 +X%        副手  某技能 +1 投射物（或冷却缩减）& 天赋树伤害
 *     头盔  +1 级该天赋树全部技能 & 某技能消耗降低   胸甲  受到伤害降低 & 受击时释放元素爆发
 *     手套  命中时几率释放元素特效 & 某技能伤害       靴子  移速 & 位移技能冷却
 *     腰带  击杀回血 & 天赋树伤害                      戒指  暴击时释放元素特效 & 暴击率
 *     项链  +1 级天赋树全部技能 & 天赋树伤害
 *   通用传奇与暗金：按装备的元素倾向生成通用特效（元素增伤、触发、减伤、移速……），暗金更强。
 * 数值随装备品级 q 成长：系数 0.6 + q/100 × 0.8。
 * 战斗接入点见 game.js：施法（等级/伤害/冷却/消耗/投射物）、dealDamage（触发/吸血/狂暴/元素）、injury（减伤/受击触发）、击杀。
 */
import {SKILLS,CLASSES} from './systems.js';
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const MAGE_DMG=new Set(['fire','fireball','meteor','firenova','hydra','inferno','firewall','armageddon','shard','nova','glacial','storm','frozenorb','blades','deepfreeze','cbolt','lightning','chain','lnova','ballz','thunder','mmissile','barrage','blackhole']);
const MAGE_PROJ=new Set();
const DMG_A=new Set(['proj','melee','nova','area','whirl','leap','charge','corpse']);
const MOBILITY_A=new Set(['dash','leap','charge']);
// 天赋树的元素：决定触发特效的样子
export const TREE_SCHOOL=Object.freeze({
  mage:{fire:'fire',cold:'cold',lightning:'lightning',arcane:'arcane'},
  amazon:{bow:'cold',spear:'lightning',passive:'physical'},
  assassin:{martial:'fire',shadow:'shadow',trap:'lightning'},
  barbarian:{combat:'physical',cry:'physical',mastery:'physical'},
  druid:{elem:'fire',shape:'physical',summon:'poison'},
  necro:{summon:'shadow',bone:'shadow',curse:'poison'},
  paladin:{combat:'holy',offense:'holy',defense:'holy'}
});
export const PROC_FX=Object.freeze({fire:'烈焰新星',cold:'冰霜新星',lightning:'连锁闪电',poison:'剧毒爆发',holy:'圣光爆发',shadow:'骨刺环',physical:'震荡波',arcane:'奥术飞弹'});
const SCHOOL_NAME={fire:'火焰',cold:'冰霜',lightning:'雷电',poison:'毒素',holy:'神圣',shadow:'暗影',physical:'物理',arcane:'奥术'};
const ELEMENT={火:'fire',炎:'fire',霜:'cold',冰:'cold',雷:'lightning',毒:'poison',光:'holy',暗影:'shadow',血:'physical',岩:'physical',风:'physical'};
const ownerOf=entry=>entry?.owner||null;
function treeSkills(cls,tree){
  const ids=Object.keys(SKILLS).filter(k=>SKILLS[k].cls===cls&&(!tree||SKILLS[k].tree===tree));
  const dmg=ids.filter(k=>cls==='mage'?MAGE_DMG.has(k):(DMG_A.has(SKILLS[k].a)||SKILLS[k].a==='aura'&&SKILLS[k].m)&&SKILLS[k].a!=='basic'&&!SKILLS[k].redeem);
  const summon=ids.filter(k=>['summon','turret'].includes(SKILLS[k].a)&&!SKILLS[k].shot?.heal||cls==='mage'&&k==='hydra');
  const proj=ids.filter(k=>cls!=='mage'&&SKILLS[k].a==='proj'&&!SKILLS[k].homing);
  const mobility=Object.keys(SKILLS).filter(k=>SKILLS[k].cls===cls&&(MOBILITY_A.has(SKILLS[k].a)||k==='blink'));
  return {ids,dmg,summon,proj,mobility};
}
const pick=(arr,h)=>arr.length?arr[h%arr.length]:null;
const SUMMON_TREES=new Set(['necro/summon','druid/summon']);
/** 一件传奇/暗金的特效列表。entry：图鉴记录；rarity：3 传奇 / 4 暗金。 */
const cache=new Map();
export function powersOf(entry,rarity){
  if(!entry||rarity<3)return [];
  const key=entry.id+'/'+rarity;if(cache.has(key))return cache.get(key);
  const h=hash(entry.id),q=entry.q||50,m=(.6+q/100*.8)*(rarity===4?1.25:1),slot=entry.s==='ring2'?'ring1':entry.s;
  const r5=x=>Math.max(1,Math.round(x/5)*5),r1=x=>Math.max(1,Math.round(x));
  const out=[];
  const cls=ownerOf(entry);
  if(cls){
    const tree=entry.tree,T=treeSkills(cls,tree),school=TREE_SCHOOL[cls]?.[tree]||'physical';
    const summonTree=SUMMON_TREES.has(cls+'/'+tree)||!T.dmg.length&&T.summon.length;
    const main=pick(summonTree&&T.summon.length?T.summon:T.dmg.length?T.dmg:treeSkills(cls).dmg,h);
    const second=pick((T.dmg.length?T.dmg:treeSkills(cls).dmg).filter(k=>k!==main),h>>>7)||main;
    switch(slot){
      case 'weapon':
        out.push({k:'rank',skill:main,n:q>=60?3:2});
        out.push(summonTree?{k:'minion',pct:r5(30*m),max:q>=50?1:0}:{k:'sdmg',skill:main,pct:r5(55*m)});break;
      case 'offhand':{
        const pj=T.proj.length?pick(T.proj,h>>>3):null;
        out.push(pj?{k:'proj',skill:pj,n:q>=70?2:1}:{k:'cdr',skill:second,pct:r5(25*m)});
        out.push({k:'tree',cls,tree,pct:r5(20*m)});break;}
      case 'head':out.push({k:'treeRank',cls,tree,n:1});out.push({k:'cost',skill:main,pct:r5(25*m)});break;
      case 'robe':out.push({k:'dr',pct:r1(9*m)});out.push({k:'proc',on:'hurt',chance:r5(18*m),school,mult:+(1.2*m).toFixed(2)});break;
      case 'gloves':out.push({k:'proc',on:'hit',chance:r1(9*m),school,mult:+(1*m).toFixed(2)});out.push({k:'sdmg',skill:second,pct:r5(30*m)});break;
      case 'boots':{
        out.push({k:'speed',pct:r1(10*m)});
        const mob=pick(T.mobility.length?T.mobility:treeSkills(cls).mobility,h>>>5);
        out.push(mob?{k:'cdr',skill:mob,pct:r5(30*m)}:{k:'dr',pct:r1(5*m)});break;}
      case 'belt':out.push({k:'heal',pct:+(2.5*m).toFixed(1)});out.push(summonTree?{k:'minion',pct:r5(20*m),max:0}:{k:'tree',cls,tree,pct:r5(15*m)});break;
      case 'ring1':out.push({k:'proc',on:'crit',chance:r5(22*m),school,mult:+(.9*m).toFixed(2)});out.push({k:'crit',pct:r1(4*m)});break;
      case 'amulet':out.push({k:'treeRank',cls,tree,n:1});out.push({k:'tree',cls,tree,pct:r5(25*m)});break;
      default:out.push({k:'tree',cls,tree,pct:r5(15*m)});
    }
  }else{
    const school=ELEMENT[entry.aff]||'physical',hasElem=school!=='physical';
    const elem=hasElem?{k:'elem',school,pct:r5(25*m)}:{k:'berserk',pct:r5(35*m)};
    const fam={
      weapon:[elem,{k:'proc',on:'hit',chance:r1(8*m),school:hasElem?school:'physical',mult:+(1*m).toFixed(2)}],
      offhand:[elem,{k:'dr',pct:r1(6*m)}],
      head:[{k:'crit',pct:r1(4*m)},{k:'heal',pct:+(2*m).toFixed(1)}],
      robe:[{k:'dr',pct:r1(9*m)},{k:'proc',on:'hurt',chance:r5(18*m),school:hasElem?school:'physical',mult:+(1.2*m).toFixed(2)}],
      gloves:[{k:'proc',on:'hit',chance:r1(9*m),school:hasElem?school:'physical',mult:+(1*m).toFixed(2)},{k:'crit',pct:r1(3*m)}],
      boots:[{k:'speed',pct:r1(10*m)},{k:'dr',pct:r1(4*m)}],
      belt:[{k:'heal',pct:+(2.5*m).toFixed(1)},{k:'leech',pct:+(1.5*m).toFixed(1)}],
      ring1:[{k:'proc',on:'crit',chance:r5(22*m),school:hasElem?school:'arcane',mult:+(.9*m).toFixed(2)},{k:'leech',pct:+(1.2*m).toFixed(1)}],
      amulet:[{k:'allSkill',n:1},elem],
      shoulders:[{k:'dr',pct:r1(7*m)},{k:'berserk',pct:r5(25*m)}]
    }[slot]||[elem];
    out.push(...(rarity===4?fam.slice(0,1).concat(fam[1]&&q>=70?[fam[1]]:[]):fam));
  }
  const frozen=Object.freeze(out.map(Object.freeze));cache.set(key,frozen);return frozen;
}
const onText={hit:'命中',crit:'暴击',hurt:'受到攻击',kill:'击杀'};
const sk=id=>'「'+(SKILLS[id]?.name||id)+'」';
const treeName=(cls,tree)=>CLASSES[cls]?.trees?.[tree]||tree;
/** 特效说明文字（中文）。 */
export function describePower(p){
  switch(p.k){
    case 'rank':return '+'+p.n+' 级'+sk(p.skill);
    case 'treeRank':return '+'+p.n+' 级全部「'+treeName(p.cls,p.tree)+'」技能';
    case 'sdmg':return sk(p.skill)+'伤害 +'+p.pct+'%';
    case 'tree':return '「'+treeName(p.cls,p.tree)+'」技能伤害 +'+p.pct+'%';
    case 'cdr':return sk(p.skill)+'冷却时间 -'+p.pct+'%';
    case 'proj':return sk(p.skill)+'额外射出 '+p.n+' 枚';
    case 'cost':return sk(p.skill)+'消耗 -'+p.pct+'%';
    case 'minion':return '召唤物伤害 +'+p.pct+'%'+(p.max?'，召唤上限 +'+p.max:'');
    case 'proc':return onText[p.on]+'时 '+p.chance+'% 几率释放'+PROC_FX[p.school]+'（'+Math.round(p.mult*100)+'% 强度）';
    case 'dr':return '受到的伤害 -'+p.pct+'%';
    case 'speed':return '移动速度 +'+p.pct+'%';
    case 'heal':return '击杀敌人回复 '+p.pct+'% 最大生命';
    case 'crit':return '暴击率 +'+p.pct+'%';
    case 'leech':return '造成伤害的 '+p.pct+'% 转化为生命';
    case 'berserk':return '生命低于 35% 时伤害 +'+p.pct+'%';
    case 'elem':return SCHOOL_NAME[p.school]+'伤害 +'+p.pct+'%';
    case 'allSkill':return '+'+p.n+' 级全部技能';
    case 'dmg':return '伤害 +'+p.pct+'%';
    case 'cdrAll':return '全部技能冷却 -'+p.pct+'%';
    case 'mf':return '寻宝几率 +'+p.pct+'%';
    default:return '';
  }
}
/** 汇总一组特效（装备 + 套装）成战斗用的修正表。 */
export function emptyLegend(){return {rank:{},treeRank:{},sdmg:{},tree:{},cdr:{},proj:{},cost:{},minionPct:0,minionMax:0,procs:[],dr:0,speed:0,heal:0,crit:0,leech:0,berserk:0,elem:{},allSkill:0,dmg:0,cdrAll:0,mf:0};}
export function addPower(L,p){
  const add=(map,key,v)=>{map[key]=(map[key]||0)+v;};
  switch(p.k){
    case 'rank':add(L.rank,p.skill,p.n);break;
    case 'treeRank':add(L.treeRank,p.cls+'/'+p.tree,p.n);break;
    case 'sdmg':add(L.sdmg,p.skill,p.pct);break;
    case 'tree':add(L.tree,p.cls+'/'+p.tree,p.pct);break;
    case 'cdr':add(L.cdr,p.skill,p.pct);break;
    case 'proj':add(L.proj,p.skill,p.n);break;
    case 'cost':add(L.cost,p.skill,p.pct);break;
    case 'minion':L.minionPct+=p.pct;L.minionMax+=p.max||0;break;
    case 'proc':L.procs.push(p);break;
    case 'elem':add(L.elem,p.school,p.pct);break;
    default:if(p.k in L&&typeof L[p.k]==='number')L[p.k]+=p.n??p.pct;
  }
  return L;
}
/** 技能受到的传奇加成：额外等级、伤害倍率、冷却倍率、消耗倍率、额外投射物。 */
export function skillLegend(L,id){
  const s=SKILLS[id];if(!L||!s)return {rank:0,dmg:1,cd:1,cost:1,proj:0};
  const tk=s.cls+'/'+s.tree;
  return {rank:(L.rank[id]||0)+(L.treeRank[tk]||0)+(L.allSkill||0),
    dmg:1+((L.sdmg[id]||0)+(L.tree[tk]||0))/100,
    cd:Math.max(.4,(1-Math.min(.6,(L.cdr[id]||0)/100))*(1-Math.min(.3,(L.cdrAll||0)/100))),
    cost:Math.max(.3,1-(L.cost[id]||0)/100),proj:L.proj[id]||0};
}
