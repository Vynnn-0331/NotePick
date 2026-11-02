import copy
import tempfile
import unittest
from pathlib import Path
import collect


def sample():
    return dict(brand='Lenovo', series='test', model='test', model_code='test', record_level='sku',
                cpu_model='test CPU', gpu_model='test GPU', ram_gb='16GB', ssd_gb='1TB',
                screen_inches='14', os='Windows', spec_url='https://item.lenovo.com.cn/product/test.html',
                collected_at='2026-10-28T10:00:00+08:00', collection_method='crawler')


class PipelineTests(unittest.TestCase):
    def test_units_and_stable_identity(self):
        raw = sample()
        a = collect.normalize(dict(raw, weight_kg='1250g', thickness_mm='1.6cm'))
        b = collect.normalize(dict(raw, ssd_gb='1024', ram_gb='16'))
        self.assertEqual(a['ssd_gb'], '1024')
        self.assertEqual(a['weight_kg'], '1.25')
        self.assertEqual(a['thickness_mm'], '16')
        self.assertEqual(a['variant_id'], b['variant_id'])
        self.assertNotEqual(a['variant_id'], collect.normalize(dict(raw, os='HarmonyOS'))['variant_id'])
        self.assertNotEqual(a['variant_id'], collect.normalize(dict(raw, ram_gb='32'))['variant_id'])

    def test_price_guards(self):
        for updates in [dict(record_level='series'), dict(price_type='系列起售价'), dict(price_type='教育优惠价'), dict(price_url='https://evil.test/'), dict(gpu_model='')]:
            raw = dict(sample(), official_price_cny='5999', price_type='官网公开售价', price_url='https://item.lenovo.com.cn/product/test.html')
            raw.update(updates)
            with self.assertRaises(ValueError): collect.normalize(raw)

    def test_human_priority_and_no_false_verification(self):
        raw = dict(sample(), official_price_cny='5999', price_type='官网公开售价', price_url='https://item.lenovo.com.cn/product/test.html', verification_status='已核实')
        auto = collect.normalize(dict(raw, official_price_cny='6999', collected_at='2026-10-29T10:00:00+08:00'))
        human = collect.normalize(raw, manual=True)
        self.assertEqual(auto['verification_status'], '待核实')
        for rows in ([human, auto], [auto, human]):
            result, conflicts = collect.merge(rows)
            self.assertEqual(result[0]['official_price_cny'], '5999')
            self.assertEqual(result[0]['verification_status'], '已核实')
            self.assertTrue(conflicts)

    def test_csv_excel_roundtrip(self):
        from openpyxl import Workbook
        row = collect.normalize(sample())
        with tempfile.TemporaryDirectory(dir=collect.ROOT / 'tests') as d:
            path = Path(d) / 'input.csv'
            collect.write_csv(path, [row])
            self.assertTrue(path.read_bytes().startswith(b'\xef\xbb\xbf'))
            self.assertEqual(collect.read_table(path), [row])
            book = Workbook()
            book.active.append(collect.schema())
            book.active.append([row[k] for k in collect.schema()])
            xlsx = Path(d) / 'input.xlsx'
            book.save(xlsx)
            imported = collect.normalize(collect.read_table(xlsx)[0], manual=True)
            self.assertEqual(imported['variant_id'], row['variant_id'])

    def test_missing_time_and_fake_domains(self):
        for patch in [dict(collected_at=''), dict(collected_at='2026-10-28T10:00:00'), dict(spec_url='https://lenovo.com.cn.evil.test/')]:
            with self.assertRaises(ValueError): collect.normalize({**sample(), **patch})


if __name__ == '__main__': unittest.main()
