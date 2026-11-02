import crypto from 'node:crypto';
import catalog from '../frontend/src/data/catalog.json' with {type:'json'};
import {performanceRuntime} from '../frontend/src/services/hardwareEvidence.js';
import {recommendCatalog,assessCandidate,buildReasons} from '../frontend/src/services/recommendationEngine.js';
import {buildRecommendationComparison} from '../frontend/src/services/recommendationComparison.js';
import {SCENARIOS,PRIORITIES,HARD_FIELDS,normalizeRequirements} from '../frontend/src/services/requirements.js';
import {fail} from './errors.mjs';
export const AI_DATA_VERSION=crypto.createHash('sha256').update(JSON.stringify(catalog)+JSON.stringify(performanceRuntime)).digest('hex');
export function exactObject(value,keys){if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).some(k=>!keys.includes(k)))fail('BAD_REQUEST',400,'请求格式不正确，请刷新页面后重试。');}
export function validateRequest(body){
 exactObject(body,['requirements','productIds','conversationId','question','targetProductId','webMode']);
 if(body.webMode!==undefined&&!['online','offline'].includes(body.webMode))fail('BAD_REQUEST',400,'联网选项无效。');
 const r=body.requirements;exactObject(r,['schemaVersion','budget','os','scenarios','priorities','hardConstraints','unavailableSelections']);
 const selection=(xs,metadata,min)=>Array.isArray(xs)&&xs.length>=min&&xs.length<=metadata.length&&new Set(xs).size===xs.length&&xs.every(id=>metadata.some(m=>m.id===id&&m.enabled));
 if(r.schemaVersion!==2||!Array.isArray(r.budget)||r.budget.length!==2||!r.budget.every(Number.isFinite)||r.budget[0]<2000||r.budget[1]>30000||r.budget[1]-r.budget[0]<500||!['不限','Windows','macOS'].includes(r.os)||!selection(r.scenarios,SCENARIOS,body.targetProductId?0:1)||!selection(r.priorities,PRIORITIES,0))fail('BAD_REQUIREMENTS',400,'需求条件无效，请返回问卷重新选择。');
 exactObject(r.hardConstraints,HARD_FIELDS.map(f=>f.id));
 if(!HARD_FIELDS.every(f=>f.options.some(([v])=>v===r.hardConstraints[f.id])))fail('BAD_REQUIREMENTS',400,'配置要求无效，请重新选择。');
 if(r.unavailableSelections!==undefined&&(!Array.isArray(r.unavailableSelections)||r.unavailableSelections.length>1||r.unavailableSelections.some(id=>id!=='battery')))fail('BAD_REQUIREMENTS',400,'偏好数据无效，请刷新后重试。');
 if(!Array.isArray(body.productIds)||body.productIds.length>3||new Set(body.productIds).size!==body.productIds.length||body.productIds.some(id=>typeof id!=='string'||!/^np-[a-f0-9]{20}$/.test(id)))fail('BAD_PRODUCTS',400,'商品清单无效，请刷新推荐结果。');
 if(body.targetProductId!==undefined&&(typeof body.targetProductId!=='string'||!/^np-[a-f0-9]{20}$/.test(body.targetProductId)||body.productIds.length!==1||body.productIds[0]!==body.targetProductId))fail('BAD_PRODUCTS',400,'当前商品信息无效，请重新打开详情页。');
 const follow=body.conversationId!==undefined;
 if(follow&&(typeof body.conversationId!=='string'||! /^[a-f0-9]{64}$/.test(body.conversationId)||typeof body.question!=='string'||!body.question.trim()||body.question.length>800))fail('BAD_QUESTION',400,'追问需为1—800个字符，请重新输入。');
 if(!follow&&body.question!==undefined)fail('BAD_QUESTION',400,'请先生成本次推荐分析，再继续追问。');
 if(follow&&/sk-[A-Za-z0-9_-]{8,}/.test(body.question))fail('PRIVATE_INPUT',400,'请勿在追问中填写API密钥。');
 return {webMode:body.webMode,targetProductId:body.targetProductId,requirements:normalizeRequirements(r),productIds:[...body.productIds],conversationId:body.conversationId,question:follow?body.question.trim():null};
}
export function buildTrustedContext(body){
 const request=validateRequest(body),shortlist=recommendCatalog(catalog,request.requirements).slice(0,3);
 let matches=shortlist;
 if(request.targetProductId){const product=catalog.find(p=>p.id===request.targetProductId);if(!product)fail('BAD_PRODUCTS',400,'商品不存在，请重新打开详情页。');const match=assessCandidate(product,request.requirements);match.reasons=buildReasons(match,request.requirements);matches=[match];}
 const ids=matches.map(m=>m.product.id);
 if(JSON.stringify(ids)!==JSON.stringify(request.productIds))fail('RESULTS_CHANGED',409,'商品或顺序与当前可信推荐结果不一致，请刷新结果后重新分析。');
 if(!ids.length)fail('NO_RESULTS',422,'当前没有符合条件的推荐商品，请先修改需求。');
 const comparisons=buildRecommendationComparison(matches,request.requirements);
 const context={schema:'notepick-ai-v1',requirements:{budgetCny:request.requirements.budget,operatingSystem:request.requirements.os,
  scenarios:request.requirements.scenarios.map(id=>{const s=SCENARIOS.find(s=>s.id===id);return {id,label:s.label,category:s.category};}),
  preferences:request.requirements.priorities.map(id=>({id,label:PRIORITIES.find(p=>p.id===id).label})),hardConstraints:request.requirements.hardConstraints},
  factsPolicy:'商品配置来自本地可信数据；理由是有条件用途判断，不是实测或软件兼容保证。所有未知保持未知，不得把推荐顺序解读为硬件性能排名。',
  commonUnknowns:['显存和可用统一内存','当前SKU GPU功耗及持续散热表现','目标游戏FPS或Blender渲染耗时','屏幕色域/色准','电池/续航','驱动、软件版本、算子和模型可用性','实时成交价或促销'],
  products:matches.map((m,i)=>{const p=m.product,c=comparisons[i];return {order:i+1,id:p.id,name:p.model,brand:p.brand,series:p.series,
   identity:{sourceUrl:p.source_url??null,sku:p.sku??p.product_sku??null},knownFacts:{officialReferencePriceCny:p.official_price_cny,cpu:p.cpu_model??null,gpu:p.gpu_model??null,gpuType:p.gpu_type??null,ramGb:p.ram_gb??null,ssdGb:p.ssd_gb??null,weightKg:p.weight_kg??null,screenInches:p.screen_inches??null,os:p.os??null},
   localReasons:[...m.reasons],comparison:{summary:c.summary,fit:c.fitDescription,advantages:c.advantages.map(a=>a.text),cautions:c.cautions,neutral:c.neutral},
   limitations:[...m.warnings],gpuIdentity:{resolvedModel:m.hardware.gpu.id,mobileConfirmed:m.hardware.gpu.mobileConfirmed},
   potentialComputeBackend:m.suitability.backend,
   performanceEvidence:Object.fromEntries(Object.entries(m.evidenceSummary).map(([channel,e])=>[channel,{status:e.status,conditions:e.facts.slice(0,2).map(f=>({metric:f.metric,comparisonGroup:f.comparisonGroup,samples:f.samples,confidence:f.confidence,context:f.context,limitations:f.limitations,sourceIds:f.sourceIds}))}]))};})};
 if(request.targetProductId){context.analysisScope='当前详情商品，不代表它符合硬筛选或位于推荐前三；不得改变原推荐结果。';context.recommendationIds=shortlist.map(m=>m.product.id);context.currentProductIsRecommended=context.recommendationIds.includes(request.targetProductId);context.recommendationContext=shortlist.map(m=>({id:m.product.id,name:m.product.model,officialReferencePriceCny:m.product.official_price_cny}));}
 if(JSON.stringify(context).length>28000)fail('CONTEXT_LIMIT',413,'本次资料过长，暂不能分析；离线推荐仍可使用。');
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify(context)).digest('hex');
 return {request,context,fingerprint};
}
