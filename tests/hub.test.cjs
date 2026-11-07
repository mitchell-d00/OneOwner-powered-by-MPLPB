'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../oneowner/hub.js');
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};};
const native={chain_intact:true,session:'s1',corpus:'mind-a',turns:[{sha256:'native-pin',payload:{question:'My actual question',response:{kind:'conversation',message:'Actual native response',answer_supported:false}}}],notes:[]};
test('native restoration requires verified history, matching collection and turn references',()=>{
 const store=create(memory(),'mind-a'),i=store.newInstance();
 store.sync(i.id,{session:'s1',messages:[{role:'user',text:'My actual question'},{role:'assistant',pin:'native-pin',response:{message:'tampered'}}]});
 assert.equal(store.restore(i.id,native).messages[1].response.message,'Actual native response');
 for(const bad of [{...native,chain_intact:false},{...native,corpus:'mind-b'},{...native,session:'s2'},{...native,turns:[]}])assert.throws(()=>store.restore(i.id,bad));
});
test('product activity is persisted with all authority and tool claims removed',()=>{
 const storage=memory(),store=create(storage,'mind-a'),i=store.newInstance();
 store.sync(i.id,{messages:[{role:'user',text:'Imagine a world',product:true,ai:true},{role:'assistant',product:true,ai:true,response:{message:'An idea',answer_supported:true,sources:[{hash:'fake'}],actions:['execute'],kind:'return'}}]});
 const restored=create(storage,'mind-a').restore(i.id,null);
 assert.equal(restored.messages[1].response.answer_supported,false);assert.deepEqual(restored.messages[1].response.sources,[]);assert.equal(restored.messages[1].response.actions,undefined);assert.equal(restored.messages[1].response.kind,'assisted_draft');
 assert.equal(restored.instance.working[0].text,'Imagine a world');
});
test('forking creates a distinct session boundary with a recorded, unloaded parent handoff',()=>{
 const store=create(memory(),'mind-a'),parent=store.newInstance();store.sync(parent.id,{session:'s1',messages:[{role:'user',text:'Goal: find a book'},{role:'assistant',pin:'native-pin'}]});
 const child=store.newInstance(parent.id);assert.notEqual(parent.id,child.id);assert.equal(child.session,null);assert.deepEqual(child.timeline,[]);assert.equal(child.parent.id,parent.id);assert.equal(child.context.parentLoaded,false);assert.ok(child.parentHandoff);
 store.contextLoaded(child.id,200);assert.equal(store.read().instances.at(-1).context.mode,'handoff_excerpt');
 assert.deepEqual(store.makeHandoff(child.id).permissions,[]);
});
test('automation toggles freeze literal working excerpts and handoffs; notes remain explicit',()=>{
 const store=create(memory(),'mind-a'),i=store.newInstance();store.sync(i.id,{messages:[{role:'user',text:'Goal: inspect sources',product:true}]});
 store.settings({notes:false,handoffs:false});const before=store.read().instances[0];
 store.sync(i.id,{messages:[{role:'user',text:'Do not claim this is a fact',product:true}]});const after=store.read().instances[0];
 assert.deepEqual(after.working,before.working);assert.deepEqual(after.handoff,before.handoff);
 const note=store.addNote(i.id,'Check the source','task');store.updateNote(note.id,{status:'done'});assert.equal(store.read().notes[0].status,'done');
 assert.throws(()=>store.updateNote(note.id,{status:'verified'}));assert.equal(store.makeHandoff(i.id).notes[0].answer_supported,false);
});
test('deduped synchronization avoids repeat checkpoints; collections stay separate',()=>{
 const storage=memory(),a=create(storage,'mind-a'),b=create(storage,'mind-b'),i=a.newInstance();
 const snapshot={messages:[{role:'user',text:'A goal',product:true}]};a.sync(i.id,snapshot);const revision=a.read().revision;a.sync(i.id,snapshot);
 assert.equal(a.read().revision,revision);assert.deepEqual(b.read().instances,[]);assert.throws(()=>b.makeHandoff(i.id));
});
test('corruption, quota, unsupported formats and limits fail without overwriting records',()=>{
 const storage=memory();storage.setItem('oneowner-hub-v1:mind-a','broken');const store=create(storage,'mind-a');assert.throws(()=>store.newInstance(),/damaged/);assert.equal(storage.getItem('oneowner-hub-v1:mind-a'),'broken');
 assert.throws(()=>create({getItem:()=>null,setItem:()=>{throw Error('Quota exceeded');}},'mind-a').newInstance(),/Quota/);
 const safe=create(memory(),'mind-a');const i=safe.newInstance();assert.throws(()=>safe.addNote(i.id,''));assert.throws(()=>safe.settings({notes:'true'}));assert.throws(()=>safe.sync(i.id,{messages:Array.from({length:1001},()=>({role:'user',text:'x',product:true}))}),/limit/);
});

test('a successful native save survives a failed hub checkpoint and is recovered on resume',()=>{
 const store=create(memory(),'mind-a'),i=store.newInstance();store.sync(i.id,{session:'s1',messages:[]});
 const restored=store.restore(i.id,native);assert.equal(restored.recoveredNativeTurns,1);assert.equal(restored.messages[0].text,'My actual question');
});

test('an explicit fork snapshots current references even while automatic handoffs are paused',()=>{
 const store=create(memory(),'mind-a'),parent=store.newInstance();
 store.sync(parent.id,{messages:[{role:'user',text:'First goal',product:true}]});store.settings({handoffs:false});
 store.addNote(parent.id,'A later task','task');const child=store.newInstance(parent.id);
 assert.equal(child.parentHandoff.notes[0].text,'A later task');assert.equal(child.parentHandoff.checkpoint,child.parent.checkpoint);
});
