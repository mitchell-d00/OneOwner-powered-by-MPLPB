"""Separate correctness probes, not part of the counted 2,000-message synthetic run."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import threading
from browser_support import navigate


def main():
 p=argparse.ArgumentParser();p.add_argument('--html',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--browser-executable');a=p.parse_args()
 checks=[];errors=[];network=[];report={'outcome':'INCOMPLETE','checks':checks,'separate_correctness_run':True}
 class Quiet(SimpleHTTPRequestHandler):
  def log_message(self,*_):pass
 srv=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(a.html.resolve().parent)))
 thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{srv.server_port}/'
 def check(name,value):
  checks.append({'name':name,'passed':bool(value)})
  if not value:raise AssertionError(name)
 from playwright.sync_api import sync_playwright,expect
 try:
  with sync_playwright() as pw:
   opts={'headless':True}
   if a.browser_executable:opts['executable_path']=a.browser_executable
   browser=pw.chromium.launch(**opts);ctx=browser.new_context()
   def route(r):
    if r.request.url.startswith(base) or r.request.url.startswith(('blob:','data:')):r.continue_()
    else:network.append(r.request.url);r.abort()
   ctx.route('**/*',route);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   def ready():page.wait_for_function("() => document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=180000)
   def send(text):
    page.locator('#oo-chat-input').fill(text);page.locator('#oo-chat-send').click()
    page.wait_for_function("() => !document.querySelector('#oo-chat-send').disabled && document.querySelector('#oo-chat-input').value===''",timeout=60000)
   def state():return page.evaluate("OneOwnerHub.create(localStorage,document.querySelector('#oo-corpus').value).read()")
   try:
    page.goto(base+a.html.name,wait_until='domcontentloaded',timeout=120000);ready();navigate(page,'chat')
    send('remember I am reviewing the handoff recovery path')
    send('/task Inspect the recovery path before sharing this work')
    original=state();parent=original['active'];session=original['instances'][-1]['session'];corpus=page.locator('#oo-corpus').input_value()
    navigate(page,'hub');page.get_by_text('Edit note',exact=True).click();page.get_by_role('textbox',name='Edit task',exact=True).fill('Review native history before relying on the handoff')
    page.get_by_role('button',name='Save edit',exact=True).click();page.get_by_role('button',name='Mark done',exact=True).click()
    check('note_edits_and_status_refresh_handoff',state()['instances'][-1]['handoff']['notes'][0]['status']=='done' and state()['notes'][0]['text'].startswith('Review native'))
    page.locator('#oo-hub-auto-notes').uncheck();page.locator('#oo-hub-auto-handoffs').uncheck();before=state()['instances'][-1]
    page.get_by_role('button',name='Resume',exact=True).click();send('remember I will verify the checkpoint later')
    after=state()['instances'][-1];check('automations_can_be_disabled',after['working']==before['working'] and after['handoff']==before['handoff'])
    navigate(page,'hub');page.locator('#oo-hub-auto-notes').check();page.locator('#oo-hub-auto-handoffs').check()
    page.get_by_role('button',name='Fork with handoff',exact=True).click();check('fork_starts_without_native_session',page.locator('#oo-chat-sessions').input_value()=='')
    page.get_by_role('button',name='Use parent handoff in message',exact=True).click();page.locator('#oo-chat-send').click();page.wait_for_function("() => document.querySelector('#oo-chat-input').value==='' && !document.querySelector('#oo-chat-send').disabled",timeout=60000)
    child=state()['instances'][-1];check('handoff_supply_is_recorded_without_cloning_session',child['session']!=session and child['context']['parentLoaded'] and child['parent']['id']==parent)
    check('fork_inherits_no_permissions',child['handoff']['permissions']==[])
    # Simulate a quota failure only for hub writes. Engine IndexedDB and native index remain available.
    page.evaluate("""() => {window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('oneowner-hub-v1:'))throw Error('Synthetic quota failure');return window.originalSetItem.call(this,key,value)}}""")
    send('remember this native turn must survive a hub quota failure')
    expect(page.locator('#oo-chat-status')).to_contain_text('Hub not saved:')
    sid=page.locator('#oo-chat-sessions').input_value();snapshot=page.evaluate('async sid=>await MPLPB.resumeChat(sid)',sid)
    check('native_success_is_retained_when_hub_write_fails',snapshot['ok'] and snapshot['data']['chain_intact'] and len(snapshot['data']['turns'])==2)
    page.evaluate('() => {Storage.prototype.setItem=window.originalSetItem;}')
    page.reload(wait_until='domcontentloaded',timeout=120000);ready();page.locator('#oo-corpus').select_option(corpus);navigate(page,'chat')
    expect(page.locator('.oo-chat-user')).to_have_count(2,timeout=60000)
    check('uncheckpointed_native_suffix_is_recovered','quota failure' in page.locator('.oo-chat-user').last.text_content())
    # Corrupt a native reference: a valid engine history must not authenticate it.
    saved=state();key='oneowner-hub-v1:'+corpus
    page.evaluate("key=>{const s=JSON.parse(localStorage.getItem(key));s.instances.find(i=>i.id===s.active).timeline.push({type:'native',hash:'missing-native-pin'});localStorage.setItem(key,JSON.stringify(s))}",key)
    navigate(page,'hub');page.locator('[data-instance="'+child['id']+'"]').get_by_role('button',name='Resume',exact=True).click()
    expect(page.locator('#oo-chat-status')).to_contain_text('referenced native turn is missing',timeout=60000)
    check('missing_native_reference_blocks_resume',page.locator('.oo-chat-assistant').count()==0)
    page.evaluate('([key,s])=>localStorage.setItem(key,JSON.stringify(s))',[key,saved])
    page.evaluate('key=>localStorage.setItem(key,"damaged-json")',key);navigate(page,'hub')
    expect(page.locator('#oo-hub-status')).to_contain_text('damaged')
    check('damaged_hub_is_not_overwritten',page.evaluate('key=>localStorage.getItem(key)',key)=='damaged-json')
    check('no_unexpected_network',not network);check('no_browser_errors',not errors)
    report['outcome']='PASS'
   except Exception as error:report['outcome']='FAIL';report['error']=str(error);raise
   finally:ctx.close();browser.close()
 finally:
  srv.shutdown();srv.server_close();thread.join(timeout=3);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))


if __name__=='__main__':main()
