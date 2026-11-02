import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PRIORITIES,defaultRequirements,normalizeRequirements} from '../src/services/requirements.js';
import {adaptLegacyScoring,rankForRequirements} from '../src/services/legacyScoringAdapter.js';
import {rankCatalog} from '../src/services/scoreCatalog.js';
import {describeRecommendation} from '../src/services/recommendationDisplay.js';
test('seven exact four-Han-character labels preserve stable preference IDs and semantics',()=>{
 assert.deepEqual(PRIORITIES.map(p=>[p.id,p.label]),[['portable','轻薄便携'],['cpu-power','运行流畅'],['gpu-power','游戏畅玩'],['memory','多开流畅'],['storage','海量存储'],['large-screen','大屏体验'],['value','经济实惠']]);
 assert(PRIORITIES.every(p=>/^[\p{Script=Han}]{4}$/u.test(p.label)&&p.enabled));
 const p={...defaultRequirements(),scenarios:['graphics'],priorities:PRIORITIES.map(p=>p.id)};
 const a=adaptLegacyScoring(p);assert.deepEqual(a.preferences.priorities,['轻薄便携','大屏幕','高性价比']);
 assert.deepEqual(a.pendingPriorities.map(p=>p.id),['cpu-power','gpu-power','memory','storage']);
 assert.equal(a.pendingPriorities.find(p=>p.id==='gpu-power').label,'游戏畅玩');assert.deepEqual(normalizeRequirements(p),p);
});
test('historical battery choices are filtered and never reach ranking',()=>{
 const saved={...defaultRequirements(),scenarios:['documents'],priorities:['battery','portable'],unavailableSelections:['battery']};
 const clean=normalizeRequirements(saved);assert.deepEqual(clean.priorities,['portable']);assert(!PRIORITIES.some(p=>/续航/.test(p.label)));
 assert.deepEqual(adaptLegacyScoring(clean).preferences.priorities,['轻薄便携']);
});
test('presentation uses actual configuration, hides all scores and percentages including explanations',()=>{
 const m=Object.freeze({product:Object.freeze({ram_gb:32,ssd_gb:1024,weight_kg:1.5}),totalScore:99.5,dataCoverage:80,explanation:'CPU满足度100%；GPU满足度50%'});
 const text=describeRecommendation(m);assert(text.includes('32 GB 内存')&&text.includes('1024 GB SSD')&&text.includes('1.5 kg'));
 assert(!/99\.5|80|100%|50%|[%％]|匹配度|满足度/.test(text));assert.equal(m.totalScore,99.5);
 const unknown=describeRecommendation({product:{ram_gb:null,ssd_gb:null,weight_kg:null},dataCoverage:0});assert(!/0 GB|0 kg|流畅|畅玩/.test(unknown));
});
test('all selected labels still yield the same candidates, numeric scores and order as original old-category mapping',()=>{
 const rows=JSON.parse(fs.readFileSync(new URL('../src/data/catalog.json',import.meta.url),'utf8'));
 const p={...defaultRequirements(),budget:[2000,30000],scenarios:['documents','local-ai','modeling-3d','aaa-games'],priorities:PRIORITIES.map(p=>p.id)};
 const actual=rankForRequirements(rows,p);const expected=rankCatalog(rows,{budget:p.budget,os:'不限',scenarios:['办公学习','编程开发','设计创作','游戏娱乐'],priorities:['轻薄便携','大屏幕','高性价比']});
 assert.deepEqual(actual,expected);assert(actual.every(m=>! /[%％]|匹配度|满足度|\/100/.test(describeRecommendation(m))));
});
