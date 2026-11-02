"""Real Chromium product journey, against a built and extracted OneOwner site.

The original Combined MPLPB engine decides all answers and page mutations.
No browser result may be claimed without actually running this test.
"""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html', type=Path, required=True)
    parser.add_argument('--browser-executable')
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    html = args.html.resolve()
    if not html.is_file():
        raise SystemExit('Built OneOwner HTML not found')

    from playwright.sync_api import sync_playwright

    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(html.parent)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = 'http://127.0.0.1:%d/' % server.server_port
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)

    def shot(page, name):
        if args.screenshots:
            page.screenshot(path=str(args.screenshots / (name + '.png')), full_page=True)

    try:
        with sync_playwright() as p:
            opts = {'headless': True}
            if args.browser_executable:
                opts['executable_path'] = args.browser_executable
            browser = p.chromium.launch(**opts)
            try:
                context = browser.new_context(viewport={'width': 1440, 'height': 960})
                # Only the served self-contained artifact is needed. An outbound
                # lookup is a product error, never silently enabled.
                outbound = []
                def allow_local(route):
                    if route.request.url.startswith(base):
                        route.continue_()
                    else:
                        outbound.append(route.request.url)
                        route.abort()
                context.route('**/*', allow_local)
                page = context.new_page()
                page.goto(base + html.name, wait_until='domcontentloaded', timeout=90000)
                page.locator('#oneowner-app').wait_for(timeout=90000)
                page.get_by_text('Know what your pages can prove.').wait_for(timeout=90000)
                assert page.locator('#oneowner-launch').count() == 0, 'Old floating panel must be absent'
                assert page.get_by_role('navigation').count() > 0, 'Product needs its own navigation'
                shot(page, 'overview')

                page.locator('button[data-screen="ask"]').click()
                page.locator('#oo-corpus').select_option('logic', timeout=90000)
                page.locator('#oo-question').fill('What is Dungeons and Dragons?')
                page.locator('#oo-ask').click()
                page.get_by_text('SOURCE SUPPORTED', exact=True).wait_for(timeout=90000)
                answer = page.locator('#oo-answer').inner_text()
                assert 'Source citation' in answer and 'Sealed page hash' in answer
                shot(page, 'supported')

                page.locator('#oo-question').fill('unfindable zzzzzzzzz')
                page.locator('#oo-ask').click()
                page.get_by_text('REFUSAL', exact=True).wait_for(timeout=90000)
                answer = page.locator('#oo-answer').inner_text()
                assert 'Sealed page hash' not in answer
                shot(page, 'refusal')

                page.locator('#oo-corpus').select_option('canned')
                page.locator('#oo-question').fill('Phrynomedusa vanzolinii Hyundai Engineering and Construction')
                page.locator('#oo-ask').click()
                page.get_by_text('AMBIGUOUS', exact=True).wait_for(timeout=90000)
                assert 'Sealed page hash' not in page.locator('#oo-answer').inner_text()

                page.locator('button[data-screen="import"]').click()
                page.locator('#oo-new-collection').fill('OneOwner pilot')
                page.locator('#oo-create').click()
                page.get_by_text('COLLECTION CREATED', exact=True).wait_for(timeout=45000)
                selected = page.locator('#oo-corpus').input_value()
                assert selected.startswith('mind-')
                page.locator('#oo-title-input').fill('Pilot notes')
                page.locator('#oo-url-input').fill('https://example.org/pilot')
                page.locator('#oo-text-input').fill('The pilot notes contain supplied text, not verified web evidence.')
                page.locator('#oo-import').click()
                page.get_by_text('IMPORTED THROUGH MPLPB', exact=True).wait_for(timeout=60000)
                shot(page, 'imported')

                # Same source identity invokes original revision/successor path.
                page.locator('#oo-text-input').fill('The pilot notes contain a second retained revision.')
                page.locator('#oo-import').click()
                page.get_by_text('IMPORTED THROUGH MPLPB', exact=True).wait_for(timeout=60000)

                page.locator('button[data-screen="library"]').click()
                page.get_by_text('Pilot notes').first.wait_for(timeout=60000)
                shot(page, 'explore')
                page.locator('button[data-screen="history"]').click()
                page.get_by_text('Retained source and revision history').wait_for(timeout=60000)
                shot(page, 'history')

                # Test a saved browser origin/session: do not silently lose pages.
                page.reload(wait_until='domcontentloaded', timeout=90000)
                page.locator('button[data-screen="history"]').wait_for(timeout=90000)
                page.locator('#oo-corpus').select_option(selected, timeout=90000)
                page.locator('button[data-screen="history"]').click()
                page.get_by_text('Retained source and revision history').wait_for(timeout=60000)
                assert not outbound, 'Product unexpectedly attempted remote requests: ' + str(outbound)
                print('OneOwner own-page Chromium journey: supported, refusal, ambiguity, import, successor, history, persistence and offline-local transport PASSED')
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


if __name__ == '__main__':
    main()
