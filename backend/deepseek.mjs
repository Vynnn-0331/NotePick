import {normalizeHardwareAnswer} from './hardwareAnalysis.mjs';
import {describeFact,isRepairableOptional,normalizeUncertainSpecification} from './factDiagnostics.mjs';
import {validateWebCitations,guardWebText} from './webEvidence.mjs';
import {AiError,fail} from './errors.mjs';
import {exactObject} from './context.mjs';
export const DEEPSEEK_URL='https://api.deepseek.com/chat/completions';
const isString=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
function list(xs,min,max,length){return Array.isArray(xs)&&xs.length>=min&&xs.length<=max&&xs.every(s=>isString(s,length));}
function textGuard(text,products,budget=[]){
 text=text.replace(/(?:不能|无法|不)保证流畅/g,'流畅程度取决于实际任务');
 text=text.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g,s=>s.replaceAll(',',''));
 // Alternative screen sizes are not assertions about the currently viewed SKU.
 text=text.replace(/(?:相比|相较|比起|对比)(?:于)?\s*(\d{2}(?:\.\d+)?)\s*英寸(?:的)?机型|(?:可|可以|建议|不妨)(?:优先|先)?(?:比较|考虑|看看|看|选择|关注)\s*(\d{2}(?:\.\d+)?)\s*英寸(?:左右的|的)?(?:其他)?机型/g,(match,a,b)=>Number(a??b)>=11&&Number(a??b)<=20?'可比较其他屏幕尺寸的机型':match);

 // 3D modelling and 4K video are workload names, not numeric VRAM specifications.
 text=text.replace(/(?:2D|3D)(?=\s*(?:建模|模型|设计|绘图|渲染|场景|任务|应用|游戏))/gi,'图形').replace(/(?:4K|8K|1080p)(?=\s*(?:视频|剪辑|素材|影片|内容|项目))/gi,'高分辨率');
 const specificationScan=text.replace(/\d+(?:\.\d+)?\s*(?:GB|TB)\s*(?:统一内存|内存|RAM|SSD|存储|硬盘)/gi,'指定容量');
 if(/[%％]|匹配度|匹配分|效用|评分|得分|百分比|百分之|第一名|第二名|第三名|重新排名|性能最强|保证流畅|完美适合|性价比之王|专业级色准|综合排名|推荐顺序为|https?:\/\/|已联网|已经联网|实时查询|sk-[A-Za-z0-9_-]{8,}/i.test(text))throw Error('unsafe claims');
 if(/\d+(?:\.\d+)?\s*(?:W\b|Wh\b|瓦|小时|分钟|秒|FPS\b|帧(?:每秒|\/秒)?|Hz\b|nits?\b|尼特)/i.test(text)||/(?:显存|可用统一内存|色准|色域|续航|帧率|功耗)[^。；，,\n]{0,8}\d/i.test(specificationScan)||/\d+(?:\.\d+)?\s*(?:GB|TB|MB)\s*(?:独立|专用|共享|动态)?\s*(?:显存|可用统一内存)/i.test(text))throw Error('unsupported specification');
 const gpuTokens=s=>[...String(s??'').matchAll(/(?:RTX\s*(?:Pro\s*)?\d{4}\s*(?:Ti)?|Arc\s*[A-Z]?\d{3}[A-Z]?|Radeon\s*(?:RX\s*)?\d{3,4}[A-Z]*)/gi)].map(m=>m[0].replace(/\s/g,'').toLowerCase());
 const allowedGpus=products.flatMap(p=>gpuTokens(p.knownFacts.gpu));
 const normalizeModel=s=>String(s??'').toLowerCase().replace(/intel|amd|apple/g,'').replace(/酷睿|core/g,'core').replace(/锐龙|ryzen/g,'ryzen').replace(/[\s-]/g,'');
 const cpuTokens=s=>[...String(s??'').matchAll(/(?:(?:Intel\s*)?(?:Core|酷睿)\s*(?:Ultra\s*)?[i3579][0-9]?\s*[- ]?\d{3,5}[A-Za-z]{0,3}|(?:AMD\s*)?(?:Ryzen|锐龙)\s*(?:AI\s*)?\d\s*(?:H\s*)?[- ]?\d{3,5}[A-Za-z]{0,3}|(?:Apple\s*)?M[1-9]\s*(?:Pro|Max|Ultra)?|(?:Apple\s*)?A\d{2}\s*Pro)/gi)].map(m=>normalizeModel(m[0]));
 const knownCpus=products.flatMap(p=>cpuTokens(p.knownFacts.cpu));
 if(cpuTokens(text).some(id=>!knownCpus.includes(id)))throw Error('unverified CPU model');

 if(gpuTokens(text).some(id=>!allowedGpus.includes(id)))throw Error('unverified GPU model');
 for(const m of text.matchAll(/[¥￥]\s*(\d+(?:\.\d+)?)/g))if(![...products.map(p=>p.knownFacts.officialReferencePriceCny),...budget].includes(Number(m[1])))throw Error('unverified price');
 for(const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(GB|TB|kg|公斤|千克|英寸|万元|元|核)/gi)){
  const [,v,unit]=m;const u=unit.toLowerCase(),n=Number(v)*(u==='万元'?10000:1);
  const left=text.slice(Math.max(0,m.index-18),m.index),right=text.slice(m.index+m[0].length,m.index+m[0].length+18);
  const capacityRole=/^\s*(?:统一内存|内存|RAM)/i.test(right)||/(?:统一内存|内存|RAM)\s*(?:为|是|有|:|：)?\s*$/i.test(left)?'ram':/^\s*(?:SSD|存储|硬盘)/i.test(right)||/(?:SSD|存储|硬盘)\s*(?:为|是|有|:|：)?\s*$/i.test(left)?'ssd':null;
  const allowed=products.flatMap(p=>{const f=p.knownFacts;if(['gb','tb'].includes(u)&&capacityRole){const value=capacityRole==='ram'?f.ramGb:f.ssdGb;return [value==null?null:u==='tb'?value/1024:value];}return u==='gb'?[f.ramGb,f.ssdGb]:u==='tb'?[f.ssdGb==null?null:f.ssdGb/1024]:['kg','公斤','千克'].includes(u)?[f.weightKg]:u==='英寸'?[f.screenInches]:['元','万元'].includes(u)?[f.officialReferencePriceCny,...budget]:[...String(f.cpu??'').matchAll(/(\d+)\s*核/g),...String(f.gpu??'').matchAll(/(\d+)\s*核/g)].map(m=>Number(m[1]));});
  if(!allowed.some(a=>typeof a==='number'&&Math.abs(a-n)<.000001)){
   const at=m.index,start=Math.max(text.lastIndexOf('。',at),text.lastIndexOf('\n',at),text.lastIndexOf('；',at))+1,end=text.indexOf('。',at),sentence=text.slice(start,end<0?text.length:end);
   // Only plainly hypothetical capacity examples, never claims about this SKU or upgrade support.
   const before=text.slice(Math.max(start,at-24),at),after=text.slice(at+m[0].length,at+m[0].length+12),genericComparison=/(?:相比|相较|比起|对比|相对于|比)(?:于|常见的|一般的)?\s*$/.test(before)||/^\s*(?:相比|相较|相比之下|版本相比)/.test(after);
   if(['gb','tb'].includes(u)&&[8,16,24,32,48,64,96,128,256,512,1,2,4].includes(n)&&genericComparison&&!/升级|扩展|显存/.test(before.slice(-10)))continue;
   if(['gb','tb'].includes(u)&&[8,16,24,32,48,64,96,128,256,512,1,2,4].includes(n)&&/例如|举例|假设|如果|若需|可以比较/.test(sentence)&&!/本机|该机|这款|当前|配备|搭载|升级|扩展|显存/.test(sentence))continue;
   const e=Error('unverified quantity');e.factUnit=u;e.factValue=n<=1000000?n:'out_of_range';throw e;
  }
 }
}
function invalidAnswer(stage,reason,message){
 const error=new AiError('INVALID_ANSWER',502,message);error.validationStage=stage;error.validationReason=reason;throw error;
}
function removeTrailingCommas(text){let out='',quoted=false,escaped=false;for(let i=0;i<text.length;i++){const c=text[i];if(quoted){out+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}if(c==='"')quoted=true;if(c===','&&/^[\s]*[}\]]/.test(text.slice(i+1)))continue;out+=c;}return out;}
export function parseAnswerJson(content){
 let text=String(content).replace(/^\uFEFF/,'').trim();const ticks=String.fromCharCode(96).repeat(3),fence=text.match(new RegExp('^'+ticks+'(?:json)?\\s*([\\s\\S]*?)\\s*'+ticks+'$','i'));if(fence)text=fence[1];
 const parse=value=>{try{return JSON.parse(value);}catch{return JSON.parse(removeTrailingCommas(value));}};
 try{return parse(text);}catch{}
 const start=text.indexOf('{'),end=text.lastIndexOf('}');if(start>=0&&end>start&&text.slice(0,start).length+text.slice(end+1).length<=160&&!/[{}]/.test(text.slice(0,start)+text.slice(end+1)))return parse(text.slice(start,end+1));throw Error('invalid json');
}
export function validateAnswer(content,context,followup=false){
 let stage='json_parse',rule='json',field='response';
 const requireRule=(ok,name,path)=>{if(!ok){rule=name;field=path;throw Error('response_contract');}};
 const object=(x,keys,path)=>{requireRule(x!==null&&typeof x==='object'&&!Array.isArray(x),'object',path);requireRule(Object.keys(x).every(k=>keys.includes(k)),'unexpected_field',path);};
 const prose=(x,path,max=6000,optional=false)=>{if(optional&&(x===null||x===undefined))return '';if(Array.isArray(x)&&x.every(v=>typeof v==='string'))x=x.join('\n\n');requireRule(typeof x==='string'&&(optional||x.trim().length>0),'text',path);requireRule(x.length<=max,'text_limit',path);return x.trim();};
 const lines=(x,path)=>{if(x===null||x===undefined)return [];if(typeof x==='string')x=x.trim()?[x]:[];requireRule(Array.isArray(x),'list',path);requireRule(x.length<=12,'list_limit',path);return x.map((v,i)=>prose(v,path+'.'+i,2000)).filter(Boolean);};
 try{
  let out=parseAnswerJson(content);stage='field_validation';
  // A sole analysis wrapper is harmless; its contents still pass the complete contract and fact checks.
  if(out&&Object.keys(out).length===1&&out.analysis&&typeof out.analysis==='object')out=out.analysis;
  stage='fact_validation';const citations=validateWebCitations(out?.citations,context);if(out&&typeof out==='object'){out={...out};delete out.citations;}stage='field_validation';
  const guard=(text,products,path)=>{stage='fact_validation';field=path;try{guardWebText(text,products,context.requirements.budgetCny,context,citations,textGuard);}catch(e){e.factDetail??=describeFact(text,context,e.message);throw e;}stage='field_validation';};
  if(followup){object(out,['answer','productId'],'response');if(out.productId!==undefined)requireRule(context.products.length===1&&out.productId===context.products[0].id,'product_id','productId');const answer=prose(out.answer,'answer',8000);guard(answer,context.products,'answer');return {answer,...(citations.length?{citations}:{})};}
  const single=!!context.analysisScope;
  const aliases={productId:['productId','product_id','id'],conclusion:['conclusion','verdict','summary','一句话结论'],reasons:['reasons','whySuitable','why_suitable','advantages','为什么适合你'],tradeoffs:['tradeoffs','tradeoff','considerations','你需要权衡什么'],advice:['advice','finalAdvice','recommendation','最终选购建议']};
  let decisionInput=out;
  if(single&&out?.product&&typeof out.product==='object'&&!Array.isArray(out.product)&&Object.keys(out).length===1&&('conclusion' in out.product||'verdict' in out.product))decisionInput=out.product;
  if(single&&decisionInput&&aliases.conclusion.some(k=>k in decisionInput)){
   const allowed=[...Object.values(aliases).flat(),'name','productName','title'];object(decisionInput,allowed,'response');
   const take=key=>{const keys=aliases[key].filter(k=>k in decisionInput);requireRule(keys.length<=1,'ambiguous_alias',key);return keys.length?decisionInput[keys[0]]:undefined;};
   const productId=take('productId');requireRule(productId===context.products[0].id,'product_id','productId');
   for(const name of ['name','productName'])if(decisionInput[name]!==undefined)requireRule(typeof decisionInput[name]==='string'&&decisionInput[name].normalize('NFKC').replace(/\s/g,'')===context.products[0].name.normalize('NFKC').replace(/\s/g,''),'product_name',name);
   const points=(value,path)=>{
    if(Array.isArray(value))value=value.map((item,i)=>{if(item&&typeof item==='object'){object(item,['title','description','explanation'],path+'.'+i);requireRule(!(item.description!==undefined&&item.explanation!==undefined),'ambiguous_alias',path+'.'+i);return [prose(item.title,path+'.'+i+'.title',2000,true),prose(item.description??item.explanation,path+'.'+i+'.description',2000)].filter(Boolean).join('：');}return item;});
    return lines(value,path);
   };
   const decision={productId,conclusion:prose(take('conclusion'),'conclusion',4000),reasons:points(take('reasons'),'reasons'),tradeoffs:points(take('tradeoffs'),'tradeoffs'),advice:prose(take('advice'),'advice',4000)};
   guard(decision.conclusion,context.products,'decision.conclusion');decision.reasons.forEach((t,i)=>guard(t,context.products,'decision.reasons.'+i));decision.tradeoffs.forEach((t,i)=>guard(t,context.products,'decision.tradeoffs.'+i));guard(decision.advice,context.products,'decision.advice');
   const result={...(citations.length?{citations}:{}),needs:decision.conclusion,products:[{id:decision.productId,meaning:decision.reasons.join('\n\n'),tradeoff:decision.tradeoffs.join('\n\n'),cautions:[]}],choice:decision.advice,checks:[],decision};
   requireRule(JSON.stringify(result).length<=24000,'total_limit','response');return result;
  }
  object(out,['needs','product','products','choice','checks'],'response');
  requireRule(!(out.product!==undefined&&out.products!==undefined),'ambiguous_product_shape','products');
  if(!single)requireRule(out.product===undefined,'multi_requires_array','products');
  const rows=out.product!==undefined?[out.product]:out.products;
  requireRule(Array.isArray(rows),'products_array','products');requireRule(rows.length===context.products.length,'product_count','products');
  const needs=prose(out.needs,'needs',4000),choice=prose(out.choice,'choice',4000),checks=lines(out.checks,'checks');
  guard([needs,choice,...checks].join('\n'),context.products,'summary');
  const products=rows.map((p,i)=>{const path='products.'+i,known=context.products[i];object(p,['id','name','meaning','tradeoff','cautions'],path);
   requireRule(p.id===known.id,'product_id',path+'.id');
   if(p.name!==undefined)requireRule(typeof p.name==='string'&&p.name.trim()===known.name.trim(),'product_name',path+'.name');
   const meaning=prose(p.meaning,path+'.meaning'),tradeoff=prose(p.tradeoff,path+'.tradeoff',6000,true),cautions=lines(p.cautions,path+'.cautions');
   guard([meaning,tradeoff,...cautions].join('\n'),[known],path);return {id:known.id,meaning,tradeoff,cautions};
  });
  const result={...(citations.length?{citations}:{}),needs,products,choice,checks};requireRule(JSON.stringify(result).length<=24000,'total_limit','response');return result;
 }catch(e){
  const reasons={'unsafe claims':'unsupported_claim','unsupported specification':'unsupported_specification','unverified GPU model':'unknown_gpu_model','unverified CPU model':'unknown_cpu_model','unverified price':'unverified_price','unverified quantity':'unverified_quantity','unverified web quantity':'unverified_web_quantity','unsupported current SKU claim':'unmatched_sku_assertion','unscoped web claim':'unscoped_web_claim','unsupported web citation':'unsupported_web_citation','invalid web citations':'invalid_web_citations','unverified source ID':'unknown_source_id','unverified current price':'unverified_current_price','unverified software requirement':'unverified_software_requirement','known local conflict':'known_local_conflict','conflicting web citation':'conflicting_web_citation','untrusted web instruction':'untrusted_web_instruction'};
  const labels={vram:'显存参数',gpu_model:'GPU型号',cpu_model:'CPU型号',memory:'内存配置',storage:'存储配置',battery_duration:'续航数值',performance_measurement:'实测性能数值',display_brightness:'屏幕亮度',display_refresh:'刷新率',color:'屏幕色彩参数',power:'功耗数值',screen_size:'屏幕尺寸',price:'价格'};
  const factMessage=e.message==='known local conflict'?'回答对当前配置的描述与已知记录冲突，已暂缓展示。':['unsupported current SKU claim','conflicting web citation'].includes(e.message)?'网页证据尚不足以确认当前SKU的规格，已暂缓展示。':labels[e.factDetail?.factCategory]?'回答中的'+labels[e.factDetail.factCategory]+'未获得足够的适用证据，已暂缓展示。':'回答中的部分配置或结论未获得足够的来源支持，已暂缓展示。';
  const message=stage==='json_parse'?'AI返回的JSON格式无法解析，请手动重试。':stage==='fact_validation'?factMessage:'AI返回内容结构不完整（'+rule+'），请手动重试。';
  try{invalidAnswer(stage,reasons[e.message]??(stage==='json_parse'?'invalid_json':rule),message+'离线结果不受影响。');}catch(error){error.validationField=field;if(e.factDetail)error.factDetail=e.factDetail;if(e.factUnit){error.factUnit=e.factUnit;error.factValue=e.factValue;}throw error;}
 }
}
// Legacy validator retained only for historical tests; live completions use normalizeHardwareAnswer.
export function validateAndRepairAnswer(content,context,followup=false,diagnostics={}){
 try{const result=validateAnswer(content,context,followup);diagnostics.factRepairOutcome='not_needed';return result;}
 catch(original){
  diagnostics.factDetail=original.factDetail;diagnostics.factRepairInitialRule=original.validationReason;diagnostics.factRepairInitialField=original.validationField;diagnostics.factRepairOutcome='rejected';
  if(followup&&original.validationField==='answer'&&original.validationStage==='fact_validation'&&['unsupported_specification','unverified_quantity','unverified_web_quantity'].includes(original.validationReason)){
   const raw=parseAnswerJson(content),parts=typeof raw.answer==='string'?(raw.answer.match(/[^。；\n!?！？]+[。；!?！？]?/g)??[]):[];let count=0;
   const revised=parts.map(sentence=>{const replacement=normalizeUncertainSpecification(sentence);if(replacement){count++;return replacement;}return sentence;});
   if(count!==1)throw original;raw.answer=revised.join('');try{const repaired=validateAnswer(JSON.stringify(raw),context,true);diagnostics.factRepairOutcome='normalized_uncertainty';diagnostics.factRepairCount=1;return {...repaired,validationNotice:'已移除1处未经核实的数值猜测，修订内容已重新校验。',factRepair:{removedSentences:0,normalizedSentences:1,revalidated:true}};}catch(second){diagnostics.factRepairOutcome='revalidation_failed';diagnostics.factDetail=second.factDetail;throw second;}
  }
  const match=original.validationField?.match(/^decision\.tradeoffs\.(\d+)$/);
  if(followup||original.validationStage!=='fact_validation'||!match)throw original;
  const raw=parseAnswerJson(content);let obj=raw;if(obj&&Object.keys(obj).length===1&&obj.analysis)obj=obj.analysis;if(obj&&Object.keys(obj).length===1&&obj.product)obj=obj.product;
  const keys=['tradeoffs','tradeoff','considerations','你需要权衡什么'].filter(k=>k in obj);if(keys.length!==1)throw original;
  const key=keys[0],items=typeof obj[key]==='string'?[obj[key]]:obj[key];if(!Array.isArray(items)||items.some(t=>typeof t!=='string'))throw original;
  const index=Number(match[1]),item=items[index];if(typeof item!=='string')throw original;
  const citations=validateWebCitations(obj.citations??raw.citations,context),sentences=item.match(/[^。；\n!?！？]+[。；!?！？]?/g)??[],good=[];let removed=0,normalizedCount=0;
  for(const sentence of sentences){try{guardWebText(sentence,context.products,context.requirements.budgetCny,context,citations,textGuard);good.push(sentence);}catch(error){if(removed)throw original;const replacement=['unsupported specification','unverified quantity','unverified web quantity'].includes(error.message)?normalizeUncertainSpecification(sentence):null;if(replacement){good.push(replacement);normalizedCount++;}else if(!isRepairableOptional(sentence,context,error.message))throw original;removed++;}}
  if(removed!==1)throw original;
  const next=[...items];if(good.join('').trim())next[index]=good.join('').trim();else next.splice(index,1);obj[key]=next;
  // Keep only citations still referenced by surviving visible sections.
  const visibleRefs=new Set([...JSON.stringify(Object.fromEntries(Object.entries(obj).filter(([k])=>!['citations','name','title','productName','productId','product_id','id'].includes(k)))).matchAll(/\[(S\d+)\]/g)].map(m=>m[1]));
  if(Array.isArray(obj.citations))obj.citations=obj.citations.filter(c=>visibleRefs.has(c.sourceId));
  try{const repaired=validateAnswer(JSON.stringify(raw),context,followup);diagnostics.factRepairOutcome=normalizedCount?'normalized_uncertainty':'removed_optional_sentence';diagnostics.factRepairCount=1;
   return {...repaired,validationNotice:normalizedCount?'已移除1处未经核实的数值猜测，修订内容已重新校验。':'已省略1处缺少依据的非关键细节，其余内容已重新校验。',factRepair:{removedSentences:normalizedCount?0:1,normalizedSentences:normalizedCount,revalidated:true}};
  }catch(second){diagnostics.factRepairOutcome='revalidation_failed';diagnostics.factDetail=second.factDetail;throw second;}
 }
}
export function createDeepSeekClient({apiKey='',model='deepseek-flash',timeoutMs=45000,thinking=false,fetchImpl=globalThis.fetch,isMock=false}={}){
 const validConfig=typeof model==='string'&&/^[A-Za-z0-9._:-]{1,80}$/.test(model)&&typeof apiKey==='string'&&apiKey.length<=4096&&!/[\r\n]/.test(apiKey);
 return {configured:!!apiKey.trim()&&validConfig,isMock,
 async complete({messages,context,followup=false,signal,diagnostics={},maxAttempts=2}){
  if(!apiKey.trim())fail('NOT_CONFIGURED',503,'尚未配置DeepSeek密钥，请按使用说明在后端配置。');
  if(!validConfig)fail('BAD_CONFIGURATION',503,'AI服务配置无效，请检查后端模型与密钥设置。');
  if(messages.reduce((n,m)=>n+m.content.length,0)>44000)fail('CONTEXT_LIMIT',413,'本次会话内容过长，请重新分析后再提问。');
  const started=Date.now(),timer=AbortSignal.timeout(timeoutMs),combined=signal?AbortSignal.any([signal,timer]):timer;
  try{
   diagnostics.stage='model_request';let response;for(let attempt=0;attempt<Math.max(1,Math.min(2,maxAttempts));attempt++){diagnostics.modelAttempts=(diagnostics.modelAttempts??0)+1;delete diagnostics.modelHttpStatus;try{response=await fetchImpl(DEEPSEEK_URL,{method:'POST',redirect:'error',signal:combined,headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey.trim()},body:JSON.stringify({model,messages,thinking:{type:thinking?'enabled':'disabled'},...(thinking?{reasoning_effort:'low'}:{temperature:.3}),stream:false,max_tokens:thinking?8192:followup?3072:4096})});diagnostics.modelHttpStatus=response.status;if([502,503,504].includes(response.status)&&attempt===0&&maxAttempts>1&&!combined.aborted&&Date.now()-started<5000){diagnostics.modelRetryReason='TEMPORARY_HTTP_'+response.status;await response.body?.cancel();await new Promise(r=>setTimeout(r,250));continue;}break;}catch(e){if(combined.aborted||attempt||maxAttempts<=1||!(e instanceof TypeError)||Date.now()-started>5000)throw e;diagnostics.modelRetryReason='EARLY_NETWORK';await new Promise(resolve=>setTimeout(resolve,250));}}diagnostics.modelHttpStatus=response.status;
   if(!response.ok){await response.body?.cancel();const errors={401:['AUTH_FAILED','DeepSeek密钥未通过验证，请检查后端配置。'],402:['BALANCE_REQUIRED','DeepSeek账户余额不足，请检查API账户。'],429:['UPSTREAM_RATE_LIMIT','DeepSeek请求较多，请稍后再试。']};const e=errors[response.status]??[response.status>=500?'UPSTREAM_UNAVAILABLE':'UPSTREAM_CONFIGURATION',response.status>=500?'DeepSeek暂时不可用，请稍后再试。':'AI接口配置暂不可用，请检查后端模型设置。'];throw new AiError(e[0],response.status===429?429:502,e[1]);}
   if(!response.body)fail('INVALID_ANSWER',502,'AI返回内容为空，请稍后重试。');
   diagnostics.stage='model_response';const reader=response.body.getReader(),chunks=[];let bytes=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>65536)fail('INVALID_ANSWER',502,'AI返回内容异常，请稍后重试。');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
   diagnostics.stage='model_envelope';let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('INVALID_ANSWER',502,'AI返回格式异常，请稍后重试。');}
   const choice=Array.isArray(data?.choices)?data.choices[0]:null;
   diagnostics.finishReason=choice?.finish_reason??'missing';if(choice?.finish_reason==='length')invalidAnswer('response_truncated','token_limit','AI回答被长度限制截断，请手动重试。');
   if(choice?.finish_reason!=='stop'||!isString(choice.message?.content,30000)||choice.message.tool_calls?.length)invalidAnswer('response_envelope','invalid_completion','AI未完整返回有效分析，请稍后手动重试。');
   diagnostics.stage='answer_validation';return normalizeHardwareAnswer(choice.message.content,context,followup,diagnostics);
  }catch(e){if(e instanceof AiError)throw e;if(timer.aborted||e.name==='TimeoutError'||signal?.reason?.name==='TimeoutError')fail('AI_TIMEOUT',504,'AI响应超时，请稍后手动重试；离线推荐仍可使用。');if(signal?.aborted)fail('CANCELLED',499,'本次等待已取消。');fail('AI_NETWORK',502,'暂时无法连接DeepSeek，请检查网络后重试。');}
 }};
}
