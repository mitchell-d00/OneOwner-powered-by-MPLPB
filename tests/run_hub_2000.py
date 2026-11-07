"""Run four non-overlapping browser shards; require exactly 2000 distinct user messages."""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from hub_scenarios import scenarios


def main():
    p=argparse.ArgumentParser();p.add_argument('--html',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--browser-executable');p.add_argument('--desktop',type=Path);a=p.parse_args()
    if a.output.exists():raise SystemExit('Use a fresh output directory; failed runs are retained')
    a.output.mkdir(parents=True);script=Path(__file__).with_name('browser_hub_2000.py')
    def run(index):
      args=[sys.executable,str(script),'--html',str(a.html.resolve()),'--output',str(a.output/f'shard-{index}.json'),'--screenshots',str(a.output/f'shard-{index}'),
            '--shard-index',str(index),'--shard-count','4']
      if a.desktop:args+=['--desktop',str(a.desktop.resolve())]
      if a.browser_executable:args+=['--browser-executable',a.browser_executable]
      with (a.output/f'shard-{index}.log').open('w') as log:
        code=subprocess.call(args,stdout=log,stderr=subprocess.STDOUT)
      return index,code
    with ThreadPoolExecutor(max_workers=4) as pool:exit_codes=dict(pool.map(run,range(4)))
    reports=[];events=[];missing=[]
    for index in range(4):
      path=a.output/f'shard-{index}.json'
      if path.exists():reports.append(json.loads(path.read_text()))
      else:missing.append(index)
      path=path.with_suffix('.jsonl')
      if path.exists():events.extend(json.loads(line) for line in path.read_text().splitlines())
    expected={c['message'] for c in scenarios()};actual={e['message'] for e in events}
    artifact=hashlib.sha256(a.html.read_bytes()).hexdigest();normalized={' '.join(e['message'].casefold().split()) for e in events}
    response_counts=Counter(e['response_sha256'] for e in events)
    passed=(len(events)==len(actual)==len(normalized)==2000 and actual==expected and not missing and all(code==0 for code in exit_codes.values()) and
            all(r['outcome']=='PASS' and r['artifact_sha256']==artifact for r in reports))
    events.sort(key=lambda e:e['ordinal']);event_path=a.output/'turns.jsonl'
    event_path.write_text(''.join(json.dumps(e)+'\n' for e in events))
    result={'runtime':'original-python-http' if a.desktop else 'original-wasm','schema':'oneowner-2000-unique-turns-v1','outcome':'PASS' if passed else 'FAIL','artifact_sha256':artifact,
      'requested_user_messages':2000,'completed_user_messages':len(events),'unique_normalized_user_messages':len(normalized),
      'unique_scenarios':len({(e['persona'],e['project'],e['intent'],e['message']) for e in events}),
      'scripted_personas':20,'projects':100,'authored_templates':20,'template_reuse':True,'independent_human_validation':False,
      'native_calls':sum(r['native_turns'] for r in reports),'local_hub_commands':sum(r['local_hub_commands'] for r in reports),
      'unique_native_assistant_replies':len({e['response_sha256'] for e in events if e['native']}),'native_repeated_assistant_replies':sum(e['native'] for e in events)-len({e['response_sha256'] for e in events if e['native']}),'unique_assistant_replies':len(response_counts),'repeated_assistant_replies':sum(n-1 for n in response_counts.values()),
      'response_kinds':dict(sum((Counter(r['response_kinds']) for r in reports),Counter())),
      'checks_passed':sum(c['passed'] for r in reports for c in r['checks']),'checks_total':sum(len(r['checks']) for r in reports),
      'missing_shards':missing,'exit_codes':exit_codes,'events_sha256':hashlib.sha256(event_path.read_bytes()).hexdigest(),
      'limitations':['20 disclosed templates reused across 100 domain-specific projects; not 2000 independent users.',
        'Unique user messages do not imply unique assistant replies; repetitions are counted.',
        'Workflow invariants and persistence are tested; open-ended response usefulness needs independent human evaluation.',
        'No live AI or external authorization service is exercised.']}
    (a.output/'report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));
    if not passed:raise SystemExit(1)


if __name__=='__main__':main()
