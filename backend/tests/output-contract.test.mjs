import test from 'node:test';import assert from 'node:assert/strict';
import {validateAnswer,createDeepSeekClient} from '../deepseek.mjs';import {buildTrustedContext} from '../context.mjs';import {buildMessages} from '../prompt.mjs';import {defaultRequirements} from '../../frontend/src/services/requirements.js';import {recommendCatalog} from '../../frontend/src/services/recommendationEngine.js';import catalog from '../../frontend/src/data/catalog.json' with {type:'json'};import {mockAnswer} from './mock-fixture.mjs';
const requirements={...defaultRequirements(),budget:[5000,20000],scenarios:['documents','large-projects']};const target=catalog.find(p=>p.id==='np-0ab4acffee16d2861b53');const detail=buildTrustedContext({requirements,productIds:[target.id],targetProductId:target.id}).context;const multi=buildTrustedContext({requirements,productIds:recommendCatalog(catalog,requirements).slice(0,3).map(m=>m.product.id)}).context;
const single=()=>{const a=mockAnswer(detail);return {needs:a.needs,product:a.products[0],choice:a.choice,checks:a.checks};};
test('distinct single and multi output contracts exclude background recommendation products',()=>{
 const initial=JSON.parse(buildMessages(detail)[1].content);assert.equal(initial.outputContract,undefined);assert.deepEqual(initial.trustedContext.products.map(p=>p.id),[target.id]);
 assert.deepEqual(JSON.parse(buildMessages(multi)[1].content).trustedContext.products.map(p=>p.id),multi.products.map(p=>p.id));assert.equal(validateAnswer(JSON.stringify(single()),detail).products.length,1);assert.equal(validateAnswer(JSON.stringify(mockAnswer(multi)),multi).products.length,3);
 const wrong=single();wrong.products=mockAnswer(multi).products;delete wrong.product;assert.throws(()=>validateAnswer(JSON.stringify(wrong),detail),e=>e.validationReason==='product_count'&&e.validationField==='products');
});
test('valid output variations normalize deterministically without changing facts',()=>{
 const a=single();a.product.name=target.model+'很长的名称'.repeat(40);const context=structuredClone(detail);context.products[0].name=a.product.name;
 a.needs='## 需求理解\n**开发与办公**，中文标点：可按工作量取舍。';a.product.meaning='内存是程序的工作空间。'.repeat(100);a.product.tradeoff=null;a.product.cautions=null;a.checks='核对完整配置。';
 const shuffled={checks:a.checks,choice:a.choice,product:a.product,needs:a.needs};const out=validateAnswer('\uFEFF```json\n'+JSON.stringify(shuffled)+'\n```',context);assert.equal(out.products[0].id,target.id);assert.equal(out.products[0].tradeoff,'');assert.deepEqual(out.products[0].cautions,[]);assert.deepEqual(out.checks,['核对完整配置。']);assert(out.products[0].meaning.length>700);
 const b=single();b.product.meaning=['多程序使用。','\n文件存放。'];b.product.tradeoff='';b.product.cautions=[];b.checks=[];assert.equal(validateAnswer(JSON.stringify({analysis:b}),detail).products[0].meaning,'多程序使用。\n\n\n文件存放。');
});
test('followups accept short/long paragraphs without requiring initial product fields',()=>{
 for(const answer of ['可先看内存。','### 建议\n'+ '根据项目规模选择容量，避免只看营销名称。'.repeat(120)])assert.equal(validateAnswer(JSON.stringify({answer}),detail,true).answer,answer);
 assert.throws(()=>validateAnswer(JSON.stringify(single()),detail,true),e=>e.validationReason==='unexpected_field');
});
test('wrong IDs, mismatched names, fabricated GPU/CPU/price and excessive output remain blocked',()=>{
 for(const change of [a=>a.product.id='np-00000000000000000000',a=>a.product.name='不存在的商品',a=>a.product.meaning='显卡RTX9999',a=>a.product.meaning='CPU是Core i9-14900HX',a=>a.product.meaning='价格99999元',a=>a.product.meaning='显存8GB',a=>a.product.meaning='性能保证流畅',a=>a.product.meaning='过长'.repeat(4000)]){const a=single();change(a);assert.throws(()=>validateAnswer(JSON.stringify(a),detail),e=>e.code==='INVALID_ANSWER');}
});
test('empty, malformed and truncated completions never display a partial answer',async()=>{
 for(const [content,finish_reason,stage] of [['','stop','response_envelope'],['{','stop','json_parse'],['{','length','response_truncated']]){const c=createDeepSeekClient({apiKey:'mock',fetchImpl:async()=>Response.json({choices:[{finish_reason,message:{content}}]})});await assert.rejects(c.complete({messages:buildMessages(detail),context:detail}),e=>e.validationStage===stage);}
});
