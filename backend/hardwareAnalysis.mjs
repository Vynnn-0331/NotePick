// Presentation-only AI response boundary. Does not import or alter ranking policies.
import {AiError} from './errors.mjs';
const compact=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[\s™®®()（）_\-]/g,'').replace(/英特尔|intel|amd|apple|苹果|处理器|芯片/g,'').replace(/锐龙/g,'ryzen').replace(/酷睿/g,'core').replace(/英伟达|nvidia|geforce/g,'').replace(/^r([3579])(\d{4,5}[a-z]*)$/,'ryzen$1$2').replace(/^ultra(?=[3579]\d)/,'coreultra');
function reject(reason){const e=new AiError('INVALID_ANSWER',502,'AI回答与当前商品的身份或核心配置明确冲突，请重新分析。');e.validationStage='core_identity';e.validationReason=reason;throw e;}
function flatten(value){if(typeof value==='string')return value;if(Array.isArray(value))return value.map(flatten).filter(Boolean).join('\n');if(value&&typeof value==='object')return Object.entries(value).filter(([k])=>!['productId','product_id','id','citations','sources','name'].includes(k)).map(([k,v])=>flatten(v)).filter(Boolean).join('\n\n');return '';}
export function normalizeHardwareAnswer(content,context,followup=false,diagnostics={}){
 if(typeof content!=='string'||!content.trim())throw new AiError('INVALID_ANSWER',502,'AI返回内容为空，请重新分析。');
 let text=content.trim().replace(/^```(?:json|markdown|md|text)?\s*\n?/i,'').replace(/\n?```\s*$/,'');
 let raw;try{raw=JSON.parse(text);}catch{if(/^[{[]/.test(text)){const e=new AiError('INVALID_ANSWER',502,'AI返回的结构化片段不完整，请重新分析。');e.validationStage='json_parse';e.validationReason='incomplete_json';throw e;}}
 if(raw&&typeof raw==='object'){
  const ids=[raw.productId,raw.product_id,raw.id,...(Array.isArray(raw.products)?raw.products.map(p=>p.id):[])].filter(Boolean);
  if(ids.some(id=>!context.products.some(p=>p.id===id)))reject('product_id');
  for(const key of ['cpu','cpu_model','gpu','gpu_model'])if(typeof raw[key]==='string'){
   const known=context.products[0].knownFacts[key.startsWith('cpu')?'cpu':'gpu'];if(known&&compact(raw[key])!==compact(known))reject('structured_core_conflict');
  }
  text=flatten(raw);
 }
 if(!text.trim())throw new AiError('INVALID_ANSWER',502,'AI未返回可展示的分析，请重新分析。');
 for(const id of text.match(/np-[a-f0-9]{20}/g)??[])if(!context.products.some(p=>p.id===id))reject('product_id');
 const known=context.products[0]?.knownFacts??{},issues=[];
 const units=text.match(/[^。！？；\n]+[。！？；]?/g)??[];
 for(const unit of units){
  // Contextual chip comparisons, software requirements, conditional recommendations and review rigs are not current-SKU assertions.
  if(/(?:如果|若|假如|例如|相比|对比|评测样机|其他机型|另一|系列|支持上限|建议确认|并非|不是|不代表|未确认|未提供|未记录|未知)/.test(unit))continue;
  const explicit=/(?:本机|这台(?:电脑)?|该机|这款(?:电脑)?|当前(?:商品|电脑|配置)).{0,20}(?:搭载|配备|采用|使用|是|为)|^\s*(?:[-*]\s*)?(?:CPU|GPU|处理器|显卡|内存|SSD)\s*[:：]|(?:本机|这台电脑|该机|这款电脑)(?:显存|内存|SSD)\s*(?:为|是|有)?\s*\d+/i.test(unit);
  if(!explicit)continue;
  if(/(?:本机|这台电脑|该机|这款电脑|当前商品)/.test(unit)&&/(?:显存|VRAM)\s*(?:有|为|是|:|：)?\s*\d+\s*GB|\d+\s*GB\s*显存/i.test(unit)&&!context.web?.sources?.some(s=>s.bodyAvailable&&s.scope==='exact_sku'&&s.type==='official'&&s.content?.includes(unit.trim())))issues.push({unit,rule:'unconfirmed_current_vram'});
  const gpu=unit.match(/(?:RTX\s*(?:PRO\s*)?\d{3,4}(?:\s*Ti)?|Radeon\s*\d{3,4}[A-Z]*|Arc\s*[AB]?\d{3}[A-Z]*)/i)?.[0];
  if(gpu){const g=compact(gpu),base=compact(known.gpu);const exact=context.web?.sources?.some(s=>s.bodyAvailable&&s.scope==='exact_sku'&&s.type==='official'&&compact(s.content).includes(g));if(base&&!base.includes(g)&&!g.includes(base)||!base&&!exact)issues.push({unit,rule:'current_gpu_conflict'});}
  const cpuPattern=/(?:Core\s*(?:Ultra\s*)?i?[3579]\s*[- ]?\d{3,5}[A-Z]*|Ryzen\s*(?:AI\s*)?[3579]\s*(?:H\s*)?\d{3,5}[A-Z]*|酷睿\s*(?:Ultra\s*)?i?[3579]\s*[- ]?\d{3,5}[A-Z]*|锐龙\s*(?:AI\s*)?[3579]\s*(?:H\s*)?\d{3,5}[A-Z]*|\bM[1-9](?:\s*(?:Pro|Max|Ultra))?)/i;
  const cpu=unit.match(cpuPattern)?.[0];
  if(cpu&&known.cpu){const c=compact(cpu),k=compact(known.cpu.match(cpuPattern)?.[0]??known.cpu);if(c!==k)issues.push({unit,rule:'current_cpu_conflict'});}
  for(const [pattern,key] of [[/(\d+)\s*GB\s*(?:内存|RAM)|(?:内存|RAM)\s*[:：为是]?\s*(\d+)\s*GB/i,'ramGb'],[/(\d+(?:\.\d+)?)\s*(GB|TB)\s*(?:SSD|存储)|(?:SSD|存储)\s*[:：为是]?\s*(\d+(?:\.\d+)?)\s*(GB|TB)/i,'ssdGb']]){
   const m=unit.match(pattern);if(!m||known[key]==null)continue;const n=key==='ramGb'?Number(m[1]??m[2]):Number(m[1]??m[3])*((m[2]??m[4]).toUpperCase()==='TB'?1024:1);if(n!==known[key])issues.push({unit,rule:'current_capacity_conflict'});
  }
 }
 if(issues.length){diagnostics.validationReason=issues[0].rule;diagnostics.factRepairCount=issues.length;reject(issues[0].rule);}
 // The model cannot add clickable URLs; only the backend's actual search results are rendered as source links.
 const sourceIds=new Set((context.web?.sources??[]).map(s=>s.id));text=text.replace(/\[(S\d+)\]/g,(ref,id)=>sourceIds.has(id)?ref:'');
 const urls=new Set((context.web?.sources??[]).map(s=>s.url));text=text.replace(/https?:\/\/[^\s<>\]）)]+/g,url=>urls.has(url)?url:'（来源链接以文末实际查询结果为准）');
 diagnostics.factRepairOutcome='basic_core_checked';
 return {format:'hardware-markdown-v1',markdown:text,answer:text,productIds:context.products.map(p=>p.id),needs:text,products:context.products.map(p=>({id:p.id,meaning:text,tradeoff:'',cautions:[]})),choice:'',checks:[]};
}
