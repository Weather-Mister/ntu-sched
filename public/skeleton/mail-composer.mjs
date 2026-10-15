import {cleanRichHtml,plainMarkup,MAX_ATTACHMENTS,MAX_ATTACHMENT_BYTES,PART_BYTES} from '../mail-rich.mjs';
const el=(tag,attrs={},text)=>{const node=document.createElement(tag);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);if(text!==undefined)node.textContent=text;return node;};
const btn=(text,fn,attrs={})=>{const node=el('button',{type:'button',...attrs},text);node.addEventListener('click',fn);return node;};
const bytes=n=>n<1024?n+' B':n<1048576?Math.ceil(n/1024)+' KB':(n/1048576).toFixed(1)+' MB';
export const QUICK_COMMANDS=[['Shorter','make it shorter'],['Warmer','make it warmer and friendlier'],['More formal','make it more formal'],['Fix grammar','fix the grammar without changing my meaning']];
export function revisionIsCurrent(start,current){return start.generation===current.generation&&start.edit===current.edit&&start.snapshot===current.snapshot;}
export function createComposer({host,request,getOwner,tell,onChange=()=>{}}){
 let owner=null,generation=0,editVersion=0,draft=null,files=[],history=[],redo=[],busyAi=false,busySend=false,locked=false,savedRange=null,timer=null,saveChain=Promise.resolve(),uploads=new Map(),panelVersion=0;
 const pane=el('section',{class:'campus-compose',hidden:'',role:'dialog','aria-label':'Compose email'});
 pane.innerHTML=`<header class="mailx-compose-head"><div><div class="mailx-compose-title">New message</div><div class="mailx-compose-context">AI revises the current editable draft below</div></div><button type="button" class="mailx-compose-close" aria-label="Close composer">×</button></header><div class="campus-compose-scroll"><div class="mailx-compose-fields"><div class="mailx-field-row"><label for="campus-compose-from">From</label><select id="campus-compose-from" aria-label="From" disabled></select></div><div class="mailx-field-row"><label for="campus-compose-to">To</label><input id="campus-compose-to" autocomplete="email" maxlength="2000" placeholder="Email addresses, separated by commas"></div><div class="mailx-field-row"><label for="campus-compose-subject">Subject</label><input id="campus-compose-subject" maxlength="500"></div></div><div class="mailx-ai-wrap"><div class="mailx-ai-label"><span>AI COMMAND</span><span>Gemini</span></div><div class="mailx-ai-row"><textarea class="mailx-ai-prompt" aria-label="AI command" maxlength="4000" placeholder="Write a polite email asking about… or tell AI what to change in the draft below"></textarea><button type="button" class="mailx-ai-generate" title="Revise with Gemini (draft and reply context are sent to Google)">Generate</button></div><div class="mailx-ai-chips"></div></div><div class="mailx-editor-label"><span>EMAIL</span><div class="mailx-editor-tools"><button type="button" data-undo>Undo AI</button><button type="button" data-redo>Redo</button></div></div><div class="mailx-format-toolbar" role="toolbar" aria-label="Email formatting"></div><div class="mailx-email-body" contenteditable="true" role="textbox" aria-label="Email body" aria-multiline="true" data-placeholder="Your editable email…"></div><div class="mailx-attachment-list"></div><p class="mailx-inline-error" role="status" aria-live="polite"></p><div class="campus-schedule" hidden><label>Send at <input type="datetime-local" aria-label="Scheduled send time"></label><span class="campus-schedule-zone"></span><button type="button" data-confirm-schedule>Schedule send</button><button type="button" data-cancel-schedule>Cancel</button></div></div><footer class="mailx-compose-foot"><span class="mailx-compose-note" aria-live="polite">Saved on this tab as you type</span><button type="button" class="campus-save-draft" aria-label="Save draft" title="Save draft">▣</button><button type="button" class="mailx-schedule">Schedule</button><button type="button" class="mailx-send">Send</button></footer>`;
 host.append(pane);
 const $=selector=>pane.querySelector(selector),to=$('#campus-compose-to'),subject=$('#campus-compose-subject'),body=$('.mailx-email-body'),prompt=$('.mailx-ai-prompt'),generate=$('.mailx-ai-generate'),note=$('.mailx-compose-note'),error=$('.mailx-inline-error'),toolbar=$('.mailx-format-toolbar'),schedule=$('.campus-schedule');
 const storageKey=()=> 'campus-mail-compose:v1:'+owner;
 const editor=()=>({body:body.innerText.replaceAll('\u00a0',' ').replace(/\r\n?/g,'\n'),bodyHtml:cleanRichHtml(body.innerHTML,document)});
 const snapshot=()=>({id:draft.id,version:draft.version,to:to.value,subject:subject.value,...editor(),reply:draft.reply||null,attachments:files.filter(a=>a.status==='done').map(({id,name,type,size})=>({id,name,type,size}))});
 function keep(){if(!draft||!owner)return;try{sessionStorage.setItem(storageKey(),JSON.stringify({...snapshot(),requestId:draft.requestId||null,locked,dirty:draft.dirty}));}catch{note.textContent='Tab storage unavailable · save draft to keep your work';}}
 function clearTab(){try{sessionStorage.removeItem(storageKey());}catch{}}
 function setEditor(value){savedRange=null;body.innerHTML=value.bodyHtml?cleanRichHtml(value.bodyHtml,document):plainMarkup(value.body||'');}
 function controls(){
  const disabled=busySend||locked;
  for(const node of pane.querySelectorAll('button,input,select,textarea'))node.disabled=disabled;
  $('#campus-compose-from').disabled=true;body.contentEditable=String(!disabled);
  generate.disabled=disabled||busyAi;generate.textContent=busyAi?'Revising…':'Generate';generate.setAttribute('aria-busy',String(busyAi));
  $('[data-undo]').disabled=disabled||!history.length;$('[data-redo]').disabled=disabled||!redo.length;
  $('.mailx-compose-close').disabled=busySend;
 }
 function changed(){if(!draft||locked||busySend)return;editVersion++;redo=[];draft.dirty=true;keep();clearTimeout(timer);note.textContent='Saving draft…';timer=setTimeout(()=>void save().catch(e=>{if(draft)note.textContent=e.code==='draft_conflict'?e.message:'Offline · draft kept on this tab';}),1200);controls();}
 function save(){
  if(!draft)return Promise.resolve();keep();const data=snapshot(),active=draft,version=generation,revision=editVersion;
  const task=saveChain.catch(()=>{}).then(async()=>{
   if(generation!==version||draft!==active)return;
   data.version=active.version;
   const result=await request('drafts',{method:'POST',body:JSON.stringify(data)});
   if(generation!==version||draft!==active)return;
   active.version=result.version;if(revision===editVersion)active.dirty=false;keep();note.textContent=active.dirty?'Saving draft…':'Draft saved securely';
  });saveChain=task;return task;
 }
 function saveRange(){const selection=getSelection();if(selection?.rangeCount&&body.contains(selection.getRangeAt(0).commonAncestorContainer))savedRange=selection.getRangeAt(0).cloneRange();}
 function format(command,value=null){if(locked||busySend)return;body.focus();if(savedRange&&body.contains(savedRange.commonAncestorContainer)){const selection=getSelection();selection.removeAllRanges();selection.addRange(savedRange);}document.execCommand(command,false,value);saveRange();changed();formatState();}
 function formatState(){for(const b of toolbar.querySelectorAll('[data-command]'))b.setAttribute('aria-pressed',String(!!document.queryCommandState?.(b.dataset.command)));}
 const block=el('select',{'aria-label':'Paragraph style'});for(const[label,value]of[['Normal','div'],['Heading 1','h1'],['Heading 2','h2'],['Heading 3','h3'],['Quote','blockquote']])block.append(el('option',{value},label));block.addEventListener('change',()=>format('formatBlock',block.value));toolbar.append(block);
 for(const[label,command,title]of[['B','bold','Bold'],['I','italic','Italic'],['U','underline','Underline'],['S','strikeThrough','Strikethrough'],['• List','insertUnorderedList','Bullet list'],['1. List','insertOrderedList','Numbered list']])toolbar.append(btn(label,()=>format(command),{'data-command':command,'aria-label':title,title,'aria-pressed':'false'}));
 toolbar.append(btn('Link',()=>{saveRange();const href=window.prompt('Link URL (https://, http:// or mailto:)');if(href&&/^(https?:\/\/|mailto:)/i.test(href)&&!/[\u0000-\u0020]/.test(href))format('createLink',href);}),btn('Clear',()=>format('removeFormat')));
 const picker=el('input',{type:'file',multiple:'',hidden:'','aria-label':'Attach files'});toolbar.append(btn('📎',()=>picker.click(),{'aria-label':'Attach files',title:'Attach files'}),picker);picker.addEventListener('change',()=>{void addFiles(picker.files);picker.value='';});
 for(const[label,command]of QUICK_COMMANDS)$('.mailx-ai-chips').append(btn(label,()=>{prompt.value=command;void runAi();},{class:'mailx-ai-chip'}));
 async function runAi(){
  if(!draft||busyAi||busySend||locked)return;if(!prompt.value.trim()){prompt.focus();error.textContent='Tell Gemini what to write or change.';return;}
  const data=snapshot(),start={generation,edit:editVersion,snapshot:JSON.stringify(data)},instruction=prompt.value.trim();busyAi=true;error.textContent='';controls();
  try{const result=await request('ai',{method:'POST',body:JSON.stringify({...data,instruction})});
   if(!draft||start.generation!==generation||busySend||locked)return;
   if(!revisionIsCurrent(start,{generation,edit:editVersion,snapshot:JSON.stringify(snapshot())})){error.textContent='You edited this draft during generation. Your edits are kept; run AI again to include them.';return;}
   history.push(editor());redo=[];setEditor(result);prompt.value='';changed();body.focus();
  }catch(e){if(start.generation===generation)error.textContent=e.message;}
  finally{if(start.generation===generation){busyAi=false;controls();}}
 }
 function undoAi(){if(busySend||locked||!history.length)return;redo.push(editor());const next=history.pop(),savedRedo=redo;setEditor(next);changed();redo=savedRedo;controls();}
 function redoAi(){if(busySend||locked||!redo.length)return;history.push(editor());const next=redo.pop(),savedRedo=redo;setEditor(next);changed();redo=savedRedo;controls();}
 function renderFiles(){
  const list=$('.mailx-attachment-list');list.replaceChildren();
  for(const file of files){const chip=el('div',{class:'mailx-attachment-chip'+(file.status==='error'?' is-error':'')}),info=el('span',{class:'mailx-attachment-info'});info.append(el('strong',{},file.name),el('small',{},file.status==='done'?bytes(file.size):file.status==='uploading'?'Uploading…':file.error||'Upload failed'));chip.append(el('span',{},'📎'),info);if(file.status==='error'&&file.file)chip.append(btn('Retry',()=>void upload(file)));chip.append(btn('×',()=>void removeFile(file),{'aria-label':'Remove '+file.name,disabled:busySend||locked||file.status==='uploading'?'':undefined}));if(!busySend&&!locked&&file.status!=='uploading')chip.lastChild.removeAttribute('disabled');list.append(chip);}
 }
 async function upload(file){
  const start=generation,draftId=draft.id;file.status='uploading';renderFiles();
  const task=(async()=>{try{
   const parts=Math.max(1,Math.ceil(file.size/PART_BYTES));for(let part=0;part<parts;part++){
    if(start!==generation)return;const bytes=new Uint8Array(await file.file.slice(part*PART_BYTES,(part+1)*PART_BYTES).arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
    await request('drafts/attachment',{method:'POST',body:JSON.stringify({draftId,id:file.id,name:file.name,type:file.type,size:file.size,part,data:btoa(raw)})});
   }
   if(start===generation){file.status='done';file.file=null;changed();}
  }catch(e){if(start===generation){file.status='error';file.error=e.message;error.textContent='Attachment upload failed. Retry it or remove it before sending.';}}
  finally{if(start===generation){uploads.delete(file.id);renderFiles();}}})();uploads.set(file.id,task);return task;
 }
 async function addFiles(input){
  if(!draft||busySend||locked)return;const start=generation;clearTimeout(timer);
  try{await save();if(start!==generation)return;}catch(e){error.textContent='Save the draft before attaching files: '+e.message;return;}
  for(const file of [...input]){if(files.length>=MAX_ATTACHMENTS||files.reduce((n,a)=>n+a.size,0)+file.size>MAX_ATTACHMENT_BYTES){error.textContent='You can attach up to 8 files, totaling 20 MB.';break;}
   const entry={id:crypto.randomUUID(),name:file.name||'attachment',type:file.type||'application/octet-stream',size:file.size,status:'uploading',file};files.push(entry);void upload(entry);
  }renderFiles();
 }
 async function removeFile(file){
  if(busySend||locked||file.status==='uploading')return;files=files.filter(a=>a!==file);changed();renderFiles();const start=generation,draftId=draft.id;
  try{await save();if(start===generation)await request('drafts/attachment',{method:'DELETE',body:JSON.stringify({draftId,id:file.id})});}catch(e){if(start===generation)error.textContent=e.message;}
 }
 async function close(){
  if(busySend)return;if(uploads.size){error.textContent='Wait for attachments to finish uploading before closing.';return;}
  keep();clearTimeout(timer);if(draft&&!locked)try{await save();}catch{tell('Draft kept on this tab. Reconnect to save it securely.');}
  generation++;busyAi=false;pane.hidden=true;onChange();
 }
 async function open(reply=null,existing=null){
  if(!owner||owner!==getOwner())return;
  if(!pane.hidden){body.focus();return;}
  if(uploads.size||busySend)return;
  const openingOwner=owner,openingGeneration=generation;
  if(!reply&&!existing){try{const local=JSON.parse(sessionStorage.getItem(storageKey())||'null');if(local){existing=local;if(!local.locked){try{const server=await request('drafts?id='+encodeURIComponent(local.id));if(server.draft.version!==local.version)existing=server.draft;}catch(e){if(e.status===404)existing=null;}}}}catch{}}
  if(openingOwner!==owner||openingGeneration!==generation)return;
  generation++;editVersion++;busyAi=false;busySend=false;locked=!!existing?.locked;history=[];redo=[];savedRange=null;files=(existing?.attachments||[]).map(a=>({...a,status:'done'}));uploads=new Map();saveChain=Promise.resolve();
  draft={id:existing?.id||crypto.randomUUID(),version:existing?.version||0,reply:existing?.reply||(reply?{mailbox:reply.mailbox,uid:reply.uid}:null),requestId:existing?.requestId||null,dirty:!!existing?.dirty};
  const address=reply?.replyTo?.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)?.[0]||'';
  to.value=existing?.to||address;subject.value=existing?.subject||(reply?(/^re:/i.test(reply.subject)?reply.subject:'Re: '+reply.subject):'');setEditor(existing||{});prompt.value='';error.textContent=locked?'A send is unresolved. Use Outbox to check delivery before sending again.':'';note.textContent='Saved on this tab as you type';
  $('.mailx-compose-title').textContent=draft.reply?'Reply':'New message';$('.mailx-compose-context').textContent=draft.reply?'Replying in the original NTU Mail thread':'AI revises the current editable draft below';
  const from=$('#campus-compose-from');from.replaceChildren(el('option',{},owner+'@ntu.edu.tw'));schedule.hidden=true;pane.hidden=false;renderFiles();controls();keep();body.focus();
 }
 async function send(sendAt=null){
  if(!draft||busySend||locked)return;const start=generation;clearTimeout(timer);error.textContent='';
  if(!to.value.trim()||(!editor().body.trim()&&!files.length)){error.textContent='Add a valid recipient and email body or attachment.';return;}
  busySend=true;controls();
  try{
   await Promise.allSettled([...uploads.values()]);if(start!==generation)return;if(files.some(a=>a.status!=='done'))throw new Error('Retry or remove failed attachments before sending.');
   await save();if(start!==generation)return;
   draft.requestId=draft.requestId||crypto.randomUUID();locked=true;keep();controls();
   const result=await request('outbox',{method:'POST',body:JSON.stringify({id:draft.requestId,draftId:draft.id,version:draft.version,sendAt})});if(start!==generation)return;
   clearTab();draft=null;pane.hidden=true;generation++;busyAi=false;busySend=false;locked=false;tell(result.status==='sent'?'Message sent.':result.status==='scheduled'?'Scheduled on the server. You can close this tab.':result.status==='failed'?'Message was not sent. Restore it from Outbox.':'Delivery is unconfirmed. Check Outbox before trying again.');onChange();
  }catch(e){if(start===generation){
   // A rejected request is safe to edit. Network/5xx failures keep the exact
   // request identity and lock the draft until Outbox reconciliation.
   if(!locked||e.status&&e.status<500){locked=false;draft.requestId=null;error.textContent=e.message;}else error.textContent='Delivery is unconfirmed. Close this composer and check Outbox before trying again.';keep();
  }}finally{if(start===generation){busySend=false;controls();renderFiles();}}
 }
 async function panel(kind,container,query=''){
  const start=++panelVersion,account=owner;container.replaceChildren(el('p',{},'Loading…'));
  try{
   const result=await request(kind==='drafts'?'drafts':'outbox');if(start!==panelVersion||account!==owner)return;container.replaceChildren();
   const rows=(kind==='drafts'?result.drafts:result.jobs).filter(row=>!query||[row.to,row.subject,row.snippet].join(' ').toLowerCase().includes(query.toLowerCase()));
   if(!rows.length)container.append(el('p',{class:'mailx-list-placeholder'},kind==='drafts'?'No saved drafts.':'No queued messages.'));
   for(const row of rows){const item=el('article',{class:'campus-compose-item'}),title=el('strong',{},row.subject||'(No subject)'),details=el('small',{},row.to||'No recipient');item.append(title,details);
    const perform=async(action)=>{try{const response=await request('outbox/action',{method:'POST',body:JSON.stringify({id:row.id,action})});if(account!==owner)return;if(action==='restore')await open(null,response.draft);await panel(kind,container,query);}catch(e){if(account===owner)tell(e.message);}};
    if(kind==='drafts'){
     item.append(el('span',{},row.snippet||'Empty draft'),btn('Open draft',async()=>{try{const response=await request('drafts?id='+encodeURIComponent(row.id));if(account===owner)await open(null,response.draft);}catch(e){tell(e.message);}}),btn('Delete',async()=>{try{await request('drafts',{method:'DELETE',body:JSON.stringify({id:row.id,version:row.version})});if(account===owner){if(draft?.id===row.id){draft=null;clearTab();}await panel(kind,container,query);}}catch(e){tell(e.message);}}));
    }else{
     item.append(el('span',{},row.status+(row.status==='scheduled'?' · '+new Date(row.sendAt).toLocaleString():'')));
     if(['pending','scheduled'].includes(row.status))item.append(btn('Cancel send',()=>void perform('cancel')));
     if(['processing','uncertain'].includes(row.status))item.append(btn('Check delivery',()=>void perform('check')));
     if(['failed','cancelled'].includes(row.status))item.append(btn('Restore draft',()=>void perform('restore')));
    }container.append(item);
   }
  }catch(e){if(start===panelVersion&&account===owner)container.replaceChildren(el('p',{},e.message));}
 }
 to.addEventListener('input',changed);subject.addEventListener('input',changed);body.addEventListener('input',changed);body.addEventListener('keyup',()=>{saveRange();formatState();});body.addEventListener('mouseup',()=>{saveRange();formatState();});
 body.addEventListener('paste',event=>{event.preventDefault();if(locked||busySend)return;const html=event.clipboardData.getData('text/html'),text=event.clipboardData.getData('text/plain');document.execCommand('insertHTML',false,html?cleanRichHtml(html,document):plainMarkup(text));changed();});
 body.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();});body.addEventListener('drop',event=>{event.preventDefault();if(event.dataTransfer.files.length)void addFiles(event.dataTransfer.files);else if(!locked&&!busySend){document.execCommand('insertText',false,event.dataTransfer.getData('text/plain'));changed();}});
 toolbar.addEventListener('mousedown',event=>{saveRange();if(event.target.closest('button'))event.preventDefault();});
 generate.addEventListener('click',()=>void runAi());$('[data-undo]').addEventListener('click',undoAi);$('[data-redo]').addEventListener('click',redoAi);$('.mailx-compose-close').addEventListener('click',()=>void close());$('.campus-save-draft').addEventListener('click',()=>void save().catch(e=>{error.textContent=e.message;}));$('.mailx-send').addEventListener('click',()=>void send());
 $('.mailx-schedule').addEventListener('click',()=>{schedule.hidden=!schedule.hidden;$('.campus-schedule-zone').textContent=Intl.DateTimeFormat().resolvedOptions().timeZone;const input=schedule.querySelector('input');const future=new Date(Date.now()+3600000);input.value=new Date(future.getTime()-future.getTimezoneOffset()*60000).toISOString().slice(0,16);input.focus();});
 $('[data-cancel-schedule]').addEventListener('click',()=>{schedule.hidden=true;});$('[data-confirm-schedule]').addEventListener('click',()=>{const date=new Date(schedule.querySelector('input').value);if(!Number.isFinite(date.getTime())||date.getTime()<Date.now()+60000){error.textContent='Choose a send time at least one minute ahead.';return;}void send(date.toISOString());});
 host.addEventListener('cancel',event=>{if(!pane.hidden){event.preventDefault();void close();}});
 window.addEventListener('pagehide',()=>{keep();});
 return {open,panel,close,cancelPanel(){panelVersion++;},get active(){return !pane.hidden;},bind(value){
  if(value===owner)return;if(owner)clearTab();clearTimeout(timer);generation++;panelVersion++;owner=value;draft=null;files=[];history=[];redo=[];uploads=new Map();busyAi=false;busySend=false;locked=false;pane.hidden=true;body.replaceChildren();to.value='';subject.value='';prompt.value='';saveChain=Promise.resolve();
 }};
}
