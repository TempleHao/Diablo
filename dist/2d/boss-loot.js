/**
 * Regional boss-exclusive loot tables.
 * Pure, deterministic and independently testable; no asset dependencies.
 * Dedicated drops do not require paid assets or cloud services.
 */
import { rollDrops, normalizeItem, BOSS_ITEM_ICONS, DROP_RULES, MAX_LEVEL } from './systems.js';

export const BOSS_POOLS=Object.freeze([
  {id:'ashen-priest',name:'灰烬司祭',item:'炉誓秘杖',slot:'weapon',
    stats:{power:36},affixes:[{key:'fire',value:14},{key:'skillFire',value:1},{key:'crit',value:4}]},
  {id:'iron-warden',name:'铁狱典守',item:'典守之狱衣',slot:'robe',
    stats:{hp:65,armor:45},affixes:[{key:'hp',value:28},{key:'armor',value:20},{key:'resistFire',value:12}]},
  {id:'blood-prelate',name:'血印主教',item:'血印誓约护符',slot:'amulet',
    stats:{power:23,mana:18},affixes:[{key:'fire',value:13},{key:'critDmg',value:13},{key:'skillFire',value:1}]},
  {id:'rift-broodmother',name:'裂隙蛛母',item:'渊丝禁忌秘典',slot:'offhand',
    stats:{mana:54,armor:9},affixes:[{key:'cold',value:13},{key:'regen',value:4},{key:'power',value:13}]},
  {id:'nameless-ember',name:'失名者',item:'失名者的最后祷言',slot:'offhand',
    stats:{hp:23,mana:24},affixes:[{key:'fire',value:13},{key:'cold',value:12},{key:'skillCold',value:1}]},
  {id:'tomb-sentinel',name:'墓穴守魂者',item:'守魂者的夜行头冠',slot:'head',
    stats:{hp:44,armor:36},affixes:[{key:'hp',value:25},{key:'resistCold',value:13}]},
  {id:'blight-knight',name:'枯萎骑士',item:'朽化荆棘战靴',slot:'boots',
    stats:{armor:42},affixes:[{key:'resistFire',value:13},{key:'resistDark',value:15}]},
  {id:'frost-abbess',name:'永霜修女',item:'永霜寒玉戒',slot:'ring1',
    stats:{mana:26},affixes:[{key:'cold',value:17},{key:'crit',value:5},{key:'regen',value:4}]},
  {id:'obsidian-lord',name:'黑曜暴君',item:'黑曜焚世长杖',slot:'weapon',
    stats:{power:48},affixes:[{key:'fire',value:16},{key:'skillFire',value:1},{key:'critDmg',value:15}]}
]);
/** 首领奖励：3 次抽取（第一件至少史诗）+ 专属传奇（首杀必掉，之后 26%）。
 *  保底（v0.7）：连续 pity.legendary 次首领没出传奇/暗金，这次第一件必为传奇；暗金同理（pity.unique 次）。 */
export function rollBossRewards(rng,level,region,previousKills,newId,{cls=null,mf=0,difficulty=0,pity=null}={}){
  if(!Number.isInteger(region)||region<0||region>=BOSS_POOLS.length)throw new RangeError('invalid boss region');
  if(typeof rng!=='function'||typeof newId!=='function')throw new TypeError('missing loot RNG or ID factory');
  const pool=BOSS_POOLS[region],firstKill=previousKills===0;
  const P=DROP_RULES.pity,dry=pity||{legendary:0,unique:0};
  const force=dry.unique>=P.unique-1?'unique':dry.legendary>=P.legendary-1?'legendary':null;
  const drops=rollDrops(rng,{source:'boss',level,mf,cls,difficulty,newId,force});
  const exclusive=firstKill||rng()<.26;
  if(exclusive){
    const scale=1+Math.floor(Math.max(1,level)/8)*.14;
    const stats=Object.fromEntries(Object.entries(pool.stats).map(([key,val])=>[key,Math.round(val*scale)]));
    const item=normalizeItem({
      id:newId(),name:pool.item,cid:BOSS_ITEM_ICONS[pool.item],slot:pool.slot,rarity:3,ilvl:Math.min(MAX_LEVEL,Math.max(1,level)),
      req:Math.max(1,Math.min(MAX_LEVEL,Math.round(level*.7))),
      power:0,hp:0,mana:0,armor:0,value:450+Math.max(1,level)*18,...stats,
      affixes:pool.affixes.map(a=>({key:a.key,value:Math.max(1,Math.round(a.value*scale))}))
    });
    if(!item)throw new Error('boss loot table violated equipment rules');
    drops.push(item);
  }
  const gotLegend=drops.some(d=>d.rarity===3&&d.name!==pool.item),gotUnique=drops.some(d=>d.rarity===4&&!d.setId);
  const nextPity={legendary:gotLegend||gotUnique?0:dry.legendary+1,unique:gotUnique?0:dry.unique+1};
  return {id:pool.id,boss:pool.name,firstKill,exclusive,forced:force,pity:nextPity,
    materials:firstKill?16:4+rng()*7|0,drops};
}
