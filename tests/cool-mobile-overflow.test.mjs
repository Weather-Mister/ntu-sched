import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createCoolFeedScroll} from '../public/skeleton/cool-feed-scroll.mjs';

function setup(){
  const {document}=parseHTML('<div id="cool-list" class="cool-list"></div>');
  const list=document.getElementById('cool-list');
  const controller=createCoolFeedScroll({list});
  const cards=n=>list.replaceChildren(...Array.from({length:n},()=>{
    const item=document.createElement('article');
    item.className='cool-item';
    return item;
  }));
  return {list,controller,cards};
}

test('all assignments remain in DOM and same-tab rerenders preserve scroll position',()=>{
  const {list,controller,cards}=setup();
  cards(80);
  assert.equal(list.children.length,80);
  list.scrollTop=176;
  cards(125);
  controller.update('assignments',176);
  assert.equal(list.children.length,125);
  assert.equal(list.scrollTop,176);
});

test('switching tabs resets the scroll while preserving each tab content',()=>{
  const {list,controller,cards}=setup();
  cards(15);list.scrollTop=120;
  controller.update('announcements',120);
  assert.equal(list.scrollTop,0);
  cards(42);list.scrollTop=75;
  controller.update('announcements',75);
  assert.equal(list.children.length,42);
  assert.equal(list.scrollTop,75);
  controller.update('assignments',75);
  assert.equal(list.scrollTop,0);
  controller.reset();
  assert.equal(list.scrollTop,0);
});

