/* OneOwner-only, local presentation preferences.
 * Inspired by MPLPB's original visual settings, but never reads/writes the
 * upstream mplpb-ui-preferences key, ledger, page seals or session store.
 */
(function(root,factory) {
  'use strict';
  const moduleValue=factory();
  if (typeof module==='object' && module.exports) module.exports=moduleValue;
  else root.OneOwnerSettings=moduleValue;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEY='oneowner-ui-preferences-v1';
  const DEFAULT=Object.freeze({
    theme:'system',setting:'oneowner',textSize:'normal',reduceMotion:false,
    reasonMode:false,helperName:'OneOwner',helperEnabled:true
  });
  const allowed={
    theme:['system','light','dark'],
    setting:['oneowner','fantasy','scifi','wasteland'],
    textSize:['normal','large']
  };
  function normalize(candidate) {
    const x=candidate&&typeof candidate==='object'&&!Array.isArray(candidate)?candidate:{};
    const clean={};
    for(const key of Object.keys(allowed))clean[key]=allowed[key].includes(x[key])?x[key]:DEFAULT[key];
    clean.reduceMotion=typeof x.reduceMotion==='boolean'?x.reduceMotion:DEFAULT.reduceMotion;
    clean.reasonMode=typeof x.reasonMode==='boolean'?x.reasonMode:DEFAULT.reasonMode;
    clean.helperEnabled=typeof x.helperEnabled==='boolean'?x.helperEnabled:DEFAULT.helperEnabled;
    clean.helperName=typeof x.helperName==='string'&&x.helperName.trim()?
      x.helperName.trim().slice(0,32):DEFAULT.helperName;
    return clean;
  }
  function load(storage) {
    try {return normalize(JSON.parse(storage.getItem(KEY)||'{}'));}
    catch (_) {return normalize({});}
  }
  function save(storage,value) {
    const pref=normalize(value);
    try {storage.setItem(KEY,JSON.stringify(pref));return true;}
    catch (_) {return false;}
  }
  function resolvedTheme(pref,systemDark) {
    const value=normalize(pref).theme;
    return value==='system'?(systemDark?'dark':'light'):value;
  }
  function apply(root,pref,systemDark) {
    if(!root || !root.dataset)throw Error('OneOwner settings need the product root.');
    const p=normalize(pref);
    root.dataset.ooTheme=resolvedTheme(p,!!systemDark);
    root.dataset.ooSetting=p.setting;
    root.dataset.ooText=p.textSize;
    root.dataset.ooMotion=p.reduceMotion?'reduce':'system';
    return p;
  }
  return Object.freeze({KEY,DEFAULT,normalize,load,save,resolvedTheme,apply});
});
