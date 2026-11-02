# 当前硬件分析实现

当前调用链是商品详情页 → /api/hardware/analyze → Tavily Search/Extract → 本地核验与规则分析 → 中文短报告，不调用LLM，不提供自由追问。

- backend/hardwareResearch.mjs负责请求预算、有限重试、共享任务、缓存和安全降级；backend/tavilyResearch.mjs负责实际Tavily请求，密钥只从后端配置取得。
- backend/hardwareRetrieval.mjs区分检索候选与已确认商品身份。准确标题可以让摘要省略型号的页面进入正文核验，但不能直接把摘要参数当成确定事实。未知桌面/移动版本的独显可检索移动版参考，不能因此声称本机版本、显存或功耗已核实。
- backend/hardwareReport.mjs对准确型号正文做清洗、字段抽取、来源追溯及冲突合并。型号相近或测试平台不同不能直接混用；单字段冲突不让其他已确认字段失效。
- backend/hardwareNarrative.mjs使用已有事实、测试证据和本地模板生成性能解释，不编造跑分、FPS或整机测试。CPU性能、GPU性能各三条，随后是整体性能评价和资料来源。
- frontend/src/components/HardwareAnalysis.jsx负责加载、错误、商品切换竞态、收起/展开和简洁来源链接，不展示整篇网页。

无Key或检索失败时可生成有限本地分析，并明确状态；搜索摘要、芯片规格和其他电脑的测试不能伪装成当前整机实测。所有硬件分析只读使用推荐知识，不反向改动3A/3B/3C排序或商品价格。
