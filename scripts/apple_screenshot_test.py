"""Parse visually transcribed screenshot evidence; no OCR service or network access.

Run: python scripts/apple_screenshot_test.py
Only apple_screenshot_* outputs are written, never the production database.
"""
import csv
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from collect import schema, write_csv, read_table, IDENTITY

EVIDENCE = ROOT / 'data/manual/apple_screenshot_evidence'
OUT = ROOT / 'data/processed'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def capacity(text):
    m = re.fullmatch(r'(\d+)(GB|TB)', text)
    if not m:
        raise ValueError('容量格式不明确: ' + text)
    return str(int(m[1]) * (1024 if m[2] == 'TB' else 1))


def parse(item):
    text = item['transcription']
    row = dict.fromkeys(schema(), '')
    model = re.search(r'(?:(\d+) 英寸 )?(MacBook (?:Air|Pro|Neo))', text)
    chip = re.search(r'(M\d+(?: Pro| Max)?|A\d+ Pro) 芯片', text)
    cores = re.search(r'(\d+) 核中央处理器[、，, ]+(\d+) 核图形处理器', text)
    memory = re.search(r'(\d+GB) 统一内存', text)
    storage = re.search(r'(\d+(?:GB|TB)) (固态硬盘|存储容量)', text)
    prices = re.findall(r'RMB\s+([\d,]+)', text)
    if not all((model, chip, cores, memory, storage)):
        raise ValueError('缺少明确配置，停止而非猜测: ' + item['file'])
    row.update(brand='Apple', series=model[2],
               model=model[2] + (' ' + model[1] + '英寸' if model[1] else '') + ' (' + chip[1] + ')',
               record_level='sku', cpu_brand='Apple', cpu_model='Apple ' + chip[1],
               cpu_cores=cores[1], gpu_model='Apple ' + chip[1] + ' ' + cores[2] + '核图形处理器',
               gpu_cores=cores[2], ram_gb=capacity(memory[1]), memory_type='统一内存',
               screen_inches=model[1] or '',
               collected_at=item['reviewed_at'], collection_method='manual', verification_status='待核实')
    # Pro images say storage capacity, not SSD: retain capacity as evidence, leave SSD field empty.
    if storage[2] == '固态硬盘':
        row['ssd_gb'] = capacity(storage[1])
    if len(prices) == 1:
        row.update(official_price_cny=prices[0].replace(',', ''), price_type='未知')
    ports = re.search(r'接口：(.*)', text)
    row['ports'] = ports[1] if ports else ''
    wifi = re.search(r'Wi-Fi (\d+[A-Z]?)', text)
    row['wifi_version'] = wifi[0] if wifi else ''
    row['availability_status'] = '暂未发售' if '暂未发售' in text else '在售' if ('有现货' in text or '工作日' in text or re.search(r'\d+-\d+ 周', text)) else '未知'
    extra = []
    if not model[1]: extra.append('截图未显示屏幕尺寸')
    if storage[2] != '固态硬盘': extra.append('截图存储容量=' + storage[1] + '（' + capacity(storage[1]) + 'GB）；未显示介质类型，ssd_gb留空')
    if len(prices) != 1: extra.append('价格数量不唯一，未填写价格')
    row['notes'] = '；'.join([
        '用户声明来源为Apple中国官网；截图无地址栏，来源与价格口径待确认',
        '证据=data/manual/apple_screenshot_evidence/' + item['file'],
        'sha256=' + item['sha256'],
        'collected_at为本次读取整理时间，不是拍摄时间或实时价格时间',
        'screen_inches仅为截图营销标称尺寸，不代表精确面板对角线',
        '价格与本图配置同屏对应；仅作截图测试证据，不作为已确认普通官网公开价',
        '颜色=' + ('天蓝色' if '天蓝色' in text else '银色'),
        '配置类型未知，未将购买汇总页视为标准配置证明',
        '原文选摘=' + text.replace('\n', ' | '),
    ] + extra)
    # Same field-based identity as the existing pipeline, using only available evidence.
    complete = all(row[k] for k in ('cpu_model', 'gpu_model', 'ram_gb', 'ssd_gb', 'screen_inches'))
    key = '|'.join(row[k].casefold() for k in IDENTITY if not (complete and k == 'model_code'))
    if not row['ssd_gb']:
        key += '|observed_storage_gb=' + capacity(storage[1])
    row['variant_id'] = 'apple:' + hashlib.sha256(key.encode()).hexdigest()[:20]
    return row


def hardware_key(row):
    # More conservative comparison across evidence with different naming/completeness.
    return tuple(row[k].casefold() for k in ('brand', 'series', 'cpu_model', 'cpu_cores', 'gpu_cores', 'ram_gb', 'screen_inches'))


def main():
    protected = [p for p in OUT.iterdir() if p.is_file() and not p.name.startswith('apple_screenshot_')]
    before = {str(p): digest(p) for p in protected}
    items = json.loads((EVIDENCE / 'transcriptions.json').read_text(encoding='utf-8'))
    images = sorted(p.name for p in EVIDENCE.glob('*.png'))
    assert sorted(i['file'] for i in items) == images, '每张图必须有且仅有一份转录'
    existing = read_table(OUT / 'laptops_collected.csv')
    rows, audits, conflicts, seen, source_links = [], [], [], {}, {}
    for item in items:
        assert digest(EVIDENCE / item['file']) == item['sha256'], '证据校验和变化'
        row = parse(item)
        assert all(row[k] for k in ('brand', 'series', 'model', 'cpu_model', 'cpu_cores', 'gpu_cores', 'ram_gb'))
        assert row['verification_status'] == '待核实'
        assert not row['spec_url'] and not row['price_url'], '不可编造未显示的URL'
        assert all(not row[k] or row[k].replace('.', '', 1).isdigit() for k in ('cpu_cores', 'gpu_cores', 'ram_gb', 'ssd_gb', 'screen_inches', 'official_price_cny'))
        # Include raw storage capacity so Pro 1TB and 2TB cannot be collapsed when SSD type is unknown.
        storage_gb = capacity(re.search(r'(\d+(?:GB|TB)) (?:固态硬盘|存储容量)', item['transcription'])[1])
        full_key = (row['variant_id'], storage_gb)
        previous = seen.get(full_key)
        if previous:
            if previous['official_price_cny'] != row['official_price_cny']:
                conflicts.append({'file': item['file'], 'variant_id': row['variant_id'], 'type': 'same_hardware_different_price', 'prices': [previous['official_price_cny'], row['official_price_cny']]})
                previous['official_price_cny'] = previous['price_type'] = ''
                previous['verification_status'] = '有冲突'
            status = 'duplicate'
        else:
            seen[full_key] = row
            rows.append(row)
            status = 'extracted'
        source_links.setdefault(row['variant_id'], []).append(item['file'])
        for old in existing:
            if old['variant_id'] == row['variant_id'] or hardware_key(old) == hardware_key(row):
                conflicts.append({'file': item['file'], 'existing_variant_id': old['variant_id'], 'type': 'possible_existing_match', 'action': 'report_only_no_merge', 'existing_verified': old['verification_status'] == '已核实'})
        audits.append({'file': item['file'], 'variant_id': row['variant_id'], 'status': status,
                       'model': row['model'], 'cpu_model': row['cpu_model'], 'cpu_cores': row['cpu_cores'], 'gpu_cores': row['gpu_cores'],
                       'ram_gb': row['ram_gb'], 'storage_capacity_gb_observed': storage_gb, 'ssd_gb': row['ssd_gb'],
                       'screenshot_price_cny': re.search(r'RMB\s+([\d,]+)', item['transcription'])[1].replace(',', ''),
                       'price_mapping': '同张截图单一配置与单一价格明确对应',
                       'missing_fields': ';'.join(k for k in schema() if not row[k]),
                       'requires_confirmation': '原始官方页面URL及是否普通非教育/非优惠价格' + ('；屏幕尺寸' if not row['screen_inches'] else '') + ('；存储介质类型' if not row['ssd_gb'] else ''),
                       'sha256': item['sha256']})
    assert len({r['variant_id'] for r in rows}) == len(rows), '身份字段不足，不可给不同配置相同ID'
    target = OUT / 'apple_screenshot_test.csv'
    write_csv(target, rows)
    result = read_table(target)
    assert result == rows and len(schema()) == 40
    assert target.read_bytes().startswith(b'\xef\xbb\xbf')
    with (OUT / 'apple_screenshot_review.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(audits[0]))
        writer.writeheader()
        writer.writerows(audits)
    report = {'method': 'assistant_visual_transcription_then_local_regex_extraction_and_validation; not automatic OCR',
              'screenshots': len(items), 'records': len(rows), 'by_series': dict(Counter(r['series'] for r in rows)),
              'screenshot_configuration_prices': sum(bool(r['official_price_cny']) for r in rows),
              'confirmed_public_official_prices': 0, 'verification_status': '全部待核实',
              'duplicates': len(items) - len(rows), 'conflicts': conflicts,
              'schema_columns': len(schema()), 'utf8_bom': True, 'read_back_matches': True,
              'production_files_before': before, 'source_screenshots_by_variant': source_links,
              'formal_import_ready': False,
              'limitations': ['截图未含地址栏、购买渠道和价格条件，不宣称价格已核实', '现有正式normalize要求官方URL、完整SSD和屏幕字段及已知价格口径，本测试不放宽正式导入规则', 'Pro仅见存储容量，未将未知介质填成SSD', '不联网补参数，不猜测新芯片规格或Neo屏幕尺寸']}
    assert before == {str(p): digest(p) for p in protected}, '正式文件发生变化'
    report['production_files_unchanged'] = True
    (OUT / 'apple_screenshot_validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# Apple截图提取测试', '', '16张截图由助手逐张视觉阅读并转录，再实际运行本地正则提取和CSV校验；不是无人值守OCR。未访问官网。', '',
             '截图价格均能对应本图配置，但没有原始URL及价格条件：价格口径全部未知、状态全部待核实。价格数值仅供测试，不能作为已核实普通售价进入正式库。', '',
             '| 文件时间后缀 | 系列/标称尺寸 | 芯片 | CPU/GPU核 | 内存GB | 截图存储容量GB | 截图价格元 |',
             '|---|---|---|---|---|---|---|']
    for a in audits:
        lines.append('| ' + ' | '.join([a['file'].removeprefix('ScreenShot_2026-10-28_').removesuffix('.png'), a['model'], a['cpu_model'], a['cpu_cores'] + '/' + a['gpu_cores'], a['ram_gb'], a['storage_capacity_gb_observed'], a['screenshot_price_cny']]) + ' |')
    lines += ['', '## 缺失项与需确认内容', '',
              '- 全部：原始官网URL、价格是否普通商店价格、截图拍摄时间（文件名不作为经核实时间）；截图未显示的OS、精确屏幕参数、重量、电池、厚度、官方货号等均留空。',
              '- 2张Neo（102314、102330）：未显示屏幕尺寸；保留键盘锁定键/触控ID差异于备注。',
              '- 5张Pro（102424至102702）：仅标“存储容量”，容量已提取到备注和逐图清单，ssd_gb暂留空；M6的2张明确“暂未发售”，没有改成在售。',
              '- Air接口只写Wi-Fi，未填写Wi-Fi版本；Pro明确Wi-Fi 7，已记录。40W/70W/96W是适配器功率，未误填battery_wh。',
              '- 13/14/15英寸仅为截图标称，不转换为13.6/14.2/15.3等未显示的实际尺寸。', '',
              '## 校验和批量可行性', '',
              f'{len(rows)}条独立记录，40列UTF-8-SIG，读回一致；重复{len(items)-len(rows)}条，冲突{len(conflicts)}项。正式数据文件SHA-256前后一致。', '',
              '适合继续人工辅助批量采用：每张保留一组完整配置与价格，额外保留地址栏/URL和价格渠道证据。可共用同批普通商店来源说明，无需逐字段手录。当前仅验证视觉辅助转录流程，尚未验证自动OCR在其他版式上的准确率。', '',
              '重跑：`python scripts/apple_screenshot_test.py`。依赖项目现有collect.py的表头读写工具；不调用正式collect.run或官网采集器。', '',
              '完整逐图缺失字段：apple_screenshot_review.csv；机器校验报告：apple_screenshot_validation.json。']
    (OUT / 'apple_screenshot_report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('screenshots', 'records', 'by_series', 'screenshot_configuration_prices', 'confirmed_public_official_prices', 'duplicates', 'conflicts', 'production_files_unchanged')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
