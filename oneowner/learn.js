/* OneOwner user education. Static guidance only; commands are composed for
 * the existing Combined MPLPB chat API. No reader, owner or language rules here.
 */
(function (root, factory) {
  'use strict';
  const learn=factory();
  if (typeof module==='object' && module.exports) module.exports=learn;
  else root.OneOwnerLearn=learn;
})(typeof globalThis!=='undefined'?globalThis:this, function () {
  'use strict';
  const lessons=Object.freeze([
    {title:'Begin with a conversation',body:'Use Chat for ordinary questions, follow-ups, planning and notes. You can ask “What are you?” here; in strict Ask, it may correctly refuse because there is no cited owner.',command:'guide me',label:'Start the MPLPB guide'},
    {title:'Save information in a collection',body:'For a recipe, research paper or reference page, use Add or revise. Paste text with its real source URL or capture a public HTTPS page when that site permits browser fetching.',destination:'import',label:'Add a page'},
    {title:'Explore what is saved',body:'Open Explore pages to inspect eligible current pages. In Chat, “show my MPLPB” lists available pages, and “topic Exact title” selects one to discuss.',command:'show my MPLPB',label:'Show available pages'},
    {title:'Check an answer, not just a reply',body:'Use Ask · cited answers when evidence matters. A supported answer needs one eligible current owner, a citation and a sealed hash. Ambiguity or missing support means no answer.',destination:'ask',label:'Ask with citations'}
  ]);
  function mount(host,actions) {
    if (!host || !actions || typeof actions.openChat!=='function') throw Error('OneOwner Learn requires product navigation.');
    const element=(tag,cls,value)=>{
      const e=document.createElement(tag);if(cls)e.className=cls;
      if(value!==undefined)e.textContent=String(value);return e;
    };
    const p=(parent,text,cls)=>parent.appendChild(element('p',cls||'oo-muted',text));
    const btn=(parent,label,click,cls='oo-btn oo-btn-secondary')=>{
      const e=element('button',cls,label);e.type='button';e.addEventListener('click',click);parent.appendChild(e);return e;
    };
    host.replaceChildren();
    p(host,'LEARN ONEOWNER','oo-eyebrow');
    host.appendChild(element('h1','oo-title','A simple place to start'));
    p(host,'Use OneOwner to chat with your own information, preserve source pages and understand when a claim is supported. It runs on the same deterministic MPLPB engine as the research application.','oo-intro');
    const welcome=element('section','oo-card oo-learn-intro');
    welcome.appendChild(element('h2','','Chat and Ask are different on purpose'));
    p(welcome,'Chat is for conversation, personal notes, learning and exploring saved pages. Ask is the strict path for a sourced answer. Asking “What are you?” in Ask may refuse; that is correct behavior, not a broken chatbot.');
    const jump=element('div','oo-actions');
    btn(jump,'Open Chat',()=>actions.openChat(''), 'oo-btn oo-btn-primary');
    btn(jump,'Try “What are you?” in Chat',()=>actions.openChat('What are you?'));
    welcome.appendChild(jump);host.appendChild(welcome);
    const section=element('section','oo-learn-section');
    section.appendChild(element('h2','','Four steps to get comfortable'));
    p(section,'Choose a step. Examples fill the Chat message box; nothing is sent without your action.');
    const grid=element('div','oo-learn-grid');
    lessons.forEach((step,i)=>{
      const c=element('article','oo-card oo-learn-step');
      c.appendChild(element('span','oo-number',String(i+1).padStart(2,'0')));
      c.appendChild(element('h3','',step.title));p(c,step.body);
      btn(c,step.label,()=>step.command?actions.openChat(step.command):actions.navigate(step.destination));
      grid.appendChild(c);
    });section.appendChild(grid);host.appendChild(section);
    const levels=element('section','oo-card oo-learn-levels');
    levels.appendChild(element('h2','','Basic chat and advanced chat'));
    const columns=element('div','oo-learn-columns');
    const basic=element('div');
    basic.appendChild(element('h3','','Basic · talk naturally'));
    p(basic,'Start with “hello”, “what are you?”, “remember I like cooking”, or “what do you remember about me?”. The native MPLPB engine uses its bounded conversation rules and keeps notes in your saved session.');
    btn(basic,'Practice basic chat',()=>actions.openChat('hello'));
    const advanced=element('div');
    advanced.appendChild(element('h3','','Advanced · steer the MPLPB engine'));
    p(advanced,'Use “chat mode” to keep conversation casual, “serious mode” to focus on evidence, “load all MPLPB” to load saved collections, “topic Exact title” to select a page, then “show source”.');
    btn(advanced,'Try serious mode',()=>actions.openChat('serious mode'));
    columns.append(basic,advanced);levels.appendChild(columns);host.appendChild(levels);
    const offline=element('section','oo-card oo-learn-offline');offline.id='oo-learn-offline';
    offline.appendChild(element('h2','','Using web pages offline'));
    p(offline,'First, save the source while connected: use Add or revise, paste source text, or capture an HTTPS link that permits browser access. MPLPB keeps the successful capture and the page history locally.');
    p(offline,'Later, chat about or query the saved pages without asking the web again. The live source website itself does not become an unrestricted offline browser. A remote search, a new link capture or Wikipedia lookup still needs a connection and explicit permission.');
    p(offline,'Your saved collections are tied to the browser profile and website origin. Clearing website data or using another browser can lose local records. Exporting a chat transcript does not back up a whole source collection. For a fully self-contained offline runtime, use the downloadable OneOwner package.');
    const controls=element('div','oo-actions');
    btn(controls,'Build my first offline page',()=>actions.navigate('import'),'oo-btn oo-btn-primary');
    btn(controls,'Explore saved pages',()=>actions.navigate('library'));
    offline.appendChild(controls);host.appendChild(offline);
    const trust=element('section','oo-learn-trust');
    trust.appendChild(element('h2','','What OneOwner can and cannot promise'));
    p(trust,'It can preserve the exact bytes and lineage of captured material, show what an eligible page says, explain refusals and support local conversations. A sealed hash does not establish factual truth or authenticated authorship. A casual answer or remembered note does not become cited evidence.');
    host.appendChild(trust);
  }
  return Object.freeze({mount,lessons});
});
