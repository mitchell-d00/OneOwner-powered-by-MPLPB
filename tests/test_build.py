import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location(
    'oneowner_build', Path(__file__).parents[1] / 'scripts/build_oneowner.py'
)
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class BuildTests(unittest.TestCase):
    def test_product_is_full_page_and_deterministic(self):
        html = '<html><head></head><body><script>window.MPLPB={}</script></body></html>'
        result = module.overlay(html)
        self.assertIn('OneOwner dedicated page:', result)
        self.assertIn('body > :not(#oneowner-app)', result)
        self.assertIn('oo-sidebar', result)
        self.assertIn('oo-nav', result)
        self.assertIn('oneowner-app: CSP compatible', result)
        self.assertIn('window.MPLPB={}', result)
        self.assertNotIn('oneowner-launch', result)
        self.assertEqual(module.overlay(html), result)
        with self.assertRaises(ValueError):
            module.overlay(result)

    def test_source_shape_and_hash_fail_closed(self):
        for doc in ('<html></html>', '<head></head><body></body></body>'):
            with self.assertRaises(ValueError):
                module.overlay(doc)
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / 'source.html'
            source.write_text('<html><head></head><body></body></html>')
            with self.assertRaises(ValueError):
                module.write_overlay(source, Path(folder) / 'out.html')

    def test_pinned_upstream_is_required(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):
                module.verified_engine(folder)


if __name__ == '__main__':
    unittest.main()
