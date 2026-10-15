import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {createCoolFeedScroll} from '../public/skeleton/cool-feed-scroll.mjs';

const base=new URL('../public/skeleton/',import.meta.url);
const css=readFileSync(new URL('styles.css',base),'utf8');
const html=readFileSync(new URL('index.html',base),'utf8');
const app=readFileSync(new URL('app.mjs',base),'utf8');

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

test('mobile COOL tabs share a fixed-height scroll area without hiding cards',()=>{
  const mobile=css.slice(css.indexOf('/* On mobile both COOL tabs'),css.indexOf('/* Direct sign-in:'));
  assert.match(mobile,/@media\(max-width:790px\)/);
  assert.match(mobile,/\.cool-column \.cool-list\{[^}]*height:343px;[^}]*max-height:343px;[^}]*min-height:343px;[^}]*flex:0 0 343px;/s);
  assert.match(mobile,/overflow-y:auto;/);
  assert.match(mobile,/overscroll-behavior:contain;/);
  assert.match(mobile,/\.cool-column \.cool-list>\.cool-item\{[^}]*flex:0 0 auto;/s);
  assert.match(mobile,/\.announcement-body p\{[^}]*max-height:none;[^}]*overflow:visible;/s);
  assert.doesNotMatch(css,/nth-child\(n\+5\)|cool-list-expanded|cool-mobile-more/);
  assert.doesNotMatch(html,/id="cool-mobile-more"/);
  assert.doesNotMatch(app,/coolShowMore|coolShowLess|cool-mobile-more/);
  assert.match(app,/for\(const item of items\)\{/);
  assert.doesNotMatch(app,/items\.slice\(0,40\)/);
});

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

test('expanded announcement details survive rerenders without requiring a more button',()=>{
  const {list,controller}=setup();
  function card(index){
    const article=list.ownerDocument.createElement('article');
    article.className='cool-item announcement-card';
    const details=list.ownerDocument.createElement('details');
    details.dataset.announcement=String(index);
    const summary=list.ownerDocument.createElement('summary');summary.textContent='Read announcement';
    const body=list.ownerDocument.createElement('p');body.textContent='Long announcement '.repeat(200);
    details.append(summary,body);article.append(details);
    return article;
  }
  list.replaceChildren(...Array.from({length:25},(_,i)=>card(i)));
  list.children[0].querySelector('details').open=true;
  const expanded=new Set([...list.querySelectorAll('details[open]')].map(el=>el.dataset.announcement));
  list.replaceChildren(...Array.from({length:25},(_,i)=>{
    const item=card(i);
    item.querySelector('details').open=expanded.has(String(i));
    return item;
  }));
  controller.update('announcements');
  assert.equal(list.children.length,25);
  assert.equal(list.children[0].querySelector('details').open,true);
  assert.equal(list.querySelectorAll('.cool-item').length,25);
});
