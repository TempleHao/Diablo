// 版面规则回归（docs/2D-UI-GUIDE.md）：多种屏幕尺寸下，关键界面元素不重叠、不出屏、主按钮可见。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { setTimeout as sleep } from 'node:timers/promises';
const server=spawn('python3',['-m','http.server','8766','--bind','127.0.0.1','--directory','dist'],{stdio:'ignore'});
let browser;
const SIZES=[[1920,1080],[1440,900],[1280,720],[1024,768],[390,844],[360,640],[844,390],[667,375]];
const rect=(page,sel)=>page.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const st=getComputedStyle(e);if(st.display==='none'||st.visibility==='hidden')return null;const r=e.getBoundingClientRect();return r.width&&r.height?{l:r.left,t:r.top,r:r.right,b:r.bottom}:null;},sel);
const hit=(a,b)=>a&&b&&!(a.r<=b.l+1||a.l>=b.r-1||a.b<=b.t+1||a.t>=b.b-1);
try{
  for(const p of [process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean)){try{browser=await chromium.launch({headless:true,executablePath:p,args:['--no-sandbox']});break;}catch{}}
  if(!browser)throw new Error('no chromium');
  await sleep(600);
  const problems=[];
  for(const [w,h] of SIZES){
    const mobile=w<900||h<560;
    const ctx=await browser.newContext({viewport:{width:w,height:h},isMobile:mobile,hasTouch:mobile});
    const page=await ctx.newPage();page.on('dialog',d=>d.accept());
    await page.addInitScript(()=>localStorage.setItem('ember-chronicles-2d-epoch','2026-10-20-reset'));
    await page.goto('http://127.0.0.1:8766/2d/?qa=1');await page.waitForTimeout(700);
    const tag=w+'x'+h;
    // 选角（新建）：标志不压信息栏 / 列表 / 账号条；主按钮在首屏内
    for(const mode of ['create','list']){
      if(mode==='list'){await page.click('.hs-go');await page.waitForTimeout(500);await page.click('#btn-heroes');await page.waitForTimeout(500);}
      const logo=await rect(page,'.hs-logo');
      for(const s of ['.hs-side','.hs-list','.hs-account','.hs-plates'])if(hit(logo,await rect(page,s)))problems.push(tag+' '+mode+': logo overlaps '+s);
      const go=await rect(page,'.hs-side .hs-go');
      if(!go||go.b>h+1||go.t<0)problems.push(tag+' '+mode+': main button not visible without scrolling');
    }
    // 游戏内：顶栏按钮都在屏内；电脑版左右两块状态栏不相交
    await page.click('.hs-go');await page.waitForTimeout(600);
    const btns=await page.evaluate(()=>[...document.querySelectorAll('.topbar button')].filter(b=>b.offsetParent).map(b=>{const r=b.getBoundingClientRect();return [b.id,r.left,r.right,r.top,r.bottom];}));
    for(const [id,l,r,t,b] of btns)if(l<0||r>w+1||t<0||b>h)problems.push(tag+': top button off screen '+id);
    if(!mobile){const L=await rect(page,'.gh-left'),R=await rect(page,'.gh-right');if(hit(L,R))problems.push(tag+': vitals and skill panel overlap');}
    const sw=await page.evaluate(()=>document.documentElement.scrollWidth);if(sw>w+1)problems.push(tag+': horizontal scroll '+sw);
    await ctx.close();
  }
  assert.deepEqual(problems,[],problems.join('\n'));
  console.log('UI layout rules passed for',SIZES.length,'viewports');
}finally{if(browser)await browser.close();server.kill('SIGTERM');}
