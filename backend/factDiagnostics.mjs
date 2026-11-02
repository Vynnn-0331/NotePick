import crypto from 'node:crypto';
const normalize=s=>String(s??'').toLowerCase().replace(/intel|amd|apple/g,'').replace(/酷睿/g,'core').replace(/锐龙/g,'ryzen').replace(/[\s-]/g,'');
export const gpuModels=s=>[...String(s??'').matchAll(/RTX\s*(?:Pro\s*)?\d{4}\s*(?:Ti)?|Arc\s*[A-Z]?\d{3}[A-Z]?|Radeon\s*(?:RX\s*)?\d{3,4}[A-Z]*/gi)].map(m=>normalize(m[0]));
const cpuModels=s=>[...String(s??'').matchAll(/(?:Core|酷睿)\s*(?:Ultra\s*)?[i3579]\d?\s*[- ]?\d{3,5}[A-Za-z0-9]{0,5}|(?:Ryzen|锐龙)\s*(?:AI\s*)?\d\s*(?:H\s*)?[- ]?\d{3,5}[A-Za-z0-9]{0,5}|M[1-9]\s*(?:Pro|Max|Ultra)?|A\d{2}\s*Pro/gi)].map(m=>normalize(m[0]));
export function factCategory(text,rule=''){
 if(/显存|vram/i.test(text))return 'vram';if(/gpu model/i.test(rule)||gpuModels(text).length)return 'gpu_model';if(/cpu model/i.test(rule)||cpuModels(text).length)return 'cpu_model';
 if(/内存|RAM/i.test(text)&&/\d+\s*GB/i.test(text))return 'memory';if(/SSD|存储|硬盘/i.test(text)&&/\d+\s*(GB|TB)/i.test(text))return 'storage';
 if(/续航|电池|Wh\b|小时|battery/i.test(text))return 'battery_duration';if(/FPS|帧率|帧每秒|渲染.*\d+\s*秒/i.test(text))return 'performance_measurement';
 if(/色域|色准|sRGB|DCI-P3/i.test(text))return 'color';if(/尼特|亮度|nits?/i.test(text))return 'display_brightness';if(/Hz\b|刷新率/i.test(text))return 'display_refresh';if(/\d+\s*(W\b|瓦)|功耗/i.test(text))return 'power';
 if(/英寸|屏幕尺寸/i.test(text))return 'screen_size';if(/[¥￥]|\d+\s*元/.test(text))return 'price';return 'other';
}
export function redactFactText(text){
 const cleaned=String(text??'').replace(/sk-[A-Za-z0-9_-]+|Bearer\s+\S+|https?:\/\/\S+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gi,' ');
 const tokens=cleaned.match(/GDDR[3-9]X?|LPDDR[3-6]X?|DDR[3-6]|RTX\s*(?:Pro\s*)?\d{4}\s*(?:Ti)?|Arc\s*[A-Z]?\d{3}[A-Z]?|Radeon\s*(?:RX\s*)?\d{3,4}[A-Z]*|(?:Core|酷睿)\s*(?:Ultra\s*)?[i3579]\d?\s*[- ]?\d{3,5}[A-Za-z0-9]{0,5}|(?:Ryzen|锐龙)\s*(?:AI\s*)?\d\s*(?:H\s*)?[- ]?\d{3,5}[A-Za-z0-9]{0,5}|\d+(?:\.\d+)?\s*(?:GB|TB|G(?![A-Za-z])|T(?![A-Za-z])|kg|W\b|Wh\b|小时|FPS\b|帧|Hz\b|尼特|英寸|核|[%％])|尚未确认|未确认|无法确认|不能保证|无法保证|不能据此|不能|不代表|不等于|不一定|不应|未记录|尚未|未实测|不是|本机|当前商品|当前配置|这款电脑|该机|集成显卡|独立显卡|可用统一内存|显存|内存|存储|硬盘|核显|集显|独显|屏幕|续航|电池|功耗|帧率|刷新率|亮度|色域|色准|假定|是否|可能|通常|一般|相比|相较|比起|保证|最强|至少|最多|可达|达到|配备|搭载|具备|支持|GPU|CPU|VRAM|SSD|有|为|但/gi)??[];
 return tokens.filter(t=>!/^\d/.test(t)||Number(t.match(/^\d+(?:\.\d+)?/)[0])<=4096).slice(0,24).join(' … ').slice(0,300);
}
export function describeFact(text,context,rule,index=0){
 const refs=[...text.matchAll(/\[(S\d+)\]/g)].map(m=>m[1]),sources=(context.web?.sources??[]).filter(s=>refs.includes(s.id));
 const quantities=[...text.matchAll(/(\d+(?:\.\d+)?)\s*(GB|TB|kg|W\b|Wh\b|小时|FPS\b|Hz\b|尼特|英寸|[%％])/gi)].slice(0,4).filter(m=>Number(m[1])<=4096).map(m=>({value:Number(m[1]),unit:m[2].toLowerCase()}));
 return {ruleId:rule.replace(/[^\w .:-]/g,'_').slice(0,80),factCategory:factCategory(text,rule),sentenceIndex:index,redactedFactText:redactFactText(text),sentenceHash:crypto.createHash('sha256').update(text).digest('hex'),sourceTypes:[...(rule==='known local conflict'?['local']:[]),...(sources.length?[...new Set(sources.map(s=>s.type==='official'?'official_web':'third_party_web'))]:['model_inference'])],polarity:/不能|不代表|不等于|未确认|尚未|不一定/.test(text)?'negative_or_uncertain':/如果|若|假设|可能/.test(text)?'conditional':'affirmative',sourceSummaries:sources.slice(0,8).map(s=>({id:s.id,host:(()=>{try{return new URL(s.url).hostname;}catch{return 'unknown';}})(),bodyAvailable:!!s.bodyAvailable,scope:s.scope})),sourceIds:refs.filter(r=>r.length<=5).slice(0,8),sourceScopes:[...new Set(sources.map(s=>s.scope))],skuConflict:sources.some(s=>s.scope==='conflict')||rule==='known local conflict',quantities};
}
const currentActor=/本机|当前(?:商品|配置|机型|设备)|这(?:款|台)(?:电脑|笔记本|机型|产品)|该(?:机|电脑|笔记本|机型)|此款电脑|它(?:配备|搭载|采用|支持)/;
export const hasCurrentReference=text=>currentActor.test(text);
export function affirmativeCurrentText(text){return String(text).split(/[，,；]/).filter(part=>{const found=part.match(currentActor);if(!found)return true;const index=found.index,before=part.slice(Math.max(0,index-24),index),after=part.slice(index+found[0].length);return !/(?:不能|不代表|不等于|不应|尚不能|无法据此|无法确认|尚未确认|未确认).{0,10}$/.test(before)&&!/^.{0,8}(?:尚未确认|未确认|不能确认|不一定|需核实)/.test(after);}).join('，');}
export function knownHardwareSubject(text,products){const cpus=cpuModels(text);return products.some(p=>cpuModels(p.knownFacts.cpu).some(c=>cpus.includes(c)));}
export function assertKnownCurrentFacts(text,products,citations){
 text=affirmativeCurrentText(text);const current=citations.some(c=>c.kind==='current_spec')||hasCurrentReference(text);
 if(!current)return;
 for(const p of products){const f=p.knownFacts,g=gpuModels(text),known=gpuModels(f.gpu);let conflict=known.length&&g.some(m=>!known.includes(m));
  if(f.gpuType==='集成显卡'&&/独立显卡|独显|RTX\s*\d/i.test(text))conflict=true;
  const c=cpuModels(text),kc=cpuModels(f.cpu);if(kc.length&&c.some(m=>!kc.includes(m)))conflict=true;
  const installedText=text.replace(/(?:GPU可用统一内存|可用统一内存)\s*(?:为|是|:|：)?\s*\d+(?:\.\d+)?\s*(?:GB|TB)|\d+(?:\.\d+)?\s*(?:GB|TB)\s*可用统一内存/gi,'GPU可用容量').replace(/(?:最高支持|最大支持|可扩展至|可升级至)\s*\d+(?:\.\d+)?\s*(?:GB|TB)\s*(?:内存|RAM|SSD|存储)?/gi,'扩展能力');
  const ram=[...installedText.matchAll(/(?:统一内存|内存|RAM)\s*(?:为|是|:|：)?\s*(\d+(?:\.\d+)?)\s*(GB|TB)|(\d+(?:\.\d+)?)\s*(GB|TB)\s*(?:统一内存|内存|RAM)/gi)].map(m=>Number(m[1]??m[3])*(/tb/i.test(m[2]??m[4])?1024:1));
  if(f.ramGb!=null&&ram.some(n=>n!==f.ramGb))conflict=true;
  const storage=[...installedText.matchAll(/(?:SSD|存储|硬盘)\s*(?:为|是|:|：)?\s*(\d+(?:\.\d+)?)\s*(GB|TB)|(\d+(?:\.\d+)?)\s*(GB|TB)\s*(?:SSD|存储|硬盘)/gi)].map(m=>Number(m[1]??m[3])*(/tb/i.test(m[2]??m[4])?1024:1));
  if(f.ssdGb!=null&&storage.some(n=>n!==f.ssdGb))conflict=true;
  if(conflict)throw Error('known local conflict');
 }
}
export function isRepairableOptional(text,context,rule){
 if(!['unsupported specification','unverified quantity','unverified web quantity'].includes(rule))return false;
 const category=factCategory(text,rule);if(!['battery_duration','display_brightness','display_refresh','color','power','performance_measurement'].includes(category))return false;
 if(/显存|CPU|GPU|内存|SSD|存储|硬盘|价格|型号|SKU|配备|搭载/i.test(text))return false;
 const workloads=context.requirements.scenarios?.map(s=>s.id??s)??[];
 if(category!=='battery_duration'&&workloads.some(s=>['graphics','video-editing','modeling-3d','local-ai','mainstream-games','aaa-games'].includes(s)))return false;
 return true;
}

export function normalizeUncertainSpecification(text){
 if(cpuModels(text).length||gpuModels(text).length||/CPU|GPU|SSD|硬盘|存储|价格|配备|搭载/i.test(text))return null;
 const numbers=[...text.matchAll(/\d+(?:\.\d+)?\s*(?:GB|TB|W\b|Wh\b|小时|FPS\b|帧|Hz\b|尼特)/gi)];if(numbers.length!==1)return null;
 if(/(?:尚未确认|未确认|无法确认|不清楚|需核实|需要核实).{0,12}显存.{0,8}(?:是否|是不是).{0,8}\d+\s*GB|显存.{0,6}(?:是否|是不是).{0,8}\d+\s*GB.{0,10}(?:尚未确认|未确认|需核实)/i.test(text))return '显存容量尚未确认，需核对当前具体配置。';
 if(/(?:不能保证|无法保证|尚未确认|未确认|无法确认|未实测).{0,16}\d+(?:\.\d+)?\s*(?:FPS\b|帧)/i.test(text))return '具体游戏表现尚需结合目标游戏和实际测试判断。';
 if(/(?:不能保证|无法保证|尚未确认|未确认|无法确认|未实测).{0,16}\d+(?:\.\d+)?\s*小时/i.test(text))return '续航表现尚需结合实际使用条件确认。';
 return null;
}

export function includeEvidence(detail,citations,context){
 const ids=new Set(detail.sourceIds??[]);detail.evidenceClaims=(citations??[]).filter(c=>c&&ids.has(c.sourceId)).slice(0,8).map(c=>{const source=context.web?.sources?.find(s=>s.id===c.sourceId),quote=typeof c.quote==='string'?c.quote:'';return {sourceId:c.sourceId,kind:c.kind,quoteHash:crypto.createHash('sha256').update(quote).digest('hex'),quoteFactText:redactFactText(quote),bodyContainsQuote:!!source?.bodyAvailable&&!!quote&&String(source.content??'').replace(/\s+/g,' ').includes(quote.replace(/\s+/g,' '))};});return detail;
}
