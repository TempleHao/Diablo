/**
 * 黑铁遗珍 · 500 件装备目录。
 * Source: project workbook 黑铁遗珍_500件装备系统设定与名录.xlsx
 * 100 visual prototypes × 5 quality tiers. Pure data/rules; no DOM dependency.
 */
import {NAMES as N_NAMES,STATS as N_STATS} from './equipment-catalog-N.js';
import {NAMES as M_NAMES,STATS as M_STATS} from './equipment-catalog-M.js';
import {NAMES as E_NAMES,STATS as E_STATS} from './equipment-catalog-E.js';
import {NAMES as L_NAMES,STATS as L_STATS} from './equipment-catalog-L.js';
import {NAMES as U_NAMES,STATS as U_STATS} from './equipment-catalog-U.js';
export const CATALOG_QUALITY_NAMES=Object.freeze(["普通","魔法","史诗","传奇","暗金遗珍"]);
export const CATALOG_QUALITY_CODES=Object.freeze(["N","M","E","L","U"]);
export const CATALOG_QUALITY_COLORS=Object.freeze(["#B7B7B7","#3293FF","#AF5CFF","#FF8928","#D8AA53"]);
const PROTOTYPES=[["weapon","主手","短剑","刺客","霜",1,1],["weapon","主手","长剑","野蛮人","雷",1,2],["weapon","主手","单手剑","刺客","血",1,3],["weapon","主手","直剑","圣骑士","光",1,4],["weapon","主手","弯刀","刺客","风",1,5],["weapon","主手","单手斧","野蛮人","岩",1,6],["weapon","双手","双手斧","野蛮人","火",1,7],["weapon","主手","钉锤","圣骑士","毒",1,8],["weapon","双手","重锤","野蛮人","雷",1,9],["weapon","双手","长枪","亚马逊","风",1,10],["weapon","主手","投枪","亚马逊","雷",2,1],["weapon","主手","战斧","野蛮人","岩",2,2],["weapon","双手","双刃斧","野蛮人","火",2,3],["weapon","双手","钩镰枪","亚马逊","毒",2,4],["weapon","双手","三叉戟","亚马逊","霜",2,5],["weapon","主手","短矛","亚马逊","血",2,6],["weapon","双手","镰刀","死灵法师","暗",2,7],["weapon","主手","链锤","圣骑士","雷",2,8],["weapon","主手","链锤","野蛮人","岩",2,9],["weapon","主手","棍棒","德鲁伊","毒",2,10],["weapon","双手","长弓","亚马逊","风",3,1],["weapon","双手","短弓","亚马逊","霜",3,2],["weapon","双手","骨弓","亚马逊","暗",3,3],["weapon","双手","反曲弓","亚马逊","雷",3,4],["weapon","双手","轻弩","亚马逊","毒",3,5],["weapon","双手","重弩","亚马逊","火",3,6],["offhand","箭袋","箭囊","亚马逊","血",3,7],["offhand","箭袋","箭囊","亚马逊","光",3,8],["weapon","主手","投掷刀","刺客","雷",3,9],["weapon","主手","投掷刀","刺客","火",3,10],["weapon","双手","法杖","法师","霜",4,1],["weapon","主手","权杖","圣骑士","光",4,2],["weapon","双手","骨杖","死灵法师","暗",4,3],["weapon","双手","法杖","法师","火",4,4],["weapon","主手","魔杖","死灵法师","毒",4,5],["weapon","双手","晶杖","法师","雷",4,6],["weapon","双手","自然法杖","德鲁伊","岩",4,7],["weapon","主手","权杖","圣骑士","血",4,8],["offhand","副手","轻盾","刺客","岩",5,1],["offhand","副手","战盾","野蛮人","血",5,2],["offhand","副手","鸢盾","圣骑士","暗",5,3],["offhand","副手","铁盾","圣骑士","光",5,4],["offhand","副手","塔盾","野蛮人","火",5,5],["offhand","副手","钉刺盾","刺客","毒",5,6],["offhand","副手","骨盾","死灵法师","暗",5,7],["offhand","副手","骑士盾","圣骑士","霜",5,8],["head","头部","圆盔","全职业","岩",6,1],["head","头部","骑士盔","圣骑士","光",6,2],["head","头部","锁甲兜帽","刺客","风",6,3],["head","头部","布帽","法师","霜",6,4],["head","头部","皮帽","德鲁伊","毒",6,5],["head","头部","檐盔","亚马逊","雷",6,6],["head","头部","面甲","野蛮人","火",6,7],["head","头部","全盔","圣骑士","血",6,8],["robe","胸部","皮甲","刺客","风",7,1],["robe","胸部","锁甲","野蛮人","岩",7,2],["robe","胸部","胸甲","圣骑士","光",7,3],["robe","胸部","铆钉甲","野蛮人","血",7,4],["robe","胸部","布甲","法师","霜",7,5],["robe","胸部","板甲","圣骑士","雷",7,6],["robe","胸部","兽皮甲","德鲁伊","毒",7,7],["robe","胸部","法袍","死灵法师","暗",7,8],["shoulders","肩部","护肩","野蛮人","岩",8,1],["shoulders","肩部","护肩","亚马逊","风",8,2],["shoulders","肩部","骨肩","德鲁伊","毒",8,3],["shoulders","肩部","刺肩","刺客","血",8,4],["shoulders","肩部","皮肩","法师","霜",8,5],["shoulders","肩部","重肩","圣骑士","光",8,6],["gloves","手部","皮手套","刺客","风",9,1],["gloves","手部","铁手套","野蛮人","岩",9,2],["gloves","手部","护腕","德鲁伊","毒",9,3],["gloves","手部","钢手套","圣骑士","光",9,4],["gloves","手部","布手套","法师","霜",9,5],["gloves","手部","指套","死灵法师","暗",9,6],["boots","脚部","皮靴","亚马逊","风",10,1],["boots","脚部","毛靴","德鲁伊","霜",10,2],["boots","脚部","铁靴","圣骑士","岩",10,3],["boots","脚部","重靴","野蛮人","雷",10,4],["boots","脚部","兽皮靴","刺客","毒",10,5],["boots","脚部","轻靴","刺客","血",10,6],["belt","腰部","腰带","野蛮人","岩",11,1],["belt","腰部","皮带","德鲁伊","毒",11,2],["belt","腰部","束腰","刺客","血",11,3],["belt","腰部","锁带","圣骑士","雷",11,4],["belt","腰部","骨带","死灵法师","暗",11,5],["belt","腰部","布带","法师","霜",11,6],["belt","腰部","工具带","亚马逊","风",11,7],["ring1","戒指","戒指","全职业","岩",11,8],["ring1","戒指","戒指","全职业","血",11,9],["ring1","戒指","戒指","全职业","霜",11,10],["amulet","项链","护符","全职业","光",12,1],["amulet","项链","牙饰","德鲁伊","毒",12,2],["amulet","项链","吊坠","圣骑士","光",12,3],["amulet","项链","骸骨护符","死灵法师","暗",12,4],["amulet","项链","圆坠","全职业","岩",12,5],["amulet","项链","祈福符","法师","霜",12,6],["amulet","项链","獠牙符","亚马逊","血",12,7],["amulet","项链","护符袋","刺客","风",12,8],["offhand","副手","法典","法师","雷",12,9],["offhand","副手","符文书卷","死灵法师","火",12,10]];
const NAMES=[N_NAMES,M_NAMES,E_NAMES,L_NAMES,U_NAMES];
const STATS=[N_STATS,M_STATS,E_STATS,L_STATS,U_STATS];
export const CATALOG_SIZE=500;
export const CATALOG_TIER_SIZE=100;
const DROP_BANDS=Object.freeze([
  [1,9,[82,18,0,0,0]],[10,24,[64,33,3,0,0]],[25,44,[48,38,12,2,0]],
  [45,64,[33,39,22,5.7,.3]],[65,79,[26,36,28,9.3,.7]],[80,100,[20,32,32,15,1]]
]);
const clampLevel=level=>Math.max(1,Math.min(100,Math.floor(Number(level)||1)));
export function catalogEntry(rarity,index){
  if(!Number.isInteger(rarity)||rarity<0||rarity>4)throw new RangeError('invalid catalog rarity');
  if(!Number.isInteger(index)||index<0||index>=CATALOG_TIER_SIZE)throw new RangeError('invalid catalog prototype');
  const [slot,part,subtype,preferredClass,theme,iconRow,iconCol]=PROTOTYPES[index];
  const [requiredLevel,hands,attack,armor,hp,mana,mainStat,affixCount,sockets,score]=STATS[rarity][index];
  const code=CATALOG_QUALITY_CODES[rarity],num=String(index+1).padStart(3,'0');
  return Object.freeze({
    catalogId:`EQ-${code}-${num}`,prototypeId:`B${num}`,rarity,name:NAMES[rarity][index],
    slot,part,subtype,preferredClass,theme,requiredLevel,hands,attack,armor,hp,mana,mainStat,
    affixCount,sockets,score,iconRow,iconCol,qualityColor:CATALOG_QUALITY_COLORS[rarity]
  });
}
export function allCatalogEntries(){
  const result=[];
  for(let rarity=0;rarity<5;rarity++)for(let index=0;index<CATALOG_TIER_SIZE;index++)result.push(catalogEntry(rarity,index));
  return result;
}
export function catalogEntryById(id){
  const match=/^EQ-([NMELU])-(\d{3})$/.exec(String(id||''));
  if(!match)return null;
  const rarity=CATALOG_QUALITY_CODES.indexOf(match[1]),index=Number(match[2])-1;
  if(rarity<0||index<0||index>=CATALOG_TIER_SIZE)return null;
  return catalogEntry(rarity,index);
}
export function rarityWeights(level){
  const n=clampLevel(level);
  return DROP_BANDS.find(([lo,hi])=>n>=lo&&n<=hi)[2].slice();
}
export function rollCatalogRarity(rng,level){
  if(typeof rng!=='function')throw new TypeError('rng required');
  const weights=rarityWeights(level),roll=Math.max(0,Math.min(.999999999,Number(rng())||0))*100;
  let cumulative=0;
  for(let rarity=0;rarity<weights.length;rarity++){cumulative+=weights[rarity];if(roll<cumulative)return rarity;}
  return 0;
}
export function eligibleCatalogEntries(level,rarity){
  const n=clampLevel(level),result=[];
  for(let i=0;i<CATALOG_TIER_SIZE;i++)if(STATS[rarity][i][0]<=n)result.push(i);
  return result;
}
export function pickCatalogEntry(rng,level,forcedRarity=null){
  if(typeof rng!=='function')throw new TypeError('rng required');
  const n=clampLevel(level);
  let rarity=forcedRarity==null?rollCatalogRarity(rng,n):forcedRarity;
  if(!Number.isInteger(rarity)||rarity<0||rarity>4)throw new RangeError('invalid forced rarity');
  let eligible=eligibleCatalogEntries(n,rarity);
  while(!eligible.length&&rarity>0){rarity--;eligible=eligibleCatalogEntries(n,rarity);}
  if(!eligible.length)eligible=eligibleCatalogEntries(100,0);
  const roll=Math.max(0,Math.min(.999999999,Number(rng())||0));
  const index=eligible[Math.min(eligible.length-1,Math.floor(roll*eligible.length))];
  return catalogEntry(rarity,index);
}
