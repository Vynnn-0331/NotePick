import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {buildRecommendationCardCopy} from '../src/services/recommendationCardCopy.js';
import {buildRecommendationComparison} from '../src/services/recommendationComparison.js';
import {recommendCatalog} from '../src/services/recommendationEngine.js';
import {defaultRequirements} from '../src/services/requirements.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../../'+p,import.meta.url)));
const catalog=read('frontend/src/data/catalog.json');
const requirement={...defaultRequirements(),budget:[5000,20000],scenarios:['mainstream-games'],priorities:['gpu-power']};
test('card copy expands only existing advantages into at most two factual headings and explanations',()=>{
 const matches=recommendCatalog(catalog,requirement).slice(0,3),comparisons=buildRecommendationComparison(matches,requirement),before=JSON.stringify(comparisons);
 for(const [i,c] of comparisons.entries()){const copy=buildRecommendationCardCopy(c,matches[i],requirement);assert.equal(copy.id,c.id);assert(copy.advantages.length<=2);assert.deepEqual(copy.advantages.map(a=>a.kind),c.advantages.map(a=>a.kind));for(const a of copy.advantages){assert(a.title&&a.description.includes('。'));assert.deepEqual(a.basis,c.advantages.find(b=>b.kind===a.kind));}assert(!('cautions' in copy));if(!c.advantages.length)assert(copy.neutral&&!copy.advantages.length);assert(!/保证流畅|性能最强|完美适合|性价比之王|[%％]|评分/.test(JSON.stringify(copy)));}
 assert.equal(JSON.stringify(comparisons),before);
});
test('card copy uses actual use cases in storage/portability explanations without creating performance claims',()=>{
 const c={id:'a',advantages:[{kind:'storage',value:2048,field:'ssd_gb'},{kind:'weight',value:.975,field:'weight_kg'}]};
 const dev=buildRecommendationCardCopy(c,null,{scenarios:['large-projects'],priorities:['portable']});assert(dev.advantages[0].description.includes('2TB'));assert(dev.advantages[0].description.includes('开发项目'));assert(dev.advantages[1].description.includes('0.975kg'));assert(dev.advantages[1].description.includes('上课或通勤'));
 const creative=buildRecommendationCardCopy(c,null,{scenarios:['video-editing'],priorities:[]});assert(creative.advantages[0].description.includes('创作素材'));
 const game=buildRecommendationCardCopy(c,null,{scenarios:['mainstream-games'],priorities:[]});assert(game.advantages[0].description.includes('游戏与更新文件'));
 assert(!buildRecommendationCardCopy({id:'a',advantages:[]},null,{}).advantages.length);
});
test('111 pre-change rankings/utilities, original limitations, backend and independent AI modules remain unchanged',()=>{
 const baseline=read('data/processed/card_ui_price_v2_baseline.json');
 for(const [file,hash] of Object.entries(baseline.hashes).filter(([file])=>!['frontend/src/services/aiClient.js','backend/config.mjs','backend/context.mjs','backend/prompt.mjs','backend/deepseek.mjs','backend/server.mjs','frontend/src/components/DeepSeekAnalysis.jsx'].includes(file)))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../../'+file,import.meta.url))).digest('hex'),hash,file);
 for(const c of baseline.cases){const matches=recommendCatalog(catalog,c.input);assert.deepEqual(matches.map(m=>m.product.id),c.ids);assert.deepEqual(matches.map(m=>m.ranking.utility),c.utility);const comparisons=buildRecommendationComparison(matches.slice(0,3),c.input);const before=JSON.stringify(comparisons);comparisons.forEach((v,i)=>buildRecommendationCardCopy(v,matches[i],c.input));assert.equal(JSON.stringify(comparisons),before);}
});

test('visible card wording stays concise while relative evidence and unknown fields remain unchanged',()=>{
 const baseline=read('data/processed/card_ui_price_v2_baseline.json');
 for(const c of baseline.cases){const matches=recommendCatalog(catalog,c.input).slice(0,3),comparisons=buildRecommendationComparison(matches,c.input);for(const [i,comparison] of comparisons.entries()){const copy=buildRecommendationCardCopy(comparison,matches[i],c.input);const visible=[copy.description,copy.neutral,...copy.advantages.flatMap(a=>[a.title,a.description])].filter(Boolean).join(' ');assert(!/符合已设硬性条件|尚未核验|不保证|资料不足|需进一步确认|不能据此|仅作参考|性能最强|性价比之王/.test(visible));assert.deepEqual(copy.advantages.map(a=>a.basis),comparison.advantages);if(!copy.advantages.length)assert(copy.neutral);}}
});
