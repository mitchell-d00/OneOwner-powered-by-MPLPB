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
    const api = opts.api, collection = opts.corpus, discovery = globalThis.OneOwnerDiscovery;
    if (!discovery) throw Error('Discovery tools are unavailable.');
    if (!collection) throw Error('Select a collection for chat.');
    const index = readIndex();
    const pool = () => Array.isArray(index[collection]) ? index[collection] : [];
    let session = null, messages = [], busy = false, generation = 0, notes = [], guide = null, alive = true;
    let savedDrafts=discovery.drafts(localStorage,collection);
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
      session = null; messages = []; notes = []; guide = null; generation++;
      updatePicker(); draw();
      status('New chat. Your previous conversations have not been deleted.');
    }, 'oo-btn oo-btn-secondary', 'oo-chat-new');
    const exportBtn = button('Export', () => run(async () => {
      if (!session || session.startsWith('free:')) throw Error('Only saved chats can be exported.');
      const exportData = await api.exportChat(session);
      exportData.product_activity = messages.filter(t=>t.product);
      exportData.product_activity_notice = 'Unverified product guidance and AI activity; outside the native transcript hash chain. Drafts export separately.';
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
        session = null; messages = []; notes = []; guide = null; generation++;
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
    const aiDetails=make('details','oo-assistant-config');
    aiDetails.appendChild(make('summary','','Optional AI and web search service'));
    paragraph(aiDetails,'AI generates unverified ideas. Allowing a message sends it and up to eight previous AI exchanges to your configured assistant service. Saved source pages and native chat are not sent. Permission resets after every message.');
    const endpoint=make('input','oo-control');endpoint.id='oo-ai-endpoint';endpoint.placeholder='https://your-assistant.example/brainstorm';
    endpoint.setAttribute('aria-label','Assistant endpoint');
    const token=make('input','oo-control');token.id='oo-ai-token';token.type='password';token.autocomplete='off';token.placeholder='Service access token (kept in memory only)';token.setAttribute('aria-label','Assistant service access token');
    const aiLabel=make('label','oo-chat-check');
    const aiConsent=make('input');aiConsent.type='checkbox';aiConsent.id='oo-ai-consent';
    aiLabel.append(aiConsent,make('span','','Use AI for this message · send to configured service'));
    aiDetails.append(endpoint,token,aiLabel);panel.appendChild(aiDetails);
    const tools=make('div','oo-actions oo-chat-tools');
    tools.append(button('Find something',()=>startGuide()),
      button('Brainstorm locally',()=>send('Help me brainstorm')),
      button('Explore saved pages',()=>send('show my MPLPB')));
    tools.appendChild(button('Export workspace ideas',()=>{
      const data={notice:'Unverified workspace activity, outside the native transcript chain.',activity:messages.filter(t=>t.product),drafts:savedDrafts};
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const link=make('a');link.href=url;link.download='oneowner-workspace-ideas.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
    panel.insertBefore(tools,log);
    paragraph(panel,'Native conversations resume from MPLPB. Guided discovery and AI exchanges last while this chat is open: save useful ideas as drafts or export workspace ideas before leaving.','oo-footnote');
    const build=make('details','oo-assistant-config');build.appendChild(make('summary','','Create a collection here'));
    const collectionName=make('input','oo-control');collectionName.id='oo-chat-collection-name';collectionName.placeholder='Name your collection';collectionName.maxLength=100;collectionName.setAttribute('aria-label','New collection name');
    build.append(collectionName,button('Create collection',()=>run(async()=>{
      if(!collectionName.value.trim())throw Error('Name your collection first.');
      const created=await api.createCollection(collectionName.value.trim());
      if(alive && typeof opts.refreshCollections==='function')await opts.refreshCollections(created.corpus);
    }),'oo-btn oo-btn-secondary','oo-chat-create-collection'));
    panel.appendChild(build);
    const messageStatus = make('div', 'oo-chat-status');
    messageStatus.id = 'oo-chat-status'; messageStatus.setAttribute('role', 'status'); messageStatus.setAttribute('aria-live', 'polite');
    panel.appendChild(messageStatus);
    const side = make('aside', 'oo-chat-aside');
    const quick = make('div', 'oo-card oo-chat-help');
    quick.appendChild(make('h2', '', 'Choose your chat level'));
    paragraph(quick, 'Beginner examples are plain-language. Advanced tools use the original MPLPB commands. Examples fill your message; choices inside replies submit immediately.');
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
    const draftPanel=make('section','oo-card');draftPanel.appendChild(make('h2','','Idea drafts'));
    paragraph(draftPanel,'Saved on this device in this collection. User notes and AI ideas are unsealed drafts, not MPLPB evidence. Native chat export does not include these drafts.');
    const draftContents=make('div');draftContents.id='oo-chat-drafts';draftPanel.appendChild(draftContents);
    draftPanel.appendChild(button('Export drafts',()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(savedDrafts,null,2)],{type:'application/json'}));
      const link=make('a');link.href=url;link.download='oneowner-idea-drafts.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }));
    if(typeof opts.navigate==='function')draftPanel.appendChild(button('Add a supporting source',()=>opts.navigate('import')));
    side.appendChild(draftPanel);
    layout.append(panel, side); host.appendChild(layout);
    function product(message,extra={}) {
      messages.push({role:'assistant',product:true,response:{kind:'guided_discovery',support_label:'Guided discovery · unverified',answer_supported:false,sources:[],message},...extra});draw();
    }
    function startGuide(){
      if(busy || !alive)return;
      guide={stage:'subject',query:'',era:''};
      product('What are you trying to find? Describe a book, topic, or idea. I’ll help narrow the search.');input.focus();
    }
    function guideReply(value){
      const clue=value.trim();messages.push({role:'user',text:clue,product:true});
      if(guide.stage==='subject'){
        guide.query=discovery.searchPhrase(clue)||clue.slice(0,110);
        if(/book|story|novel/i.test(clue)){
          guide.stage='era';product('Roughly when did you read it?',{choices:['1980s–90s','2000s','2010s or later','Not sure']});
        }else{guide.stage='ready';product('You can edit the search phrase below or search Wikipedia now.',{lookup:guide.query});}
      }else if(guide.stage==='era'){
        guide.era=clue==='Not sure'?'':clue;guide.stage='genre';
        product('What kind of story was it? You can type any other detail you remember.',{choices:['Fantasy','Horror','Science fiction','Not sure']});
      }else{
        const query=[guide.query,guide.era,clue==='Not sure'?'':clue].filter(Boolean).join(' ').slice(0,160);
        guide.stage='ready';product('These are your clues, not an identified book. Try this search, or edit the phrase first.',{lookup:query});
      }
      input.value='';
    }
    function saveDraft(text,origin){
      try{savedDrafts=discovery.saveDraft(localStorage,collection,text,origin);draw();status('Idea saved locally as an unsealed draft.');}
      catch(error){status('Draft not saved: '+error.message);}
    }
    function actionButton(label,request,online=false,edition){
      const b=button(label,()=>{guide=null;send(request,{native:true,allowNetwork:online,wiki:edition});},'oo-chat-suggestion');
      b.disabled=busy;return b;
    }
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
        bubble.appendChild(make('strong', 'oo-chat-speaker', turn.role==='user' ? 'You' : turn.ai ? 'OneOwner · AI brainstorm' : turn.product ? 'OneOwner · guided workspace' : (opts.helperEnabled === false ? 'MPLPB' : (String(opts.helperName || 'OneOwner').slice(0,32) + ' · MPLPB'))));
        if (turn.role === 'assistant') {
          const r=displayLabel(turn.response);
          const badge=make('span','oo-pill oo-neutral',turn.product?r.support:(r.kind==='search'?'Search results':r.support));bubble.appendChild(badge);
          const authority=make('div', 'oo-chat-authority');
          authority.append(make('span', 'oo-pill oo-neutral', 'Engine kind: '+r.kind),
                           make('span', 'oo-pill oo-neutral', 'Engine support: '+r.support));
          const labels=make('details','oo-native-labels');labels.append(make('summary','','Engine labels'),authority);
          if(!turn.product)bubble.appendChild(labels);
          paragraph(bubble, r.message, 'oo-chat-text');
          if (turn.response && Array.isArray(turn.response.sources) && turn.response.sources.length) {
            const sources=make('div', 'oo-chat-source-list');
            sources.appendChild(make('strong', '', 'Sources reported by MPLPB · inspect before relying on them'));
            for (const s of turn.response.sources) {
              paragraph(sources, [s.title||s.id||s.path||'Source',s.path||'',s.hash||''].filter(Boolean).join(' · '), 'oo-mono');
            }
            bubble.appendChild(sources);
          }
          const cards=turn.webResults || discovery.results(turn.response);
          if(cards.length){
            paragraph(bubble,turn.webResults?'Web discovery results · excerpts are not saved evidence.':'Wikipedia discovery results · excerpts are not saved evidence.');
            for(const result of cards){
              const card=make('section','oo-search-card');const link=make('a','oo-text-link',result.title);
              link.href=result.url;link.target='_blank';link.rel='noopener noreferrer';card.appendChild(link);
              paragraph(card,result.url);paragraph(card,result.snippet);
              if(result.wiki)card.appendChild(actionButton('Read & save to MPLPB · online','import '+result.title,true,result.wiki));
              else card.appendChild(button('Read & save snapshot · online',()=>run(async()=>{
                status('Reading source through MPLPB. Browser CORS restrictions may prevent capture.');
                const saved=await api.captureLink({corpus:collection,title:result.title,url:result.url});
                if(!alive)return;
                const pages=await api.pages(collection);
                const page=pages.find(p=>p.title===result.title && p.eligible);
                let text='Snapshot saved by MPLPB. Inspect the capture metadata for provenance.';
                if(page){const source=await api.page(page.path,collection);text=source.text||text;}
                product(text,{response:{kind:'source_inspection',message:text,support_label:'Saved source · inspection only',answer_supported:false,sources:[],capture:saved}});
                status('Snapshot saved. Reading a source does not establish an answer.');
              }),'oo-chat-suggestion'));
              bubble.appendChild(card);
            }
          }else if(turn.response?.kind==='search')paragraph(bubble,'No matching results. Try fewer words or another Wikipedia edition.');
          const inline=make('div','oo-actions');
          if(turn.choices && guide && turn===messages[messages.length-1])for(const choice of turn.choices){
            const b=button(choice,()=>{if(!busy && guide)guideReply(choice);},'oo-chat-suggestion');b.disabled=busy;inline.appendChild(b);
          }
          if(turn.lookup){
            const q=make('input','oo-control');q.value=turn.lookup;q.maxLength=160;q.setAttribute('aria-label','Search phrase');
            inline.append(q,button('Search Wikipedia · online',()=>{guide=null;send('find '+q.value,{native:true,allowNetwork:true});},'oo-chat-suggestion'),
              button('Search web · online',()=>run(async()=>{
                const found=await discovery.searchWeb({url:endpoint.value,token:token.value,query:q.value,consent:true});
                if(!alive)return;guide=null;
                messages.push({role:'user',text:'Search web: '+q.value,product:true});
                product(found.length?'Choose a result to open, or read and save it to your collection.':'No results. Try another phrase.',{webResults:found});
                status('Web search complete. No source pages have been saved.');
              }),'oo-chat-suggestion'));
          }
          if(!turn.product && ['import','built'].includes(turn.response?.kind))inline.appendChild(actionButton('Read saved source','show source'));
          if(!turn.product)for(const a of discovery.actions(turn.response)){
            const online=/^(search|find|import) /i.test(a.request);
            inline.appendChild(actionButton(a.label+(online?' · online':''),a.request,online));
          }
          if(turn.response?.kind==='assisted_draft')inline.appendChild(button('Save AI idea as draft',()=>saveDraft(r.message,'ai'),'oo-chat-suggestion'));
          bubble.appendChild(inline);
          if (turn.response) folded(bubble, turn.product?'Inspect unverified workspace activity':'Inspect original evidence, rules and reply metadata',
            {response:turn.response, turn_sha256:turn.pin||null, authority:turn.product?'unverified_product_activity':'unaltered_native_chat_reply'}, opts.reasonMode);
        } else {paragraph(bubble, turn.text, 'oo-chat-text');bubble.appendChild(button('Save idea as draft',()=>saveDraft(turn.text,'user'),'oo-chat-suggestion'));}
        log.appendChild(bubble);
      }
      log.scrollTop=log.scrollHeight;
      clear(noteContents);
      if (notes.length) for (const n of notes) paragraph(noteContents, '• '+n, 'oo-chat-note');
      else paragraph(noteContents, 'No notes in this conversation yet. Try “remember ...”.', 'oo-footnote');
      clear(suggestions);
      clear(draftContents);
      for(const [i,draft] of savedDrafts.entries()){
        const card=make('section','oo-search-card');paragraph(card,draft.origin==='ai'?'AI draft · unverified':'Your draft · unsealed');paragraph(card,draft.text,'oo-chat-text');
        card.appendChild(button('Use in message',()=>{input.value=draft.text.slice(0,4000);input.focus();}));
        card.appendChild(button('Delete draft',()=>{
          try{const next=savedDrafts.filter((_,n)=>n!==i);localStorage.setItem('oneowner-drafts-v1:'+collection,JSON.stringify(next));savedDrafts=next;draw();}catch(error){status('Could not delete draft: '+error.message);}
        }));draftContents.appendChild(card);
      }
      updatePicker();
      if(busy)for(const b of log.querySelectorAll('button'))b.disabled=true;
    }
    function busyState(value) {
      busy=value; sendBtn.disabled=value; newBtn.disabled=value; picker.disabled=value;
      exportBtn.disabled=value || !session || session.startsWith('free:');
      deleteBtn.disabled=value || !session;
      input.disabled=value;
      for(const b of log.querySelectorAll('button'))b.disabled=value;
      for(const b of tools.querySelectorAll('button'))b.disabled=value;
    }
    async function run(task) {
      if (busy || !alive) return;
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
    async function send(value, explicit = {}) {
      const text=String(value||'').trim();
      if (!text || busy || !alive) return;
      if(aiConsent.checked && explicit.native!==true){
        const seq=generation;aiConsent.checked=false;network.checked=false;
        await run(async()=>{
          const response=await discovery.brainstorm({url:endpoint.value,token:token.value,message:text,consent:true,
            history:messages.filter(t=>t.ai).map(t=>({role:t.role,content:t.text||t.response.message}))});
          if(!alive || seq!==generation)return;
          messages.push({role:'user',text,product:true,ai:true},{role:'assistant',response,product:true,ai:true});
          input.value='';draw();status('AI brainstorm · unverified. Nothing was added to MPLPB.');
        });return;
      }
      if(guide && guide.stage!=='ready'){guideReply(text);return;}
      if(/(?:find|identify|search|look for).*(?:book|novel)|(?:book|novel).*(?:find|identify|search)/i.test(text) && !/^(find|search|import) /i.test(text)){
        guide={stage:'subject',query:'',era:''};guideReply(text);return;
      }
      guide=null;
      const seq=generation;
      await run(async()=>{
        const allowNetwork=explicit.allowNetwork===true || network.checked;
        aiConsent.checked=false;
        const options={corpus:collection, profile:'internal', allowNetwork, wiki:explicit.wiki || wiki.value};
        if (session) options.session=session;
        const previous=messages.slice();
        messages.push({role:'user',text}); draw();
        status(allowNetwork ? 'Asking MPLPB with one-time Wikipedia permission…' : 'Asking the local MPLPB engine…');
        network.checked=false;
        try {
          const response=await api.chat(text,options);
          if (!alive || seq!==generation) return;
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
        if(!alive)return;
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
    picker.addEventListener('change',()=>{guide=null;const id=picker.value; if(id)loadSession(id);else {session=null;messages=[];notes=[];draw();}});
    updatePicker();
    const previous=pool()[0];
    if (previous && previous.id) loadSession(previous.id);
    else draw();
    return Object.freeze({destroy() {alive=false;generation++;token.value='';}, send, getSession:()=>session});
  }
  return Object.freeze({mount, displayLabel});
});
