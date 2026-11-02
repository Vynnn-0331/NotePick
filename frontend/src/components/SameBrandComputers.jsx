import {useState} from 'react';
import {getCatalog} from '../services/catalog';
import {selectSameBrandComputers} from '../services/sameBrandComputers';
import {money} from '../data/products';
export default function SameBrandComputers({requirements,rankedMatches}){
 const snapshot=JSON.stringify({requirements,ids:rankedMatches.map(m=>m.product.id)}),[opened,setOpened]=useState(null),visible=opened===snapshot;
 const choices=visible?selectSameBrandComputers(getCatalog(),requirements,rankedMatches):[];
 const fields=p=>[p.cpu_model??'CPU具体型号未提供',p.gpu_model??p.gpu_type,p.ram_gb?`${p.ram_gb}GB内存`:null,p.ssd_gb?`${p.ssd_gb}GB SSD`:null].filter(Boolean).join(' · ');
 return <section className="same-brand-computers online-discovery detail-panel" aria-labelledby="same-brand-title"><div className="section-heading"><div><h2 id="same-brand-title">同品牌其他电脑</h2><p className="ai-note">看看同品牌的其他型号。</p></div><button className="outline-button" type="button" onClick={()=>setOpened(snapshot)} disabled={!requirements.scenarios.length}>查看同品牌其他电脑</button></div>
 {visible&&(choices.length?<div className="discovery-grid">{choices.map(({product:p,reason})=><article className="brand-alternative external-product" key={p.id} data-product-id={p.id}><span className="eyebrow">{p.brand}</span><h3>{p.model}</h3><strong>官网参考价 {money(p.official_price_cny)}</strong><p className="ai-note">{fields(p)}</p><p className="ai-note">{reason}</p><a href={'#/products/'+p.id}>查看详情 →</a></article>)}</div>:<p role="status">暂无符合条件的同品牌其他电脑</p>)}
 </section>;
}
