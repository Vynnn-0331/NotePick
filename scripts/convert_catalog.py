"""Read-only XLSX -> frontend catalog. Run from any directory; no network access."""
import argparse
import hashlib
import json
import math
import os
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlsplit
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT.parent / 'data'
DEFAULT_SOURCE = DATA_ROOT / '电脑数据.xlsx'
KNOWLEDGE_BASE = DATA_ROOT / '说明文档.md'

def source_reference(source):
    return Path(os.path.relpath(source, ROOT)).as_posix()
MAPPING = {'brand': 'brand', 'series': 'series', 'model': 'model', 'CPU_model': 'cpu_model',
           'GPU_model': 'gpu_model', 'GPU_Type': 'gpu_type', 'ram_gb': 'ram_gb', 'ssd_gb': 'ssd_gb',
           'screen_inches': 'screen_inches', 'weight_kg': 'weight_kg', 'official_price': 'official_price_cny', 'url': 'source_url', 'os': 'os'}
NUMBERS = {'ram_gb', 'ssd_gb', 'screen_inches', 'weight_kg', 'official_price_cny'}
IDENTITY = ('brand', 'series', 'model', 'cpu_model', 'gpu_model', 'ram_gb', 'ssd_gb', 'screen_inches')
GPU_EVIDENCE = {
    '英特尔锐炫 130T': 'https://psref.lenovo.com/Detail/ThinkBook_14_G8_IAL?M=21SJ0070VN',
    '英特尔锐炫 B370': 'https://www.intel.com/content/www/us/en/support/articles/000007420/processors.html',
}

def clean(value):
    return None if value is None or isinstance(value, str) and not value.strip() else value.strip() if isinstance(value, str) else value

def identity(row):
    text = json.dumps([row.get(k) for k in IDENTITY], ensure_ascii=False, separators=(',', ':'))
    return 'np-' + hashlib.sha256(text.encode('utf-8')).hexdigest()[:20]

def transform(raw):
    row = {target: clean(raw.get(source)) for source, target in MAPPING.items()}
    issues = []
    for k in ('brand', 'series', 'model', 'cpu_model', 'gpu_model', 'os'):
        if row[k] is not None: row[k] = str(row[k])
    for k in NUMBERS:
        v = row[k]
        if v is None: continue
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0:
            issues.append({'field': k, 'kind': 'invalid_number', 'raw': v})
            row[k] = None
        elif k in ('ram_gb', 'ssd_gb') and not float(v).is_integer():
            issues.append({'field': k, 'kind': 'noninteger_capacity', 'raw': v})
            row[k] = None
        elif float(v).is_integer():
            row[k] = int(v)
    gpu_raw = row['gpu_type']
    row['gpu_type'] = {'集显': '集成显卡', '独显': '独立显卡', '集成': '集成显卡', '独立': '独立显卡', '集成显卡': '集成显卡', '独立显卡': '独立显卡'}.get(gpu_raw)
    if row['brand'] == 'Apple' and row['gpu_model']:
        row['gpu_type'] = '集成显卡'
    if row['gpu_model'] in GPU_EVIDENCE:
        row['gpu_type'] = '集成显卡'
    if gpu_raw and row['gpu_type'] and gpu_raw not in ({'集显', '集成', '集成显卡'} if row['gpu_type'] == '集成显卡' else {'独显', '独立', '独立显卡'}):
        issues.append({'field': 'gpu_type', 'kind': 'corrected_classification', 'raw': gpu_raw, 'value': row['gpu_type'], 'evidence': GPU_EVIDENCE.get(row['gpu_model']), 'note': '只修正JSON；原始Excel及raw内容保留'})
    if row['gpu_type'] == '独立显卡' and row['gpu_model'] is None:
        issues.append({'field': 'gpu_model', 'kind': 'discrete_gpu_model_missing'})
    if gpu_raw and not row['gpu_type']: issues.append({'field': 'gpu_type', 'kind': 'unknown_type', 'raw': gpu_raw})
    for k, low, high in [('ram_gb', 2, 256), ('ssd_gb', 64, 32768), ('screen_inches', 10, 20), ('weight_kg', .5, 6), ('official_price_cny', 1000, 100000)]:
        if row[k] is not None and not low <= row[k] <= high:
            issues.append({'field': k, 'kind': 'outlier_keep_for_review', 'raw': row[k]})
    url = row['source_url']
    parts = urlsplit(url) if isinstance(url, str) else None
    if not parts or parts.scheme not in ('http', 'https') or not parts.hostname:
        issues.append({'field': 'source_url', 'kind': 'invalid_url', 'raw': url})
        row['source_url'] = None
    elif parts.path in ('', '/'):
        issues.append({'field': 'source_url', 'kind': 'homepage_not_configuration', 'raw': url})
    elif 'buy-mac' in parts.path or 'laptops.html' in parts.path:
        issues.append({'field': 'source_url', 'kind': 'series_page_not_configuration', 'raw': url})
    if row['cpu_model'] in ('骁龙X', '锐龙 9000HX'):
        issues.append({'field': 'cpu_model', 'kind': 'insufficient_model_specificity', 'raw': row['cpu_model']})
    if row['series'] == 'Aliencware': issues.append({'field': 'series', 'kind': 'possible_typo_preserved', 'raw': row['series']})
    image = clean(raw.get('image', raw.get('image_url')))
    if image is not None and not isinstance(image, str):
        issues.append({'field': 'image', 'kind': 'invalid_image', 'raw': image})
        image = None
    row.update(id=identity(row), image=image, battery_wh=None, price_observed_at=None,
               verification_status='导入待核实', quality_issues=issues)
    return row

def convert(source):
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    wb = load_workbook(source, read_only=True, data_only=True)
    products, duplicates, conflicts, sheets, groups = [], [], [], [], {}
    types, missing = defaultdict(Counter), Counter()
    input_rows = 0
    try:
        for sheet in wb:
            values = iter(sheet.values)
            header = list(next(values, ()))
            if not any(v is not None for v in header):
                sheets.append({'sheet': sheet.title, 'status': 'empty'})
                continue
            if len([h for h in header if h is not None]) != len(set(h for h in header if h is not None)) or not (set(MAPPING) - {'os'}).issubset(header):
                raise ValueError(f'{sheet.title}: 实际表头与已确认映射不符，停止；实际={header}')
            sheets.append({'sheet': sheet.title, 'status': 'imported', 'headers': header})
            for index, values_row in enumerate(values, 2):
                if not any(v is not None for v in values_row): continue
                input_rows += 1
                raw = dict(zip(header, values_row))
                for key, value in raw.items():
                    types[key][type(value).__name__] += 1
                    if clean(value) is None: missing[key] += 1
                row = transform(raw)
                entry = {'file': source_reference(source), 'sheet': sheet.title, 'row': index, 'raw': raw}
                row['source_records'] = [entry]
                if row['id'] in groups:
                    old = groups[row['id']]
                    duplicates.append({'id': row['id'], 'row': index, 'first_row': old['source_records'][0]['row']})
                    differences = {k: [old[k], row[k]] for k in MAPPING.values() if old[k] != row[k]}
                    if differences:
                        conflicts.append({'id': row['id'], 'row': index, 'differences': differences})
                        old['quality_issues'].append({'kind': 'duplicate_conflict', 'differences': differences})
                        old['official_price_cny'] = None
                    old['source_records'].append(entry)
                else:
                    groups[row['id']] = row
                    products.append(row)
    finally:
        wb.close()
    links = defaultdict(list)
    for p in products:
        if p['source_url']: links[p['source_url']].append(p)
    shared = [{'url': url, 'models': sorted({p['model'] for p in rows}), 'rows': [p['source_records'][0]['row'] for p in rows]} for url, rows in links.items() if len({p['model'] for p in rows}) > 1]
    for group in shared:
        for p in links[group['url']]: p['quality_issues'].append({'kind': 'shared_url_different_models', 'url': group['url']})
    assert before == hashlib.sha256(source.read_bytes()).hexdigest(), '原始Excel发生改变'
    report = {'source': source_reference(source), 'source_sha256': before, 'source_unchanged': True, 'mapping': MAPPING,
              'sheets': sheets, 'input_rows': input_rows, 'imported_records': len(products), 'brands': dict(Counter(p['brand'] for p in products)),
              'source_types': {k: dict(v) for k, v in types.items()}, 'missing_source_fields': {k: missing[k] for k in MAPPING},
              'os_statistics': dict(Counter(p['os'] if p['os'] is not None else '未提供' for p in products)),
              'absent_optional_fields': [k for k in ('image', 'os', 'battery_wh', 'price_observed_at') if all(p.get(k) is None for p in products)], 'duplicates': duplicates, 'conflicts': conflicts,
              'shared_urls_different_models': shared, 'issues_by_kind': dict(Counter(i['kind'] for p in products for i in p['quality_issues'])),
              'row_issues': [{'id': p['id'], 'row': p['source_records'][0]['row'], 'model': p['model'], 'missing_fields': [k for k in MAPPING.values() if p[k] is None and not (k == 'gpu_model' and p['gpu_type'] == '集成显卡')], 'issues': p['quality_issues']} for p in products if p['quality_issues'] or (p['gpu_type'] == '独立显卡' and p['gpu_model'] is None)],
              'note': '仅用户工作簿导入，不代表重新核验官网价格或销售状态；不包含推荐计算。'}
    return products, report

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', default='../data/电脑数据.xlsx', help='相对于项目根目录；默认读取同级data目录内的唯一原件')
    args = parser.parse_args()
    source = (ROOT / args.input).resolve()
    if not source.is_relative_to(ROOT.parent): raise ValueError('输入文件必须位于项目或同级资料目录内')
    if not source.exists(): raise FileNotFoundError('请将最新版电脑数据.xlsx放到项目同级data目录，不要修改项目内历史副本')
    products, report = convert(source)
    target = ROOT / 'frontend/src/data/catalog.json'
    target.write_text(json.dumps(products, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    out = ROOT / 'data/processed/catalog_import_report.json'
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(json.dumps({k: report[k] for k in ('input_rows', 'imported_records', 'brands', 'missing_source_fields', 'issues_by_kind', 'duplicates', 'conflicts', 'source_unchanged')}, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
