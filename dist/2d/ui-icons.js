/* 技能图标（v0.7 新图标图集 art/skills.webp）：返回一个按背景图定位的 <span>。
 * 用百分比定位，图标大小可以由 CSS 决定；传 size 时直接设置宽高（像素）。 */
import {SKILL_ICON,SKILL_ICON_COLS} from './skill-icons.js';
const URL_SKILLS=new URL('./art/skills.webp?v=120',import.meta.url).href;
const ROWS=Math.ceil(Object.keys(SKILL_ICON).length/SKILL_ICON_COLS);
export function skillIcon(id,size=0,extraClass=''){
  const el=document.createElement('span');el.className=('sk-ico '+extraClass).trim();
  if(size)el.style.width=el.style.height=size+'px';
  const i=SKILL_ICON[id];
  if(i==null){el.classList.add('sk-ico-missing');return el;}
  const c=i%SKILL_ICON_COLS,r=Math.floor(i/SKILL_ICON_COLS);
  el.style.backgroundImage='url("'+URL_SKILLS+'")';
  el.style.backgroundSize=(SKILL_ICON_COLS*100)+'% '+(ROWS*100)+'%';
  el.style.backgroundPosition=(c/(SKILL_ICON_COLS-1)*100)+'% '+(r/(ROWS-1)*100)+'%';
  return el;
}
