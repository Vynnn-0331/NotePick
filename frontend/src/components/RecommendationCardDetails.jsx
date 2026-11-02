export default function RecommendationCardDetails({copy}){
 if(!copy)return null;
 return <div className="recommendation-card-details">
  {copy.advantages.length>0?<div className="choice-group"><span className="choice-heading">主要优势</span><ul>{copy.advantages.map(a=><li key={a.kind}><strong className="advantage-title">{a.title}</strong><p className="advantage-description">{a.description}</p></li>)}</ul></div>:<div className="choice-group"><span className="choice-heading">配置特点</span><p className="choice-neutral">{copy.neutral}</p></div>}
 </div>;
}
