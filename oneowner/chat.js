/* OneOwner: human-friendly, full-capability local chat surface on the original MPLPB API.
 * No independent reader, answer, owner selection, hashing, or page writes.
 * Engine-provided response.kind and support_label are always shown as labels.
 */
(function (root, factory) {
  'use strict';
  const chat = factory();
  if (typeof module === 'object' && module.exports) module.exports = chat;
  else root.OneOwnerChat = chat;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE = 'oneowner-chat-sessions-v1';
  const make = (tag, cls, value) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (value !== undefined && value !== null) el.textContent = String(value);
    return el;
  };
  const clear = el => el.replaceChildren();
  const paragraph = (parent, value, cls) => parent.appendChild(make('p', cls || 'oo-muted', value));
  const button = (label, callback, cls, id) => {
    const b = make('button', cls || 'oo-btn oo-btn-secondary', label);
    b.type = 'button';
    if (id) b.id = id;
    b.addEventListener('click', callback);
    return b;
  };
  const folded = (host, label, data, expanded) => {
    const d = make('details', 'oo-details');
    d.append(make('summary', '', label), make('pre', 'oo-raw', JSON.stringify(data, null, 2)));
    d.open=!!expanded;
    host.appendChild(d); return d;
  };
  function readIndex() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || '{}');
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    } catch (_) { return {}; }
  }
  function persistIndex(index) {
    try { localStorage.setItem(STORAGE, JSON.stringify(index)); return true; }
    catch (_) { return false; }
  }
  // Authoritative chat labels are source data. Do not reclassify or promote a reply.
  function displayLabel(response) {
    const r = response && typeof response === 'object' ? response : {};
    return {kind: typeof r.kind === 'string' ? r.kind : 'unclassified',
      support: typeof r.support_label === 'string' ? r.support_label : 'not independently verified',
      message: typeof r.message === 'string' ? r.message : 'No message returned by MPLPB.'};
  }
  function mount(host, opts) {
    if (!host || !opts || !opts.api || typeof opts.api.chat !== 'function') {
      throw Error('OneOwner requires the original MPLPB chat API.');
    }
    const api = opts.api, collection = opts.corpus;
    if (!collection) throw Error('Select a collection for chat.');
    const index = readIndex();
    const pool = () => Array.isArray(index[collection]) ? index[collection] : [];
    let session = null, messages = [], busy = false, generation = 0, notes = [];
    clear(host);
    const intro = make('section', 'oo-chat-intro');
    paragraph(intro, 'YOUR LOCAL CONVERSATION', 'oo-eyebrow');
    intro.appendChild(make('h1', 'oo-title', 'Chat with your information'));
    paragraph(intro, 'Ask follow-up questions, keep notes, explore topics and work with your collections. MPLPB runs the conversation locally. Only the original ledger decides which source claims are supported.', 'oo-intro');
    host.appendChild(intro);
    const guideLine=make('div', 'oo-chat-guidance');
    paragraph(guideLine, 'New? Chat uses MPLPB’s local language rules for conversation. Strict Ask is for citations. Saved pages can be explored offline; new website captures need a connection.', 'oo-muted');
    if (typeof opts.navigate === 'function') {
      guideLine.appendChild(button('Learn how it works', () => opts.navigate('learn'), 'oo-btn oo-btn-secondary', 'oo-chat-learn'));
    }
    host.appendChild(guideLine);
    const layout = make('div', 'oo-chat-grid');
    const panel = make('section', 'oo-card oo-chat-panel');
    const top = make('div', 'oo-chat-controls');
    const picker = make('select', 'oo-control oo-chat-picker');
    picker.id = 'oo-chat-sessions'; picker.setAttribute('aria-label', 'Choose a saved conversation');
    const newBtn = button('New chat', () => {
      if (busy) return;
      session = null; messages = []; notes = []; generation++;
      updatePicker(); draw();
      status('New chat. Your previous conversations have not been deleted.');
    }, 'oo-btn oo-btn-secondary', 'oo-chat-new');
    const exportBtn = button('Export', () => run(async () => {
      if (!session || session.startsWith('free:')) throw Error('Only saved chats can be exported.');
      const exportData = await api.exportChat(session);
      const blob = new Blob([JSON.stringify({session, collection, ...exportData}, null, 2)+'\n'], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      try {
        const link = make('a'); link.href = url; link.download = 'oneowner-chat-'+session.slice(0, 12)+'.json';
        document.body.appendChild(link); link.click(); link.remove();
      } finally { URL.revokeObjectURL(url); }
      status('Chat exported. This does not back up your source collections.');
    }), 'oo-btn oo-btn-secondary', 'oo-chat-export');
    const deleteBtn = button('Delete chat', () => {
      if (!session || busy || !window.confirm('Delete this conversation? Its source pages will stay in your collection.')) return;
      run(async () => {
        const previous = session;
        await api.resetChat(previous);
        index[collection] = pool().filter(x => x.id !== previous);
        const saved = persistIndex(index);
        session = null; messages = []; notes = []; generation++;
        updatePicker(); draw(); status(saved ? 'Chat deleted. Source pages remain.' : 'Chat deleted, but local chat index could not be saved.');
      });
    }, 'oo-btn oo-btn-danger', 'oo-chat-delete');
    top.append(picker, newBtn, exportBtn, deleteBtn);
    panel.appendChild(top);
    const log = make('div', 'oo-chat-log'); log.id = 'oo-chat-log';
    log.setAttribute('role', 'log'); log.setAttribute('aria-label', 'Conversation messages');
    panel.appendChild(log);
    const suggestions = make('div', 'oo-chat-suggestions'); suggestions.id = 'oo-chat-suggestions';
    panel.appendChild(suggestions);
    const composer = make('form', 'oo-chat-composer'); composer.id = 'oo-chat-form';
    const label = make('label', '', 'Your message'); label.htmlFor = 'oo-chat-input';
    const input = make('textarea', 'oo-control'); input.id = 'oo-chat-input'; input.rows = 3; input.maxLength = 4000;
    input.placeholder = 'Say hello, ask about a saved page, or try “remember ...”';
    if (typeof opts.draft === 'string' && opts.draft.trim()) input.value = opts.draft.slice(0,4000);
    const sendBtn = make('button', 'oo-btn oo-btn-primary', 'Send'); sendBtn.id = 'oo-chat-send'; sendBtn.type = 'submit';
    composer.append(label, input, sendBtn);
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault(); if (input.value.trim()) send(input.value);
      }
    });
    composer.addEventListener('submit', ev => { ev.preventDefault(); send(input.value); });
    const networkRow = make('div', 'oo-chat-network');
    const networkLabel = make('label', 'oo-chat-check');
    const network = make('input'); network.type='checkbox'; network.id='oo-chat-network';
    networkLabel.append(network, make('span', '', 'Allow Wikipedia lookup for this message only'));
    const wiki = make('select', 'oo-control oo-chat-wiki'); wiki.id='oo-chat-wiki';
    for (const value of ['simple', 'english']) {
      const op = make('option', '', value === 'simple' ? 'Simple Wikipedia' : 'English Wikipedia');
      op.value = value; wiki.appendChild(op);
    }
    wiki.setAttribute('aria-label', 'Wikipedia edition');
    networkRow.append(networkLabel, wiki);
    const networkHint = make('p', 'oo-footnote', 'Online access stays off by default and resets after each message. In the browser, MPLPB provides optional Wikipedia acquisition, not an unrestricted web crawler.');
    // The composer must be mounted before the network controls; otherwise
    // Chat appears but users have no message box or Send button.
    panel.append(composer, networkRow, networkHint);
    const messageStatus = make('div', 'oo-chat-status');
    messageStatus.id = 'oo-chat-status'; messageStatus.setAttribute('role', 'status'); messageStatus.setAttribute('aria-live', 'polite');
    panel.appendChild(messageStatus);
    const side = make('aside', 'oo-chat-aside');
    const quick = make('div', 'oo-card oo-chat-help');
    quick.appendChild(make('h2', '', 'Choose your chat level'));
    paragraph(quick, 'Beginner examples are plain-language. Advanced tools use the original MPLPB commands. Choosing an example only fills your message.');
    const tabs=make('div','oo-chat-level-tabs');
    tabs.setAttribute('role','group');
    tabs.setAttribute('aria-label','Chat learning level');
    const basic=make('div', 'oo-chat-basic');
    const advanced=make('div', 'oo-chat-advanced');
    const switchLevel=level=>{
      const beginner=level==='basic';
      basic.hidden=!beginner;
      advanced.hidden=beginner;
      basicTab.setAttribute('aria-pressed',String(beginner));
      advancedTab.setAttribute('aria-pressed',String(!beginner));
    };
    const basicTab=button('Basic chat',()=>switchLevel('basic'),'oo-chat-level-btn','oo-chat-basic-tab');
    const advancedTab=button('Advanced chat',()=>switchLevel('advanced'),'oo-chat-level-btn','oo-chat-advanced-tab');
    tabs.append(basicTab,advancedTab);
    quick.appendChild(tabs);
    basic.appendChild(make('h3','','Try something familiar'));
    paragraph(basic, 'You can chat, remember a note, or ask about a saved page. Choose an example below to fill the message box.', 'oo-footnote');
    const scenarios = [
      ['Research', 'topic Exact source title', 'Explore an existing page or start from your research collection.'],
      ['Recipes', 'What does my saved recipe say about the ingredients?', 'Ask about a recipe you have added as a source page.'],
      ['Personal notes', 'remember I want to make this recipe this weekend', 'Keep a conversational note. This does not turn the note into a sealed evidence page.'],
      ['Factual collections', 'load all MPLPB', 'Load your existing collections into the chat environment.'],
      ['Helpful commands', 'guide me', 'Ask MPLPB to explain the available local actions.']
    ];
    for (const [name, example, description] of scenarios) {
      const item=make('div', 'oo-chat-scenario');
      item.append(button(name, () => {input.value=example; input.focus();}, 'oo-chat-idea'));
      paragraph(item, description, 'oo-footnote'); basic.appendChild(item);
    }
    const beginnerActions=make('div','oo-chat-mode');
    basic.appendChild(make('h3','','Start with a guided lesson'));
    paragraph(basic, 'MPLPB can teach itself in four native chat steps. Ask “guide me”, then reply “next” or “previous step”.','oo-footnote');
    beginnerActions.appendChild(button('Start guided lesson',()=>{input.value='guide me';input.focus();},'oo-btn oo-btn-secondary','oo-chat-guide'));
    basic.appendChild(beginnerActions);
    const actions = make('div', 'oo-chat-mode');
    advanced.appendChild(make('h3', '', 'Native MPLPB conversation modes'));
    paragraph(advanced,'These commands go to the unchanged MPLPB language engine. They change chat context, not which page owns a strict answer.','oo-footnote');
    for (const [label, command] of [
      ['Just chat', 'chat mode'], ['Focus on evidence', 'serious mode'],
      ['Use all collections', 'load all MPLPB'], ['Show remembered notes', 'what do you remember about me?'],
      ['Off-the-record chat', 'off-the-record free chat']]) {
      actions.appendChild(button(label, () => {input.value=command; input.focus();}, 'oo-btn oo-btn-secondary'));
    }
    advanced.appendChild(actions);
    advanced.appendChild(make('h3','','Source-focused steps'));
    for(const [label,command,explanation] of [
      ['List saved page titles','show my MPLPB','Shows what the current collection can inspect.'],
      ['Select an exact page','topic Exact title','Replace “Exact title” with a page title you have saved.'],
      ['View source text','show source','Works after a supported topic is selected.'],
      ['Find a remote topic','search dinosaurs','Needs one-time Wikipedia permission and a connection.']
    ]) {
      const item=make('div','oo-chat-scenario');
      item.appendChild(button(label,()=>{input.value=command;input.focus();},'oo-chat-idea'));
      paragraph(item,explanation,'oo-footnote');advanced.appendChild(item);
    }
    paragraph(advanced,'“Chat mode” is casual; “serious mode” consults loaded collections. A native conversation reply is not automatically source-supported.', 'oo-footnote');
    quick.append(basic,advanced);
    switchLevel('basic');
    side.appendChild(quick);
    const offlineCard=make('section','oo-card oo-chat-offline');
    offlineCard.appendChild(make('h2','','Offline and source support'));
    paragraph(offlineCard,'Local chat and previously captured pages use the embedded MPLPB runtime. Network lookup is optional, off by default, and requires a connection.');
    paragraph(offlineCard,'A remembered note is conversational context, not a sealed evidence page. For a strict answer, use Ask · cited answers.');
    if(typeof opts.navigate==='function') offlineCard.appendChild(button('Learn offline pages',()=>opts.navigate('learn'),'oo-btn oo-btn-secondary'));
    side.appendChild(offlineCard);
    const notePanel=make('section', 'oo-card oo-chat-notes');
    notePanel.appendChild(make('h2', '', 'Conversation notes'));
    const noteContents=make('div'); noteContents.id = 'oo-chat-notes';
    notePanel.appendChild(noteContents);
    paragraph(notePanel, 'Notes belong to a conversation. They are not automatically eligible evidence or a source database.', 'oo-footnote');
    side.appendChild(notePanel);
    layout.append(panel, side); host.appendChild(layout);
    function status(text) { messageStatus.textContent = text || ''; }
    function updatePicker() {
      clear(picker);
      const empty = make('option', '', 'New conversation'); empty.value=''; picker.appendChild(empty);
      for (const slot of pool()) {
        if (!slot || typeof slot.id !== 'string') continue;
        const option=make('option', '', slot.label || 'Saved conversation');
        option.value=slot.id; picker.appendChild(option);
      }
      picker.value = session && pool().some(s => s.id===session) ? session : '';
      exportBtn.disabled = busy || !session || session.startsWith('free:');
      deleteBtn.disabled = busy || !session;
    }
    function draw() {
      clear(log);
      if (!messages.length) {
        const welcome = make('div', 'oo-chat-welcome');
        welcome.appendChild(make('h2', '', 'Start with a question or a note'));
        paragraph(welcome, 'Your chat can help you work through research, recipes, memories and factual collections. Ask about saved pages for evidence; use Ask when you need a strict, cited answer.');
        log.appendChild(welcome);
      }
      for (const turn of messages) {
        const bubble = make('article', 'oo-chat-bubble '+(turn.role==='user' ? 'oo-chat-user' : 'oo-chat-assistant'));
        bubble.appendChild(make('strong', 'oo-chat-speaker', turn.role==='user' ? 'You' : (opts.helperEnabled === false ? 'MPLPB' : (String(opts.helperName || 'OneOwner').slice(0,32) + ' · MPLPB'))));
        if (turn.role === 'assistant') {
          const r=displayLabel(turn.response);
          const authority=make('div', 'oo-chat-authority');
          authority.append(make('span', 'oo-pill oo-neutral', 'Engine kind: '+r.kind),
                           make('span', 'oo-pill oo-neutral', 'Engine support: '+r.support));
          bubble.appendChild(authority);
          paragraph(bubble, r.message, 'oo-chat-text');
          if (turn.response && Array.isArray(turn.response.sources) && turn.response.sources.length) {
            const sources=make('div', 'oo-chat-source-list');
            sources.appendChild(make('strong', '', 'Sources reported by MPLPB · inspect before relying on them'));
            for (const s of turn.response.sources) {
              paragraph(sources, [s.title||s.id||s.path||'Source',s.path||'',s.hash||''].filter(Boolean).join(' · '), 'oo-mono');
            }
            bubble.appendChild(sources);
          }
          if (turn.response) folded(bubble, 'Inspect original evidence, rules and reply metadata',
            {response:turn.response, turn_sha256:turn.pin||null, authority:'unaltered_native_chat_reply'}, opts.reasonMode);
        } else paragraph(bubble, turn.text, 'oo-chat-text');
        log.appendChild(bubble);
      }
      log.scrollTop=log.scrollHeight;
      clear(noteContents);
      if (notes.length) for (const n of notes) paragraph(noteContents, '• '+n, 'oo-chat-note');
      else paragraph(noteContents, 'No notes in this conversation yet. Try “remember ...”.', 'oo-footnote');
      clear(suggestions);
      const last=[...messages].reverse().find(t=>t.role==='assistant');
      const r=last && last.response;
      const list=Array.isArray(r?.guidance?.actions) ? r.guidance.actions.map(a=>({label:a.label,request:a.request})) :
        Array.isArray(r?.suggestions) ? r.suggestions.map(s=>({label:s,request:s})) : [];
      if (list.length) {
        suggestions.appendChild(make('strong', '', 'Continue exploring'));
        for (const a of list.slice(0,4)) if(typeof a.request==='string' && a.request.trim()) {
          suggestions.appendChild(button(String(a.label||a.request).slice(0,130), () => {input.value=a.request; input.focus();}, 'oo-chat-suggestion'));
        }
      }
      updatePicker();
    }
    function busyState(value) {
      busy=value; sendBtn.disabled=value; newBtn.disabled=value; picker.disabled=value;
      exportBtn.disabled=value || !session || session.startsWith('free:');
      deleteBtn.disabled=value || !session;
      input.disabled=value;
    }
    async function run(task) {
      if (busy) return;
      busyState(true);
      try { await task(); }
      catch (error) { status('Not completed: '+(error?.message || String(error))); }
      finally {busyState(false);}
    }
    function rememberSession(id, first, actualCollection) {
      if (!id || id.startsWith('free:')) return true;
      const target = actualCollection || collection;
      if (target !== collection) index[collection] = pool().filter(x => x && x.id !== id);
      const saved = Array.isArray(index[target]) ? index[target] : [];
      index[target] = [{id, label:(first || 'Conversation').slice(0, 56)},
        ...saved.filter(x => x && x.id !== id)].slice(0, 32);
      return persistIndex(index);
    }
    async function send(value) {
      const text=String(value||'').trim();
      if (!text || busy) return;
      const seq=generation;
      await run(async()=>{
        const allowNetwork=network.checked;
        const options={corpus:collection, profile:'internal', allowNetwork, wiki:wiki.value};
        if (session) options.session=session;
        const previous=messages.slice();
        messages.push({role:'user',text}); draw();
        status(allowNetwork ? 'Asking MPLPB with one-time Wikipedia permission…' : 'Asking the local MPLPB engine…');
        network.checked=false;
        try {
          const response=await api.chat(text,options);
          if (seq!==generation) return;
          if (!response || typeof response.session!=='string' || !response.response) throw Error('Incomplete native chat result.');
          session=response.session;
          notes=Array.isArray(response.mind?.notes)?response.mind.notes.slice():[];
          messages.push({role:'assistant',response:response.response,pin:response.turn_sha256});
          const saved=rememberSession(session,previous.find(x=>x.role==='user')?.text || text,response.corpus || collection);
          input.value=''; draw();
          if (response.corpus && response.corpus!==collection) {
            status('MPLPB changed the active source collection to '+response.corpus+'. Select that collection above to continue.');
            if (typeof opts.refreshCollections==='function') await opts.refreshCollections(response.corpus);
          } else status('MPLPB: '+(response.response.kind||'chat')+
            ' · '+(response.response.support_label||'not a strict supported answer')+
            (saved ? '' : ' · Local chat index could not be saved; export this session.'));
        } catch(error) {
          if(seq===generation) {messages=previous;draw(); }
          throw error;
        }
      });
    }
    async function loadSession(id) {
      if (!id || busy) return;
      await run(async()=>{
        const result=await api.resumeChat(id);
        if (result.corpus!==collection) throw Error('Saved chat belongs to another collection. Choose that collection first.');
        const turns=[];
        for (const entry of result.turns) {
          const payload=entry && entry.payload;
          if (!payload || typeof payload.question!=='string' || !payload.response) throw Error('Saved chat contains an invalid turn.');
          turns.push({role:'user',text:payload.question});
          turns.push({role:'assistant',response:payload.response,pin:entry.sha256});
        }
        session=id; messages=turns; notes=Array.isArray(result.notes)?result.notes:[];
        draw(); status('Chat resumed with an intact transcript chain. Earlier answers are historical, not newly verified.');
      });
    }
    picker.addEventListener('change',()=>{const id=picker.value; if(id)loadSession(id);else {session=null;messages=[];notes=[];draw();}});
    updatePicker();
    const previous=pool()[0];
    if (previous && previous.id) loadSession(previous.id);
    else draw();
    return Object.freeze({destroy() {generation++;}, send, getSession:()=>session});
  }
  return Object.freeze({mount, displayLabel});
});
