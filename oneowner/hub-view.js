/* A collection-scoped, local hub. All strings are rendered as text. */
(function(root){
  'use strict';
  const make=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=String(value);return el;};
  const button=(label,action)=>{const el=make('button','oo-btn oo-btn-secondary',label);el.type='button';el.addEventListener('click',action);return el;};
  function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));const link=make('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function mount(host,{store,openChat}){
    const status=make('p','oo-muted');status.id='oo-hub-status';status.setAttribute('role','status');
    function run(fn){try{fn();}catch(error){status.textContent='Not completed: '+error.message;}}
    function render(){
      const state=store.read();host.replaceChildren();
      host.append(make('p','oo-eyebrow','YOUR WORKING HUB'),make('h1','oo-title','Hub · notes and handoffs'),
        make('p','oo-intro','Continue a conversation, track your next steps, and prepare a handoff. These local working records are unverified; MPLPB alone decides source support.'));
      const actions=make('div','oo-actions');
      actions.append(button('Start a conversation',()=>run(()=>{const instance=store.newInstance();openChat(instance.id);})),
        button('Export hub',()=>run(()=>download('oneowner-hub.json',store.exportData()))));host.appendChild(actions);
      const automations=make('section','oo-card');automations.appendChild(make('h2','','Local automations'));
      for(const [key,label] of [['notes','Keep the latest eight user excerpts as working notes'],['handoffs','Refresh a handoff after each completed interaction']]){
        const field=make('label','oo-chat-check');const input=make('input');input.type='checkbox';input.checked=state.automation[key];input.id='oo-hub-auto-'+key;
        input.addEventListener('change',()=>run(()=>{store.settings({[key]:input.checked});render();status.textContent='Automation preference saved locally.';}));field.append(input,make('span','',label));automations.appendChild(field);
      }
      automations.appendChild(make('p','oo-footnote','Automations run locally when you interact with OneOwner. They do not run in the background while the app is closed, send messages to others, or grant website permissions.'));host.appendChild(automations);
      const grid=make('div','oo-hub-grid');const conversations=make('section','oo-card');conversations.appendChild(make('h2','','Conversation instances'));
      const list=make('div');list.id='oo-hub-instances';
      for(const instance of [...state.instances].reverse()){
        const row=make('article','oo-search-card');row.dataset.instance=instance.id;
        row.append(make('h3','',instance.title),make('p','oo-mono',instance.id),make('p','',instance.nativeTurnCount+' native turns · '+instance.timeline.filter(t=>t.type==='product').length+' workspace messages'));
        if(instance.parent)row.appendChild(make('p','oo-footnote','Fork of '+instance.parent.id+(instance.context.parentLoaded?'. A parent handoff excerpt was supplied; the full parent state was not restored.':'. Parent handoff is recorded, not loaded into the new native session.')));
        const controls=make('div','oo-actions');
        controls.append(button('Resume',()=>run(()=>{store.activate(instance.id);openChat(instance.id);})),
          button('Fork with handoff',()=>run(()=>{const child=store.newInstance(instance.id);openChat(child.id);})),
          button('Refresh handoff',()=>run(()=>{store.makeHandoff(instance.id);render();status.textContent='Working handoff refreshed.';})),
          button('Export handoff',()=>run(()=>download('oneowner-handoff.json',store.makeHandoff(instance.id)))),
          button('Use handoff in message',()=>run(()=>{const handoff=store.makeHandoff(instance.id);openChat(instance.id,'Working handoff (unverified, permissions not included):\n'+JSON.stringify(handoff).slice(0,3600));})),
          button('Remove hub record',()=>run(()=>{if(!window.confirm('Remove this hub record and its notes? Native conversations and source pages are retained.'))return;store.remove(instance.id);render();})));
        row.appendChild(controls);
        const details=make('details','oo-details');details.appendChild(make('summary','','Working notes and handoff'));
        if(!instance.working.length)details.appendChild(make('p','','No automatic excerpts yet.'));
        for(const excerpt of instance.working)details.appendChild(make('p','oo-chat-text',excerpt.text));
        details.appendChild(make('pre','oo-raw',JSON.stringify(instance.handoff,null,2)));row.appendChild(details);list.appendChild(row);
      }
      if(!state.instances.length)list.appendChild(make('p','','Start a conversation to create your first hub record.'));
      conversations.appendChild(list);grid.appendChild(conversations);
      const notes=make('section','oo-card');notes.appendChild(make('h2','','Notes, tasks and decisions'));
      const form=make('form');form.id='oo-hub-note-form';
      const instanceSelect=make('select','oo-control');instanceSelect.id='oo-hub-note-instance';instanceSelect.setAttribute('aria-label','Conversation for this note');
      for(const instance of state.instances){const op=make('option','',instance.title);op.value=instance.id;instanceSelect.appendChild(op);}if(state.active)instanceSelect.value=state.active;
      const kind=make('select','oo-control');kind.id='oo-hub-note-kind';kind.setAttribute('aria-label','Note type');
      for(const type of ['note','task','decision']){const op=make('option','',type);op.value=type;kind.appendChild(op);}
      const input=make('textarea','oo-control');input.id='oo-hub-note-text';input.maxLength=4000;input.setAttribute('aria-label','Note text');input.placeholder='A note, next step, or decision to keep';
      const save=make('button','oo-btn oo-btn-primary','Save note');save.type='submit';save.disabled=!state.instances.length;
      form.append(instanceSelect,kind,input,save);form.addEventListener('submit',e=>{e.preventDefault();run(()=>{store.addNote(instanceSelect.value,input.value,kind.value);render();status.textContent='Unsealed working note saved.';});});notes.appendChild(form);
      const noteList=make('div');noteList.id='oo-hub-notes';
      for(const note of [...state.notes].reverse()){
        const item=make('article','oo-search-card');item.append(make('strong','',note.kind+' · '+note.status+' · unverified'),make('p','oo-chat-text',note.text));
        item.append(button(note.status==='done'?'Reopen':'Mark done',()=>run(()=>{store.updateNote(note.id,{status:note.status==='done'?'open':'done'});render();})),
          button('Delete note',()=>run(()=>{store.removeNote(note.id);render();})));
        const edit=make('details','oo-details');edit.appendChild(make('summary','','Edit note'));
        const revised=make('textarea','oo-control');revised.value=note.text;revised.maxLength=4000;revised.setAttribute('aria-label','Edit '+note.kind);
        edit.append(revised,button('Save edit',()=>run(()=>{store.updateNote(note.id,{text:revised.value});render();status.textContent='Working note updated.';})));item.appendChild(edit);
        noteList.appendChild(item);
      }
      notes.appendChild(noteList);grid.appendChild(notes);host.append(grid,status);
    }
    try{render();}catch(error){host.replaceChildren(status);status.textContent='Hub unavailable: '+error.message;}
    return {refresh:render};
  }
  root.OneOwnerHubView=Object.freeze({mount});
})(typeof globalThis!=='undefined'?globalThis:this);
