/* 归墟 2D · 装备命名（v1.6，规则见 docs/2D-NAMING.md，词库见 scripts/2d-naming/lexicon.py）
 *
 * 每件装备都是从四方漂入归墟的遗物：东土（中国古文、古兵器）或西境（欧洲古兵器、法器与西方奇幻，专名意译）。
 * 一个名字只用一套词库，绝不混用。出身 origin：'e' 东土 / 'w' 西境。
 *   普通  品相 + 基底            百炼横刀 / 淬火阔剑
 *   魔法  前缀 + 基底 · 后缀      霜横刀·蛟 / 凛冬阔剑·猛犸（前缀取第一条词缀，后缀取第二条，数值高用强一档的字）
 *   史诗  意象 + 器称            白虹锋、易水匕 / 鸦宴剑、白鹿弓
 *   传奇、暗金  真实名器，或古代英雄 / 先知的「某某之X」（固定，见 naming-data.js 的 NAMED）
 *   套装  套装名 · 部位          圆桌·衣
 * 名字由（图鉴编号、出身、品质、物品等级、词缀、物品 ID）确定生成，读档时自动换成新名字。
 */
import {NAMING as N} from './naming-data.js';

const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
const CLS_BY_CN={'亚马逊':'amazon','刺客':'assassin','野蛮人':'barbarian','德鲁伊':'druid','死灵法师':'necro','圣骑士':'paladin','法师':'mage'};
export const kindOf=entry=>N.KIND_OF[entry?.sub]||N.SLOT_KIND[entry?.s]||'amulet';
/** 出身：传奇 / 暗金固定；其余按物品自带的 origin，没有时按物品 ID 稳定地取一半。 */
export function originOf(item,entry){
  const fixed=N.NAMED[entry?.id];if(fixed)return fixed[1];
  return item?.origin==='e'||item?.origin==='w'?item.origin:(hash(item?.id)&1?'e':'w');
}
/** 基底名（东 / 西），职业装备图上的头盔、胸甲按职业换名词。 */
export function baseName(entry,o,h=0){
  const cls=entry?.owner||CLS_BY_CN[entry?.cls];
  const over=N.CLASS_BASE[cls+'|'+entry?.sub];
  const b=N.BASE[entry?.sub];
  const list=over?(o==='e'?over[0]:over[1]):b?(o==='e'?b[1]:b[2]):[entry?.sub||'遗物'];
  return list[h%list.length];
}
function strong(a,max){return !!max&&a.value>=max*.65;}
/** 命名。item：{id, ilvl, affixes, origin}；entry：图鉴记录。 */
export function nameItem(item,rarity,affixMax={},entry=null){
  if(!entry)return item.name;
  const fixed=N.NAMED[entry.id];
  if(fixed&&rarity>=3)return fixed[0];
  const o=originOf(item,entry),h=hash(item.id),e=o==='e';
  const base=baseName(entry,o,hash(entry.id));
  if(rarity>=2){
    const A=e?N.EPIC_E:N.EPIC_W,W=N.KIND_WORD[kindOf(entry)]||N.KIND_WORD.amulet;
    const words=e?W[0]:W[1];
    return A[h%A.length]+words[(h>>>8)%words.length];
  }
  if(rarity===1){
    const [a1,a2]=item.affixes||[];
    const P=e?N.PREFIX_E:N.PREFIX_W,S=e?N.SUFFIX_E:N.SUFFIX_W;
    const pre=a1?(P[a1.key]?.[strong(a1,affixMax[a1.key])?1:0]||''):'';
    const suf=a2?(S[a2.key]?.[strong(a2,affixMax[a2.key])?1:0]||''):'';
    return pre+base+(suf?'·'+suf:'');
  }
  const mat=(N.BASE[entry.sub]||['metal'])[0],g=N.GRADE[mat]||N.GRADE.metal;
  const grade=(e?g[0]:g[1])[Math.min(4,Math.floor((item.ilvl||1)/20))];
  // 避免「熟铁铁胄」：品相末字与基底首字相同时合并
  return grade.at(-1)===base[0]?grade+base.slice(1):grade+base;
}
/** 传奇 / 暗金的出处说明（详情面板里显示）。 */
export const loreFor=entry=>N.NAMED[entry?.id]?.[2]||'';
export const setName=cls=>N.SET_NAMES[cls]||'';
export const setPieceWord=slot=>N.SET_PIECE[slot==='ring2'?'ring1':slot]||'';
export const originLabel=o=>o==='e'?'东土遗物':'西境遗物';
/** 质感检查用：名字是否触犯禁用词，暗黑意象字是否超过一个。 */
export function nameProblems(name){
  const out=[];for(const w of N.BANNED)if(name.includes(w))out.push('禁用词 '+w);
  if([...name].filter(c=>N.DARK.includes(c)).length>1)out.push('暗黑意象超过一个');
  return out;
}
