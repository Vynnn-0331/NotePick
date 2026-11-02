// Unverified amounts from one search result, isolated from comparable quotes.
export function referencePrices(text){
 const rows=[],seen=new Set();
 const pattern=/(?:[¥￥]\s*(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*元)/g;
 for(const m of String(text??'').matchAll(pattern)){
  const value=Number((m[1]??m[2]).replaceAll(',',''));if(value<1000||value>100000||seen.has(value))continue;
  const excerpt=String(text).slice(Math.max(0,m.index-45),m.index+m[0].length+65).replace(/\s+/g,' ');
  // Instalments are not laptop purchase prices.
  if(/月供|每月|分期每期/.test(excerpt))continue;
  seen.add(value);rows.push({value,excerpt,conditions:/国补|补贴|券后|优惠券|会员|学生|以旧换新/.test(excerpt)?'含优惠条件，资格与金额待确认':/元起|起售|起价/.test(excerpt)?'可能为起售价，具体配置待确认':/历史|曾售|首发|发布价/.test(excerpt)?'可能为历史或发布价格':'配置与价格日期待确认'});
 }
 return rows.slice(0,5);
}

// Only JD product-detail pages, never guides, search lists or category pages.
export function isJdProductUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&((u.hostname==='item.jd.com'&&/^\/\d{5,}\.html$/.test(u.pathname))||(u.hostname==='item.m.jd.com'&&/^\/product\/\d{5,}\.html$/.test(u.pathname)));}catch{return false;}}
