import fs from 'node:fs';
import {recommendCatalog} from '../src/services/recommendationEngine.js';
import {buildRecommendationComparison} from '../src/services/recommendationComparison.js';
import {defaultRequirements} from '../src/services/requirements.js';
const root=new URL('../../',import.meta.url),catalog=JSON.parse(fs.readFileSync(new URL('frontend/src/data/catalog.json',root)));
const cases=[
 {name:'办公 · 经济实惠',scenarios:['documents'],priorities:['value']},
 {name:'大型项目编程 · 多开流畅',scenarios:['large-projects'],priorities:['memory']},
 {name:'3D建模 · 轻薄便携',scenarios:['modeling-3d'],priorities:['portable']},
 {name:'主流游戏 · 游戏畅玩',scenarios:['mainstream-games'],priorities:['gpu-power']},
 {name:'大型开发＋主流游戏 · 便携和内存',scenarios:['large-projects','mainstream-games'],priorities:['portable','memory']},
].map(c=>{const input={...defaultRequirements(),budget:[5000,20000],scenarios:c.scenarios,priorities:c.priorities};const selected=recommendCatalog(catalog,input).slice(0,3);const descriptions=buildRecommendationComparison(selected,input);return {name:c.name,input,ids:selected.map(m=>m.product.id),products:selected.map((m,i)=>({id:m.product.id,name:m.product.model,configuration:{cpu:m.product.cpu_model,gpu:m.product.gpu_model,gpuType:m.product.gpu_type,price:m.product.official_price_cny,ram:m.product.ram_gb,ssd:m.product.ssd_gb,weight:m.product.weight_kg,screen:m.product.screen_inches,os:m.product.os},...descriptions[i]}))};});
const report={stage:'3C presentation only',unchanged:'3B数量、ID、顺序完全沿用；不调用推荐API或重新评分',cases};
const md=['# NotePick 3C：五组真实结果与差异说明','','仅解释3B既有前三；不换商品、不调序、不补足结果。差异只在其他已展示商品相关值全部已知、且严格更优时表述；性能比较只复用既有同口径证据。无明确优势时中性展示，未知不是零。','','## 主要改动','','推荐卡片增加简短配置说明、最多两项相对优势与两项注意事项；依据用户已选偏好先解释相应差异。原始3B理由与完整限制保留在已有对比区域的折叠说明，并在当前推荐项详情页复用。非本次推荐项的详情不虚构比较上下文。','','## 五组实例'];
for(const c of cases){md.push('',`### ${c.name}`,'',`条件：${JSON.stringify(c.input)}`,'');for(const [i,p] of c.products.entries()){md.push(`#### ${i+1}. ${p.name}`,`ID：${p.id}`,`已知配置：${JSON.stringify(p.configuration)}`,'',p.summary,p.fitDescription??'',...p.advantages.map(a=>'- 优势：'+a.text),p.neutral??'',...p.cautions.map(s=>'- 注意：'+s),'','原始依据与完整限制（网页可展开）：',...[...new Set([...p.originalReasons,...p.originalWarnings])].map(s=>'- '+s));}}
md.push('','## 核验方式','','phase3c_baseline.json在3C修改前保存111组3B输入及全部合格商品ID、顺序、内部效用，以及18个受保护文件的SHA256。测试逐组核对，含12用途×无偏好/7偏好、原14组和全选组合。3C输出只映射已选三款，不返回新商品、不调用排序函数、不写入match。','', '重建：`node frontend/scripts/phase3c-report.mjs`。当前3B报告仍为recommendation_cases_v3，3C文件只说明展示差异。');
fs.writeFileSync(new URL('data/processed/phase3c_examples.json',root),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(new URL('data/processed/phase3c_examples.md',root),md.join('\n')+'\n');console.log(JSON.stringify(cases.map(c=>({case:c.name,products:c.products.map(p=>({name:p.name,advantages:p.advantages.map(a=>a.text),neutral:p.neutral}))})),null,2));
