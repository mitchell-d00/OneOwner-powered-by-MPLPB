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
