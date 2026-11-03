/* Product guidance and unsealed drafts. Native MPLPB alone decides evidence. */
(function(root,factory){
  const value=factory();
  if(typeof module==='object' && module.exports)module.exports=value;
  else root.OneOwnerDiscovery=value;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function actions(response){
    const list=[];
    // Numbered options are navigation back into the native conversation.
    if(response?.response_structure?.intent==='casual_idea_exploration') {
      for(const match of String(response.message||'').matchAll(/^(\d{1,2})\. (.+)$/gm))
        list.push({label:match[2],request:match[1]});
    }
    const native=Array.isArray(response?.guidance?.actions)?response.guidance.actions:
      Array.isArray(response?.suggestions)?response.suggestions.map(s=>({label:s,request:s})):[];
    for(const a of native)if(typeof a?.request==='string' && a.request.trim())
      list.push({label:String(a.label||a.request),request:a.request});
    return list.slice(0,10);
  }
  function results(response){
    const search=response?.search;
    if(!search || !['simple','english'].includes(search.wiki) || !Array.isArray(search.results))return [];
    const domain=search.wiki==='english'?'en':'simple';
    return search.results.filter(r=>typeof r?.title==='string' && r.title.length<=200 && !/[|\r\n]/.test(r.title)).slice(0,6).map(r=>({
      title:r.title,snippet:typeof r.snippet==='string'?r.snippet.slice(0,1200):'',wiki:search.wiki,
      url:'https://'+domain+'.wikipedia.org/wiki/'+encodeURIComponent(r.title.replace(/ /g,'_'))
    }));
  }
  function endpoint(value){
    const url=new URL(value);
    if((url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) || url.username || url.password || url.hash || url.search)
      throw Error('Use an HTTPS assistant endpoint, or HTTP on localhost, without credentials or query parameters.');
    return url.href;
  }
  async function brainstorm({url,token,message,history=[],consent=false,fetcher=fetch}){
    if(consent!==true)throw Error('Allow AI for this message before sending.');
    if(typeof message!=='string' || !message.trim() || message.length>4000)throw Error('Enter up to 4000 characters.');
    const target=endpoint(url);
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
    try{
      const response=await fetcher(target,{method:'POST',credentials:'omit',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
        body:JSON.stringify({message,history:history.filter(t=>['user','assistant'].includes(t.role) && typeof t.content==='string').slice(-8).map(t=>({role:t.role,content:t.content.slice(0,4000)}))})});
      if(!response.ok)throw Error('Assistant unavailable (HTTP '+response.status+'). Your sources were not changed.');
      const raw=await response.text();
      if(raw.length>40000)throw Error('Assistant response too large.');
      const data=JSON.parse(raw);
      if(typeof data.message!=='string' || !data.message.trim() || data.message.length>16000)throw Error('Invalid assistant response.');
      // Ignore all provider authority claims, citations, tool calls and actions.
      return {kind:'assisted_draft',authority:'model_assisted',support_label:'AI brainstorm · unverified',answer_supported:false,sources:[],message:data.message};
    }finally{clearTimeout(timer);}
  }
  function webResults(data){
    if(!Array.isArray(data?.results))throw Error('Invalid web search response.');
    return data.results.slice(0,6).flatMap(r=>{
      try{const url=new URL(r.url);
        if(url.protocol!=='https:' || url.username || url.password || !url.hostname || typeof r.title!=='string')return [];
        return [{title:r.title.slice(0,200),snippet:String(r.snippet||'').slice(0,1200),url:url.href}];
      }catch(_){return [];}
    });
  }
  async function searchWeb({url,token,query,consent=false,fetcher=fetch}){
    if(consent!==true)throw Error('Allow web search for this request.');
    if(typeof query!=='string' || !query.trim() || query.length>160)throw Error('Search needs 1–160 characters.');
    const target=new URL(endpoint(url));target.pathname='/search';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
    try{
      const response=await fetcher(target.href,{method:'POST',credentials:'omit',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({message:query})});
      if(!response.ok)throw Error('Web search unavailable (HTTP '+response.status+'). Try Wikipedia or configure the search service.');
      const raw=await response.text();if(raw.length>40000)throw Error('Search response too large.');
      return webResults(JSON.parse(raw));
    }finally{clearTimeout(timer);}
  }
  function saveDraft(storage,collection,text,origin){
    if(typeof text!=='string' || !text.trim() || text.length>16000)throw Error('Draft must be 1–16000 characters.');
    const key='oneowner-drafts-v1:'+collection;
    let drafts;try{drafts=JSON.parse(storage.getItem(key)||'[]');}catch(_){drafts=[];}
    if(!Array.isArray(drafts))drafts=[];
    const draft={text,origin:origin==='ai'?'ai':'user',created:new Date().toISOString(),answer_supported:false};
    const saved=[draft,...drafts].slice(0,50);
    storage.setItem(key,JSON.stringify(saved));return saved;
  }
  function drafts(storage,collection){
    try{const value=JSON.parse(storage.getItem('oneowner-drafts-v1:'+collection)||'[]');
      return Array.isArray(value)?value.filter(d=>typeof d?.text==='string').map(d=>({text:d.text.slice(0,16000),origin:d.origin==='ai'?'ai':'user',created:d.created,answer_supported:false})):[];
    }catch(_){return [];}
  }
  return Object.freeze({actions,results,endpoint,brainstorm,webResults,searchWeb,saveDraft,drafts});
});
