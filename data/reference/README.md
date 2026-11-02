# 硬件参考资料维护入口

下一阶段唯一的统一读取文件是 `performance_reference_unified.json`。3B-3通过生成的frontend/src/data/performanceRuntime.json读取它；详见frontend/PHASE3B3.md（从项目根目录解析）。

|文件|用途|如何更新|
|---|---|---|
|external_verified.json|本次原页核验的事实与来源，含测试维度、数值、样本、条件及可信度|人工核验后维护；不可从摘要补值|
|product_gpu_mappings.json|逐商品确认Laptop身份，保留CPU/内存/SSD/尺寸锚点，不改Excel|取得匹配官方证据后维护|
|research_pending.json|缺资料、访问失败、版本歧义及不能使用的线索|核验后维护|
|runtime_preservation.json|此次评分配置、评分源码、运行知识快照和商品JSON的校验指纹|本阶段只读；未来正式接入需单独验收更新|
|hardware_models.json|唯一Excel的41CPU/13非空GPU型号与78商品映射|本地生成器生成|
|performance_reference.json|原始Markdown提取的来源层，保留9条关系及逐字证据|本地生成器生成|
|performance_reference_unified.json|本地来源层+已核验外部资料+逐商品评估的统一离线输出|合并生成器生成，不手工修改|

在项目根目录依次运行：

```powershell
node scripts/build_performance_reference.mjs
node scripts/merge_performance_reference.mjs
```

两步均不联网、不写原Excel或Markdown。本地生成器不会覆盖前三份补充输入；测试验证重建后它们仍完整保留。源文件更新后需先完成正常Excel转换，不可绕过一致性检查。

`frontend/src/data/hardwareKnowledge.json`及runtime_preservation.json仍保留作旧3B回归基线。现行3B-3生产入口为recommendationEngine.js，使用由统一资料生成的performanceRuntime.json；不再用临时旧分类评分决定结果。原始性能事实未改。

最新联网覆盖报告是 `../processed/hardware_research_report.md` 和 `hardware_research_coverage.json`。`performance_reference_report.md` 只统计本地原文，`hardware_match_report.json`、`scoring_cases.*`只描述现有评分，三者口径不同，不能视作多套正式最新版。

可比较表示有完整型号对应的数值资料，不表示所有商品都完成整机测试。GPU需核数、移动版本一致；只有定位、身份、宣传结论不计作数值覆盖。CPU聚合资料可能混合提交，不承诺某台笔记本分数；不同测试、维度和图形API不直接混排。每商品每硬件只计一次。原始40条空集显合法保留。

PassMark日期是数据库快照日期，不是全部样本的实际测试日期；未知实际测试日期保持null。Notebookcheck/其他原创测试的样本信息按实际可见内容记录，不推算当前SKU功耗。原始证据最小摘记和完整URL保留于外部输入，完整本地原文保留在原始Markdown及其来源层。

3B-3新增workload_policy_sources.json仅保存软件用途参考与规划参数边界；不覆盖既有CPU/GPU事实。运行JSON由scripts/build_recommendation_knowledge.mjs生成，启动/构建自动重建。当前真实案例以data/processed/recommendation_cases_v3.md为准；此前研究报告仍是来源核验历史。
