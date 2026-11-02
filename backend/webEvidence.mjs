import {describeFact,includeEvidence,assertKnownCurrentFacts,affirmativeCurrentText,hasCurrentReference,knownHardwareSubject} from './factDiagnostics.mjs';
import {safeSourceUrl} from './search.mjs';
const normalized=s=>String(s??'').replace(/\s+/g,' ').trim();
// Normalize explicit capacity spelling and CPU language aliases, not SKU identity or values.
// G/T without a capacity label is left intact (e.g. Arc 130T is not 130TB).
const evidenceSpelling=s=>String(s??'').toLowerCase().replace(/酷睿/g,'core').replace(/锐龙/g,'ryzen')
 .replace(/((?:显存|统一内存|内存|存储|硬盘|容量|ram|vram|ssd)\s*[|:：]?\s*)(\d+(?:\.\d+)?)\s*g(?![a-z])/gi,'$1$2GB')
 .replace(/((?:存储|硬盘|容量|ssd)\s*[|:：]?\s*)(\d+(?:\.\d+)?)\s*t(?![a-z])/gi,'$1$2TB')
 .replace(/(\d+(?:\.\d+)?)\s*g(?=\s*(?:ddr|显存|内存|ram|vram))/gi,'$1GB')
 .replace(/(\d+(?:\.\d+)?)\s*t(?=\s*ssd)/gi,'$1TB')
 .replace(/[\s,]/g,'').toLowerCase();

const brandDomains={Apple:['apple.com','apple.com.cn'],联想:['lenovo.com','lenovo.com.cn','thinkpad.com'],华硕:['asus.com','asus.com.cn'],惠普:['hp.com','hpstore.cn','hpshopping.com.cn'],华为:['huawei.com','vmall.com'],戴尔:['dell.com'],机械革命:['mechrevo.com'],宏碁:['acer.com','acer.com.cn'],微星:['msi.com'],荣耀:['honor.com'],小米:['mi.com'],雷神:['thunderobot.com'],机械师:['machenike.com'],神舟:['hasee.com']};
const hasSku=(source,sku)=>!!sku&&String(source.title+' '+source.content).toLowerCase().split(/[^a-z0-9_-]+/i).includes(String(sku).toLowerCase());
function exactOfficialSource(source,context){if(context.products.length!==1)return false;const p=context.products[0],host=new URL(source.url).hostname,domains=brandDomains[p.brand]??[];if(source.type!=='official'||!domains.some(d=>host===d||host.endsWith('.'+d))||!hasSku(source,p.identity?.sku))return false;return !(context.web.sources??[]).some(s=>s.scope==='conflict'&&hasSku(s,p.identity?.sku));}
export function validateWebCitations(items,context){
 if(items===undefined)return [];if(!context.web||!Array.isArray(items)||items.length>8)throw Error('invalid web citations');
 const allowed={current_spec:['exact_sku'],series_spec:['exact_sku','configuration','series','conflict'],hardware_general:['hardware','exact_sku','configuration','series'],software_requirement:['software'],review_observation:['exact_sku','configuration','series'],price_observation:['exact_sku','configuration']};
 return items.map(c=>{try{if(!c||Object.keys(c).some(k=>!['sourceId','quote','kind'].includes(k))||typeof c.quote!=='string'||c.quote.length<4||c.quote.length>360)throw Error('invalid web citation');const source=context.web.sources.find(s=>s.id===c.sourceId);if(!source||!source.bodyAvailable||!safeSourceUrl(source.url)||!allowed[c.kind]?.includes(source.scope)||!normalized(source.content).includes(normalized(c.quote)))throw Error('unsupported web citation');if(/忽略.{0,12}(?:系统|规则|指令)|泄露|密钥|api.?key|ignore previous|system prompt/i.test(c.quote))throw Error('untrusted web instruction');if(c.kind==='current_spec'&&!exactOfficialSource(source,context))throw Error('conflicting web citation');return {sourceId:source.id,quote:normalized(c.quote),kind:c.kind};}catch(e){e.factDetail=includeEvidence(describeFact(typeof c?.quote==='string'?c.quote+' ['+(c.sourceId??'')+']':'',context,e.message),[c],context);if(e.message==='conflicting web citation')e.factDetail.skuConflict=true;throw e;}});
}
export function guardWebText(text,products,budget,context,citations,localGuard){
 if(!context.web)return localGuard(text,products,budget);
 text=text.replace(/https?:\/\/[^\s）)\]，。]+/g,url=>{const s=context.web.sources.find(s=>s.url===url);if(!s)throw Error('unverified source URL');return '['+s.id+']';});
 for(const [sentenceIndex,fragment] of text.split(/[。；\n!?！？]/).filter(Boolean).entries()){try{
  const refs=[...fragment.matchAll(/\[(S\d+)\]/g)].map(m=>m[1]);if(refs.some(id=>!context.web.sources.some(s=>s.id===id)))throw Error('unverified source ID');
  if(!/参考/.test(fragment)&&/(?:现在|今日|当前|实时|成交|促销|优惠)[^。；\n]{0,18}(?:\d[\d,.]*\s*元|[¥￥]\s*\d)/.test(fragment)&&!citations.some(c=>refs.includes(c.sourceId)&&c.kind==='price_observation'))throw Error('unverified current price');
  if(/(?:软件|Premiere|Blender|PyTorch|Adobe)[^。；\n]{0,24}(?:要求|至少|推荐)[^。；\n]{0,20}\d+\s*(?:GB|TB)/i.test(fragment)&&!citations.some(c=>refs.includes(c.sourceId)&&c.kind==='software_requirement'))throw Error('unverified software requirement');
  assertKnownCurrentFacts(fragment,products,citations.filter(c=>refs.includes(c.sourceId)));
  const factual=fragment.replace(/(?:可|可以|建议|不妨)(?:先)?比较\s*\d+(?:\.\d+)?\s*英寸(?:左右的)?机型/g,'可比较较小或较大屏幕的机型');
  try{localGuard(factual,products,budget);continue;}catch(e){
   if(e.message==='unsafe claims'&&(!/[%％]/.test(fragment)||/评分|匹配|效用|得分|百分比|性能最强|保证流畅|已联网|实时查询|https?:|sk-/i.test(fragment)))throw e;
   const claims=citations.filter(c=>refs.includes(c.sourceId));if(!claims.length)throw e;
   const exact=claims.every(c=>c.kind==='current_spec');
   const assertionText=affirmativeCurrentText(fragment);
   if(!exact&&hasCurrentReference(assertionText))throw Error('unsupported current SKU claim');
   const componentFrame=claims.some(c=>c.kind==='hardware_general')&&knownHardwareSubject(fragment,products);
   if(!exact&&!componentFrame&&!/该系列|同系列|其他版本|该版本|芯片资料|处理器资料|显卡资料|资料中的|相关芯片|官方.{0,8}(?:页面|资料|规格)|(?:芯片|处理器|显卡).{0,8}(?:资料|规格)|系列.{0,8}(?:官网|页面|资料|版本|规格)|评测.{0,8}(?:样机|机型|版本)|(?:软件|Premiere|Adobe|Blender|PyTorch).{0,12}要求|配置页面|可选/.test(fragment))throw Error('unscoped web claim');
   const tokens=[...fragment.matchAll(/GDDR[3-9]X?|LPDDR[3-6]X?|DDR[3-6]|(?:Core\s*(?:Ultra\s*)?[i3579]\s*[- ]?\d{3,5}[A-Za-z]{0,3}|酷睿\s*(?:Ultra\s*)?[3579]\s*[- ]?\d{3,5}[A-Za-z]{0,3}|(?:Ryzen|锐龙)\s*(?:AI\s*)?\d\s*(?:H\s*)?[- ]?\d{3,5}[A-Za-z]{0,3}|RTX\s*(?:Pro\s*)?\d{4}\s*(?:Ti)?|Arc\s*[A-Z]?\d{3}[A-Z]?|\d+(?:[,.]\d+)*\s*(?:GB|TB|kg|公斤|千克|英寸|万元|元|核|W\b|Wh\b|瓦|小时|分钟|秒|FPS\b|帧|Hz\b|nits?\b|尼特|[%％])|[¥￥]\s*\d+(?:[,.]\d+)*)/gi)].map(m=>m[0].toLowerCase().replace(/[\s,]/g,''));
   if(!tokens.length)throw e;const quote=claims.map(c=>evidenceSpelling(c.quote)).join(' ');
   for(const token of tokens)if(!quote.includes(evidenceSpelling(token))){if(/^(?:gddr|lpddr|ddr)/i.test(token))throw Error('unverified web quantity');try{localGuard(token,products,budget);}catch{throw Error('unverified web quantity');}}
  }
 }catch(e){e.factDetail=includeEvidence(describeFact(fragment,context,e.message,sentenceIndex),citations,context);throw e;}
 }
}
export function publicResearch(web){if(!web)return null;return {...web,sources:web.sources.map(({content,...s})=>s)};}
