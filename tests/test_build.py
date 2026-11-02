import importlib.util
import re
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
        self.assertIn('oneowner-chat: CSP compatible', result)
        self.assertIn('oneowner-learn: CSP compatible', result)
        self.assertIn('OneOwnerLearn', result)
        self.assertIn('Four steps to get comfortable', result)
        self.assertIn('oneowner-capture: CSP compatible', result)
        self.assertIn('OneOwnerSourceCapture', result)
        self.assertIn('Read and save snapshot', result)
        self.assertIn('window.OneOwnerChat', result)
        self.assertIn('Chat with your information', result)
        self.assertIn('panel.append(composer, networkRow, networkHint)', result)
        self.assertIn("input.id = 'oo-chat-input'", result)
        self.assertIn("sendBtn.id = 'oo-chat-send'", result)
        self.assertIn('window.MPLPB={}', result)
        self.assertEqual(len(re.findall(r'<script>(.*?)</script>', result, flags=re.S)), 1)
        self.assertEqual(result.count('</script>'), 1)
        self.assertNotIn('oneowner-launch', result)
        self.assertEqual(module.overlay(html), result)
        with self.assertRaises(ValueError):
            module.overlay(result)

    def test_wasm_bundle_and_original_script_shape_are_preserved(self):
        sample = ('<html><head></head><body>'
                  '<script id="mplpb-runtime-bundle" type="application/json">{}</script>'
                  '<script>\nwindow.MPLPB={};\n</script></body></html>')
        adapted = module.overlay(sample)
        self.assertEqual(adapted.count('<script>'), 1)
        self.assertEqual(adapted.count('<script id="mplpb-runtime-bundle"'), 1)
        self.assertEqual(len(re.findall(r'<script>(.*?)</script>', adapted, flags=re.S)), 1)
        self.assertLess(adapted.index('window.MPLPB={}'), adapted.index('oneowner-adapter'))
        self.assertLess(adapted.index('/* oneowner-adapter: CSP compatible */'), adapted.index('/* oneowner-capture: CSP compatible */'))
        self.assertLess(adapted.index('/* oneowner-capture: CSP compatible */'), adapted.index('/* oneowner-chat: CSP compatible */'))
        self.assertLess(adapted.index('/* oneowner-chat: CSP compatible */'), adapted.index('/* oneowner-learn: CSP compatible */'))
        self.assertLess(adapted.index('/* oneowner-learn: CSP compatible */'), adapted.index('/* oneowner-app: CSP compatible */'))

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
