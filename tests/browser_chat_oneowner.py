from browser_support import navigate
"""Synthetic novice acceptance: OneOwner full native chat in real Chromium and real MPLPB WASM.

Run against the exact extracted OneOwner release archive. All simulated user actions
use visible OneOwner controls. Engine API calls below inspect postconditions only.
This is developer-authored testing, not independent human usability evidence.
"""
import argparse
import hashlib
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--html',type=Path,required=True)
    p.add_argument('--browser-executable')
    p.add_argument('--output',type=Path,required=True)
    p.add_argument('--screenshots',type=Path)
    a=p.parse_args()
    html=a.html.resolve()
    if not html.is_file() or a.output.exists():
        raise SystemExit('Use an existing extracted OneOwner HTML and a fresh report path.')
    if a.screenshots: a.screenshots.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright,expect
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*_): pass
    srv=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(html.parent)))
    thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
    base='http://127.0.0.1:%d/'%srv.server_port
    report={'schema':'oneowner-native-chat-browser-v1','artifact_sha256':hashlib.sha256(html.read_bytes()).hexdigest(),
            'checks':[],'browser_errors':[],'unexpected_network':[],'human_validation':False,
            'outcome':'INCOMPLETE','limitations':['Developer-authored synthetic journey is not independent human usability research',
            'Saved notes are not ledger pages; conversation and source support have different authority']}
    def check(name,condition):
        report['checks'].append({'name':name,'passed':bool(condition)})
        if not condition: raise AssertionError(name)
    def shot(page,name):
        if a.screenshots:page.screenshot(path=str(a.screenshots/(name+'.png')),full_page=True)
    try:
        with sync_playwright() as playwright:
            options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
            if a.browser_executable: options['executable_path']=a.browser_executable
            browser=playwright.chromium.launch(**options)
            try:
                ctx=browser.new_context(viewport={'width':1280,'height':900},accept_downloads=True)
                report['chromium']=browser.version
                def local_only(route):
                    if route.request.url.startswith(base) or route.request.url.startswith(('data:','blob:')):
                        route.continue_()
                    else:
                        report['unexpected_network'].append(route.request.url);route.abort()
                ctx.route('**/*',local_only)
                page=ctx.new_page()
                page.on('pageerror',lambda error:report['browser_errors'].append(str(error)))
                page.goto(base+html.name,wait_until='domcontentloaded',timeout=120000)
                page.wait_for_function("() => document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=150000)
                try:
                    check('native_MPLPB_chat_API_available',page.evaluate("typeof window.MPLPB.chat==='function'"))
                    check('chat_is_first_class_navigation',page.locator('button[data-screen="chat"]').count()==1)
                    navigate(page, 'chat')
                    expect(page.locator('#oo-chat-log')).to_contain_text('Start with a question or a note')
                    check('research_recipes_memories_facts_are_discoverable',all(
                        page.locator('.oo-chat-help').get_by_text(term,exact=True).count()>=1
                        for term in ['Research','Recipes','Personal notes','Factual collections']))
                    expect(page.locator('#oo-chat-input')).to_be_visible(timeout=30000)
                    expect(page.locator('#oo-chat-send')).to_be_enabled(timeout=30000)
                    check('chat_input_and_send_button_are_mounted',
                          page.locator('#oo-chat-input').count()==1 and page.locator('#oo-chat-send').count()==1)
                    shot(page,'chat-welcome')
                    page.locator('#oo-corpus').select_option('logic')
                    expect(page.locator('#oo-chat-input')).to_be_visible(timeout=30000)
                    page.locator('#oo-chat-input').fill('remember I study dinosaurs')
                    check('network_defaults_off',not page.locator('#oo-chat-network').is_checked())
                    page.locator('#oo-chat-send').click()
                    expect(page.locator('.oo-chat-assistant')).to_have_count(1,timeout=60000)
                    expect(page.locator('#oo-chat-status')).to_contain_text('MPLPB:',timeout=60000)
                    check('original_chat_support_kind_visible',page.locator('.oo-chat-authority').count()==1 and
                          'Engine kind:' in page.locator('.oo-chat-assistant').text_content() and
                          'Engine support:' in page.locator('.oo-chat-assistant').text_content())
                    check('native_remember_updates_visible_notes','dinosaurs' in page.locator('#oo-chat-notes').inner_text().lower())
                    sid=page.locator('#oo-chat-sessions').input_value()
                    check('native_saved_session_ID_is_not_a_UI_fake',len(sid)>=8 and sid != 'free:')
                    snapshot=page.evaluate("async sid => await window.MPLPB.resumeChat(sid)",sid)
                    check('native_session_chain_valid',snapshot['ok'] and snapshot['data']['chain_intact'] is True and
                          len(snapshot['data']['turns'])==1)
                    shot(page,'chat-remember')
                    page.locator('#oo-chat-input').fill('what do you remember about me?')
                    page.locator('#oo-chat-send').click()
                    expect(page.locator('.oo-chat-assistant')).to_have_count(2,timeout=60000)
                    check('followup_keeps_same_native_session',page.locator('#oo-chat-sessions').input_value()==sid)
                    check('chat_notes_retained_after_followup',
                          'dinosaurs' in page.locator('#oo-chat-notes').inner_text().lower())
                    followup=page.evaluate("async sid => await window.MPLPB.resumeChat(sid)",sid)
                    check('followup_recorded_in_intact_native_hash_chain',
                          followup['ok'] and followup['data']['chain_intact'] is True and
                          len(followup['data']['turns'])==2)
                    check('native_refusal_never_promoted_to_cited_answer',
                          'SOURCE SUPPORTED' not in page.locator('.oo-chat-assistant').last.text_content() and
                          'Engine kind:' in page.locator('.oo-chat-assistant').last.text_content())
                    # Network permission must be opt-in on each individual turn.
                    page.locator('#oo-chat-network').check()
                    page.locator('#oo-chat-input').fill('hello')
                    page.locator('#oo-chat-send').click()
                    expect(page.locator('.oo-chat-assistant')).to_have_count(3,timeout=60000)
                    check('online_consent_resets_after_one_message',not page.locator('#oo-chat-network').is_checked())
                    check('no_unprompted_remote_access',not report['unexpected_network'])
                    # Export comes from the engine's verified stored transcript.
                    with page.expect_download(timeout=45000) as download_info:
                        page.locator('#oo-chat-export').click()
                    downloaded=download_info.value
                    check('export_is_user_initiated_verified_transcript',downloaded.suggested_filename.startswith('oneowner-chat-'))
                    # Reload and explicitly resume the conversation in its original corpus.
                    page.reload(wait_until='domcontentloaded',timeout=120000)
                    page.wait_for_function("() => document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=150000)
                    page.locator('#oo-corpus').select_option('logic')
                    navigate(page, 'chat')
                    expect(page.locator('.oo-chat-assistant')).to_have_count(3,timeout=60000)
                    check('persisted_conversation_resumes_after_browser_reload',page.locator('#oo-chat-sessions').input_value()==sid)
                    # Source chat and strict Ask are separate; latter always requires ledger support.
                    navigate(page, 'ask')
                    page.locator('#oo-question').fill('What does the unrecorded lunar cheesecake recipe require?')
                    page.locator('#oo-ask').click()
                    expect(page.locator('#oo-answer')).to_contain_text('No supported answer',timeout=60000)
                    check('casual_chat_does_not_promote_unsupported_claims','SOURCE SUPPORTED' not in page.locator('#oo-answer').inner_text())
                    navigate(page, 'chat')
                    expect(page.locator('.oo-chat-assistant')).to_have_count(3,timeout=60000)
                    # A second collection's chat must not leak into the active one.
                    navigate(page, 'import')
                    page.locator('#oo-new-collection').fill('Recipes and kitchen research')
                    page.locator('#oo-create').click()
                    expect(page.locator('#oo-new-result')).to_contain_text('COLLECTION CREATED',timeout=60000)
                    new_corpus=page.locator('#oo-corpus').input_value()
                    check('new_user_collection_selected',new_corpus.startswith('mind-'))
                    navigate(page, 'chat')
                    check('new_collection_does_not_reuse_old_session',page.locator('#oo-chat-sessions').input_value()!=sid and
                          page.locator('.oo-chat-assistant').count()==0)
                    page.locator('#oo-chat-input').fill('guide me')
                    page.locator('#oo-chat-send').click()
                    expect(page.locator('.oo-chat-assistant')).to_have_count(1,timeout=60000)
                    check('built_in_MPLPB_guide_available',page.locator('.oo-chat-assistant').count()==1)
                    shot(page,'chat-guide')
                    # Mobile layout should not force horizontal scroll.
                    for width in (390,768,1280):
                        page.set_viewport_size({'width':width,'height':820})
                        check('responsive_no_horizontal_scroll_'+str(width),
                              page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+2"))
                    shot(page,'chat-mobile')
                    check('no_browser_script_errors',not report['browser_errors'])
                    check('all_default_dialogue_local',not report['unexpected_network'])
                    report['outcome']='PASS'
                except Exception as error:
                    report['outcome']='FAIL';report['error']=str(error);shot(page,'chat-failure');raise
                finally:ctx.close()
            finally:browser.close()
    finally:
        srv.shutdown();srv.server_close();thread.join(timeout=3)
        report['checks_passed']=sum(x['passed'] for x in report['checks'])
        report['checks_total']=len(report['checks'])
        a.output.parent.mkdir(parents=True,exist_ok=True)
        a.output.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({'result':report['outcome'],'checks_passed':report['checks_passed'],
                          'checks_total':report['checks_total'],'report':str(a.output)}))

if __name__=='__main__':main()
