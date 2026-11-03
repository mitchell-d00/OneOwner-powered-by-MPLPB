/* OneOwner's independent, local-first product page.
   Presentation and user actions only; all ledger authority stays in window.MPLPB. */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const $ = id => document.getElementById(id);
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  };
  const button = (text, callback, className, id) => {
    const b = make('button', className, text);
    b.type = 'button';
    if (id) b.id = id;
    b.addEventListener('click', callback);
    return b;
  };
  const field = (text, id, tag, placeholder) => {
    const holder = make('div', 'oo-field');
    const label = make('label', '', text);
    label.htmlFor = id;
    const input = make(tag || 'input', 'oo-control');
    input.id = id;
    if (placeholder) input.placeholder = placeholder;
    if (tag === 'textarea') input.rows = 7;
    holder.append(label, input);
    return { holder, input };
  };
  const paragraph = (parent, text, className) => parent.appendChild(make('p', className || 'oo-muted', text));
  const clear = el => el.replaceChildren();
  const raw = (parent, obj, summary) => {
    const details = make('details', 'oo-details');
    details.append(make('summary', '', summary), make('pre', 'oo-raw', JSON.stringify(obj, null, 2)));
    details.open = !!preferences.reasonMode;
    parent.appendChild(details);
    return details;
  };
  let api, screen = 'home', corpus = '', corpora = [], busy = false;
  let question = '', latestAnswer = null, pageCache = null, pageError = '';
  let chatController = null, chatDraft = '';
  let preferences = null, themeMedia = null;
  const views = [
    ['home', 'Overview', 'layout-dashboard'],
    ['chat', 'Chat', 'messages-square'],
    ['learn', 'Learn OneOwner', 'graduation-cap'],
    ['ask', 'Ask · cited answers', 'message-square-text'],
    ['library', 'Explore pages', 'files'],
    ['import', 'Add or revise', 'file-plus'],
    ['history', 'History', 'history'],
    ['settings', 'Settings', 'settings'],
    ['about', 'About', 'shield-check']
  ];
  function currentLabel() {
    const found = corpora.find(item => item.key === corpus);
    return found ? (found.label || found.key) : 'No collection';
  }
  function setNotice(message, severity) {
    const notice = $('oo-notice');
    if (!notice) return;
    notice.textContent = message || '';
    notice.dataset.kind = severity || 'neutral';
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    setNotice('Checking with Combined MPLPB…');
    try { await fn(); }
    catch (error) { setNotice('Stopped: ' + (error && error.message || String(error)), 'error'); }
    finally { busy = false; }
  }
  function top(parent, eyebrow, title, description) {
    paragraph(parent, eyebrow.toUpperCase(), 'oo-eyebrow');
    parent.appendChild(make('h1', 'oo-title', title));
    if (description) paragraph(parent, description, 'oo-intro');
  }
  function line(parent) { parent.appendChild(make('div', 'oo-rule')); }
  function pill(parent, text, kind) {
    const p = make('span', 'oo-pill oo-' + (kind || 'neutral'), text);
    parent.appendChild(p); return p;
  }
  function card(parent, className) {
    const c = make('section', 'oo-card ' + (className || ''));
    parent.appendChild(c); return c;
  }
  function selected() {
    if (!corpus) throw Error('Create or select a collection first.');
    return corpus;
  }
  function navRender() {
    const nav = $('oo-nav');
    clear(nav);
    for (const [key, label] of views) {
      const b = button(label, () => switchTo(key), 'oo-nav-item' + (screen === key ? ' oo-current' : ''));
      b.dataset.screen = key;
      if (screen === key) b.setAttribute('aria-current', 'page');
      nav.appendChild(b);
    }
    const select = $('oo-corpus');
    clear(select);
    if (!corpora.length) {
      const empty = make('option', '', 'No collections'); empty.value = ''; select.appendChild(empty);
    } else {
      for (const entry of corpora) {
        const opt = make('option', '', entry.label || entry.key); opt.value = entry.key;
        select.appendChild(opt);
      }
      if (corpora.some(c => c.key === corpus)) select.value = corpus;
    }
    $('oo-collection-name').textContent = currentLabel();
  }
  async function refreshCollections(prefer) {
    corpora = await api.collections();
    if (!Array.isArray(corpora)) throw Error('Invalid collection inventory from original engine.');
    if (prefer && corpora.some(x => x.key === prefer)) corpus = prefer;
    else if (!corpora.some(x => x.key === corpus)) corpus = corpora[0] ? corpora[0].key : '';
    navRender();
  }
  function openChatWithPrompt(prompt) {
    chatDraft = typeof prompt === 'string' ? prompt : '';
    switchTo('chat');
  }
  function switchTo(next) {
    screen = next;
    pageCache = null;
    navRender();
    render();
    if (next === 'library') action(loadPages);
    if (next === 'history') action(loadHistory);
  }
  function isSystemDark() {
    return !!(themeMedia && themeMedia.matches);
  }
  function applyPreferences() {
    if (!preferences || !window.OneOwnerSettings) return;
    window.OneOwnerSettings.apply($('oneowner-app'),preferences,isSystemDark());
    const toggle=$('oo-theme-toggle');
    if (toggle) {
      const dark=$('oneowner-app').dataset.ooTheme==='dark';
      toggle.textContent=dark?'☀ Light mode':'☾ Dark mode';
      toggle.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');
      toggle.title='Change color mode; more options in Settings';
    }
  }
  function storage() {
    try {return window.localStorage;}
    catch (_) {return {getItem:()=>null,setItem:()=>{throw Error('Storage unavailable');}};}
  }
  function updatePreference(name,value) {
    preferences=window.OneOwnerSettings.normalize({...preferences,[name]:value});
    applyPreferences();
    const saved=window.OneOwnerSettings.save(storage(),preferences);
    const status=$('oo-settings-status');
    if (status)status.textContent=saved
      ? 'Saved in this browser. These settings do not change ledger pages, chat authority or stored hashes.'
      : 'Preference applied for this tab, but browser storage is unavailable.';
  }
  function renderSettings(parent) {
    top(parent,'Your workspace','Settings & appearance',
      'Choose how OneOwner looks and how much evidence detail to show. These are display preferences; the pinned MPLPB engine and saved pages are unchanged.');
    const section=card(parent,'oo-settings-card');
    section.appendChild(make('h2','','Make the workspace comfortable'));
    const grid=make('div','oo-settings-grid');
    function option(name,id,values) {
      const holder=make('div','oo-field');
      const label=make('label','',name);label.htmlFor=id;
      const sel=make('select','oo-control');sel.id=id;
      for(const [value,text] of values) {
        const opt=make('option','',text);opt.value=value;sel.appendChild(opt);
      }
      sel.value=preferences[id.slice(3)]||'';
      holder.append(label,sel);
      grid.appendChild(holder);
      return sel;
    }
    const theme=option('Color mode','oo-theme',[
      ['system','Follow device'],['light','Light'],['dark','Dark']
    ]);
    const skin=option('Visual setting','oo-setting',[
      ['oneowner','OneOwner · modern'],['fantasy','Fantasy · parchment'],
      ['scifi','Sci-fi · console'],['wasteland','Wasteland · archive']
    ]);
    const text=option('Reading size','oo-textSize',[
      ['normal','Standard'],['large','Larger text']
    ]);
    theme.addEventListener('change',()=>updatePreference('theme',theme.value));
    skin.addEventListener('change',()=>updatePreference('setting',skin.value));
    text.addEventListener('change',()=>updatePreference('textSize',text.value));
    section.appendChild(grid);
    const controls=make('div','oo-settings-options');
    function choice(name,id,key,description) {
      const row=make('label','oo-settings-choice');
      const checkbox=make('input');checkbox.type='checkbox';checkbox.id=id;
      checkbox.checked=!!preferences[key];
      const info=make('span');
      info.append(make('strong','',name),make('small','',description));
      row.append(checkbox,info);controls.appendChild(row);
      checkbox.addEventListener('change',()=>updatePreference(key,checkbox.checked));
    }
    choice('Reduce animation','oo-reduce-motion','reduceMotion','Turn off decorative transitions. Device reduced-motion preferences are also respected.');
    choice('Expand evidence details','oo-reason-mode','reasonMode','Show decision traces and original response metadata by default. This does not change answer support.');
    choice('Show custom helper label','oo-helper-enabled','helperEnabled','Change only the speaker label in OneOwner Chat, not the MPLPB language engine.');
    section.appendChild(controls);
    const helper=field('Chat helper display name','oo-helper-name','input','OneOwner');
    helper.input.value=preferences.helperName;
    helper.input.maxLength=32;
    helper.input.autocomplete='off';
    helper.input.addEventListener('change',()=>{updatePreference('helperName',helper.input.value);helper.input.value=preferences.helperName;});
    section.appendChild(helper.holder);
    const preview=make('div','oo-settings-preview');
    preview.appendChild(make('h3','','Preview'));
    paragraph(preview,'Readable pages, comfortable conversations, and evidence you can inspect.');
    const accent=make('span','oo-pill oo-success','SOURCE SUPPORTED');preview.appendChild(accent);
    section.appendChild(preview);
    const actions=make('div','oo-actions');
    actions.appendChild(button('Restore appearance defaults',()=>{
      preferences=window.OneOwnerSettings.normalize({});
      window.OneOwnerSettings.save(storage(),preferences);
      applyPreferences();clear(parent);renderSettings(parent);
    },'oo-btn oo-btn-secondary','oo-settings-reset'));
    section.appendChild(actions);
    const status=make('p','oo-footnote');status.id='oo-settings-status';
    status.setAttribute('role','status');
    status.textContent='Appearance is stored only in this browser; it does not sync to MPLPB or change source eligibility.';
    section.appendChild(status);
    const limits=card(parent,'oo-settings-limits');
    limits.appendChild(make('h2','','Privacy and local use'));
    paragraph(limits,'These settings are local to OneOwner on this browser. They do not alter your MPLPB research settings, collection history, hashes, or the one-owner rule.');
    paragraph(limits,'Website searches and Wikipedia lookup remain opt-in for each request. Changing a color or helper name never enables network access.');
  }
  function render() {
    const parent = $('oo-screen');
    if (chatController) {chatController.destroy(); chatController=null;}
    clear(parent);
    if (screen === 'home') renderHome(parent);
    if (screen === 'chat') {
      if (!window.OneOwnerChat) throw Error('The OneOwner chat interface is missing; no fallback chat is permitted.');
      chatController = window.OneOwnerChat.mount(parent, {api, corpus:selected(), draft:chatDraft, navigate:switchTo, helperName:preferences.helperName, helperEnabled:preferences.helperEnabled, reasonMode:preferences.reasonMode, refreshCollections:async prefer => {await refreshCollections(prefer); render();}});
      chatDraft = '';
    }
    if (screen === 'learn') {
      if (!window.OneOwnerLearn) throw Error('The OneOwner learning guide is missing.');
      window.OneOwnerLearn.mount(parent, {openChat:openChatWithPrompt, navigate:switchTo});
    }
    if (screen === 'ask') renderAsk(parent);
    if (screen === 'library') renderLibrary(parent);
    if (screen === 'import') renderImport(parent);
    if (screen === 'history') renderHistory(parent);
    if (screen === 'settings') renderSettings(parent);
    if (screen === 'about') renderAbout(parent);
  }
  function renderHome(parent) {
    const hero = make('section', 'oo-hero');
    hero.appendChild(make('div', 'oo-glow'));
    paragraph(hero, 'THE LOCAL EVIDENCE WORKSPACE', 'oo-eyebrow');
    hero.appendChild(make('h1', 'oo-hero-title', 'Know what your pages can prove.'));
    paragraph(hero, 'Chat, keep notes, explore recipes and research, or build factual collections. Your saved pages remain the authority for evidence-based answers.', 'oo-hero-copy');
    const actions = make('div', 'oo-actions');
    actions.append(button('Start chatting', () => switchTo('chat'), 'oo-btn oo-btn-light'));
    actions.append(button('Create a collection', () => switchTo('import'), 'oo-btn oo-btn-ghost-light'));
    actions.append(button('How OneOwner works', () => switchTo('learn'), 'oo-btn oo-btn-ghost-light'));
    hero.appendChild(actions); parent.appendChild(hero);
    const g = make('div', 'oo-three');
    const items = [
      ['01', 'One eligible owner', 'A supported return cites the page and sealed hash.'],
      ['02', 'Competing owners', 'Ambiguity stops the answer. Nothing is silently selected.'],
      ['00', 'No eligible owner', 'A clear refusal, without invented source material.']
    ];
    for (const item of items) {
      const c = card(g, 'oo-principle');
      c.append(make('span', 'oo-number', item[0]), make('h2', '', item[1]));
      paragraph(c, item[2]);
    }
    parent.appendChild(g);
    const uses = card(parent, 'oo-uses');
    uses.appendChild(make('h2', '', 'Make OneOwner your own'));
    paragraph(uses, 'The same MPLPB engine works behind each workflow. You choose what to save and what counts as evidence.');
    const useGrid=make('div', 'oo-use-grid');
    for (const [name,description,view] of [
      ['Research', 'Organize references and ask questions with citations.', 'import'],
      ['Recipes', 'Keep cooking instructions and revise them without losing older versions.', 'import'],
      ['Memories & notes', 'Chat and save personal notes; decide separately what should become source material.', 'chat'],
      ['Fact libraries', 'Create collections of sourced information you can inspect and update.', 'import']]) {
      const use=make('div', 'oo-use-card');
      use.append(make('h3', '', name)); paragraph(use, description, 'oo-muted');
      use.appendChild(button(view==='chat'?'Open chat':'Build a collection', () => switchTo(view), 'oo-btn oo-btn-secondary'));
      useGrid.appendChild(use);
    }
    uses.appendChild(useGrid);
    const shelf = card(parent, 'oo-next');
    const h = make('div');
    paragraph(h, 'CURRENT WORKSPACE', 'oo-eyebrow');
    h.appendChild(make('h2', '', currentLabel()));
    paragraph(h, 'Your files stay local to the original MPLPB storage. Switch collections above or create one to begin.');
    shelf.append(h, button('Explore this ledger', () => switchTo('library'), 'oo-btn oo-btn-secondary'));
  }
  function renderAsk(parent) {
    top(parent, 'Strict reader', 'Ask the ledger', 'Use this for a sourced answer from your saved pages. To introduce yourself, chat naturally, get a guided lesson, or ask “What are you?”, open Chat instead.');
    const introActions = make('div', 'oo-actions oo-ask-help');
    introActions.append(button('Try basic chat', () => openChatWithPrompt('What are you?'), 'oo-btn oo-btn-secondary', 'oo-ask-to-chat'));
    introActions.append(button('Learn the difference', () => switchTo('learn'), 'oo-btn oo-btn-secondary'));
    parent.appendChild(introActions);
    const grid = make('div', 'oo-split');
    const form = card(grid, '');
    const q = field('Your question', 'oo-question', 'textarea', 'What can this collection support?');
    q.input.rows = 5; q.input.value = question;
    q.input.addEventListener('input', () => { question = q.input.value; });
    form.appendChild(q.holder);
    const actions = make('div', 'oo-actions');
    actions.appendChild(button('Ask OneOwner', () => action(async () => {
      const output = await api.ask(question, selected());
      latestAnswer = output;
      setNotice(output.supported ? 'Source-supported result from the sealed ledger.' : 'No supported answer was issued.', output.supported ? 'ok' : 'neutral');
      renderAskResult($('oo-answer'));
    }), 'oo-btn oo-btn-primary', 'oo-ask'));
    form.appendChild(actions);
    paragraph(form, 'A page hash confirms the sealed bytes, not the truth of a claim.', 'oo-footnote');
    const result = card(grid, 'oo-answer-card'); result.id = 'oo-answer';
    renderAskResult(result); parent.appendChild(grid);
  }
  function renderAskResult(parent) {
    clear(parent);
    if (!latestAnswer) {
      const icon = make('div', 'oo-empty-icon', '?');
      parent.appendChild(icon);
      parent.appendChild(make('h2', '', 'Your decision appears here'));
      paragraph(parent, 'Ask a question to see the exact result, page citation, sealed hash, and engine decision trace.');
      return;
    }
    const res = latestAnswer;
    pill(parent, res.supported ? 'SOURCE SUPPORTED' : (res.status || 'NOT SUPPORTED').replaceAll('_', ' ').toUpperCase(), res.supported ? 'success' : 'warning');
    parent.appendChild(make('h2', 'oo-result-heading', res.supported ? 'Evidence found' : 'No supported answer'));
    paragraph(parent, res.message || 'No source-supported answer was returned.', res.supported ? 'oo-supported-copy' : 'oo-refusal-copy');
    if (res.supported) {
      const evidence = make('div', 'oo-evidence');
      evidence.appendChild(make('strong', '', 'Source citation'));
      evidence.appendChild(make('code', '', res.citation));
      evidence.appendChild(make('strong', '', 'Sealed page hash'));
      evidence.appendChild(make('code', '', res.hash));
      parent.appendChild(evidence);
    } else {
      const guidance = make('div', 'oo-next-steps');
      guidance.appendChild(make('strong', '', 'What you can do next'));
      paragraph(guidance, res.status === 'ambiguous'
        ? 'Review the competing pages and revise the ledger before asking again.'
        : 'Explore what is recorded, or add a relevant source page. The answer cannot be supplied from outside this ledger.');
      const actions = make('div', 'oo-actions');
      actions.appendChild(button('Explore pages', () => switchTo('library'), 'oo-btn oo-btn-secondary'));
      actions.appendChild(button('Add a source', () => switchTo('import'), 'oo-btn oo-btn-secondary'));
      guidance.appendChild(actions);
      parent.appendChild(guidance);
    }
    raw(parent, res.trace, 'Inspect decision trace · owners, exclusions, diagnostics');
  }
  async function loadPages() {
    const target = $('oo-library-list');
    if (!target) return;
    clear(target);
    const pages = await api.pages(selected());
    if (!Array.isArray(pages)) throw Error('Engine page inventory was not an array.');
    if (!pages.length) {
      const empty = card(target, 'oo-empty');
      empty.appendChild(make('h2', '', 'No pages in this collection'));
      paragraph(empty, 'Add a source page, then return here to inspect its eligibility and sealed record.');
      empty.appendChild(button('Add a page', () => switchTo('import'), 'oo-btn oo-btn-primary'));
      return;
    }
    paragraph(target, pages.length + ' retained page record(s), including ineligible history. Only the original engine decides eligibility.');
    for (const p of pages) {
      const row = card(target, 'oo-page');
      const body = make('div', 'oo-page-info');
      body.appendChild(make('h3', '', p.title || p.path || 'Untitled source'));
      paragraph(body, p.path || 'Source page', 'oo-mono');
      const eligible = p.eligible === true;
      pill(body, eligible ? 'Eligible' : 'Not eligible', eligible ? 'success' : 'warning');
      if (!eligible) paragraph(body, 'Engine reason: ' + (typeof p.reason === 'string' ? p.reason : JSON.stringify(p.reasons || 'See source inventory')));
      row.appendChild(body);
      if (eligible && p.path) row.appendChild(button('Inspect page', () => action(async () => {
        const value = await api.continueFrom(p.path, selected());
        const section = $('oo-page-inspector');
        clear(section); section.hidden = false;
        top(section, 'Saved page · inspection only', p.title || p.path, value.notice);
        if (value.source && typeof value.source.text === 'string') {
          const reading = make('article', 'oo-page-reading');
          paragraph(reading, 'READABLE SAVED SOURCE', 'oo-eyebrow');
          paragraph(reading, value.source.text, 'oo-source-text');
          paragraph(reading, 'This is the page as retained locally. It is not a new answer or a verification of the source’s truth.', 'oo-footnote');
          if (typeof value.source.hash === 'string') {
            reading.appendChild(make('code', 'oo-mono', 'Sealed page hash: ' + value.source.hash));
          }
          const sourceActions = make('div', 'oo-actions');
          sourceActions.appendChild(button('Chat about this page', () => openChatWithPrompt('topic ' + (value.source.title || p.title || p.path)), 'oo-btn oo-btn-primary', 'oo-inspector-chat'));
          reading.appendChild(sourceActions);
          section.appendChild(reading);
        }
        raw(section, value.source, 'Inspect original page fields and hash');
        raw(section, value.history, 'Retained lineage and capture history');
        section.scrollIntoView({behavior:'smooth',block:'start'});
      }), 'oo-btn oo-btn-secondary'));
      target.appendChild(row);
    }
  }
  function renderLibrary(parent) {
    top(parent, 'Your source ledger', 'Explore pages', 'Read saved eligible pages locally, chat about a selected topic, and inspect history. Page inspection is not the same as a strict supported answer.');
    const toolbar = make('div', 'oo-toolbar');
    toolbar.append(make('span', 'oo-muted', 'Collection: ' + currentLabel()), button('Refresh pages', () => action(loadPages), 'oo-btn oo-btn-secondary'));
    parent.appendChild(toolbar);
    parent.appendChild(make('div', 'oo-stack')).id = 'oo-library-list';
    const inspect = card(parent, 'oo-inspector'); inspect.id = 'oo-page-inspector'; inspect.hidden = true;
  }
  function renderImport(parent) {
    top(parent, 'Source library', 'Build pages from sources', 'Find a source, paste its address, then save a snapshot through the original MPLPB engine. You can also paste your own text or revise an existing page.');
    const capture = card(parent, 'oo-link-capture');
    capture.appendChild(make('h2', '', 'Search, read, and save a source snapshot'));
    paragraph(capture, 'Search Google in a new tab, choose the actual webpage, and copy its address here. OneOwner asks the existing MPLPB browser engine to fetch the page, record its capture metadata, and seal the new page.');
    const searchRow=make('div', 'oo-link-search');
    const searchField=field('Find something', 'oo-google-search', 'input', 'e.g. sourdough bread recipes, ocean research');
    searchRow.appendChild(searchField.holder);
    const google=button('Search Google', () => {
      const query=searchField.input.value.trim();
      if (!query) {setNotice('Enter a topic to search.', 'error');return;}
      window.open('https://www.google.com/search?q='+encodeURIComponent(query), '_blank', 'noopener,noreferrer');
      setNotice('Choose a trustworthy result, copy its page URL, then return to save a snapshot.');
    }, 'oo-btn oo-btn-secondary', 'oo-search-google');
    searchRow.appendChild(google);
    capture.appendChild(searchRow);
    const snapshotFields=make('div', 'oo-link-fields');
    const linkField=field('Webpage address (HTTPS)', 'oo-capture-url', 'input', 'https://example.org/research/page');
    linkField.input.type='url';
    const nameField=field('Name for this saved page', 'oo-capture-title', 'input', 'Suggested from the link; edit if needed');
    let suggestion='';
    const suggest=rawUrl => {
      try {
        const url=new URL(rawUrl);
        if (url.protocol!=='https:')return '';
        const part=decodeURIComponent(url.pathname.split('/').filter(Boolean).pop()||'');
        const title=(part || url.hostname).replace(/\.[a-z0-9]{1,5}$/i,'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim();
        return title.slice(0,190)||url.hostname;
      } catch (_) {return '';}
    };
    linkField.input.addEventListener('input',()=>{
      const next=suggest(linkField.input.value.trim());
      if (!nameField.input.value.trim() || nameField.input.value===suggestion) nameField.input.value=next;
      suggestion=next;
    });
    snapshotFields.append(linkField.holder, nameField.holder);
    capture.appendChild(snapshotFields);
    const snapshotResult=make('div', 'oo-import-result');
    snapshotResult.id='oo-capture-result';
    const captureActions=make('div','oo-actions');
    captureActions.appendChild(button('Read and save snapshot', () => action(async()=>{
      clear(snapshotResult);
      try {
        const saved=await api.captureLink({
          corpus:selected(), title:nameField.input.value, url:linkField.input.value
        });
        pill(snapshotResult, 'SNAPSHOT SAVED BY MPLPB', 'success');
        paragraph(snapshotResult, 'MPLPB fetched the selected URL through browser CORS, recorded the source bytes, and ran its existing seal and successor pipeline. This does not certify source truth or authorship.');
        if (saved.capture) {
          paragraph(snapshotResult, 'Capture method: '+String(saved.capture.transport||'not reported')+
            ' · Authorship: '+String(saved.capture.authorship||'not verified'), 'oo-footnote');
        }
        if (saved.collection_build && typeof saved.collection_build.source_origin==='string') {
          paragraph(snapshotResult, 'Origin recorded: '+saved.collection_build.source_origin,'oo-footnote');
        }
        raw(snapshotResult,saved,'Inspect full original capture, date, source pin, and build record');
        snapshotResult.appendChild(button('Explore saved pages',()=>switchTo('library'),'oo-btn oo-btn-secondary'));
        setNotice('Snapshot saved. The original engine retains revisions and source pins.', 'ok');
      } catch(error) {
        pill(snapshotResult,'SNAPSHOT NOT SAVED','warning');
        paragraph(snapshotResult, 'That website could not be captured through the native browser transport. Some sites block cross-origin requests. You can paste its text below, clearly labeled as supplied text.');
        paragraph(snapshotResult, String(error&&error.message||error),'oo-footnote');
        throw error;
      }
    }), 'oo-btn oo-btn-primary', 'oo-capture-link'));
    captureActions.appendChild(button('Paste text instead',()=>{
      document.getElementById('oo-text-input')?.focus();
      document.getElementById('oo-title-input').value=nameField.input.value;
      document.getElementById('oo-url-input').value=linkField.input.value;
    },'oo-btn oo-btn-secondary','oo-capture-fallback'));
    capture.appendChild(captureActions);
    capture.appendChild(snapshotResult);
    paragraph(capture, 'Google is only used to find a link; OneOwner does not scrape Google search results. Direct capture works for public HTTPS HTML or text pages that allow browser CORS. A failed fetch does not create a snapshot.', 'oo-footnote');
    const layout = make('div', 'oo-split');
    const main = card(layout, '');
    main.appendChild(make('h2', '', 'Paste text or revise a page'));
    const t = field('Page title', 'oo-title-input', 'input', 'e.g. Research notes — November');
    const u = field('Actual public HTTPS source URL', 'oo-url-input', 'input', 'https://example.org/original-page');
    u.input.type = 'url';
    const x = field('Page content', 'oo-text-input', 'textarea', 'Paste your text here. It is stored as a supplied source, never a verified web fetch.');
    const f = field('Or choose a local text file', 'oo-file-input', 'input');
    f.input.type = 'file'; f.input.accept = '.txt,.md,.html,text/plain,text/markdown,text/html';
    main.append(t.holder, u.holder, x.holder, f.holder);
    const result = make('div', 'oo-import-result'); result.id = 'oo-import-result';
    main.appendChild(button('Seal and import page', () => action(async () => {
      let text = x.input.value;
      if (f.input.files && f.input.files[0]) {
        if (text.trim()) throw Error('Choose either pasted text or a file, not both.');
        text = await f.input.files[0].text();
      }
      const saved = await api.importSource({ corpus: selected(), title: t.input.value, url: u.input.value, text });
      clear(result);
      pill(result, 'IMPORTED THROUGH MPLPB', 'success');
      paragraph(result, 'The engine retained the source capture and checked the ledger. This is not a claim of factual truth or verified authorship.');
      if (saved.capture && typeof saved.capture.authorship === 'string') {
        paragraph(result, 'Recorded authorship: ' + saved.capture.authorship + ' · Capture method: ' +
          String(saved.capture.transport || 'not reported'), 'oo-footnote');
      }
      raw(result, saved, 'Inspect the engine import record');
      setNotice('Import completed. Same title + URL creates a new sealed successor when an earlier version exists.', 'ok');
    }), 'oo-btn oo-btn-primary', 'oo-import'));
    main.appendChild(result);
    const aside = make('div', 'oo-side-stack');
    const create = card(aside, '');
    create.appendChild(make('h2', '', 'New collection'));
    paragraph(create, 'Create a private workspace in the local engine, then add its pages.');
    const n = field('Collection name', 'oo-new-collection', 'input', 'My research');
    create.appendChild(n.holder);
    create.appendChild(button('Create collection', () => action(async () => {
      const created = await api.createCollection(n.input.value);
      await refreshCollections(created.corpus);
      clear($('oo-new-result'));
      pill($('oo-new-result'), 'COLLECTION CREATED', 'success');
      paragraph($('oo-new-result'), 'Selected ' + currentLabel() + '. You can now import a source.');
      setNotice('New collection available.', 'ok');
    }), 'oo-btn oo-btn-secondary', 'oo-create'));
    create.appendChild(make('div', 'oo-import-result')).id = 'oo-new-result';
    aside.appendChild(create);
    const policy = card(aside, 'oo-guidance');
    policy.appendChild(make('h2', '', 'Why a source URL?'));
    paragraph(policy, 'The pinned import contract requires a real public HTTPS URL. Pasting text does not fetch or verify that address. For original, unhosted writing, this version cannot yet create a URL-free page in the browser.');
    line(policy);
    paragraph(policy, 'Reimport with exactly the same title and URL to create a sealed successor. The predecessor remains in history.');
    aside.appendChild(policy);
    layout.append(main, aside); parent.appendChild(layout);
  }
  async function loadHistory() {
    const target = $('oo-history-content');
    if (!target) return;
    clear(target);
    const data = await api.history(selected());
    const collection = data && data.collection_history;
    const cardEl = card(target, '');
    cardEl.appendChild(make('h2', '', 'Retained source and revision history'));
    paragraph(cardEl, 'This is a local audit of captured sources, not an answer or a truth certification.');
    if (collection && Array.isArray(collection.captures)) {
      const captures = collection.captures.slice().sort((a,b) =>
        String(b.observed_at || '').localeCompare(String(a.observed_at || '')));
      paragraph(cardEl, captures.length + ' retained capture(s) in ' + String(collection.name || currentLabel()) + '. New submissions are saved separately.');
      if (!captures.length) paragraph(cardEl, 'No saved sources yet. Use Add or revise to import the first page.');
      for (const capture of captures) {
        const row = make('div', 'oo-capture-row');
        row.appendChild(make('h3', '', capture.title || 'Untitled retained capture'));
        pill(row, 'RETAINED CAPTURE', 'neutral');
        paragraph(row, 'Recorded ' + String(capture.observed_at || 'at an unspecified time'), 'oo-footnote');
        paragraph(row, 'Authorship: ' + String(capture.authorship || 'not recorded') +
          ' · Capture method: ' + String(capture.transport || 'not recorded'), 'oo-footnote');
        if (capture.source_sha256) {
          const code = make('code', 'oo-mono', 'Source bytes SHA-256: ' + capture.source_sha256);
          row.appendChild(code);
        }
        cardEl.appendChild(row);
      }
      paragraph(cardEl, 'A capture is not necessarily the current eligible owner. Use Explore pages for engine eligibility and Ask for a supported answer.');
    } else {
      paragraph(cardEl, 'This collection has no separate user capture list. The original engine history is available below.');
    }
    raw(cardEl, data, 'Inspect complete engine capture, lineage, and revision record');
  }
  function renderHistory(parent) {
    top(parent, 'Audit trail', 'History & lineage', 'Each successor is a new sealed page. Old pages remain inspectable in history and do not silently regain ownership.');
    const toolbar = make('div', 'oo-toolbar');
    toolbar.append(make('span', 'oo-muted', 'Collection: ' + currentLabel()), button('Reload history', () => action(loadHistory), 'oo-btn oo-btn-secondary'));
    parent.appendChild(toolbar);
    parent.appendChild(make('div')).id = 'oo-history-content';
  }
  function renderAbout(parent) {
    top(parent, 'Our operating promise', 'Trust the boundaries', 'OneOwner is a product experience powered by your pinned Combined MPLPB research.');
    const c = card(parent, '');
    c.appendChild(make('h2', '', 'A deterministic ledger, not a guessing engine'));
    paragraph(c, 'A single eligible owner with supported body evidence can return an answer. Multiple owners are ambiguous; no owner means refusal. Model-assisted paths are not enabled in this product.');
    line(c);
    paragraph(c, 'Pages carry integrity hashes and lineage pins. A hash does not establish authorship, accuracy, or factual truth.');
    paragraph(c, 'All source decisions and revisions are made by the unchanged Combined MPLPB Python engine via its page-local API. The interface does not rank, merge, or synthesize source answers.');
    const learn = button('Learn basic and advanced chat', () => switchTo('learn'), 'oo-btn oo-btn-secondary');
    c.appendChild(learn);
    const link = make('a', 'oo-text-link', 'View Combined MPLPB research');
    link.href = 'https://github.com/mitchell-d00/Combined-MPLPB-A-closed-local-ledger-of-pages-that-answers-only-from-those-pages';
    link.rel = 'noopener noreferrer'; link.target = '_blank'; c.appendChild(link);
  }
  function mount() {
    if ($('oneowner-app')) return;
    const root = make('div', 'oo-app'); root.id = 'oneowner-app';
    const skip = make('a', 'oo-skip', 'Skip to content'); skip.href = '#oo-screen'; root.appendChild(skip);
    const layout = make('div', 'oo-layout');
    const aside = make('aside', 'oo-sidebar');
    const brand = make('div', 'oo-brand');
    brand.append(make('div', 'oo-brand-mark', '1'));
    const brandText = make('div');
    brandText.append(make('strong', '', 'OneOwner'), make('span', '', 'POWERED BY MPLPB'));
    brand.appendChild(brandText); aside.appendChild(brand);
    paragraph(aside, 'Closed ledger. Clear answers.', 'oo-sidebar-desc');
    const navLabel = make('div', 'oo-nav-label', 'WORKSPACE'); aside.appendChild(navLabel);
    aside.appendChild(make('nav', 'oo-nav')).id = 'oo-nav';
    const footer = make('div', 'oo-sidebar-footer');
    pill(footer, 'LOCAL BY DEFAULT', 'local');
    paragraph(footer, 'No model. No hidden retrieval. No silent overwrites.');
    aside.appendChild(footer);
    const main = make('div', 'oo-workspace');
    const head = make('header', 'oo-topbar');
    const context = make('div', 'oo-context');
    paragraph(context, 'YOUR WORKSPACE', 'oo-eyebrow');
    context.appendChild(make('strong', '', 'Connecting to the ledger…')).id = 'oo-collection-name';
    head.appendChild(context);
    const selection = make('div', 'oo-collection-picker');
    const label = make('label', '', 'Collection'); label.htmlFor = 'oo-corpus'; selection.appendChild(label);
    const quickTheme=button('☾ Dark mode',()=>{
      const dark=$('oneowner-app').dataset.ooTheme==='dark';
      updatePreference('theme',dark?'light':'dark');
    },'oo-btn oo-btn-secondary oo-theme-toggle','oo-theme-toggle');
    head.appendChild(quickTheme);
    const select = make('select', 'oo-control'); select.id = 'oo-corpus';
    select.addEventListener('change', () => {corpus = select.value; latestAnswer = null; navRender(); render(); if(screen==='library') action(loadPages); if(screen==='history') action(loadHistory);});
    selection.appendChild(select); head.appendChild(selection);
    main.appendChild(head);
    const content = make('main', 'oo-content'); content.id = 'oo-screen';
    content.setAttribute('tabindex', '-1'); main.appendChild(content);
    const bottom = make('footer', 'oo-bottom');
    bottom.append(make('span', '', 'OneOwner · Integrity before convenience'), make('span', '', 'Powered by the original Combined MPLPB engine'));
    main.appendChild(bottom);
    layout.append(aside, main); root.appendChild(layout);
    const notice = make('div', 'oo-notice'); notice.id = 'oo-notice';
    notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
    root.appendChild(notice); document.body.appendChild(root);
    if (!window.OneOwnerSettings) throw Error('OneOwner appearance settings module unavailable.');
    preferences=window.OneOwnerSettings.load(storage());
    try { themeMedia=window.matchMedia('(prefers-color-scheme: dark)'); } catch (_) { themeMedia=null; }
    if(themeMedia && typeof themeMedia.addEventListener==='function') themeMedia.addEventListener('change',()=>{
      if(preferences.theme==='system')applyPreferences();
    });
    applyPreferences();
    $('oo-screen').appendChild(make('h1', '', 'Opening your local ledger…'));
    (async () => {
      try {
        if (!window.OneOwnerAdapter || !window.MPLPB) throw Error('The embedded MPLPB engine is unavailable. No fallback reader exists.');
        api = window.OneOwnerAdapter.create(window.MPLPB, window.OneOwnerSourceCapture);
        await api.ready();
        await refreshCollections();
        render();
        setNotice('Ready. Questions and pages are handled locally by Combined MPLPB.', 'ok');
      } catch (error) {
        clear($('oo-screen'));
        top($('oo-screen'), 'Startup blocked', 'Ledger unavailable', 'The verified MPLPB runtime must start before OneOwner can read or create pages.');
        paragraph($('oo-screen'), String(error && error.message || error), 'oo-refusal-copy');
        setNotice('Startup failed; no answer operation is available.', 'error');
      }
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
  else mount();
})();
