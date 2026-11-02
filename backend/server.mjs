import {createHardwareAnalysisService} from './hardwareResearch.mjs';
import {createBrowserPriceService} from './browserPrices.mjs';
import {parseListing} from './commerce.mjs';
import browserCatalog from '../frontend/src/data/catalog.json' with {type:'json'};
import {createDiagnosticLogger,safeAiDiagnostic} from './aiDiagnostics.mjs';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildTrustedContext,AI_DATA_VERSION} from './context.mjs';
import {publicResearch} from './webEvidence.mjs';
import {buildMessages} from './prompt.mjs';
import {environmentProvider} from './config.mjs';
import {createDeepSeekClient} from './deepseek.mjs';
import {AiError,fail} from './errors.mjs';
import {workspaceId} from '../scripts/workspace-id.mjs';
export {workspaceId};
function bounded(promise,signal){if(signal.aborted){Promise.resolve(promise).catch(()=>{});return Promise.reject(signal.reason);}return new Promise((resolve,reject)=>{const stop=()=>reject(signal.reason);signal.addEventListener('abort',stop,{once:true});Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',stop));});}
const json=(res,status,data)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(data));};
async function body(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??''))fail('CONTENT_TYPE',415,'AI接口仅接受JSON请求。');
 if(Number(req.headers['content-length']??0)>16384)fail('BODY_LIMIT',413,'请求内容过长，请缩短追问。');
 const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>16384)fail('BODY_LIMIT',413,'请求内容过长，请缩短追问。');chunks.push(c);}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('BAD_JSON',400,'请求内容无效，请刷新后重试。');}
}
export function createAiServer({provider=createDeepSeekClient(),port=8787,frontendPort=5173,logger=()=>{},limits={},hardwareAnalysis=createHardwareAnalysisService(),legacyAiEnabled=true,browserPrices=createBrowserPriceService({catalog:browserCatalog,parseListing})}={}){
 const policy={minute:6,hour:30,cooldownMs:1500,sessionMs:30*60*1000,maxFollowups:4,maxSessions:40,aiTimeoutMs:85000,...limits};
 const sessions=new Map(),rates=new Map(),busy=new Set();let active=0;
 const allowedOrigins=new Set([`http://127.0.0.1:${frontendPort}`,`http://localhost:${frontendPort}`]);
 const allowedHosts=new Set([`127.0.0.1:${port}`,`localhost:${port}`,`127.0.0.1:${frontendPort}`,`localhost:${frontendPort}`]);
 function prune(now){for(const [id,s] of sessions)if(s.expires<=now)sessions.delete(id);for(const [ip,r] of rates)if(!r.times.some(t=>now-t<3600000))rates.delete(ip);}
 const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
  const requestId=crypto.randomUUID(),start=Date.now(),ip=req.socket.remoteAddress??'local',abort=new AbortController();let acquired=false,outcome='UNKNOWN',validationStage,validationReason,validationField;const diagnostics={stage:'request'};
  req.on('aborted',()=>abort.abort());res.on('close',()=>{if(!res.writableFinished)abort.abort();});
  try{
   if(!allowedHosts.has(req.headers.host)&&![`127.0.0.1:${server.address()?.port}`,`localhost:${server.address()?.port}`].includes(req.headers.host))fail('HOST_FORBIDDEN',403,'仅允许通过本机NotePick访问。');
   if(req.method==='GET'&&new URL(req.url,'http://localhost').pathname.replace(/\/$/,'')==='/api/health')return json(res,200,{service:'notepick-ai',workspaceId,dataVersion:AI_DATA_VERSION,configured:provider.configured,localOnly:true});
   if(req.method==='POST'&&['/api/commerce/prices','/api/commerce/discover','/api/commerce/browser-prices','/api/hardware/analyze'].includes(req.url)){
    if(!allowedOrigins.has(req.headers.origin)||req.headers['x-notepick-request']!=='1')fail('ORIGIN_FORBIDDEN',403,'请从本机NotePick页面操作。');
    const payload=await body(req);prune(Date.now());if(busy.has(ip)||active>=2)fail('AI_BUSY',409,'已有联网查询处理中，请稍候。');
    const now=Date.now(),r=rates.get(ip)??{times:[],last:0};r.times=r.times.filter(t=>now-t<3600000);if(now-r.last<policy.cooldownMs||r.times.filter(t=>now-t<60000).length>=policy.minute||r.times.length>=policy.hour)fail('LOCAL_RATE_LIMIT',429,'查询较频繁，请稍后再试。');r.last=now;r.times.push(now);rates.set(ip,r);busy.add(ip);active++;acquired=true;
    if(req.url==='/api/hardware/analyze'){const hardwareSignal=AbortSignal.any([abort.signal,AbortSignal.timeout(35000)]);const result=await bounded(hardwareAnalysis(payload,{signal:hardwareSignal}),hardwareSignal);outcome='OK';json(res,200,result);return;}
    if(req.url==='/api/commerce/browser-prices'){const result=await browserPrices(payload,{signal:abort.signal});outcome='OK';json(res,200,{...result,isMock:!!provider.isMock});return;}
    if(!provider.commerce)fail('COMMERCE_UNAVAILABLE',503,'当前服务未配置联网商品查询。');let result;if(req.url.endsWith('/prices')){const priceSignal=AbortSignal.any([abort.signal,AbortSignal.timeout(policy.priceTimeoutMs??32000)]);try{result=await bounded(provider.commerce('prices',payload,{signal:priceSignal}),priceSignal);}catch(e){if(priceSignal.aborted&&!abort.signal.aborted)throw new AiError('PRICE_TIMEOUT',504,'商家价格查询超时，可前往商家查看或手动输入价格。');throw e;}}else result=await provider.commerce('discover',payload,{signal:abort.signal});outcome='OK';json(res,200,{...result,isMock:!!provider.isMock});return;
   }
   if(!legacyAiEnabled&&req.url==='/api/ai/analyze')fail('NOT_FOUND',404,'旧AI对话接口已停用，请使用硬件深度分析。');
   if(req.method!=='POST'||req.url!=='/api/ai/analyze')fail('NOT_FOUND',404,'接口不存在。');
   if(!allowedOrigins.has(req.headers.origin)||req.headers['x-notepick-request']!=='1')fail('ORIGIN_FORBIDDEN',403,'请从本机NotePick页面发起分析。');
   diagnostics.stage='request_validation';const trusted=buildTrustedContext(await body(req));prune(Date.now());
   const {request,context,fingerprint}=trusted;
   let session=null;
   if(request.conversationId){session=sessions.get(request.conversationId);if(!session||session.owner!==ip)fail('SESSION_EXPIRED',410,'会话已过期，请重新分析后提问。');if(session.fingerprint!==fingerprint)fail('CONTEXT_CHANGED',409,'需求或商品已改变，请重新生成AI分析。');if(session.followups>=policy.maxFollowups)fail('TURN_LIMIT',409,'本次追问已达上限，请重新分析开启新会话。');}
   if(busy.has(ip)||active>=2)fail('AI_BUSY',409,'已有AI请求处理中，请等待完成。');
   const now=Date.now(),r=rates.get(ip)??{times:[],last:0};r.times=r.times.filter(t=>now-t<3600000);
   if(now-r.last<policy.cooldownMs||r.times.filter(t=>now-t<60000).length>=policy.minute||r.times.length>=policy.hour){res.setHeader('Retry-After','60');fail('LOCAL_RATE_LIMIT',429,'操作较频繁，请稍后再试，避免重复付费请求。');}
   r.last=now;r.times.push(now);rates.set(ip,r);busy.add(ip);active++;acquired=true;
   const totalSignal=AbortSignal.any([abort.signal,AbortSignal.timeout(policy.aiTimeoutMs)]);
   let researchState=session?.researchState??{},web;
   if(request.webMode==='offline')web={status:'offline',sources:[],counts:{search:0,fetch:0}};
   else if(request.targetProductId&&provider.research){const beforeSearch=researchState.totalSearch??0,beforeFetch=researchState.totalFetch??0;try{diagnostics.stage='search';const searchStarted=Date.now();let researched;try{researched=await bounded(provider.research(context,request.question,researchState,totalSignal,diagnostics),totalSignal);}finally{diagnostics.searchDurationMs=Date.now()-searchStarted;}web=researched.web;researchState=researched.state;}catch(e){if(totalSignal.aborted)throw e;if(['SEARCH_AUTH_FAILED','SEARCH_BALANCE_REQUIRED'].includes(e.code)&&e.evidenceProvider!=='tavily')throw e;if(!['SEARCH_UNAVAILABLE','SEARCH_NO_RESULTS','SEARCH_TIMEOUT','SEARCH_NETWORK','SEARCH_RATE_LIMIT','SEARCH_PERMISSION','SEARCH_KEY_MISSING','SEARCH_AUTH_FAILED','SEARCH_BALANCE_REQUIRED','SEARCH_EXTRACT_FAILED'].includes(e.code))throw e;diagnostics.searchFailure=e.code;if(e.code==='SEARCH_TIMEOUT')diagnostics.searchTimedOut=true;web={status:'offline',fallback:true,reasonCode:e.code,failureMessage:e.message,sources:[],counts:{search:(researchState.totalSearch??0)-beforeSearch,fetch:(researchState.totalFetch??0)-beforeFetch}};}}diagnostics.researchStatus=web?.status??'not_requested';diagnostics.researchReused=!!web?.reused;diagnostics.searchRequests=web?.counts?.search??diagnostics.searchHttpStatuses?.filter(s=>s.tool==='search').length??0;diagnostics.fetchRequests=web?.counts?.fetch??diagnostics.searchHttpStatuses?.filter(s=>s.tool==='fetch').length??0;
   let aiContext=web?{...context,web}:context;
   const history=session?.history??[];let messages=buildMessages(aiContext,history,request.question),answer;
   diagnostics.stage='model';const modelStarted=Date.now();try{answer=await bounded(provider.complete({messages,context:aiContext,followup:!!session,signal:totalSignal,diagnostics}),totalSignal);}
   catch(e){if(e.code==='INVALID_ANSWER'&&['fact_validation','core_identity'].includes(e.validationStage)&&web?.sources?.length)e.canUseLocal=true;throw e;}
   finally{diagnostics.modelDurationMs=Date.now()-modelStarted;}
   if(abort.signal.aborted)fail('CANCELLED',499,'本次等待已取消。');
   const conversationId=request.conversationId??crypto.randomBytes(32).toString('hex');
   const newHistory=[...history,...(session?[messages.at(-1)]:[]),{role:'assistant',content:answer.markdown??JSON.stringify(answer.decision?{...answer.decision,...(answer.citations?{citations:answer.citations}:{})}:answer)}];
   if(!session&&sessions.size>=policy.maxSessions)sessions.delete(sessions.keys().next().value);
   sessions.set(conversationId,{researchState,owner:ip,fingerprint,history:newHistory,followups:(session?.followups??-1)+1,expires:Date.now()+policy.sessionMs});
   diagnostics.stage='complete';outcome='OK';json(res,200,{conversationId,contextId:fingerprint,kind:session?'followup':'analysis',answer,productIds:request.productIds,isMock:!!provider.isMock,research:publicResearch(web),remainingFollowups:policy.maxFollowups-((session?.followups??-1)+1)});
  }catch(e){const safe=e instanceof AiError?e:abort.signal.aborted?new AiError('CANCELLED',499,'本次等待已取消。'):e.name==='TimeoutError'?new AiError('AI_TIMEOUT',504,'分析等待超时，请稍后重试。'):new AiError('INTERNAL_ERROR',500,'AI服务暂时异常，离线推荐仍可使用。');outcome=safe.code;diagnostics.httpStatus=safe.status;diagnostics.timedOut=['AI_TIMEOUT','SEARCH_TIMEOUT'].includes(safe.code);validationStage=safe.validationStage;validationReason=safe.validationReason;validationField=safe.validationField;if(safe.factDetail)diagnostics.factDetail=safe.factDetail;if(safe.factUnit){diagnostics.factUnit=safe.factUnit;diagnostics.factValue=safe.factValue;}json(res,safe.status,{error:{code:safe.code,message:safe.message,...(req.url==='/api/ai/analyze'?{stage:safe.validationStage??diagnostics.stage,...(safe.validationReason?{validationReason:safe.validationReason}:{}),...(safe.canUseLocal?{canUseLocal:true}:{})}:{})},requestId});}
  finally{if(acquired){busy.delete(ip);active--;}if(req.url==='/api/ai/analyze')logger(safeAiDiagnostic({event:'ai_request',requestId,outcome,...(validationStage?{validationStage,validationReason,validationField}:{}),...diagnostics,httpStatus:diagnostics.httpStatus??200,durationMs:Date.now()-start}));}
 });
 const cleanup=setInterval(()=>prune(Date.now()),60000);cleanup.unref();
 server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000;
 server.on('close',()=>{clearInterval(cleanup);sessions.clear();rates.clear();});
 server.on('close',()=>browserPrices.close?.());
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1])){
 const port=Number(process.env.NOTEPICK_API_PORT??8787),frontendPort=Number(process.env.NOTEPICK_FRONTEND_PORT??5173);
 if(![port,frontendPort].every(p=>Number.isInteger(p)&&p>=1024&&p<=65535))throw Error('Invalid local port configuration');
 const provider=environmentProvider();
 const server=createAiServer({provider,port,frontendPort,legacyAiEnabled:false,logger:createDiagnosticLogger()});
 server.on('error',e=>{console.error(JSON.stringify({service:'notepick-ai',code:e.code??'START_FAILED'}));process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.info(JSON.stringify({service:'notepick-ai',address:`http://127.0.0.1:${port}`,configured:provider.configured})));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.close();server.closeAllConnections();});
}
