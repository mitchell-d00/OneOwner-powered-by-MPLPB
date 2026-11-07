"""2,000 unique UI user messages; real MPLPB WASM, local-only, authored synthetic personas."""
import argparse
from collections import Counter
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
import sys
import tempfile
from browser_support import navigate
from hub_scenarios import scenarios,PERSONAS


def main():
    p=argparse.ArgumentParser();p.add_argument('--html',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--desktop',type=Path)
    p.add_argument('--shard-index',type=int,default=0);p.add_argument('--shard-count',type=int,default=1)
    p.add_argument('--browser-executable');p.add_argument('--screenshots',type=Path);p.add_argument('--limit',type=int,default=2000)
    a=p.parse_args();html=a.html.resolve();full=scenarios()[:a.limit]
    if a.shard_count not in (1,4) or not 0<=a.shard_index<a.shard_count or len(full)%a.shard_count:raise SystemExit('Use one shard, or four non-overlapping shards')
    span=len(full)//a.shard_count;cases=full[a.shard_index*span:(a.shard_index+1)*span]
    if a.limit not in (20,100,2000):raise SystemExit('Use --limit 20/100 for smoke checks or 2000 for acceptance')
    if a.output.exists():raise SystemExit('Use a fresh report path')
    a.output.parent.mkdir(parents=True,exist_ok=True)
    if a.screenshots:a.screenshots.mkdir(parents=True,exist_ok=True)
    events=a.output.with_suffix('.jsonl');checks=[];errors=[];network=[]
    report={'runtime':'original-python-http' if a.desktop else 'original-wasm','schema':'oneowner-hub-synthetic-v1','outcome':'INCOMPLETE','artifact_sha256':hashlib.sha256(html.read_bytes()).hexdigest(),
      'shard_index':a.shard_index,'shard_count':a.shard_count,'requested_user_messages':len(cases),'completed_user_messages':0,'unique_normalized_messages':len(set(' '.join(c['message'].casefold().split()) for c in cases)),
      'scripted_personas':len(set(c['persona'] for c in cases)),'projects':len(set(c['project'] for c in cases)),
      'authored_message_templates':20,'template_reuse':True,'human_validation':False,'live_ai_tested':False,
      'native_turns':0,'local_hub_commands':0,'checks':checks,'failures':[],'response_kinds':{},'unexpected_network':network,'browser_errors':errors,
      'limitations':['Unique messages reuse 20 disclosed action templates; this is not 2000 independent users.',
        'Conversation coherence and real-world task success are not established by storage and authority checks.',
        'Missing source support is recorded; a refusal is not scored as an answered research question.']}
    class Quiet(SimpleHTTPRequestHandler):
      def log_message(self,*_):pass
    data_dir=tempfile.TemporaryDirectory(prefix='oneowner-synthetic-')
    if a.desktop:
      sys.path.insert(0,str(a.desktop.resolve()))
      from tools.ledger_ui import App,handler
      Native=handler(App(topic_base=Path(data_dir.name)/'topics'))
      class ServerHandler(Native):
        def log_message(self,*_):pass
      srv=ThreadingHTTPServer(('127.0.0.1',0),ServerHandler)
    else:srv=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(html.parent)))
    thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start();base=f'http://127.0.0.1:{srv.server_port}/'
    def check(name,value):
      checks.append({'name':name,'passed':bool(value)})
      if not value:raise AssertionError(name)
    from playwright.sync_api import sync_playwright,expect
    started=time.monotonic();kinds=Counter()
    try:
      with sync_playwright() as pw:
        opts={'headless':True,'args':['--no-sandbox','--disable-dev-shm-usage']}
        if a.browser_executable:opts['executable_path']=a.browser_executable
        browser=pw.chromium.launch(**opts);ctx=browser.new_context(viewport={'width':1280,'height':950})
        def route(r):
          if r.request.url.startswith(base) or r.request.url.startswith(('data:','blob:')):r.continue_()
          else:network.append(r.request.url);r.abort()
        ctx.route('**/*',route);page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        try:
          page.goto(base+html.name,wait_until='domcontentloaded',timeout=120000)
          page.wait_for_function("() => document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=180000)
          last_persona=None;persona_turns=0;native_count=0;hub_commands=0
          with events.open('w') as out:
            for index,case in enumerate(cases):
              if case['persona']!=last_persona:
                navigate(page,'chat');page.get_by_text('Create a collection here',exact=True).click()
                page.locator('#oo-chat-collection-name').fill('Synthetic '+case['persona']);page.locator('#oo-chat-create-collection').click()
                expect(page.locator('#oo-collection-name')).to_contain_text('Synthetic '+case['persona'],timeout=60000)
                page.wait_for_function("() => !document.querySelector('#oo-chat-send')?.disabled")
                last_persona=case['persona'];persona_turns=0;native_count=0;hub_commands=0
              message=case['message'];is_command=message.startswith('/')
              before=page.locator('.oo-chat-user').count();t0=time.monotonic()
              page.locator('#oo-chat-input').fill(message);page.locator('#oo-chat-send').click()
              expect(page.locator('.oo-chat-user')).to_have_count(before+1,timeout=60000)
              page.wait_for_function("() => document.querySelector('#oo-chat-input').value==='' && !document.querySelector('#oo-chat-send').disabled",timeout=60000)
              persona_turns+=1
              if is_command:hub_commands+=1;report['local_hub_commands']+=1
              else:native_count+=1;report['native_turns']+=1
              state=page.evaluate("""() => {
                const corpus=document.querySelector('#oo-corpus').value;
                const state=OneOwnerHub.create(localStorage,corpus).read();const instance=state.instances.find(i=>i.id===state.active);
                return {corpus,instance,notes:state.notes,lastText:document.querySelector('.oo-chat-assistant:last-child .oo-chat-text')?.textContent,status:document.querySelector('#oo-chat-status').textContent};
              }""")
              instance=state['instance'];last=page.locator('.oo-chat-assistant').last
              if 'Hub not saved:' in state['status']:raise AssertionError(state['status'])
              if instance['nativeTurnCount']!=native_count:raise AssertionError('Native turn counter mismatch')
              if len(state['notes'])!=hub_commands:raise AssertionError('Hub command did not create exactly one note')
              if instance['handoff']['permissions']!=[] or instance['handoff']['answer_supported'] is not False:raise AssertionError('Handoff authority boundary')
              if instance['working'][-1]['text']!=message[:500]:raise AssertionError('Automatic excerpt did not track the actual user message')
              response=json.loads(last.locator('.oo-raw').text_content())['response']
              if not is_command:
                kind=response['kind'];kinds[kind]+=1
                if case['intent']=='missing_evidence' and response.get('answer_supported') is True:raise AssertionError('Unsupported fictional project claim promoted to supported')
              else:kind='local_hub_command'
              if not last.locator('.oo-chat-text').text_content().strip():raise AssertionError('Empty assistant response')
              out.write(json.dumps({**case,'ordinal':a.shard_index*span+index+1,'message_sha256':hashlib.sha256(message.encode()).hexdigest(),
                'native':not is_command,'response_kind':kind,'response_sha256':hashlib.sha256(last.locator('.oo-chat-text').text_content().encode()).hexdigest(),'response_excerpt':last.locator('.oo-chat-text').text_content()[:800],
                'instance_id':instance['id'],'checkpoint':instance['checkpoint'],'elapsed_seconds':round(time.monotonic()-t0,3),'workflow_checks_passed':True})+'\n');out.flush()
              report['completed_user_messages']+=1
              if persona_turns==100 or index==len(cases)-1:
                sid=instance['session'];native=page.evaluate('async sid=>await MPLPB.resumeChat(sid)',sid)
                check('native_chain_'+case['persona'],native['ok'] and native['data']['chain_intact'] and len(native['data']['turns'])==native_count)
                corpus=state['corpus'];instance_id=instance['id'];navigate(page,'hub')
                check('notes_visible_'+case['persona'],page.locator('#oo-hub-notes article').count()==hub_commands)
                with page.expect_download() as download:page.get_by_role('button',name='Export hub',exact=True).click()
                check('hub_export_'+case['persona'],download.value.suggested_filename=='oneowner-hub.json')
                if index==len(cases)-1 or persona_turns==100:
                  page.reload(wait_until='domcontentloaded',timeout=120000);page.wait_for_function("() => document.querySelector('#oo-notice')?.dataset.kind==='ok'",timeout=180000)
                  page.locator('#oo-corpus').select_option(corpus);navigate(page,'hub');page.locator('[data-instance="'+instance_id+'"]').get_by_role('button',name='Resume',exact=True).click()
                  expect(page.locator('.oo-chat-user')).to_have_count(persona_turns,timeout=60000)
                  check('complete_mixed_timeline_resumes_'+case['persona'],page.locator('#oo-chat-instance').text_content().find(instance_id[:8])>=0)
                print(json.dumps({'completed':index+1,'native_calls':report['native_turns'],'hub_commands':report['local_hub_commands']}),flush=True)
          navigate(page,'hub');page.locator('#oo-hub-auto-notes').uncheck();page.locator('#oo-hub-auto-handoffs').uncheck()
          check('automation_toggles_persist',page.evaluate("(()=>{const s=OneOwnerHub.create(localStorage,document.querySelector('#oo-corpus').value).read();return !s.automation.notes && !s.automation.handoffs})()"))
          row=page.locator('#oo-hub-instances article').first;parent_id=row.get_attribute('data-instance');row.get_by_role('button',name='Fork with handoff',exact=True).click()
          check('fork_is_distinct_and_unloaded',page.evaluate("""parent=>{const s=OneOwnerHub.create(localStorage,document.querySelector('#oo-corpus').value).read(),i=s.instances.find(x=>x.id===s.active);return i.id!==parent && i.parent.id===parent && !i.session && !i.context.parentLoaded} """,parent_id))
          page.get_by_role('button',name='Use parent handoff in message',exact=True).click()
          check('handoff_not_sent_implicitly',page.locator('#oo-chat-input').input_value().startswith('Working parent handoff') and page.locator('.oo-chat-user').count()==0)
          for width in (390,768,889,1280):
            page.set_viewport_size({'width':width,'height':900});navigate(page,'hub')
            check('hub_mobile_'+str(width),page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'))
          if a.screenshots:page.screenshot(path=str(a.screenshots/'hub.png'),full_page=True)
          check('no_unexpected_network',not network);check('no_script_errors',not errors)
          check('exact_unique_message_count',report['completed_user_messages']==len(cases)==report['unique_normalized_messages'])
          report['outcome']='PASS'
        except Exception as error:
          report['outcome']='FAIL';report['failures'].append({'turn':report['completed_user_messages']+1,'error':str(error)})
          if a.screenshots:page.screenshot(path=str(a.screenshots/'hub-failure.png'),full_page=True)
          raise
        finally:ctx.close();browser.close()
    finally:
      srv.shutdown();srv.server_close();thread.join(timeout=3);data_dir.cleanup()
      report['elapsed_seconds']=round(time.monotonic()-started,2);report['response_kinds']=dict(kinds)
      report['events_sha256']=hashlib.sha256(events.read_bytes()).hexdigest() if events.exists() else None
      a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'outcome':report['outcome'],'completed':report['completed_user_messages'],'report':str(a.output)}),flush=True)


if __name__=='__main__':main()
