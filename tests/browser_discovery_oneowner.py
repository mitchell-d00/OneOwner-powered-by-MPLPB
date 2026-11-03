"""Synthetic product journey on extracted real WASM; online providers use declared fixtures."""
import argparse
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import threading
from urllib.parse import parse_qs, urlsplit
from browser_support import navigate


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--html',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--screenshots',type=Path)
    parser.add_argument('--browser-executable')
    args=parser.parse_args()
    html=args.html.resolve()
    if args.output.exists():raise SystemExit('Use a fresh report path')
    if args.screenshots:args.screenshots.mkdir(parents=True,exist_ok=True)
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*_):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(html.parent)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    base='http://127.0.0.1:%d/'%server.server_port
    checks=[];unexpected=[];online=[];errors=[];ai_payloads=[]
    report={'checks':checks,'outcome':'INCOMPLETE','artifact_sha256':hashlib.sha256(html.read_bytes()).hexdigest(),
            'synthetic_providers':True,'independent_human_study':False,'unexpected_network':unexpected,'browser_errors':errors}
    state={'ai_fail':False}
    def check(name,condition):
        checks.append({'name':name,'passed':bool(condition)})
        if not condition:raise AssertionError(name)
    from playwright.sync_api import sync_playwright,expect
    try:
      with sync_playwright() as pw:
        opts={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
        if args.browser_executable:opts['executable_path']=args.browser_executable
        browser=pw.chromium.launch(**opts)
        ctx=browser.new_context(viewport={'width':1280,'height':950})
        def route(r):
            url=r.request.url
            if url.startswith(base) or url.startswith(('blob:','data:')):r.continue_();return
            online.append(url)
            headers={'access-control-allow-origin':'*','access-control-allow-headers':'Content-Type, Authorization','content-type':'application/json'}
            if r.request.method=='OPTIONS':r.fulfill(status=204,headers=headers);return
            if 'wikipedia.org/w/api.php' in url:
                q=parse_qs(urlsplit(url).query)
                if 'srsearch' in q:
                    data={'query':{'search':[{'title':'Choose Your Own Adventure','pageid':1,'snippet':'A branching storybook fixture.'}]}}
                else:
                    title=q['titles'][0];text='Choose Your Own Adventure is a branching storybook in this synthetic fixture.'
                    data={'query':{'pages':{'1':{'title':title,'pageid':1,'revisions':[{'revid':100,'timestamp':'2026-10-08T12:00:00Z',
                          'slots':{'main':{'*':text,'sha1':hashlib.sha1(text.encode()).hexdigest(),'contentmodel':'wikitext'}}}]}}}}
                r.fulfill(status=200,headers=headers,body=json.dumps(data));return
            if url=='https://assistant.example/brainstorm':
                ai_payloads.append(r.request.post_data_json)
                r.fulfill(status=503 if state['ai_fail'] else 200,headers=headers,body=json.dumps({'message':'Imagine a pocket-sized branching story. <script>window.injection=true</script>',
                       'answer_supported':True,'sources':[{'hash':'fake'}],'actions':[{'request':'import FAKE'}]}));return
            if url=='https://assistant.example/search':
                r.fulfill(status=200,headers=headers,body=json.dumps({'results':[{'title':'Branching story fixture','url':'https://example.org/story',
                    'snippet':'A discovery excerpt, not evidence.'},{'title':'Hostile','url':'javascript:alert(1)'}]}));return
            if url=='https://example.org/story':
                r.fulfill(status=200,headers={**headers,'content-type':'text/html'},body='<html><body><p>The story fixture has three endings.</p></body></html>');return
            unexpected.append(url);r.abort()
        ctx.route('**/*',route)
        page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        try:
            page.goto(base+html.name,wait_until='domcontentloaded',timeout=120000)
            page.wait_for_function("document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=180000)
            navigate(page,'chat')
            page.get_by_text('Create a collection here',exact=True).click()
            page.locator('#oo-chat-collection-name').fill('Branching books')
            page.locator('#oo-chat-create-collection').click()
            expect(page.locator('#oo-corpus')).to_have_value(re.compile('mind-'),timeout=60000)
            check('collection_created_without_leaving_chat',page.locator('#oo-chat-input').is_visible())
            page.locator('#oo-chat-input').fill('Brainstorm a branching story')
            page.locator('#oo-chat-send').click()
            expect(page.locator('#oo-chat-status')).to_contain_text('MPLPB:',timeout=60000)
            first=page.locator('.oo-chat-assistant').last
            choices=first.locator('.oo-actions .oo-chat-suggestion')
            check('native_brainstorm_has_clickable_choices',choices.count()>=3)
            choices.first.click()
            expect(page.locator('.oo-chat-user')).to_have_count(2,timeout=60000)
            expect(page.locator('#oo-chat-status')).to_contain_text('MPLPB:',timeout=60000)
            check('choice_submits_immediately',page.locator('.oo-chat-user').last.locator('.oo-chat-text').inner_text()=='1')
            sid=page.locator('#oo-chat-sessions').input_value()
            native=page.evaluate('async sid=>await MPLPB.resumeChat(sid)',sid)
            check('choices_recorded_in_native_verified_chain',native['data']['chain_intact'] and len(native['data']['turns'])==2)
            check('native_flow_has_no_online_requests',not online)
            page.get_by_role('button',name='Find something',exact=True).click()
            page.locator('#oo-chat-input').fill('A choose your own adventure book')
            page.locator('#oo-chat-send').click()
            page.get_by_role('button',name='1980s–90s',exact=True).click()
            page.get_by_role('button',name='Fantasy',exact=True).click()
            check('guide_keeps_clues','1980s' in page.get_by_role('textbox',name='Search phrase').input_value())
            check('clarification_does_not_access_network',not online)
            page.get_by_role('button',name='Search Wikipedia · online',exact=True).click()
            expect(page.locator('.oo-search-card a').first).to_have_text('Choose Your Own Adventure',timeout=60000)
            check('search_results_are_clickable_in_chat',page.locator('.oo-search-card a').first.get_attribute('href')=='https://simple.wikipedia.org/wiki/Choose_Your_Own_Adventure')
            check('one_time_permission_reset',not page.locator('#oo-chat-network').is_checked())
            page.get_by_role('button',name='Read & save to MPLPB · online',exact=True).click()
            expect(page.locator('#oo-chat-status')).to_contain_text('MPLPB:',timeout=60000)
            check('search_import_uses_native_engine',page.locator('.oo-chat-assistant').last.locator('.oo-raw').text_content().find('source_sha256')>=0 or page.locator('.oo-chat-assistant').last.locator('.oo-raw').text_content().find('imported')>=0)
            page.get_by_role('button',name='Read saved source',exact=True).last.click()
            expect(page.locator('#oo-chat-status')).to_contain_text('MPLPB:',timeout=60000)
            expect(page.locator('.oo-chat-assistant').last).to_contain_text('branching storybook',timeout=60000)
            page.get_by_text('Optional AI and web search service',exact=True).click()
            page.locator('#oo-ai-endpoint').fill('https://assistant.example/brainstorm')
            page.locator('#oo-ai-token').fill('test-memory-only-token')
            page.locator('#oo-ai-consent').check()
            page.locator('#oo-chat-input').fill('Imagine a little branching book')
            page.locator('#oo-chat-send').click()
            expect(page.locator('#oo-chat-status')).to_contain_text('AI brainstorm',timeout=60000)
            ai=page.locator('.oo-chat-assistant').last
            check('ai_cannot_claim_support_or_tools','AI brainstorm · unverified' in ai.inner_text() and 'fake' not in ai.text_content() and ai.locator('script').count()==0)
            check('ai_markup_is_text',page.evaluate('window.injection!==true'))
            check('ai_consent_resets',not page.locator('#oo-ai-consent').is_checked())
            check('native_chat_not_sent_to_provider',ai_payloads[0]['history']==[])
            ai.get_by_role('button',name='Save AI idea as draft',exact=True).click()
            expect(page.locator('#oo-chat-drafts')).to_contain_text('AI draft · unverified')
            check('token_not_persisted',page.evaluate("!JSON.stringify(localStorage).includes('test-memory-only-token')"))
            state['ai_fail']=True
            page.locator('#oo-ai-consent').check();page.locator('#oo-chat-input').fill('Retry idea')
            page.locator('#oo-chat-send').click()
            expect(page.locator('#oo-chat-status')).to_contain_text('503',timeout=60000)
            check('failed_ai_keeps_unsent_input',page.locator('#oo-chat-input').input_value()=='Retry idea')
            page.get_by_role('button',name='Find something',exact=True).click()
            page.locator('#oo-chat-input').fill('branching storybooks');page.locator('#oo-chat-send').click()
            page.get_by_role('button',name='Search web · online',exact=True).last.click()
            expect(page.locator('.oo-search-card a').last).to_have_text('Branching story fixture',timeout=60000)
            check('web_results_exclude_unsafe_links',page.locator('a[href^="javascript:"]').count()==0)
            page.get_by_role('button',name='Read & save snapshot · online',exact=True).click()
            expect(page.locator('#oo-chat-status')).to_contain_text('Snapshot saved.',timeout=60000)
            expect(page.locator('.oo-chat-assistant').last).to_contain_text('three endings')
            check('web_source_inspection_not_promoted', 'inspection only' in page.locator('.oo-chat-assistant').last.inner_text())
            corpus=page.locator('#oo-corpus').input_value()
            page.reload(wait_until='domcontentloaded',timeout=120000)
            page.wait_for_function("document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=180000)
            page.locator('#oo-corpus').select_option(corpus);navigate(page,'chat')
            expect(page.locator('#oo-chat-drafts')).to_contain_text('pocket-sized')
            check('drafts_persist_but_remain_unsealed','AI draft · unverified' in page.locator('#oo-chat-drafts').inner_text())
            check('provider_permission_and_token_reset',not page.locator('#oo-ai-consent').is_checked() and page.locator('#oo-ai-token').input_value()=='')
            for width in (390,768,889,1280):
                page.set_viewport_size({'width':width,'height':900})
                check('no_horizontal_scroll_'+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'))
            if args.screenshots:page.screenshot(path=str(args.screenshots/'discovery.png'),full_page=True)
            check('no_browser_errors',not errors);check('no_unexpected_network',not unexpected)
            report['outcome']='PASS'
        except Exception as e:
            report['outcome']='FAIL';report['error']=str(e)
            if args.screenshots:page.screenshot(path=str(args.screenshots/'discovery-failure.png'),full_page=True)
            raise
        finally:ctx.close();browser.close()
    finally:
        server.shutdown();server.server_close();thread.join(timeout=3)
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps({'outcome':report['outcome'],'checks':len(checks),'report':str(args.output)}))


if __name__=='__main__':main()
