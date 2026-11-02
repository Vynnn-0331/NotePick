"""One-shot evidence collection and conservative CSV/XLSX import. Python 3.10+."""
import argparse
import csv
import hashlib
import importlib
import json
import re
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
TZ = timezone(timedelta(hours=8))
BRANDS = ['lenovo', 'xiaomi', 'apple', 'asus', 'huawei', 'dell', 'hp']
IDENTITY = 'brand model model_code record_level os cpu_model cpu_cores gpu_model gpu_cores ram_gb memory_type ssd_gb screen_inches resolution_width resolution_height refresh_hz panel_type touchscreen'.split()
REQUIRED = 'brand series model record_level cpu_model gpu_model ram_gb ssd_gb screen_inches spec_url collected_at'.split()
DOMAINS = {'Lenovo': ['lenovo.com.cn', 'lenovo.com'], 'Xiaomi': ['mi.com'], 'Apple': ['apple.com.cn'], 'ASUS': ['asus.com.cn'], 'Huawei': ['huawei.com', 'vmall.com'], 'Dell': ['dell.com'], 'HP': ['hp.com']}

def now():
    return datetime.now(TZ).isoformat(timespec='seconds')

def schema():
    with (ROOT / 'NotePick_笔记本数据采集模板.csv').open(encoding='utf-8-sig', newline='') as f:
        fields = next(csv.reader(f))
    with (ROOT / 'NotePick_字段说明.csv').open(encoding='utf-8-sig', newline='') as f:
        descriptions = list(csv.DictReader(f))
    if len(fields) != 40 or [r['字段名'] for r in descriptions] != fields:
        raise ValueError('模板必须为一致的40字段')
    return fields

def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    with temp.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=schema())
        writer.writeheader()
        writer.writerows(rows)
    temp.replace(path)

def read_table(path):
    if path.suffix.lower() == '.xlsx':
        from openpyxl import load_workbook
        wb = load_workbook(path, read_only=True, data_only=True)
        try:
            values = iter(wb.active.values)
            header = list(next(values))
            if header != schema():
                raise ValueError('Excel表头必须与40字段模板完全一致')
            return [dict(zip(header, row)) for row in values if any(v is not None for v in row)]
        finally:
            wb.close()
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != schema():
            raise ValueError('CSV表头必须与40字段模板完全一致')
        return list(reader)

def official(url, brand):
    parsed = urlparse(url)
    return parsed.scheme == 'https' and any(parsed.hostname == d or (parsed.hostname or '').endswith('.' + d) for d in DOMAINS.get(brand, []))

def normalize(raw, manual=False):
    row = {k: str(raw.get(k, '') if raw.get(k) is not None else '').strip() for k in schema()}
    if not row['brand'] or not row['model'] or not official(row['spec_url'], row['brand']):
        raise ValueError('需要品牌、型号及该品牌HTTPS官方规格链接')
    if row['record_level'] not in ('sku', 'series'):
        raise ValueError('record_level仅允许sku/series')
    if not row['collected_at']:
        raise ValueError('必须提供实际查看/采集时间，不以导入时间冒充')
    if datetime.fromisoformat(row['collected_at']).utcoffset() is None:
        raise ValueError('采集时间必须有时区')
    for key in ('ram_gb', 'ssd_gb'):
        if row[key]:
            m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(TB|T|GB|G)?(?:\s*SSD)?', row[key], re.I)
            if not m:
                raise ValueError(key + ': 不能识别容量或含多个可选值')
            number = float(m[1]) * (1024 if (m[2] or '').upper() in ('T', 'TB') else 1)
            if number <= 0 or not number.is_integer():
                raise ValueError(key + ': 容量必须为正整数GB')
            row[key] = str(int(number))
    units = {'weight_kg': ('kg', 'g'), 'thickness_mm': ('mm', 'cm'), 'screen_inches': ('英寸', 'inch'), 'battery_wh': ('Wh',), 'refresh_hz': ('Hz',)}
    numeric = 'cpu_cores gpu_cores resolution_width resolution_height'.split()
    for key in list(units) + numeric:
        if not row[key]:
            continue
        m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(' + '|'.join(units.get(key, ('',))) + r')?', row[key], re.I)
        if not m or float(m[1]) <= 0:
            raise ValueError(key + ': 非法数值')
        value = float(m[1])
        unit = (m[2] or '').lower()
        if key == 'weight_kg' and unit == 'g': value /= 1000
        if key == 'thickness_mm' and unit == 'cm': value *= 10
        if key in numeric and not value.is_integer(): raise ValueError(key + ': 必须为整数')
        row[key] = format(value, 'g')
    if row['official_price_cny']:
        price = re.sub(r'[,，￥¥\s]', '', row['official_price_cny']).removesuffix('元')
        if not re.fullmatch(r'\d+(?:\.\d{1,2})?', price) or float(price) <= 0:
            raise ValueError('价格必须为正数，不允许起售价或条件价文本')
        if row['record_level'] != 'sku' or row['price_type'] not in ('官网公开售价', '建议零售价'):
            raise ValueError('只有具体SKU的明确普通公开价或建议零售价可填写价格')
        if not official(row['price_url'], row['brand']) or any(not row[k] for k in ('cpu_model', 'gpu_model', 'ram_gb', 'ssd_gb', 'screen_inches')):
            raise ValueError('价格缺少官方来源或完整配置；请先留空')
        row['official_price_cny'] = format(float(price), 'g')
    else:
        row['price_type'] = row['price_url'] = ''
    if manual:
        row['collection_method'] = 'manual'
        if row['verification_status'] not in ('待核实', '已核实', '有冲突'):
            row['verification_status'] = '待核实'
    else:
        row['verification_status'] = '待核实'
    # Full configuration fingerprint, including OS and display; excludes colour/price.
    complete = row['record_level'] == 'sku' and all(row[k] for k in ('cpu_model', 'gpu_model', 'ram_gb', 'ssd_gb', 'screen_inches'))
    identity = '|'.join(row[k].casefold() for k in IDENTITY if not (complete and k == 'model_code'))
    row['variant_id'] = row['brand'].lower() + ':' + hashlib.sha256(identity.encode()).hexdigest()[:20]
    return row

def merge(rows):
    out, conflicts = {}, []
    for row in rows:
        key = row['variant_id']
        if key not in out:
            out[key] = row
            continue
        old = out[key]
        priority = lambda x: (x['collection_method'] == 'manual' and x['verification_status'] == '已核实', x['collection_method'] == 'manual', x['collected_at'])
        differences = {k: [old[k], row[k]] for k in schema() if old[k] and row[k] and old[k] != row[k] and k not in ('collected_at', 'collection_method', 'notes', 'verification_status')}
        if differences:
            conflicts.append({'variant_id': key, 'differences': differences})
        # Keep the winning evidence row intact; never backfill a price from another row.
        if priority(row) > priority(old): out[key] = row
    return list(out.values()), conflicts

def run(import_paths):
    fields = schema()
    out = ROOT / 'data/processed'
    errors, rows, events = [], [], []
    previous = out / 'laptops_collected.csv'
    if previous.exists():
        # Existing manually verified data retains its authority.
        for raw in read_table(previous):
            rows.append(normalize(raw, manual=raw['collection_method'] == 'manual'))
    for brand in BRANDS:
        try:
            found = importlib.import_module('collectors.' + brand).collect(ROOT)
            rows.extend(normalize(r) for r in found)
            events.append({'brand': brand, 'parsed_records': len(found), 'status': 'parsed_saved_evidence' if found else 'no_usable_configuration'})
        except Exception as exc:
            errors.append({'brand': brand, 'error': str(exc)})
    for path in import_paths:
        # Validate entire import before committing anything.
        imported = [normalize(r, manual=True) for r in read_table(Path(path))]
        rows.extend(imported)
    rows, conflicts = merge(rows)
    write_csv(previous, rows)
    write_csv(ROOT / 'data/manual/manual_import_template.csv', [])
    pending = [r for r in rows if r['verification_status'] != '已核实' or not r['official_price_cny'] or any(not r[k] for k in REQUIRED)]
    write_csv(out / 'pending_review.csv', pending)
    ready = [r for r in rows if r['record_level'] == 'sku' and r['verification_status'] == '已核实' and all(r[k] for k in REQUIRED)]
    write_csv(out / 'laptops_ready.csv', ready)
    counts = lambda rs: {'records': len(rs), 'sku_records': sum(r['record_level'] == 'sku' for r in rs), 'priced_records': sum(bool(r['official_price_cny']) for r in rs), 'price_match_rate': sum(bool(r['official_price_cny']) for r in rs) / len(rs) if rs else None, 'missing_rates': {k: sum(not r[k] for r in rs) / len(rs) if rs else None for k in fields}}
    source_file = ROOT / 'logs/source_status.json'
    sources = json.loads(source_file.read_text(encoding='utf-8'))['checks'] if source_file.exists() else []
    report = {'generated_at': now(), 'schema_fields': len(fields), **counts(rows), 'brands': len({r['brand'] for r in rows}), 'series': len({(r['brand'], r['series']) for r in rows}), 'pending_review': len(pending), 'recommendation_ready': len(ready), 'human_verified': sum(r['verification_status'] == '已核实' for r in rows), 'by_brand': {b: counts([r for r in rows if r['brand'].lower() == b]) for b in BRANDS}, 'source_checks': sources, 'errors': errors, 'conflicts': conflicts, 'events': events, 'limitation': '采集结果不代表已人工核实；空价格不得用于价格排序；series不得作为SKU推荐。'}
    (out / 'quality_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'logs').mkdir(exist_ok=True)
    with (ROOT / 'logs/runs.jsonl').open('a', encoding='utf-8') as f:
        f.write(json.dumps(report, ensure_ascii=False) + '\n')
    print(json.dumps({k: report[k] for k in ('records', 'brands', 'series', 'sku_records', 'priced_records', 'pending_review', 'recommendation_ready', 'errors')}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--import-file', action='append', default=[], help='40字段CSV或XLSX，可重复指定')
    args = parser.parse_args()
    run(args.import_file)
