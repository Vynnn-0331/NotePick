import RecommendationCardDetails from './RecommendationCardDetails';
import { Arrow } from './Icons';
import ProductImage from './ProductImage';
import { money } from '../data/products';

export default function ProductCard({ product, compact = false, comparison, cardCopy }) {
  return <a href={`#/products/${product.id}`} className={`product-card ${compact ? 'small-card' : ''}`} aria-label={`查看 ${product.name} 详情`}>
    <ProductImage productId={product.id} image={product.image} name={product.name} compact={compact} />
    <div className="product-card-copy">
      <span className="eyebrow">{product.brand} <span>{product.match ? '· 条件匹配' : '· 数据展示'}</span></span>
      <h2>{product.name}</h2>
      {!compact && cardCopy && <div className="card-core-specs"><p className="chip-spec"><span className="card-spec-label">CPU</span><span>{product.specs.cpu}</span></p><p className="chip-spec"><span className="card-spec-label">GPU</span><span>{product.raw.gpu_model ?? (product.raw.gpu_type === '集成显卡' ? '集成显卡 · 具体型号未提供' : 'GPU型号未提供')}</span></p><p>{product.specs.ram} 内存 · {product.specs.ssd} SSD</p></div>}
      {!compact && !cardCopy && <p className="product-reason">{cardCopy?.description ?? comparison?.summary ?? product.reason}</p>}
      {!compact && cardCopy && <RecommendationCardDetails copy={cardCopy} />}
      <div className="product-card-bottom"><div><span className="price-label">官网参考价</span><strong>{money(product.price)}</strong></div><span className="card-detail-entry">{!compact && cardCopy && <span>查看详情</span>}<span className="card-arrow"><Arrow /></span></span></div>
    </div>
  </a>;
}
