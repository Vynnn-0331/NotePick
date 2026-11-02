"""Offline inspection of saved official evidence. No inferred prices."""
import csv
import hashlib
import html
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TZ = timezone(timedelta(hours=8))
EXPECTED = ('variant_id brand series model model_code record_level release_year category os '
            'cpu_brand cpu_model cpu_cores gpu_model gpu_type gpu_cores ram_gb memory_type '
            'ssd_gb screen_inches resolution_width resolution_height refresh_hz panel_type '
            'weight_kg battery_wh thickness_mm ports wifi_version touchscreen configuration_type '
            'official_price_cny price_type price_url spec_url image_url availability_status '
            'collected_at collection_method verification_status notes').split()


def read_schema():
    with (ROOT.parent / 'NotePick_笔记本数据采集模板.csv').open(encoding='utf-8-sig', newline='') as f:
        columns = next(csv.reader(f))
    with (ROOT.parent / 'NotePick_字段说明.csv').open(encoding='utf-8-sig', newline='') as f:
        descriptions = list(csv.DictReader(f))
    if columns != EXPECTED or [d['字段名'] for d in descriptions] != columns:
        raise ValueError('模板或字段说明存在差异，停止输出；原模板未修改。')
    return columns


def text(fragment):
    return html.unescape(re.sub('<[^>]+>', '', fragment)).strip()


def capacity(value):
    match = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(TB|T|GB|G)?(?:\s+SSD)?\s*', value, re.I)
    if not match:
        raise ValueError('无法识别的容量: ' + value)
    n = float(match[1]) * (1024 if (match[2] or '').upper() in ('T', 'TB') else 1)
    if n <= 0 or not n.is_integer():
        raise ValueError('容量应为正整数 GB')
    return int(n)


def parse_saved(source):
    content = source.read_text(encoding='utf-8')
    cells = [text(v) for v in re.findall(r'<div class="col_one[^\"]*">(.*?)</div>', content, re.S)]
    if len(cells) % 2:
        raise ValueError('规格表结构变化，拒绝猜测')
    specs = dict(zip(cells[::2], cells[1::2]))
    desc = re.search(r'id="div_product_dec"[^>]*>(.*?)</div>', content, re.S)
    title = re.search(r'<title>(.*?)</title>', content, re.S)
    if not desc or not title or '356H' not in specs.get('CPU型号', ''):
        raise ValueError('样本身份校验失败')
    row = dict.fromkeys(EXPECTED, '')
    row.update(variant_id='lenovo:1052925', brand='Lenovo', series='小新Pro14',
               model=text(title[1]).split('_')[0], model_code='1052925', record_level='sku',
               os=specs.get('操作系统', ''), cpu_brand='Intel', cpu_model=specs['CPU型号'],
               ram_gb=capacity(specs['内存容量']), ssd_gb=capacity(specs['硬盘容量']),
               gpu_type=specs.get('显卡类型', ''), availability_status='未知',
               spec_url='https://item.lenovo.com.cn/product/1052925.html',
               collected_at=datetime.fromtimestamp(source.stat().st_mtime, TZ).isoformat(timespec='seconds'),
               collection_method='crawler', verification_status='待核实',
               notes='官方商品ID为1052925，非MTM；'+specs.get('产品型号', '')+'；'+text(desc[1])+
               '；动态价格未取得，价格留空；未确认在售状态；禁止用于价格推荐。')
    for key, label, unit in [('screen_inches', '屏幕尺寸', '英寸'), ('refresh_hz', '屏幕刷新率', 'Hz'),
                              ('battery_wh', '电池类型', 'Wh')]:
        m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*' + unit, specs.get(label, ''), re.I)
        if m:
            row[key] = m[1]
    res = re.fullmatch(r'(\d+)[x×](\d+)', specs.get('屏幕分辨率', ''))
    if res:
        row['resolution_width'], row['resolution_height'] = res.groups()
    return row


def write_csv(path, columns, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def main():
    columns = read_schema()
    rows, errors = [], []
    try:
        rows.append(parse_saved(ROOT / 'data/raw/product_1052925.html'))
    except (OSError, ValueError, KeyError) as exc:
        errors.append(str(exc))
    out = ROOT / 'data/processed'
    write_csv(out / 'laptops_sample.csv', columns, rows)
    write_csv(out / 'pending_review.csv', columns, rows)
    required = ['brand', 'model', 'model_code', 'cpu_model', 'gpu_model', 'ram_gb', 'ssd_gb', 'spec_url']
    report = {
        'generated_at': datetime.now(TZ).isoformat(timespec='seconds'),
        'schema_fields': len(columns), 'template_matches': True,
        'records': len(rows), 'brands': len({r['brand'] for r in rows}),
        'sku_records': sum(r['record_level'] == 'sku' for r in rows),
        'priced_records': 0, 'price_completeness': 0 if rows else None,
        'pending_review': len(rows), 'human_verified': 0,
        'missing_rates': {k: sum(not r[k] for r in rows) / len(rows) if rows else None for k in required},
        'configuration_price_validation_passed': False,
        'same_model_multiple_configurations_validated': False,
        'errors': errors,
        'limitation': '仅一个真实配置的离线解析通过，价格匹配和同型号多配置验证未通过；不进入批量阶段。',
    }
    (out / 'quality_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    manifest = [{'file': p.name, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
                 'saved_at': datetime.fromtimestamp(p.stat().st_mtime, TZ).isoformat(timespec='seconds')}
                for p in sorted((ROOT / 'data/raw').iterdir()) if p.is_file()]
    (ROOT / 'data/evidence_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
