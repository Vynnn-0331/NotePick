import test from 'node:test';import assert from 'node:assert/strict';import {adviceCases} from './advice-fixtures.mjs';import {buildTrustedContext} from '../context.mjs';import {validateAnswer} from '../deepseek.mjs';import {buildMessages,SYSTEM_PROMPT} from '../prompt.mjs';import {defaultRequirements} from '../../frontend/src/services/requirements.js';
const id='np-0ab4acffee16d2861b53';const contextFor=c=>buildTrustedContext({requirements:{...defaultRequirements(),scenarios:c.scenarios,priorities:c.priorities},targetProductId:id,productIds:[id]}).context;
test('five complete editorial mock analyses normalize to four decision sections using real facts',()=>{
 for(const c of adviceCases){const out=validateAnswer(JSON.stringify({productId:id,...c.answer}),contextFor(c));assert.deepEqual(out.decision,{productId:id,...c.answer});assert.equal(out.products.length,1);assert.deepEqual(out.checks,[]);assert.deepEqual(out.products[0].cautions,[]);assert(c.answer.reasons.length<=3);assert(c.answer.tradeoffs.length<=2);}
});
test('short correct advice and natural Markdown are accepted without minimum word count',()=>{
 const context=contextFor(adviceCases[0]);const out=validateAnswer(JSON.stringify({productId:id,conclusion:'办公值得考虑。',reasons:['**多任务**\n32GB内存提供容量余量。'],tradeoffs:[],advice:'按每天携带的需要取舍。'}),context);assert(out.decision);assert.equal(out.decision.tradeoffs.length,0);
});
test('new decision structure still rejects fabricated facts and a different product',()=>{
 const context=contextFor(adviceCases[0]);for(const change of [a=>a.productId='np-00000000000000000000',a=>a.reasons=['显存8GB'],a=>a.advice='价格只要99999元',a=>a.conclusion='游戏120FPS',a=>a.reasons=['GPU为RTX9999']]){const a={productId:id,...structuredClone(adviceCases[0].answer)};change(a);assert.throws(()=>validateAnswer(JSON.stringify(a),context),e=>e.code==='INVALID_ANSWER');}
});
test('multi-use prompt asks for priorities without inventing a dominant user scenario; followup stays separate',()=>{
 const context=contextFor(adviceCases[1]);const first=JSON.parse(buildMessages(context)[1].content);assert.equal(first.trustedContext.products[0].id,id);assert.equal(first.outputContract,undefined);assert(SYSTEM_PROMPT.includes('问卷未给用途优先级'));assert(SYSTEM_PROMPT.includes('不以字数或格式验收')); assert.equal(first.trustedContext.requirements.scenarios.length,2);assert(validateAnswer(JSON.stringify({answer:'内存负责同时运行程序，存储负责保存文件。'}),context,true).answer);
});

test('harmless section aliases, matching product name and titled points normalize, conflicts and fabricated names do not',()=>{
 const context=contextFor(adviceCases[0]);const a={id,productName:context.products[0].name,verdict:'办公值得考虑。',whySuitable:[{title:'多任务空间',description:'32GB内存方便同时打开多个程序。'}],considerations:[],finalAdvice:'按实际携带需要取舍。'};const result=validateAnswer(JSON.stringify(a),context);assert.equal(result.decision.reasons[0],'多任务空间：32GB内存方便同时打开多个程序。');assert.equal(result.decision.productId,id);
 for(const changed of [{...a,productName:'虚构商品'},{...a,conclusion:'冲突结论'},{...a,whySuitable:[{title:'显存',description:'8GB显存'}]},{...a,arbitrary:'不能忽略的未知字段'}])assert.throws(()=>validateAnswer(JSON.stringify(changed),context),e=>e.code==='INVALID_ANSWER');
});
