import {chipTargets,selectChipContent,chipKey} from './chipResearch.mjs';
import {AiError} from './errors.mjs';
export const SEARCH_URL='https://api.deepseek.com/v1/tools/search';
export const FETCH_URL='https://api.deepseek.com/v1/tools/fetch';
export const SEARCH_LIMITS={searchPerRequest:2,fetchPerRequest:2,sessionSearch:5,sessionFetch:5,results:4,sourceChars:3000,maxSources:5,cacheMs:5*60*1000,timeoutMs:25000};
const domains=['jd.com','tmall.com','taobao.com','hpstore.cn','vmall.com','lenovo.com','lenovo.com.cn','thinkpad.com','apple.com','apple.com.cn','hp.com','hpshopping.com.cn','dell.com','asus.com','asus.com.cn','acer.com','acer.com.cn','msi.com','huawei.com','honor.com','mi.com','mechrevo.com','hasee.com','machenike.com','thunderobot.com','intel.com','intel.cn','amd.com','nvidia.com','nvidia.cn','nvidia.com.cn','qualcomm.com','notebookcheck.net','notebookcheck.com','notebookcheck-cn.com','notebookcheck.com.cn','ul.com','3dmark.com','adobe.com','blender.org','blackmagicdesign.com','pytorch.org','microsoft.com'];
export function safeSourceUrl(value){try{const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port)||u.href.length>2048)return null;const host=u.hostname.toLowerCase();if(!domains.some(d=>host===d||host.endsWith('.'+d)))return null;u.hash='';return u.href;}catch{return null;}}
export function sourceClass(url){const host=new URL(url).hostname;return /notebookcheck|3dmark|ul\.com/.test(host)?'review':'official';}
const norm=s=>String(s??'').toLowerCase().replace(/intel|amd|apple/g,'').replace(/酷睿|core/g,'core').replace(/锐龙|ryzen/g,'ryzen').replace(/英寸|笔记本电脑|笔记本|电脑|轻薄|高性能|高端|游戏本|寸/g,'').replace(/[^\p{L}\p{N}]/gu,'');
export function matchSource(product,source){
 const text=source.content??'',all=norm(source.title+' '+text),f=product.knownFacts;
 const brands={联想:['联想','lenovo'],惠普:['惠普','hp'],华硕:['华硕','asus'],Apple:['apple','macbook'],戴尔:['戴尔','dell'],机械革命:['机械革命','mechrevo']};
 const brand=(brands[product.brand]??[product.brand]).some(b=>all.includes(norm(b)));
 const model=norm(product.name),stem=model.match(/.{2,}?(?:pro|air)?\d{2}/)?.[0]??norm(product.series);
 const family=brand&&!!stem&&all.includes(stem);
 const cpu=!!f.cpu&&all.includes(norm(f.cpu));const gpu=!f.gpu||all.includes(norm(f.gpu));
 const ram=[...text.matchAll(/(\d+)\s*GB\s*(?:内存|统一内存|RAM)|(?:内存|RAM)\s*[|:：]?\s*(\d+)\s*G(?:B)?/gi)].map(m=>Number(m[1]??m[2]));
 const ssd=[...text.matchAll(/(\d+(?:\.\d+)?)\s*(TB?|GB)\s*(?:SSD|固态|存储)/gi)].map(m=>Number(m[1])*(/^tb?$/i.test(m[2])?1024:1));
 const years=[...text.matchAll(/20(?:2\d|3\d)/g)].map(m=>m[0]),year=String(product.name).match(/20\d{2}/)?.[0];
 const multiple=[...new Set(ram)].length>1||[...new Set(ssd)].length>1||/可选|多种配置|最高可达|up to/i.test(text);
 const conflict=family&&((ram.length&&f.ramGb&&!ram.includes(f.ramGb))||(ssd.length&&f.ssdGb&&!ssd.includes(f.ssdGb))||(year&&years.length&&!years.includes(year)));
 if(conflict)return {scope:'conflict',label:'同系列配置存在差异',reason:'页面年份或容量与本地配置不一致，不能覆盖当前商品'};
 const sku=product.identity?.sku;
 if(sku&&family&&cpu&&gpu&&ram.includes(f.ramGb)&&ssd.includes(f.ssdGb)&&all.includes(norm(sku))&&!multiple)return {scope:'exact_sku',label:'SKU与主要配置一致',reason:'型号、SKU、CPU及容量匹配'};
 if(family&&cpu&&gpu&&ram.includes(f.ramGb)&&ssd.includes(f.ssdGb)&&!multiple)return {scope:'configuration',label:'主要配置相符，SKU未锁定',reason:'缺少唯一SKU或整机版本证据，不将系列规格直接当成本机事实'};
 if(family)return {scope:'series',label:multiple?'系列含多个配置版本':'同系列资料',reason:'只能证明系列范围'};
 if((/adobe\.com|blender\.org|pytorch\.org|blackmagicdesign\.com|microsoft\.com/.test(source.url)))return {scope:'software',label:'软件官方要求',reason:'软件要求不等于当前整机已验证兼容'};
 if(cpu||f.gpu&&all.includes(norm(f.gpu)))return {scope:'hardware',label:'相关芯片资料',reason:'芯片的一般能力不等于当前整机实测'};
 return {scope:'related',label:'相关资料，型号未匹配',reason:'不得认定为当前配置'};
}
export function researchTopics(context,question){
 if(question){const topics=[];if(/CPU|处理器|单核|多核/i.test(question))topics.push('cpu');if(/显卡|GPU|图形|游戏|渲染/i.test(question))topics.push('gpu');if(/屏幕|色域|亮度|色准|显示/i.test(question))topics.push('screen');if(/价格|多少钱|售价|优惠|报价|促销|活动|库存|现货|现在.*[价钱卖]/.test(question))topics.push('price');if(/剪辑|4K|软件|Blender|CUDA|MPS|AI|模型|开发/i.test(question))topics.push('software');return topics;}
 const ids=context.requirements.scenarios.map(s=>s.id),p=context.requirements.preferences.map(p=>p.id);return ['specs',...(ids.some(s=>['video-editing','modeling-3d','mainstream-games','aaa-games','local-ai'].includes(s))?['gpu']:[]),...(ids.some(s=>['video-editing','modeling-3d','local-ai'].includes(s))?['software']:p.includes('large-screen')?['screen']:[])];
}
export function buildSearchQueries(context,topics,question){
 const p=context.products[0],f=p.knownFacts,clean=s=>String(s??'').replace(/https?:\/\/\S+|["<>]/g,' ').replace(/\s+/g,' ').trim();const identity=clean(`${p.brand} ${p.name} ${f.cpu??''} ${f.gpu??''}`);
 const chips=chipTargets(p);
 if(!question)return [`${chips.cpu} specifications${chips.cpuOfficial?' site:'+chips.cpuOfficial:''}`,chips.gpu?`${chips.gpuSearchVariant} specifications${chips.gpuOfficial?' site:'+chips.gpuOfficial+(/NVIDIA|RTX/i.test(chips.gpuSearchVariant)?'/en-us/geforce/laptops/compare/':''):''}`:`${chips.cpu} integrated graphics specifications${chips.cpuOfficial?' site:'+chips.cpuOfficial:''}`].map(q=>Array.from(q).slice(0,128).join(''));
 if(topics.includes('cpu'))return [`${chips.cpu} specifications${chips.cpuOfficial?' site:'+chips.cpuOfficial:''}`].map(q=>Array.from(q).slice(0,128).join(''));
 if(topics.includes('gpu'))return [`${chips.gpuSearchVariant||chips.cpu+' integrated graphics'} 显卡 specifications${chips.gpuOfficial?' site:'+chips.gpuOfficial+(/NVIDIA|RTX/i.test(chips.gpuSearchVariant)?'/en-us/geforce/laptops/compare/':''):chips.cpuOfficial?' site:'+chips.cpuOfficial:''}`].map(q=>Array.from(q).slice(0,128).join(''));

 const date=new Date().toISOString().slice(0,10);const map={specs:'官方 规格 型号 内存 SSD',gpu:'显卡 具体型号 官方规格 评测',screen:'屏幕 亮度 色域 官方规格 评测',price:`官方商城 售价 配置 ${date}`,software:/4K|剪辑/i.test(question??'')||context.requirements.scenarios.some(s=>s.id==='video-editing')?'Premiere Pro system requirements site:adobe.com':/AI|模型/i.test(question??'')||context.requirements.scenarios.some(s=>s.id==='local-ai')?'GPU backend requirements site:pytorch.org':'hardware requirements site:blender.org'};
 const top=topics.includes('price')?'price':topics.includes('gpu')?'gpu':topics.includes('screen')?'screen':'specs';
 const planned=[...new Set([`${identity} ${map[top]}`,topics.includes('software')?map.software:!f.gpu&&f.cpu?`${clean(f.cpu)} integrated graphics 官方规格 ${/酷睿|core|ultra/i.test(f.cpu)?'site:intel.com OR site:intel.cn':/锐龙|ryzen/i.test(f.cpu)?'site:amd.com':'site:apple.com'}`:null].filter(Boolean).map(q=>Array.from(q).slice(0,128).join('')))];
 return question&&topics.includes('software')&&!topics.some(t=>['gpu','screen','price'].includes(t))?[...planned].reverse():planned;
}
async function readJson(response,max=512000){if(!response.ok){await response.body?.cancel();throw new AiError('SEARCH_UNAVAILABLE',503,`联网搜索暂不可用（HTTP ${response.status}），可稍后重试或选择仅根据现有资料分析。`);}if(!response.body)throw new AiError('SEARCH_UNAVAILABLE',503,'联网服务未返回有效内容。');const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw Error('size');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
// Shared fixed-endpoint transport for AI research and commerce. Never accepts an arbitrary API host.
export function createSearchTools({apiKey,fetchImpl=fetch}={}){
 return {async request(endpoint,payload,signal){if(![SEARCH_URL,FETCH_URL].includes(endpoint))throw new AiError('SEARCH_UNAVAILABLE',503,'搜索接口地址无效。');if(!apiKey?.trim())throw new AiError('SEARCH_UNAVAILABLE',503,'后端未配置DeepSeek密钥。');return readJson(await fetchImpl(endpoint,{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey.trim()},body:JSON.stringify(payload)}));},search(query,signal){return this.request(SEARCH_URL,{query:Array.from(query).slice(0,128).join(''),count:5,need_content:true},signal);},fetch(url,signal){if(!safeSourceUrl(url))throw new AiError('SEARCH_UNAVAILABLE',400,'仅允许读取可信公开来源。');return this.request(FETCH_URL,{url},signal);}};
}
export function createResearchClient({apiKey,researchTools=null,fetchImpl=fetch,limits={},now=()=>Date.now()}={}){
 const L={...SEARCH_LIMITS,...limits},cache=new Map();
 return {async prepare(context,question,previous={},signal,diagnostics={}){
  const topics=researchTopics(context,question),time=now(),state=previous;state.totalSearch??=0;state.totalFetch??=0;
  const fresh=s=>s.bodyAvailable&&Number.isFinite(Date.parse(s.queriedAt))&&time-Date.parse(s.queriedAt)<L.cacheMs;
  const priceRequest=topics.includes('price'),targets=chipTargets(context.products[0]);
  const covered=t=>(previous.web?.sources??[]).some(s=>fresh(s)&&(t==='cpu'?chipKey(s.content).includes(chipKey(targets.cpu)):t==='software'?s.scope==='software':t==='gpu'?(targets.gpu?chipKey(s.content).includes(chipKey(targets.gpu)):/RTX\s*\d|Arc\s*[A-Z]?\d|Radeon\s*\d|GeForce/i.test(s.content)):t==='screen'?/亮度|色域|色准|nits|display|屏幕尺寸/i.test(s.content):t==='price'?['exact_sku','configuration'].includes(s.scope)&&/[¥￥]\s*\d|\d+元/.test(s.content):s.scope!=='related'));
  if(researchTools&&!question){if(!topics.includes('cpu'))topics.push('cpu');if(targets.gpu&&!topics.includes('gpu'))topics.push('gpu');}
  if(!topics.length||topics.every(t=>previous.topics?.includes(t)&&covered(t)))return {state,web:{...(previous.web??{status:'not_needed',sources:[]}),reused:true,counts:{search:0,fetch:0}}};
  const sources=[...(previous.web?.sources??[])].filter(s=>!priceRequest||fresh(s));
  let nextId=Math.max(state.nextSourceId??0,...(previous.web?.sources??[]).map(s=>Number(s.id?.slice(1))||0));
  let searches=0,fetches=0,errors=0,cacheHits=0;const timeout=AbortSignal.timeout(L.timeoutMs),combined=signal?AbortSignal.any([signal,timeout]):timeout;
  const attempts=diagnostics.searchAttempts??=[];
  const transport=createSearchTools({apiKey,fetchImpl:async(url,opts)=>{
   try{const response=await fetchImpl(url,opts);diagnostics.searchHttpStatuses??=[];diagnostics.searchHttpStatuses.push({tool:url===FETCH_URL?'fetch':'search',status:response.status});
    if([401,402,403,429].includes(response.status)){await response.body?.cancel();const map={401:['SEARCH_AUTH_FAILED','联网搜索密钥未通过验证，请检查后端配置。'],402:['SEARCH_BALANCE_REQUIRED','DeepSeek账户余额不足，无法进行联网查询。'],403:['SEARCH_PERMISSION','当前账户暂不能使用搜索，可仅用现有资料分析。'],429:['SEARCH_RATE_LIMIT','联网搜索请求较多，本次可使用现有资料分析。']};const [code,message]=map[response.status];throw new AiError(code,response.status===429?429:503,message);}return response;
   }catch(e){if(e instanceof AiError||combined.aborted||opts.signal?.aborted)throw e;throw new AiError('SEARCH_NETWORK',503,'联网搜索连接异常，本次可使用现有资料分析。');}
  }});
  const call=(endpoint,payload,requestSignal=combined)=>{requestSignal.throwIfAborted();return (researchTools??transport).request(endpoint,payload,requestSignal);};
  const plans=buildSearchQueries(context,topics,question).slice(0,question?1:L.searchPerRequest);
  // Finish both chip searches before spending time fetching pages. Each chip gets a fair opportunity.
  const groups=[];for(const [index,query] of plans.entries()){if(combined.aborted)break;const group=await (async()=>{
   const detail={topic:question?topics.join('_')||'general':index===0?'cpu':'gpu',...(question?{}:{query}),rawResults:0,unsafeUrl:0,duplicate:0,unrelated:0,noBody:0,retained:0,fetchFailures:0,cacheHit:false};attempts.push(detail);
   if(state.totalSearch>=L.sessionSearch){detail.failure='session_budget';return {detail,rows:[]};}
   try{let rows;const key='search:'+query,cached=cache.get(key),ttl=cached?.value?.length?L.cacheMs:15000;
    if(cached&&time-cached.at<ttl){rows=cached.value;cacheHits++;detail.cacheHit=true;}else{state.totalSearch++;searches++;const data=await call(SEARCH_URL,{query,count:L.results,need_content:true},AbortSignal.any([combined,AbortSignal.timeout(8000)]));if(!Array.isArray(data.results))throw new AiError('SEARCH_UNAVAILABLE',503,'搜索接口返回结构异常。');rows=data.results;cache.set(key,{at:time,value:rows});}
    detail.rawResults=rows.length;return {detail,rows,cachedAt:cached?.at??time,index};
   }catch(e){errors++;const error=e instanceof AiError?e:new AiError(e.name==='TimeoutError'||timeout.aborted?'SEARCH_TIMEOUT':'SEARCH_NETWORK',503,'芯片搜索暂时不可用，可使用离线硬件资料。');detail.failure=error.code;return {detail,rows:[],error,index};}
  })();groups.push(group);if(['SEARCH_AUTH_FAILED','SEARCH_BALANCE_REQUIRED','SEARCH_KEY_MISSING','SEARCH_PERMISSION','SEARCH_RATE_LIMIT'].includes(group.error?.code))throw group.error;}
  const fatal=groups.find(g=>['SEARCH_AUTH_FAILED','SEARCH_BALANCE_REQUIRED'].includes(g.error?.code));if(fatal)throw fatal.error;
  for(const group of groups){
   if(combined.aborted)break;
   const {detail}=group;let groupFetches=0;
   const candidates=group.rows.slice(0,L.results).map(r=>{const url=safeSourceUrl(r.url);if(!url)detail.unsafeUrl++;return {...r,url};}).filter(r=>r.url).sort((a,b)=>{const rank=r=>(sourceClass(r.url)==='official'?0:10)+(/\/(?:news|_gallery)\//i.test(r.url)?5:0)+(/\/(?:en|en-us|zh-cn)\//i.test(r.url)?0:2);return rank(a)-rank(b);});
   for(const row of candidates){
    const existing=sources.findIndex(s=>s.url===row.url);if(existing>=0&&(!priceRequest||fresh(sources[existing]))){detail.duplicate++;continue;}if(existing>=0)sources.splice(existing,1);
    let raw=typeof row.content==='string'?row.content:'',fetched=false,contentTime=group.cachedAt??time;
    // One Fetch per initial chip prevents a slow CPU page from consuming the GPU's request budget.
    const searchBodyHasSpecs=selectChipContent(raw,targets,L.sourceChars).chipFacts.filter(f=>f.label!=='Architecture').length>=2;
    if(!searchBodyHasSpecs&&groupFetches<1&&fetches<(question?1:L.fetchPerRequest)&&state.totalFetch<L.sessionFetch){const fk='fetch:'+row.url,hit=cache.get(fk);try{groupFetches++;if(hit&&time-hit.at<L.cacheMs){raw=hit.value;contentTime=hit.at;cacheHits++;fetched=true;}else{state.totalFetch++;fetches++;const page=await call(FETCH_URL,{url:row.url},AbortSignal.any([combined,AbortSignal.timeout(6500)]));if(typeof page.content==='string'&&page.content.trim()){raw=page.content;cache.set(fk,{at:time,value:raw.slice(0,180000)});fetched=true;}}}catch(e){if(signal?.aborted||['SEARCH_AUTH_FAILED','SEARCH_BALANCE_REQUIRED'].includes(e.code))throw e;errors++;detail.fetchFailures++;}}
    const selected=selectChipContent(raw,targets,L.sourceChars),source={id:'S'+(++nextId),title:String(row.title??'网页资料').slice(0,160),url:row.url,siteName:typeof row.site_name==='string'&&/[^a-f0-9]/i.test(row.site_name)?row.site_name.slice(0,80):new URL(row.url).hostname,type:sourceClass(row.url),publishedAt:typeof row.date==='string'?row.date.slice(0,40):null,queriedAt:new Date(contentTime).toISOString(),content:selected.content,summary:String(row.summary??row.snippet??'').slice(0,400),bodyAvailable:!!selected.content.trim(),fetched,evidenceKind:fetched?'extracted_page':row.evidenceKind??'search_content',chipTargets:{cpu:targets.cpu,gpu:targets.gpuSearchVariant},chipFacts:selected.chipFacts};
    Object.assign(source,matchSource(context.products[0],source));
    if(source.scope==='related'&&(selected.cpuMatched||selected.gpuMatched))Object.assign(source,{scope:'hardware',label:'相关芯片规格资料',reason:'芯片规格，不是本机实测；不同桌面/移动版本分别讨论'});
    if(!source.bodyAvailable){detail.noBody++;continue;}
    if(source.scope==='related'){detail.unrelated++;continue;}
    if(sources.length>=L.maxSources)sources.shift();sources.push(source);detail.retained++;
    if(source.chipFacts.filter(f=>f.label!=='Architecture').length>=2)break;
    if(!question&&detail.retained>=2)break;
   }
  }
  state.nextSourceId=nextId;if(timeout.aborted)diagnostics.searchTimedOut=true;
  diagnostics.sourceSummaries=sources.map(s=>({id:s.id,host:new URL(s.url).hostname,scope:s.scope,bodyAvailable:s.bodyAvailable,chipFactCount:s.chipFacts?.length??0,chars:s.content.length}));
  if(cache.size>80)for(const key of [...cache.keys()].slice(0,cache.size-80))cache.delete(key);
  const web={status:sources.length?(searches===0&&cacheHits===0&&state.totalSearch>=L.sessionSearch?'budget_limited':errors?'partial':'searched'):'no_results',sources,topics,reused:searches===0&&fetches===0,queriedAt:new Date(time).toISOString(),counts:{search:searches,fetch:fetches,cacheHits},limits:{sessionSearch:L.sessionSearch,sessionFetch:L.sessionFetch},budgetExhausted:state.totalSearch>=L.sessionSearch||state.totalFetch>=L.sessionFetch};
  if(!sources.some(s=>s.bodyAvailable)){
   const upstream=groups.find(g=>g.error)?.error;if(timeout.aborted)throw new AiError('SEARCH_TIMEOUT',503,'联网搜索超时，本次可使用现有资料分析。');if(upstream&&groups.every(g=>!g.rows.length))throw upstream;
   const total=attempts.reduce((n,d)=>n+d.rawResults,0),reason=!total?'SEARCH_EMPTY':attempts.some(d=>d.noBody||d.fetchFailures)?'SEARCH_BODY_UNAVAILABLE':'SEARCH_FILTERED';diagnostics.searchFailureDetail=reason;
   const e=new AiError('SEARCH_NO_RESULTS',503,reason==='SEARCH_EMPTY'?'搜索接口未找到匹配网页，可使用离线硬件资料。':reason==='SEARCH_FILTERED'?'搜索结果未通过来源或型号匹配，可使用离线硬件资料。':'搜索找到了页面但未取得相关正文，可使用离线硬件资料。');throw e;
  }
  state.web=web;state.updated=time;state.topics=[...new Set([...(previous.topics??[]),...topics])];return {web,state};
 }};
}
