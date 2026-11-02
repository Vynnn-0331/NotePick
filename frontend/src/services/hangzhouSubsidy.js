// Conditional Hangzhou arithmetic. Never feeds recommendation/filter prices.
export function yuanToCents(value){
 if(typeof value!=='number'&&typeof value!=='string')return null;
 const s=String(value);if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 const [whole,fraction='']=s.split('.');const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return cents>0n&&cents<=100000000n?Number(cents):null;
}
export function estimateHangzhouSubsidy(price,{status='pending',evidence=[],basis='reference',priceType='listed',now=new Date()}={}){
 const active=new Date(now).getTime()>=Date.parse('2026-01-01T00:00:00+08:00')&&new Date(now).getTime()<=Date.parse('2026-12-31T23:59:59.999+08:00');
 const checked=['eligible','ineligible'].includes(status)&&Array.isArray(evidence)&&evidence.length>0&&(status==='ineligible'||active)?status:'pending';
 const cents=yuanToCents(price);const base={region:'浙江省杭州市',status:checked,basis,price:cents===null?null:cents/100,subsidy:null,total:null,conditional:true};
 if(cents===null||checked==='ineligible'||!active||!['listed','final_sale','reference','user_entered'].includes(priceType))return base;
 // Integer cents, half-up to fen. No floating-point multiplication of yuan.
 const subsidy=Math.min(Math.floor((cents*15+50)/100),150000);
 return {...base,subsidy:subsidy/100,total:(cents-subsidy)/100};
}
export function classifyHangzhouEligibility({skuConfirmed=false,energyLevel=null,merchantConfirmed=false,hangzhouActive=false,excluded=false,evidence=[],now=new Date()}={}){
 const proof=Array.isArray(evidence)&&evidence.length>0;
 if(excluded&&skuConfirmed&&proof)return {status:'ineligible',evidence,reason:'当前渠道对应SKU不参加补贴'};
 const active=new Date(now).getTime()>=Date.parse('2026-01-01T00:00:00+08:00')&&new Date(now).getTime()<=Date.parse('2026-12-31T23:59:59.999+08:00');
 if(active&&skuConfirmed&&energyLevel===1&&merchantConfirmed&&hangzhouActive&&proof)return {status:'eligible',evidence,reason:'商品与渠道证据符合杭州活动条件；个人资格、名额及领取结果仍需确认'};
 return {status:'pending',evidence,reason:'当期能效、参与商家、杭州活动、个人资格及名额需确认'};
}
export function usableSubsidyQuote(q){return q?.match?.comparable===true&&q.stock!==0&&['listed','final_sale'].includes(q.priceType)&&yuanToCents(q.price)!==null&&!!q.priceSource&&!!q.sourceUrl;}
export function resolveSubsidyPrice({product,chosen='reference',manual,quotes=[]}){
 const valid=quotes.filter(usableSubsidyQuote),quote=valid.find(q=>q.id===chosen);
 const entered=manual?.id===product.id?manual.value:'';
 if(chosen==='manual'&&entered!=='')return {price:yuanToCents(entered)===null?null:Number(entered),basis:'user_entered',quote:null,sourceLabel:'用户填写价格',eligibility:{status:'pending',evidence:[]}};
 if(quote)return {price:quote.price,basis:'merchant_listed',quote,sourceLabel:quote.platform+'页面报价',eligibility:quote.eligibility??{status:'pending',evidence:[]}};
 return {price:product.price,basis:'reference',quote:null,sourceLabel:'官方参考价',eligibility:{status:'pending',evidence:[]}};
}
