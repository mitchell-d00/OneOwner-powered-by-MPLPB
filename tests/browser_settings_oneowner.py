from browser_support import navigate
"""OneOwner appearance and user-setting acceptance against extracted real WASM HTML.

Modes, visual styles, helper labels, and evidence detail are product-only. No
changes to Combined MPLPB ledger, one-owner reader, or original theme settings.
"""
import argparse
import hashlib
import json
import threading
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--html',type=Path,required=True)
    parser.add_argument('--browser-executable')
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--screenshots',type=Path)
    args=parser.parse_args()
    pagefile=args.html.resolve()
    if not pagefile.is_file() or args.output.exists():
        raise SystemExit('Use extracted OneOwner.html and a new report location.')
    if args.screenshots:
        args.screenshots.mkdir(parents=True,exist_ok=True)
    from playwright.sync_api import sync_playwright,expect
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self,*_):
            pass
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(pagefile.parent)))
    worker=threading.Thread(target=server.serve_forever,daemon=True)
    worker.start()
    url='http://127.0.0.1:%d/' % server.server_port
    results={'schema':'oneowner-appearance-v1',
             'html_sha256':hashlib.sha256(pagefile.read_bytes()).hexdigest(),
             'checks':[],'browser_errors':[],'unexpected_remote_requests':[],
             'result':'INCOMPLETE',
             'limitations':['Automated browser checks are not independent human accessibility research.',
                            'Changing product UI settings cannot certify the factual truth of stored pages.']}
    def check(name,value):
        passed=bool(value)
        results['checks'].append({'name':name,'passed':passed})
        if not passed:raise AssertionError(name)
    def shot(page,name):
        if args.screenshots:
            page.screenshot(path=str(args.screenshots/(name+'.png')),full_page=True)
    try:
      with sync_playwright() as pw:
        options={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
        if args.browser_executable:options['executable_path']=args.browser_executable
        browser=pw.chromium.launch(**options)
        try:
          ctx=browser.new_context(viewport={'width':1280,'height':900},color_scheme='light')
          def guard(route):
            if route.request.url.startswith(url) or route.request.url.startswith(('data:','blob:')):
              route.continue_()
            else:
              results['unexpected_remote_requests'].append(route.request.url)
              route.abort()
          ctx.route('**/*',guard)
          p=ctx.new_page()
          p.on('pageerror',lambda exc:results['browser_errors'].append(str(exc)))
          try:
            p.goto(url+pagefile.name,wait_until='domcontentloaded',timeout=120000)
            p.wait_for_function("() => document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=150000)
            check('settings_navigation_visible',p.locator('button[data-screen="settings"]').is_visible())
            check('quick_mode_toggle_in_header',p.locator('#oo-theme-toggle').is_visible())
            check('default_theme_follows_device',p.locator('#oneowner-app').get_attribute('data-oo-theme')=='light')
            upstream_preferences=p.evaluate("localStorage.getItem('mplpb-ui-preferences')")
            check('upstream_preferences_are_not_reused_by_product',p.evaluate("localStorage.getItem('oneowner-ui-preferences-v1')") is None)
            before=p.evaluate("async()=>{const x=await window.MPLPB.query('What does the unrecorded lunar cookbook require?',{corpus:'logic'});return {kind:x.data?.reader?.kind,supported:x.data?.reader?.answer_contract?.answer_supported}}")
            p.locator('#oo-theme-toggle').click()
            check('quick_toggle_enables_dark',p.locator('#oneowner-app').get_attribute('data-oo-theme')=='dark')
            navigate(p, 'settings')
            expect(p.get_by_text('Settings & appearance')).to_be_visible()
            check('settings_show_explicit_dark',p.locator('#oo-theme').input_value()=='dark')
            check('original_and_three_mplpb_visual_styles_exposed',
                  p.locator('#oo-setting option').count()==4 and
                  p.locator('#oo-setting option[value="fantasy"]').count()==1 and
                  p.locator('#oo-setting option[value="scifi"]').count()==1 and
                  p.locator('#oo-setting option[value="wasteland"]').count()==1)
            p.locator('#oo-setting').select_option('fantasy')
            p.locator('#oo-textSize').select_option('large')
            p.locator('#oo-reduce-motion').check()
            p.locator('#oo-reason-mode').check()
            p.locator('#oo-helper-name').fill('Study Buddy')
            p.locator('#oo-helper-name').press('Tab')
            check('visual_changes_apply_immediately',
                  p.locator('#oneowner-app').get_attribute('data-oo-setting')=='fantasy' and
                  p.locator('#oneowner-app').get_attribute('data-oo-text')=='large' and
                  p.locator('#oneowner-app').get_attribute('data-oo-motion')=='reduce')
            dark_style=p.evaluate("()=>({a:getComputedStyle(document.querySelector('#oneowner-app')).backgroundColor,b:getComputedStyle(document.querySelector('#oneowner-app .oo-card')).backgroundColor})")
            check('dark_background_is_visible',dark_style['a']!='rgb(245, 247, 251)' and
                  dark_style['b']!='rgb(255, 255, 255)')
            shot(p,'appearance-dark-parchment')
            after=p.evaluate("async()=>{const x=await window.MPLPB.query('What does the unrecorded lunar cookbook require?',{corpus:'logic'});return {kind:x.data?.reader?.kind,supported:x.data?.reader?.answer_contract?.answer_supported}}")
            check('same_original_engine_answer_contract',after==before)
            check('original_mplpb_preferences_untouched',p.evaluate("localStorage.getItem('mplpb-ui-preferences')")==upstream_preferences)
            p.reload(wait_until='domcontentloaded',timeout=120000)
            p.wait_for_function("() => document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=150000)
            navigate(p, 'settings')
            check('all_settings_persist_after_reload',
                  p.locator('#oo-theme').input_value()=='dark' and
                  p.locator('#oo-setting').input_value()=='fantasy' and
                  p.locator('#oo-textSize').input_value()=='large' and
                  p.locator('#oo-reason-mode').is_checked() and
                  p.locator('#oo-reduce-motion').is_checked() and
                  p.locator('#oo-helper-name').input_value()=='Study Buddy')
            navigate(p, 'chat')
            p.locator('#oo-chat-input').fill('hello')
            p.locator('#oo-chat-send').click()
            expect(p.locator('.oo-chat-assistant')).to_have_count(1,timeout=60000)
            check('custom_helper_only_changes_visible_chat_label',
                  'Study Buddy · MPLPB' in p.locator('.oo-chat-assistant').last.inner_text())
            check('reason_mode_opens_original_reply_metadata',
                  p.locator('.oo-chat-assistant details.oo-details').last.evaluate('(el)=>el.open') is True)
            shot(p,'appearance-dark-chat')
            navigate(p, 'settings')
            p.locator('#oo-helper-enabled').uncheck()
            navigate(p, 'chat')
            expect(p.locator('.oo-chat-assistant')).to_have_count(1,timeout=60000)
            check('helper_disabled_shows_plain_mplpb_name',
                  p.locator('.oo-chat-assistant .oo-chat-speaker').last.inner_text()=='MPLPB')
            navigate(p, 'settings')
            p.locator('#oo-settings-reset').click()
            check('reset_restores_safe_product_defaults',
                  p.locator('#oo-theme').input_value()=='system' and
                  p.locator('#oo-setting').input_value()=='oneowner' and
                  p.locator('#oo-helper-enabled').is_checked() and
                  p.locator('#oo-reason-mode').is_checked() is False)
            p.locator('#oo-theme').select_option('light')
            check('light_switch_works',p.locator('#oneowner-app').get_attribute('data-oo-theme')=='light')
            p.locator('#oo-theme').select_option('dark')
            for width in (390,768,1280):
              p.set_viewport_size({'width':width,'height':820})
              check('responsive_settings_no_horizontal_scroll_'+str(width),
                    p.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 2'))
              if width==390:shot(p,'appearance-dark-mobile')
            check('no_unexpected_remote_requests',not results['unexpected_remote_requests'])
            check('no_javascript_page_errors',not results['browser_errors'])
            results['result']='PASS'
          except Exception as error:
            results['result']='FAIL'
            results['error']=str(error)
            shot(p,'appearance-failure')
            raise
          finally:ctx.close()
        finally:browser.close()
    finally:
      server.shutdown();server.server_close();worker.join(timeout=3)
      results['passed']=sum(entry['passed'] for entry in results['checks'])
      results['total']=len(results['checks'])
      args.output.parent.mkdir(parents=True,exist_ok=True)
      args.output.write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
      print(json.dumps({'result':results['result'],'passed':results['passed'],
                        'total':results['total'],'report':str(args.output)}))
if __name__=='__main__':
  main()
