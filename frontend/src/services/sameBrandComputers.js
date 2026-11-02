import {filterCatalog} from './filterCatalog.js';
import {recommendCatalog} from './recommendationEngine.js';
const tidy=s=>String(s??'').replace(/™|®/g,'').normalize('NFKC').toLowerCase().replace(/[\s()（）_\-·]/g,'');
const aliases={apple:['apple','苹果','苹果apple'],联想:['联想','lenovo','联想lenovo','lenovo联想'],华硕:['华硕','asus','华硕asus','asus华硕'],惠普:['惠普','hp','惠普hp','hp惠普'],华为:['华为','huawei','华为huawei','huawei华为'],戴尔:['戴尔','dell','戴尔dell','dell戴尔'],机械革命:['机械革命','mechrevo','机械革命mechrevo','mechrevo机械革命']};
export function normalizedBrand(value){const key=tidy(value);return Object.entries(aliases).find(([,names])=>names.includes(key))?.[0]??key;}
function modelText(value){return tidy(value).replace(/lenovo|联想|asus|华硕|apple|苹果|dell|戴尔|mechrevo|机械革命|huawei|华为|惠普|\bhp\b/g,'').replace(/外星人/g,'alienware').replace(/英寸|笔记本电脑|笔记本|电脑|官方旗舰店|旗舰店|官方|京东|天猫|商城/g,'').replace(/(小新|无界|无畏|无双|灵耀|耀世)(pro|air|se)(\d+(?:\.\d)?)/g,'$1$3$2');}
export function laptopIdentity(product){
 const text=modelText(product.model??product.name),year=text.match(/20\d{2}/)?.[0]??null;
 // CPU, RAM/SSD, colour and different seller SKUs never create a distinct chassis identity.
 const key=text.match(/macbook(?:air|pro)(?:\d{2}(?:\.\d)?)?|macbookneo|thinkbook\d{2}(?:\+|p)?|thinkpad[a-z]\d{2}[a-z]?|yoga(?:air|pro)\d{2}(?:ultra)?|小新\d{2}(?:\.\d)?(?:air|pro)?|(?:无界|无畏|无双)\d{2}(?:pro|se)?|灵耀\d{2}(?:air)?|(?:星耀|苍龙|耀世|蛟龙|翼龙)\d{2}(?:pro|air|ultra|x|se)?|天选(?:air|\d+(?:pro)?)|a豆\d{2}(?:air)?|(?:rog)?(?:魔霸|枪神)\d+(?:plus)?|拯救者y\d{4}[a-z]?|星book(?:proair|pro|ultra|air|x360)?\d{2}|战66(?:[一二三四五六七八九十]+代)?\d{2}|(?:战x|锐)\d{2}|(?:hi)?matebook(?:d)?\d{2}|alienware\d{2}area51|xps\d{2}|^\d{2}s?$|恒悦e\d{2}g\d+/)?.[0];
 const fallback=text.replace(/20\d{2}/g,'').split(/酷睿|锐龙|core|ryzen|高性能|轻薄|旗舰|游戏本|\d+gb|\d+tb/)[0].replace(/[,:：、]/g,'');
 const series=modelText(product.series);
 return {brand:normalizedBrand(product.brand),key:key??(fallback.length>=3?fallback:null),recognized:!!key,series,year,sku:tidy(product.sku??product.sku_code??product.skuCode??'')};
}
export function sameLaptopModel(a,b){
 const x=laptopIdentity(a),y=laptopIdentity(b);if(!x.brand||x.brand!==y.brand)return false;
 if(x.sku&&y.sku&&x.sku===y.sku)return true;
 if(!x.key||!y.key)return !!x.series&&x.series===y.series;
 if(x.key===y.key){if(x.year&&y.year&&x.year!==y.year)return false;return true;}
 // Missing screen size / abbreviated model: conservative exclusion, not a claim of exact equivalence.
 if((!x.recognized||!y.recognized||/^(?:macbookair|macbookpro)$/.test(x.key)||/^(?:macbookair|macbookpro)$/.test(y.key))&&x.key.length>=5&&y.key.length>=5&&(x.key.includes(y.key)||y.key.includes(x.key)))return true;
 if((!x.recognized||!y.recognized)&&x.series&&x.series===y.series)return true;
 return false;
}
const known=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
export function sameBrandReason(product,reference,requirements){
 const p=product,r=reference,priorities=requirements.priorities??[],scenarios=requirements.scenarios??[];let feature='';
 if(priorities.includes('portable')&&known(p.weight_kg))feature=`重量${p.weight_kg}kg，${known(r.weight_kg)&&p.weight_kg<r.weight_kg?'比参考机型更轻，':''}可结合日常携带频率选择。`;
 else if((priorities.includes('memory')||scenarios.some(s=>['large-projects','local-ai','modeling-3d','video-editing'].includes(s)))&&known(p.ram_gb))feature=`${p.ram_gb}GB内存，可作为多任务和项目工作时的容量选择。`;
 else if(priorities.includes('storage')&&known(p.ssd_gb))feature=`${p.ssd_gb>=1024?p.ssd_gb/1024+'TB':p.ssd_gb+'GB'} SSD，可用于存放软件、项目和素材。`;
 else if(priorities.includes('large-screen')&&known(p.screen_inches))feature=`${p.screen_inches}英寸屏幕，适合希望增加显示空间的用户。`;
 else if(priorities.includes('value')&&known(p.official_price_cny)&&known(r.official_price_cny)&&p.official_price_cny<r.official_price_cny)feature='官网参考价比参考机型低，可减少购机支出。';
 else if(known(p.screen_inches)&&known(r.screen_inches)&&p.screen_inches!==r.screen_inches)feature=`${p.screen_inches}英寸屏幕，提供${p.screen_inches>r.screen_inches?'更大的显示空间':'不同尺寸的选择'}。`;
 else if(known(p.ram_gb))feature=`${p.ram_gb}GB内存，${scenarios.some(s=>['documents','online-study','basic-coding'].includes(s))?'可用于同时打开文档、网页和工作软件':'可结合常用软件的容量需求选择'}。`;
 let tradeoff='';if(known(p.official_price_cny)&&known(r.official_price_cny)&&p.official_price_cny>r.official_price_cny)tradeoff='参考价较高，需权衡额外支出。';else if(known(p.weight_kg)&&known(r.weight_kg)&&p.weight_kg>r.weight_kg)tradeoff='机身更重，携带时需要取舍。';
 return `与${reference.brand}参考机型同品牌、不同型号。${feature}${tradeoff}`;
}
export function selectSameBrandComputers(catalog,requirements,rankedMatches,limit=3){
 if(!Array.isArray(catalog)||!requirements?.scenarios?.length||!Number.isInteger(limit)||limit<1)return [];
 const eligible=filterCatalog(catalog,requirements),byId=new Map(eligible.map(p=>[p.id,p]));
 const ranked=rankedMatches??recommendCatalog(catalog,requirements),ids=ranked.map(m=>m.product.id),top=ids.slice(0,3).map(id=>byId.get(id)).filter(Boolean);
 const order=new Map(ids.map((id,i)=>[id,i])),pool=[...eligible].sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity)||String(a.id).localeCompare(String(b.id),'en'));
 const brands=[...new Set(top.map(p=>normalizedBrand(p.brand)).filter(Boolean))],excluded=new Set(top.map(p=>p.id));
 for(const brand of brands){const reference=top.find(p=>normalizedBrand(p.brand)===brand),out=[];
  for(const p of pool){if(normalizedBrand(p.brand)!==brand||excluded.has(p.id)||!laptopIdentity(p).key||top.some(t=>sameLaptopModel(t,p))||out.some(t=>sameLaptopModel(t.product,p)))continue;
   out.push({product:p,reference,reason:sameBrandReason(p,reference,requirements)});if(out.length>=Math.min(3,limit))break;
  }
  // A brand with one or two valid models is sufficient; do not fill from lower-priority brands.
  if(out.length)return out;
 }
 return [];
}

// Detail-page alternatives are anchored to the viewed product, never another shortlist brand.
export function selectDetailSameBrandComputers(catalog,requirements,currentProductId,limit=3){
 if(!Array.isArray(catalog)||!Number.isInteger(limit)||limit<1)return [];
 const reference=catalog.find(p=>p.id===currentProductId);if(!reference||!normalizedBrand(reference.brand))return [];
 const ranked=catalog.map(product=>({product})),allowed=new Set(catalog.map(p=>p.id)),excluded=[reference],out=[];
 const completeness=p=>[p.cpu_model,p.gpu_model??p.gpu_type,p.ram_gb,p.ssd_gb,p.screen_inches,p.weight_kg,p.os].filter(v=>v!==null&&v!==undefined&&v!=='').length;
 const candidates=[...ranked].sort((a,b)=>completeness(b.product)-completeness(a.product));
 for(const {product:p} of candidates){if(!allowed.has(p.id)||normalizedBrand(p.brand)!==normalizedBrand(reference.brand)||!laptopIdentity(p).key||excluded.some(t=>t.id===p.id||sameLaptopModel(t,p))||out.some(t=>sameLaptopModel(t.product,p)))continue;
  out.push({product:p,reference,reason:sameBrandReason(p,reference,{priorities:[],scenarios:[]})});if(out.length>=Math.min(3,limit))break;
 }
 return out;
}
