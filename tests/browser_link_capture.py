from browser_support import navigate
"""Browser smoke: Google discovery link -> original MPLPB CORS snapshot -> sealed page."""
import argparse
import json
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import threading

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--html',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--browser-executable')
    parser.add_argument('--screenshots',type=Path)
    args=parser.parse_args()
    source=args.html.resolve()
    if not source.is_file() or args.output.exists():raise SystemExit('Use extracted OneOwner.html and new report location')
    if args.screenshots:args.screenshots.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright,expect
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*a):pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(source.parent)))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    base=f'http://127.0.0.1:{server.server_port}/'
    url='https://example.org/oneowner-test-policy'
    state={'text':'Study registration requires a booking and two approvals unless a waiver applies.'}
    checks=[]
    def check(name,passed):
        checks.append({'name':name,'passed':bool(passed)})
        if not passed:raise AssertionError(name)
    report={'checks':checks,'result':'INCOMPLETE','synthetic_fetch_fixture':True,
            'limitations':['Fixture CORS permits fetch. Many real websites do not.','Google search links are discovered manually; not scraped.']}
    try:
      with sync_playwright() as pw:
        opts={'headless':True}
        if args.browser_executable:opts['executable_path']=args.browser_executable
        browser=pw.chromium.launch(**opts)
        try:
          context=browser.new_context()
          unexpected=[]
          def route(r):
            if r.request.url.startswith(base):r.continue_()
            elif r.request.url==url:r.fulfill(status=200,headers={'content-type':'text/html','access-control-allow-origin':'*'},
                      body='<html><head><title>Fixture</title></head><body><h1>Study registration</h1><p>'+state['text']+'</p></body></html>')
            else:unexpected.append(r.request.url);r.abort()
          context.route('**/*',route)
          page=context.new_page()
          page.goto(base+source.name,wait_until='domcontentloaded',timeout=120000)
          page.wait_for_function("() => document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=150000)
          navigate(page, 'import')
          check('search_button_visible',page.locator('#oo-search-google').is_visible())
          page.evaluate("window.__search=[];window.open=(url)=>{window.__search.push(url);return null}")
          page.locator('#oo-google-search').fill('research recipes')
          page.locator('#oo-search-google').click()
          actual_search=page.evaluate("window.__search.slice()")
          print('OneOwner Google discovery URL recorded in Chromium:',repr(actual_search),flush=True)
          search_links=[link for link in actual_search if isinstance(link,str)]
          check('Google_only_opens_search',search_links==['https://www.google.com/search?q=research%20recipes'])
          page.locator('#oo-new-collection').fill('Snapshot pilot')
          page.locator('#oo-create').click()
          expect(page.locator('#oo-new-result')).to_contain_text('COLLECTION CREATED',timeout=60000)
          corpus=page.locator('#oo-corpus').input_value()
          page.locator('#oo-capture-url').fill(url)
          check('title_suggested',page.locator('#oo-capture-title').input_value()=='oneowner test policy')
          page.locator('#oo-capture-title').fill('Study registration')
          page.locator('#oo-capture-link').click()
          expect(page.locator('#oo-capture-result')).to_contain_text('SNAPSHOT SAVED BY MPLPB',timeout=90000)
          check('transport_is_native_fetch','browser-cors-fetch-v1' in page.locator('#oo-capture-result').inner_text())
          history=page.evaluate("async c=>await window.MPLPB.getHistory({corpus:c})",corpus)
          check('native_history_retained',history['ok'] and len(history['data']['collection_history']['captures'])==1)
          reader=page.evaluate("async c=>await window.MPLPB.query('What does study registration require?',{corpus:c})",corpus)
          check('native_reader_supported',reader['ok'] and reader['data']['reader']['kind']=='return'
                and state['text'] in reader['data']['reader']['text'])
          old_hash=reader['data']['reader']['hash']
          state['text']='Study registration requires a booking and three approvals unless a waiver applies.'
          page.locator('#oo-capture-link').click()
          expect(page.locator('#oo-capture-result')).to_contain_text('SNAPSHOT SAVED BY MPLPB',timeout=90000)
          new=page.evaluate("async c=>await window.MPLPB.query('What does study registration require?',{corpus:c})",corpus)
          check('successor_hash_changes',new['ok'] and new['data']['reader']['hash']!=old_hash and
                state['text'] in new['data']['reader']['text'])
          count=page.evaluate("async c=>(await window.MPLPB.getHistory({corpus:c})).data.collection_history.captures.length",corpus)
          check('original_versions_retained',count==2)
          page.locator('#oo-capture-url').fill('http://example.org/bad')
          page.locator('#oo-capture-link').click()
          expect(page.locator('#oo-capture-result')).to_contain_text('SNAPSHOT NOT SAVED',timeout=30000)
          check('insecure_url_rejected',page.evaluate("async c=>(await window.MPLPB.getHistory({corpus:c})).data.collection_history.captures.length",corpus)==2)
          check('no_unexpected_requests',not unexpected)
          if args.screenshots:page.screenshot(path=str(args.screenshots/'link-snapshot.png'),full_page=True)
          report['result']='PASS'
        finally:browser.close()
    finally:
      server.shutdown();server.server_close();thread.join(timeout=2)
      report['passed']=sum(c['passed'] for c in checks);report['total']=len(checks)
      args.output.parent.mkdir(parents=True,exist_ok=True)
      args.output.write_text(json.dumps(report,indent=2)+'\n')
      print(f"Snapshot browser journey {report['result']} ({report['passed']}/{report['total']})")
if __name__=='__main__':main()
