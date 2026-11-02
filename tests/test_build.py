import importlib.util
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location('oneowner_build',Path(__file__).parents[1]/'scripts/build_oneowner.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

class BuildTests(unittest.TestCase):
    def test_overlay_is_additive_and_deterministic(self):
        html='<html><head></head><body><script>window.MPLPB={}</script></body></html>'
        result=module.overlay(html)
        self.assertEqual(result.count('oneowner-adapter'),1)
        self.assertEqual(result.count('/* oneowner-panel: CSP compatible */'),1)
        self.assertIn('window.MPLPB={}',result)
        self.assertEqual(module.overlay(html),result)
        with self.assertRaises(ValueError): module.overlay(result)

    def test_invalid_source_is_rejected(self):
        for doc in ('<html></html>', '<head></head><body></body></body>'):
            with self.assertRaises(ValueError):module.overlay(doc)
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'source.html';source.write_text('<html><head></head><body></body></html>')
            with self.assertRaises(ValueError):module.write_overlay(source,Path(folder)/'out.html')

    def test_pinned_upstream_is_required(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(ValueError):module.verified_engine(folder)

if __name__ == '__main__':unittest.main()
