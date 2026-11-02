# NotePick

NotePick——基于用户需求的笔记本智能推荐系统，《设计大数据基础》课程项目。

## 主要功能

- 填写预算、12种用途、7项偏好和高级硬条件。
- 3A：多条件布尔硬筛选；3B：候选两两比较、加权平均效用排序及关键性能保护；3C：相对优势判定、规则选择和模板解释。它们是本地规则算法，不是机器学习排序。
- 商品详情展示配置和本地图片；同品牌推荐按当前商品品牌探索不同型号，不受先前问卷条件限制。
- 硬件分析使用Tavily Search/Extract、本地文本提取、型号核验、规则推理和中文模板。报告为CPU性能、GPU性能、整体性能评价、资料来源四个板块，支持收起/展开，没有自由追问，当前分析不调用DeepSeek或其他LLM。
- 京东、淘宝、天猫商品搜索跳转，不自动获取实时报价。
- 杭州国补条件估算：沿用项目15%比例、每件1500元上限及资格判断。默认官网参考价不是成交价，估算不代表可实际领取。

## 技术栈

React 19、Vite 6、JavaScript、Node.js原生HTTP/fetch、Tailwind CSS与现有CSS；Tavily API；本地硬件证据和分析规则。Python用于采集、转换和历史数据核验，不是网页运行服务。

## 目录

```text
frontend/                 前端源码、package.json、pnpm-lock.yaml和测试
  src/data/               商品、性能及政策运行快照
  public/product-images/  61张原始商品图片及mapping.json
backend/                  Node接口、Tavily、本地硬件分析及测试
scripts/                  启动、数据生成、审计和测试工具
collectors/、notepick/     历史数据采集与核验源码
integrations/             被兼容代码/测试引用的辅助源码（不含私有环境）
data/reference/           硬件证据、模型映射、用途依据
data/processed/           被算法验证和测试使用的数据及冻结基线
data/source/              只读原始Excel与本地硬件说明
  电脑数据.xlsx
  说明文档.md
docs/                     保留的硬件分析实现说明
tests/                    Python测试
start-notepick.cmd        Windows启动入口
requirements.txt          可选Python依赖
```

运行快照保留78条原始商品记录；按既有下架规则网站使用77条。不要为首次启动重导入Excel或覆盖商品快照。

## 本地运行

需要Node.js 22.12及以上、pnpm和现代浏览器。后端使用Node内置模块，无需单独安装后端npm依赖。依赖安装与启动均在仓库根目录执行：

```powershell
pnpm --dir frontend install --frozen-lockfile
node scripts/dev.mjs
```

Windows也可在安装依赖后双击`start-notepick.cmd`。启动器同时启动前端和后端，核验已有硬件运行资料，正常启动无需Python、原项目绝对路径或额外数据初始化。

- 前端：http://127.0.0.1:5173/
- 后端：http://127.0.0.1:8787/
- 代理健康检查：http://127.0.0.1:5173/api/health

本地地址只在运行电脑上有效，不是公开在线Demo。端口被其他项目占用时启动器会提示；停止服务在启动终端按Ctrl+C。

## 可选Tavily配置

不配置Key也能使用本地推荐、详情、图片、同品牌推荐和国补数学估算；硬件分析会明确降级为已有本地资料。

需要实时检索时，将`backend/.env.example`复制为同目录`.env`，将占位符替换为自己的有效Key：

```dotenv
TAVILY_API_KEY=YOUR_TAVILY_API_KEY
```

未准备联网时不要创建含占位符的`.env`，或将值留空。Key只放后端，不能放进React、VITE_*变量、截图或Git提交。没有必要配置DeepSeek、OpenAI或电商账号。公开副本不包含真实密钥、Cookie和浏览器会话；.gitignore不能保护手动网页上传的私密文件。

## 测试和生产构建

```powershell
npm --prefix frontend run build
```

现有部分历史测试读取仓库**同级**的`../data/电脑数据.xlsx`和`../data/说明文档.md`。两份原件已只读收录在本仓库`data/source/`。若要运行完整历史测试，请先将它们复制到仓库同级的`data/`目录，保留文件名；不要覆盖已有同名数据。普通网页运行不需要此步骤。

```powershell
node --test frontend/tests/*.test.js backend/tests/*.test.mjs scripts/tests/*.test.mjs
# 可选：Python采集和转换测试
python -m pip install -r requirements.txt
python -m unittest discover -s tests
```

已知数据基线差异：原始Excel当前77条、Windows61/macOS16，与旧版78条、Windows62及旧Excel哈希的冻结期望不一致。对应历史检查可能失败；不要为让旧基线通过而修改数据或测试期望。

浏览器smoke脚本需要另外安装Playwright及浏览器，不是网站运行依赖。可能实际访问付费API的人工验证脚本不应默认执行。

## 资料和兼容边界

正常启动只读取包内运行快照；默认数据重导入工具仍沿用旧同级资料路径。若确需重导入，可显式指定`python scripts/convert_catalog.py --input data/source/电脑数据.xlsx`，这会改变运行数据，不属于安装或启动步骤。

后端尚有被现有导入和回归测试引用的历史兼容模块，因此保留必要旧源码；正式启动已禁用旧模型分析入口，当前详情页没有旧追问UI。保留文件不表示功能在当前页面启用。Tavily资料质量、网络和额度会影响结果；芯片规格与第三方测试不是当前整机实测，不承诺FPS或软件完成时间。

原始图片和引用资料的权利归各自权利人，课程项目保留资料来源。没有擅自添加项目开源许可证，也不替第三方资料授予权限。

## 上传GitHub

解压后根目录应直接看到frontend、backend、data、README.md和.gitignore。网页上传请选择这些文件夹和文件的内容，包含.gitignore及无密钥配置模板；不要仅上传整个ZIP指望平台自动解压成源码仓库。不要上传本地安装后的node_modules、.env、日志或学校便携运行包。
