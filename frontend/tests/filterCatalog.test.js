import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterCatalog, visibleResults } from '../src/services/filterCatalog.js';
const row = (id, price, os = 'Windows', extra = {}) => ({ id, official_price_cny: price, os, ...extra });
const prefs = (low = 5000, high = 10000, os = '不限') => ({ budget: [low, high], os });

test('budget includes both endpoints and excludes lower/upper violations', () => {
 const rows = [row('a',4999.99),row('b',5000),row('c',10000),row('d',10000.01)];
 assert.deepEqual(filterCatalog(rows,prefs()).map(p=>p.id), ['b','c']);
 assert.equal(filterCatalog(rows,prefs(5000,5000)).length,1);
});
test('Windows and macOS require explicit exact source OS; unknown is excluded', () => {
 const rows=[row('w',6000),row('m',6000,'macOS'),row('n',6000,null),row('h',6000,'HarmonyOS')];
 assert.deepEqual(filterCatalog(rows,prefs(5000,10000,'Windows')).map(p=>p.id),['w']);
 assert.deepEqual(filterCatalog(rows,prefs(5000,10000,'macOS')).map(p=>p.id),['m']);
 assert.equal(filterCatalog(rows,prefs()).length,4);
});
test('integrated GPU with null model participates normally', () => {
 const rows=[row('integrated',6000,'Windows',{gpu_model:null,gpu_type:'集成显卡'})];
 assert.equal(filterCatalog(rows,prefs(5000,7000,'Windows')).length,1);
});
test('zero, one, two, three and more matches show actual count capped at three', () => {
 for (const count of [0,1,2,3,4,8]) {
  const rows=Array.from({length:count},(_,i)=>row(String(i),6000));
  assert.deepEqual(visibleResults(rows,prefs()).map(p=>p.id), rows.slice(0,3).map(p=>p.id));
 }
});
test('returning with changed budget recomputes; no padding or ranking', () => {
 const rows=[row('high',9000),row('low',5500),row('middle',7000)];
 assert.deepEqual(visibleResults(rows,prefs(5000,6000)).map(p=>p.id),['low']);
 assert.deepEqual(visibleResults(rows,prefs(7000,10000)).map(p=>p.id),['high','middle']);
});
test('tags do not influence results; frozen input is not mutated', () => {
 const rows=Object.freeze([Object.freeze(row('a',6000)),Object.freeze(row('b',7000))]);
 const before=JSON.stringify(rows);const options=Object.freeze({...prefs(), scenarios:['游戏娱乐'],priorities:['长续航']});
 assert.deepEqual(filterCatalog(rows,options),filterCatalog(rows,prefs()));
 assert.equal(JSON.stringify(rows),before);
 assert.notEqual(filterCatalog(rows,options),rows);
});
test('missing, invalid or nonnumeric price is not free and cannot pass', () => {
 const rows=[null,undefined,NaN,Infinity,-1,0,'6000'].map((p,i)=>row(String(i),p));
 assert.deepEqual(filterCatalog(rows,prefs(0,10000)),[]);
 assert.deepEqual(filterCatalog([row('x',6000)],{budget:[10000,5000]}),[]);
});
test('real catalog: 78 preserved, all 40 empty integrated GPU models are eligible', () => {
 const rows=JSON.parse(readFileSync(new URL('../src/data/catalog.json',import.meta.url),'utf8'));
 const result=filterCatalog(rows,prefs(0,100000));
 assert.equal(result.length,78);
 assert.equal(result.filter(p=>p.gpu_model===null && p.gpu_type==='集成显卡').length,40);
 assert.equal(filterCatalog(rows,prefs(0,100000,'Windows')).length,62);
 assert.equal(filterCatalog(rows,prefs(0,100000,'macOS')).length,16);
});
