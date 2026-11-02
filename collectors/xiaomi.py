import json
import re

def collect(root):
    path = root / 'notepick/data/raw/mi_20864.html'
    text = path.read_text(encoding='utf-8')
    match = re.search(r'var\s+\$GLOBAL_PAGE_INFO\s*=\s*', text)
    if not match:
        raise ValueError('Xiaomi public page structure changed')
    obj, _ = json.JSONDecoder().raw_decode(text[match.end():])
    # This object is navigation/product-level metadata, not a verified SKU offer.
    (root / 'data/raw/xiaomi_page_metadata.json').write_text(
        json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
    return []
