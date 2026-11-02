import json

def collect(root):
    # Only selected unambiguous fields from the accessible official techspec page.
    # The source explicitly lists alternatives: never expand the memory options.
    path = root / 'data/evidence/asus_series.json'
    return json.loads(path.read_text(encoding='utf-8')) if path.exists() else []
