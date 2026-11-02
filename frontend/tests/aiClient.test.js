import test from 'node:test';
import assert from 'node:assert/strict';
import {requestAi} from '../src/services/aiClient.js';
const payload={requirements:{schemaVersion:2,budget:[5000,20000],os:'不限',scenarios:['documents'],priorities:[]},productIds:['np-00000000000000000000']};
const result={conversationId:'a'.repeat(64),contextId:'b'.repeat(64),kind:'analysis',productIds:payload.productIds,remainingFollowups:4,isMock:true,answer:{needs:'接口模拟',products:[{id:payload.productIds[0],meaning:'接口模拟说明',tradeoff:'接口模拟取舍',cautions:['待核验']}],choice:'接口模拟建议',checks:['待核验']}};
test('AI client sends only relative local request, explicit inputs and CSRF marker; no key or authorization',async()=>{
 let calls=0;const response=await requestAi(payload,{fetchImpl:async(url,opts)=>{calls++;assert.equal(url,'/api/ai/analyze');assert.equal(opts.method,'POST');assert.equal(opts.headers['X-NotePick-Request'],'1');assert(!Object.keys(opts.headers).some(k=>/authorization|key/i.test(k)));assert.deepEqual(JSON.parse(opts.body),payload);return Response.json(result);}});assert.deepEqual(response,result);assert.equal(calls,1);
});
test('AI client supports opaque server conversation tokens and followup without sending history',async()=>{
 const follow={...payload,conversationId:result.conversationId,question:'接口模拟追问'};let body;const data=await requestAi(follow,{fetchImpl:async(_,opts)=>{body=JSON.parse(opts.body);return Response.json({...result,kind:'followup',remainingFollowups:3,answer:{answer:'接口模拟回复'}});}});assert.equal(data.kind,'followup');assert(!('messages' in body));assert(!('history' in body));
});
test('AI client errors are readable, do not retry automatically and preserve error codes',async()=>{
 for(const code of ['NOT_CONFIGURED','AUTH_FAILED','BALANCE_REQUIRED','UPSTREAM_RATE_LIMIT','AI_TIMEOUT','AI_NETWORK','INVALID_ANSWER','LOCAL_RATE_LIMIT','AI_BUSY','CONTEXT_CHANGED','SESSION_EXPIRED']){let calls=0;await assert.rejects(requestAi(payload,{fetchImpl:async()=>{calls++;return Response.json({error:{code,message:'请稍后再试，离线推荐仍可使用。'}},{status:503});}}),e=>e.code===code);assert.equal(calls,1);}
});
test('AI client invalid/empty responses and wrong product order cannot crash result rendering',async()=>{
 for(const data of [{},null,{...result,answer:{}},{...result,productIds:[]},{...result,kind:'followup'},{...result,answer:{...result.answer,products:[]}}])await assert.rejects(requestAi(payload,{fetchImpl:async()=>Response.json(data)}));
 await assert.rejects(requestAi(payload,{fetchImpl:async()=>new Response('<html>proxy unavailable</html>',{status:502})}),e=>e.code==='AI_UNREACHABLE');
});
test('AI client cancellation is distinct from network failure and never exposes raw details',async()=>{
 const abort=new AbortController();abort.abort();await assert.rejects(requestAi(payload,{signal:abort.signal,fetchImpl:async()=>{throw new Error('aborted');}}),e=>e.name==='AbortError');
 await assert.rejects(requestAi(payload,{fetchImpl:async()=>{throw new Error('private network dump');}}),e=>e.code==='AI_UNREACHABLE'&&!e.message.includes('private'));
 const keepAlive=setTimeout(()=>{},100);try{await assert.rejects(requestAi(payload,{timeoutMs:10,fetchImpl:async(_,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('timeout','TimeoutError')),{once:true}))}),e=>e.code==='CLIENT_TIMEOUT');}finally{clearTimeout(keepAlive);}
});


test('four-section decision renders only for the current target with typed text/list fields',async()=>{
 const target=payload.productIds[0],request={...payload,targetProductId:target};const decision={productId:target,conclusion:'值得考虑。',reasons:['内存提供多任务空间。'],tradeoffs:[],advice:'按用途取舍。'};
 const data={...result,answer:{...result.answer,decision}};assert((await requestAi(request,{fetchImpl:async()=>Response.json(data)})).answer.decision);
 for(const d of [{...decision,productId:'wrong'},{...decision,reasons:'不是列表'},{...decision,advice:null}])await assert.rejects(requestAi(request,{fetchImpl:async()=>Response.json({...data,answer:{...data.answer,decision:d}})}),e=>e.code==='INVALID_RESPONSE');
});
