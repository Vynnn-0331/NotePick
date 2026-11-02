// Read-only evidence presentation for AI; no dependency on scoring or ranking policies.
import runtime from '../frontend/src/data/performanceRuntime.json' with {type:'json'};
export const chipKey=s=>String(s??'').replace(/™|®/g,'').normalize('NFKC').toLowerCase().replace(/英特尔|intel|amd|apple|nvidia|geforce/g,'').replace(/锐龙/g,'ryzen').replace(/酷睿/g,'core').replace(/\bR([3579])\s*[- ]\s*(\d{4,5}[A-Z]+)/ig,'ryzen$1$2').replace(/[^\p{L}\p{N}]/gu,'');
export function chipTargets(product){
 const f=product.knownFacts,reg=runtime.products[product.id],anchored=reg&&reg.signature.cpu_model===f.cpu&&reg.signature.gpu_model===f.gpu;
 const name=(kind,raw)=>{const registered=anchored?runtime.models[kind==='cpu'?reg.cpuId:reg.resolvedGpuId]:null;const exact=registered??Object.values(runtime.models).find(m=>m.kind===kind&&[m.name,...(m.aliases??[])].some(a=>chipKey(a)===chipKey(raw)));return String(exact?.name??raw??'').replace(/（桌面\/移动版本未明确）/g,'').trim();};
 const cpu=name('cpu',f.cpu).replace(/^R([3579])[- ](\d{4,5}\w*)$/i,'AMD Ryzen $1 $2');let gpu=name('gpu',f.gpu);
 if(/^RTX\s*\d{4}/i.test(gpu))gpu='NVIDIA GeForce '+gpu.replace(/RTX\s*(\d{4})\s*(Ti)?/i,(_,n,ti)=>'RTX '+n+(ti?' Ti':''));
 const variant=/\bRTX\s*\d{4}/i.test(gpu)&&!/(?:desktop|桌面|Laptop)/i.test(gpu)?gpu+' Laptop GPU':gpu;
 return {cpu,gpu,gpuSearchVariant:variant,gpuLaptopConfirmed:!!product.gpuIdentity?.mobileConfirmed,cpuOfficial:/AMD|Ryzen|锐龙/i.test(cpu)?'amd.com':/Intel|Core|酷睿/i.test(cpu)?'intel.com OR site:intel.cn':/Apple|\bM\d|A\d/i.test(cpu)?'apple.com':null,gpuOfficial:/NVIDIA|RTX|GeForce/i.test(gpu)?'nvidia.com':/AMD|Radeon/i.test(gpu)?'amd.com':/Intel|Arc/i.test(gpu)?'intel.com':/Apple|\bM\d/i.test(gpu)?'apple.com':null};
}
export function localChipEvidence(product){const reg=runtime.products[product.id];if(!reg||reg.signature.cpu_model!==product.knownFacts.cpu||reg.signature.gpu_model!==product.knownFacts.gpu)return null;const ids=[reg.cpuId,reg.resolvedGpuId];return {origin:'local_verified_snapshot_not_live_search',file:'frontend/src/data/performanceRuntime.json',models:ids.map(id=>runtime.models[id]).filter(Boolean).map(m=>({id:m.id,name:m.name})),facts:runtime.facts.filter(f=>ids.includes(f.modelId)).slice(0,4).map(f=>({metric:f.metric,value:f.value,unit:f.unit,channel:f.channel,sourceId:f.sourceId,context:f.context,limitations:f.limitations})),notice:'离线硬件资料快照，不是本机实测或本轮联网查询。'};}
const clean=s=>s.replace(/\*\*|<[^>]*>/g,'').trim();
// Extract only labelled cells. Never assign a neighbouring GPU column to the selected model.
export function chipFactsFromBody(text,target,kind){
 const facts=[];if(!text?.trim()||!target)return facts;text=text.replace(/^\s*[-*]\s+/gm,'').replace(/™|®/g,'');const key=chipKey(target),hasTarget=chipKey(text).includes(key)||kind==='gpu'&&chipKey(text).includes(key.replace(/laptopgpu$/,''));if(!hasTarget)return facts;
 if(kind==='cpu')for(const [label,re] of [['CPU cores',/(?:#\s*of\s*CPU\s*Cores|Total Cores|CPU\s*核心数|核心数量)\s*[:：|\n ]+\s*(\d+)/i],['Threads',/(?:#\s*of\s*Threads|Total Threads|线程数量|线程数)\s*[:：|\n ]+\s*(\d+)/i],['Architecture',/(?:Processor Architecture|处理器架构)\s*[:：|\n ]+\s*(Zen\s*\d\w*|[^\n|]{1,50})/i],['Max boost clock',/(?:Max\.\s*Boost Clock|Max Turbo Frequency|最高加速时钟频率)\s*[:：|\n ]+\s*((?:Up to\s*|最高可达\s*)?\d+(?:\.\d+)?\s*GHz)/i],['Default TDP',/(?:Default TDP|Processor Base Power|默认热设计功耗\s*\(TDP\))\s*[:：|\n ]+\s*(\d+\s*W)/i],['Configurable TDP',/(?:AMD Configurable TDP\s*\(cTDP\)|AMD 可配置热设计功耗\s*\(cTDP\)|cTDP)\s*[:：|\n ]+\s*(\d+\s*[-–]\s*\d+\s*W)/i]]){const m=clean(text).match(re);if(m)facts.push({label,value:clean(m[1]),scope:'chip_spec_not_laptop_measurement'});}
 if(kind==='gpu'){
  const lines=text.split('\n');let columns=null;
  for(let i=0;i<lines.length;i++){
   let line=lines[i];if(!line.includes('|'))continue;while(i+1<lines.length&&/^\s*(?:\|\s*)?\d+\s*(?:GB|TB)\b/i.test(lines[i+1]))line+=' '+lines[++i];while(i+1<lines.length&&lines[i+1].includes('|')&&!/^\s*\||^\s*[-:]+\s*\|/.test(lines[i+1])&&!/(?:CUDA|Memory|Power|Clock|Architecture|Specs)/i.test(lines[i+1]))line+=' '+lines[++i];const cells=line.split('|').map(clean);if(cells[0]==='')cells.shift();if(cells.at(-1)==='')cells.pop();
   if(cells.filter(c=>/RTX\s*\d{4}/i.test(c)).length>=2){columns=['',...cells.filter(c=>/RTX\s*\d{4}/i.test(c))];continue;}
   if(!columns){const preceding=lines.slice(Math.max(0,i-60),i).join('\n'),names=[...preceding.matchAll(/(?:GeForce\s*)?RTX\s*\d{4}\s*(?:T\s*i)?\s*Laptop GPU/gi)].map(m=>m[0]);const unique=[...new Set(names.map(chipKey))];if(unique.length>=2)columns=['',...unique];}
   if(!columns||!/(?:CUDA\s*Cores|Memory|Graphics Subsystem Power|GPU Subsystem Power|Boost Clock|显存|功耗)/i.test(cells[0]??''))continue;
   let index=columns.findIndex(c=>chipKey(c)===key);if(index<0&&!/laptopgpu$/.test(key))index=columns.findIndex(c=>chipKey(c)===key.replace(/laptopgpu$/,''));
   if(index<0)continue;const value=cells[index];if(value&&/\d/.test(value)&&!/[<>]/.test(value))facts.push({label:cells[0],value,scope:'selected_gpu_chip_column_not_current_laptop_tgp'});
  }
  if(/Blackwell/i.test(text)&&/RTX\s*50\d{2}/i.test(target))facts.push({label:'Architecture',value:'Blackwell',scope:'chip_family'});
 }
 return facts.slice(0,12);
}
export function selectChipContent(raw,targets,max=3000){
 const text=String(raw??'').slice(0,180000),cpu=chipFactsFromBody(text,targets.cpu,'cpu'),gpu=chipFactsFromBody(text,targets.gpuSearchVariant,'gpu');
 const key=chipKey(text),cpuMatched=!!targets.cpu&&key.includes(chipKey(targets.cpu)),g=chipKey(targets.gpuSearchVariant),gpuMatched=!!g&&(key.includes(g)||key.includes(g.replace(/laptopgpu$/,'')));
 const extracts=[...cpu.map(f=>`${targets.cpu} | ${f.label}: ${f.value}`),...gpu.map(f=>`${targets.gpuSearchVariant} | ${f.label}: ${f.value}`)];
 // Prefer actual specification sections to leading navigation/cookie text.
 const specs=/General Specifications|\n#{1,6}\s*(?:Specs|Specifications)\b|# of CPU Cores|NVIDIA CUDA Cores/i.exec(text),start=specs?Math.max(0,specs.index-150):0;
 const prefix=extracts.length?'Selected labelled chip specifications (not current laptop measurements):\n'+extracts.join('\n')+'\n\n':'';
 return {content:(prefix+text.slice(start,start+Math.max(0,max-prefix.length))).slice(0,max),chipFacts:[...cpu.map(f=>({...f,target:targets.cpu})),...gpu.map(f=>({...f,target:targets.gpuSearchVariant}))],cpuMatched,gpuMatched};
}
