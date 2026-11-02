"""Bounded source availability checks, never a bypass or private API probe."""
import json
import hashlib
import time
from pathlib import Path
import requests
from collect import ROOT, now

URLS = {
    'ASUS': 'https://www.asus.com.cn/robots.txt',
    'Dell': 'https://www.dell.com/zh-cn/shop/笔记本/scr/laptop',
    'HP': 'https://www.hp.com/cn-zh/shop/',
}

def main():
    output = ROOT / 'logs/availability.json'
    if output.exists():
        print('已有检查记录；不自动重试受限来源。查看 logs/availability.json。')
        return
    checks = []
    for brand, url in URLS.items():
        event = {'brand': brand, 'url': url, 'checked_at': now()}
        try:
            response = requests.get(url, timeout=(10, 25), headers={'User-Agent': 'NotePickCourseResearch/0.1'}, allow_redirects=False)
            event.update(status=response.status_code, response_sha256=hashlib.sha256(response.content).hexdigest())
            # Failed responses are diagnostics, not product evidence. Do not save cookies or headers.
            path = ROOT / 'data/raw' / (brand.lower() + '_availability.html')
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(response.content)
            event['raw_file'] = str(path.relative_to(ROOT))
            event['action'] = '停止；需要人工核验' if response.status_code != 200 else '仅检查访问成功；不代表获准批量采集'
        except requests.RequestException as exc:
            event.update(error=str(exc), action='停止；不重试')
        checks.append(event)
        time.sleep(2)
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(checks, ensure_ascii=False, indent=2))

if __name__ == '__main__': main()
