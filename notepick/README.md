# NotePick 官网数据采集：模板检查与小样本验证

本次只进行了阶段1和阶段2，没有开发网站、批量爬虫或全量导入系统。

## 实际结果

- 两个原始CSV均按UTF-8-SIG兼容方式读取，表头和字段说明均与需求的40字段及顺序一致。原文件保持不变。
- 已从联想官网商品页取得1种真实销售配置：商品ID `1052925`，小新Pro14，酷睿 Ultra 7 356H，32GB内存，1TB SSD（转换为1024GB）。官网规格表显示14英寸、2880×1800、120Hz、60Wh。
- `model_code`保留官网商品ID，并在备注说明它不是MTM。`variant_id=lenovo:1052925`基于官网商品ID，重复处理保持一致。
- 商品页没有取得明确的动态价格，`official_price_cny`、`price_type`、`price_url`均留空。未确认销售状态，写为“未知”。GPU具体型号未列出，不从CPU反推。
- 全部记录为“待核实”。已核实0条，价格完整率0%，同型号多配置及对应价格验证**未通过**。不能开始批量采集或宣称已完成首个品牌采集器。

## 为什么没有继续扩大采集

1. Apple网站条款明确限制自动网页采集，因此没有采集商品页。
   https://www.apple.com.cn/legal/internet-services/terms/site.html
2. 联想robots允许该商品路径，但其商城协议的恶意购买行为相关条款明确列出非自然浏览批量获取商品介绍、价格、库存的行为。取得一个商品页后审阅条款，已停止进一步采集。robots可访问不等于获得批量采集授权。
   https://www.lenovo.com.cn/statement/register_protocol.html
3. 小米公开商品页可访问，页面脚本引用公开配置接口 `/product/view`。单次不登录测试返回HTTP 406，已停止，未尝试绕过。该接口域名robots返回404，不能解读为明确授权。页面内`product_info.price`属于产品级多价格信息（`is_multi_price=true`），不能写入某个SKU。
   https://www.mi.com/shop/buy/detail?product_id=20864
   https://www.mi.com/about/user-agreement/

## 运行离线复核

需要Python 3.10或以上，本阶段仅用标准库，无需安装依赖。在项目根目录执行：

```powershell
python notepick/scripts/verify_sample.py
```

脚本会重新读取两个模板，若存在差异立即报错，不修改原模板。然后解析已保存的联想HTML，生成UTF-8-SIG CSV及质量报告。重新运行只覆盖样本输出，不操作今后的正式数据文件。原始HTML不会被覆盖，也不发起网络请求。`probe.py`已停用，避免再次请求联想。

输出：

- `data/processed/laptops_sample.csv`：真实配置样本，价格为空，不能用于价格推荐。
- `data/processed/pending_review.csv`：待人工核验样本。
- `data/processed/quality_report.json`：记录数、品牌数、SKU数、价格完整率、主要字段缺失率及验证结论。
- `data/evidence_manifest.json`：原始文件SHA-256及保存时间。采集时间取首次保存文件的时间（北京时间），不是网页更新时间；拷贝原始文件后请保留此清单，文件时间变化会影响重建时间。
- `logs/source_checks.json`：本次访问结果与停止原因。

## 原始证据

`data/raw/product_1052925.html`是联想商品页，`item_robots.html`是其robots文本，`terms.html`是联想协议。`mi_20864.html`是小米商品页，`mi_detail.js`是其公开页面引用的脚本，`mi_robots.html`、`mi_terms.html`分别保存小米robots和协议。扩展名不代表响应格式。失败接口没有伪造JSON响应文件。

## 当前可行的下一步

在正常浏览器中打开联想商品页，记录32GB/1TB具体配置的商品ID、普通公开人民币价格、实际查看时间，再打开同型号另一芯片或容量的商品页进行相同记录。排除国补、学生、会员及优惠券价格。保留能同时看到具体配置和对应价格的截图/导出文件；若没有普通公开价，继续留空。也可以由品牌提供允许使用的官方配置导出。

在取得这些证据前，数据状态保持待核实。人工导入、去重冲突保护和多品牌采集属于后续阶段，本次未实现，不能把当前离线样本脚本当作全量采集程序。
