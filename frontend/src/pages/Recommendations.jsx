import {buildRecommendationCardCopy} from '../services/recommendationCardCopy';
import {buildRecommendationComparison} from '../services/recommendationComparison';
import { selectedLabels,hardRequirementLabels } from '../services/requirements';
import ProductCard from '../components/ProductCard';
import { Arrow } from '../components/Icons';
import { getRankedProducts, money } from '../data/products';

export default function Recommendations({ preferences }) {
  const filtered = getRankedProducts(preferences);
  const recommendations = filtered.slice(0, 3);
  const comparisons = buildRecommendationComparison(recommendations.map(p => p.match), preferences);
  const cardCopies = comparisons.map((c,i)=>buildRecommendationCardCopy(c,recommendations[i].match,preferences));
  return <section className="recommendations-page page-width">
    <div className="page-intro"><div><span className="eyebrow">02 / THE SHORTLIST</span><h1>少一点纠结，多一点可能。</h1></div><a className="text-link" href="#/requirements"><Arrow direction="left" /> 修改需求</a></div>
    <div className="results-context"><div className="need-summary"><span>{money(preferences.budget[0])} — {money(preferences.budget[1])}</span><span>{preferences.os === '不限' ? '系统不限' : preferences.os}</span>{[...selectedLabels(preferences), ...hardRequirementLabels(preferences)].map(item => <span key={item}>{item}</span>)}</div></div>
    {recommendations.length === 0 ? <div className="requirements-panel" role="status"><h2>{preferences.scenarios.length ? "没有符合当前硬性条件的电脑" : "请先选择至少一个使用场景"}</h2><p className="detail-description">调整预算、系统或配置条件，看看其他选择。</p><a className="text-link" href="#/requirements">返回修改条件 <Arrow direction="left" /></a></div> : <><div className="product-grid">{recommendations.map((product, i) => <ProductCard key={product.id} product={product} comparison={comparisons[i]} cardCopy={cardCopies[i]} />)}</div>
    <section className="comparison-section" aria-labelledby="comparison-title"><div className="section-heading"><h2 id="comparison-title">放在一起，看得更清楚。</h2><span>基础参数 · 导入数据</span></div>
      <div className="comparison-scroll" tabIndex="0" role="region" aria-label="筛选产品参数对比，可横向滚动"><table><thead><tr><th scope="col">参数对比</th>{recommendations.map(p => <th key={p.id} scope="col">{p.name}</th>)}</tr></thead><tbody>{[['ram', '内存'], ['ssd', '存储'], ['screen', '屏幕'], ['weight', '重量']].map(([key, title]) => <tr key={key}><th scope="row">{title}</th>{recommendations.map(p => <td key={p.id}>{p.specs[key]}</td>)}</tr>)}</tbody></table></div>
    </section></>}
  </section>;
}
