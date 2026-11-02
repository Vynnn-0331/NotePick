// Search hypotheses are separate from confirmed product identities and never affect ranking.
import {hardwareTargets,sourceIdentityValid,exactModel,preprocess,reconcileFacts} from './hardwareReport.mjs';
export function retrievalTargets(product){return hardwareTargets(product).map(t=>t.kind==='gpu'&&t.ambiguous&&/\b(?:RTX|GTX)\s*\d{3,4}\b/i.test(t.base)?{...t,name:t.base+' Laptop GPU',ambiguous:false,laptop:true,referenceOnly:true}:t)}
export function retrievalCandidate(row,target){return sourceIdentityValid({title:row.title,text:row.content},target)||sourceIdentityValid({title:row.title,text:String(row.title??'').replace(/[®™]/g,'')},target)}
export function candidatePriority(row,target){return (sourceIdentityValid({title:row.title,text:String(row.title??'').replace(/[®™]/g,'')},target)?10:0)+(target.laptop&&/laptop|notebook|笔记本/i.test(row.title??'')?10:0)-(/graphics-cards|ultimate-guide/i.test(row.url??'')?20:0)}
export function mobileReference(sources,target){
 if(!target?.laptop||target.ambiguous)return null;const facts=[];
 for(const source of sources.filter(s=>s.kind==='gpu'&&s.evidenceKind==='extracted_page')){if(!sourceIdentityValid(source,target))continue;
 for(const line of preprocess(source.text).split('\n')){if(line.startsWith('|')||!exactModel(line,target))continue;
 // Only the target's own overview statement; never scan comparison rows for arbitrary numbers.
 const models=[...line.matchAll(/(?:RTX|GTX)\s*(\d{3,4})(?:\s*(Ti|Super))?/gi)].map(m=>m[0]);if(models.some(m=>!exactModel(m,{...target,laptop:false})))continue;
 for(const [field,label,match,unit] of [['architecture','架构',line.match(/from the (Blackwell|Ada Lovelace|Ampere) family/i),''],['vram','显存规格',line.match(/\b(\d{1,2})\s*GB\s+GDDR[5-7]\s+(?:graphics|video) memory/i),'GB']])if(match){const value=field==='vram'?Number(match[1]):match[1];if(field==='vram'&&(value<1||value>64))continue;facts.push({kind:'gpu',field,label,value,unit,model:target.name,sourceId:source.id,url:source.url,snippet:line.slice(0,900),evidence:'body_supported',scope:'mobile_chip_reference_not_confirmed_product_configuration'});}
 }}
 return {model:target.name,scope:'笔记本版芯片资料；本机具体版本、显存和功耗尚未核验',fields:reconcileFacts(facts)};
}
