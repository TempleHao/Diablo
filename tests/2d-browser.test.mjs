// Browser smoke test: real Chromium + local static server, no screenshot invention.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import { setTimeout as sleep } from 'node:timers/promises';
const server = spawn('python3',['-m','http.server','8765','--bind','127.0.0.1','--directory','dist'],{stdio:'ignore'});
let browser;
try{
  const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
  let launchError;
  for(const executablePath of candidates){
    try{browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});break;}
    catch(e){launchError=e;}
  }
  if(!browser)throw new Error('Chromium missing/unavailable: '+launchError?.message);
  await sleep(750);
  for(const viewport of [{width:1365,height:768,isMobile:false},{width:390,height:844,isMobile:true,hasTouch:true}]){
    const context=await browser.newContext(viewport);
    const page=await context.newPage(),errs=[];
    page.on('pageerror',e=>errs.push(e.message));
    const response=await page.goto('http://127.0.0.1:8765/2d/',{waitUntil:'load'});
    assert.equal(response.status(),200);
    assert.match(await page.title(),/余烬纪事 2D/);
    await page.waitForTimeout(300);
    await page.click('#modal-primary');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#scrim').isVisible(),false);
    const canvas=page.locator('#game');
    assert.ok(await canvas.evaluate(x=>x.width>0&&x.height>0));
    await page.keyboard.down('d');await page.waitForTimeout(110);await page.keyboard.up('d');
    await page.keyboard.press('2');
    await page.click('#btn-inventory');
    assert.equal(await page.locator('#inventory').isVisible(),true);
    await page.click('#inv-close');
    assert.equal(await page.locator('#inventory').isVisible(),false);
    await page.click('#btn-pause');
    assert.equal(await page.locator('#scrim').isVisible(),true);
    await page.click('#modal-primary');
    await page.waitForTimeout(200);
    assert.deepEqual(errs,[],'page JS exceptions');
    console.log('Smoke passed', viewport.width+'x'+viewport.height);
    await context.close();
  }
}finally{if(browser)await browser.close();server.kill('SIGTERM');}
