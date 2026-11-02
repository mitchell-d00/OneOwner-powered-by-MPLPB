"""Synthetic first-time user evaluation of the ACTUAL OneOwner full-page UI and MPLPB.

This is scripted developer validation, NOT independent human usability research.
Scenarios exercise policy evidence, exceptions, revisions, competing claims, refusal,
local storage, and offline use through human-visible product controls. The original
window.MPLPB is used only to verify postconditions and lineage, never to perform
a simulated user's writes/queries.

Run against an EXTRACTED validated OneOwner HTML artifact, not a source mock.
"""
import argparse
import hashlib
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
from urllib.parse import urlsplit

ORIGINAL = 'Study registration requires a booking and two approvals unless a waiver applies.'
REVISED = 'Study registration requires a booking and three approvals unless a waiver applies.'
QUESTION = 'What does study registration require?'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html', type=Path, required=True)
    parser.add_argument('--browser-executable')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    html = args.html.resolve()
    if not html.is_file():
        raise SystemExit('Extracted OneOwner HTML not found')
    if args.output.exists():
        raise SystemExit('Choose a fresh synthetic-user report path')
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    from playwright.sync_api import sync_playwright, expect

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(html.parent)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = 'http://127.0.0.1:%d/' % server.server_port
    report = {
        'schema': 'oneowner-synthetic-user-product-v1',
        'artifact_html_sha256': hashlib.sha256(html.read_bytes()).hexdigest(),
        'human_validation': False,
        'scenarios': [],
        'checks': [],
        'unexpected_outbound_urls': [],
        'page_errors': [],
        'outcome': 'INCOMPLETE',
        'limitations': [
            'Scripted personas and predetermined questions are not independent human participants',
            'Findability and wording assertions are proxies, not an observed ease-of-use score',
            'Synthetic source text and HTTPS example.org URLs are developer fixtures, not authenticated fetched documents',
            'This run does not assess factual truth or unrestricted natural-language comprehension'
        ]
    }
    def check(name, condition, reason=''):
        ok = bool(condition)
        report['checks'].append({'check': name, 'passed': ok, 'detail': reason})
        if not ok:
            raise AssertionError(name + (': ' + reason if reason else ''))
    def shot(page, name):
        if args.screenshots:
            page.screenshot(path=str(args.screenshots/(name+'.png')), full_page=True)
    def nav(page, name):
        button = page.locator('#oo-nav').get_by_role('button', name=name, exact=True)
        expect(button).to_be_visible(timeout=30000)
        button.click()
    def engine(page, method, *arguments):
        # Inspect only. Synthetic user actions MUST use the OneOwner UI.
        outcome = page.evaluate('async ([name,args]) => await window.MPLPB[name](...args)', [method, list(arguments)])
        if not outcome.get('ok'):
            raise AssertionError(method + ' postcondition rejected: ' + json.dumps(outcome)[:200])
        return outcome['data']
    def ask(page, question):
        nav(page, 'Ask · cited answers')
        q = page.locator('#oo-question')
        expect(q).to_be_visible()
        q.fill(question)
        page.locator('#oo-ask').click()
        expect(page.locator('#oo-answer .oo-pill')).to_be_visible(timeout=60000)
        return page.locator('#oo-answer')

    try:
        with sync_playwright() as playwright:
            opts = {'headless': True, 'args': ['--no-sandbox', '--disable-dev-shm-usage']}
            if args.browser_executable:
                opts['executable_path'] = args.browser_executable
            browser = playwright.chromium.launch(**opts)
            report['browser_version'] = browser.version
            try:
                context = browser.new_context(viewport={'width': 1280, 'height': 900})
                def local_only(route):
                    url = route.request.url
                    if url.startswith(base) or url.startswith(('data:', 'blob:')):
                        route.continue_()
                    else:
                        report['unexpected_outbound_urls'].append(url)
                        route.abort()
                context.route('**/*', local_only)
                page = context.new_page()
                page.on('pageerror', lambda e: report['page_errors'].append(str(e)))
                try:
                    page.goto(base + html.name, wait_until='domcontentloaded', timeout=120000)
                    page.wait_for_function(
                        "() => document.querySelector('#oo-notice')?.dataset.kind === 'ok'",
                        timeout=150000
                    )
                    check('independent_product_not_a_floating_research_panel',
                          page.locator('#oneowner-app').count()==1 and
                          page.locator('#oneowner-launch').count()==0 and
                          page.locator('#oo-nav').count()==1)
                    check('novice_can_identify_primary_tasks',
                          all(page.locator('#oo-nav').get_by_role('button', name=name, exact=True).count()==1
                              for name in ['Overview','Chat','Ask · cited answers','Explore pages','Add or revise','History','About']))
                    check('plain_language_first_screen',
                          'Know what your pages can prove.' in page.locator('#oo-screen').inner_text() and
                          'No eligible owner' in page.locator('#oo-screen').inner_text())
                    shot(page, '01-newcomer-overview')
                    report['scenarios'].append({
                        'persona': 'newcomer',
                        'task': 'Find Ask, Add or revise, and understand that not every question gets an answer',
                        'ui_only': True,
                        'result': 'completed'
                    })

                    # Synthetic researcher: create a collection and import a substantive,
                    # bounded policy with a waiver exception. Do not invoke engine writes.
                    nav(page, 'Add or revise')
                    expect(page.get_by_label('Collection name', exact=True)).to_be_visible()
                    page.locator('#oo-new-collection').fill('Study registration policies')
                    page.locator('#oo-create').click()
                    expect(page.locator('#oo-new-result')).to_contain_text('COLLECTION CREATED', timeout=60000)
                    corpus = page.locator('#oo-corpus').input_value()
                    check('collection_created_via_understandable_form', corpus.startswith('mind-'))
                    source_url = 'https://example.org/oneowner-synthetic/study-registration'
                    page.locator('#oo-title-input').fill('Study registration')
                    page.locator('#oo-url-input').fill(source_url)
                    page.locator('#oo-text-input').fill(ORIGINAL)
                    page.locator('#oo-import').click()
                    expect(page.locator('#oo-import-result')).to_contain_text('IMPORTED THROUGH MPLPB', timeout=60000)
                    import_record = page.locator('#oo-import-result').text_content() or ''
                    check('source_provenance_not_misrepresented',
                          'unknown' in import_record and 'user-pasted-text' in import_record)
                    check('authorship_and_capture_transport_are_explained_without_opening_debug_trace',
                          'Recorded authorship: unknown' in page.locator('#oo-import-result').inner_text() and
                          'Capture method: user-pasted-text' in page.locator('#oo-import-result').inner_text())
                    check('original_engine_was_not_rewritten',
                          '"engine_changed": false' in import_record)
                    shot(page, '02-source-import')

                    first_page = ask(page, QUESTION)
                    expect(first_page).to_contain_text('SOURCE SUPPORTED', timeout=60000)
                    expect(first_page).to_contain_text(ORIGINAL)
                    first_visual = first_page.inner_text()
                    check('useful_policy_with_exception_is_answered',
                          ORIGINAL in first_visual and 'Source citation' in first_visual and
                          'Sealed page hash' in first_visual and 'decision trace' in first_visual.lower())
                    original_answer = engine(page, 'query', QUESTION, {'corpus': corpus})['reader']
                    check('ui_matches_actual_engine_decision',
                          original_answer['kind']=='return' and original_answer['text']==ORIGINAL and
                          original_answer['hash'] in first_visual)
                    shot(page, '03-source-supported-policy')
                    report['scenarios'].append({
                        'persona': 'policy_researcher',
                        'task': 'Create collection, import policy with an exception, ask and verify evidence',
                        'ui_only': True,
                        'engine_postconditions': 'verified separately',
                        'result': 'completed'
                    })

                    # Unsupported information must never be invented, even when
                    # superficially plausible to a novice user.
                    missing = ask(page, 'What does the unrecorded Mars travel budget require?')
                    expect(missing).to_contain_text('REFUSAL', timeout=60000)
                    check('clear_refusal_without_fabricated_citation',
                          'No supported answer' in missing.inner_text() and
                          'Sealed page hash' not in missing.inner_text())
                    check('refusal_offers_understandable_next_steps',
                          missing.get_by_role('button', name='Explore pages').count()==1 and
                          missing.get_by_role('button', name='Add a source').count()==1 and
                          'cannot be supplied from outside this ledger' in missing.inner_text())
                    shot(page, '04-refusal')

                    # Synthetic editor: same title + URL should create a successor,
                    # change the policy answer, and invalidate the old citation.
                    nav(page, 'Add or revise')
                    page.locator('#oo-title-input').fill('Study registration')
                    page.locator('#oo-url-input').fill(source_url)
                    page.locator('#oo-text-input').fill(REVISED)
                    page.locator('#oo-import').click()
                    expect(page.locator('#oo-import-result')).to_contain_text('IMPORTED THROUGH MPLPB', timeout=60000)
                    updated = ask(page, QUESTION)
                    expect(updated).to_contain_text('SOURCE SUPPORTED', timeout=60000)
                    expect(updated).to_contain_text(REVISED)
                    updated_engine = engine(page, 'query', QUESTION, {'corpus': corpus})['reader']
                    check('successor_updates_answer_and_changes_seal',
                          updated_engine['text']==REVISED and original_answer['hash']!=updated_engine['hash'])
                    old = page.evaluate(
                        'async ([path,corpus]) => await window.MPLPB.readPage(path,{corpus,profile:"internal"})',
                        [original_answer['path'], corpus])
                    check('old_page_no_longer_current', old['ok'] is False,
                          'The original engine must reject a retired predecessor for current reading')
                    nav(page, 'History')
                    expect(page.locator('#oo-history-content')).to_contain_text('Retained source and revision history', timeout=60000)
                    check('history_understandable_and_inspectable',
                          'lineage' in page.locator('#oo-history-content').inner_text().lower() and
                          page.locator('#oo-history-content summary').count()>=1)
                    check('retained_revisions_visible_without_raw_json',
                          page.locator('#oo-history-content .oo-capture-row').count() >= 2 and
                          page.locator('#oo-history-content .oo-capture-row').first.get_by_text('Study registration').count()==1 and
                          'Authorship: unknown' in page.locator('#oo-history-content').inner_text())
                    shot(page, '05-revised-history')
                    report['scenarios'].append({
                        'persona': 'policy_editor',
                        'task': 'Revise the same policy; verify new source support and retained predecessor',
                        'ui_only': True,
                        'engine_postconditions': 'verified separately',
                        'result': 'completed'
                    })

                    # Persistence and offline must be actual browser behavior,
                    # not merely a promise in product copy.
                    page.reload(wait_until='domcontentloaded', timeout=120000)
                    page.wait_for_function(
                        "() => document.querySelector('#oo-notice')?.dataset.kind === 'ok'",
                        timeout=150000
                    )
                    page.locator('#oo-corpus').select_option(corpus, timeout=60000)
                    context.set_offline(True)
                    offline_answer = ask(page, QUESTION)
                    expect(offline_answer).to_contain_text(REVISED, timeout=60000)
                    check('saved_collection_works_after_reload_fully_offline',
                          'SOURCE SUPPORTED' in offline_answer.inner_text())
                    context.set_offline(False)
                    shot(page, '06-offline-reopened')

                    # A second source with a conflicting policy must NOT be ranked
                    # into a false supported answer. Keep the reason visible.
                    nav(page, 'Add or revise')
                    page.locator('#oo-title-input').fill('Competing registration rule')
                    page.locator('#oo-url-input').fill('https://example.org/oneowner-synthetic/competing')
                    page.locator('#oo-text-input').fill('Study registration requires seven approvals.')
                    page.locator('#oo-import').click()
                    expect(page.locator('#oo-import-result')).to_contain_text('IMPORTED THROUGH MPLPB', timeout=60000)
                    conflict = ask(page, QUESTION)
                    expect(conflict).to_contain_text('No supported answer', timeout=60000)
                    check('competing_claims_do_not_produce_supported_answer',
                          'SOURCE SUPPORTED' not in conflict.inner_text() and
                          'Sealed page hash' not in conflict.inner_text())
                    contract = engine(page, 'query', QUESTION, {'corpus': corpus})['reader']['answer_contract']
                    check('engine_reports_competing_evidence',
                          contract['kind'] in ('conflict','ambiguous') and
                          contract['answer_supported'] is False)
                    shot(page, '07-competing-claims')
                    report['scenarios'].append({
                        'persona': 'source_auditor',
                        'task': 'Detect contradictory current claims without silently picking one',
                        'ui_only': True,
                        'engine_postconditions': 'verified separately',
                        'result': 'completed'
                    })

                    # Small-screen design and visible outcome wording.
                    for width in [390, 768, 1280]:
                        page.set_viewport_size({'width': width, 'height': 820})
                        horizontal_ok = page.evaluate(
                            'document.documentElement.scrollWidth <= window.innerWidth + 2')
                        check('responsive_no_horizontal_overflow_'+str(width), horizontal_ok)
                        if width==390:
                            shot(page, '08-mobile-conflict')
                    nav(page, 'About')
                    check('plain_language_integrity_disclosure',
                          'hash' in page.locator('#oo-screen').inner_text().lower() and
                          'truth' in page.locator('#oo-screen').inner_text().lower())
                    check('no_outbound_requests', not report['unexpected_outbound_urls'],
                          str(report['unexpected_outbound_urls'][:3]))
                    check('no_browser_js_errors', not report['page_errors'],
                          str(report['page_errors'][:3]))
                    report['outcome'] = 'PASS'
                except Exception as exc:
                    report['outcome'] = 'FAIL'
                    report['failure'] = str(exc)
                    shot(page, 'failure-state')
                    raise
                finally:
                    context.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        report['checks_passed'] = sum(x['passed'] for x in report['checks'])
        report['checks_total'] = len(report['checks'])
        report['synthetic_scenarios_completed'] = sum(x['result']=='completed' for x in report['scenarios'])
        report['synthetic_scenarios_target'] = 4
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open('x', encoding='utf-8') as out:
            json.dump(report, out, indent=2, sort_keys=True)
            out.write('\n')
        print(json.dumps({
            'outcome': report['outcome'], 'checks_passed': report['checks_passed'],
            'checks_total': report['checks_total'],
            'synthetic_scenarios_completed': report['synthetic_scenarios_completed'],
            'human_validation': False,
            'report_path': str(args.output)
        }))


if __name__ == '__main__':
    main()
