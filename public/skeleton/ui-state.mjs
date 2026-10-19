// Keep keyboard users on the same control when fresh data replaces a list.
const pendingFocus=new WeakMap();
export function withListFocus(container,render){
 const active=container.ownerDocument.activeElement;
 const key=container.contains(active)?active?.dataset.uiFocus:!active||active===container.ownerDocument.body?pendingFocus.get(container):null;
 const scrollTop=container.scrollTop;
 render();
 container.scrollTop=scrollTop;
 pendingFocus.delete(container);
 if(key&&(!active||!active.isConnected||active===container.ownerDocument.body)){
  const target=[...container.querySelectorAll('[data-ui-focus]')].find(element=>element.dataset.uiFocus===key);
  if(target?.disabled)pendingFocus.set(container,key);
  else target?.focus({preventScroll:true});
 }
}
export function loadingCard(document,label){
 const card=document.createElement('div');card.className='empty-card ui-loading-card';card.setAttribute('role','status');
 const text=document.createElement('span');text.textContent=label;
 const bars=document.createElement('span');bars.className='ui-loading-lines';bars.setAttribute('aria-hidden','true');
 for(let i=0;i<3;i++)bars.append(document.createElement('i'));
 card.append(text,bars);return card;
}
