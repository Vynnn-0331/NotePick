import assert from 'node:assert/strict';
import {once} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {localApiProxy} from '../dev-proxy.mjs';
import {createServer as createVite} from 'vite';
import {createAiServer} from '../../backend/server.mjs';
import {createDeepSeekClient,DEEPSEEK_URL} from '../../backend/deepseek.mjs';
import {startMockUpstream} from '../../backend/tests/mock-upstream.mjs';
import {recommendCatalog} from '../src/services/recommendationEngine.js';
import {defaultRequirements} from '../src/services/requirements.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.NOTEPICK_PLAYWRIGHT_PATH||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)),front=path.join(root,'frontend'),out=path.join(front,'test-results');fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(front,'src/data/catalog.json')));
const input={...defaultRequirements(),budget:[5000,20000],scenarios:['large-projects','modeling-3d'],priorities:['portable','memory']};
const upstream=await startMockUpstream();let noKey=false;
const actualMock=createDeepSeekClient({apiKey:'mock-only-not-a-real-key',isMock:true,timeoutMs:1000,fetchImpl:(url,opts)=>{assert.equal(url,DEEPSEEK_URL);return fetch(upstream.url,opts);}}),missing=createDeepSeekClient();
const backend=createAiServer({port:0,frontendPort:5188,provider:{configured:true,isMock:true,complete:args=>noKey?missing.complete(args):actualMock.complete(args)},limits:{cooldownMs:0,minute:100,hour:100}});
backend.listen(0,'127.0.0.1');await once(backend,'listening');
// The product UI intentionally no longer mounts this module. This isolated test loader
// mounts the retained component only on mock port 5188; it never alters production sources.
const legacyAiTestHost={name:'isolated-ai-component-test-host',enforce:'pre',load(id){
 if(!id.split('?')[0].replaceAll('\\','/').endsWith('/src/pages/Recommendations.jsx'))return null;
 const source=fs.readFileSync(path.join(front,'src/pages/Recommendations.jsx'),'utf8');
 return "import DeepSeekAnalysis from '../components/DeepSeekAnalysis';\n"+source.replace('  </section>;', '    <DeepSeekAnalysis key={JSON.stringify([preferences,recommendations.map(p=>p.id)])} requirements={preferences} productIds={recommendations.map(p=>p.id)} />\n  </section>;');
}};
const vite=await createVite({plugins:[legacyAiTestHost],root:front,configFile:path.join(front,'vite.config.js'),server:{host:'127.0.0.1',port:5188,strictPort:true,proxy:{'/api':localApiProxy(`http://127.0.0.1:${backend.address().port}`)}},logLevel:'error'});await vite.listen();
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1366,height:1000}}),errors=[],network=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/ai/'))network.push({url:r.url(),headers:r.headers(),body:r.postDataJSON()});});
const region=page.locator('.ai-analysis'),action=()=>region.getByRole('button',{name:/^(AI深度分析|重新分析)$/}),ids=()=>page.locator('.product-grid > a').evaluateAll(ns=>ns.map(n=>n.getAttribute('href')?.split('/').at(-1)));
const waitAnswer=()=>region.locator('.ai-content').waitFor();
const count=()=>upstream.requests.length;
const checks=[];
try{
 await page.addInitScript(p=>{if(!sessionStorage.getItem('notepick.preferences.v2'))sessionStorage.setItem('notepick.preferences.v2',JSON.stringify(p));},input);
 await page.goto('http://127.0.0.1:5188/');await page.getByRole('link',{name:'Start Recommendation'}).click();await page.getByRole('button',{name:'生成推荐'}).click();await action().waitFor();
 const initialIds=recommendCatalog(catalog,input).slice(0,3).map(m=>m.product.id);assert.deepEqual(await ids(),initialIds);
 await page.locator('.product-grid > a').first().click();await page.locator('.detail-layout').waitFor();assert.equal(await page.locator('.analysis-entry,.detail-comparison').count(),0);
 await page.getByRole('link',{name:'返回推荐结果'}).click();await page.reload();await action().waitFor();await page.waitForTimeout(200);assert.equal(count(),0);checks.push('load/navigation/detail/refresh never calls paid API');
 upstream.state.delay=250;await action().evaluate(button=>{button.click();button.click();});await region.getByRole('status').waitFor();assert(await region.getByRole('button',{name:'分析处理中…'}).isDisabled());await waitAnswer();assert.equal(count(),1);assert((await region.innerText()).includes('接口模拟'));assert.deepEqual(await ids(),initialIds);checks.push('one explicit double click produces exactly one upstream request, loading visible');
 assert.deepEqual(await region.locator('.ai-product h3').allTextContents(),initialIds.map((id,i)=>`${i+1}. ${catalog.find(p=>p.id===id).model}`));
 const question='如果我要用Blender做3D建模，应该注意什么？';await page.getByLabel('继续问问这几款电脑').fill(question);await region.getByRole('button',{name:'发送追问'}).click();await region.locator('.ai-turn').first().waitFor();assert.equal(count(),2);assert(upstream.requests[1].payload.messages.some(m=>m.role==='assistant'));assert(upstream.requests[1].payload.messages.at(-1).content.includes('Blender'));checks.push('server-owned multi-turn conversation works on real three-product context');
 fs.writeFileSync(path.join(root,'data/processed/deepseek_input_example.json'),JSON.stringify({notice:'真实商品上下文；来自mock验证，未调用DeepSeek；无密钥',request:upstream.requests[0].payload},null,2));
 fs.writeFileSync(path.join(root,'data/processed/deepseek_mock_examples.json'),JSON.stringify({notice:'明确接口模拟，非DeepSeek实际回答',firstAnalysis:upstream.requests[0].answer,followupQuestion:question,followupAnswer:upstream.requests[1].answer},null,2));
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'deepseek-mock-desktop.png'),fullPage:true,animations:'disabled'});await page.setViewportSize({width:390,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,'deepseek-mock-mobile.png'),fullPage:true,animations:'disabled'});await page.setViewportSize({width:1366,height:1000});
 upstream.state.html=true;upstream.state.delay=0;await page.getByLabel('继续问问这几款电脑').fill('接口模拟HTML安全检查');await region.getByRole('button',{name:'发送追问'}).click();await region.getByText(/HTML应作为普通文字显示/).waitFor();assert.equal(await region.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.__aiUnsafe),undefined);upstream.state.html=false;checks.push('model text is escaped; no HTML/script execution');

 const failures=[];
 for(const [status,pattern] of [[401,/密钥未通过验证/],[429,/请求较多/],[503,/暂时不可用/]]){upstream.state.status=status;await action().click();await region.getByRole('alert').filter({hasText:pattern}).waitFor();failures.push(status);assert.deepEqual(await ids(),initialIds);}upstream.state.status=200;
 for(const [flag,pattern] of [['network',/无法连接DeepSeek/],['empty',/未完整返回有效分析/],['unsafe',/事实边界检查/]]){upstream.state[flag]=true;await action().click();await region.getByRole('alert').filter({hasText:pattern}).waitFor();upstream.state[flag]=false;failures.push(flag);}
 noKey=true;await action().click();await region.getByRole('alert').filter({hasText:/尚未配置DeepSeek/}).waitFor();noKey=false;failures.push('missing-key');
 upstream.state.delay=1400;await action().click();await region.getByRole('alert').filter({hasText:/响应超时/}).waitFor();failures.push('timeout');upstream.state.delay=0;checks.push('401/429/5xx/network/empty/unsafe/missing-key/timeout all readable; offline results unchanged');
 upstream.state.delay=700;const oldCount=count(),oldAborted=upstream.aborted;await action().click();await page.waitForFunction(()=>document.querySelector('.ai-analysis button')?.disabled);for(let i=0;i<50&&count()===oldCount;i++)await page.waitForTimeout(10);assert.equal(count(),oldCount+1);await page.getByRole('link',{name:'修改需求'}).click();await page.getByRole('button',{name:'生成推荐'}).waitFor();for(let i=0;i<50&&upstream.aborted===oldAborted;i++)await page.waitForTimeout(10);assert(upstream.aborted>oldAborted);const max=page.getByRole('slider',{name:'最高预算'});await max.focus();await max.press('End');await page.getByRole('button',{name:'生成推荐'}).click();await action().waitFor();assert.equal(await region.locator('.ai-content').count(),0);assert(count()<=oldCount+1);checks.push('navigation aborts upstream; changed questionnaire invalidates old AI analysis without auto request');
 upstream.state.delay=0;await action().click();await waitAnswer();const changed=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('notepick.preferences.v2')));assert.equal(upstream.requests.at(-1).payload.messages[1].role,'user');assert.deepEqual(JSON.parse(upstream.requests.at(-1).payload.messages[1].content).trustedContext.requirements.budgetCny,changed.budget);const afterCount=count();await page.reload();await action().waitFor();assert.equal(await region.locator('.ai-content').count(),0);assert.equal(count(),afterCount);checks.push('explicit new analysis uses new budget; refresh clears chat but makes no call');
 for(const [max,n] of [[2500,0],[6000,1],[6500,2],[10000,3]]){const p={...defaultRequirements(),budget:[max===2500?2000:5000,max],os:'macOS',scenarios:['documents']};const isolated=await browser.newPage();await isolated.addInitScript(r=>sessionStorage.setItem('notepick.preferences.v2',JSON.stringify(r)),p);await isolated.goto('http://127.0.0.1:5188/#/recommendations');const a=isolated.locator('.ai-analysis');await a.waitFor();if(!n)assert(await a.getByRole('button',{name:'AI深度分析',exact:true}).isDisabled());else{await a.getByRole('button',{name:'AI深度分析',exact:true}).click();await a.locator('.ai-content').waitFor();assert.equal(await a.locator('.ai-product').count(),n);}await isolated.close();}checks.push('0 results disables AI; 1/2/3 results analyze only the current count');
 assert(network.every(r=>r.url.startsWith('http://127.0.0.1:5188/api/ai/')&&!('authorization' in r.headers)&&!JSON.stringify(r.body).includes('mock-only-not-a-real-key')));assert(!(await page.locator('body').innerText()).includes('mock-only-not-a-real-key'));assert(!JSON.stringify(await page.evaluate(()=>({local:{...localStorage},session:{...sessionStorage}}))).includes('mock-only-not-a-real-key'));assert.deepEqual(errors,[]);
 const report={mode:'MOCK ONLY — ISOLATED RETAINED COMPONENT TEST HOST, NOT THE BUSINESS RECOMMENDATION PAGE, NOT A REAL DEEPSEEK CALL',status:'passed',checks,failures,upstreamRequests:count(),consoleErrors:errors,browserRequestsContainKey:false,initialIds,questionnaireChangedSafely:true};fs.writeFileSync(path.join(out,'deepseek-mock-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await vite.close();backend.closeAllConnections();await new Promise(r=>backend.close(r));await upstream.close();}
