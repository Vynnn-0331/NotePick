import importlib.util
from pathlib import Path

def collect(root):
    script = root / 'notepick/scripts/verify_sample.py'
    spec = importlib.util.spec_from_file_location('legacy_sample', script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    path = root / 'notepick/data/raw/product_1052925.html'
    row = module.parse_saved(path)
    import json
    manifest = json.loads((root / 'notepick/data/evidence_manifest.json').read_text(encoding='utf-8'))
    row['collected_at'] = next(x['saved_at'] for x in manifest if x['file'] == path.name)
    return [row]
