import test from 'node:test';import assert from 'node:assert/strict';import {referencePrices} from '../referencePrices.mjs';
test('missing prices stay empty',()=>assert.deepEqual(referencePrices('32GB 2TB RTX5060'),[]));
test('multiple prices never become one lowest quote',()=>{const r=referencePrices('16GB售价5999元；32GB售价6999元');assert.deepEqual(r.map(x=>x.value),[5999,6999]);});
test('conditions and original evidence are retained',()=>{const r=referencePrices('国补后售价￥5,999');assert.equal(r[0].value,5999);assert.match(r[0].conditions,/优惠/);assert.match(r[0].excerpt,/国补/);});

import {isJdProductUrl} from '../referencePrices.mjs';
test('only JD merchant product pages survive',()=>{for(const u of ['https://item.jd.com/100123456789.html','https://item.m.jd.com/product/100123456789.html'])assert(isJdProductUrl(u));for(const u of ['https://dir.jd.com/guide/test','https://www.jd.com/jiage/test.html','https://search.jd.com/Search?keyword=test','https://item.jd.com.evil.com/100123456789.html','https://item.jd.com/article.html'])assert(!isJdProductUrl(u));});
