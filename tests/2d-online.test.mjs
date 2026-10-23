// 在线账号流程（用本地 Supabase 模拟）：注册、云存档同步、换设备读档、退出、测试员 GM 面板只对测试账号显示。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { setTimeout as sleep } from 'node:timers/promises';
const web=spawn('python3',['-m','http.server','8767','--bind','127.0.0.1','--directory','dist'],{stdio:'ignore'});
const mock=spawn('python3',['tests/mock/supabase_mock.py','54329'],{stdio:'ignore'});
let browser;
try{
  for(const p of [process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean)){try{browser=await chromium.launch({headless:true,executablePath:p,args:['--no-sandbox']});break;}catch{}}
  if(!browser)throw new Error('no chromium');
  await sleep(800);
  const cfg="export const SUPABASE_URL='http://127.0.0.1:54329';export const SUPABASE_ANON_KEY='test-anon';export const TEST_ACCOUNT='guixu_test';";
  async function device(){
    const ctx=await browser.newContext({viewport:{width:1280,height:800}});
    await ctx.route('**/2d/online-config.js',r=>r.fulfill({contentType:'text/javascript',body:cfg}));
    const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('dialog',d=>d.accept());
    await page.goto('http://127.0.0.1:8767/2d/');await page.waitForTimeout(600);
    return {ctx,page,errs};
  }
  // 设备 A：注册普通玩家、建角色、打一会、等上传
  let A=await device();
  assert.equal(await A.page.locator('#login').isVisible(),true,'login page first');
  await A.page.fill('#login-user','player_one');await A.page.fill('#login-pass','secret1');await A.page.click('#login-up');
  await A.page.waitForSelector('#hero-select:not([hidden])');
  assert.ok((await A.page.locator('.hs-account').innerText()).includes('player_one'));
  await A.page.fill('.hs-form input','云端战士');await A.page.click('.hs-form .hs-go');await A.page.waitForTimeout(700);
  assert.equal(await A.page.locator('#btn-gm').isVisible(),false,'normal player has no GM');
  await A.page.waitForTimeout(3600);   // 3 秒节流后上传
  await A.ctx.close();
  // 设备 B：同账号登录，应看到云端角色
  let B=await device();
  await B.page.fill('#login-user','player_one');await B.page.fill('#login-pass','wrongpw');await B.page.click('#login-in');await B.page.waitForTimeout(400);
  assert.equal(await B.page.locator('#login-msg').innerText(),'账号或密码不正确');
  await B.page.fill('#login-pass','secret1');await B.page.click('#login-in');await B.page.waitForSelector('#hero-select:not([hidden])');
  assert.ok((await B.page.locator('.hs-list').innerText()).includes('云端战士'),'character synced from cloud');
  // 退出 → 回到登录页
  await B.page.click('.hs-acct-btn');assert.equal(await B.page.locator('#login').isVisible(),true);
  // 测试账号：GM 面板可用，满级、加金币、一键神装
  await B.page.fill('#login-user','guixu_test');await B.page.fill('#login-pass','tester123');await B.page.click('#login-up');
  await B.page.waitForSelector('#hero-select:not([hidden])');
  assert.ok((await B.page.locator('.hs-account').innerText()).includes('测试员'));
  await B.page.click('.hs-form .hs-go');await B.page.waitForTimeout(700);
  assert.equal(await B.page.locator('#btn-gm').isVisible(),true,'tester sees GM');
  await B.page.click('#btn-gm');
  for(const label of ['直接满级 100','金币 +100 万','一键神装（100 级传奇 / 暗金 / 套装）'])await B.page.locator('#gm-actions button',{hasText:label}).click();
  await B.page.click('#btn-inventory');await B.page.waitForTimeout(300);
  const cr=Number(await B.page.locator('#cr-now').innerText());assert.ok(cr>3000,'god gear raised combat rating: '+cr);
  assert.deepEqual([...A.errs,...B.errs],[]);
  console.log('Online flow passed');
}finally{if(browser)await browser.close();web.kill('SIGTERM');mock.kill('SIGTERM');}
