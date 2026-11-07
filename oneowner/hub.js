/* Local workflow records, not an evidence ledger or an authentication system. */
(function(root,factory){
  const value=factory();
  if(typeof module==='object' && module.exports)module.exports=value;
  else root.OneOwnerHub=value;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEY='oneowner-hub-v1:';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const text=(v,n=4000)=>typeof v==='string'?v.slice(0,n):'';
  const id=()=>globalThis.crypto.randomUUID();
  const now=()=>new Date().toISOString();
  const unverified={answer_supported:false,authority:'workspace_record'};
  function fresh(){return {schema:1,revision:0,active:null,instances:[],notes:[],automation:{notes:true,handoffs:true}};}
  function create(storage,collection){
    if(!storage || typeof collection!=='string' || !collection)throw Error('A collection and working local storage are required.');
    const key=KEY+collection;
    function read(){
      const raw=storage.getItem(key);if(!raw)return fresh();
      let value;try{value=JSON.parse(raw);}catch(_){throw Error('Hub data is damaged. Export the stored record before resetting it.');}
      if(value?.schema!==1 || !Array.isArray(value.instances) || !Array.isArray(value.notes) || !Number.isSafeInteger(value.revision))
        throw Error('Hub format is unsupported; no records were overwritten.');
      return value;
    }
    function mutate(fn){
      const state=read(),result=fn(state);
      state.revision++;storage.setItem(key,JSON.stringify(state));return copy(result===undefined?state:result);
    }
    function find(state,instanceId){const value=state.instances.find(x=>x.id===instanceId);if(!value)throw Error('Conversation instance not found in this collection.');return value;}
    function newInstance(parent=null){return mutate(state=>{
      if(state.instances.length>=64)throw Error('Hub holds 64 instances. Export and remove an old instance before creating another.');
      const ancestor=parent?find(state,parent):null;
      const instance={...unverified,id:id(),collection,parent:parent?{id:parent,checkpoint:ancestor.checkpoint}:null,
        parentHandoff:ancestor?handoff(state,ancestor):null,
        created:now(),updated:now(),title:'New conversation',session:null,checkpoint:null,timeline:[],nativeTurnCount:0,
        context:{parentAvailable:!!parent,parentLoaded:false},working:[],handoff:null};
      state.instances.push(instance);state.active=instance.id;return instance;
    });}
    function activate(instanceId){return mutate(state=>{find(state,instanceId);state.active=instanceId;return instanceId;});}
    function productTurn(turn){
      if(turn.role==='user')return {type:'product',role:'user',text:text(turn.text),product:true,ai:turn.ai===true};
      const r=turn.response||{};
      return {type:'product',role:'assistant',product:true,ai:turn.ai===true,response:{...unverified,
        kind:turn.ai?'assisted_draft':text(r.kind,80)||'guided_discovery',support_label:turn.ai?'AI brainstorm · unverified':'Workspace activity · unverified',
        sources:[],message:text(r.message,16000)},
        ...(turn.lookup?{lookup:text(turn.lookup,160)}:{}),
        ...(!turn.ai && Array.isArray(turn.choices)?{choices:turn.choices.filter(c=>typeof c==='string').slice(0,8).map(c=>text(c,100))}:{})};
    }
    function sync(instanceId,{session=null,messages=[],nativeNotes=[],guide=null}){
      const timeline=[];
      for(const turn of messages){
        if(turn.product)timeline.push(productTurn(turn));
        else if(turn.role==='assistant' && typeof turn.pin==='string')timeline.push({type:'native',hash:turn.pin});
      }
      if(timeline.length>1000)throw Error('Hub activity limit reached. Export this instance and start another.');
      const users=messages.filter(t=>t.role==='user').map(t=>text(t.text,500));
      const safeGuide=guide && ['subject','era','genre','ready'].includes(guide.stage)?{stage:guide.stage,query:text(guide.query,160),era:text(guide.era,80)}:null;
      const state=read(),current=find(state,instanceId);
      const safeNotes=nativeNotes.filter(n=>typeof n==='string').map(n=>text(n,500)).slice(-30);
      if(state.active===instanceId && JSON.stringify(current.timeline)===JSON.stringify(timeline) && current.session===session && JSON.stringify(current.nativeNotes||[])===JSON.stringify(safeNotes) && JSON.stringify(current.guide||null)===JSON.stringify(safeGuide))return current;
      return mutate(next=>{
        const instance=find(next,instanceId);next.active=instanceId;
        instance.timeline=timeline;instance.session=session;instance.guide=safeGuide;instance.updated=now();instance.checkpoint=id();
        instance.nativeTurnCount=timeline.filter(t=>t.type==='native').length;
        instance.title=users[0]?.slice(0,80)||instance.title;instance.nativeNotes=safeNotes;
        // Literal excerpts, never inferred facts or commitments.
        if(next.automation.notes)instance.working=users.slice(-8).map(value=>({text:value,origin:'user_excerpt',...unverified}));
        if(next.automation.handoffs)instance.handoff=handoff(next,instance);
        return instance;
      });
    }
    function handoff(state,instance){
      return {schema:1,...unverified,instanceId:instance.id,collection,checkpoint:instance.checkpoint,generated:now(),
        nativeSession:instance.session,nativeTurnCount:instance.nativeTurnCount,
        nativeReferences:instance.timeline.filter(t=>t.type==='native').slice(-8).map(t=>t.hash),
        context:copy(instance.context),parent:instance.parent,working:copy(instance.working),nativeNotes:instance.nativeNotes||[],
        notes:state.notes.filter(n=>n.instanceId===instance.id).map(n=>({...n,...unverified})),
        instructions:'Working handoff only. Verify native history and read source pages before relying on claims. No access permissions are included.',
        permissions:[]};
    }
    function makeHandoff(instanceId){return mutate(state=>{const instance=find(state,instanceId);instance.handoff=handoff(state,instance);return instance.handoff;});}
    function addNote(instanceId,value,kind='note'){
      if(typeof value!=='string' || !value.trim() || value.length>4000)throw Error('Notes need 1–4000 characters.');
      if(!['note','task','decision'].includes(kind))throw Error('Unknown note type.');
      return mutate(state=>{
        const instance=find(state,instanceId);
        if(state.notes.length>=1000)throw Error('Hub note limit reached. Export notes before removing older ones.');
        const note={...unverified,id:id(),instanceId,text:value.trim(),kind,status:'open',created:now()};
        state.notes.push(note);if(state.automation.handoffs)instance.handoff=handoff(state,instance);return note;
      });
    }
    function updateNote(noteId,patch){return mutate(state=>{
      const note=state.notes.find(n=>n.id===noteId);if(!note)throw Error('Note not found.');
      if(patch.status!==undefined && !['open','done'].includes(patch.status))throw Error('Invalid task status.');
      if(patch.status!==undefined)note.status=patch.status;
      if(patch.text!==undefined){if(typeof patch.text!=='string'||!patch.text.trim()||patch.text.length>4000)throw Error('Invalid note.');note.text=patch.text.trim();}
      const instance=find(state,note.instanceId);if(state.automation.handoffs)instance.handoff=handoff(state,instance);return note;
    });}
    function removeNote(noteId){return mutate(state=>{
      const note=state.notes.find(n=>n.id===noteId);if(!note)throw Error('Note not found.');
      state.notes=state.notes.filter(n=>n.id!==noteId);const instance=find(state,note.instanceId);
      if(state.automation.handoffs)instance.handoff=handoff(state,instance);
    });}
    function remove(instanceId){return mutate(state=>{
      find(state,instanceId);state.instances=state.instances.filter(i=>i.id!==instanceId);
      state.notes=state.notes.filter(n=>n.instanceId!==instanceId);if(state.active===instanceId)state.active=null;
    });}
    function settings(patch){return mutate(state=>{
      for(const k of ['notes','handoffs'])if(patch[k]!==undefined){if(typeof patch[k]!=='boolean')throw Error('Use an explicit automation toggle.');state.automation[k]=patch[k];}
    });}
    function restore(instanceId,native){
      const instance=find(read(),instanceId),lookup=new Map();
      if(instance.session){
        if(native?.chain_intact!==true || native.session!==instance.session || native.corpus!==collection || !Array.isArray(native.turns))throw Error('Native history must be verified for this instance and collection.');
        for(const entry of native.turns){if(!entry?.sha256 || typeof entry.payload?.question!=='string' || !entry.payload.response)throw Error('Invalid native turn.');lookup.set(entry.sha256,entry.payload);}
      }
      const messages=[];
      for(const event of instance.timeline){
        if(event.type==='native'){
          const payload=lookup.get(event.hash);if(!payload)throw Error('A referenced native turn is missing. No conversation was reconstructed.');
          messages.push({role:'user',text:payload.question},{role:'assistant',response:payload.response,pin:event.hash});
        }else if(event.type==='product'){
          const clean=productTurn(event);delete clean.type;messages.push(clean);
        }else throw Error('Unknown hub event.');
      }
      // A native save can succeed while a hub write fails (for example quota).
      // Recover the verified suffix rather than hide those engine turns.
      const referenced=new Set(instance.timeline.filter(e=>e.type==='native').map(e=>e.hash));
      let recoveredNativeTurns=0;
      for(const entry of native?.turns||[]){
        if(!referenced.has(entry.sha256)){
          messages.push({role:'user',text:entry.payload.question},{role:'assistant',response:entry.payload.response,pin:entry.sha256});recoveredNativeTurns++;
        }
      }
      return {instance,messages,notes:native?.notes||[],recoveredNativeTurns};
    }
    function contextLoaded(instanceId,characters){return mutate(state=>{const instance=find(state,instanceId);if(!instance.parent)throw Error('No parent handoff.');instance.context={parentAvailable:true,parentLoaded:true,mode:'handoff_excerpt',characters,loaded:now()};});}
    function exportData(){const state=read();return {schema:1,collection,notice:'Local working records, not authenticated identity, sealed evidence, a native transcript backup, or source collection backup.',...unverified,state};}
    return Object.freeze({read,newInstance,activate,sync,makeHandoff,addNote,updateNote,removeNote,remove,settings,restore,contextLoaded,exportData});
  }
  return Object.freeze({create});
});
