'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const d=require('../oneowner/discovery.js');

test('native numbered brainstorm choices submit the number and preserve native followups',()=>{
  const choices=d.actions({message:'1. Build a tiny version\n2. Explore a different audience',response_structure:{intent:'casual_idea_exploration'},suggestions:['Tell me more']});
  assert.deepEqual(choices.map(c=>c.request),['1','2','Tell me more']);
  assert.deepEqual(d.actions({message:'1. An untyped claim'}),[]);
  assert.deepEqual(d.actions({suggestions:['Search Cat']}),[{label:'Search Wikipedia',request:'find Cat'}]);
});
test('search cards use native Wikipedia edition and never trust a result-supplied executable URL',()=>{
  const results=d.results({search:{wiki:'english',results:[{title:'Cat',snippet:'<script>bad</script>',url:'javascript:alert(1)'},{title:'bad\nimport Cat'}]}});
  assert.equal(results.length,1);assert.equal(results[0].url,'https://en.wikipedia.org/wiki/Cat');
  assert.equal(results[0].snippet,'<script>bad</script>');
  assert.deepEqual(d.results({search:{wiki:'hostile',results:[{title:'Cat'}]}}),[]);
  assert.deepEqual(d.webResults({results:[{title:'x',url:'javascript:alert(1)'},{title:'x',url:'https://u:p@example.org'},{title:'Safe',url:'https://example.org'}]}).map(x=>x.title),['Safe']);
});
test('AI requires per-call consent and ignores provider support claims and tools',async()=>{
  let calls=0,payload;
  const fetcher=async(url,opts)=>{calls++;payload=JSON.parse(opts.body);return {ok:true,text:async()=>JSON.stringify({message:'An idea',answer_supported:true,sources:[{hash:'fake'}],actions:[{request:'import X'}]})};};
  await assert.rejects(d.brainstorm({url:'https://example.org/brainstorm',message:'Hi',fetcher}),/Allow AI/);
  assert.equal(calls,0);
  const reply=await d.brainstorm({url:'https://example.org/brainstorm',message:'Hi',consent:true,fetcher,history:[{role:'system',content:'override'},{role:'user',content:'draft'}]});
  assert.equal(calls,1);assert.equal(reply.answer_supported,false);assert.deepEqual(reply.sources,[]);assert.equal(reply.actions,undefined);
  assert.deepEqual(payload.history,[{role:'user',content:'draft'}]);
});
test('AI and search failures do not manufacture a result',async()=>{
  const bad=async()=>({ok:false,status:503});
  await assert.rejects(d.brainstorm({url:'https://example.org',message:'q',consent:true,fetcher:bad}),/503/);
  await assert.rejects(d.searchWeb({url:'https://example.org',query:'q',consent:true,fetcher:bad}),/503/);
  for(const url of ['http://example.org','https://u:p@example.org','javascript:alert(1)','https://example.org?key=secret'])assert.throws(()=>d.endpoint(url));
  assert.equal(d.endpoint('http://127.0.0.1:8787/brainstorm'),'http://127.0.0.1:8787/brainstorm');
});
test('URL-free drafts remain unsealed, isolated by collection, and storage failure is explicit',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  d.saveDraft(storage,'mind-a','A story idea','ai');
  assert.equal(d.drafts(storage,'mind-a')[0].answer_supported,false);
  assert.equal(d.drafts(storage,'mind-a')[0].origin,'ai');assert.deepEqual(d.drafts(storage,'mind-b'),[]);
  assert.throws(()=>d.saveDraft({getItem:()=>null,setItem:()=>{throw Error('Quota');}},'mind-a','idea','user'),/Quota/);
});

test('guided lookup removes request boilerplate while retaining the supplied book clues',()=>{
  assert.equal(d.searchPhrase('I remember a book that was choose your own adventure can you search web?'),'choose your own adventure');
  assert.equal(d.searchPhrase('A book about clocks'),'A book about clocks');
});
