// Read-only adapter for the vendored JD-Taobao-MCP browser service. No LLM or paid search.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {AiError,fail} from './errors.mjs';
import {safePriceUrl,matchPriceConfiguration} from './pricing.mjs';
import {classifyHangzhouEligibility} from '../frontend/src/services/hangzhouSubsidy.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export function browserMerchantUrl(value,platform){const safe=safePriceUrl(value);if(!safe)return null;const u=new URL(safe);if(u.protocol!=='https:'||u.port||u.username||u.password)return null;const jd=/(^|\.)jd\.com$/.test(u.hostname)&&/^\/(?:product\/)?\d{5,}\.html$/.test(u.pathname),taobao=/(^|\.)(?:tmall|taobao)\.com$/.test(u.hostname)&&/item|detail/.test(u.hostname+u.pathname)&&/^\d+$/.test(u.searchParams.get('id')??'');return platform==='jd'&&jd||platform==='taobao'&&taobao?safe:null;}
export function browserPriceValue(text){if(typeof text!=='string'||/起|券|补贴|国补|分期|月供|定金|尾款|历史|到手|原价|划线/.test(text))return null;const m=text.trim().match(/^(?:(?:销售价|京东价|天猫价|售价|价格)\s*[:：]?\s*)?[¥￥]?\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:元|CNY)?$/i);if(!m)return null;const n=Number(m[1].replaceAll(',',''));return n>0&&n<=1000000?n:null;}
export function createBrowserBridge({spawnImpl=spawn,timeoutMs=27000}={}){
 let child=null,buffer='',sequence=0,pending=new Map();
 function close(){const old=child;child=null;buffer='';if(old){if(process.platform==='win32'&&old.pid)spawn('taskkill',['/PID',String(old.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).on('error',()=>old.kill());else old.kill();}for(const p of pending.values())p.reject(new AiError('BROWSER_UNAVAILABLE',503,'查价浏览器已关闭，请重新操作。'));pending.clear();}
 function start(){if(child)return;const python=path.join(root,'integrations/.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');if(!fs.existsSync(python))fail('BROWSER_SETUP',503,'浏览器查价组件尚未安装，请运行 scripts/setup-browser-prices.ps1。');
  const env={...process.env,PYTHONIOENCODING:'utf-8'};for(const k of Object.keys(env))if(/DEEPSEEK|TOKEN|SECRET|PASSWORD|API_KEY/i.test(k))delete env[k];
  child=spawnImpl(python,['-u',path.join(root,'integrations/browser_price_bridge.py')],{cwd:root,env,stdio:['pipe','pipe','pipe'],windowsHide:true});const current=child;
  child.stderr.on('data',()=>{}); // Upstream errors may include personal paths or page data. Never log raw stderr.
  child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(buffer.length>300000){close();return;}let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const msg=JSON.parse(line),p=pending.get(msg.id);if(!p)continue;pending.delete(msg.id);if(msg.error)p.reject(new AiError(msg.error,503,msg.error==='BROWSER_TIMEOUT'?'查价浏览器响应超时，请完成登录或验证后重试。':'查价浏览器暂不可用，请确认窗口及组件安装后重试。'));else p.resolve(msg.result);}catch{}}});
  current.on('error',()=>{if(child===current)close();});current.on('exit',()=>{if(child===current)close();});
 }
 return {close,async call(payload,{signal}={}){if(pending.size)fail('BROWSER_BUSY',409,'查价浏览器正在处理上一次操作，请稍候。');start();const id=++sequence;return new Promise((resolve,reject)=>{let timer;const finish=(fn,v)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);fn(v);};const abort=()=>{pending.delete(id);finish(reject,new AiError('BROWSER_CANCELLED',499,'本次查价已取消。'));close();};if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>{pending.delete(id);finish(reject,new AiError('BROWSER_TIMEOUT',504,'查价超时，请在浏览器完成验证后重试。'));close();},timeoutMs);pending.set(id,{resolve:v=>finish(resolve,v),reject:e=>finish(reject,e)});child.stdin.write(JSON.stringify({...payload,id})+'\n',e=>{if(e){pending.get(id)?.reject(new AiError('BROWSER_UNAVAILABLE',503,'无法连接查价浏览器。'));pending.delete(id);close();}});});}};
}
export function browserDetailResult(product,platform,detail,parseListing,now=Date.now()){
 const url=browserMerchantUrl(detail?.product_url,platform);if(!url)fail('BROWSER_PRODUCT_PAGE',400,'请在查价浏览器打开该平台的具体商品详情页。');
 const params=Array.isArray(detail.product_parameters)?detail.product_parameters:[];const specs=Array.isArray(detail.specifications)?detail.specifications:[];
 const source={url,title:String(detail.title??'').slice(0,500),content:[...params.slice(0,70).map(x=>String(x.name??'')+'：'+String(x.value??'')),...specs.slice(0,50).map(String)].join('; ').slice(0,20000)};
 const listing=parseListing(source);if(detail.selection?.configurable){const selected=parseListing({...source,content:String(detail.selection.selected??'')});if(!selected.ramGb||!selected.ssdGb)listing.multipleConfigurations=true;else if(selected.ramGb!==product.ram_gb||selected.ssdGb!==product.ssd_gb){listing.ramGb=selected.ramGb;listing.ssdGb=selected.ssdGb;}}const match=matchPriceConfiguration(product,listing,source),price=browserPriceValue(detail.price_text),time=new Date(now).toISOString();
 const row={id:crypto.createHash('sha256').update(url).digest('hex').slice(0,16),platform:platform==='jd'?'京东':'淘宝/天猫',name:listing.name,brand:listing.brand,cpu:listing.cpu,gpu:listing.gpu,ramGb:listing.ramGb,ssdGb:listing.ssdGb,sourceUrl:url,queriedAt:time,match};
 const quote=match.comparable&&price!==null?{...row,price,priceType:'listed',stock:null,priceEvidence:'登录浏览器当前商品页独立价格字段',priceSource:{kind:'browser_visible_price',url,observedAt:time},eligibility:classifyHangzhouEligibility({skuConfirmed:true,evidence:[]}),conditions:'当前页面可见标价；用户需核对选中的销售配置及订单价格'}:null;
 return {kind:'prices',productId:product.id,queriedAt:time,quotes:quote?[quote]:[],relatedLinks:quote||match.status==='mismatch'?[]:[{...row,price:null,reason:match.comparable?'页面价格含义不明确，请前往商家核对或手动填写':'配置待确认，不能作为当前配置报价'}],notice:quote?'已读取配置匹配的页面标价':match.status==='mismatch'?'当前商家配置与本机不一致，请选择正确配置。':'请核对销售配置和页面价格，无法确认时可手动填写。'};
}
export function createBrowserPriceService({catalog,parseListing,bridge=createBrowserBridge(),now=Date.now}={}){
 const candidates=new Map();let busy=false;
 const service=async(body,{signal}={})=>{if(!body||Object.keys(body).some(k=>!['productId','platform','action','listingId'].includes(k)))fail('BAD_BROWSER_REQUEST',400,'查价请求无效。');const p=catalog.find(x=>x.id===body.productId);if(!p)fail('BAD_PRODUCTS',400,'商品不存在。');if(!['jd','taobao'].includes(body.platform)||!['login','search','open','read'].includes(body.action))fail('BAD_BROWSER_REQUEST',400,'查价操作无效。');if(busy)fail('BROWSER_BUSY',409,'查价浏览器正在处理，请稍候。');
  busy=true;try{const {platform,action}=body;let payload={platform,action};if(action==='search')payload.keyword=[p.brand,p.model,p.cpu_model,p.gpu_model,p.ram_gb+'GB',p.ssd_gb+'GB'].filter(Boolean).join(' ').slice(0,190);if(action==='open'){const c=candidates.get(body.listingId);if(!c||c.productId!==p.id||c.platform!==platform||now()-c.at>600000)fail('BROWSER_LINK_EXPIRED',400,'搜索链接已过期，请重新搜索。');payload.url=c.url;}
   const result=await bridge.call(payload,{signal});if(result.detail)return browserDetailResult(p,platform,result.detail,parseListing,now());
   const relatedLinks=[];for(const item of (result.items??[]).slice(0,3)){const url=browserMerchantUrl(item.url,platform);if(!url)continue;const id=crypto.randomBytes(12).toString('hex');if(candidates.size>=40)candidates.delete(candidates.keys().next().value);candidates.set(id,{url,productId:p.id,platform,at:now()});relatedLinks.push({id,listingId:id,platform:platform==='jd'?'京东':'淘宝/天猫',name:String(item.title??'商家商品').slice(0,200),sourceUrl:url,price:null,reason:'搜索结果，尚未核对具体配置与价格'});}
   return {kind:'prices',productId:p.id,quotes:[],relatedLinks,requiresManual:!!result.requiresManual,notice:result.message??(result.requiresManual?'请在查价浏览器中自行登录或完成验证，然后重试。':action==='search'?'请在查价浏览器打开商品、选择配置后读取。':'操作已完成。')};
  }finally{busy=false;}};service.close=()=>bridge.close();return service;
}
