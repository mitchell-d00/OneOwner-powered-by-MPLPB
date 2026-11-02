"""OneOwner real Chromium smoke: strictly product UI on the extracted WASM archive.

Requires playwright==1.58.0 and available Chrome/Chromium. No result from
this test may be claimed unless it actually runs against the product archive.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html', type=Path, required=True)
    parser.add_argument('--browser-executable')
    args=parser.parse_args()
    html=args.html.resolve()
    if not html.is_file(): raise SystemExit('Archive HTML not found')
    from playwright.sync_api import sync_playwright
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_): pass
    server=ThreadingHTTPServer(('127.0.0.1', 0),partial(Handler,directory=str(html.parent)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as p:
            opts={'headless':True}
            if args.browser_executable: opts['executable_path']=args.browser_executable
            browser=p.chromium.launch(**opts)
            try:
                page=browser.new_page()
                page.goto('http://127.0.0.1:%d/%s' % (server.server_port,html.name),wait_until='domcontentloaded')
                page.locator('#oneowner-launch').click(timeout=60_000)
                page.locator('#oneowner-panel select').select_option('logic',timeout=90_000)
                page.locator('#oneowner-panel textarea').fill('What is Dungeons and Dragons?')
                page.get_by_role('button',name='Ask the ledger').click()
                page.get_by_text('SOURCE SUPPORTED',exact=True).wait_for(timeout=90_000)
                # Every supported answer shown in this UI requires both source and hash.
                assert 'Citation:' in page.locator('.oo-result').inner_text()
                assert 'Page seal:' in page.locator('.oo-result').inner_text()
                page.locator('#oneowner-panel textarea').fill('unfindable zzzzzzzzz')
                page.get_by_role('button',name='Ask the ledger').click()
                page.get_by_text('REFUSAL',exact=True).wait_for(timeout=90_000)
                assert 'Page seal:' not in page.locator('.oo-result').inner_text()
                # Imported bytes never count as a validated source answer merely by being present.
                page.get_by_role('button',name='Import / Revise').click()
                page.get_by_label('New collection name').fill('OneOwner pilot')
                page.get_by_role('button',name='Create collection').click()
                page.get_by_text('Collection created:').wait_for(timeout=45_000)
                page.get_by_label('Source title').fill('Pilot notes')
                page.get_by_label('Actual HTTPS source URL').fill('https://example.org/pilot')
                page.get_by_label('Paste source text').fill('The test topic is a demonstration page.')
                page.get_by_role('button',name='Import or create successor').click()
                page.get_by_text('Imported through the existing seal / revision pipeline.').wait_for(timeout=45_000)
                page.get_by_role('button',name='History',exact=True).click()
                page.get_by_role('button',name='Show retained history').click()
                page.get_by_text('Source capture and revision history').wait_for(timeout=45_000)
                print('OneOwner extracted archive browser smoke passed.')
            finally:browser.close()
    finally:
        server.shutdown();server.server_close();thread.join(timeout=2)

if __name__=='__main__':main()
