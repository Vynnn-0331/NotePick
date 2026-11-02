import {createTavilyResearchTools} from './tavilyResearch.mjs';
import {createTavilyTools} from './tavily.mjs';
// Read server-only environment configuration on demand. No values are logged or returned to clients.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fetchOfficialMech,discoverOfficialMech} from './officialMech.mjs';
import {createCommerceService} from './commerce.mjs';
import {createSearchTools,createResearchClient} from './search.mjs';
import {parseEnv} from 'node:util';
import {createDeepSeekClient} from './deepseek.mjs';
import {fail} from './errors.mjs';
export function environmentProvider({envFile=new URL('.env',import.meta.url),environment=process.env,fetchImpl=globalThis.fetch}={}){
 let researchCache,commerceCache;
 const settings=()=>{
  let local={};try{if(fs.existsSync(envFile))local=parseEnv(fs.readFileSync(envFile,'utf8'));}catch{fail('BAD_CONFIGURATION',503,'后端环境文件无法读取，请检查配置文件权限与格式。');}
  const value=name=>typeof environment[name]==='string'&&environment[name].trim()?environment[name]:local[name];
  return {tavilyApiKey:value('TAVILY_API_KEY')??'',thinking:value('DEEPSEEK_THINKING')==='enabled',apiKey:value('DEEPSEEK_API_KEY')??'',model:value('DEEPSEEK_MODEL')??'deepseek-flash',timeoutMs:Math.max(5000,Math.min(90000,Number(value('DEEPSEEK_TIMEOUT_MS'))||45000)),fetchImpl};
 };
 const load=()=>createDeepSeekClient(settings());
 return {commerce:async(...args)=>{const options=settings(),id=crypto.createHash('sha256').update(options.tavilyApiKey).digest('hex');if(commerceCache?.id!==id)commerceCache={id,handler:createCommerceService({tools:{...createTavilyTools(options),official:(url,{signal}={})=>fetchOfficialMech(url,{signal,fetchImpl}),discoverOfficial:opts=>discoverOfficialMech({...opts,fetchImpl})}})};return commerceCache.handler(...args);},research:async(...args)=>{const options=settings(),id=crypto.createHash('sha256').update(options.apiKey+'|'+options.tavilyApiKey).digest('hex');if(researchCache?.id!==id)researchCache={id,client:createResearchClient({...options,researchTools:createTavilyResearchTools(options)})};return researchCache.client.prepare(...args);},get configured(){try{return load().configured;}catch{return false;}},isMock:false,complete:args=>load().complete(args)};
}
