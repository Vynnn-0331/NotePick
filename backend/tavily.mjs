import {AiError} from './errors.mjs';
import {safeSourceUrl} from './search.mjs';
// Server-only REST adapter. Never uses Codex OAuth or exposes credentials.
export function createTavilyTools({tavilyApiKey='',fetchImpl=fetch}={}){
 async function call(path,payload,signal){
  const headers={'Content-Type':'application/json'};
  if(tavilyApiKey.trim())headers.Authorization='Bearer '+tavilyApiKey.trim();
  else headers['X-Tavily-Access-Mode']='keyless';
  let response;
  try{response=await fetchImpl('https://api.tavily.com/'+path,{method:'POST',redirect:'error',headers,signal,body:JSON.stringify(payload)});}
  catch{throw new AiError('SEARCH_UNAVAILABLE',503,signal?.aborted?'Tavily搜索超时或请求已取消，请重试。':'无法连接Tavily，请检查后端网络、代理或DNS。');}
  if(!response.ok){await response.body?.cancel();throw new AiError('SEARCH_UNAVAILABLE',503,'Tavily搜索失败（HTTP '+response.status+'）：'+({400:'搜索参数不被接受。',401:'认证失败，请检查后端TAVILY_API_KEY；免密钥访问可能不可用。',402:'账户额度或余额不足。',403:'当前访问方式或账号无权限。',429:'请求过多或额度受限，请稍后重试。'}[response.status]??'上游服务暂不可用，请稍后重试。'));}
  const raw=await response.text();if(Buffer.byteLength(raw)>2000000)throw new AiError('SEARCH_UNAVAILABLE',503,'搜索响应过大。');
  try{return JSON.parse(raw);}catch{throw new AiError('SEARCH_UNAVAILABLE',503,'搜索返回格式无效。');}
 }
 return {referenceOnly:true,async search(query,signal){const data=await call('search',{query:Array.from(query).slice(0,399).join(''),search_depth:'advanced',max_results:5,include_answer:false},signal);if(!Array.isArray(data.results))throw new AiError('SEARCH_UNAVAILABLE',503,'搜索结果格式无效。');return {rawResultCount:data.results.length,results:data.results.filter(r=>safeSourceUrl(r.url)).map(r=>({url:r.url,title:r.title??'',content:r.content??''}))};},
 async fetch(url,signal){if(!safeSourceUrl(url))throw new AiError('SEARCH_UNAVAILABLE',400,'仅允许可信公开来源。');const data=await call('extract',{urls:[url],extract_depth:'advanced'},signal);const row=data.results?.find(r=>r.url===url);if(!row?.raw_content)throw new AiError('SEARCH_UNAVAILABLE',503,'来源页面无法读取，可能需要登录或存在访问限制。');return {url,title:'',content:row.raw_content};}};
}
