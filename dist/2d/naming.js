/* 归墟 2D · 装备命名规则（v0.6）
 *
 * 品质决定名字怎么来，名字反过来能读出装备是什么：
 *   普通  「品相 + 基底」     品相随物品等级与材质变化：锈蚀长剑 → 淬火长剑 → 精工长剑；破旧皮靴 → 鞣制皮靴。
 *   魔法  「前缀 + 基底·后缀」 前缀取第一条词缀、后缀取第二条词缀，数值高时用更强的字：微焰长剑 / 炽焰长剑·疾风。
 *                              看名字就知道它带什么属性（同《暗黑破坏神》的魔法物品）。
 *   史诗  「意象 + 器称」     两个词随机组合，后半个词由部位决定：血月獠牙（武器）、寂灭之冠（头盔）、亡魂之握（手套）。
 *   传奇  手写专名（100 个）  短而有画面：霜吻、焚城、苍狼、晨祷。
 *   暗金  手写专名（100 个）  带人物或传说的称谓：寒鸦的最后一吻、灰烬君王的处刑斧。
 *   首领专属 / 套装：保留各自的固定名字。
 * 所有名字由（图鉴编号、品质、物品等级、词缀、物品 ID）确定性生成，读档时自动换成新名字。
 */
// 基底：显示名、材质（决定普通品相用词）、器称组（决定史诗后半个词）
const B=(n,mat,grp)=>({n,mat,grp});
export const BASES=[null,
  B('短剑','metal','blade'),B('长剑','metal','blade'),B('单手剑','metal','blade'),B('直剑','metal','blade'),B('弯刀','metal','blade'),
  B('手斧','metal','axe'),B('双手斧','metal','axe'),B('钉锤','metal','mace'),B('战锤','metal','mace'),B('长枪','metal','spear'),
  B('标枪','metal','spear'),B('战斧','metal','axe'),B('钩斧','metal','axe'),B('钩镰枪','metal','spear'),B('三叉戟','metal','spear'),
  B('短矛','metal','spear'),B('镰刀','metal','scythe'),B('流星锤','metal','mace'),B('链锤','metal','mace'),B('狼牙棒','wood','mace'),
  B('长弓','wood','bow'),B('猎弓','wood','bow'),B('骨弓','bone','bow'),B('反曲弓','wood','bow'),B('轻弩','wood','bow'),
  B('重弩','wood','bow'),B('箭囊','leather','quiver'),B('箭袋','leather','quiver'),B('飞刀','metal','blade'),B('投刃','metal','blade'),
  B('枝杖','wood','staff'),B('权杖','metal','staff'),B('骨杖','bone','staff'),B('乌木杖','wood','staff'),B('咒杖','wood','staff'),
  B('晶杖','jewel','staff'),B('鹿角杖','wood','staff'),B('铁权杖','metal','staff'),B('圆盾','wood','shield'),B('战盾','metal','shield'),
  B('鸢盾','metal','shield'),B('铁盾','metal','shield'),B('塔盾','metal','shield'),B('刺盾','metal','shield'),B('骨盾','bone','shield'),
  B('纹章盾','metal','shield'),B('圆盔','metal','helm'),B('骑士盔','metal','helm'),B('锁甲兜帽','metal','helm'),B('兜帽','cloth','helm'),
  B('皮盔','leather','helm'),B('檐盔','metal','helm'),B('面甲','metal','helm'),B('覆面盔','metal','helm'),B('皮甲','leather','chest'),
  B('锁甲','metal','chest'),B('胸甲','metal','chest'),B('铆钉甲','leather','chest'),B('布衣','cloth','chest'),B('板甲','metal','chest'),
  B('兽皮甲','leather','chest'),B('法袍','cloth','chest'),B('护肩','metal','shoulder'),B('鹰羽护肩','leather','shoulder'),B('骨肩','bone','shoulder'),
  B('刺肩','metal','shoulder'),B('皮肩','leather','shoulder'),B('重肩','metal','shoulder'),B('皮手套','leather','glove'),B('铁拳套','metal','glove'),
  B('护腕','leather','glove'),B('钢护手','metal','glove'),B('布手套','cloth','glove'),B('骨指套','bone','glove'),B('皮靴','leather','boot'),
  B('毛靴','leather','boot'),B('铁靴','metal','boot'),B('重靴','metal','boot'),B('兽皮靴','leather','boot'),B('轻靴','leather','boot'),
  B('腰带','leather','belt'),B('兽牙带','leather','belt'),B('束腰','cloth','belt'),B('锁链腰带','metal','belt'),B('骨带','bone','belt'),
  B('布腰封','cloth','belt'),B('工具带','leather','belt'),B('铁戒','jewel','ring'),B('血戒','jewel','ring'),B('银戒','jewel','ring'),
  B('护符','jewel','amulet'),B('兽牙项链','bone','amulet'),B('日轮吊坠','jewel','amulet'),B('颅骨护符','bone','amulet'),B('圆坠','jewel','amulet'),
  B('祈福符','jewel','amulet'),B('獠牙符','bone','amulet'),B('护符袋','leather','amulet'),B('法典','cloth','tome'),B('符文书卷','cloth','tome')
];
// 传奇专名（按基底编号 1–100）
export const LEGENDARY=[null,
  '霜吻','裂空','饮血者','晨祷','疾风新月','碎石者','焚城','腐疫','雷鸣','逐风者',
  '霹雳','劈山','双生烈焰','毒蛇之牙','冰海之怒','猩红獠牙','收魂','流星','碎岩链','荆棘根',
  '苍狼','冬鸦','骸骨之弦','雷鸣之弦','毒刺','焚心','血羽','晨光箭袋','电光飞刃','火鸦',
  '冰封枝杖','圣光之心','骸骨号令','余烬','蛊毒','雷晶','鹿王之角','血誓','守门人','血墙',
  '夜幕','圣壁','熔铁壁垒','荆棘之拥','骸骨壁垒','寒霜誓言','石心','圣卫','无影','霜语',
  '林间低语','风暴之檐','熔岩之面','血面','疾风之衣','山岳锁甲','日焰','血战','冰霜编织','雷霆之胄',
  '野兽之皮','夜行者','磐石','鹰翼','腐骨','荆刺','雪原','圣光之负','迅手','碎骨拳',
  '野性','圣手','霜指','骨指','疾行','雪踪','重踏','雷步','沼泽之足','血迹',
  '坚石束带','兽牙','赤绳','雷链','骸骨束带','冰丝','游侠腰带','焚星','血誓之戒','冰心',
  '残阳','狼牙链','日轮','颅骨坠','地心','霜祷','血牙','风语囊','风暴典仪','焚咒卷'
];
// 暗金遗珍专名
export const UNIQUE=[null,
  '寒鸦的最后一吻','雷霆王的誓剑','猩红修女之刺','圣徒遗骨之剑','沙暴王子的新月','山岳之心','灰烬君王的处刑斧','瘟疫主教的钉锤','天穹崩落','女武神的穿星枪',
  '风暴之女的标枪','巨人之颅','龙骸怒焰','千年毒沼','沉没王国的潮戟','狩猎女王的初矛','死神的割礼','天罚流星','囚徒之枷','古树的怒火',
  '千眼猎神之弓','霜月女猎手','亡者的叹息','天弓星陨','黑沼猎手','攻城者的怒火','嗜血箭海','天使的羽翼','千刃风暴','凤凰之羽',
  '永冬女王的权杖','大主教的光辉','白骨君王的手杖','焚世者','瘟疫之源','风暴之眼','大地母亲的怀抱','血月主教的权柄','晨昏守望者','战争之母',
  '万骸之主的壁垒','最后的守护','火狱之门','毒蝎的背甲','万魂之盾','冰原骑士团长','山王之冠','千年王冕','刺客大师的面纱','冰之贤者',
  '德鲁伊长老之冠','雷霆女王','狂怒之王','十字军之颅','暗影之舞','不破之链','遗骸君主的胸甲','屠夫的围裙','永冬法衣','天罚铠甲',
  '万兽之王的皮毛','亡者之袍','巨人的肩膀','女武神之翼','瘟疫之王','刽子手','冰川之心','殉道者之肩','千手盗贼','巨人之拳',
  '狼王的护腕','审判之手','寒冬之握','死灵之握','风行者','永冻行者','山岳之足','风暴行军','毒沼行者','影舞者',
  '泰坦之腰','猎王之带','血誓之缚','风暴之缚','亡者的腰链','寒霜之束','远行者的遗囊','永劫之戒','吸血鬼之吻','冬至之戒',
  '先知之眼','野兽之魂','太阳神之泪','死神的凝视','世界之石','冰后的祈祷','狩猎之神','千面者','初民禁典','末日启示录'
];
const GRADE={metal:['锈蚀','粗铁','精铁','淬火','精工'],leather:['破旧','粗革','硬革','鞣制','精工'],cloth:['褪色','粗布','亚麻','绣纹','精织'],
  bone:['枯朽','粗骨','磨光','雕纹','精雕'],wood:['干裂','粗木','硬木','铁木','精工'],jewel:['黯淡','粗糙','打磨','雕花','精工']};
// 魔法前缀：[普通, 强]；后缀
const PREFIX={power:['增幅','强能'],hp:['健壮','坚韧'],mana:['灵性','睿智'],armor:['坚固','铁壁'],crit:['锐利','致命'],critDmg:['凶残','屠戮'],
  haste:['灵巧','迅捷'],fire:['微焰','炽焰'],cold:['寒冷','霜冻'],lightning:['静电','雷鸣'],physical:['锋利','残暴'],poison:['腐蚀','剧毒'],
  holy:['虔诚','圣洁'],shadow:['阴影','幽冥'],resistFire:['防火','耐焰'],resistCold:['御寒','抗冻'],resistDark:['辟邪','驱暗'],
  regen:['涌泉','源泉'],lifesteal:['吸血','嗜血'],move:['轻快','疾行'],skillFire:['焰术','焰术'],skillCold:['冰术','冰术'],mf:['寻宝','觅金'],allRes:['庇佑','神佑'],cdr:['冥想','禅定'],skillAll:['大师','宗师']};
const SUFFIX={power:'力量',hp:'活力',mana:'冥思',armor:'守护',crit:'鹰眼',critDmg:'屠夫',haste:'疾风',fire:'余烬',cold:'寒冬',lightning:'风暴',
  physical:'锋刃',poison:'瘟疫',holy:'晨曦',shadow:'暗夜',resistFire:'炎盾',resistCold:'暖炉',resistDark:'辟邪',regen:'清泉',lifesteal:'水蛭',
  move:'旅人',skillFire:'焰术',skillCold:'冰术',mf:'财富',allRes:'万象',cdr:'时光',skillAll:'学识'};
const CLASS_WORD={sk_amazon:['猎手','亚马逊'],sk_assassin:['影刃','刺客'],sk_barbarian:['蛮怒','野蛮人'],sk_druid:['林语','德鲁伊'],
  sk_necro:['骸语','死灵师'],sk_paladin:['圣誓','圣骑士'],sk_mage:['秘法','法师']};
// 史诗：意象词 + 器称
const EPIC_A=['血月','寂灭','亡魂','灰烬','噬魂','鸦羽','霜痕','幽冥','雷殛','荆冠','骸骨','夜歌','腐蚀','星陨','狼吻','断罪','永夜','孤灯',
  '黑曜','残阳','裂魂','冥火','铁锈','疫病','风暴','怨灵','苦难','葬钟','渊歌','焚骨','剥皮','碎梦','暮光','渡鸦','灵柩','猩红'];
const EPIC_B={blade:['獠牙','之锋','裂口','低语','刺'],axe:['劈裂','断头','啃噬','咆哮'],mace:['碎骨','重击','之锤','审判'],spear:['之矛','穿刺','獠牙','长啸'],
  scythe:['收割','之镰','叹息'],bow:['之弦','鸣镝','长啸','之眼'],quiver:['之羽','箭囊','风啸'],staff:['之杖','法印','低吟','号令'],shield:['壁垒','之盾','屏障','誓约'],
  helm:['之冠','面甲','视界','冠冕'],chest:['之胄','外袍','甲衣','之心'],shoulder:['之肩','重负','披风'],glove:['之握','利爪','之手','指印'],
  boot:['之履','行迹','足音','步伐'],belt:['束腰','之缚','腰链'],amulet:['之坠','护符','之心','之泪'],ring:['之环','指印','誓约','之眼'],tome:['之典','残页','禁语']};
const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
export const baseIndex=cid=>{const n=Number(String(cid||'').slice(-3));return n>=1&&n<=100?n:0;};
/** 词缀数值是否属于“强”档：达到该词缀在此物品等级、品质下最大值的 65%。 */
function strong(a,ilvl,max){return !!max&&a.value>=max*.65;}
// v0.7 职业图鉴（CB-/CL-）：用类型与部位推出器称组
const SUB_GRP={'长枪':'spear','三叉戟':'spear','长弓':'bow','轻弩':'bow','箭囊':'quiver','拳刃':'claw','短剑':'blade','投掷刀':'blade','毒瓶':'vial',
  '双手斧':'axe','战斧':'axe','钉锤':'mace','重锤':'mace','链锤':'mace','长剑':'blade','自然法杖':'staff','法杖':'staff','魔杖':'staff','骨杖':'staff',
  '权杖':'staff','镰刀':'scythe','法典':'tome','符文书卷':'tome','法球':'orb','图腾':'totem'};
const SLOT_GRP={head:'helm',robe:'chest',gloves:'glove',boots:'boot',belt:'belt',ring1:'ring',ring2:'ring',amulet:'amulet',shoulders:'shoulder'};
EPIC_B.claw=['利爪','撕裂','爪痕'];EPIC_B.vial=['之毒','秘药','毒酿'];EPIC_B.orb=['之眼','星核','法球'];EPIC_B.totem=['图腾','之灵','守望'];
const classBase=entry=>entry&&/^C[BL]-/.test(entry.id)?{n:entry.n,grp:SUB_GRP[entry.sub]||SLOT_GRP[entry.s]||'amulet'}:null;
export function nameItem(item,rarity,affixMax={},entry=null){
  const cb=classBase(entry);
  const b=cb||BASES[baseIndex(item.cid)];if(!b)return item.name;
  const n=baseIndex(item.cid),h=hash(item.id);
  if(cb&&rarity>=3)return entry.n;
  if(rarity===4)return UNIQUE[n];
  if(rarity===3)return LEGENDARY[n];
  if(rarity===2){const g=EPIC_B[b.grp]||EPIC_B.amulet;return EPIC_A[h%EPIC_A.length]+g[(h>>>8)%g.length];}
  if(rarity===1){
    const [a1,a2]=item.affixes||[];
    const pre=a1?(CLASS_WORD[a1.key]?.[0]||PREFIX[a1.key]?.[strong(a1,item.ilvl,affixMax[a1.key])?1:0]||''):'';
    const suf=a2?(CLASS_WORD[a2.key]?.[1]||SUFFIX[a2.key]||''):'';
    return pre+b.n+(suf?'·'+suf:'');
  }
  if(cb)return cb.n;
  const band=Math.min(4,Math.floor((item.ilvl||1)/9)),g=GRADE[b.mat][band];
  // 避免「粗铁铁盾」：品相末字与基底首字相同时合并
  return g.at(-1)===b.n[0]?g+b.n.slice(1):g+b.n;
}
/** 传奇/暗金的图鉴传记里替换成新名字。 */
export const loreFor=(entry,newName)=>entry?.lore?entry.lore.replace(entry.n,newName):'';
