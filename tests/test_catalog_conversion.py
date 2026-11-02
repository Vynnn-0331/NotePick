import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from scripts.convert_catalog import ROOT, DEFAULT_SOURCE, convert, transform


class CatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows, cls.report = convert(DEFAULT_SOURCE)

    def test_os_and_intentionally_empty_integrated_gpu(self):
        from collections import Counter
        self.assertEqual(dict(Counter(r['os'] for r in self.rows)), {'macOS': 16, 'Windows': 62})
        for row in self.rows:
            self.assertEqual(row['os'], row['source_records'][0]['raw']['os'])
        for row in self.rows:
            if row['gpu_model'] is None:
                self.assertEqual(row['gpu_type'], '集成显卡')
                self.assertFalse(any(i.get('field') == 'gpu_model' for i in row['quality_issues']))
        raw = self.rows[0]['source_records'][0]['raw']
        self.assertIsNone(transform({**raw, 'os': '  '})['os'])
        self.assertIsNone(transform({**raw, 'os': None})['os'])
        self.assertEqual(transform({**raw, 'os': ' Windows '})['os'], 'Windows')
        self.assertEqual(transform({**raw, 'os': 'Windows'})['id'], transform(raw)['id'])

    def test_actual_workbook(self):
        self.assertEqual(len(self.rows), 78)
        self.assertEqual(len({r['id'] for r in self.rows}), 78)
        self.assertEqual(self.report['missing_source_fields']['GPU_model'], 40)
        self.assertEqual(self.report['duplicates'], [])
        self.assertTrue(self.report['source_unchanged'])
        for row in self.rows:
            self.assertIn('image', row)
            self.assertIsNone(row['image'])
            self.assertEqual(row['cpu_model'], row['source_records'][0]['raw']['CPU_model'].strip())

    def test_stable_id_and_configuration_variants(self):
        raw = self.rows[0]['source_records'][0]['raw']
        base = transform(raw)
        for field in ('ram_gb', 'ssd_gb'):
            updated = {**raw, field: raw[field] * 2}
            self.assertNotEqual(base['id'], transform(updated)['id'])
        self.assertNotEqual(base['id'], transform({**raw, 'CPU_model': 'another CPU'})['id'])
        self.assertNotEqual(base['id'], transform({**raw, 'GPU_model': 'another GPU'})['id'])
        self.assertEqual(base['id'], transform({**raw, 'official_price': 12345, 'weight_kg': 1.3, 'url': 'https://example.com/'})['id'])

    def fake_convert(self, raws):
        class Book(list):
            def close(self): pass
        headers = list(raws[0])
        sheet = SimpleNamespace(title='test', values=[headers] + [[r[k] for k in headers] for r in raws])
        with patch('scripts.convert_catalog.load_workbook', return_value=Book([sheet])):
            return convert(DEFAULT_SOURCE)

    def test_reordering_deduplication_and_price_conflict(self):
        a, b = [copy.deepcopy(r['source_records'][0]['raw']) for r in self.rows[:2]]
        first, _ = self.fake_convert([a, b])
        reverse, _ = self.fake_convert([b, a])
        self.assertEqual([r['id'] for r in first], [r['id'] for r in reversed(reverse)])
        rows, report = self.fake_convert([a, a])
        self.assertEqual(len(rows), 1)
        self.assertEqual(len(rows[0]['source_records']), 2)
        self.assertEqual(len(report['duplicates']), 1)
        self.assertEqual(report['conflicts'], [])
        rows, report = self.fake_convert([a, {**a, 'official_price': 1 + a['official_price']}])
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]['official_price_cny'])
        self.assertEqual(len(report['conflicts']), 1)

    def test_gpu_classification_and_missing(self):
        apple = [r for r in self.rows if r['brand'] == 'Apple']
        self.assertTrue(all(r['gpu_type'] == '集成显卡' for r in apple))
        corrections = [r for r in self.rows if any(i['kind'] == 'corrected_classification' for i in r['quality_issues'])]
        self.assertEqual(len(corrections), 2)
        self.assertTrue(all(r['gpu_type'] == '集成显卡' for r in corrections))
        self.assertTrue(all(r['source_records'][0]['raw']['GPU_Type'] == '独显' for r in corrections))
        self.assertEqual(sum(r['gpu_model'] is None for r in self.rows), 40)

    def test_invalid_values_do_not_become_zero(self):
        raw = self.rows[0]['source_records'][0]['raw']
        row = transform({**raw, 'ram_gb': '不明', 'official_price': -1, 'weight_kg': None})
        self.assertIsNone(row['ram_gb'])
        self.assertIsNone(row['official_price_cny'])
        self.assertIsNone(row['weight_kg'])

    def test_source_raw_and_decimal_prices(self):
        price = next(r for r in self.rows if r['official_price_cny'] == 6191.88)
        self.assertEqual(price['source_records'][0]['raw']['official_price'], 6191.88)
        self.assertEqual(sum(isinstance(r['source_records'][0]['raw']['series'], int) for r in self.rows), 2)
        self.assertTrue(all(isinstance(r['series'], str) for r in self.rows))


if __name__ == '__main__': unittest.main()
