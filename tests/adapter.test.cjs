'use strict';
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {create, interpret} = require('../oneowner/adapter.js');

function fake(reader) {
  const calls = [];
  const api = {
    async ready(){return {ok:true,data:{ready:true}}},
    async listCorpora(){return {ok:true,data:[{key:'local',label:'Local'}]}},
    async query(q,opts){calls.push({method:'query',q,opts});return {ok:true,data:{reader}}},
    async listPages(opts){calls.push({method:'listPages',opts});return {ok:true,data:{pages:[{path:'ONE.html',eligible:false}]}}},
    async readPage(path,opts){calls.push({method:'readPage',path,opts});return {ok:true,data:{path,hash:'h',text:'raw'}}},
    async getHistory(opts){calls.push({method:'getHistory',opts});return {ok:true,data:{items:[]}}},
    async createCollection(name){calls.push({method:'createCollection',name});return {ok:true,data:{corpus:'mind-123'}}},
    async importSource(opts){calls.push({method:'importSource',opts});return {ok:true,data:{capture:{authorship:'unknown'},collection_build:{engine_changed:false}}}}
  };
  return {adapter:create(api),calls};
}

test('supports only explicit engine returns with citation and hash',async()=>{
  const {adapter,calls}=fake({kind:'return',text:'Ledger sentence.',citation:'ONE-1',hash:'sha256',answer_supported:true});
  const r=await adapter.ask('  What?  ','local');
  assert.equal(r.status,'supported');assert.equal(r.message,'Ledger sentence.');assert.equal(r.hash,'sha256');
  assert.deepEqual(calls[0],{method:'query',q:'What?',opts:{corpus:'local',profile:'internal',mode:'supported'}});
});

test('fail closed on support flag false, missing seal, and missing citation',()=>{
  for(const reader of [
    {kind:'return',text:'wrong',citation:'c',hash:'h',answer_supported:false},
    {kind:'return',text:'wrong',citation:'c'},
    {kind:'return',text:'wrong',hash:'h'},
    {kind:'model_assisted_answer',text:'wrong',citation:'c',hash:'h',answer_supported:false}
  ]){ const r=interpret({reader});assert.equal(r.supported,false);assert.notEqual(r.message,'wrong'); }
});

test('ambiguity, refusal, and candidate never become answers',()=>{
  for(const kind of ['ambiguous','not_in_corpus','candidate_only','retrieved','partial_answer','abstain']) {
    const r=interpret({reader:{kind,text:'DO NOT PRESENT THIS',hash:'h',citation:'c'}});
    assert.equal(r.supported,false);assert.notEqual(r.message,'DO NOT PRESENT THIS');
  }
});

test('preserve unchanged trace including the engine exclusions',async()=>{
  const reader={kind:'ambiguous',excluded:[{id:'A',reason:'withheld'}]};
  const {adapter}=fake(reader); const output=await adapter.ask('Question','local');
  assert.deepEqual(output.trace.reader,reader);
});

test('do not select withheld pages or override engine path validation',async()=>{
  const {adapter,calls}=fake({kind:'not_in_corpus'});
  assert.equal((await adapter.pages('local'))[0].eligible,false);
  await adapter.continueFrom('ONE.html','local');
  assert.equal(calls.filter(x=>x.method==='readPage').length,1);
  assert.equal(calls.filter(x=>x.method==='getHistory').length,1);
});

test('pasted source import is labelled as supplied and is not a fetch',async()=>{
  const {adapter,calls}=fake({kind:'not_in_corpus'});
  await adapter.importSource({corpus:'mind-123',title:'Notes',url:'https://example.org/notes',text:'Notes text'});
  const c=calls.filter(x=>x.method==='importSource');assert.equal(c.length,1);
  assert.equal(c[0].opts.text,'Notes text');
  await assert.rejects(adapter.importSource({corpus:'local',title:'Notes',url:'https://example.org',text:'x'}));
  await assert.rejects(adapter.importSource({corpus:'mind-123',title:'Notes',url:'',text:'x'}));
});

test('errors fail rather than manufacturing answers',async()=>{
  const {adapter}=fake({kind:'not_in_corpus'});
  await assert.rejects(adapter.ask('','local'));
  assert.throws(()=>create({}),/requires/);
  const bad=create({query:async()=>({ok:false,error:'Seal corrupted'}),listCorpora:async()=>({ok:true,data:[]})});
  await assert.rejects(bad.ask('q','local'),/Seal corrupted/);
});


test('chat invokes original MPLPB API with no network by default and retains returned authority labels',async()=>{
  const calls=[];
  const api={
    query: async()=>({ok:true,data:{reader:{kind:'not_in_corpus'}}}),
    listCorpora:async()=>({ok:true,data:[]}),
    chat:async(message,opts)=>{calls.push({method:'chat',message,opts});return {ok:true,data:{session:'sid1',corpus:'logic',response:{kind:'casual',support_label:'not_source_supported',message:'Hello.'},mind:{notes:[]}}};},
    resumeChat:async session=>{calls.push({method:'resume',session});return {ok:true,data:{session,chain_intact:true,turns:[],notes:[]}};},
    exportChat:async session=>{calls.push({method:'export',session});return {ok:true,data:{chain_intact:true,turns:[]}};},
    resetChat:async session=>{calls.push({method:'reset',session});return {ok:true,data:{reset:true}};}
  };
  const a=create(api);
  const result=await a.chat(' hello ',{corpus:'logic'});
  assert.equal(result.response.support_label,'not_source_supported');
  assert.equal(result.response.kind,'casual');
  assert.deepEqual(calls[0],{method:'chat',message:'hello',opts:{corpus:'logic',profile:'internal',allowNetwork:false,wiki:'simple'}});
  await a.chat('search Cat',{corpus:'logic',session:'sid1',allowNetwork:true,wiki:'english'});
  assert.deepEqual(calls[1],{method:'chat',message:'search Cat',opts:{corpus:'logic',profile:'internal',allowNetwork:true,wiki:'english',session:'sid1'}});
  assert.equal((await a.resumeChat('sid1')).chain_intact,true);
  assert.equal((await a.exportChat('sid1')).turns.length,0);
  assert.equal((await a.resetChat('sid1')).reset,true);
  assert.deepEqual(calls.slice(2),[{method:'resume',session:'sid1'},{method:'export',session:'sid1'},{method:'reset',session:'sid1'}]);
});

test('chat rejects implicit network permission, invalid arguments and damaged transcripts',async()=>{
  const calls=[];
  const api={
    query:async()=>({ok:true,data:{reader:{kind:'not_in_corpus'}}}),
    listCorpora:async()=>({ok:true,data:[]}),
    chat:async()=>{calls.push('chat');return {ok:false,code:'NETWORK_DISABLED',error:'Network permission required'};},
    resumeChat:async session=>({ok:true,data:{session,chain_intact:false,turns:[]}}),
    exportChat:async()=>({ok:true,data:{chain_intact:false,turns:[]}}),
    resetChat:async()=>({ok:true,data:{reset:true}})
  };
  const a=create(api);
  for(const opts of [
    {corpus:'logic',allowNetwork:'true'},
    {corpus:'logic',wiki:'web'},
    {corpus:''},
    {corpus:'logic',session:null}
  ]) await assert.rejects(a.chat('hello',opts));
  await assert.rejects(a.chat('',{corpus:'logic'}));
  assert.equal(calls.length,0,'no rejected chat should reach original engine');
  await assert.rejects(a.chat('search Cat',{corpus:'logic'}),/Network permission required/);
  await assert.rejects(a.resumeChat('sid'),/hash chain failed/);
  await assert.rejects(a.exportChat('sid'),/integrity failed/);
});


test('direct URL snapshots use only the original native source transport and retain provenance',async()=>{
  const received=[];
  const captureTransport={capture:async source=>{
    received.push(source);
    return {
      title:source.title,
      capture:{transport:'browser-cors-fetch-v1',authorship:'unknown',source_sha256:'recorded-by-engine'},
      collection_build:{source_origin:source.url,engine_changed:false}
    };
  }};
  const api={query:async()=>({ok:true,data:{reader:{kind:'not_in_corpus'}}}),listCorpora:async()=>({ok:true,data:[]})};
  const a=create(api,captureTransport);
  const snapshot=await a.captureLink({corpus:'mind-123',title:'Bread recipe',url:' https://example.org/recipes/bread '});
  assert.equal(snapshot.capture.transport,'browser-cors-fetch-v1');
  assert.equal(received.length,1);
  assert.deepEqual(received[0],{corpus:'mind-123',title:'Bread recipe',url:'https://example.org/recipes/bread'});
  for(const url of ['http://example.org/recipe','https://user:pass@example.org/recipe',
    'https://example.org/recipe#section','https://localhost/recipe','garbage']){
    await assert.rejects(a.captureLink({corpus:'mind-123',title:'Bread',url}));
  }
  await assert.rejects(a.captureLink({corpus:'logic',title:'Bread',url:'https://example.org/recipe'}));
  await assert.rejects(a.captureLink({corpus:'mind-123',title:'',url:'https://example.org/recipe'}));
  assert.equal(received.length,1,'rejected links never reach original source transport');
});

test('source fetch fails closed and never upgrades incomplete native metadata',async()=>{
  const api={query:async()=>({ok:true,data:{reader:{kind:'not_in_corpus'}}}),listCorpora:async()=>({ok:true,data:[]})};
  await assert.rejects(create(api).captureLink({corpus:'mind-1',title:'Fact',url:'https://example.org/'}),
    /native.*browser URL capture|does not expose.*URL capture/i);
  const incomplete=create(api,{capture:async()=>({title:'Fact'})});
  await assert.rejects(incomplete.captureLink({corpus:'mind-1',title:'Fact',url:'https://example.org/'}),
    /complete source capture/);
  const rejected=create(api,{capture:async()=>{throw Error('Browser CORS denied');}});
  await assert.rejects(rejected.captureLink({corpus:'mind-1',title:'Fact',url:'https://example.org/'}),
    /Browser CORS denied/);
});
