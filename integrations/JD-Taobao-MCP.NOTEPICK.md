# 复用来源

仓库：https://github.com/HaonanYu123/JD-Taobao-MCP
固定版本：63a4e143ad54d1d7ea9d7fa85615283beaaf3f1d
许可证：MIT，见 JD-Taobao-MCP/LICENSE。

NotePick不启动通用MCP工具服务器，也不允许模型操作浏览器。直接复用同一仓库的 ShoppingBrowserService、BrowserController、商品提取器和安全模块，通过 browser_price_bridge.py 的限定只读操作桥接现有Node后端。
上游完整MCP服务器要求Python3.11+；本地桥接不使用MCP SDK，已单独验证Python3.10环境。
上游源码保持原样；安装环境和登录资料分别在 .venv、.private，禁止提交。
