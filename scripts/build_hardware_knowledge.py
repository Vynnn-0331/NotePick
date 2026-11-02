"""Offline extraction of the user-maintained Markdown, never writes the source."""
import hashlib
import json
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'data/说明文档.md'

def build():
    text = SOURCE.read_text(encoding='utf-8')
    cpu_section = text.split('## 5B.')[1].split('## 5C.')[0]
    gpu_section = text.split('## 5C.')[1].split('## 6.')[0]
    cpus = []
    for line in cpu_section.splitlines():
        if not line.startswith('|') or '约' not in line: continue
        for item in line.split('|')[3].strip().split('；'):
            m = re.fullmatch(r'(.+?)：约([\d,]+)', item.strip())
            if m:
                cpus.append({'name': m[1], 'benchmark': int(m[2].replace(',', '')), 'metric': 'PassMark CPU Mark', 'evidenceType': 'benchmark_snapshot', 'checkedAt': '2026-10-27', 'sourceSection': '5B CPU移动端性能梯队', 'sourceLine': text[:text.index(line)].count('\n') + 1, 'sourceUrl': 'https://www.cpubenchmark.net/laptop.html', 'limitations': '用户提交汇总、多核吞吐，非单核/编译/游戏/续航实测；整机功耗散热和跨平台环境不同。'})
    if len(cpus) != 12: raise ValueError('CPU知识库表结构或条目数量变化，需核查提取规则')
    # These are explicitly named mobile-tier examples in section 5C, not desktop mappings.
    definitions = [
        ('RTX 5080 Laptop GPU', 'extreme_mobile', '极高移动图形性能'),
        ('RTX 5090 Laptop GPU', 'extreme_mobile', '极高移动图形性能'),
        ('RTX 5070 Ti Laptop GPU', 'high_mobile', '高移动图形性能'),
        ('RTX 5060 Laptop GPU', 'mainstream_discrete', '中高移动图形性能'),
        ('RTX 4060 Laptop GPU', 'mainstream_discrete', '中高移动图形性能'),
        ('Intel Arc B390', 'overlap', '较强核显 / 与入门独显接近的交叠区'),
        ('RTX 4050 Laptop GPU', 'overlap', '较强核显 / 与入门独显接近的交叠区'),
        ('Radeon 890M', 'mainstream_integrated', '主流/较强核显'),
        ('Radeon 780M', 'mainstream_integrated', '主流/较强核显'),
        ('Intel Arc 130V', 'mainstream_integrated', '主流/较强核显'),
        ('Intel Arc 140V', 'mainstream_integrated', '主流/较强核显'),
        ('Radeon 740M', 'entry_integrated', '入门集显或型号不明确'),
        ('Radeon 840M', 'entry_integrated', '入门集显或型号不明确'),
    ]
    benchmarks = {'RTX 5070 Ti Laptop GPU': 16874, 'RTX 5060 Laptop GPU': 12052, 'RTX 4060 Laptop GPU': 10338}
    gpus=[]
    for name,tier,label in definitions:
        source_line = next(line for line in gpu_section.splitlines() if line.startswith('|') and line.split('|')[1].strip() == label)
        # Grouped shorthand 5080/5090 and 130V/140V is expanded only within the explicit row.
        token = re.search(r'(?:RTX |Arc |Radeon )(\w+)',name)[1]
        if token not in source_line: raise ValueError('GPU条目已从原文删除：' + name)
        value=benchmarks.get(name)
        if value and f'{value:,}' not in gpu_section: raise ValueError('GPU基准快照已变化')
        gpus.append({'name':name,'tier':tier,'tierLabel':label,'benchmark':value,'metric':'3DMark Time Spy Graphics' if value else None,'evidenceType':'mobile_qualitative_tier','checkedAt':'2026-10-28','sourceSection':'5C GPU移动端性能梯队与比较','sourceLine':text[:text.index(source_line)].count('\n')+1,'sourceUrl':'https://www.notebookcheck.net/Mobile-Graphics-Cards-Benchmark-List.844.0.html','limitations':'大致定位有交叠；功耗、散热、显存与软件未知，不保证帧率或专业软件表现。'})
    return {'source':'../data/说明文档.md','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'version':'v3.0','cpus':cpus,'gpus':gpus,
        'cpuIdentityOnly':['Core i5-13420H','Core 5 320','Core Ultra 5 325','Ryzen 5 7530U'],
        'categories':[
            {'sections':'1—3','kind':'hardware_basics','use':'名称与类型解释，不赋予性能名次'},
            {'sections':'5A','kind':'desktop_background','use':'桌面/历史背景，不给移动端评分'},
            {'sections':'5B直接比较、5C实测实例','kind':'specific_comparison','use':'保留指标、日期和适用条件；优先于宽泛定位'},
            {'sections':'5B/5C梯队','kind':'mobile_tier','use':'仅限完整匹配或明确标示的移动语境推断'},
            {'sections':'4、6—12','kind':'limitations_and_workloads','use':'工作流差异、未知、功耗和数据不足提示'}],
        'directComparisons':[{'subjects':['Core Ultra X7 358H','Ryzen 7 H 255'],'context':'5B：PassMark单核/多核快照前者领先；实际软件与整机可改变差距'}, {'subjects':['RTX 5070 Ti Laptop GPU','RTX 5060 Laptop GPU'],'context':'5C：同指标Time Spy Graphics前者领先，不能承诺游戏比例'}]}

if __name__ == '__main__':
    data=build()
    (ROOT/'frontend/src/data/hardwareKnowledge.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"CPU evidence: {len(data['cpus'])}; GPU mobile tiers: {len(data['gpus'])}; Markdown not modified")
