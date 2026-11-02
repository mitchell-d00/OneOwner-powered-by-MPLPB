'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const learn=require('../oneowner/learn.js');

test('onboarding is a lightweight product layer, not an answer engine',()=>{
  assert.equal(typeof learn.mount,'function');
  assert.equal(learn.lessons.length,4);
  const titles=learn.lessons.map(x=>x.title);
  assert.deepEqual(titles,[
    'Begin with a conversation','Save information in a collection',
    'Explore what is saved','Check an answer, not just a reply']);
  assert.equal(learn.lessons[0].command,'guide me');
  assert.equal(learn.lessons[1].destination,'import');
  assert.equal(learn.lessons[2].command,'show my MPLPB');
  assert.equal(learn.lessons[3].destination,'ask');
  for(const lesson of learn.lessons) {
    assert.ok(lesson.title && lesson.body && lesson.label);
    assert.equal(typeof lesson.command==='string',!Boolean(lesson.destination));
  }
});
