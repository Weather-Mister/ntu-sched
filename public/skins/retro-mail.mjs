// Mail occupies the same physical chassis in the personal console.
// Keep Campus Week's reader, composer, account and message controllers intact.
export function startRetroMail(app){
 const dialog=document.getElementById('mail-dialog');if(!dialog)return()=>{};
 const anchor=document.createComment('retro mail restore');dialog.before(anchor);
 const search=dialog.querySelector('.mail-search'),searchAnchor=search?document.createComment('retro mail search restore'):null;
 if(search){search.before(searchAnchor);dialog.querySelector('.mailx-compose-main').before(search);}
 const wasOpen=dialog.open;if(wasOpen)dialog.close();
 app.append(dialog);dialog.dataset.retroEmbedded='true';let opener=null;
 function update(){app.classList.toggle('retro-mail-open',dialog.open);}
 function remember(event){const button=event.target.closest?.('[data-open-mail]');if(button)opener=button;}
 function escape(event){
  if(event.key!=='Escape'||!dialog.open||document.querySelector('dialog:modal'))return;
  event.preventDefault();const cancel=new Event('cancel',{cancelable:true});
  if(dialog.dispatchEvent(cancel))dialog.close();
 }
 const observer=new window.MutationObserver(update);observer.observe(dialog,{attributes:true,attributeFilter:['open']});
 const closed=()=>{update();opener?.focus();};
 document.addEventListener('click',remember,true);document.addEventListener('keydown',escape);dialog.addEventListener('close',closed);
 if(wasOpen)dialog.show();update();
 return()=>{
  observer.disconnect();document.removeEventListener('click',remember,true);document.removeEventListener('keydown',escape);dialog.removeEventListener('close',closed);
  const open=dialog.open,top=open?document.querySelector('dialog:modal'):null,focus=document.activeElement;
  if(open)dialog.close();delete dialog.dataset.retroEmbedded;app.classList.remove('retro-mail-open');
  anchor.replaceWith(dialog);if(search)searchAnchor.replaceWith(search);
  if(open){
   // Keep an already-open Settings sheet above Mail while restoring native modal behavior.
   if(top&&top!==dialog)top.close();dialog.showModal();
   if(top&&top!==dialog){top.showModal();focus?.focus();}
  }
 };
}
