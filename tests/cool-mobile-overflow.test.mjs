import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createCoolMobileOverflow,COOL_MOBILE_VISIBLE_COUNT} from '../public/skeleton/cool-mobile-overflow.mjs';
import {readFileSync} from 'node:fs';

function setup(){
  const {document}=parseHTML('<div id="cool-list" class="cool-list"></div><button id="cool-mobile-more" hidden aria-controls="cool-list"></button>');
  const list=document.getElementById('cool-list');
  const button=document.getElementById('cool-mobile-more');
  const controller=createCoolMobileOverflow({
    list,button,
    showMore:n=>`Show ${n} more`,
    showLess:()=>`Show less`
  });
  function cards(n){
    list.replaceChildren(...Array.from({length:n},()=>{const item=document.createElement('article');item.className='cool-item';return item;}));
  }
  return {document,list,button,controller,cards};
}

test('mobile COOL list shows a count only when there are more than four cards',()=>{
  const {list,button,controller,cards}=setup();
  assert.equal(COOL_MOBILE_VISIBLE_COUNT,4);
  cards(0);controller.update('assignments');assert.equal(button.hidden,true);
  cards(4);controller.update('assignments');assert.equal(button.hidden,true);
  cards(7);controller.update('assignments');assert.equal(button.hidden,false);
  assert.equal(button.textContent,'Show 3 more');
  assert.equal(button.getAttribute('aria-expanded'),'false');
  assert.equal(list.classList.contains('cool-list-expanded'),false);
  button.click();assert.equal(button.textContent,'Show less');
  assert.equal(button.getAttribute('aria-expanded'),'true');
  assert.equal(list.classList.contains('cool-list-expanded'),true);
  button.click();assert.equal(button.textContent,'Show 3 more');
  assert.equal(list.classList.contains('cool-list-expanded'),false);
});

test('mobile COOL list preserves expansion per tab and inner scroll across rerenders',()=>{
  const {list,button,controller,cards}=setup();
  cards(12);controller.update('assignments');button.click();
  list.scrollTop=150;
  cards(11);controller.update('assignments',150);
  assert.equal(list.scrollTop,150);
  assert.equal(button.textContent,'Show less');
  cards(6);controller.update('announcements',150);
  assert.equal(button.textContent,'Show 2 more');
  assert.equal(list.scrollTop,0);
  button.click();assert.equal(list.classList.contains('cool-list-expanded'),true);
  cards(9);controller.update('assignments');assert.equal(button.textContent,'Show less');
  controller.reset();assert.equal(button.textContent,'Show 5 more');
  assert.equal(button.getAttribute('aria-expanded'),'false');
});

test('mobile COOL feed cutoff is limited to small screens and does not hide desktop cards',()=>{
  const css=readFileSync(new URL('../public/skeleton/styles.css',import.meta.url),'utf8');
  const selector='.cool-list:not(.cool-list-expanded)>.cool-item:nth-child(n+5)';
  assert.ok(css.includes('@media(max-width:790px){\n  '+selector));
  assert.ok(css.includes('max-height:343px'));
  assert.ok(css.includes('overscroll-behavior:contain'));
  const html=readFileSync(new URL('../public/skeleton/index.html',import.meta.url),'utf8');
  assert.match(html,/id="cool-mobile-more"[^>]*aria-controls="cool-list"/);
});
