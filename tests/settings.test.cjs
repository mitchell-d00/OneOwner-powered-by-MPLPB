'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const settings=require('../oneowner/settings.js');

function storage() {
  const map=new Map();
  return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),map};
}
test('OneOwner preferences default to system theme and remain distinct from MPLPB preferences',()=>{
  const saved=storage(),defaultPrefs=settings.load(saved);
  assert.deepEqual(defaultPrefs,{
    theme:'system',setting:'oneowner',textSize:'normal',reduceMotion:false,
    reasonMode:false,helperName:'OneOwner',helperEnabled:true
  });
  assert.equal(settings.KEY,'oneowner-ui-preferences-v1');
  assert.equal(saved.getItem('mplpb-ui-preferences'),null);
  assert.equal(settings.resolvedTheme(defaultPrefs,false),'light');
  assert.equal(settings.resolvedTheme(defaultPrefs,true),'dark');
  assert.equal(settings.save(saved,{theme:'dark',setting:'fantasy',textSize:'large',
    reduceMotion:true,reasonMode:true,helperName:'  Research Helper  ',helperEnabled:false}),true);
  assert.equal(saved.getItem('mplpb-ui-preferences'),null);
  assert.deepEqual(settings.load(saved),{
    theme:'dark',setting:'fantasy',textSize:'large',reduceMotion:true,
    reasonMode:true,helperName:'Research Helper',helperEnabled:false
  });
});
test('malformed, oversized and invalid theme settings fail back to safe defaults',()=>{
  const p=settings.normalize({theme:'javascript:evil()',setting:'unknown',textSize:'huge',
    reduceMotion:'yes',reasonMode:1,helperEnabled:'no',helperName:' x '.repeat(50)});
  assert.equal(p.theme,'system');
  assert.equal(p.setting,'oneowner');
  assert.equal(p.textSize,'normal');
  assert.equal(p.reduceMotion,false);
  assert.equal(p.reasonMode,false);
  assert.equal(p.helperEnabled,true);
  assert.ok(p.helperName.length<=32);
  assert.equal(settings.normalize({}).helperName,'OneOwner');
  const bad=storage();
  bad.setItem(settings.KEY,'{broken');
  assert.deepEqual(settings.load(bad),settings.DEFAULT);
  assert.equal(settings.save({setItem(){throw new Error('Private mode');}},p),false);
  assert.deepEqual(settings.load({getItem(){throw new Error('Blocked');}}),settings.DEFAULT);
});
test('preference application affects only the product root',()=>{
  const element={dataset:{unrelated:'keep'}};
  const original=settings.normalize({
    theme:'light',setting:'scifi',textSize:'large',reduceMotion:true,
    reasonMode:true,helperName:'MPLPB'
  });
  const applied=settings.apply(element,original,true);
  assert.equal(applied.theme,'light');
  assert.deepEqual(element.dataset,{
    unrelated:'keep',ooTheme:'light',ooSetting:'scifi',ooText:'large',ooMotion:'reduce'
  });
  settings.apply(element,{theme:'system',setting:'wasteland'},true);
  assert.equal(element.dataset.ooTheme,'dark');
  assert.equal(element.dataset.ooSetting,'wasteland');
  assert.throws(()=>settings.apply(null,{}),/product root/);
});
