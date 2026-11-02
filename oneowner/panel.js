/* Additive OneOwner surface. All decisions and mutations go through window.MPLPB. */
(function () {
  'use strict';
  if (typeof document === 'undefined' || !window.OneOwnerAdapter) return;
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  };
  const button = (text, onClick, className) => {
    const node = el('button', text, className);
    node.type = 'button'; node.addEventListener('click', onClick); return node;
  };
  const field = (label, type = 'text') => {
    const wrap = el('label', label, 'oo-field');
    const input = el(type === 'textarea' ? 'textarea' : 'input');
    if (type !== 'textarea') input.type = type;
    input.autocomplete = 'off'; wrap.appendChild(input); return {wrap,input};
  };
  const info = (container, msg, className='oo-note') => container.appendChild(el('p',msg,className));
  const details = (container, data, summary) => {
    const box = el('details'); box.appendChild(el('summary',summary));
    box.appendChild(el('pre',JSON.stringify(data,null,2),'oo-trace'));
    container.appendChild(box);
  };
  function boot() {
    if (document.getElementById('oneowner-launch')) return;
    const launch = button('OneOwner', async () => {
      panel.hidden = !panel.hidden;
      launch.setAttribute('aria-expanded', String(!panel.hidden));
      if (!panel.hidden) await initialize();
    }, 'oo-launch');
    launch.id = 'oneowner-launch'; launch.setAttribute('aria-controls','oneowner-panel');
    launch.setAttribute('aria-expanded','false');
    const panel = el('section',null,'oo-panel'); panel.id='oneowner-panel';panel.hidden=true;
    panel.setAttribute('aria-label','OneOwner local ledger');
    const header=el('div',null,'oo-head');header.appendChild(el('h2','OneOwner'));
    header.appendChild(button('Close',()=>{panel.hidden=true;launch.setAttribute('aria-expanded','false')},'oo-close'));
    panel.appendChild(header);
    info(panel,'One owner returns · two stop · none refuse. Local, source-bounded, model-free.');
    const bar=el('div',null,'oo-bar');panel.appendChild(bar);
    const collectionRow=el('div',null,'oo-collection');
    const collectionLabel=el('label','Collection');const select=el('select');
    collectionLabel.appendChild(select);collectionRow.appendChild(collectionLabel);panel.appendChild(collectionRow);
    const content=el('div',null,'oo-content');panel.appendChild(content);
    const status=el('p',null,'oo-status');status.setAttribute('role','status');panel.appendChild(status);
    document.body.appendChild(launch);document.body.appendChild(panel);
    let adapter=null, current='Ask', ready=false, busy=false;
    const tabs=['Ask','Explore','Import / Revise','History'];
    const setStatus=(text)=>{status.textContent=text||''};
    const selected=()=>select.value;
    const run=async (work) => {
      if(busy)return; busy=true;setStatus('Working with the original MPLPB engine…');
      try{await work();setStatus('Ready.');}catch(error){setStatus('Stopped: '+(error && error.message || error));}
      finally{busy=false;}
    };
    async function refreshCollections(preserve) {
      const corpusList=await adapter.collections();
      select.replaceChildren();
      for(const item of corpusList){
        const opt=el('option',item.label||item.key);opt.value=item.key;select.appendChild(opt);
      }
      if (preserve && corpusList.some(x=>x.key===preserve)) select.value=preserve;
    }
    async function initialize(){
      if(ready)return;
      if(!window.MPLPB){setStatus('The MPLPB engine API is unavailable. No independent fallback is provided.');return;}
      await run(async()=>{
        adapter=window.OneOwnerAdapter.create(window.MPLPB);
        await adapter.ready();await refreshCollections();
        ready=true;render();
      });
    }
    function render(){
      if(!ready)return;
      bar.replaceChildren();content.replaceChildren();
      for(const name of tabs){
        const nav=button(name,()=>{current=name;render()},name===current?'oo-active':'');
        nav.setAttribute('aria-pressed',String(name===current));bar.appendChild(nav);
      }
      if(current==='Ask')renderAsk();
      else if(current==='Explore')renderExplore();
      else if(current==='Import / Revise')renderImport();
      else renderHistory();
    }
    function renderAsk(){
      const q=field('Question','textarea');q.input.rows=3;q.input.placeholder='Ask something this collection can support';
      content.appendChild(q.wrap);
      const answer=el('div',null,'oo-result');content.appendChild(answer);
      content.appendChild(button('Ask the ledger',()=>run(async()=>{
        const out=await adapter.ask(q.input.value,selected());
        answer.replaceChildren();
        answer.appendChild(el('strong',out.status==='supported'?'SOURCE SUPPORTED':out.status.toUpperCase(),'oo-authority'));
        info(answer,out.message||'No supported answer.',out.supported?'oo-answer':'oo-warning');
        if(out.supported){info(answer,'Citation: '+out.citation);info(answer,'Page seal: '+out.hash);}
        details(answer,out.trace,'Engine decision, ownership, exclusions and diagnostics');
      }),'oo-primary'));
      info(content,'Only strict source-supported returns with a citation and seal are displayed as answers. A hash proves integrity, not truth.');
    }
    function renderExplore(){
      const output=el('div');content.appendChild(button('Load page inventory',()=>run(async()=>{
        output.replaceChildren();
        const pages=await adapter.pages(selected());
        info(output,pages.length+' page records (including withheld history).');
        for(const p of pages){
          const block=el('div',null,'oo-item');
          block.appendChild(el('strong',p.title||p.path||'Untitled page'));
          info(block,p.eligible?'Eligible for this profile':'Not eligible: '+(p.reason||p.reasons||'see engine inventory'));
          if(p.path && p.eligible){block.appendChild(button('Continue from this page',()=>run(async()=>{
            const result=await adapter.continueFrom(p.path,selected());
            const view=el('div',null,'oo-item');view.appendChild(el('strong','Inspection only · not an answer'));
            info(view,result.notice);details(view,result.source,'Page body, hash and sealed fields');
            details(view,result.history,'Retained source / revision history');
            block.appendChild(view);
          })));}
          output.appendChild(block);
        }
      }),'oo-primary'));content.appendChild(output);
    }
    function renderImport(){
      const name=field('New collection name');name.input.placeholder='My notes';content.appendChild(name.wrap);
      content.appendChild(button('Create collection',()=>run(async()=>{
        const created=await adapter.createCollection(name.input.value);
        await refreshCollections(created.corpus);info(content,'Collection created: '+created.corpus);
      })));
      info(content,'For an import, supply the real HTTPS source address. The engine records pasted/file bytes as user-supplied with unknown authorship, never as a verified download.');
      const title=field('Source title');const url=field('Actual HTTPS source URL','url');
      const txt=field('Paste source text','textarea');txt.input.rows=7;
      const file=field('Or choose a local text file','file');file.input.accept='.txt,.md,.html,text/plain,text/html,text/markdown';
      for(const f of [title,url,txt,file])content.appendChild(f.wrap);
      info(content,'Importing again with the same title and URL creates a new sealed successor in MPLPB. No page is overwritten.');
      const result=el('div');content.appendChild(button('Import or create successor',()=>run(async()=>{
        let text=txt.input.value;
        if(file.input.files && file.input.files[0]){
          if(text.trim())throw Error('Choose either pasted text or a file, not both.');
          text=await file.input.files[0].text();
        }
        const output=await adapter.importSource({corpus:selected(),title:title.input.value,url:url.input.value,text});
        result.replaceChildren();info(result,'Imported through the existing seal / revision pipeline. Source authorship is not verified.');
        details(result,output,'Original MPLPB import record and collection-build metadata');
      }),'oo-primary'));content.appendChild(result);
      info(content,'URL-only fetching remains an explicit network action in the original MPLPB interface; this form never fetches a URL.');
    }
    function renderHistory(){
      const output=el('div');
      content.appendChild(button('Show retained history',()=>run(async()=>{
        output.replaceChildren(); const history=await adapter.history(selected());
        info(output,'Source capture and revision history (not chat history).');
        details(output,history,'Retained lineage and capture data');
      }),'oo-primary'));content.appendChild(output);
    }
    select.addEventListener('change',render);
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && !panel.hidden){panel.hidden=true;launch.setAttribute('aria-expanded','false');launch.focus();}
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
