from browser_support import navigate
"""Chromium novice/advanced tutorial and fully local chat on packaged OneOwner.

Exercises the actual pinned MPLPB WASM engine; no mock answer rules.
Reports synthetic tasks, not independent human usability findings.
"""
import argparse
import hashlib
import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--html',required=True,type=Path)
    parser.add_argument('--browser-executable')
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--screenshots',type=Path)
    args=parser.parse_args()
    html=args.html.resolve()
    if not html.is_file() or args.output.exists():
        raise SystemExit('Use a built OneOwner.html with an unused report path.')
    if args.screenshots: args.screenshots.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright,expect
    class Silent(SimpleHTTPRequestHandler):
        def log_message(self,*_): pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Silent,directory=str(html.parent)))
    thread=threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    base='http://127.0.0.1:%d/' % server.server_port
    result={'schema':'oneowner-learn-usability-v1','artifact_sha256':hashlib.sha256(html.read_bytes()).hexdigest(),
            'checks':[],'network_requests':[],'browser_errors':[],'human_validated':False,
            'result':'INCOMPLETE',
            'limitations':['Scripted browser acceptance is not human usability research',
                           'Offline mode tests the already-loaded runtime, not an initial cold offline visit',
                           'Browser source captures require internet/CORS; saved records belong to the browser origin']}
    def check(name,ok):
        result['checks'].append({'name':name,'passed':bool(ok)})
        if not ok:raise AssertionError(name)
    def shot(page,name):
        if args.screenshots:page.screenshot(path=str(args.screenshots/(name+'.png')),full_page=True)
    try:
      with sync_playwright() as pw:
        opts={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
        if args.browser_executable:opts['executable_path']=args.browser_executable
        browser=pw.chromium.launch(**opts)
        try:
          ctx=browser.new_context(viewport={'width':1240,'height':900})
          def route(r):
            if r.request.url.startswith(base) or r.request.url.startswith(('data:','blob:')):
              r.continue_()
            else:
              result['network_requests'].append(r.request.url);r.abort()
          ctx.route('**/*',route)
          page=ctx.new_page()
          page.on('pageerror',lambda e:result['browser_errors'].append(str(e)))
          try:
            page.goto(base+html.name,wait_until='domcontentloaded',timeout=120000)
            page.wait_for_function("() => document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=150000)
            check('learn_navigation_visible',page.locator('button[data-screen="learn"]').is_visible())
            page.locator('#oo-corpus').select_option('logic')
            navigate(page, 'library')
            page.locator('#oo-library-list').get_by_role('button',name='Inspect page').first.click(timeout=60000)
            expect(page.locator('.oo-page-reading .oo-source-text')).not_to_be_empty(timeout=60000)
            check('saved_eligible_page_readable_offline_without_raw_json',
                page.locator('.oo-page-reading .oo-source-text').inner_text().strip()!='')
            page.locator('#oo-inspector-chat').click()
            check('source_chat_uses_original_topic_command',
                page.locator('#oo-chat-input').input_value().startswith('topic '))
            navigate(page, 'learn')
            expect(page.get_by_text('Four steps to get comfortable')).to_be_visible()
            check('first_time_lesson_has_real_steps',page.locator('.oo-learn-step').count()==4)
            check('offline_guidance_is_explicit',page.locator('#oo-learn-offline').get_by_text('web pages offline',exact=False).count()>0)
            check('chat_vs_cited_ask_explained','Chat and Ask are different' in page.locator('#oo-screen').inner_text())
            shot(page,'learn-desktop')
            page.get_by_role('button',name='Try “What are you?” in Chat').click()
            expect(page.locator('#oo-chat-input')).to_have_value('What are you?')
            check('tutorial_routes_to_real_chat',page.locator('button[data-screen="chat"]').get_attribute('aria-current')=='page')
            check('basic_chat_default',page.locator('#oo-chat-basic-tab').get_attribute('aria-pressed')=='true')
            check('native_mplpb_chat_available',page.evaluate("typeof window.MPLPB.chat==='function'"))
            page.locator('#oo-chat-send').click()
            expect(page.locator('.oo-chat-assistant')).to_have_count(1,timeout=60000)
            check('basic_reply_labels_original_engine','Engine kind:' in page.locator('.oo-chat-assistant').last.inner_text() and
                  'Engine support:' in page.locator('.oo-chat-assistant').last.inner_text())
            shot(page,'basic-chat')
            page.locator('#oo-chat-advanced-tab').click()
            check('advanced_mode_options_visible',page.locator('#oo-chat-advanced-tab').get_attribute('aria-pressed')=='true' and
                page.get_by_role('button',name='Select an exact page').is_visible())
            page.get_by_role('button',name='Focus on evidence').click()
            expect(page.locator('#oo-chat-input')).to_have_value('serious mode')
            check('advanced_command_prefilled_not_auto_sent',page.locator('.oo-chat-assistant').count()==1)
            page.locator('#oo-chat-send').click()
            expect(page.locator('.oo-chat-assistant')).to_have_count(2,timeout=60000)
            check('advanced_mode_uses_existing_native_conversation',page.locator('#oo-chat-status').inner_text().startswith('MPLPB:'))
            shot(page,'advanced-chat')
            page.locator('#oo-chat-learn').click()
            page.get_by_role('button',name='Start the MPLPB guide').click()
            expect(page.locator('#oo-chat-input')).to_have_value('guide me')
            page.locator('#oo-chat-send').click()
            expect(page.locator('.oo-chat-assistant')).to_have_count(3,timeout=60000)
            check('original_four_step_guide_starts','Step 1 of 4' in page.locator('.oo-chat-assistant').last.inner_text())
            ctx.set_offline(True)
            before=page.locator('.oo-chat-assistant').count()
            page.locator('#oo-chat-input').fill('hello')
            page.locator('#oo-chat-send').click()
            expect(page.locator('.oo-chat-assistant')).to_have_count(before+1,timeout=60000)
            check('offline_chats_with_embedded_engine',not page.locator('#oo-chat-network').is_checked())
            ctx.set_offline(False)
            navigate(page, 'ask')
            check('strict_ask_explains_when_to_chat',page.locator('#oo-ask-to-chat').is_visible())
            page.locator('#oo-ask-to-chat').click()
            expect(page.locator('#oo-chat-input')).to_have_value('What are you?')
            check('ask_to_chat_avoids_falsely_promoted_evidence',page.locator('.oo-chat-assistant').count()>=0)
            navigate(page, 'learn')
            page.set_viewport_size({'width':390,'height':844})
            check('mobile_guide_without_horizontal_overflow',page.evaluate("document.documentElement.scrollWidth<=window.innerWidth+2"))
            shot(page,'learn-mobile')
            check('no_unexpected_network',not result['network_requests'])
            check('no_browser_js_errors',not result['browser_errors'])
            result['result']='PASS'
          except Exception as exc:
            result['result']='FAIL'
            result['error']=str(exc)
            shot(page,'learn-failure')
            raise
          finally:
            ctx.close()
        finally:browser.close()
    finally:
      server.shutdown();server.server_close();thread.join(timeout=2)
      result['passed']=sum(x['passed'] for x in result['checks'])
      result['total']=len(result['checks'])
      args.output.parent.mkdir(parents=True,exist_ok=True)
      args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
      print(json.dumps({'result':result['result'],'checks':result['passed'],'total':result['total'],'report':str(args.output)}))

if __name__=='__main__':main()
