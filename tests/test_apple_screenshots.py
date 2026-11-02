"""Regression checks against the actual visually read screenshot evidence."""
import copy
import json
import unittest
from scripts.apple_screenshot_test import EVIDENCE, parse


class ScreenshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.items = json.loads((EVIDENCE / 'transcriptions.json').read_text(encoding='utf-8'))

    def test_actual_observed_configurations(self):
        rows = [parse(x) for x in self.items]
        self.assertEqual(len(rows), 16)
        self.assertEqual(len({r['variant_id'] for r in rows}), 16)
        self.assertEqual(rows[0]['gpu_cores'], '8')
        self.assertEqual(rows[0]['official_price_cny'], '9999')
        self.assertEqual(rows[1]['gpu_cores'], '10')
        self.assertEqual(rows[1]['official_price_cny'], '10749')
        self.assertEqual(rows[2]['ssd_gb'], '1024')
        self.assertEqual(rows[-1]['official_price_cny'], '33999')

    def test_missing_information_stays_missing(self):
        rows = [parse(x) for x in self.items]
        self.assertEqual(rows[9]['screen_inches'], '')
        self.assertEqual(rows[10]['screen_inches'], '')
        for row in rows:
            for key in ('spec_url', 'price_url', 'release_year', 'weight_kg', 'battery_wh', 'os'):
                self.assertEqual(row[key], '')
            self.assertEqual(row['verification_status'], '待核实')
            self.assertEqual(row['price_type'], '未知')
        self.assertEqual(rows[11]['cpu_model'], 'Apple M6')
        self.assertEqual(rows[11]['availability_status'], '暂未发售')
        self.assertEqual(rows[11]['ssd_gb'], '')
        self.assertIn('1024GB', rows[11]['notes'])

    def test_unknown_storage_type_still_has_distinct_ids(self):
        item = copy.deepcopy(self.items[11])
        old = parse(item)
        item['transcription'] = item['transcription'].replace('1TB 存储容量', '2TB 存储容量')
        new = parse(item)
        self.assertNotEqual(old['variant_id'], new['variant_id'])
        self.assertEqual(old['ssd_gb'], new['ssd_gb'])

    def test_ambiguous_price_is_not_forced(self):
        item = copy.deepcopy(self.items[0])
        item['transcription'] += '\nRMB 8,999'
        row = parse(item)
        self.assertEqual(row['official_price_cny'], '')
        self.assertEqual(row['price_type'], '')
        self.assertIn('价格数量不唯一', row['notes'])


if __name__ == '__main__': unittest.main()
