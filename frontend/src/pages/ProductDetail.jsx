import {PriceAndSubsidy} from '../components/CommercePanels';
import { Arrow } from '../components/Icons';
import HardwareAnalysis from '../components/HardwareAnalysis';
import ProductImage from '../components/ProductImage';
import {getCatalog} from '../services/catalog';
import {selectDetailSameBrandComputers} from '../services/sameBrandComputers';
import { money, specLabels } from '../data/products';

const configLabels={...specLabels,cpu:'处理器',gpu:'显卡',gpuType:'显卡类型',ssd:'存储'};

export default function ProductDetail({ product, preferences }) {
  const similar = selectDetailSameBrandComputers(getCatalog(),preferences,product.id);
  return <section className="detail-page">
    <div className="detail-topbar"><a className="text-link" href="#/recommendations"><Arrow direction="left" /> 返回推荐结果</a><span className="eyebrow">03 / A CLOSER LOOK</span></div>
    <div className="detail-layout">
      <aside className="detail-product"><ProductImage productId={product.id} image={product.image} name={product.name} /><span className="eyebrow">{product.brand} / {product.category}</span><h1>{product.name}</h1><div className="detail-reference"><span>官网参考价</span><strong>{money(product.price)}</strong></div>{product.sourceUrl && <a className="text-link" href={product.sourceUrl} target="_blank" rel="noopener noreferrer">查看原始商品来源 <Arrow /></a>}</aside>
      <div className="detail-content">
        <section className="detail-panel specs-panel"><div className="section-heading"><h2>商品详细配置与性能分析</h2><span>基础配置</span></div><dl className="specs-grid">{['cpu','gpu','ram','ssd','screen','weight','os','gpuType'].map(key=>[key,product.specs[key]]).map(([key, value]) => <div key={key}><dt>{configLabels[key]}</dt><dd>{value}</dd></div>)}</dl>
          <HardwareAnalysis requirements={preferences} targetProductId={product.id} />
        </section>
        <PriceAndSubsidy key={product.id} product={product} />
        <section className="detail-panel similar-panel"><div className="section-heading"><h2>同品牌其他型号</h2></div><div className="similar-grid">{similar.map(({product:p,reason}) => <article className="external-product" key={p.id} data-product-id={p.id}><span className="eyebrow">{p.brand}</span><h3>{p.model}</h3><strong>官网参考价 {money(p.official_price_cny)}</strong><p className="ai-note">{[p.cpu_model,p.gpu_model??p.gpu_type,p.ram_gb?`${p.ram_gb}GB内存`:null,p.ssd_gb?`${p.ssd_gb}GB SSD`:null].filter(Boolean).join(' · ')}</p><p className="ai-note">{reason}</p><a href={"#/products/"+p.id}>查看详情 →</a></article>)}</div>{similar.length<3&&<p className="ai-note" role="status">{similar.length?`当前符合条件的同品牌其他型号共${similar.length}款，已全部展示。`:'暂无符合条件的同品牌其他电脑'}</p>}</section>
      </div>
    </div>
  </section>;
}
