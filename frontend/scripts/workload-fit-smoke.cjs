const {chromium}=require(process.env.NOTEPICK_PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const output=require('node:path').resolve(__dirname,'../test-results');fs.mkdirSync(output,{recursive:true});
const cases=require('../../data/processed/recommendation_cases_v3.json').cases.filter(c=>c.input.scenarios.some(s=>['local-ai','mainstream-games','aaa-games'].includes(s)));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[],checks=[];
 try{
  for(const c of cases){
   const page=await browser.newPage({viewport:{width:1366,height:950}});page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(req=>sessionStorage.setItem('notepick.preferences.v2',JSON.stringify(req)),c.input);
   await page.goto('http://127.0.0.1:5173/#/recommendations');await page.reload();await page.locator('.product-grid > a').first().waitFor();
   assert.deepEqual(await page.locator('.product-grid > a').evaluateAll(ns=>ns.map(n=>n.getAttribute('href'))),c.top.map(p=>'#/products/'+p.id));
   const titles=await page.locator('.product-reason').evaluateAll(ns=>ns.map(n=>n.title));assert(titles.every(t=>! /匹配度|满足度|[%％]|\/100|NaN/.test(t)));
   assert.equal(await page.locator('.comparison-evidence-list,.detail-comparison').count(),0);
   await page.setViewportSize({width:390,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(c.input.scenarios.includes('local-ai'))await page.screenshot({path:require('node:path').join(output,'workload-fit-ai-mobile.png'),fullPage:true,animations:'disabled'});
   checks.push({scene:c.name,ids:c.top.map(p=>p.id),scoreHidden:true,mobileOverflow:false});await page.close();
  }
  assert.deepEqual(errors,[]);const result={status:'passed',browser:'Installed Chrome headless',checks,errors};fs.writeFileSync(require('node:path').join(output,'workload-fit-browser-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
