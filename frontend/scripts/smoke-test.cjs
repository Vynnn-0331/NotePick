/* Optional browser QA: set NOTEPICK_PLAYWRIGHT_PATH to a Playwright package path,
   or install Playwright locally. Uses installed Chrome/Edge; no API requests. */
const { chromium } = require(process.env.NOTEPICK_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../src/data/catalog.json');
const { recommendCatalog: rankCatalog } = require('../src/services/recommendationEngine.js');
const scoringPrefs = {scenarios:['documents','basic-coding'],priorities:['portable']};
const showcase = rankCatalog(catalog, {...scoringPrefs,budget:[2500,16000],os:'macOS'}).slice(0,3).map(r=>r.product);

(async () => {
  const output = path.resolve('test-results');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.NOTEPICK_BROWSER || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [], externalRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:5173') && !req.url().startsWith('data:') && !(req.resourceType()==='image'&&req.url().startsWith('https://wjcc.mechrevo.com/'))) externalRequests.push(req.url()); });
  try {
    const response = await page.goto('http://127.0.0.1:5173');
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: 'Choose your laptop' }).waitFor();
    await page.screenshot({ animations: 'disabled', path: path.join(output, '01-home.png'), fullPage: true });
    await page.getByRole('link', { name: 'Start Recommendation' }).click();
    await page.getByRole('heading', { name: '先从你的需要开始。' }).waitFor();
    const low = page.getByRole('slider', { name: '最低预算' });
    const high = page.getByRole('slider', { name: '最高预算' });
    const track = await page.locator('.budget-slider').boundingBox();
    const x = amount => track.x + ((amount - 2000) / 28000) * track.width;
    await page.mouse.move(x(5000), track.y + 22);
    await page.mouse.down();
    await page.mouse.move(x(7000), track.y + 22, { steps: 12 });
    await page.mouse.up();
    assert.equal(await low.inputValue(), '7000', 'minimum endpoint must drag');
    await page.mouse.move(x(12000), track.y + 22);
    await page.mouse.down();
    await page.mouse.move(x(16000), track.y + 22, { steps: 12 });
    await page.mouse.up();
    assert.equal(await high.inputValue(), '16000', 'maximum endpoint must drag');
    await low.focus();
    await low.press('End');
    assert.equal(await low.inputValue(), '15500', 'endpoints cannot cross');
    await low.press('Home');
    assert.equal(await low.inputValue(), '2000');
    await low.press('ArrowRight');
    assert.equal(await low.inputValue(), '2500', 'keyboard slider step');
    await page.getByText('文档办公', { exact: true }).click();
    await page.getByText('基础编程', { exact: true }).click();
    await page.getByText('轻薄便携', { exact: true }).click();
    await page.getByText('macOS', { exact: true }).click();
    assert(await page.getByRole('checkbox', { name: '文档办公' }).isChecked());
    assert(await page.getByRole('checkbox', { name: '基础编程' }).isChecked());
    assert(await page.getByRole('radio', { name: 'macOS' }).isChecked());
    await page.screenshot({ animations: 'disabled', path: path.join(output, '02-requirements.png'), fullPage: true });
    await page.getByRole('button', { name: '生成推荐' }).click();
    await page.getByRole('heading', { name: '少一点纠结，多一点可能。' }).waitFor();
    assert.equal(await page.locator('.product-grid > a').count(), 3);
    assert.deepEqual(await page.locator('.product-grid > a').evaluateAll(nodes => nodes.map(n => n.getAttribute('href'))), showcase.map(p => `#/products/${p.id}`));
    assert.equal(await page.getByText(/^找到 \d+ 款，展示 \d+ 款$/).count(), 1);
    await page.screenshot({ animations: 'disabled', path: path.join(output, '03-recommendations.png'), fullPage: true });
    await page.getByRole('link', { name: '修改需求' }).click();
    assert.equal(await low.inputValue(), '2500');
    assert.equal(await high.inputValue(), '16000');
    assert(await page.getByRole('checkbox', { name: '基础编程' }).isChecked());
    await page.reload();
    assert(await page.getByRole('radio', { name: 'macOS' }).isChecked());
    await page.getByRole('button', { name: '生成推荐' }).click();
    await page.locator(`.product-grid a[href="#/products/${showcase[0].id}"]`).click();
    await page.getByRole('heading', { name: showcase[0].model, exact: true, level: 1 }).waitFor();
    await page.getByRole('heading',{name:'杭州国补预计到手价',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'查询最新价格',exact:true,includeHidden:true}).count(),1);
    assert.equal(await page.locator('.analysis-entry,.detail-comparison').count(),0);
    assert.equal(await page.getByRole('status').count(), 0);
    await page.screenshot({ animations: 'disabled', path: path.join(output, '04-product-detail.png'), fullPage: true });
    const relatedHref = await page.locator('.similar-grid a').first().getAttribute('href');
    const related = catalog.find(p => relatedHref === `#/products/${p.id}`);
    await page.locator('.similar-grid a').first().click();
    await page.getByRole('heading', { name: related.model, exact: true, level: 1 }).waitFor();
    assert.equal(await page.getByRole('status').count(), 0, 'product change clears placeholder feedback');
    await page.goBack();
    await page.getByRole('heading', { name: showcase[0].model, exact: true, level: 1 }).waitFor();
    await page.getByRole('link', { name: '返回推荐结果' }).click();
    for (const product of showcase.slice(1)) {
      await page.locator(`.product-grid a[href="#/products/${product.id}"]`).click();
      await page.getByRole('heading', { name: product.model, exact: true, level: 1 }).waitFor();
      await page.getByRole('link', { name: '返回推荐结果' }).click();
    }
    for (const product of showcase) {
      await page.goto(`http://127.0.0.1:5173/#/products/${product.id}`);
      await page.getByRole('heading', { name: product.model, exact: true, level: 1 }).waitFor();
      assert.equal(await page.getByRole('link', { name: '查看原始商品来源' }).getAttribute('href'), product.source_url);
      assert.equal(await page.locator('.specs-grid dd').nth(0).textContent(), product.cpu_model);
      assert.equal(await page.locator('.specs-grid dd').nth(1).textContent(), product.gpu_model ?? '未提供');
      assert.equal(await page.locator('.specs-grid dd').nth(2).textContent(), product.gpu_type);
    }
    const missingGpu = catalog.find(p => p.gpu_model === null);
    await page.goto(`http://127.0.0.1:5173/#/products/${missingGpu.id}`);
    await page.getByRole('heading', { level: 1, name: missingGpu.model, exact: true }).waitFor();
    assert.equal(await page.locator('.specs-grid dd').nth(1).textContent(), '未提供');
    assert(await page.getByRole('img', { name: '笔记本产品图片占位' }).count() > 0);
    const fractional = catalog.find(p => p.official_price_cny % 1 !== 0);
    await page.goto(`http://127.0.0.1:5173/#/products/${fractional.id}`);
    await page.getByRole('heading', { level: 1, name: fractional.model, exact: true }).waitFor();
    assert((await page.locator('.detail-reference strong').textContent()).includes('.88'), 'preserve original price cents');
    // Every catalog ID resolves to its own detail page, including same-model variants.
    for (const product of catalog) {
      await page.goto(`http://127.0.0.1:5173/#/products/${product.id}`);
      await page.getByRole('heading', { level: 1, name: product.model, exact: true }).waitFor();
      assert.equal(await page.locator('.specs-grid dd').nth(0).textContent(), product.cpu_model);
      assert.equal(await page.locator('.specs-grid dd').nth(3).textContent(), `${product.ram_gb} GB`);
      assert.equal(await page.locator('.specs-grid dd').nth(4).textContent(), `${product.ssd_gb} GB`);
      assert.equal(await page.locator('.specs-grid dd').nth(7).textContent(), product.os ?? '未提供');
      assert(!/[%％]|匹配度|满足度|\/100/.test((await page.locator('main').innerText()).replaceAll('15%','')));
      assert.equal(await page.getByRole('progressbar').count(),0);
    }
    // Real UI scenarios produce exactly 0/1/2/3 cards, without filling extras.
    const filterCases = [];
    for (const [minimum, maximum, count] of [[2000,2500,0],[5000,6000,1],[5000,6500,2],[5000,10000,3]]) {
      await page.goto('http://127.0.0.1:5173/#/requirements');
      await low.focus(); await low.press('Home');
      await high.focus(); await high.press('End');
      for (let i=0; i<(minimum-2000)/500; i++) await low.press('ArrowRight');
      await high.press('Home');
      for (let i=0; i<(maximum-minimum-500)/500; i++) await high.press('ArrowRight');
      await page.getByText('macOS',{exact:true}).click();
      await page.getByRole('button',{name:'生成推荐'}).click();
      await page.getByText(/^找到 \d+ 款，展示 \d+ 款$/).waitFor();
      assert.equal(await page.locator('.product-grid > a').count(),count);
      const expected = rankCatalog(catalog,{...scoringPrefs,os:'macOS',budget:[minimum,maximum]}).slice(0,3).map(r=>r.product);
      assert.deepEqual(await page.locator('.product-grid > a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),expected.map(p=>`#/products/${p.id}`));
      if (!count) {
        await page.getByText('没有符合当前硬性条件的电脑',{exact:true}).waitFor();
        assert.equal(await page.locator('.comparison-section').count(),0);
        await page.getByRole('link',{name:'返回修改条件'}).click();
      } else await page.getByRole('link',{name:'修改需求'}).click();
      assert.equal(await low.inputValue(),String(minimum));
      assert.equal(await high.inputValue(),String(maximum));
      assert(await page.getByRole('checkbox',{name:'基础编程'}).isChecked());
      filterCases.push({ minimum, maximum, os:'macOS', displayed:count });
    }
    // An empty-GPU integrated record really appears for a Windows budget.
    await page.getByText('Windows',{exact:true}).click();
    await page.getByRole('button',{name:'生成推荐'}).click();
    const winExpected=rankCatalog(catalog,{...scoringPrefs,os:'Windows',budget:[5000,10000]}).slice(0,3).map(r=>r.product);
    assert.deepEqual(await page.locator('.product-grid > a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),winExpected.map(p=>`#/products/${p.id}`));
    assert(winExpected.some(p=>p.gpu_model===null && p.gpu_type==='集成显卡'));
    const scoredReasons=await page.locator('.product-grid .product-reason').allTextContents();
    assert(scoredReasons.every(reason=>reason.length>0 && !reason.includes('符合已设硬性条件') && !/[%％]|匹配度|满足度|\/100/.test(reason)));
    await page.getByRole('link',{name:'修改需求'}).click();
    await page.getByText('文档办公',{exact:true}).click();
    await page.getByText('基础编程',{exact:true}).click();
    await page.getByText('主流游戏',{exact:true}).click();
    assert.equal(await page.getByRole('checkbox',{name:/长续航/}).count(),0);
    await page.getByRole('button',{name:'生成推荐'}).click();
    const gamePrefs={budget:[5000,10000],os:'Windows',scenarios:['mainstream-games'],priorities:['portable']};
    const gameExpected=rankCatalog(catalog,gamePrefs).slice(0,3).map(r=>r.product);
    assert.deepEqual(await page.locator('.product-grid > a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href'))),gameExpected.map(p=>`#/products/${p.id}`));
    assert(!(await page.locator('main').innerText()).includes('长续航'));
    assert(!/[%％]|匹配度|满足度|\/100/.test((await page.locator('main').innerText()).replaceAll('15%','')));
    assert((await page.locator('.product-reason').evaluateAll(ns=>ns.map(n=>n.title))).every(t=>! /[%％]|匹配度|满足度|\/100/.test(t)));
    // Isolated component harness: no data files or production product objects changed.
    const imagePage = await browser.newPage();
    await imagePage.goto('http://127.0.0.1:5173/');
    await imagePage.locator('h1').waitFor();
    await imagePage.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default;
      const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
      const createRoot = dom.createRoot ?? dom.default.createRoot;
      const ProductImage = (await import('/src/components/ProductImage.jsx')).default;
      const host = document.createElement('div'); host.id = 'qa-image'; document.body.append(host);
      window.qaImageRoot = createRoot(host);
      window.qaImageRender = image => window.qaImageRoot.render(React.createElement(ProductImage, { image, name: 'QA image' }));
      window.qaImageRender('/favicon.svg');
    });
    await imagePage.waitForFunction(() => !!document.querySelector('#qa-image .laptop-placeholder'));
    assert.equal(await imagePage.locator('#qa-image img').count(),0);
    await imagePage.close();
    const responsive = [];
    for (const width of [390, 768, 1366]) {
      await page.setViewportSize({ width, height: 844 });
      for (const route of ['/', '/requirements', '/recommendations', `/products/${showcase[0].id}`]) {
        await page.goto(`http://127.0.0.1:5173/#${route}`);
        await page.locator('h1').waitFor();
        const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert(!hasOverflow, `horizontal overflow at ${width}px ${route}`);
        responsive.push({ width, route, horizontalOverflow: false });
        if (width === 390) await page.screenshot({ animations: 'disabled', path: path.join(output, `mobile-${route.replaceAll('/', '-').replace(/^-|-$/g, '') || 'home'}.png`), fullPage: true });
      }
    }
    await page.goto('http://127.0.0.1:5173/#/products/not-a-product');
    await page.getByRole('heading', { name: '这个页面暂时不在这里。' }).waitFor();
    assert.deepEqual(errors, [], 'browser console must be clean');
    assert.deepEqual(externalRequests, [], 'no unexpected external API or image requests');
    const report = { status: 'passed', browser: 'Installed Chrome, headless',
      checks: ['four pages and hash routes', '3B real scored order and explanation', 'scenario switches preserve hard limits; battery remains unassessed', 'real budget/OS filtering with 0/1/2/3 cards and empty-state return', 'Windows empty-GPU integrated products included', 'both budget endpoints drag', 'slider keyboard and crossing constraint', 'multi-select and OS selection', 'preferences survive return and refresh', 'three product cards', 'similar product navigation', 'back navigation', 'commerce controls are idle until user click', 'unknown product recovery', 'no console errors', 'no unexpected external requests', '78 real product IDs, variant specs and Excel OS values', 'source links and GPU types', 'null fields, optional image rendering and failed-image placeholder fallback', 'fractional CNY prices preserved'], filterCases, responsive };
    fs.writeFileSync(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });


