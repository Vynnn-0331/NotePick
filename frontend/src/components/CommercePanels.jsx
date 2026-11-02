import {money} from '../data/products';
import policy from '../data/hangzhouPolicy.json';
import {estimateHangzhouSubsidy,resolveSubsidyPrice} from '../services/hangzhouSubsidy';
export function PriceAndSubsidy({product}){
 const resolved=resolveSubsidyPrice({product,chosen:'reference',quotes:[]}),estimate=estimateHangzhouSubsidy(resolved.price,{...resolved.eligibility,basis:resolved.basis});
 const query=[product.brand,product.name,product.raw.cpu_model,product.raw.gpu_model,product.raw.ram_gb?product.raw.ram_gb+'GB内存':null,product.raw.ssd_gb?product.raw.ssd_gb+'GB SSD':null].filter(Boolean).join(' '),encoded=encodeURIComponent(query);
 const platforms=[{name:'京东',url:'https://search.jd.com/Search?keyword='+encoded},{name:'淘宝',url:'https://s.taobao.com/search?q='+encoded},{name:'天猫',url:'https://list.tmall.com/search_product.htm?q='+encoded}];
 return <div className="commerce-modules aligned-commerce multi-commerce compact-commerce">
 <section className="detail-panel compact-price-panel"><h2>杭州国补预计到手价</h2><strong className="subsidy-total">{money(estimate.total)}</strong><p className="price-baseline">计算基准：{resolved.sourceLabel} {money(resolved.price)}</p><p className="ai-note">预计补贴 {money(estimate.subsidy)} · 15% · 每件上限1500元</p><p className="ai-note">{estimate.status==='ineligible'?'已知不符合条件，不计算补贴':estimate.status==='eligible'?'商品渠道已核实，个人资格和名额待确认':'预计价格，补贴资格待确认'}。参考价非成交价；须满足杭州当期商品、渠道及申领条件。</p><details className="policy-details commerce-policy-footer"><summary>官方政策来源</summary><ul>{policy.sources.map(s=><li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></li>)}</ul></details></section>
 <section className="detail-panel network-price-panel"><h2>多平台比价</h2><p className="ai-note">前往平台查看当前机型的商品与价格。</p><nav className="platform-shortcuts" aria-label="电商平台价格入口">{platforms.map(platform=><a className="outline-button platform-search-link" key={platform.name} href={platform.url} target="_blank" rel="noopener noreferrer">{platform.name} ↗</a>)}</nav><p className="ai-note commerce-policy-footer">以上为搜索入口，具体配置与售价以商家页面为准。</p></section></div>;
}
